// Independent catalogue prices for a practice order. Test funds have no cash value.
export const prices={KES:2600,USD:20};
export const currency=()=>localStorage.getItem('looku.currency')==='USD'?'USD':'KES';
export const money=(amount=1,unit=currency())=>new Intl.NumberFormat(unit==='KES'?'en-KE':'en-US',{style:'currency',currency:unit,currencyDisplay:'code',minimumFractionDigits:unit==='KES'?0:2,maximumFractionDigits:2}).format(Number(amount)*prices[unit]);
export function budgetUnits(input,unit=currency()){
 if(!/^\d{1,9}(\.\d{1,2})?$/.test(input))throw Error('Enter a spending limit with up to two decimal places.');
 const [whole,decimal='']=input.split('.');
 const cents=BigInt(whole)*100n+BigInt(decimal.padEnd(2,'0'));
 if(cents<BigInt(prices[unit]*100))throw Error('The jacket is above your limit. Save toward it or change your limit.');
 // Authorize only the reviewed item price, even when the shopper enters a higher limit.
 return '1.00';
}
const storeKey='looku.shopping-profile.v1';
const fields=[
 ['top','Top size'],['bottom','Bottom size'],['shoe','Shoe size and system'],['jacket','Jacket size'],
 ['name','Recipient name','name'],['email','Contact email','email'],['street','Street and building','address-line1'],['city','Town or city','address-level2'],
 ['postal','Postal code','postal-code'],['country','Country','country-name'],['phone','Delivery phone','tel']
];
export const jacketSizes=['XS','S','M','L','XL','XXL'];
export function loadProfile(){try{return JSON.parse(localStorage.getItem(storeKey))||{}}catch{return {}}}
export function profileFields(checkout=false){
 const selected=checkout?fields.filter(([k])=>!['top','bottom','shoe','email'].includes(k)):fields;
 return selected.map(([key,label,autocomplete])=>{
   const required=checkout&&['jacket','name','street','city','country'].includes(key)?'required':'';
   const input=key==='jacket'?'<select name="jacket" '+required+'><option value="">Choose size</option>'+jacketSizes.map(s=>'<option>'+s+'</option>').join('')+'</select>':
     '<input type="'+(key==='email'?'email':key==='phone'?'tel':'text')+'" name="'+key+'" maxlength="100" autocomplete="'+(autocomplete||'off')+'" '+required+'>';
   return '<label>'+label+input+'</label>';
 }).join('');
}
export function fillProfile(container){
 const profile=loadProfile();
 for(const [key] of fields){const input=container.querySelector('[name="'+key+'"]');if(input)input.value=profile[key]||''}
}
export function readProfile(container){
 const result={};
 for(const [key] of fields){const input=container.querySelector('[name="'+key+'"]');if(input)result[key]=input.value.trim()}
 return result;
}
export function saveProfile(fields){localStorage.setItem(storeKey,JSON.stringify({...loadProfile(),...fields}))}
export function mountProfile(panel){
 panel.innerHTML='<summary>My sizes and delivery details</summary><form class="stack ui-form-grid"><p class="ui-full-width">Save your fit and usual destination on this device. You can change either when you order.</p>'+profileFields()+'<div class="row ui-full-width"><button>Save shopping profile</button><button type="button" class="secondary" data-forget>Clear details</button></div><p role="status"></p></form>';
 const form=panel.querySelector('form'),note=form.querySelector('[role=status]');
 fillProfile(form);
 form.onsubmit=e=>{e.preventDefault();try{saveProfile(readProfile(form));note.textContent='Shopping profile saved on this device.'}catch{note.textContent='Could not save on this device.'}};
 form.querySelector('[data-forget]').onclick=()=>{localStorage.removeItem(storeKey);form.reset();note.textContent='Shopping profile cleared.'};
}

export function productUrl(text){
  const url=new URL(text);
  if(url.protocol!=='https:'||url.username||url.password||url.href.length>4096)throw Error('Use the full HTTPS product link.');
  return url;
}
export function guessName(url){
  let slug=url.pathname.split('/').filter(Boolean).pop()||url.hostname;
  try{slug=decodeURIComponent(slug)}catch{}
  return slug.replace(/[-_]+/g,' ').replace(/^./,c=>c.toUpperCase()).slice(0,120);
}
export async function fetchProductPreview(url,signal){
  const response=await fetch('/api/product-preview',{method:'POST',headers:{'X-Looku-Action':'product-preview'},body:url,signal});
  if(!response.ok)throw Error('Preview unavailable.');
  return response.json();
}
