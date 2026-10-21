import test from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { chromium, webkit } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';
for(const engine of ['chromium','webkit'])test(`${engine}: independent 1 GB bars, reload, inactive files, external refresh and mobile layout`,async t=>{
  const browser=await(engine==='chromium'?chromium:webkit).launch({headless:true,...(engine==='chromium'?{channel:'msedge'}:{})});t.after(()=>browser.close());
  const used=[];
  for(const site of ['renace','santofe']) {
    const base=`http://127.0.0.1:${site==='renace'?8791:8792}`;
    const context=await browser.newContext({serviceWorkers:'block'}),page=await context.newPage();
    await page.clock.install();await page.goto(base);await page.waitForSelector('.media-card');
    const panel=page.locator('#home-storage');await page.waitForFunction(()=>document.querySelector('#home-storage').dataset.limitBytes==='1000000000');
    const before=Number(await panel.getAttribute('data-used-bytes'));used.push(before);
    assert.match(await panel.innerText(),/1 GB/);assert.match(await panel.innerText(),/disponibles/);
    const login=await context.request.post(`${base}/admin/api/login`,{headers:{origin:base},data:{username:`demo_${site}`,password:`Demo-${site}-TV-2026!`}});assert.equal(login.status(),200);
    const bytes=await readFile(new URL(`../.local-tv/${site}/fixtures/Horizontal.png`,import.meta.url));
    // Playwright request multipart sends a real multipart body through workerd.
    const response=await context.request.post(`${base}/admin/api/uploads`,{headers:{origin:base},multipart:{file:{name:'Storage-test.png',mimeType:'image/png',buffer:bytes}}});
    assert.equal(response.status(),201);const {id}=await response.json();
    try {
      assert.equal((await context.request.patch(`${base}/admin/api/content/${id}`,{headers:{origin:base},data:{active:false}})).status(),200);
      await page.locator('.media-card').first().focus();
      await page.clock.fastForward(30010);
      await page.waitForFunction(n=>Number(document.querySelector('#home-storage').dataset.usedBytes)===n,before+bytes.length);
      assert.equal(await page.evaluate(()=>document.activeElement.classList.contains('media-card')),true,'usage-only refresh preserves library focus');
      await page.reload();await page.waitForFunction(n=>Number(document.querySelector('#home-storage').dataset.usedBytes)===n,before+bytes.length);
      for(const [w,h] of [[390,844],[1180,820],[1920,1080]]) {await page.setViewportSize({width:w,height:h});assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),true);}
    } finally {assert.equal((await context.request.delete(`${base}/admin/api/content/${id}`,{headers:{origin:base}})).status(),200);}
    await page.clock.fastForward(30010);await page.waitForFunction(n=>Number(document.querySelector('#home-storage').dataset.usedBytes)===n,before);
    await context.close();
  }
  assert.notEqual(used[0],used[1],'demo counts must come from different real local file sets');
});
