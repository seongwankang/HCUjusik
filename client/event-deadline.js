// datetime-local represents Korea wall time, independent of the device timezone.
export function defaultChoiceDeadline(now=Date.now()){
 const day=Math.floor((now+32400000)/86400000);
 const cutoff=day*86400000+16200000; // 13:30 KST = 04:30 UTC.
 return new Date((now<cutoff?day:day+1)*86400000).toISOString().slice(0,10)+'T13:30';
}
export const choiceDeadlineISO=value=>new Date(value+'+09:00').toISOString();
