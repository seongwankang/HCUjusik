const DAY = 60 * 60 * 24;
const COOKIE_NAME = 'school_stock_session';
const encoder = new TextEncoder();

function json(data, status = 200, extra = {}) {
  return new Response(JSON.stringify(data), {
    status,
    headers: {
      'content-type': 'application/json; charset=utf-8',
      'cache-control': 'no-store',
      'x-content-type-options': 'nosniff',
      ...extra
    }
  });
}

const hex = (bytes) => Array.from(new Uint8Array(bytes), x => x.toString(16).padStart(2, '0')).join('');
const fromHex = (value) => Uint8Array.from(value.match(/.{2}/g) || [], x => parseInt(x, 16));

async function sha256(value) {
  return hex(await crypto.subtle.digest('SHA-256', encoder.encode(value)));
}

async function pbkdf2(password, salt) {
  const base = await crypto.subtle.importKey('raw', encoder.encode(password), 'PBKDF2', false, ['deriveBits']);
  return hex(await crypto.subtle.deriveBits({name:'PBKDF2',salt:fromHex(salt),iterations:180000,hash:'SHA-256'}, base, 256));
}

function constantTimeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

function sessionCookie(request, token, maxAge) {
  const secure = new URL(request.url).protocol === 'https:' ? '; Secure' : '';
  return `${COOKIE_NAME}=${token}; HttpOnly; SameSite=Strict; Path=/; Max-Age=${maxAge}${secure}`;
}

async function currentUser(request, env) {
  const found = (request.headers.get('cookie') || '').match(/(?:^|;\s*)school_stock_session=([0-9a-f]{64})(?:;|$)/);
  if (!found) return null;
  const row = await env.DB.prepare(`
    SELECT u.id,u.username,u.display_name,u.role,u.cash_balance
    FROM sessions s JOIN users u ON s.user_id=u.id
    WHERE s.token_hash=? AND s.expires_at>?`
  ).bind(await sha256(found[1]), Math.floor(Date.now()/1000)).first();
  return row || null;
}

function safeUser(u) {
  return {id:u.id, username:u.username, displayName:u.display_name, role:u.role, cash:u.cash_balance};
}

function postAllowed(request) {
  const origin = request.headers.get('origin');
  return !origin || origin === new URL(request.url).origin;
}

async function parseBody(request) {
  if (Number(request.headers.get('content-length') || 0) > 2048) return null;
  try { return await request.json(); } catch { return null; }
}

async function login(request, env) {
  const body = await parseBody(request);
  const username = typeof body?.username === 'string' ? body.username.trim() : '';
  const password = body?.password;
  if (!/^[a-zA-Z0-9_-]{3,32}$/.test(username) || typeof password !== 'string' || password.length < 8 || password.length > 128) {
    return json({error:'계정 또는 비밀번호 형식을 확인하세요.'},400);
  }
  const now = Math.floor(Date.now()/1000);
  const attempt = await env.DB.prepare('SELECT failures,locked_until FROM login_attempts WHERE username=?').bind(username).first();
  if (attempt?.locked_until > now) return json({error:'로그인 시도가 많습니다. 잠시 후 다시 시도하세요.'},429);
  const user = await env.DB.prepare('SELECT * FROM users WHERE username=?').bind(username).first();
  // 존재하지 않는 계정에도 해시 연산을 실행해 응답 시간 차이를 줄인다.
  const candidate = await pbkdf2(password, user?.password_salt || '00000000000000000000000000000000');
  const valid = user && constantTimeEqual(candidate, user.password_hash);
  if (!valid) {
    const failures = (attempt?.locked_until > 0 && attempt.locked_until <= now) ? 1 : (attempt?.failures || 0) + 1;
    const lockedUntil = failures >= 5 ? now + 900 : 0;
    await env.DB.prepare(`INSERT INTO login_attempts(username,failures,locked_until) VALUES(?,?,?)
      ON CONFLICT(username) DO UPDATE SET failures=excluded.failures,locked_until=excluded.locked_until`)
      .bind(username,failures,lockedUntil).run();
    return json({error:'계정 또는 비밀번호가 올바르지 않습니다.'},401);
  }
  await env.DB.prepare('DELETE FROM login_attempts WHERE username=?').bind(username).run();
  const token = hex(crypto.getRandomValues(new Uint8Array(32)));
  await env.DB.prepare('INSERT INTO sessions(token_hash,user_id,expires_at) VALUES(?,?,?)')
    .bind(await sha256(token),user.id,now+DAY).run();
  return json({user:safeUser(user)},200,{'set-cookie':sessionCookie(request,token,DAY)});
}

