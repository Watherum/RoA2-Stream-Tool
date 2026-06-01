import { showScoreMode } from "./Score/Scores.mjs";
import { settings } from "./Settings.mjs";
import { players } from "./Player/Players.mjs";
import { round } from "./Round.mjs";

class BestOf {

    #currentBestOf = 3;
    #bestOfEl = document.getElementById("bestOf");
    #bestOfPrevEl = document.getElementById("bestOfPrev");

    constructor() {

        this.#bestOfEl.addEventListener("click", () => {
            this.#nextBestOf();
        });

        this.#bestOfPrevEl.addEventListener("click", () => {
            this.#prevBestOf();
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
    setBo(value) {
        this.#changeBestOf(value);
    }

    #nextBestOf() {
        if (this.#currentBestOf == 3) {
            this.setBo(5);
        } else if (this.#currentBestOf == 5) {
            this.setBo("X");
        } else if (this.#currentBestOf == "X") {
            this.setBo("ft5");
        } else if (this.#currentBestOf == "ft5") {
            this.setBo("ft10");
        } else if (this.#currentBestOf == "ft10") {
            this.setBo("ftX");
        } else if (this.#currentBestOf == "ftX") {
            this.setBo("wl");
        } else if (this.#currentBestOf == "wl") {
            this.setBo(3);
        }
    }

    #prevBestOf() {
        if (this.#currentBestOf == 3) {
            this.setBo("wl");
        } else if (this.#currentBestOf == "wl") {
            this.setBo("ftX");
        } else if (this.#currentBestOf == "ftX") {
            this.setBo("ft10");
        } else if (this.#currentBestOf == "ft10") {
            this.setBo("ft5");
        } else if (this.#currentBestOf == "ft5") {
            this.setBo("X");
        } else if (this.#currentBestOf == "X") {
            this.setBo(5);
        } else if (this.#currentBestOf == 5) {
            this.setBo(3);
        }
    }

    #changeBestOf(value) {

        if (this.#currentBestOf == "wl") this.#clearWlNames();

        if (value == 3) {

            this.#currentBestOf = 3;
            this.#bestOfEl.innerHTML = "Best of 3";
            this.#bestOfEl.title = "Click to change the scoring to Best of 5";
            showScoreMode(3);

        } else if (value == "X") {

            this.#currentBestOf = "X";
            this.#bestOfEl.innerHTML = "Best of X";
            this.#bestOfEl.title = "Click to change the scoring to First to 5";
            showScoreMode("X");

        } else if (value == "ft5") {

            this.#currentBestOf = "ft5";
            this.#bestOfEl.innerHTML = "First to 5";
            this.#bestOfEl.title = "Click to change the scoring to First to 10";
            showScoreMode("ft5");

        } else if (value == "ft10") {

            this.#currentBestOf = "ft10";
            this.#bestOfEl.innerHTML = "First to 10";
            this.#bestOfEl.title = "Click to change the scoring to First to X";
            showScoreMode("ft10");

        } else if (value == "ftX") {

            this.#currentBestOf = "ftX";
            this.#bestOfEl.innerHTML = "First to X";
            this.#bestOfEl.title = "Click to change the scoring to W/L Mode";
            showScoreMode("ftX");

        } else if (value == "wl") {

            this.#currentBestOf = "wl";
            this.#bestOfEl.innerHTML = "W/L Mode";
            this.#bestOfEl.title = "Click to change the scoring to Best of 3";
            showScoreMode("wl");
            round.setNone();
            const abbr = settings.isAbbreviateRoundChecked();
            players[0].setName(abbr ? "W" : "Wins");
            players[1].setName(abbr ? "L" : "Losses");

        } else if (value == 5) {

            this.#currentBestOf = 5;
            this.#bestOfEl.innerHTML = "Best of 5";
            this.#bestOfEl.title = "Click to change the scoring to Best of X";
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