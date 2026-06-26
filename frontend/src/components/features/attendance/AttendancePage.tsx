import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Header } from '../../layout/Header/Header';
import { Tile } from '../../common/Tile/Tile';
import { Badge } from '../../common/Badge/Badge';
import { KpiCard } from '../dashboard/components/KpiCard';
import { FilterBar, type AttendanceStatus, type Division } from '../../common/FilterBar';
import { api } from '../../../lib/api';
import { ClipboardList, Users, UserX, AlertCircle, User, Monitor, Eye, EyeOff, HelpCircle, LogIn, LogOut, Activity, X, Fingerprint } from 'lucide-react';

interface AttendanceRow {
  employee_id?: number;
  employee_code: string;
  employee_name: string;
  division_code: string;
  gang_code: string;
  attendance_date: string;
  attendance_status: string;
  check_in_at: string | null;
  check_out_at: string | null;
  source: string;
  is_leave: boolean;
  is_sick: boolean;
  is_holiday: boolean;
  overtime_hours: number;
  machine_code?: string;
  // NEW: Employee code mapping fields
  current_emp_code?: string;           // Latest HR employee code
  parsed_code?: string;                // Original parsed code from machine
  raw_device_user_id?: string;         // Original raw ID from machine
  resolved_nik_masked?: string;        // NIK with masking: 1906********0002
  resolved_nik_full?: string;          // Full NIK for reveal
  mapping_status?: string;             // Current resolution status
  mapping_reason?: string;             // Resolution reason
}

interface RawScanRow {
  scan_log_id: number;
  scan_date: string;
  scan_time: string;
  raw_device_user_id: string;
  machine_code: string;
  parsed_employee_code: string;
  source: string;
  mapping_status: string;
  scan_direction: string | null;
}

function getStatusInfo(status: string, isLeave: boolean, isSick: boolean, isHoliday: boolean) {
  if (isHoliday) return { label: 'LIBUR', variant: 'neutral' as const, color: '#9ca3af' };
  if (isSick) return { label: 'SAKIT', variant: 'warning' as const, color: '#eab308' };
  if (isLeave) return { label: 'CUTI', variant: 'info' as const, color: '#3b82f6' };
  switch (status) {
    case 'PRESENT': return { label: 'HADIR', variant: 'success' as const, color: '#16a34a' };
    case 'ABSENT': return { label: 'ALPHA', variant: 'error' as const, color: '#dc2626' };
    case 'NO_DATA': return { label: 'TANPA DATA', variant: 'neutral' as const, color: '#9ca3af' };
    default: return { label: status || '—', variant: 'neutral' as const, color: '#9ca3af' };
  }
}

function formatTime(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleTimeString('id-ID', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
  } catch { return '—'; }
}

function formatDate(iso: string | null) {
  if (!iso) return '—';
  try {
    return new Date(iso).toLocaleDateString('id-ID', { day: '2-digit', month: 'short', year: 'numeric' });
  } catch { return '—'; }
}

// === Mapping Status Color Coding ===
const MAPPING_STATUS_COLORS: Record<string, { bg: string; text: string; label: string }> = {
  'MAPPED_CURRENT': { bg: 'bg-green-100', text: 'text-green-800', label: 'Mapped' },
  'MAPPED': { bg: 'bg-green-100', text: 'text-green-800', label: 'Mapped' },
  'NIK_DUPLICATE_AMBIGUOUS': { bg: 'bg-yellow-100', text: 'text-yellow-800', label: 'Ambigious' },
  'NIK_NOT_FOUND': { bg: 'bg-red-100', text: 'text-red-800', label: 'NIK Not Found' },
  'PARSED_CODE_NOT_FOUND_IN_HR': { bg: 'bg-red-100', text: 'text-red-800', label: 'Not Found in HR' },
  'NEED_REVIEW_CURRENT': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Need Review' },
  'NEED_REVIEW': { bg: 'bg-orange-100', text: 'text-orange-800', label: 'Need Review' },
  'UNMAPPED': { bg: 'bg-red-100', text: 'text-red-800', label: 'Unmapped' },
  'MANUAL': { bg: 'bg-purple-100', text: 'text-purple-800', label: 'Manual' },
  'EXACT_LONG_RAW_ID': { bg: 'bg-blue-100', text: 'text-blue-800', label: 'Exact ID' },
};

