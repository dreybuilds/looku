import {pageHeader,sectionHeader,contentCard,emptyState} from './ui.js';
import {defaultStoreTheme,storeTheme,applyStoreTheme,applyStoreBackground,bannerCrop,applyBannerCrop} from './store-branding.js';
import {emailAccount,emailHeaders} from './email-auth.js';
import {enabled} from './features.js';

const node=(tag,text='')=>{const element=document.createElement(tag);element.textContent=text;return element};
const link=(text,href)=>{const element=node('a',text);element.href=href;return element};
const storefrontPath=slug=>'/store/'+encodeURIComponent(slug);
const money=price=>new Intl.NumberFormat('en-KE',{style:'currency',currency:'KES',maximumFractionDigits:0}).format(price);
async function api(path='',data){
  const response=await fetch('/api/merchant-stores'+path,{
    cache:'no-store',headers:{...await emailHeaders(),...(data?{'Content-Type':'application/json','X-Looku-Action':'merchant-store'}:{})},
    ...(data?{method:'POST',body:JSON.stringify(data)}:{})
  });
  const result=await response.json();
  if(!response.ok)throw Object.assign(Error(result.error||'Stores are unavailable. Try again.'),{status:response.status});
  return result;
}
function action(text,fn){
  const button=node('button',text);button.type='button';button.onclick=fn;return button;
}
function statusNode(){const note=node('p');note.setAttribute('role','status');return note}

export async function merchantDirectory(root){
  const list=node('div'),note=emptyState('Loading independent stores…'),more=node('button','More Looku stores');
  list.className='ui-grid';more.hidden=true;
  root.append(sectionHeader({title:'Independent stores on Looku',description:'Collections from our merchant community.'}),list,more,note);
  let cursor;
  async function load(){
    more.disabled=true;
    try{
      const page=await api(cursor?'?cursor='+encodeURIComponent(cursor):'');
      for(const store of page.items){
        const card=contentCard({title:store.name,label:'Independent store',description:store.description,action:{label:'Visit '+store.name,href:storefrontPath(store.slug)}});
        card.classList.add('store-directory-card');card.prepend(brandMark(store));
        list.append(card);
      }
      cursor=page.next;more.hidden=!cursor;
      note.textContent=list.children.length?'':cursor?'More stores are available on the next page.':'New collections are on their way. Check back soon.';
    }catch(error){note.textContent=error.message}finally{more.disabled=false}
  }
  more.onclick=load;await load();
}

