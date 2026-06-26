import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  Users,
  UserCheck,
  UserX,
  AlertTriangle,
  Monitor,
  MonitorOff,
  Activity,
  HardDrive,
} from 'lucide-react';
import { employeeComprehensiveApi } from '../../../services/employee-comprehensive.service';
import { EmployeeComprehensiveToolbar } from './EmployeeComprehensiveToolbar';
import { EmployeeComprehensiveTable } from './EmployeeComprehensiveTable';
import { EmployeeIdentityDrawer } from './EmployeeIdentityDrawer';
import type {
  EmployeeComprehensiveFilters,
  EmployeeKPIs,
  EmployeeComprehensiveRow,
} from '../../../types';

interface KpiCardProps {
  icon: React.ReactNode;
  value: number | string;
  label: string;
  variant?: 'success' | 'warning' | 'error' | 'info' | 'neutral';
}

function KpiCard({ icon, value, label, variant = 'neutral' }: KpiCardProps) {
  const colors: Record<string, string> = {
    success: 'var(--success)',
    warning: 'var(--warning)',
    error: 'var(--error)',
    info: 'var(--info)',
    neutral: 'var(--text-primary)',
  };

  const bgColors: Record<string, string> = {
    success: 'rgba(54, 209, 124, 0.12)',
    warning: 'rgba(255, 176, 32, 0.13)',
    error: 'rgba(255, 77, 77, 0.13)',
    info: 'rgba(58, 160, 255, 0.13)',
    neutral: 'rgba(255, 255, 255, 0.05)',
  };

  return (
    <div className="kpi-card">
      <div className="kpi-icon" style={{ backgroundColor: bgColors[variant], color: colors[variant] }}>
        {icon}
      </div>
      <div className="kpi-value" style={{ color: colors[variant] }}>{value}</div>
      <div className="kpi-label">{label}</div>
    </div>
  );
}

