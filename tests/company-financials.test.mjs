import {test} from 'node:test';import assert from 'node:assert/strict';
import {investorSnapshot} from '../client/investor.js';import {initialOperations} from '../client/economy.js';
import {companyFinancialsMarkup} from '../public/company-financials.js';
test('company cash includes uncollected IPO proceeds once, preserves negative balances, and differs from investor cash',()=>{
 const snapshot=ops=>investorSnapshot({companyId:'one',ops,book:{issuerCash:10000000,issuedShares:1000,treasuryShares:0},account:{cash:2000000,positions:{}}});
 assert.equal(snapshot(initialOperations()).companyCash,10000000);
 assert.equal(snapshot({...initialOperations(),cash:3000000,receivedIssuerCash:10000000}).companyCash,3000000);
 assert.equal(snapshot({...initialOperations(),cash:-7000000,receivedIssuerCash:10000000}).companyCash,-7000000);
 assert.equal(investorSnapshot({ops:initialOperations()}).companyCash,null);
 const html=companyFinancialsMarkup({companyCash:-7000000,tomorrowRevenue:400000});assert.match(html,/-7,000,000원/);assert.match(html,/400,000원/);assert.match(html,/회사 보유 현금/);
 assert.match(companyFinancialsMarkup(null),/—/);
});
