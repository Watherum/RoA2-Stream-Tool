import { viewport } from "./Viewport.mjs";
import { charFinder } from "./Finder/Char Finder.mjs";
import { players } from "./Player/Players.mjs";
import { wl } from "./WinnersLosers.mjs";
import { charDisplayName, inside, stPath } from "./Globals.mjs";
import { getJson, saveJson } from "./File System.mjs";
import { gamemode } from "./Gamemode Change.mjs";
import { tournament } from "./Tournament.mjs";
import { round } from "./Round.mjs";
import { teams } from "./Team/Teams.mjs";
import { startGG } from "./Start GG.mjs";
import { playerFinder } from "./Finder/Player Finder.mjs";


class GuiSettings {

    #introCheck = document.getElementById("allowIntro");
    #introImageCheck = document.getElementById("introImage");
    #introImageBox = document.getElementById("introImageBox");
    #altArtCheck = document.getElementById("forceAlt");

    #HDCheck = document.getElementById('forceHD');
    #noLoACheck = document.getElementById('noLoAHD');

    #wsCheck = document.getElementById('workshopToggle');
    #customRound = document.getElementById('customRound');
    #forceWLCheck = document.getElementById('forceWLToggle');
    #scoreAutoCheck = document.getElementById("scoreAutoUpdate");
    #invertScoreCheck = document.getElementById("invertScore");
    #simpleTextsCheck = document.getElementById("simpleTexts")
    #abbreviateRoundCheck = document.getElementById("abbreviateRound")
    #abbreviateWLCheck = document.getElementById("abbreviateWL")
    #abbreviateWLBox = document.getElementById("abbreviateWLBox")

    #ipDisplay = document.getElementById("displayLocalIp");
    #httpPortDisplay = document.getElementById("displayHttpPort");
    #wsPortDisplay = document.getElementById("displayWsPort");
    #localIp = '–';
    #httpPort = null;

    #alwaysOnTopCheck = document.getElementById("alwaysOnTop");
    #resizableCheck = document.getElementById("resizableWindow");
    #lessZoomButt = document.getElementById("lessZoomButt");
    #moreZoomButt = document.getElementById("moreZoomButt");
    #zoomTextValue = document.getElementById("zoomTextValue");
    #zoomValue = 100;
    #restoreWindowButt = document.getElementById("restoreWindowButt");

    #startGGTokenBox = document.getElementById("startGGTokenBox");
    #startGGToken = document.getElementById("startGGToken");
    #startGGSlug = document.getElementById("startGGSlug");
    #startGGFetch = document.getElementById("startGGFetch");
    #startGGStatus = document.getElementById("startGGStatus");

