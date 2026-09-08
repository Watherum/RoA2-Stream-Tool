import { inside, BRACKET_SLOTS, blankBracketSlot } from "./Globals.mjs";
import { getPreset, saveManyPresets } from "./File System.mjs";

const API_HOST = "api.challonge.com";
const BASE_PATH = "/v2.1";
const TOKEN_PATH = "/oauth/token";

/**
 * Challonge sits behind Cloudflare, which answers an unfamiliar user agent with
 * a bodyless 520 on both the token endpoint and the api. Any ordinary looking
 * string is accepted, but there must be one
 */
const USER_AGENT = "RoA2StreamTool/1.0 (+https://challonge.com)";

/** Challonge's own default page size is 25, 100 is what v1 accepted */
const PAGE_SIZE = 100;

/**
 * Scopes to ask the token endpoint for, best first. The docs disagree with
 * themselves about which scopes a client credentials grant will issue, so we
 * try the least privileged read set, then the server's own default, then the
 * broad one
 */
const SCOPES = [
    "me tournaments:read matches:read participants:read",
    null,
    "application:manage"
];

/** Url path segments that belong to the bracket view rather than to its slug */
const VIEW_SEGMENTS = new Set([
    "module", "standings", "log", "matches", "participants", "groups",
    "settings", "edit", "bracket", "brackets", "teams", "predictions"
]);

/**
 * Languages challonge serves its site in. A localised url puts one of these in
 * front of the slug ("challonge.com/fr/my-bracket"), and it looks exactly like
 * an organisation would, so it has to be named rather than guessed at
 */
const LOCALE_SEGMENTS = new Set([
    "en", "fr", "es", "de", "it", "pt", "pt_br", "ja", "ko", "zh_cn", "zh_tw",
    "ru", "tr", "pl", "nl", "no", "sv", "da", "fi", "cs", "hu", "id", "th", "vi"
]);

/** Losers rounds counting back from the losers final, and the slots they fill */
const LOSERS_DEPTH = ["LosersFinals", "LosersSemis", "LosersQuarters", "LosersTop8"];
/** Winners rounds counting back from the winners final */
const WINNERS_DEPTH = ["WinnersFinals", "WinnersSemis"];

class Challonge {

    /** Either a legacy v1 key, or "clientId:clientSecret" for oauth */
    #token = "";
    #slug = "";
    /** Bearer token minted from the client credentials, kept for this session */
    #bearer = "";
    /** When that bearer stops being good, as a unix timestamp in ms */
    #bearerExpiry = 0;
    /** Scope the token endpoint actually granted, for the 403 message */
    #scope = "";
    /** @type {Map<string, number>} player name (lowercase) -> seed number */
    #seedMap = new Map();
    /** @type {Map<string, string>} player name (lowercase) -> sponsor tag */
    #tagMap = new Map();
    #loaded = false;

    setToken(token) {
        const value = String(token ?? "").trim();
        // a new credential invalidates whatever it minted before
        if (value != this.#token) {
            this.#bearer = "";
            this.#bearerExpiry = 0;
            this.#scope = "";
        }
        this.#token = value;
    }

