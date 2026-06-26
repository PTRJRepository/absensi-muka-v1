# FRONTEND REFACTOR PLAN — Absensi Muka

**Project:** D:/Gawean Rebinmas/Absensi_Muka/frontend
**Framework:** React 19 + Vite + TypeScript
**Author:** Chord (Senior Frontend Architect)
**Date:** 2026-06-19
**Status:** DRAFT

---

## 1. COLOR & THEME MIGRATION (P0 — Critical)

### 1.1 Current State
- Primary blue: `#1e40af`, `#3b82f6`
- Success green: `#059669`, `#10b981`
- Gray scale: `#f9fafb` → `#111827`

### 1.2 Target Corporate Colors
| Token | Value | Usage |
|-------|-------|-------|
| `--primary` | `#071426` | Dark navy - main headers, primary buttons |
| `--primary-light` | `#0d2240` | Lighter navy for hover states |
| `--primary-accent` | `#1a4a7a` | Accent for active states |
| `--success` | `#167A3A` | Corporate green - online status, positive actions |
| `--success-light` | `#e8f5e9` | Light green background |
| `--warning` | `#d97706` | Amber - syncing status, warnings |
| `--warning-light` | `#fef3c7` | Light amber background |
| `--error` | `#dc2626` | Red - errors, offline, critical |
| `--error-light` | `#fee2e2` | Light red background |
| `--info` | `#0891b2` | Cyan - informational badges |
| `--info-light` | `#cffafe` | Light cyan background |

### 1.3 CSS Variables Update (`src/styles.css`)

```css
:root {
  /* === Corporate Colors (PT Rebinmas Jaya) === */
  --primary: #071426;
  --primary-light: #0d2240;
  --primary-accent: #1a4a7a;
  --primary-hover: #2563eb;

  --success: #167A3A;
  --success-light: #e8f5e9;
  --success-muted: #a7f3d0;

  --warning: #d97706;
  --warning-light: #fef3c7;

  --error: #dc2626;
  --error-light: #fee2e2;

  --info: #0891b2;
  --info-light: #cffafe;

  /* === Grays (maintain existing) === */
  --gray-50: #f9fafb;
  --gray-100: #f3f4f6;
  --gray-200: #e5e7eb;
  --gray-300: #d1d5db;
  --gray-500: #6b7280;
  --gray-700: #374151;
  --gray-900: #111827;

  /* === Semantic Tokens === */
  --bg-page: #f3f4f6;
  --bg-card: #ffffff;
  --text-primary: #111827;
  --text-secondary: #6b7280;
  --border-color: #e5e7eb;
  --shadow-sm: 0 1px 2px rgba(7, 20, 38, 0.05);
  --shadow-md: 0 4px 6px -1px rgba(7, 20, 38, 0.1);
  --shadow-lg: 0 10px 15px -3px rgba(7, 20, 38, 0.1);
}
```

### 1.4 Gradient Update for Header
```css
.app-header {
  background: linear-gradient(135deg, var(--primary) 0%, var(--primary-light) 100%);
}
```

---

## 2. UI LANGUAGE MIGRATION — English → Bahasa Indonesia (P0 — Critical)

### 2.1 Navigation & Headers

| English | Bahasa Indonesia |
|---------|-----------------|
| Dashboard | Dasbor |
| Machine Status | Status Mesin |
| Live Attendance | Absensi Realtime |
| Attendance | Absensi |
| Employees | Karyawan |
| Schedule | Jadwal |
| Quality Report | Laporan Kualitas |
| Sync Status | Status Sinkronisasi |
| Settings | Pengaturan |
| Reports | Laporan |

### 2.2 Dashboard Stats Labels

| English | Bahasa Indonesia |
|---------|-----------------|
| Total Machines | Total Mesin |
| Online | Online |
| Offline | Offline |
| Employees | Karyawan |
| Scans Today | Scan Hari Ini |
| Unmapped | Belum Dipetakan |
| Quality Score | Skor Kualitas |
| Last Sync | Sinkronisasi Terakhir |

### 2.3 Machine Status Table

| English | Bahasa Indonesia |
|---------|-----------------|
| Machine | Mesin |
| Location | Lokasi |
| Status | Status |
| Last Sync | Sinkronisasi Terakhir |
| Scans (1h) | Scan (1j) |
| Users | Pengguna |
| Last 10 min | 10 Menit Terakhir |
| Last 30 min | 30 Menit Terakhir |
| Last 1 hour | 1 Jam Terakhir |

