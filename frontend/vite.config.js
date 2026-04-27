import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const desktopRendererBuild = String(process.env.BOTTLE_DESKTOP_RENDERER_BUILD || "").trim() === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: desktopRendererBuild ? "./" : "/static/",
  // 本地 dev：代理到同一个本机 FastAPI 后端，保持和 start-local.bat 的默认端口一致。
  server: desktopRendererBuild
    ? undefined
    : {
        proxy: {
          "/data": { target: "http://127.0.0.1:18080", changeOrigin: true },
          "/api": { target: "http://127.0.0.1:18080", changeOrigin: true },
          "/health": { target: "http://127.0.0.1:18080", changeOrigin: true },
        },
      },
  // main.jsx 用 HashRouter 才能在 Electron file:// 下正常匹配路由；须与 BOTTLE_DESKTOP_RENDERER_BUILD 同步
  define: {
    "import.meta.env.VITE_DESKTOP_RENDERER_BUILD": JSON.stringify(desktopRendererBuild ? "1" : ""),
  },
});
