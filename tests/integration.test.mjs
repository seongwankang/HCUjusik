import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {DatabaseSync} from 'node:sqlite';
import {pbkdf2Sync} from 'node:crypto';
import worker from '../src/index.js';

const schema = readFileSync(new URL('../migrations/0001_schema.sql',import.meta.url),'utf8');
const seed = readFileSync(new URL('../migrations/0002_demo_data.sql',import.meta.url),'utf8');
const TEST_URL='https://school.example';

function setup() {
  const sqlite = new DatabaseSync(':memory:');
  sqlite.exec(schema);
  sqlite.exec(seed);
  const salt='ff'.repeat(16);
  const hash=pbkdf2Sync('testpassword123',Buffer.from(salt,'hex'),180000,32,'sha256').toString('hex');
  sqlite.prepare('INSERT INTO users(id,username,display_name,role,password_salt,password_hash,cash_balance) VALUES(?,?,?,?,?,?,?)')
    .run('u1','student01','테스트 학생','student',salt,hash,1_000_000);
  return {
    sqlite,
    DB:{prepare(sql){
      let args=[];
      return {bind(...v){args=v;return this;},
        first(){return sqlite.prepare(sql).get(...args)||null;},
        all(){return {results:sqlite.prepare(sql).all(...args)};},
        run(){return sqlite.prepare(sql).run(...args);}
      };
    }},
    ASSETS:{fetch:()=>new Response('static')}
  };
}
function request(path,{method='GET',cookie,body}={}){
  return new Request(TEST_URL+path,{
    method,
    headers:{...(cookie?{cookie}:{}),...(body?{'content-type':'application/json','origin':TEST_URL}:{})},
    ...(body?{body:JSON.stringify(body)}:{})
  });
}

test('company seed exposes exactly 21 draft companies',async()=>{
 const env=setup();
 const response=await worker.fetch(request('/api/companies'),env);
 const {companies}=await response.json();
 assert.equal(companies.length,21);
 assert.ok(companies.every(c=>c.status==='draft'));
 env.sqlite.close();
});

test('login, profile, portfolio and logout work together',async()=>{
 const env=setup();
 const login=await worker.fetch(request('/api/login',{method:'POST',body:{username:'student01',password:'testpassword123'}}),env);
 assert.equal(login.status,200);
 const cookie=login.headers.get('set-cookie').split(';')[0];
 assert.match(login.headers.get('set-cookie'),/HttpOnly/);
 assert.match(login.headers.get('set-cookie'),/SameSite=Strict/);
 const me=await worker.fetch(request('/api/me',{cookie}),env);
 assert.equal((await me.json()).user.username,'student01');
 const portfolio=await worker.fetch(request('/api/portfolio',{cookie}),env);
 assert.equal((await portfolio.json()).cash,1000000);
 const orders=await worker.fetch(request('/api/orders',{method:'POST',cookie,body:{side:'buy',quantity:1}}),env);
 assert.equal(orders.status,501);
 const logout=await worker.fetch(request('/api/logout',{method:'POST',cookie}),env);
 assert.equal(logout.status,200);
 const meAfter=await worker.fetch(request('/api/me',{cookie}),env);
 assert.equal((await meAfter.json()).authenticated,false);
 env.sqlite.close();
});

test('repeated incorrect login is temporarily locked',async()=>{
 const env=setup();
 for(let i=0;i<5;i++){
  const response=await worker.fetch(request('/api/login',{method:'POST',body:{username:'student01',password:'wrongpassword'}}),env);
  assert.equal(response.status,401);
 }
 const locked=await worker.fetch(request('/api/login',{method:'POST',body:{username:'student01',password:'testpassword123'}}),env);
 assert.equal(locked.status,429);
 env.sqlite.close();
});
