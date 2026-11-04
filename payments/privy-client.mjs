import Privy,{LocalStorage} from '@privy-io/js-sdk-core';
import {privyAppId} from './privy-config.mjs';
const client=new Privy({appId:privyAppId,storage:new LocalStorage(),sessions:{cookieWriteBehavior:'never'}});
await client.initialize();
export const sendCode=email=>client.auth.email.sendCode(email);
export const verifyCode=(email,code)=>client.auth.email.loginWithCode(email,code,'login-or-sign-up');
export const accessToken=()=>client.getAccessToken();
export const logout=()=>client.auth.logout();
