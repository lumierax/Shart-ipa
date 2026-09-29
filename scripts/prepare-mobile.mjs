import {rmSync,mkdirSync,cpSync,copyFileSync,existsSync,readFileSync,writeFileSync} from 'node:fs';
import {resolve,join} from 'node:path';

const root=resolve(new URL('..',import.meta.url).pathname);
const out=join(root,'www');
rmSync(out,{recursive:true,force:true});
mkdirSync(out,{recursive:true});

for(const dir of ['src','assets']){
  const src=join(root,dir);
  if(existsSync(src)) cpSync(src,join(out,dir),{recursive:true});
}
for(const file of ['index.html','manifest.webmanifest']){
  const src=join(root,file);
  if(existsSync(src)) copyFileSync(src,join(out,file));
}

// Native builds do not use Service Workers. The web build still does.
const appPath=join(out,'src','app.js');
if(existsSync(appPath)){
  let app=readFileSync(appPath,'utf8');
  app=app.replace(
    /if\('serviceWorker'in navigator&&location\.protocol!==['\"]file:['\"]\)/,
    "if('serviceWorker'in navigator&&/^https?:$/.test(location.protocol))"
  );
  writeFileSync(appPath,app);
}

console.log(`Prepared mobile web bundle: ${out}`);
