const DAY=86400000;
export const koreaDay=time=>Math.floor((time+32400000)/DAY);
// 07:55 Korea is 22:55 UTC on the previous date. An investment committed at the cutoff
// belongs to the following settlement, even when today's job runs late.
export const settlementTime=day=>day*DAY-3900000;
export function investmentDay(ops={},now=Date.now()){
 const day=koreaDay(now);
 return now<settlementTime(day)&&(ops.lastSettledDay||0)<day?day:day+1;
}
export function nextSettlement(ops={},now=Date.now()){
 const day=investmentDay(ops,now);return {day,at:settlementTime(day)};
}
