import { useCallback, useEffect, useState } from "react";
import { useDropzone, type FileRejection } from "react-dropzone";

const ACCEPT = {
  "image/png": [".png"],
  "image/jpeg": [".jpg", ".jpeg"],
  "image/webp": [".webp"],
  "image/heic": [".heic"],
  "image/heif": [".heif"],
};

interface DropZoneProps {
  onFilesAccepted: (files: File[]) => void;
  onFilesRejected: (rejections: FileRejection[]) => void;
  disabled: boolean;
  imageCount: number;
  compact?: boolean;
}

export function DropZone({
  onFilesAccepted,
  onFilesRejected,
  disabled,
  imageCount,
  compact = false,
}: DropZoneProps) {
  const [rejectionErrors, setRejectionErrors] = useState<string[]>([]);

  // Clear rejection errors after 5 seconds
  useEffect(() => {
    if (rejectionErrors.length === 0) return;
    const timer = setTimeout(() => setRejectionErrors([]), 5000);
    return () => clearTimeout(timer);
  }, [rejectionErrors]);

  const handleRejected = useCallback(
    (rejections: FileRejection[]) => {
      const errors = rejections.map((r) => {
        const name = r.file.name;
        const reasons = r.errors.map((e) => e.message).join(", ");
        return `${name}: ${reasons}`;
      });
      setRejectionErrors(errors);
      onFilesRejected(rejections);
    },
    [onFilesRejected],
  );

  const remaining = Math.max(0, 100 - imageCount);

  const { getRootProps, getInputProps, isDragActive } = useDropzone({
    accept: ACCEPT,
    maxFiles: remaining,
    multiple: true,
    disabled,
    onDropAccepted: onFilesAccepted,
    onDropRejected: handleRejected,
  });

  // Compact mode: smaller inline drop zone
  if (compact) {
    return (
      <div className="w-full">
        <div
          {...getRootProps()}
          className={`flex items-center justify-center gap-3 rounded-lg border-2 border-dashed px-4 py-3 transition-colors ${
            disabled
              ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50 dark:border-gray-700 dark:bg-gray-800"
              : isDragActive
                ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
                : "cursor-pointer border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
          }`}
        >
          <input {...getInputProps()} />
          {isDragActive ? (
            <p className="text-sm font-medium text-blue-600 dark:text-blue-400">
              Drop images here...
            </p>
          ) : (
            <>
              <p className="text-sm text-gray-500 dark:text-gray-400">
                Drop more images or{" "}
                <span className="font-medium text-gray-700 underline dark:text-gray-300">
                  browse
                </span>
              </p>
              <span className="text-xs text-gray-400 dark:text-gray-500">
                ({remaining} remaining)
              </span>
            </>
          )}
        </div>

        {/* Rejection errors */}
        {rejectionErrors.length > 0 && (
          <div className="mt-2 rounded-lg bg-red-50 px-4 py-2 dark:bg-red-900/20">
            {rejectionErrors.map((err, i) => (
              <p key={i} className="text-xs text-red-700 dark:text-red-400">
                {err}
              </p>
            ))}
          </div>
        )}
      </div>
    );
  }

  // Full-size mode: large centered drop zone
  return (
    <div className="w-full max-w-lg">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50 dark:border-gray-700 dark:bg-gray-800"
            : isDragActive
              ? "border-blue-500 bg-blue-50 dark:border-blue-400 dark:bg-blue-900/20"
              : "cursor-pointer border-gray-300 bg-white hover:border-gray-400 dark:border-gray-600 dark:bg-gray-800 dark:hover:border-gray-500"
        }`}
      >
        <input {...getInputProps()} />

        <svg
          className="mb-4 h-12 w-12 text-gray-400 dark:text-gray-500"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={1.5}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5"
          />
        </svg>

        {isDragActive ? (
          <p className="mb-2 text-lg font-medium text-blue-600 dark:text-blue-400">
            Drop images here...
          </p>
        ) : (
          <>
            <p className="mb-2 text-lg font-medium text-gray-700 dark:text-gray-300">
              Drop up to 100 images here
            </p>
            <p className="mb-4 text-sm text-gray-500 dark:text-gray-400">
              PNG, JPG, WebP, or HEIC
            </p>
          </>
        )}

        {!isDragActive && (
          <span className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 dark:bg-gray-100 dark:text-gray-900 dark:hover:bg-gray-200">
            Browse
          </span>
        )}
      </div>

      {/* Rejection errors */}
      {rejectionErrors.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-3 dark:bg-red-900/20">
          {rejectionErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-700 dark:text-red-400">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
