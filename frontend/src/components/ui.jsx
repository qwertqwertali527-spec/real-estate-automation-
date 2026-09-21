import React, { createContext, useContext, useState, useCallback } from 'react';

// ── toast ──
const ToastCtx = createContext(null);
export function ToastProvider({ children }) {
  const [toast, setToast] = useState(null);
  const show = useCallback((msg, isError = false) => {
    setToast({ msg, isError, id: Date.now() });
    setTimeout(() => setToast(null), 3400);
  }, []);
  return (
    <ToastCtx.Provider value={show}>
      {children}
      {toast && <div className={`toast${toast.isError ? ' err' : ''}`}>{toast.msg}</div>}
    </ToastCtx.Provider>
  );
}
export const useToast = () => useContext(ToastCtx);

// ── app context (provider status + unread count, shared across pages) ──
export const AppCtx = createContext({ unread: 0, setUnread: () => {}, aiStatus: null, refreshAi: () => {} });
export const useApp = () => useContext(AppCtx);

// ── modal ──
export function Modal({ title, onClose, children, footer, width }) {
  return (
    <div className="overlay" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={width ? { maxWidth: width } : undefined}>
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-foot">{footer}</div>}
      </div>
    </div>
  );
}

// ── drawer ──
export function Drawer({ title, onClose, children, headExtra }) {
  return (
    <>
      <div className="drawer-overlay" onClick={onClose} />
      <div className="drawer">
        <div className="drawer-head">
          <h3 style={{ margin: 0, fontSize: 15 }}>{title}</h3>
          {headExtra}
          <button className="x-btn" onClick={onClose}>✕</button>
        </div>
        <div className="drawer-body">{children}</div>
      </div>
    </>
  );
}

// ── badges ──
const STATUS_COLORS = {
  new: 'badge-blue', active: 'badge-green', prospect: 'badge-purple', under_contract: 'badge-amber',
  sold: 'badge-gray', archived: 'badge-gray',
  buyer: 'badge-blue', seller: 'badge-purple', renter: 'badge-amber', investor: 'badge-green', agent: 'badge-gray', vendor: 'badge-gray',
  contacted: 'badge-amber', qualified: 'badge-green', negotiating: 'badge-purple', closed: 'badge-gray', lost: 'badge-red',
  open: 'badge-green', pending_human: 'badge-red',
  sms: 'badge-purple', email: 'badge-blue', webchat: 'badge-amber',
  success: 'badge-green', error: 'badge-red', running: 'badge-amber',
};
export const Badge = ({ v, children }) => <span className={STATUS_COLORS[v] || 'badge-gray'}>{children ?? String(v).replace(/_/g, ' ')}</span>;

export const Spinner = () => <div className="spinner" />;
export const Empty = ({ children }) => <div className="empty">{children}</div>;

export const Stat = ({ label, value, hint, accent }) => (
  <div className="card stat">
    <div className="stat-label">{label}</div>
    <div className="stat-value" style={accent ? { color: accent } : undefined}>{value}</div>
    {hint && <div className="stat-hint">{hint}</div>}
  </div>
);

export const Toggle = ({ checked, onChange }) => (
  <label className="toggle">
    <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} />
    <span className="toggle-slider" />
  </label>
);
