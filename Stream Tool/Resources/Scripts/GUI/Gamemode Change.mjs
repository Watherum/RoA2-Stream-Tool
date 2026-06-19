import { currentColors, updateScImage } from "./Colors.mjs";
import { hideBgCharImgs, showBgCharImgs } from "./Player/BG Char Image.mjs";
import { players, clearPlayers } from "./Player/Players.mjs";
import { clearScores } from "./Score/Scores.mjs";
import { teams } from "./Team/Teams.mjs";
import { wl } from "./WinnersLosers.mjs";
import { bestOf } from "./BestOf.mjs";
import { round } from "./Round.mjs";

class Gamemode {

    // store 2v2 only elements
    #dubEls = document.getElementsByClassName("elGm2");
    #select = document.getElementById("gamemodeSelect");
    #gamemode = 1;
    #isCrew   = false;
    #isWL     = false;
    #playerRegion = document.getElementById("playerRegion");

    #bestOfSelect    = document.getElementById("bestOfSelect");
    #teamNameInps    = [document.getElementById("teamName1"), document.getElementById("teamName2")];
    #crewStocksBoxes = [document.getElementById("crewStocksBox1"), document.getElementById("crewStocksBox2")];
    #savedBoIndex    = -1;

    constructor() {
        for (const box of this.#crewStocksBoxes) {
            const input = box.querySelector(".crewStocksInput");
            box.querySelector(".crewStocksMinus").addEventListener("click", () => {
                input.value = Math.max(0, Number(input.value) - 1);
            });
            box.querySelector(".crewStocksPlus").addEventListener("click", () => {
                input.value = Number(input.value) + 1;
            });
        }

        this.#select.addEventListener("change", () => {
            const value = this.#select.value;
            if (value === "1v1") {
                if (this.#isCrew) this.#exitCrewLayout();
                if (this.#isWL) this.#exitWLLayout();
                if (this.#gamemode === 2) this.changeGamemode(1);
                bestOf.resync();
                round.setWinnersRound();
                this.#bestOfSelect.disabled = false;
            } else if (value === "2v2") {
                if (this.#isCrew) this.#exitCrewLayout();
                if (this.#isWL) this.#exitWLLayout();
                // setLayout(2) → changeDubElsDisplay("flex") restores team name inputs
                this.changeGamemode(2);
                bestOf.resync();
                round.setWinnersRound();
                this.#bestOfSelect.disabled = false;
            } else if (value === "wl") {
                if (this.#isCrew) this.#exitCrewLayout();
                if (this.#gamemode === 2) this.#setLayout(1);
                this.#enterWLLayout();
                bestOf.setBo(value);
                this.#bestOfSelect.disabled = true;
            } else if (value === "crew") {
                if (this.#isWL) this.#exitWLLayout();
                if (this.#gamemode === 2) this.#setLayout(1);
                this.#enterCrewLayout();
                // updateSelect:false keeps the dropdown at its current value (e.g. Bo3)
                // so resync() works correctly when leaving crew mode
                this.#savedBoIndex = this.#bestOfSelect.selectedIndex;
                bestOf.setBo("X"); // shows "Best of X" in dropdown; restored on exit
                this.#bestOfSelect.disabled = false;
                round.setCrew();
            }
        });
    }

    getGm() {
        return this.#gamemode;
    }

    getSelectValue() {
        return this.#select.value;
    }

    /** Changes the player layout (1v1 or 2v2). Called externally by Remote Update. */
    changeGamemode(value) {

        if (value == 2) {
            this.#setLayout(2);
            this.#select.value = "2v2";
        } else {
            this.#setLayout(1);
            this.#select.value = "1v1";
        }

        // scoreboard color images will need to be updated
        updateScImage(0, currentColors[0].hex);
        updateScImage(1, currentColors[1].hex);

    }

    #setLayout(value) {

        if (value == 2) {

            this.#gamemode = 2;

            // display all 2v2 only elements
            this.#changeDubElsDisplay("flex");

            // hide the background character image to reduce clutter
            hideBgCharImgs();

            for (let i = 1; i < 3; i++) {

                document.getElementById("row1-"+i).insertAdjacentElement("afterbegin", wl.getWLButtons()[i-1]);
                document.getElementById("row1-"+i).insertAdjacentElement("afterbegin", document.getElementById('scoreBox'+i));

                document.getElementById("scoreText"+i).style.display = "none";

                document.getElementById("row1-"+i).insertAdjacentElement("afterbegin", teams[i-1].getNameInp());

                document.getElementById('row2-'+i).insertAdjacentElement("beforeend", players[i-1].pInfoDiv);

            }

            // change max width to the name inputs and char selects
            for (let i = 0; i < players.length; i++) {

                players[i].nameInp.style.maxWidth = "94px";
                players[i].charSel.style.maxWidth = "73px";
                players[i].skinSel.style.maxWidth = "72px";

            }

            // dropdown menus for the right side will now be positioned to the right
            document.getElementById("dropdownColorR").style.right = "0px";
            document.getElementById("dropdownColorR").style.left = "";

        } else {

            this.#gamemode = 1;

            // hide all 2v2 only elements
            this.#changeDubElsDisplay("none");

            showBgCharImgs();

            //move everything back to normal
            for (let i = 1; i < 3; i++) {

                document.getElementById("row3-"+i).insertAdjacentElement("afterbegin", wl.getWLButtons()[i-1]);
                document.getElementById("row3-"+i).insertAdjacentElement("afterbegin", document.getElementById('scoreBox'+i));

                document.getElementById("scoreText"+i).style.display = "block";

                document.getElementById('row1-'+i).insertAdjacentElement("afterbegin", players[i-1].pInfoDiv)

            }

            for (let i = 0; i < players.length; i++) {

                players[i].nameInp.style.maxWidth = "210px";
                players[i].charSel.style.maxWidth = "141px";
                players[i].skinSel.style.maxWidth = "141px";

            }

            //dropdown menus for the right side will now be positioned to the left
            document.getElementById("dropdownColorR").style.right = "";
            document.getElementById("dropdownColorR").style.left = "0px";

        }

    }

    /** Moves team names to row1 and player info to row2 (mirroring 2v2 layout for P1/P2 only). */
    #enterCrewLayout() {
        for (let i = 1; i < 3; i++) {
            const row2 = document.getElementById("row2-"+i);
            document.getElementById("row1-"+i).insertAdjacentElement("afterbegin", teams[i-1].getNameInp());
            // afterbegin puts playerInfo before charSelects so column layout reads: inputs → char select
            row2.insertAdjacentElement("afterbegin", players[i-1].pInfoDiv);
            row2.classList.add("crew-col");
        }
        this.#teamNameInps.forEach(el => el.style.display = "flex");
        this.#crewStocksBoxes.forEach(el => el.style.display = "flex");
        this.#isCrew = true;
    }

    /** Restores player info to row1, hides team names and stocks, and restores the pre-crew bestOf dropdown. */
    #exitCrewLayout() {
        for (let i = 1; i < 3; i++) {
            document.getElementById("row2-"+i).classList.remove("crew-col");
            document.getElementById("row1-"+i).insertAdjacentElement("afterbegin", players[i-1].pInfoDiv);
        }
        this.#teamNameInps.forEach(el => el.style.display = "none");
        this.#crewStocksBoxes.forEach(el => el.style.display = "none");
        if (this.#savedBoIndex !== -1) {
            this.#bestOfSelect.selectedIndex = this.#savedBoIndex;
            this.#savedBoIndex = -1;
        }
        this.#isCrew = false;
    }

    #enterWLLayout() {
        clearPlayers();
        clearScores();
        this.#playerRegion.classList.add("wl-mode");
        document.getElementById("scoreText2").textContent = "Losses";
        this.#isWL = true;
    }

    #exitWLLayout() {
        this.#playerRegion.classList.remove("wl-mode");
        document.getElementById("scoreText2").textContent = "Wins";
        this.#bestOfSelect.disabled = false;
        this.#isWL = false;
    }

    getCrewStocks() {
        return this.#crewStocksBoxes.map(box => Number(box.querySelector(".crewStocksInput").value));
    }

    /** Simply changes the display value for all 2v2 only elements */
    #changeDubElsDisplay(display) {
        for (let i = 0; i < this.#dubEls.length; i++) {
            this.#dubEls[i].style.display = display;
        }
    }

}

export const gamemode = new Gamemode;
