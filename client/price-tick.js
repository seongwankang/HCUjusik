export const PRICE_TICK=100;
export const MAX_ORDER_PRICE=1000000000;
export const validOrderPrice=price=>Number.isSafeInteger(price)&&price>=PRICE_TICK&&price<=MAX_ORDER_PRICE&&price%PRICE_TICK===0;
export const orderPrice=price=>Math.max(PRICE_TICK,Math.min(MAX_ORDER_PRICE,Math.round((Number(price)||PRICE_TICK)/PRICE_TICK)*PRICE_TICK));
