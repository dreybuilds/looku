// Use the last known switches when reopening the studio offline.
const key='looku.app-features.v1';
let values={},notice='';
try{const saved=JSON.parse(localStorage.getItem(key))||{};values=saved.enabled&&typeof saved.enabled==='object'?saved.enabled:saved;notice=typeof saved.notice==='string'?saved.notice:''}catch{}
export function enabled(id){return values[id]!==false}
export function appNotice(){return notice}
let loading;
export function refreshFeatures(){
  if(!loading)loading=(async()=>{
    try{
      const response=await fetch('/api/features',{cache:'no-store',signal:AbortSignal.timeout(4000)});
      if(!response.ok)return false;
      const body=await response.json(),snapshot=body.enabled,text=typeof body.notice==='string'?body.notice:'';
      if(!snapshot||typeof snapshot!=='object')return false;
      const changed=JSON.stringify(snapshot)!==JSON.stringify(values)||text!==notice;
      values=snapshot;notice=text;
      try{localStorage.setItem(key,JSON.stringify({enabled:values,notice}))}catch{}
      return changed;
    }catch{return false}finally{loading=null}
  })();
  return loading;
}
