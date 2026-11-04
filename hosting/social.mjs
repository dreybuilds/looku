const networks={Instagram:/^[a-z0-9._]{1,30}$/i,TikTok:/^[a-z0-9._]{1,24}$/i,Pinterest:/^[a-z0-9_]{1,30}$/i,X:/^[a-z0-9_]{1,15}$/i};
export async function savedHandles(store,owner){
 return await (await store.get('social-profiles/'+owner))?.json()||{};
}
export async function saveHandles(store,owner,handles){
 if(!handles||typeof handles!=='object'||Array.isArray(handles))return false;
 const saved={};
 for(const [name,input] of Object.entries(handles)){
   if(!Object.hasOwn(networks,name)||typeof input!=='string')return false;
   const handle=input.trim().replace(/^@/,'');
   if(!handle)continue;
   if(!networks[name].test(handle))return false;
   saved[name]=handle;
 }
 await store.put('social-profiles/'+owner,JSON.stringify(saved));return true;
}
export async function selectedHandles(store,owner,selection){
 if(selection===undefined)return {};
 if(!selection||typeof selection!=='object'||Array.isArray(selection))throw Object.assign(Error('Invalid account tags.'),{status:400});
 const saved=await savedHandles(store,owner);
 for(const [name,handle] of Object.entries(selection)){
   if(!Object.hasOwn(saved,name)||saved[name]!==handle)throw Object.assign(Error('Account details changed. Reopen the look and choose your tags again.'),{status:409});
 }
 return selection;
}
