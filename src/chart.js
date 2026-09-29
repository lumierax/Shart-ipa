import {Emitter,clamp,formatPrice,formatDate,uid,saveBlob} from './utils.js';
import {BUILT_INS} from './ta.js';
import {DrawingManager} from './drawings.js';

const PALETTE=['#2962ff','#f0b90b','#ab47bc','#26a69a','#ef5350','#42a5f5','#ec407a','#66bb6a'];

export function toHeikinAshi(bars=[]){
  const out=[];
  for(let i=0;i<bars.length;i++){
    const b=bars[i];
    if(!b)continue;
    const hc=(Number(b.open)+Number(b.high)+Number(b.low)+Number(b.close))/4;
    const ho=i?(out[i-1].open+out[i-1].close)/2:(Number(b.open)+Number(b.close))/2;
    out.push({...b,open:ho,close:hc,high:Math.max(Number(b.high),ho,hc),low:Math.min(Number(b.low),ho,hc)});
  }
  return out;
}

export class ChartEngine extends Emitter{
  constructor(container,{symbol='BTCUSDT',timeframe='1h',market='spot',id=uid('chart')}={}){
    super();
    this.id=id;this.container=container;this.symbol=symbol;this.timeframe=timeframe;this.market=market;
    this.bars=[];this.indicators=[];this.scriptSeries=[];this.hiddenScriptIds=new Set();this.computed=[];this.markers=[];
    this.replayIndex=null;this.barSpacing=8;this.viewEnd=null;this.rightPadBars=5;
    this.priceMin=0;this.priceMax=1;this.crosshair=null;this.externalCrosshair=null;
    this.dragPan=null;this.timeScaleDrag=null;this.priceDrag=null;this.pointers=new Map();this.pinch=null;
    this.chartType='candles';this._heikinCache=null;this.grid=true;this.volume=true;this.autoScale=true;
    this.priceZoom=1;this.frozen=null;this.scaleMode='linear';this._percentBase=1;
    this.destroyed=false;this.needsDraw=false;this.loadingHistory=false;this.noMoreHistory=false;
    this.canvas=document.createElement('canvas');this.canvas.className='chart-canvas';this.canvas.tabIndex=0;container.appendChild(this.canvas);
    this.ctx=this.canvas.getContext('2d');this.drawings=new DrawingManager(this);this.drawings.onChange=items=>this.emit('drawings',items);
    this._bind();this.ro=new ResizeObserver(()=>this.resize());this.ro.observe(container);this.resize();
  }

  _bind(){
    this.canvas.addEventListener('pointerdown',e=>this._pointerDown(e));
    this.canvas.addEventListener('pointermove',e=>this._pointerMove(e));
    this.canvas.addEventListener('pointerup',e=>this._pointerUp(e));
    this.canvas.addEventListener('pointercancel',e=>this._pointerUp(e));
    this.canvas.addEventListener('pointerleave',()=>{
      if(!this.dragPan&&!this.timeScaleDrag&&!this.priceDrag&&!this.drawings.drag&&this.pointers.size===0){
        this.crosshair=null;this.emit('crosshair',null);this.canvas.style.cursor='';this.requestDraw();
      }
    });
    this.canvas.addEventListener('wheel',e=>this._wheel(e),{passive:false});
    this.canvas.addEventListener('dblclick',e=>this._doubleClick(e));
  }

  destroy(){this.destroyed=true;this.ro?.disconnect();this.canvas.remove();this.emit('destroy')}

  resize(){
    const r=this.container.getBoundingClientRect();this.width=Math.max(1,r.width);this.height=Math.max(1,r.height);
    const dpr=Math.min(2.5,window.devicePixelRatio||1);this.dpr=dpr;
    this.canvas.width=Math.floor(this.width*dpr);this.canvas.height=Math.floor(this.height*dpr);
    this.canvas.style.width=`${this.width}px`;this.canvas.style.height=`${this.height}px`;
    this.ctx.setTransform(dpr,0,0,dpr,0,0);this.requestDraw();
  }

  setSymbol(symbol,market=this.market){this.symbol=symbol;this.market=market;this.crosshair=null;this.replayIndex=null;this.noMoreHistory=false;this.emit('symbol',symbol)}
  setTimeframe(tf){this.timeframe=tf;this.crosshair=null;this.replayIndex=null;this.noMoreHistory=false;this.emit('timeframe',tf)}
  setChartType(type='candles'){this.chartType=type;this.requestDraw();this.emit('charttype',type)}
  setScaleMode(mode='linear'){
    if(!['linear','log','percent','indexed'].includes(mode))mode='linear';
    this.scaleMode=mode;this.priceZoom=1;this.frozen=null;this.autoScale=true;this.requestDraw();this.emit('scaleMode',mode);
  }

  setData(bars,{fit=true}={}){
    this.bars=bars||[];this._heikinCache=null;this.recomputeIndicators();
    if(fit){this.noMoreHistory=false;this.priceZoom=1;this.frozen=null}
    if(fit||this.viewEnd==null)this.fitContent();else this.requestDraw();
    this.emit('data',this.bars);
  }

