import { getJson, getPresetList, deletePreset } from "./File System.mjs";
import { players } from "./Player/Players.mjs";
import { playerFinder } from "./Finder/Player Finder.mjs";
import { setCurrentPlayer, customChange } from "./Custom Skin.mjs";
import { getRecolorImage } from "./GetImage.mjs";
import { scores } from "./Score/Scores.mjs";
import { stPath } from "./Globals.mjs";
import { viewport } from "./Viewport.mjs";
import { displayNotif } from "./Notifications.mjs";
import { startGG } from "./Start GG.mjs";
import { gamemode } from "./Gamemode Change.mjs";

class PresetBrowser {

    #div = document.getElementById("presetBrowserDiv");
    #searchInp = document.getElementById("presetBrowserSearch");
    #clearButt = document.getElementById("presetBrowserSearchClear");
    #list = document.getElementById("presetBrowserList");
    #allPresets = [];
    #renderCycle = 0;
    #mousedownOnBackdrop = false;

    constructor() {

        document.getElementById("presetBrowserButt").addEventListener("click", () => {
            this.show();
        });
        document.getElementById("presetBrowserClose").addEventListener("click", () => {
            this.hide();
        });
        this.#searchInp.addEventListener("input", () => {
            this.#updateClearButton();
            this.#filterList();
        });
        this.#clearButt.addEventListener("click", () => {
            this.#searchInp.value = "";
            this.#updateClearButton();
            this.#filterList();
            this.#searchInp.focus();
        });
        // only close when both mousedown and click land on the backdrop itself
        this.#div.addEventListener("mousedown", (e) => {
            this.#mousedownOnBackdrop = e.target === this.#div;
        });
        this.#div.addEventListener("click", (e) => {
            if (this.#mousedownOnBackdrop && e.target === this.#div) this.hide();
        });

    }

    #updateClearButton() {
        this.#clearButt.classList.toggle("visible", this.#searchInp.value.length > 0);
    }

    async show() {

        this.#allPresets = await getPresetList("Player Info");
        this.#searchInp.value = "";
        this.#updateClearButton();
        this.#filterList();

        this.#div.style.pointerEvents = "auto";
        this.#div.style.opacity = 1;
        this.#div.style.transform = "scale(1)";
        viewport.opacity(".25");
        this.#searchInp.focus();

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

    #filterList() {

        const query = this.#searchInp.value.toLowerCase();
        const entries = [];
        for (const preset of this.#allPresets) {
            const nameOrTagMatch =
                preset.name.toLowerCase().includes(query) ||
                (preset.tag || "").toLowerCase().includes(query);
            if (preset.characters && preset.characters.length > 0) {
                for (const char of preset.characters) {
                    if (nameOrTagMatch || char.character.toLowerCase().includes(query)) {
                        entries.push({ preset, char });
                    }
                }
            } else if (nameOrTagMatch) {
                entries.push({ preset, char: { character: "Random", skin: "Default" } });
            }
        }
        this.#renderList(entries);

    }

    #renderList(entries) {

        this.#list.innerHTML = "";
        this.#renderCycle++;
        const cycle = this.#renderCycle;

        const imgQueue = [];
        for (const { preset, char } of entries) {
            const { el, imgData } = this.#makeEntry(preset, char);
            this.#list.appendChild(el);
            if (imgData) imgQueue.push(imgData);
        }

        this.#loadImages(imgQueue, cycle);

    }

    #makeEntry(preset, char) {

        const row = document.createElement("div");
        row.className = "pbEntry";

        // character image watermark (populated async)
        const charImgBox = document.createElement("div");
        charImgBox.className = "pbCharImgBox";
        const charImg = document.createElement("img");
        charImg.className = "pbCharImg";
        charImgBox.appendChild(charImg);
        row.appendChild(charImgBox);

        const info = document.createElement("div");
        info.className = "pbInfo";

        const displayTag = (startGG.isLoaded() ? startGG.getTag(preset.name) : "") || preset.tag || "";
        if (displayTag) {
            const tag = document.createElement("span");
            tag.className = "pbTag";
            tag.textContent = displayTag;
            info.appendChild(tag);
        }

        const name = document.createElement("span");
        name.className = "pbName";
        name.textContent = preset.name;
        info.appendChild(name);

        if (preset.pronouns) {
            const pronouns = document.createElement("span");
            pronouns.className = "pbPronouns";
            pronouns.textContent = preset.pronouns;
            info.appendChild(pronouns);
        }

        const charSpan = document.createElement("span");
        charSpan.className = "pbChars";
        charSpan.textContent = char ? char.character : "Random";
        info.appendChild(charSpan);

        const buttons = document.createElement("div");
        buttons.className = "pbButtons";

        const p1Butt = document.createElement("button");
        p1Butt.className = "pbButt pbP1Butt";
        p1Butt.textContent = "P1";
        p1Butt.addEventListener("click", () => this.#applyPreset(preset, char, players[0]));

        const p2Butt = document.createElement("button");
        p2Butt.className = "pbButt pbP2Butt";
        p2Butt.textContent = "P2";
        p2Butt.addEventListener("click", () => this.#applyPreset(preset, char, players[1]));

        const delButt = document.createElement("button");
        delButt.className = "pbButt pbDelButt";
        delButt.textContent = "Delete";
        delButt.addEventListener("click", () => this.#handleDelete(preset));

        if (gamemode.getGm() == 2) {
            const p3Butt = document.createElement("button");
            p3Butt.className = "pbButt";
            p3Butt.textContent = "P3";
            p3Butt.addEventListener("click", () => this.#applyPreset(preset, char, players[2]));

            const p4Butt = document.createElement("button");
            p4Butt.className = "pbButt";
            p4Butt.textContent = "P4";
            p4Butt.addEventListener("click", () => this.#applyPreset(preset, char, players[3]));

            buttons.appendChild(p1Butt);
            buttons.appendChild(p3Butt);
            buttons.appendChild(p2Butt);
            buttons.appendChild(p4Butt);
        } else {
            buttons.appendChild(p1Butt);
            buttons.appendChild(p2Butt);
        }

        buttons.appendChild(delButt);

        row.appendChild(info);
        row.appendChild(buttons);

        const imgData = char ? {
            el: charImg,
            char: char.character,
            skinName: char.skin,
            hex: char.hex,
            customImg: char.customImg,
        } : null;

        return { el: row, imgData };

    }

    async #loadImages(queue, cycle) {

        for (const item of queue) {

            if (this.#renderCycle !== cycle) break;

            const charJson = await getJson(`${stPath.char}/${item.char}/_Info`);

            if (this.#renderCycle !== cycle) break;

            let skin = { name: item.skinName };
            if (charJson) {
                for (const s of charJson.skinList) {
                    if (s.name === item.skinName) {
                        skin = structuredClone(s);
                        if (item.customImg) {
                            skin.hex = item.hex;
                            skin.force = true;
                        }
                        break;
                    }
                }
            }

            const colorData = charJson?.colorData || null;
            item.el.src = await getRecolorImage(null, item.char, skin, colorData, "Skins", "P2");

            this.#positionCharImg(item.skinName, item.el, charJson);

        }

    }

    #positionCharImg(skinName, el, charJson) {

        const pos = [0, 0, 1];
        if (charJson?.gui) {
            if (charJson.gui[skinName]) {
                pos[0] = charJson.gui[skinName].x;
                pos[1] = charJson.gui[skinName].y;
                pos[2] = charJson.gui[skinName].scale;
            } else if (charJson.gui.neutral) {
                pos[0] = charJson.gui.neutral.x;
                pos[1] = charJson.gui.neutral.y;
                pos[2] = charJson.gui.neutral.scale;
            }
        } else {
            pos[1] = -5;
            pos[2] = 1.2;
        }

        el.style.transform = `translate(${pos[0]}px, ${pos[1]}px) scale(${pos[2]})`;

    }

    async #applyPreset(preset, char, player) {

        player.markPresetPending();
        player.setName(preset.name);
        scores.forEach(s => s.setScore(0));
        const liveTag = startGG.isLoaded() ? startGG.getTag(preset.name) : "";
        player.setTag(liveTag || preset.tag || "");
        player.setPronouns(preset.pronouns || "");
        if (player.setSeed) player.setSeed(preset.seed || "");
        if (player.setCountry) player.setCountry(preset.country || "");
        player.setSocials(preset.socials || {});

        if (char) {
            await player.charChange(char.character, true);
            if (char.customImg) {
                setCurrentPlayer(player);
                customChange(char.hex, char.skin);
            } else {
                player.skinChange(player.findSkin(char.skin));
            }
        }

    }

    async #handleDelete(preset) {

        deletePreset(preset.name);
        this.#allPresets = this.#allPresets.filter(p => p.name !== preset.name);
        this.#filterList();
        playerFinder.setPlayerPresets();
        displayNotif(`Preset "${preset.name}" deleted`);

    }

}

export const presetBrowser = new PresetBrowser;
