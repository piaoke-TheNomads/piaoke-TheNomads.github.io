// 极简 PNG 解码（仅 8bit RGBA/RGB 非隔行），够读 playwright 截图
import { inflateSync } from "node:zlib";
export const PNG = {
  decode(buf) {
    const sig = [137, 80, 78, 71, 13, 10, 26, 10];
    for (let i = 0; i < 8; i++) if (buf[i] !== sig[i]) throw new Error("not png");
    let off = 8, W = 0, H = 0, bitDepth = 0, colorType = 0;
    const idat = [];
    while (off < buf.length) {
      const len = buf.readUInt32BE(off);
      const type = buf.toString("ascii", off + 4, off + 8);
      const chunk = buf.subarray(off + 8, off + 8 + len);
      if (type === "IHDR") {
        W = chunk.readUInt32BE(0); H = chunk.readUInt32BE(4);
        bitDepth = chunk[8]; colorType = chunk[9];
      } else if (type === "IDAT") idat.push(chunk);
      else if (type === "IEND") break;
      off += 12 + len;
    }
    if (bitDepth !== 8) throw new Error("bitDepth " + bitDepth);
    const bpp = colorType === 6 ? 4 : colorType === 2 ? 3 : colorType === 0 ? 1 : 0;
    if (!bpp) throw new Error("colorType " + colorType);
    const raw = inflateSync(Buffer.concat(idat));
    const stride = W * bpp;
    const out = Buffer.alloc(H * stride);
    let pos = 0;
    for (let y = 0; y < H; y++) {
      const ft = raw[pos++];
      const line = raw.subarray(pos, pos + stride); pos += stride;
      const cur = out.subarray(y * stride, (y + 1) * stride);
      const prev = y > 0 ? out.subarray((y - 1) * stride, y * stride) : null;
      for (let i = 0; i < stride; i++) {
        const a = i >= bpp ? cur[i - bpp] : 0;
        const b = prev ? prev[i] : 0;
        const c = prev && i >= bpp ? prev[i - bpp] : 0;
        let v = line[i];
        if (ft === 1) v += a;
        else if (ft === 2) v += b;
        else if (ft === 3) v += (a + b) >> 1;
        else if (ft === 4) {
          const p = a + b - c, pa = Math.abs(p - a), pb = Math.abs(p - b), pc = Math.abs(p - c);
          v += pa <= pb && pa <= pc ? a : pb <= pc ? b : c;
        }
        cur[i] = v & 0xff;
      }
    }
    let data = out;
    if (bpp === 3) {
      data = Buffer.alloc(W * H * 4);
      for (let i = 0, j = 0; i < out.length; i += 3, j += 4) {
        data[j] = out[i]; data[j + 1] = out[i + 1]; data[j + 2] = out[i + 2]; data[j + 3] = 255;
      }
    }
    return { width: W, height: H, data };
  },
};
