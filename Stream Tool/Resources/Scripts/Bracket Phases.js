import { initWebsocket } from "./Utils/WebSocket.mjs";

// draws any start.gg or parry.gg bracket the GUI sends over, as a column per round

const PLAYER_SIZE = 28;
const TAG_SIZE = 16;
const MAX_SCALE = 1.5;     // small brackets don't need to fill the whole screen
const SCREEN_W = 1920 * .95;
const SCREEN_H = 1080 - 200; // room above and below for the phase name

const fadeOutTime = .3;
const fadeInTime = .3;

const content = document.getElementById("content");
const fit = document.getElementById("fit");
const viewTitle = document.getElementById("viewTitle");
const viewQualifier = document.getElementById("viewQualifier");

// the names Bracket.html gives the rounds of a top 8, in the order they're played
const TOP8_LABELS = {
    winners: ["Winners Semis", "Winners Finals"],
    grand: ["Grand Finals", "True Finals"],
    losers: ["Losers Top 8", "Losers Quarters", "Losers Semis", "Losers Finals"]
};

let top8 = false; // is the bracket on screen a top 8?

let shownStructure = null; // what's on screen, so score changes don't re-fade it
let renderToken = 0;       // a newer update cancels an older one that's still fading

// the overlay gets its own data channel, separate from the top 8 bracket
initWebsocket("bracketviewer", updateData);

async function updateData(data) {

    updateColors(data.colors);

    const rounds = data.rounds || [];
    const structure = JSON.stringify([
        data.name, data.side, data.round, data.align,
        // True Finals showing up mid-bracket counts as a new layout
        rounds.map(round => [round.round, round.sets.length, !!round.hidden])
    ]);

    const token = ++renderToken;
    const changed = structure != shownStructure;

    // new bracket, side or round: fade the old one away first
    if (changed && shownStructure !== null) {
        await fadeOut(content);
        if (token != renderToken) return; // a newer update took over
    }
    shownStructure = structure;

    render(data);
    await document.fonts.ready;
    if (token != renderToken) return;
    shrinkNames();
    fitToScreen();

    if (changed) fadeIn(content);

}

// text colors, as chosen on the GUI's bracket editor
function updateColors(colors) {

    if (!colors) return;

    const root = document.documentElement;
    if (colors.round) root.style.setProperty("--roundColor", colors.round);
    if (colors.text) root.style.setProperty("--textColor", colors.text);
    if (colors.score) root.style.setProperty("--scoreColor", colors.score);

}

/** Rebuilds the whole bracket from the data */
function render(data) {

    fit.replaceChildren();
    viewTitle.textContent = data.name || "";
    viewQualifier.textContent = data.qualifier || "";
    content.dataset.align = data.align || "center";

    const all = data.rounds || [];
    top8 = labelTop8(all, data.phase);
    fit.classList.toggle("top8", top8);

    const rounds = all.filter(round => matchesFilter(round, data));
    if (!rounds.length) return;

    // winners (and grand finals) up top, losers underneath. with only the
    // losers side showing, grand finals have to share its row
    const topRow = rounds.filter(round => round.side == "winners" ||
        (round.side == "grand" && data.side != "losers"));
    const bottomRow = rounds.filter(round => !topRow.includes(round));

    for (const row of [topRow, bottomRow]) {
        if (!row.length) continue;
        const rowEl = document.createElement("div");
        rowEl.className = "viewRow";
        for (const round of row) rowEl.appendChild(buildRound(round));
        fit.appendChild(rowEl);
    }

}

/**
 * Lays a top 8 out the way Bracket.html does: its last two winners rounds,
 * grand finals, and its last four losers rounds, under the same names.
 * Anything earlier (like winners quarters) isn't part of that layout
 * @param {Array} rounds - Every round of the bracket
 * @param {String} phase - Name of the phase they belong to
 * @returns {Boolean} true if this is a top 8
 */
function labelTop8(rounds, phase) {

    const ofSide = side => rounds.filter(round => round.side == side)
        .sort((a, b) => Math.abs(a.round) - Math.abs(b.round));
    const winners = ofSide("winners");
    const grand = ofSide("grand");
    const losers = ofSide("losers");

    // a phase called top 8, or a double elimination bracket of exactly 8 players
    const named = /top\s*8/i.test(phase || "");
    const shaped = losers.length == 4 && (winners.length == 2 || winners.length == 3);
    if (!(named || shaped) || winners.length < 2 || losers.length < 4 ||
        !grand.length || grand.length > 2) return false;

    const shown = {
        winners: winners.slice(-2),
        grand,
        losers: losers.slice(-4)
    };
    for (const round of [...winners, ...losers]) {
        if (!Object.values(shown).some(list => list.includes(round))) round.hidden = true;
    }
    for (const side in TOP8_LABELS) {
        shown[side].forEach((round, i) => round.label = TOP8_LABELS[side][i]);
    }

    return true;

}

