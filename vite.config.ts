import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  publicDir: "demosite",
  server: {
    proxy: {
      "/api": "http://127.0.0.1:4317",
      "/generated": "http://127.0.0.1:4317"
    }
  }
});
