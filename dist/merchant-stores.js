import {pageHeader,sectionHeader,contentCard,emptyState} from './ui.js';
import {defaultStoreTheme,storeTheme,applyStoreTheme} from './store-branding.js';
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
    const brand=document.querySelector('[data-store-brand]');if(brand){brand.replaceChildren();if(store.logo){const image=node('img');image.src=store.logo;image.alt='';brand.append(image)}brand.append(node('span',store.name))}
    const navigation=document.querySelector('[data-store-nav]');if(navigation)navigation.hidden=false;
    const hero=node('section');hero.className='merchant-cover';
    const monogram=brandMark(store);
    const intro=node('div');intro.append(node('span','Welcome to'),node('h1',store.name),node('p',store.description));
    hero.append(monogram,intro);root.replaceChildren(hero);
    if(store.mine){
      root.append(node('p','Store status · '+store.status),link('Manage this store','/app#merchant/'+store.slug));
    }
    const list=node('div');list.className='merchant-products';
    const note=statusNode(),more=action('Load more products',()=>load());more.hidden=true;
    const collection=node('h2','Shop the collection');collection.id='collection';
    root.append(collection,node('p','Find a piece you love. Ask us about sizing, availability and delivery.'),list,more,note);
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
      body.append(link('Use your wallet','#wallet/merchant'));
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
    '<div data-branding></div><small>Your store name, logo, colours, description, products and contact email will be visible to visitors once your store is approved.</small><button></button><p role="status"></p>';
  if(store)for(const key of ['name','description','contact'])form.elements[key].value=store[key];
  const save=form.querySelector('button');
  const branding=brandEditor(form.querySelector('[data-branding]'),form,store,save);
  save.textContent=store?'Save store details':'Submit store for approval';
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;const note=form.querySelector(':scope > [role=status]');
    try{
      const data={...Object.fromEntries(new FormData(form)),...branding()};
      delete data.logoFile;
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
async function logoPhoto(file){
  if(!['image/png','image/jpeg','image/webp'].includes(file.type)||file.size>8*1024*1024)throw Error('Choose a PNG, JPEG or WebP logo smaller than 8 MB.');
  const url=URL.createObjectURL(file),image=new Image();
  try{
    image.src=url;await image.decode();
    const scale=Math.min(1,256/Math.max(image.width,image.height)),canvas=document.createElement('canvas');
    canvas.width=Math.max(1,Math.round(image.width*scale));canvas.height=Math.max(1,Math.round(image.height*scale));
    canvas.getContext('2d').drawImage(image,0,0,canvas.width,canvas.height);
    const photo=canvas.toDataURL('image/webp',.85);
    if(photo.length>80000)throw Error('This logo is too detailed. Try a smaller image.');
    return photo;
  }finally{URL.revokeObjectURL(url)}
}
function brandEditor(root,form,store,save){
  root.className='brand-editor';let logo=store?.logo||null,theme=storeTheme(store?.theme),loading=false,revision=0;
  const fields=node('fieldset');fields.className='brand-fields';fields.innerHTML='<legend>Store identity</legend><p class="fine">Add your logo and choose colours. Preview changes before saving.</p><label>Store logo<input name="logoFile" type="file" accept="image/png,image/jpeg,image/webp"></label><small>PNG, JPEG or WebP · up to 8 MB. Transparent logos stay transparent.</small>';
  const remove=action('Remove logo',()=>{revision++;logo=null;input.value='';loading=false;save.disabled=false;note.textContent='Logo removed from this draft. Save to apply.';draw()});remove.className='secondary small';fields.append(remove);
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
  const note=statusNode();fields.append(note);preview.append(previewLabel,content,cta);root.append(fields,preview);
  const input=fields.querySelector('input[type=file]');
  function draw(){
    const name=form.elements.name.value.trim()||'Your store name';applyStoreTheme(preview,theme);
    content.replaceChildren(brandMark({name,logo}),node('h3',name),node('p',form.elements.description.value.trim()||'A little introduction to your collection.'));
    remove.hidden=!logo;
  }
  input.onchange=async()=>{
    const file=input.files[0];if(!file)return;const current=++revision;loading=true;save.disabled=true;note.textContent='Preparing your logo…';
    try{const photo=await logoPhoto(file);if(current!==revision)return;logo=photo;note.textContent='Logo ready. Save your store to apply it.';draw()}
    catch(error){if(current===revision){note.textContent=error.message;input.value=''}}
    finally{if(current===revision){loading=false;save.disabled=false}}
  };
  form.elements.name.addEventListener('input',draw);form.elements.description.addEventListener('input',draw);draw();
  return ()=>{if(loading)throw Error('Wait for your logo to finish preparing.');return {logo,theme}};
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
