export const settlementPaused=now=>now>=Date.parse('2026-10-19T00:00:00+09:00')&&now<Date.parse('2026-10-21T08:00:00+09:00');
export const MARKET_RESUMES_AT=Infinity;
export const MARKET_PAUSE_START=Date.parse('2026-10-19T00:00:00+09:00');
export const MANUAL_MARKET_CLOSED_AT=Date.parse('2026-10-22T00:00:00+09:00');
export const marketPaused=now=>now>=MANUAL_MARKET_CLOSED_AT||settlementPaused(now);
export function marketSession(now=Date.now()){const minute=((Math.floor(now/60000)+540)%1440+1440)%1440;return {open:!marketPaused(now)&&minute>=480&&minute<1260,label:'매일 08:00~21:00 · 한국 시간'};}
export function assertMarketOpen(now=Date.now()){if(marketPaused(now))throw Error('관리자 요청으로 휴장 중입니다. 재개 공지 전까지 거래할 수 없습니다.');if(!marketSession(now).open)throw Error('지금은 장 운영 시간이 아닙니다. 거래 시간은 매일 08:00~21:00(한국 시간)입니다.');}
export const koreaDayStart=(now=Date.now())=>Math.floor((now+32400000)/86400000)*86400000-32400000;
export function dayChange(current,previousClose){if(!Number.isSafeInteger(current)||!Number.isSafeInteger(previousClose)||previousClose<=0)return null;const amount=current-previousClose;return {amount,percent:amount/previousClose*100,direction:amount>0?'up':amount<0?'down':'flat'};}
