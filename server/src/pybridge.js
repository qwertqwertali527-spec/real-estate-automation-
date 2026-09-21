// ── Python bridge ──────────────────────────────────────────────────────────
// The public-records connectors live in /pyworker (Python: requests +
// BeautifulSoup). The API spawns the CLI as a subprocess and exchanges JSON
// over stdio — keeps concerns split (Python = ingestion, Node = app logic)
// with no extra service to deploy.
import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PY_SCRIPT = path.join(__dirname, '..', '..', 'pyworker', 'scraper.py');

function runPython(args, payload = null, timeoutMs = 120000) {
  return new Promise((resolve) => {
    let child;
    try {
      child = spawn('python3', [PY_SCRIPT, ...args], { stdio: ['pipe', 'pipe', 'pipe'] });
    } catch (e) {
      return resolve({ ok: false, error: `Failed to spawn python3: ${e.message}` });
    }
    let out = '', err = '', done = false;
    const timer = setTimeout(() => {
      if (!done) { child.kill('SIGKILL'); resolve({ ok: false, error: 'Python worker timed out' }); done = true; }
    }, timeoutMs);
    child.stdout.on('data', (d) => (out += d));
    child.stderr.on('data', (d) => (err += d));
    child.on('error', (e) => { clearTimeout(timer); if (!done) { done = true; resolve({ ok: false, error: e.message }); } });
    child.on('close', (code) => {
      clearTimeout(timer);
      if (done) return;
      done = true;
      let data = null;
      try { data = JSON.parse(out.trim()); } catch { /* fallthrough */ }
      if (code === 0 && data) resolve({ ok: true, data });
      else resolve({ ok: false, error: (data && data.error) || (err || out || `Python worker exited with code ${code}`).slice(0, 2000) });
    });
    if (payload) {
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } else {
      child.stdin.end();
    }
  });
}

let bs4Cache;
export async function connectorAvailability() {
  if (bs4Cache) return bs4Cache;
  const r = await runPython(['check']);
  bs4Cache = r.ok ? r.data : { python: true, requests: false, bs4: false };
  return bs4Cache;
}

export function runConnector(connector, params) {
  return runPython(['run', '--connector', connector], params);
}
