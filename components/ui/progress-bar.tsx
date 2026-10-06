// A bar filled to value out of max, with its label and percentage above it.
// An empty max (nothing to do yet) draws an empty bar instead of dividing by zero.
export function ProgressBar({
  value,
  max,
  label,
}: {
  value: number;
  max: number;
  label?: string;
}) {
  const filled = max > 0 ? Math.min(Math.max(value, 0), max) : 0;
  const percent = max > 0 ? Math.round((filled / max) * 100) : 0;
  return (
    <div className="flex flex-col gap-1.5">
      <div className="flex items-baseline justify-between gap-3 text-sm">
        {label && (
          <span className="text-zinc-900 dark:text-zinc-100">{label}</span>
        )}
        <span className="ml-auto text-xs text-zinc-500 tabular-nums dark:text-zinc-400">
          {percent}%
        </span>
      </div>
      <div
        role="progressbar"
        aria-label={label}
        aria-valuemin={0}
        aria-valuemax={max}
        aria-valuenow={filled}
        className="h-2 overflow-hidden rounded-full bg-zinc-200 dark:bg-zinc-800"
      >
        <div
          className="h-full rounded-full bg-amber-500 transition-[width] duration-500"
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}
