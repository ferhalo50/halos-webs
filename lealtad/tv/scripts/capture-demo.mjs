import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
import { mkdir, writeFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
const output=process.env.TV_SCREENSHOTS;
if(!output||!process.env.TV_FFMPEG)throw new Error('Set TV_SCREENSHOTS and TV_FFMPEG (local paths).');
await mkdir(output,{recursive:true});
const browser=await chromium.launch({headless:true,channel:'msedge'});
try {
  for(const site of ['renace','santofe']) {
    const context=await browser.newContext({viewport:{width:1280,height:720},serviceWorkers:'block',recordVideo:{dir:output,size:{width:1280,height:720}}});
    const page=await context.newPage();
    await page.goto(`http://127.0.0.1:${site==='renace'?8791:8792}`);await page.waitForSelector('.media-card');
    await page.locator('#screen-settings').scrollIntoViewIfNeeded();await page.waitForTimeout(1500);
    await page.click('button[data-orientation="vertical"]');await page.waitForTimeout(800);
    await page.click('button[data-rotation="90"]');
    await page.getByRole('button',{name:'Seleccionar Vertical',exact:true}).click();await page.click('#play-selected');
    await page.waitForSelector('#media-stage img');await page.waitForTimeout(3000);await page.keyboard.press('Escape');
    await page.click('button[data-orientation="auto"]');await page.click('button[data-rotation="0"]');
    await page.click('#clear-selection');await page.getByRole('button',{name:'Seleccionar Video horizontal',exact:true}).click();
    await page.click('#play-selected');await page.waitForSelector('#media-stage video');await page.waitForTimeout(6800);await page.keyboard.press('Escape');
    const video=page.video();await context.close();
    execFileSync(process.env.TV_FFMPEG,['-y','-loglevel','error','-i',await video.path(),'-c:v','libx264','-pix_fmt','yuv420p','-movflags','+faststart',`${output}/${site}-recorrido.mp4`],{windowsHide:true});
  }
} finally { await browser.close(); }
await writeFile(`${output}/galeria.html`,`<!doctype html><html lang="es"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Renace y Santofé TV · Revisión local</title><style>body{margin:0;background:#eeeee5;color:#453b40;font:17px/1.5 system-ui}main{max-width:1400px;margin:auto;padding:40px 24px}h1,h2{font-family:Georgia;font-weight:400}h1{font-size:42px}a{color:#53424a}section{background:#fafbf5;padding:24px;border-radius:22px;margin:24px 0}.grid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:24px}img,video{width:100%;max-height:720px;object-fit:contain;background:#ddd;border-radius:12px}figcaption{margin:10px 0}figure{margin:0}</style><main><p>HALOS WEBS · SOLO LOCAL</p><h1>Dos marcas. Un reproductor compartido.</h1><p>Duración por fotografía con acceso administrativo y orientación independiente por pantalla. Imágenes y videos ficticios; ninguna publicación productiva.</p>${['renace','santofe'].map(site=>`<section><h2>${site==='renace'?'Renace Café TV':'Santofé TV'}</h2><p><a href="http://127.0.0.1:${site==='renace'?8791:8792}/" target="_blank">Abrir demo interactiva</a> · <a href="${site}-inicio.png">Ver página completa</a></p><div class="grid"><figure><img src="${site}-inicio.png"><figcaption>Página principal · dos configuraciones visibles</figcaption></figure><figure><img src="${site}-horizontal.png"><figcaption>Reproducción horizontal</figcaption><img src="${site}-vertical.png"><figcaption>Reproducción vertical</figcaption></figure></div><h3>Recorrido grabado</h3><video src="${site}-recorrido.mp4" controls preload="metadata"></video></section>`).join('')}<p>Pendiente: prueba física de Fire TV, mando y televisores. Los clips muestran una simulación real del navegador, no hardware físico.</p></main></html>`);
console.log(`${output}/galeria.html`);
