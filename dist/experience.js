// This is a browsing preference, not an account role or permission.
const key='looku.experience.v1';
const valid=value=>value==='personal'||value==='business';
let current='personal';
try{const stored=localStorage.getItem(key);if(valid(stored))current=stored}catch{}
const requested=new URLSearchParams(location.search).get('mode');
if(valid(requested))setExperience(requested);
export function experience(){return current}
export function setExperience(value){
 if(!valid(value))return;
 current=value;try{localStorage.setItem(key,value)}catch{}
}
export function homeRoute(){return current==='business'?'#business':'#studio'}
export function routeExperience(route){
 const name=route.split(/[/?]/)[0];
 if(['business','merchant'].includes(name))return 'business';
 if(['studio','wardrobe','stylist','bookings','community','wishlist','boutique'].includes(name))return 'personal';
 return null;
}
