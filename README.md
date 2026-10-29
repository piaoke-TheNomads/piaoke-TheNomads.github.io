# 球门飘客 · GOAL FUCKER

上海科技大学报国杯球队网站。使用 Astro 静态生成，通过 GitHub Pages 发布：
https://piaoke-thenomads.github.io/

## 开发与检查

```bash
npm ci
npm run dev                      # 本地开发，默认 http://localhost:4321
npm run verify                   # 数据校验、功能单测、正式构建
npm run preview                  # 预览 dist/
npm run audit -- http://localhost:4321
npm run test:tactics -- http://localhost:4321/tactics/
npm run test:tactics-image        # 独立验证 PNG 导出
```

`audit` 检查页面、图片、控制台和内链。`test:tactics` 使用隔离的浏览器环境检查排阵、换人、人数限制、方案保存、迁移、备份和导图。浏览器检查需要本机已安装 Playwright Chromium。

## 内容与目录

- `data/players.json`：球员稳定 ID、号码、姓名、位置及现役状态。
- `data/seasons.json`：官方赛季汇总、赛季状态及逐场数据覆盖情况。
- `data/matches.json`：逐场赛程与赛果，录入方式见 [比赛数据说明](docs/matches.md)。
- `data/site.json`、`honors.json`、`staff.json`、`album.json`：球队介绍、荣誉、职衔、相册。
- `src/pages/`：首页、名单、球员页、比赛、赛季、战术板、荣誉、相册和关于。
- `src/lib/`：数据、战术状态、导图和比赛统计。
- `public/`：自托管字体、队徽、压缩后的照片。

## 球员资料

每个球员的 `id` 创建后保持不变。修改姓名、球衣号码或位置时，不要重新生成 ID；战术方案通过 ID 识别球员。

```json
{
  "id": "p-example-new-player",
  "number": 21,
  "name": "示例球员",
  "status": "active",
  "position": "CM",
  "positions": ["CM", "DM"],
  "photo": null,
  "joined": null
}
```

示例仅用于说明字段，不加入正式名单。号码范围为 1–99，可为 `null`，有号码的球员号码不能重复。位置代码为 `GK/CB/LB/RB/FB/DM/CM/AM/LM/RM/ST`，`position` 表示主位置，`positions` 表示可兼任位置。`status` 为 `active`（现役）、`retired`（退役）或 `null`（未确认）。没有提供的资料留空。

## 战术板

- 默认按位置安排门将加 3-2-2，主位置优先于兼任位置。场上最多八人，手动站位不受球员登记位置限制。
- 拖动场内棋子调整站位或换位，替补拖到场内棋子上可换人；满员时不能再拖到空地上场。
- 支持多套方案、重命名、另存、删除撤销和阵型模板。每套方案独立保存。
- 方案只保存在当前浏览器。通过备份文件导入、导出可以换设备继续编辑；PNG 用于查看和分享，不能当作可编辑备份导入。
- 图片先生成预览，支持文件分享的浏览器可调用系统分享，否则下载或保存预览图片。
- 旧版 `qmpk-tactics-v2` 布局会迁入新版方案库，并保留迁移前的原文备份。浏览器禁止存储时会提示，仍可继续操作和导出。

## 比赛与赛季

正式比赛数据目前尚未逐场录入。页面保留已确认的历史场次、名次和荣誉，不使用示例比赛充数。

比赛数据补齐后，首页显示最近赛果和下一场，比赛页可筛选，赛季页显示逐场记录和分组统计。只有已结束且比分完整的比赛计入胜平负和进失球；点球大战另记。历史逐场数据不完整时，不覆盖官方赛季汇总。具体字段、覆盖状态、校验规则及填写模板见 [比赛数据说明](docs/matches.md)。

## 照片与荣誉

照片放在 `public/photos/`，在 `data/album.json` 中登记文件名、实际宽高、图注和分类。可使用 `tools/process-images.py` 压缩照片。球员头像通过 `photo` 字段指定文件名。

新增荣誉时，`season` 必须对应已存在的赛季。队徽目前是圆形裁切图，有透明或矢量源文件后可以替换 `public/crest/` 中的资源。

## 发布

`.github/workflows/deploy.yml` 在 `main` 更新时运行数据校验、单测及 Astro 构建，然后发布至 GitHub Pages。发布前运行 `npm run verify` 和相关浏览器检查；推送后查看对应提交的 Actions 结果。

`astro.config.mjs` 中的站点地址默认是当前 GitHub Pages 域名，部署到其他域名可通过 `SITE_URL` 覆盖。
