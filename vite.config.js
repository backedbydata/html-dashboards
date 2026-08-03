import { defineConfig } from "vite";

export default defineConfig({
  build: {
    rollupOptions: {
      input: "pbi-dashboard.html",
    },
  },
});