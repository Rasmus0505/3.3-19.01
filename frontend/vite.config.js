import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const desktopRendererBuild = String(process.env.BOTTLE_DESKTOP_RENDERER_BUILD || "").trim() === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: desktopRendererBuild ? "./" : "/static/",
  // 本地 dev：把 /data 代理到后端，否则 cefr_vocab.json 404 会导致 CEFR 全为 SUPER（橙色）
  server: desktopRendererBuild
    ? undefined
    : {
        proxy: {
          "/data": { target: "http://127.0.0.1:8000", changeOrigin: true },
        },
      },
  // main.jsx 用 HashRouter 才能在 Electron file:// 下正常匹配路由；须与 BOTTLE_DESKTOP_RENDERER_BUILD 同步
  define: {
    "import.meta.env.VITE_DESKTOP_RENDERER_BUILD": JSON.stringify(desktopRendererBuild ? "1" : ""),
  },
});
