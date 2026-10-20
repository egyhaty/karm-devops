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
