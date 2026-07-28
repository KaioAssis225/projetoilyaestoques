import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: __dirname,
  base: "/projetoilyaestoques/",
  plugins: [react()],
  build: {
    outDir: "../gh-pages-dist",
    emptyOutDir: true,
  },
});
