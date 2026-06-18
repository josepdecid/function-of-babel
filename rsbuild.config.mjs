import { defineConfig } from "@rsbuild/core";

const isGitHubPages = process.env.GITHUB_PAGES === "true";
const siteUrl = "https://josepdecid.github.io/function-of-babel";
const siteName = "Function of Babel";
const siteDescription =
  "Interactive playground for Tupper's self-referential formula — draw 106×17 patterns, encode them to a y coordinate, and scroll through infinite possibilities.";

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
    templateParameters: {
      siteUrl,
      siteName,
      siteDescription,
    },
  },
  server: {
    port: 3000,
    open: false,
  },
  dev: {
    liveReload: true,
  },
});
