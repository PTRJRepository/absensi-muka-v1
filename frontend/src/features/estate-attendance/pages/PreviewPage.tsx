/**
 * Preview page for the Estate Operations Grid design system.
 * This page demonstrates the design tokens, theme, and AppShell scaffold.
 *
 * To enable: set VITE_UI_ESTATE_GRID=true in .env
 * Access at: /preview/estate
 */
import { Link } from 'react-router-dom';
import { AppShell } from '../components/AppShell';
import '../../../design-system/rebinmas/estate-operations-grid.css';

// Token preview data
const tokenGroups = [
  {
    label: 'Canvas & Surface',
    tokens: [
      { name: '--rb-canvas', var: true },
      { name: '--rb-sidebar', var: true },
      { name: '--rb-panel', var: true },
      { name: '--rb-panel-elevated', var: true },
      { name: '--rb-panel-hover', var: true },
    ],
  },
  {
    label: 'Colors — Semantic',
    tokens: [
      { name: '--rb-leaf', var: true },
      { name: '--rb-leaf-strong', var: true },
      { name: '--rb-estate', var: true },
      { name: '--rb-gold', var: true },
      { name: '--rb-gold-soft', var: true },
      { name: '--rb-cyan', var: true },
    ],
  },
  {
    label: 'Colors — Status',
    tokens: [
      { name: '--rb-present', var: true },
      { name: '--rb-absent', var: true },
      { name: '--rb-sick', var: true },
      { name: '--rb-leave', var: true },
      { name: '--rb-manual', var: true },
      { name: '--rb-review', var: true },
    ],
  },
  {
    label: 'Typography',
    tokens: [
      { name: '--rb-font-sans', var: true },
      { name: '--rb-font-mono', var: true },
      { name: '--rb-text', var: true },
      { name: '--rb-text-secondary', var: true },
      { name: '--rb-text-muted', var: true },
    ],
  },
  {
    label: 'Spacing & Radius',
    tokens: [
      { name: '--rb-sidebar-width', var: true },
      { name: '--rb-detail-width', var: true },
      { name: '--rb-topbar-height', var: true },
      { name: '--rb-matrix-cell-size', var: true },
      { name: '--rb-radius-sm', var: true },
      { name: '--rb-radius-md', var: true },
      { name: '--rb-radius-lg', var: true },
    ],
  },
];

function TokenSwatch({ name }: { name: string }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
      <div
        style={{
          width: 36,
          height: 36,
          borderRadius: 8,
          border: '1px solid var(--rb-border)',
          background: `var(${name})`,
          flexShrink: 0,
        }}
      />
      <div>
        <div style={{ fontSize: 12, fontFamily: 'var(--rb-font-mono)' }}>{name}</div>
        <div style={{ fontSize: 11, color: 'var(--rb-text-muted)' }}>var()</div>
      </div>
    </div>
  );
}

function StatusDemo() {
  const statuses = [
    { label: 'HADIR', cls: 'rb-status-cell--present' },
    { label: 'TIDAK HADIR', cls: 'rb-status-cell--absent' },
    { label: 'SAKIT', cls: 'rb-status-cell--sick' },
    { label: 'CUTI', cls: 'rb-status-cell--leave' },
    { label: 'MANUAL', cls: 'rb-status-cell--manual' },
    { label: 'NO DATA', cls: 'rb-status-cell--no-data' },
  ];
  return (
    <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
      {statuses.map((s) => (
        <div key={s.label} style={{ display: 'grid', gap: 6, alignItems: 'center' }}>
          <div className={`rb-status-cell ${s.cls}`} style={{ width: 36, height: 36 }}>
            {s.label[0]}
          </div>
          <span style={{ fontSize: 10, color: 'var(--rb-text-muted)', textAlign: 'center' }}>{s.label}</span>
        </div>
      ))}
    </div>
  );
}

export function PreviewPage() {
  return (
    <AppShell>
      <div style={{ maxWidth: 960 }}>
        {/* Header */}
        <div className="rb-title-row">
          <div>
            <h1 className="rb-title">Estate Operations Grid</h1>
            <p className="rb-subtitle">
              Preview · Design System Foundation · Phase 1
            </p>
          </div>
          <Link to="/" className="rb-button" style={{ textDecoration: 'none', display: 'inline-flex', alignItems: 'center' }}>
            ← Kembali
          </Link>
        </div>

        {/* Nav Items Demo */}
        <div className="rb-panel" style={{ marginBottom: 16, padding: '20px 24px' }}>
          <div className="rb-panel__title" style={{ marginBottom: 14, fontSize: 13, color: 'var(--rb-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Navigation Items
          </div>
          <nav className="rb-nav" style={{ gridTemplateColumns: 'repeat(3, 1fr)' }} aria-label="Demo nav">
            {[
              ['◈', 'Absensi'],
              ['◈', 'Data Mesin'],
              ['◈', 'Data Parsed'],
              ['◈', 'Pencarian Nama'],
              ['◈', 'Mapping'],
              ['◈', 'Pengaturan'],
            ].map(([icon, label]) => (
              <a className="rb-nav__item" href="#" key={label}>
                <span aria-hidden="true">{icon}</span>
                <span className="rb-nav__label">{label}</span>
              </a>
            ))}
          </nav>
        </div>

        {/* Components Demo */}
        <div className="rb-panel" style={{ marginBottom: 16, padding: '20px 24px' }}>
          <div className="rb-panel__title" style={{ marginBottom: 14, fontSize: 13, color: 'var(--rb-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Status Cells
          </div>
          <StatusDemo />
        </div>

        {/* Token Swatches */}
        <div className="rb-panel" style={{ padding: '20px 24px' }}>
          <div className="rb-panel__title" style={{ marginBottom: 14, fontSize: 13, color: 'var(--rb-text-muted)', textTransform: 'uppercase', letterSpacing: '.06em' }}>
            Design Tokens
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
            {tokenGroups.map((group) => (
              <div key={group.label}>
                <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--rb-gold)', marginBottom: 10, letterSpacing: '.05em' }}>
                  {group.label}
                </div>
                {group.tokens.map((t) => (
                  <TokenSwatch key={t.name} name={t.name} />
                ))}
              </div>
            ))}
          </div>
        </div>

        {/* Brand Mark */}
        <div style={{ marginTop: 20, textAlign: 'center', color: 'var(--rb-text-muted)', fontSize: 11 }}>
          <img
            src="/assets/rebinmas/icons/rebinmas-ui-mark.svg"
            alt="UI Mark"
            style={{ width: 48, height: 48, display: 'block', margin: '0 auto 8px' }}
          />
          ⚠️ TEMPORARY UI MARK — replace with official PT Rebinmas Jaya logo before production
        </div>
      </div>
    </AppShell>
  );
}
