import {Emitter,clamp} from './utils.js';
export class ReplayController extends Emitter{
  constructor(){super();this.active=false;this.playing=false;this.index=0;this.speed=1;this.timer=null;this.length=0}
  start(length,index){this.stopTimer();this.active=true;this.playing=false;this.length=length;this.index=clamp(index??Math.floor(length*.65),0,Math.max(0,length-1));this.emit('change',this.state)}
  exit(){this.stopTimer();this.active=false;this.playing=false;this.emit('exit');this.emit('change',this.state)}
  step(n=1){if(!this.active)return;this.index=clamp(this.index+n,0,Math.max(0,this.length-1));if(this.index>=this.length-1)this.pause();this.emit('change',this.state)}
  back(){this.step(-1)}
  play(){if(!this.active)return;if(this.playing){this.pause();return}this.playing=true;this.emit('change',this.state);this.schedule()}
  pause(){this.playing=false;this.stopTimer();this.emit('change',this.state)}
  setSpeed(s){this.speed=Math.max(1,+s||1);if(this.playing){this.stopTimer();this.schedule()}this.emit('change',this.state)}
  schedule(){if(!this.playing)return;this.timer=setTimeout(()=>{this.step(1);if(this.playing)this.schedule()},Math.max(35,700/this.speed))}
  stopTimer(){clearTimeout(this.timer);this.timer=null}
  get state(){return{active:this.active,playing:this.playing,index:this.index,length:this.length,speed:this.speed}}
}
