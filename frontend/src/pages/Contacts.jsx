import React, { useEffect, useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { api, fmtTime } from '../api.js';
import { Badge, Drawer, Modal, Spinner, Empty, useToast } from '../components/ui.jsx';

const TYPES = ['buyer', 'seller', 'renter', 'investor', 'agent', 'vendor'];
const STAGES = ['new', 'contacted', 'qualified', 'negotiating', 'closed', 'lost'];
const BLANK = { name: '', email: '', phone: '', type: 'buyer', stage: 'new', tags: '', budget_min: '', budget_max: '', preferred_locations: '', source: 'manual', notes: '' };

export default function Contacts() {
  const toast = useToast();
  const navigate = useNavigate();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: '', type: '', stage: '' });
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    setData(await api.get(`/contacts?${params}`));
  }, [filters]);

  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load, toast]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div>
      <div className="card card-pad">
        <div className="row-wrap">
          <input className="input grow" style={{ minWidth: 200 }} placeholder="Search name, email, phone, area…" value={filters.q} onChange={set('q')} />
          <select className="select" style={{ width: 130 }} value={filters.type} onChange={set('type')}>
            <option value="">Any type</option>
            {TYPES.map((t) => <option key={t} value={t}>{t}</option>)}
          </select>
          <select className="select" style={{ width: 140 }} value={filters.stage} onChange={set('stage')}>
            <option value="">Any stage</option>
            {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
          </select>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>＋ Add contact</button>
        </div>
        {data && (
          <div className="row-wrap mt-sm">
            {STAGES.map((s) => (
              <span key={s} className="tiny muted">{s}: <b style={{ color: 'var(--text)' }}>{data.counts.byStage[s] || 0}</b></span>
            ))}
          </div>
        )}
      </div>

      <div className="card mt">
        {data === null ? <Spinner /> : data.rows.length === 0 ? <Empty>No contacts found.</Empty> : (
          <table className="table">
            <thead>
              <tr><th>Name</th><th>Type</th><th>Stage</th><th className="num">Budget</th><th>Target areas</th><th>Tags</th><th className="num">Convos</th><th>Updated</th></tr>
            </thead>
            <tbody>
              {data.rows.map((c) => (
                <tr key={c.id} className="clickable" onClick={() => setSelected(c.id)}>
                  <td>
                    <div style={{ fontWeight: 700 }}>{c.name}</div>
                    <div className="tiny faint">{c.email || c.phone}</div>
                  </td>
                  <td><Badge v={c.type} /></td>
                  <td>
                    <select className="select" style={{ width: 120, padding: '4px 8px', fontSize: 12 }} value={c.stage}
                      onClick={(e) => e.stopPropagation()}
                      onChange={async (e) => {
                        e.stopPropagation();
                        try { await api.put(`/contacts/${c.id}`, { stage: e.target.value }); load(); }
                        catch (err) { toast(err.message, true); }
                      }}>
                      {STAGES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </td>
                  <td className="num">{c.budget_max ? `$${Number(c.budget_max).toLocaleString()}` : '—'}</td>
                  <td className="small truncate" style={{ maxWidth: 130 }}>{c.preferred_locations || '—'}</td>
                  <td>{c.tags.slice(0, 2).map((t) => <span className="tag" key={t}>{t}</span>)}{c.tags.length > 2 && <span className="tiny faint">+{c.tags.length - 2}</span>}</td>
                  <td className="num">{c.conversations_count}</td>
                  <td className="small muted">{fmtTime(c.updated_at)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {selected && (
        <ContactDrawer
          id={selected}
          onClose={() => setSelected(null)}
          onSaved={() => load()}
          onDeleted={async () => { setSelected(null); load(); toast('Contact deleted'); }}
          onOpenInbox={() => { setSelected(null); navigate('/inbox'); }}
        />
      )}
      {addOpen && (
        <AddContactModal
          onClose={() => setAddOpen(false)}
          onSaved={async () => { setAddOpen(false); load(); toast('Contact added'); }}
        />
      )}
    </div>
  );
}

function ContactDrawer({ id, onClose, onSaved, onDeleted, onOpenInbox }) {
  const toast = useToast();
  const [c, setC] = useState(null);
  const [tagsText, setTagsText] = useState('');
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    api.get(`/contacts/${id}`).then((d) => { setC(d); setTagsText((d.tags || []).join(', ')); }).catch(() => onClose());
  }, [id, onClose]);
  if (!c) return <Spinner />;
  const ch = (k) => (e) => setC({ ...c, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      await api.put(`/contacts/${id}`, { ...c, tags: tagsText });
      onSaved();
      toast('Contact saved');
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const del = async () => {
    if (!confirm(`Delete ${c.name}? Their conversations will also be removed.`)) return;
    try { await api.del(`/contacts/${id}`); onDeleted(); } catch (e) { toast(e.message, true); }
  };

  return (
    <Drawer title={c.name} onClose={onClose}>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        <Badge v={c.type} />
        <Badge v={c.stage} />
        <span className="tiny faint">added {fmtTime(c.created_at)} ago · source: {c.source || '—'}</span>
      </div>

      <div className="grid-2">
        <div className="field"><label className="label">Name</label><input className="input" value={c.name} onChange={ch('name')} /></div>
        <div className="field"><label className="label">Type</label>
          <select className="select" value={c.type} onChange={ch('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="field"><label className="label">Email</label><input className="input" value={c.email || ''} onChange={ch('email')} /></div>
        <div className="field"><label className="label">Phone</label><input className="input" value={c.phone || ''} onChange={ch('phone')} /></div>
        <div className="field"><label className="label">Budget min</label><input className="input num" value={c.budget_min ?? ''} onChange={ch('budget_min')} /></div>
        <div className="field"><label className="label">Budget max</label><input className="input num" value={c.budget_max ?? ''} onChange={ch('budget_max')} /></div>
        <div className="field"><label className="label">Preferred locations</label><input className="input" value={c.preferred_locations || ''} onChange={ch('preferred_locations')} /></div>
        <div className="field"><label className="label">Stage</label>
          <select className="select" value={c.stage} onChange={ch('stage')}>{STAGES.map((s) => <option key={s}>{s}</option>)}</select>
        </div>
      </div>
      <div className="field"><label className="label">Tags (comma separated)</label><input className="input" value={tagsText} onChange={(e) => setTagsText(e.target.value)} /></div>
      <div className="field"><label className="label">Notes</label><textarea className="textarea" rows={3} value={c.notes || ''} onChange={ch('notes')} /></div>

      <div className="row">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save'}</button>
        {c.conversations?.length > 0 && <button className="btn" onClick={onOpenInbox}>Open in inbox</button>}
        <div className="grow" />
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>

      <h3 className="card-title mt">Conversations</h3>
      {c.conversations?.length ? c.conversations.map((cv) => (
        <div className="kv" key={cv.id}>
          <span className="kv-key"><Badge v={cv.channel} /> {cv.status}</span>
          <span className="kv-val small">{cv.messages_count} msgs · {fmtTime(cv.last_message_at)} ago</span>
        </div>
      )) : <div className="small faint mt-sm">No conversations yet.</div>}
    </Drawer>
  );
}

function AddContactModal({ onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ch = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    setBusy(true); setErr(null);
    try { await api.post('/contacts', form); onSaved(); } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal
      title="Add contact"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !form.name.trim()}>{busy ? 'Saving…' : 'Add contact'}</button></>}
    >
      {err && <div className="badge badge-red" style={{ marginBottom: 12 }}>{err}</div>}
      <div className="grid-2">
        <div className="field"><label className="label">Name *</label><input className="input" value={form.name} onChange={ch('name')} /></div>
        <div className="field"><label className="label">Type</label>
          <select className="select" value={form.type} onChange={ch('type')}>{TYPES.map((t) => <option key={t}>{t}</option>)}</select>
        </div>
        <div className="field"><label className="label">Email</label><input className="input" value={form.email} onChange={ch('email')} /></div>
        <div className="field"><label className="label">Phone</label><input className="input" value={form.phone} onChange={ch('phone')} /></div>
        <div className="field"><label className="label">Budget min</label><input className="input num" value={form.budget_min} onChange={ch('budget_min')} /></div>
        <div className="field"><label className="label">Budget max</label><input className="input num" value={form.budget_max} onChange={ch('budget_max')} /></div>
      </div>
      <div className="field"><label className="label">Preferred locations</label><input className="input" value={form.preferred_locations} onChange={ch('preferred_locations')} /></div>
      <div className="field"><label className="label">Tags</label><input className="input" value={form.tags} onChange={ch('tags')} placeholder="first-time, relocating" /></div>
    </Modal>
  );
}
