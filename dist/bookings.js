import {emailAccount,emailHeaders} from './email-auth.js';

let selectedService='Fashion stylist';
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
        const card=node('article','');card.className='panel booking-card';
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
      note.className=list.children.length?'':'empty-state';note.textContent=list.children.length?'':'No booking requests yet. Your preferred time and confirmation will appear here.';
      more.hidden=!page.next;more.onclick=()=>load(page.next).catch(e=>note.textContent=e.message);
    }finally{more.disabled=false}
  }
  await load();return ()=>load();
}
export async function mountBookings(root,enabled){
  root.innerHTML='<div class="page-intro"><span class="eyebrow">Looku Wear / Appointments</span><h1>Book a stylist</h1><p>Make room for a little expertise. Choose your service and request a time that works for you.</p></div><div class="service-choices" role="group" aria-label="Choose a styling service"></div><div class="workspace-grid"><section class="panel booking-request" data-request></section><aside class="panel booking-history"><div class="surface-heading"><span class="eyebrow">Your schedule</span><h2>My bookings</h2></div><section data-history></section><ol class="booking-steps"><li><strong>Choose your service</strong><span>Fashion, makeup or hair, tailored to your plans.</span></li><li><strong>Request a time</strong><span>Tell us when and what you have in mind.</span></li><li><strong>Check your confirmation</strong><span>Your booking is agreed when it says Confirmed.</span></li></ol></aside></div>';
  const choices=root.querySelector('.service-choices');
  for(const [index,[name,description]] of [['Fashion stylist','Build a wardrobe that feels like you.'],['Makeup artist','A considered finish for your occasion.'],['Hair stylist','Find a fresh shape or your event style.']].entries()){
    const choice=node('button','');choice.type='button';choice.className='service-card';
    const number=node('span','0'+(index+1));number.className='eyebrow';
    choice.append(number,node('strong',name),node('span',description));choice.setAttribute('aria-pressed',String(name===selectedService));
    choice.onclick=()=>{selectedService=name;for(const button of choices.children)button.setAttribute('aria-pressed',String(button===choice));const select=root.querySelector('[name=service]');if(select)select.value=name};
    choices.append(choice);
  }
  if(!enabled){
    root.querySelector('h1').textContent='Your appointments';
    choices.hidden=true;root.querySelector('.page-intro p').textContent='New requests are paused. Sign in to check your previous appointments.';
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
    history.replaceChildren();
    const empty=node('div','');empty.className='empty-state';empty.append(node('h3',e.status===401?'Your appointments, together':'Bookings unavailable'),node('p',e.status===401?'Sign in to see requests, confirmed times and updates in one place.':e.message));history.append(empty);
    if(e.status===401){
      const heading=node('div','');heading.className='surface-heading';const kicker=node('span','A little time for you');kicker.className='eyebrow';heading.append(kicker,node('h2',enabled?'Let’s plan your appointment':'Your appointment history'));
      request.append(heading,node('p','Sign in with email to request a service and keep track of the details. Your account includes a Stellar wallet.'));
      const auth=node('div','');auth.className='booking-auth';request.append(auth);emailAccount(auth,()=>mountBookings(root,enabled),enabled?'Sign in with email to book':'Sign in with email to see bookings');
      const alternate=node('details','');alternate.className='quiet-disclosure';alternate.append(node('summary','Already use a wallet?'));const a=node('a','Use an existing wallet instead');a.href='#wallet/bookings';alternate.append(a);request.append(alternate);
    }else{request.append(node('p','We couldn’t load your account.'));const retry=node('button','Try again');retry.onclick=()=>mountBookings(root,enabled);request.append(retry)}
    return;
  }
  if(!enabled){request.textContent='New booking requests are paused. You can still view your bookings below.';return}
  const form=document.createElement('form');form.className='stack booking-form';
  form.innerHTML='<h2>Request an appointment</h2><label for="booking-service">Service</label><select name="service" id="booking-service"><option>Fashion stylist</option><option>Makeup artist</option><option>Hair stylist</option></select><label>Preferred date and time<input name="when" type="datetime-local" required></label><small data-zone></small><label>Contact email<input name="contact" type="email" autocomplete="email" maxlength="160" required></label><label>What do you have in mind? (optional)<textarea name="brief" maxlength="600" placeholder="Occasion, city or online preference"></textarea></label><small>Only you and the Looku team can see your request. Your preferred time is confirmed when the status changes to Confirmed.</small><button>Request booking</button><p role="status"></p>';
  form.querySelector('[data-zone]').textContent='Your time zone · '+Intl.DateTimeFormat().resolvedOptions().timeZone;
  form.elements.service.value=selectedService;form.elements.service.onchange=()=>{selectedService=form.elements.service.value;for(const button of choices.children)button.setAttribute('aria-pressed',String(button.querySelector('strong').textContent===selectedService))};
  request.append(form);let id=crypto.randomUUID();
  form.onsubmit=async event=>{
    event.preventDefault();const btn=form.querySelector('button'),note=form.querySelector('[role=status]');btn.disabled=true;
    try{
      const data=Object.fromEntries(new FormData(form));data.when=new Date(data.when).toISOString();
      await api({...data,id});id=crypto.randomUUID();form.reset();form.elements.service.value=selectedService;note.textContent='Booking requested.';await refresh();
    }catch(e){note.textContent=e.message}finally{btn.disabled=false}
  };
}
