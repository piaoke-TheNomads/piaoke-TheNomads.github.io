/** Match helpers are shared by build-time pages, the homepage and validation. */
export const MATCH_STATUS = Object.freeze({
  scheduled: "待赛", finished: "已结束", postponed: "延期", cancelled: "取消",
});
export const MATCH_STAGES = Object.freeze({
  regular: "常规赛", playoff: "季后赛", cup: "杯赛", friendly: "友谊赛", other: "其他赛事",
});
export const MATCH_COVERAGE = Object.freeze({ none: "尚未收录", partial: "部分记录", complete: "完整记录" });
const SCORE_KEYS = ["for", "against"];
const presentString = (value) => typeof value === "string" && value.trim().length > 0;
const wholeNumber = (value) => Number.isInteger(value) && value >= 0;

export function validDate(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const parsed = new Date(`${value}T00:00:00+08:00`);
  return Number.isFinite(parsed.getTime()) && shanghaiDate(parsed) === value;
}
export function validTime(value) {
  return typeof value === "string" && /^(?:[01]\d|2[0-3]):[0-5]\d$/.test(value);
}
export function shanghaiDate(now = new Date()) {
  const value = now instanceof Date ? now : new Date(now);
  if (!Number.isFinite(value.getTime())) return null;
  // China uses UTC+08:00 year-round; never depend on the device's local timezone.
  return new Date(value.getTime() + 8 * 60 * 60 * 1000).toISOString().slice(0, 10);
}
export function hasScore(match) {
  return !!match.score && SCORE_KEYS.every((key) => wholeNumber(match.score[key]));
}
export function kickoff(match) {
  return validDate(match.date) && validTime(match.time)
    ? Date.parse(`${match.date}T${match.time}:00+08:00`) : null;
}
export function formatMatchDate(match) {
  if (!match.date) return "日期待定";
  return `${match.date.replaceAll("-", ".")}${match.time ? ` · ${match.time}` : " · 时间待定"}`;
}
export function matchResult(match) {
  if (match.status !== "finished" || !hasScore(match)) return null;
  return match.score.for > match.score.against ? "win" : match.score.for < match.score.against ? "loss" : "draw";
}
export const RESULT_LABEL = { win: "胜", draw: "平", loss: "负" };

/** Unknown dates sort last, without making an undated result look like the latest. */
export function sortMatches(matches, order = "desc") {
  return [...matches].sort((a, b) => {
    if (!a.date && b.date) return 1;
    if (a.date && !b.date) return -1;
    const compared = `${a.date ?? ""} ${a.time ?? "00:00"}`.localeCompare(`${b.date ?? ""} ${b.time ?? "00:00"}`);
    return (order === "asc" ? compared : -compared) || a.id.localeCompare(b.id);
  });
}
export function filterMatches(matches, filters = {}) {
  return matches.filter((match) => ["season", "status", "stage", "competition"].every((key) => !filters[key] || match[key] === filters[key]));
}
export function nextMatch(matches, now = new Date()) {
  const today = shanghaiDate(now);
  const timestamp = new Date(now).getTime();
  return sortMatches(matches.filter((match) => {
    if (match.status !== "scheduled" || !validDate(match.date)) return false;
    const start = kickoff(match);
    // With no kickoff time, only future dates are certainly still upcoming.
    return start == null ? match.date > today : start >= timestamp;
  }), "asc")[0] ?? null;
}
export function latestResult(matches, now = new Date()) {
  const today = shanghaiDate(now);
  return sortMatches(matches.filter((match) => match.status === "finished" && hasScore(match)
    && validDate(match.date) && match.date <= today
    && (kickoff(match) == null || kickoff(match) <= new Date(now).getTime())))[0] ?? null;
}
export function summarizeMatches(matches) {
  const result = { played: 0, wins: 0, draws: 0, losses: 0, goalsFor: 0, goalsAgainst: 0, goalDifference: 0 };
  for (const match of matches) {
    const outcome = matchResult(match);
    if (!outcome) continue;
    result.played++;
    result[outcome === "win" ? "wins" : outcome === "draw" ? "draws" : "losses"]++;
    result.goalsFor += match.score.for;
    result.goalsAgainst += match.score.against;
  }
  result.goalDifference = result.goalsFor - result.goalsAgainst;
  return result;
}
export function seasonSummary(season, matches) {
  const records = matches.filter((match) => match.season === season.id);
  const coverage = season.matchCoverage ?? (records.length ? "partial" : "none");
  const competitive = records.filter((match) => match.stage !== "friendly");
  const totals = summarizeMatches(competitive);
  return {
    coverage, records, totals, officialPlayed: season.played ?? null,
    played: coverage === "complete" ? totals.played : season.played ?? null,
    isComplete: coverage === "complete",
    stages: Object.entries(MATCH_STAGES).filter(([key]) => records.some((match) => match.stage === key))
      .map(([key, label]) => ({ key, label, ...summarizeMatches(records.filter((match) => match.stage === key)) })),
  };
}

