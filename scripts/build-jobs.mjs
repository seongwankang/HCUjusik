import {build} from 'esbuild';
import {resolve} from 'node:path';
export async function buildJob(entry='scripts/scheduled-job.mjs',outfile='.generated-scheduled-job.mjs'){
 await build({entryPoints:[entry],outfile,bundle:true,platform:'node',format:'esm',packages:'external',plugins:[{name:'admin-firestore',setup(b){b.onResolve({filter:/^firebase\/firestore$/},()=>({path:resolve('server/firestore-admin-adapter.js')}));}}]});
}
if(process.argv[1]?.endsWith('build-jobs.mjs'))await buildJob();
