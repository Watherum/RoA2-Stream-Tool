import { showScoreMode } from "./Score/Scores.mjs";
import { settings } from "./Settings.mjs";
import { players } from "./Player/Players.mjs";
import { round } from "./Round.mjs";
import { stPath } from './Globals.mjs';
import { getJson } from './File System.mjs';

const modesList = await getJson(stPath.text + "/Modes");

class BestOf {

    #currentBestOf = 3;
    #bestOfSelectEl = document.getElementById("bestOfSelect");

    constructor() {

        for (let i = 0; i < modesList.length; i++) {
            const option = document.createElement('option');
            option.value = modesList[i].value;
            option.innerHTML = modesList[i].name;
            option.style.backgroundColor = "var(--bg5)";
            this.#bestOfSelectEl.appendChild(option);
        }

        // default to Bo3
        const bo3Index = modesList.findIndex(m => m.value == 3);
        if (bo3Index !== -1) this.#bestOfSelectEl.selectedIndex = bo3Index;

        this.#bestOfSelectEl.addEventListener("change", () => {
            const selected = modesList[this.#bestOfSelectEl.selectedIndex];
            this.#changeBestOf(selected.value);
        });

        document.getElementById("abbreviateRound").addEventListener("click", () => {
            if (this.#currentBestOf == "wl") {
                const abbr = settings.isAbbreviateRoundChecked();
                players[0].setName(abbr ? "W" : "Wins");
                players[1].setName(abbr ? "L" : "Losses");
            }
        });

    }

    getBo() {
        return this.#currentBestOf;
    }
    getBoLabel() {
        if (this.#currentBestOf === "crew") return "Crew Battle";
        if (this.#currentBestOf === "wl") return "Wins/Losses";
        return modesList.find(m => m.value == this.#currentBestOf)?.name ?? `Best of ${this.#currentBestOf}`;
    }
    setBo(value, updateSelect = true) {
        this.#changeBestOf(value, updateSelect);
    }
    /** Re-applies whatever the bestOf dropdown currently shows. Used when returning from crew/wl gamemode. */
    resync() {
        const selected = modesList[this.#bestOfSelectEl.selectedIndex];
        if (selected) this.#changeBestOf(selected.value);
    }

    #changeBestOf(value, updateSelect = true) {

        if (this.#currentBestOf == "wl") this.#clearWlNames();

        if (updateSelect) {
            const idx = modesList.findIndex(m => m.value == value);
            if (idx !== -1) this.#bestOfSelectEl.selectedIndex = idx;
        }

        if (value == 1) {

            this.#currentBestOf = 1;
            showScoreMode(1);

        } else if (value == 3) {

            this.#currentBestOf = 3;
            showScoreMode(3);

        } else if (value == "X") {

            this.#currentBestOf = "X";
            showScoreMode("X");
            round.setNone();

        } else if (value == "ft5") {

            this.#currentBestOf = "ft5";
            showScoreMode("ft5");
            round.setNone();

        } else if (value == "ft10") {

            this.#currentBestOf = "ft10";
            showScoreMode("ft10");
            round.setNone();

        } else if (value == "ftX") {

            this.#currentBestOf = "ftX";
            showScoreMode("ftX");
            round.setNone();

        } else if (value == "crew") {

            this.#currentBestOf = "crew";
            showScoreMode("X");
            round.setNone();

        } else if (value == "wl") {

            this.#currentBestOf = "wl";
            showScoreMode("wl");
            round.setNone();
            const abbr = settings.isAbbreviateRoundChecked();
            players[0].setName(abbr ? "W" : "Wins");
            players[1].setName(abbr ? "L" : "Losses");

        } else if (value == 5) {

            this.#currentBestOf = 5;
            showScoreMode(5);

        }

    }

    #clearWlNames() {
        players[0].setName("");
        players[1].setName("");
        round.setWinnersRound();
    }

}

export const bestOf = new BestOf;
