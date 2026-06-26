import type { ReactNode } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

interface Column<T> {
  key: keyof T | string;
  header: string;
  render?: (row: T) => ReactNode;
  width?: string;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  data: T[];
  loading?: boolean;
  skeletonRows?: number;
  keyField?: keyof T;
  pagination?: {
    page: number;
    pageSize: number;
    total: number;
    onPageChange: (page: number) => void;
  };
  emptyMessage?: string;
}

export function DataTable<T>({
  columns,
  data,
  loading,
  skeletonRows = 5,
  keyField = 'id' as keyof T,
  pagination,
  emptyMessage = 'Tidak ada data',
}: DataTableProps<T>) {
  const totalPages = pagination ? Math.ceil(pagination.total / pagination.pageSize) : 1;
  const currentPage = pagination?.page ?? 0;

  return (
    <div style={{ overflowX: 'auto' }}>
      <table className="data-table">
        <thead>
          <tr>
            {columns.map((col) => (
              <th key={String(col.key)} style={col.width ? { width: col.width } : undefined}>
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {loading ? (
            Array.from({ length: skeletonRows }).map((_, i) => (
              <tr key={i}>
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    <div className="skeleton" style={{ height: 14, borderRadius: 4 }}></div>
                  </td>
                ))}
              </tr>
            ))
          ) : data.length === 0 ? (
            <tr>
              <td colSpan={columns.length} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-secondary)' }}>
                {emptyMessage}
              </td>
            </tr>
          ) : (
            data.map((row, i) => (
              <tr key={String(row[keyField]) ?? i}>
                {columns.map((col) => (
                  <td key={String(col.key)}>
                    {col.render ? col.render(row) : String(row[col.key as keyof T] ?? '—')}
                  </td>
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>

      {pagination && totalPages > 1 && (
        <div className="data-table-pagination">
          <span>
            {pagination.total} total · Halaman {currentPage + 1} / {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button onClick={() => pagination.onPageChange(0)} disabled={currentPage === 0}>«</button>
            <button onClick={() => pagination.onPageChange(Math.max(0, currentPage - 1))} disabled={currentPage === 0}>
              <ChevronLeft size={14} />
            </button>
            <button onClick={() => pagination.onPageChange(Math.min(totalPages - 1, currentPage + 1))} disabled={currentPage >= totalPages - 1}>
              <ChevronRight size={14} />
            </button>
            <button onClick={() => pagination.onPageChange(totalPages - 1)} disabled={currentPage >= totalPages - 1}>»</button>
          </div>
        </div>
      )}
    </div>
  );
}
