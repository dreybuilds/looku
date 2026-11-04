import {createRemoteJWKSet,jwtVerify} from 'jose';
import {privyAppId} from '../payments/privy-config.mjs';
const keys=createRemoteJWKSet(new URL('https://auth.privy.io/api/v1/apps/'+privyAppId+'/jwks.json'));
export async function privySubject(request,verificationKeys=keys){
 const header=request.headers.get('Authorization');
 if(!header)return null;
 try{
   if(!header.startsWith('Bearer ')||header.length>8192)throw Error();
   const {payload}=await jwtVerify(header.slice(7),verificationKeys,{issuer:'privy.io',audience:privyAppId,
     algorithms:['ES256'],requiredClaims:['exp','iat','sub','sid']});
   if(typeof payload.sid!=='string'||!payload.sid||!/^did:privy:[a-zA-Z0-9_-]+$/.test(payload.sub)||'linked_accounts' in payload)throw Error();
   return payload.sub;
 }catch{throw Object.assign(Error('Your email session expired. Sign in again.'),{status:401})}
}
