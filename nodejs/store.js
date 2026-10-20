const { Pool } = require('pg');
const { seedProperties } = require('./catalog');

async function openStore(connectionString) {
  const pool = new Pool({ connectionString, max: 5, connectionTimeoutMillis: 3000, query_timeout: 5000, idleTimeoutMillis: 30000 });
  pool.on('error', () => console.error(JSON.stringify({ event: 'database_connection_error' })));
  const db = await pool.connect();
  let initializationError;
  try {
    await db.query('BEGIN');
    await db.query('SELECT pg_advisory_xact_lock(720201)');
    await db.query(`CREATE TABLE IF NOT EXISTS properties (
      id UUID PRIMARY KEY, slug TEXT UNIQUE NOT NULL, title TEXT NOT NULL, location TEXT NOT NULL,
      type TEXT NOT NULL, price BIGINT NOT NULL, bedrooms INTEGER NOT NULL, area INTEGER NOT NULL,
      description TEXT NOT NULL, image TEXT NOT NULL, featured BOOLEAN NOT NULL DEFAULT false,
      created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    ); CREATE TABLE IF NOT EXISTS inquiries (
      id UUID PRIMARY KEY, property_id UUID NOT NULL REFERENCES properties(id), name TEXT NOT NULL,
      phone TEXT NOT NULL, message TEXT NOT NULL DEFAULT '', status TEXT NOT NULL DEFAULT 'new'
      CHECK (status IN ('new','contacted','closed')), created_at TIMESTAMPTZ NOT NULL DEFAULT now()
    ); CREATE INDEX IF NOT EXISTS inquiries_phone_created_idx ON inquiries(phone, created_at);`);
    for (const p of seedProperties) await db.query(`INSERT INTO properties (id,slug,title,location,type,price,bedrooms,area,description,image,featured)
      VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) ON CONFLICT(slug) DO NOTHING`, [require('node:crypto').randomUUID(), p.slug, p.title, p.location, p.type, p.price, p.bedrooms, p.area, p.description, p.image, p.featured]);
    await db.query('COMMIT');
  } catch (error) { await db.query('ROLLBACK').catch(() => {}); initializationError = error; }
  finally { db.release(); }
  if (initializationError) { await pool.end(); throw initializationError; }
  const select = `SELECT id, slug, title, location, type, price::float8 AS price, bedrooms, area, description, image, featured FROM properties`;
  return {
    ready: async () => { await pool.query('SELECT 1'); },
    close: () => pool.end(),
    list: async f => {
      const order = { featured: 'featured DESC, created_at DESC', 'price-asc': 'price ASC', 'price-desc': 'price DESC' }[f.sort];
      const { rows } = await pool.query(`${select} WHERE ($1='' OR title ILIKE '%' || $1 || '%' OR description ILIKE '%' || $1 || '%') AND ($2='' OR location=$2) AND ($3='' OR type=$3) AND ($4::bigint IS NULL OR price <= $4) AND ($5::int IS NULL OR bedrooms >= $5) ORDER BY ${order}, id LIMIT 100`, [f.q, f.location, f.type, f.maxPrice, f.bedrooms]);
      return rows;
    },
    get: async slug => (await pool.query(`${select} WHERE slug=$1`, [slug])).rows[0],
    add: async p => {
      const id = require('node:crypto').randomUUID();
      const slug = `home-${id}`;
      await pool.query(`INSERT INTO properties (id,slug,title,location,type,price,bedrooms,area,description,image) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`, [id,slug,p.title,p.location,p.type,p.price,p.bedrooms,p.area,p.description,p.image]);
      return { id, slug, ...p };
    },
    inquire: async (propertyId, inquiry) => {
      const conn = await pool.connect();
      try {
        await conn.query('BEGIN');
        await conn.query('SELECT pg_advisory_xact_lock(hashtext($1))', [inquiry.phone]);
        const { rows } = await conn.query(`SELECT count(*)::int AS count FROM inquiries WHERE phone=$1 AND created_at > now() - interval '1 hour'`, [inquiry.phone]);
        if (rows[0].count >= 3) { await conn.query('ROLLBACK'); return null; }
        const id = require('node:crypto').randomUUID();
        await conn.query('INSERT INTO inquiries (id,property_id,name,phone,message) VALUES ($1,$2,$3,$4,$5)', [id,propertyId,inquiry.name,inquiry.phone,inquiry.message]);
        await conn.query('COMMIT');
        return { id, status: 'new' };
      } catch (error) { await conn.query('ROLLBACK'); throw error; }
      finally { conn.release(); }
    },
    inquiries: async () => (await pool.query(`SELECT i.id,i.name,i.phone,i.message,i.status,i.created_at,p.title AS property FROM inquiries i JOIN properties p ON p.id=i.property_id ORDER BY i.created_at DESC LIMIT 100`)).rows,
    updateInquiry: async (id, status) => (await pool.query('UPDATE inquiries SET status=$2 WHERE id=$1 RETURNING id,status', [id,status])).rows[0],
  };
}
module.exports = { openStore };
