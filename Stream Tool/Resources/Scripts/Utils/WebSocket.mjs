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

// a port answering isn't proof it's the GUI, so after connecting we wait this
// long for the server to identify itself before writing the port off
const IDENTIFY_TIMEOUT = 1500;

// While searching we must NOT hammer. Chromium throttles websocket
// handshakes per renderer process with
//   delay = rand(1000,5000) * 2^min(p + f/(s+1), 16) / 65536 ms
// so with no successful connection yet (s=0), just 16 failures saturate
// the exponent and the BROWSER starts injecting 1-5s before every
// attempt. Retrying every 250ms forever just buries us in that penalty,
// so we back off instead (also what RFC 6455 7.2.3 asks for)
const SCAN_INTERVAL = 250;
const SCAN_INTERVAL_MAX = 5000;

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
let identified = false;  // has the current socket proven it's the stream tool?
let skipPort = false;    // something answered here but wasn't the GUI
let scanDelay = SCAN_INTERVAL; // grows while we search, reset on success
let altPort = 0;         // which non-base port to probe next

let connectTimer = null;
let identifyTimer = null;
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

/** Shows or hides the "can't connect" banner */
function showError(show) {
	if (errorDiv) errorDiv.style.display = show ? 'flex' : 'none';
}

/** Connects to the GUI and stays listening */
function startWebsocket() {

	clearTimeout(retryTimer);
	identified = false;

	// change this to the IP of where the GUI is being used for remote control
	const ws = new WebSocket(`ws://localhost:${BASE_PORT + portOffset}?id=${id}`);
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

	// everytime we get data from the server (the GUI)
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

		// the GUI's hello frame, this is the port we want
		if (data.streamTool) return confirmGui();

		// heartbeats just keep the watchdog happy, no payload to render
		if (data.heartbeat) return;

		// a real payload also proves it's the GUI (older servers send no hello)
		if (!identified) confirmGui();

		// use the function from init
		updateFucnt(data);

	}

	// if the connection closes or errors, retry. these guards matter: a late
	// event from an abandoned socket must never touch the one that replaced it
	ws.onclose = () => { if (ws === webSocket) failAttempt(); };
	ws.onerror = () => { if (ws === webSocket) abandon(ws); };

}

/** Locks onto the current port now that the GUI has identified itself */
function confirmGui() {
	identified = true;
	clearTimeout(identifyTimer);
	lockedPort = portOffset; // remember where the GUI lives
	lockLostSince = 0;
	skipPort = false;
	scanDelay = SCAN_INTERVAL; // found it, be snappy again next time
	showError(false); // hide error message in case it was up
}

/**
 * Drops a socket for good and schedules the next attempt ourselves.
 * close() alone can hang indefinitely on a half-open connection, which is
 * exactly the case we need to recover from, so we never wait on onclose
 * @param {WebSocket} ws - Socket to throw away
 */
function abandon(ws) {
	ws.onopen = ws.onmessage = ws.onclose = ws.onerror = null;
	try { ws.close(); } catch (e) { /* already gone */ }
	if (ws === webSocket) failAttempt();
}

/** Restarts the no-data watchdog; fires a reconnect if the server goes quiet */
function armWatchdog() {
	clearTimeout(watchdogTimer);
	watchdogTimer = setTimeout(() => {
		// server went silent — drop the stale socket and reconnect
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

/** Handles a failed/closed connection and schedules the next attempt */
function failAttempt() {

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
