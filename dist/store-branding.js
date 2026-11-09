export const defaultStoreTheme=Object.freeze({primary:'#393c31',background:'#fffefb',surface:'#f4f0e8'});
export function storeTheme(value){
  if(value===undefined)return {...defaultStoreTheme};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose a valid store theme.');
  const theme={};
  for(const key of Object.keys(defaultStoreTheme)){
    if(typeof value[key]!=='string'||!/^#[a-f0-9]{6}$/i.test(value[key]))throw Error('Choose a six-digit hex colour for each theme colour.');
    theme[key]=value[key].toLowerCase();
  }
  return theme;
}
export function readableText(hex){
  const rgb=hex.slice(1).match(/../g).map(v=>parseInt(v,16)/255).map(v=>v<=.04045?v/12.92:((v+.055)/1.055)**2.4);
  const luminance=rgb[0]*.2126+rgb[1]*.7152+rgb[2]*.0722;
  return (luminance+.05)/.05>=1.05/(luminance+.05)?'#000000':'#ffffff';
}
export function applyStoreTheme(element,value){
  const theme=storeTheme(value);
  for(const [key,colour] of Object.entries(theme)){
    element.style.setProperty('--store-'+key,colour);
    element.style.setProperty('--store-'+key+'-text',readableText(colour));
  }
}
export function validStoreLogo(value){return validStoreImage(value,80000)}
export function validStoreImage(value,maxLength=160000){
  if(value===null)return true;
  if(typeof value!=='string'||value.length>maxLength||!/^data:image\/webp;base64,[A-Za-z0-9+/]+={0,2}$/.test(value))return false;
  const encoded=value.slice(value.indexOf(',')+1);
  if(encoded.length%4)return false;
  try{const head=atob(encoded.slice(0,16));return head.slice(0,4)==='RIFF'&&head.slice(8,12)==='WEBP'}catch{return false}
}

export function applyStoreBackground(element,value){
  // Only locally encoded, validated raster images can become CSS backgrounds.
  const photo=value&&validStoreImage(value)?value:null;
  element.classList.toggle('has-store-background',!!photo);
  if(photo)element.style.setProperty('--store-background-image','url("'+photo+'")');
  else element.style.removeProperty('--store-background-image');
}
