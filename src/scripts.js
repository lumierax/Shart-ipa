import {db} from './storage.js';
import {uid} from './utils.js';

const DEFAULT_INDICATOR=`defineIndicator({
  name: "EMA Trend",
  overlay: true,
  inputs: { fast: 20, slow: 50 },
  calculate({ close, ta, inputs, plot }) {
    const fast = ta.ema(close, inputs.fast);
    const slow = ta.ema(close, inputs.slow);
    plot("Fast EMA", fast, { color: "#2962ff" });
    plot("Slow EMA", slow, { color: "#f0b90b" });
  }
});`;
const DEFAULT_STRATEGY=`defineStrategy({
  name: "EMA Cross Strategy",
  inputs: { fast: 20, slow: 50, stopPct: 1.5, takePct: 3 },
  run({ close, ta, inputs, strategy }) {
    const fast = ta.ema(close, inputs.fast);
    const slow = ta.ema(close, inputs.slow);
    for (let i = 1; i < close.length - 1; i++) {
      if (ta.crossover(fast, slow, i)) {
        strategy.entry(i, "long", { stopPct: inputs.stopPct, takePct: inputs.takePct });
      }
      if (ta.crossunder(fast, slow, i)) strategy.close(i);
    }
  }
});`;

export class ScriptEngine{
  async ensureDefaults(){const all=await this.list();if(all.length)return all;await this.save({id:uid('script'),name:'EMA Trend',type:'indicator',favorite:true,source:DEFAULT_INDICATOR,createdAt:Date.now(),updatedAt:Date.now()});await this.save({id:uid('script'),name:'EMA Cross Strategy',type:'strategy',favorite:false,source:DEFAULT_STRATEGY,createdAt:Date.now(),updatedAt:Date.now()});return this.list()}
  async list(){return (await db.entries('scripts')).map(([,v])=>v).sort((a,b)=>(b.favorite-a.favorite)||(b.updatedAt-a.updatedAt))}
  async save(script){const now=Date.now(),s={id:script.id||uid('script'),name:script.name||'Untitled',type:script.type||'indicator',source:script.source||'',favorite:!!script.favorite,createdAt:script.createdAt||now,updatedAt:now};await db.set('scripts',s.id,s);return s}
  async remove(id){await db.del('scripts',id)}
  async duplicate(script){return this.save({...script,id:uid('script'),name:`${script.name} Copy`,favorite:false,createdAt:Date.now()})}
  async run(script,bars,inputs={}){return runWorker(script,bars,inputs)}
}

function runWorker(script,bars,inputs){
  return new Promise((resolve,reject)=>{
    const worker=new Worker(URL.createObjectURL(new Blob([WORKER_CODE],{type:'text/javascript'})));
    const timer=setTimeout(()=>{worker.terminate();reject(new Error('Script stopped: execution exceeded 1800 ms'))},1800);
    worker.onmessage=e=>{clearTimeout(timer);worker.terminate();if(e.data?.ok)resolve(e.data.result);else reject(new Error(e.data?.error||'Script error'))};worker.onerror=e=>{clearTimeout(timer);worker.terminate();reject(new Error(e.message||'Worker error'))};
    worker.postMessage({script,bars,inputs});
  })
}