  updateBar(bar){
    if(!bar)return;this._heikinCache=null;const last=this.bars[this.bars.length-1],wasFollowing=this.isFollowing();
    if(last?.time===bar.time)this.bars[this.bars.length-1]={...last,...bar};
    else if(!last||bar.time>last.time)this.bars.push(bar);
    else{const i=this.bars.findIndex(x=>x.time===bar.time);if(i>=0)this.bars[i]={...this.bars[i],...bar}}
    this.recomputeIndicators();
    if(wasFollowing&&this.replayIndex==null)this.viewEnd=this.bars.length-1+this.rightPadBars;
    this.requestDraw();this.emit('bar',bar);
  }

  isFollowing(){return this.viewEnd==null||Math.abs(this.viewEnd-(this.displayLength-1+this.rightPadBars))<3}
  get displayLength(){return this.replayIndex==null?this.bars.length:Math.min(this.bars.length,this.replayIndex+1)}
  get activeBars(){return this.replayIndex==null?this.bars:this.bars.slice(0,this.displayLength)}
  get barMs(){const b=this.bars,n=b.length;return n>1?(b[n-1].time-b[0].time)/(n-1):6e4}

  fitContent(){
    this._layout();this.barSpacing=clamp((this.plotRight||Math.max(80,this.width-68))/Math.min(120,Math.max(30,this.displayLength||80)),4,12);
    this.viewEnd=(this.displayLength||1)-1+this.rightPadBars;this.requestDraw();
  }
  zoomBy(f,ax){
    this._layout();const x=ax??(this.isFollowing()?this.plotRight:this.plotRight/2),old=this.barSpacing,end=this.viewEnd??(this.displayLength-1+this.rightPadBars);
    this.barSpacing=clamp(old*f,.5,60);const oldD=(this.plotRight-x)/old,newD=(this.plotRight-x)/this.barSpacing;
    this.viewEnd=clamp(end+(newD-oldD),5,this.displayLength-1+200);this.requestDraw();this._checkHistory();
  }
  panBy(n){this.viewEnd=clamp((this.viewEnd??(this.displayLength-1+this.rightPadBars))+n,5,this.displayLength-1+200);this.requestDraw();this._checkHistory()}
  scrollToLatest(){this.viewEnd=this.displayLength-1+this.rightPadBars;this.requestDraw()}
  resetPriceScale(){this.priceZoom=1;this.frozen=null;this.autoScale=true;this.requestDraw()}
  _scalePrice(f){
    if(this.frozen){const c=(this.frozen.lo+this.frozen.hi)/2,h=(this.frozen.hi-this.frozen.lo)/2*f;this.frozen={lo:c-h,hi:c+h}}
    else this.priceZoom=clamp(this.priceZoom*f,.05,20);
    this.requestDraw();
  }

  _checkHistory(){if(this.loadingHistory||this.noMoreHistory||!this.bars.length||this.replayIndex!=null)return;if(this.visibleRange.start<25)this.emit('needHistory')}
  prependBars(older){
    if(!older.length)return;const n=older.length;this.bars=[...older,...this.bars];this._heikinCache=null;
    if(this.viewEnd!=null)this.viewEnd+=n;if(this.replayIndex!=null)this.replayIndex+=n;
    for(const m of this.markers||[])if(Number.isFinite(m.index))m.index+=n;
    this.recomputeIndicators();this.emit('data',this.bars);setTimeout(()=>this._checkHistory(),60);
  }

  timeToIndex(t){
    const b=this.bars,n=b.length;if(!n)return-1;
    if(t>=b[n-1].time)return n-1+(t-b[n-1].time)/this.barMs;
    if(t<=b[0].time)return(t-b[0].time)/this.barMs;
    let lo=0,hi=n-1;while(hi-lo>1){const m=(lo+hi)>>1;b[m].time<=t?lo=m:hi=m}
    return lo+(t-b[lo].time)/(b[hi].time-b[lo].time);
  }
  indexToTime(i){
    const b=this.bars,n=b.length;if(!n)return 0;
    if(i>=n-1)return b[n-1].time+(i-(n-1))*this.barMs;
    if(i<=0)return b[0].time+i*this.barMs;
    const lo=Math.floor(i);return b[lo].time+(i-lo)*(b[lo+1].time-b[lo].time);
  }
  findTimeIndex(time){return this.findTimeIndexAtOrBefore(time,false)}
  findTimeIndexAtOrBefore(time,full=false){
    if(!this.bars.length)return-1;const max=full?this.bars.length-1:this.displayLength-1;if(max<0)return-1;
    if(time<this.bars[0].time)return-1;if(time===this.bars[0].time)return 0;if(time>=this.bars[max].time)return max;
    let lo=0,hi=max;while(lo<=hi){const m=(lo+hi)>>1,v=this.bars[m].time;if(v===time)return m;if(v<time)lo=m+1;else hi=m-1}
    return clamp(hi,0,max);
  }

  setReplayIndex(i){this.replayIndex=clamp(i,-1,Math.max(-1,this.bars.length-1));this.viewEnd=this.replayIndex+this.rightPadBars;this.requestDraw()}
  clearReplay(){this.replayIndex=null;this.fitContent()}