function getMappingStatusStyle(status: string | undefined) {
  if (!status) return { bg: 'bg-gray-100', text: 'text-gray-800', label: 'Unknown' };
  const normalized = status.toUpperCase();
  // Check exact match first
  if (MAPPING_STATUS_COLORS[status]) return MAPPING_STATUS_COLORS[status];
  // Check partial match
  for (const [key, value] of Object.entries(MAPPING_STATUS_COLORS)) {
    if (normalized.includes(key.replace(/_/g, ' ').toUpperCase()) || key.includes(normalized)) {
      return value;
    }
  }
  return { bg: 'bg-gray-100', text: 'text-gray-800', label: status };
}

// === NIK Masking ===
function maskNik(nik: string | undefined): string {
  if (!nik || nik.length < 8) return nik || '—';
  const prefix = nik.slice(0, 4);
  const suffix = nik.slice(-4);
  const maskLength = nik.length - 8;
  return `${prefix}${'*'.repeat(maskLength)}${suffix}`;
}

// === Tooltip Component ===
interface TooltipProps {
  content: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}

function Tooltip({ content, children, className = '' }: TooltipProps) {
  const [visible, setVisible] = useState(false);

  return (
    <div className={`relative inline-block ${className}`}>
      <div onMouseEnter={() => setVisible(true)} onMouseLeave={() => setVisible(false)}>
        {children}
      </div>
      {visible && (
        <div className="absolute z-50 bottom-full left-1/2 -translate-x-1/2 mb-2 px-3 py-2 text-xs bg-gray-900 text-white rounded-lg shadow-lg whitespace-nowrap max-w-xs">
          {content}
          <div className="absolute top-full left-1/2 -translate-x-1/2 border-4 border-transparent border-t-gray-900"></div>
        </div>
      )}
    </div>
  );
}

// === NIK Reveal Component ===
interface NikRevealProps {
  masked: string | undefined;
  full: string | undefined;
}

function NikReveal({ masked, full }: NikRevealProps) {
  const [revealed, setRevealed] = useState(false);

  if (!full || !masked) return <span className="text-gray-400">—</span>;

  return (
    <Tooltip content={
      <div className="text-center">
        <div className="font-mono text-xs">{full}</div>
        <div className="text-gray-400 mt-1">Click to {revealed ? 'hide' : 'show'}</div>
      </div>
    }>
      <span
        className="font-mono text-xs cursor-pointer hover:text-blue-600 flex items-center gap-1"
        onClick={() => setRevealed(!revealed)}
      >
        {revealed ? full : masked}
        {revealed ? <EyeOff size={12} /> : <Eye size={12} />}
      </span>
    </Tooltip>
  );
}

// === Employee Code Display Component ===
interface EmployeeCodeDisplayProps {
  currentEmpCode: string | undefined;
  parsedCode: string | undefined;
  rawDeviceUserId: string | undefined;
  nikMasked: string | undefined;
  nikFull: string | undefined;
  mappingStatus: string | undefined;
  mappingReason: string | undefined;
}

function EmployeeCodeDisplay({
  currentEmpCode,
  parsedCode,
  rawDeviceUserId,
  nikMasked,
  nikFull,
  mappingStatus,
  mappingReason
}: EmployeeCodeDisplayProps) {
  const statusStyle = getMappingStatusStyle(mappingStatus);
  const showParsedCode = parsedCode && parsedCode !== currentEmpCode;
  const showRawId = rawDeviceUserId && rawDeviceUserId !== parsedCode && rawDeviceUserId !== currentEmpCode;

  return (
    <div className="flex flex-col gap-0.5">
      {/* Primary: Current Employee Code */}
      <div className="flex items-center gap-2">
        <span className="font-mono font-bold text-sm text-gray-900">
          {currentEmpCode || '—'}
        </span>
        {mappingStatus && (
          <span className={`text-[10px] px-1.5 py-0.5 rounded ${statusStyle.bg} ${statusStyle.text}`}>
            {statusStyle.label}
          </span>
        )}
      </div>

      {/* Secondary: Parsed Code (if different) */}
      {showParsedCode && (
        <span className="font-mono text-xs text-gray-500">
          {parsedCode}
        </span>
      )}

      {/* Tertiary: Raw ID (if different) */}
      {showRawId && (
        <span className="font-mono text-[10px] text-gray-400">
          ID: {rawDeviceUserId}
        </span>
      )}

      {/* NIK Masked */}
      {(nikMasked || nikFull) && (
        <div className="flex items-center gap-1 mt-0.5">
          <span className="text-[10px] text-gray-400">NIK:</span>
          <NikReveal masked={nikMasked} full={nikFull} />
        </div>
      )}

      {/* Mapping Reason Tooltip */}
      {mappingReason && (
        <Tooltip content={
          <div className="text-center">
            <div className="font-semibold mb-1">Resolution Reason</div>
            <div className="text-gray-300">{mappingReason}</div>
          </div>
        }>
          <HelpCircle size={10} className="text-gray-400 cursor-help" />
        </Tooltip>
      )}
    </div>
  );
}

