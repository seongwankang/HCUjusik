const DAY=86400000;
export const koreaDay=time=>Math.floor((time+32400000)/DAY);
// 09:00 Korea is 00:00 UTC. An investment committed at the cutoff
// belongs to the following settlement, even when today's job runs late.
export function investmentDay(ops={},now=Date.now()){
 const day=koreaDay(now);
 return now<day*DAY&&(ops.lastSettledDay||0)<day?day:day+1;
}
export function nextSettlement(ops={},now=Date.now()){
 const day=investmentDay(ops,now);return {day,at:day*DAY};
}
