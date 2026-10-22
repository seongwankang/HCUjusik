import {eventTargets} from './event-targets.js';
import {validateEffect} from './event-model.js';
export function randomEffectGroups(input,companyIds){if(!Array.isArray(input.effects)||input.effects.length<1||input.effects.length>20)throw Error('효과는 1~20개 추가하세요.');return input.effects.map(row=>({targets:eventTargets({type:'random',companyIds:row.companyIds},companyIds),effect:validateEffect(row.effect)}));}
export const effectReceiptId=(eid,index,count)=>count?eid+'_e'+index:eid;
