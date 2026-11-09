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

export function bannerCrop(value){
  if(value===undefined)return {desktop:{x:50,y:50,zoom:1},mobile:{x:50,y:50,zoom:1}};
  if(!value||typeof value!=='object'||Array.isArray(value))throw Error('Choose valid banner crop settings.');
  const result={};
  for(const device of ['desktop','mobile']){
    const crop=value[device];
    if(!crop||typeof crop!=='object'||Array.isArray(crop))throw Error('Set both desktop and mobile banner crops.');
    result[device]={};
    for(const [key,min,max] of [['x',0,100],['y',0,100],['zoom',1,3]]){
      if(typeof crop[key]!=='number'||!Number.isFinite(crop[key])||crop[key]<min||crop[key]>max)throw Error('Banner position must be 0–100% and zoom must be 100–300%.');
      result[device][key]=Math.round(crop[key]*100)/100;
    }
  }
  return result;
}
export function applyBannerCrop(element,value){
  const crops=bannerCrop(value);
  for(const device of ['desktop','mobile'])for(const key of ['x','y','zoom']){
    element.style.setProperty('--banner-'+device+'-'+key,crops[device][key]+(key==='zoom'?'':'%'));
  }
}
