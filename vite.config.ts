import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import crossOriginIsolation from "vite-plugin-cross-origin-isolation";

export default defineConfig({
  base: "/BatchClear.io/",
  plugins: [react(), tailwindcss(), crossOriginIsolation()],
  worker: {
    format: "es",
  },
});
