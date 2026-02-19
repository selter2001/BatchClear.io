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
}

export function DropZone({
  onFilesAccepted,
  onFilesRejected,
  disabled,
  imageCount,
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

  return (
    <div className="w-full max-w-lg">
      <div
        {...getRootProps()}
        className={`flex flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
          disabled
            ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50"
            : isDragActive
              ? "border-blue-500 bg-blue-50"
              : "cursor-pointer border-gray-300 bg-white hover:border-gray-400"
        }`}
      >
        <input {...getInputProps()} />

        <svg
          className="mb-4 h-12 w-12 text-gray-400"
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
          <p className="mb-2 text-lg font-medium text-blue-600">
            Drop images here...
          </p>
        ) : (
          <>
            <p className="mb-2 text-lg font-medium text-gray-700">
              Drop up to 100 images here
            </p>
            <p className="mb-4 text-sm text-gray-500">
              PNG, JPG, WebP, or HEIC
            </p>
          </>
        )}

        {!isDragActive && (
          <span className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700">
            Browse
          </span>
        )}
      </div>

      {/* Rejection errors */}
      {rejectionErrors.length > 0 && (
        <div className="mt-3 rounded-lg bg-red-50 px-4 py-3">
          {rejectionErrors.map((err, i) => (
            <p key={i} className="text-sm text-red-700">
              {err}
            </p>
          ))}
        </div>
      )}
    </div>
  );
}
