import { readFile, writeFile, mkdir, rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { marked } from 'marked';
export const escape = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const root = path.dirname(fileURLToPath(import.meta.url));
const web = path.join(root, '../web');
const catalog = JSON.parse(await readFile(path.join(root, 'catalog.json'), 'utf8'));
const tracks = JSON.parse(await readFile(path.join(root, 'tracks.json'), 'utf8'));
const ids = new Set();
for (const lesson of catalog) {
  if (!/^[a-z][a-z0-9-]+$/.test(lesson.id) || ids.has(lesson.id)) throw new Error('Invalid or repeated lesson ID');
  ids.add(lesson.id);
  if (lesson.trackId && !tracks.some(t => t.id === lesson.trackId)) throw new Error('Unknown track');
  if (lesson.trackId && (!lesson.quiz || lesson.quiz.length < 2)) throw new Error('Cloud modules need quizzes');
  for (const q of lesson.quiz || []) if (!q.question || !q.explanation || q.choices.length < 2 || !Number.isInteger(q.answer) || !q.choices[q.answer]) throw new Error('Invalid quiz');
}
const renderer = new marked.Renderer();
renderer.html = ({ text }) => escape(text);
renderer.link = function({ href, tokens }) {
  if (!/^(https:\/\/|\.\.?\/|#)/.test(href)) throw new Error(`Unsupported lesson link: ${href}`);
  return `<a href="${escape(href)}">${this.parser.parseInline(tokens)}</a>`;
};
renderer.image = () => { throw new Error('Use the shared diagram/illustration system, not remote lesson images.'); };
marked.use({ renderer });
const shell = (title, body) => `<!doctype html><html lang="en"><head><meta name="theme-color" content="#102c35"><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escape(title)} | Murabba Learn</title><link rel="stylesheet" href="/reference.css?v=cloud-learning-1"><script src="/reference.js?v=cloud-learning-1" defer></script><script src="/progress-sync.js?v=cloud-learning-1" defer></script><script src="/auth-client.js?v=cloud-learning-1" defer></script></head><body><header class="reference-topbar"><a class="brand" href="/" aria-label="Murabba Learn home"><span class="brand-mark" aria-hidden="true">M</span><span><b>Murabba Learn</b><small>Cloud &amp; DevOps · Learn by doing.</small></span></a><nav class="primary-nav" aria-label="Main navigation"><a href="/">Library</a><a href="/tracks/aws.html">AWS</a><a href="/tracks/azure.html">Azure</a><a href="/study-plan.html">Study plan</a><a href="/course.html">Project walkthrough</a></nav><div class="account-actions" id="authActions"><a href="/auth/login">Sign in / Register</a></div></header>${body}<footer>Murabba Learn · English explanations, Arabic takeaways · Practice in an isolated environment</footer></body></html>`;
const checkpoint = (label, message) => `<div class="learning-checkpoint" role="note"><span>${escape(label)}</span><p>${escape(message)}</p></div>`;
const completion = lesson => `<section class="completion" data-progress-id="${lesson.id}"><button type="button" class="button button-primary lesson-done" aria-pressed="false">Mark module complete</button><p class="progress-note" role="status">Saved in this browser. Sign in to sync across devices.</p></section>`;
const quizzes = lesson => !lesson.quiz ? '' : `<section class="module-quiz" aria-label="Module quiz"><h2>Quick quiz</h2><p>Check your answer for feedback. Completion is a self-assessment after you can reproduce the lab.</p>${lesson.quiz.map((q,i)=>`<form class="reference-quiz" data-answer="${q.answer}" data-explanation="${escape(q.explanation)}"><fieldset><legend>${i+1}. ${escape(q.question)}</legend>${q.choices.map((choice,j)=>`<label><input type="radio" name="question-${i}" value="${j}" required> ${escape(choice)}</label>`).join('')}</fieldset><button type="submit">Check answer</button><p role="status" class="quiz-feedback"></p></form>`).join('')}</section>`;
await mkdir(path.join(web,'lessons'), { recursive: true });
await mkdir(path.join(web,'content-source'), { recursive: true });
await mkdir(path.join(web,'tracks'), { recursive: true });
for (const lesson of catalog) {
  const source = await readFile(path.join(root, `lessons/${lesson.id}.md`), 'utf8');
  for (const required of ['## The problem','## In this repository','## Lab','## Troubleshooting','## Verify your understanding','## Arabic takeaway','## Sources', ...(lesson.trackId ? ['## Learning objectives','## Prerequisites','## Validation','## Cleanup','## Interview preparation'] : [])]) if (!source.includes(required)) throw new Error(`${lesson.id}: missing ${required}`);
  let heading = 0;
  const headings = [];
  const html = marked.parse(source).replace(/<h2>(.*?)<\/h2>/g, (_, text) => { const id = `section-${++heading}`; headings.push({id,text}); const nudge = lesson.encouragement && (text === 'Lab' ? checkpoint('Take the next step', lesson.encouragement.beforeLab) : text === 'Troubleshooting' ? checkpoint('Build on what you learned', lesson.encouragement.afterValidation) : ''); return `${nudge || ''}<h2 id="${id}">${text}</h2>`; });
  const siblings = catalog.filter(l => l.id !== lesson.id && l.trackId === lesson.trackId).map(l => `<a href="${l.id}.html">${escape(l.title)} ↗</a>`).join('');
  const ordered = catalog.filter(l => l.trackId === lesson.trackId);
  const position = ordered.findIndex(l=>l.id === lesson.id);
  const next = ordered[position+1]; const previous = ordered[position-1];
  const sequence = lesson.trackId ? `<nav class="module-sequence" aria-label="Track sequence">${previous ? `<a href="${previous.id}.html">← Previous module</a>` : ''}<a href="/tracks/${lesson.trackId}.html">Track overview</a>${next ? `<a href="${next.id}.html">Next: ${escape(next.title)} →</a>` : '<a href="/study-plan.html">Return to study plan →</a>'}</nav>` : '';
  const body = `<main><div class="breadcrumbs"><a href="/">Reference library</a> / ${lesson.trackId ? `<a href="/tracks/${lesson.trackId}.html">${escape(lesson.track)}</a> / Module ${position+1}` : escape(lesson.track)}</div><section class="lesson-hero"><p class="eyebrow">${escape(lesson.level)} / ${lesson.minutes} MIN INCLUDING PRACTICE</p><h1>${escape(lesson.title)}</h1><p>${escape(lesson.summary)}</p><p class="prerequisites"><b>Before you start:</b> ${escape(lesson.prerequisites)}</p><a href="/content-source/${lesson.id}.md" download>Download the lesson source ↓</a></section><div class="reading-layout"><aside aria-label="Lesson contents"><b>IN THIS LESSON</b>${headings.map(h => `<a href="#${h.id}">${h.text}</a>`).join('')}<a href="/">← All lessons</a></aside><article class="prose">${html}${lesson.trackId ? checkpoint('Make it your own', 'Pause before the quiz. Explain one decision in your own words, then use the questions to find what deserves another look.') : ''}${quizzes(lesson)}${completion(lesson)}${sequence}<section class="related"><h2>Continue exploring</h2>${siblings}</section></article></div></main>`;
  await writeFile(path.join(web,`lessons/${lesson.id}.html`), shell(lesson.title, body));
  await writeFile(path.join(web,`content-source/${lesson.id}.md`), source);
}
for (const track of tracks) {
  const lessons = catalog.filter(l=>l.trackId===track.id);
  const introduction = marked.parse(await readFile(path.join(root,`tracks/${track.id}.md`),'utf8'));
  const rows = lessons.map((l,i)=>`<li data-progress-id="${l.id}"><a href="/lessons/${l.id}.html"><b>${i+1}. ${escape(l.title)}</b><span>${l.minutes} min · <span class="completion-label">Not completed</span></span><p>${escape(l.summary)}</p></a></li>${i===2 || i===5 ? `<li class="track-checkpoint">${checkpoint(i===2?'A good point to pause':'The pieces are coming together',i===2?'You have worked through several boundaries. Take a short break, then explain one of them without your notes. Return to any check you cannot yet reproduce.':'Keep your notes and evidence close. The capstone is a chance to connect what you have practised, one verified step at a time.')}</li>` : ''}`).join('');
  await writeFile(path.join(web,`tracks/${track.id}.html`),shell(track.title,`<main><section class="lesson-hero"><p class="eyebrow">CLOUD LEARNING TRACK / ${lessons.length} MODULES / ${lessons.reduce((s,l)=>s+l.minutes,0)/60} HOURS</p><h1>${escape(track.title)}</h1><p>${escape(track.summary)}</p><p data-track-progress="${track.id}" role="status">0 of ${lessons.length} modules complete</p><a href="/study-plan.html">Three-week accelerated study plan →</a></section><div class="prose">${introduction}</div><ol class="track-modules">${rows}</ol><p class="progress-note" role="status">Saved in this browser. Sign in to sync across devices.</p></main>`));
}
await writeFile(path.join(web,'study-plan.html'),shell('Three-week AWS-first study plan',`<main><section class="lesson-hero"><p class="eyebrow">OPTIONAL ACCELERATED STUDY PLAN</p><h1>Three weeks. Evidence before memorisation.</h1></section><article class="prose">${marked.parse(await readFile(path.join(root,'study-plan.md'),'utf8'))}</article></main>`));
const search = [];
for (const lesson of catalog) search.push({...lesson,text:await readFile(path.join(root,`lessons/${lesson.id}.md`),'utf8')});
await writeFile(path.join(web,'library-index.json'),JSON.stringify(search)+'\n');
// Publish only reviewed source files. Never copy learner state, credentials,
// activated extensions, tfvars, plans or downloaded provider caches.
const labFiles = JSON.parse(await readFile(path.join(root,'labs/manifest.json'),'utf8'));
await rm(path.join(web,'labs'), {recursive:true,force:true});
for (const file of labFiles) {
  if (!/^[a-zA-Z0-9./_-]+$/.test(file) || file.split('/').some(part=>part==='..' || (part.startsWith('.') && part!=='.terraform.lock.hcl')) || /\.tfvars$|\.tfstate|\.tfplan$|(^|\/)backend\.tf$/.test(file)) throw new Error(`Unsafe lab download: ${file}`);
  const target = path.join(web,'labs',file);
  await mkdir(path.dirname(target),{recursive:true});
  await writeFile(target,await readFile(path.join(root,'labs',file)));
}
console.log(`Built ${catalog.length} lessons, ${tracks.length} tracks and the study plan.`);
