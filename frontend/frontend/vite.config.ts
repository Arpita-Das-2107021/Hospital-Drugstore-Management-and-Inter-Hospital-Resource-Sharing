import { defineConfig } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";

export default defineConfig(({ mode }) => ({
  server: {
    // listen on all interfaces inside container
    host: "0.0.0.0",
    port: 8080,
    // HMR options: allow overriding via env for Windows / Docker Desktop
    hmr: {
      host: process.env.VITE_HMR_HOST || "localhost",
      clientPort: process.env.VITE_HMR_CLIENT_PORT
        ? parseInt(process.env.VITE_HMR_CLIENT_PORT, 10)
        : 8080,
    },
    watch: {
      // enable polling for Docker mounts
      usePolling: true,
      interval: 100, // optional: frequency in ms
    },
  },
  plugins: [react()],
  resolve: {
    alias: {
      "@": path.resolve(__dirname, "./src"),
    },
  },
  test: {
    environment: "jsdom",
    setupFiles: "./src/test/setup.ts",
    globals: true,
    css: true,
  },
}));