import {defineConfig} from '@playwright/test';
export default defineConfig({
  testDir: '.', testMatch: '*.spec.js', workers: 2, timeout: 90000,
  use: {baseURL:'http://127.0.0.1:4315',channel:'chrome'},
  projects: [
    {name:'desktop',use:{viewport:{width:1280,height:800}}},
    {name:'phone',use:{viewport:{width:360,height:780},isMobile:true,hasTouch:true}}
  ],
  webServer:{command:'node ../hosting/build.mjs && node test-host.mjs',url:'http://127.0.0.1:4315',reuseExistingServer:true}
});
