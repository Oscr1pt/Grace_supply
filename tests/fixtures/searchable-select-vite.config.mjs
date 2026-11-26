import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import tailwindcss from "@tailwindcss/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const projectRoot = resolve(fileURLToPath(new URL("../..", import.meta.url)));

export default defineConfig({
  root: projectRoot,
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: { "@": resolve(projectRoot, "src") },
  },
  server: { strictPort: true },
  publicDir: false,
});
