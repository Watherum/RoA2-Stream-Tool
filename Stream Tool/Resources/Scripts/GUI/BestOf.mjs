import { showScoreMode } from "./Score/Scores.mjs";

class BestOf {

    #currentBestOf = 5;
    #bestOfEl = document.getElementById("bestOf");
    #bestOfPrevEl = document.getElementById("bestOfPrev");

    constructor() {

        this.#bestOfEl.addEventListener("click", () => {
            this.#nextBestOf();
        });

        this.#bestOfPrevEl.addEventListener("click", () => {
            this.#prevBestOf();
        });

    }

    getBo() {
        return this.#currentBestOf;
    }
    setBo(value) {
        this.#changeBestOf(value);
    }

    #nextBestOf() {
        if (this.#currentBestOf == 5) {
            this.setBo(3);
        } else if (this.#currentBestOf == 3) {
            this.setBo("X");
        } else if (this.#currentBestOf == "X") {
            this.setBo("ft5");
        } else if (this.#currentBestOf == "ft5") {
            this.setBo("ft10");
        } else if (this.#currentBestOf == "ft10") {
            this.setBo("ftX");
        } else if (this.#currentBestOf == "ftX") {
            this.setBo(5);
        }
    }

    #prevBestOf() {
        if (this.#currentBestOf == 5) {
            this.setBo("ftX");
        } else if (this.#currentBestOf == "ftX") {
            this.setBo("ft10");
        } else if (this.#currentBestOf == "ft10") {
            this.setBo("ft5");
        } else if (this.#currentBestOf == "ft5") {
            this.setBo("X");
        } else if (this.#currentBestOf == "X") {
            this.setBo(3);
        } else if (this.#currentBestOf == 3) {
            this.setBo(5);
        }
    }

    #changeBestOf(value) {

        if (value == 3) {

            this.#currentBestOf = 3;
            this.#bestOfEl.innerHTML = "Best of 3";
            this.#bestOfEl.title = "Click to change the scoring to Best of X";
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
            this.#bestOfEl.title = "Click to change the scoring to Best of 5";
            showScoreMode("ftX");

        } else if (value == 5) {

            this.#currentBestOf = 5;
            this.#bestOfEl.innerHTML = "Best of 5";
            this.#bestOfEl.title = "Click to change the scoring to Best of 3";
            showScoreMode(5);

        }

    }

}

export const bestOf = new BestOf;