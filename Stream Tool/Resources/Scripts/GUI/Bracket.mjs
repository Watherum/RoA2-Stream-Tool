import { viewport } from './Viewport.mjs';
import { bracketPlayers, players } from './Player/Players.mjs';
import { PlayerBracket } from "./Player/Player Bracket.mjs";
import { displayNotif } from './Notifications.mjs';
import { scores } from './Score/Scores.mjs';
import { inside } from './Globals.mjs';
import { openColorPicker } from './Color Picker.mjs';

const bRoundSelect = document.getElementById('bracketRoundSelect');
const bEncountersDiv = document.getElementById('bracketEncounters');
const bImportButt = document.getElementById('bracketImport');

// color pickers for the bracket overlay's texts
const bColorInputs = {
    round: document.getElementById('bracketRoundColor'),
    text: document.getElementById('bracketTextColor'),
    score: document.getElementById('bracketScoreColor')
}
const bHexInputs = {
    round: document.getElementById('bracketRoundHex'),
    text: document.getElementById('bracketTextHex'),
    score: document.getElementById('bracketScoreHex')
}
const bColorReset = document.getElementById('bracketColorReset');
const bPresetList = document.getElementById('bracketPresetList');
const bPresetSave = document.getElementById('bracketPresetSave');
const bAutoSelect = document.getElementById('bracketAutoSelect');

// same values the Bracket.css fallbacks use
const defaultColors = {
    round: "#48bf91",
    text: "#ffffff",
    score: "#000000"
}
// what a fresh install starts with, so theres something to click on
const starterPresets = [
    {round: "#48bf91", text: "#ffffff", score: "#000000"},
    {round: "#ffffff", text: "#ffffff", score: "#000000"},
    {round: "#ffcc00", text: "#ffffff", score: "#000000"},
    {round: "#ff5e5e", text: "#ffffff", score: "#000000"}
]
const maxPresets = 12;

let bracketColors = {...defaultColors};
let colorPresets = starterPresets.map(preset => ({...preset}));
let colorSendTimer;
let editSendTimer;

// how long to wait after the last edit before pushing the bracket out
const editDelay = 700;
// and how many of those waits a still loading icon gets before we send anyway
const maxEditWaits = 10;

// automatic re-imports
let autoSeconds = 0;    // 0 means off
let autoTimer;
let autoBusy = false;   // a fetch is still in flight
let autoFailed = false; // so a broken slug doesn't notify every single tick

// just the initial state of the bracket
const blankPlayerData = {
    name: "-",
    tag: "",
    character: "None",
    skin: "-",
    iconSrc: "",
    score: "-"
}
let bracketData = {
    "WinnersSemis": [blankPlayerData, blankPlayerData, blankPlayerData, blankPlayerData],
    "WinnersFinals": [blankPlayerData, blankPlayerData],
    "GrandFinals" : [blankPlayerData, blankPlayerData],
    "TrueFinals" : [blankPlayerData, blankPlayerData],
    "LosersTop8" : [blankPlayerData, blankPlayerData, blankPlayerData, blankPlayerData],
    "LosersQuarters" : [blankPlayerData, blankPlayerData, blankPlayerData, blankPlayerData],
    "LosersSemis" : [blankPlayerData, blankPlayerData],
    "LosersFinals" : [blankPlayerData, blankPlayerData]
}

let previousRound;


