/**
 * Primitive design system components for the Estate Operations Grid.
 *
 * These are thin TypeScript wrappers around the .rb-* CSS classes.
 * Visual styles are defined in src/design-system/rebinmas/estate-operations-grid.css
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface BadgeProps {
  variant?: 'present' | 'absent' | 'sick' | 'leave' | 'manual' | 'no-data' | 'review' | 'default';
  children: React.ReactNode;
  className?: string;
}

export interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'default' | 'primary' | 'gold';
  children: React.ReactNode;
}

export interface SelectProps extends React.SelectHTMLAttributes<HTMLSelectElement> {
  children: React.ReactNode;
  label?: string;
}

export interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  className?: string;
  style?: React.CSSProperties;
}

export interface EmptyStateProps {
  title?: string;
  message?: string;
  action?: React.ReactNode;
}

export interface ErrorStateProps {
  title?: string;
  message?: string;
  onRetry?: () => void;
  onReset?: () => void;
}

export interface SegmentedControlProps<T extends string> {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel?: string;
}

// ─── Components ──────────────────────────────────────────────────────────────

import React from 'react';

export function Badge({ variant = 'default', children, className = '' }: BadgeProps) {
  const variantClass =
    variant !== 'default' ? `rb-badge--${variant}` : '';
  return (
    <span className={`rb-badge ${variantClass} ${className}`.trim()}>
      {children}
    </span>
  );
}

export function Button({
  variant = 'default',
  children,
  className = '',
  ...props
}: ButtonProps) {
  const variantClass =
    variant !== 'default' ? `rb-button--${variant}` : '';
  return (
    <button
      className={`rb-button ${variantClass} ${className}`.trim()}
      {...props}
    >
      {children}
    </button>
  );
}

export function Select({
  children,
  label,
  className = '',
  ...props
}: SelectProps) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
      {label && (
        <label
          style={{
            fontSize: 11,
            color: 'var(--rb-text-muted)',
            letterSpacing: '.04em',
          }}
        >
          {label}
        </label>
      )}
      <select className={`rb-select ${className}`.trim()} {...props}>
        {children}
      </select>
    </div>
  );
}

export function Skeleton({
  width = '100%',
  height = 20,
  className = '',
  style,
}: SkeletonProps) {
  return (
    <div
      className={`rb-skeleton ${className}`.trim()}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius: 'var(--rb-radius-sm)',
        background: 'linear-gradient(90deg, var(--rb-border-subtle) 25%, var(--rb-border) 50%, var(--rb-border-subtle) 75%)',
        backgroundSize: '200% 100%',
        animation: 'rb-skeleton-shimmer 1.5s infinite',
        ...style,
      }}
      aria-hidden="true"
    />
  );
}

export function EmptyState({
  title = 'Tidak ada data',
  message = 'Tidak ada data untuk filter ini. Coba ubah filter atau reset pencarian.',
  action,
}: EmptyStateProps) {
  return (
    <div className="rb-empty">
      <div style={{ fontSize: 20, marginBottom: 8 }}>◈</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      <div style={{ fontSize: 13, maxWidth: 360 }}>{message}</div>
      {action && <div style={{ marginTop: 16 }}>{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Gagal memuat data',
  message,
  onRetry,
  onReset,
}: ErrorStateProps) {
  return (
    <div className="rb-error">
      <div style={{ fontSize: 20, marginBottom: 8 }}>!</div>
      <div style={{ fontWeight: 600, marginBottom: 4 }}>{title}</div>
      {message && (
        <div style={{ fontSize: 13, maxWidth: 400, marginBottom: 16 }}>
          {message}
        </div>
      )}
      <div style={{ display: 'flex', gap: 8 }}>
        {onRetry && (
          <button className="rb-button rb-button--primary" onClick={onRetry}>
            Coba Lagi
          </button>
        )}
        {onReset && (
          <button className="rb-button" onClick={onReset}>
            Reset Filter
          </button>
        )}
      </div>
    </div>
  );
}

export function LoadingState({ message = 'Memuat…' }: { message?: string }) {
  return (
    <div className="rb-loading">
      <div style={{ fontSize: 20, marginBottom: 8 }}>◈</div>
      <div>{message}</div>
    </div>
  );
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: SegmentedControlProps<T>) {
  return (
    <div
      className="rb-segmented"
      role="group"
      aria-label={ariaLabel}
    >
      {options.map((opt) => (
        <button
          key={opt.value}
          aria-pressed={value === opt.value}
          onClick={() => onChange(opt.value)}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
