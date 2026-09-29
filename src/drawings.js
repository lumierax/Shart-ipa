import {uid,deepClone,clamp,formatPrice} from './utils.js';

const FIB=[-0.618,-0.272,0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.414,1.618,2,2.618,3.618,4.236];
const FIB_EXT=[0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2,2.618];
const FIB_CHANNEL=[0,0.236,0.382,0.5,0.618,0.786,1,1.272,1.618,2];
const HIT=7;
const TOOL_POINTS={horizontal:1,horizontalRay:1,vertical:1,text:1,trend:2,ray:2,extended:2,rectangle:2,fib:2,measure:2,long:2,short:2,channel:3,fibExtension:3,fibChannel:3,pitchfork:3,schiff:3,modifiedSchiff:3};

export function positionMetrics(item,type){
  const entry=Number(item?.points?.[0]?.price),stop=Number(item?.points?.[1]?.price),risk=Math.abs(entry-stop),rr=Math.max(.05,Number(item?.rr)||2);
  const target=type==='long'?entry+risk*rr:entry-risk*rr,riskPct=entry?risk/Math.abs(entry)*100:0,reward=Math.abs(target-entry),rewardPct=entry?reward/Math.abs(entry)*100:0;
  return{entry,stop,target,risk,reward,rr,riskPct,rewardPct};
}

export class DrawingManager{
  constructor(chart){
    this.chart=chart;this.items=[];this.tool='cursor';this.pending=null;this.selected=null;this.drag=null;this.magnet=false;
    this.undoStack=[];this.redoStack=[];this.onChange=null;this.onSelection=null;this.onToolDone=null;this.selectionActions=[];
  }
  setTool(t){this.tool=t;this.pending=null;this.selectionActions=[];this.chart.requestDraw()}
  _done(){this.tool='cursor';this.pending=null;this.onToolDone?.();this.chart.requestDraw()}
  cancel(){this.pending=null;this._setSelected(null);this._done()}
  setItems(items=[]){this.items=deepClone(items).map(x=>this._normalizeItem(x));this._setSelected(null);this._changed(false)}
  serialize(){return deepClone(this.items)}
  _normalizeItem(item){
    const x={...item,points:(item.points||[]).map(p=>({...p})),locked:!!item.locked,hidden:!!item.hidden};
    if(['long','short'].includes(x.type)){x.rr=Math.max(.05,Number(x.rr)||2);if(!Number.isFinite(x.endIndex))x.endIndex=Math.max(Number(x.points?.[1]?.index)||0,(Number(x.points?.[0]?.index)||0)+18)}
    return x;
  }
  snapshot(){this.undoStack.push(deepClone(this.items));if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[]}
  undo(){if(!this.undoStack.length)return;this.redoStack.push(deepClone(this.items));this.items=this.undoStack.pop();this._setSelected(null);this._changed()}
  redo(){if(!this.redoStack.length)return;this.undoStack.push(deepClone(this.items));this.items=this.redoStack.pop();this._setSelected(null);this._changed()}
  delete(id=this.selected){if(!id)return;this.snapshot();this.items=this.items.filter(x=>x.id!==id);if(this.selected===id)this._setSelected(null);this._changed()}
  deleteSelected(){this.delete(this.selected)}
  duplicateSelected(){const src=this.items.find(x=>x.id===this.selected);if(!src)return;this.snapshot();const c=deepClone(src);c.id=uid('draw');c.createdAt=Date.now();c.points=c.points.map(p=>this._shiftPoint(p,3,0));if(Number.isFinite(c.endIndex))c.endIndex+=3;this.items.push(c);this._setSelected(c.id);this._changed()}
  toggleLock(id=this.selected){const x=this.items.find(i=>i.id===id);if(!x)return;this.snapshot();x.locked=!x.locked;this._changed()}
  toggleLockSelected(){this.toggleLock(this.selected)}
  toggleVisibility(id){const x=this.items.find(i=>i.id===id);if(!x)return;this.snapshot();x.hidden=!x.hidden;if(x.hidden&&this.selected===id)this._setSelected(null);this._changed()}
  setSelectedRR(rr){const x=this.items.find(i=>i.id===this.selected);if(!x||!['long','short'].includes(x.type))return;this.snapshot();x.rr=clamp(Number(rr)||2,.05,100);this._changed()}
  select(id){this._setSelected(id&&this.items.some(x=>x.id===id)?id:null);this.chart.requestDraw()}
  _setSelected(id){if(this.selected===id)return;this.selected=id;this.selectionActions=[];this.onSelection?.(id)}
  _changed(persist=true){this.chart.requestDraw();if(persist)this.onChange?.(this.serialize())}
  _shiftPoint(p,di,dp){const idx=(Number(p.index)||this.chart.timeToIndex(p.time))+di;return{...p,index:idx,time:this.chart.indexToTime(idx),price:Number(p.price)+dp}}

