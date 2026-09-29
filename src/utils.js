export const clamp=(v,min,max)=>Math.min(max,Math.max(min,v));
export const uid=(prefix='id')=>`${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2,8)}`;
export const sleep=ms=>new Promise(r=>setTimeout(r,ms));
export const deepClone=o=>typeof structuredClone==='function'?structuredClone(o):JSON.parse(JSON.stringify(o));
export const debounce=(fn,ms=180)=>{let t;return(...args)=>{clearTimeout(t);t=setTimeout(()=>fn(...args),ms)}};
export const throttle=(fn,ms=100)=>{let last=0,t,args;return(...a)=>{args=a;const now=Date.now();if(now-last>=ms){last=now;fn(...args)}else if(!t){t=setTimeout(()=>{t=null;last=Date.now();fn(...args)},ms-(now-last))}}};
export const formatNumber=(v,d=2)=>{if(v==null||!Number.isFinite(+v))return'—';const n=+v;const a=Math.abs(n);if(a>=1e9)return`${(n/1e9).toFixed(2)}B`;if(a>=1e6)return`${(n/1e6).toFixed(2)}M`;if(a>=1e3)return`${(n/1e3).toFixed(2)}K`;if(a>=1)return n.toLocaleString(undefined,{maximumFractionDigits:d});return n.toPrecision(Math.min(6,Math.max(2,d+2)))};
export const formatPrice=v=>{if(v==null||!Number.isFinite(+v))return'—';const n=+v;const a=Math.abs(n);const d=a>=1000?2:a>=1?4:a>=.01?6:8;return n.toLocaleString(undefined,{maximumFractionDigits:d})};
export const formatPct=v=>`${(+v>=0?'+':'')}${(+v||0).toFixed(2)}%`;
export const formatDate=(ms,withDate=true)=>{const d=new Date(ms);return new Intl.DateTimeFormat(undefined,withDate?{month:'short',day:'2-digit',hour:'2-digit',minute:'2-digit'}:{hour:'2-digit',minute:'2-digit'}).format(d)};
export const escapeHtml=s=>String(s??'').replace(/[&<>'"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;',"'":'&#39;','"':'&quot;'}[c]));
export class Emitter{constructor(){this.m=new Map()}on(e,fn){if(!this.m.has(e))this.m.set(e,new Set);this.m.get(e).add(fn);return()=>this.off(e,fn)}off(e,fn){this.m.get(e)?.delete(fn)}emit(e,...a){for(const fn of this.m.get(e)||[])try{fn(...a)}catch(err){console.error(err)}}}
export async function saveBlob(name,blob){
  const isiOS=/iPad|iPhone|iPod/.test(navigator.userAgent)||(navigator.platform==='MacIntel'&&navigator.maxTouchPoints>1);
  if(isiOS&&typeof File!=='undefined'&&navigator.share){
    try{const file=new File([blob],name,{type:blob.type||'application/octet-stream'});if(!navigator.canShare||navigator.canShare({files:[file]})){await navigator.share({files:[file],title:name});return true}}catch(err){if(err?.name==='AbortError')return false}
  }
  const a=document.createElement('a');a.href=URL.createObjectURL(blob);a.download=name;a.rel='noopener';document.body.appendChild(a);a.click();a.remove();setTimeout(()=>URL.revokeObjectURL(a.href),1500);return true
}
export const downloadJSON=(name,data)=>saveBlob(name,new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));
export const parseJSONFile=file=>new Promise((resolve,reject)=>{const r=new FileReader();r.onload=()=>{try{resolve(JSON.parse(r.result))}catch(e){reject(e)}};r.onerror=reject;r.readAsText(file)});