const WORKER_CODE=String.raw`
self.fetch=undefined;self.XMLHttpRequest=undefined;self.WebSocket=undefined;self.EventSource=undefined;self.importScripts=undefined;
const sma=(v,p=20)=>{const o=Array(v.length).fill(null);let s=0,c=0;for(let i=0;i<v.length;i++){const x=+v[i];if(Number.isFinite(x)){s+=x;c++}if(i>=p){const y=+v[i-p];if(Number.isFinite(y)){s-=y;c--}}if(i>=p-1&&c===p)o[i]=s/p}return o};
const ema=(v,p=20)=>{const o=Array(v.length).fill(null),k=2/(p+1);let seed=0,n=0,prev=null;for(let i=0;i<v.length;i++){const x=+v[i];if(!Number.isFinite(x))continue;if(prev===null){seed+=x;n++;if(n===p){prev=seed/p;o[i]=prev}}else{prev=x*k+prev*(1-k);o[i]=prev}}return o};
const rma=(v,p=14)=>{const o=Array(v.length).fill(null);let s=0,prev=null;for(let i=0;i<v.length;i++){const x=+v[i];if(!Number.isFinite(x))continue;if(prev===null){s+=x;if(i===p-1){prev=s/p;o[i]=prev}}else{prev=(prev*(p-1)+x)/p;o[i]=prev}}return o};
const rsi=(v,p=14)=>{const g=Array(v.length).fill(0),l=Array(v.length).fill(0);for(let i=1;i<v.length;i++){const d=v[i]-v[i-1];g[i]=Math.max(0,d);l[i]=Math.max(0,-d)}const a=rma(g,p),b=rma(l,p);return v.map((_,i)=>a[i]==null||b[i]==null?null:b[i]===0?100:100-100/(1+a[i]/b[i]))};
const atr=(h,l,c,p=14)=>{const t=c.map((_,i)=>i?Math.max(h[i]-l[i],Math.abs(h[i]-c[i-1]),Math.abs(l[i]-c[i-1])):h[i]-l[i]);return rma(t,p)};
const std=(v,p=20)=>{const o=Array(v.length).fill(null);for(let i=p-1;i<v.length;i++){let s=0,s2=0;for(let j=i-p+1;j<=i;j++){s+=v[j];s2+=v[j]*v[j]}const m=s/p;o[i]=Math.sqrt(Math.max(0,s2/p-m*m))}return o};
const crossover=(a,b,i)=>i>0&&a[i]!=null&&b[i]!=null&&a[i-1]!=null&&b[i-1]!=null&&a[i]>b[i]&&a[i-1]<=b[i-1];
const crossunder=(a,b,i)=>i>0&&a[i]!=null&&b[i]!=null&&a[i-1]!=null&&b[i-1]!=null&&a[i]<b[i]&&a[i-1]>=b[i-1];
const highest=(v,p)=>v.map((_,i)=>i<p-1?null:Math.max(...v.slice(i-p+1,i+1)));const lowest=(v,p)=>v.map((_,i)=>i<p-1?null:Math.min(...v.slice(i-p+1,i+1)));
const ta={sma,ema,rsi,atr,std,crossover,crossunder,highest,lowest};
self.onmessage=e=>{try{
  const {script,bars,inputs:override}=e.data,open=bars.map(b=>b.open),high=bars.map(b=>b.high),low=bars.map(b=>b.low),close=bars.map(b=>b.close),volume=bars.map(b=>b.volume),time=bars.map(b=>b.time);let definition=null;
  const defineIndicator=d=>{definition={...d,type:'indicator'}};const defineStrategy=d=>{definition={...d,type:'strategy'}};
  const factory=new Function('defineIndicator','defineStrategy','"use strict";\n'+script.source+'\n;return true;');factory(defineIndicator,defineStrategy);if(!definition)throw new Error('Use defineIndicator({...}) or defineStrategy({...})');
  const inputValues={...(definition.inputs||{}),...(override||{})};const plots=[];const plot=(name,values,opts={})=>{if(!Array.isArray(values)||values.length!==bars.length)throw new Error('plot() values must match candle count');plots.push({name,values,color:opts.color,type:opts.type||'line',overlay:opts.overlay??definition.overlay??true})};
  const orders=[];const strategy={entry:(index,side,opts={})=>orders.push({type:'entry',index:+index,side,opts}),close:(index,opts={})=>orders.push({type:'close',index:+index,opts})};
  const ctx={open,high,low,close,volume,time,bars,ta,inputs:inputValues,plot,strategy};
  if(definition.type==='indicator'){if(typeof definition.calculate!=='function')throw new Error('Indicator needs calculate(ctx)');definition.calculate(ctx)}else{if(typeof definition.run!=='function')throw new Error('Strategy needs run(ctx)');definition.run(ctx)}
  postMessage({ok:true,result:{type:definition.type,name:definition.name||script.name,overlay:definition.overlay??true,plots,orders:orders.sort((a,b)=>a.index-b.index)}})
}catch(err){postMessage({ok:false,error:String(err?.stack||err)})}};
`;
export {DEFAULT_INDICATOR,DEFAULT_STRATEGY};