### 2.4 Attendance Table

| English | Bahasa Indonesia |
|---------|-----------------|
| Time | Waktu |
| Employee | Karyawan |
| Device ID | ID Perangkat |
| No recent attendance records | Tidak ada data absensi terbaru |
| Mapped | Dipetakan |
| Unmapped | Belum Dipetakan |

### 2.5 Quality Report

| English | Bahasa Indonesia |
|---------|-----------------|
| Overall Status | Status Keseluruhan |
| Healthy | Sehat |
| Warning | Peringatan |
| Critical | Kritis |
| Critical Count | Jumlah Kritis |
| High Count | Jumlah Tinggi |
| Medium Count | Jumlah Sedang |
| Check | Pemeriksaan |
| Pass | Lulus |
| Fail | Gagal |
| Fix Duplicates | Perbaiki Duplikat |
| View Full Report | Lihat Laporan Lengkap |
| Unmapped Employees | Karyawan Belum Dipetakan |

### 2.6 Scheduler Status

| English | Bahasa Indonesia |
|---------|-----------------|
| IDLE | MENGANGGU |
| SYNCING | MENYINKRONKAN |
| ERROR | KESALAHAN |
| Next | Berikutnya |

### 2.7 Common Actions

| English | Bahasa Indonesia |
|---------|-----------------|
| Refresh | Segarkan |
| Export | Ekspor |
| Filter | Filter |
| Search | Cari |
| Loading | Memuat... |
| Error | Kesalahan |
| Success | Berhasil |
| Cancel | Batal |
| Save | Simpan |
| Delete | Hapus |
| Edit | Ubah |
| Add | Tambah |

---

## 3. COMPONENT ARCHITECTURE REDESIGN (P0 — Critical)

### 3.1 New File Structure

```
src/
├── components/
│   ├── common/
│   │   ├── Button/
│   │   │   ├── Button.tsx
│   │   │   └── Button.module.css
│   │   ├── Badge/
│   │   │   ├── Badge.tsx
│   │   │   └── Badge.module.css
│   │   ├── Card/
│   │   │   ├── Card.tsx
│   │   │   └── Card.module.css
│   │   ├── StatCard/
│   │   │   ├── StatCard.tsx
│   │   │   └── StatCard.module.css
│   │   ├── Table/
│   │   │   ├── DataTable.tsx
│   │   │   └── DataTable.module.css
│   │   ├── Skeleton/
│   │   │   ├── Skeleton.tsx
│   │   │   └── Skeleton.module.css
│   │   └── ErrorBoundary/
│   │       ├── ErrorBoundary.tsx
│   │       └── ErrorBoundary.module.css
│   ├── layout/
│   │   ├── Header/
│   │   │   ├── Header.tsx
│   │   │   └── Header.module.css
│   │   ├── Sidebar/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Sidebar.module.css
│   │   └── Layout/
│   │       ├── Layout.tsx
│   │       └── Layout.module.css
│   └── features/
│       ├── dashboard/
│       │   ├── DashboardPage.tsx
│       │   └── DashboardPage.module.css
│       ├── machines/
│       │   ├── MachinesPage.tsx
│       │   ├── MachineCard.tsx
│       │   └── MachinesPage.module.css
│       ├── attendance/
│       │   ├── AttendancePage.tsx
│       │   ├── AttendanceChart.tsx
│       │   └── AttendancePage.module.css
│       ├── quality/
│       │   ├── QualityPage.tsx
│       │   └── QualityPage.module.css
│       └── settings/
│           ├── SettingsPage.tsx
│           └── SettingsPage.module.css
├── lib/
│   ├── api.ts (existing)
│   └── constants.ts
├── hooks/
│   ├── useApi.ts
│   └── useDashboardStats.ts
├── types/
│   └── index.ts
├── pages/
│   └── (routes defined in router.tsx)
├── router.tsx
├── App.tsx
├── main.tsx
└── styles.css
```

### 3.2 Component Specifications

#### Header Component (`src/components/layout/Header/Header.tsx`)

