import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFile, mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

// Real-browser export checks; no development server or additional packages needed.
const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const output = await mkdtemp(join(tmpdir(), "qmpk-tactics-image-"));
const server = createServer(async (request, response) => {
  try {
    const path = new URL(request.url, "http://localhost").pathname;
    if (path === "/") {
      response.setHeader("Content-Type", "text/html; charset=utf-8");
      response.end('<!doctype html><html lang="zh-CN"><head><link rel="stylesheet" href="/fonts/fonts.css"></head><body></body></html>');
    } else if (path === "/image.js") {
      response.setHeader("Content-Type", "text/javascript; charset=utf-8");
      response.end(await readFile(join(root, "src/lib/tactics-image.js")));
    } else if (/^\/fonts\/[a-zA-Z0-9.-]+$/.test(path)) {
      response.setHeader("Content-Type", path.endsWith(".css") ? "text/css" : "font/woff2");
      response.end(await readFile(join(root, "public", path)));
    } else {
      response.writeHead(404).end();
    }
  } catch {
    response.writeHead(500).end();
  }
});
await new Promise((resolveServer) => server.listen(0, "127.0.0.1", resolveServer));
const browser = await chromium.launch();

try {
  const page = await browser.newPage();
  await page.goto(`http://127.0.0.1:${server.address().port}`);
  const result = await page.evaluate(async () => {
    const { createTacticsImage } = await import("/image.js");
    const players = [
      { id: "gk", number: 87, name: "王明宇" },
      { id: "d1", number: 10, name: "李品卓" },
      { id: "d2", number: 6, name: "李嘉轩" },
      { id: "d3", number: 77, name: "董昊宇" },
      { id: "m1", number: 22, name: "段卓" },
      { id: "m2", number: 88, name: "汪铭锋" },
      { id: "f1", number: 9, name: "龚谦益" },
      { id: "f2", number: 11, name: "黄孔昌浩" },
    ];
    const plan = {
      id: "test", name: "首发 · 3-2-2", formation: "3-2-2",
      placements: [
        { playerId: "gk", x: 8, y: 50 },
        { playerId: "d1", x: 26, y: 18 },
        { playerId: "d2", x: 26, y: 50 },
        { playerId: "d3", x: 26, y: 82 },
        { playerId: "m1", x: 52, y: 32 },
        { playerId: "m2", x: 52, y: 68 },
        { playerId: "f1", x: 76, y: 32 },
        { playerId: "f2", x: 76, y: 68 },
      ],
    };
    async function encode(testPlan, testPlayers) {
      const { blob, width, height } = await createTacticsImage(testPlan, testPlayers);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const paper = [...ctx.getImageData(0, 0, 1, 1).data];
      const pitch = [...ctx.getImageData(200, 600, 1, 1).data];
      const url = await new Promise((resolveData) => {
        const reader = new FileReader();
        reader.onload = () => resolveData(reader.result);
        reader.readAsDataURL(blob);
      });
      return { width, height, decodedWidth: bitmap.width, decodedHeight: bitmap.height, type: blob.type, paper, pitch, base64: url.split(",")[1] };
    }
    const normal = await encode(plan, players);
    const edges = await encode({
      ...plan,
      name: "决赛首发与定位球防守安排，左右两侧协防及前场压迫站位".repeat(3),
      placements: [
        { playerId: "gk", x: 0, y: 0 },
        { playerId: "d1", x: 100, y: 0 },
        { playerId: "d2", x: 0, y: 100 },
        { playerId: "d3", x: 100, y: 100 },
      ],
    }, players.map((player) => ({ ...player, name: "阿卜杜热依木·长姓名队员" })));
    const failures = [];
    for (const placements of [
      [{ playerId: "missing", x: 50, y: 50 }],
      [{ playerId: "gk", x: NaN, y: 50 }],
      [plan.placements[0], plan.placements[0]],
      [...plan.placements, plan.placements[0]],
    ]) {
      try { await createTacticsImage({ ...plan, placements }, players); failures.push(null); }
      catch (error) { failures.push(error.message); }
    }
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
    let nullBlobError;
    try { await createTacticsImage(plan, players); }
    catch (error) { nullBlobError = error.message; }
    finally { HTMLCanvasElement.prototype.toBlob = original; }
    return { normal, edges, failures, nullBlobError };
  });
  for (const [name, image] of Object.entries({ normal: result.normal, edges: result.edges })) {
    assert.equal(image.width, 1800);
    assert.equal(image.decodedWidth, image.width);
    assert.equal(image.decodedHeight, image.height);
    assert.equal(image.type, "image/png");
    assert.deepEqual(image.paper, [250, 248, 244, 255]);
    assert.ok(image.pitch[1] > image.pitch[0] && image.pitch[1] > image.pitch[2], "pitch should be green");
    const png = Buffer.from(image.base64, "base64");
    assert.equal(png.subarray(1, 4).toString(), "PNG");
    assert.equal(png.readUInt32BE(16), image.width);
    assert.equal(png.readUInt32BE(20), image.height);
    await writeFile(join(output, `${name}.png`), png);
    console.log(`PASS ${name}: ${image.width} × ${image.height} PNG`);
  }
  assert.ok(result.edges.height > result.normal.height, "long titles need more header space");
  assert.ok(result.failures.every((message) => typeof message === "string" && message.includes("阵容")));
  assert.match(result.nullBlobError, /图片生成失败/);
  console.log("PASS invalid players, invalid coordinates, duplicate players, more than eight players, null PNG result");
  console.log(`Visual previews: ${output}`);
} finally {
  await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}