  addIndicator(id,params={}){
    const def=Object.values(BUILT_INS).find(x=>x.id===id);if(!def)return null;
    const item={key:uid('ind'),id:def.id,name:def.name,params:{...def.defaults,...params},overlay:def.overlay,scale:def.scale||null,hidden:false};
    this.indicators.push(item);this.recomputeIndicators();this.emit('indicators',this.indicators);return item;
  }
  removeIndicator(key){this.indicators=this.indicators.filter(x=>x.key!==key);this.recomputeIndicators();this.emit('indicators',this.indicators)}
  toggleIndicatorVisibility(key){const i=this.indicators.find(x=>x.key===key);if(!i)return;i.hidden=!i.hidden;this.recomputeIndicators();this.emit('indicators',this.indicators)}

  setScriptSeries(scriptId,name,plots=[],overlay=true){
    this.scriptSeries=this.scriptSeries.filter(x=>x.scriptId!==scriptId);
    for(const p of plots)this.scriptSeries.push({scriptId,name:p.name||name,values:p.values||[],type:p.type||'line',overlay:p.overlay??overlay,color:p.color});
    this.recomputeIndicators();this.emit('indicators',this.indicators);
  }
  removeScriptSeries(scriptId){this.scriptSeries=this.scriptSeries.filter(x=>x.scriptId!==scriptId);this.hiddenScriptIds.delete(scriptId);this.recomputeIndicators();this.emit('indicators',this.indicators)}
  toggleScriptVisibility(scriptId){if(this.hiddenScriptIds.has(scriptId))this.hiddenScriptIds.delete(scriptId);else this.hiddenScriptIds.add(scriptId);this.recomputeIndicators();this.emit('indicators',this.indicators)}
  isScriptHidden(scriptId){return this.hiddenScriptIds.has(scriptId)}
  setMarkers(markers=[]){this.markers=markers;this.requestDraw()}

  recomputeIndicators(){
    const d=this._arrays();this.computed=[];
    for(const item of this.indicators){
      const def=Object.values(BUILT_INS).find(x=>x.id===item.id);if(!def)continue;
      try{this.computed.push({source:item.key,name:item.name,overlay:item.overlay,scale:item.scale,hidden:!!item.hidden,series:def.compute(d,item.params)})}catch(e){this.emit('error',e)}
    }
    for(const s of this.scriptSeries){
      let c=this.computed.find(x=>x.source===s.scriptId);
      if(!c){c={source:s.scriptId,name:s.name,overlay:s.overlay,scale:null,hidden:this.hiddenScriptIds.has(s.scriptId),series:[]};this.computed.push(c)}
      c.hidden=this.hiddenScriptIds.has(s.scriptId);c.series.push({name:s.name,values:s.values,type:s.type,color:s.color});
    }
    this.requestDraw();
  }
  _arrays(){return{open:this.bars.map(b=>b.open),high:this.bars.map(b=>b.high),low:this.bars.map(b=>b.low),close:this.bars.map(b=>b.close),volume:this.bars.map(b=>b.volume),time:this.bars.map(b=>b.time)}}

  _heikinBars(){if(this._heikinCache?.length===this.bars.length)return this._heikinCache;this._heikinCache=toHeikinAshi(this.bars);return this._heikinCache}
  getBarForDisplay(i){return this.chartType==='heikin'?this._heikinBars()[i]:this.bars[i]}
  _priceBars(){return this.chartType==='heikin'?this._heikinBars():this.bars}

  get visibleRange(){
    const plotRight=this.plotRight||Math.max(80,this.width-68),count=Math.max(10,Math.ceil(plotRight/this.barSpacing)+2),end=this.viewEnd??(this.displayLength-1+this.rightPadBars),start=end-count;
    return{start,end,from:clamp(Math.floor(start),0,Math.max(0,this.displayLength-1)),to:clamp(Math.ceil(end),0,Math.max(0,this.displayLength-1))};
  }
  _layout(){
    const oscillators=this.computed.filter(x=>!x.overlay&&!x.hidden).slice(0,2),timeAxis=22,minMain=Math.max(120,this.height*.45);
    let oscH=oscillators.length?clamp((this.height-timeAxis)*.20,80,150):0;if(oscillators.length===2&&this.height<440)oscH=70;
    const mainBottom=Math.max(minMain,this.height-timeAxis-oscH*oscillators.length);this.timeAxisY=this.height-timeAxis;this.mainBottom=Math.min(mainBottom,this.timeAxisY);
    this.plotRight=Math.max(80,this.width-68);this.oscillators=oscillators;this.oscPanes=oscillators.map((x,i)=>({item:x,top:this.mainBottom+i*oscH,bottom:this.mainBottom+(i+1)*oscH}));
  }

  _percentReference(){
    const {from,to}=this.visibleRange;for(let i=from;i<=to&&i<this.displayLength;i++){const p=Number(this.bars[i]?.close);if(Number.isFinite(p)&&p!==0)return p}
    return Number(this.bars[Math.min(this.displayLength-1,Math.max(0,from))]?.close)||1;
  }
  _toScale(price){
    const p=Number(price);if(!Number.isFinite(p))return NaN;
    if(this.scaleMode==='log')return p>0?Math.log(p):NaN;
    if(this.scaleMode==='percent'){const base=this._percentBase||1;return base?((p/base)-1)*100:0}
    if(this.scaleMode==='indexed'){const base=this._percentBase||1;return base?(p/base)*100:100}
    return p;
  }
  _fromScale(v){
    if(this.scaleMode==='log')return Math.exp(v);
    if(this.scaleMode==='percent')return (this._percentBase||1)*(1+v/100);
    if(this.scaleMode==='indexed')return (this._percentBase||1)*(v/100);
    return v;
  }
  _formatScale(v){if(this.scaleMode==='percent')return`${v>=0?'+':''}${v.toFixed(Math.abs(v)>=100?0:2)}%`;if(this.scaleMode==='indexed')return v.toFixed(Math.abs(v)>=1000?0:2);return formatPrice(this._fromScale(v))}

