import assert from 'node:assert/strict';
import { chromium } from 'file:///C:/Users/ferha/.cache/codex-runtimes/codex-primary-runtime/dependencies/node/node_modules/playwright/index.mjs';

const baseUrl = process.env.RENACE_URL || 'https://renacecafe.haloswebs.com/';
const browser = await chromium.launch({ headless: true, channel: 'msedge' });

try {
  const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
  const errors = [];
  page.on('pageerror', error => errors.push(error.message));
  await page.goto(baseUrl);
  await page.waitForSelector('#app-loader', { state: 'detached' });
  await page.click('a[href="#login"]');
  await page.fill('[name="login"]', '0000000001');
  await page.fill('[name="secret"]', '246810');
  await page.click('#auth-form button');
  await page.waitForSelector('#qr svg');
  await page.evaluate(() => {
    Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
    Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
  });
  const downloadPromise = page.waitForEvent('download');
  await page.click('#download-card');
  const download = await downloadPromise;
  const stream = await download.createReadStream();
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  const decoded = await page.evaluate(async encoded => {
    const image = new Image();
    image.src = `data:image/png;base64,${encoded}`;
    await image.decode();
    const canvas = document.createElement('canvas');
    canvas.width = 648;
    canvas.height = 648;
    const context = canvas.getContext('2d');
    context.drawImage(image, 216, 565, 648, 648, 0, 0, 648, 648);
    const frame = context.getImageData(0, 0, 648, 648);
    return window.jsQR(frame.data, frame.width, frame.height)?.data || '';
  }, Buffer.concat(chunks).toString('base64'));
  assert.match(decoded, /^renace:/);
  assert.deepEqual(errors, []);
  await page.click('#logout');
  console.log(`Renace Card production smoke passed: ${download.suggestedFilename()} contains a readable QR.`);
} finally {
  await browser.close();
}
