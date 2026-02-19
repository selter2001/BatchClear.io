interface BatchProgressProps {
  total: number;
  done: number;
  processing: number;
  errors: number;
}

export function BatchProgress({
  total,
  done,
  processing,
  errors,
}: BatchProgressProps) {
  if (total === 0) return null;

  const pct = Math.round((done / total) * 100);

  return (
    <div className="w-full">
      <div className="mb-2 flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-700 dark:text-gray-300">
          {done} of {total} processed
          {processing > 0 && (
            <span className="ml-1.5 text-blue-600 dark:text-blue-400">
              ({processing} in progress)
            </span>
          )}
        </p>
        {errors > 0 && (
          <p className="text-xs font-medium text-red-600 dark:text-red-400">
            {errors} failed
          </p>
        )}
      </div>
      <div className="h-2 w-full overflow-hidden rounded-full bg-gray-200 dark:bg-gray-700">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-300"
          style={{ width: `${pct}%` }}
        />
      </div>
    </div>
  );
}
