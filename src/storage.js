const DB_NAME='binance-chart-studio';
const DB_VERSION=2;
const STORES=['kv','scripts','drawings','paper','alerts','cache'];
class LocalDB{
  constructor(){this.db=null}
  async open(){if(this.db)return this.db;this.db=await new Promise((resolve,reject)=>{const req=indexedDB.open(DB_NAME,DB_VERSION);req.onupgradeneeded=()=>{const db=req.result;for(const s of STORES)if(!db.objectStoreNames.contains(s))db.createObjectStore(s)};req.onsuccess=()=>resolve(req.result);req.onerror=()=>reject(req.error)});return this.db}
  async get(store,key,fallback=null){await this.open();return new Promise((resolve,reject)=>{const req=this.db.transaction(store,'readonly').objectStore(store).get(key);req.onsuccess=()=>resolve(req.result===undefined?fallback:req.result);req.onerror=()=>reject(req.error)})}
  async set(store,key,val){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');tx.objectStore(store).put(val,key);tx.oncomplete=()=>resolve(val);tx.onerror=()=>reject(tx.error)})}
  async del(store,key){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');tx.objectStore(store).delete(key);tx.oncomplete=()=>resolve();tx.onerror=()=>reject(tx.error)})}
  async entries(store){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readonly'),os=tx.objectStore(store),keysReq=os.getAllKeys(),valsReq=os.getAll();tx.oncomplete=()=>resolve(keysReq.result.map((k,i)=>[k,valsReq.result[i]]));tx.onerror=()=>reject(tx.error)})}
  async clear(store){await this.open();return new Promise((resolve,reject)=>{const tx=this.db.transaction(store,'readwrite');tx.objectStore(store).clear();tx.oncomplete=resolve;tx.onerror=()=>reject(tx.error)})}
  async exportAll(){const out={version:DB_VERSION,exportedAt:Date.now(),stores:{}};for(const s of STORES)out.stores[s]=Object.fromEntries(await this.entries(s));return out}
  async importAll(data){if(!data?.stores)throw new Error('Invalid export file');for(const s of STORES){if(!data.stores[s])continue;await this.clear(s);for(const [k,v] of Object.entries(data.stores[s]))await this.set(s,k,v)}return true}
}
export const db=new LocalDB();
export const KV={get:(k,d)=>db.get('kv',k,d),set:(k,v)=>db.set('kv',k,v),del:k=>db.del('kv',k)};