  pointFromXY(x,y){
    let p=this.chart.xyToData(x,y);if(this.magnet&&p){const i=clamp(Math.round(p.index),0,this.chart.bars.length-1),b=this.chart.bars[i];if(b){const vals=[b.open,b.high,b.low,b.close],nearest=vals.reduce((a,v)=>Math.abs(v-p.price)<Math.abs(a-p.price)?v:a,vals[0]);p={...p,index:i,time:b.time,price:nearest}}}return p;
  }
  _actionAt(x,y){return this.selectionActions.find(a=>x>=a.x&&x<=a.x+a.w&&y>=a.y&&y<=a.y+a.h)||null}

  onPointerDown(e){
    const{x,y}=e;
    if(this.tool==='cursor'){
      const action=this._actionAt(x,y);if(action){this._runAction(action);return true}
      const hit=this.hitTest(x,y);if(hit){this._setSelected(hit.id);const handle=this.hitHandle(hit,x,y);if(!hit.locked&&handle){this.snapshot();this.drag={id:hit.id,mode:'handle',handle};return true}if(!hit.locked){const p=this.pointFromXY(x,y);if(p){this.snapshot();this.drag={id:hit.id,mode:'move',start:p,points:deepClone(hit.points),endIndex:hit.endIndex};return true}}this.chart.requestDraw();return true}
      this._setSelected(null);this.chart.requestDraw();return false;
    }
    const p=this.pointFromXY(x,y);if(!p)return false;const need=TOOL_POINTS[this.tool]||2;
    if(need===1){this.snapshot();const item=this._normalizeItem({id:uid('draw'),type:this.tool,points:[p],text:this.tool==='text'?'Note':'',createdAt:Date.now()});if(this.tool==='text'){const t=prompt('Text');if(t===null)return true;item.text=t||'Note'}this.items.push(item);this._setSelected(item.id);this._changed();this._done();return true}
    if(!this.pending){this.pending={type:this.tool,points:[p]};this.chart.requestDraw();return true}
    if(this.pending.points.length<need-1){this.pending.points.push(p);this.pending.preview=null;this.chart.requestDraw();return true}
    this.snapshot();const points=[...this.pending.points,p],item=this._normalizeItem({id:uid('draw'),type:this.tool,points,createdAt:Date.now(),rr:2,endIndex:p.index});this.items.push(item);this.pending=null;this._setSelected(item.id);this._changed();this._done();return true;
  }
  _runAction(a){if(a.action==='delete')this.deleteSelected();else if(a.action==='duplicate')this.duplicateSelected();else if(a.action==='lock')this.toggleLockSelected();else if(a.action==='hide')this.toggleVisibility(this.selected);else if(a.action==='rr')this.setSelectedRR(a.value)}
  onPointerMove(e){
    if(this.drag){const item=this.items.find(x=>x.id===this.drag.id),p=this.pointFromXY(e.x,e.y);if(!item||!p)return true;if(this.drag.mode==='move'){const di=p.index-this.drag.start.index,dp=p.price-this.drag.start.price;item.points=this.drag.points.map(op=>this._shiftPoint(op,di,dp));if(Number.isFinite(this.drag.endIndex))item.endIndex=this.drag.endIndex+di}else this._applyHandle(item,this.drag.handle,p);this._changed(false);return true}
    if(this.pending){this.pending.preview=this.pointFromXY(e.x,e.y);this.chart.requestDraw();return true}return false;
  }
  _applyHandle(item,h,p){
    if(h.kind==='point')item.points[h.index]=p;
    else if(h.kind==='position-stop')item.points[1]={...item.points[1],price:p.price};
    else if(h.kind==='position-entry')item.points[0]={...item.points[0],price:p.price,index:p.index,time:p.time};
    else if(h.kind==='position-target'){const entry=Number(item.points[0].price),stop=Number(item.points[1].price),risk=Math.abs(entry-stop);if(risk>0){const reward=item.type==='long'?p.price-entry:entry-p.price;item.rr=clamp(Math.abs(reward)/risk,.05,100)}}
    else if(h.kind==='position-end')item.endIndex=Math.max(Number(item.points[0].index)+1,p.index);
  }
  onPointerUp(){if(this.drag){this.drag=null;this._changed();return true}return false}

