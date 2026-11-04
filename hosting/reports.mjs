// Count one page at a time so a large store can be reported within function limits.
const groups={
 support:{prefix:'support/',states:['Open','In progress','Resolved']},
 sales:{prefix:'community/sale/',states:['pending','approved','rejected']},
 donations:{prefix:'community/donate/',states:['pending','approved','rejected']}
};
export async function reportPage(store,query){
 const type=query.get('group');
 if(!Object.hasOwn(groups,type))return Response.json({error:'Unknown report.'},{status:400});
 const {prefix,states}=groups[type];
 const page=await store.list({prefix,limit:30,cursor:query.get('cursor')||undefined});
 const counts=Object.fromEntries(states.map(s=>[s,0]));
 await Promise.all(page.objects.map(async({key})=>{
   const obj=await store.get(key);if(!obj)return;
   const row=await obj.json(),state=row.status||'pending';
   if(Object.hasOwn(counts,state))counts[state]++;
 }));
 return Response.json({counts,next:page.truncated?page.cursor:null},{headers:{'Cache-Control':'private, no-store'}});
}
