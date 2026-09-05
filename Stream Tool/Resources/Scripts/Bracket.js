'use strict';

let bracketData;
let playerData = [];
const playerSize = '28px';
const tagSize = '16px';
const fadeOutTime = .3;
const fadeInTime = .3;
let webSocket;

class BracketPlayer {

    constructor(round, pos) {

        this.round = round;
        this.pos = pos;
        this.char;
        this.skin;

        // assign the html elements to variables
        this.nameEl = document.getElementById(round).getElementsByClassName("playerName")[pos];
        this.tagEl = document.getElementById(round).getElementsByClassName("playerTag")[pos];
        this.charEl = document.getElementById(round).getElementsByClassName("playerIcon")[pos];
        this.scoreEl = document.getElementById(round).getElementsByClassName("score")[pos];
    
    }

    update() {

        // text update
        if (this.nameEl.innerHTML != bracketData[this.round][this.pos].name ||
        this.tagEl.innerHTML != bracketData[this.round][this.pos].tag) {
            this.updateName();
        }

        // score update
        if (this.scoreEl.innerHTML !== bracketData[this.round][this.pos].score) {
            this.updateScore();
        }

        // character update
        if (this.char != bracketData[this.round][this.pos].character &&
        this.skin != bracketData[this.round][this.pos].skin) {
            this.updateChar();
        }
        
    }

    updateName() {
        
        fadeOut(this.nameEl.parentElement).then( () => {

            this.nameEl.style.fontSize = playerSize;
            this.nameEl.innerHTML = bracketData[this.round][this.pos].name;
            this.tagEl.style.fontSize = tagSize;
            this.tagEl.innerHTML = bracketData[this.round][this.pos].tag;

            // remove tag from flow if not visible
            if (this.tagEl.innerHTML == "") {
                this.tagEl.style.display = "none";
                this.tagEl.parentElement.style.transform = "translate(3px, 0px)";
            } else {
                this.tagEl.style.display = "block";
                this.tagEl.parentElement.style.transform = "translate(3px, -3px)";
            }

            resizeText(this.nameEl.parentElement);
            fadeIn(this.nameEl.parentElement);

        });

    }

    updateScore() {

        this.scoreEl.innerHTML = bracketData[this.round][this.pos].score;
        this.updateScoreColor();

        // this will activate text recolor for the other player
        const rivalEncounter = this.pos % 2 ? this.pos-1 : this.pos+1;
        playerData[this.round][rivalEncounter].updateScoreColor();

    }
    updateScoreColor() {
        // makes our code cleaner
        const rivalEncounter = this.pos % 2 ? this.pos-1 : this.pos+1;
        const homeScore = this.scoreEl.innerHTML;
        const awayScore = bracketData[this.round][rivalEncounter].score;

        // names stay white either way, but the loser's icon still greys out
        if (homeScore == awayScore) {
            this.charEl.style.filter = "grayscale(0)"
        } else if (Number.isFinite(Number(homeScore)) &&
        (homeScore > awayScore || !Number.isFinite(Number(awayScore)))) {
            this.charEl.style.filter = "grayscale(0)"
        } else {
            this.charEl.style.filter = "grayscale(1)"
        }
    }

    updateChar() {

        fadeOut(this.charEl).then( () => {
            this.charEl.src = bracketData[this.round][this.pos].iconSrc;
            // hide character icon if none
            if (bracketData[this.round][this.pos].character == "None") {
                this.charEl.style.display = "none";
            } else {
                this.charEl.style.display = "block";
            }
            fadeIn(this.charEl);
        });
        this.char = bracketData[this.round][this.pos].character;
        this.skin = bracketData[this.round][this.pos].skin;

    }

};


// and here is where we add all the player references
playerData = {
    "WinnersSemis": [],
    "WinnersFinals" : [],
    "GrandFinals": [],
    "TrueFinals": [],
    "LosersTop8": [],
    "LosersQuarters": [],
    "LosersSemis": [],
    "LosersFinals": [],
}
addBracketPlayer("WinnersSemis", 4);
addBracketPlayer("WinnersFinals", 2);
addBracketPlayer("GrandFinals", 2);
addBracketPlayer("TrueFinals", 2);
addBracketPlayer("LosersTop8", 4);
addBracketPlayer("LosersQuarters", 4);
addBracketPlayer("LosersSemis", 2);
addBracketPlayer("LosersFinals", 2);
function addBracketPlayer(round, times) {
    for (let i = 0; i < times; i++) {
        playerData[round].push(new BracketPlayer(round, i));
    }
}