export async function mountStorefront(root,slug){
  root.replaceChildren(node('p','Opening store…'));
  try{
    const store=await api('/'+encodeURIComponent(slug));
    document.title=store.name;
    applyStoreTheme(document.body,store.theme);
    applyStoreBackground(document.body,store.background);
    const brand=document.querySelector('[data-store-brand]');if(brand){brand.replaceChildren();if(store.logo){const image=node('img');image.src=store.logo;image.alt='';brand.append(image)}brand.append(node('span',store.name))}
    const navigation=document.querySelector('[data-store-nav]');if(navigation)navigation.hidden=false;
    const hero=node('section');hero.className='merchant-cover';
    const monogram=brandMark(store);
    const intro=node('div');intro.append(node('span','Welcome to'),node('h1',store.name),node('p',store.description));
    const identity=node('div');identity.className='merchant-cover-identity';identity.append(monogram,intro);
    if(store.banner)hero.append(bannerImage(store.banner,store.name,store.bannerCrop));
    hero.append(identity);root.replaceChildren(hero);
    if(store.mine){
      root.append(node('p','Store status · '+store.status),link('Manage this store','/app#merchant/'+store.slug));
    }
    const list=node('div');list.className='merchant-products';
    const note=statusNode(),more=action('Load more products',()=>load());more.hidden=true;
    const collection=node('h2','Shop the collection');collection.id='collection';
    const collectionSection=node('section');collectionSection.className='merchant-collection';
    collectionSection.append(collection,node('p','Find a piece you love. Ask us about sizing, availability and delivery.'),list,more,note);root.append(collectionSection);
    const contact=node('section');contact.className='merchant-contact';contact.id='contact-store';
    contact.append(node('h2','Let’s find your next favourite'),node('p','Get in touch to confirm availability, arrange delivery and agree payment.'),link('Email '+store.name,'mailto:'+encodeURIComponent(store.contact).replace('%40','@')));
    root.append(contact);
    let cursor;
    async function load(){
      more.disabled=true;note.textContent='Loading products…';
      try{
        const page=await api('/'+slug+'/products'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
        for(const product of page.items){
          if(product.status!=='available')continue;
          const card=node('article');card.className='panel merchant-product';
          const image=node('img');image.src=product.photo;image.alt=product.title;image.loading='lazy';
          const subject='Enquiry about '+product.title+' at '+store.name;
          const contact=link('Ask about this piece','mailto:'+encodeURIComponent(store.contact).replace('%40','@')+'?subject='+encodeURIComponent(subject));contact.className='button';
          card.append(image,node('h3',product.title),node('strong',money(product.price)),node('p',product.description),contact);
          list.append(card);
        }
        cursor=page.next;more.hidden=!cursor;
        note.textContent=list.children.length?'':cursor?'Continue to see more products.':'This merchant has no available products yet.';
      }catch(error){note.textContent=error.message}finally{more.disabled=false}
    }
    await load();
  }catch(error){
    root.replaceChildren(node('h1','Store unavailable'),node('p',error.status===404?'This store is not open right now. Please check back later.':error.message));
  }
}

export async function mountMerchantManager(root,slug){
  root.classList.add('merchant-manager');
  root.replaceChildren(pageHeader({title:'Your stores',description:'Create your storefront. Publish products once your store is approved.'}));
  const body=node('section');body.className='ui-manager-body';root.append(body);
  let stores;
  try{stores=await api('/mine')}catch(error){
    body.append(node('p',error.message));
    if(error.status===401){
      const auth=node('div');body.append(auth);
      emailAccount(auth,()=>mountMerchantManager(root,slug),'Sign in with email to manage a store');
      body.append(link('Use your wallet','#account/wallet/merchant'));
    }
    return;
  }
  if(slug){
    try{
      const store=await api('/'+encodeURIComponent(slug));
      if(!store.mine)throw Error('Choose a store you own.');
      root.querySelector('h1').textContent=store.name;
      body.append(link('All your stores','#merchant'));
      renderStoreForm(body,store);
      if(store.status==='approved'){
        body.append(sectionHeader({title:'Your products',description:'Publish directly, then hide a piece or mark it sold out when it is unavailable.'}));
        const editor=node('details');editor.className='panel';editor.append(node('summary','Add a product'));
        const formHost=node('div');editor.append(formHost);body.append(editor);
        const inventory=node('section');inventory.className='ui-inventory';body.append(inventory);
        productForm(formHost,store,null,()=>loadInventory(true));
        let cursor;
        async function loadInventory(reset){
          if(reset){cursor=null;inventory.replaceChildren()}
          const page=await api('/'+store.slug+'/products'+(cursor?'?cursor='+encodeURIComponent(cursor):''));
          inventory.querySelector('[data-more]')?.remove();
          for(const product of page.items){
            const card=node('details');card.className='panel';
            card.append(node('summary',product.title+' · '+product.status+' · '+money(product.price)));
            const host=node('div');card.append(host);
            productForm(host,store,product,()=>loadInventory(true));
            inventory.append(card);
          }
          cursor=page.next;
          if(cursor){
            const more=action('More products',async()=>{
              more.disabled=true;
              try{await loadInventory(false)}catch(error){more.disabled=false;more.textContent=error.message}
            });
            more.dataset.more='';inventory.append(more);
          }
        }
        await loadInventory(true);
      }
    }catch(error){body.append(node('p',error.message))}
    return;
  }
  const list=node('div');list.className='ui-grid';body.append(list);
  function draw(page){
    for(const store of page.items){
      const card=node('article');card.className='panel';
      card.append(node('h2',store.name),node('p',store.status),link('Manage store','#merchant/'+store.slug));list.append(card);
    }
  }
  draw(stores);
  let cursor=stores.next;
  const more=action('More of your stores',async()=>{
    more.disabled=true;
    try{const page=await api('/mine?cursor='+encodeURIComponent(cursor));draw(page);cursor=page.next;more.hidden=!cursor}
    catch(error){note.textContent=error.message}finally{more.disabled=false}
  });
  const note=statusNode();more.hidden=!cursor;body.append(more,note);
  if(enabled('storefronts'))renderStoreForm(body);
  else body.append(node('p','New merchant stores are currently paused.'));
}
function renderStoreForm(root,store){
  const section=node('section');section.className='panel store-editor ui-surface ui-form-panel merchant-details';
  section.append(node('h2',store?'Store details':'Create a store'));
  if(store){
    section.append(node('p','Store status · '+store.status));
    if(store.status==='pending')section.append(node('p','Looku is reviewing your store. Return here to check the decision.'));
    if(store.status==='rejected')section.append(node('p','Update your store details to submit it for review again.'));
    if(store.status==='approved'){
      section.append(link('Open storefront',storefrontPath(store.slug)));
      const url=node('input');url.readOnly=true;url.value=new URL(storefrontPath(store.slug),location.origin).href;
      const label=node('label','Share your store');label.append(url);section.append(label);
    }
    section.append(node('p','Subdomain address · '+store.slug+'.lookuwear.xyz'),node('small','Looku activates subdomain addresses through its domain settings.'));
    if(store.status==='suspended'){section.append(node('p','Contact Looku support about this suspension.'),link('Open support','#support'));root.append(section);return}
  }
  const form=node('form');form.className='stack ui-form';
  form.innerHTML='<label>Store name<input name="name" required maxlength="80" placeholder="Samaiah’s Closet"></label>'+
    (store?'':'<label>Store address<input name="slug" required minlength="3" maxlength="32" pattern="[a-z0-9](?:[a-z0-9]|-){1,30}[a-z0-9]" placeholder="samaiahs" autocapitalize="none" spellcheck="false"></label><small>Choose a unique address using lowercase letters, numbers and hyphens. Your address stays with this store.</small>')+
    '<label>About your store<textarea name="description" maxlength="800" placeholder="What do you sell, and where do you deliver?"></textarea></label>'+
    '<label>Public contact email<input name="contact" type="email" maxlength="160" required></label>'+
    '<div data-branding></div><small>Your store name, logo, banner, background, colours, description, products and contact email will be visible to visitors once your store is approved.</small><button></button><p role="status"></p>';
  if(store)for(const key of ['name','description','contact'])form.elements[key].value=store[key];
  const save=form.querySelector('button');
  const branding=brandEditor(form.querySelector('[data-branding]'),form,store,save);
  save.textContent=store?'Save store details':'Submit store for approval';
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;const note=form.querySelector(':scope > [role=status]');
    try{
      const data={...Object.fromEntries(new FormData(form)),...branding()};
      for(const key of ['logo','banner','background'])delete data[key+'File'];
      if(store)data.revision=store.revision;
      const result=await api(store?'/'+store.slug:'',data);
      location.hash='merchant/'+result.slug;
      const manager=document.querySelector('#merchant-area');
      if(store&&manager&&root.isConnected)await mountMerchantManager(manager,store.slug);
    }catch(error){note.textContent=error.message}finally{save.disabled=false}
  };
  section.append(form);root.append(section);
}
function brandMark(store){
  if(store.logo){const image=node('img');image.className='merchant-logo';image.src=store.logo;image.alt=store.name+' logo';return image}
  const mark=node('div',(store.name||'Your store').slice(0,1).toUpperCase());mark.className='merchant-monogram';mark.setAttribute('aria-hidden','true');return mark;
}
function bannerImage(photo,name,crop,device){
  const frame=node('div');frame.className='merchant-banner-frame';applyBannerCrop(frame,crop);
  if(device)frame.dataset.bannerDevice=device;
  const image=node('img');image.className='merchant-banner';if(photo)image.src=photo;image.alt=name+' banner';frame.append(image);return frame;
}
function bannerCropEditor(root,state,onChange){
  root.className='banner-crop-editor';
  const title=node('h3','Fit your banner'),help=node('p','Choose a screen size, then drag the image or use the sliders. Each crop is saved separately.');
  const modes=node('div');modes.className='row';modes.setAttribute('role','group');modes.setAttribute('aria-label','Banner preview size');
  const frame=bannerImage('', 'Crop preview');frame.classList.add('banner-crop-stage');
  const image=frame.querySelector('img');image.draggable=false;
  const controls=node('div');controls.className='banner-crop-controls';
  const sliders={},outputs={},buttons={};let device='desktop',drag=null;
  for(const value of ['desktop','mobile']){
    const button=action(value==='desktop'?'Desktop crop':'Mobile crop',()=>{device=value;onChange(false)});
    button.className='secondary small';buttons[value]=button;modes.append(button);
  }
  for(const [key,label,min,max,step] of [['x','Horizontal position',0,100,1],['y','Vertical position',0,100,1],['zoom','Zoom',100,300,5]]){
    const field=node('label'),caption=node('span',label),output=node('output'),input=node('input');
    input.type='range';input.min=min;input.max=max;input.step=step;input.setAttribute('aria-label',label);
    caption.append(output);field.append(caption,input);controls.append(field);sliders[key]=input;outputs[key]=output;
    input.oninput=()=>{state().crops[device][key]=Number(input.value)/(key==='zoom'?100:1);onChange(true)};
  }
  const reset=action('Reset this crop',()=>{state().crops[device]={x:50,y:50,zoom:1};onChange(true)});reset.className='link';
  root.append(title,help,modes,frame,controls,reset);
  frame.onpointerdown=event=>{
    if(event.button!==0||!image.naturalWidth)return;
    const box=frame.getBoundingClientRect(),crop={...state().crops[device]};
    const scale=Math.max(box.width/image.naturalWidth,box.height/image.naturalHeight)*crop.zoom;
    drag={id:event.pointerId,device,x:event.clientX,y:event.clientY,crop,width:image.naturalWidth*scale-box.width,height:image.naturalHeight*scale-box.height};
    frame.setPointerCapture(event.pointerId);frame.classList.add('is-dragging');event.preventDefault();
  };
  frame.onpointermove=event=>{
    if(!drag||event.pointerId!==drag.id)return;
    const crop=state().crops[drag.device],clamp=value=>Math.round(Math.max(0,Math.min(100,value))*100)/100;
    if(drag.width>1)crop.x=clamp(drag.crop.x-(event.clientX-drag.x)/drag.width*100);
    if(drag.height>1)crop.y=clamp(drag.crop.y-(event.clientY-drag.y)/drag.height*100);
    onChange(true);
  };
  const end=()=>{drag=null;frame.classList.remove('is-dragging')};
  frame.onpointerup=frame.onpointercancel=frame.onlostpointercapture=end;
  return {
    get device(){return device},
    sync(){
      const {photo,crops}=state();root.hidden=!photo;if(!photo)return;
      if(image.getAttribute('src')!==photo)image.src=photo;
      image.alt=(device==='desktop'?'Desktop':'Mobile')+' banner crop preview';frame.dataset.bannerDevice=device;applyBannerCrop(frame,crops);
      for(const value in buttons)buttons[value].setAttribute('aria-pressed',String(value===device));
      for(const key in sliders){const value=crops[device][key]*(key==='zoom'?100:1);sliders[key].value=String(value);outputs[key].value=Math.round(value)+'%'}
    }
  };
}
async function brandPhoto(file,kind){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a PNG, JPEG or WebP image smaller than 8 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    const limit=kind==='logo'?80000:160000;
    const scale=Math.min(1,(kind==='logo'?256:1440)/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    for(const quality of [.85,.7,.55,.4]){
      const photo=canvas.toDataURL('image/webp',quality);
      if(photo.length<=limit)return photo;
    }
    throw Error('This image is too detailed. Try a smaller image.');
  }finally{URL.revokeObjectURL(url)}
}
function brandEditor(root,form,store,save){
  root.className='brand-editor';let theme=storeTheme(store?.theme),crops=bannerCrop(store?.bannerCrop);
  const artwork={logo:store?.logo||null,banner:store?.banner||null,background:store?.background||null};
  const pending=new Set(),revisions={},removals={};
  const fields=node('fieldset');fields.className='brand-fields';fields.innerHTML='<legend>Store identity</legend><p class="fine">Choose images and colours that tell your store’s story. Preview changes before saving.</p>';
  const note=statusNode(),cropHost=node('section');
  for(const [kind,label,help] of [
    ['logo','Store logo','Transparent logos stay transparent.'],
    ['banner','Store banner','Wide images work best. Adjust the desktop and mobile crops below.'],
    ['background','Store background','Your image blends with the page colour for a coordinated background. Content stays on solid surfaces for readability.']
  ]){
    const field=node('label',label),input=node('input');input.name=kind+'File';input.type='file';input.accept='image/png,image/jpeg,image/webp';field.append(input);
    const hint=node('small',help+' PNG, JPEG or WebP · up to 8 MB.');hint.id='store-'+kind+'-hint';input.setAttribute('aria-describedby',hint.id);
    const remove=action('Remove '+kind,()=>{revisions[kind]=(revisions[kind]||0)+1;artwork[kind]=null;if(kind==='banner')crops=bannerCrop();input.value='';pending.delete(kind);save.disabled=pending.size>0;note.textContent=label+' removed from this draft. Save to apply.';draw()});
    remove.className='secondary small';removals[kind]=remove;fields.append(field,hint,remove);if(kind==='banner')fields.append(cropHost);
    input.onchange=async()=>{
      const file=input.files[0];if(!file)return;const current=revisions[kind]=(revisions[kind]||0)+1;
      pending.add(kind);save.disabled=true;note.textContent='Preparing your '+kind+'…';
      try{const photo=await brandPhoto(file,kind);if(current!==revisions[kind])return;artwork[kind]=photo;if(kind==='banner')crops=bannerCrop();note.textContent=kind[0].toUpperCase()+kind.slice(1)+' ready. Save your store to apply it.';draw()}
      catch(error){if(current===revisions[kind]){note.textContent=error.message;input.value=''}}
      finally{if(current===revisions[kind]){pending.delete(kind);save.disabled=pending.size>0}}
    };
  }
  const colours=node('div');colours.className='theme-colours';fields.append(colours);
  const inputs={};
  for(const [key,label] of [['primary','Brand colour'],['background','Page background'],['surface','Feature background']]){
    const field=node('label',label),input=node('input');input.type='color';input.value=theme[key];field.append(input);colours.append(field);inputs[key]=input;
    input.oninput=()=>{theme[key]=input.value;draw()};
  }
  const reset=action('Reset colours',()=>{theme={...defaultStoreTheme};for(const key in inputs)inputs[key].value=theme[key];draw()});reset.className='link';fields.append(reset);
  const preview=node('aside');preview.className='store-brand-preview';preview.setAttribute('aria-label','Store branding preview');
  const previewLabel=node('span','Live preview');previewLabel.className='eyebrow';
  const content=node('div');content.className='brand-preview-cover';
  const cta=node('span','Shop the collection');cta.className='brand-preview-button';
  fields.append(note);preview.append(previewLabel,content,cta);root.append(fields,preview);
  const cropEditor=bannerCropEditor(cropHost,()=>({photo:artwork.banner,crops}),changed=>{if(changed)note.textContent='Banner crop updated. Save your store to apply it.';draw()});
  function draw(){
    cropEditor.sync();
    const name=form.elements.name.value.trim()||'Your store name';applyStoreTheme(preview,theme);applyStoreBackground(preview,artwork.background);
    const identity=node('div');identity.className='brand-preview-identity';identity.append(brandMark({name,logo:artwork.logo}),node('h3',name),node('p',form.elements.description.value.trim()||'A little introduction to your collection.'));
    content.replaceChildren();if(artwork.banner)content.append(bannerImage(artwork.banner,name,crops,cropEditor.device));content.append(identity);
    for(const kind in removals)removals[kind].hidden=!artwork[kind]&&!pending.has(kind);
  }
  form.elements.name.addEventListener('input',draw);form.elements.description.addEventListener('input',draw);draw();
  return ()=>{if(pending.size)throw Error('Wait for your images to finish preparing.');return {...artwork,theme,bannerCrop:crops}};
}
function productForm(root,store,product,onSave){
  const form=node('form');form.className='stack ui-form';
  form.innerHTML='<label>Product name<input name="title" maxlength="100" required></label><label>Product photo<input name="photo" type="file" accept="image/*"></label>'+
    '<label>Price in KSh<input name="price" type="number" min="1" max="99999999" step="1" required></label>'+
    '<label>Description<textarea name="description" maxlength="1000" placeholder="Size, condition, colour and delivery details"></textarea></label>'+
    '<label>Availability<select name="status"><option value="available">Available</option><option value="sold-out">Sold out</option><option value="hidden">Hidden</option></select></label><button></button><p role="status"></p>';
  const save=form.querySelector('button'),note=form.querySelector('[role=status]');
  save.textContent=product?'Save product':'Publish product';form.elements.photo.required=!product;
  if(product){
    for(const key of ['title','price','description','status'])form.elements[key].value=product[key];
    const image=node('img');image.src=product.photo;image.alt=product.title;image.width=120;root.append(image);
  }
  let id=product?.id||crypto.randomUUID(),revision=product?.revision,photo=product?.photo;
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;note.textContent='Saving…';
    try{
      const file=form.elements.photo.files[0];
      if(file){
        const {processPhoto}=await import('./model.js');
        photo=(await processPhoto(file,400)).photo;
        if(photo.length>80000)photo=(await processPhoto(file,240)).photo;
      }
      const fields=Object.fromEntries(new FormData(form));
      await api('/'+store.slug+'/products',{id,revision,title:fields.title,description:fields.description,price:Number(fields.price),status:fields.status,photo});
      if(!product){id=crypto.randomUUID();photo=null;form.reset()}
      if(product){
        // Reload the record before allowing another revision of this product.
        save.disabled=true;
      }
      note.textContent=product?'Product updated.':'Product published.';
      await onSave();
    }catch(error){note.textContent=error.message}finally{save.disabled=false}
  };
  root.append(form);
}
