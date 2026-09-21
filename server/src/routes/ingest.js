// Public-records ingestion orchestrator. Runs Python connectors as
// subprocesses, tracks every run, and upserts records into the property
// database (dedupe on source+source_id, then address+zip).
import { Router } from 'express';
import { all, get, run, now, logActivity } from '../db.js';
import { runConnector, connectorAvailability } from '../pybridge.js';

const router = Router();

const CONNECTORS = [
  {
    id: 'sample', name: 'County Sample Feed (offline)', requires: [],
    description: 'Deterministic synthetic "Maricopa County" public-records feed — lets you exercise the full ingestion pipeline with zero external dependencies.',
    params: [
      { name: 'limit', label: 'Max records', type: 'number', default: 8 },
      { name: 'city', label: 'City filter', type: 'text', default: '' },
      { name: 'state', label: 'State', type: 'text', default: 'AZ' },
    ],
  },
  {
    id: 'csv', name: 'CSV Records Import', requires: [],
    description: 'Parse a county assessor/recorder CSV export (uploaded from your machine) straight into the property database.',
    params: [{ name: 'path', label: 'Path to CSV file', type: 'text', default: '' }],
  },
  {
    id: 'http', name: 'Generic HTTP Scraper', requires: ['requests', 'bs4'],
    description: 'Fetch any public-records page (assessor portal, IDX feed, JSON endpoint) and map fields with configurable selectors.',
    params: [
      { name: 'url', label: 'URL', type: 'text', default: '' },
      { name: 'format', label: 'Response format (json|html)', type: 'text', default: 'html' },
      { name: 'item_selector', label: 'Item selector (CSS or JSON key path)', type: 'text', default: '.property-record' },
      { name: 'fields', label: 'Field map (JSON: field -> selector/key)', type: 'textarea', default: '{"address": ".addr", "price": ".price", "owner_name": ".owner"}' },
      { name: 'limit', label: 'Max records', type: 'number', default: 20 },
    ],
  },
];

router.get('/connectors', async (req, res) => {
  const avail = await connectorAvailability();
  res.json(CONNECTORS.map((c) => ({ ...c, available: c.requires.every((r) => avail[r]) })));
});

router.get('/runs', (req, res) => {
  const rows = all('SELECT id, connector, params, status, records_found, records_imported, error, started_at, finished_at FROM ingest_runs ORDER BY id DESC LIMIT 100');
  res.json({ rows });
});

router.get('/runs/:id', (req, res) => {
  const row = get('SELECT * FROM ingest_runs WHERE id = ?', req.params.id);
  if (!row) return res.status(404).json({ error: 'Run not found' });
  res.json({ ...row, params: JSON.parse(row.params || '{}'), log: JSON.parse(row.log || '[]') });
});

function upsertProperty(rec) {
  const p = {};
  for (const k of ['source_id', 'address', 'city', 'state', 'zip', 'county', 'apn', 'property_type', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'price', 'assessed_value', 'last_sale_price', 'last_sale_date', 'owner_name', 'owner_mailing_address', 'latitude', 'longitude']) {
    if (rec[k] !== undefined && rec[k] !== null && rec[k] !== '') p[k] = rec[k];
  }
  if (!p.address) return null;
  for (const k of ['beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'price', 'assessed_value', 'last_sale_price', 'latitude', 'longitude']) {
    if (k in p) { const n = Number(String(p[k]).replace(/[$,]/g, '')); if (Number.isNaN(n)) delete p[k]; else p[k] = n; }
  }
  const source = rec.source || 'ingest';
  let existing = null;
  if (p.source_id) existing = get('SELECT id FROM properties WHERE source = ? AND source_id = ?', source, p.source_id);
  if (!existing) existing = get('SELECT id FROM properties WHERE lower(address) = lower(?) AND zip IS ?', p.address, p.zip ?? null);
  if (existing) {
    const keys = Object.keys(p);
    run(`UPDATE properties SET ${keys.map((k) => `${k} = ?`).join(', ')}, updated_at = ? WHERE id = ?`, ...keys.map((k) => p[k]), now(), existing.id);
    return { action: 'updated', id: existing.id };
  }
  const keys = Object.keys(p);
  const info = run(
    `INSERT INTO properties (source, ${keys.join(',')}, status, created_at, updated_at) VALUES (?, ${keys.map(() => '?').join(',')}, 'new', ?, ?)`,
    source, ...keys.map((k) => p[k]), now(), now()
  );
  return { action: 'inserted', id: info.lastInsertRowid };
}

router.post('/run', async (req, res) => {
  const { connector } = req.body || {};
  const params = req.body?.params || {};
  if (!CONNECTORS.some((c) => c.id === connector)) return res.status(400).json({ error: 'Unknown connector' });
  const info = run('INSERT INTO ingest_runs (connector, params, started_at) VALUES (?,?,?)', connector, JSON.stringify(params), now());
  const runId = info.lastInsertRowid;

  const result = await runConnector(connector, params);

  if (!result.ok) {
    const log = [`connector=${connector}`, `ERROR: ${result.error}`];
    run("UPDATE ingest_runs SET status = 'error', error = ?, finished_at = ? WHERE id = ?", String(result.error).slice(0, 1900), now(), runId);
    logActivity('ingest_failed', 'ingest_run', runId, `Ingest failed (${connector}): ${String(result.error).slice(0, 120)}`);
    return res.json({ run_id: runId, status: 'error', error: result.error, log });
  }
  const { records = [], log = [] } = result.data || {};
  let inserted = 0, updated = 0, skipped = 0;
  for (const rec of records) {
    try {
      const r = upsertProperty({ ...rec, source: rec.source || connector });
      if (!r) { skipped++; continue; }
      if (r.action === 'inserted') inserted++; else updated++;
    } catch { skipped++; }
  }
  const fullLog = [
    ...log,
    `imported: ${inserted} inserted, ${updated} updated, ${skipped} skipped`,
  ];
  run(
    "UPDATE ingest_runs SET status = 'success', records_found = ?, records_imported = ?, log = ?, finished_at = ? WHERE id = ?",
    records.length, inserted, JSON.stringify(fullLog), now(), runId
  );
  logActivity('ingest_completed', 'ingest_run', runId,
    `Public records ingest (${connector}): +${inserted} new, ${updated} updated`);
  res.json({ run_id: runId, status: 'success', records_found: records.length, inserted, updated, skipped, log: fullLog });
});

export default router;