```tsx
import { RefreshCw } from 'lucide-react';
import { SchedulerStatus } from '../../features/machines/SchedulerStatus';
import styles from './Header.module.css';

interface HeaderProps {
  title: string;
  onRefresh?: () => void;
  isRefreshing?: boolean;
}

export function Header({ title, onRefresh, isRefreshing }: HeaderProps) {
  return (
    <header className={styles.header}>
      <div className={styles.titleSection}>
        <h1 className={styles.title}>{title}</h1>
        <span className={styles.subtitle}>PT Rebinmas Jaya</span>
      </div>
      <div className={styles.actions}>
        <SchedulerStatus />
        {onRefresh && (
          <button
            className={styles.refreshBtn}
            onClick={onRefresh}
            disabled={isRefreshing}
            aria-label="Segarkan data"
          >
            <RefreshCw size={18} className={isRefreshing ? styles.spinning : ''} />
          </button>
        )}
      </div>
    </header>
  );
}
```

#### Sidebar Component (`src/components/layout/Sidebar/Sidebar.tsx`)

```tsx
import { NavLink } from 'react-router-dom';
import { LayoutDashboard, Monitor, Users, ClipboardCheck, Settings } from 'lucide-react';
import styles from './Sidebar.module.css';

const navItems = [
  { path: '/dasbor', label: 'Dasbor', icon: LayoutDashboard },
  { path: '/mesin', label: 'Status Mesin', icon: Monitor },
  { path: '/absensi', label: 'Absensi', icon: Users },
  { path: '/laporan', label: 'Laporan Kualitas', icon: ClipboardCheck },
  { path: '/pengaturan', label: 'Pengaturan', icon: Settings },
];

export function Sidebar() {
  return (
    <aside className={styles.sidebar}>
      <div className={styles.logo}>
        <span className={styles.logoIcon}>🏭</span>
        <span className={styles.logoText}>Absensi</span>
      </div>
      <nav className={styles.nav}>
        {navItems.map(({ path, label, icon: Icon }) => (
          <NavLink
            key={path}
            to={path}
            className={({ isActive }) =>
              `${styles.navItem} ${isActive ? styles.active : ''}`
            }
          >
            <Icon size={20} />
            <span>{label}</span>
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
```

#### StatCard Component (`src/components/common/StatCard/StatCard.tsx`)

```tsx
import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import styles from './StatCard.module.css';

type Variant = 'primary' | 'success' | 'warning' | 'error' | 'info';

interface StatCardProps {
  icon: LucideIcon;
  value: string | number;
  label: string;
  variant?: Variant;
  trend?: { value: number; isPositive: boolean };
}

export function StatCard({ icon: Icon, value, label, variant = 'primary' }: StatCardProps) {
  return (
    <div className={`${styles.card} ${styles[variant]}`}>
      <div className={styles.iconWrapper}>
        <Icon size={24} />
      </div>
      <div className={styles.content}>
        <span className={styles.value}>{value}</span>
        <span className={styles.label}>{label}</span>
      </div>
    </div>
  );
}
```

#### ErrorBoundary Component (`src/components/common/ErrorBoundary/ErrorBoundary.tsx`)

```tsx
import { Component, type ReactNode } from 'react';
import { AlertTriangle } from 'lucide-react';
import styles from './ErrorBoundary.module.css';

interface Props { children: ReactNode; fallback?: ReactNode; }
interface State { hasError: boolean; error?: Error; }

export class ErrorBoundary extends Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  render() {
    if (this.state.hasError) {
      return this.props.fallback ?? (
        <div className={styles.container}>
          <AlertTriangle size={48} className={styles.icon} />
          <h2>Terjadi Kesalahan</h2>
          <p>{this.state.error?.message || 'Gagal memuat komponen'}</p>
          <button onClick={() => window.location.reload()}>Muat Ulang</button>
        </div>
      );
    }
    return this.props.children;
  }
}
```

#### SchedulerStatus Component (`src/components/features/machines/SchedulerStatus.tsx`)

```tsx
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { Activity, AlertCircle } from 'lucide-react';
import styles from './SchedulerStatus.module.css';

interface SchedulerData {
  is_running: boolean;
  next_sync: string | null;
  status: 'IDLE' | 'SYNCING' | 'ERROR';
}

export function SchedulerStatus() {
  const { data } = useQuery<SchedulerData>({
    queryKey: ['scheduler-status'],
    queryFn: () => api<SchedulerData>('/api/scheduler/status'),
    refetchInterval: 10000,
  });

  if (!data) return null;

  const statusConfig = {
    IDLE: { icon: Activity, className: styles.idle, label: 'Menganggur' },
    SYNCING: { icon: Activity, className: styles.syncing, label: 'Menyinkronkan' },
    ERROR: { icon: AlertCircle, className: styles.error, label: 'Kesalahan' },
  };

  const config = statusConfig[data.status] || statusConfig.IDLE;
  const Icon = config.icon;

  return (
    <div className={`${styles.container} ${config.className}`}>
      <span className={styles.dot} />
      <Icon size={14} />
      <span className={styles.label}>{config.label}</span>
      {data.next_sync && (
        <span className={styles.next}>
          Berikutnya: {new Date(data.next_sync).toLocaleTimeString()}
        </span>
      )}
    </div>
  );
}
```

