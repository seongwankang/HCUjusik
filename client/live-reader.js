// One subscription per visible data source, shared by all screens in this session.
// No timers, permanent balances, or cached authorization for writes.
export function createLiveReader({subscribe,fingerprint=JSON.stringify,onChange=()=>{},maxEntries=100}){
 const entries=new Map();let epoch=0;
 function entry(key,source){
  let e=entries.get(key);if(e){entries.delete(key);entries.set(key,e);return e;}
  const scope=epoch;e={source,watchers:new Set(),settled:false};entries.set(key,e);
  e.ready=new Promise((resolve,reject)=>{e.resolve=resolve;e.reject=reject;});
  // A watcher may be used without awaiting its initial value.
  e.ready.catch(()=>{});
  const accept=value=>{if(scope!==epoch||entries.get(key)!==e)return;const signature=fingerprint(value),changed=e.settled&&signature!==e.signature;e.value=value;e.signature=signature;e.error=null;if(!e.settled){e.settled=true;e.resolve(value);}for(const fn of e.watchers)fn.next(value);if(changed)onChange(key,e.source);};
  const fail=error=>{if(scope!==epoch||entries.get(key)!==e)return;e.error=error;e.value=undefined;e.reject(error);e.settled=true;for(const fn of e.watchers)fn.error(error);onChange(key,e.source);};
  e.stop=subscribe(source,accept,fail);
  for(const [oldKey,old] of entries){if(entries.size<=maxEntries)break;if(old===e||old.watchers.size||!old.settled)continue;old.stop?.();entries.delete(oldKey);}
  return e;
 }
 return {
  async read(key,source){const e=entry(key,source);if(!e.settled)await e.ready;if(e.error)throw e.error;return e.value;},
  watch(key,source,fn,error=()=>{}){const e=entry(key,source),watcher={next:fn,error};e.watchers.add(watcher);if(e.error)error(e.error);else if(e.settled)fn(e.value);return ()=>e.watchers.delete(watcher);},
  async refresh(matches,fetch){const scope=epoch;await Promise.all([...entries].filter(([key,e])=>matches(key,e.source)).map(async([key,e])=>{const value=await fetch(e.source);if(scope!==epoch||entries.get(key)!==e)return;const changed=e.signature!==fingerprint(value);e.value=value;e.signature=fingerprint(value);e.error=null;if(!e.settled){e.settled=true;e.resolve(value);}for(const fn of e.watchers)fn.next(value);if(changed)onChange(key,e.source);}));},
  clear(){epoch++;for(const e of entries.values()){e.stop?.();if(!e.settled)e.reject(Error('로그인 상태가 변경되었습니다.'));}entries.clear();},
 };
}
