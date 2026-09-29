import http from 'node:http';
import {readFile,stat} from 'node:fs/promises';
import path from 'node:path';
import {fileURLToPath} from 'node:url';
const ROOT=path.dirname(fileURLToPath(import.meta.url));
const PORT=Number(process.env.PORT||8787);const HOST=process.env.HOST||'0.0.0.0';
const MIME={'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.mjs':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json; charset=utf-8','.webmanifest':'application/manifest+json','.png':'image/png','.svg':'image/svg+xml','.md':'text/markdown; charset=utf-8'};
const server=http.createServer(async(req,res)=>{try{const url=new URL(req.url,'http://local');let rel=decodeURIComponent(url.pathname).replace(/^\/+/, '');if(!rel)rel='index.html';let file=path.resolve(ROOT,rel);if(file!==ROOT&&!file.startsWith(ROOT+path.sep))throw new Error('bad path');let s=await stat(file).catch(()=>null);if(s?.isDirectory())file=path.join(file,'index.html');const data=await readFile(file);res.writeHead(200,{'Content-Type':MIME[path.extname(file)]||'application/octet-stream','Cache-Control':'no-cache'});res.end(data)}catch{res.writeHead(404,{'Content-Type':'text/plain'});res.end('Not found')}});
server.listen(PORT,HOST,()=>{console.log(`Binance Chart Studio: http://localhost:${PORT}`);console.log(`LAN access: http://<YOUR-LAPTOP-IP>:${PORT}`)});