/** Does this round pass the side and round filters? */
function matchesFilter(round, data) {

    // True Finals stays away until the bracket reset is actually needed
    if (round.hidden) return false;

    // grand finals show whichever side is picked
    if (data.side == "winners" && round.side == "losers") return false;
    if (data.side == "losers" && round.side == "winners") return false;

    return data.round == "all" || String(round.round) == String(data.round);

}

function buildRound(round) {

    const roundEl = document.createElement("div");
    roundEl.className = "round";

    const title = document.createElement("span");
    title.className = "roundTitle";
    title.textContent = round.label;
    roundEl.appendChild(title);

    const matches = document.createElement("div");
    matches.className = "matches";
    for (const set of round.sets) matches.appendChild(buildMatch(set));
    roundEl.appendChild(matches);

    return roundEl;

}

function buildMatch(set) {

    const encounter = document.createElement("div");
    encounter.className = "encounter";

    const [a, b] = set.players;
    const scoreA = Number(a.score);
    const scoreB = Number(b.score);
    // the loser fades back once the scores say who it was
    const decided = a.score !== "" && b.score !== "" &&
        Number.isFinite(scoreA) && Number.isFinite(scoreB) && scoreA != scoreB;

    set.players.forEach((player, i) => {
        // a DQ fades back like any loss
        const lost = player.score == "DQ" || decided && (i == 0 ? scoreA < scoreB : scoreB < scoreA);
        encounter.appendChild(buildPlayer(player, lost));
    });

    return encounter;

}

function buildPlayer(player, lost) {

    const row = document.createElement("div");
    row.className = "encounterRow";

    const playerDiv = document.createElement("div");
    playerDiv.className = "playerDiv" + (lost ? " lost" : "");

    const wrapper = document.createElement("div");
    wrapper.className = "playerWrapper";

    if (player.tag) {
        const tag = document.createElement("div");
        tag.className = "playerTag";
        tag.style.fontSize = `${TAG_SIZE}px`;
        tag.textContent = player.tag;
        wrapper.appendChild(tag);
    }

    const name = document.createElement("div");
    name.className = "playerName" + (player.name ? "" : " tbd");
    name.style.fontSize = `${PLAYER_SIZE}px`;
    name.textContent = player.name || "TBD";
    wrapper.appendChild(name);

    // same nudge Bracket.js gives the text box
    wrapper.style.transform = player.tag ? "translate(3px, -3px)" : "translate(3px, 0px)";

    playerDiv.appendChild(wrapper);

    const score = document.createElement("span");
    score.className = "score";
    score.textContent = player.score || "-";

    row.append(playerDiv, score);
    return row;

}

// text resize, keeps making the text smaller until it fits
function shrinkNames() {
    for (const wrapper of fit.getElementsByClassName("playerWrapper")) {
        while (wrapper.scrollWidth > wrapper.offsetWidth) {
            let shrunk = false;
            for (const child of wrapper.children) {
                const size = parseFloat(child.style.fontSize);
                if (size > 8) {
                    child.style.fontSize = `${size * .9}px`;
                    shrunk = true;
                }
            }
            if (!shrunk) break; // can't get any smaller
        }
    }
}

/** Scales the bracket down (or a little up) so it fills the screen without overflowing */
function fitToScreen() {

    fit.style.transform = "none";
    // a top 8 keeps the size Bracket.html gives it
    if (top8 || !fit.children.length) return;

    const scale = Math.min(SCREEN_W / fit.offsetWidth, SCREEN_H / fit.offsetHeight, MAX_SCALE);
    fit.style.transform = `scale(${scale})`;

}

// animations
async function fadeOut(el, dur = fadeOutTime) {
    el.style.animation = `fadeOut ${dur}s both`;
    await new Promise(resolve => setTimeout(resolve, dur * 1000));
}
function fadeIn(el, dur = fadeInTime) {
    el.style.animation = `fadeIn ${dur}s both`;
}
