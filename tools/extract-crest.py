#!/usr/bin/env python3
"""
把「队徽 + 虚化球场背景」的渲染图做成站点能用的徽章。

用法：python3 tools/extract-crest.py <输入图> [输出前缀]

为什么不是抠透明底：
  这张图右侧的背景暗网和队徽描边在颜色上几乎同色、并且实际相连，
  自动抠图会在中段留一条横向的灰色残留。试过 HSV 分色 / 连通域 /
  边缘墙 floodfill / 逐行夹逼 / 中值平滑包络，都躲不开这条粘连。
  所以改成「圆形徽章裁切」：保留一点虚化草皮作为暗角，视觉上像真徽章，
  且任何尺寸下都干净。有透明底或矢量源文件时应直接替换。

产出：
  <前缀>.png / .webp        圆形徽章 1000×1000（暗角 + 细描边）
  <前缀>-256.png / .webp    小尺寸，用于导航栏
  <前缀>-square.png/.webp   方形裁切 1200×630，用于分享卡片
"""
import sys, os
from PIL import Image, ImageDraw, ImageFilter, ImageEnhance

src = sys.argv[1] if len(sys.argv) > 1 else "assets/raw/crest-field.jpg"
out_prefix = sys.argv[2] if len(sys.argv) > 2 else "public/crest/crest"
os.makedirs(os.path.dirname(out_prefix) or ".", exist_ok=True)

im = Image.open(src).convert("RGB")
W, H = im.size

# 队徽在图里的中心与半径（按这张 1536×1024 的图量出来的）
CX, CY = 802, 496
R = 486

# 1. 正方形裁切，保证圆正好内切
side = R * 2
box = (CX - R, CY - R, CX + R, CY + R)
sq = im.crop(box).resize((1000, 1000), Image.LANCZOS)

# 2. 边缘压暗成暗角，让草皮退到背景里
vignette = Image.new("L", (1000, 1000), 0)
d = ImageDraw.Draw(vignette)
d.ellipse([40, 40, 960, 960], fill=255)
vignette = vignette.filter(ImageFilter.GaussianBlur(90))
dark = ImageEnhance.Brightness(sq).enhance(0.45)
sq = Image.composite(sq, dark, vignette)

# 3. 圆形蒙版 + 一圈细金边
mask = Image.new("L", (1000, 1000), 0)
ImageDraw.Draw(mask).ellipse([6, 6, 994, 994], fill=255)
mask = mask.filter(ImageFilter.GaussianBlur(0.6))
badge = Image.new("RGBA", (1000, 1000), (0, 0, 0, 0))
badge.paste(sq, (0, 0), mask)
ring = ImageDraw.Draw(badge)
ring.ellipse([8, 8, 992, 992], outline=(201, 162, 39, 235), width=6)

badge.save(out_prefix + ".png")
badge.save(out_prefix + ".webp", quality=92, method=6)
small = badge.resize((256, 256), Image.LANCZOS)
small.save(out_prefix + "-256.png")
small.save(out_prefix + "-256.webp", quality=92, method=6)

# 4. 分享卡片：方形裁切 + 顶部留白
og = Image.new("RGB", (1200, 630), (16, 26, 46))
og.paste(sq.resize((630, 630), Image.LANCZOS), (285, 0))
og.save(out_prefix + "-square.png")
og.save(out_prefix + "-square.webp", quality=88, method=6)

print("产出：", out_prefix, "{.png,.webp,-256,-square}")
for f in sorted(os.listdir(os.path.dirname(out_prefix) or ".")):
    p = os.path.join(os.path.dirname(out_prefix) or ".", f)
    if f.startswith(os.path.basename(out_prefix)):
        print(f"  {f:24s} {os.path.getsize(p)//1024:5d} KB")

# 预览：白底 + 深底各一份
def on(bg):
    bd = Image.new("RGB", (1060, 1060), bg)
    bd.paste(badge, (30, 30), badge)
    return bd


on((250, 248, 244)).save("/home/rimlab/.pptx-scratch/crest-check.png")
on((16, 26, 46)).save("/home/rimlab/.pptx-scratch/crest-check-dark.png")
