import site from "../../data/site.json";
import honors from "../../data/honors.json";
import seasons from "../../data/seasons.json";
import staff from "../../data/staff.json";
import players from "../../data/players.json";
import album from "../../data/album.json";

export { site, honors, seasons, staff, players, album };

export const POSITION_LABEL = {
  GK: "门将",
  DF: "后卫",
  MF: "中场",
  FW: "前锋",
};

export const roster = [...players.players].sort((a, b) => a.number - b.number);

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

export const positionOf = (p) => (p.position ? POSITION_LABEL[p.position] ?? p.position : null);

export const photoUrl = (p) => (p.photo ? `/photos/${p.photo}` : null);

export const stats = {
  players: roster.length,
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
  { href: "/about", label: "关于", key: "about" },
];