---

## 4. WINDOWS TILE DESIGN SYSTEM (P0 — Critical)

### 4.1 Design Principles
- **Grid-based layout** — Like Windows 11 Start Menu tiles
- **Card-based components** — Rounded corners (8px), subtle shadows
- **Status indicators** — Colored dots (green=online, red=offline, amber=syncing)
- **Consistent spacing** — 16px base unit, 24px gaps
- **Responsive grid** — 1-4 columns based on viewport width

### 4.2 Tile Grid System

```css
/* src/styles.css - Tile Grid */
.tile-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 24px;
  padding: 0;
}

.tile-grid.cols-2 {
  grid-template-columns: repeat(2, 1fr);
}

.tile-grid.cols-3 {
  grid-template-columns: repeat(3, 1fr);
}

.tile-grid.cols-4 {
  grid-template-columns: repeat(4, 1fr);
}

@media (max-width: 1200px) {
  .tile-grid { grid-template-columns: repeat(3, 1fr); }
}
@media (max-width: 900px) {
  .tile-grid { grid-template-columns: repeat(2, 1fr); }
}
@media (max-width: 600px) {
  .tile-grid { grid-template-columns: 1fr; }
}
```

### 4.3 Tile Card Component

```tsx
// src/components/common/Tile/Tile.tsx
import type { ReactNode } from 'react';
import styles from './Tile.module.css';

interface TileProps {
  title: string;
  icon?: ReactNode;
  children: ReactNode;
  action?: ReactNode;
  variant?: 'default' | 'status' | 'chart';
}

export function Tile({ title, icon, children, action, variant = 'default' }: TileProps) {
  return (
    <div className={`${styles.tile} ${styles[variant]}`}>
      <div className={styles.header}>
        {icon && <span className={styles.icon}>{icon}</span>}
        <h3 className={styles.title}>{title}</h3>
        {action && <div className={styles.action}>{action}</div>}
      </div>
      <div className={styles.content}>{children}</div>
    </div>
  );
}
```

```css
/* src/components/common/Tile/Tile.module.css */
.tile {
  background: var(--bg-card);
  border-radius: 8px;
  box-shadow: var(--shadow-sm);
  border: 1px solid var(--border-color);
  overflow: hidden;
  transition: box-shadow 0.2s ease;
}

.tile:hover {
  box-shadow: var(--shadow-md);
}

.header {
  display: flex;
  align-items: center;
  gap: 12px;
  padding: 16px;
  border-bottom: 1px solid var(--border-color);
  background: var(--gray-50);
}

.icon {
  font-size: 20px;
}

.title {
  flex: 1;
  margin: 0;
  font-size: 14px;
  font-weight: 600;
  color: var(--text-primary);
}

.content {
  padding: 16px;
}
```

### 4.4 Status Indicators

```tsx
// src/components/common/StatusDot/StatusDot.tsx
import styles from './StatusDot.module.css';

type Status = 'online' | 'offline' | 'syncing' | 'warning' | 'error';

interface StatusDotProps {
  status: Status;
  label?: string;
  pulse?: boolean;
}

const statusLabels: Record<Status, string> = {
  online: 'Online',
  offline: 'Offline',
  syncing: 'Menyinkronkan',
  warning: 'Peringatan',
  error: 'Kesalahan',
};

export function StatusDot({ status, label, pulse = false }: StatusDotProps) {
  return (
    <span className={styles.container}>
      <span className={`${styles.dot} ${styles[status]} ${pulse ? styles.pulse : ''}`} />
      {label ?? statusLabels[status]}
    </span>
  );
}
```

```css
/* Status Colors */
.dot.online { background: var(--success); }
.dot.offline { background: var(--gray-500); }
.dot.syncing { background: var(--warning); }
.dot.warning { background: var(--warning); }
.dot.error { background: var(--error); }

.pulse {
  animation: pulse 2s ease-in-out infinite;
}

@keyframes pulse {
  0%, 100% { opacity: 1; }
  50% { opacity: 0.5; }
}
```

