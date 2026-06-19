import { getCharacterList, getJson } from '../File System.mjs';
import { getRecolorImage } from '../GetImage.mjs';
import { FinderSelect } from './Finder Select.mjs';
import { charDisplayName, stPath } from '../Globals.mjs';

class CharFinder extends FinderSelect {

    #charList;
    #curPlayer;
    #modalEl;
    #modalSearchEl;
    #modalGridEl;

    constructor() {
        super(document.getElementById("characterFinder"));
        this.#modalEl = document.getElementById("charSelectModal");
        this.#modalSearchEl = document.getElementById("charModalSearch");
        this.#modalGridEl = document.getElementById("charModalGrid");

        // close modal when clicking the dark overlay
        this.#modalEl.addEventListener("click", (e) => {
            if (e.target === this.#modalEl) this.closeModal();
        });
        // Escape is handled globally by Mousetrap in Keybinds.mjs
        // live search filter
        this.#modalSearchEl.addEventListener("input", () => {
            this.#filterModalGrid(this.#modalSearchEl.value);
        });
    }

    /**
     * Fills the character list with each folder on the Characters folder
     * @param {Boolean} includeWorkshop - Whether to include _Workshop characters
     */
    async loadCharacters(includeWorkshop = false) {

        // first of all, clear a possible already existing list
        this._finderEl.lastElementChild.innerHTML = "";
        this.#modalGridEl.innerHTML = "";

        // create a list with folder names on charPath
        this.#charList = await getCharacterList(includeWorkshop);

        // add entries to the character list
        for (let i = 0; i < this.#charList.length; i++) {

            const fullName = this.#charList[i];
            const displayName = charDisplayName(fullName);

            // get us the charInfo for this character
            const charInfo = await getJson(`${stPath.char}/${fullName}/_Info`);

            // resolve the default icon src once, shared by dropdown + modal
            let skin = { name: "Default" }, colorData;
            if (charInfo) {
                skin = charInfo.skinList[0];
                colorData = charInfo.colorData;
            }
            const iconSrc = await getRecolorImage(false, fullName, skin, colorData, "Icons", "Icon");

            // --- existing dropdown entry ---
            const newDiv = document.createElement('div');
            newDiv.className = "finderEntry";
            newDiv.addEventListener("click", () => {this.#entryClick(fullName)});

            const imgIcon = document.createElement('img');
            imgIcon.className = "fIconImg";
            imgIcon.src = iconSrc;

            const spanName = document.createElement('span');
            spanName.innerHTML = displayName;
            spanName.className = "pfName";

            newDiv.appendChild(imgIcon);
            newDiv.appendChild(spanName);
            this.addEntry(newDiv);

            // --- modal grid card ---
            const card = document.createElement('div');
            card.className = "charModalCard";
            card.dataset.charName = displayName.toLowerCase();
            card.addEventListener("click", () => {this.#entryClick(fullName)});

            const cardImg = document.createElement('img');
            cardImg.className = "charModalIcon";
            cardImg.src = iconSrc;
            cardImg.alt = displayName;

            const cardName = document.createElement('span');
            cardName.className = "charModalName";
            cardName.textContent = displayName;

            card.appendChild(cardImg);
            card.appendChild(cardName);
            this.#modalGridEl.appendChild(card);

        }

    }

    getCharList() {
        return this.#charList;
    }

    /** Opens the visual character select modal for the given player */
    openModal(player) {
        this.#curPlayer = player;
        this.#modalSearchEl.value = "";
        this.#filterModalGrid("");
        this.#modalEl.style.display = "flex";
        this.#modalGridEl.scrollTop = 0;
        this.#modalSearchEl.focus();
    }

    closeModal() {
        this.#modalEl.style.display = "none";
    }

    isModalOpen() {
        return this.#modalEl.style.display === "flex";
    }

    #filterModalGrid(query) {
        const q = query.toLowerCase();
        const cards = this.#modalGridEl.children;
        for (let i = 0; i < cards.length; i++) {
            cards[i].style.display = cards[i].dataset.charName.includes(q) ? "flex" : "none";
        }
    }

    #entryClick(charName) {

        this.closeModal();

        // clear focus to hide character select menu
        document.activeElement.blur();

        // clear filter box
        this._finderEl.firstElementChild.value = "";

        // our player class will take things from here
        this.#curPlayer.charChange(charName);

    }

    setCurrentPlayer(player) {
        this.#curPlayer = player;
    }

    /**
     * Checks if the provided character is on the current character list
     * @param {String} char - Name of the character
     * @returns {Boolean} True if found
     */
    isCharOnList(char) {
        for (let i = 0; i < this.#charList.length; i++) {
            if (this.#charList[i] == char) {
                return true;
            }
        }
        return false;
    }

}

export const charFinder = new CharFinder;
