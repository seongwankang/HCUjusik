import {rankingValue} from './ranking-value.js';
export const RANKING_INTERVAL=15*60*1000;
export function rankingUpdatedAt(board){const t=board?.updatedAt;return t?.toMillis?.()||(typeof t==='string'?Date.parse(t):0)||0;}
export function rankingRefreshDue(board,now=Date.now()){
 const last=rankingUpdatedAt(board);
 return !board?.generation||!Array.isArray(board.entries)||board.entries.some(r=>{try{return r.totalValue!==rankingValue(r.cash,r.stockValue);}catch{return true;}})||!last||now-last>=RANKING_INTERVAL;
}