### 4.5 Loading Skeleton

```tsx
// src/components/common/Skeleton/Skeleton.tsx
import styles from './Skeleton.module.css';

interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = 20, borderRadius = '4px', className }: SkeletonProps) {
  return (
    <span
      className={`${styles.skeleton} ${className || ''}`}
      style={{ width, height, borderRadius }}
    />
  );
}

// Preset skeletons for common use cases
export function StatCardSkeleton() {
  return (
    <div className={styles.statCard}>
      <Skeleton width={40} height={40} borderRadius="8px" />
      <div className={styles.statContent}>
        <Skeleton width={60} height={24} />
        <Skeleton width={80} height={12} />
      </div>
    </div>
  );
}

export function TableRowSkeleton({ columns = 5 }: { columns?: number }) {
  return (
    <tr className={styles.tableRow}>
      {Array.from({ length: columns }).map((_, i) => (
        <td key={i}><Skeleton height={16} /></td>
      ))}
    </tr>
  );
}
```

---

## 5. DATA VISUALIZATION UPGRADE (P1 — Important)

### 5.1 Required Dependencies (add to package.json)

```bash
npm install react-router-dom lucide-react
```

### 5.2 Charts Implementation

#### Attendance Bar Chart (`src/components/features/attendance/AttendanceChart.tsx`)

```tsx
import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer } from 'recharts';
import styles from './AttendanceChart.module.css';

interface ChartData {
  hour: string;
  scans: number;
}

interface AttendanceChartProps {
  data: ChartData[];
  title?: string;
}

export function AttendanceChart({ data, title = 'Scan per Jam' }: AttendanceChartProps) {
  return (
    <div className={styles.container}>
      <h4 className={styles.title}>{title}</h4>
      <ResponsiveContainer width="100%" height={200}>
        <BarChart data={data} margin={{ top: 10, right: 10, left: -20, bottom: 0 }}>
          <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
          <XAxis
            dataKey="hour"
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <YAxis
            tick={{ fontSize: 12, fill: '#6b7280' }}
            axisLine={{ stroke: '#e5e7eb' }}
          />
          <Tooltip
            contentStyle={{
              background: '#fff',
              border: '1px solid #e5e7eb',
              borderRadius: '8px',
              fontSize: '12px',
            }}
            labelStyle={{ color: '#111827', fontWeight: 600 }}
          />
          <Bar
            dataKey="scans"
            fill="#167A3A"
            radius={[4, 4, 0, 0]}
            maxBarSize={40}
          />
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
```

#### Machine Status Distribution (Pie Chart)

```tsx
import { PieChart, Pie, Cell, Legend, Tooltip, ResponsiveContainer } from 'recharts';
import { StatusDot } from '../../common/StatusDot/StatusDot';

const COLORS = {
  online: '#167A3A',
  offline: '#6b7280',
  warning: '#d97706',
};

interface MachinePieData {
  name: string;
  value: number;
  status: 'online' | 'offline' | 'warning';
}

export function MachineStatusChart({ data }: { data: MachinePieData[] }) {
  const total = data.reduce((sum, d) => sum + d.value, 0);

  return (
    <div className={styles.chartContainer}>
      <ResponsiveContainer width="100%" height={200}>
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="50%"
            innerRadius={50}
            outerRadius={80}
            paddingAngle={2}
            dataKey="value"
          >
            {data.map((entry, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[entry.status]} />
            ))}
          </Pie>
          <Tooltip />
          <Legend
            formatter={(value, entry) => (
              <span style={{ color: '#374151', fontSize: '12px' }}>
                {value} ({((entry.payload.value / total) * 100).toFixed(0)}%)
              </span>
            )}
          />
        </PieChart>
      </ResponsiveContainer>
    </div>
  );
}
```

### 5.3 TanStack Table Integration

