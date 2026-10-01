import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import {fileURLToPath} from 'node:url';
// Render approved SVG branding inside the central 80% maskable safe circle.
const browser=await chromium.launch({channel:'msedge',headless:true});
try{
 for(const size of [192,512]){
  const page=await browser.newPage({viewport:{width:size,height:size},deviceScaleFactor:1});
  await page.setContent(`<style>body{margin:0}</style><svg xmlns="http://www.w3.org/2000/svg" width="${size}" height="${size}" viewBox="0 0 512 512"><rect width="512" height="512" fill="#fffaf0"/><image href="http://127.0.0.1:8790/assets/vainilla/logo.svg" x="98" y="160" width="316" height="146"/><image href="http://127.0.0.1:8790/assets/vainilla/flower.svg" x="222" y="326" width="68" height="68"/></svg>`,{waitUntil:'networkidle'});
  await page.screenshot({path:fileURLToPath(new URL(`../public/assets/vainilla/icon-${size}.png`,import.meta.url))});await page.close();
 }
}finally{await browser.close();}