// its always good to listen closely
document.getElementById('botBarBracket').addEventListener("click", () => {viewport.toBracket()});
bRoundSelect.addEventListener("change", () => {createEncounters()});
document.getElementById('bracketGoBack').addEventListener("click", () => {viewport.toCenter()});
document.getElementById('bracketUpdate').addEventListener("click", () => {updateBracket()});
bImportButt.addEventListener("click", () => {importFromProvider()});
for (const type in bColorInputs) {
    // the swatch opens our own color wheel; while its being dragged around
    // we push the new color at a sane rate, and once its settled we store it
    bColorInputs[type].addEventListener("click", () => {
        openColorPicker(
            bColorInputs[type],
            bracketColors[type],
            (hex, settled) => {colorChange(type, hex, settled)}
        );
    });
    // the hex box is the same color, just typed out
    bHexInputs[type].addEventListener("input", () => {hexChange(type, false)});
    bHexInputs[type].addEventListener("change", () => {hexChange(type, true)});
}
for (const pickButt of document.querySelectorAll('.bColorPick')) {
    // browsers that dont have an eyedropper of their own dont get a button
    if (!inside.electron && !window.EyeDropper) {
        pickButt.style.display = "none";
        continue;
    }
    pickButt.addEventListener("click", () => {pickFromScreen(pickButt.dataset.type, pickButt)});
}
bColorReset.addEventListener("click", () => {setColors(defaultColors, true)});
// picking a character, a skin or a player off a finder, or copying a game over,
// all happen as clicks in here. programmatic changes never fire one, so this
// can't bounce an incoming remote update straight back at its sender
bEncountersDiv.addEventListener("click", () => {scheduleBracketSend()});
document.getElementById('bracketPresetBrowserButt').addEventListener("click", async () => {
    const { presetBrowser } = await import("./Preset Browser.mjs");
    presetBrowser.show("bracket");
});
bPresetSave.addEventListener("click", () => {addPreset()});
bAutoSelect.addEventListener("change", () => {
    autoSeconds = Number(bAutoSelect.value);
    autoFailed = false;
    restartAutoTimer();
    saveAuto();
});
drawPresets();
// force change event for initial creation of encounters
bRoundSelect.dispatchEvent(new Event('change'));


/** How many player slots the round being edited has */
export function getBracketSlots() {
    return bracketPlayers.length;
}

/** Name of the round being edited, as written on its dropdown option */
export function getBracketRoundName() {
    return bRoundSelect.options[bRoundSelect.selectedIndex].textContent;
}

/**
 * Drops a player preset into one of the current round's slots
 * @param {Number} slot - Position on the round, starting at 0
 * @param {Object} preset - Preset data as stored on its json file
 * @param {Object} char - Character and skin to give the slot, if any
 */
export async function applyPresetToBracket(slot, preset, char) {

    const player = bracketPlayers[slot];
    if (!player) return;

    const { liveTag } = await import("./Importers.mjs");

    player.setName(preset.name);
    player.setTag(liveTag(preset.name) || preset.tag || "");

    if (char) {
        await player.charChange(char.character, true);
        if (char.customImg) {
            const { setCurrentPlayer, customChange } = await import("./Custom Skin.mjs");
            setCurrentPlayer(player);
            await customChange(char.hex, char.skin);
        } else {
            await player.skinChange(player.findSkin(char.skin));
        }
    }

    // the browser stays open, so push this out like any other manual edit
    scheduleBracketSend();

}


/**
 * Sends the bracket once the user has stopped editing for a moment
 * @param {Number} waits - How many times we've waited on a loading icon
 */
function scheduleBracketSend(waits = 0) {

    clearTimeout(editSendTimer);
    editSendTimer = setTimeout(() => {

        // a character or skin pick may still be loading its icon; wait it out
        // rather than sending the one it's about to replace, but never forever
        if (waits < maxEditWaits && bracketPlayers.some(p => p.getReadyState() === false)) {
            return scheduleBracketSend(waits + 1);
        }

        updateBracket(true);

    }, editDelay);

}


/** Loads the saved bracket editor settings, before the first bracket update */
export async function initBracketSettings() {

    if (!inside.electron) return; // remote GUIs get them with the bracket data

    const { stPath } = await import("./Globals.mjs");
    const { getJson } = await import("./File System.mjs");
    const guiSettings = await getJson(`${stPath.text}/GUI Settings`);

    setColors(guiSettings.bracketColors, false);
    setPresets(guiSettings.bracketColorPresets);
    setAuto(guiSettings.bracketAutoImport);

}


/**
 * Sets how often the bracket re-imports itself, and starts the timer
 * @param {Number} seconds - Time between imports, 0 to turn it off
 */
function setAuto(seconds) {

    // only the values the dropdown offers, so a typo'd setting can't spam a site
    if (![...bAutoSelect.options].some(option => Number(option.value) == seconds)) return;

    autoSeconds = Number(seconds);
    bAutoSelect.value = autoSeconds;
    autoFailed = false;
    restartAutoTimer();

}

/** Restarts the auto import timer with the current interval */
function restartAutoTimer() {

    clearInterval(autoTimer);

    // the importer tokens live on the electron side, so the timer does too
    if (!inside.electron || !autoSeconds) return;

    autoTimer = setInterval(autoImport, autoSeconds * 1000);

}

