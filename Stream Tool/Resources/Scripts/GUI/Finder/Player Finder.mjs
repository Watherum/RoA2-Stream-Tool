import { Finder } from "./Finder.mjs";
import { getJson, getPresetList } from '../File System.mjs';
import { getRecolorImage } from "../GetImage.mjs";
import { current, stPath } from "../Globals.mjs";
import { charFinder } from "./Char Finder.mjs";
import { scores } from "../Score/Scores.mjs";
import { startGG } from "../Start GG.mjs";

class PlayerFinder extends Finder {

    #playerPresets;
    #presName; // to break playerpreset cycle


    constructor() {
        super(document.getElementById("playerFinder"));
        this.setPlayerPresets();
    }


    /** Sets a new player preset list from the presets folder */
    async setPlayerPresets() {
        this.#playerPresets = await getPresetList("Player Info");
    }

    /**
     * Fills the player preset finder depending on current player name
     * @param {Player} player - Player to find presets for
     */
    async fillFinderPresets(player) {

        //remove the "focus" for the player presets list
        current.focus = -1;

        // clear the current list each time we type
        this._clearList();

        // check for later
        let skinImgs = [];

        // if we typed at least 3 letters
        if (player.getName().length >= 3) {

            // check the files in that folder
            skinImgs = await this.#generatePresetList(player);

        }

        // if we got some presets, show up finder
        if (skinImgs.length) {
            this._finderEl.style.display = "block";
        } else {
            this._finderEl.style.display = "none";
        }

        return skinImgs;

    }

    async #generatePresetList(player) {

        const skinImgs = [];

        for (let i = 0; i < this.#playerPresets.length; i++) {

            const preset = this.#playerPresets[i]; // to simplify code
            let presetOnList = false;

            // if the current text matches a file from that folder
            if (preset.name.toLocaleLowerCase().includes(player.getName().toLocaleLowerCase())) {

                // for each character that player plays
                for (let i = 0; i < preset.characters.length; i++) {
                    
                    // only do all of this if the char is present on the current list
                    if (charFinder.isCharOnList(preset.characters[i].character)) {

                        presetOnList = true;
                        
                        // this will be the div to click
                        const newDiv = document.createElement('div');
                        newDiv.className = "finderEntry";
                        
                        //create the texts for the div, starting with the tag
                        const spanTag = document.createElement('span');
                        //if the tag is empty, dont do anything
                        if (preset.tag != "") {
                            spanTag.innerHTML = preset.tag;
                            spanTag.className = "pfTag";
                        }

                        // player name
                        const spanName = document.createElement('span');
                        spanName.innerHTML = preset.name;
                        spanName.className = "pfName";

                        // player character
                        const spanChar = document.createElement('span');
                        spanChar.innerHTML = preset.characters[i].character;
                        spanChar.className = "pfChar";

                        // data to be accessed when clicked
                        const pData = {
                            name : preset.name,
                            tag : preset.tag,
                            pronouns : preset.pronouns,
                            seed : preset.seed || "",
                            country : preset.country || "",
                            socials : preset.socials,
                            char : preset.characters[i].character
                        }

                        // add them to the div we created before
                        newDiv.appendChild(spanTag);
                        newDiv.appendChild(spanName);
                        newDiv.appendChild(spanChar);

                        // now for the character image, this is the mask/mirror div
                        const charImgBox = document.createElement("div");
                        charImgBox.className = "pfCharImgBox";

                        // actual image
                        const charImg = document.createElement('img');
                        charImg.className = "pfCharImg";
                        const charJson = await getJson(`${stPath.char}/${preset.characters[i].character}/_Info`);
                        // we will store this for later
                        skinImgs.push({
                            el : charImg,
                            charJson : charJson,
                            char : preset.characters[i].character,
                        });
                        // we have to position it
                        this.positionCharImg("Default", charImg, charJson);
                        // and add it to the mask
                        charImgBox.appendChild(charImg);

                        //add it to the main div
                        newDiv.appendChild(charImgBox);

                        // before we go, add a click listener
                        newDiv.addEventListener("mousedown", () => { player.markPresetPending(); });
                        newDiv.addEventListener("click", () => {
                            this.#entryClick(pData, player)
                        });

                        //and now add the div to the actual interface
                        this.addEntry(newDiv);

                        // we need this to know which cycle we're in
                        this.#presName = player.getName();

                    }


                }

                // if a preset was found, but no entries had characters from the current list
                if (!presetOnList) {
                    
                    // push an entry with no character so player info is easy to set up
                    // same code as before
                    const newDiv = document.createElement('div');
                    newDiv.className = "finderEntry";
                    const spanTag = document.createElement('span');
                    if (preset.tag != "") {
                        spanTag.innerHTML = preset.tag;
                        spanTag.className = "pfTag";
                    }
                    const spanName = document.createElement('span');
                    spanName.innerHTML = preset.name;
                    spanName.className = "pfName";
                    const spanChar = document.createElement('span');
                    spanChar.innerHTML = "Random";
                    spanChar.className = "pfChar";
                    const pData = {
                        name : preset.name,
                        tag : preset.tag,
                        pronouns : preset.pronouns,
                        seed : preset.seed || "",
                        country : preset.country || "",
                        socials : preset.socials,
                        char : "Random"
                    }
                    newDiv.appendChild(spanTag);
                    newDiv.appendChild(spanName);
                    newDiv.appendChild(spanChar);
                    const charImgBox = document.createElement("div");
                    charImgBox.className = "pfCharImgBox";
                    const charImg = document.createElement('img');
                    charImg.className = "pfCharImg";
                    const charJson = null;
                    skinImgs.push({
                        el : charImg,
                        charJson : charJson,
                        char : "Random"
                    });
                    this.positionCharImg(null, charImg, charJson);
                    charImgBox.appendChild(charImg);
                    newDiv.appendChild(charImgBox);
                    newDiv.addEventListener("mousedown", () => { player.markPresetPending(); });
                    newDiv.addEventListener("click", () => {
                        this.#entryClick(pData, player)
                    });
                    this.addEntry(newDiv);
                    this.#presName = player.getName();
                }

            }

        }

