import { useQuery } from '@tanstack/react-query';
import { fetchMappingQueue } from '../services/mapping.service';
import { LoadingState, EmptyState, ErrorState, Badge } from '../../../design-system/components';
import type { MappingRecord } from '../types/mapping.types';

interface MappingTableProps {
  statusFilter?: string;
  machineFilter?: string;
  onAction?: (record: MappingRecord) => void;
}

function statusVariant(status: string): 'present' | 'review' | 'absent' | 'default' {
  if (status === 'MAPPED') return 'present';
  if (status === 'NEED_REVIEW') return 'review';
  if (status === 'UNMAPPED') return 'absent';
  return 'default';
}

export function MappingTable({ statusFilter = 'NEED_REVIEW', machineFilter, onAction }: MappingTableProps) {
  const { data, isLoading, isError, error } = useQuery({
    queryKey: ['mapping-queue', statusFilter, machineFilter],
    queryFn: () => fetchMappingQueue({ status: statusFilter, machine: machineFilter }),
  });

  const records = data?.data ?? [];

  if (isLoading) return <LoadingState />;
  if (isError) return <ErrorState message={(error as Error)?.message} />;
  if (records.length === 0) return <EmptyState title="Tidak ada data" message={`Tidak ada record dengan status ${statusFilter}`} />;

  return (
    <div className="rb-panel" style={{ overflow: 'auto' }}>
      <table className="rb-matrix" style={{ width: '100%' }}>
        <thead>
          <tr>
            <th style={{ textAlign: 'left' }}>Raw ID</th>
            <th style={{ textAlign: 'left' }}>Nama Mesin</th>
            <th style={{ textAlign: 'left' }}>Parsed Code</th>
            <th style={{ textAlign: 'left' }}>Current Code</th>
            <th style={{ textAlign: 'left' }}>Status</th>
            <th style={{ textAlign: 'left' }}>Alasan</th>
            <th style={{ textAlign: 'left' }}>Aksi</th>
          </tr>
        </thead>
        <tbody>
          {records.map((record) => (
            <tr key={`${record.machineCode}-${record.rawDeviceUserId}`}>
              <td style={{ textAlign: 'left', fontFamily: 'var(--rb-font-mono)' }}>{record.rawDeviceUserId}</td>
              <td style={{ textAlign: 'left' }}>{record.machineCode}</td>
              <td style={{ textAlign: 'left', fontFamily: 'var(--rb-font-mono)' }}>{record.parsedEmployeeCode ?? '—'}</td>
              <td style={{ textAlign: 'left', fontFamily: 'var(--rb-font-mono)' }}>{record.currentEmployeeCode ?? '—'}</td>
              <td>
                <Badge variant={statusVariant(record.mappingStatus)}>
                  {record.mappingStatus}
                </Badge>
              </td>
              <td style={{ textAlign: 'left', fontSize: 11, color: 'var(--rb-text-muted)' }}>
                {record.reason ?? '—'}
              </td>
              <td>
                <div style={{ display: 'flex', gap: 4 }}>
                  <button
                    className="rb-button"
                    style={{ fontSize: 11, padding: '4px 8px', minHeight: 28 }}
                    onClick={() => onAction?.({ ...record, mappingStatus: 'MAPPED' } as MappingRecord)}
                  >
                    Accept
                  </button>
                  <button
                    className="rb-button"
                    style={{ fontSize: 11, padding: '4px 8px', minHeight: 28 }}
                    onClick={() => onAction?.({ ...record } as MappingRecord)}
                  >
                    Manual
                  </button>
                </div>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
