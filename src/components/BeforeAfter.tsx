import { useState, useCallback } from "react";

interface BeforeAfterProps {
  beforeUrl: string;
  afterUrl: string;
  alt: string;
  showCheckerboard: boolean;
}

export function BeforeAfter({
  beforeUrl,
  afterUrl,
  alt,
  showCheckerboard,
}: BeforeAfterProps) {
  const [position, setPosition] = useState(50);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      setPosition(Number(e.target.value));
    },
    [],
  );

  return (
    <div
      className={`relative h-full w-full overflow-hidden ${showCheckerboard ? "checkerboard" : "bg-white"}`}
    >
      {/* After image (full, bottom layer) */}
      <img
        src={afterUrl}
        alt={`${alt} - after`}
        className="h-full w-full object-cover"
        decoding="async"
        draggable={false}
      />

      {/* Before image (clipped, top layer) */}
      <img
        src={beforeUrl}
        alt={`${alt} - before`}
        className="absolute inset-0 h-full w-full object-cover"
        style={{ clipPath: `inset(0 ${100 - position}% 0 0)` }}
        decoding="async"
        draggable={false}
      />

      {/* Divider line */}
      <div
        className="pointer-events-none absolute top-0 bottom-0 w-0.5 bg-white shadow-[0_0_4px_rgba(0,0,0,0.3)]"
        style={{ left: `${position}%`, transform: "translateX(-50%)" }}
      />

      {/* Handle circle */}
      <div
        className="pointer-events-none absolute top-1/2 z-10 flex h-8 w-8 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full border-2 border-white bg-white/90 shadow-md"
        style={{ left: `${position}%` }}
      >
        <svg
          className="h-4 w-4 text-gray-600"
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
          strokeWidth={2}
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            d="M8 9l4-4 4 4m0 6l-4 4-4-4"
          />
        </svg>
      </div>

      {/* Labels */}
      <span className="absolute top-2 left-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
        Before
      </span>
      <span className="absolute top-2 right-2 rounded bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white">
        After
      </span>

      {/* Invisible range input overlay */}
      <input
        type="range"
        min={0}
        max={100}
        value={position}
        onChange={handleChange}
        className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        aria-label="Before/after comparison slider"
      />
    </div>
  );
}
