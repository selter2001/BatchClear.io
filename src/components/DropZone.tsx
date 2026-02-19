import { useCallback, useRef, useState } from "react";

const ACCEPTED_TYPES = new Set(["image/png", "image/jpeg", "image/webp"]);

interface DropZoneProps {
  onFileDrop: (file: File) => void;
  disabled: boolean;
}

export function DropZone({ onFileDrop, disabled }: DropZoneProps) {
  const [isDragOver, setIsDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const validateAndEmit = useCallback(
    (file: File | undefined) => {
      setError(null);
      if (!file) return;
      if (!ACCEPTED_TYPES.has(file.type)) {
        setError("Invalid file type. Please use PNG, JPG, or WebP.");
        return;
      }
      onFileDrop(file);
    },
    [onFileDrop],
  );

  const handleDragOver = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      if (!disabled) setIsDragOver(true);
    },
    [disabled],
  );

  const handleDragLeave = useCallback(() => {
    setIsDragOver(false);
  }, []);

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setIsDragOver(false);
      if (disabled) return;
      const file = e.dataTransfer.files[0];
      validateAndEmit(file);
    },
    [disabled, validateAndEmit],
  );

  const handleInputChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      const file = e.target.files?.[0];
      validateAndEmit(file);
      // Reset input so the same file can be re-selected
      if (inputRef.current) inputRef.current.value = "";
    },
    [validateAndEmit],
  );

  const handleBrowseClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  return (
    <div
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className={`flex w-full max-w-lg flex-col items-center justify-center rounded-xl border-2 border-dashed p-12 transition-colors ${
        disabled
          ? "cursor-not-allowed border-gray-200 bg-gray-50 opacity-50"
          : isDragOver
            ? "border-blue-500 bg-blue-50"
            : "cursor-pointer border-gray-300 bg-white hover:border-gray-400"
      }`}
    >
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

      <p className="mb-2 text-lg font-medium text-gray-700">
        Drop an image here
      </p>
      <p className="mb-4 text-sm text-gray-500">PNG, JPG, or WebP</p>

      <button
        type="button"
        onClick={handleBrowseClick}
        disabled={disabled}
        className="rounded-lg bg-gray-900 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-gray-700 disabled:opacity-50"
      >
        Browse
      </button>

      <input
        ref={inputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp"
        onChange={handleInputChange}
        className="hidden"
      />

      {error && <p className="mt-3 text-sm font-medium text-red-600">{error}</p>}
    </div>
  );
}
