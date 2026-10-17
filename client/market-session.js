export function marketSession(now=Date.now()){const minute=((Math.floor(now/60000)+540)%1440+1440)%1440;return {open:minute>=540&&minute<1260,label:'매일 09:00~21:00 · 한국 시간'};}
export function assertMarketOpen(now=Date.now()){if(!marketSession(now).open)throw Error('지금은 장 운영 시간이 아닙니다. 거래 시간은 매일 09:00~21:00(한국 시간)입니다.');}
export const koreaDayStart=(now=Date.now())=>Math.floor((now+32400000)/86400000)*86400000-32400000;
export function dayChange(current,previousClose){if(!Number.isSafeInteger(current)||!Number.isSafeInteger(previousClose)||previousClose<=0)return null;const amount=current-previousClose;return {amount,percent:amount/previousClose*100,direction:amount>0?'up':amount<0?'down':'flat'};}
