/**
 * Attendance Workspace Page — Estate Operations Grid.
 * Composes filter bar, matrix, detail panel, and cell drawer.
 */
import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '../../../lib/api';
import { AppShell } from '../components/AppShell';
import { SourceToggle } from '../components/SourceToggle';
import { SimpleFilterBar } from '../components/SimpleFilterBar';
import { AttendanceMatrix } from '../components/AttendanceMatrix';
import { EmployeeDetailPanel } from '../components/EmployeeDetailPanel';
import { CellDetailDrawer } from '../components/CellDetailDrawer';
import { useMatrixFilters } from '../hooks/useMatrixFilters';
import type { AttendanceMatrixRow as MatrixRow, AttendanceMatrixCell as MatrixCell } from '../../../types';
import type { Division } from '../../../types';
import '../../../design-system/rebinmas/estate-operations-grid.css';

export function AttendanceWorkspacePage() {
  const {
    mode,
    year,
    month,
    divisionCode,
    machineCode,
    status,
    page,
    pageSize,
    setMode,
    setYear,
    setMonth,
    setDivision,
    setMachine,
    setStatus,
    setPage,
    resetFilters,
    isDefault,
  } = useMatrixFilters();

  const [selectedRow, setSelectedRow] = useState<MatrixRow | null>(null);
  const [selectedCell, setSelectedCell] = useState<MatrixCell | null>(null);

  // Divisions for filter dropdown
  const { data: divisions } = useQuery<Division[]>({
    queryKey: ['divisions'],
    queryFn: () => api<Division[]>('/api/divisions'),
    staleTime: 60000,
  });

  // Machines for filter dropdown
  const { data: machines } = useQuery<Array<{ machine_code: string }>>({
    queryKey: ['machines'],
    queryFn: () => api('/api/machines'),
    staleTime: 120000,
  });

  function handleSelectRow(row: MatrixRow) {
    setSelectedRow(row);
    // Clear cell selection when selecting a row
    setSelectedCell(null);
  }

  function handleCellClick(row: MatrixRow, cell: MatrixCell) {
    setSelectedCell(cell);
    setSelectedRow(row);
  }

  function handleCloseDrawer() {
    setSelectedCell(null);
  }

  return (
    <AppShell>
      <div style={{ maxWidth: '100%' }}>
        {/* Title row */}
        <div className="rb-title-row">
          <div>
            <h1 className="rb-title">Attendance Matrix</h1>
            <p className="rb-subtitle">
              {new Date(year, month - 1).toLocaleDateString('id-ID', { month: 'long', year: 'numeric' })}
              {' '} · {mode === 'database' ? 'Parsed' : 'Raw'}
            </p>
          </div>
          <SourceToggle value={mode} onChange={setMode} />
        </div>

        {/* Filter bar */}
        <SimpleFilterBar
          year={year}
          month={month}
          divisionCode={divisionCode}
          machineCode={machineCode}
          status={status}
          mode={mode}
          divisions={divisions}
          machines={machines}
          onYearChange={setYear}
          onMonthChange={setMonth}
          onDivisionChange={setDivision}
          onMachineChange={setMachine}
          onStatusChange={setStatus}
          onReset={resetFilters}
          isDefault={isDefault()}
        />

        {/* Workspace: matrix + detail panel */}
        <div className="rb-workspace" style={{ marginTop: 14 }}>
          {/* Main: Matrix */}
          <div className="rb-main">
            <AttendanceMatrix
              onSelectRow={handleSelectRow}
              onCellClick={handleCellClick}
            />

            {/* Pagination */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                gap: 12,
                padding: '14px 0',
              }}
            >
              <button
                className="rb-button"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
              >
                ← Prev
              </button>
              <span style={{ fontSize: 13, color: 'var(--rb-text-muted)' }}>
                Halaman {page}
              </span>
              <button
                className="rb-button"
                onClick={() => setPage(page + 1)}
              >
                Next →
              </button>
            </div>
          </div>

          {/* Side panel: Employee detail */}
          <EmployeeDetailPanel row={selectedRow} mode={mode} />
        </div>
      </div>

      {/* Cell detail drawer */}
      <CellDetailDrawer
        row={selectedRow}
        cell={selectedCell}
        mode={mode}
        onClose={handleCloseDrawer}
      />
    </AppShell>
  );
}
