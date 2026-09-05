import { applyImportedBracket, replaceBracket, updateBracket } from './Bracket.mjs';
import { deletePreset, rescanPresetCache, savePreset } from './File System.mjs';
import { commFinder } from './Finder/Comm Finder.mjs';
import { playerFinder } from './Finder/Player Finder.mjs';
import { updateGUI } from './Remote Update.mjs';
import { settings } from './Settings.mjs';
import { startGG } from './Start GG.mjs';
import { writeScoreboard } from './Write Scoreboard.mjs';

const ipc = require('electron').ipcRenderer;

// ipc is the communication bridge between us and nodejs
// we can send signals to do node exclusive stuff,
// and recieve messages from it with data

// node code is the only thing thats embbeded on the executable
// meaning that to see it or modify it, you will need to
// be able to build this project yourself... check the repo's wiki!


// we will store data to send to the browsers here
let gameData;
let bracketData;


// when a new browser connects
ipc.on('requestData', () => {

    // send the current (not updated) data
    sendGameData();
    sendBracketData();

})

/** Sends current game data object to websocket clients */
export function sendGameData() {
    ipc.send('sendData', gameData);
}
export function updateGameData(data) {
    gameData = data;
}
/** Sends current bracket object to websocket clients */
export function sendBracketData() {
    ipc.send('sendData', bracketData);
}
export function updateBracketData(data) {
    bracketData = data;
}

/** Sends current game data to remote GUIs */
export function sendRemoteGameData() {
    ipc.send("sendData", JSON.stringify(remoteID(gameData), null, 2));
}
/** Sends current bracket data to remote GUIs */
export function sendRemoteBracketData() {
    ipc.send("sendData", JSON.stringify(remoteID(bracketData), null, 2));
}
/**
 * Changes the ID of an object so a Remote GUI can receive it
 * @param {Object} data - Data that will change its ID
 * @returns Data with changed ID
 */
function remoteID(data) {
    const newData = JSON.parse(data);
    newData.id = "remoteGUI";
    return newData;
}

/**
 * Sends the signal to Electron to keep the window
 * on top of others (or not) at all times
 * @param {Boolean} value - Verdadero o Falso
 */
export function alwaysOnTop(value) {
    ipc.send('alwaysOnTop', value);
}

/**
 * Sends the signal to Electron to unlock window resizing
 * @param {Boolean} value - Si o No
 */
export function resizable(value) {
    ipc.send('resizable', value);
}

/** Sends the signal to Electron to restore window dimensions */
export function defaultWindowDimensions() {
    ipc.send('defaultWindow');
}

// when we get data remotely, update GUI
ipc.on('remoteGuiData', async (event, data) => {

    const jsonData = JSON.parse(data);
    
    if (jsonData.message == "RemoteUpdateGUI") {

        // when we get data from remote GUIs
        await updateGUI(jsonData);
        writeScoreboard();

    } else if (jsonData.message == "RemoteRequestData") {

        // when remote GUIs request data
        sendRemoteGameData();
        sendRemoteBracketData();
        
    } else if (jsonData.message == "RemoteSaveJson") {

        // when remote GUIs request a preset save, path looks like "/<folder>/<name>"
        const filePath = jsonData.path;
        delete jsonData.path;
        delete jsonData.message;

        const [, folderName, name] = filePath.match(/^\/(.+)\/([^/]+)$/);
        await savePreset(folderName, name, jsonData);

        // update current presets
        await playerFinder.setPlayerPresets();
        await commFinder.setCasterPresets();

    } else if (jsonData.message == "RemoteDeletePreset") {

        // when remote GUIs request a preset deletion
        await deletePreset(jsonData.name);

        // update current presets
        await playerFinder.setPlayerPresets();
        await commFinder.setCasterPresets();

    } else if (jsonData.message == "syncSetting") {

        // when a remote GUI toggles a synced setting, apply it here and relay
        // it to every other remote GUI so nobody is left out of sync
        settings.applySettingSync(jsonData.setting, jsonData.value);
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "syncSetting", setting: jsonData.setting, value: jsonData.value}, null, 2));

    } else if (jsonData.message == "toggleWs") {

        // when a remote GUI clicks on the workshop toggle
        settings.setWs(jsonData.value);
        await settings.toggleWs();
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "toggleWs"}, null, 2));
    
    } else if (jsonData.message == "remoteBracket") {

        // yep you guessed it
        await replaceBracket(jsonData);
        updateBracket(true);

    } else if (jsonData.message == "remoteStartGGFetch") {

        startGG.setSlug(jsonData.slug);
        const result = await startGG.fetchSeeds();
        if (result.success) {
            await playerFinder.setPlayerPresets();
            await commFinder.setCasterPresets();
            ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "updatePresets"}, null, 2));
        }
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "startGGFetchResult", ...result}, null, 2));

    } else if (jsonData.message == "remoteBracketImport") {

        // remote GUIs have no token, so we fetch the top 8 here and let the
        // filled bracket reach them through the usual bracket broadcast
        if (jsonData.slug) startGG.setSlug(jsonData.slug);
        const result = await startGG.fetchTop8Sets();
        if (result.success) await applyImportedBracket(result.bracket);
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "bracketImportResult", ...result}, null, 2));

    } else if (jsonData.message == "remoteRescanPresets") {

        await rescanPresetCache("Player Info");
        await playerFinder.setPlayerPresets();
        await commFinder.setCasterPresets();
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "updatePresets"}, null, 2));
        ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "rescanPresetsResult"}, null, 2));

    }

});

/** Sends a signal to remote GUIs so their update their preset lists */
export function updateRemotePresets() {
    ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "updatePresets"}, null, 2));
}

/** Broadcasts a settings toggle to all remote GUIs so they stay in sync */
export function sendSettingSync(setting, value) {
    ipc.send("sendData", JSON.stringify({id: "remoteGUI", message: "syncSetting", setting, value}, null, 2));
}