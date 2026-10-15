export function createExchangeRequest({baseUrl,getToken,fetcher=fetch,allowLocal=false}){
 return async(path,options={})=>{
  if(!baseUrl)throw new Error('지정가 매칭 서버 연결이 아직 완료되지 않았습니다.');
  const base=new URL(baseUrl);
  if(base.username||base.password||base.search||base.hash||base.pathname!=='/'||!(base.protocol==='https:'||(allowLocal&&base.protocol==='http:'&&['localhost','127.0.0.1'].includes(base.hostname))))throw new Error('거래 서버 주소 설정을 확인하세요.');
  const token=await getToken();if(!token)throw new Error('로그인 후 주문하세요.');
  const route=path.startsWith('/api/exchange?')?'/v1/exchange'+path.slice('/api/exchange'.length):{'/api/limit-order':'/v1/orders','/api/cancel-order':'/v1/cancel'}[path];
  if(!route)throw new Error('지원하지 않는 거래 요청입니다.');
  const response=await fetcher(new URL(route,base),{method:options.method||'GET',headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},...(options.body?{body:options.body}:{}),credentials:'omit',cache:'no-store',signal:AbortSignal.timeout(60000)});
  let data;try{data=await response.json();}catch{throw new Error('거래 서버 응답을 확인하지 못했습니다. 같은 주문으로 다시 시도하세요.');}
  if(!response.ok){const e=new Error(data.error||'거래 요청을 처리하지 못했습니다.');e.status=response.status;throw e;}
  return data;
 };
}
