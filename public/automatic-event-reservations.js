// An open administrator session catches due reservations when the free GitHub
// scheduler is delayed. Student sessions never query private reservations.
export function automaticEventReservations({api,getUser,isVisible=()=>true,now=Date.now,every=setInterval,cancel=clearInterval,onResult=()=>{}}){
 let running=false,nextAt=0,owner=null;
 const run=async()=>{
  const user=getUser();if(user?.role!=='admin'||!isVisible())return;const id=user.id||user.uid;
  if(owner!==id){owner=id;nextAt=0;}if(running||now()<nextAt)return;running=true;
  try{const result=await api('/api/event-reservations-run',{method:'POST'});nextAt=result.stopped?Infinity:now()+30000;onResult(result);}
  catch{nextAt=now()+30000;}finally{running=false;}
 };
 const timer=every(run,30000);return {run,stop:()=>cancel(timer)};
}
