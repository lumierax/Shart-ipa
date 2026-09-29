import {Emitter,sleep} from './utils.js';
import {db} from './storage.js';

const CONFIG={
  spot:{rest:['https://api.binance.com','https://api1.binance.com','https://api2.binance.com','https://api3.binance.com'],ws:'wss://stream.binance.com:9443/ws',exchange:'/api/v3/exchangeInfo',klines:'/api/v3/klines',ticker:'/api/v3/ticker/24hr'},
  futures:{rest:['https://fapi.binance.com'],ws:'wss://fstream.binance.com/ws',exchange:'/fapi/v1/exchangeInfo',klines:'/fapi/v1/klines',ticker:'/fapi/v1/ticker/24hr'}
};

export class BinanceClient extends Emitter{
  constructor(market='spot'){super();this.market=market;this.symbols=[];this.symbolMap=new Map();this.sockets=new Map();this.aborters=new Set();this.baseIndex=0}
  setMarket(market){if(!CONFIG[market])throw new Error('Unsupported market');if(market===this.market)return;this.closeAll();this.market=market;this.symbols=[];this.symbolMap.clear();this.baseIndex=0}
  get cfg(){return CONFIG[this.market]}
  async fetchJSON(path,params={},opts={}){
    const qs=new URLSearchParams(Object.entries(params).filter(([,v])=>v!==undefined&&v!==null)).toString();const urlPath=path+(qs?`?${qs}`:'');let lastErr;
    for(let n=0;n<this.cfg.rest.length;n++){
      const base=this.cfg.rest[(this.baseIndex+n)%this.cfg.rest.length];const controller=new AbortController();this.aborters.add(controller);const timeout=setTimeout(()=>controller.abort(),opts.timeout||12000);
      try{const res=await fetch(base+urlPath,{signal:controller.signal,cache:'no-store'});if(!res.ok)throw new Error(`Binance ${res.status}: ${await res.text()}`);const data=await res.json();this.baseIndex=(this.baseIndex+n)%this.cfg.rest.length;return data}catch(e){lastErr=e}finally{clearTimeout(timeout);this.aborters.delete(controller)}
    }
    throw lastErr||new Error('Binance request failed');
  }
  async loadExchangeInfo(force=false){
    if(this.symbols.length&&!force)return this.symbols;
    try{
      const data=await this.fetchJSON(this.cfg.exchange);const symbols=(data.symbols||[]).filter(s=>s.status==='TRADING'&&(this.market==='spot'?s.isSpotTradingAllowed!==false:(s.contractType==='PERPETUAL'||!s.contractType))).map(s=>({
        symbol:s.symbol,base:s.baseAsset,quote:s.quoteAsset,status:s.status,pricePrecision:s.pricePrecision??this._precisionFromFilters(s.filters,'PRICE_FILTER','tickSize'),qtyPrecision:s.quantityPrecision??this._precisionFromFilters(s.filters,'LOT_SIZE','stepSize'),onboardDate:s.onboardDate||0
      })).sort((a,b)=>a.symbol.localeCompare(b.symbol));
      const previous=new Set(this.symbols.map(s=>s.symbol));this.symbols=symbols;this.symbolMap=new Map(symbols.map(s=>[s.symbol,s]));await db.set('cache',`symbols:${this.market}`,{at:Date.now(),symbols});const added=symbols.filter(s=>!previous.has(s.symbol));if(previous.size&&added.length)this.emit('newSymbols',added);this.emit('symbols',symbols);return symbols;
    }catch(e){const cached=await db.get('cache',`symbols:${this.market}`);if(cached?.symbols){this.symbols=cached.symbols;this.symbolMap=new Map(this.symbols.map(s=>[s.symbol,s]));this.emit('symbols',this.symbols);return this.symbols}throw e}
  }
  _precisionFromFilters(filters,type,key){const f=filters?.find(x=>x.filterType===type),v=f?.[key];if(!v)return 8;const s=String(v).replace(/0+$/,'');return Math.max(0,(s.split('.')[1]||'').length)}
  async klines(symbol,interval='1h',limit=1000,endTime){
    const key=`klines:${this.market}:${symbol}:${interval}`;try{
      const rows=await this.fetchJSON(this.cfg.klines,{symbol,interval,limit:Math.min(this.market==='futures'?1500:1000,limit),endTime});const bars=rows.map(r=>({time:+r[0],open:+r[1],high:+r[2],low:+r[3],close:+r[4],volume:+r[5],closeTime:+r[6],quoteVolume:+r[7],trades:+r[8]}));if(endTime===undefined)await db.set('cache',key,{at:Date.now(),bars});return bars;
    }catch(e){const cached=endTime===undefined?await db.get('cache',key):null;if(cached?.bars)return cached.bars;throw e}
  }
  async klinesRange(symbol,interval,startTime,endTime,maxBars=10000){
    const all=[];let cursor=endTime||Date.now();const per=this.market==='futures'?1500:1000;for(let i=0;i<Math.ceil(maxBars/per)&&all.length<maxBars;i++){
      const chunk=await this.klines(symbol,interval,per,cursor);if(!chunk.length)break;all.unshift(...chunk);const first=chunk[0].time;if(startTime&&first<=startTime)break;cursor=first-1;await sleep(80)
    }const uniq=[...new Map(all.map(b=>[b.time,b])).values()].sort((a,b)=>a.time-b.time);return uniq.filter(b=>(!startTime||b.time>=startTime)&&(!endTime||b.time<=endTime)).slice(-maxBars)
  }
  async ticker24h(symbol){return this.fetchJSON(this.cfg.ticker,symbol?{symbol}:{})}
  subscribeKline(symbol,interval,onBar){
    const key=`${this.market}:${symbol}:${interval}`;this.unsubscribe(key);const stream=`${symbol.toLowerCase()}@kline_${interval}`;let ws,stopped=false,retry=0;
    const connect=()=>{if(stopped)return;ws=new WebSocket(`${this.cfg.ws}/${stream}`);this.sockets.set(key,{ws,stop:()=>{stopped=true;try{ws.close()}catch{}}});ws.onopen=()=>{retry=0;this.emit('socket',{key,status:'open'})};ws.onmessage=evt=>{try{const msg=JSON.parse(evt.data),k=msg.k||msg.data?.k;if(!k)return;onBar({time:+k.t,open:+k.o,high:+k.h,low:+k.l,close:+k.c,volume:+k.v,closeTime:+k.T,closed:!!k.x,quoteVolume:+k.q,trades:+k.n})}catch(e){this.emit('error',e)}};ws.onerror=()=>this.emit('socket',{key,status:'error'});ws.onclose=()=>{this.emit('socket',{key,status:'closed'});if(!stopped){retry++;setTimeout(connect,Math.min(15000,500*Math.pow(2,Math.min(5,retry))))}}};connect();return()=>this.unsubscribe(key)
  }
  unsubscribe(key){const s=this.sockets.get(key);if(s){s.stop?.();this.sockets.delete(key)}}
  closeAll(){for(const [k] of this.sockets)this.unsubscribe(k);for(const a of this.aborters)a.abort();this.aborters.clear()}
}
