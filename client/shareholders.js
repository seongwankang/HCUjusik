// Projection for company managers: never include account IDs, cash or other holdings.
export async function shareholderSnapshots(users,accounts,companies,books){
 const names=new Map(users.map(u=>[u.id,String(u.displayName||'참가자').slice(0,80)])),bookMap=new Map(books.map(b=>[b.id,b]));
 const keys=new Map(await Promise.all(accounts.map(async a=>{const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode('hcujusik-investor:'+a.id));return [a.id,Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('')];})));
 return companies.map(c=>{
  const book=bookMap.get(c.id),issuedShares=book?.issuedShares??c.issuedShares??1000;
  const entries=accounts.flatMap(a=>{const quantity=a.positions?.[c.id]||0;if(!Number.isSafeInteger(quantity)||quantity<0||quantity>1000000)throw Error('주주 보유 수량을 확인하세요.');return quantity?[{investorKey:keys.get(a.id),name:names.get(a.id)||'참가자',quantity}]:[];}).sort((a,b)=>b.quantity-a.quantity||a.name.localeCompare(b.name,'ko')||a.investorKey.localeCompare(b.investorKey));
  const holderShares=entries.reduce((n,r)=>n+r.quantity,0);
  if(entries.length>1000||!Number.isSafeInteger(issuedShares)||issuedShares<1||holderShares>issuedShares)throw Error('주주 명부와 발행 주식 수를 확인하세요. 잠시 후 다시 집계하세요.');
  return {companyId:c.id,entries,holderShares,issuedShares,treasuryShares:book?.treasuryShares??issuedShares-holderShares,bookVersion:book?.version??0};
 });
}