async function logout(request, env) {
  const found = (request.headers.get('cookie') || '').match(/(?:^|;\s*)school_stock_session=([0-9a-f]{64})(?:;|$)/);
  if (found) await env.DB.prepare('DELETE FROM sessions WHERE token_hash=?').bind(await sha256(found[1])).run();
  return json({ok:true},200,{'set-cookie':sessionCookie(request,'',0)});
}

async function api(request, env) {
  const url = new URL(request.url);
  const path = url.pathname;
  if (path === '/api/health' && request.method === 'GET') return json({ok:true,stage:'scaffold'});
  if (!env.DB) return json({error:'D1 데이터베이스가 연결되지 않았습니다.'},503);
  if (path === '/api/companies' && request.method === 'GET') {
    const {results} = await env.DB.prepare(`SELECT id,ticker,name,category,description,reference_price AS referencePrice,
      issued_shares AS issuedShares,company_cash AS companyCash,daily_revenue AS dailyRevenue,status FROM companies ORDER BY ticker`).all();
    return json({companies:results});
  }
  if (path === '/api/news' && request.method === 'GET') {
    const {results} = await env.DB.prepare(`SELECT n.id,n.title,n.content,n.company_id AS companyId,
      c.name AS companyName,n.published_at AS publishedAt FROM news n
      LEFT JOIN companies c ON n.company_id=c.id ORDER BY n.published_at DESC LIMIT 30`).all();
    return json({news:results});
  }
  if (path === '/api/login' && request.method === 'POST') return login(request,env);
  if (path === '/api/logout' && request.method === 'POST') return logout(request,env);
  if (path === '/api/me' && request.method === 'GET') {
    const user = await currentUser(request,env);
    return json({authenticated:!!user,user:user?safeUser(user):null});
  }
  if (path === '/api/portfolio' && request.method === 'GET') {
    const user = await currentUser(request,env);
    if (!user) return json({error:'로그인이 필요합니다.'},401);
    const {results} = await env.DB.prepare(`SELECT h.company_id AS companyId,c.ticker,c.name,
      h.quantity,c.reference_price AS referencePrice FROM holdings h
      JOIN companies c ON c.id=h.company_id WHERE h.user_id=? ORDER BY c.ticker`).bind(user.id).all();
    return json({cash:user.cash_balance,holdings:results});
  }
  if (path === '/api/my-company' && request.method === 'GET') {
    const user = await currentUser(request,env);
    if (!user) return json({error:'로그인이 필요합니다.'},401);
    const {results} = await env.DB.prepare(`SELECT c.id,c.ticker,c.name,c.company_cash AS companyCash,
      c.daily_revenue AS dailyRevenue,c.status FROM companies c JOIN memberships m ON m.company_id=c.id
      WHERE m.user_id=? AND m.is_president=1`).bind(user.id).all();
    return json({companies:results});
  }
  if (path === '/api/orders' && request.method === 'POST') {
    const user = await currentUser(request,env);
    if (!user) return json({error:'로그인이 필요합니다.'},401);
    return json({error:'거래 체결 규칙이 아직 확정되지 않아 주문을 받지 않습니다.'},501);
  }
  return json({error:'존재하지 않는 API 경로입니다.'},404);
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      if (!['GET','POST'].includes(request.method)) return json({error:'지원하지 않는 메서드입니다.'},405);
      if (request.method === 'POST' && !postAllowed(request)) return json({error:'잘못된 요청 출처입니다.'},403);
      try { return await api(request,env); }
      catch (e) { console.error('API_ERROR',e); return json({error:'서버에서 오류가 발생했습니다.'},500); }
    }
    return env.ASSETS.fetch(request);
  }
};
