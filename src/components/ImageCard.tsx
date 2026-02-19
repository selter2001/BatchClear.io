import type { BackgroundMode, ImageItem } from "../lib/types";
import { BeforeAfter } from "./BeforeAfter";

interface ImageCardProps {
  image: ImageItem;
  backgroundMode: BackgroundMode;
  onRetry: (id: string) => void;
  onRemove: (id: string) => void;
}

export function ImageCard({
  image,
  backgroundMode,
  onRetry,
  onRemove,
}: ImageCardProps) {
  const afterUrl =
    backgroundMode === "transparent"
      ? image.resultUrl
      : image.resultWhiteUrl;

  return (
    <div className="animate-fade-in-up overflow-hidden rounded-xl border border-gray-200 bg-white shadow-sm dark:border-gray-700 dark:bg-gray-800">
      {/* Preview area */}
      <div className="relative">
        {image.status === "done" && afterUrl ? (
          <BeforeAfter
            beforeUrl={image.originalUrl}
            afterUrl={afterUrl}
            alt={image.name}
            showCheckerboard={backgroundMode === "transparent"}
          />
        ) : (
          <div
            className={`relative aspect-[4/3] overflow-hidden ${
              image.status === "error"
                ? "border-b-2 border-red-400"
                : ""
            }`}
          >
            <img
              src={image.originalUrl}
              alt={image.name}
              className="h-full w-full object-cover"
            />
            {/* Processing overlay */}
            {image.status === "processing" && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/20">
                <div className="h-8 w-8 animate-spin rounded-full border-3 border-white border-t-transparent" />
              </div>
            )}
          </div>
        )}
      </div>

      {/* Bottom bar */}
      <div className="flex items-center gap-2 px-3 py-2">
        {/* Filename */}
        <p className="min-w-0 flex-1 truncate text-xs font-medium text-gray-700 dark:text-gray-300">
          {image.name}
        </p>

        {/* Status badge */}
        <StatusBadge status={image.status} />

        {/* Actions */}
        {image.status === "error" && (
          <button
            type="button"
            onClick={() => onRetry(image.id)}
            className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-semibold text-blue-700 transition-colors hover:bg-blue-100 dark:bg-blue-900/30 dark:text-blue-400 dark:hover:bg-blue-900/50"
          >
            Retry
          </button>
        )}
        <button
          type="button"
          onClick={() => onRemove(image.id)}
          className="rounded-md p-1 text-gray-400 transition-colors hover:bg-gray-100 hover:text-gray-600 dark:hover:bg-gray-700 dark:hover:text-gray-300"
          aria-label={`Remove ${image.name}`}
        >
          <svg
            className="h-3.5 w-3.5"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={2}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      {/* Error message */}
      {image.status === "error" && image.error && (
        <div className="border-t border-red-100 bg-red-50 px-3 py-1.5 dark:border-red-900/30 dark:bg-red-900/20">
          <p className="truncate text-[10px] text-red-600 dark:text-red-400">
            {image.error}
          </p>
        </div>
      )}
    </div>
  );
}

// ---------------------------------------------------------------------------
// Status badge sub-component
// ---------------------------------------------------------------------------

function StatusBadge({ status }: { status: ImageItem["status"] }) {
  const config: Record<
    ImageItem["status"],
    { label: string; classes: string }
  > = {
    idle: {
      label: "Waiting",
      classes:
        "bg-gray-100 text-gray-600 dark:bg-gray-700 dark:text-gray-400",
    },
    queued: {
      label: "Queued",
      classes:
        "bg-yellow-100 text-yellow-700 dark:bg-yellow-900/30 dark:text-yellow-400",
    },
    processing: {
      label: "Processing",
      classes:
        "bg-blue-100 text-blue-700 dark:bg-blue-900/30 dark:text-blue-400",
    },
    done: {
      label: "Done",
      classes:
        "bg-green-100 text-green-700 dark:bg-green-900/30 dark:text-green-400",
    },
    error: {
      label: "Error",
      classes:
        "bg-red-100 text-red-700 dark:bg-red-900/30 dark:text-red-400",
    },
  };

  const { label, classes } = config[status];

  return (
    <span
      className={`inline-flex shrink-0 items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${classes}`}
    >
      {status === "processing" && (
        <span className="mr-1 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-blue-500" />
      )}
      {label}
    </span>
  );
}
