// Post-build checks on dist/: run `npm run build && npm run check`.
import fs from 'node:fs';
import path from 'node:path';
import assert from 'node:assert/strict';
import { site } from '../src/lib/site.mjs';
import { labs, canonicalLabUrls } from '../src/lib/labs.mjs';
import { learningApps } from '../src/lib/learning-apps.mjs';

const root = path.resolve('dist');
const pages = fs.readdirSync(root, { recursive: true }).filter(file => file.endsWith('.html')).sort();
const read = file => fs.readFileSync(path.join(root, file), 'utf8');
const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) =>
  code[0] === '#'
    ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
    : ENTITIES[code.toLowerCase()] ?? match);
const routeOf = file => '/' + file.replace(/index\.html$/, '').replace(/\\/g, '/');
const labHosts = new Set(learningApps.map(app => new URL(app.url).hostname));

const titles = new Map();
const h1s = new Map();
const indexable = [];
const formPages = [];
let links = 0, labLinks = 0, structured = 0, gtagPages = 0;

for (const file of pages) {
  const html = read(file);
  const route = routeOf(file);
  const is404 = file === '404.html';

  const h1 = [...html.matchAll(/<h1[\s>][\s\S]*?<\/h1>/g)];
  assert.equal(h1.length, 1, `${file}: exactly one H1`);
  const h1Text = decode(h1[0][0].replace(/<[^>]+>/g, '')).trim();
  assert.ok(!h1s.has(h1Text), `${file}: H1 "${h1Text}" also used on ${h1s.get(h1Text)}`);
  h1s.set(h1Text, file);

  const allTitles = [...html.matchAll(/<title>(.*?)<\/title>/gs)];
  assert.equal(allTitles.length, 1, `${file}: exactly one title`);
  const title = decode(allTitles[0][1]);
  assert.ok(!titles.has(title), `${file}: title "${title}" also used on ${titles.get(title)}`);
  titles.set(title, file);
  assert.ok(title.length >= 15 && title.length <= 65, `${file}: title is ${title.length} characters: ${title}`);

  const descriptions = [...html.matchAll(/<meta name="description" content="([^"]*)"/g)];
  assert.equal(descriptions.length, 1, `${file}: exactly one meta description`);
  const description = decode(descriptions[0][1]);
  assert.ok(description.length >= 120 && description.length <= 155, `${file}: description is ${description.length} characters: ${description}`);

  const canonicals = [...html.matchAll(/<link rel="canonical" href="([^"]*)"/g)];
  assert.equal(canonicals.length, 1, `${file}: one canonical link`);
  if (!is404) assert.equal(canonicals[0][1], site.url + route, `${file}: canonical is the page's own URL`);
  for (const tag of ['og:title', 'og:description', 'og:url', 'og:image']) assert.ok(html.includes(`property="${tag}"`), `${file}: ${tag}`);
  assert.ok(html.includes('name="twitter:card" content="summary_large_image"'), `${file}: twitter card`);

  const noindex = /<meta name="robots" content="noindex"/.test(html);
  assert.equal(noindex, is404, `${file}: only the 404 page is noindex`);
  if (!noindex) indexable.push(route);

  const ids = [...html.matchAll(/\sid="([^"]+)"/g)].map(m => m[1]);
  assert.equal(ids.length, new Set(ids).size, `${file}: duplicate IDs`);

  const blocks = [...html.matchAll(/<script type="application\/ld\+json">(.*?)<\/script>/gs)].map(m => JSON.parse(m[1]));
  for (const data of blocks) assert.equal(data['@context'], 'https://schema.org', `${file}: JSON-LD context`);
  structured += blocks.length;
  const types = blocks.map(data => data['@type']);
  if (route === '/') {
    for (const type of ['WebSite', 'Organization', 'ItemList']) assert.ok(types.includes(type), `home: ${type} JSON-LD`);
    const org = blocks.find(data => data['@type'] === 'Organization');
    assert.deepEqual(org.sameAs, labs.map(lab => lab.url), 'Organization sameAs lists the lab URLs');
    const list = blocks.find(data => data['@type'] === 'ItemList');
    assert.deepEqual(list.itemListElement.map(entry => entry.item.url), labs.map(lab => lab.url), 'ItemList lists every lab');
  } else if (!is404) {
    const crumbs = blocks.find(data => data['@type'] === 'BreadcrumbList');
    assert.ok(crumbs, `${file}: BreadcrumbList`);
    assert.equal(crumbs.itemListElement.at(-1).item, site.url + route, `${file}: last breadcrumb is this page`);
  }

  for (const m of html.matchAll(/(?:href|src|action)="(\/[^"#?]*)(?:[?#][^"]*)?"/g)) {
    const target = decodeURIComponent(m[1]);
    if (target.startsWith('//')) continue;
    if (target.startsWith('/api/')) continue; // served by the Worker, not dist/
    assert.ok(target.endsWith('/') || /\.[a-z0-9]+$/.test(target), `${file}: link without a trailing slash: ${target}`);
    const resolved = path.join(root, target);
    assert.ok(fs.existsSync(resolved) && (!fs.statSync(resolved).isDirectory() || fs.existsSync(path.join(resolved, 'index.html'))), `${file}: broken link ${target}`);
    links++;
  }
  // Every link to a lab is one of its canonical URLs (src/lib/labs.mjs).
  for (const m of html.matchAll(/href="(https?:\/\/[^"]+)"/g)) {
    const href = decode(m[1]);
    const host = new URL(href).hostname.replace(/^www\./, '');
    if (!labHosts.has(host)) continue;
    assert.ok(canonicalLabUrls.has(href), `${file}: lab link is not a canonical lab URL: ${href}`);
    labLinks++;
  }

  const text = decode(html.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '').replace(/<[^>]+>/g, ' '));
  assert.ok(!/NaN|undefined|\[object Object\]/.test(text), `${file}: NaN or undefined in rendered text`);
  assert.ok(!text.includes('—'), `${file}: em dash in page copy`);
  assert.ok(!/\blicence\b/i.test(text), `${file}: British spelling "licence" in page copy`);
  assert.ok(!/class="ad-|adsbygoogle|googlesyndication|doubleclick/i.test(html), `${file}: ad markup`);
  assert.ok(html.includes("gtag('consent', 'default'"), `${file}: consent defaults`);
  if (html.includes('googletagmanager.com/gtag/js')) gtagPages++;

  // The waitlist form and Turnstile: together, and only on the pages that hold the form.
  const hasForm = html.includes('data-waitlist-form');
  const hasTurnstile = html.includes('challenges.cloudflare.com/turnstile/v0/api.js');
  assert.equal(hasTurnstile, hasForm, `${file}: the Turnstile script loads exactly on pages with the form`);
  if (hasForm) {
    formPages.push(route);
    const form = html.match(/<form[^>]*data-waitlist-form[\s\S]*?<\/form>/)[0];
    assert.match(form, /method="post"/, `${file}: form posts`);
    assert.match(form, /action="\/api\/waitlist"/, `${file}: form action`);
    for (const name of ['email', 'role', 'subjects', 'grades', 'website']) assert.ok(form.includes(`name="${name}"`), `${file}: field ${name}`);
    for (const value of ['class_results', 'editable_worksheets', 'answer_keys', 'quiz_banks', 'all_labs_licence']) assert.ok(form.includes(`name="interests" value="${value}"`), `${file}: interest ${value}`);
    for (const value of ['yes', 'no', 'not_sure']) assert.ok(form.includes(`name="school_buys" value="${value}"`), `${file}: school_buys ${value}`);
    for (const value of ['teacher', 'school_leader', 'district', 'other']) assert.ok(form.includes(`<option value="${value}"`), `${file}: role ${value}`);
    const consent = form.match(/<input[^>]*name="consent"[^>]*>/)[0];
    assert.ok(consent.includes('value="yes"') && !/\schecked/.test(consent), `${file}: consent box, unticked`);
    assert.match(form, /<input[^>]*name="site" value="classroomlabs\.org"/, `${file}: site`);
    assert.match(form, /<input[^>]*name="source" value="hub"/, `${file}: source`);
    assert.ok(form.includes(`name="return" value="${site.url}${route}#teacher-plan"`), `${file}: return URL`);
    assert.match(form, /<input id="wl-website" name="website" type="text" tabindex="-1" autocomplete="off"/, `${file}: honeypot`);
    assert.match(form, /class="cf-turnstile" data-sitekey="[^"]+"/, `${file}: Turnstile widget with a site key`);
  }
}

