/**
 * Employee search page — omnibox-style search with debounced API calls.
 */

import { useEffect, useRef, useState } from 'react';
import { AppShell } from '../components/AppShell';
import '../../../design-system/rebinmas/estate-operations-grid.css';
import { searchEmployees } from '../services/search.service';
import { EmployeeSearchResult } from '../components/EmployeeSearchResult';
import { LoadingState, EmptyState } from '../../../design-system/components';
import type { SearchResult } from '../types/parsed.types';

export function EmployeeSearchPage() {
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<SearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Focus on mount + keyboard shortcut
  useEffect(() => {
    inputRef.current?.focus();
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === '/' || (e.key === 'k' && (e.ctrlKey || e.metaKey))) {
        e.preventDefault();
        inputRef.current?.focus();
      }
    }
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

  // Debounced search
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim()) { setResults([]); return; }

    debounceRef.current = setTimeout(async () => {
      // Cancel previous request
      abortRef.current?.abort();
      abortRef.current = new AbortController();
      setIsLoading(true);
      setError(null);
      try {
        const data = await searchEmployees({ search: query.trim() }, abortRef.current.signal);
        setResults(data.data ?? []);
      } catch (e) {
        if (e instanceof Error && e.name !== 'AbortError') {
          setError(e.message);
        }
      } finally {
        setIsLoading(false);
      }
    }, 300);

    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [query]);

  return (
    <AppShell>
      <div style={{ maxWidth: 640, margin: '0 auto' }}>
        <div className="rb-title-row">
          <div>
            <h1 className="rb-title">Pencarian Karyawan</h1>
            <p className="rb-subtitle">Ketik nama, kode, NIK, raw ID, mesin, atau divisi</p>
          </div>
        </div>

        <div style={{ position: 'relative', marginBottom: 20 }}>
          <input
            ref={inputRef}
            type="text"
            className="rb-search"
            placeholder="Cari nama karyawan / ID / raw ID / mesin / divisi… (tekan / atau Ctrl+K)"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            style={{ fontSize: 16 }}
          />
        </div>

        {error && (
          <div className="rb-error" style={{ marginBottom: 16 }}>
            Gagal mencari: {error}
          </div>
        )}

        {isLoading && <LoadingState />}

        {!isLoading && query && results.length === 0 && !error && (
          <EmptyState title="Tidak ditemukan" message={`Tidak ada karyawan untuk "${query}"`} />
        )}

        {!isLoading && results.length > 0 && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div style={{ fontSize: 12, color: 'var(--rb-text-muted)', marginBottom: 4 }}>
              {results.length} hasil untuk "{query}"
            </div>
            {results.map((r) => (
              <EmployeeSearchResult key={r.identityKey} result={r} />
            ))}
          </div>
        )}
      </div>
    </AppShell>
  );
}