/** Re-imports the bracket from the selected site, quietly */
async function autoImport() {

    if (autoBusy) return; // last fetch hasn't come back yet

    // rebuilding the encounters mid-edit would eat what's being typed
    if (bEncountersDiv.contains(document.activeElement)) return;

    autoBusy = true;

    try {

        const { getActiveImporter } = await import("./Importers.mjs");
        const result = await getActiveImporter().fetchTop8Sets();

        if (result.success) {
            await applyImportedBracket(result.bracket);
            if (autoFailed) displayNotif("Auto import is working again");
            autoFailed = false;
        } else if (!autoFailed) {
            // say it once, then stay quiet until it recovers
            autoFailed = true;
            displayNotif(`Auto import failed: ${result.error}`);
        }

    } finally {
        autoBusy = false;
    }

}

/** Stores the auto import interval, or sends it to the main GUI */
async function saveAuto() {

    if (inside.electron) {
        const { settings } = await import("./Settings.mjs");
        await settings.save("bracketAutoImport", autoSeconds);
    } else {
        // remote GUIs have no settings file; it travels with the bracket
        updateBracket(true);
    }

}


/**
 * Replaces the preset list and redraws it
 * @param {Array} presets - List of {round, text, score} objects
 */
function setPresets(presets) {

    if (!Array.isArray(presets)) return; // nothing saved yet, keep the starters

    colorPresets = presets.slice(0, maxPresets).map(preset => ({
        round: readHex(preset.round) || defaultColors.round,
        text: readHex(preset.text) || defaultColors.text,
        score: readHex(preset.score) || defaultColors.score
    }));

    drawPresets();

}

/** Fills the preset row with a clickable swatch for each saved preset */
function drawPresets() {

    bPresetList.innerHTML = "";

    if (!colorPresets.length) {
        const emptyText = document.createElement('span');
        emptyText.id = "bracketPresetEmpty";
        emptyText.innerHTML = "None saved yet";
        bPresetList.appendChild(emptyText);
    }

    for (let i = 0; i < colorPresets.length; i++) {

        const preset = colorPresets[i];

        const wrapper = document.createElement('div');
        wrapper.className = "bPresetWrap";

        const swatch = document.createElement('button');
        swatch.className = "bPreset";
        // each color gets its own stripe so the whole preset is visible at once
        swatch.style.background = `linear-gradient(${preset.round} 0% 34%, ` +
            `${preset.text} 34% 67%, ${preset.score} 67% 100%)`;
        swatch.setAttribute("title",
            `Round ${preset.round}
Players ${preset.text}
Score ${preset.score}`);
        swatch.addEventListener("click", () => {setColors(preset, true)});

        const delButt = document.createElement('span');
        delButt.className = "bPresetDel";
        delButt.innerHTML = "×";
        delButt.setAttribute("title", "Delete this color preset");
        delButt.addEventListener("click", () => {deletePreset(i)});

        wrapper.appendChild(swatch);
        wrapper.appendChild(delButt);
        bPresetList.appendChild(wrapper);

    }

}

/** Stores the colors currently on the pickers as a new preset */
function addPreset() {

    // no point in having the same three colors twice
    const repeated = colorPresets.some(preset => preset.round == bracketColors.round &&
        preset.text == bracketColors.text && preset.score == bracketColors.score);
    if (repeated) return displayNotif("These colors are already a preset");

    if (colorPresets.length >= maxPresets) {
        return displayNotif(`Only ${maxPresets} color presets can be saved`);
    }

    colorPresets.push({...bracketColors});
    drawPresets();
    savePresets();
    displayNotif("Color preset saved");

}

/**
 * Removes a preset from the list
 * @param {Number} index - Position of the preset to delete
 */
function deletePreset(index) {

    colorPresets.splice(index, 1);
    drawPresets();
    savePresets();

}

/** Writes the preset list to the settings file, or sends it to the main GUI */
async function savePresets() {

    if (inside.electron) {
        const { settings } = await import("./Settings.mjs");
        await settings.save("bracketColorPresets", colorPresets);
    } else {
        // remote GUIs have no settings file; the presets travel with the bracket
        updateBracket(true);
    }

}

/**
 * Grabs a color from anywhere on the screen, outside this app included
 * @param {String} type - round, text or score
 * @param {HTMLElement} butt - The button that was clicked
 */
