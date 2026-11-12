import { defineConfig } from "vite";

export default defineConfig({
  server: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
    open: false,
    proxy: {
      "/api": "http://127.0.0.1:8787",
    },
  },
  preview: {
    host: "0.0.0.0",
    port: 43123,
    strictPort: true,
  },
});
