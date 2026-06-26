import { useMemo, useState } from 'react';
import {
  useReactTable,
  getCoreRowModel,
  getSortedRowModel,
  flexRender,
  type ColumnDef,
  type SortingState,
} from '@tanstack/react-table';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';
import type { EmployeeComprehensiveRow } from '../../../types';

interface EmployeeComprehensiveTableProps {
  data: EmployeeComprehensiveRow[];
  isLoading: boolean;
  onRowClick: (row: EmployeeComprehensiveRow) => void;
  mode: 'datamesin' | 'database';
}

// Helper function to format dates
function formatDate(iso: string | null): string {
  if (!iso) return '-';
  try {
    return new Date(iso).toLocaleDateString('id-ID', {
      day: '2-digit',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return '-';
  }
}

// Helper function to get badge variant
function getMappingBadgeVariant(status: string): string {
  switch (status) {
    case 'MAPPED':
      return 'success';
    case 'UNMAPPED':
      return 'error';
    case 'NEED_REVIEW':
      return 'warning';
    case 'AMBIGUOUS':
      return 'info';
    default:
      return 'neutral';
  }
}

// Helper function to get badge label
function getMappingBadgeLabel(status: string): string {
  switch (status) {
    case 'MAPPED':
      return 'Mapped';
    case 'UNMAPPED':
      return 'Unmapped';
    case 'NEED_REVIEW':
      return 'Need Review';
    case 'AMBIGUOUS':
      return 'Ambiguous';
    default:
      return status || '-';
  }
}

export function EmployeeComprehensiveTable({
  data,
  isLoading,
  onRowClick,
  mode,
}: EmployeeComprehensiveTableProps) {
  const [sorting, setSorting] = useState<SortingState>([]);

  // Define columns for datamesin mode
  const datamesinColumns = useMemo<ColumnDef<EmployeeComprehensiveRow>[]>(
    () => [
      {
        accessorKey: 'rawDeviceUserId',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Absensi ID
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.rawDeviceUserId || '-'}</span>
        ),
      },
      {
        accessorKey: 'zktecoUserName',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Nama Mesin
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={row.original.zktecoUserName ? '' : 'text-muted'}>
            {row.original.zktecoUserName || 'Nama tidak ditemukan'}
          </span>
        ),
      },
      {
        accessorKey: 'parsedEmployeeCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Parsed ID
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.parsedEmployeeCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'employeeCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Employee Code
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.employeeCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Nama Database
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={row.original.employeeName ? '' : 'text-muted'}>
            {row.original.employeeName || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'machineCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Machine
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="badge badge-neutral">{row.original.machineCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'currentEmpCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Current Emp
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const val = row.original.currentEmpCode;
          const isDiff = val && row.original.parsedEmployeeCode && val !== row.original.parsedEmployeeCode;
          return (
            <span className={`mono${isDiff ? ' text-success font-bold' : ''}`}>
              {val || '-'}
              {isDiff && <span className="text-xs text-muted"> (updated)</span>}
            </span>
          );
        },
      },
      {
        accessorKey: 'nik',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            NIK
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const nik = row.original.nik;
          if (!nik) return <span className="mono text-muted">-</span>;
          const str = nik.replace(/\s+/g, '');
          const masked = str.length > 8 ? str.substring(0, 4) + '****' + str.substring(str.length - 4) : str;
          return <span className="mono">{masked}</span>;
        },
      },
      {
        accessorKey: 'divisionCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Divisi
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="badge badge-neutral">{row.original.divisionCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'mappingStatus',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Mapping
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={`badge badge-${getMappingBadgeVariant(row.original.mappingStatus)}`}>
            {getMappingBadgeLabel(row.original.mappingStatus)}
          </span>
        ),
      },
      {
        accessorKey: 'scanCount',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Scan
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.scanCount || 0}</span>
        ),
      },
      {
        accessorKey: 'lastScanAt',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Last Scan
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="text-sm">{formatDate(row.original.lastScanAt)}</span>
        ),
      },
    ],
    []
  );

  // Define columns for database mode
  const databaseColumns = useMemo<ColumnDef<EmployeeComprehensiveRow>[]>(
    () => [
      {
        accessorKey: 'employeeCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Employee Code
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono font-bold">{row.original.employeeCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'employeeName',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Nama Karyawan
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={row.original.employeeName ? '' : 'text-muted'}>
            {row.original.employeeName || '-'}
          </span>
        ),
      },
      {
        accessorKey: 'currentEmpCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Current Emp
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const val = row.original.currentEmpCode;
          const isDiff = val && row.original.parsedEmployeeCode && val !== row.original.parsedEmployeeCode;
          return (
            <span className={`mono${isDiff ? ' text-success font-bold' : ''}`}>
              {val || '-'}
              {isDiff && <span className="text-xs text-muted"> (updated)</span>}
            </span>
          );
        },
      },
      {
        accessorKey: 'nik',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            NIK
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => {
          const nik = row.original.nik;
          if (!nik) return <span className="mono text-muted">-</span>;
          const str = nik.replace(/\s+/g, '');
          const masked = str.length > 8 ? str.substring(0, 4) + '****' + str.substring(str.length - 4) : str;
          return <span className="mono">{masked}</span>;
        },
      },
      {
        accessorKey: 'divisionCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Divisi
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="badge badge-neutral">{row.original.divisionCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'gangCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Gang
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="badge badge-neutral">{row.original.gangCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'rawDeviceUserId',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Absensi ID
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.rawDeviceUserId || '-'}</span>
        ),
      },
      {
        accessorKey: 'parsedEmployeeCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Parsed ID
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.parsedEmployeeCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'machineCode',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Machine Terakhir
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="badge badge-neutral">{row.original.machineCode || '-'}</span>
        ),
      },
      {
        accessorKey: 'mappingStatus',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Mapping
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className={`badge badge-${getMappingBadgeVariant(row.original.mappingStatus)}`}>
            {getMappingBadgeLabel(row.original.mappingStatus)}
          </span>
        ),
      },
      {
        accessorKey: 'scanCount',
        header: ({ column }) => (
          <button className="sort-header" onClick={() => column.toggleSorting()}>
            Scan
            {column.getIsSorted() === 'asc' ? (
              <ArrowUp size={12} />
            ) : column.getIsSorted() === 'desc' ? (
              <ArrowDown size={12} />
            ) : (
              <ArrowUpDown size={12} />
            )}
          </button>
        ),
        cell: ({ row }) => (
          <span className="mono">{row.original.scanCount || 0}</span>
        ),
      },
    ],
    []
  );

  const columns = mode === 'datamesin' ? datamesinColumns : databaseColumns;

  const table = useReactTable({
    data,
    columns,
    state: { sorting },
    onSortingChange: setSorting,
    getCoreRowModel: getCoreRowModel(),
    getSortedRowModel: getSortedRowModel(),
  });

  if (isLoading) {
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={String(col.id)}>{typeof col.header === 'string' ? col.header : 'Loading...'}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {Array.from({ length: 10 }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={String(col.id)}>
                    <div className="skeleton" style={{ height: 14, borderRadius: 4 }} />
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    );
  }

  if (data.length === 0) {
    return (
      <div className="table-container">
        <table className="data-table">
          <thead>
            <tr>
              {columns.map((col) => (
                <th key={String(col.id)}>{typeof col.header === 'string' ? col.header : ''}</th>
              ))}
            </tr>
          </thead>
        </table>
        <div className="empty-state">
          <p>Tidak ada data karyawan ditemukan</p>
        </div>
      </div>
    );
  }

  return (
    <div className="table-container">
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            {table.getHeaderGroups().map((headerGroup) => (
              <tr key={headerGroup.id}>
                {headerGroup.headers.map((header) => (
                  <th key={header.id}>
                    {header.isPlaceholder
                      ? null
                      : flexRender(header.column.columnDef.header, header.getContext())}
                  </th>
                ))}
              </tr>
            ))}
          </thead>
          <tbody>
            {table.getRowModel().rows.map((row) => (
              <tr
                key={row.id}
                onClick={() => onRowClick(row.original)}
                className="clickable-row"
              >
                {row.getVisibleCells().map((cell) => (
                  <td key={cell.id}>
                    {flexRender(cell.column.columnDef.cell, cell.getContext())}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <style>{`
        .table-container {
          background: var(--surface-card);
          border: 1px solid var(--border-color);
          border-radius: var(--radius-lg);
          overflow: hidden;
        }

        .table-scroll {
          overflow-x: auto;
        }

        .data-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
        }

        .data-table th {
          text-align: left;
          padding: 10px 12px;
          background: var(--gray-50);
          color: var(--gray-700);
          font-weight: 600;
          font-size: 11px;
          text-transform: uppercase;
          letter-spacing: 0.5px;
          border-bottom: 1px solid var(--border-color);
          white-space: nowrap;
          position: relative;
        }

        .data-table td {
          padding: 10px 12px;
          border-bottom: 1px solid var(--gray-100);
          color: var(--text-primary);
        }

        .data-table tr:last-child td {
          border-bottom: none;
        }

        .data-table tr:hover td {
          background: var(--surface-muted);
        }

        .clickable-row {
          cursor: pointer;
          transition: background var(--duration-fast);
        }

        .sort-header {
          display: inline-flex;
          align-items: center;
          gap: 4px;
          background: none;
          border: none;
          font: inherit;
          color: inherit;
          cursor: pointer;
          padding: 0;
          text-transform: uppercase;
          letter-spacing: 0.5px;
        }

        .sort-header:hover {
          color: var(--brand-primary);
        }

        .sort-header svg {
          opacity: 0.5;
        }

        .sort-header:hover svg {
          opacity: 1;
        }

        .mono {
          font-family: var(--font-mono);
        }

        .font-bold {
          font-weight: 600;
        }

        .text-muted {
          color: var(--text-secondary);
        }

        .text-sm {
          font-size: 12px;
          color: var(--text-secondary);
        }

        .badge {
          display: inline-flex;
          align-items: center;
          padding: 2px 8px;
          border-radius: 99px;
          font-size: 11px;
          font-weight: 600;
          gap: 4px;
        }

        .badge-success {
          background: rgba(54, 209, 124, 0.12);
          color: var(--success);
        }

        .badge-warning {
          background: rgba(255, 176, 32, 0.13);
          color: var(--warning);
        }

        .badge-error {
          background: rgba(255, 77, 77, 0.13);
          color: var(--error);
        }

        .badge-info {
          background: rgba(58, 160, 255, 0.13);
          color: var(--info);
        }

        .badge-neutral {
          background: rgba(255, 255, 255, 0.05);
          color: var(--text-secondary);
        }

        .empty-state {
          text-align: center;
          padding: 48px 16px;
          color: var(--text-secondary);
        }

        .skeleton {
          background: linear-gradient(90deg, var(--gray-100) 25%, var(--gray-200) 50%, var(--gray-100) 75%);
          background-size: 200% 100%;
          animation: shimmer 1.5s infinite;
        }

        @keyframes shimmer {
          0% { background-position: 200% 0; }
          100% { background-position: -200% 0; }
        }
      `}</style>
    </div>
  );
}