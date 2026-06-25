import { displayNotif } from "./Notifications.mjs";
import { clearPlayers } from "./Player/Players.mjs";
import { clearScores } from "./Score/Scores.mjs";
import { clearTeams } from "./Team/Teams.mjs";
import { round } from "./Round.mjs";
import { viewport } from "./Viewport.mjs";

class ClearConfirm {

    #div = document.getElementById("clearConfirmDiv");
    #mousedownOnBackdrop = false;

    constructor() {

        document.getElementById("clearButton").addEventListener("click", () => this.show());

        document.getElementById("clearConfirmYes").addEventListener("click", () => {
            this.hide();
            clearAll();
        });
        document.getElementById("clearConfirmNo").addEventListener("click", () => {
            this.hide();
            clearWithoutRound();
        });
        document.getElementById("clearConfirmCancel").addEventListener("click", () => this.hide());

        this.#div.addEventListener("mousedown", (e) => {
            this.#mousedownOnBackdrop = e.target === this.#div;
        });
        this.#div.addEventListener("click", (e) => {
            if (this.#mousedownOnBackdrop && e.target === this.#div) this.hide();
        });

    }

    show() {
        this.#div.style.pointerEvents = "auto";
        this.#div.style.opacity = 1;
        this.#div.style.transform = "scale(1)";
        viewport.opacity(".25");
    }

    hide() {
        this.#div.style.pointerEvents = "none";
        this.#div.style.opacity = 0;
        this.#div.style.transform = "scale(1.15)";
        viewport.opacity("1");
    }

    isVisible() {
        return this.#div.style.opacity === "1";
    }

}

function clearAll() {
    clearTeams();
    clearPlayers();
    clearScores();
    round.clear();
    displayNotif("Cleared all player data");
}

function clearWithoutRound() {
    clearTeams();
    clearPlayers();
    clearScores();
    displayNotif("Cleared player data");
}

export const clearConfirm = new ClearConfirm();

/** Shows the clear confirmation modal (called by keybind) */
export function clear() { clearConfirm.show(); }
