const express = require('express');
const client = require('prom-client');
const { randomUUID, createHash, timingSafeEqual } = require('node:crypto');
const path = require('node:path');
const { validateProperty, validateInquiry, parseFilters } = require('./catalog');
const { openStore } = require('./store');
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function createApp({ store, adminToken }) {
  if (!adminToken || adminToken.length < 32) throw new Error('ADMIN_TOKEN must contain at least 32 characters.');
  const app = express();
  const register = new client.Registry();
  client.collectDefaultMetrics({ register });
  const requests = new client.Counter({ name: 'http_requests_total', help: 'HTTP requests.', labelNames: ['method', 'path', 'status_code'], registers: [register] });
  const duration = new client.Histogram({ name: 'http_request_duration_seconds', help: 'HTTP response duration.', labelNames: ['method', 'path'], registers: [register] });
  const inquiries = new client.Counter({ name: 'property_viewing_requests_total', help: 'Accepted property viewing requests.', registers: [register] });
  app.disable('x-powered-by');
  app.use((req, res, next) => {
    req.requestId = randomUUID();
    res.set({ 'X-Request-ID': req.requestId, 'X-Content-Type-Options': 'nosniff', 'Content-Security-Policy': "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'", 'Referrer-Policy': 'no-referrer' });
    const stop = duration.startTimer();
    res.on('finish', () => {
      const route = req.route?.path || (req.path === '/' ? '/' : 'unmatched');
      requests.inc({ method: req.method, path: route, status_code: String(res.statusCode) });
      stop({ method: req.method, path: route });
      if (!['/metrics', '/healthz', '/readyz'].includes(route)) console.log(JSON.stringify({ requestId: req.requestId, method: req.method, route, status: res.statusCode }));
    });
    next();
  });
  app.use('/api', (_req, res, next) => { res.set('Cache-Control', 'no-store'); next(); });
  app.use(express.json({ limit: '8kb', strict: true }));
  const wrap = fn => (req, res, next) => Promise.resolve(fn(req, res)).catch(next);
  const json = (req, res, next) => req.is('application/json') ? next() : res.status(415).json({ error: 'Use application/json.' });
  const admin = (req, res, next) => {
    const provided = createHash('sha256').update(req.get('authorization') || '').digest();
    const expected = createHash('sha256').update(`Bearer ${adminToken}`).digest();
    if (!timingSafeEqual(provided, expected)) return res.status(401).json({ error: 'Administrator token required.' });
    next();
  };
  const validate = (fn, body) => { try { return fn(body); } catch (error) { error.status = 400; throw error; } };
  app.get('/healthz', (_req, res) => res.type('text').send('ok\n'));
  app.get('/readyz', wrap(async (_req, res) => { await store.ready(); res.type('text').send('ready\n'); }));
  app.get('/api/version', (_req, res) => res.json({ version: process.env.APP_VERSION || 'dev' }));
  app.get('/api/properties', wrap(async (req, res) => res.json({ properties: await store.list(validate(parseFilters, req.query)) })));
  app.get('/api/properties/:slug', wrap(async (req, res) => {
    const property = await store.get(req.params.slug);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    res.json({ property });
  }));
  app.post('/api/properties/:slug/inquiries', json, wrap(async (req, res) => {
    const inquiry = validate(validateInquiry, req.body);
    const property = await store.get(req.params.slug);
    if (!property) return res.status(404).json({ error: 'Property not found.' });
    const result = await store.inquire(property.id, inquiry);
    if (!result) return res.status(429).set('Retry-After', '3600').json({ error: 'Too many requests for this phone number. Try again in an hour.' });
    inquiries.inc();
    res.status(201).json(result);
  }));
  app.post('/api/admin/properties', admin, json, wrap(async (req, res) => res.status(201).json({ property: await store.add(validate(validateProperty, req.body)) })));
  app.get('/api/admin/inquiries', admin, wrap(async (_req, res) => res.json({ inquiries: await store.inquiries() })));
  app.patch('/api/admin/inquiries/:id', admin, json, wrap(async (req, res) => {
    if (!uuid.test(req.params.id) || !['new', 'contacted', 'closed'].includes(req.body?.status)) return res.status(400).json({ error: 'Invalid inquiry ID or status.' });
    const inquiry = await store.updateInquiry(req.params.id, req.body.status);
    if (!inquiry) return res.status(404).json({ error: 'Inquiry not found.' });
    res.json(inquiry);
  }));
  app.get('/metrics', wrap(async (_req, res) => res.type(register.contentType).send(await register.metrics())));
  app.use(express.static(path.join(__dirname, 'web')));
  app.use((_req, res) => res.status(404).json({ error: 'Not found.' }));
  app.use((error, req, res, _next) => {
    const status = error.type === 'entity.too.large' ? 413 : error instanceof SyntaxError ? 400 : error.status === 400 ? 400 : 503;
    res.status(status).json({ error: status === 413 ? 'Request too large.' : status === 400 ? (error instanceof SyntaxError ? 'Invalid JSON.' : error.message) : 'Service temporarily unavailable.', requestId: req.requestId });
  });
  return app;
}
async function start() {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required.');
  const adminToken = process.env.ADMIN_TOKEN;
  if (!adminToken || adminToken.length < 32) throw new Error('ADMIN_TOKEN must contain at least 32 characters.');
  const store = await openStore(process.env.DATABASE_URL);
  const server = createApp({ store, adminToken }).listen(process.env.PORT || 3000, () => console.log('Makan property service listening'));
  process.on('SIGTERM', () => {
    server.close(async () => { await store.close(); process.exit(0); });
    setTimeout(() => process.exit(1), 10000).unref();
  });
}
if (require.main === module) start().catch(() => { console.error('Startup failed. Check database availability and required configuration.'); process.exitCode = 1; });
module.exports = { createApp };
