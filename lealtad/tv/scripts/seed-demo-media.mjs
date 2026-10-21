import { readFile, mkdir } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root = fileURLToPath(new URL('../',import.meta.url));
const ffmpeg = process.env.TV_FFMPEG;
if (!ffmpeg) throw new Error('Set TV_FFMPEG to a local ffmpeg executable.');
const browser = await chromium.launch({channel:'msedge',headless:true});
try {
  for (const site of ['renace','santofe']) {
    const origin = `http://127.0.0.1:${site==='renace'?8791:8792}`;
    const folder=path.join(root,'.local-tv',site,'fixtures'); await mkdir(folder,{recursive:true});
    const context=await browser.newContext(),page=await context.newPage();
    const logo=await readFile(path.join(root,'.build',site,'public/media/images',`logo-${site}.png`));
    const ink=site==='renace'?'#35412b':'#58464d', bg=site==='renace'?'#f3eee2':'#e7ebdc';
    for (const [label,width,height] of [['Horizontal',1600,900],['Vertical',900,1600]]) {
      await page.setViewportSize({width,height});
      await page.setContent(`<style>*{box-sizing:border-box}body{margin:0;background:${bg};color:${ink};font-family:Arial}main{height:100vh;padding:8%;display:flex;flex-direction:column;justify-content:space-between;border:24px solid ${ink}}img{width:${site==='renace'?'330':'150'}px;max-height:180px;object-fit:contain;object-position:left}h1{font:normal ${width>height?'100':'90'}px/1.05 Georgia;letter-spacing:-3px;max-width:900px;margin:0}p{font-size:24px;letter-spacing:4px}footer{border-top:1px solid ${ink};padding-top:26px;font-size:19px;letter-spacing:2px}</style><main><img src="data:image/png;base64,${logo.toString('base64')}" alt=""><div><p>UN MOMENTO PARA DISFRUTAR</p><h1>Tu pausa favorita.<br>Ahora, en pantalla.</h1></div><footer>DEMOSTRACIÓN LOCAL · SIN OFERTAS REALES</footer></main>`);
      await page.locator('img').evaluate(img=>img.decode());
      await page.screenshot({path:path.join(folder,`${label}.png`)});
    }
    for(const [label,size] of [['Video horizontal','640x360'],['Video vertical','360x640']]) execFileSync(ffmpeg,['-y','-loglevel','error','-f','lavfi','-i',`testsrc2=size=${size}:rate=24`,'-t','6','-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',path.join(folder,`${label}.mp4`)],{windowsHide:true});
    const login=await context.request.post(`${origin}/admin/api/login`,{headers:{origin},data:{username:`demo_${site}`,password:`Demo-${site}-TV-2026!`}});
    if(login.status()!==200)throw new Error(`Local login failed ${site}: ${login.status()}`);
    const content=await (await context.request.get(`${origin}/admin/api/content`)).json();
    for(const name of ['Horizontal.png','Vertical.png','Video horizontal.mp4','Video vertical.mp4']) {
      if(content.items.some(item=>item.originalFilename===name))continue;
      const data=await readFile(path.join(folder,name));
      const upload=await context.request.post(`${origin}/admin/api/uploads`,{headers:{origin,'content-type':name.endsWith('png')?'image/png':'video/mp4','x-upload-filename':encodeURIComponent(name),'x-upload-size':String(data.length)},data});
      if(upload.status()!==201)throw new Error(`Local fixture upload failed ${site}: ${upload.status()}`);
    }
    await context.close(); console.log(`${site}: four fictitious local media files ready`);
  }
} finally { await browser.close(); }
