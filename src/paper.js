import {db} from './storage.js';
import {uid} from './utils.js';
export class PaperBroker{
  constructor(){this.state={balance:10000,realized:0,positions:[],history:[]}}
  async load(){this.state=await db.get('paper','account',this.state);return this.state}
  async save(){await db.set('paper','account',this.state)}
  async order({symbol,side,qty,price,stop=null,take=null}){qty=+qty;price=+price;if(!qty||!price)throw new Error('Invalid quantity/price');const p={id:uid('pos'),symbol,side,qty,entry:price,stop:stop?+stop:null,take:take?+take:null,openedAt:Date.now()};this.state.positions.push(p);await this.save();return p}
  async close(id,price,reason='manual'){const i=this.state.positions.findIndex(p=>p.id===id);if(i<0)return;const p=this.state.positions[i],dir=p.side==='long'?1:-1,pnl=(+price-p.entry)*p.qty*dir,t={...p,exit:+price,closedAt:Date.now(),pnl,reason};this.state.realized+=pnl;this.state.balance+=pnl;this.state.history.unshift(t);this.state.positions.splice(i,1);await this.save();return t}
  async mark(symbol,price){let changed=false;for(const p of [...this.state.positions]){if(p.symbol!==symbol)continue;if(p.stop!=null&&((p.side==='long'&&price<=p.stop)||(p.side==='short'&&price>=p.stop))){await this.close(p.id,p.stop,'stop');changed=true}else if(p.take!=null&&((p.side==='long'&&price>=p.take)||(p.side==='short'&&price<=p.take))){await this.close(p.id,p.take,'take');changed=true}}return changed}
  summary(prices={}){let unreal=0;for(const p of this.state.positions){const mark=prices[p.symbol]??p.entry,dir=p.side==='long'?1:-1;unreal+=(mark-p.entry)*p.qty*dir}return{balance:this.state.balance,equity:this.state.balance+unreal,unrealized:unreal,realized:this.state.realized,count:this.state.positions.length}}
}
