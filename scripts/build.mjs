import {build} from 'esbuild';
await build({
  entryPoints: ['client/auth.js'],
  outfile: 'public/auth.bundle.js',
  bundle: true,
  format: 'esm',
  target: 'es2022',
  minify: true
});