```tsx
// src/components/common/DataTable/DataTable.tsx
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  getPaginationRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { useState } from 'react';
import { ChevronUp, ChevronDown, ChevronLeft, ChevronRight } from 'lucide-react';
import styles from './DataTable.module.css';

interface DataTableProps<T> {
  data: T[];
  columns: ColumnDef<T>[];
  pageSize?: number;
  emptyMessage?: string;
}

export function DataTable<T>({ data, columns, pageSize = 10, emptyMessage = 'Tidak ada data' }: DataTableProps<T>) {
  const [sorting, setSorting] = useState<SortingState>([]);

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
    getPaginationRowModel: getPaginationRowModel(),
    initialState: { pagination: { pageSize } },
  });

  if (data.length === 0) {
    return <div className={styles.empty}>{emptyMessage}</div>;
  }

  return (
    <div className={styles.container}>
      <table className={styles.table}>
        <thead>
          {table.getHeaderGroups().map(headerGroup => (
            <tr key={headerGroup.id}>
              {headerGroup.headers.map(header => (
                <th
                  key={header.id}
                  onClick={header.column.getToggleSortingHandler()}
                  className={header.column.getCanSort() ? styles.sortable : ''}
                >
                  {flexRender(header.column.columnDef.header, header.getContext())}
                  {header.column.getIsSorted() === 'asc' && <ChevronUp size={14} />}
                  {header.column.getIsSorted() === 'desc' && <ChevronDown size={14} />}
                </th>
              ))}
            </tr>
          ))}
        </thead>
        <tbody>
          {table.getRowModel().rows.map(row => (
            <tr key={row.id}>
              {row.getVisibleCells().map(cell => (
                <td key={cell.id}>
                  {flexRender(cell.column.columnDef.cell, cell.getContext())}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>

      <div className={styles.pagination}>
        <span className={styles.pageInfo}>
          Halaman {table.getState().pagination.pageIndex + 1} dari {table.getPageCount()}
        </span>
        <div className={styles.pageControls}>
          <button
            onClick={() => table.previousPage()}
            disabled={!table.getCanPreviousPage()}
            className={styles.pageBtn}
          >
            <ChevronLeft size={16} />
          </button>
          <button
            onClick={() => table.nextPage()}
            disabled={!table.getCanNextPage()}
            className={styles.pageBtn}
          >
            <ChevronRight size={16} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

---

## 6. ROUTING & PAGE STRUCTURE (P0 — Critical)

### 6.1 Router Setup (`src/router.tsx`)

```tsx
import { createBrowserRouter, RouterProvider } from 'react-router-dom';
import { Layout } from './components/layout/Layout/Layout';
import { DashboardPage } from './components/features/dashboard/DashboardPage';
import { MachinesPage } from './components/features/machines/MachinesPage';
import { AttendancePage } from './components/features/attendance/AttendancePage';
import { QualityPage } from './components/features/quality/QualityPage';
import { SettingsPage } from './components/features/settings/SettingsPage';
import { ErrorBoundary } from './components/common/ErrorBoundary/ErrorBoundary';

const router = createBrowserRouter([
  {
    path: '/',
    element: <Layout />,
    errorElement: <ErrorBoundary />,
    children: [
      { index: true, element: <DashboardPage /> },
      { path: 'dasbor', element: <DashboardPage /> },
      { path: 'mesin', element: <MachinesPage /> },
      { path: 'absensi', element: <AttendancePage /> },
      { path: 'laporan', element: <QualityPage /> },
      { path: 'pengaturan', element: <SettingsPage /> },
    ],
  },
]);

export function AppRouter() {
  return <RouterProvider router={router} />;
}
```

### 6.2 Layout Component (`src/components/layout/Layout/Layout.tsx`)

```tsx
import { Outlet } from 'react-router-dom';
import { Sidebar } from '../Sidebar/Sidebar';
import styles from './Layout.module.css';

export function Layout() {
  return (
    <div className={styles.layout}>
      <Sidebar />
      <main className={styles.main}>
        <Outlet />
      </main>
    </div>
  );
}
```

### 6.3 Page Components

#### DashboardPage (`src/components/features/dashboard/DashboardPage.tsx`)

```tsx
import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { StatCard } from '../../common/StatCard/StatCard';
import { Skeleton, StatCardSkeleton } from '../../common/Skeleton/Skeleton';
import { api } from '../../../lib/api';
import { Factory, Wifi, Users, ClipboardList, AlertTriangle, TrendingUp } from 'lucide-react';
import styles from './DashboardPage.module.css';

interface DashboardStats {
  total_machines: number;
  online_machines: number;
  total_employees: number;
  total_scans_today: number;
  unmapped_count: number;
  quality_score: number;
  last_sync: string | null;
}