async function pickFromScreen(type, butt) {

    let hex;

    if (inside.electron) {
        // chromium's own eyedropper cant see past this window, so electron
        // screenshots every monitor and we click on that instead. that takes
        // a moment, so say something is happening while we wait for it
        butt.classList.add("bColorPickBusy");
        const { pickScreenColor } = await import("./IPC.mjs");
        try {
            hex = await pickScreenColor();
        } finally {
            butt.classList.remove("bColorPickBusy");
        }
    } else if (window.EyeDropper) {
        // remote GUIs run on a real browser, which does have a proper one
        try {
            const result = await new window.EyeDropper().open();
            hex = result.sRGBHex;
        } catch (e) { return } // they hit escape
    }

    hex = readHex(hex);
    if (!hex) return;

    setColors({[type]: hex}, true);

}

/**
 * Applies a set of colors to the pickers and the local bracket object
 * @param {Object} colors - Any of round, text and score as hex strings
 * @param {Boolean} send - Save and push the new colors to everyone
 */
function setColors(colors, send) {

    for (const type in bColorInputs) {
        if (colors && colors[type]) bracketColors[type] = readHex(colors[type]) || bracketColors[type];
        bColorInputs[type].style.backgroundColor = bracketColors[type];
        bHexInputs[type].value = bracketColors[type];
    }

    if (send) {
        saveColor();
        updateBracket(true);
    }

}

/**
 * Turns whatever was typed into a #rrggbb color, if it is one
 * @param {String} value - Hex code, with or without the #, 3 or 6 digits
 * @returns The color, or an empty string if it can't be read
 */