export function validateMatches(data, seasons) {
  const errors = [];
  if (!data || !Array.isArray(data.matches)) return ["matches 必须是数组"];
  const knownSeasons = new Map(seasons.map((season) => [season.id, season]));
  const ids = new Set();
  const fixtures = new Set();
  for (const [index, match] of data.matches.entries()) {
    const label = `matches[${index}]${match?.id ? ` (${match.id})` : ""}`;
    const error = (message) => errors.push(`${label}: ${message}`);
    if (!match || typeof match !== "object" || Array.isArray(match)) { error("必须是比赛对象"); continue; }
    if (!presentString(match.id) || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(match.id)) error("id 必须是小写字母、数字及连字符");
    if (ids.has(match.id)) error("id 重复");
    ids.add(match.id);
    if (!knownSeasons.has(match.season)) error("season 不存在");
    for (const key of ["competition", "opponent"]) if (!presentString(match[key])) error(`${key} 不能为空`);
    if (!Object.hasOwn(MATCH_STAGES, match.stage)) error("stage 无效");
    if (!Object.hasOwn(MATCH_STATUS, match.status)) error("status 无效");
    for (const key of ["date", "originalDate"]) {
      if (match[key] != null && !validDate(match[key])) error(`${key} 必须是有效的 YYYY-MM-DD 日期或 null`);
    }
    for (const [key, dateKey] of [["time", "date"], ["originalTime", "originalDate"]]) {
      if (match[key] != null && (!validTime(match[key]) || !validDate(match[dateKey]))) error(`${key} 需为 HH:mm，且必须有对应日期`);
    }
    for (const key of ["venue", "note"]) if (match[key] != null && !presentString(match[key])) error(`${key} 必须是非空文字或 null`);
    for (const key of ["score", "penalties"]) {
      if (match[key] != null && (typeof match[key] !== "object" || !SCORE_KEYS.every((name) => wholeNumber(match[key][name])))) error(`${key} 的 for、against 必须是非负整数`);
      if (match[key] != null && match.status !== "finished") error(`${key} 只能填写在已结束比赛中`);
    }
    if (match.penalties != null && (!hasScore(match) || match.score.for !== match.score.against || match.penalties.for === match.penalties.against)) error("点球需有平局比分且点球结果不能相同");
    // Same-day rematches are permitted at different times; unknown dates cannot establish duplicates.
    if (validDate(match.date)) {
      const fixture = [match.season, match.competition, match.stage, match.opponent, match.date, match.time ?? ""].join("\u0000");
      if (fixtures.has(fixture)) error("比赛记录重复（同赛季、赛事、阶段、对手、日期和时间）");
      fixtures.add(fixture);
    }
  }
  for (const season of seasons) {
    if (season.matchCoverage != null && !Object.hasOwn(MATCH_COVERAGE, season.matchCoverage)) errors.push(`${season.id}: matchCoverage 无效`);
    const records = data.matches.filter((match) => match?.season === season.id);
    if (season.matchCoverage === "none" && records.length) errors.push(`${season.id}: 已有比赛记录，应将 matchCoverage 更新为 partial 或 complete`);
    if (season.matchCoverage === "complete" && records.some((match) => match.status === "finished" && !hasScore(match))) errors.push(`${season.id}: 完整记录不能包含缺少比分的已结束比赛`);
    if (season.matchCoverage === "complete" && season.status === "completed" && records.some((match) => ["scheduled", "postponed"].includes(match.status))) errors.push(`${season.id}: 已完结且完整的赛季不能包含待赛或延期比赛`);
    if (season.matchCoverage === "complete" && season.played > 0 && !records.length) errors.push(`${season.id}: 有官方场次但无比赛记录，不能标为 complete`);
    if (season.matchCoverage === "complete" && season.status === "completed" && wholeNumber(season.played)) {
      const played = summarizeMatches(records.filter((match) => match.stage !== "friendly")).played;
      if (played !== season.played) errors.push(`${season.id}: 完整赛季的正式比赛场次 ${played} 与官方场次 ${season.played} 不一致，请核对统计范围`);
    }
  }
  return errors;
}
