export function App() {
  const isIsolated =
    typeof crossOriginIsolated !== "undefined" && crossOriginIsolated;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4">
      <h1 className="text-4xl font-bold text-gray-900">BatchClear.io</h1>
      <p className="text-lg text-gray-600">
        Browser-native background removal
      </p>
      <div className="flex items-center gap-2 text-sm">
        <span
          className={`inline-block h-3 w-3 rounded-full ${
            isIsolated ? "bg-green-500" : "bg-red-500"
          }`}
        />
        <span className="text-gray-500">
          crossOriginIsolated:{" "}
          <code className="font-mono font-semibold">
            {String(isIsolated)}
          </code>
        </span>
      </div>
    </div>
  );
}
