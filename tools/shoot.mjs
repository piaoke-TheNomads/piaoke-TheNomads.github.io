import { chromium } from "playwright";

const [, , url = "http://127.0.0.1:8130/", out = "/home/rimlab/.pptx-scratch/shot.png", w = "1440", full = "0"] = process.argv;
const browser = await chromium.launch();
const page = await browser.newPage({
  viewport: { width: Number(w), height: 900 },
  deviceScaleFactor: 1,
});
await page.goto(url, { waitUntil: "networkidle" });
await page.evaluate(() => document.fonts.ready);
  // 触发懒加载图片
  await page.evaluate(async () => {
    const step = window.innerHeight * 0.8;
    for (let y = 0; y < document.body.scrollHeight; y += step) {
      window.scrollTo(0, y);
      await new Promise((r) => setTimeout(r, 60));
    }
    window.scrollTo(0, 0);
  });
  await page.waitForLoadState("networkidle");
await page.waitForTimeout(400);
await page.screenshot({ path: out, fullPage: full === "1" });
console.log("shot ->", out);
await browser.close();
