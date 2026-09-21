import { Router } from 'express';
import { all, get, run, now, logActivity } from '../db.js';
import { parseCsv } from '../util/csv.js';

const router = Router();

const TYPES = ['buyer', 'seller', 'renter', 'investor', 'agent', 'vendor'];
const STAGES = ['new', 'contacted', 'qualified', 'negotiating', 'closed', 'lost'];
const FIELDS = ['name', 'email', 'phone', 'type', 'stage', 'budget_min', 'budget_max', 'preferred_locations', 'notes', 'source'];

function clean(row) {
  const out = {};
  for (const k of FIELDS) {
    if (!(k in row) || row[k] === '' || row[k] === undefined || row[k] === null) continue;
    let v = row[k];
    if (k === 'budget_min' || k === 'budget_max') { const n = Number(String(v).replace(/[$,]/g, '')); if (Number.isNaN(n)) continue; v = n; }
    out[k] = typeof v === 'string' ? v.trim() : v;
  }
  if ('tags' in row) {
    out.tags = Array.isArray(row.tags) ? row.tags
      : String(row.tags).split(',').map((t) => t.trim()).filter(Boolean);
  }
  return out;
}

function serialize(c) {
  return { ...c, tags: JSON.parse(c.tags || '[]') };
}

// GET /api/contacts — filters: q, type, stage, tag, sort
router.get('/', (req, res) => {
  const { q, type, stage, tag } = req.query;
  const where = [], args = [];
  if (q) { where.push('(name LIKE ? OR email LIKE ? OR phone LIKE ? OR preferred_locations LIKE ?)'); const l = `%${q}%`; args.push(l, l, l, l); }
  if (type) { where.push('type = ?'); args.push(type); }
  if (stage) { where.push('stage = ?'); args.push(stage); }
  if (tag) { where.push("EXISTS (SELECT 1 FROM json_each(contacts.tags) WHERE json_each.value = ?)"); args.push(tag); }
  const w = where.length ? `WHERE ${where.join(' AND ')}` : '';
  const rows = all(
    `SELECT c.*, (SELECT COUNT(*) FROM conversations cv WHERE cv.contact_id = c.id) AS conversations_count
     FROM contacts c ${w} ORDER BY c.updated_at DESC LIMIT 500`, ...args);
  const counts = {
    total: get('SELECT COUNT(*) AS n FROM contacts').n,
    byStage: Object.fromEntries(all('SELECT stage, COUNT(*) AS n FROM contacts GROUP BY stage').map((r) => [r.stage, r.n])),
  };
  res.json({ rows: rows.map(serialize), counts });
});

router.get('/:id', (req, res) => {
  const row = get('SELECT * FROM contacts WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Contact not found' });
  const conversations = all(
    `SELECT cv.*, (SELECT COUNT(*) FROM messages m WHERE m.conversation_id = cv.id) AS messages_count
     FROM conversations cv WHERE cv.contact_id = ? ORDER BY cv.last_message_at DESC`, row.id);
  res.json({ ...serialize(row), conversations });
});

router.post('/', (req, res) => {
  const c = clean(req.body || {});
  if (!c.name) return res.status(400).json({ error: 'name is required' });
  if ('type' in c && !TYPES.includes(c.type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  if ('stage' in c && !STAGES.includes(c.stage)) return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  c.type = c.type || 'buyer'; c.stage = c.stage || 'new';
  c.tags = JSON.stringify(c.tags || []);
  const keys = Object.keys(c);
  const info = run(`INSERT INTO contacts (${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(() => '?').join(',')}, ?, ?)`,
    ...keys.map((k) => c[k]), now(), now());
  logActivity('contact_added', 'contact', info.lastInsertRowid, `Contact added: ${c.name}`);
  res.status(201).json(serialize(get('SELECT * FROM contacts WHERE id = ?', info.lastInsertRowid)));
});

router.put('/:id', (req, res) => {
  const existing = get('SELECT * FROM contacts WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  const c = clean(req.body || {});
  if ('type' in c && !TYPES.includes(c.type)) return res.status(400).json({ error: `type must be one of ${TYPES.join(', ')}` });
  if ('stage' in c && !STAGES.includes(c.stage)) return res.status(400).json({ error: `stage must be one of ${STAGES.join(', ')}` });
  if ('tags' in c) c.tags = JSON.stringify(c.tags || []);
  const keys = Object.keys(c);
  if (keys.length) {
    if ('stage' in c && c.stage !== existing.stage)
      logActivity('stage_change', 'contact', existing.id, `${existing.name} moved to ${c.stage}`);
    run(`UPDATE contacts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`,
      ...keys.map((k) => c[k]), now(), existing.id);
  }
  res.json(serialize(get('SELECT * FROM contacts WHERE id = ?', existing.id)));
});

router.delete('/:id', (req, res) => {
  const existing = get('SELECT * FROM contacts WHERE id = ?', req.params.id);
  if (!existing) return res.status(404).json({ error: 'Contact not found' });
  run('DELETE FROM contacts WHERE id = ?', existing.id);
  logActivity('contact_deleted', null, null, `Contact deleted: ${existing.name}`);
  res.json({ ok: true });
});

// POST /api/contacts/import { csv }
router.post('/import', (req, res) => {
  const rows = parseCsv(req.body?.csv || '');
  if (!rows.length) return res.status(400).json({ error: 'No data rows found in CSV' });
  let imported = 0, updated = 0, failed = 0;
  const errors = [];
  for (const r of rows) {
    const c = clean(r);
    if (!c.name && !c.email && !c.phone) { failed++; continue; }
    if (!c.name) c.name = c.email || c.phone;
    c.type = c.type && TYPES.includes(c.type) ? c.type : 'buyer';
    c.stage = c.stage && STAGES.includes(c.stage) ? c.stage : 'new';
    c.source = c.source || 'csv_import';
    const existing = c.email ? get('SELECT id FROM contacts WHERE lower(email) = lower(?)', c.email)
      : c.phone ? get('SELECT id FROM contacts WHERE phone = ?', c.phone) : null;
    c.tags = JSON.stringify(c.tags || []);
    const keys = Object.keys(c);
    if (existing) {
      run(`UPDATE contacts SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => c[k]), now(), existing.id);
      updated++;
    } else {
      run(`INSERT INTO contacts (${keys.join(',')}, created_at, updated_at) VALUES (${keys.map(() => '?').join(',')}, ?, ?)`, ...keys.map((k) => c[k]), now(), now());
      imported++;
    }
  }
  logActivity('import', 'contact', null, `Contact CSV import: ${imported} added, ${updated} updated, ${failed} failed`);
  res.json({ imported, updated, failed, errors, total: rows.length });
});

export default router;
