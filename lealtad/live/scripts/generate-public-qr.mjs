import {readFile,writeFile,mkdir} from 'node:fs/promises';
import vm from 'node:vm';
import {fileURLToPath} from 'node:url';
import {chromium} from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
const root=new URL('../',import.meta.url), assets=new URL('public/assets/',root);
const scope={};vm.createContext(scope);vm.runInContext(await readFile(new URL('qrcode.js',assets),'utf8'),scope);
const destination='https://renacecafe.haloswebs.com/',qr=scope.qrcode(0,'M');qr.addData(destination);qr.make();
const n=qr.getModuleCount(),cell=Math.floor(1120/(n+8)),size=(n+8)*cell,x=(1748-size)/2,y=850;
let modules='';for(let row=0;row<n;row++)for(let col=0;col<n;col++)if(qr.isDark(row,col))modules+=`<rect x="${x+(col+4)*cell}" y="${y+(row+4)*cell}" width="${cell}" height="${cell}"/>`;
const logo=(await readFile(new URL('logo-renace.png',assets))).toString('base64');
const svg=`<svg xmlns="http://www.w3.org/2000/svg" width="148mm" height="210mm" viewBox="0 0 1748 2480"><rect width="1748" height="2480" fill="#f5f1e7"/><rect x="65" y="65" width="1618" height="2350" rx="30" fill="none" stroke="#a5a68d" stroke-width="3"/><image href="data:image/png;base64,${logo}" x="414" y="180" width="920" height="398"/><g text-anchor="middle" fill="#424b32"><text x="874" y="675" font-family="Georgia,serif" font-size="76">Tu café tiene recompensa.</text><text x="874" y="760" font-family="Arial,sans-serif" font-size="32" letter-spacing="5">TU TARJETA RENACE</text></g><rect x="${x}" y="${y}" width="${size}" height="${size}" fill="white"/><g fill="#000" shape-rendering="crispEdges">${modules}</g><g text-anchor="middle" fill="#424b32" font-family="Arial,sans-serif"><text x="874" y="2070" font-size="51">Escanea para crear tu cuenta</text><text x="874" y="2140" font-size="51">o iniciar sesión</text><text x="874" y="2260" font-size="30">renacecafe.haloswebs.com</text></g></svg>`;
const out=new URL('public/print/',root);await mkdir(out,{recursive:true});await writeFile(new URL('renace-acceso.svg',out),svg);
const browser=await chromium.launch({headless:true,channel:'msedge'});
try{
const page=await browser.newPage();await page.goto('about:blank');await page.addScriptTag({path:fileURLToPath(new URL('jsqr.js',assets))});
const result=await page.evaluate(async({source,x,y,size})=>{const img=new Image();img.src='data:image/svg+xml;base64,'+source;await img.decode();const c=document.createElement('canvas');c.width=1748;c.height=2480;const ctx=c.getContext('2d');ctx.drawImage(img,0,0,c.width,c.height);const frame=ctx.getImageData(x,y,size,size);return {png:c.toDataURL('image/png').split(',')[1],decoded:jsQR(frame.data,frame.width,frame.height)?.data};},{source:Buffer.from(svg).toString('base64'),x,y,size});
if(result.decoded!==destination)throw new Error('Public QR did not decode exactly: '+result.decoded);
await writeFile(new URL('renace-acceso.png',out),Buffer.from(result.png,'base64'));
console.log('QR verificado:',result.decoded,'— 1748 × 2480 px, A5 a 300 ppp.');
}finally{await browser.close();}
