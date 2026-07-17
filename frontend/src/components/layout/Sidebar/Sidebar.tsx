import { NavLink } from 'react-router-dom';
import {
  LayoutDashboard,
  Monitor,
  ClipboardList,
  FileText,
  Settings,
  Bell,
  Activity,
  Grid3X3,
  Users,
  Terminal,
} from 'lucide-react';
import { UI_ESTATE_GRID } from '../../../config/feature-flags';

const navItems = [
  { to: '/dasbor', icon: LayoutDashboard, label: 'Ops Center' },
  { to: '/monitoring', icon: Activity, label: 'Monitoring' },
  { to: '/mesin', icon: Monitor, label: 'Mesin Absensi' },
  { to: '/absensi', icon: ClipboardList, label: 'Absensi Harian' },
  { to: '/absensi/matriks', icon: Grid3X3, label: 'Matriks Bulanan' },
  { to: '/karyawan', icon: Users, label: 'Karyawan' },
  { to: '/laporan', icon: FileText, label: 'Data Quality' },
  { to: '/notifikasi', icon: Bell, label: 'Notifikasi' },
  { to: '/claude-cli', icon: Terminal, label: 'Claude CLI' },
];

// Estate Operations Grid nav items — visible when VITE_UI_ESTATE_GRID=true
const estateNavItems = [
  { to: '/attendance', icon: ClipboardList, label: 'Absensi' },
  { to: '/machines', icon: Monitor, label: 'Data Mesin' },
  { to: '/parsed', icon: FileText, label: 'Data Parsed' },
  { to: '/employees', icon: Users, label: 'Pencarian Nama' },
  { to: '/mapping', icon: Activity, label: 'Mapping' },
];

export function Sidebar() {
  // When Estate Operations Grid is enabled, show estate nav; otherwise legacy nav
  const showEstateNav = UI_ESTATE_GRID;
  const activeNavItems = showEstateNav ? estateNavItems : navItems;

  return (
    <aside className="app-sidebar">
      <div className="sidebar-logo">
        REBINMAS <span>Absensi Monitoring</span>
      </div>

      <nav className="sidebar-nav">
        {showEstateNav && (
          <div className="sidebar-section">Estate Operations Grid</div>
        )}
        {showEstateNav ? (
          // Estate nav items
          activeNavItems.map(({ to, icon: Icon, label }) => (
            <NavLink
              key={to}
              to={to}
              className={({ isActive }) => (isActive ? 'active' : '')}
            >
              <Icon size={18} />
              {label}
            </NavLink>
          ))
        ) : (
          // Legacy nav items
          <>
            <div className="sidebar-section">Menu Utama</div>
            {navItems.map(({ to, icon: Icon, label }) => (
              <NavLink
                key={to}
                to={to}
                className={({ isActive }) => (isActive ? 'active' : '')}
              >
                <Icon size={18} />
                {label}
              </NavLink>
            ))}
          </>
        )}

        <div className="sidebar-section">Sistem</div>
        <NavLink
          to="/pengaturan"
          className={({ isActive }) => (isActive ? 'active' : '')}
        >
          <Settings size={18} />
          Pengaturan
        </NavLink>
      </nav>

      <div style={{ padding: '16px', marginTop: 'auto', borderTop: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ fontSize: '11px', color: 'rgba(255,255,255,0.4)' }}>
          REBINMAS Absensi Monitoring v1.0
        </div>
      </div>
    </aside>
  );
}
