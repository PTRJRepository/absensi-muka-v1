/**
 * Source toggle: Raw (datamesin) / Parsed (database) segmented control.
 */
import { SegmentedControl } from '../../../design-system/components';
import type { AttendanceSourceMode } from '../types/attendance-ui.types';

const OPTIONS: Array<{ value: AttendanceSourceMode; label: string }> = [
  { value: 'datamesin', label: 'Raw' },
  { value: 'database', label: 'Parsed' },
];

const TOOLTIPS: Record<AttendanceSourceMode, string> = {
  datamesin:
    'Raw mode — Shows data directly from ZKTeco machine, no employee mapping applied.',
  database:
    'Parsed mode — Shows processed attendance with employee mapping from the database.',
};

interface SourceToggleProps {
  value: AttendanceSourceMode;
  onChange: (mode: AttendanceSourceMode) => void;
}

export function SourceToggle({ value, onChange }: SourceToggleProps) {
  function handleChange(raw: string) {
    const mode = raw as AttendanceSourceMode;
    onChange(mode);
  }

  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
      <SegmentedControl
        options={OPTIONS}
        value={value}
        onChange={handleChange}
        ariaLabel="Attendance data source"
      />
      <span
        title={TOOLTIPS[value]}
        style={{ fontSize: 11, color: 'var(--rb-text-muted)', cursor: 'help' }}
      >
        ?
      </span>
    </div>
  );
}
