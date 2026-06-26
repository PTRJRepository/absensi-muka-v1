import { useState, useMemo } from 'react';
import { Search, X, Filter, ChevronDown } from 'lucide-react';

export type AttendanceStatus = 'PRESENT' | 'ABSENT' | 'NO_DATA' | 'LEAVE' | 'SICK' | 'HOLIDAY';

export interface Division {
  division_code: string;
  division_name: string;
  active_employees: number;
}

interface FilterBarProps {
  date: string;
  onDateChange: (date: string) => void;
  divisions: Division[];
  selectedDivision: string;
  onDivisionChange: (division: string) => void;
  statuses: AttendanceStatus[];
  onStatusChange: (statuses: AttendanceStatus[]) => void;
  search: string;
  onSearchChange: (search: string) => void;
  onRefresh: () => void;
  isLoading?: boolean;
}

const STATUS_OPTIONS: { value: AttendanceStatus; label: string; color: string }[] = [
  { value: 'PRESENT', label: 'Hadir', color: '#16a34a' },
  { value: 'ABSENT', label: 'Alpha', color: '#dc2626' },
  { value: 'NO_DATA', label: 'No Data', color: '#9ca3af' },
  { value: 'LEAVE', label: 'Cuti', color: '#3b82f6' },
  { value: 'SICK', label: 'Sakit', color: '#eab308' },
];