    /**
     * Challonge addresses a tournament by its url slug. An organisation's
     * bracket lives at both "myorg.challonge.com/slug" and
     * "challonge.com/myorg/slug", and the api wants those joined as "myorg-slug"
     */
    setSlug(slug) {

        let text = String(slug ?? "").trim()
            .split(/[?#]/)[0]
            .replace(/^https?:\/\//i, "");

        // a community subdomain names half of the identifier
        let subdomain = "";
        const host = text.match(/^(?:([A-Za-z0-9_-]+)\.)?challonge\.com(?:\/|$)/i);
        if (host) {
            text = text.slice(host[0].length);
            const sub = (host[1] ?? "").toLowerCase();
            if (sub && sub != "www") subdomain = sub;
        }

        const parts = text.replace(/^\/+|\/+$/g, "").split("/").filter(Boolean);

        // a localised url reads "challonge.com/fr/my-bracket", and that language
        // sits exactly where an organisation would, so drop it before reading on
        if (parts.length > 1 && LOCALE_SEGMENTS.has(parts[0].toLowerCase())) parts.shift();

        if (!parts.length) {
            this.#slug = "";
            return;
        }

        if (subdomain) {
            this.#slug = `${subdomain}-${parts[0]}`;
        } else if (parts.length > 1 && !VIEW_SEGMENTS.has(parts[1].toLowerCase())) {
            // "challonge.com/<org>/<slug>", not a copied "/standings" url
            this.#slug = `${parts[0]}-${parts[1]}`;
        } else {
            this.#slug = parts[0];
        }

    }

    isLoaded() { return this.#loaded; }
    getSeedCount() { return this.#seedMap.size; }

    /**
     * Returns the seed for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getSeed(name) {
        return this.#seedMap.get(name.toLowerCase()) ?? "";
    }

    /** Challonge has no user accounts, so it knows nobody's country */
    getCountry() { return ""; }

    /**
     * Returns the sponsor tag for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getTag(name) {
        return this.#tagMap.get(name.toLowerCase()) ?? "";
    }

    /** Challonge has no user accounts, so it knows nobody's pronouns */
    getPronouns() { return ""; }

    /**
     * Sends one request to challonge.
     * Electron gets node's https, because the api sends no cors headers and a
     * renderer fetch from a file:// page would be refused before it left
     * @param {Object} options - Method, path, headers and body of the request
     */
    async #request({ method = "GET", path, headers = {}, body = "" }) {

        if (inside.electron) {

            const https = require('https');

            return await new Promise((resolve, reject) => {

                const req = https.request({
                    host: API_HOST, path, method,
                    headers: { ...headers, "User-Agent": USER_AGENT }
                }, res => {
                    let data = "";
                    res.setEncoding("utf8");
                    res.on("data", chunk => data += chunk);
                    res.on("end", () => resolve({ status: res.statusCode, text: data }));
                });

                req.on("error", err => reject(new Error(err.message)));
                req.setTimeout(20000, () => {
                    req.destroy();
                    reject(new Error("Challonge did not answer in time."));
                });

                if (body) req.write(body);
                req.end();

            });

        }

        const res = await fetch(`https://${API_HOST}${path}`, {
            method,
            headers: { ...headers, "User-Agent": USER_AGENT },
            body: body || undefined
        });
        return { status: res.status, text: await res.text() };

    }

    /** Mints a bearer token out of the client credentials, or reuses the last one */
    async #getBearer() {

        if (this.#bearer && Date.now() < this.#bearerExpiry) return this.#bearer;

        const separator = this.#token.indexOf(":");
        const clientId = this.#token.slice(0, separator);
        const clientSecret = this.#token.slice(separator + 1);
        const errors = [];

        for (const scope of SCOPES) {

            const form = new URLSearchParams({
                grant_type: "client_credentials",
                client_id: clientId,
                client_secret: clientSecret
            });
            if (scope) form.set("scope", scope);
            const encoded = form.toString();

            const res = await this.#request({
                method: "POST",
                path: TOKEN_PATH,
                headers: {
                    "Content-Type": "application/x-www-form-urlencoded",
                    "Accept": "application/json",
                    "Content-Length": encoded.length
                },
                body: encoded
            });

            let payload = {};
            try { payload = JSON.parse(res.text); } catch (e) { /* not json */ }

            if (res.status == 200 && payload.access_token) {
                this.#bearer = payload.access_token;
                // a minute of slack, so a token expiring mid import is renewed now
                this.#bearerExpiry = Date.now() + ((payload.expires_in ?? 3600) - 60) * 1000;
                this.#scope = payload.scope ?? scope ?? "";
                return this.#bearer;
            }

            errors.push(payload.error_description ?? payload.error ?? `HTTP ${res.status}`);

        }

        throw new Error(`Challonge refused the client credentials (${errors[0]}).`);

    }

    /** Auth and content headers for an api call */
    async #headers() {

        if (!this.#token) throw new Error("No API key set.");

        const base = {
            "Content-Type": "application/vnd.api+json",
            "Accept": "application/json"
        };

        // a client id and secret pasted together mean oauth, anything else is
        // one of the legacy v1 keys the api still accepts
        if (this.#token.includes(":")) {
            // "v2", not "Bearer". Challonge reads this header to pick a scheme
            // and answers an unrecognised one with a bodyless 401
            base["Authorization-Type"] = "v2";
            base["Authorization"] = `Bearer ${await this.#getBearer()}`;
        } else {
            base["Authorization-Type"] = "v1";
            base["Authorization"] = this.#token;
        }

        return base;

    }

    /**
     * Reads one v2.1 endpoint, raising with whatever the server complained about
     * @param {String} path - Endpoint under /v2.1, "tournaments/x.json"
     * @param {Object} params - Query string parameters
     */
    async #get(path, params = {}) {

        const query = new URLSearchParams(params).toString();
        const res = await this.#request({
            path: `${BASE_PATH}/${path}${query ? `?${query}` : ""}`,
            headers: await this.#headers()
        });

