import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { escape } from './build.mjs';
test('generated pages link to available lessons and have standalone navigation', async () => {
  const catalog = JSON.parse(await readFile(new URL('./catalog.json',import.meta.url)));
  for (const lesson of catalog) {
    const html = await readFile(new URL(`../web/lessons/${lesson.id}.html`,import.meta.url),'utf8');
    assert.match(html,/<html lang="en">/); assert.match(html,/lang="ar" dir="rtl"|Arabic takeaway/);
    assert.match(html,/href="\/">Reference library/); assert.doesNotMatch(html,/library\.html/);
    assert.match(html,/id="section-1"/); assert.match(html,/Before you start:/);
    assert.doesNotMatch(html,/<script(?! src=)/);
  }
});
test('text escaping cannot inject attributes or tags',()=>assert.equal(escape('<"&'), '&lt;&quot;&amp;'));

test('cloud tracks are ordered, complete and preserve the original catalog', async () => {
  const catalog = JSON.parse(await readFile(new URL('./catalog.json',import.meta.url)));
  assert.deepEqual(catalog.slice(0,3).map(l=>l.id), ['docker','git','network-policy']);
  assert.equal(catalog.length,17);
  const handler = await readFile(new URL('../internal/app/handlers.go',import.meta.url),'utf8');
  const migration = await readFile(new URL('../internal/app/migrations/004_cloud_learning_progress.sql',import.meta.url),'utf8');
  const backendPattern = new RegExp(handler.match(/MustCompile\(`([^`]+)`\)/)[1]);
  const databasePattern = new RegExp(migration.match(/lesson_id ~ '([^']+)'/)[1]);
  for (const l of catalog) { assert.ok(backendPattern.test(l.id),l.id); assert.ok(databasePattern.test(l.id),l.id); }
  for (let i=1;i<=13;i++) assert.ok(databasePattern.test(`lesson-${String(i).padStart(2,'0')}`));
  for (const track of ['aws','azure']) {
    const modules = catalog.filter(l=>l.trackId===track);
    assert.deepEqual(modules.map(l=>l.id),Array.from({length:7},(_,i)=>`${track}-0${i+1}`));
    const overview = await readFile(new URL(`../web/tracks/${track}.html`,import.meta.url),'utf8');
    for (const l of modules) {
      assert.ok(overview.includes(`/lessons/${l.id}.html`));
      const source = await readFile(new URL(`lessons/${l.id}.md`,import.meta.url),'utf8');
      assert.ok(source.split(/\s+/).length >= 550,`${l.id} needs practical depth`);
      for (const section of ['Learning objectives','Prerequisites','Lab','Validation','Cleanup','Troubleshooting','Interview preparation','Arabic takeaway','Sources']) assert.ok(source.includes(`## ${section}`),`${l.id}: ${section}`);
      const html=await readFile(new URL(`../web/lessons/${l.id}.html`,import.meta.url),'utf8');
      assert.equal((html.match(/class="reference-quiz"/g)||[]).length,2);
      assert.ok(html.includes(`data-progress-id="${l.id}"`));
      assert.match(html,/src="\/progress-sync\.js(?:\?[^"]+)?"/);
      assert.equal((html.match(/<fieldset>/g)||[]).length,2);
      for (const q of l.quiz) assert.ok(q.choices[q.answer] && q.explanation);
    }
  }
});

test('generated local navigation and downloads resolve, including capstone files', async () => {
  const { access, readdir } = await import('node:fs/promises');
  const web = new URL('../web/',import.meta.url);
  const pages = ['index.html','study-plan.html',...(await readdir(new URL('tracks/',web))).map(f=>`tracks/${f}`),...(await readdir(new URL('lessons/',web))).map(f=>`lessons/${f}`)];
  for (const page of pages) {
    const html=await readFile(new URL(page,web),'utf8');
    for (const [,href] of html.matchAll(/(?:href|src)="([^"]+)"/g)) {
      if (href.startsWith('https://') || href.startsWith('#') || href.startsWith('/auth/') || href==='/admin') continue;
      const target = href==='/' ? new URL('index.html',web) : href.startsWith('/') ? new URL(href.slice(1),web) : new URL(href,new URL(page,web));
      await assert.doesNotReject(access(target),`${page} → ${href}`);
    }
  }
  // Only explicit, reviewed files are published; never learner state/providers.
  const manifest=JSON.parse(await readFile(new URL('labs/manifest.json',import.meta.url)));
  for (const name of manifest) assert.deepEqual(await readFile(new URL(`labs/${name}`,import.meta.url)),await readFile(new URL(`../web/labs/${name}`,import.meta.url)));
  const published=[];
  async function visit(relative='') {
    for (const entry of await readdir(new URL(`../web/labs/${relative}`,import.meta.url),{withFileTypes:true})) {
      if(entry.isDirectory()) await visit(relative+entry.name+'/');
      else published.push(relative+entry.name);
    }
  }
  await visit();
  assert.deepEqual(published.sort(),manifest.slice().sort());
});

test('published shell labs and WordPress bootstrap parse without execution', async () => {
  const { spawnSync } = await import('node:child_process');
  const { marked } = await import('marked');
  const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url)));
  for (const lesson of catalog.filter(l=>l.trackId)) {
    const source=await readFile(new URL(`lessons/${lesson.id}.md`,import.meta.url),'utf8');
    for (const token of marked.lexer(source).filter(t=>t.type==='code' && /^(bash|sh)$/.test(t.lang))) {
      const result=spawnSync('/bin/bash',['-n'],{input:token.text,encoding:'utf8'});
      assert.equal(result.status,0,`${lesson.id}: ${result.stderr}`);
    }
  }
  const bootstrap=await readFile(new URL('labs/aws-wordpress/user-data.sh.tftpl',import.meta.url),'utf8');
  const result=spawnSync('/bin/bash',['-n'],{input:bootstrap,encoding:'utf8'});
  assert.equal(result.status,0,result.stderr);
});

test('public pages describe a shared learning library without a personal profile or interview deadline', async () => {
  const catalog=JSON.parse(await readFile(new URL('./catalog.json',import.meta.url)));
  for (const page of ['index.html','study-plan.html','tracks/aws.html','tracks/azure.html',...catalog.map(l=>`lessons/${l.id}.html`)]) {
    const html=await readFile(new URL(`../web/${page}`,import.meta.url),'utf8');
    assert.doesNotMatch(html,/\bCKA\b|\bUAE\b|November 2026|your direct Azure experience/i,page);
    assert.match(html,/Murabba Learn/);
  }
  const home=await readFile(new URL('../web/index.html',import.meta.url),'utf8');
  assert.match(home,/<title>Cloud &amp; DevOps Learning Library/);
  assert.match(home,/Learn by building/);
});

test('encouragement appears at learning checkpoints without changing module counts', async () => {
  for(const track of ['aws','azure']) {
    const page=await readFile(new URL(`../web/tracks/${track}.html`,import.meta.url),'utf8');
    assert.equal((page.match(/<li data-progress-id=/g)||[]).length,7);
    assert.equal((page.match(/class="track-checkpoint"/g)||[]).length,2);
    const lesson=await readFile(new URL(`../web/lessons/${track}-01.html`,import.meta.url),'utf8');
    assert.equal((lesson.match(/class="learning-checkpoint"/g)||[]).length,3);
    assert.ok(lesson.indexOf('Take the next step')<lesson.indexOf('id="section-5"'));
  }
});
