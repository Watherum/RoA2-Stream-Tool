import { handleBracketImportResult, replaceBracket } from "./Bracket.mjs";
import { commFinder } from "./Finder/Comm Finder.mjs";
import { playerFinder } from "./Finder/Player Finder.mjs";
import { displayNotif } from "./Notifications.mjs";
import { updateGUI } from "./Remote Update.mjs";
import { settings } from "./Settings.mjs";
import { changeUpdateText, writeScoreboard } from "./Write Scoreboard.mjs";

let webSocket;
const updateRegion = document.getElementById('updateRegion');

// the ws server moves to the next free port if its configured one is taken,
// so we ask the http server that served this page where it actually landed
let wsPort = 8080;
async function findWsPort() {
    try {
        const res = await fetch("/wsport");
        const data = await res.json();
        if (data.wsPort) wsPort = data.wsPort;
    } catch (e) { /* older server, stick with the default */ }
}

export async function startWebsocket() {
    
    changeUpdateText("RECONNECTING");
    // remove the reconnect click listener
    updateRegion.removeEventListener("click", startWebsocket);

    await findWsPort();
    
	// we need to connect to the websocket server
	webSocket = new WebSocket("ws://"+window.location.hostname+":"+wsPort+"?id=remoteGUI");
	webSocket.onopen = () => { // if it connects successfully
        
        // everything will update everytime we get data from the server (the GUI)
		webSocket.onmessage = function (event) {
			const data = JSON.parse(event.data);
			if (data && data.heartbeat) return; // keepalive, nothing to render
			getData(data);
		}

        // request current data to the GUI
        sendRemoteData({message: "RemoteRequestData"});

	}

	// if the connection closes
	webSocket.onclose = () => {errorWebsocket()};

}
function errorWebsocket() {

    // show error message
    displayNotif("Connection error, please reconnect.");
    // delete current websocket
    webSocket = null;
    // change the update button to a reconnect buttion
    changeUpdateText("RECONNECT");
    updateRegion.removeEventListener("click", writeScoreboard);
    updateRegion.addEventListener("click", startWebsocket);

}

async function getData(data) {

    if (data.gamemode) { // if this is a GUI update
        
        await updateGUI(data);
        changeUpdateText("UPDATE");
        updateRegion.addEventListener("click", writeScoreboard)

    } else if (data.message == "updatePresets") {

        playerFinder.setPlayerPresets();
        commFinder.setCasterPresets();

    } else if (data.message == "toggleWs") {

        settings.toggleWs();

    } else if (data.message == "syncSetting") {

        settings.applySettingSync(data.setting, data.value);

    } else if (data.message == "startGGFetchResult") {

        settings.handleStartGGResult(data);

    } else if (data.message == "bracketImportResult") {

        handleBracketImportResult(data);

    } else if (data.message == "rescanPresetsResult") {

        settings.handleRescanPresetsResult();

    } else if (data.GrandFinals) { // if this is bracket data

        replaceBracket(data);

    }

}

export function sendRemoteData(data) {
    webSocket.send(JSON.stringify(data, null, 2));
}