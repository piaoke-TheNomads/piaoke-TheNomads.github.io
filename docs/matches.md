# 比赛记录维护

比赛数据位于 `data/matches.json` 的 `matches` 数组。现有赛季汇总保存在 `data/seasons.json`。当前没有逐场资料，正式数据为空；网站显示事实空状态，不生成示例比分。

## 录入一场比赛

可以先用 [空白 CSV 表头](./matches-template.csv) 整理资料，再将每行写为 JSON 对象。CSV 仅用于收集，不会自动导入网站。以下为填写结构，带“填写”字样的字段必须替换，不是实际赛事记录：

```json
{
  "id": "replace-with-unique-match-id",
  "season": "2025-26",
  "competition": "填写赛事名称",
  "stage": "regular",
  "opponent": "填写对手名称",
  "date": null,
  "time": null,
  "status": "scheduled",
  "score": null,
  "penalties": null,
  "venue": null,
  "originalDate": null,
  "originalTime": null,
  "note": null
}
```

- `id`：永久唯一，使用小写字母、数字和连字符，例如赛季加记录序号。改期、补比分时保留 ID。
- `season`：必须与赛季数据中的 `id` 完全一致。录入新赛季时先新增赛季对象。
- `competition`、`opponent`：真实赛事名称、对手名称。
- `stage`：`regular` 常规赛、`playoff` 季后赛、`cup` 杯赛、`friendly` 友谊赛、`other` 其他正式赛事。友谊赛不得录成 `other`。
- `date`、`time`：北京时间，分别使用 `YYYY-MM-DD`、24 小时制 `HH:mm`。未知值写 `null`，不填估算值；有时间必须有日期。
- `status`：`scheduled` 待赛、`finished` 已结束、`postponed` 延期、`cancelled` 取消。时间经过不会自动把待赛改成已结束。
- `score`：仅已结束比赛填写 `{ "for": 0, "against": 0 }`，顺序始终是本队、对手。包括加时后的比赛比分，不含点球大战。0:0 是有效比分；比分未确认时整个对象写 `null`。
- `penalties`：仅点球决胜时填写 `{ "for": 4, "against": 3 }`，否则 `null`。点球前的比赛比分必须是平局，点球结果必须分胜负。
- `venue`：已确认的场地名称，未知则 `null`。
- `originalDate`、`originalTime`：改期前的原定时间；未改期则均为 `null`。延期且新日期未知时清空 `date`、`time`，保留原日期。确认新时间后改回 `scheduled`。
- `note`：必要的比赛事实，例如场地变更；没有则 `null`。不要填写维护操作提示。

同赛季、赛事、阶段、对手、日期和时间完全相同的记录会被视为重复。若一天内与同一对手多赛，应录入准确时间以区分。

## 赛季状态与统计范围

每个赛季设置 `status`（`planned` / `ongoing` / `completed`）和 `matchCoverage`：

| matchCoverage | 含义 | 页面处理 |
| --- | --- | --- |
| `none` | 尚无逐场记录 | 保留官方场次与名次，显示空列表 |
| `partial` | 仅部分记录或存在未知比分 | 保留官方场次与名次，显示“已收录比赛统计” |
| `complete` | 该赛季的比赛记录完整 | 从已结束且比分完整的正式比赛派生场次，显示“赛季比赛统计” |

第一次补入历史比赛时，把对应赛季从 `none` 改为 `partial`。只有核对所有正式赛事与阶段后才能标为 `complete`。已完结赛季的 `complete` 记录不允许缺少比分、存在待赛/延期，也必须与 `played` 的官方场次一致。若原积分榜只含常规赛、补录又包含季后赛，应先核实官方汇总的统计范围并在 `note` 记清楚，不能直接覆盖成不一致的数字。

胜平负、进失球和净胜球仅使用 `finished` 且比分完整的记录。正式比赛合计排除友谊赛；常规赛、季后赛、杯赛、其他赛事和友谊赛分别列出。点球分数不计入进失球，点球决胜的赛场平局计为平局，比赛卡片另列点球结果。官方名次和荣誉不会由胜平负推算。

新赛季可设置 `played: 0`、`rank: null`、`result: null`、`status: "planned"`，不需要虚构比分或名次。

## 首页与筛选

首页每次访问时按北京时间选择下一场和最近赛果，并在页面保持打开时定期更新，返回页面也重新计算。已过准确开球时间、延期、取消以及日期未知的比赛不会成为下一场。仅有日期的比赛只在该日期之前成为下一场；当天仍保留在比赛列表，待补充开球时间。没有日期的历史赛果可以录入并参与统计，但无法被判断为“最近赛果”。

`/matches` 支持赛季、状态、阶段筛选；存在多个赛事时也支持赛事筛选。筛选条件保存在地址参数里，可分享例如 `/matches?season=2025-26&stage=regular`。赛季详情页同时展示该赛季的比赛及分阶段统计。

## 检查与发布

```sh
node tools/check-matches.mjs
node --test tools/test-matches.mjs
npm run verify
```

校验会检查重复 ID、重复比赛、未知赛季、非法日期/时间、负数或小数比分、不合理的点球记录和覆盖范围冲突。检查通过后沿仓库现有 GitHub Pages 流程发布。
