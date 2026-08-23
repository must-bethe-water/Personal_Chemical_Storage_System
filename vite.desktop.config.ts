import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "desktop",
  base: "./",
  publicDir: false,
  plugins: [react()],
  build: {
    outDir: ".ui-build",
    emptyOutDir: true,
    target: "safari16",
  },
});
