/**
 * Employee search result list item component.
 */

import type { SearchResult } from '../types/parsed.types';
import { safeText } from '../utils/display';
import { Badge } from '../../../design-system/components';

interface EmployeeSearchResultProps {
  result: SearchResult;
  onClick?: (result: SearchResult) => void;
}

export function EmployeeSearchResult({ result, onClick }: EmployeeSearchResultProps) {
  return (
    <div
      className="rb-panel"
      style={{ padding: '12px 16px', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 12 }}
      onClick={() => onClick?.(result)}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => { if (e.key === 'Enter') onClick?.(result); }}
    >
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontWeight: 600 }}>{safeText(result.displayName)}</div>
        <div style={{ fontSize: 12, color: 'var(--rb-text-muted)', marginTop: 2 }}>
          {result.currentEmpCode || result.employeeCode} · {result.divisionCode}
          {result.machineCode ? ` · ${result.machineCode}` : ''}
        </div>
      </div>
      <Badge variant={result.mappingStatus === 'MAPPED' ? 'present' : 'review'}>
        {result.mappingStatus}
      </Badge>
    </div>
  );
}
