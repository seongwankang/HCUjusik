import {verifyFirebaseToken} from '../src/auth.js';
import {ExchangeError,validateOrder} from './exchange.js';
export function createExchangeApi({store,projectId,allowedOrigin,verify=verifyFirebaseToken,now=()=>Date.now()}){
 const buckets=new Map();
 return async request=>{
  const origin=request.headers.get('origin');
  const headers={'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff','vary':'Origin'};
  const reply=(body,status=200)=>new Response(JSON.stringify(body),{status,headers});
  if(origin&&origin!==allowedOrigin)return reply({error:'허용되지 않은 사이트입니다.'},403);
  if(origin)headers['access-control-allow-origin']=origin;
  if(request.method==='OPTIONS')return new Response(null,{status:204,headers:{...headers,'access-control-allow-methods':'GET, POST, OPTIONS','access-control-allow-headers':'Authorization, Content-Type','access-control-max-age':'600'}});
  const url=new URL(request.url);
  if(url.pathname==='/health'&&request.method==='GET')return reply({ok:true,mode:'limit-v1'});
  if(!['/v1/exchange','/v1/orders','/v1/cancel'].includes(url.pathname))return reply({error:'없는 경로입니다.'},404);
  if((url.pathname==='/v1/exchange'?'GET':'POST')!==request.method)return reply({error:'잘못된 메서드입니다.'},405);
  try{
   const token=/^Bearer ([A-Za-z0-9_.-]{1,8192})$/.exec(request.headers.get('authorization')||'')?.[1];
   if(!token)throw new ExchangeError('로그인이 필요합니다.',401);
   const claims=await verify(token,projectId),uid=claims.sub;
   if(typeof uid!=='string'||!/^[A-Za-z0-9_-]{1,128}$/.test(uid)||['__proto__','constructor','prototype'].includes(uid))throw new ExchangeError('잘못된 사용자입니다.',401);
   const time=now();for(const [key,value]of buckets)if(time-value.start>60000)buckets.delete(key);
   let bucket=buckets.get(uid);if(!bucket){if(buckets.size>=1000)throw new ExchangeError('잠시 후 다시 시도하세요.',429);bucket={start:time,count:0};buckets.set(uid,bucket);}
   if(++bucket.count>40)throw new ExchangeError('요청이 많습니다. 잠시 후 다시 시도하세요.',429);
   if(request.method==='GET'){
    const companyId=url.searchParams.get('companyId');if(!['test-a','test-b'].includes(companyId))throw new ExchangeError('테스트 기업을 선택하세요.');
    return reply(await store.read(uid,claims,companyId));
   }
   if(!request.headers.get('content-type')?.startsWith('application/json'))throw new ExchangeError('JSON 주문이 필요합니다.');
   const raw=await request.text();if(raw.length>2048)throw new ExchangeError('주문 크기가 너무 큽니다.',413);
   let body;try{body=JSON.parse(raw);}catch{throw new ExchangeError('주문 형식을 확인하세요.');}
   if(url.pathname==='/v1/orders')validateOrder(body);
   else if(!body||Object.keys(body).length!==1||typeof body.orderId!=='string'||!/^[A-Za-z0-9_-]{8,80}$/.test(body.orderId))throw new ExchangeError('취소할 주문을 확인하세요.');
   return reply(await store.mutate(uid,claims,url.pathname==='/v1/orders'?'order':'cancel',body));
  }catch(error){
   const status=error instanceof ExchangeError?error.status:error.status===401?401:503;
   return reply({error:error instanceof ExchangeError?error.message:status===401?'인증이 만료됐습니다. 다시 로그인하세요.':'거래 서버 연결을 확인하고 같은 주문을 다시 시도하세요.'},status);
  }
 };
}
