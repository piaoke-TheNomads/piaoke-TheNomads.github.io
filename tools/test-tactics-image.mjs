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
    async function encode(testPlan, testPlayers, ballProbe = { x: 66, y: 50 }) {
      const { blob, width, height } = await createTacticsImage(testPlan, testPlayers);
      const bitmap = await createImageBitmap(blob);
      const canvas = document.createElement("canvas");
      canvas.width = bitmap.width;
      canvas.height = bitmap.height;
      const ctx = canvas.getContext("2d");
      ctx.drawImage(bitmap, 0, 0);
      const paper = [...ctx.getImageData(0, 0, 1, 1).data];
      const pitch = [...ctx.getImageData(200, 600, 1, 1).data];
      const pitchWidth = width - 120;
      const pitchHeight = pitchWidth * 66 / 96;
      const pitchTop = height - 88 - pitchHeight;
      const sample = (x, y) => [...ctx.getImageData(Math.round(x), Math.round(y), 1, 1).data];
      const at = (x, y) => sample(60 + x / 100 * pitchWidth, pitchTop + y / 100 * pitchHeight);
      const isWhite = ([r, g, b]) => r > 225 && g > 225 && b > 225;
      const isDark = ([r, g, b]) => r < 50 && g < 50 && b < 65;
      const isGrass = ([r, g, b]) => g > r + 20 && g > b + 10;
      let passWhite = 0, passGrass = 0, ballWhite = 0, ballDark = 0;
      for (let x = 15; x <= 42; x += 0.1) {
        const pixel = at(x, 93);
        if (isWhite(pixel)) passWhite++;
        if (isGrass(pixel)) passGrass++;
      }
      const ballPoint = testPlan.ball || ballProbe;
      const ballX = 60 + ballPoint.x / 100 * pitchWidth;
      const ballY = pitchTop + ballPoint.y / 100 * pitchHeight;
      for (let dx = -20; dx <= 20; dx++) for (let dy = -20; dy <= 20; dy++) {
        const pixel = sample(ballX + dx, ballY + dy);
        if (isWhite(pixel)) ballWhite++;
        if (isDark(pixel)) ballDark++;
      }
      const marks = {
        run: at(20, 10), diagonalRun: at(72.5, 20), passWhite, passGrass,
        ballCenter: sample(ballX, ballY), ballWhite, ballDark,
        beneathPlayer: sample(60 + 0.26 * pitchWidth + 29, pitchTop + 0.5 * pitchHeight),
      };
      const url = await new Promise((resolveData) => {
        const reader = new FileReader();
        reader.onload = () => resolveData(reader.result);
        reader.readAsDataURL(blob);
      });
      return { width, height, decodedWidth: bitmap.width, decodedHeight: bitmap.height, type: blob.type, paper, pitch, marks, base64: url.split(",")[1] };
    }
    const normal = await encode(plan, players, { x: 26, y: 50 });
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
    const annotatedPlan = {
      ...plan,
      name: "跑位与传球 · 中路推进",
      annotations: [
        { id: "run-top", type: "run", from: { x: 10, y: 10 }, to: { x: 45, y: 10 } },
        { id: "run-diagonal", type: "run", from: { x: 60, y: 10 }, to: { x: 85, y: 30 } },
        { id: "run-under-player", type: "run", from: { x: 5, y: 50 }, to: { x: 95, y: 50 } },
        { id: "pass-bottom", type: "pass", from: { x: 12, y: 93 }, to: { x: 45, y: 93 } },
        { id: "pass-diagonal", type: "pass", from: { x: 55, y: 70 }, to: { x: 76, y: 52 } },
      ],
      ball: { x: 66, y: 50 },
    };
    const annotated = await encode(annotatedPlan, players);
    const ballLayer = await encode({ ...annotatedPlan, ball: { x: 26, y: 50 } }, players);
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
    const badMarkFailures = [];
    const line = annotatedPlan.annotations[0];
    for (const annotations of [
      null,
      [{ ...line, id: "" }],
      [line, line],
      [{ ...line, type: "unknown" }],
      [{ ...line, from: { x: NaN, y: 50 } }],
      [{ ...line, to: { x: 101, y: 20 } }],
      [{ ...line, to: line.from }],
      [{ ...line, from: null }],
      Array.from({ length: 41 }, (_, i) => ({ ...line, id: `line-${i}` })),
    ]) {
      try { await createTacticsImage({ ...plan, annotations }, players); badMarkFailures.push(null); }
      catch (error) { badMarkFailures.push(error.message); }
    }
    for (const ball of [{ x: Infinity, y: 50 }, { x: 50, y: -1 }, {}, []]) {
      try { await createTacticsImage({ ...plan, ball }, players); badMarkFailures.push(null); }
      catch (error) { badMarkFailures.push(error.message); }
    }
    const maximumLines = await createTacticsImage({
      ...plan, annotations: Array.from({ length: 40 }, (_, i) => ({ ...line, id: `line-${i}` })), ball: null,
    }, players);
    const original = HTMLCanvasElement.prototype.toBlob;
    HTMLCanvasElement.prototype.toBlob = (callback) => callback(null);
    let nullBlobError;
    try { await createTacticsImage(plan, players); }
    catch (error) { nullBlobError = error.message; }
    finally { HTMLCanvasElement.prototype.toBlob = original; }
    return { normal, edges, annotated, ballLayer, failures, badMarkFailures, maximumLinesBytes: maximumLines.blob.size, nullBlobError };
  });
  for (const [name, image] of Object.entries({ normal: result.normal, edges: result.edges, annotated: result.annotated, "ball-layer": result.ballLayer })) {
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
  const gold = ([r, g, b]) => r > 220 && g > 175 && b < 150;
  assert.ok(gold(result.annotated.marks.run), "run line must appear gold in the exported PNG");
  assert.ok(gold(result.annotated.marks.diagonalRun), "diagonal run must align with the field's actual aspect ratio");
  assert.ok(result.annotated.marks.passWhite > 50, "passing line must contain white dashes");
  assert.ok(result.annotated.marks.passGrass > 30, "passing line must retain visible gaps between dashes");
  assert.deepEqual(result.annotated.marks.beneathPlayer, result.normal.marks.beneathPlayer, "player tokens must remain above arrows");
  for (const image of [result.annotated, result.ballLayer]) {
    assert.ok(image.marks.ballWhite > 450 && image.marks.ballDark > 120, "football must contain a visible white shell and dark panels");
    assert.ok(image.marks.ballCenter[0] < 50 && image.marks.ballCenter[1] < 50, "football center must be a dark panel");
  }
  assert.ok(result.ballLayer.marks.ballWhite > result.normal.marks.ballWhite, "football must render above a player token");
  assert.ok(result.badMarkFailures.every((message) => typeof message === "string" && /战术|足球/.test(message)));
  assert.ok(result.maximumLinesBytes > 0, "forty valid annotations must remain exportable");
  assert.match(result.nullBlobError, /图片生成失败/);
  console.log("PASS invalid players, invalid coordinates, duplicate players, more than eight players, null PNG result");
  console.log("PASS run/pass/football pixels, diagonal alignment, player/ball layering, annotation validation, forty-line limit");
  console.log(`Visual previews: ${output}`);
} finally {
  await browser.close();
  await new Promise((resolveServer) => server.close(resolveServer));
}
