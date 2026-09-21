import React, { useEffect, useState } from 'react';
import { api } from '../api.js';
import { Toggle, Spinner, useToast, useApp } from '../components/ui.jsx';

const PROVIDERS = [
  { id: 'auto', name: 'Auto', desc: 'Use OpenAI if a key exists, else Claude, else the offline engine.' },
  { id: 'openai', name: 'OpenAI', desc: 'GPT models via the OpenAI API.' },
  { id: 'anthropic', name: 'Claude', desc: 'Claude models via the Anthropic API.' },
  { id: 'mock', name: 'Offline engine', desc: 'Built-in deterministic NLP — no API keys, no cost. Great for demos.' },
];

export default function SettingsPage() {
  const toast = useToast();
  const { aiStatus, refreshAi } = useApp();
  const [form, setForm] = useState(null);
  const [busy, setBusy] = useState(false);
  const [test, setTest] = useState(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (aiStatus) {
      setForm({
        aiProvider: aiStatus.preference || 'auto',
        openaiKey: aiStatus.openai?.configured ? aiStatus.openai.keyMasked : '',
        anthropicKey: aiStatus.anthropic?.configured ? aiStatus.anthropic.keyMasked : '',
        business: aiStatus.business || {},
        autopilotDefault: aiStatus.autopilotDefault !== false,
      });
    }
  }, [aiStatus]);

  if (!form || !aiStatus) return <Spinner />;
  const ch = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const chB = (k) => (e) => setForm({ ...form, business: { ...form.business, [k]: e.target.value } });

  const save = async () => {
    setBusy(true);
    try {
      await api.put('/settings/ai', {
        aiProvider: form.aiProvider,
        openaiKey: form.openaiKey,
        anthropicKey: form.anthropicKey,
        business: form.business,
        autopilotDefault: form.autopilotDefault,
      });
      await refreshAi();
      toast('Settings saved');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  const runTest = async () => {
    setBusy(true); setTest(null);
    try {
      const d = await api.post('/settings/ai/test');
      setTest(d);
      toast(`Test ok — provider: ${d.provider}, intent: ${d.intent}`);
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };

  const webhookUrl = `${window.location.origin}/api/webhooks/inbound`;
  const curl = `curl -X POST ${webhookUrl} \\\n  -H "Content-Type: application/json" \\\n  -d '{"channel":"sms","from":"+16025550100","name":"Alex Rivera","body":"Hi! Looking to buy in Tempe around $450k"}'`;

  return (
    <div style={{ maxWidth: 860 }}>
      {/* AI provider */}
      <div className="card card-pad">
        <h3 className="card-title">AI messaging engine</h3>
        <div className="card-sub">Currently active: <b style={{ color: 'var(--accent)' }}>{aiStatus.active}</b> — autopilot uses this to reply, qualify and escalate autonomously.</div>
        <div className="mt" style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 10 }}>
          {PROVIDERS.map((p) => (
            <label key={p.id} className="card card-pad" style={{
              cursor: 'pointer', borderColor: form.aiProvider === p.id ? 'var(--accent)' : 'var(--border)',
              background: form.aiProvider === p.id ? 'rgba(16,185,129,0.06)' : 'var(--panel-2)',
            }}>
              <div className="row" style={{ justifyContent: 'space-between' }}>
                <div style={{ fontWeight: 700 }}>{p.name}</div>
                <input type="radio" checked={form.aiProvider === p.id} onChange={() => setForm({ ...form, aiProvider: p.id })} />
              </div>
              <div className="tiny muted mt-sm" style={{ lineHeight: 1.5 }}>{p.desc}</div>
            </label>
          ))}
        </div>

        <div className="grid-2 mt">
          <div className="field">
            <label className="label">OpenAI API key {aiStatus.openai.configured && <span className="badge badge-green">saved {aiStatus.openai.keyMasked}</span>}</label>
            <input className="input mono" type="password" placeholder="sk-…" value={form.openaiKey} onChange={ch('openaiKey')} />
          </div>
          <div className="field">
            <label className="label">Anthropic API key {aiStatus.anthropic.configured && <span className="badge badge-green">saved {aiStatus.anthropic.keyMasked}</span>}</label>
            <input className="input mono" type="password" placeholder="sk-ant-…" value={form.anthropicKey} onChange={ch('anthropicKey')} />
          </div>
        </div>
        <div className="tiny faint">Keys are stored server-side and never returned in full after saving. Clear a field and save to remove a key. Environment variables OPENAI_API_KEY / ANTHROPIC_API_KEY also work.</div>
      </div>

      {/* business profile */}
      <div className="card card-pad mt">
        <h3 className="card-title">Business profile</h3>
        <div className="card-sub">Injected into every AI prompt so replies match your brand and voice.</div>
        <div className="grid-2 mt">
          <div className="field"><label className="label">Company name</label><input className="input" value={form.business.name || ''} onChange={chB('name')} /></div>
          <div className="field"><label className="label">Agent / persona</label><input className="input" value={form.business.agent || ''} onChange={chB('agent')} /></div>
          <div className="field"><label className="label">Contact phone</label><input className="input" value={form.business.phone || ''} onChange={chB('phone')} /></div>
          <div className="field"><label className="label">Specialties</label><input className="input" value={form.business.specialties || ''} onChange={chB('specialties')} /></div>
        </div>
        <div className="row">
          <Toggle checked={form.autopilotDefault} onChange={(v) => setForm({ ...form, autopilotDefault: v })} />
          <span className="small">Autopilot ON by default for new conversations</span>
        </div>
      </div>

      <div className="row mt">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save settings'}</button>
        <button className="btn" onClick={runTest} disabled={busy}>✦ Send test message</button>
      </div>

      {test && (
        <div className="card card-pad mt">
          <h3 className="card-title">AI test result <span className="badge badge-green">{test.provider}</span></h3>
          <div className="small muted mt-sm" style={{ lineHeight: 1.6 }}>{test.reply}</div>
          <div className="tiny faint mt-sm">intent: {test.intent} · lead score: {test.lead_score}</div>
        </div>
      )}

      {/* integrations */}
      <div className="card card-pad mt">
        <h3 className="card-title">Inbound webhook (Twilio / SendGrid / N8N)</h3>
        <div className="card-sub">Point your SMS, email or chat provider at this endpoint — every inbound message triggers the autonomous pipeline.</div>
        <div className="row mt-sm">
          <input className="input mono grow" readOnly value={webhookUrl} />
          <button className="btn" onClick={() => { navigator.clipboard.writeText(webhookUrl); setCopied(true); setTimeout(() => setCopied(false), 1500); }}>{copied ? 'Copied ✓' : 'Copy'}</button>
        </div>
        <pre className="log-box mono tiny mt" style={{ whiteSpace: 'pre-wrap' }}>{curl}</pre>
        <div className="tiny faint mt-sm">A ready-made N8N workflow is included at <span className="mono">integrations/n8n/real-estate-automation.json</span>.</div>
      </div>

      {/* data */}
      <div className="card card-pad mt">
        <h3 className="card-title">Data & storage</h3>
        <div className="small muted mt-sm" style={{ lineHeight: 1.7 }}>
          Database: SQLite (WAL) at <span className="mono">server/data/app.db</span> — portable to PostgreSQL via the documented migration in the README.<br />
          Reset demo data: <span className="mono">cd server && npm run seed</span> (add <span className="mono">--force</span> to wipe).
        </div>
      </div>
    </div>
  );
}
