import { defineConfig } from "vite";

// base "./" 讓 assets 用相對路徑，GitHub Pages 子路徑（/signal-rift-typing-demo/）下才能正確載入
export default defineConfig({
  base: "./",
});