        return skinImgs;
    }

    /** Loads character images for each finder entry */
    async loadFinderImgs(skinImgs) {

        // now lets add those images to each entry
        const currentPresName = this.#presName;
        for (let i = 0; i < skinImgs.length; i++) {

            // if the list isnt being shown, break the cycle
            if (this.#presName != currentPresName || !this.isVisible()) {
                break;
            }

            // always use each character's default skin, since presets no longer track skin
            let skin;
            if (skinImgs[i].charJson) {
                skin = skinImgs[i].charJson.skinList[0];
            } else {
                skin = {name: "Random"};
            }

            let finalColorData = null;
            if (skinImgs[i].charJson) {
                finalColorData = skinImgs[i].charJson.colorData;
            }

            const finalSrc = await getRecolorImage(
                null,
                skinImgs[i].char,
                skin,
                finalColorData,
                "Skins",
                "P2"
            );
            skinImgs[i].el.setAttribute('src', finalSrc);

        }

    }

    /**
     * Updates a player with the data stored on the list's entry
     * @param {Object} pData - Data to be added to the player
     * @param {Player} player - Player to be updated
     */
    async #entryClick(pData, player) {

        // reset current focus
        current.focus = -1;

        // all them player data
        player.setName(pData.name);
        if (player.profileType == "player") scores.forEach(s => s.setScore(0));
        const liveTag = startGG.isLoaded() ? startGG.getTag(pData.name) : "";
        player.setTag(liveTag || pData.tag);
        // this will exclude bracket players
        if (player.profileType == "player") {
            const livePronouns = startGG.isLoaded() ? startGG.getPronouns(pData.name) : "";
            player.setPronouns(livePronouns || pData.pronouns);
            if (player.setSeed) {
                const liveSeed = startGG.isLoaded() ? startGG.getSeed(pData.name) : "";
                player.setSeed(liveSeed || pData.seed);
            }
            if (player.setCountry) {
                const liveCountry = startGG.isLoaded() ? startGG.getCountry(pData.name) : "";
                player.setCountry(liveCountry || pData.country);
            }
            player.setSocials(pData.socials);
        }

        // character change, uses the character's default skin since presets no longer track skin
        await player.charChange(pData.char);

        // and hide the finder of course
        this.hide();

    }

}

export const playerFinder = new PlayerFinder;