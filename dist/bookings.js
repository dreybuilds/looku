import {emailAccount,emailHeaders} from './email-auth.js';

const node=(tag,text)=>{const el=document.createElement(tag);el.textContent=text;return el};
export async function bookingList(root,api,admin=false){
  const list=node('div',''),more=node('button','Load more bookings'),note=node('p','');
  list.className='stack';note.setAttribute('role','status');more.hidden=true;
  root.append(list,more,note);
  async function load(cursor){
    more.disabled=true;
    try{
      const page=await api(null,cursor);
      if(!cursor)list.replaceChildren();
      for(const row of page.items){
        const card=node('article','');card.className='panel';
        card.append(node('h3',row.service+' · '+row.status),node('p',new Date(row.when).toLocaleString(undefined,{dateStyle:'medium',timeStyle:'long'})),node('p',row.contact));
        if(row.brief)card.append(node('p',row.brief));
        if(admin&&row.status==='Requested'){
          const controls=node('div','');controls.className='actions';card.append(controls);
          for(const [label,status] of [['Confirm booking','Confirmed'],['Decline booking','Declined']]){
            const decide=node('button',label);controls.append(decide);
            decide.onclick=async()=>{
              for(const btn of controls.children)btn.disabled=true;
              try{await api({key:row.key,revision:row.revision,status});await load()}
              catch(e){note.textContent=e.message;for(const btn of controls.children)btn.disabled=false}
            };
          }
        }
        list.append(card);
      }
      note.textContent=list.children.length?'':'No booking requests yet.';
      more.hidden=!page.next;more.onclick=()=>load(page.next).catch(e=>note.textContent=e.message);
    }finally{more.disabled=false}
  }
  await load();return ()=>load();
}
export async function mountBookings(root,enabled){
  root.innerHTML='<div class="eyebrow">Looku Wear / Appointments</div><h1>Book a stylist</h1><p>Request a fashion stylist, makeup artist or hair stylist. Choose your preferred time and check back here for confirmation.</p><section class="panel stack" data-request></section><h2>My bookings</h2><section data-history></section>';
  if(!enabled){
    root.querySelector('h1').textContent='Your appointments';
    root.querySelector('p').textContent='New requests are paused. Sign in to check your previous appointments.';
  }
  const request=root.querySelector('[data-request]'),history=root.querySelector('[data-history]');
  async function api(data,cursor){
    const response=await fetch('/api/bookings'+(cursor?'?cursor='+encodeURIComponent(cursor):''),{cache:'no-store',headers:{...await emailHeaders(),...(data?{'Content-Type':'application/json','X-Looku-Action':'booking'}:{})},...(data?{method:'POST',body:JSON.stringify(data)}:{})});
    const result=await response.json();
    if(!response.ok)throw Object.assign(Error(result.error),{status:response.status});return result;
  }
  let refresh;
  try{refresh=await bookingList(history,api)}
  catch(e){
    history.textContent=e.message;
    if(e.status===401){emailAccount(request,()=>mountBookings(root,enabled),enabled?'Sign in to book':'Sign in to see bookings');const a=node('a','Sign in with Wallet');a.href='#wallet/bookings';request.append(a)}
    return;
  }
  if(!enabled){request.textContent='New booking requests are paused. You can still view your bookings below.';return}
  const form=document.createElement('form');form.className='stack';
  form.innerHTML='<h2>Request an appointment</h2><label for="booking-service">Service</label><select name="service" id="booking-service"><option>Fashion stylist</option><option>Makeup artist</option><option>Hair stylist</option></select><label>Preferred date and time<input name="when" type="datetime-local" required></label><small data-zone></small><label>Contact email<input name="contact" type="email" autocomplete="email" maxlength="160" required></label><label>What do you have in mind? (optional)<textarea name="brief" maxlength="600" placeholder="Occasion, city or online preference"></textarea></label><small>Only you and the Looku team can see your request. Your preferred time is confirmed when the status changes to Confirmed.</small><button>Request booking</button><p role="status"></p>';
  form.querySelector('[data-zone]').textContent='Your time zone · '+Intl.DateTimeFormat().resolvedOptions().timeZone;
  request.append(form);let id=crypto.randomUUID();
  form.onsubmit=async event=>{
    event.preventDefault();const btn=form.querySelector('button'),note=form.querySelector('[role=status]');btn.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form));data.when=new Date(data.when).toISOString();
      await api({...data,id});id=crypto.randomUUID();form.reset();note.textContent='Booking requested.';await refresh();
    }catch(e){note.textContent=e.message}finally{btn.disabled=false}
  };
}
