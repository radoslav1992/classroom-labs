// Renders public/og-image.png (1200×630) from an HTML card with Playwright: `npm run og-image`.
// Playwright is not a project dependency. The script uses an installed copy (`npx playwright install chromium`
// or a preinstalled one); set PLAYWRIGHT_MODULE / CHROMIUM_PATH to point at a specific install.
import fs from 'node:fs';
import { createRequire } from 'node:module';
import { site } from '../src/lib/site.mjs';
import { labs } from '../src/lib/labs.mjs';

const require = createRequire(import.meta.url);
const candidates = [process.env.PLAYWRIGHT_MODULE, 'playwright', '/opt/node-tools/node_modules/playwright'].filter(Boolean);
let chromium;
for (const name of candidates) { try { ({ chromium } = require(name)); break; } catch {} }
if (!chromium) throw new Error('Playwright not found. Install it (npx playwright install chromium) or set PLAYWRIGHT_MODULE.');
const executablePath = process.env.CHROMIUM_PATH;

const escape = text => text.replace(/&/g, '&amp;').replace(/</g, '&lt;');
const logo = fs.readFileSync(new URL('../public/favicon.svg', import.meta.url)).toString('base64');
const tiles = labs.map(lab => `<div class="tile" style="--lab:${lab.color};--tint:${lab.tint}"><b>${escape(lab.mark)}</b><span>${escape(lab.name)}</span></div>`).join('');

const html = `<!doctype html><html><head><meta charset="utf-8">
<link href="https://fonts.googleapis.com/css2?family=Atkinson+Hyperlegible:wght@400;700&family=Fraunces:wght@700&display=block" rel="stylesheet">
<style>
  *{box-sizing:border-box;margin:0}
  body{width:1200px;height:630px;background:#fbf7ef;font-family:'Atkinson Hyperlegible',system-ui,sans-serif;color:#1f2b26;display:grid;grid-template-columns:590px 1fr;overflow:hidden}
  .left{background:#22433a;color:#f7f2e6;padding:54px 52px;display:flex;flex-direction:column;justify-content:space-between;border-right:14px solid #f0b429}
  .brand{display:flex;align-items:center;gap:16px;font:700 34px 'Fraunces',Georgia,serif}
  h1{font:700 50px/1.15 'Fraunces',Georgia,serif}
  h1 span{color:#ffd772}
  .sub{font-size:25px;color:#cfdcd5;margin-top:20px;line-height:1.4}
  .url{font-size:23px;color:#cfdcd5}
  .right{display:grid;grid-template-columns:repeat(3,1fr);gap:14px;padding:40px 32px;align-content:center}
  .tile{background:var(--tint);color:var(--lab);border-radius:16px;padding:14px 14px;box-shadow:inset 0 -6px 0 var(--lab);display:flex;flex-direction:column;gap:4px;min-height:160px;justify-content:space-between}
  .tile b{font:700 28px/1 'Fraunces',Georgia,serif}
  .tile span{font-size:18px;font-weight:700;line-height:1.2}
</style></head><body>
<div class="left">
  <div class="brand"><img src="data:image/svg+xml;base64,${logo}" width="60" height="60">${escape(site.name)}</div>
  <div><h1>Free interactive labs for <span>science, math, spreadsheets, coding and reading</span></h1><p class="sub">No sign-up. Made for classrooms.</p></div>
  <p class="url">${site.hostname}</p>
</div>
<div class="right">${tiles}</div>
</body></html>`;

const browser = await chromium.launch(executablePath ? { executablePath } : {});
const page = await browser.newPage({ viewport: { width: 1200, height: 630 }, deviceScaleFactor: 1 });
await page.setContent(html, { waitUntil: 'networkidle' }).catch(() => page.setContent(html));
await page.evaluate(() => document.fonts.ready);
await page.screenshot({ path: new URL('../public/og-image.png', import.meta.url).pathname });
await browser.close();
console.log('Wrote public/og-image.png (1200×630).');