export function DashboardPage() {
  const { data, isLoading, refetch } = useQuery<DashboardStats>({
    queryKey: ['dashboard-stats'],
    queryFn: () => api<DashboardStats>('/api/dashboard/stats'),
    refetchInterval: 30000,
  });

  const statCards = [
    { icon: Factory, value: data?.total_machines ?? 0, label: 'Total Mesin', variant: 'primary' as const },
    { icon: Wifi, value: data?.online_machines ?? 0, label: 'Online', variant: 'success' as const },
    { icon: Users, value: data?.total_employees ?? 0, label: 'Karyawan', variant: 'info' as const },
    { icon: ClipboardList, value: data?.total_scans_today ?? 0, label: 'Scan Hari Ini', variant: 'warning' as const },
    { icon: AlertTriangle, value: data?.unmapped_count ?? 0, label: 'Belum Dipetakan', variant: 'error' as const },
    { icon: TrendingUp, value: `${data?.quality_score ?? 0}%`, label: 'Skor Kualitas', variant: 'success' as const },
  ];

  return (
    <div className={styles.page}>
      <Header title="Dasbor" onRefresh={() => refetch()} isRefreshing={isLoading} />

      <div className={styles.content}>
        <div className={styles.tileGrid}>
          {isLoading ? (
            Array.from({ length: 6 }).map((_, i) => <StatCardSkeleton key={i} />)
          ) : (
            statCards.map((card, i) => (
              <StatCard key={i} icon={card.icon} value={card.value} label={card.label} variant={card.variant} />
            ))
          )}
        </div>

        <div className={styles.footer}>
          <span className={styles.syncInfo}>
            Sinkronisasi Terakhir: {data?.last_sync
              ? new Date(data.last_sync).toLocaleString('id-ID')
              : 'Belum pernah'}
          </span>
        </div>
      </div>
    </div>
  );
}
```

#### MachinesPage (`src/components/features/machines/MachinesPage.tsx`)

```tsx
import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { StatusDot } from '../../common/StatusDot/StatusDot';
import { TableRowSkeleton } from '../../common/Skeleton/Skeleton';
import { DataTable } from '../../common/DataTable/DataTable';
import { api } from '../../../lib/api';
import { type ColumnDef } from '@tanstack/react-table';
import { Monitor } from 'lucide-react';
import styles from './MachinesPage.module.css';

interface Machine {
  machine_code: string;
  location_name: string;
  access_status: string;
  is_online: boolean;
  last_sync: string | null;
  scans_last_hour: number;
  total_users: number;
}

interface LiveFeedStats {
  stats: { last_10_minutes: number; last_30_minutes: number; last_1_hour: number };
  machineStatus: Machine[];
}

