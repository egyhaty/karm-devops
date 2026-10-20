import { readFile, writeFile, mkdir } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { marked } from 'marked';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = path.dirname(fileURLToPath(import.meta.url));
const output = path.join(root, '../web/lessons');
const catalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'));
const ids = new Set();
for (const lesson of catalog) {
  if (!/^[a-z][a-z0-9-]+$/.test(lesson.id) || ids.has(lesson.id)) throw new Error('Invalid or repeated lesson ID');
  ids.add(lesson.id);
}
const renderer = new marked.Renderer();
renderer.html = ({ text }) => escape(text); // Content is Markdown; raw HTML cannot introduce scripts or embeds.
renderer.link = function({ href, tokens }) {
  if (!/^(https:\/\/|\.\.?\/|#)/.test(href)) throw new Error(`Unsupported lesson link: ${href}`);
  return `<a href="${escape(href)}">${this.parser.parseInline(tokens)}</a>`;
};
renderer.image = () => { throw new Error('Use the shared diagram/illustration system, not remote lesson images.'); };
marked.use({ renderer });
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta name="theme-color" content="#102c35"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Project Learning Lab</title><link rel="stylesheet" href="../reference.css"><script src="../reference.js" defer></script><script src="../auth-client.js" defer></script></head><body><header class="reference-topbar"><a class="brand" href="/" aria-label="Project Learning Lab home"><span class="brand-mark" aria-hidden="true">K</span><span><b>Project Learning Lab</b><small>Understand it. Build it. Fix it.</small></span></a><nav><a href="/">Reference library</a><a href="../course.html">Platform tour</a><span id="authActions"><a href="/auth/login">Sign in</a></span></nav></header>${body}<footer>Project Learning Lab · English explanations, Arabic takeaways · Practice in an isolated environment</footer></body></html>`;
await mkdir(output, { recursive: true });
for (let index=0; index<catalog.length; index++) {
  const lesson = catalog[index];
  const source = await readFile(path.join(root, `lessons/${lesson.id}.md`), 'utf8');
  for (const required of ['## The problem', '## In this repository', '## Lab', '## Troubleshooting', '## Verify your understanding', '## Arabic takeaway', '## Sources']) if (!source.includes(required)) throw new Error(`${lesson.id}: missing ${required}`);
  let heading = 0;
  const headings = [];
  const html = marked.parse(source).replace(/<h2>(.*?)<\/h2>/g, (_, text) => { const id = `section-${++heading}`; headings.push({id,text}); return `<h2 id="${id}">${text}</h2>`; });
  const siblings = catalog.filter(l => l.id !== lesson.id).map(l => `<a href="${l.id}.html">${escape(l.title)} ↗</a>`).join('');
  const body = `<main><div class="breadcrumbs"><a href="/">Reference library</a> / ${escape(lesson.track)}</div><section class="lesson-hero"><p class="eyebrow">${escape(lesson.level)} / ${lesson.minutes} MIN + PRACTICE</p><h1>${escape(lesson.title)}</h1><p>${escape(lesson.summary)}</p><p class="prerequisites"><b>Before you start:</b> ${escape(lesson.prerequisites)}</p><a href="../content-source/${lesson.id}.md" download>Download the lesson source ↓</a></section><div class="reading-layout"><aside aria-label="Lesson contents"><b>IN THIS LESSON</b>${headings.map(h => `<a href="#${h.id}">${h.text}</a>`).join('')}<a href="/">← All lessons</a></aside><article class="prose">${html}<section class="related"><h2>Continue exploring</h2>${siblings}</section></article></div></main>`;
  await writeFile(path.join(output, `${lesson.id}.html`), shell(lesson.title, body));
  await mkdir(path.join(root, '../web/content-source'), {recursive:true});
  await writeFile(path.join(root, `../web/content-source/${lesson.id}.md`), source);
}
// Search covers lesson bodies as well as titles, without sending every lesson to the browser as HTML.
const search = [];
for (const lesson of catalog) search.push({...lesson,text:await readFile(path.join(root,`lessons/${lesson.id}.md`),'utf8')});
await writeFile(path.join(root,'../web/library-index.json'),JSON.stringify(search)+'\n');
console.log(`Built ${catalog.length} lessons from Markdown.`);
