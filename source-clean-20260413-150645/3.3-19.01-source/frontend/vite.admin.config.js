import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: "/",
  build: {
    outDir: "dist-admin",
    emptyOutDir: true,
    rollupOptions: {
      input: path.resolve(__dirname, "index.admin.html"),
    },
  },
});
