import {authenticate} from './auth.js';
import {createFirestore} from './firestore.js';
import {HttpError} from './errors.js';
import {adminRoute} from './admin.js';

function json(data, status = 200) {
  return new Response(JSON.stringify(data), {status, headers: {
    'content-type': 'application/json; charset=utf-8',
    'cache-control': 'no-store',
    'x-content-type-options': 'nosniff'
  }});
}
function configured(env) {
  return /^[a-z][a-z0-9-]{4,28}[a-z0-9]$/.test(env.FIREBASE_PROJECT_ID || '') &&
    env.FIREBASE_PROJECT_ID !== 'replace-with-project-id' && !!env.FIREBASE_API_KEY &&
    env.FIREBASE_AUTH_DOMAIN === `${env.FIREBASE_PROJECT_ID}.firebaseapp.com`;
}
function safeUser(profile, uid) {
  return {id: uid, displayName: profile.displayName, role: profile.role};
}

// Dependencies are injected only by tests; never taken from Worker bindings.
export function createWorker({verify, firestore = createFirestore} = {}) {
  return {
    async fetch(request, env) {
      const url = new URL(request.url);
      if (!url.pathname.startsWith('/api/')) return env.ASSETS.fetch(request);
      if (!['GET', 'POST'].includes(request.method)) return json({error: '지원하지 않는 메서드입니다.'}, 405);
      const origin = request.headers.get('origin');
      if (origin && origin !== url.origin) return json({error: '잘못된 요청 출처입니다.'}, 403);
      const path = url.pathname;
      if (path === '/api/health' && request.method === 'GET') {
        return json({ok: true, stage: 'firebase-read-only', configured: configured(env), tradingEnabled: false});
      }
      const routes = ['/api/config', '/api/me', '/api/register', '/api/companies', '/api/news', '/api/portfolio', '/api/my-company', '/api/orders'];
      const admin = /^\/api\/admin\/(companies|news|events|users)$/.test(path);
      if (!routes.includes(path) && !admin && path !== '/api/events') return json({error: '존재하지 않는 API 경로입니다.'}, 404);
      if (!admin && (['/api/orders','/api/register'].includes(path) ? 'POST' : 'GET') !== request.method) return json({error: '지원하지 않는 메서드입니다.'}, 405);
      if (!configured(env)) return json({error: 'Firebase 공개 설정을 먼저 구성하세요.'}, 503);
      if (path === '/api/config') return json({firebase: {
        projectId: env.FIREBASE_PROJECT_ID, apiKey: env.FIREBASE_API_KEY,
        authDomain: env.FIREBASE_AUTH_DOMAIN
      }});
      if (path === '/api/me' && !request.headers.has('authorization')) return json({authenticated: false, user: null});
      try {
        const {uid, token, claims} = await authenticate(request, env, verify);
        const db = firestore(env, token);
        // No self-registration into the event. Staff provisions active profiles.
        const profile = await db.get(`users/${uid}`);
        const schoolVerified = claims.email_verified === true && typeof claims.email === 'string' && /^[^\s@]+@hcu\.hs\.kr$/i.test(claims.email);
        if(!(profile?.role==='admin' && profile.active===true) && !schoolVerified)throw new HttpError(403,'학교 이메일(@hcu.hs.kr)의 이메일 인증을 완료하세요.');
        if (path === '/api/register') {
          if(profile) return json({ok:true,registered:true});
          let data;try{data=await request.json();}catch{throw new HttpError(400,'이름을 확인하세요.');}
          if(typeof data.displayName!=='string'||!data.displayName.trim()||data.displayName.length>80)throw new HttpError(400,'이름은 1~80자로 입력하세요.');
          await db.commit([
            {path:`users/${uid}`,data:{displayName:data.displayName.trim(),role:'student',active:true},createOnly:true},
            {path:`portfolios/${uid}`,data:{cash:1000000,holdings:[],version:0},createOnly:true}
          ]);
          return json({ok:true,registered:true},201);
        }
        if (profile?.active !== true) throw new HttpError(403, '행사 참가 계정이 등록되지 않았거나 비활성화되었습니다.');
        if (admin) return json(await adminRoute(request, db, profile, path));
        if (path === '/api/events') return json({events: await db.list('events', 100, 'startsAt desc')});
        if (path === '/api/me') return json({authenticated: true, user: safeUser(profile, uid)});
        if (path === '/api/orders') {
          // Intentionally unconditional: no env toggle, body parsing, or write client.
          return json({error: '거래 체결 규칙이 아직 확정되지 않아 주문을 받지 않습니다.', code: 'TRADING_DISABLED'}, 501);
        }
        if (path === '/api/companies') return json({companies: await db.list('companies', 100, 'ticker')});
        if (path === '/api/news') return json({news: await db.list('news', 30, 'publishedAt desc')});
        if (path === '/api/portfolio') {
          // Cash and holdings in one document: a consistent asset snapshot.
          const portfolio = await db.get(`portfolios/${uid}`);
          if (!portfolio) throw new HttpError(404, '자산이 아직 초기화되지 않았습니다.');
          if (!Number.isSafeInteger(portfolio.cash) || portfolio.cash < 0 ||
              !Number.isSafeInteger(portfolio.version) || portfolio.version < 0 ||
              !Array.isArray(portfolio.holdings) || portfolio.holdings.length > 100 ||
              portfolio.holdings.some(h => !Number.isSafeInteger(h.quantity) || h.quantity < 0 ||
                !Number.isSafeInteger(h.referencePrice) || h.referencePrice < 0 ||
                typeof h.name !== 'string' || typeof h.ticker !== 'string' || typeof h.companyId !== 'string')) {
            throw new HttpError(502, '자산 데이터 형식을 확인하세요.');
          }
          return json({cash: portfolio.cash, holdings: portfolio.holdings || [], version: portfolio.version});
        }
        if (path === '/api/my-company') {
          const assignment = await db.get(`assignments/${uid}`);
          const ids = assignment?.companyIds || [];
          if (!Array.isArray(ids) || ids.length > 5 || ids.some(id => typeof id !== 'string' || !/^[A-Za-z0-9_-]{1,128}$/.test(id))) {
            throw new HttpError(502, '담당 기업 설정을 확인하세요.');
          }
          const companies = await Promise.all(ids.map(id => db.get(`companies/${id}`)));
          return json({companies: companies.filter(Boolean)});
        }
      } catch (error) {
        return json({error: error instanceof HttpError ? error.message : '서버 연결을 확인하고 다시 시도하세요.'},
          error instanceof HttpError ? error.status : 503);
      }
    }
  };
}
export default createWorker();
