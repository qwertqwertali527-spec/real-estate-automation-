import { Router } from 'express';
import { all, get, run, now, logActivity } from '../db.js';
import { parseCsv } from '../util/csv.js';

const router = Router();

const NUMERIC = ['beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'price', 'assessed_value', 'last_sale_price', 'latitude', 'longitude'];
const FIELDS = ['source_id', 'source', 'address', 'city', 'state', 'zip', 'county', 'apn', 'property_type', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'price', 'assessed_value', 'last_sale_price', 'last_sale_date', 'owner_name', 'owner_mailing_address', 'status', 'latitude', 'longitude', 'notes'];
const STATUSES = ['new', 'active', 'prospect', 'under_contract', 'sold', 'archived'];

function clean(row) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in row) || row[k] === '' || row[k] === undefined || row[k] === null) continue;
    let v = row[k];
    if (NUMERIC.includes(k)) { const n = Number(String(v).replace(/[$,]/g, '')); if (!Number.isNaN(n)) v = n; else continue; }
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  return out;
}

// GET /api/properties — filters: q, status, type, city, source, min, max, beds, sort, limit, offset
router.get('/', (req, res) => {
  const { q, status, type, city, source, min, max, beds, sort = 'updated_desc' } = req.query;
  const limit = Math.min(Number(req.query.limit) || 100, 500);
  const offset = Number(req.query.offset) || 0;
  const where = [], args = [];
  if (q) {
    where.push('(address LIKE ? OR city LIKE ? OR zip LIKE ? OR apn LIKE ? OR owner_name LIKE ? OR source_id LIKE ?)');
    const like = `%${q}%`; args.push(like, like, like, like, like, like);
  }
  if (status) { where.push('status = ?'); args.push(status); }
  if (type) { where.push('property_type = ?'); args.push(type); }
  if (city) { where.push('city = ?'); args.push(city); }
  if (source) { where.push('source = ?'); args.push(source); }
  if (min) { where.push('price >= ?'); args.push(Number(min)); }
  if (max) { where.push('price <= ?'); args.push(Number(max)); }
  if (beds) { where.push('beds >= ?'); args.push(Number(beds)); }
  const order = {
    updated_desc: 'updated_at DESC', price_asc: 'price ASC', price_desc: 'price DESC',
    newest: 'created_at DESC', city: 'city ASC',
  }[sort] || 'updated_at DESC';
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const total = get(`SELECT COUNT(*) AS n FROM properties ${w}`, ...args).n;
  const rows = all(`SELECT * FROM properties ${w} ORDER BY ${order} LIMIT ? OFFSET ?`, ...args, limit, offset);
  res.json({ total, limit, offset, rows });
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM properties WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Property not found' });
  res.json(row);
});

router.post('/', (req, res) => {
  const p = clean(req.body || {});
  if (!p.address) return res.status(400).json({ error: 'address is required' });
  p.source = p.source || 'manual';
  p.status = p.status || 'new';
  const keys = Object.keys(p);
  const info = run(
    `INSERT INTO properties (${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(() => '?').join(',')}, ?, ?)`,
    ...keys.map((k) => p[k]), now(), now()
  );
  logActivity('property_added', 'property', info.lastInsertRowid, `Property added: ${p.address}`);
  res.status(201).json(get('SELECT * FROM properties WHERE id = ?', info.lastInsertRowid));
});

router.put('/:id', (req, res) => {
  const existing = get('SELECT * FROM properties WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Property not found' });
  const p = clean(req.body || {});
  if ('status' in p && !STATUSES.includes(p.status)) return res.status(400).json({ error: `status must be one of ${STATUSES.join(', ')}` });
  const keys = Object.keys(p);
  if (keys.length) {
    run(`UPDATE properties SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      ...keys.map((k) => p[k]), now(), existing.id);
    logActivity('property_updated', 'property', existing.id, `Property updated: ${existing.address}`);
  }
  res.json(get('SELECT * FROM properties WHERE id = ?', existing.id));
});

router.delete('/:id', (req, res) => {
  const existing = get('SELECT * FROM properties WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Property not found' });
  run('DELETE FROM properties WHERE id = ?', existing.id);
  logActivity('property_deleted', null, null, `Property deleted: ${existing.address}`);
  res.json({ ok: true });
});

// POST /api/properties/import  { csv: "..." } — bulk import from public-records CSV export
router.post('/import', (req, res) => {
  const csv = req.body?.csv;
  if (!csv || typeof csv !== 'string') return res.status(400).json({ error: 'csv text required in body.csv' });
  const rows = parseCsv(csv);
  if (!rows.length) return res.status(400).json({ error: 'No data rows found in CSV' });
  let imported = 0, updated = 0, failed = 0;
  const errors = [];
  for (const r of rows) {
    const p = clean(r);
    if (!p.address) { failed++; errors.push(`Row missing address: ${JSON.stringify(r).slice(0, 80)}`); continue; }
    p.source = p.source || 'csv_import';
    // dedupe on (source, source_id) or (address+zip)
    let existing = null;
    if (p.source_id) existing = get('SELECT id FROM properties WHERE source = ? AND source_id = ?', p.source, p.source_id);
    if (!existing && p.address) existing = get('SELECT id FROM properties WHERE lower(address) = lower(?) AND zip IS ?', p.address, p.zip ?? null);
    const keys = Object.keys(p);
    if (existing) {
      run(`UPDATE properties SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => p[k]), now(), existing.id);
      updated++;
    } else {
      run(`INSERT INTO properties (${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(() => '?').join(',')}, ?, ?)`,
        ...keys.map((k) => p[k]), now(), now());
      imported++;
    }
  }
  logActivity('import', 'property', null, `CSV import: ${imported} added, ${updated} updated, ${failed} failed`);
  res.json({ imported, updated, failed, errors: errors.slice(0, 10), total: rows.length });
});

export default router;
