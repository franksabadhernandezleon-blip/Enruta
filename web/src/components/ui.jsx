import { useEffect } from 'react';
import { Loader2, Star, X } from 'lucide-react';

export const Spinner = ({ size = 16 }) => <Loader2 size={size} className="spin" aria-hidden="true" />;

export const Alert = ({ tone = 'error', children }) =>
  children ? (
    <p className={`alert alert-${tone}`} role={tone === 'error' ? 'alert' : 'status'}>
      {children}
    </p>
  ) : null;

export const Field = ({ label, hint, children }) => (
  <label className="field">
    <span>{label}</span>
    {children}
    {hint && <small className="hint">{hint}</small>}
  </label>
);

export const Toggle = ({ checked, onChange, label, hint }) => (
  <label className="toggle">
    <input type="checkbox" checked={Boolean(checked)} onChange={(event) => onChange(event.target.checked)} />
    <span className="toggle-track" aria-hidden="true">
      <span className="toggle-knob" />
    </span>
    <span className="toggle-text">
      <strong>{label}</strong>
      {hint && <small className="hint">{hint}</small>}
    </span>
  </label>
);

export const Stars = ({ value = 5 }) => {
  const rounded = Math.round(Number(value) || 0);
  return (
    <span className="stars" aria-label={`${Number(value).toFixed(1)} de 5`}>
      {[1, 2, 3, 4, 5].map((index) => (
        <Star key={index} size={13} className={index <= rounded ? 'star is-on' : 'star'} aria-hidden="true" />
      ))}
      <b>{Number(value).toFixed(1)}</b>
    </span>
  );
};

export const StatusPill = ({ status, label }) => (
  <span className={`status status-${status}`}>{label || status}</span>
);

export const Chip = ({ children, onClick, tone = 'default', disabled }) => (
  <button type="button" className={`chip chip-${tone}`} onClick={onClick} disabled={disabled}>
    {children}
  </button>
);

export const Section = ({ title, subtitle, actions, children }) => (
  <section className="panel">
    {(title || actions) && (
      <header className="panel-head">
        <div>
          {title && <h2>{title}</h2>}
          {subtitle && <p className="muted">{subtitle}</p>}
        </div>
        {actions}
      </header>
    )}
    {children}
  </section>
);

export const Tabs = ({ tabs, active, onChange }) => (
  <nav className="tabs" role="tablist">
    {tabs.map((tab) => (
      <button
        key={tab.id}
        type="button"
        role="tab"
        aria-selected={active === tab.id}
        className={`tab${active === tab.id ? ' is-active' : ''}`}
        onClick={() => onChange(tab.id)}
      >
        {tab.label}
      </button>
    ))}
  </nav>
);

export const Modal = ({ open, title, onClose, children, footer }) => {
  useEffect(() => {
    if (!open) return undefined;
    const onKeyDown = (event) => {
      if (event.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <div className="modal" role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <h2>{title}</h2>
          <button type="button" className="btn btn-icon" onClick={onClose} aria-label="Cerrar">
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-actions">{footer}</div>}
      </div>
    </div>
  );
};

export const Money = ({ children }) => <span className="money">{children}</span>;
