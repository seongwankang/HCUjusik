import {build} from 'esbuild';
import {mkdir,cp,writeFile,readFile} from 'node:fs/promises';
import {createHash} from 'node:crypto';
import {resolve,relative} from 'node:path';
import {fileURLToPath,pathToFileURL} from 'node:url';
const root=fileURLToPath(new URL('../',import.meta.url));
export async function buildSite({outdir=resolve(root,'dist'),publicDir=resolve(root,'public'),authEntry=resolve(root,'client/auth.js'),buildId=process.env.GITHUB_SHA||new Date().toISOString()}={}){
 // Legacy flat assets remain for existing tabs. New HTML loads one hashed
 // bundle containing all modules, so auth and screen code cannot mix versions.
 await build({entryPoints:[authEntry],outfile:resolve(publicDir,'auth.bundle.js'),bundle:true,format:'esm',target:'es2022',minify:true});
 await mkdir(resolve(outdir,'assets'),{recursive:true});await cp(publicDir,outdir,{recursive:true});
 const result=await build({entryPoints:[resolve(publicDir,'app.js')],outdir:resolve(outdir,'assets'),entryNames:'app-[hash]',bundle:true,format:'esm',target:'es2022',minify:true,metafile:true,define:{__APP_BUILD__:JSON.stringify(buildId)}});
 const entry=Object.entries(result.metafile.outputs).find(([path,meta])=>meta.entryPoint&&path.endsWith('.js'))[0];
 let html=await readFile(resolve(publicDir,'index.html'),'utf8');
 html=html.replace('./app.js','./'+relative(outdir,resolve(entry)).replaceAll('\\','/'));
 for(const name of ['style.css','hts.css','workspace.css']){
  const content=await readFile(resolve(publicDir,name));const hash=createHash('sha256').update(content).digest('hex').slice(0,12),filename=name.replace('.css','-'+hash+'.css');
  await writeFile(resolve(outdir,'assets',filename),content);html=html.replace('./'+name,'./assets/'+filename);
 }
 await writeFile(resolve(outdir,'index.html'),html);await writeFile(resolve(outdir,'version.json'),JSON.stringify({buildId}));await writeFile(resolve(outdir,'.nojekyll'),'');
 return {buildId,entry:relative(outdir,resolve(entry)).replaceAll('\\','/')};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)await buildSite();
