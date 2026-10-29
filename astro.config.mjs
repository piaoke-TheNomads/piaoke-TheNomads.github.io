import { defineConfig } from "astro/config";
import sitemap from "@astrojs/sitemap";

export default defineConfig({
  // 部署到别处时用 `--site` 覆盖，或改这里
  site: process.env.SITE_URL ?? "https://qmpk.pages.dev",
  build: { format: "directory" },
  compressHTML: true,
  integrations: [sitemap()],
});
