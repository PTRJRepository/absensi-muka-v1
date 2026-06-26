import { useState, useEffect, useMemo } from 'react';
import { Search, X, Monitor, Database, Filter } from 'lucide-react';
import type { EmployeeComprehensiveFilters } from '../../../types';

interface EmployeeComprehensiveToolbarProps {
  mode: 'datamesin' | 'database';
  onModeChange: (mode: 'datamesin' | 'database') => void;
  filters: {
    machineCode?: string;
    divisionCode?: string;
    search?: string;
    mappingStatus?: 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' | 'ALL';
  };
  onFiltersChange: (filters: Partial<EmployeeComprehensiveFilters>) => void;
  machines?: Array<{ code: string; name: string }>;
  divisions?: Array<{ code: string; name: string }>;
}

const MAPPING_STATUS_OPTIONS = [
  { value: 'ALL', label: 'Semua Status' },
  { value: 'MAPPED', label: 'Mapped' },
  { value: 'UNMAPPED', label: 'Unmapped' },
  { value: 'NEED_REVIEW', label: 'Need Review' },
];

function useDebouncedValue<T>(value: T, delay = 300) {
  const [debounced, setDebounced] = useState(value);

  useEffect(() => {
    const timer = window.setTimeout(() => setDebounced(value), delay);
    return () => window.clearTimeout(timer);
  }, [value, delay]);

  return debounced;
}

export function EmployeeComprehensiveToolbar({
  mode,
  onModeChange,
  filters,
  onFiltersChange,
  machines = [],
  divisions = [],
}: EmployeeComprehensiveToolbarProps) {
  const [searchInput, setSearchInput] = useState(filters.search || '');
  const debouncedSearch = useDebouncedValue(searchInput, 300);

  // Sync debounced search to filters
  useEffect(() => {
    if (debouncedSearch !== filters.search) {
      onFiltersChange({ ...filters, search: debouncedSearch });
    }
  }, [debouncedSearch]);

  const hasActiveFilters = useMemo(() => {
    return filters.machineCode || filters.divisionCode || filters.mappingStatus || filters.search;
  }, [filters]);

  const handleClear = () => {
    setSearchInput('');
    onFiltersChange({
      machineCode: undefined,
      divisionCode: undefined,
      mappingStatus: undefined,
      search: '',
    });
  };

  return (
    <div className="employee-comprehensive-toolbar">
      {/* Mode Toggle */}
      <div className="matrix-mode-toggle">
        <button
          className={mode === 'datamesin' ? 'active mesin' : ''}
          onClick={() => onModeChange('datamesin')}
        >
          <Monitor size={14} />
          Data Mesin
        </button>
        <button
          className={mode === 'database' ? 'active database' : ''}
          onClick={() => onModeChange('database')}
        >
          <Database size={14} />
          Data Divisi
        </button>
      </div>

      {/* Filters Row */}
      <div className="filter-row">
        {/* Machine Dropdown - dominant for datamesin mode */}
        {mode === 'datamesin' && (
          <div className="filter-select-wrap">
            <select
              value={filters.machineCode || ''}
              onChange={(e) => onFiltersChange({ ...filters, machineCode: e.target.value || undefined })}
              className="filter-select"
            >
              <option value="">Semua Mesin</option>
              {machines.map((m) => (
                <option key={m.code} value={m.code}>
                  {m.name || m.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Division Dropdown - dominant for database mode */}
        {mode === 'database' && (
          <div className="filter-select-wrap">
            <select
              value={filters.divisionCode || ''}
              onChange={(e) => onFiltersChange({ ...filters, divisionCode: e.target.value || undefined })}
              className="filter-select"
            >
              <option value="">Semua Divisi</option>
              {divisions.map((d) => (
                <option key={d.code} value={d.code}>
                  {d.name || d.code}
                </option>
              ))}
            </select>
          </div>
        )}

        {/* Mapping Status Filter */}
        <div className="filter-select-wrap">
          <select
            value={filters.mappingStatus || 'ALL'}
            onChange={(e) => onFiltersChange({ ...filters, mappingStatus: e.target.value === 'ALL' ? undefined : e.target.value as 'MAPPED' | 'UNMAPPED' | 'NEED_REVIEW' })}
            className="filter-select"
          >
            {MAPPING_STATUS_OPTIONS.map((opt) => (
              <option key={opt.value} value={opt.value}>
                {opt.label}
              </option>
            ))}
          </select>
        </div>

        {/* Search Input */}
        <div className="filter-search">
          <Search size={16} className="filter-search-icon" />
          <input
            type="text"
            placeholder="Cari Absensi ID, Kode, Nama..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            className="filter-search-input"
          />
          {searchInput && (
            <button
              type="button"
              className="filter-search-clear"
              onClick={() => setSearchInput('')}
            >
              <X size={14} />
            </button>
          )}
        </div>

        {/* Clear Filters */}
        {hasActiveFilters && (
          <button type="button" className="btn btn-sm btn-outline" onClick={handleClear}>
            <X size={14} />
            Clear
          </button>
        )}
      </div>

      <style>{`
        .employee-comprehensive-toolbar {
          display: flex;
          flex-direction: column;
          gap: 12px;
          padding: 14px 16px;
          background: var(--surface-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          margin-bottom: 16px;
        }

        .filter-row {
          display: flex;
          gap: 10px;
          align-items: center;
          flex-wrap: wrap;
        }

        .filter-select-wrap {
          position: relative;
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
          box-shadow: 0 0 0 2px rgba(54, 209, 124, 0.15);
        }

        .filter-select-wrap::after {
          content: '';
          position: absolute;
          right: 10px;
          top: 50%;
          transform: translateY(-50%);
          border: 4px solid transparent;
          border-top-color: var(--text-secondary);
          pointer-events: none;
        }

        .filter-search {
          flex: 1;
          min-width: 220px;
          max-width: 320px;
          position: relative;
        }

        .filter-search-icon {
          position: absolute;
          left: 12px;
          top: 50%;
          transform: translateY(-50%);
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
          box-shadow: 0 0 0 2px rgba(54, 209, 124, 0.15);
        }

        .filter-search-input::placeholder {
          color: var(--text-tertiary);
        }

        .filter-search-clear {
          position: absolute;
          right: 8px;
          top: 50%;
          transform: translateY(-50%);
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

        .btn-outline {
          background: transparent;
          color: var(--text-secondary);
          border: 1px solid var(--border-color);
        }

        .btn-outline:hover {
          background: var(--surface-muted);
          color: var(--text-primary);
        }

        .btn-sm {
          padding: 6px 12px;
          font-size: 12px;
          font-weight: 600;
          display: inline-flex;
          align-items: center;
          gap: 4px;
          border-radius: var(--radius-md);
          cursor: pointer;
          font-family: var(--font-sans);
          transition: all var(--duration-fast);
        }

        @media (max-width: 768px) {
          .filter-row {
            flex-direction: column;
            align-items: stretch;
          }

          .filter-select,
          .filter-search {
            max-width: none;
            width: 100%;
          }
        }
      `}</style>
    </div>
  );
}
