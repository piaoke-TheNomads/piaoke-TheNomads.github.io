import site from "../../data/site.json";
import honors from "../../data/honors.json";
import seasons from "../../data/seasons.json";
import staff from "../../data/staff.json";
import players from "../../data/players.json";
import album from "../../data/album.json";

export { site, honors, seasons, staff, players, album };

/** 位置代码 → 中文。三人以上共用的宽泛位置（FB/LB/RB）单独标注。 */
export const POSITION_LABEL = {
  GK: "门将",
  CB: "中后卫",
  LB: "左后卫",
  RB: "右后卫",
  FB: "边后卫",
  DM: "后腰",
  CM: "中前卫",
  AM: "前腰",
  LM: "左边前卫",
  RM: "右边前卫",
  ST: "中锋",
};

export const STATUS_LABEL = {
  active: "现役",
  retired: "退役",
};

/** 有号码的按号码升序；没号码的排到最后 */
const byNumber = (a, b) => {
  const an = a.number ?? Number.MAX_SAFE_INTEGER;
  const bn = b.number ?? Number.MAX_SAFE_INTEGER;
  return an - bn || a.name.localeCompare(b.name, "zh");
};

export const roster = [...players.players].sort(byNumber);

/** 分三组：现役、退役、待确认。组内保持号码顺序。 */
export const activeRoster = roster.filter((p) => p.status === "active");
export const retiredRoster = roster.filter((p) => p.status === "retired");
export const pendingRoster = roster.filter((p) => !p.status);

/** 详情页只给有号码的人开，没号码没法做 /squad/<num> 的地址 */
export const rosterWithNumber = roster.filter((p) => p.number != null);

export const honorsList = [...honors.honors].sort((a, b) =>
  b.season.localeCompare(a.season)
);

export const seasonsList = [...seasons.seasons].sort((a, b) =>
  b.id.localeCompare(a.id)
);

export const staffList = staff.staff;

/** 拿过冠军的赛季，队徽上的星星就按这个数 */
export const championSeasons = [
  ...new Set(honorsList.filter((h) => h.kind === "champion").map((h) => h.season)),
].sort();

const labelOf = (code) => POSITION_LABEL[code] ?? code;

/** 位置的中文显示；一个人多个位置时用「 / 」连起来，没填就返回 null */
export const positionOf = (p) => {
  if (p.positions?.length) return p.positions.map(labelOf).join(" / ");
  if (p.position) return labelOf(p.position);
  return null;
};

export const statusOf = (p) => (p.status ? STATUS_LABEL[p.status] ?? p.status : null);

export const photoUrl = (p) => (p.photo ? `/photos/${p.photo}` : null);

/** 没了号码的人也要有稳定地址，详情页用名字做锚点 */
export const playerHref = (p) =>
  p.number != null ? `/squad/${p.number}` : `/squad/name/${encodeURIComponent(p.name)}`;

export const displayNumber = (p) => (p.number != null ? String(p.number) : "—");

export const stats = {
  players: roster.length,
  active: activeRoster.length,
  retired: retiredRoster.length,
  seasons: seasonsList.length,
  stars: championSeasons.length,
  est: site.est,
};

export const albumItems = album.items;

export const nav = [
  { href: "/", label: "首页", key: "home" },
  { href: "/squad", label: "名单", key: "squad" },
  { href: "/seasons", label: "赛季", key: "seasons" },
  { href: "/honors", label: "荣誉", key: "honors" },
  { href: "/photos", label: "相册", key: "photos" },
  { href: "/tactics", label: "战术板", key: "tactics" },
  { href: "/about", label: "关于", key: "about" },
];
