import { defineConfig } from "@rsbuild/core";

const isGitHubPages = process.env.GITHUB_PAGES === "true";

export default defineConfig({
  output: {
    assetPrefix: isGitHubPages ? "/function-of-babel/" : "/",
  },
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
