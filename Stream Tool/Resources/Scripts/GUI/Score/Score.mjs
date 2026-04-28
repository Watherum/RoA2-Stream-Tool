import { bestOf } from "../BestOf.mjs";
import { settings } from "../Settings.mjs";

export class Score {

    #scoreEls;
    #scoreNumEl;

    constructor(el) {

        this.#scoreEls = el.getElementsByClassName("scoreCheck");
        this.#scoreNumEl = el.getElementsByClassName("scoreCheckN")[0];

        this.showMode(bestOf.getBo());

        // set the score whenever we click on a score checkbox
        for (let i = 0; i < this.#scoreEls.length; i++) {
            this.#scoreEls[i].addEventListener("click", () => {

                // if the checkbox we clicked is already checked, uncheck it
                if (this.#scoreEls[i].checked) {
                    this.setScore(i+1);
                } else {
                    this.setScore(i);
                }

            });            
        };

    }

    getScore() {

        const bo = bestOf.getBo();

        if (bo == 5 || bo == 3) { // tick modes — everything else is numeric

            let result = 0;
            for (let i = 0; i < this.#scoreEls.length; i++) {
                if (this.#scoreEls[i].checked) {
                    result++;
                }
            }
            return result;

        } else { // numeric modes: "X", "ft5", "ft10"

            return Number(this.#scoreNumEl.value);

        }

    }

    setScore(score) {

        let actualScore;
        if (score <= 0) {
            actualScore = 0;
        } else if (bestOf.getBo() == 5 && score > 3) {
            actualScore = 3;
        } else if (bestOf.getBo() == 3 && score > 2) {
            actualScore = 2;
        } else if (bestOf.getBo() == "ft5" && score > 5) {
            actualScore = 5;
        } else if (bestOf.getBo() == "ft10" && score > 10) {
            actualScore = 10;
        } else {
            actualScore = score;
        }

        // check ticks below and equal to score, uncheck ticks above score
        for (let i = 0; i < this.#scoreEls.length; i++) {
            if (actualScore > i) {
                this.#scoreEls[i].checked = true;
            } else {
                this.#scoreEls[i].checked = false;
            }            
        }

        this.#scoreNumEl.value = actualScore;

    }

    /** Gives (or takes) a win to/from the player */
    giveWin() {
        const value = settings.isInvertScoreChecked() ? -1 : 1;
        this.setScore(this.getScore()+value);
    }

    //bestOf.getBo()
    getMode() {
        return bestOf.getBo();
    }

    /** Sets the display mode for score inputs */
    showMode(mode) {
    
        if (mode == 5) {

            this.#setChecksDisplay("block");
            this.#scoreNumEl.style.display = "none";

            if (this.getScore() > 3) {
                this.setScore(3);
            }

        } else if (mode == 3) {

            this.#setChecksDisplay("block");
            this.#scoreEls[2].style.display = "none";
            this.#scoreNumEl.style.display = "none";

            if (this.getScore() > 2) {
                this.setScore(2);
            }

        } else {
            
            this.#setChecksDisplay("none");
            this.#scoreNumEl.style.display = "block";
            
        }
    
    }

    #setChecksDisplay(value) {
        for (let i = 0; i < this.#scoreEls.length; i++) {
            this.#scoreEls[i].style.display = value;            
        }
    }
    
}