        if (res.status == 401) {
            throw new Error("Challonge rejected the credentials. Check the API Key in settings.");
        }
        if (res.status == 403) {
            throw new Error(`Challonge refused access, the token was granted "${this.#scope || "no scope"}". A tournament made outside this application may not be visible to it.`);
        }
        if (res.status == 404) {
            throw new Error(`No tournament at "${this.#slug}". A private bracket is only visible to the account the key belongs to.`);
        }
        if (res.status != 200) {
            throw new Error(`Request failed (HTTP ${res.status}).`);
        }

        try {
            return JSON.parse(res.text);
        } catch (e) {
            throw new Error("Challonge returned something that wasn't JSON.");
        }

    }

    /**
     * Every page of a collection endpoint, flattened.
     * Challonge doesn't reliably report a total, so the loop ends on the first
     * short page. The cap guards an endpoint that ignores "page" entirely
     * @param {String} path - Endpoint under /v2.1
     */
    async #getAll(path) {

        const out = [];

        for (let page = 1; page <= 100; page++) {
            const payload = await this.#get(path, { page, per_page: PAGE_SIZE });
            const rows = payload?.data;
            if (!Array.isArray(rows)) return rows ? [rows] : out;
            out.push(...rows);
            if (rows.length < PAGE_SIZE) break;
        }

        return out;

    }

    /**
     * The attribute bag of a json:api resource.
     * Parts of the published v2.1 reference still serve the old flat v1 shape,
     * so a resource that arrives without an "attributes" bag is read as is
     * @param {Object} obj - Resource as returned by the api
     */
    #attrs(obj) {
        if (!obj || typeof obj != "object") return {};
        return (obj.attributes && typeof obj.attributes == "object") ? obj.attributes : obj;
    }

    /**
     * The id of a to-one relationship, as a string
     * @param {Object} obj - Resource as returned by the api
     * @param {String} name - Relationship name, "winner" or "player1"
     */
    #relId(obj, name) {
        const data = obj?.relationships?.[name]?.data;
        if (data?.id != null) return String(data.id);
        for (const bag of [this.#attrs(obj), obj ?? {}]) {
            const value = bag[`${name}_id`];
            if (value != null && value !== "") return String(value);
        }
        return "";
    }

    /** The id of a resource, as a string */
    #id(obj) {
        const value = obj?.id ?? this.#attrs(obj).id;
        return value == null ? "" : String(value);
    }

    /** The tournament resource this slug points at */
    async #getTournament() {

        if (!this.#slug) throw new Error("No tournament slug set.");

        const payload = await this.#get(`tournaments/${this.#slug}.json`);
        let data = payload?.data;
        if (Array.isArray(data)) data = data[0];
        if (!data) throw new Error(`No tournament found for "${this.#slug}".`);

        return data;

    }

    /**
     * A participant's display name, as the TO typed it or as they registered
     * @param {Object} participant - Participant resource
     */
    #participantName(participant) {
        const bag = this.#attrs(participant);
        for (const key of ["name", "display_name", "username", "challonge_username"]) {
            const value = typeof bag[key] == "string" ? bag[key].trim() : "";
            if (value) return value;
        }
        return "";
    }

    /**
     * Splits "NG | Azul" into its sponsor and the name under it. Challonge has
     * no user accounts, so the entry name is the only place a tag can come from
     * @param {String} name - Participant name as challonge holds it
     */
    #splitSponsor(name) {
        const parts = String(name ?? "").split(" | ");
        if (parts.length > 1) {
            return { tag: parts[0].trim(), name: parts.slice(1).join(" | ").trim() };
        }
        return { tag: "", name: String(name ?? "").trim() };
    }

    /** Fetches every entrant of the tournament, with their seeds */
    async fetchSeeds() {

        this.#seedMap.clear();
        this.#tagMap.clear();
        this.#loaded = false;

        try {

            const tournament = await this.#getTournament();
            const participants = await this.#getAll(
                `tournaments/${this.#id(tournament)}/participants.json`
            );

            const entrants = [];
            for (const participant of participants) {
                const bag = this.#attrs(participant);
                const { tag, name } = this.#splitSponsor(this.#participantName(participant));
                if (!name) continue;
                entrants.push({ gamerTag: name, tag, seed: bag.seed ?? "" });
            }

            if (!entrants.length) {
                const title = this.#attrs(tournament).name ?? this.#slug;
                throw new Error(`No entrants found in "${title}". The bracket may not be up yet.`);
            }

            for (const entrant of entrants) {
                const key = entrant.gamerTag.toLowerCase();
                if (entrant.seed) this.#seedMap.set(key, entrant.seed);
                if (entrant.tag) this.#tagMap.set(key, entrant.tag);
            }

            this.#loaded = true;

            // create or update presets for all entrants
            let newPresets = 0;
            const newPresetObjects = [];
            if (inside.electron) {
                const entries = [];
                for (const entrant of entrants) {
                    const safeName = entrant.gamerTag.replace(/[\\/:*?"<>|]/g, '_');
                    const existing = getPreset("Player Info", safeName);
                    if (existing) {
                        // challonge knows nothing else about a player, so only
                        // the fields it does know are allowed to overwrite
                        if (entrant.seed !== "") existing.seed = entrant.seed;
                        if (entrant.tag) existing.tag = entrant.tag;
                        entries.push({ name: safeName, data: existing });
                    } else {
                        const preset = {
                            name: entrant.gamerTag,
                            tag: entrant.tag,
                            pronouns: "",
                            seed: entrant.seed,
                            country: "",
                            socials: {},
                            characters: []
                        };
                        entries.push({ name: safeName, data: preset });
                        newPresetObjects.push(preset);
                        newPresets++;
                    }
                }
                await saveManyPresets("Player Info", entries);
            }

            return { success: true, count: this.#seedMap.size, newPresets, newPresetObjects };

        } catch (err) {
            return { success: false, error: err.message };
        }

    }

    /**
     * Pulls the tournament's bracket and lays its last rounds out as bracket data
     * @returns {Object} success, phaseName, setsFound and a bracket object, or an error
     */
    async fetchTop8Sets() {

        try {

            const tournament = await this.#getTournament();
            const bag = this.#attrs(tournament);
            const id = this.#id(tournament);

            const participants = await this.#getAll(`tournaments/${id}/participants.json`);
            const matches = await this.#getAll(`tournaments/${id}/matches.json`);

            if (!matches.length) {
                throw new Error(`No matches found in "${bag.name ?? this.#slug}".`);
            }

            /** @type {Map<string, Object>} participant id -> name and tag */
            const names = new Map();
            for (const participant of participants) {
                names.set(this.#id(participant),
                    this.#splitSponsor(this.#participantName(participant)));
            }

            return {
                success: true,
                phaseName: bag.name ?? this.#slug,
                setsFound: matches.length,
                bracket: this.#mapMatchesToBracket(matches, names)
            };

        } catch (err) {
            return { success: false, error: err.message };
        }

    }

    /**
     * The two participant ids of a match, in slot order.
     * v2.1 gives a match no player relationship at all, its participants turn up
     * as "points_by_participant" instead, whose order is the real slot order.
     * The documented v1 shape is still tried first, so either response works
     * @param {Object} match - Match resource
     */
    #matchPlayers(match) {

        const p1 = this.#relId(match, "player1");
        const p2 = this.#relId(match, "player2");
        if (p1 && p2) return [p1, p2];

        const points = this.#attrs(match).points_by_participant;
        if (Array.isArray(points) && points.length >= 2) {
            const ids = points.slice(0, 2)
                .map(e => e?.participant_id)
                .filter(v => v != null)
                .map(String);
            if (ids.length == 2) return ids;
        }

        return [p1, p2];

    }

    /**
     * The score each side of a match put up, in slot order.
     * "scores" is a string like "2-1" that reads in slot order, and is not
     * winner first. Anything unscored comes back as ""
     * @param {Object} match - Match resource
     */
    #matchScores(match) {

        const bag = this.#attrs(match);

        // a set played over several games lists every one of them, so they're summed
        const points = bag.points_by_participant;
        if (Array.isArray(points) && points.length >= 2) {
            const totals = points.slice(0, 2).map(entry => {
                const scores = entry?.scores;
                if (Array.isArray(scores)) {
                    return scores.reduce((sum, s) => sum + (Number(s) || 0), 0);
                }
                return Number(entry?.score);
            });
            if (totals.every(t => Number.isFinite(t))) return totals.map(String);
        }

        const text = bag.scores ?? bag.scores_csv ?? "";
        // a csv holds one "1-0" per game, but only the set score is shown
        const first = String(text).split(",")[0].trim();
        const parts = first.split("-").map(p => p.trim());
        if (parts.length == 2 && parts.every(p => /^\d+$/.test(p))) return parts;

        return ["", ""];

    }

    /**
     * Works out which bracket round each match belongs to.
     *
     * Challonge has no notion of a "Grand Final": a match carries a signed round
     * number, positive on the winners side and negative on the losers side, and
     * nothing else. So a round is named by how far it sits from the end of its
     * own side, which is the only thing that holds for every bracket size
     * @param {Array} matches - Match resources of the whole tournament
     * @returns {Map<Object, String>} match -> bracket round key
     */
    #labelRounds(matches) {

        const labels = new Map();
        const round = (m) => Number(this.#attrs(m).round) || 0;
        // a two stage tournament runs pools first, and their rounds count from 1
        // inside each group, so they can't share the bracket's maths
        const bracket = matches.filter(m => !this.#attrs(m).group_id);

        const winners = bracket.filter(m => round(m) > 0);
        const losers = bracket.filter(m => round(m) < 0);

        if (losers.length) {
            const deepest = Math.max(...losers.map(m => -round(m)));
            for (const match of losers) {
                const key = LOSERS_DEPTH[deepest - (-round(match))];
                if (key) labels.set(match, key);
            }
        }

        if (!winners.length) return labels;

        const counts = new Map();
        for (const match of winners) {
            counts.set(round(match), (counts.get(round(match)) ?? 0) + 1);
        }

        // a losers side proves this is double elimination, whatever the declared
        // type says, and single elimination has no grand final reset to find
        if (!losers.length) {
            const last = Math.max(...counts.keys());
            for (const match of winners) {
                const key = WINNERS_DEPTH[last - round(match)];
                if (key) labels.set(match, key);
            }
            return labels;
        }

        // a double elimination bracket narrows 8 -> 4 -> 2 -> 1 and then keeps
        // making single match rounds for the grand final and its reset, so the
        // winners final is the *first* single match round, not the highest
        const singles = [...counts.keys()].filter(r => counts.get(r) == 1).sort((a, b) => a - b);
        const winnersFinal = singles.find(r => counts.get(r - 1) != 1) ?? Math.max(...counts.keys());

        // whatever sits above it is a grand final, then a reset, in play order
        const finals = winners.filter(m => round(m) > winnersFinal)
            .sort((a, b) => this.#playOrder(a) - this.#playOrder(b));
        if (finals[0]) labels.set(finals[0], "GrandFinals");
        if (finals[1]) labels.set(finals[1], "TrueFinals");

        for (const match of winners) {
            if (round(match) > winnersFinal) continue;
            const key = WINNERS_DEPTH[winnersFinal - round(match)];
            if (key) labels.set(match, key);
        }

        return labels;

    }

    /** Where a match sits in the running order, for sorting a round */
    #playOrder(match) {
        return Number(this.#attrs(match).suggested_play_order) || 0;
    }

    /**
     * Turns a tournament's match list into this tool's top 8 bracket rounds
     * @param {Array} matches - Match resources as returned by the api
     * @param {Map} names - Participant id -> its name and sponsor tag
     */
    #mapMatchesToBracket(matches, names) {

        const labels = this.#labelRounds(matches);
        const bracket = {};

        for (const key in BRACKET_SLOTS) {
            const round = matches.filter(m => labels.get(m) == key);
            bracket[key] = this.#slotsFromMatches(round, BRACKET_SLOTS[key], names);
        }

        return bracket;

    }

    /**
     * Lays a round's matches out into the flat player slot list a round uses
     * @param {Array} roundMatches - Matches belonging to a single round
     * @param {Number} slotCount - How many player slots that round holds
     * @param {Map} names - Participant id -> its name and sponsor tag
     */
    #slotsFromMatches(roundMatches, slotCount, names) {

        const slots = [];
        for (let i = 0; i < slotCount; i++) slots.push(blankBracketSlot());

        // challonge letters its matches A, B, C... going down the bracket, same
        // as the other sites, so that ordering puts encounters where the
        // operator expects them
        const ordered = [...roundMatches].sort((a, b) =>
            String(this.#attrs(a).identifier ?? "")
                .localeCompare(String(this.#attrs(b).identifier ?? ""), undefined, { numeric: true })
            || this.#playOrder(a) - this.#playOrder(b)
        );

        for (let i = 0; i < ordered.length && i * 2 < slotCount; i++) {

            const match = ordered[i];
            const bag = this.#attrs(match);
            const players = this.#matchPlayers(match);
            const scores = this.#matchScores(match);
            const complete = String(bag.state ?? "").toLowerCase().startsWith("complete");
            const forfeited = !!(bag.forfeited ?? bag.forfeit);

            for (let j = 0; j < 2; j++) {

                const target = slots[i * 2 + j];
                // a seat with no participant hasn't been decided yet
                const entrant = names.get(players[j]);
                if (entrant) {
                    target.name = entrant.name || "-";
                    target.tag = entrant.tag;
                }

                if (forfeited && this.#relId(match, "winner") != players[j]) {
                    target.score = "DQ";
                } else if (complete && scores[j] !== "") {
                    target.score = scores[j];
                }

            }

        }

        return slots;

    }

}

export const challonge = new Challonge;
