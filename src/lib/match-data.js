import data from "../../data/matches.json";
import { sortMatches } from "./matches.js";
export const matches = data.matches;
export const matchesList = sortMatches(matches);
