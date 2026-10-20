import {test} from 'node:test';
import assert from 'node:assert/strict';
import {tradingPortfolio} from '../client/portfolio.js';
const companies={'test-a':{name:'A',ticker:'A',referencePrice:10000},'test-b':{name:'B',ticker:'B',referencePrice:20000}};
const account={cash:978000,reservedCash:9000,positions:{'test-a':2,'test-b':0},reservedPositions:{'test-a':1,'test-b':0},version:4};
test('traded cash and positions are primary, reserved assets are counted exactly once',()=>{
 const p=tradingPortfolio(account,companies,{'test-a':{lastPrice:12000}});
 assert.equal(p.cash,978000);assert.equal(p.availableCash,969000);assert.equal(p.stockValue,24000);assert.equal(p.totalValue,1002000);
 assert.equal(p.holdings.length,1);assert.equal(p.holdings[0].quantity,2);assert.equal(p.holdings[0].reserved,1);assert.equal(p.holdings[0].available,1);
 assert.equal(p.holdings[0].priceSource,'last');
});
test('unopened accounts and initial prices are explicit, missing prices do not invent equity',()=>{
 const empty=tradingPortfolio(null,companies,{});assert.equal(empty.initialized,false);assert.equal(empty.cash,2000000);assert.equal(empty.holdings.length,0);
 const p=tradingPortfolio(account,companies,{});assert.equal(p.holdings[0].price,10000);assert.equal(p.holdings[0].priceSource,'initial');
 const unknown=tradingPortfolio(account,{},{});assert.equal(unknown.valuationComplete,false);assert.equal(unknown.totalValue,null);assert.equal(unknown.holdings[0].quantity,2);
});
test('invalid accounts and over-reservation fail instead of showing fabricated balances',()=>{
 for(const patch of [{cash:-1},{reservedCash:1000000},{positions:{'test-a':NaN}},{reservedPositions:{'test-a':3}},{positions:'bad'}])assert.throws(()=>tradingPortfolio({...account,...patch},companies,{}));
});

test('new company holdings are valued and reserved shares cannot exceed owned shares',()=>{
 const id='club-new-2026',a={cash:995000,reservedCash:0,positions:{[id]:2},reservedPositions:{[id]:1},version:2};
 const p=tradingPortfolio(a,{[id]:{name:'New',referencePrice:2500}},{[id]:{lastPrice:3000}});
 assert.equal(p.totalValue,1001000);assert.equal(p.holdings[0].companyId,id);assert.equal(p.holdings[0].available,1);
 assert.throws(()=>tradingPortfolio({...a,reservedPositions:{[id]:3}},{},{}));
});