assert.ok(gtagPages === 0 || gtagPages === pages.length, 'the Google tag is on every page or on none');
assert.ok(formPages.length === 0 || (formPages.includes('/') && formPages.includes('/teachers/') && formPages.length === 2), `the form is on / and /teachers/ only (found ${formPages.join(', ')})`);

const sitemap = fs.readFileSync(path.join(root, 'sitemap-0.xml'), 'utf8');
const listed = [...sitemap.matchAll(/<loc>(.*?)<\/loc>/g)].map(m => m[1]).sort();
assert.deepEqual(listed, indexable.map(route => site.url + route).sort(), 'the sitemap lists exactly the indexable pages');
for (const file of ['robots.txt', 'llms.txt', 'favicon.svg', 'og-image.png', '_headers', 'sitemap-index.xml']) assert.ok(fs.existsSync(path.join(root, file)), `dist/${file}`);
const png = fs.readFileSync(path.join(root, 'og-image.png'));
assert.deepEqual([png.readUInt32BE(16), png.readUInt32BE(20)], [1200, 630], 'og-image.png is 1200×630');
const headers = fs.readFileSync(path.join(root, '_headers'), 'utf8');
for (const header of ['Strict-Transport-Security', 'X-Content-Type-Options: nosniff', 'Referrer-Policy', 'immutable']) assert.ok(headers.includes(header), `_headers: ${header}`);
const llms = fs.readFileSync(path.join(root, 'llms.txt'), 'utf8');
for (const lab of labs) assert.ok(llms.includes(lab.url), `llms.txt lists ${lab.name}`);

console.log(`Verified ${pages.length} pages: titles, descriptions, canonicals, one H1 each, ${structured} JSON-LD blocks, unique IDs, ${links} local links, ${labLinks} canonical lab links, sitemap = ${indexable.length} indexable pages.`);
console.log(`Google tag: ${gtagPages ? 'on every page' : 'off (PUBLIC_GA_ID is empty)'}. Waitlist form: ${formPages.length ? formPages.join(' and ') : 'off (PUBLIC_TURNSTILE_SITE_KEY is empty)'}.`);
