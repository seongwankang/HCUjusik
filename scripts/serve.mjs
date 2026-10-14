import http from 'node:http';
import {readFile} from 'node:fs/promises';
import path from 'node:path';
const root=path.resolve('dist');
const mime={'.html':'text/html;charset=utf-8','.js':'text/javascript;charset=utf-8','.css':'text/css;charset=utf-8','.json':'application/json;charset=utf-8'};
http.createServer(async(req,res)=>{try{let url=decodeURIComponent(new URL(req.url,'http://localhost').pathname);if(url.startsWith('/HCUjusik/'))url=url.slice('/HCUjusik'.length);const file=path.resolve(root,'.'+(url==='/'?'/index.html':url));if(!file.startsWith(root+path.sep)){res.writeHead(403);return res.end();}res.setHeader('content-type',mime[path.extname(file)]||'application/octet-stream');res.setHeader('cache-control','no-store');res.end(await readFile(file));}catch{res.writeHead(404);res.end('Not found');}}).listen(8789,'127.0.0.1',()=>console.log('Preview: http://127.0.0.1:8789/HCUjusik/'));