  _priceRange(){
    this._percentBase=this._percentReference();const{from,to}=this.visibleRange,bars=this._priceBars();let min=Infinity,max=-Infinity;
    const add=p=>{const v=this._toScale(p);if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v)}};
    for(let i=from;i<=to&&i<this.displayLength;i++){const b=bars[i];if(!b)continue;add(b.low);add(b.high)}
    for(const ind of this.computed.filter(x=>x.overlay&&!x.hidden))for(const s of ind.series)for(let i=from;i<=to&&i<this.displayLength;i++)add(s.values[i]);
    if(!Number.isFinite(min)||!Number.isFinite(max)){min=0;max=1}
    let pad=(max-min)*.08||Math.abs(max)*.01||1,lo=min-pad,hi=max+pad;
    if(this.priceZoom!==1){const c=(lo+hi)/2,h=(hi-lo)/2*this.priceZoom;lo=c-h;hi=c+h}
    if(!this.autoScale){if(!this.frozen)this.frozen={lo,hi};lo=this.frozen.lo;hi=this.frozen.hi}else this.frozen=null;
    this.priceMin=lo;this.priceMax=hi;
  }

  indexToX(i){const end=this.viewEnd??(this.displayLength-1+this.rightPadBars);return this.plotRight-(end-i)*this.barSpacing-this.barSpacing/2}
  xToIndex(x){const end=this.viewEnd??(this.displayLength-1+this.rightPadBars);return end-(this.plotRight-x-this.barSpacing/2)/this.barSpacing}
  priceToY(p){const v=this._toScale(p),h=Math.max(1,this.mainBottom);return (this.priceMax-v)/(this.priceMax-this.priceMin)*h}
  yToPrice(y){const v=this.priceMax-y/Math.max(1,this.mainBottom)*(this.priceMax-this.priceMin);return this._fromScale(v)}
  dataToXY(p){if(!p)return null;const idx=p.time?this.timeToIndex(p.time):p.index;if(!Number.isFinite(idx))return null;return{x:this.indexToX(idx),y:this.priceToY(p.price),index:idx}}
  xyToData(x,y){if(x<0||x>this.plotRight||y<0||y>this.mainBottom)return null;const index=this.xToIndex(x);return{index,time:this.indexToTime(index),price:this.yToPrice(y)}}

  requestDraw(){if(this.needsDraw||this.destroyed)return;this.needsDraw=true;requestAnimationFrame(()=>{this.needsDraw=false;this.draw()})}
  draw(){
    if(this.destroyed||!this.ctx)return;this._layout();this._priceRange();
    const ctx=this.ctx,w=this.width,h=this.height,style=getComputedStyle(document.body),bg=style.getPropertyValue('--bg').trim()||'#0b0f14',border=style.getPropertyValue('--border').trim()||'#25303d',muted=style.getPropertyValue('--muted').trim()||'#8190a3',text=style.getPropertyValue('--text').trim()||'#e6edf3';
    ctx.clearRect(0,0,w,h);ctx.fillStyle=bg;ctx.fillRect(0,0,w,h);
    if(!this.bars.length){ctx.fillStyle=muted;ctx.font='12px system-ui';ctx.textAlign='center';ctx.fillText('No market data',w/2,h/2);ctx.textAlign='left';return}
    if(this.grid)this._drawGrid(ctx,border,muted);this._drawVolume(ctx);this._drawPriceSeries(ctx);this._drawOverlayIndicators(ctx);this._drawMarkers(ctx);this.drawings.render(ctx);this._drawOscillators(ctx,border,muted,text);this._drawAxes(ctx,border,muted,text);this._drawLastPrice(ctx);this._drawCrosshair(ctx,muted,text);
  }

  _drawGrid(ctx,border){
    ctx.save();ctx.strokeStyle=border;ctx.globalAlpha=.55;ctx.lineWidth=1;
    for(let i=1;i<6;i++)line(ctx,0,this.mainBottom*i/6,this.plotRight,this.mainBottom*i/6);
    const step=Math.max(5,Math.round(90/this.barSpacing)),{from,to}=this.visibleRange;
    for(let i=Math.ceil(from/step)*step;i<=to;i+=step){const x=this.indexToX(i);if(x>=0&&x<=this.plotRight)line(ctx,x,0,x,this.timeAxisY)}ctx.restore();
  }
  _drawVolume(ctx){
    if(!this.volume)return;const{from,to}=this.visibleRange,display=this._priceBars();let max=0;
    for(let i=from;i<=to&&i<this.displayLength;i++)max=Math.max(max,this.bars[i]?.volume||0);if(!max)return;
    const area=this.mainBottom*.18,base=this.mainBottom;
    for(let i=from;i<=to&&i<this.displayLength;i++){const raw=this.bars[i],b=display[i]||raw,x=this.indexToX(i),vh=(raw?.volume||0)/max*area;ctx.fillStyle=b.close>=b.open?'rgba(24,185,130,.28)':'rgba(240,82,82,.28)';ctx.fillRect(x-Math.max(1,this.barSpacing*.32),base-vh,Math.max(1,this.barSpacing*.64),vh)}
  }
  _drawPriceSeries(ctx){if(this.chartType==='line'||this.chartType==='area')return this._drawLineArea(ctx,this.chartType==='area');if(this.chartType==='bars')return this._drawBars(ctx);if(this.chartType==='heikin')return this._drawCandles(ctx,this._heikinBars());return this._drawCandles(ctx,this.bars)}
  _drawLineArea(ctx,area=false){
    const{from,to}=this.visibleRange;ctx.save();ctx.strokeStyle='#4c7dff';ctx.lineWidth=1.6;ctx.beginPath();let first=null,last=null;
    for(let i=from;i<=to&&i<this.displayLength;i++){const b=this.bars[i];if(!b)continue;const x=this.indexToX(i),y=this.priceToY(b.close);if(!first){first={x,y};ctx.moveTo(x,y)}else ctx.lineTo(x,y);last={x,y}}
    if(area&&first&&last){ctx.lineTo(last.x,this.mainBottom);ctx.lineTo(first.x,this.mainBottom);ctx.closePath();const g=ctx.createLinearGradient(0,0,0,this.mainBottom);g.addColorStop(0,'rgba(76,125,255,.28)');g.addColorStop(1,'rgba(76,125,255,.02)');ctx.fillStyle=g;ctx.fill();ctx.beginPath();let started=false;for(let i=from;i<=to&&i<this.displayLength;i++){const b=this.bars[i];if(!b)continue;const x=this.indexToX(i),y=this.priceToY(b.close);started?ctx.lineTo(x,y):(ctx.moveTo(x,y),started=true)}}ctx.stroke();ctx.restore();
  }
  _drawBars(ctx){
    const{from,to}=this.visibleRange,w=Math.max(2,Math.min(7,this.barSpacing*.45));
    for(let i=from;i<=to&&i<this.displayLength;i++){const b=this.bars[i];if(!b)continue;const x=this.indexToX(i),yo=this.priceToY(b.open),yc=this.priceToY(b.close),yh=this.priceToY(b.high),yl=this.priceToY(b.low),color=b.close>=b.open?'#18b982':'#f05252';ctx.strokeStyle=color;ctx.lineWidth=1;line(ctx,x,yh,x,yl);line(ctx,x-w,yo,x,yo);line(ctx,x,yc,x+w,yc)}
  }
  _drawCandles(ctx,source=this.bars){
    const{from,to}=this.visibleRange,body=Math.max(1,Math.min(12,this.barSpacing*.68));
    for(let i=from;i<=to&&i<this.displayLength;i++){const b=source[i];if(!b)continue;const x=this.indexToX(i),yo=this.priceToY(b.open),yc=this.priceToY(b.close),yh=this.priceToY(b.high),yl=this.priceToY(b.low),up=b.close>=b.open,color=up?'#18b982':'#f05252';ctx.strokeStyle=color;ctx.fillStyle=color;ctx.lineWidth=1;line(ctx,Math.round(x)+.5,yh,Math.round(x)+.5,yl);const top=Math.min(yo,yc),hh=Math.max(1,Math.abs(yc-yo));ctx.fillRect(x-body/2,top,body,hh)}
  }
  _drawGlyph(ctx,type,x,y,color,size=4){
    ctx.save();ctx.fillStyle=color;ctx.strokeStyle=color;ctx.lineWidth=1;
    if(type==='points'){ctx.beginPath();ctx.arc(x,y,size,0,Math.PI*2);ctx.fill();ctx.restore();return}
    ctx.beginPath();
    if(type==='triangleUp'){ctx.moveTo(x,y-size-2);ctx.lineTo(x-size-1,y+size);ctx.lineTo(x+size+1,y+size)}
    else{ctx.moveTo(x,y+size+2);ctx.lineTo(x-size-1,y-size);ctx.lineTo(x+size+1,y-size)}
    ctx.closePath();ctx.fill();ctx.restore();
  }
  _drawOverlayIndicators(ctx){
    let colorI=0;const{from,to}=this.visibleRange;
    for(const ind of this.computed.filter(x=>x.overlay&&!x.hidden))for(const s of ind.series){
      const color=s.color||PALETTE[colorI++%PALETTE.length],type=s.type||'line';
      if(type==='points'||type==='triangleUp'||type==='triangleDown'){for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(!Number.isFinite(v))continue;const x=this.indexToX(i),y=this.priceToY(v);if(Number.isFinite(y))this._drawGlyph(ctx,type,x,y,color,type==='points'?3:4)}continue}
      ctx.save();ctx.strokeStyle=color;ctx.lineWidth=1.25;ctx.beginPath();let started=false,px=0,py=0;
      for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(!Number.isFinite(v)){started=false;continue}const x=this.indexToX(i),y=this.priceToY(v);if(!Number.isFinite(y)){started=false;continue}if(!started){ctx.moveTo(x,y);started=true}else if(type==='step'){ctx.lineTo(x,py);ctx.lineTo(x,y)}else ctx.lineTo(x,y);px=x;py=y}
      ctx.stroke();ctx.restore();
    }
  }
  _drawMarkers(ctx){
    const{from,to}=this.visibleRange;ctx.save();ctx.font='9px system-ui';
    for(const m of this.markers||[]){const i=Number.isFinite(m.index)?m.index:this.findTimeIndex(m.time);if(i<from||i>to||i>=this.displayLength)continue;const b=this.bars[i],x=this.indexToX(i),isBuy=m.side==='long'||m.side==='buy',y=this.priceToY(isBuy?b.low:b.high)+(isBuy?12:-12),color=isBuy?'#18b982':'#f05252';ctx.fillStyle=color;ctx.beginPath();if(isBuy){ctx.moveTo(x,y-7);ctx.lineTo(x-5,y);ctx.lineTo(x+5,y)}else{ctx.moveTo(x,y+7);ctx.lineTo(x-5,y);ctx.lineTo(x+5,y)}ctx.closePath();ctx.fill();if(m.label){ctx.textAlign='center';ctx.fillText(m.label,x,y+(isBuy?11:-7))}}
    ctx.restore();
  }
  _drawOscillators(ctx,border,muted,text){
    let colorI=2;for(const pane of this.oscPanes){const{item,top,bottom}=pane,series=item.series;let min=item.scale?.min??Infinity,max=item.scale?.max??-Infinity;const{from,to}=this.visibleRange;
      if(!item.scale){for(const s of series)for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(Number.isFinite(v)){min=Math.min(min,v);max=Math.max(max,v)}}if(!Number.isFinite(min)||!Number.isFinite(max)||min===max){min=-1;max=1}else{const p=(max-min)*.12;min-=p;max+=p}}
      ctx.save();ctx.beginPath();ctx.rect(0,top,this.plotRight,bottom-top);ctx.clip();ctx.fillStyle='rgba(127,145,165,.035)';ctx.fillRect(0,top,this.plotRight,bottom-top);ctx.strokeStyle=border;ctx.globalAlpha=.9;line(ctx,0,top,this.width,top);
      for(const lvl of item.scale?.levels||[]){const y=bottom-(lvl-min)/(max-min)*(bottom-top);ctx.strokeStyle=border;ctx.setLineDash([3,4]);line(ctx,0,y,this.plotRight,y);ctx.setLineDash([]);ctx.fillStyle=muted;ctx.font='9px system-ui';ctx.fillText(String(lvl),3,y-2)}
      for(const s of series){const color=s.color||PALETTE[colorI++%PALETTE.length],type=s.type||'line';
        if(type==='histogram'){const zero=bottom-(0-min)/(max-min)*(bottom-top);for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(!Number.isFinite(v))continue;const x=this.indexToX(i),y=bottom-(v-min)/(max-min)*(bottom-top);ctx.fillStyle=v>=0?'rgba(24,185,130,.55)':'rgba(240,82,82,.55)';ctx.fillRect(x-this.barSpacing*.28,Math.min(zero,y),Math.max(1,this.barSpacing*.56),Math.max(1,Math.abs(y-zero)))}continue}
        if(type==='points'||type==='triangleUp'||type==='triangleDown'){for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(!Number.isFinite(v))continue;const x=this.indexToX(i),y=bottom-(v-min)/(max-min)*(bottom-top);this._drawGlyph(ctx,type,x,y,color,type==='points'?3:4)}continue}
        ctx.strokeStyle=color;ctx.lineWidth=1.15;ctx.beginPath();let started=false,py=0;for(let i=from;i<=to&&i<this.displayLength;i++){const v=s.values[i];if(!Number.isFinite(v)){started=false;continue}const x=this.indexToX(i),y=bottom-(v-min)/(max-min)*(bottom-top);if(!started){ctx.moveTo(x,y);started=true}else if(type==='step'){ctx.lineTo(x,py);ctx.lineTo(x,y)}else ctx.lineTo(x,y);py=y}ctx.stroke()}
      ctx.fillStyle=text;ctx.font='9px system-ui';ctx.fillText(item.name,5,top+11);ctx.restore();
    }
  }
  _drawAxes(ctx,border,muted){
    ctx.save();ctx.fillStyle=getComputedStyle(document.body).getPropertyValue('--panel').trim()||'#10161d';ctx.fillRect(this.plotRight,0,this.width-this.plotRight,this.height);ctx.fillRect(0,this.timeAxisY,this.plotRight,this.height-this.timeAxisY);ctx.strokeStyle=border;line(ctx,this.plotRight,0,this.plotRight,this.height);line(ctx,0,this.timeAxisY,this.width,this.timeAxisY);ctx.fillStyle=muted;ctx.font='10px system-ui';ctx.textAlign='left';
    for(let i=0;i<=6;i++){const y=this.mainBottom*i/6,v=this.priceMax-i/6*(this.priceMax-this.priceMin);ctx.fillText(this._formatScale(v),this.plotRight+5,y+3)}
    const{from,to}=this.visibleRange,step=Math.max(5,Math.round(90/this.barSpacing));ctx.textAlign='center';let prevDay=null;const intraday=!/[dwM]$/.test(this.timeframe);
    for(let i=Math.ceil(from/step)*step;i<=to;i+=step){const b=this.bars[i];if(!b)continue;const x=this.indexToX(i);if(x<28||x>this.plotRight-28)continue;const d=new Date(b.time),day=d.toDateString();ctx.fillText(intraday&&prevDay&&day!==prevDay?d.toLocaleDateString(undefined,{month:'short',day:'numeric'}):formatTimeAxis(b.time,this.timeframe),x,this.timeAxisY+14);prevDay=day}ctx.restore();
  }
  _drawLastPrice(ctx){
    const raw=this.bars[this.displayLength-1],display=this.getBarForDisplay(this.displayLength-1)||raw;if(!raw||!display)return;const y=this.priceToY(raw.close);if(!Number.isFinite(y))return;
    const color=display.close>=display.open?'#18b982':'#f05252',actualY=y,labelValue=this._toScale(raw.close),label=(this.scaleMode==='percent'||this.scaleMode==='indexed')?this._formatScale(labelValue):formatPrice(raw.close),labelW=Math.max(this.width-this.plotRight,ctx.measureText?.(label)?.width+14||60),top=Math.max(0,Math.min(this.mainBottom-18,y-9));
    ctx.save();ctx.strokeStyle=color;ctx.globalAlpha=.7;ctx.setLineDash([2,3]);line(ctx,0,clamp(y,0,this.mainBottom),this.plotRight,clamp(y,0,this.mainBottom));ctx.setLineDash([]);ctx.globalAlpha=1;ctx.font='bold 10px system-ui';ctx.textAlign='left';ctx.fillStyle=color;ctx.fillRect(this.plotRight,top,labelW,18);ctx.fillStyle='#fff';ctx.fillText(label,this.plotRight+5,top+12);if(actualY<0||actualY>this.mainBottom){ctx.beginPath();const ax=this.plotRight+2,cy=top+9;if(actualY<0){ctx.moveTo(ax,cy+4);ctx.lineTo(ax+5,cy-3);ctx.lineTo(ax+10,cy+4)}else{ctx.moveTo(ax,cy-4);ctx.lineTo(ax+5,cy+3);ctx.lineTo(ax+10,cy-4)}ctx.fillStyle='#fff';ctx.fill()}ctx.restore();
  }
  _drawCrosshair(ctx,muted){
    const ch=this.externalCrosshair||this.crosshair;if(!ch)return;const i=Number.isFinite(ch.index)?ch.index:this.findTimeIndex(ch.time);if(i<0||i>=this.displayLength)return;
    const x=this.indexToX(i),bar=this.getBarForDisplay(i)||this.bars[i],raw=this.bars[i],y=this.externalCrosshair?this.priceToY(raw.close):clamp(ch.y,0,this.mainBottom);if(x<0||x>this.plotRight)return;
    ctx.save();ctx.strokeStyle=muted;ctx.globalAlpha=.72;ctx.setLineDash([4,4]);line(ctx,x,0,x,this.timeAxisY);line(ctx,0,y,this.plotRight,y);ctx.setLineDash([]);ctx.globalAlpha=1;ctx.font='10px system-ui';
    const scaleValue=this.priceMax-y/Math.max(1,this.mainBottom)*(this.priceMax-this.priceMin),pt=this._formatScale(scaleValue),tw=ctx.measureText(pt).width+10;ctx.fillStyle='#2d3b4d';ctx.fillRect(this.plotRight,y-9,Math.max(tw,this.width-this.plotRight),18);ctx.fillStyle='#fff';ctx.fillText(pt,this.plotRight+5,y+3);
    const tt=formatDate(raw.time),ww=ctx.measureText(tt).width+10;ctx.fillStyle='#2d3b4d';ctx.fillRect(clamp(x-ww/2,0,this.plotRight-ww),this.timeAxisY,ww,18);ctx.fillStyle='#fff';ctx.textAlign='center';ctx.fillText(tt,clamp(x,ww/2,this.plotRight-ww/2),this.timeAxisY+12);ctx.restore();
  }

  _eventXY(e){const r=this.canvas.getBoundingClientRect();return{x:e.clientX-r.left,y:e.clientY-r.top}}
  _axisAt(p){if(p.x>this.plotRight&&p.y<this.mainBottom)return'price';if(p.y>=this.timeAxisY&&p.x<=this.plotRight)return'time';return null}
  _doubleClick(e){const p=this._eventXY(e),axis=this._axisAt(p);if(axis==='price')this.resetPriceScale();else if(axis==='time')this.fitContent();else this.fitContent()}
  _pointerDown(e){
    this.canvas.setPointerCapture?.(e.pointerId);const p=this._eventXY(e);this.pointers.set(e.pointerId,p);
    if(this.pointers.size===2){const[a,b]=[...this.pointers.values()];this.pinch={d:Math.hypot(a.x-b.x,a.y-b.y)||1,spacing:this.barSpacing};this.dragPan=null;this.timeScaleDrag=null;this.drawings.drag=null;e.preventDefault();return}
    const axis=this._axisAt(p);
    if(axis==='price'){
      this._priceRange();this.priceDrag={y:e.clientY,zoom:this.priceZoom,frozen:this.frozen&&{...this.frozen},range:{lo:this.priceMin,hi:this.priceMax}};this.autoScale=false;if(!this.frozen)this.frozen={lo:this.priceMin,hi:this.priceMax};this.canvas.style.cursor='ns-resize';e.preventDefault();return;
    }
    if(axis==='time'){
      const anchorIndex=this.xToIndex(p.x);this.timeScaleDrag={x:e.clientX,spacing:this.barSpacing,anchorX:p.x,anchorIndex};this.canvas.style.cursor='ew-resize';e.preventDefault();return;
    }
    if(this.drawings.onPointerDown(p)){e.preventDefault();return}
    if(this.drawings.tool!=='cursor')return;
    this.dragPan={x:e.clientX,y:e.clientY,viewEnd:this.viewEnd??(this.displayLength-1+this.rightPadBars),frozen:this.frozen&&{...this.frozen}};this.canvas.style.cursor='grabbing';e.preventDefault();
  }
  _pointerMove(e){
    const p=this._eventXY(e);if(this.pointers.has(e.pointerId))this.pointers.set(e.pointerId,p);
    if(this.pinch&&this.pointers.size>=2){const[a,b]=[...this.pointers.values()],d=Math.hypot(a.x-b.x,a.y-b.y);this.barSpacing=clamp(this.pinch.spacing*d/this.pinch.d,.5,60);this.requestDraw();e.preventDefault();return}
    if(this.timeScaleDrag){const d=this.timeScaleDrag,dx=e.clientX-d.x,factor=Math.pow(2,dx/170);this.barSpacing=clamp(d.spacing*factor,.5,60);this.viewEnd=d.anchorIndex+(this.plotRight-d.anchorX-this.barSpacing/2)/this.barSpacing;this.viewEnd=clamp(this.viewEnd,5,this.displayLength-1+200);this.requestDraw();this._checkHistory();return}
    if(this.priceDrag){const pd=this.priceDrag,f=Math.exp((e.clientY-pd.y)/180),src=pd.frozen||pd.range,c=(src.lo+src.hi)/2,h=(src.hi-src.lo)/2*f;this.frozen={lo:c-h,hi:c+h};this.requestDraw();return}
    if(this.drawings.onPointerMove(p)){e.preventDefault();return}
    if(this.dragPan){const dx=e.clientX-this.dragPan.x;this.viewEnd=clamp(this.dragPan.viewEnd-dx/this.barSpacing,5,this.displayLength-1+200);const fz=this.dragPan.frozen;if(!this.autoScale&&fz){const dy=(e.clientY-this.dragPan.y)/Math.max(1,this.mainBottom)*(fz.hi-fz.lo);this.frozen={lo:fz.lo+dy,hi:fz.hi+dy}}this.requestDraw();this._checkHistory();return}
    const axis=this._axisAt(p);this.canvas.style.cursor=axis==='price'?'ns-resize':axis==='time'?'ew-resize':'crosshair';
    if(p.x<=this.plotRight&&p.y<=this.timeAxisY){const idx=clamp(Math.round(this.xToIndex(p.x)),0,Math.max(0,this.displayLength-1)),raw=this.bars[idx],bar=this.getBarForDisplay(idx)||raw;this.crosshair={x:p.x,y:p.y,index:idx,time:raw?.time};this.emit('crosshair',this.crosshair);if(bar)this.emit('hover',{bar,index:idx,price:this.yToPrice(clamp(p.y,0,this.mainBottom))});this.requestDraw()}
    else if(this.crosshair){this.crosshair=null;this.emit('crosshair',null);this.requestDraw()}
  }
  _pointerUp(e){
    this.pointers.delete(e.pointerId);if(this.pointers.size<2)this.pinch=null;this.priceDrag=null;this.timeScaleDrag=null;this.drawings.onPointerUp();this.dragPan=null;this.canvas.style.cursor='crosshair';try{this.canvas.releasePointerCapture?.(e.pointerId)}catch{}
  }
  _wheel(e){
    e.preventDefault();const p=this._eventXY(e),axis=this._axisAt(p);
    if(axis==='price'){this.autoScale=false;if(!this.frozen){this._priceRange();this.frozen={lo:this.priceMin,hi:this.priceMax}}const c=(this.frozen.lo+this.frozen.hi)/2,h=(this.frozen.hi-this.frozen.lo)/2*(e.deltaY<0?.9:1.1);this.frozen={lo:c-h,hi:c+h};this.requestDraw();return}
    if(e.shiftKey||Math.abs(e.deltaX)>Math.abs(e.deltaY)){this.panBy((e.deltaX||e.deltaY)/this.barSpacing);return}
    this.zoomBy(e.deltaY<0?1.12:1/1.12,p.x);
  }

  setExternalCrosshair(time){if(time==null)this.externalCrosshair=null;else this.externalCrosshair={time,index:this.findTimeIndex(time)};this.requestDraw()}
  exportImage(){const name=`${this.symbol}-${this.timeframe}.png`;if(this.canvas.toBlob)this.canvas.toBlob(blob=>blob&&saveBlob(name,blob),'image/png');else{const a=document.createElement('a');a.download=name;a.href=this.canvas.toDataURL('image/png');a.click()}}
}

function line(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function formatTimeAxis(ms,tf){const d=new Date(ms);if(/[dwM]$/.test(tf))return d.toLocaleDateString(undefined,{month:'short',day:'numeric'});return d.toLocaleTimeString(undefined,{hour:'2-digit',minute:'2-digit',hour12:false})}
