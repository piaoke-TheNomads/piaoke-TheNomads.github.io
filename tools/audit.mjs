// 上线前体检：控制台报错、图片 alt、标题层级、内链 404、字体加载。
import { chromium } from "playwright";

const base = process.argv[2] ?? "http://127.0.0.1:8130";
const pages = ["/", "/squad/", "/squad/99/", "/seasons/", "/seasons/2022-23/", "/honors/", "/photos/", "/about/"];
const browser = await chromium.launch();
let problems = 0;

for (const path of pages) {
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  const errors = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(String(e)));
  page.on("response", (r) => { if (r.status() >= 400) errors.push(`${r.status()} ${r.url()}`); });

  const res = await page.goto(base + path, { waitUntil: "networkidle" });
  await page.evaluate(() => document.fonts.ready);

  const info = await page.evaluate(() => {
    const imgs = [...document.images];
    return {
      status: document.readyState,
      title: document.title,
      h1: [...document.querySelectorAll("h1")].map((h) => h.textContent.trim()),
      imgNoAlt: imgs.filter((i) => !i.hasAttribute("alt")).map((i) => i.currentSrc || i.src),
      imgBroken: imgs.filter((i) => i.hasAttribute("src") && i.complete && i.naturalWidth === 0).map((i) => i.src),
      links: [...document.querySelectorAll("a[href^='/']")].map((a) => a.getAttribute("href")),
      height: document.body.scrollHeight,
      fontLoaded: document.fonts.size > 0,
      overflowX: document.documentElement.scrollWidth > window.innerWidth + 1,
    };
  });

  const bad = [];
  if (res.status() !== 200) bad.push(`HTTP ${res.status()}`);
  if (info.h1.length !== 1) bad.push(`h1 数量 ${info.h1.length}`);
  if (info.imgNoAlt.length) bad.push(`缺 alt：${info.imgNoAlt.join(", ")}`);
  if (info.imgBroken.length) bad.push(`图裂：${info.imgBroken.join(", ")}`);
  if (!info.fontLoaded) bad.push("字体未注册");
  if (info.overflowX) bad.push("横向溢出");
  if (errors.length) bad.push(`控制台：${errors.slice(0, 3).join(" | ")}`);

  const line = `${path.padEnd(20)} ${bad.length ? "✗ " + bad.join("；") : "✓"}  ${info.title}`;
  console.log(line);
  if (bad.length) problems++;
  await page.close();
}

// 内链全查
const seen = new Set();
const page = await browser.newPage();
await page.goto(base + "/", { waitUntil: "networkidle" });
const queue = ["/"];
while (queue.length) {
  const p = queue.pop();
  if (seen.has(p)) continue;
  seen.add(p);
  const r = await page.goto(base + p, { waitUntil: "domcontentloaded" });
  if (r.status() >= 400) { console.log(`✗ 死链 ${p} → ${r.status()}`); problems++; }
  const hrefs = await page.evaluate(() =>
    [...document.querySelectorAll("a[href]")].map((a) => a.getAttribute("href"))
  );
  for (const h of hrefs) {
    if (h.startsWith("/") && !h.startsWith("//") && !seen.has(h)) queue.push(h);
  }
}
console.log(`\n共检查 ${seen.size} 个内链，${problems === 0 ? "✅ 全部通过" : `❌ ${problems} 个页面有问题`}`);
await browser.close();
process.exit(problems === 0 ? 0 : 1);
