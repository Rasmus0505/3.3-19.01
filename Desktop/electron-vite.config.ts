import { resolve, dirname } from "path";
import { fileURLToPath } from "url";
import { defineConfig, externalizeDepsPlugin } from "electron-vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "tailwindcss";
import autoprefixer from "autoprefixer";

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin({ exclude: ["electron-log", "electron-updater"] })],
    build: {
      outDir: "out/main",
      rollupOptions: {
        input: {
          main: resolve(__dirname, "electron/main.ts"),
        },
        external: ["fsevents"],
      },
    },
  },
  preload: {
    plugins: [externalizeDepsPlugin({ exclude: [] })],
    build: {
      outDir: "out/preload",
      rollupOptions: {
        input: {
          preload: resolve(__dirname, "electron/preload.ts"),
        },
        external: ["fsevents"],
      },
    },
  },
  renderer: {
    root: ".",
    server: {
      proxy: {
        "/api": {
          target: "http://localhost:8000",
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: "out/renderer",
      rollupOptions: {
        input: {
          index: resolve(__dirname, "index.html"),
        },
      },
    },
    plugins: [react()],
    css: {
      postcss: {
        plugins: [tailwindcss, autoprefixer],
      },
    },
  },
});
