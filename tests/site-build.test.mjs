import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtemp,writeFile,readFile,rm} from 'node:fs/promises';
import {tmpdir} from 'node:os';
import {resolve,join,basename} from 'node:path';
import {buildSite} from '../scripts/build.mjs';
import {parseRoute,companyRoute} from '../public/routes.js';
test('company URLs survive reload and unknown/unsafe routes do not become document paths',()=>{
 assert.deepEqual(parseRoute('#/company/test-a'),{page:'company',companyId:'test-a'});
 assert.equal(companyRoute('test-b'),'#/company/test-b');
 for(const hash of ['#/company/../users','#/company/%2Fusers','#/company/<script>'])assert.equal(parseRoute(hash).page,'dashboard');
 assert.throws(()=>companyRoute('../users'));assert.equal(parseRoute('#/market').page,'market');
});
test('HTML loads hashed JS/CSS and dependency edits produce a different entry URL',async()=>{
 const temp=await mkdtemp(join(tmpdir(),'hcujusik-build-test-'));
 try{
  for(const [name,content]of Object.entries({'index.html':'<link href="./style.css"><link href="./hts.css"><link href="./workspace.css"><script type="module" src="./app.js"></script>','style.css':'body{color:red}','hts.css':'main{padding:10px}','workspace.css':'body{background:white}','app.js':'import {value} from "./dependency.js";document.title=value;','dependency.js':'export const value="first";','auth.js':'export const auth="fixture";'}))await writeFile(join(temp,name),content);
  const options={publicDir:temp,authEntry:join(temp,'auth.js'),outdir:join(temp,'built'),buildId:'test-build'};
  // Keep output separate from public input, as in the real repository.
  options.outdir=await mkdtemp(join(tmpdir(),'hcujusik-build-test-'));
  try{
   const first=await buildSite(options),html=await readFile(join(options.outdir,'index.html'),'utf8');
   assert.ok(html.includes(first.entry));assert.ok(!html.includes('src="./app.js"'));assert.match(html,/assets\/style-[a-f0-9]+\.css/);
   assert.match(html,/assets\/workspace-[a-f0-9]+\.css/);
   assert.equal(JSON.parse(await readFile(join(options.outdir,'version.json'),'utf8')).buildId,'test-build');
   await writeFile(join(temp,'dependency.js'),'export const value="second";');
   const second=await buildSite(options);assert.notEqual(first.entry,second.entry);
   assert.ok((await readFile(join(options.outdir,second.entry),'utf8')).includes('second'));
  }finally{if(resolve(options.outdir).startsWith(resolve(tmpdir()))&&basename(options.outdir).startsWith('hcujusik-build-test-'))await rm(options.outdir,{recursive:true,force:true});}
 }finally{if(resolve(temp).startsWith(resolve(tmpdir()))&&basename(temp).startsWith('hcujusik-build-test-'))await rm(temp,{recursive:true,force:true});}
});