export function MachinesPage() {
  const { data, isLoading, refetch } = useQuery<LiveFeedStats>({
    queryKey: ['machine-status'],
    queryFn: () => api<LiveFeedStats>('/api/realtime/feed-stats'),
    refetchInterval: 30000,
  });

  const columns: ColumnDef<Machine>[] = [
    { accessorKey: 'machine_code', header: 'Mesin' },
    { accessorKey: 'location_name', header: 'Lokasi' },
    {
      accessorKey: 'is_online',
      header: 'Status',
      cell: ({ row }) => {
        const m = row.original;
        const status = !m.is_online ? 'offline' :
          m.access_status === 'ACCESSIBLE' ? 'online' :
          m.access_status === 'PORT_BLOCKED' ? 'warning' : 'error';
        return <StatusDot status={status} />;
      },
    },
    {
      accessorKey: 'last_sync',
      header: 'Sinkronisasi Terakhir',
      cell: ({ getValue }) => getValue() ? new Date(getValue() as string).toLocaleTimeString('id-ID') : '-',
    },
    { accessorKey: 'scans_last_hour', header: 'Scan (1j)' },
    { accessorKey: 'total_users', header: 'Pengguna' },
  ];

  const quickStats = [
    { label: '10 Menit Terakhir', value: data?.stats.last_10_minutes ?? 0 },
    { label: '30 Menit Terakhir', value: data?.stats.last_30_minutes ?? 0 },
    { label: '1 Jam Terakhir', value: data?.stats.last_1_hour ?? 0 },
  ];

  return (
    <div className={styles.page}>
      <Header title="Status Mesin" onRefresh={() => refetch()} isRefreshing={isLoading} />

      <div className={styles.content}>
        <div className={styles.quickStats}>
          {quickStats.map((stat, i) => (
            <div key={i} className={styles.quickStat}>
              <span className={styles.quickStatValue}>{stat.value}</span>
              <span className={styles.quickStatLabel}>{stat.label}</span>
            </div>
          ))}
        </div>

        <Tile title="Daftar Mesin" icon={<Monitor size={20} />}>
          {isLoading ? (
            <table className="data-table">
              <tbody>
                {Array.from({ length: 5 }).map((_, i) => <TableRowSkeleton key={i} columns={6} />)}
              </tbody>
            </table>
          ) : (
            <DataTable data={data?.machineStatus ?? []} columns={columns} pageSize={10} />
          )}
        </Tile>
      </div>
    </div>
  );
}
```

---

## 7. IMPLEMENTATION PRIORITIES

### P0 — Critical (Must Have)
1. **CSS Variables Migration** — Update colors to corporate palette
2. **Text Translation** — All UI labels to Bahasa Indonesia
3. **Routing Setup** — react-router-dom with 5 pages
4. **Layout Components** — Header, Sidebar, Layout
5. **Basic Page Structure** — All 5 pages render

### P1 — Important
6. **Icon Integration** — Replace emojis with lucide-react
7. **StatCard Component** — Windows tile style cards
8. **Tile Component** — Reusable card wrapper
9. **StatusDot Component** — Status indicators
10. **ErrorBoundary** — Graceful error handling

### P2 — Nice to Have
11. **TanStack Table** — Sortable/paginated tables
12. **Recharts Integration** — Bar/Pie charts
13. **Loading Skeletons** — Better loading states
14. **Responsive Refinements** — Mobile optimizations
15. **Animation Polish** — Transitions, hover effects

---

## 8. EXECUTION CHECKLIST

### Phase 1: Foundation
- [ ] Update `package.json` with `react-router-dom`, `lucide-react`
- [ ] Run `npm install`
- [ ] Create CSS variables in `styles.css`
- [ ] Create `src/types/index.ts` with all interfaces
- [ ] Create `src/router.tsx`

### Phase 2: Layout Components
- [ ] Create `src/components/layout/Layout/Layout.tsx`
- [ ] Create `src/components/layout/Header/Header.tsx`
- [ ] Create `src/components/layout/Sidebar/Sidebar.tsx`
- [ ] Update `src/App.tsx` to use router

### Phase 3: Common Components
- [ ] Create `src/components/common/Button/Button.tsx`
- [ ] Create `src/components/common/Badge/Badge.tsx`
- [ ] Create `src/components/common/Tile/Tile.tsx`
- [ ] Create `src/components/common/StatCard/StatCard.tsx`
- [ ] Create `src/components/common/StatusDot/StatusDot.tsx`
- [ ] Create `src/components/common/Skeleton/Skeleton.tsx`
- [ ] Create `src/components/common/ErrorBoundary/ErrorBoundary.tsx`

### Phase 4: Feature Pages
- [ ] Create `src/components/features/dashboard/DashboardPage.tsx`
- [ ] Create `src/components/features/machines/MachinesPage.tsx`
- [ ] Create `src/components/features/machines/SchedulerStatus.tsx`
- [ ] Create `src/components/features/attendance/AttendancePage.tsx`
- [ ] Create `src/components/features/quality/QualityPage.tsx`
- [ ] Create `src/components/features/settings/SettingsPage.tsx`

### Phase 5: Data Visualization (P1)
- [ ] Create `src/components/common/DataTable/DataTable.tsx`
- [ ] Create `src/components/features/attendance/AttendanceChart.tsx`
- [ ] Create machine status pie chart

### Phase 6: Polish
- [ ] Update all text to Bahasa Indonesia
- [ ] Replace all emojis with lucide-react icons
- [ ] Add loading skeletons
- [ ] Test responsive behavior
- [ ] Add hover animations

---

## 9. DEPRECATION LIST

The following files should be deleted after migration:

| File | Reason |
|------|--------|
| `src/App.tsx` | Rewritten with router |
| `src/components/Dashboard.tsx` | Split into DashboardPage |
| `src/components/MachineStatus.tsx` | Split into MachinesPage |
| `src/components/AttendanceTable.tsx` | Split into AttendancePage |
| `src/components/QualityReport.tsx` | Split into QualityPage |
| `src/components/SchedulerStatus.tsx` | Moved to features/machines/ |

---

## 10. BACKWARDS COMPATIBILITY NOTES

- API endpoints remain unchanged (`/api/dashboard/stats`, etc.)
- API response shapes unchanged
- React Query usage maintained
- No backend changes required

---

**PLAN_STATUS:** READY_FOR_EXECUTION
**ESTIMATED_COMPLETION:** 2-3 days
**DEPENDENCIES:** react-router-dom, lucide-react (to be installed)
