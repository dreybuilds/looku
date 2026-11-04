// Only index orders after verified payment. An unsigned order cannot populate another wallet's history.
export async function indexPaidOrder(store, row) {
 if (!row.purchaseTx) return;
 const key='wallet-purchases/'+row.address+'/'+row.id;
 await store.put(key,row.id,{onlyIf:{etagDoesNotMatch:'*'}});
}

export async function walletReceipts(store, address, cursor) {
 const page=await store.list({prefix:'wallet-purchases/'+address+'/',limit:20,...(cursor?{cursor}:{})});
 const receipts=await Promise.all(page.objects.map(async entry=>{
   const id=entry.key.split('/').pop();
   const row=await (await store.get('orders/'+id))?.json();
   if(!row || row.address!==address || !row.purchaseTx) return null;
   return {id,status:row.status,purchaseTx:row.purchaseTx,payoutTx:row.payoutTx};
 }));
 return {receipts:receipts.filter(Boolean),next:page.truncated?page.cursor:null};
}
