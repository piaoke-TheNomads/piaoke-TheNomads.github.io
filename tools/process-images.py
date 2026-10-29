#!/usr/bin/env python3
"""
把 assets/raw 里的原图压成站点能用的 webp。
用法：python3 tools/process-images.py
输出：public/photos/<name>-<width>.webp
"""
import os
from PIL import Image

RAW = "assets/raw"
OUT = "public/photos"
WIDTHS = (800, 1600)
QUALITY = 82
# 小图不要放大
MIN_UPSCALE = 1600

os.makedirs(OUT, exist_ok=True)

total_in = 0
total_out = 0
rows = []

for fn in sorted(os.listdir(RAW)):
    src = os.path.join(RAW, fn)
    if not fn.lower().endswith((".jpg", ".jpeg", ".png", ".webp")):
        continue
    in_size = os.path.getsize(src)
    total_in += in_size
    stem = os.path.splitext(fn)[0]

    im = Image.open(src)
    has_alpha = im.mode in ("RGBA", "LA") or (
        im.mode == "P" and "transparency" in im.info
    )
    im = im.convert("RGBA" if has_alpha else "RGB")

    made = []
    for w in WIDTHS:
        if im.width < w and len(made) >= 1:
            break
        h = round(im.height * w / im.width)
        r = im.resize((w, h), Image.LANCZOS)
        dst = os.path.join(OUT, f"{stem}-{w}.webp")
        r.save(dst, "WEBP", quality=QUALITY, method=6)
        made.append((os.path.basename(dst), os.path.getsize(dst)))
        total_out += os.path.getsize(dst)

    biggest = max(s for _, s in made)
    rows.append((fn, in_size, len(made), biggest))

print(f"{'原图':16s} {'原大小':>8s}  输出 webp 份数  最大一份")
print("-" * 56)
for fn, in_size, n, big in rows:
    print(f"{fn:16s} {in_size/1024:7.0f}K  {n:^12d} {big/1024:8.0f}K")

print("-" * 56)
print(f"原图合计 {total_in/1024/1024:.2f} MB  →  产物合计 {total_out/1024/1024:.2f} MB")
print(f"压缩比 {total_in/total_out:.1f}×")
