import assert from 'node:assert/strict';
import {ema,rsi,bollinger,macd,supertrend,BUILT_INS} from '../src/ta.js';
import {runBacktest} from '../src/backtest.js';
import {ReplayController} from '../src/replay.js';
import {ChartEngine,toHeikinAshi} from '../src/chart.js';
import {positionMetrics} from '../src/drawings.js';

const values=Array.from({length:200},(_,i)=>100+i*.2+Math.sin(i/5)*3);
assert.equal(ema(values,20).length,200);assert.equal(rsi(values,14).length,200);assert.equal(bollinger(values,20,2).upper.length,200);assert.equal(macd(values).hist.length,200);
const high=values.map((v,i)=>v+1+Math.sin(i/7)*.4),low=values.map((v,i)=>v-1-Math.cos(i/9)*.35),volume=values.map((_,i)=>1000+Math.sin(i/11)*300+(i%17)*25);assert.equal(supertrend(high,low,values,10,3).length,200);assert.ok(Object.keys(BUILT_INS).length>=49);
const data={open:values.map((v,i)=>v-Math.sin(i/3)*.25),high,low,close:values,volume,time:values.map((_,i)=>i*60000)};for(const [key,def] of Object.entries(BUILT_INS)){const series=def.compute(data,{...def.defaults});assert.ok(Array.isArray(series)&&series.length>0,`${key} returned no series`);for(const x of series){assert.equal(x.values.length,values.length,`${key}/${x.name} length mismatch`)}}
const bars=values.map((c,i)=>({time:i*60000,open:c-.1,high:c+1,low:c-1,close:c,volume:100}));const bt=runBacktest(bars,[{type:'entry',index:20,side:'long',opts:{stopPct:5,takePct:10}},{type:'close',index:120}],{capital:10000,feePct:.1,slippagePct:.01});assert.equal(bt.totalTrades,1);assert.ok(Number.isFinite(bt.finalEquity));assert.equal(bt.trades[0].entryIndex,21);

// Heikin Ashi should preserve time/volume while recursively deriving open/close.
const raw=[
  {time:1,open:100,high:110,low:90,close:106,volume:10},
  {time:2,open:106,high:114,low:102,close:112,volume:12}
];
const ha=toHeikinAshi(raw);assert.equal(ha.length,2);assert.equal(ha[0].close,101.5);assert.equal(ha[0].open,103);assert.equal(ha[1].open,(ha[0].open+ha[0].close)/2);assert.equal(ha[1].time,2);assert.equal(ha[1].volume,12);

// Replay must be able to locate hidden/future bars against the full history.
const fake=Object.create(ChartEngine.prototype);fake.bars=Array.from({length:10},(_,i)=>({time:i*1000}));fake.replayIndex=3;
assert.equal(fake.findTimeIndexAtOrBefore(7000,false),3);assert.equal(fake.findTimeIndexAtOrBefore(7000,true),7);assert.equal(fake.findTimeIndexAtOrBefore(-1000,true),-1);
const replay=new ReplayController();let state;replay.on('change',s=>state=s);replay.start(10,3);replay.step();assert.equal(state.index,4);replay.back();assert.equal(state.index,3);replay.exit();assert.equal(replay.active,false);

// Professional position tool R:R math.
const long=positionMetrics({points:[{price:100},{price:95}],rr:2},'long');assert.equal(long.target,110);assert.equal(long.risk,5);assert.equal(long.reward,10);
const short=positionMetrics({points:[{price:100},{price:105}],rr:3},'short');assert.equal(short.target,85);assert.equal(short.reward,15);

console.log(`PASS: ${Object.keys(BUILT_INS).length} built-in indicators; backtest, replay, Heikin Ashi and position tools OK`);
