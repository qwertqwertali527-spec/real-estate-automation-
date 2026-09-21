import React, { useEffect, useState, useRef, useCallback } from 'react';
import { api, fmtTime } from '../api.js';
import { Badge, Toggle, Modal, Spinner, Empty, useToast, useApp } from '../components/ui.jsx';

export default function Inbox() {
  const toast = useToast();
  const { refreshUnread } = useApp();
  const [convs, setConvs] = useState(null);
  const [counts, setCounts] = useState({ open: 0, pending_human: 0, unread: 0 });
  const [filter, setFilter] = useState('all');
  const [activeId, setActiveId] = useState(null);
  const [thread, setThread] = useState(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(null);
  const [simOpen, setSimOpen] = useState(false);
  const threadEndRef = useRef(null);

  const loadConvs = useCallback(async () => {
    const d = await api.get('/conversations');
    setConvs(d.rows);
    setCounts(d.counts);
    refreshUnread();
    return d.rows;
  }, [refreshUnread]);

  const loadThread = useCallback(async (id) => {
    if (!id) return setThread(null);
    const d = await api.get(`/conversations/${id}`);
    setThread(d);
    return d;
  }, []);

  useEffect(() => { loadConvs().catch((e) => toast(e.message, true)); }, [loadConvs, toast]);
  useEffect(() => { if (activeId) loadThread(activeId).catch(() => {}); }, [activeId, loadThread]);
  useEffect(() => { threadEndRef.current?.scrollIntoView({ behavior: 'smooth' }); }, [thread?.messages?.length]);

  const openConv = (id) => {
    setActiveId(id);
    setDraft('');
    setConvs((cs) => cs?.map((c) => (c.id === id ? { ...c, unread: 0 } : c)));
  };

  const send = async () => {
    if (!draft.trim() || !activeId) return;
    setBusy('send');
    try {
      await api.post(`/conversations/${activeId}/messages`, { body: draft });
      setDraft('');
      await Promise.all([loadThread(activeId), loadConvs()]);
    } catch (e) { toast(e.message, true); }
    setBusy(null);
  };

  const suggest = async () => {
    setBusy('suggest');
    try {
      const d = await api.post(`/conversations/${activeId}/suggest`);
      setDraft(d.suggestion);
      toast(`Drafted with ${d.analysis.provider} engine (intent: ${d.analysis.intent}, score: ${d.analysis.lead_score})`);
    } catch (e) { toast(e.message, true); }
    setBusy(null);
  };

  const runAutopilot = async () => {
    setBusy('auto');
    try {
      const d = await api.post(`/conversations/${activeId}/run-autopilot`);
      if (d.sent) toast(`AI replied (${d.ai.provider}, intent: ${d.ai.intent}, score: ${d.ai.lead_score})`);
      else toast(d.reason === 'needs_human' ? 'AI flagged this for a human — reply not sent' : d.reason === 'spam_detected' ? 'Detected as spam — no reply sent' : `Not sent: ${d.reason}`, true);
      await Promise.all([loadThread(activeId), loadConvs()]);
    } catch (e) { toast(e.message, true); }
    setBusy(null);
  };

  const setFlag = async (patch) => {
    try {
      await api.patch(`/conversations/${activeId}`, patch);
      await Promise.all([loadThread(activeId), loadConvs()]);
    } catch (e) { toast(e.message, true); }
  };

  const filtered = (convs || []).filter((c) =>
    filter === 'all' ? true : filter === 'attention' ? c.status === 'pending_human' || c.unread > 0 : c.status === filter
  );

  return (
    <div className="inbox-grid">
      {/* conversations */}
      <div className="card conv-list">
        <div style={{ padding: 12, borderBottom: '1px solid var(--border)' }}>
          <div className="row">
            <div className="pill-tabs grow">
              {[['all', 'All'], ['attention', '!'], ['open', 'Open'], ['pending_human', 'Human'], ['closed', 'Done']].map(([k, l]) => (
                <button key={k} className={filter === k ? 'active' : ''} onClick={() => setFilter(k)} title={l}>{l}</button>
              ))}
            </div>
            <button className="btn btn-sm btn-primary" onClick={() => setSimOpen(true)} title="Simulate an inbound message">＋</button>
          </div>
          {counts.pending_human > 0 && (
            <div className="tiny mt-sm" style={{ color: 'var(--red)' }}>⚠ {counts.pending_human} conversation(s) escalated to a human</div>
          )}
        </div>
        {convs === null ? <Spinner /> : filtered.length === 0 ? <Empty>No conversations.</Empty> : filtered.map((c) => (
          <div key={c.id} className={`conv-item${activeId === c.id ? ' active' : ''}`} onClick={() => openConv(c.id)}>
            <div className="conv-item-top">
              {c.unread > 0 && <span className="unread-dot" />}
              <span className="conv-name truncate">{c.contact?.name || 'Unknown'}</span>
              <span className="conv-time">{fmtTime(c.last_message_at)}</span>
            </div>
            <div className="conv-preview">
              {c.last_direction === 'out' ? 'You: ' : ''}{c.last_message || ''}
            </div>
            <div className="row mt-sm" style={{ gap: 5 }}>
              <Badge v={c.channel} />
              {c.status !== 'open' && <Badge v={c.status} />}
              {c.autopilot ? <span className="tiny" style={{ color: 'var(--accent)' }}>⚙ auto</span> : <span className="tiny faint">manual</span>}
            </div>
          </div>
        ))}
      </div>

      {/* thread */}
      <div className="card thread">
        {!thread ? (
          <Empty>Select a conversation</Empty>
        ) : (
          <>
            <div className="thread-head">
              <div>
                <div style={{ fontWeight: 700 }}>{thread.contact?.name}</div>
                <div className="tiny muted">
                  {thread.channel}{thread.subject ? ` · ${thread.subject}` : ''} · {thread.messages.length} messages
                </div>
              </div>
              <div className="row" style={{ marginLeft: 'auto', gap: 8 }}>
                <span className="tiny muted">Autopilot</span>
                <Toggle checked={!!thread.autopilot} onChange={(v) => setFlag({ autopilot: v })} />
                {thread.status === 'pending_human' && <Badge v="pending_human" />}
              </div>
            </div>
            <div className="thread-body">
              {thread.messages.map((m) => (
                <div key={m.id} className={`bubble bubble-${m.direction}`}>
                  {m.body}
                  <div className="bubble-meta">
                    {m.ai_generated ? <span style={{ color: 'var(--accent)' }}>⚙ AI</span> : m.direction === 'out' ? <span>agent</span> : null}
                    {m.intent && <span>· {m.intent}</span>}
                    <span>· {fmtTime(m.created_at)}</span>
                  </div>
                </div>
              ))}
              <div ref={threadEndRef} />
            </div>
            <div className="composer">
              {busy === 'suggest' ? <div className="tiny muted">Drafting with AI…</div> : null}
              <textarea
                className="textarea"
                rows={3}
                placeholder={thread.autopilot ? 'Autopilot is ON — type here to reply manually (overrides AI)…' : 'Type your reply…'}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) send(); }}
              />
              <div className="composer-row">
                <button className="btn btn-sm" onClick={suggest} disabled={busy} title="Generate an AI draft without sending">✦ AI draft</button>
                <button className="btn btn-sm" onClick={runAutopilot} disabled={busy} title="Let autopilot answer the latest inbound message">⚙ Run autopilot</button>
                <div className="grow" />
                <button className="btn btn-sm btn-primary" onClick={send} disabled={busy || !draft.trim()}>Send {busy === 'send' ? '…' : '⏎'}</button>
              </div>
            </div>
          </>
        )}
      </div>

      {/* contact side panel */}
      <div className="card side-panel card-pad">
        {!thread?.contact ? (
          <Empty>No conversation selected</Empty>
        ) : (
          <>
            <div style={{ fontWeight: 800, fontSize: 15 }}>{thread.contact.name}</div>
            <div className="row mt-sm" style={{ gap: 5 }}>
              <Badge v={thread.contact.type} />
              <Badge v={thread.contact.stage} />
            </div>
            <div className="mt-sm">
              <div className="kv"><span className="kv-key">Email</span><span className="kv-val">{thread.contact.email || '—'}</span></div>
              <div className="kv"><span className="kv-key">Phone</span><span className="kv-val">{thread.contact.phone || '—'}</span></div>
              <div className="kv"><span className="kv-key">Budget</span><span className="kv-val num">{thread.contact.budget_min ? `$${Number(thread.contact.budget_min).toLocaleString()} – ` : ''}{thread.contact.budget_max ? `$${Number(thread.contact.budget_max).toLocaleString()}` : '—'}</span></div>
              <div className="kv"><span className="kv-key">Target areas</span><span className="kv-val">{thread.contact.preferred_locations || '—'}</span></div>
            </div>
            {thread.contact.tags?.length > 0 && (
              <div className="mt-sm">
                {thread.contact.tags.map((t) => <span className="tag" key={t}>{t}</span>)}
              </div>
            )}
            <div className="mt">
              <div className="label">Autopilot</div>
              <div className="small muted" style={{ lineHeight: 1.5 }}>
                {thread.autopilot
                  ? 'The AI handles inbound replies on this conversation, qualifies the lead, and escalates when a human is needed.'
                  : 'Autopilot is off. You reply manually; AI drafts are available anytime.'}
              </div>
            </div>
            <div className="mt">
              <button className="btn btn-sm" style={{ width: '100%' }} onClick={() => setFlag({ status: thread.status === 'closed' ? 'open' : 'closed' })}>
                {thread.status === 'closed' ? 'Reopen conversation' : 'Mark handled (close)'}
              </button>
            </div>
          </>
        )}
      </div>

      {simOpen && (
        <SimulateModal
          onClose={() => setSimOpen(false)}
          onSent={async (d) => {
            setSimOpen(false);
            await loadConvs();
            setActiveId(d.conversation_id);
            const a = d.autopilot;
            toast(a.sent ? `Inbound handled — AI replied via ${a.provider} (intent: ${a.intent}, score: ${a.lead_score})`
              : a.reason === 'needs_human' ? 'Inbound received — escalated to human' : 'Inbound received (no AI reply)');
          }}
        />
      )}
    </div>
  );
}