// connection tuning (mirrors Utils/WebSocket.mjs)
const BASE_PORT = 8080;
const MAX_PORT_RANGE = 10;   // scans 8080–8089
const CONNECT_TIMEOUT = 1500;   // give up on a hung attempt
const IDENTIFY_TIMEOUT = 1500;  // server must prove it's the GUI this fast
const SCAN_INTERVAL = 250;      // first few retries stay snappy
const SCAN_INTERVAL_MAX = 5000; // then back off (see backoff note below)
const RECONNECT_INTERVAL = 750; // poll the known port while the GUI restarts
const RELOCK_AFTER = 8000;      // ms of failing the locked port before rescanning
const HEARTBEAT_TIMEOUT = 8000; // no traffic for this long means a dead link

let portOffset = 0;
let lockedPort = null;   // offset we last connected on; null while searching
let lockLostSince = 0;   // timestamp the locked port started failing
let identified = false;  // has the current socket proven it's the stream tool?
let skipPort = false;    // something answered here but wasn't the GUI
let scanDelay = SCAN_INTERVAL; // grows while we search, reset on success
let altPort = 0;         // which non-base port to probe next

let connectTimer = null;
let identifyTimer = null;
let watchdogTimer = null;
let retryTimer = null;

// shows or hides the "can't connect" banner
function showError(show) {
	const el = document.getElementById('connErrorDiv');
	if (el) el.style.display = show ? 'flex' : 'none';
}

// first we will start by connecting with the GUI with a websocket
startWebsocket();
function startWebsocket() {

	clearTimeout(retryTimer);
	identified = false;

	// change this to the IP of where the GUI is being used for remote control
	const ws = new WebSocket(`ws://localhost:${BASE_PORT + portOffset}?id=bracket`);
	webSocket = ws;

	// if the attempt hangs (unreachable host, no refusal), bail and move on
	connectTimer = setTimeout(() => {
		if (ws === webSocket && ws.readyState !== WebSocket.OPEN) abandon(ws);
	}, CONNECT_TIMEOUT);

	ws.onopen = () => { // if it connects successfully

		if (ws !== webSocket) return; // event from a socket we already dropped

		clearTimeout(connectTimer);
		armWatchdog();

		// DON'T lock the port or hide the error yet. anything can be listening
		// in the scan range, so the server has to identify itself first
		identifyTimer = setTimeout(() => {
			if (ws !== webSocket || identified) return;
			skipPort = true; // not the GUI, keep looking
			abandon(ws);
		}, IDENTIFY_TIMEOUT);

	}

	// everything will update everytime we get data from the server (the GUI)
	ws.onmessage = (event) => {

		if (ws !== webSocket) return;

		armWatchdog(); // any traffic proves the link is alive

		let data;
		try {
			data = JSON.parse(event.data);
		} catch (e) {
			return; // not ours, or not even json
		}
		if (!data) return;

		if (data.streamTool) return confirmGui(); // the GUI's hello frame
		if (data.heartbeat) return; // keepalive, nothing to render
		if (!identified) confirmGui(); // older servers send no hello

		updateData(data);

	}

	// if the connection closes or errors, retry. these guards matter: a late
	// event from an abandoned socket must never touch the one that replaced it
	ws.onclose = () => { if (ws === webSocket) errorWebsocket(); };
	ws.onerror = () => { if (ws === webSocket) abandon(ws); };

}

// locks onto the current port now that the GUI has identified itself
function confirmGui() {
	identified = true;
	clearTimeout(identifyTimer);
	lockedPort = portOffset; // remember where the GUI lives
	lockLostSince = 0;
	skipPort = false;
	scanDelay = SCAN_INTERVAL; // found it, be snappy again next time
	showError(false); // hide error message in case it was up
}

// drops a socket for good and schedules the next attempt ourselves. close()
// alone can hang indefinitely on a half-open connection, which is exactly the
// case we need to recover from, so we never wait on onclose
function abandon(ws) {
	ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
	try { ws.close(); } catch (e) { /* already gone */ }
	if (ws === webSocket) errorWebsocket();
}

