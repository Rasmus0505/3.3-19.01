import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

const desktopRendererBuild = String(process.env.BOTTLE_DESKTOP_RENDERER_BUILD || "").trim() === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: desktopRendererBuild ? "./" : "/static/",
  // main.jsx 用 HashRouter 才能在 Electron file:// 下正常匹配路由；须与 BOTTLE_DESKTOP_RENDERER_BUILD 同步
  define: {
    "import.meta.env.VITE_DESKTOP_RENDERER_BUILD": JSON.stringify(desktopRendererBuild ? "1" : ""),
  },
  resolve: {
    alias: {
      "@app": path.resolve(__dirname, "../app/frontend/src"),
    },
  },
});
