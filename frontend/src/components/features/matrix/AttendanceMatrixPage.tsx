import { useEffect, useMemo, useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Database,
  Grid3X3,
  Info,
  Monitor,
  RefreshCw,
  Search,
  X,
} from 'lucide-react';
import { Header } from '../../layout/Header/Header';
import { Badge } from '../../common/Badge/Badge';
import { LiveClock } from '../../common/LiveClock/LiveClock';
import { api } from '../../../lib/api';
import { getAttendanceCellDetail, getMonthlyMatrix } from '../../../services/attendance-service';
import { attendanceStatusCode } from '../../../services/status-mapping';
import type {
  AttendanceMatrixCell,
  AttendanceMatrixRow,
  AttendanceSource,
  Division,
  IntelligenceAttendanceStatus,
  MappingStatus,
} from '../../../types';

type ViewMode = 'database' | 'datamesin';

const STATUS_LABEL: Record<IntelligenceAttendanceStatus, string> = {
  HADIR: 'Hadir',
  TIDAK_HADIR: 'Tidak Hadir',
  CUTI: 'Cuti',
  SAKIT: 'Sakit',
  HOLIDAY: 'Libur',
  OFF_DAY: 'Off Day',
  NO_DATA: 'No Data',
  MANUAL_CORRECTION: 'Manual',
  INCOMPLETE_SCAN: 'Scan 1x',
  SCAN_ON_OFFDAY: 'Scan Off Day',
  SCAN_ON_HOLIDAY: 'Scan Libur',
  SCAN_ON_OFFDAY_INCOMPLETE: 'Scan Off Day',
  SCAN_ON_HOLIDAY_INCOMPLETE: 'Scan Libur',
  INVALID: 'Invalid',
};

const STATUS_OPTIONS: Array<{ value: '' | IntelligenceAttendanceStatus; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'HADIR', label: 'Hadir' },
  { value: 'TIDAK_HADIR', label: 'Tidak Hadir' },
  { value: 'CUTI', label: 'Cuti' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'HOLIDAY', label: 'Libur' },
  { value: 'OFF_DAY', label: 'Off Day' },
  { value: 'NO_DATA', label: 'No Data' },
  { value: 'MANUAL_CORRECTION', label: 'Manual' },
  { value: 'INCOMPLETE_SCAN', label: 'Scan 1x' },
  { value: 'SCAN_ON_OFFDAY', label: 'Scan Off Day' },
  { value: 'SCAN_ON_HOLIDAY', label: 'Scan Libur' },
  { value: 'SCAN_ON_OFFDAY_INCOMPLETE', label: 'Scan Off Day' },
  { value: 'SCAN_ON_HOLIDAY_INCOMPLETE', label: 'Scan Libur' },
  { value: 'INVALID', label: 'Invalid' },
];

const MAPPING_OPTIONS: Array<{ value: '' | MappingStatus; label: string }> = [
  { value: '', label: 'Semua Mapping' },
  { value: 'MAPPED', label: 'Mapped' },
  { value: 'UNMAPPED', label: 'Unmapped' },
  { value: 'NEED_REVIEW', label: 'Need Review' },
];

const SOURCE_OPTIONS: Array<{ value: '' | AttendanceSource; label: string }> = [
  { value: '', label: 'Semua Source' },
  { value: 'ZKTECO', label: 'ZKTeco' },
  { value: 'API', label: 'API' },
  { value: 'MANUAL', label: 'Manual' },
  { value: 'HYBRID', label: 'Hybrid' },
  { value: 'NO_DATA', label: 'No Data' },
];

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

function monthName(year: number, month: number) {
  return new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long' });
}

function isSunday(date: string) {
  return new Date(date).getDay() === 0;
}

function isPastDate(date: string) {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return new Date(date + 'T00:00:00') < today;
}

