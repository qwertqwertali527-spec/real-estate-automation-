import React, { useEffect, useState, useCallback } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { api } from './api.js';
import { AppCtx, ToastProvider } from './components/ui.jsx';
import Dashboard from './pages/Dashboard.jsx';
import Inbox from './pages/Inbox.jsx';
import Properties from './pages/Properties.jsx';
import Ingest from './pages/Ingest.jsx';
import Contacts from './pages/Contacts.jsx';
import SettingsPage from './pages/Settings.jsx';

const NAV = [
  { to: '/', ico: '◧', label: 'Dashboard' },
  { to: '/inbox', ico: '✉', label: 'Inbox', badge: 'unread' },
  { to: '/properties', ico: '⌂', label: 'Properties' },
  { to: '/ingest', ico: '⇣', label: 'Public Records' },
  { to: '/contacts', ico: '☏', label: 'Contacts' },
  { to: '/settings', ico: '⚙', label: 'Settings' },
];

const PROVIDER_LABEL = { openai: 'OpenAI', anthropic: 'Claude', mock: 'Offline engine' };
const TITLES = {
  '/': ['Dashboard', 'Your automation suite at a glance'],
  '/inbox': ['AI Inbox', 'Autonomous conversation handling'],
  '/properties': ['Property Database', 'Listings & public records'],
  '/ingest': ['Public Records Pipeline', 'Pull and organize county data'],
  '/contacts': ['Contacts & Leads', 'CRM pipeline'],
  '/settings': ['Settings', 'AI providers, business profile & integrations'],
};

export default function App() {
  const [unread, setUnread] = useState(0);
  const [aiStatus, setAiStatus] = useState(null);
  const loc = useLocation();

  const refreshUnread = useCallback(async () => {
    try { const d = await api.get('/conversations'); setUnread(d.counts.unread); } catch { /* noop */ }
  }, []);
  const refreshAi = useCallback(async () => {
    try { setAiStatus(await api.get('/settings/ai')); } catch { /* noop */ }
  }, []);

  useEffect(() => { refreshUnread(); refreshAi(); }, [refreshUnread, refreshAi]);
  useEffect(() => {
    const t = setInterval(refreshUnread, 15000);
    return () => clearInterval(t);
  }, [refreshUnread]);

  const [title, sub] = TITLES[loc.pathname] || ['EstateFlow', ''];
  const provider = aiStatus?.active;

  return (
    <ToastProvider>
      <AppCtx.Provider value={{ unread, setUnread, refreshUnread, aiStatus, refreshAi }}>
        <div className="shell">
          <aside className="sidebar">
            <div className="brand">
              <div className="brand-mark">⌂</div>
              <div>
                <div className="brand-name">EstateFlow</div>
                <div className="brand-sub">Automation Suite</div>
              </div>
            </div>
            <nav className="nav">
              {NAV.map((n) => (
                <NavLink key={n.to} to={n.to} end={n.to === '/'} className={({ isActive }) => (isActive ? 'active' : '')}>
                  <span className="nav-ico">{n.ico}</span>
                  <span className="nav-label">{n.label}</span>
                  {n.badge === 'unread' && unread > 0 && <span className="nav-badge">{unread}</span>}
                </NavLink>
              ))}
            </nav>
            <div className="sidebar-foot">
              EstateFlow v1.0<br />Node · React · Python
            </div>
          </aside>
          <div className="main">
            <header className="topbar">
              <div>
                <h1>{title}</h1>
                <div className="topbar-sub">{sub}</div>
              </div>
              <div className="topbar-right">
                {provider && (
                  <span className={`badge ${provider === 'mock' ? 'badge-amber' : 'badge-green'}`} title="Active AI provider">
                    ● AI: {PROVIDER_LABEL[provider]}
                  </span>
                )}
              </div>
            </header>
            <main className="content">
              <Routes>
                <Route path="/" element={<Dashboard />} />
                <Route path="/inbox" element={<Inbox />} />
                <Route path="/properties" element={<Properties />} />
                <Route path="/ingest" element={<Ingest />} />
                <Route path="/contacts" element={<Contacts />} />
                <Route path="/settings" element={<SettingsPage />} />
              </Routes>
            </main>
          </div>
        </div>
      </AppCtx.Provider>
    </ToastProvider>
  );
}
