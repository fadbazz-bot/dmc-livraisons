import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import path from "path";

// Base "/dmc-livraisons/" car le site est servi sur
// https://fadbazz-bot.github.io/dmc-livraisons/ (GitHub Pages, sous-dossier).
export default defineConfig({
  plugins: [react()],
  base: "/dmc-livraisons/",
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./client/src"),
    },
  },
  root: "client",
  build: {
    outDir: "../dist",
    emptyOutDir: true,
  },
});
