// Append-only records are immutable under Firestore Rules. Mutable balances,
// orders, roles, votes and company settings must never use this reader.
export function createImmutableReader(fetchPage,storage){
 const entries=new Map();
 async function read(path,{field,pageSize=30,maxRecords=Infinity,revision}={}){
  const key=JSON.stringify([path,field,maxRecords===Infinity?'all':maxRecords]);
  let entry=entries.get(key);if(!entry){
   entry={rows:new Map(),loaded:false};entries.set(key,entry);
   if(storage)entry.ready=storage.get(key).then(saved=>{if(saved?.loaded&&Array.isArray(saved.rows)){entry.rows=new Map(saved.rows.map(row=>[row.id,row]));entry.loaded=true;entry.latest=saved.latest;entry.revision=saved.revision;}},()=>{});
  }
  if(entry.ready)await entry.ready;
  if(entry.pending){if(revision===undefined||revision===entry.pendingRevision)return entry.pending;await entry.pending;return read(path,{field,pageSize,maxRecords,revision});}
  if(entry.loaded&&revision!==undefined&&entry.revision===revision)return [...entry.rows.values()];
  const load=async()=>{
   const incoming=new Map();let cursor,latest=entry.latest;
   for(;;){
    const page=await fetchPage(path,{field,pageSize,since:entry.latest,cursor});
    for(const row of page.rows){incoming.set(row.id,row);if(latest===undefined||compareValue(row[field],latest)>0)latest=row[field];}
    if(!page.more||incoming.size>=maxRecords)break;cursor=page.cursor;
   }
   // Commit the watermark only after every required page succeeds.
   const merged=new Map(entry.rows);for(const [id,row] of incoming)if(!merged.has(id))merged.set(id,row);
   const rows=[...merged.values()].sort((a,b)=>compareValue(b[field],a[field])||b.id.localeCompare(a.id)).slice(0,maxRecords);
   entry.rows=new Map(rows.map(row=>[row.id,row]));entry.latest=latest;entry.loaded=true;entry.revision=revision;
   if(storage)void storage.set(key,{loaded:true,rows,latest,revision}).catch(()=>{});
   return rows;
  };
  entry.pendingRevision=revision;
  const pending=load().finally(()=>{entry.pending=undefined;});entry.pending=pending;return pending;
 }
 read.clear=()=>entries.clear();return read;
}
export function compareValue(a,b){
 if(typeof a==='number'&&typeof b==='number')return a-b;
 return a.seconds-b.seconds||a.nanoseconds-b.nanoseconds;
}
