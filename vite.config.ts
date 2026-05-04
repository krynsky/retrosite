import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

const apiOrigin = process.env.RETROSITE_APP_ORIGIN || "http://127.0.0.1:4317";

export default defineConfig({
  plugins: [react()],
  publicDir: "demosite",
  server: {
    proxy: {
      "/api": apiOrigin,
      "/generated": apiOrigin
    }
  }
});
