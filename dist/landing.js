import {experienceSwitch} from './ui.js';
import {experience,setExperience} from './experience.js';

const content={
 personal:{label:'Personal wardrobe studio',title:'What can you wear with what you ',em:'already own?',intro:'Build outfits from your wardrobe, find inspiration, save your next favourite piece, and connect with the Looku community.',how:'Your wardrobe. More possibilities.',howIntro:'From the clothes you already own to the pieces and people you discover next.',cta:'Launch app',asideLabel:'Community closet',asideTitle:'See what others are wearing.',asideLink:'Browse the closet ↗',asideHref:'/app?mode=personal#community',photo:'/orchid-portrait.webp',alt:'Model wearing plum sunglasses and a lilac jacket with pink piping',caption:'The Orchid Edit'},
 business:{label:'Looku for independent businesses',title:'Your collection. ',em:'Your own storefront.',intro:'Create a home for your brand, make it yours with images and colours, and share your products with the Looku community.',how:'From your first store to your next customer.',howIntro:'Set up your store, submit it for approval, then publish and manage your collection.',cta:'Open business',asideLabel:'Made for your brand',asideTitle:'Give your collection a home.',asideLink:'Create your store ↗',asideHref:'/app?mode=business#merchant',photo:'/orchid-detail.webp',alt:'Close-up of lilac fabric, pink piping and dark denim',caption:'Details make the difference'}
};
const switcher=experienceSwitch({value:experience(),onChange:mode=>{setExperience(mode);render();}});
document.querySelector('[data-experience-switch]').append(switcher);
function render(){
 const mode=experience(),copy=content[mode];document.body.dataset.experience=mode;
 const url=new URL(location.href);if(url.searchParams.has('mode')){url.searchParams.set('mode',mode);history.replaceState(null,'',url)}
 document.querySelector('[data-hero-label]').textContent=copy.label;
 const emphasis=document.createElement('em');emphasis.textContent=copy.em;
 document.querySelector('h1').replaceChildren(copy.title,emphasis);
 document.querySelector('[data-hero-intro]').textContent=copy.intro;
 document.querySelector('[data-how-title]').textContent=copy.how;
 document.querySelector('[data-how-intro]').textContent=copy.howIntro;
 for(const panel of document.querySelectorAll('[data-mode-panel]'))panel.hidden=panel.dataset.modePanel!==mode;
 for(const link of document.querySelectorAll('[data-launch]')){link.textContent=copy.cta+' ↗';link.href=mode==='business'?'/app?mode=business':'/app?mode=personal'}
 document.querySelector('[data-aside-label]').textContent=copy.asideLabel;
 document.querySelector('[data-aside-title]').textContent=copy.asideTitle;
 const link=document.querySelector('[data-aside-link]');link.textContent=copy.asideLink;link.href=copy.asideHref;
 const image=document.querySelector('.cover-photo img');image.src=copy.photo;image.alt=copy.alt;
 document.querySelector('.cover-photo i').textContent=copy.caption;
 document.querySelector('[data-mode-note]').textContent=mode==='business'?'Business tools for your store. Switch to Personal whenever you want to style or shop.':'Your wardrobe, inspiration and shopping in one place. Switch to Business to manage a store.';
}
render();
