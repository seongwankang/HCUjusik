import {test} from 'node:test';
import assert from 'node:assert/strict';
import {leadershipNames} from '../client/leadership.js';
test('only active assigned presidents are exposed by name, including multiple companies and role removals',()=>{
 const users=[{id:'a',displayName:'김사장',role:'president',active:true},{id:'b',displayName:'전사장',role:'student',active:true},{id:'c',displayName:'비활성',role:'president',active:false},{id:'d',displayName:'박사장',role:'president',active:true}];
 const assignments=[{id:'a',companyIds:['one','two','one']},{id:'b',companyIds:['one']},{id:'c',companyIds:['one']},{id:'d',companyIds:['one']}];
 const result=leadershipNames(users,assignments);assert.deepEqual(result.one,['김사장','박사장']);assert.deepEqual(result.two,['김사장']);assert.equal(result.a,undefined);assert.equal(JSON.stringify(result).includes('전사장'),false);
});
