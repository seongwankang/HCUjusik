// Moving weighted-average acquisition cost. Sells remove cost proportionally;
// realised sale proceeds never enter the acquisition cost of the remaining shares.
const SCALE=1000000n;
export function acquisitionCosts(fills,positions={}){
 const groups=new Map();for(const f of fills){if(!groups.has(f.companyId))groups.set(f.companyId,[]);groups.get(f.companyId).push(f);}
 const result={};
 for(const cid of new Set([...Object.keys(positions),...groups.keys()])){
  let quantity=0,cost=0n,valid=true,last=-1;
  for(const f of (groups.get(cid)||[]).toSorted((a,b)=>a.marketVersion-b.marketVersion)){
   if(!Number.isSafeInteger(f.marketVersion)||f.marketVersion<=last||!Number.isSafeInteger(f.price)||f.price<1||f.price>1000000||!Number.isSafeInteger(f.quantity)||f.quantity<1||f.quantity>1000000||!['buy','sell'].includes(f.side)){valid=false;break;}last=f.marketVersion;
   if(f.side==='buy'){cost+=BigInt(f.price)*BigInt(f.quantity)*SCALE;quantity+=f.quantity;}
   else{if(f.quantity>quantity){valid=false;break;}cost=quantity===f.quantity?0n:(cost*BigInt(quantity-f.quantity)+BigInt(quantity)/2n)/BigInt(quantity);quantity-=f.quantity;}
  }
  const complete=valid&&quantity===(positions[cid]||0);
  result[cid]={quantity:positions[cid]||0,complete,averagePrice:complete&&quantity?Number(cost)/Number(SCALE)/quantity:null,acquisitionCost:complete?Number(cost)/Number(SCALE):null};
 }
 return result;
}