interface EmployeeDetailModalProps {
  employeeCode: string;
  employeeName: string;
  division: string;
  onClose: () => void;
}

function EmployeeDetailModal({ employeeCode, employeeName, division, onClose }: EmployeeDetailModalProps) {
  const [activeTab, setActiveTab] = useState<'summary' | 'scans'>('summary');

  const { data: history, isLoading: historyLoading } = useQuery<AttendanceRow[]>({
    queryKey: ['attendance-employee', employeeCode],
    queryFn: () => api<AttendanceRow[]>(`/api/attendance/employee/${employeeCode}`),
    staleTime: 60000,
  });

  const { data: rawScans, isLoading: scansLoading } = useQuery<RawScanRow[]>({
    queryKey: ['attendance-employee-raw', employeeCode],
    queryFn: () => api<RawScanRow[]>(`/api/attendance/employee/${employeeCode}/raw`),
    staleTime: 30000,
  });

  const presentDays = history?.filter(r => r.attendance_status === 'PRESENT').length ?? 0;
  const absentDays = history?.filter(r => r.attendance_status === 'ABSENT').length ?? 0;
  const noDataDays = history?.filter(r => r.attendance_status === 'NO_DATA').length ?? 0;

  // Group raw scans by date
  const scansByDate = rawScans?.reduce((acc, scan) => {
    const dateKey = typeof scan.scan_date === 'string' ? scan.scan_date.slice(0, 10) : String(scan.scan_date);
    if (!acc[dateKey]) acc[dateKey] = [];
    acc[dateKey].push(scan);
    return acc;
  }, {} as Record<string, RawScanRow[]>) ?? {};

  const formatFullDateTime = (date: string, time: string) => {
    try {
      const dt = new Date(`${date}T${time}`);
      return dt.toLocaleString('id-ID', {
        day: '2-digit', month: 'short', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch { return `${date} ${time}`; }
  };

  const getDirectionIcon = (direction: string | null) => {
    if (direction === 'IN' || direction?.toUpperCase().includes('MASUK')) {
      return <LogIn size={12} style={{ color: '#16a34a' }} />;
    }
    if (direction === 'OUT' || direction?.toUpperCase().includes('KELUAR')) {
      return <LogOut size={12} style={{ color: '#dc2626' }} />;
    }
    return <Activity size={12} style={{ color: '#9ca3af' }} />;
  };

  return (
    <div style={{
      position: 'fixed', top: 0, left: 0, right: 0, bottom: 0,
      background: 'rgba(0,0,0,0.5)', zIndex: 1000,
      display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20
    }} onClick={onClose}>
      <div style={{
        background: 'var(--bg-card)', borderRadius: 12, width: '100%', maxWidth: 1000,
        maxHeight: '90vh', overflow: 'hidden', display: 'flex', flexDirection: 'column',
        boxShadow: '0 25px 50px -12px rgba(0,0,0,0.25)'
      }} onClick={e => e.stopPropagation()}>
        {/* Header */}
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h2 style={{ margin: 0, fontSize: 18, fontWeight: 700 }}>{employeeName}</h2>
            <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--text-secondary)' }}>
              {employeeCode} · {division}
            </p>
          </div>
          <button onClick={onClose} style={{
            background: 'none', border: 'none', cursor: 'pointer', padding: 8,
            borderRadius: 6, color: 'var(--text-secondary)'
          }}>
            <X size={20} />
          </button>
        </div>

        {/* Stats */}
        <div style={{ padding: '12px 20px', borderBottom: '1px solid var(--border-color)', display: 'flex', gap: 16, flexWrap: 'wrap' }}>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#16a34a' }}>{presentDays}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Hadir</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#dc2626' }}>{absentDays}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Alpha</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#9ca3af' }}>{noDataDays}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Tanpa Data</div>
          </div>
          <div style={{ textAlign: 'center', flex: 1, minWidth: 80 }}>
            <div style={{ fontSize: 24, fontWeight: 800, color: 'var(--primary)' }}>{rawScans?.length ?? 0}</div>
            <div style={{ fontSize: 11, color: 'var(--text-secondary)' }}>Total Scan</div>
          </div>
        </div>

        {/* Tabs */}
        <div style={{ display: 'flex', borderBottom: '1px solid var(--border-color)', padding: '0 20px' }}>
          <button
            onClick={() => setActiveTab('summary')}
            style={{
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, color: activeTab === 'summary' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'summary' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1
            }}
          >
            <ClipboardList size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Ringkasan Harian
          </button>
          <button
            onClick={() => setActiveTab('scans')}
            style={{
              padding: '12px 16px', border: 'none', background: 'none', cursor: 'pointer',
              fontWeight: 600, fontSize: 13, color: activeTab === 'scans' ? 'var(--primary)' : 'var(--text-secondary)',
              borderBottom: activeTab === 'scans' ? '2px solid var(--primary)' : '2px solid transparent',
              marginBottom: -1
            }}
          >
            <Fingerprint size={14} style={{ marginRight: 6, verticalAlign: 'middle' }} />
            Scan Logs ({rawScans?.length ?? 0})
          </button>
        </div>

        {/* Content */}
        <div style={{ flex: 1, overflow: 'auto', padding: '12px 20px' }}>
          {activeTab === 'summary' ? (
            /* Summary Tab */
            historyLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
                <thead>
                  <tr style={{ background: 'var(--bg-card)', borderBottom: '2px solid var(--border-color)' }}>
                    <th style={{ textAlign: 'left', padding: '8px 4px', fontWeight: 600 }}>Tanggal</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600 }}>Status</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600 }}>Check In</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600 }}>Check Out</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600 }}>Mesin</th>
                    <th style={{ textAlign: 'center', padding: '8px 4px', fontWeight: 600 }}>Source</th>
                  </tr>
                </thead>
                <tbody>
                  {history?.slice(0, 60).map((r, idx) => {
                    const statusInfo = getStatusInfo(r.attendance_status, r.is_leave, r.is_sick, r.is_holiday);
                    return (
                      <tr key={idx} style={{ borderBottom: '1px solid var(--border-color)' }}>
                        <td style={{ padding: '8px 4px', fontWeight: 500 }}>{formatDate(r.attendance_date)}</td>
                        <td style={{ padding: '8px 4px', textAlign: 'center' }}>
                          <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontFamily: 'monospace' }}>
                          {formatTime(r.check_in_at)}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontFamily: 'monospace' }}>
                          {formatTime(r.check_out_at)}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11, color: 'var(--text-secondary)' }}>
                          {r.machine_code || '—'}
                        </td>
                        <td style={{ padding: '8px 4px', textAlign: 'center', fontSize: 11 }}>
                          {r.source === 'DIRECT_ZKTECO' ? <Badge variant="success" style={{ fontSize: 10 }}>ZKTeco</Badge>
                            : r.source === 'IT_SOLUTION_API' ? <Badge variant="info" style={{ fontSize: 10 }}>API</Badge>
                            : r.source === 'MANUAL_CORRECTION' ? <Badge variant="warning" style={{ fontSize: 10 }}>Manual</Badge>
                            : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )
          ) : (
            /* Scan Logs Tab */
            scansLoading ? (
              <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat scan logs...</div>
            ) : rawScans && rawScans.length > 0 ? (
              <div style={{ fontSize: 11 }}>
                {Object.entries(scansByDate).slice(0, 30).map(([dateKey, scans]) => (
                  <div key={dateKey} style={{ marginBottom: 16 }}>
                    <div style={{
                      padding: '8px 12px', background: 'var(--bg-secondary)', borderRadius: 6,
                      fontWeight: 600, marginBottom: 8, display: 'flex', justifyContent: 'space-between'
                    }}>
                      <span>{formatDate(dateKey)}</span>
                      <span style={{ color: 'var(--text-secondary)', fontWeight: 400 }}>{scans.length} tap</span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                      {scans.map((scan, idx) => (
                        <div key={scan.scan_log_id || idx} style={{
                          display: 'flex', alignItems: 'center', gap: 12, padding: '8px 12px',
                          background: 'var(--bg-card)', borderRadius: 6, border: '1px solid var(--border-color)'
                        }}>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 6, minWidth: 80 }}>
                            {getDirectionIcon(scan.scan_direction)}
                            <span style={{
                              fontFamily: 'monospace', fontSize: 10, fontWeight: 600,
                              color: scan.scan_direction === 'IN' ? '#16a34a' : scan.scan_direction === 'OUT' ? '#dc2626' : '#9ca3af'
                            }}>
                              {scan.scan_direction || 'TAP'}
                            </span>
                          </div>
                          <div style={{ fontFamily: 'monospace', minWidth: 140 }}>
                            {formatFullDateTime(String(scan.scan_date), String(scan.scan_time))}
                          </div>
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <Badge variant="neutral" style={{ fontSize: 10 }}>
                              <Monitor size={10} style={{ marginRight: 4 }} />
                              {scan.machine_code || 'Unknown'}
                            </Badge>
                            <span style={{ fontSize: 10, color: 'var(--text-secondary)', fontFamily: 'monospace' }}>
                              ID: {scan.raw_device_user_id}
                            </span>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
                {Object.keys(scansByDate).length > 30 && (
                  <div style={{ textAlign: 'center', padding: 16, color: 'var(--text-secondary)' }}>
                    Menampilkan 30 dari {Object.keys(scansByDate).length} hari
                  </div>
                )}
              </div>
            ) : (
              <div style={{ padding: 60, textAlign: 'center' }}>
                <Fingerprint size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
                <p style={{ fontWeight: 500, marginBottom: 8 }}>Tidak ada scan logs</p>
                <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Data tap dari mesin belum tersedia</p>
              </div>
            )
          )}
        </div>
      </div>
    </div>
  );
}

export function AttendancePage() {
  const [date, setDate] = useState(() => {
    const d = new Date();
    d.setDate(d.getDate() - 1);
    return d.toISOString().split('T')[0];
  });
  const [division, setDivision] = useState('');
  const [statusFilter, setStatusFilter] = useState<AttendanceStatus[]>([]);
  const [search, setSearch] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState<{ code: string; name: string; div: string } | null>(null);
  const [page, setPage] = useState(0);
  const pageSize = 50;

  // Fetch divisions from API
  const { data: divisions } = useQuery<Division[]>({
    queryKey: ['divisions'],
    queryFn: () => api<Division[]>('/api/divisions'),
    staleTime: 60000,
  });

  const { data, isLoading, refetch, isFetching, error } = useQuery<AttendanceRow[]>({
    queryKey: ['attendance-daily', date, division],
    queryFn: async () => {
      const params = new URLSearchParams({ date });
      if (division) params.set('divisionCode', division);
      const result = await api<AttendanceRow[]>(`/api/attendance/daily?${params}`);
      return result || [];
    },
    refetchInterval: 30000,
  });

  const filtered = data ? data.filter((r) => {
    // Search filter - include all employee code variants and NIK
    const searchLower = search.toLowerCase();
    const searchMatch = !search || !search.trim() ||
      r.employee_code?.toLowerCase().includes(searchLower) ||
      r.employee_name?.toLowerCase().includes(searchLower) ||
      r.division_code?.toLowerCase().includes(searchLower) ||
      r.current_emp_code?.toLowerCase().includes(searchLower) ||
      r.parsed_code?.toLowerCase().includes(searchLower) ||
      r.raw_device_user_id?.toLowerCase().includes(searchLower) ||
      r.resolved_nik_full?.toLowerCase().includes(searchLower) ||
      r.resolved_nik_masked?.toLowerCase().includes(searchLower) ||
      r.mapping_status?.toLowerCase().includes(searchLower);

    // Status filter
    let statusMatch = true;
    if (statusFilter.length > 0) {
      const isPresent = r.attendance_status === 'PRESENT';
      const isAbsent = r.attendance_status === 'ABSENT';
      const isNoData = r.attendance_status === 'NO_DATA' || !r.check_in_at;
      const isLeave = r.is_leave;
      const isSick = r.is_sick;
      const isHoliday = r.is_holiday;

      statusMatch = statusFilter.some(status => {
        switch (status) {
          case 'PRESENT': return isPresent;
          case 'ABSENT': return isAbsent;
          case 'NO_DATA': return isNoData;
          case 'LEAVE': return isLeave;
          case 'SICK': return isSick;
          case 'HOLIDAY': return isHoliday;
          default: return false;
        }
      });
    }

    return searchMatch && statusMatch;
  }) : [];

  const paginated = filtered.slice(page * pageSize, (page + 1) * pageSize);
  const totalPages = Math.ceil(filtered.length / pageSize);

  // Stats
  const presentCount = data?.filter(r => r.attendance_status === 'PRESENT').length ?? 0;
  const absentCount = data?.filter(r => r.attendance_status === 'ABSENT').length ?? 0;
  const noDataCount = data?.filter(r => r.attendance_status === 'NO_DATA' || !r.check_in_at).length ?? 0;
  const leaveCount = data?.filter(r => r.is_leave || r.is_sick).length ?? 0;

  return (
    <>
      <Header
        title="Absensi Harian"
        subtitle={`${date} · ${filtered.length} data`}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
      />

      <div className="app-content">
        {/* KPI Stats */}
        <div className="kpi-grid">
          <KpiCard icon={<ClipboardList size={20} />} value={data?.length ?? 0} label="Total" variant="primary" />
          <KpiCard icon={<Users size={20} />} value={presentCount} label="Hadir" variant="success" />
          <KpiCard icon={<UserX size={20} />} value={absentCount} label="Alpha" variant="error" />
          <KpiCard icon={<AlertCircle size={20} />} value={noDataCount} label="Tanpa Data" variant="warning" />
          <KpiCard icon={<Users size={20} />} value={leaveCount} label="Cuti/Sakit" variant="info" />
        </div>

        <Tile title="Daftar Absensi" icon={<ClipboardList size={16} />} subtitle={`${filtered.length} data · ${presentCount} hadir`}>
          {/* Filter Bar */}
          <FilterBar
            date={date}
            onDateChange={(d) => { setDate(d); setPage(0); }}
            divisions={divisions || []}
            selectedDivision={division}
            onDivisionChange={(d) => { setDivision(d); setPage(0); }}
            statuses={statusFilter}
            onStatusChange={setStatusFilter}
            search={search}
            onSearchChange={(s) => { setSearch(s); setPage(0); }}
            onRefresh={refetch}
            isLoading={isFetching}
          />

          {/* Table */}
          {isLoading ? (
            <div style={{ padding: 40, textAlign: 'center', color: 'var(--text-secondary)' }}>Memuat...</div>
          ) : error ? (
            <div style={{ padding: 40, textAlign: 'center', color: '#dc2626' }}>
              Error: {error instanceof Error ? error.message : 'Unknown error'}
            </div>
          ) : paginated.length > 0 ? (
            <>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                  <thead>
                    <tr style={{ background: 'var(--bg-card)', borderBottom: '2px solid var(--border-color)' }}>
                      <th style={{ textAlign: 'left', padding: '10px 8px', fontWeight: 600, cursor: 'pointer' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                          <User size={14} />
                          Karyawan
                        </div>
                      </th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Divisi</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Check In</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Check Out</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Mesin</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Jam Lembur</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Status</th>
                      <th style={{ textAlign: 'center', padding: '10px 6px', fontWeight: 600 }}>Source</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginated.map((r, idx) => {
                      const statusInfo = getStatusInfo(r.attendance_status, r.is_leave, r.is_sick, r.is_holiday);
                      return (
                        <tr key={`${r.employee_code}-${idx}`}
                          style={{ borderBottom: '1px solid var(--border-color)', transition: 'background 0.15s', cursor: 'pointer' }}
                          onMouseEnter={e => (e.currentTarget as HTMLElement).style.background = 'var(--bg-hover)'}
                          onMouseLeave={e => (e.currentTarget as HTMLElement).style.background = ''}
                          onClick={() => setSelectedEmployee({ code: r.employee_code, name: r.employee_name, div: r.division_code })}
                        >
                          <td style={{ padding: '10px 8px' }}>
                            <EmployeeCodeDisplay
                              currentEmpCode={r.current_emp_code || r.employee_code}
                              parsedCode={r.parsed_code}
                              rawDeviceUserId={r.raw_device_user_id}
                              nikMasked={r.resolved_nik_masked || maskNik(r.resolved_nik_full)}
                              nikFull={r.resolved_nik_full}
                              mappingStatus={r.mapping_status}
                              mappingReason={r.mapping_reason}
                            />
                            <div style={{ fontSize: 11, color: 'var(--text-secondary)', maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {r.employee_name || '—'}
                            </div>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                            <Badge variant="neutral" style={{ fontSize: 11 }}>{r.division_code || '—'}</Badge>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                            {formatTime(r.check_in_at)}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'monospace', fontSize: 12 }}>
                            {formatTime(r.check_out_at)}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: 11, fontFamily: 'monospace', color: 'var(--text-secondary)' }}>
                            {r.machine_code || '—'}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontFamily: 'monospace' }}>
                            {r.overtime_hours > 0 ? `${r.overtime_hours}j` : '—'}
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center' }}>
                            <Badge variant={statusInfo.variant}>{statusInfo.label}</Badge>
                          </td>
                          <td style={{ padding: '10px 6px', textAlign: 'center', fontSize: 11 }}>
                            {r.source === 'DIRECT_ZKTECO' ? <Badge variant="success" style={{ fontSize: 10 }}>ZKTeco</Badge>
                              : r.source === 'IT_SOLUTION_API' ? <Badge variant="info" style={{ fontSize: 10 }}>API</Badge>
                              : r.source === 'MANUAL_CORRECTION' ? <Badge variant="warning" style={{ fontSize: 10 }}>Manual</Badge>
                              : <span style={{ color: 'var(--text-secondary)' }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--border-color)' }}>
                <span style={{ fontSize: 12, color: 'var(--text-secondary)' }}>
                  Menampilkan {page * pageSize + 1} - {Math.min((page + 1) * pageSize, filtered.length)} dari {filtered.length}
                </span>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button onClick={() => setPage(0)} disabled={page === 0} className="btn btn-sm">«</button>
                  <button onClick={() => setPage(p => Math.max(0, p - 1))} disabled={page === 0} className="btn btn-sm">‹</button>
                  <span style={{ padding: '4px 12px', fontSize: 12 }}>{page + 1} / {totalPages || 1}</span>
                  <button onClick={() => setPage(p => Math.min(totalPages - 1, p + 1))} disabled={page >= totalPages - 1} className="btn btn-sm">›</button>
                  <button onClick={() => setPage(totalPages - 1)} disabled={page >= totalPages - 1} className="btn btn-sm">»</button>
                </div>
              </div>
            </>
          ) : (
            <div style={{ padding: 60, textAlign: 'center' }}>
              <ClipboardList size={48} style={{ color: 'var(--text-secondary)', marginBottom: 16 }} />
              <p style={{ fontWeight: 500, marginBottom: 8 }}>Tidak ada data absensi</p>
              <p style={{ fontSize: 12, color: 'var(--text-secondary)' }}>Pastikan sinkronisasi sudah berjalan untuk tanggal tersebut</p>
            </div>
          )}
        </Tile>
      </div>

      {/* Employee Detail Modal */}
      {selectedEmployee && (
        <EmployeeDetailModal
          employeeCode={selectedEmployee.code}
          employeeName={selectedEmployee.name}
          division={selectedEmployee.div}
          onClose={() => setSelectedEmployee(null)}
        />
      )}
    </>
  );
}
