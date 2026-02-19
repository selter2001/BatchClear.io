interface ResultViewProps {
  resultUrl: string | null;
  originalName: string;
  onReset: () => void;
}

export function ResultView({ resultUrl, originalName, onReset }: ResultViewProps) {
  if (!resultUrl) return null;

  const downloadName = originalName.replace(/\.[^.]+$/, "_nobg.png");

  return (
    <div className="flex w-full max-w-2xl flex-col items-center gap-6">
      {/* Checkerboard background to show transparency */}
      <div
        className="overflow-hidden rounded-xl border border-gray-200"
        style={{
          backgroundImage: `
            linear-gradient(45deg, #e5e7eb 25%, transparent 25%),
            linear-gradient(-45deg, #e5e7eb 25%, transparent 25%),
            linear-gradient(45deg, transparent 75%, #e5e7eb 75%),
            linear-gradient(-45deg, transparent 75%, #e5e7eb 75%)
          `,
          backgroundSize: "20px 20px",
          backgroundPosition: "0 0, 0 10px, 10px -10px, -10px 0",
        }}
      >
        <img
          src={resultUrl}
          alt="Background removed result"
          className="block max-h-[70vh] max-w-full"
        />
      </div>

      <div className="flex items-center gap-3">
        <a
          href={resultUrl}
          download={downloadName}
          className="inline-flex items-center gap-2 rounded-lg bg-gray-900 px-5 py-2.5 text-sm font-medium text-white transition-colors hover:bg-gray-700"
        >
          <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            <path strokeLinecap="round" strokeLinejoin="round" d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" />
          </svg>
          Download PNG
        </a>

        <button
          type="button"
          onClick={onReset}
          className="rounded-lg border border-gray-300 bg-white px-5 py-2.5 text-sm font-medium text-gray-700 transition-colors hover:bg-gray-50"
        >
          Process another
        </button>
      </div>
    </div>
  );
}
