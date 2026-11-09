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
  const list=node('div'),note=statusNode(),more=node('button','More Looku stores');
  list.className='grid';more.hidden=true;
  root.append(node('h2','Independent stores on Looku'),node('p','Discover pieces listed by merchants with their own Looku storefront.'),list,more,note);
  let cursor;
  async function load(){
    more.disabled=true;
    try{
      const page=await api(cursor?'?cursor='+encodeURIComponent(cursor):'');
      for(const store of page.items){
        const card=node('article');card.className='panel';
        card.append(node('span','Looku store'),node('h3',store.name),node('p',store.description),link('Visit '+store.name,storefrontPath(store.slug)));
        list.append(card);
      }
      cursor=page.next;more.hidden=!cursor;
      note.textContent=list.children.length?'':cursor?'More stores are available on the next page.':'New stores will appear here after approval.';
    }catch(error){note.textContent=error.message}finally{more.disabled=false}
  }
  more.onclick=load;await load();
}

export async function mountStorefront(root,slug){
  root.replaceChildren(node('p','Opening store…'));
  try{
    const store=await api('/'+encodeURIComponent(slug));
    document.title=store.name;
    const brand=document.querySelector('[data-store-brand]');if(brand)brand.textContent=store.name;
    const navigation=document.querySelector('[data-store-nav]');if(navigation)navigation.hidden=false;
    const hero=node('section');hero.className='merchant-cover';
    const monogram=node('div',store.name.slice(0,1).toUpperCase());monogram.className='merchant-monogram';monogram.setAttribute('aria-hidden','true');
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
  root.replaceChildren(node('h1','Your stores'),node('p','Create your own storefront, then publish products once Looku approves your store.'));
  const body=node('section');root.append(body);
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
        body.append(node('h2','Your products'),node('p','Publish products directly. Mark a piece sold out or hide it when it is unavailable.'));
        const editor=node('details');editor.className='panel';editor.append(node('summary','Add a product'));
        const formHost=node('div');editor.append(formHost);body.append(editor);
        const inventory=node('section');body.append(inventory);
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
  const list=node('div');list.className='grid';body.append(list);
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
  const section=node('section');section.className='panel';
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
  const form=node('form');form.className='stack';
  form.innerHTML='<label>Store name<input name="name" required maxlength="80" placeholder="Samaiah’s Closet"></label>'+
    (store?'':'<label>Store address<input name="slug" required minlength="3" maxlength="32" pattern="[a-z0-9](?:[a-z0-9]|-){1,30}[a-z0-9]" placeholder="samaiahs" autocapitalize="none" spellcheck="false"></label><small>Choose a unique address using lowercase letters, numbers and hyphens. Your address stays with this store.</small>')+
    '<label>About your store<textarea name="description" maxlength="800" placeholder="What do you sell, and where do you deliver?"></textarea></label>'+
    '<label>Public contact email<input name="contact" type="email" maxlength="160" required></label>'+
    '<small>Your store name, description, products and contact email will be visible to visitors once your store is approved.</small><button></button><p role="status"></p>';
  if(store)for(const key of ['name','description','contact'])form.elements[key].value=store[key];
  const save=form.querySelector('button');save.textContent=store?'Save store details':'Submit store for approval';
  form.onsubmit=async event=>{
    event.preventDefault();save.disabled=true;const note=form.querySelector('[role=status]');
    try{
      const data=Object.fromEntries(new FormData(form));
      if(store)data.revision=store.revision;
      const result=await api(store?'/'+store.slug:'',data);
      location.hash='merchant/'+result.slug;
      const manager=document.querySelector('#merchant-area');
      if(store&&manager&&root.isConnected)await mountMerchantManager(manager,store.slug);
    }catch(error){note.textContent=error.message}finally{save.disabled=false}
  };
  section.append(form);root.append(section);
}
function productForm(root,store,product,onSave){
  const form=node('form');form.className='stack';
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
