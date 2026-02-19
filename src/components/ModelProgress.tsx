import type { DownloadProgress, ModelStatus } from "../lib/types";

interface ModelProgressProps {
  status: ModelStatus;
  progress: DownloadProgress | null;
}

export function ModelProgress({ status, progress }: ModelProgressProps) {
  if (status === "idle") return null;

  if (status === "ready") {
    return (
      <div className="flex items-center gap-2 rounded-lg bg-green-50 px-4 py-2 text-sm text-green-700">
        <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" />
        </svg>
        AI model ready
      </div>
    );
  }

  if (status === "error") {
    return (
      <div className="rounded-lg bg-red-50 px-4 py-2 text-sm text-red-700">
        Failed to load AI model. Please refresh and try again.
      </div>
    );
  }

  // status === "downloading"
  if (!progress) {
    return (
      <div className="w-full max-w-md">
        <p className="mb-2 text-sm text-gray-600">Initializing AI model...</p>
        <div className="h-2 overflow-hidden rounded-full bg-gray-200">
          <div className="h-full w-1/3 animate-pulse rounded-full bg-blue-500" />
        </div>
      </div>
    );
  }

  const loadedMB = progress.loaded / 1024 / 1024;
  const totalMB = progress.total / 1024 / 1024;
  const pct = progress.total > 0 ? (progress.loaded / progress.total) * 100 : 0;

  return (
    <div className="w-full max-w-md">
      <div className="mb-1 flex items-baseline justify-between">
        <p className="text-sm font-medium text-gray-700">
          Downloading AI model (one-time only)
        </p>
        <span className="text-xs text-gray-500">
          {loadedMB.toFixed(1)} MB / {totalMB.toFixed(1)} MB
        </span>
      </div>
      <div className="h-2 overflow-hidden rounded-full bg-gray-200">
        <div
          className="h-full rounded-full bg-blue-500 transition-[width] duration-200"
          style={{ width: `${Math.min(pct, 100)}%` }}
        />
      </div>
    </div>
  );
}
