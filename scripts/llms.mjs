// Writes public/llms.txt, the plain-text guide to this site for AI assistants (https://llmstxt.org).
// The labs come from src/lib/labs.mjs; the pages from the built site: the <title> and meta description of
// each URL in the sitemap. Run it after changing labs, titles or descriptions, then build again:
//
//   npm run build && npm run llms && npm run build
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { site } from '../src/lib/site.mjs';
import { groups } from '../src/lib/labs.mjs';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const dist = path.join(root, 'dist');
const sitemap = path.join(dist, 'sitemap-0.xml');
if (!fs.existsSync(sitemap)) throw new Error('Run `npm run build` first: dist/sitemap-0.xml is missing.');

const ENTITIES = { amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ' };
const decode = text => text.replace(/&(#x[0-9a-f]+|#\d+|[a-z]+);/gi, (match, code) =>
  code[0] === '#'
    ? String.fromCodePoint(code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : Number(code.slice(1)))
    : ENTITIES[code.toLowerCase()] ?? match);
const brand = ` | ${site.name}`;

const pages = [...fs.readFileSync(sitemap, 'utf8').matchAll(/<loc>(.*?)<\/loc>/g)].map(m => {
  const url = m[1];
  const html = fs.readFileSync(path.join(dist, new URL(url).pathname, 'index.html'), 'utf8');
  const full = decode(html.match(/<title>([\s\S]*?)<\/title>/)[1]).trim();
  const title = full.endsWith(brand) ? full.slice(0, -brand.length) : full;
  const description = decode(html.match(/<meta name="description" content="([\s\S]*?)"/)[1]).trim();
  return { url, title, description };
});

const lines = [
  `# ${site.name}`,
  '',
  `> ${site.name} is the home of a family of free, interactive learning sites for science, math, coding and reading, made by one independent maker. Every lab is free to use with no sign-up. They are made for classrooms: they work on Chromebooks and can be shared as a link in Google Classroom, Canvas or Schoology. The science, math and reading labs have printable activities with teacher answer keys. A paid teacher plan for teachers and schools is being planned; teachers can join its waitlist on this site.`,
  '',
];
for (const group of groups) {
  lines.push(`## ${group.name}`, '');
  for (const lab of group.labs) {
    const facts = [lab.subject, lab.grades].filter(Boolean).join(', ');
    const tools = lab.tools.length ? ` Main tools: ${lab.tools.map(tool => `[${tool.name}](${tool.url})`).join(', ')}.` : '';
    const teachers = lab.teachersUrl ? ` [For teachers](${lab.teachersUrl}): ${lab.teachers}` : '';
    lines.push(`- [${lab.name}](${lab.url}) (${facts}): ${lab.does}${tools}${teachers}`);
  }
  lines.push('');
}
lines.push('## This site', '');
for (const page of pages) lines.push(`- [${page.title}](${page.url}): ${page.description}`);
lines.push('');

fs.writeFileSync(path.join(root, 'public', 'llms.txt'), lines.join('\n'));
console.log(`Wrote public/llms.txt: ${groups.reduce((n, g) => n + g.labs.length, 0)} labs and ${pages.length} pages.`);