export function FilterBar({
  date,
  onDateChange,
  divisions,
  selectedDivision,
  onDivisionChange,
  statuses,
  onStatusChange,
  search,
  onSearchChange,
  onRefresh,
  isLoading = false,
}: FilterBarProps) {
  const [statusDropdownOpen, setStatusDropdownOpen] = useState(false);

  const hasActiveFilters = selectedDivision || statuses.length > 0 || search;

  const handleClear = () => {
    onDivisionChange('');
    onStatusChange([]);
    onSearchChange('');
  };

  const toggleStatus = (status: AttendanceStatus) => {
    if (statuses.includes(status)) {
      onStatusChange(statuses.filter(s => s !== status));
    } else {
      onStatusChange([...statuses, status]);
    }
  };

  const selectedStatusLabels = useMemo(() => {
    if (statuses.length === 0) return 'Status';
    if (statuses.length === 1) {
      return STATUS_OPTIONS.find(s => s.value === statuses[0])?.label || 'Status';
    }
    return `${statuses.length} Status`;
  }, [statuses]);

  return (
    <div className="filter-bar">
      {/* Date Picker */}
      <div className="filter-item">
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="filter-date-input"
        />
      </div>

      {/* Division Dropdown */}
      <div className="filter-item">
        <select
          value={selectedDivision}
          onChange={(e) => onDivisionChange(e.target.value)}
          className="filter-select"
        >
          <option value="">Semua Divisi</option>
          {divisions.map((div) => (
            <option key={div.division_code} value={div.division_code}>
              {div.division_name} ({div.active_employees})
            </option>
          ))}
        </select>
        <ChevronDown size={14} className="filter-select-icon" />
      </div>

      {/* Status Multi-select Dropdown */}
      <div className="filter-item filter-status-dropdown">
        <button
          type="button"
          className={`filter-select filter-status-trigger ${statuses.length > 0 ? 'active' : ''}`}
          onClick={() => setStatusDropdownOpen(!statusDropdownOpen)}
        >
          <span style={{ color: statuses.length > 0 ? 'var(--brand-primary)' : undefined }}>
            {selectedStatusLabels}
          </span>
          <ChevronDown size={14} className="filter-select-icon" />
        </button>
        {statusDropdownOpen && (
          <>
            <div className="status-dropdown-overlay" onClick={() => setStatusDropdownOpen(false)} />
            <div className="status-dropdown">
              <div className="status-dropdown-header">
                <Filter size={14} />
                <span>Filter Status</span>
              </div>
              <div className="status-options">
                {STATUS_OPTIONS.map((opt) => (
                  <label key={opt.value} className="status-option">
                    <input
                      type="checkbox"
                      checked={statuses.includes(opt.value)}
                      onChange={() => toggleStatus(opt.value)}
                    />
                    <span
                      className="status-dot"
                      style={{ backgroundColor: opt.color }}
                    />
                    <span className="status-label">{opt.label}</span>
                  </label>
                ))}
              </div>
              {statuses.length > 0 && (
                <button
                  type="button"
                  className="status-clear-btn"
                  onClick={() => onStatusChange([])}
                >
                  Clear Status
                </button>
              )}
            </div>
          </>
        )}
      </div>

      {/* Search Input */}
      <div className="filter-item filter-search">
        <Search size={16} className="filter-search-icon" />
        <input
          type="text"
          placeholder="Cari kode/nama..."
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          className="filter-search-input"
        />
        {search && (
          <button
            type="button"
            className="filter-search-clear"
            onClick={() => onSearchChange('')}
          >
            <X size={14} />
          </button>
        )}
      </div>

      {/* Refresh Button */}
      <button
        type="button"
        className={`btn btn-outline btn-sm filter-refresh ${isLoading ? 'loading' : ''}`}
        onClick={onRefresh}
        disabled={isLoading}
      >
        <span className={`refresh-icon ${isLoading ? 'spin' : ''}`}>↻</span>
        Refresh
      </button>

      {/* Clear All Button */}
      {hasActiveFilters && (
        <button
          type="button"
          className="btn btn-sm filter-clear-all"
          onClick={handleClear}
        >
          <X size={14} />
          Clear
        </button>
      )}

      <style>{`
        .filter-bar {
          display: flex;
          gap: 12px;
          align-items: center;
          flex-wrap: wrap;
          padding: 12px 16px;
          background: var(--surface-muted);
          border-radius: var(--radius-lg);
          margin-bottom: 16px;
        }

        .filter-item {
          position: relative;
          display: flex;
          align-items: center;
        }

        .filter-date-input {
          padding: 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 13px;
          background: var(--surface-card);
          color: var(--text-primary);
          cursor: pointer;
        }

        .filter-date-input:focus {
          outline: none;
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.1);
        }

        .filter-select {
          appearance: none;
          padding: 8px 32px 8px 12px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 13px;
          font-weight: 500;
          background: var(--surface-card);
          color: var(--text-primary);
          cursor: pointer;
          min-width: 150px;
          transition: all var(--duration-fast);
        }

        .filter-select:focus {
          outline: none;
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.1);
        }

        .filter-select.active {
          border-color: var(--brand-primary);
          background: rgba(22, 163, 74, 0.05);
        }

        .filter-select-icon {
          position: absolute;
          right: 10px;
          pointer-events: none;
          color: var(--text-secondary);
        }

        .filter-status-dropdown {
          position: relative;
        }

        .filter-status-trigger {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 8px;
          white-space: nowrap;
        }

        .status-dropdown-overlay {
          position: fixed;
          inset: 0;
          z-index: 99;
        }

        .status-dropdown {
          position: absolute;
          top: calc(100% + 4px);
          left: 0;
          min-width: 200px;
          background: var(--surface-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          box-shadow: 0 10px 40px rgba(0, 0, 0, 0.15);
          z-index: 100;
          overflow: hidden;
        }

        .status-dropdown-header {
          display: flex;
          align-items: center;
          gap: 8px;
          padding: 10px 12px;
          border-bottom: 1px solid var(--border-color);
          font-weight: 600;
          font-size: 12px;
          color: var(--text-secondary);
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .status-options {
          padding: 8px;
        }

        .status-option {
          display: flex;
          align-items: center;
          gap: 10px;
          padding: 8px 10px;
          border-radius: var(--radius-md);
          cursor: pointer;
          transition: background var(--duration-fast);
        }

        .status-option:hover {
          background: var(--surface-muted);
        }

        .status-option input[type="checkbox"] {
          width: 16px;
          height: 16px;
          accent-color: var(--brand-primary);
          cursor: pointer;
        }

        .status-dot {
          width: 10px;
          height: 10px;
          border-radius: 50%;
          flex-shrink: 0;
        }

        .status-label {
          font-size: 13px;
          color: var(--text-primary);
        }

        .status-clear-btn {
          width: 100%;
          padding: 10px;
          border: none;
          border-top: 1px solid var(--border-color);
          background: transparent;
          color: var(--text-secondary);
          font-size: 12px;
          font-weight: 500;
          cursor: pointer;
          transition: all var(--duration-fast);
        }

        .status-clear-btn:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .filter-search {
          flex: 1;
          min-width: 200px;
          max-width: 300px;
          position: relative;
        }

        .filter-search-icon {
          position: absolute;
          left: 12px;
          color: var(--text-secondary);
          pointer-events: none;
        }

        .filter-search-input {
          width: 100%;
          padding: 8px 32px 8px 36px;
          border: 1px solid var(--border-color);
          border-radius: var(--radius-md);
          font-size: 13px;
          background: var(--surface-card);
          color: var(--text-primary);
          transition: all var(--duration-fast);
        }

        .filter-search-input:focus {
          outline: none;
          border-color: var(--brand-primary);
          box-shadow: 0 0 0 2px rgba(22, 163, 74, 0.1);
        }

        .filter-search-input::placeholder {
          color: var(--text-tertiary);
        }

        .filter-search-clear {
          position: absolute;
          right: 8px;
          padding: 4px;
          border: none;
          background: transparent;
          color: var(--text-secondary);
          cursor: pointer;
          border-radius: var(--radius-sm);
          display: flex;
          align-items: center;
          justify-content: center;
        }

        .filter-search-clear:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .filter-refresh {
          display: flex;
          align-items: center;
          gap: 6px;
        }

        .filter-refresh.loading {
          opacity: 0.7;
          cursor: wait;
        }

        .refresh-icon {
          display: inline-block;
        }

        .refresh-icon.spin {
          animation: spin 1s linear infinite;
        }

        @keyframes spin {
          from { transform: rotate(0deg); }
          to { transform: rotate(360deg); }
        }

        .filter-clear-all {
          display: flex;
          align-items: center;
          gap: 4px;
          color: var(--text-secondary);
          border-color: var(--border-color);
        }

        .filter-clear-all:hover {
          color: var(--error);
          border-color: var(--error);
          background: rgba(220, 38, 38, 0.05);
        }

        @media (max-width: 768px) {
          .filter-bar {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-item,
          .filter-search {
            max-width: none;
            width: 100%;
          }

          .filter-refresh,
          .filter-clear-all {
            width: 100%;
            justify-content: center;
          }
        }
      `}</style>
    </div>
  );
}
