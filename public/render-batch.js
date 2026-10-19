// Merge quote bursts into one paint; values are already updated by the caller.
export function batchPaint(paint,schedule=callback=>requestAnimationFrame(callback)){
 let queued=false;
 return ()=>{if(queued)return;queued=true;schedule(()=>{queued=false;paint();});};
}