    constructor() {

        // scoreboard listeners
        this.#introCheck.addEventListener("click", async () => {
            const checked = this.isIntroChecked();
            await this.save("allowIntro", checked);
            if (checked) {
                this.#introImageBox.style.display = "flex";
            } else {
                this.#introImageBox.style.display = "none";
                this.#introImageCheck.checked = false;
                await this.save("introImage", false);
            }
        });
        this.#introImageCheck.addEventListener("click", () => {
            this.save("introImage", this.isIntroImageChecked());
        });
        this.#altArtCheck.addEventListener("click", () => {this.toggleAltArt()});

        // vs screen listeners
        this.#HDCheck.addEventListener("click", () => {this.toggleHD()});
        this.#noLoACheck.addEventListener("click", () => {this.toggleNoLoA()});

        // gui settings listeners
        this.#wsCheck.addEventListener("click", () => {
            if (inside.electron) {
                this.toggleWs();
            } else {
                this.sendWsToggle();
            }            
        });
        this.#customRound.addEventListener("click", () => {this.toggleCustomRound()});
        this.#forceWLCheck.addEventListener("click", () => {this.toggleForceWL()});
        this.#scoreAutoCheck.addEventListener("click", () => {
            if (this.isScoreAutoChecked()) {
                this.#invertScoreCheck.checked = false;
                this.save("invertScore", false);
            }
            this.save("scoreAutoUpdate", this.isScoreAutoChecked());
        });
        this.#invertScoreCheck.addEventListener("click", () => {
            if (this.isInvertScoreChecked()) {
                this.#scoreAutoCheck.checked = false;
                this.save("scoreAutoUpdate", false);
            }
            this.save("invertScore", this.isInvertScoreChecked());
        });
        this.#simpleTextsCheck.addEventListener("click", () => {
            this.save("simpleTexts", this.isSimpleTextsChecked())
        });
        this.#abbreviateRoundCheck.addEventListener("click", () => {
            this.save("abbreviateRound", this.isAbbreviateRoundChecked());
            if (this.isAbbreviateRoundChecked()) {
                this.#abbreviateWLBox.style.display = "flex";
            } else {
                this.#abbreviateWLBox.style.display = "none";
                this.#abbreviateWLCheck.checked = false;
                this.save("abbreviateWL", false);
            }
        });
        this.#abbreviateWLCheck.addEventListener("click", () => {
            this.save("abbreviateWL", this.isAbbreviateWLChecked());
        });

        // dont forget about the copy match to clipboard button
        document.getElementById("copyMatch").addEventListener("click", () => {
            this.copyMatch();
        });

        // only electron cares about this
        if (inside.electron) {
            const { ipcRenderer } = require('electron');
            ipcRenderer.on('actualPorts', (event, { httpPort, wsPort }) => {
                this.displayPorts(httpPort, wsPort);
                this.#httpPort = httpPort;
            });

            // find the first non-internal IPv4 address
            const os = require('os');
            const ifaces = os.networkInterfaces();
            let localIp = '–';
            outer: for (const name of Object.keys(ifaces)) {
                for (const iface of ifaces[name]) {
                    if (iface.family === 'IPv4' && !iface.internal) {
                        localIp = iface.address;
                        break outer;
                    }
                }
            }
            this.#localIp = localIp;
            this.#ipDisplay.textContent = localIp;
            document.getElementById("openRemoteEditor").addEventListener("click", () => {
                const { shell } = require('electron');
                if (this.#httpPort) shell.openExternal(`http://${this.#localIp}:${this.#httpPort}`);
            });
            this.#setAlwaysOnTopListener();
            this.#setResizableListener();
            this.#lessZoomButt.addEventListener("click", () => {this.#lessZoom()})
            this.#moreZoomButt.addEventListener("click", () => {this.#moreZoom()})
            this.#restoreWindowButt.addEventListener("click", () => {
                this.#restoreWindowDefaults()
            });
        } else {
            document.getElementById("settingsElectron").style.display = "none";
            this.#startGGTokenBox.style.display = "none";
        }

        // clicking the settings button will bring up the menu
        document.getElementById('settingsRegion').addEventListener("click", () => {
            viewport.toSettings();
        });

        // start.gg token and slug — save on change
        this.#startGGToken.addEventListener("change", () => {
            startGG.setToken(this.#startGGToken.value);
            this.save("startGGToken", this.#startGGToken.value);
            this.save("startGGTokenFromProps", false);
        });
        this.#startGGSlug.addEventListener("change", () => {
            startGG.setSlug(this.#startGGSlug.value);
        });

        // fetch seeds button
        this.#startGGFetch.addEventListener("click", async () => {
            this.#startGGStatus.textContent = "Fetching...";
            this.#startGGFetch.disabled = true;
            if (inside.electron) {
                startGG.setToken(this.#startGGToken.value);
                startGG.setSlug(this.#startGGSlug.value);
                const result = await startGG.fetchSeeds();
                this.handleStartGGResult(result);
            } else {
                const remote = await import("./Remote Requests.mjs");
                remote.sendRemoteData({ message: "remoteStartGGFetch", slug: this.#startGGSlug.value });
                // button re-enabled when startGGFetchResult arrives
            }
        });

    }

    /** Loads all settings from the "GUI Settings.json" file */
    async load() {

        // get us the json file
        const guiSettings = await getJson(`${stPath.text}/GUI Settings`);

        // and update it all!
        this.#introCheck.checked = guiSettings.allowIntro;
        this.#introImageCheck.checked = guiSettings.introImage;
        if (guiSettings.allowIntro) this.#introImageBox.style.display = "flex";
        this.#altArtCheck.checked = guiSettings.forceAlt;

        this.#HDCheck.checked = guiSettings.forceHD;
        if (guiSettings.forceHD) this.#noLoACheck.disabled = false;
        this.#noLoACheck.checked = guiSettings.noLoAHD;

        this.#wsCheck.checked = guiSettings.workshop;
        if (guiSettings.workshop) this.#altArtCheck.disabled = false;
        if (guiSettings.customRound) this.#customRound.click();
        if (guiSettings.forceWL) this.#forceWLCheck.click();
        this.#scoreAutoCheck.checked = guiSettings.scoreAutoUpdate;
        this.#invertScoreCheck.checked = guiSettings.invertScore;
        // enforce mutual exclusivity — scoreAutoUpdate wins if both were somehow saved as true
        if (guiSettings.scoreAutoUpdate && guiSettings.invertScore) {
            this.#invertScoreCheck.checked = false;
            this.save("invertScore", false);
        }
        this.#simpleTextsCheck.checked = guiSettings.simpleTexts;
        this.#abbreviateRoundCheck.checked = guiSettings.abbreviateRound;
        this.#abbreviateWLCheck.checked = guiSettings.abbreviateWL;
        if (guiSettings.abbreviateRound) this.#abbreviateWLBox.style.display = "flex";

        if (inside.electron) {
            this.#alwaysOnTopCheck.checked = guiSettings.alwaysOnTop;
            this.toggleAlwaysOnTop();
            this.#resizableCheck.checked = guiSettings.resizable;
            this.toggleResizable();
            this.#zoomValue = guiSettings.zoom;
            this.#changeZoom();
        }

        if (inside.electron && guiSettings.startGGToken) {
            this.#startGGToken.value = guiSettings.startGGToken;
            startGG.setToken(guiSettings.startGGToken);
        }

        // app.properties.txt overrides the saved token if present
        if (inside.electron) {
            const fs = require('fs');
            const propsPath = stPath.text + '/../app.properties.txt';
            let fromProps = false;
            if (fs.existsSync(propsPath)) {
                const lines = fs.readFileSync(propsPath, 'utf8').split('\n');
                for (const line of lines) {
                    const eqIdx = line.indexOf('=');
                    if (eqIdx === -1) continue;
                    const key = line.slice(0, eqIdx).trim();
                    const value = line.slice(eqIdx + 1).trim();
                    if (key === 'startgg.apiKey' && value) {
                        this.#startGGToken.value = value;
                        this.#startGGToken.disabled = true;
                        startGG.setToken(value);
                        this.#startGGStatus.textContent = "Token loaded from app.properties.txt";
                        fromProps = true;
                        break;
                    }
                }
            }
            this.save("startGGTokenFromProps", fromProps);
        } else if (guiSettings.startGGTokenFromProps) {
            this.#startGGStatus.textContent = "Token loaded from app.properties.txt";
        }

    }

    /**
     * Updates a setting inside "GUI Settings.json"
     * @param {String} name - Name of the json variable
     * @param {} value - Value to add to the variable
     */
    async save(name, value) {
   
        if (inside.electron) {
            // read the file
            const guiSettings = await getJson(`${stPath.text}/GUI Settings`);

            // update the setting's value
            guiSettings[name] = value;

            // save the file
            saveJson(`/GUI Settings`, guiSettings);
        }

    }

    setIntro(value) {
        this.#introCheck.checked = value;
    }
    isIntroChecked() {
        return this.#introCheck.checked;
    }

    setIntroImage(value) {
        this.#introImageCheck.checked = value;
    }
    isIntroImageChecked() {
        return this.#introImageCheck.checked;
    }

    setAltArt(value) {
        this.#altArtCheck.checked = value;
    }
    isAltArtChecked() {
        return this.#altArtCheck.checked;
    }
    async toggleAltArt() {

        // to update character images
        const promises = [];
        for (let i = 0; i < players.length; i++) {
            promises.push(players[i].setScImg());
        }

        // save current checkbox value to the settings file
        this.save("forceAlt", this.isAltArtChecked());

        await Promise.all(promises);

    }

    setHD(value) {
        this.#HDCheck.checked = value;
    }
    isHDChecked() {
        return this.#HDCheck.checked;
    }
    async toggleHD() {

        // enables or disables the second forceHD option
        this.#noLoACheck.disabled = !this.isHDChecked();
        if (this.#noLoACheck.disabled) {
            this.#noLoACheck.checked = false;
            await this.save("noLoAHD", false);
        }

        // to update character images
        for (let i = 0; i < players.length; i++) {
            await players[i].setVsImg();
            players[i].setTrailImage(); // needs to wait for setVsImg
            players[i].setVsBg();
        }

        // save current checkbox value to the settings file
        await this.save("forceHD", this.isHDChecked());

    }

    setNoLoA(value) {
        this.#noLoACheck.checked = value;
    }
    isNoLoAChecked() {
        return this.#noLoACheck.checked;
    }
    async toggleNoLoA() {

        // to update character images
        const promises = [];
        for (let i = 0; i < players.length; i++) {
            promises.push(players[i].setVsImg());
            promises.push(players[i].setVsBg());
            promises.push(players[i].setTrailImage());
        }
        await Promise.all(promises);

        // save current checkbox value to the settings file
        this.save("noLoAHD", this.isNoLoAChecked());

    }

    setWs(value) {
        this.#wsCheck.checked = value;
    }
    isWsChecked() {
        return this.#wsCheck.checked;
    }
    async toggleWs() {

        // reload character list with or without workshop characters
        await charFinder.loadCharacters(this.isWsChecked());
        // reset current character selections
        for (let i = 0; i < players.length; i++) {
            await players[i].charChange("Random");
        }

        // disable or enable alt arts checkbox
        this.#altArtCheck.disabled = !this.isWsChecked();
        if (this.#altArtCheck.disabled) {
            this.#altArtCheck.checked = false;
            await this.save("forceAlt", false);
        }

        // save current checkbox value to the settings file
        await this.save("workshop", this.isWsChecked());

    }
    /** Will send a signal to the GUI to toggle current WS values */
    async sendWsToggle() {
        const remote = await import("./Remote Requests.mjs");
        remote.sendRemoteData({message: "toggleWs", value: this.isWsChecked()});
    }

    setForceWL(value) {
        this.#forceWLCheck.checked = value;
    }
    isForceWLChecked() {
        return this.#forceWLCheck.checked;
    }

    setCustomRound(value) {
        this.#customRound.checked = value;
    }

    isCustomRoundChecked () {
        return this.#customRound.checked;
    }

    toggleCustomRound () {
        if (this.isCustomRoundChecked()) {
            round.showTextInput();
        } else {
            round.hideTextInput();
        }

        this.save("customRound", this.isCustomRoundChecked());

    }

    toggleForceWL() {

        // forces the W/L buttons to appear, or unforces them
        if (this.isForceWLChecked()) {
            wl.show();
        } else {
            wl.hide();
        }

        // save current checkbox value to the settings file
        this.save("forceWL", this.isForceWLChecked());

    }

    isScoreAutoChecked() {
        return this.#scoreAutoCheck.checked;
    }

    isInvertScoreChecked() {
        return this.#invertScoreCheck.checked;
    }

    isSimpleTextsChecked() {
        return this.#simpleTextsCheck.checked;
    }

    isAbbreviateRoundChecked() {
        return this.#abbreviateRoundCheck.checked;
    }

    isAbbreviateWLChecked() {
        return this.#abbreviateWLCheck.checked;
    }

    /**
     * Will copy the current match info to the clipboard
     * Format: "Tournament Name - Round - Player1 (Character1) Vs Player2 (Character2) - RoA II"
     */
    copyMatch() {

        // initialize the string
        let copiedText = tournament.getText() + " - " + round.getText() + " - ";

        if (gamemode.getGm() == 1) { // for singles matches
            // check if the player has a tag to add
            if (players[0].tag) {
                copiedText += players[0].tag + " | ";
            }
            copiedText += players[0].getName() + " (" + charDisplayName(players[0].char) +") Vs ";
            if (players[1].tag) {
                copiedText += players[1].tag + " | ";
            }
            copiedText += players[1].getName() + " (" + charDisplayName(players[1].char) +")" + " - RoA II";
        } else { // for team matches
            copiedText += teams[0].getName() + " Vs " + teams[1].getName();
        }

        // send the string to the user's clipboard
        navigator.clipboard.writeText(copiedText);

    }

    #setAlwaysOnTopListener() {
        this.#alwaysOnTopCheck.addEventListener("click", () => {
            this.toggleAlwaysOnTop();
        });
    }
    async toggleAlwaysOnTop() {
        const ipc = await import("./IPC.mjs");
        ipc.alwaysOnTop(this.#alwaysOnTopCheck.checked);
        this.save("alwaysOnTop", this.#alwaysOnTopCheck.checked);
    }

    #setResizableListener() {
        this.#resizableCheck.addEventListener("click", () => {
            this.toggleResizable();
        });
    }
    async toggleResizable() {
        const resizable = this.#resizableCheck.checked;
        this.#lessZoomButt.disabled = !resizable;
        this.#moreZoomButt.disabled = !resizable;
        const ipc = await import("./IPC.mjs");
        ipc.resizable(resizable);
        this.save("resizable", resizable);
    }

    #lessZoom() {
        if (this.#zoomValue > 100) {
            this.#zoomValue -= 10;
            this.#changeZoom();
        }
    }
    #moreZoom() {
        if (this.#zoomValue < 400) {
            this.#zoomValue += 10;
            this.#changeZoom();
        }
    }
    #changeZoom() {
        const { webFrame } = require('electron');
        webFrame.setZoomFactor(this.#zoomValue / 100);
        this.#zoomTextValue.innerHTML = `${this.#zoomValue}%`;
        this.save("zoom", this.#zoomValue);
    }

    handleStartGGResult(result) {
        this.#startGGFetch.disabled = false;
        if (result.success) {
            if (result.newPresets > 0) playerFinder.appendPresets(result.newPresetObjects);
            this.#startGGStatus.textContent = `${result.count} players seeded, ${result.newPresets} new presets created`;
        } else {
            this.#startGGStatus.textContent = `Error: ${result.error}`;
        }
    }

    displayPorts(http, ws) {
        this.#httpPortDisplay.textContent = http;
        this.#wsPortDisplay.textContent = ws;
    }

    async #restoreWindowDefaults() {
        this.#resizableCheck.checked = true;
        this.toggleResizable();
        this.#zoomValue = 100;
        this.#changeZoom();
        const ipc = await import("./IPC.mjs");
        ipc.defaultWindowDimensions();
    }

}

export const settings = new GuiSettings;