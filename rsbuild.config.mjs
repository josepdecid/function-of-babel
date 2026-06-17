import { defineConfig } from "@rsbuild/core";

export default defineConfig({
  source: {
    entry: {
      index: "./index.js",
    },
  },
  html: {
    template: "./index.html",
  },
  server: {
    port: 3000,
    open: false,
  },
  dev: {
    liveReload: true,
  },
});