  hitHandle(item,x,y){
    if(['long','short'].includes(item.type)&&item.points[1]){const g=this._positionGeometry(item);if(g){const hs=[['position-entry',g.x1,g.yE],['position-stop',g.x2,g.yS],['position-target',g.x2,g.yT],['position-end',g.x2,g.yE]];for(const[k,hx,hy]of hs)if(Math.hypot(hx-x,hy-y)<10)return{kind:k}}return null}
    for(let i=0;i<item.points.length;i++){const p=this.chart.dataToXY(item.points[i]);if(p&&Math.hypot(p.x-x,p.y-y)<9)return{kind:'point',index:i}}return null;
  }
  hitTest(x,y){
    for(let k=this.items.length-1;k>=0;k--){const it=this.items[k];if(it.hidden)continue;const pts=it.points.map(p=>this.chart.dataToXY(p)).filter(Boolean);if(!pts.length)continue;if(this.hitHandle(it,x,y))return it;
      if(it.type==='horizontal'&&Math.abs(y-pts[0].y)<HIT)return it;
      if(it.type==='horizontalRay'&&x>=pts[0].x-HIT&&Math.abs(y-pts[0].y)<HIT)return it;
      if(it.type==='vertical'&&Math.abs(x-pts[0].x)<HIT)return it;
      if(it.type==='trend'&&pts[1]&&distLine(x,y,pts[0].x,pts[0].y,pts[1].x,pts[1].y)<HIT)return it;
      if(it.type==='ray'&&pts[1]&&distRay(x,y,pts[0].x,pts[0].y,pts[1].x,pts[1].y)<HIT)return it;
      if(it.type==='extended'&&pts[1]&&distInfinite(x,y,pts[0].x,pts[0].y,pts[1].x,pts[1].y)<HIT)return it;
      if(it.type==='measure'&&pts[1]&&distLine(x,y,pts[0].x,pts[0].y,pts[1].x,pts[1].y)<HIT)return it;
      if(['long','short'].includes(it.type)){const g=this._positionGeometry(it);if(g&&x>=Math.min(g.x1,g.x2)-5&&x<=Math.max(g.x1,g.x2)+5&&y>=Math.min(g.yT,g.yS)-8&&y<=Math.max(g.yT,g.yS)+8)return it}
      if(['rectangle','fib'].includes(it.type)&&pts[1]){const[a,b]=pts;if(x>=Math.min(a.x,b.x)-5&&x<=Math.max(a.x,b.x)+5&&y>=Math.min(a.y,b.y)-8&&y<=Math.max(a.y,b.y)+8)return it}
      if(['channel','fibChannel'].includes(it.type)&&pts[1]&&pts[2]){const q=channelGeometry(pts[0],pts[1],pts[2],this.chart.plotRight);if(distInfinite(x,y,q.a0.x,q.a0.y,q.a1.x,q.a1.y)<HIT||distInfinite(x,y,q.b0.x,q.b0.y,q.b1.x,q.b1.y)<HIT)return it}
      if(['pitchfork','schiff','modifiedSchiff'].includes(it.type)&&pts[1]&&pts[2]){const g=pitchforkGeometry(pts[0],pts[1],pts[2],it.type,this.chart.plotRight);if([g.median,g.upper,g.lower].some(l=>distRay(x,y,l[0].x,l[0].y,l[1].x,l[1].y)<HIT))return it}
      if(it.type==='fibExtension'&&pts[2]){const minX=Math.min(...pts.map(p=>p.x));if(x>=minX-5)return it}
      if(it.type==='text'&&Math.hypot(x-pts[0].x,y-pts[0].y)<30)return it;
    }return null;
  }