function readHex(value) {

    const hex = String(value ?? "").trim().replace(/^#/, "");

    if (!/^([0-9a-f]{3}|[0-9a-f]{6})$/i.test(hex)) return "";

    // #abc is the same color as #aabbcc
    const full = hex.length == 3 ? [...hex].map(digit => digit + digit).join("") : hex;

    return `#${full.toLowerCase()}`;

}

/**
 * Takes the color typed into one of the hex boxes
 * @param {String} type - round, text or score
 * @param {Boolean} store - Also write it to the settings file
 */
function hexChange(type, store) {

    const hex = readHex(bHexInputs[type].value);

    if (!hex) {
        // half typed codes are normal, only put the box back when they're done
        if (store) bHexInputs[type].value = bracketColors[type];
        return;
    }

    bracketColors[type] = hex;
    bColorInputs[type].style.backgroundColor = hex;
    if (store) bHexInputs[type].value = hex;

    if (store) saveColor();

    clearTimeout(colorSendTimer);
    colorSendTimer = setTimeout(() => {updateBracket(true)}, 100);

}

/**
 * Stores and broadcasts a color the user just picked
 * @param {String} type - round, text or score
 * @param {String} hex - The new color, as #rrggbb
 * @param {Boolean} store - Also write it to the settings file
 */
function colorChange(type, hex, store) {

    bracketColors[type] = hex;
    bColorInputs[type].style.backgroundColor = hex;
    bHexInputs[type].value = hex;

    if (store) saveColor();

    // the picker fires on every mouse move, so don't flood the clients
    clearTimeout(colorSendTimer);
    colorSendTimer = setTimeout(() => {updateBracket(true)}, 100);

}

/** Writes the current colors to the settings file (electron only) */
async function saveColor() {

    if (!inside.electron) return;

    const { settings } = await import("./Settings.mjs");
    await settings.save("bracketColors", {...bracketColors});

}


/**
 * Creates encounter divs for the bracket section when changing round
 * @param {Boolean} - If we're on the same round as before
 */
async function createEncounters(sameRound) {

    // first of all, save current contents to object
    if (!sameRound && bracketPlayers[0]) { // not same as previous round and not first run
        updateLocalBracket(true);
    }

    // garbage collector does not unload shaders for some reason
    for (let i = 0; i < bracketPlayers.length; i++) {
        bracketPlayers[i].unloadShader();
    }

    bEncountersDiv.innerHTML = "";
    bracketPlayers.length = 0;
    
    for (let i = 0; i < bracketData[bRoundSelect.value].length; i++) {

        bracketPlayers.push(new PlayerBracket(i));
        
        // new encounter div
        const newEnc = document.createElement('div');
        newEnc.className = "bEncounter";

        // character select for choosing the icon
        const charSelect = bracketPlayers[i].charDiv;

        // player tag
        const tagInp = document.createElement('input');
        tagInp.classList = "bTagInp bInput textInput mousetrap";
        tagInp.setAttribute("placeholder", "Tag");
        tagInp.setAttribute("spellcheck", "false");
        bracketPlayers[i].tagInp = tagInp;

        // player name
        const pFinderPos = document.createElement('div');
        pFinderPos.classList = "finderPosition";
        const nameInp = document.createElement('input');
        nameInp.classList = "bNameInp bInput textInput mousetrap";
        nameInp.setAttribute("placeholder", "Player Name");
        nameInp.setAttribute("spellcheck", "false");
        bracketPlayers[i].nameInp = nameInp;
        pFinderPos.appendChild(nameInp);

        // score
        const scoreInp = document.createElement('input');
        scoreInp.classList = "bScoreInp bInput textInput mousetrap";
        scoreInp.setAttribute("placeholder", "Score");
        bracketPlayers[i].scoreInp = scoreInp;

        // typing anything in here sends the bracket out on its own
        tagInp.addEventListener("input", () => {scheduleBracketSend()});
        nameInp.addEventListener("input", () => {scheduleBracketSend()});
        scoreInp.addEventListener("input", () => {scheduleBracketSend()});

        // add it all up
        newEnc.appendChild(charSelect);
        newEnc.appendChild(tagInp);
        newEnc.appendChild(pFinderPos);
        newEnc.appendChild(scoreInp);

        // set the current bracket data
        bracketPlayers[i].setName(bracketData[bRoundSelect.value][i].name);
        bracketPlayers[i].setTag(bracketData[bRoundSelect.value][i].tag);
        bracketPlayers[i].setScore(bracketData[bRoundSelect.value][i].score);
        await bracketPlayers[i].charChange(bracketData[bRoundSelect.value][i].character);
        bracketPlayers[i].skinChange(bracketData[bRoundSelect.value][i].skin);
        bracketPlayers[i].setFinderListeners();

        if (i%2 == 0) {

            // create a new bracket group
            const groupDiv = document.createElement('div');
            groupDiv.classList = "bEncounterGroup";
            bEncountersDiv.appendChild(groupDiv);

            // create that pair container
            const pairDiv = document.createElement('div');
            pairDiv.classList = "bEncounterPair";
            groupDiv.appendChild(pairDiv);

            // add the encounter
            pairDiv.appendChild(newEnc);

            // also add the copy from game button
            const copyFromButt = document.createElement('button');
            copyFromButt.classList = "bCopyGameButt";
            copyFromButt.innerHTML = '<div class="pInfoIconCont"><load-svg src="SVGs/Arrow.svg" class="pInfoIcon"></load-svg></div>'
            copyFromButt.setAttribute("title", "Copy values from current game data");
            copyFromButt.setAttribute("num", i);
            copyFromButt.addEventListener("click", copyFromGameToBracket);
            groupDiv.appendChild(copyFromButt);

        } else {
            // if everything already exists, just append the encounter
            document.getElementsByClassName("bEncounterPair")[Math.floor(i/2)].appendChild(newEnc);
        }
        
    }

    previousRound = bRoundSelect.value;

}


/** Pastes the current game data to the clicked bracket encounter */
async function copyFromGameToBracket() {
    
    const num = Number(this.getAttribute("num"));

    for (let i = 0; i < 2; i++) {
        bracketPlayers[num+i].setName(players[i].getName());
        bracketPlayers[num+i].setTag(players[i].tag);
        bracketPlayers[num+i].setScore(scores[i].getScore());
        await bracketPlayers[num+i].charChange(players[i].char, true);
        bracketPlayers[num+i].skinChange(players[i].skin);
    }

}


/**
 * Updates the bracket with current data, then sends it
 * @param {Boolean} startup - Won't show a "bracket updated" notification if true
 */
export async function updateBracket(startup) {
    
    // save the current info
    updateLocalBracket();
    bracketData.colors = {...bracketColors};
    bracketData.colorPresets = colorPresets;
    bracketData.autoImport = autoSeconds;

    // time to send it away
    if (inside.electron) {

        // clear possibly remote data
        bracketData.id = "bracket";
        bracketData.message = "";

        // update data and send it
        const ipc = await import("./IPC.mjs");
        ipc.updateBracketData(JSON.stringify(bracketData, null, 2));
        ipc.sendBracketData();
        ipc.sendRemoteBracketData();
        if (!startup) displayNotif("Bracket has been updated");

    } else {

        // add remote data
        bracketData.id = "";
        bracketData.message = "remoteBracket";

        // annnnd send it
        const remote = await import("./Remote Requests.mjs");
        remote.sendRemoteData(bracketData);

    }

}

/**
 * Updates the local bracket object without sending it to clients
 * @param {Boolean} previous - To update as previous round data
*/
function updateLocalBracket(previous) {

    const roundToUpdate = previous ? previousRound : bRoundSelect.value;

    // for each encounter currently shown
    for (let i = 0; i < bracketPlayers.length; i++) {
        // modify local bracket object with current data
        bracketData[roundToUpdate][i] = {
            name : bracketPlayers[i].getName() || "-",
            tag: bracketPlayers[i].getTag(),
            character: bracketPlayers[i].char,
            skin: bracketPlayers[i].skin,
            iconSrc: bracketPlayers[i].iconBrowserSrc || bracketPlayers[i].iconSrc,
            score: bracketPlayers[i].getScore() || "-"
        }
    }

}


/**
 * Replaces current bracket object with the one recieved remotely
 * @param {Object} newBracket - Data to replace current bracket
*/
export async function replaceBracket(newBracket) {

    bracketData = newBracket;

    // the sender may have changed the overlay colors or the presets too
    setColors(newBracket.colors, false);
    setPresets(newBracket.colorPresets);
    setAuto(newBracket.autoImport);
    if (inside.electron) {
        // one at a time; concurrent saves read a stale file and clobber it
        await saveColor();
        await savePresets();
        await saveAuto();
    }

    await createEncounters(true);

    displayNotif("Bracket was remotely updated");

}


/** Pulls the event's last rounds off the selected site and fills the bracket */
async function importFromProvider() {

    const { getActiveImporter, getActiveName } = await import("./Importers.mjs");
    const source = getActiveName();

    bImportButt.disabled = true;
    displayNotif(`Importing top 8 from ${source}...`);

    if (inside.electron) {

        const result = await getActiveImporter().fetchTop8Sets();

        bImportButt.disabled = false;
        if (result.success) {
            await applyImportedBracket(result.bracket);
            displayNotif(`Imported ${result.setsFound} sets from "${result.phaseName}"`);
        } else {
            displayNotif(`${source} import failed: ${result.error}`);
        }

    } else {

        // the token lives on the electron side, so it does the fetching for us.
        // the filled bracket comes back on its own as a regular bracket update
        const remote = await import("./Remote Requests.mjs");
        const { settings } = await import("./Settings.mjs");
        remote.sendRemoteData({
            message: "remoteBracketImport",
            source: settings.getImportSource(),
            slug: settings.getImportSlug(),
            event: settings.getImportEvent()
        });

    }

}

/**
 * Re-enables the import button and reports what the electron side found
 * @param {Object} result - Result object from fetchTop8Sets()
 */
export async function handleBracketImportResult(result) {

    bImportButt.disabled = false;

    if (result.success) {
        displayNotif(`Imported ${result.setsFound} sets from "${result.phaseName}"`);
    } else {
        const { getActiveName } = await import("./Importers.mjs");
        displayNotif(`${getActiveName()} import failed: ${result.error}`);
    }

}

/**
 * Overwrites the bracket with imported round data, then sends it out
 * @param {Object} newRounds - Bracket rounds as built by fetchTop8Sets()
*/
export async function applyImportedBracket(newRounds) {

    for (const round in newRounds) {

        if (!bracketData[round]) continue;

        for (let i = 0; i < newRounds[round].length; i++) {

            const oldPlayer = bracketData[round][i];
            const newPlayer = newRounds[round][i];

            // start.gg knows nothing about characters, so hold on to whatever
            // was picked for a slot as long as the same player is still in it
            if (oldPlayer && newPlayer.name != "-" && oldPlayer.name == newPlayer.name) {
                newPlayer.character = oldPlayer.character;
                newPlayer.skin = oldPlayer.skin;
                newPlayer.iconSrc = oldPlayer.iconSrc;
            }

            bracketData[round][i] = newPlayer;

        }

    }

    // redraw the round we're looking at, then push everything to the clients
    await createEncounters(true);
    await updateBracket(true);

}
