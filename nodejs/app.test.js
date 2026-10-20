const { test, after, before } = require('node:test');
const assert = require('node:assert/strict');
const { randomBytes } = require('node:crypto');
const { createApp } = require('./index');
const { validateProperty, validateInquiry, parseFilters, seedProperties } = require('./catalog');
const token = randomBytes(32).toString('hex');
let server, base, databaseDown = false, captured;
const property = { ...seedProperties[0], id: 'e6c453ea-4216-4e35-81c6-0e29cd76ff21' };
before(async () => {
  const app = createApp({ adminToken: token, store: {
    ready: async () => { if (databaseDown) throw new Error('down'); },
    list: async filters => { captured = filters; return [property]; },
    get: async slug => slug === property.slug ? property : undefined,
    inquire: async (_id, input) => input.phone === '1234567890' ? null : { id: property.id, status: 'new' },
    inquiries: async () => [{ id: property.id, phone: 'private-contact', name: 'Test' }],
    add: async p => p,
    updateInquiry: async (id, status) => id === property.id ? { id, status } : undefined,
  } });
  server = await new Promise(resolve => { const handle = app.listen(0, '127.0.0.1', () => resolve(handle)); });
  base = `http://127.0.0.1:${server.address().port}`;
});
after(() => new Promise(resolve => server.close(resolve)));
const post = (body, auth) => ({ method: 'POST', headers: { 'Content-Type': 'application/json', ...(auth ? { Authorization: `Bearer ${auth}` } : {}) }, body: JSON.stringify(body) });
test('catalog validates filters and rejects structured, unsafe and unknown input', async () => {
  let response = await fetch(`${base}/api/properties?location=Maadi&maxPrice=3000000&sort=price-asc`);
  assert.equal(response.status, 200); assert.equal(captured.maxPrice, 3000000); assert.equal(captured.location, 'Maadi');
  for (const query of ['maxPrice=-1', 'maxPrice=Infinity', 'sort=DROP', 'location[x]=Maadi', 'unknown=1']) assert.equal((await fetch(`${base}/api/properties?${query}`)).status, 400);
  assert.throws(() => parseFilters({ q: ['a','b'] }));
});
test('private contacts and property writes require the administrator credential', async () => {
  assert.equal((await fetch(`${base}/api/admin/inquiries`)).status, 401);
  assert.equal((await fetch(`${base}/api/admin/inquiries`, { headers: { Authorization: 'Bearer invalid' } })).status, 401);
  const response = await fetch(`${base}/api/admin/inquiries`, { headers: { Authorization: `Bearer ${token}` } });
  assert.equal(response.status, 200); assert.match(await response.text(), /private-contact/);
  assert.equal((await fetch(`${base}/api/admin/properties`, post(property))).status, 401);
  assert.equal((await fetch(`${base}/api/admin/properties`, post(property,token))).status, 201);
});
test('viewing requests validate data, respect limits and do not expose contact details', async () => {
  let response = await fetch(`${base}/api/properties/${property.slug}/inquiries`, post({ name:'Demo visitor', phone:'+20 100 234 5678' }));
  assert.equal(response.status, 201); assert.deepEqual(await response.json(), { id: property.id, status: 'new' });
  response = await fetch(`${base}/api/properties/${property.slug}/inquiries`, post({ name:'Demo visitor', phone:'1234567890' }));
  assert.equal(response.status, 429); assert.equal(response.headers.get('retry-after'),'3600');
  assert.equal((await fetch(`${base}/api/properties/${property.slug}/inquiries`, post({ name:'X',phone:'invalid' }))).status,400);
  assert.equal((await fetch(`${base}/api/properties/absent/inquiries`, post({ name:'Demo',phone:'123456789' }))).status,404);
});
test('request status changes are validated and missing records return 404', async () => {
  const change = status => ({ ...post({ status },token), method:'PATCH' });
  assert.equal((await fetch(`${base}/api/admin/inquiries/${property.id}`,change('closed'))).status,200);
  assert.equal((await fetch(`${base}/api/admin/inquiries/${property.id}`,change('deleted'))).status,400);
  assert.equal((await fetch(`${base}/api/admin/inquiries/not-a-uuid`,change('closed'))).status,400);
  assert.equal((await fetch(`${base}/api/admin/inquiries/00000000-0000-0000-0000-000000000000`,change('closed'))).status,404);
});
test('liveness survives a dependency failure while readiness does not', async () => {
  databaseDown = true;
  assert.equal((await fetch(`${base}/healthz`)).status,200);
  assert.equal((await fetch(`${base}/readyz`)).status,503);
  databaseDown = false;
  assert.equal((await fetch(`${base}/readyz`)).status,200);
});
test('malformed and oversized JSON fail cleanly; metrics use route templates', async () => {
  const url = `${base}/api/properties/${property.slug}/inquiries`;
  assert.equal((await fetch(url,{method:'POST',headers:{'Content-Type':'application/json'},body:'{'})).status,400);
  assert.equal((await fetch(url,post({name:'x'.repeat(10000)}))).status,413);
  const response = await fetch(`${base}/api/properties/absent`);
  assert.equal(response.status,404); assert.ok(response.headers.get('x-request-id'));
  const metrics = await (await fetch(`${base}/metrics`)).text();
  assert.match(metrics,/path="\/api\/properties\/:slug"/);
  assert.doesNotMatch(metrics,/path="\/api\/properties\/garden-residence"/);
});
test('property validation rejects unsupported types and invalid prices', () => {
  assert.equal(validateProperty(property).title, property.title);
  for (const patch of [{ price:-1 },{ price:1.5 },{ type:'warehouse' },{ bedrooms:0 },{ area:0 },{ description:'short' }]) assert.throws(()=>validateProperty({...property,...patch}));
  assert.equal(validateInquiry({name:'Demo',phone:'+20 (100) 123-4567'}).phone,'+201001234567');
});