  render(ctx){
    this.selectionActions=[];for(const item of this.items)if(!item.hidden)this.renderItem(ctx,item,item.id===this.selected);
    if(this.pending?.preview){const points=[...this.pending.points,this.pending.preview],tmp={id:'pending',type:this.pending.type,points,rr:2,endIndex:this.pending.preview.index};this.renderItem(ctx,tmp,false,true)}
    if(this.selected){const item=this.items.find(x=>x.id===this.selected&&!x.hidden);if(item)this.renderSelectionToolbar(ctx,item)}
  }
  renderSelectionToolbar(ctx,item){
    const pts=item.points.map(p=>this.chart.dataToXY(p)).filter(Boolean);if(!pts.length)return;const isPos=['long','short'].includes(item.type),buttons=isPos?[{action:'rr',value:1,label:'1R'},{action:'rr',value:1.5,label:'1.5R'},{action:'rr',value:2,label:'2R'},{action:'rr',value:3,label:'3R'}]:[];
    buttons.push({action:'duplicate',label:'⧉'},{action:'lock',label:item.locked?'🔒':'🔓'},{action:'hide',label:'◉'},{action:'delete',label:'×',danger:true});
    const bw=32,gap=3,h=27,w=buttons.length*bw+(buttons.length-1)*gap+8;let x0=Math.min(this.chart.plotRight-w-4,Math.max(4,Math.min(...pts.map(p=>p.x)))),y0=Math.max(4,Math.min(...pts.map(p=>p.y))-35);
    ctx.save();ctx.fillStyle='rgba(11,15,20,.96)';ctx.strokeStyle='rgba(129,144,163,.55)';roundRect(ctx,x0,y0,w,h,6);ctx.fill();ctx.stroke();let x=x0+4;ctx.font='600 10px system-ui';ctx.textAlign='center';ctx.textBaseline='middle';
    for(const b of buttons){ctx.fillStyle=b.danger?'rgba(240,82,82,.14)':'rgba(129,144,163,.08)';roundRect(ctx,x,y0+3,bw,h-6,4);ctx.fill();ctx.fillStyle=b.danger?'#f05252':'#d7e0ea';ctx.fillText(b.label,x+bw/2,y0+h/2);this.selectionActions.push({x,y:y0+3,w:bw,h:h-6,...b});x+=bw+gap}ctx.restore();
  }
  renderItem(ctx,item,selected=false,preview=false){
    const c=this.chart,pts=item.points.map(p=>c.dataToXY(p));if(!pts[0])return;const accent=selected?'#4c7dff':'#7d8da3';ctx.save();ctx.lineWidth=selected?1.6:1;ctx.strokeStyle=accent;ctx.fillStyle=accent;ctx.setLineDash(preview?[4,4]:[]);const[a,b,d]=pts;
    switch(item.type){
      case'horizontal':line(ctx,0,a.y,c.plotRight,a.y);break;
      case'horizontalRay':line(ctx,a.x,a.y,c.plotRight,a.y);break;
      case'vertical':line(ctx,a.x,0,a.x,c.height);break;
      case'trend':if(b)line(ctx,a.x,a.y,b.x,b.y);break;
      case'ray':if(b)drawRay(ctx,a,b,c.plotRight,c.mainBottom);break;
      case'extended':if(b)drawExtended(ctx,a,b,c.plotRight,c.mainBottom);break;
      case'rectangle':if(b){ctx.fillStyle='rgba(76,125,255,.08)';ctx.fillRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y));ctx.strokeRect(Math.min(a.x,b.x),Math.min(a.y,b.y),Math.abs(b.x-a.x),Math.abs(b.y-a.y))}break;
      case'fib':if(b)this.drawFib(ctx,item,a,b);break;
      case'fibExtension':if(b&&d)this.drawFibExtension(ctx,item,a,b,d);break;
      case'channel':if(b&&d)this.drawChannel(ctx,a,b,d,false);break;
      case'fibChannel':if(b&&d)this.drawFibChannel(ctx,a,b,d);break;
      case'pitchfork':case'schiff':case'modifiedSchiff':if(b&&d)this.drawPitchfork(ctx,a,b,d,item.type);break;
      case'measure':if(b)this.drawMeasure(ctx,item,a,b);break;
      case'long':case'short':if(b)this.drawPosition(ctx,item,item.type,selected);break;
      case'text':ctx.font='12px system-ui';ctx.fillText(item.text||'Text',a.x+5,a.y-5);break;
    }
    if(selected&&!['long','short'].includes(item.type)&&!item.locked){ctx.setLineDash([]);for(const p of pts.filter(Boolean))drawHandle(ctx,p.x,p.y,'#2962ff')}
    ctx.restore();
  }
  drawFib(ctx,item,a,b){const p0=item.points[0].price,p1=item.points[1].price,x1=Math.min(a.x,b.x);ctx.font='10px system-ui';for(const r of FIB){const price=p0+(p1-p0)*r,y=this.chart.priceToY(price);if(!Number.isFinite(y)||y<0||y>this.chart.mainBottom)continue;ctx.strokeStyle=[.5,.618,1,1.618].includes(r)?'#d7a600':'#60738a';ctx.globalAlpha=.82;line(ctx,x1,y,this.chart.plotRight,y);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(`${trimFib(r)}  ${formatPrice(price)}`,x1+4,y-3)}ctx.globalAlpha=1}
  drawFibExtension(ctx,item,a,b,d){const p0=item.points[0].price,p1=item.points[1].price,p2=item.points[2].price,delta=p1-p0,x1=d.x;ctx.font='10px system-ui';ctx.strokeStyle='#60738a';line(ctx,a.x,a.y,b.x,b.y);line(ctx,b.x,b.y,d.x,d.y);for(const r of FIB_EXT){const price=p2+delta*r,y=this.chart.priceToY(price);if(!Number.isFinite(y)||y<0||y>this.chart.mainBottom)continue;ctx.strokeStyle=[.618,1,1.618,2.618].includes(r)?'#d7a600':'#60738a';line(ctx,x1,y,this.chart.plotRight,y);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(`${trimFib(r)}  ${formatPrice(price)}`,x1+4,y-3)}}
  drawChannel(ctx,a,b,d,fill=true){const g=channelGeometry(a,b,d,this.chart.plotRight);ctx.strokeStyle='#60738a';line(ctx,g.a0.x,g.a0.y,g.a1.x,g.a1.y);line(ctx,g.b0.x,g.b0.y,g.b1.x,g.b1.y);if(fill){ctx.fillStyle='rgba(76,125,255,.06)';ctx.beginPath();ctx.moveTo(g.a0.x,g.a0.y);ctx.lineTo(g.a1.x,g.a1.y);ctx.lineTo(g.b1.x,g.b1.y);ctx.lineTo(g.b0.x,g.b0.y);ctx.closePath();ctx.fill()}}
  drawFibChannel(ctx,a,b,d){const g=channelGeometry(a,b,d,this.chart.plotRight),offX=g.b0.x-g.a0.x,offY=g.b0.y-g.a0.y;ctx.font='10px system-ui';for(const r of FIB_CHANNEL){const a0={x:g.a0.x+offX*r,y:g.a0.y+offY*r},a1={x:g.a1.x+offX*r,y:g.a1.y+offY*r};ctx.strokeStyle=[.5,.618,1].includes(r)?'#d7a600':'#60738a';line(ctx,a0.x,a0.y,a1.x,a1.y);ctx.fillStyle=ctx.strokeStyle;ctx.fillText(trimFib(r),clamp(a0.x+5,4,this.chart.plotRight-30),clamp(a0.y-3,10,this.chart.mainBottom-3))}}
  drawPitchfork(ctx,a,b,d,type){const g=pitchforkGeometry(a,b,d,type,this.chart.plotRight);ctx.strokeStyle='#60738a';line(ctx,g.median[0].x,g.median[0].y,g.median[1].x,g.median[1].y);ctx.strokeStyle='#7d8da3';line(ctx,g.upper[0].x,g.upper[0].y,g.upper[1].x,g.upper[1].y);line(ctx,g.lower[0].x,g.lower[0].y,g.lower[1].x,g.lower[1].y);ctx.fillStyle='rgba(76,125,255,.045)';ctx.beginPath();ctx.moveTo(g.upper[0].x,g.upper[0].y);ctx.lineTo(g.upper[1].x,g.upper[1].y);ctx.lineTo(g.lower[1].x,g.lower[1].y);ctx.lineTo(g.lower[0].x,g.lower[0].y);ctx.closePath();ctx.fill()}
  drawMeasure(ctx,item,a,b){line(ctx,a.x,a.y,b.x,b.y);const p0=item.points[0].price,p1=item.points[1].price,pct=(p1/p0-1)*100,bars=Math.abs(Math.round(item.points[1].index-item.points[0].index)),txt=`${pct>=0?'+':''}${pct.toFixed(2)}% • ${bars} bars • ${formatPrice(p1-p0)}`;label(ctx,txt,(a.x+b.x)/2,(a.y+b.y)/2,pct>=0?'#148f68':'#bd4545')}
  _positionGeometry(item){if(!item.points?.[1])return null;const m=positionMetrics(item,item.type);if(!Number.isFinite(m.entry)||!Number.isFinite(m.stop)||!Number.isFinite(m.target))return null;const start=Number(item.points[0].index)||0,end=Math.max(start+1,Number.isFinite(item.endIndex)?item.endIndex:(Number(item.points[1].index)||start+18));return{...m,x1:this.chart.indexToX(start),x2:this.chart.indexToX(end),yE:this.chart.priceToY(m.entry),yS:this.chart.priceToY(m.stop),yT:this.chart.priceToY(m.target),start,end}}
  drawPosition(ctx,item,type,selected=false){const g=this._positionGeometry(item);if(!g)return;const{x1,x2,yE,yS,yT,entry,stop,target,rr,riskPct,rewardPct,risk,reward}=g,left=Math.min(x1,x2),right=Math.max(x1,x2),width=Math.max(4,right-left),green='#18b982',red='#f05252';ctx.save();ctx.setLineDash([]);ctx.fillStyle='rgba(24,185,130,.14)';ctx.fillRect(left,Math.min(yE,yT),width,Math.abs(yT-yE));ctx.fillStyle='rgba(240,82,82,.14)';ctx.fillRect(left,Math.min(yE,yS),width,Math.abs(yS-yE));ctx.strokeStyle='rgba(24,185,130,.82)';line(ctx,left,yT,right,yT);ctx.strokeStyle='rgba(240,82,82,.86)';line(ctx,left,yS,right,yS);ctx.strokeStyle='rgba(230,237,243,.88)';ctx.setLineDash([4,3]);line(ctx,left,yE,right,yE);ctx.setLineDash([]);smartLabel(ctx,`Target ${formatPrice(target)}  +${rewardPct.toFixed(2)}%  (${formatPrice(reward)})`,left+5,clamp(Math.min(yE,yT)+16,16,this.chart.mainBottom-10),green,right-left-10);smartLabel(ctx,`Entry ${formatPrice(entry)}   R:R ${rr.toFixed(2)}:1`,left+5,clamp(yE-7,14,this.chart.mainBottom-6),'#263446',right-left-10);smartLabel(ctx,`Stop ${formatPrice(stop)}  -${riskPct.toFixed(2)}%  (${formatPrice(risk)})`,left+5,clamp(Math.max(yE,yS)-5,14,this.chart.mainBottom-6),red,right-left-10);if(selected&&!item.locked){drawHandle(ctx,x1,yE,'#dce5ef');drawHandle(ctx,x2,yS,red);drawHandle(ctx,x2,yT,green);drawHandle(ctx,x2,yE,'#4c7dff',true)}ctx.restore()}
}

