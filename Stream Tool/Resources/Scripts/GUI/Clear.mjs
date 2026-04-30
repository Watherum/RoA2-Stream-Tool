import { displayNotif } from "./Notifications.mjs";
import { clearPlayers } from "./Player/Players.mjs";
import { clearScores } from "./Score/Scores.mjs";
import { clearTeams } from "./Team/Teams.mjs";
import { round } from "./Round.mjs";

document.getElementById('clearButton').addEventListener("click", clear);

/** Resets player, score, team, and round data */
export function clear() {

    clearTeams();
    clearPlayers();
    clearScores();
    round.clear();

    displayNotif("Cleared all player data");

}