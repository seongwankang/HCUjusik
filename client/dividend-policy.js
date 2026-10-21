import {koreaDay} from './settlement-time.js';
export function dividendChangeStatus(ops={},now=Date.now()){
 const day=koreaDay(now),minute=Math.floor((now+32400000)/60000)%1440;
 const reason=ops.locked?'정산 중에는 배당률을 변경할 수 없습니다.':(ops.lastDividendDay??-1)>=day?'오늘 배당률을 이미 변경했습니다.':minute<480||minute>=1020?'배당률은 오전 8시~오후 5시 전에 변경할 수 있습니다.':'';
 return {day,allowed:!reason,reason};
}
