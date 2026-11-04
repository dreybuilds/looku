// Use the last known switches when reopening the studio offline.
const key='looku.app-features.v1';
let values={};
try{values=JSON.parse(localStorage.getItem(key))||{}}catch{}
export function enabled(id){return values[id]!==false}
let loading;
export function refreshFeatures(){
  if(!loading)loading=(async()=>{
    try{
      const response=await fetch('/api/features',{cache:'no-store',signal:AbortSignal.timeout(4000)});
      if(!response.ok)return false;
      const snapshot=(await response.json()).enabled;
      if(!snapshot||typeof snapshot!=='object')return false;
      const changed=JSON.stringify(snapshot)!==JSON.stringify(values);
      values=snapshot;
      try{localStorage.setItem(key,JSON.stringify(values))}catch{}
      return changed;
    }catch{return false}finally{loading=null}
  })();
  return loading;
}
