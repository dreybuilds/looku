import {defineConfig} from '@playwright/test';
const host='http://127.0.0.1:'+(process.env.LOOKU_QA_PORT||4315);
export default defineConfig({
  testDir: '.', testMatch: '*.spec.js', workers: 2, timeout: 90000,
  use: {baseURL:host,channel:'chrome'},
  projects: [
    {name:'desktop',use:{viewport:{width:1280,height:800}}},
    {name:'phone',use:{viewport:{width:360,height:780},isMobile:true,hasTouch:true}}
  ],
  webServer:{command:'node ../hosting/build.mjs && node test-host.mjs',url:host,reuseExistingServer:true}
});
