import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { api, fmtMoney, fmtTime } from '../api.js';
import { Stat, Spinner, Badge, Empty } from '../components/ui.jsx';
import { LineChart, BarChart } from '../components/charts.jsx';

const FEED_COLORS = {
  lead_captured: 'var(--accent)', ai_reply: 'var(--blue)', escalation: 'var(--red)',
  ingest_completed: 'var(--purple)', ingest_failed: 'var(--red)', import: 'var(--purple)',
  property_added: 'var(--accent)', contact_added: 'var(--accent)', stage_change: 'var(--amber)',
  inbound_message: 'var(--blue)', agent_reply: 'var(--amber)', conversation_started: 'var(--blue)',
  seed: 'var(--faint)', system: 'var(--faint)',
};

export default function Dashboard() {
  const [s, setS] = useState(null);
  const [err, setErr] = useState(null);

  useEffect(() => {
    api.get('/dashboard/stats').then(setS).catch((e) => setErr(e.message));
  }, []);

  if (err) return <Empty>Failed to load dashboard: {err}</Empty>;
  if (!s) return <Spinner />;

  const propStatus = Object.entries(s.properties.byStatus).map(([label, value]) => ({ label: label.replace(/_/g, ' '), value }));
  const intents = Object.entries(s.intents).slice(0, 7).map(([label, value]) => ({ label, value }));
  const msgDays = s.messagesPerDay || [];
  const leadDays = s.leadsPerDay || [];

  return (
    <div>
      <div className="stat-grid">
        <Stat label="Properties" value={s.properties.total} hint={`${fmtMoney(s.properties.portfolioValue)} tracked portfolio`} />
        <Stat label="Contacts" value={s.contacts.total} hint={`${s.contacts.leadsThisWeek} new leads this week`} />
        <Stat label="Open conversations" value={s.conversations.open} hint={`${s.conversations.unread} unread · ${s.conversations.autopilotOn} on autopilot`} accent="var(--blue)" />
        <Stat label="AI replies sent" value={s.messages.aiReplies} hint={`${s.messages.total} messages total · ${s.messages.today} today`} accent="var(--accent)" />
        <Stat label="Needs human" value={s.conversations.pendingHuman} hint="Escalated by the AI" accent={s.conversations.pendingHuman ? 'var(--red)' : undefined} />
        <Stat label="Pipeline value" value={fmtMoney(s.contacts.pipelineValue)} hint="Sum of open contact budgets" accent="var(--purple)" />
      </div>

      <div className="grid-2 mt">
        <div className="card card-pad">
          <div className="spread">
            <div>
              <h3 className="card-title">Messages — last 14 days</h3>
              <div className="card-sub">Inbound vs outbound (AI + agent)</div>
            </div>
            <div className="chart-legend">
              <span style={{ color: 'var(--blue)' }}>Inbound</span>
              <span style={{ color: 'var(--accent)' }}>Outbound</span>
            </div>
          </div>
          <div className="mt-sm">
            {msgDays.length ? (
              <LineChart
                series={[
                  { name: 'Inbound', color: '#60a5fa', points: msgDays.map((d) => ({ x: d.d.slice(5), y: d.inbound })) },
                  { name: 'Outbound', color: '#10b981', points: msgDays.map((d) => ({ x: d.d.slice(5), y: d.outbound })) },
                ]}
              />
            ) : <Empty>No messages yet — send one from the Inbox.</Empty>}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="card-title">Property pipeline by status</h3>
          <div className="card-sub">{s.properties.total} records · {Object.keys(s.properties.sources).length} data sources</div>
          <div className="mt-sm">
            <BarChart data={propStatus} />
          </div>
          <h3 className="card-title mt">Detected intents</h3>
          <div className="card-sub">What inbound leads are asking about</div>
          <div className="mt-sm">
            <BarChart data={intents} color="var(--blue)" />
          </div>
        </div>
      </div>

      <div className="grid-2 mt">
        <div className="card card-pad">
          <h3 className="card-title">Recent activity</h3>
          <div className="card-sub">Everything happening across the suite</div>
          <div className="mt-sm">
            {s.recentActivity.length ? s.recentActivity.map((a) => (
              <div className="feed-item" key={a.id}>
                <span className="feed-dot" style={{ background: FEED_COLORS[a.type] || 'var(--faint)' }} />
                <div className="grow">
                  <div>{a.summary}</div>
                  <div className="tiny faint">{a.type.replace(/_/g, ' ')} · {fmtTime(a.created_at)} ago</div>
                </div>
              </div>
            )) : <Empty>Nothing yet.</Empty>}
          </div>
        </div>

        <div className="card card-pad">
          <h3 className="card-title">Public-records pipeline</h3>
          <div className="card-sub">{s.ingest.recordsFromFeeds} of {s.properties.total} records came from automated feeds</div>
          {s.ingest.lastRun ? (
            <div className="mt-sm">
              <div className="kv">
                <span className="kv-key">Last run</span>
                <span className="kv-val"><Badge v={s.ingest.lastRun.connector} /> {s.ingest.lastRun.connector}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Status</span>
                <span className="kv-val"><Badge v={s.ingest.lastRun.status} /></span>
              </div>
              <div className="kv">
                <span className="kv-key">Records imported</span>
                <span className="kv-val num">+{s.ingest.lastRun.records_imported}</span>
              </div>
              <div className="kv">
                <span className="kv-key">Finished</span>
                <span className="kv-val">{fmtTime(s.ingest.lastRun.finished_at)} ago</span>
              </div>
            </div>
          ) : <Empty>No ingest runs yet.</Empty>}
          <div className="row mt">
            <Link to="/ingest" className="btn btn-sm">Run a connector</Link>
            <Link to="/inbox" className="btn btn-sm btn-ghost">Open inbox</Link>
          </div>
          <h3 className="card-title mt">Quick numbers</h3>
          <div className="mt-sm">
            <div className="kv"><span className="kv-key">Autopilot coverage</span><span className="kv-val">{s.conversations.total ? Math.round((s.conversations.autopilotOn / s.conversations.total) * 100) : 0}% of conversations</span></div>
            <div className="kv"><span className="kv-key">Buyers / Sellers</span><span className="kv-val">{s.contacts.byType.buyer || 0} / {s.contacts.byType.seller || 0}</span></div>
            <div className="kv"><span className="kv-key">Qualified leads</span><span className="kv-val">{s.contacts.byStage.qualified || 0}</span></div>
          </div>
        </div>
      </div>
    </div>
  );
}
