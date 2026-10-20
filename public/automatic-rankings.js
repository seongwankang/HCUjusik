// The trusted scheduled job is always available. An active administrator's
// existing permissions also keep rankings fresh while the free runner is delayed.
export function automaticRankings({api,getUser,isVisible=()=>true,now=Date.now,every=setInterval,cancel=clearInterval}){
 let running=false,nextAt=0,owner=null;
 const run=async()=>{
  const user=getUser();if(user?.role!=='admin'||!isVisible())return;
  const id=user.id||user.uid;if(id!==owner){owner=id;nextAt=0;}
  if(running||now()<nextAt)return;running=true;
  try{const result=await api('/api/rankings-auto',{method:'POST'});nextAt=result.nextAt||now()+900000;}
  catch{nextAt=now()+60000;}finally{running=false;}
 };
 const timer=every(run,60000);return {run,stop:()=>cancel(timer)};
}
