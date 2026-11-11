import {defineConfig} from '@playwright/test';
const host='http://127.0.0.1:'+(process.env.LOOKU_QA_PORT||4315);
// Captures demo screenshots and a silent backup walkthrough video: npx playwright test -c demo.config.js
export default defineConfig({
  testDir: '.', testMatch: 'demo-shots.js', workers: 1, timeout: 180000,
  outputDir: '../demo/test-output',
  use: {baseURL:host,channel:'chrome',serviceWorkers:'block'},
  projects: [
    {name:'desktop',use:{viewport:{width:1440,height:900},deviceScaleFactor:2,video:{mode:'on',size:{width:1440,height:900}}}},
    {name:'phone',use:{viewport:{width:390,height:844},deviceScaleFactor:3,isMobile:true,hasTouch:true}}
  ],
  webServer:{command:'node ../hosting/build.mjs && node test-host.mjs',url:host,reuseExistingServer:true}
});