export function EmployeeComprehensivePage() {
  const [mode, setMode] = useState<'datamesin' | 'database'>('datamesin');
  const [filters, setFilters] = useState<Omit<EmployeeComprehensiveFilters, 'mode'>>({
    page: 1,
    pageSize: 50,
  });
  const [selectedEmployee, setSelectedEmployee] = useState<EmployeeComprehensiveRow | null>(null);
  const [drawerOpen, setDrawerOpen] = useState(false);

  // Sync mode to filters
  const handleModeChange = (newMode: 'datamesin' | 'database') => {
    setMode(newMode);
    setFilters((prev) => ({ ...prev, mode: newMode }));
  };

  // Sync filters to state
  const handleFiltersChange = (newFilters: Partial<EmployeeComprehensiveFilters>) => {
    setFilters((prev) => ({ ...prev, ...newFilters }));
  };

  // Fetch KPIs
  const { data: kpisData, isError: kpisError, refetch: refetchKpis } = useQuery({
    queryKey: ['employee-comprehensive', 'kpis', filters],
    queryFn: () => employeeComprehensiveApi.getKPIs(filters),
    staleTime: 60000,
  });

  const kpis = kpisData;

  // Fetch employee list
  const { data: employeesData, isLoading, isError: employeesError, error: empError, refetch: refetchEmployees } = useQuery({
    queryKey: ['employee-comprehensive', 'employees', filters],
    queryFn: () => employeeComprehensiveApi.getEmployees({ ...filters, mode }),
    staleTime: 30000,
  });

  const employees = employeesData?.rows ?? [];
  const pagination = employeesData?.pagination;
  const totalPages = pagination?.totalPages ?? 1;

  // Handle row click for detail view
  const handleRowClick = (row: EmployeeComprehensiveRow) => {
    setSelectedEmployee(row);
    setDrawerOpen(true);
  };

  return (
    <div className="employee-comprehensive-page">
      {/* Page Header */}
      <div className="page-header">
        <h1>Data Karyawan Komprehensif</h1>
        <p className="text-secondary">
          Telusuri hubungan antara Absensi ID, Parsed ID, Employee Code, Mesin, dan Divisi.
        </p>
      </div>

      {(employeesError || kpisError) && (
        <div className="error-banner">
          <p>Gagal memuat data karyawan. {empError instanceof Error ? empError.message : 'Unknown error'}</p>
          <button className="btn-organic btn-organic-secondary" onClick={() => { refetchEmployees(); refetchKpis(); }}>Coba lagi</button>
        </div>
      )}

      {/* KPI Cards */}
      <div className="kpi-grid">
        <KpiCard
          icon={<Users size={18} />}
          value={kpis?.total ?? '-'}
          label="Total Data"
          variant="neutral"
        />
        <KpiCard
          icon={<UserCheck size={18} />}
          value={kpis?.mapped ?? '-'}
          label="Mapped"
          variant="success"
        />
        <KpiCard
          icon={<UserX size={18} />}
          value={kpis?.unmapped ?? '-'}
          label="Unmapped"
          variant="error"
        />
        <KpiCard
          icon={<AlertTriangle size={18} />}
          value={kpis?.needReview ?? '-'}
          label="Need Review"
          variant="warning"
        />
        <KpiCard
          icon={<Monitor size={18} />}
          value={kpis?.nameFound ?? '-'}
          label="Nama Mesin Ada"
          variant="info"
        />
        <KpiCard
          icon={<MonitorOff size={18} />}
          value={kpis?.nameMissing ?? '-'}
          label="Nama Tidak Ada"
          variant="neutral"
        />
        <KpiCard
          icon={<Activity size={18} />}
          value={kpis?.scanCount ?? '-'}
          label="Scan 30 Hari"
          variant="neutral"
        />
        <KpiCard
          icon={<HardDrive size={18} />}
          value={kpis?.activeMachines ?? '-'}
          label="Mesin Aktif"
          variant="neutral"
        />
      </div>

      {/* Toolbar */}
      <EmployeeComprehensiveToolbar
        mode={mode}
        onModeChange={handleModeChange}
        filters={{
          machineCode: filters.machineCode,
          divisionCode: filters.divisionCode,
          search: filters.search,
          mappingStatus: filters.mappingStatus,
        }}
        onFiltersChange={handleFiltersChange}
      />

      {/* Table */}
      <EmployeeComprehensiveTable
        data={employees}
        isLoading={isLoading}
        onRowClick={handleRowClick}
        mode={mode}
      />

      {/* Pagination Info */}
      {pagination && (
        <div className="pagination-info">
          Menampilkan {employees.length} dari {pagination.total} data
          <span className="page-info"> Halaman {pagination.page} / {totalPages || 1}</span>
        </div>
      )}

      {/* Employee Identity Drawer */}
      <EmployeeIdentityDrawer
        open={drawerOpen}
        onOpenChange={setDrawerOpen}
        employee={selectedEmployee}
      />

      <style>{`
        .employee-comprehensive-page {
          padding: var(--space-6);
        }

        .page-header {
          margin-bottom: var(--space-6);
        }

        .page-header h1 {
          font-size: 24px;
          font-weight: 700;
          color: var(--text-primary);
          margin: 0 0 8px;
        }

        .text-secondary {
          color: var(--text-secondary);
          font-size: 14px;
          margin: 0;
        }

        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
          gap: 12px;
          margin-bottom: var(--space-6);
        }

        .kpi-card {
          background: var(--surface-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          padding: 16px;
          text-align: center;
          transition: all var(--duration-fast);
        }

        .kpi-card:hover {
          box-shadow: var(--shadow-md);
          transform: translateY(-2px);
        }

        .kpi-icon {
          width: 40px;
          height: 40px;
          border-radius: var(--radius-md);
          display: flex;
          align-items: center;
          justify-content: center;
          margin: 0 auto 12px;
        }

        .kpi-value {
          font-size: 28px;
          font-weight: 700;
          line-height: 1;
          margin-bottom: 6px;
        }

        .kpi-label {
          font-size: 11px;
          color: var(--text-secondary);
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .pagination-info {
          margin-top: 16px;
          text-align: center;
          font-size: 13px;
          color: var(--text-secondary);
        }

        .page-info {
          margin-left: 8px;
          padding-left: 8px;
          border-left: 1px solid var(--border-color);
        }

        @media (max-width: 1024px) {
          .kpi-grid {
            grid-template-columns: repeat(4, 1fr);
          }
        }

        @media (max-width: 768px) {
          .kpi-grid {
            grid-template-columns: repeat(2, 1fr);
          }

          .employee-comprehensive-page {
            padding: var(--space-4);
          }
        }

        @media (max-width: 480px) {
          .kpi-grid {
            grid-template-columns: 1fr;
          }
        }
      `}</style>
    </div>
  );
}
