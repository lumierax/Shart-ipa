export class Scanner{
  constructor(client){this.client=client;this.rows=[]}
  async refresh(quote='USDT'){
    const data=await this.client.ticker24h();const list=Array.isArray(data)?data:[data];this.rows=list.filter(x=>x.symbol?.endsWith(quote)&&this.client.symbolMap.has(x.symbol)).map(x=>({symbol:x.symbol,price:+x.lastPrice,change:+x.priceChangePercent,volume:+x.quoteVolume,high:+x.highPrice,low:+x.lowPrice,trades:+x.count||0}));return this.rows
  }
  sorted(by='change',desc=true,query=''){const q=query.trim().toUpperCase();return this.rows.filter(x=>!q||x.symbol.includes(q)).sort((a,b)=>{const av=by==='volume'?a.volume:by==='price'?a.price:a.change,bv=by==='volume'?b.volume:by==='price'?b.price:b.change;return(desc?-1:1)*(av-bv)})}
}
