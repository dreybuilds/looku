// This is a browsing preference, not an account role or permission.
const key='looku.experience.v1';
const valid=value=>value==='personal'||value==='business';
let current='personal',picked=false,locked=false;
try{const stored=localStorage.getItem(key);if(valid(stored)){current=stored;picked=true}}catch{}
const requested=new URLSearchParams(location.search).get('mode');
if(valid(requested))setExperience(requested);
export function experience(){return locked?'personal':current}
// True once the shopper has picked Personal or Business (or followed a link that names one).
export function experienceChosen(){return picked||locked}
export function setExperience(value){
 if(!valid(value))return;
 current=value;picked=true;try{localStorage.setItem(key,value)}catch{}
}
// Admin can switch the Business experience off; this keeps the shopper's own choice for when it returns.
export function lockPersonal(value){locked=Boolean(value)}
export function homeRoute(){return experience()==='business'?'#business':'#studio'}
export function routeExperience(route){
 const name=route.split(/[/?]/)[0];
 if(['business','merchant'].includes(name))return 'business';
 if(['studio','wardrobe','stylist','bookings','community','wishlist','boutique'].includes(name))return 'personal';
 return null;
}