function SimulateModal({ onClose, onSent }) {
  const [form, setForm] = useState({ channel: 'sms', name: '', phone: '', email: '', body: '' });
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      const d = await api.post('/webhooks/inbound', form);
      onSent(d);
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };

  return (
    <Modal
      title="Simulate inbound message"
      onClose={onClose}
      footer={
        <>
          <button className="btn" onClick={onClose}>Cancel</button>
          <button className="btn btn-primary" onClick={submit} disabled={busy || !form.body.trim()}>
            {busy ? 'Sending…' : 'Send inbound'}
          </button>
        </>
      }
    >
      {err && <div className="badge badge-red" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="field">
        <label className="label">Channel</label>
        <select className="select" value={form.channel} onChange={set('channel')}>
          <option value="sms">SMS</option>
          <option value="email">Email</option>
          <option value="webchat">Web chat</option>
        </select>
      </div>
      <div className="grid-2">
        <div className="field">
          <label className="label">Name</label>
          <input className="input" value={form.name} onChange={set('name')} placeholder="Alex Rivera" />
        </div>
        <div className="field">
          <label className="label">{form.channel === 'email' ? 'Email' : 'Phone'}</label>
          {form.channel === 'email'
            ? <input className="input" value={form.email} onChange={set('email')} placeholder="alex@email.com" />
            : <input className="input" value={form.phone} onChange={set('phone')} placeholder="+1 602 555 0100" />}
        </div>
      </div>
      <div className="field">
        <label className="label">Message</label>
        <textarea className="textarea" rows={4} value={form.body} onChange={set('body')}
          placeholder="Hi! I'm looking to sell my house in Scottsdale ASAP — what's it worth?" />
      </div>
      <div className="tiny faint">Goes through the same webhook pipeline as Twilio / SendGrid / N8N. If autopilot is on, the AI replies instantly.</div>
    </Modal>
  );
}
