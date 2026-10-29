# 球门飘客 · GOAL FUCKER

上海科技大学「报国杯」足球队的官网。Astro 静态站，数据驱动，无后端、无跟踪、无 Cookie。

---

## 跑起来

```bash
npm install        # 首次
npm run dev        # 本地开发 http://localhost:4321
npm run build      # 产出 dist/（34 个页面）
npm run check      # 数据体检：号码/位置/赛季/荣誉一致性
npm run preview    # 预览 dist/
```

截图与上线前体检（需要先 `npm run preview` 或起一个静态服务）：

```bash
node tools/shoot.mjs http://127.0.0.1:4321/ out.png 1440 1   # 宽 1440、整页
npm run audit -- http://127.0.0.1:4321                        # 控制台报错 / alt / 死链 / 字体
```

---

## 目录

```
data/            所有内容都在这里，改 JSON 不用碰页面
  site.json      队名、城市、学校、赛事、slogan
  players.json   23 人：number / name / position / photo / joined
  honors.json    5 项荣誉
  seasons.json   4 个赛季：场次、名次、参赛队数、结果
  staff.json     队内职衔
  album.json     相册：file / w / h / caption / group
  players.todo.csv   给球队填的模板（位置/照片/加入年份）
src/
  pages/         首页、名单、球员页、赛季、荣誉、相册、关于、404
  layouts/Base.astro
  lib/data.js    读 JSON、排序、派生统计
  styles/global.css   设计系统（配色/字体/组件/响应式）
public/
  photos/        压缩后的 webp（800 / 1600 两档）
  crest/         队徽：原尺寸、256、1200×630 分享卡
  fonts/         自托管 woff2（国内不打 Google CDN）
tools/
  check-data.mjs     数据一致性
  check-players.mjs  名单字段体检
  process-images.py  原图 → webp（Pillow）
  extract-crest.py   队徽 → 圆形徽章
  make-todo-csv.mjs  生成待填模板
  shoot.mjs          截图（playwright）
  audit.mjs          上线前体检
```

---

## 改内容

**加一个球员**：往 `data/players.json` 里加一段，`number` 不能重复。

```json
{ "number": 21, "name": "张三", "position": "MF", "photo": "image10-800.webp", "joined": 2024 }
```

`position` 只能是 `GK` `DF` `MF` `FW`（或 `null`，页面会显示「位置待补」）。
`photo` 填 `public/photos/` 下的文件名，留 `null` 就显示斜纹占位。

**加荣誉**：往 `data/honors.json` 加一条，`season` 必须是 `data/seasons.json` 里已有的赛季，否则 `npm run check` 会报错。

**加照片**：跑 `python3 tools/process-images.py` 把新图压成 webp 放进 `public/photos/`，
再往 `data/album.json` 的 `items` 里加一条（`w`/`h` 填真实像素宽高，避免图片加载时页面跳动）。
相册是三列瀑布流，点开是大图，方向键翻页、Esc 关闭。手机上自动变单列大图。

**加赛季**：往 `data/seasons.json` 加一条。`played` / `rank` / `teams` 不知道就写 `null`，页面会显示 `—`，**不会编造数字**。

改完跑 `npm run check && npm run build`。

---

## 部署（Cloudflare Pages，不用备案）

```bash
npm i -g wrangler
npm run build
npx wrangler pages deploy dist --project-name qmpk
```

首次会让你登录 Cloudflare。上去之后会拿到 `qmpk.pages.dev`。

绑定自定义域名：Cloudflare Pages 项目 → Custom domains → 加 `qmpk.club`（或你自己的域名），
CNAME 指到 `qmpk.pages.dev` 即可。`.club` 域名在 Cloudflare 注册约 ¥70/年。

不想用 Cloudflare 也可以拖 `dist/` 到 Netlify Drop，或 `vercel deploy dist`。
`public/_headers` 已经配好字体与图片的一年强缓存，Cloudflare Pages 和 Netlify 都认。

---

## 上线：三条路，按你的情况挑一条

站点是纯静态的（`dist/` 里全是 HTML/CSS/图片，没有后端、没有数据库），所以能托管在任何静态托管上。
`site` 地址由 `astro.config.mjs` 里的 `SITE_URL` 环境变量决定，换托管只需要换这一个值。

### 路线 A · 国内访问最稳：有备案域名 + 国内托管

适合"要发给同学、对手、学校公众号，必须人人都能秒开"。

