// Load Privy only for email users. Guest browsing and wallet sessions work independently.
const flag='looku.privy-session';
const sdk=()=>import('/privy.js');
export async function emailHeaders(){
 if(!localStorage.getItem(flag))return {};
 const token=await (await sdk()).accessToken();
 if(!token){localStorage.removeItem(flag);throw Error('Your email session expired. Sign in again.')}
 return {Authorization:'Bearer '+token};
}
// Keep each form in its own dialog so opening sign-in preserves the underlying draft.
export function bindAccountDialog(root){
 const trigger=root.querySelector('[data-open-account]');
 const dialog=trigger.nextElementSibling;
 const open=()=>dialog.showModal();
 trigger.onclick=open;
 dialog.querySelector('.close').onclick=()=>dialog.close();
 return open;
}
export function emailAccount(root,onChange,triggerLabel='Sign up or log in with email'){
 const signedIn=!!localStorage.getItem(flag);
 root.innerHTML=signedIn?'<p>Signed in with email. <button type="button" class="secondary small">Sign out</button></p><p role="status"></p>':
 '<button type="button" class="secondary account-trigger" data-open-account aria-haspopup="dialog"></button><dialog aria-label="Sign up or log in with email"><button type="button" class="close" aria-label="Close email sign-in">×</button><h2>Email sign-in</h2><form class="stack"><label>Email address<input type="email" name="email" autofocus autocomplete="email" required></label><label hidden>Six-digit code<input name="code" inputmode="numeric" pattern="[0-9]{6}" maxlength="6" autocomplete="one-time-code" disabled></label><p class="fine">Check your email for a one-time sign-in code after you choose Send code. Your first sign-in creates your account.</p><div class="actions"><button>Send code</button><button type="button" class="secondary" hidden>Change email or resend</button></div></form><p role="status"></p></dialog>';
 const status=root.querySelector('[role=status]');
 if(signedIn){
   root.querySelector('button').onclick=async event=>{
     const button=event.currentTarget;button.disabled=true;
     try{await (await sdk()).logout();localStorage.removeItem(flag);emailAccount(root,onChange,triggerLabel);await onChange()}
     catch(e){status.textContent=e.message;button.disabled=false}
   };return;
 }
 root.querySelector('[data-open-account]').textContent=triggerLabel;
 const open=bindAccountDialog(root);
 const form=root.querySelector('form'),{email,code}=form.elements;
 const [submit,reset]=form.querySelectorAll('button');
 function step(sent){
   email.readOnly=sent;code.parentElement.hidden=!sent;code.disabled=!sent;code.required=sent;
   submit.textContent=sent?'Verify code and continue':'Send code';reset.hidden=!sent;
   if(sent)code.focus();else{code.value='';email.focus()}
 }
 reset.onclick=()=>{step(false);status.textContent=''};
 form.onsubmit=async event=>{
   event.preventDefault();if(submit.disabled)return;
   submit.disabled=reset.disabled=true;
   const verifying=!code.disabled;
   status.textContent=verifying?'Verifying…':'Sending code…';
   try{
     const client=await sdk(),address=email.value.trim();
     if(!verifying){await client.sendCode(address);step(true);status.textContent='Check your inbox for the code.';return}
     await client.verifyCode(address,code.value.trim());
     const token=await client.accessToken();
     if(!token)throw Error('Sign-in did not finish. Request a new code.');
     const verified=await fetch('/api/community/session',{headers:{Authorization:'Bearer '+token},cache:'no-store'});
     if(!verified.ok)throw Error('Looku could not verify this session. Request a new code.');
     root.querySelector('dialog').close();localStorage.setItem(flag,'1');emailAccount(root,onChange,triggerLabel);await onChange();
   }catch(e){status.textContent=e.message||'Email sign-in is unavailable. Try again.'}
   finally{submit.disabled=reset.disabled=false}
 };
 return open;
}
