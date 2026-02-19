import type { BackgroundMode } from "../lib/types";

interface BackgroundToggleProps {
  mode: BackgroundMode;
  onChange: (mode: BackgroundMode) => void;
}

export function BackgroundToggle({ mode, onChange }: BackgroundToggleProps) {
  return (
    <div className="inline-flex rounded-lg border border-gray-200 bg-gray-100 p-0.5 dark:border-gray-700 dark:bg-gray-800">
      <button
        type="button"
        onClick={() => onChange("transparent")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "transparent"
            ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        {/* Checkerboard icon */}
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <rect x="0" y="0" width="8" height="8" opacity="0.6" />
          <rect x="8" y="8" width="8" height="8" opacity="0.6" />
          <rect x="8" y="0" width="8" height="8" opacity="0.2" />
          <rect x="0" y="8" width="8" height="8" opacity="0.2" />
        </svg>
        Transparent
      </button>
      <button
        type="button"
        onClick={() => onChange("white")}
        className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-medium transition-colors ${
          mode === "white"
            ? "bg-white text-gray-900 shadow-sm dark:bg-gray-700 dark:text-gray-100"
            : "text-gray-500 hover:text-gray-700 dark:text-gray-400 dark:hover:text-gray-200"
        }`}
      >
        {/* Solid square icon */}
        <svg className="h-3.5 w-3.5" viewBox="0 0 16 16" fill="currentColor">
          <rect
            x="1"
            y="1"
            width="14"
            height="14"
            rx="1"
            stroke="currentColor"
            strokeWidth="1"
            fill="white"
          />
        </svg>
        White
      </button>
    </div>
  );
}