1. 买域名（阿里云 / 腾讯云，`.club` / `.com` 约 50–80 元/年）
2. 备案（个人备案约 2–4 周，需要身份证与人脸核验，**只能在你的账号下办**）
3. 托管选阿里云 OSS / 腾讯云 COS 的静态网站功能，或 Vercel/Netlify 绑备案域名走国内节点
4. `SITE_URL=https://你的域名 npx astro build`，再把 `dist/` 传上去

### 路线 B · 免费且不用管服务器：Cloudflare Pages 或 Netlify

- 打开 <https://pages.cloudflare.com> 或 <https://app.netlify.com>，用 GitHub 登录
- 选"导入 Git 仓库"→ 选球队仓库 → 构建命令 `npm run build`、输出目录 `dist`
- 每次 `git push` 自动重新部署
- 免费额度：带宽和请求数对球队官网来说远用不完
- 上线后拿到 `xxx.pages.dev` 或 `xxx.netlify.app`，之后可以绑自己的域名

### 路线 C · 不要额外账号：GitHub Pages

仓库里已经放好 `.github/workflows/deploy.yml`，推上去就能自动部署。

1. 在 GitHub 新建**组织的**仓库（不是个人仓库），名字必须是 `piaoke-TheNomads.github.io`
2. `git remote add origin git@github.com:piaoke-TheNomads/piaoke-TheNomads.github.io.git && git push -u origin main`
3. 仓库 Settings → Pages → Source 选 **GitHub Actions**
4. 几分钟后网址是 `https://piaoke-thenomads.github.io/`

> **仓库名为什么必须是 `<组织名>.github.io`**：这种仓库发布在域名根路径（`https://xxx.github.io/`），
> 站内所有绝对路径（`/squad/`、`/photos/...`）直接可用。如果仓库叫 `site`，网址会变成
> `https://xxx.github.io/site/`，所有绝对路径都要加 `base` 前缀才对，等于要把全站链接重写一遍。
> 想要短网址就选前者。

> 为什么建议用组织：组织账号归球队，管理员可以有好几个，谁毕业了都能交接；
> 个人仓库挂在你的账号下，你走了网站就悬着了。个人仓库也能用，只是别忘了交接。

### 我在本机验证过的三条命令

```bash
npm run build                                   # 产 dist/
npx wrangler pages deploy dist --project-name qmpk       # 路线 B（Cloudflare）
npx netlify deploy --prod --dir=dist                     # 路线 B（Netlify）
```

## 还缺什么（球队补，补齐页面自动显示）

| 字段 | 影响 | 怎么给 |
|---|---|---|
| 位置 | 名单页按位置筛、球员页显示位置 | 填 `data/players.todo.csv` 第 3 列 |
| 照片对应 | 球员头像 | 填 CSV 第 4 列 |
| 加入年份 | 球员页「队龄」 | 填 CSV 第 5 列 |
| 逐场比分 | 赛季页的胜平负与进失球（现在留空，不显示 0） | 给一张赛程表 |
| 职衔对应到人 | 关于页的 5 张卡目前只有头衔没有名字 | 告诉我谁当教练/老板 |
| 2022-23 赛事全称 | 荣誉页赛事字段留空 | 确认那年叫什么杯 |
| 现役状态 | 还有 8 人状态未确认（李可萱、刘若尘、姚立方、聂晓滨、张天龙、沈锋、周道远、赵钧正），填 `data/players.json` 的 `status` |
| 号码 | 杨思谙、黄思源两位退役球员号码未确认，`number` 为 `null`，暂不开详情页 |
| 联系方式 | 页脚现在没有邮箱/公众号入口 | 想放就填 `data/site.json` 的 `contact` |

---

## 已知取舍

- **队徽是圆形徽章裁切，不是透明底**。原图是「队徽压在虚化草皮上」的照片，背景那块深色球网和队徽藏蓝几乎同色且像素级相连，自动抠图 11 轮都去不掉。等有透明底 / 矢量源文件再换，届时只替换 `public/crest/` 里的文件即可。
- **不显示胜平负与进失球**。有截图但截图已经不在手里，编数字比留白更糟，所以 `record` 字段留 `null`，页面上明写了「需要逐场比分才能填」。
- **没有球员合影以外的照片来源**。照片墙三张是从 PPT 里挑的，球队给新照片后跑 `tools/process-images.py` 再改 `index.astro` 的引用。
- 站内保留 GOAL FUCKER，对外称呼用「球门飘客 / QMPK」。
