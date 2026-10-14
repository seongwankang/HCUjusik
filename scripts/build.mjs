import {build} from 'esbuild';
await build({
  entryPoints: ['client/auth.js'],
  outfile: 'public/auth.bundle.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true
});

import {mkdir,cp,writeFile} from 'node:fs/promises';
await mkdir('dist',{recursive:true});
await cp('public','dist',{recursive:true});
await writeFile('dist/.nojekyll','');