// restarts the no-data watchdog; fires a reconnect if the server goes quiet
function armWatchdog() {
	clearTimeout(watchdogTimer);
	watchdogTimer = setTimeout(() => {
		if (webSocket) abandon(webSocket);
	}, HEARTBEAT_TIMEOUT);
}

// The GUI sits on the base port in almost every case; the alternates only
// matter after an EADDRINUSE bump. So don't round robin evenly, spend three
// attempts on the base port for every one alternate probe. A GUI that just
// came up is then usually found on the next attempt rather than after a full
// ten port sweep, which matters a lot once the browser is throttling us.
// `force` overrides the bias, for a port that answered but wasn't the GUI
let baseTries = 0;
function nextPort(force) {
	if (!force) {
		if (portOffset === 0 && ++baseTries < 3) return;
		if (portOffset !== 0) { portOffset = 0; return; }
	}
	baseTries = 0;
	altPort = (altPort % (MAX_PORT_RANGE - 1)) + 1;
	portOffset = altPort;
}

// exponential backoff while searching, so we stop feeding the browser throttler
function nextScanDelay() {
	const delay = scanDelay;
	scanDelay = Math.min(scanDelay * 2, SCAN_INTERVAL_MAX);
	return delay;
}

function errorWebsocket() {

	clearTimeout(connectTimer);
	clearTimeout(identifyTimer);
	clearTimeout(watchdogTimer);

	// show error message
	showError(true);
	// delete current webSocket
	webSocket = null;
	identified = false;

	let delay;
	if (skipPort) {
		// someone answered here but never said they were the GUI, so never
		// lock onto them; write the port off and carry on scanning
		skipPort = false;
		lockedPort = null;
		lockLostSince = 0;
		nextPort(true); // don't come straight back to it
		delay = nextScanDelay();
	} else if (lockedPort !== null) {
		// we know where the GUI was — keep hammering that port while it restarts
		if (lockLostSince === 0) lockLostSince = Date.now();

		if (Date.now() - lockLostSince > RELOCK_AFTER) {
			// locked port stayed dead too long — the GUI must have moved, rescan
			lockedPort = null;
			lockLostSince = 0;
			nextPort();
			delay = nextScanDelay();
		} else {
			portOffset = lockedPort;
			delay = RECONNECT_INTERVAL;
		}
	} else {
		// never connected (or rescanning) — walk the range, backing off as we go
		nextPort();
		delay = nextScanDelay();
	}

	retryTimer = setTimeout(startWebsocket, delay);

}


// main loop
async function updateData(data) {

    // actual update
	bracketData = data;
    for (const i of iteratePlayerData()) {
        i.update();
    }

    // if true finals players exist, show true finals round
    if (bracketData["TrueFinals"][0].name != "-" || bracketData["TrueFinals"][1].name != "-") {
        if (window.getComputedStyle(document.getElementById("TrueFinals")).getPropertyValue("display") == "none") {
            document.getElementById("TrueFinals").style.display = "flex";
            resizeText(playerData[8].nameEl);
            resizeText(playerData[9].nameEl);
        }
    } else {
        document.getElementById("TrueFinals").style.display = "none";
    }
    
}
function* iteratePlayerData() {
    for(let key of Object.entries(playerData)) {
        for(let obj of key[1]) {
            yield obj;
        }
    }
}


// text resize, keeps making the text smaller until it fits
function resizeText(textEL) {
	const childrens = textEL.children;
	while (textEL.scrollWidth > textEL.offsetWidth) {
		if (childrens.length > 0) { //for tag+player texts
			Array.from(childrens).forEach((child) => {
				child.style.fontSize = getFontSize(child);
			});
		} else {
			textEL.style.fontSize = getFontSize(textEL);
		}
	}
}
// returns a smaller fontSize for the given element
function getFontSize(textElement) {
	return (parseFloat(textElement.style.fontSize.slice(0, -2)) * .90) + 'px';
}


// animations
async function fadeOut(itemID, dur = fadeOutTime) {
	itemID.style.animation = `fadeOut ${dur}s both`;
	// this function will return a promise when the animation ends
	await new Promise(resolve => setTimeout(resolve, dur * 1000)); // translate to miliseconds
}
function fadeIn(itemID, delay = 0, dur = fadeInTime) {
	itemID.style.animation = `fadeIn ${dur}s ${delay}s both`;
}
