export const PRICE_TICK=100;
export const validOrderPrice=price=>Number.isSafeInteger(price)&&price>=PRICE_TICK&&price<=1000000&&price%PRICE_TICK===0;
export const orderPrice=price=>Math.max(PRICE_TICK,Math.min(1000000,Math.round((Number(price)||PRICE_TICK)/PRICE_TICK)*PRICE_TICK));