function formatWorkDuration(checkInAt?: string | null, checkOutAt?: string | null): string {
  if (!checkInAt || !checkOutAt) return '-';
  const start = new Date(checkInAt).getTime();
  const end = new Date(checkOutAt).getTime();
  if (Number.isNaN(start) || Number.isNaN(end) || end <= start) return '-';
  const totalMinutes = Math.round((end - start) / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  return `${hours}j ${minutes}m`;
}

function formatTimeWib(value?: string | null): string {
  return value ? new Date(value).toLocaleTimeString('id-ID') : '-';
}

export function AttendanceMatrixPage() {
  const today = new Date();
  const [year, setYear] = useState(today.getFullYear());
  const [month, setMonth] = useState(today.getMonth() + 1);
  const [division, setDivision] = useState('');
  const [machineCode, setMachineCode] = useState('');
  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<ViewMode>('database');
  const [statusFilter, setStatusFilter] = useState<'' | IntelligenceAttendanceStatus>('');
  const [mappingFilter, setMappingFilter] = useState<'' | MappingStatus>('');
  const [sourceFilter, setSourceFilter] = useState<'' | AttendanceSource>('');
  const [page, setPage] = useState(1);
  const [selectedCell, setSelectedCell] = useState<{ row: AttendanceMatrixRow; cell: AttendanceMatrixCell } | null>(null);
  const debouncedSearch = useDebouncedValue(search, 300);
  const pageSize = 100;

  const { data: divisions } = useQuery<Division[]>({
    queryKey: ['divisions'],
    queryFn: () => api<Division[]>('/api/divisions'),
    staleTime: 60000,
  });

  // Machine list for filter. Database mode is machine-agnostic (attendance_imports is aggregated),
  // so the dropdown only filters datamesin/raw mode — disabled otherwise.
  const { data: machines } = useQuery<Array<{ machine_code: string; location_name: string }>>({
    queryKey: ['matrix-machines'],
    queryFn: () => api('/api/machines'),
    staleTime: 120000,
  });

  useEffect(() => {
    setPage(1);
  }, [year, month, division, machineCode, debouncedSearch, viewMode, statusFilter, mappingFilter, sourceFilter]);

  const { data, isLoading, isFetching, refetch, error } = useQuery({
    queryKey: ['attendance-monthly-matrix', year, month, division, machineCode, debouncedSearch, viewMode, statusFilter, mappingFilter, sourceFilter, page],
    queryFn: () => getMonthlyMatrix({
      year,
      month,
      divisionCode: division || undefined,
      machineCode: machineCode || undefined,
      search: debouncedSearch,
      mode: viewMode,
      status: statusFilter,
      mapping: mappingFilter,
      source: sourceFilter,
      page,
      pageSize,
    }),
    staleTime: 30000,
  });

  const { data: cellDetail, isFetching: cellLoading } = useQuery({
    queryKey: ['attendance-cell-detail', selectedCell?.row.employeeCode, selectedCell?.cell.rawDeviceUserId, selectedCell?.cell.machineCode, selectedCell?.cell.date],
    queryFn: () => getAttendanceCellDetail({
      employeeCode: selectedCell?.row.employeeCode,
      rawDeviceUserId: selectedCell?.cell.rawDeviceUserId ?? undefined,
      machineCode: selectedCell?.cell.machineCode ?? undefined,
      date: selectedCell!.cell.date,
    }),
    enabled: !!selectedCell,
  });

  const rows = data?.rows ?? [];
  const dateCells = rows[0]?.days ?? Array.from({ length: new Date(year, month, 0).getDate() }, (_, index) => ({
    date: `${year}-${String(month).padStart(2, '0')}-${String(index + 1).padStart(2, '0')}`,
    day: index + 1,
  }));

  const totals = useMemo(() => {
    return rows.reduce((acc, row) => {
      acc.present += row.summary.present;
      acc.absent += row.summary.absent;
      acc.noData += row.summary.noData;
      acc.offDay += row.summary.offDay;
      acc.scanCount += row.summary.scanCount;
      if (row.mappingStatus === 'MAPPED') acc.mapped++;
      else acc.unmapped++;
      return acc;
    }, { present: 0, absent: 0, noData: 0, offDay: 0, scanCount: 0, mapped: 0, unmapped: 0 });
  }, [rows]);

  const isCurrentMonth = year === today.getFullYear() && month === today.getMonth() + 1;

  const handlePrevMonth = () => {
    if (month === 1) {
      setYear((value) => value - 1);
      setMonth(12);
    } else {
      setMonth((value) => value - 1);
    }
  };

  const handleNextMonth = () => {
    if (month === 12) {
      setYear((value) => value + 1);
      setMonth(1);
    } else {
      setMonth((value) => value + 1);
    }
  };

  return (
    <>
      <Header
        title="Matriks Bulanan"
        subtitle={`${monthName(year, month)} ${year} · final status attendance · ${data?.meta.source ?? 'loading'}`}
        onRefresh={() => refetch()}
        isRefreshing={isFetching}
        actions={
          <div className="matrix-header-actions">
            <LiveClock compact />
            <div className="matrix-mode-toggle">
              <button className={viewMode === 'database' ? 'active database' : ''} onClick={() => setViewMode('database')}>
                <Database size={14} /> Database
              </button>
              <button className={viewMode === 'datamesin' ? 'active mesin' : ''} onClick={() => setViewMode('datamesin')}>
                <Monitor size={14} /> Data Mesin
              </button>
            </div>
            <button className="btn btn-sm btn-outline" onClick={handlePrevMonth}><ChevronLeft size={14} /></button>
            <span className="matrix-month-label">{monthName(year, month)}</span>
            <button className="btn btn-sm btn-outline" onClick={handleNextMonth} disabled={isCurrentMonth}><ChevronRight size={14} /></button>
          </div>
        }
      />

      <div className="app-content">
        <section className="matrix-kpi-grid">
          <div className="matrix-kpi"><strong>{data?.pagination.total ?? rows.length}</strong><span>Karyawan</span></div>
          <div className="matrix-kpi success"><strong>{totals.present}</strong><span>Hadir</span></div>
          <div className="matrix-kpi danger"><strong>{totals.absent}</strong><span>Tidak Hadir</span></div>
          <div className="matrix-kpi muted"><strong>{totals.noData}</strong><span>No Data</span></div>
          <div className="matrix-kpi info"><strong>{totals.offDay}</strong><span>Off Day</span></div>
          <div className="matrix-kpi info"><strong>{totals.scanCount}</strong><span>Total Scan</span></div>
          <div className="matrix-kpi warning"><strong>{totals.unmapped}</strong><span>Unmapped</span></div>
        </section>

        <section className="matrix-filter-bar">
          <select value={year} onChange={(event) => setYear(Number(event.target.value))}>
            {Array.from({ length: 5 }, (_, index) => today.getFullYear() - 2 + index).map((optionYear) => (
              <option key={optionYear} value={optionYear}>{optionYear}</option>
            ))}
          </select>
          <select value={month} onChange={(event) => setMonth(Number(event.target.value))}>
            {Array.from({ length: 12 }, (_, index) => index + 1).map((optionMonth) => (
              <option key={optionMonth} value={optionMonth}>{monthName(year, optionMonth)}</option>
            ))}
          </select>
          <select value={division} onChange={(event) => setDivision(event.target.value)}>
            <option value="">Semua Divisi</option>
            {(divisions ?? []).map((item) => (
              <option key={item.division_code} value={item.division_code}>{item.division_name}</option>
            ))}
          </select>
          <select
            value={machineCode}
            onChange={(event) => setMachineCode(event.target.value)}
            disabled={viewMode === 'database'}
            title={viewMode === 'database' ? 'Filter mesin hanya berlaku mode Data Mesin' : 'Filter per mesin'}
          >
            <option value="">Semua Mesin</option>
            {(machines ?? []).map((item) => (
              <option key={item.machine_code} value={item.machine_code}>{item.machine_code}</option>
            ))}
          </select>
          <select value={statusFilter} onChange={(event) => setStatusFilter(event.target.value as '' | IntelligenceAttendanceStatus)}>
            {STATUS_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
          </select>
          <select value={mappingFilter} onChange={(event) => setMappingFilter(event.target.value as '' | MappingStatus)}>
            {MAPPING_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
          </select>
          <select value={sourceFilter} onChange={(event) => setSourceFilter(event.target.value as '' | AttendanceSource)}>
            {SOURCE_OPTIONS.map((item) => <option key={item.value || 'all'} value={item.value}>{item.label}</option>)}
          </select>
          <div className="matrix-search">
            <Search size={16} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Cari kode, nama, raw ID..." />
          </div>
          <button className="btn btn-outline btn-sm" onClick={() => refetch()} disabled={isFetching}>
            <RefreshCw size={14} className={isFetching ? 'animate-spin' : ''} />
          </button>
        </section>

        <section className="matrix-legend" aria-label="Legenda status absensi">
          {(Object.keys(STATUS_LABEL) as IntelligenceAttendanceStatus[]).map((status) => (
            <span key={status} className={`matrix-legend-item status-${status.toLowerCase()}`}>
              <b>{attendanceStatusCode(status)}</b> {STATUS_LABEL[status]}
            </span>
          ))}
        </section>

        {isLoading ? (
          <div className="matrix-state">Memuat matriks...</div>
        ) : error ? (
          <div className="matrix-state error">Error: {error instanceof Error ? error.message : 'Unknown error'}</div>
        ) : rows.length > 0 ? (
          <div className="matrix-shell">
            <div className="matrix-toolbar">
              <div><Grid3X3 size={16} /> <strong>Heatmap Final Status</strong></div>
              <span>{rows.length} baris · {dateCells.length} hari · page {data?.pagination.page ?? 1}/{data?.pagination.totalPages ?? 1}</span>
            </div>
            <div className="matrix-scroll">
              <table className="attendance-matrix-table">
                <thead>
                  <tr>
                    <th className="sticky-col employee-col">Karyawan</th>
                    <th className="sticky-col meta-col">Mapping</th>
                    {dateCells.map((day) => {
                      const dayName = new Date(day.date + 'T00:00:00').toLocaleDateString('id-ID', { weekday: 'short' });
                      return (
                        <th key={day.date} className={isSunday(day.date) ? 'sunday' : ''}>
                          <span>{day.day}</span>
                          <span className="col-day-name">{dayName}</span>
                        </th>
                      );
                    })}
              <th className="summary-col">H</th>
              <th className="summary-col">-</th>
              <th className="summary-col">O</th>
              <th className="summary-col">%</th>
            </tr>
          </thead>
                <tbody>
                  {rows.map((row, rowIndex) => (
                    <tr key={row.identityKey || row.employeeCode || row.rawDeviceUserId || `${row.machineCode ?? 'row'}-${rowIndex}`}>
                      <td className="sticky-col employee-col">
                        <strong className={row.rawIdLength && row.rawIdLength > 5 ? 'long-id' : ''}>
                          {row.employeeCode}
                          {row.rawIdLength && row.rawIdLength > 5 && (
                            <span className="long-id-indicator" title="ID panjang dari mesin">⚠️</span>
                          )}
                        </strong>
                        <span>{row.employeeName}</span>
                        <small>
                          {row.rawDeviceUserId && row.rawDeviceUserId !== row.employeeCode ? `${row.rawDeviceUserId} · ` : ''}
                          {row.divisionCode}
                          {row.machineCode ? ` · ${row.machineCode}` : ''}
                        </small>
                      </td>
                      <td className="sticky-col meta-col">
                        <Badge
                          variant={row.mappingStatus === 'MAPPED' ? 'success' : row.mappingStatus === 'NEED_REVIEW' ? 'warning' : 'neutral'}
                          title={row.mappingReason ? `Reason: ${row.mappingReason}` : undefined}
                        >
                          {row.mappingStatus === 'NEED_REVIEW' && row.rawIdLength && row.rawIdLength > 5
                            ? 'LONG ID'
                            : row.mappingStatus}
                        </Badge>
                        {row.rawIdLength && row.rawIdLength > 5 && (
                          <span className="meta-length" title="Panjang ID dari mesin">({row.rawIdLength}d)</span>
                        )}
                      </td>
                      {row.days.map((cell) => {
                        const sun = isSunday(cell.date);
                        // Sunday without data = NO_DATA (rest day), NOT alfa.
                        const isAlfa = !sun && cell.status === 'NO_DATA' && isPastDate(cell.date) && cell.expectedStatus === 'WORKDAY' && !cell.holidayName;
                        const displayStatus = isAlfa ? 'TIDAK_HADIR' : cell.status;
                        return (
                        <td key={cell.date} className={`matrix-cell-wrap ${sun ? 'sunday' : ''}`}>
                          <button
                            className={`matrix-cell status-${displayStatus.toLowerCase()} ${cell.qualityFlags.length > 0 ? 'flagged' : ''}`}
                            onClick={() => setSelectedCell({ row, cell })}
                            title={`${row.employeeName} · ${cell.date} · ${STATUS_LABEL[displayStatus] ?? displayStatus} · ${cell.source} · ${cell.scanCount} scan · In: ${formatTimeWib(cell.checkInAt)} · Out: ${formatTimeWib(cell.checkOutAt)}${isAlfa ? ' · ALFA' : ''}`}
                          >
                            {attendanceStatusCode(displayStatus)}
                          </button>
                        </td>
                        );
                      })}
                      <td className="summary-col success">{row.summary.present}</td>
                      <td className="summary-col muted">{row.summary.noData}</td>
                      <td className="summary-col muted">{row.summary.offDay}</td>
                      <td className="summary-col">{row.summary.attendanceRate}%</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="matrix-pagination">
              <button className="btn btn-sm btn-outline" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page <= 1}>
                <ChevronLeft size={14} /> Prev
              </button>
              <span>{data?.pagination.total ?? rows.length} total</span>
              <button
                className="btn btn-sm btn-outline"
                onClick={() => setPage((value) => Math.min(data?.pagination.totalPages ?? value, value + 1))}
                disabled={page >= (data?.pagination.totalPages ?? 1)}
              >
                Next <ChevronRight size={14} />
              </button>
            </div>
          </div>
        ) : (
          <div className="matrix-state">
            <CalendarDays size={42} />
            <p>Tidak ada data untuk filter ini</p>
          </div>
        )}
      </div>

      {selectedCell && (
        <>
          <div className="detail-overlay" onClick={() => setSelectedCell(null)} />
          <aside className="matrix-detail-drawer">
            <header>
              <div>
                <h2>{selectedCell.row.employeeName}</h2>
                <p>{selectedCell.row.rawDeviceUserId ?? selectedCell.row.employeeCode} · {selectedCell.cell.date}</p>
              </div>
              <button className="close-btn" onClick={() => setSelectedCell(null)} aria-label="Close">
                <X size={18} />
              </button>
            </header>

            <div className="matrix-detail-status">
              <span className={`matrix-cell status-${selectedCell.cell.status.toLowerCase()}`}>{attendanceStatusCode(selectedCell.cell.status)}</span>
              <div>
                <strong>{STATUS_LABEL[selectedCell.cell.status]}</strong>
                <p>{selectedCell.cell.source} · {selectedCell.cell.scanCount} raw scan</p>
              </div>
            </div>

            <div className="matrix-detail-grid">
              <div><span>Check In</span><strong>{selectedCell.cell.checkInAt ? new Date(selectedCell.cell.checkInAt).toLocaleTimeString('id-ID') : '-'}</strong></div>
              <div><span>Check Out</span><strong>{selectedCell.cell.checkOutAt ? new Date(selectedCell.cell.checkOutAt).toLocaleTimeString('id-ID') : '-'}</strong></div>
              <div><span>Durasi</span><strong>{formatWorkDuration(selectedCell.cell.checkInAt, selectedCell.cell.checkOutAt)}</strong></div>
              <div><span>Machine</span><strong>{(cellDetail?.raw_logs?.[0]?.machine_code ?? selectedCell.cell.machineCode) ?? '-'}</strong></div>
              <div><span>Raw ID</span><strong>{(cellDetail?.raw_logs?.[0]?.raw_device_user_id ?? selectedCell.cell.rawDeviceUserId) ?? '-'}</strong></div>
              <div><span>Expected</span><strong>{selectedCell.cell.expectedLabel ?? selectedCell.cell.expectedStatus ?? '-'}</strong></div>
              <div><span>Trace</span><strong>{selectedCell.cell.traceState ?? '-'}</strong></div>
            </div>

            {selectedCell.cell.qualityFlags.length > 0 && (
              <div className="matrix-detail-flags">
                {selectedCell.cell.qualityFlags.map((flag) => <span key={flag}><Info size={12} /> {flag}</span>)}
              </div>
            )}

            {selectedCell.cell.reason && (
              <section>
                <h3>Reason</h3>
                <p className="text-muted">{selectedCell.cell.reason}</p>
              </section>
            )}

            <section>
              <h3>Raw Logs</h3>
              {cellLoading ? (
                <p className="text-muted">Memuat detail...</p>
              ) : cellDetail?.raw_logs?.length ? (
                <div className="matrix-raw-log-list">
                  {cellDetail.raw_logs.map((log, index) => (
                    <div key={String(log.id ?? index)}>
                      <strong>{log.scan_time ? new Date(String(log.scan_time)).toLocaleTimeString('id-ID') : '-'}</strong>
                      <span>{String(log.machine_code ?? '-')} · {String(log.raw_device_user_id ?? '-')} · {String(log.mapping_status ?? '-')}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-muted">Tidak ada raw scan untuk cell ini.</p>
              )}
            </section>

            <section>
              <h3>Decision Source</h3>
              <p className="text-muted">
                Final status mengikuti prioritas manual correction, imported/database record, raw ZKTeco scan, lalu expected day model.
              </p>
              {selectedCell.cell.provenance && (
                <p className="text-muted" style={{ marginTop: 8 }}>{selectedCell.cell.provenance}</p>
              )}
            </section>
          </aside>
        </>
      )}
    </>
  );
}
