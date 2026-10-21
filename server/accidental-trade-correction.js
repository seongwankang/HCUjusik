import {FieldValue} from 'firebase-admin/firestore';
export const AUDITED_FILLS=Array.from({length:10},(_,i)=>({version:850+i,price:i<3?300000:i===3?450000:1000000,quantity:i===0||i===2?16:1}));
const FIRST=850,LAST=859,ID='admin-meme-20261021-190352';
const TOTAL_SHARES=40,TOTAL_REFUND=16350000;
const result=(status,extra={})=>({status,fills:10,shares:TOTAL_SHARES,refund:TOTAL_REFUND,...extra});
export async function reverseAccidentalTrade(db){
 const receipt=db.doc('tradeCorrections/'+ID);
 if((await receipt.get()).exists)return result('complete');
 if(Math.floor((Date.now()+32400000)/86400000)!==20747)throw Error('Correction is restricted to the audited trading day');
 const companies=await db.collection('companies').where('ticker','==','MEME').get();if(companies.size!==1)throw Error('Expected one MEME company');const cid=companies.docs[0].id;
 const bookRef=db.doc('sparkBooks/'+cid),trades=await bookRef.collection('trades').where('marketVersion','>=',FIRST).where('marketVersion','<=',LAST).get();
 if(trades.size!==10||trades.docs.some(s=>!AUDITED_FILLS.some(a=>a.version===s.data().marketVersion&&a.price===s.data().price&&a.quantity===s.data().quantity)||s.data().companyId!==cid||s.data().createdAt.toMillis()<Date.parse('2026-10-21T10:03:52Z')||s.data().createdAt.toMillis()>=Date.parse('2026-10-21T10:03:55Z')))throw Error('Audited ten fills do not match');
 const accounts=(await db.collection('sparkAccounts').get()).docs,found=[];
 for(let offset=0;offset<accounts.length;offset+=15){const refs=accounts.slice(offset,offset+15).flatMap(a=>trades.docs.map(s=>a.ref.collection('fills').doc(s.id)));found.push(...(await db.getAll(...refs)).filter(s=>s.exists));}
 if(found.length!==20)throw Error('Each trade must have exactly two private receipts');
 const buyers=[...new Set(found.filter(s=>s.data().side==='buy').map(s=>s.ref.parent.parent.id))];if(buyers.length!==1||(await db.doc('users/'+buyers[0]).get()).data()?.role!=='admin')throw Error('Expected one administrator buyer');
 const uids=[...new Set(found.map(s=>s.ref.parent.parent.id))];
 return db.runTransaction(async t=>{
  if((await t.get(receipt)).exists)return result('complete');
  const [book,operation,publicFills,privateFills]=await Promise.all([t.get(bookRef),t.get(db.doc('companyOperations/'+cid)),t.getAll(...trades.docs.map(s=>s.ref)),t.getAll(...found.map(s=>s.ref))]);
  if(operation.data()?.locked)throw Error('Settlement in progress');
  const changes=[],deletions=[],delta=new Map(uids.map(uid=>[uid,{cash:0,shares:0,versions:new Map(),side:uid===buyers[0]?'buy':'sell'}]));
  for(const p of publicFills){const d=p.data();if(!d||!AUDITED_FILLS.some(a=>a.version===d.marketVersion&&a.price===d.price&&a.quantity===d.quantity))throw Error('Public fill changed');const pair=privateFills.filter(f=>f.id===p.id);
   if(pair.length!==2||pair.filter(f=>f.data()?.side==='buy').length!==1||pair.filter(f=>f.data()?.side==='sell').length!==1)throw Error('Counterparty mismatch');
   for(const f of pair){const a=f.data(),uid=f.ref.parent.parent.id;if(a.price!==d.price||a.quantity!==d.quantity||a.marketVersion!==d.marketVersion||a.companyId!==cid)throw Error('Private fill changed');const n=delta.get(uid),sign=a.side==='buy'?1:-1;n.shares-=sign*d.quantity;n.cash+=sign*d.price*d.quantity;n.versions.set(d.marketVersion,d.quantity);deletions.push(f);}
   deletions.push(p);
  }
  const latest=await t.get(bookRef.collection('trades').orderBy('marketVersion','desc').limit(100));const good=latest.docs.find(s=>!trades.docs.some(bad=>bad.id===s.id));if(!good)throw Error('No prior valid execution price');
  for(const uid of uids){const ref=db.doc('sparkAccounts/'+uid),[s,orders]=await Promise.all([t.get(ref),t.get(ref.collection('orders').where('companyId','==',cid))]);const a=s.data(),n=delta.get(uid),cash=a.cash+n.cash,shares=(a.positions[cid]||0)+n.shares;
   if(!Number.isSafeInteger(cash)||cash<a.reservedCash||shares<(a.reservedPositions[cid]||0)||shares<0)throw Error('A counterparty has spent or reserved assets; no changes applied');
   const assigned=new Map();
   for(const [v,q]of n.versions){const price=AUDITED_FILLS.find(a=>a.version===v).price;const candidates=orders.docs.filter(o=>{const d=o.data();return d.side===n.side&&d.sequence<=v&&d.marketVersion>=v&&d.filled>0&&(n.side==='buy'?d.price>=price:d.price===price);});if(candidates.length!==1)throw Error('Execution must resolve to exactly one original order');const o=candidates[0];assigned.set(o.id,{o,q:(assigned.get(o.id)?.q||0)+q});}
   const allocations=[...assigned.values()];
   if(allocations.reduce((sum,a)=>sum+a.q,0)!==Math.abs(n.shares)||allocations.some(({o,q})=>q<1||o.data().filled<q||o.data().remaining!==0||!['filled','cancelled'].includes(o.data().status)||o.data().price<300000))throw Error('Original order does not explain audited executions');
   for(const {o,q}of allocations)changes.push([o,{filled:o.data().filled-q,cancelled:(o.data().cancelled||0)+q,status:'cancelled',correctionId:ID}]);
   changes.push([s,{cash,positions:{...a.positions,[cid]:shares},version:a.version+1,lastMarket:cid,correctionRevision:(a.correctionRevision||0)+1}]);
  }
  changes.push([book,{lastPrice:good.data().price,version:book.data().version+1,correctionRevision:(book.data().correctionRevision||0)+1,lastAction:{kind:'correction',actor:buyers[0]},updatedAt:FieldValue.serverTimestamp()}]);
  for(const s of [...deletions,...changes.map(([s])=>s)])t.set(receipt.collection('documents').doc(Buffer.from(s.ref.path).toString('base64url')),{path:s.ref.path,data:s.data()});
  for(const [s,patch]of changes)t.update(s.ref,patch);for(const s of deletions)t.delete(s.ref);
  t.set(receipt,{...result('complete',{counterparties:uids.length-1}),completedAt:FieldValue.serverTimestamp()});
  return result('reversed',{counterparties:uids.length-1});
 });
}
