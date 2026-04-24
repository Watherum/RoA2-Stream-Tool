/** @type {WebSocket} */
let webSocket;

let id = "";
/** @type {({Object}) => {void}} */
let updateFucnt;

const errorDiv = document.getElementById('connErrorDiv');

const BASE_PORT = 8080;
const MAX_PORT_RANGE = 10; // scans 8080–8089
let portOffset = 0;
let wasConnected = false;

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

	// change this to the IP of where the GUI is being used for remote control
	webSocket = new WebSocket(`ws://localhost:${BASE_PORT + portOffset}?id=${id}`);
	webSocket.onopen = () => { // if it connects successfully

		wasConnected = true;

		// everytime we get data from the server (the GUI)
		webSocket.onmessage = function (event) {

            // use the function from init
            updateFucnt(JSON.parse(event.data));

        }

		// hide error message in case it was up
		errorDiv.style.display = 'none';

	}

	// if the connection closes, wait for it to reopen
	webSocket.onclose = () => {errorWebsocket()}

}

function errorWebsocket() {

	// show error message
	errorDiv.style.display = 'flex';
	// delete current webSocket
	webSocket = null;

	if (wasConnected) {
		// server dropped — retry the same port first
		wasConnected = false;
	} else {
		// connection refused — try the next port
		portOffset = (portOffset + 1) % MAX_PORT_RANGE;
	}

	// we will attempt to reconect every 5 seconds
	setTimeout(() => {
		startWebsocket();
	}, 5000);

}
