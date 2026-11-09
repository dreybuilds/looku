import assert from 'node:assert/strict';
import worker from '../dist/server/index.js';
const rows=new Map([
 ['merchant-stores/samaiahs',{slug:'samaiahs',owner:'private-owner',name:'Test store',description:'',contact:'store@example.org',status:'approved'}],
 ['merchant-stores/another',{slug:'another',owner:'other-owner',name:'Other store',description:'',contact:'other@example.org',status:'approved'}],
 ['merchant-products/samaiahs/12345678-1234-1234-1234-123456789abc',{id:'12345678-1234-1234-1234-123456789abc',title:'Visible piece',status:'available'}],
 ['merchant-products/samaiahs/12345678-1234-1234-1234-123456789abd',{id:'12345678-1234-1234-1234-123456789abd',title:'Hidden piece',status:'hidden'}]
]);
const store={
 async get(key){const row=rows.get(key);return row?{etag:'private-revision',json:async()=>row}:null},
 async list({prefix}){return {objects:[...rows.keys()].filter(key=>key.startsWith(prefix)).map(key=>({key})),truncated:false}}
};
const request=(host,path,init)=>worker.fetch(new Request('https://'+host+'/api/merchant-stores'+path,init),{ORDERS:store});
const host='samaiahs.lookuwear.xyz';
const visible=await request(host,'/samaiahs',{headers:{Authorization:'Bearer invalid'}});
assert.equal(visible.status,200,'Tenant browsing must not consult authentication');
assert.equal((await visible.json()).owner,undefined);
const products=await (await request(host,'/samaiahs/products')).json();
assert.equal(products.items.length,1);assert.equal(products.items[0].revision,undefined);
for(const path of ['','/mine','/another','/another/products','/samaiahs/products/12345678-1234-1234-1234-123456789abc'])assert.equal((await request(host,path)).status,404,path);
assert.equal((await request(host,'/samaiahs',{method:'POST',body:'{}'})).status,404);
rows.set('admin/features',{storefronts:false});
assert.equal((await request(host,'/samaiahs')).status,404);
assert.equal((await request(host,'/samaiahs/products')).status,404);
assert.deepEqual((await (await request('lookuwear.xyz','')).json()).items,[]);
rows.delete('admin/features');
rows.get('merchant-stores/samaiahs').status='suspended';
assert.equal((await request(host,'/samaiahs')).status,404);
assert.equal((await request(host,'/samaiahs/products')).status,404);
assert.deepEqual((await (await request('lookuwear.xyz','')).json()).items.map(item=>item.slug),['another']);
console.log('Verified tenant isolation, public data filtering, feature pause and suspension.');
