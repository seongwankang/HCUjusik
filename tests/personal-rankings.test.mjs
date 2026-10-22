import {test} from 'node:test';
import assert from 'node:assert/strict';
import {investorSnapshots} from '../client/rankings.js';
import {personalRankingRows,personalRankingMarkup} from '../public/personal-rankings.js';
export function rankingFixture(){
 const users=[],accounts=[];for(const [group,cash,quantity] of [['C',1000,0],['S',0,1000],['B',600,600]])for(let i=0;i<100;i++){const id=group+String(i).padStart(3,'0');users.push({id,displayName:id,role:'student',active:true});accounts.push({id,cash,positions:quantity?{one:quantity}:{},reservedPositions:{},reservedCash:0,version:0});}
 return {users,accounts,companies:[{id:'one',name:'One',ticker:'ONE',referencePrice:1,issuedShares:1000000}],books:[{id:'one',lastPrice:1,displayPrice:1,issuedShares:1000000,treasuryShares:840000,version:0}]};
}
test('all participants compete independently in total, cash and stock top 100; union profiles cover all three lists',async()=>{
 const f=rankingFixture(),{board,profiles}=await investorSnapshots(f.users,f.accounts,f.companies,f.books);
 assert.equal(board.entries.length,100);assert.equal(board.cashEntries.length,100);assert.equal(board.stockEntries.length,100);assert.equal(profiles.length,300);
 for(const [key,group] of [['entries','B'],['cashEntries','C'],['stockEntries','S']]){assert.ok(board[key].every(r=>r.name.startsWith(group)));assert.ok(board[key].every(r=>r.rank===1));assert.equal(new Set(board[key].map(r=>r.investorKey)).size,100);}
 assert.equal(board.participants,300);assert.equal(JSON.stringify({board,profiles}).includes('"uid"'),false);
 assert.equal(personalRankingRows(board,'cash')[0].name,'C000');assert.equal(personalRankingRows(board,'stockValue')[0].name,'S000');
 assert.match(personalRankingMarkup(board,'cash'),/보유 현금/);assert.match(personalRankingMarkup(board,'stockValue'),/주식 평가액/);
 assert.deepEqual(personalRankingRows({entries:board.entries},'cash'),[]);
});
