// ── EstateFlow — Real Estate Automation Suite ──────────────────────────────
// Single-port deployment: REST API + built React dashboard.
import express from 'express';
import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import { seed } from './seed.js';
import { logActivity } from './db.js';

import properties from './routes/properties.js';
import contacts from './routes/contacts.js';
import conversations from './routes/conversations.js';
import ingest from './routes/ingest.js';
import dashboard from './routes/dashboard.js';
import settingsRoutes from './routes/settings.js';
import webhooks from './routes/webhooks.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const app = express();
app.disable('x-powered-by');
app.use(express.json({ limit: '10mb' }));

// CORS (hand-rolled — allows the Vite dev server and N8N to call the API)
app.use((req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,PATCH,DELETE,OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});

// Tiny request log
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) console.log(`${new Date().toISOString()} ${req.method} ${req.path}`);
  next();
});

app.get('/api/health', (req, res) => res.json({ ok: true, service: 'estateflow-api', time: new Date().toISOString() }));
app.use('/api/properties', properties);
app.use('/api/contacts', contacts);
app.use('/api/conversations', conversations);
app.use('/api/ingest', ingest);
app.use('/api/dashboard', dashboard);
app.use('/api/settings', settingsRoutes);
app.use('/api/webhooks', webhooks);

// Serve the built dashboard (frontend/dist)
const dist = path.join(__dirname, '..', '..', 'frontend', 'dist');
if (fs.existsSync(dist)) {
  app.use(express.static(dist));
  app.get('*', (req, res, next) => {
    if (req.path.startsWith('/api/')) return next();
    res.sendFile(path.join(dist, 'index.html'));
  });
} else {
  app.get('/', (req, res) => res.send('EstateFlow API running. Build the frontend (npm run build in /frontend) to serve the dashboard here.'));
}

// 404 + error handling
app.use('/api', (req, res) => res.status(404).json({ error: 'Not found' }));
app.use((err, req, res, next) => {
  console.error(err);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// Seed demo data on first boot
if (!seed(false)) console.log('Existing data found — skipping seed.');

const PORT = Number(process.env.PORT) || 3000;
app.listen(PORT, '0.0.0.0', () => {
  console.log(`EstateFlow server listening on http://0.0.0.0:${PORT}`);
  logActivity('system', null, null, 'Server started');
});
