/**
 * Simple filter bar: Month, Division, Machine, Status selects + Reset button.
 */
import type { AttendanceUiStatus, AttendanceSourceMode } from '../types/attendance-ui.types';
import { Select, Button } from '../../../design-system/components';
import type { Division } from '../../../types';

const MONTH_NAMES = [
  'Januari', 'Februari', 'Maret', 'April', 'Mei', 'Juni',
  'Juli', 'Agustus', 'September', 'Oktober', 'November', 'Desember',
];

const STATUS_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Semua Status' },
  { value: 'HADIR', label: 'Hadir' },
  { value: 'TIDAK_HADIR', label: 'Tidak Hadir' },
  { value: 'SAKIT', label: 'Sakit' },
  { value: 'CUTI', label: 'Cuti' },
  { value: 'OFF_DAY', label: 'Off Day' },
  { value: 'NO_DATA', label: 'No Data' },
  { value: 'INCOMPLETE_SCAN', label: 'Belum Lengkap' },
  { value: 'NEED_REVIEW', label: 'Tinjau' },
];

const DIVISION_OPTIONS: Array<{ value: string; label: string }> = [
  { value: '', label: 'Semua Divisi' },
  { value: 'P1A', label: 'P1A' },
  { value: 'P1B', label: 'P1B' },
  { value: 'P2A', label: 'P2A' },
  { value: 'P2B', label: 'P2B' },
  { value: 'DME', label: 'DME' },
  { value: 'ARA', label: 'ARA' },
  { value: 'AB1', label: 'AB1' },
  { value: 'AB2', label: 'AB2' },
  { value: 'ARC', label: 'ARC' },
  { value: 'IJL', label: 'IJL' },
  { value: 'PGE', label: 'PGE' },
];

interface SimpleFilterBarProps {
  year: number;
  month: number;
  divisionCode: string;
  machineCode: string;
  status: string;
  mode: AttendanceSourceMode;
  divisions?: Division[];
  machines?: Array<{ machine_code: string }>;
  onYearChange: (v: number) => void;
  onMonthChange: (v: number) => void;
  onDivisionChange: (v: string) => void;
  onMachineChange: (v: string) => void;
  onStatusChange: (v: string) => void;
  onReset: () => void;
  isDefault: boolean;
}

export function SimpleFilterBar({
  year,
  month,
  divisionCode,
  machineCode,
  status,
  mode,
  divisions,
  machines,
  onYearChange,
  onMonthChange,
  onDivisionChange,
  onMachineChange,
  onStatusChange,
  onReset,
  isDefault,
}: SimpleFilterBarProps) {
  const currentYear = new Date().getFullYear();
  const years = Array.from({ length: 5 }, (_, i) => currentYear - 2 + i);

  return (
    <div className="rb-filterbar">
      {/* Month */}
      <Select
        label="Bulan"
        value={String(month)}
        onChange={(e) => onMonthChange(parseInt(e.target.value, 10))}
      >
        {MONTH_NAMES.map((name, i) => (
          <option key={i + 1} value={i + 1}>{name}</option>
        ))}
      </Select>

      {/* Year */}
      <Select
        label="Tahun"
        value={String(year)}
        onChange={(e) => onYearChange(parseInt(e.target.value, 10))}
      >
        {years.map((y) => (
          <option key={y} value={y}>{y}</option>
        ))}
      </Select>

      {/* Division */}
      <Select
        label="Divisi"
        value={divisionCode}
        onChange={(e) => onDivisionChange(e.target.value)}
      >
        {DIVISION_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>

      {/* Machine — disabled in Parsed mode */}
      <Select
        label="Mesin"
        value={machineCode}
        onChange={(e) => onMachineChange(e.target.value)}
        disabled={mode === 'database'}
        title={mode === 'database' ? 'Mesin filter hanya untuk mode Raw' : undefined}
      >
        <option value="">Semua Mesin</option>
        {(machines ?? []).map((m) => (
          <option key={m.machine_code} value={m.machine_code}>
            {m.machine_code}
          </option>
        ))}
      </Select>

      {/* Status */}
      <Select
        label="Status"
        value={status}
        onChange={(e) => onStatusChange(e.target.value)}
      >
        {STATUS_OPTIONS.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </Select>

      {/* Reset — only when filters differ from defaults */}
      {!isDefault && (
        <div style={{ display: 'flex', alignItems: 'flex-end' }}>
          <Button onClick={onReset}>Reset</Button>
        </div>
      )}
    </div>
  );
}
