import React, { useEffect, useRef, useState } from 'react';
import { api, fmtTime } from '../api.js';
import { Badge, Spinner, Empty, useToast } from '../components/ui.jsx';

export default function Ingest() {
  const toast = useToast();
  const [connectors, setConnectors] = useState(null);
  const [runs, setRuns] = useState([]);
  const [params, setParams] = useState({});
  const [running, setRunning] = useState(null);
  const [activeRun, setActiveRun] = useState(null);
  const csvRef = useRef(null);
  const pollRef = useRef(null);

  const loadRuns = async () => {
    try { setRuns((await api.get('/ingest/runs')).rows); } catch { /* noop */ }
  };

  useEffect(() => {
    api.get('/ingest/connectors').then(setConnectors).catch(() => setConnectors([]));
    loadRuns();
    return () => clearInterval(pollRef.current);
  }, []);

  const setP = (id, k) => (e) => setParams((p) => ({ ...p, [id]: { ...p[id], [k]: e.target.value } }));

  const run = async (conn) => {
    setRunning(conn.id);
    setActiveRun(null);
    clearInterval(pollRef.current);
    try {
      const clean = Object.fromEntries(Object.entries(params[conn.id] || {}).filter(([, v]) => v !== '' && v != null));
      const defaults = Object.fromEntries(conn.params.filter((p) => p.default !== '').map((p) => [p.name, p.default]));
      const d = await api.post('/ingest/run', { connector: conn.id, params: { ...defaults, ...clean } });
      setActiveRun(d);
      toast(`Ingest ${d.status}: +${d.inserted} new, ${d.updated} updated`);
      loadRuns();
    } catch (e) {
      toast(e.message, true);
      loadRuns();
    }
    setRunning(null);
  };

  const importCsv = async (file) => {
    setRunning('csv');
    try {
      const text = await file.text();
      const d = await api.post('/properties/import', { csv: text });
      setActiveRun({
        status: 'success', connector: 'csv_import',
        log: [`parsed ${d.total} rows`, `${d.imported} inserted, ${d.updated} updated, ${d.failed} failed`, ...d.errors],
        inserted: d.imported, updated: d.updated,
      });
      toast(`CSV import: +${d.imported} new, ${d.updated} updated, ${d.failed} failed`);
      loadRuns();
    } catch (e) { toast(e.message, true); }
    setRunning(null);
  };

  return (
    <div>
      <div className="card card-pad">
        <h3 className="card-title">Data sources</h3>
        <div className="card-sub">
          Connectors run as isolated Python workers, write into the property database with automatic dedupe
          (source + source_id / address + zip). Every run is logged below.
        </div>
      </div>

      {connectors === null ? <Spinner /> : (
        <div className="mt" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
          {connectors.map((c) => (
            <div className="card connector-card" key={c.id} style={{ opacity: c.available ? 1 : 0.55 }}>
              <div className="spread">
                <div style={{ fontWeight: 700 }}>{c.name}</div>
                <Badge v={c.available ? 'success' : 'error'}>{c.available ? 'ready' : 'needs deps'}</Badge>
              </div>
              <div className="small muted" style={{ lineHeight: 1.5 }}>{c.description}</div>
              {!c.available && (
                <div className="tiny mono" style={{ color: 'var(--amber)' }}>pip3 install -r pyworker/requirements.txt</div>
              )}
              {c.params.map((p) =>
                p.type === 'textarea' ? (
                  <div key={p.name}>
                    <label className="label">{p.label}</label>
                    <textarea className="textarea mono" rows={3} value={params[c.id]?.[p.name] ?? p.default} onChange={setP(c.id, p.name)} />
                  </div>
                ) : (
                  <div key={p.name}>
                    <label className="label">{p.label}</label>
                    <input className="input" type={p.type === 'number' ? 'number' : 'text'} value={params[c.id]?.[p.name] ?? p.default} onChange={setP(c.id, p.name)} />
                  </div>
                )
              )}
              {c.id === 'csv' && (
                <>
                  <input ref={csvRef} type="file" accept=".csv" style={{ display: 'none' }} onChange={(e) => e.target.files[0] && importCsv(e.target.files[0])} />
                  <button className="btn" onClick={() => csvRef.current?.click()} disabled={running === 'csv'}>
                    {running === 'csv' ? 'Importing…' : '⇡ Upload CSV export'}
                  </button>
                </>
              )}
              {c.id !== 'csv' && (
                <button className="btn btn-primary" onClick={() => run(c)} disabled={running || !c.available}>
                  {running === c.id ? 'Running…' : '▶ Run connector'}
                </button>
              )}
            </div>
          ))}
        </div>
      )}

      {activeRun && (
        <div className="card card-pad mt">
          <div className="spread">
            <div>
              <h3 className="card-title">Last run result <Badge v={activeRun.status} /></h3>
              <div className="card-sub">
                {activeRun.connector}
                {activeRun.records_found !== undefined && ` · ${activeRun.records_found} records found`}
                {activeRun.inserted !== undefined && ` · +${activeRun.inserted} new · ${activeRun.updated} updated`}
              </div>
            </div>
          </div>
          <div className="log-box mono tiny mt-sm">
            {(activeRun.log || []).map((l, i) => <div key={i}>{l}</div>)}
          </div>
        </div>
      )}

      <div className="card mt">
        <div className="card-pad" style={{ paddingBottom: 0 }}>
          <h3 className="card-title">Run history</h3>
        </div>
        {runs.length === 0 ? <Empty>No ingest runs yet — run a connector above.</Empty> : (
          <table className="table">
            <thead><tr><th>#</th><th>Connector</th><th>Status</th><th className="num">Found</th><th className="num">Imported</th><th>Started</th><th>Finished</th><th /></tr></thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id}>
                  <td className="mono muted">{r.id}</td>
                  <td style={{ fontWeight: 600 }}>{r.connector}</td>
                  <td><Badge v={r.status} /></td>
                  <td className="num">{r.records_found}</td>
                  <td className="num">+{r.records_imported}</td>
                  <td className="small muted">{r.started_at?.slice(0, 19)}</td>
                  <td className="small muted">{r.finished_at ? fmtTime(r.finished_at) : '—'}</td>
                  <td>
                    <button className="btn btn-sm btn-ghost" onClick={async () => {
                      const d = await api.get(`/ingest/runs/${r.id}`);
                      setActiveRun(d);
                      window.scrollTo({ top: 0, behavior: 'smooth' });
                    }}>log</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
