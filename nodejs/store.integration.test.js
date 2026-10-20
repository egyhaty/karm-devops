const { test } = require('node:test');
const assert = require('node:assert/strict');
const { randomUUID, randomBytes } = require('node:crypto');
const { Pool } = require('pg');
const { openStore } = require('./store');
const { seedProperties, parseFilters } = require('./catalog');
const { createApp } = require('./index');

test('PostgreSQL: concurrent initialization, filtering, persistence and request workflow', { skip: !process.env.TEST_DATABASE_URL }, async () => {
  const schema = `test_${randomUUID().replaceAll('-','')}`;
  const root = new Pool({ connectionString:process.env.TEST_DATABASE_URL });
  await root.query(`CREATE SCHEMA ${schema}`);
  const role = `role_${randomUUID().replaceAll('-','')}`;
  const password = randomBytes(24).toString('hex');
  await root.query(`CREATE ROLE ${role} LOGIN PASSWORD '${password}'`);
  await root.query(`GRANT USAGE, CREATE ON SCHEMA ${schema} TO ${role}`);
  const url = new URL(process.env.TEST_DATABASE_URL);
  url.username = role; url.password = password; url.searchParams.set('options',`-c search_path=${schema}`);
  let first, second, server;
  try {
    [first,second] = await Promise.all([openStore(url.toString()),openStore(url.toString())]);
    assert.equal((await first.list(parseFilters({}))).length,6);
    const homes = await first.list(parseFilters({ location:'Maadi',sort:'price-asc' }));
    assert.equal(homes.length,2); assert.ok(homes[0].price < homes[1].price);
    const added = await first.add({...seedProperties[0],title:'Integration property'});
    const inquiry = {name:'Sample visitor',phone:'01234567890',message:'Sample only'};
    const results = await Promise.all(Array.from({length:5},()=>first.inquire(added.id,inquiry)));
    assert.equal(results.filter(Boolean).length,3,'limit is shared and race-safe');
    const id = results.find(Boolean).id;
    await first.updateInquiry(id,'contacted');
    await first.close(); first = null;
    assert.equal((await second.inquiries()).find(i=>i.id===id).status,'contacted');
    const reopened = await openStore(url.toString());
    try { assert.equal((await reopened.list(parseFilters({}))).length,7,'seed never overwrites or duplicates existing rows'); }
    finally {await reopened.close();}
    const token = randomBytes(32).toString('hex');
    server = await new Promise(resolve=>{const s=createApp({store:second,adminToken:token}).listen(0,'127.0.0.1',()=>resolve(s));});
    const base = `http://127.0.0.1:${server.address().port}`;
    const response = await fetch(`${base}/api/properties/${added.slug}/inquiries`,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({...inquiry,phone:'01123456789'})});
    assert.equal(response.status,201);
    assert.equal((await fetch(`${base}/readyz`)).status,200);
    assert.equal((await fetch(`${base}/api/admin/inquiries`)).status,401);
  } finally {
    if(server) await new Promise(resolve=>server.close(resolve));
    if(first) await first.close();
    if(second) await second.close();
    await root.query(`DROP SCHEMA ${schema} CASCADE`); await root.query(`DROP ROLE ${role}`); await root.end();
  }
});
