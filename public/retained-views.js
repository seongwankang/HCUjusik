// Keep real DOM nodes (including handlers, form values and scroll), not HTML copies.
export function createRetainedViews({create=()=>document.createElement('div'),limit=8}={}){
 const entries=new Map();let active=null,serial=0;
 function pause(){active?.controller?.pause?.();active=null;}
 function remove(key,e){e.controller?.dispose?.();e.node.remove?.();entries.delete(key);}
 return {
  async show(host,key,mount,{refresh=false}={}){
   if(active?.key!==key)pause();let e=entries.get(key);
   if(e&&!e.ready&&!e.pending){remove(key,e);e=null;}
   if(!e){e={key,node:create(),ready:false,stamp:++serial,dirty:false};entries.set(key,e);}
   active=e;e.stamp=++serial;if(e.node.parentNode!==host)host.replaceChildren(e.node);
   const current=()=>active===e&&entries.get(key)===e;
   if(e.ready){if(refresh||e.dirty){e.dirty=false;if(e.controller?.refresh)await e.controller.refresh();else{e.ready=false;}}else e.controller?.resume?.();}
   if(!e.ready&&!e.pending){e.pending=Promise.resolve().then(()=>mount(e.node,current)).then(controller=>{e.controller=controller;e.ready=current()||!!controller;if(entries.get(key)!==e)controller?.dispose?.();else if(!current())controller?.pause?.();}).finally(()=>{e.pending=null;});}
   for(const [oldKey,old] of [...entries].sort((a,b)=>a[1].stamp-b[1].stamp)){if(entries.size<=limit)break;if(old!==active&&!old.pending)remove(oldKey,old);}
   await e.pending;
  },
  pause,
  invalidate(matches=()=>true){for(const e of entries.values())if(matches(e.key))e.dirty=true;},
  dirty:key=>!!entries.get(key)?.dirty,
  clear(){pause();for(const [key,e] of entries)remove(key,e);},
 };
}
