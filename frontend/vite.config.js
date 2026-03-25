import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

const desktopRendererBuild = String(process.env.BOTTLE_DESKTOP_RENDERER_BUILD || "").trim() === "1";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  base: desktopRendererBuild ? "./" : "/static/",
});
