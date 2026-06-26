interface SkeletonProps {
  width?: string | number;
  height?: string | number;
  borderRadius?: string;
  className?: string;
}

export function Skeleton({ width = '100%', height = 16, borderRadius = '4px', className = '' }: SkeletonProps) {
  return (
    <div
      className={`skeleton ${className}`}
      style={{
        width: typeof width === 'number' ? `${width}px` : width,
        height: typeof height === 'number' ? `${height}px` : height,
        borderRadius,
      }}
    />
  );
}

export function SkeletonRow({ cols = 5 }: { cols?: number }) {
  return (
    <div className="skeleton-row">
      {Array.from({ length: cols }).map((_, i) => (
        <div key={i} className="skeleton skeleton-cell"></div>
      ))}
    </div>
  );
}
