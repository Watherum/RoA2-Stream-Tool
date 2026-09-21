import { inside } from "./Globals.mjs";
import { playersReady } from "./Player/Players.mjs";
import { updateGUI } from "./Remote Update.mjs";
import { buildScoreboardJson } from "./Write Scoreboard.mjs";

// keeps the Electron GUI and every remote GUI mirrored in real time, without
// touching the overlays (those still only change when someone hits update)

// every GUI polls its own state and sends only the fields that changed since
// the last time it synced, so two people editing different things at the
// same time won't stomp on each other. Electron acts as the hub, relaying
// whatever a remote sends to the rest of the remotes

const POLL_MS = 300;
const origin = inside.electron ? "electron" : "remote-" + Math.random().toString(36).slice(2);

let base = null; // state as of the last send or apply
let enabled = false;
let applying = false;
let queue = Promise.resolve();

setInterval(tick, POLL_MS);

/** GUI state stripped down to what a GUI can edit */
function snapshot() {
    try {
        const state = buildScoreboardJson();
        for (const p of state.player) {
            delete p.sc;
            delete p.vs;
        }
        delete state.id;
        delete state.socialNames;
        delete state.bestOfLabel;
        return JSON.parse(JSON.stringify(state));
    } catch (e) { // something is still loading
        return null;
    }
}

/** Starts sending live changes, taking the current state as the synced one */
export function startLiveSync() {
    base = snapshot();
    enabled = true;
}

/** Stops sending live changes (remote GUI lost its connection) */
export function stopLiveSync() {
    enabled = false;
}

/**
 * Applies a full GUI state (initial connection, update button) without
 * the poller catching it halfway through, then takes it as the synced state
 * @param {Object} data - Full game data
 */
export function applyFullState(data) {
    queue = queue.then(async () => {
        applying = true;
        try {
            await updateGUI(data);
        } finally {
            base = snapshot();
            applying = false;
        }
    });
    return queue;
}

/**
 * Handles live changes sent by another GUI
 * @param {Object} msg - liveDiff message
 */
export async function receiveLiveDiff(msg) {

    if (msg.origin == origin) return;

    // pass it along to the other remote GUIs
    if (inside.electron) {
        const ipc = await import("./IPC.mjs");
        ipc.sendLiveDiff(msg.origin, msg.changes);
    }

    queue = queue.then(async () => {
        const local = snapshot();
        if (!local || !base) return;
        applying = true;
        try {
            for (const [path, value] of msg.changes) {
                setPath(local, path, value);
                setPath(base, path, value);
            }
            await updateGUI(local, true);
        } catch (e) {
            console.error("Live sync failed to apply changes", e);
        } finally {
            applying = false;
        }
    });
    return queue;

}

async function tick() {

    if (!enabled || applying || !base || !playersReady()) return;

    const current = snapshot();
    if (!current) return;

    const changes = diff(base, current);
    if (!changes.length) return;
    base = current;

    if (inside.electron) {
        const ipc = await import("./IPC.mjs");
        ipc.sendLiveDiff(origin, changes);
    } else {
        const remote = await import("./Remote Requests.mjs");
        remote.sendRemoteData({ message: "liveDiff", origin, changes });
    }

}

/** Lists [path, value] pairs for every field that differs */
function diff(a, b, path = [], out = []) {
    const bothObjs = isObj(a) && isObj(b);
    const sameArrays = Array.isArray(a) && Array.isArray(b) && a.length == b.length;
    if (bothObjs || sameArrays) {
        const keys = new Set([...Object.keys(a), ...Object.keys(b)]);
        for (const key of keys) {
            diff(a[key], b[key], [...path, key], out);
        }
    } else if (JSON.stringify(a) !== JSON.stringify(b)) {
        out.push([path, b]);
    }
    return out;
}

function isObj(v) {
    return v !== null && typeof v == "object" && !Array.isArray(v);
}

function setPath(obj, path, value) {
    if (!path.length) return;
    let target = obj;
    for (let i = 0; i < path.length - 1; i++) {
        if (target[path[i]] == null) target[path[i]] = {};
        target = target[path[i]];
    }
    target[path[path.length - 1]] = value;
}
