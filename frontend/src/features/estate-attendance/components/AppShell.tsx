import { NavLink } from 'react-router-dom';
import type { ReactNode } from 'react';

interface AppShellProps {
  children: ReactNode;
}

const navigation = [
  ['Absensi', '/attendance'],
  ['Data Mesin', '/machines'],
  ['Data Parsed', '/parsed'],
  ['Pencarian Nama', '/employees'],
  ['Mapping', '/mapping'],
  ['Pengaturan', '/settings'],
] as const;

export function AppShell({ children }: AppShellProps) {
  return (
    <div className="rb-app">
      <div className="rb-shell">
        <aside className="rb-sidebar">
          {/* Brand */}
          <div className="rb-brand">
            <img
              className="rb-brand__mark"
              src="/assets/rebinmas/icons/rebinmas-ui-mark.svg"
              alt="PT Rebinmas Jaya"
            />
            <div className="rb-brand__copy">
              <div className="rb-brand__title">PT REBINMAS JAYA</div>
              <div className="rb-brand__subtitle">ESTATE OPERATIONS INTELLIGENCE</div>
            </div>
          </div>

          {/* Navigation */}
          <nav className="rb-nav" aria-label="Navigasi utama">
            {navigation.map(([label, href], index) => (
              <NavLink
                to={href}
                className={({ isActive }) =>
                  `rb-nav__item${isActive ? " [aria-current='page']" : ""}`
                }
                key={href}
              >
                <span aria-hidden="true">◈</span>
                <span className="rb-nav__label">{label}</span>
              </NavLink>
            ))}
          </nav>

          {/* Footer */}
          <div className="rb-sidebar__footer" style={{ marginTop: 'auto', color: 'var(--rb-text-muted)', fontSize: 11, padding: 8 }}>
            Sistem internal · Estate Operations Grid
          </div>
        </aside>

        <main className="rb-content">{children}</main>
      </div>
    </div>
  );
}
