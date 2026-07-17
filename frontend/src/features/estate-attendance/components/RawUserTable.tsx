import { useState } from 'react';
import { useQuery } from '@tanstack/react-query';
import { ChevronLeft, ChevronRight, Users } from 'lucide-react';
import { fetchMachineUsers } from '../services/machine.service';
import { Skeleton, EmptyState } from '../../../design-system/components';

const PAGE_SIZE = 50;

interface RawUserTableProps {
  machineCode: string;
}

export function RawUserTable({ machineCode }: RawUserTableProps) {
  const [page, setPage] = useState(1);

  const { data, isLoading, isError } = useQuery({
    queryKey: ['estate-machine-users', machineCode, page],
    queryFn: () => fetchMachineUsers(machineCode, page, PAGE_SIZE),
  });

  const totalPages = data ? Math.ceil(data.total / PAGE_SIZE) : 0;

  if (isError) {
    return (
      <div style={{ padding: 16 }}>
        <div className="rb-error" style={{ fontSize: 12 }}>
          Gagal memuat data user.
        </div>
      </div>
    );
  }

  if (!isLoading && (!data || data.data.length === 0)) {
    return (
      <div style={{ padding: 16 }}>
        <EmptyState title="Tidak ada user" message="Tidak ada user terdaftar di mesin ini." />
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, flex: 1, overflow: 'hidden' }}>
      <div style={{ fontSize: 11, color: 'var(--rb-text-muted)', display: 'flex', alignItems: 'center', gap: 4 }}>
        <Users size={12} />
        {data ? `${data.total} user terdaftar` : 'Memuat…'}
      </div>

      <div style={{ flex: 1, overflow: 'auto', borderRadius: 'var(--rb-radius-md)', border: '1px solid var(--rb-border-subtle)' }}>
        <table className="rb-matrix" style={{ width: '100%', fontSize: 12 }}>
          <thead>
            <tr>
              <th>Raw ID</th>
              <th>Nama</th>
              <th>Privilege</th>
              <th>Card No</th>
            </tr>
          </thead>
          <tbody>
            {isLoading
              ? Array.from({ length: PAGE_SIZE }).map((_, i) => (
                  <tr key={i}>
                    <td><Skeleton height={14} /></td>
                    <td><Skeleton height={14} /></td>
                    <td><Skeleton height={14} /></td>
                    <td><Skeleton height={14} /></td>
                  </tr>
                ))
              : data?.data.map((user) => (
                  <tr key={user.rawUserId}>
                    <td style={{ fontFamily: 'var(--rb-font-mono)', fontSize: 11 }}>{user.rawUserId}</td>
                    <td>{user.name || '—'}</td>
                    <td>
                      <span className="rb-badge" style={{ fontSize: 10 }}>{user.privilege}</span>
                    </td>
                    <td style={{ fontFamily: 'var(--rb-font-mono)', fontSize: 11 }}>{user.cardNo ?? '—'}</td>
                  </tr>
                ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12 }}>
          <span style={{ color: 'var(--rb-text-muted)' }}>
            Halaman {page} / {totalPages}
          </span>
          <div style={{ display: 'flex', gap: 4 }}>
            <button
              className="rb-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1}
            >
              <ChevronLeft size={13} />
            </button>
            <button
              className="rb-button"
              style={{ padding: '2px 8px', fontSize: 11 }}
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
            >
              <ChevronRight size={13} />
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
