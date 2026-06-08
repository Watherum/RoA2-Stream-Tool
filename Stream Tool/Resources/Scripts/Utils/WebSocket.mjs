/** @type {WebSocket} */
let webSocket;

let id = "";
/** @type {({Object}) => {void}} */
let updateFucnt;

const errorDiv = document.getElementById('connErrorDiv');

const BASE_PORT = 8080;
const MAX_PORT_RANGE = 10; // scans 8080–8089

// how long to wait for a single connection attempt before giving up and moving
// on (only matters for a hung attempt; a refused localhost port fails instantly)
const CONNECT_TIMEOUT = 1500;

// while searching for the GUI, hop ports quickly
const SCAN_INTERVAL = 250;

// once we've connected, the GUI almost always restarts on the SAME port, so we
// poll that locked port at a steady fast interval and reconnect the instant it
// comes back instead of wandering off to scan other ports
const RECONNECT_INTERVAL = 750;

// if the locked port stays dead this long, the GUI probably moved ports, so we
// give up the lock and rescan the whole range
const RELOCK_AFTER = 8000;

// the server sends a heartbeat every few seconds; if we stop hearing it the
// connection is silently dead (PC sleep, wifi blip, half-open TCP) so we force
// a reconnect instead of sitting frozen on a stale socket
const HEARTBEAT_TIMEOUT = 8000;

let portOffset = 0;
let lockedPort = null;   // offset we last connected on; null while searching
let lockLostSince = 0;   // timestamp the locked port started failing

let handled = false;     // guards against onclose+onerror double-firing
let connectTimer = null;
let watchdogTimer = null;
let retryTimer = null;

/**
 * Initializes the connection with the GUI
 * @param {String} id - Browser identifier
 * @param {({Object}) => {void}} functToUse - Data update function
 */
export function initWebsocket(dataType, functToUse) {
    id = dataType;
    updateFucnt = functToUse;
    startWebsocket();
}

/** Connects to the GUI and stays listening */
function startWebsocket() {

	clearTimeout(retryTimer);
	handled = false;

	// change this to the IP of where the GUI is being used for remote control
	webSocket = new WebSocket(`ws://localhost:${BASE_PORT + portOffset}?id=${id}`);

	// if the attempt hangs (unreachable host, no refusal), bail and move on
	connectTimer = setTimeout(() => {
		if (webSocket && webSocket.readyState !== WebSocket.OPEN) {
			webSocket.close(); // drives failAttempt via onclose
		}
	}, CONNECT_TIMEOUT);

	webSocket.onopen = () => { // if it connects successfully

		clearTimeout(connectTimer);
		lockedPort = portOffset; // remember where the GUI lives
		lockLostSince = 0;
		armWatchdog();

		// everytime we get data from the server (the GUI)
		webSocket.onmessage = function (event) {

			armWatchdog(); // any traffic proves the link is alive

			const data = JSON.parse(event.data);

			// heartbeats just keep the watchdog happy, no payload to render
			if (data && data.heartbeat) return;

			// use the function from init
			updateFucnt(data);

		}

		// hide error message in case it was up
		errorDiv.style.display = 'none';

	}

	// if the connection closes or errors, retry
	webSocket.onclose = () => failAttempt();
	webSocket.onerror = () => { if (webSocket) webSocket.close(); };

}

/** Restarts the no-data watchdog; fires a reconnect if the server goes quiet */
function armWatchdog() {
	clearTimeout(watchdogTimer);
	watchdogTimer = setTimeout(() => {
		// server went silent — drop the stale socket and reconnect
		if (webSocket) webSocket.close();
	}, HEARTBEAT_TIMEOUT);
}

/** Handles a failed/closed connection and schedules the next attempt */
function failAttempt() {

	if (handled) return; // onclose and onerror can both fire; only act once
	handled = true;

	clearTimeout(connectTimer);
	clearTimeout(watchdogTimer);

	// show error message
	errorDiv.style.display = 'flex';
	// delete current webSocket
	webSocket = null;

	let delay;
	if (lockedPort !== null) {
		// we know where the GUI was — keep hammering that port while it restarts
		if (lockLostSince === 0) lockLostSince = Date.now();

		if (Date.now() - lockLostSince > RELOCK_AFTER) {
			// locked port stayed dead too long — the GUI must have moved, rescan
			lockedPort = null;
			lockLostSince = 0;
			portOffset = (portOffset + 1) % MAX_PORT_RANGE;
			delay = SCAN_INTERVAL;
		} else {
			portOffset = lockedPort;
			delay = RECONNECT_INTERVAL;
		}
	} else {
		// never connected (or rescanning) — hop to the next port quickly
		portOffset = (portOffset + 1) % MAX_PORT_RANGE;
		delay = SCAN_INTERVAL;
	}

	retryTimer = setTimeout(startWebsocket, delay);

}
