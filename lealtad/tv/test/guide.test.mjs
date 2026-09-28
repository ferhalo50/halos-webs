import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const base='http://127.0.0.1:8790';
const panel=await readFile(new URL('../public/admin/panel.html',import.meta.url),'utf8');
const adminScript=await readFile(new URL('../public/admin/admin.js',import.meta.url),'utf8');
const adminStyles=await readFile(new URL('../public/admin/admin.css',import.meta.url),'utf8');
const guideScript=await readFile(new URL('../public/assets/tv-guide.js',import.meta.url),'utf8');
const guideStyles=await readFile(new URL('../public/assets/tv-guide.css',import.meta.url),'utf8');

test('guías de pantalla y administración son accesibles, responsive y desaparecen al presentar',async t=>{
  const browser=await chromium.launch({headless:true,channel:'msedge'});t.after(()=>browser.close());
  const page=await browser.newPage({viewport:{width:390,height:844}}),errors=[];page.on('pageerror',error=>errors.push(error.message));
  await page.goto(base);await page.waitForSelector('.media-card');
  assert.equal(await page.locator('#tv-guide').innerText(),'Guía');
  assert.ok((await page.locator('#tv-guide').boundingBox()).height>=44);
  await page.click('#tv-guide');await page.waitForSelector('dialog.tv-guide[open]');
  assert.match(await page.locator('dialog.tv-guide').innerText(),/Selecciona el contenido[\s\S]*Actualizar contenido[\s\S]*pantalla completa[\s\S]*sin conexión[\s\S]*Iniciar sesión/i);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await page.keyboard.press('Escape');await page.waitForSelector('dialog.tv-guide',{state:'detached'});
  assert.equal(await page.evaluate(()=>document.activeElement.id),'tv-guide');
  await page.click('#play-all');await page.waitForFunction(()=>document.body.classList.contains('presenting'));
  assert.equal(await page.locator('#tv-guide').evaluate(element=>getComputedStyle(element).visibility),'hidden');
  assert.equal(await page.locator('#presentation').innerText(),'');
  await page.keyboard.press('Escape');await page.waitForSelector('#presentation',{state:'hidden'});

  const adminPage=await browser.newPage({viewport:{width:390,height:844}});adminPage.on('pageerror',error=>errors.push(error.message));
  await adminPage.route('**/*',async route=>{
    const url=new URL(route.request().url());
    if(url.pathname==='/admin')return route.fulfill({contentType:'text/html; charset=utf-8',body:panel});
    if(url.pathname==='/admin/admin.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:adminScript});
    if(url.pathname==='/admin/admin.css')return route.fulfill({contentType:'text/css',body:adminStyles});
    if(url.pathname==='/assets/tv-guide.js')return route.fulfill({contentType:'text/javascript; charset=utf-8',body:guideScript});
    if(url.pathname==='/assets/tv-guide.css')return route.fulfill({contentType:'text/css',body:guideStyles});
    if(url.pathname==='/admin/api/session')return route.fulfill({status:401,json:{error:'Inicia sesión para continuar.'}});
    return route.continue();
  });
  await adminPage.goto(base+'/admin');await adminPage.waitForSelector('#admin-guide');
  assert.equal(await adminPage.locator('#admin-guide').innerText(),'Guía');
  assert.ok((await adminPage.locator('#admin-guide').boundingBox()).height>=44);
  await adminPage.click('#admin-guide');await adminPage.waitForSelector('dialog.tv-guide[open]');
  const adminGuide=await adminPage.locator('dialog.tv-guide').innerText();
  assert.match(adminGuide,/JPG, JPEG, PNG, WebP y MP4[\s\S]*95 MB[\s\S]*H\.264/);
  assert.match(adminGuide,/Activa o desactiva[\s\S]*Cambia el orden[\s\S]*Elimina con cuidado[\s\S]*almacenamiento[\s\S]*pantalla de TV/i);
  assert.equal(await adminPage.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);
  await adminPage.keyboard.press('Escape');await adminPage.waitForSelector('dialog.tv-guide',{state:'detached'});
  assert.equal(await adminPage.evaluate(()=>document.activeElement.id),'admin-guide');
  assert.deepEqual(errors,[]);
});