function trimFib(r){return r.toFixed(3).replace(/0+$/,'').replace(/\.$/,'')}
function line(ctx,x1,y1,x2,y2){ctx.beginPath();ctx.moveTo(x1,y1);ctx.lineTo(x2,y2);ctx.stroke()}
function drawRay(ctx,a,b,plotRight,mainBottom){const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)<.001){line(ctx,a.x,a.y,a.x,dy>=0?mainBottom:0);return}const t=dx>0?(plotRight-a.x)/dx:(0-a.x)/dx,scale=Math.max(1,t);line(ctx,a.x,a.y,a.x+dx*scale,a.y+dy*scale)}
function drawExtended(ctx,a,b,plotRight,mainBottom){const dx=b.x-a.x,dy=b.y-a.y;if(Math.abs(dx)<.001){line(ctx,a.x,0,a.x,mainBottom);return}const t0=(0-a.x)/dx,t1=(plotRight-a.x)/dx;line(ctx,a.x+dx*t0,a.y+dy*t0,a.x+dx*t1,a.y+dy*t1)}
function channelGeometry(a,b,c,plotRight){const dx=b.x-a.x||1,dy=b.y-a.y,t0=(0-a.x)/dx,t1=(plotRight-a.x)/dx,a0={x:a.x+dx*t0,y:a.y+dy*t0},a1={x:a.x+dx*t1,y:a.y+dy*t1},offY=c.y-(a.y+(c.x-a.x)*dy/dx),b0={x:a0.x,y:a0.y+offY},b1={x:a1.x,y:a1.y+offY};return{a0,a1,b0,b1}}
function pitchforkGeometry(a,b,c,type,plotRight){let origin={...a};if(type==='schiff')origin={x:a.x,y:(a.y+b.y)/2};else if(type==='modifiedSchiff')origin={x:(a.x+b.x)/2,y:(a.y+b.y)/2};const mid={x:(b.x+c.x)/2,y:(b.y+c.y)/2},dx=mid.x-origin.x||1,dy=mid.y-origin.y,extend=(p)=>{const t=Math.max(1,(plotRight-p.x)/dx);return[p,{x:p.x+dx*t,y:p.y+dy*t}]};return{median:extend(origin),upper:extend(b),lower:extend(c)}}
function label(ctx,text,x,y,bg){ctx.save();ctx.font='10px system-ui';const w=ctx.measureText(text).width+10;ctx.fillStyle=bg;ctx.globalAlpha=.92;ctx.fillRect(x,y-13,w,17);ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.fillText(text,x+5,y);ctx.restore()}
function smartLabel(ctx,text,x,y,bg,maxWidth=Infinity){ctx.save();ctx.font='600 10px system-ui';let shown=text,w=ctx.measureText(shown).width+10;if(Number.isFinite(maxWidth)&&maxWidth>35&&w>maxWidth){while(shown.length>8&&ctx.measureText(shown+'…').width+10>maxWidth)shown=shown.slice(0,-1);shown+='…';w=Math.min(maxWidth,ctx.measureText(shown).width+10)}ctx.fillStyle=bg;ctx.globalAlpha=.94;roundRect(ctx,x,y-13,Math.max(24,w),17,3);ctx.fill();ctx.globalAlpha=1;ctx.fillStyle='#fff';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(shown,x+5,y);ctx.restore()}
function drawHandle(ctx,x,y,color,square=false){ctx.save();ctx.fillStyle='#0b0f14';ctx.strokeStyle=color;ctx.lineWidth=1.6;if(square){ctx.fillRect(x-4,y-4,8,8);ctx.strokeRect(x-4,y-4,8,8)}else{ctx.beginPath();ctx.arc(x,y,4.5,0,Math.PI*2);ctx.fill();ctx.stroke()}ctx.restore()}
function roundRect(ctx,x,y,w,h,r){if(ctx.roundRect){ctx.beginPath();ctx.roundRect(x,y,w,h,r);return}ctx.beginPath();ctx.moveTo(x+r,y);ctx.arcTo(x+w,y,x+w,y+h,r);ctx.arcTo(x+w,y+h,x,y+h,r);ctx.arcTo(x,y+h,x,y,r);ctx.arcTo(x,y,x+w,y,r);ctx.closePath()}
function distLine(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(px-x1,py-y1);let t=((px-x1)*dx+(py-y1)*dy)/l2;t=clamp(t,0,1);return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function distRay(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l2=dx*dx+dy*dy;if(!l2)return Math.hypot(px-x1,py-y1);const t=Math.max(0,((px-x1)*dx+(py-y1)*dy)/l2);return Math.hypot(px-(x1+t*dx),py-(y1+t*dy))}
function distInfinite(px,py,x1,y1,x2,y2){const dx=x2-x1,dy=y2-y1,l=Math.hypot(dx,dy);if(!l)return Math.hypot(px-x1,py-y1);return Math.abs(dy*px-dx*py+x2*y1-y2*x1)/l}
