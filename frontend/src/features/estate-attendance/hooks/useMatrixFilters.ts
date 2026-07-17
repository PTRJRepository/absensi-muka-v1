/**
 * URL-driven filter state hook for the attendance matrix.
 * Reads/writes filter values from URL search params.
 */
import { useSearchParams } from 'react-router-dom';
import { useEffect, useRef, useState } from 'react';
import type { AttendanceSourceMode, AttendanceUiStatus, MappingStatus } from '../types/attendance-ui.types';

export interface FilterState {
  mode: AttendanceSourceMode;
  year: number;
  month: number;
  divisionCode: string;
  machineCode: string;
  status: string;
  mapping: string;
  search: string;
  page: number;
  pageSize: number;
}

const DEFAULT_STATE: FilterState = {
  mode: 'database',
  year: new Date().getFullYear(),
  month: new Date().getMonth() + 1,
  divisionCode: '',
  machineCode: '',
  status: '',
  mapping: '',
  search: '',
  page: 1,
  pageSize: 50,
};

export function useMatrixFilters() {
  const [searchParams, setSearchParams] = useSearchParams();

  const mode = (searchParams.get('mode') as AttendanceSourceMode) || DEFAULT_STATE.mode;
  const year = parseInt(searchParams.get('year') ?? '', 10) || DEFAULT_STATE.year;
  const month = parseInt(searchParams.get('month') ?? '', 10) || DEFAULT_STATE.month;
  const divisionCode = searchParams.get('division') || DEFAULT_STATE.divisionCode;
  const machineCode = searchParams.get('machine') || DEFAULT_STATE.machineCode;
  const status = searchParams.get('status') || DEFAULT_STATE.status;
  const mapping = searchParams.get('mapping') || DEFAULT_STATE.mapping;
  const search = searchParams.get('search') || DEFAULT_STATE.search;
  const page = parseInt(searchParams.get('page') ?? '', 10) || DEFAULT_STATE.page;
  const pageSize = parseInt(searchParams.get('pageSize') ?? '', 10) || DEFAULT_STATE.pageSize;

  /** Reset page to 1 whenever a filter changes */
  function resetPage() {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', '1');
      return next;
    });
  }

  function setMode(value: AttendanceSourceMode) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('mode', value);
      // Clear machine filter when switching to Parsed mode
      if (value === 'database') {
        next.delete('machine');
      }
      next.set('page', '1');
      return next;
    });
  }

  function setYear(value: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('year', String(value));
      next.set('page', '1');
      return next;
    });
  }

  function setMonth(value: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('month', String(value));
      next.set('page', '1');
      return next;
    });
  }

  function setDivision(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('division', value);
      else next.delete('division');
      next.set('page', '1');
      return next;
    });
  }

  function setMachine(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('machine', value);
      else next.delete('machine');
      next.set('page', '1');
      return next;
    });
  }

  function setStatus(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('status', value);
      else next.delete('status');
      next.set('page', '1');
      return next;
    });
  }

  function setMapping(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('mapping', value);
      else next.delete('mapping');
      next.set('page', '1');
      return next;
    });
  }

  function setPage(value: number) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('page', String(value));
      return next;
    });
  }

  /** Debounced search setter */
  function setSearchRaw(value: string) {
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      if (value) next.set('search', value);
      else next.delete('search');
      next.set('page', '1');
      return next;
    });
  }

  const [debouncedSearch, setDebouncedSearch] = useState(search);
  const debounceRef = useRef<ReturnType<typeof setTimeout>>();

  useEffect(() => {
    debounceRef.current = setTimeout(() => {
      setDebouncedSearch(search);
    }, 300);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [search]);

  /** Sync debounced search to URL */
  function setSearch(value: string) {
    setSearchRaw(value);
  }

  function resetFilters() {
    setSearchParams({});
  }

  function isDefault(): boolean {
    return (
      mode === DEFAULT_STATE.mode &&
      year === DEFAULT_STATE.year &&
      month === DEFAULT_STATE.month &&
      divisionCode === DEFAULT_STATE.divisionCode &&
      machineCode === DEFAULT_STATE.machineCode &&
      status === DEFAULT_STATE.status &&
      mapping === DEFAULT_STATE.mapping &&
      search === DEFAULT_STATE.search
    );
  }

  return {
    // Raw values from URL
    mode,
    year,
    month,
    divisionCode,
    machineCode,
    status,
    mapping,
    search,
    page,
    pageSize,
    // Debounced for API calls
    debouncedSearch,
    // Setters
    setMode,
    setYear,
    setMonth,
    setDivision,
    setMachine,
    setStatus,
    setMapping,
    setSearch,
    setPage,
    setSearchRaw,
    resetFilters,
    isDefault,
  };
}
