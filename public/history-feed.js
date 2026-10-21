import {historyRow} from './investor.js';
// Fetch only when the history is visible. Appended rows survive quote refreshes.
export function mountManagementHistory(root,request,companyId,{isCurrent=()=>true,Observer=globalThis.IntersectionObserver,initialScroll={top:0,left:0}}={}){
 const list=root.querySelector('.investor-history-list'),sentinel=list.querySelector('.history-sentinel'),count=root.querySelector('h3 span');
 const seen=new Set();let next=null,started=false,busy=false,failed=false,done=false,disposed=false;
 const current=()=>!disposed&&root.isConnected!==false&&isCurrent();
 let observer,restorePosition=initialScroll.top>0||initialScroll.left>0;
 async function load(){
  if(!current()||busy||done)return;busy=true;failed=false;sentinel.textContent='경영이력을 불러오는 중…';
  try{
   const page=await request('/api/company-history?companyId='+encodeURIComponent(companyId)+(started&&next?'&cursor='+encodeURIComponent(JSON.stringify(next)):''));
   if(!current())return;
   const rows=page.rows.filter(row=>{const key=row.source+':'+row.id;if(seen.has(key))return false;seen.add(key);return true;});
   sentinel.insertAdjacentHTML('beforebegin',rows.map(historyRow).join(''));started=true;next=page.next;
   count.textContent=seen.size+(next?'+':'');done=!next;
   if(restorePosition){list.scrollTop=initialScroll.top;list.scrollLeft=initialScroll.left;restorePosition=!done&&list.scrollTop<initialScroll.top-1;}
   if(done){observer?.disconnect();if(seen.size)sentinel.remove();else sentinel.textContent='아직 기록된 경영 이력이 없습니다.';}
   else{sentinel.textContent='아래로 스크롤하면 계속 불러옵니다.';observer?.unobserve(sentinel);observer?.observe(sentinel);}
  }catch{if(current()){failed=true;sentinel.innerHTML='<button type="button" data-history-retry>이력 조회 다시 시도</button>';}}
  finally{busy=false;if(restorePosition&&!failed&&current()&&!done)void load();}
 }
 const retry=e=>{if(e.target.closest('[data-history-retry]'))void load();};
 const scroll=()=>{if(!Observer&&!failed&&list.scrollTop+list.clientHeight>=list.scrollHeight-80)void load();};
 root.addEventListener('click',retry);list.addEventListener('scroll',scroll,{passive:true});
 if(Observer){observer=new Observer(entries=>{if(!current())return;if(!failed&&entries.some(e=>e.isIntersecting))void load();},{rootMargin:'120px'});observer.observe(sentinel);}else void load();
 const stop=()=>{disposed=true;observer?.disconnect();root.removeEventListener('click',retry);list.removeEventListener('scroll',scroll);};
 stop.resume=()=>{if(!done&&!disposed){if(observer){observer.unobserve(sentinel);observer.observe(sentinel);}else if(!failed)void load();}};
 return stop;
}
