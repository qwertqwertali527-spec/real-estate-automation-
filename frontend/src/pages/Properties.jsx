import React, { useEffect, useState, useCallback } from 'react';
import { api, fmtPrice } from '../api.js';
import { Badge, Drawer, Modal, Spinner, Empty, useToast } from '../components/ui.jsx';

const BLANK = { address: '', city: '', state: 'AZ', zip: '', property_type: 'single_family', price: '', beds: '', baths: '', sqft: '', year_built: '', owner_name: '', notes: '' };

export default function Properties() {
  const toast = useToast();
  const [data, setData] = useState(null);
  const [filters, setFilters] = useState({ q: '', status: '', type: '', city: '', min: '', max: '', beds: '', sort: 'updated_desc' });
  const [selected, setSelected] = useState(null);
  const [addOpen, setAddOpen] = useState(false);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    Object.entries(filters).forEach(([k, v]) => v && params.set(k, v));
    const d = await api.get(`/properties?${params}`);
    setData(d);
  }, [filters]);

  useEffect(() => { load().catch((e) => toast(e.message, true)); }, [load, toast]);
  const set = (k) => (e) => setFilters({ ...filters, [k]: e.target.value });

  return (
    <div>
      <div className="card card-pad">
        <div className="row-wrap">
          <input className="input grow" style={{ minWidth: 180 }} placeholder="Search address, owner, APN, zip…" value={filters.q} onChange={set('q')} />
          <select className="select" style={{ width: 140 }} value={filters.status} onChange={set('status')}>
            <option value="">Any status</option>
            {['new', 'active', 'prospect', 'under_contract', 'sold', 'archived'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
          <select className="select" style={{ width: 140 }} value={filters.type} onChange={set('type')}>
            <option value="">Any type</option>
            {['single_family', 'condo', 'townhouse', 'multi_family', 'land'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
          <input className="input" style={{ width: 110 }} placeholder="City" value={filters.city} onChange={set('city')} />
          <input className="input num" style={{ width: 100 }} placeholder="$ Min" value={filters.min} onChange={set('min')} />
          <input className="input num" style={{ width: 100 }} placeholder="$ Max" value={filters.max} onChange={set('max')} />
          <input className="input num" style={{ width: 70 }} placeholder="Beds" value={filters.beds} onChange={set('beds')} />
          <select className="select" style={{ width: 140 }} value={filters.sort} onChange={set('sort')}>
            <option value="updated_desc">Recently updated</option>
            <option value="price_desc">Price ↓</option>
            <option value="price_asc">Price ↑</option>
            <option value="newest">Newest first</option>
            <option value="city">City</option>
          </select>
          <button className="btn btn-primary" onClick={() => setAddOpen(true)}>＋ Add</button>
        </div>
      </div>

      <div className="card mt">
        {data === null ? <Spinner /> : data.rows.length === 0 ? <Empty>No properties match these filters.</Empty> : (
          <table className="table">
            <thead>
              <tr>
                <th>Address</th><th>City</th><th>Type</th><th className="num">Beds</th><th className="num">Baths</th>
                <th className="num">Sqft</th><th className="num">Price</th><th>Status</th><th>Source</th><th>Owner</th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((p) => (
                <tr key={p.id} className="clickable" onClick={() => setSelected(p)}>
                  <td style={{ fontWeight: 600 }}>{p.address}</td>
                  <td>{p.city}, {p.state}</td>
                  <td className="small muted">{p.property_type?.replace(/_/g, ' ')}</td>
                  <td className="num">{p.beds ?? '—'}</td>
                  <td className="num">{p.baths ?? '—'}</td>
                  <td className="num">{p.sqft?.toLocaleString() ?? '—'}</td>
                  <td className="num" style={{ fontWeight: 700 }}>{fmtPrice(p.price)}</td>
                  <td><Badge v={p.status} /></td>
                  <td className="tiny muted">{p.source}</td>
                  <td className="small truncate" style={{ maxWidth: 140 }}>{p.owner_name || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
        {data && <div className="tiny faint" style={{ padding: '10px 14px' }}>{data.total} record(s)</div>}
      </div>

      {selected && (
        <PropertyDrawer
          prop={selected}
          onClose={() => setSelected(null)}
          onSaved={async (p) => { setSelected(p); await load(); toast('Property saved'); }}
          onDeleted={async () => { setSelected(null); await load(); toast('Property deleted'); }}
        />
      )}
      {addOpen && (
        <AddPropertyModal
          onClose={() => setAddOpen(false)}
          onSaved={async () => { setAddOpen(false); await load(); toast('Property added'); }}
        />
      )}
    </div>
  );
}

function Field({ label, children }) {
  return <div className="field"><label className="label">{label}</label>{children}</div>;
}

function PropertyDrawer({ prop, onClose, onSaved, onDeleted }) {
  const [form, setForm] = useState(prop);
  const [busy, setBusy] = useState(false);
  const ch = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  const save = async () => {
    setBusy(true);
    try {
      const body = { ...form };
      ['price', 'beds', 'baths', 'sqft', 'lot_sqft', 'year_built', 'assessed_value', 'last_sale_price', 'latitude', 'longitude'].forEach((k) => {
        if (body[k] === '' || body[k] === null) delete body[k];
      });
      const p = await api.put(`/properties/${prop.id}`, body);
      onSaved(p);
    } catch (e) { toast(e.message, true); }
    setBusy(false);
  };
  const del = async () => {
    if (!confirm(`Delete ${prop.address}?`)) return;
    try { await api.del(`/properties/${prop.id}`); onDeleted(); } catch (e) { toast(e.message, true); }
  };

  return (
    <Drawer title={prop.address} onClose={onClose}>
      <div className="row" style={{ gap: 6, marginBottom: 14 }}>
        <Badge v={prop.status} />
        <span className="tiny muted">source: {prop.source}</span>
        {prop.apn && <span className="tiny mono muted">APN {prop.apn}</span>}
      </div>

      <div className="grid-2">
        <Field label="Status">
          <select className="select" value={form.status || 'new'} onChange={ch('status')}>
            {['new', 'active', 'prospect', 'under_contract', 'sold', 'archived'].map((s) => <option key={s} value={s}>{s.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Asking price"><input className="input num" value={form.price ?? ''} onChange={ch('price')} /></Field>
        <Field label="Beds"><input className="input num" value={form.beds ?? ''} onChange={ch('beds')} /></Field>
        <Field label="Baths"><input className="input num" value={form.baths ?? ''} onChange={ch('baths')} /></Field>
        <Field label="Sqft"><input className="input num" value={form.sqft ?? ''} onChange={ch('sqft')} /></Field>
        <Field label="Lot sqft"><input className="input num" value={form.lot_sqft ?? ''} onChange={ch('lot_sqft')} /></Field>
        <Field label="Year built"><input className="input num" value={form.year_built ?? ''} onChange={ch('year_built')} /></Field>
        <Field label="Assessed value"><input className="input num" value={form.assessed_value ?? ''} onChange={ch('assessed_value')} /></Field>
        <Field label="Last sale price"><input className="input num" value={form.last_sale_price ?? ''} onChange={ch('last_sale_price')} /></Field>
        <Field label="Last sale date"><input className="input" value={form.last_sale_date ?? ''} onChange={ch('last_sale_date')} /></Field>
        <Field label="Owner"><input className="input" value={form.owner_name ?? ''} onChange={ch('owner_name')} /></Field>
        <Field label="Owner mailing"><input className="input" value={form.owner_mailing_address ?? ''} onChange={ch('owner_mailing_address')} /></Field>
      </div>
      <Field label="Notes"><textarea className="textarea" value={form.notes ?? ''} onChange={ch('notes')} /></Field>

      <div className="row mt">
        <button className="btn btn-primary" onClick={save} disabled={busy}>{busy ? 'Saving…' : 'Save changes'}</button>
        <div className="grow" />
        <button className="btn btn-danger" onClick={del}>Delete</button>
      </div>

      <h3 className="card-title mt">Public record</h3>
      <div className="mt-sm">
        <div className="kv"><span className="kv-key">County</span><span className="kv-val">{prop.county || '—'}</span></div>
        <div className="kv"><span className="kv-key">Parcel (APN)</span><span className="kv-val mono">{prop.apn || '—'}</span></div>
        <div className="kv"><span className="kv-key">Source ID</span><span className="kv-val mono">{prop.source_id || '—'}</span></div>
        <div className="kv"><span className="kv-key">Coordinates</span><span className="kv-val mono">{prop.latitude ? `${prop.latitude}, ${prop.longitude}` : '—'}</span></div>
        <div className="kv"><span className="kv-key">First seen</span><span className="kv-val">{prop.created_at?.slice(0, 10)}</span></div>
      </div>
    </Drawer>
  );
}

function AddPropertyModal({ onClose, onSaved }) {
  const [form, setForm] = useState(BLANK);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(null);
  const ch = (k) => (e) => setForm({ ...form, [k]: e.target.value });
  const submit = async () => {
    setBusy(true); setErr(null);
    try {
      await api.post('/properties', form);
      onSaved();
    } catch (e) { setErr(e.message); }
    setBusy(false);
  };
  return (
    <Modal
      title="Add property"
      onClose={onClose}
      footer={<><button className="btn" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={submit} disabled={busy || !form.address.trim()}>{busy ? 'Saving…' : 'Add property'}</button></>}
    >
      {err && <div className="badge badge-red" style={{ marginBottom: 12 }}>{err}</div>}
      <Field label="Address *"><input className="input" value={form.address} onChange={ch('address')} placeholder="1428 W Palm Lane" /></Field>
      <div className="grid-2">
        <Field label="City"><input className="input" value={form.city} onChange={ch('city')} /></Field>
        <Field label="Zip"><input className="input" value={form.zip} onChange={ch('zip')} /></Field>
        <Field label="Type">
          <select className="select" value={form.property_type} onChange={ch('property_type')}>
            {['single_family', 'condo', 'townhouse', 'multi_family', 'land'].map((t) => <option key={t} value={t}>{t.replace(/_/g, ' ')}</option>)}
          </select>
        </Field>
        <Field label="Price"><input className="input num" value={form.price} onChange={ch('price')} /></Field>
        <Field label="Beds"><input className="input num" value={form.beds} onChange={ch('beds')} /></Field>
        <Field label="Baths"><input className="input num" value={form.baths} onChange={ch('baths')} /></Field>
        <Field label="Sqft"><input className="input num" value={form.sqft} onChange={ch('sqft')} /></Field>
        <Field label="Year built"><input className="input num" value={form.year_built} onChange={ch('year_built')} /></Field>
      </div>
      <Field label="Owner"><input className="input" value={form.owner_name} onChange={ch('owner_name')} /></Field>
    </Modal>
  );
}
