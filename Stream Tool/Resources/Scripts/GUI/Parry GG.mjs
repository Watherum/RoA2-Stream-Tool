import { inside, stPath, BRACKET_SLOTS, blankBracketSlot, countryNameFromCode, countryCodeFromName } from "./Globals.mjs";
import { getPreset, saveManyPresets } from "./File System.mjs";

const PARRY_API = "https://grpcweb.parry.gg";
const TOURNAMENTS = "parrygg.services.TournamentService/GetTournaments";
const MATCHES = "parrygg.services.MatchService/GetMatches";
const PLACEMENTS = "parrygg.services.BracketService/GetBracketPlacements";

/** Round labels parry.gg uses, paired with the bracket round they fill */
const ROUND_LABELS = [
    ["TrueFinals",     /grand final.*(?:reset|second)/],
    ["GrandFinals",    /grand final/],
    ["WinnersFinals",  /winners final/],
    ["WinnersSemis",   /winners semi/],
    ["LosersFinals",   /losers final/],
    ["LosersSemis",    /losers semi/],
    ["LosersQuarters", /losers quarter/]
];

class ParryGG {

    #token = "";
    #slug = "";
    #event = "";
    /** Event slug picked out of a pasted url, used when no event is typed in */
    #slugEvent = "";
    /** @type {Map<string, number>} gamerTag (lowercase) → seed number */
    #seedMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → country name */
    #countryMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → sponsor tag */
    #tagMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → pronouns */
    #pronounMap = new Map();
    #loaded = false;

    setToken(token) { this.#token = token; }

    /** parry.gg addresses a tournament, so this is the tournament slug */
    setSlug(slug) {

        // parry urls read /<tournament>/<event>/main/bracket, and the scheme and
        // the www are both optional since operators paste whatever the bar shows
        const trimmed = String(slug ?? "").trim()
            .split(/[?#]/)[0]
            .replace(/^https?:\/\//, "")
            .replace(/^(?:www\.)?parry\.gg(?:\/|$)/, "")
            .replace(/^\/+|\/+$/g, "");

        const parts = trimmed.split("/").filter(Boolean);
        this.#slug = parts[0] ?? "";
        // a pasted bracket url names the event too, so remember it as a default
        this.#slugEvent = parts[1] ?? "";

    }

    /** Which event of the tournament to read, as an index, a slug, or "" to autodetect */
    setEvent(event) { this.#event = String(event ?? "").trim(); }

    isLoaded() { return this.#loaded; }
    getSeedCount() { return this.#seedMap.size; }

    /**
     * Returns the seed for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getSeed(name) {
        return this.#seedMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Returns the country for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getCountry(name) {
        return this.#countryMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Returns the sponsor tag for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getTag(name) {
        return this.#tagMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Returns the pronouns for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getPronouns(name) {
        return this.#pronounMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Calls a parry.gg endpoint. It speaks gRPC-Web, but every message is plain
     * JSON, so a normal fetch is all we need
     * @param {String} endpoint - Service and method, "parrygg.services.X/Y"
     * @param {Object} body - Request message, its fields are snake_case
     * @param {Boolean} optional - Return null instead of throwing if it doesn't exist
     */
    async #post(endpoint, body, optional = false) {

        if (!this.#token) throw new Error("No API key set.");

        let lastError = "";

        for (let attempt = 0; attempt < 4; attempt++) {

            const res = await fetch(`${PARRY_API}/${endpoint}`, {
                method: "POST",
                headers: {
                    "Content-Type": "application/json",
                    "X-API-KEY": this.#token
                },
                body: JSON.stringify(body)
            });

            if (res.ok) return await res.json();

            // methods that don't exist on this account or api version
            if ([404, 405, 501].includes(res.status)) {
                if (optional) return null;
                throw new Error(`${endpoint.split("/").pop()} is not available (${res.status}).`);
            }

            if (res.status == 401 || res.status == 403) {
                throw new Error("parry.gg rejected the API key.");
            }

            lastError = `HTTP ${res.status}`;

            // back off before retrying, the api gets grumpy if we hammer it
            if (res.status == 429 || res.status >= 500) {
                await new Promise(r => setTimeout(r, 400 * (attempt + 1)));
            } else {
                break;
            }

        }

        throw new Error(`Request failed (${lastError}).`);

    }

    /**
     * Finds the tournament this slug belongs to.
     * The documented custom_slug filter quietly returns nothing these days, so we
     * search by the name baked into the slug and match the real slug afterwards
     */
    async #getTournament() {

        if (!this.#slug) throw new Error("No tournament slug set.");

        const hasSlug = (t) => (t.slugs ?? []).some(s => (s.slug ?? s) == this.#slug);

        // try the documented lookup first, in case it starts working again
        const direct = await this.#post(TOURNAMENTS, { filter: { custom_slug: this.#slug } });
        if (direct?.tournaments?.length) return direct.tournaments[0];

        // parry slugs are "some-tournament-name-<8 hex>", so the name is right there
        const bare = this.#slug.replace(/-[0-9a-f]{8}$/, "");
        const guess = bare.replace(/-/g, " ");

        const found = await this.#post(TOURNAMENTS, { filter: { name: guess } });
        const list = found?.tournaments ?? [];
        if (!list.length) throw new Error(`No tournament found for "${this.#slug}".`);

        // the name search is fuzzy and returns plenty, so pin it down by slug
        const exact = list.find(hasSlug);
        if (exact) return exact;

        // last resort, a tournament whose name matches what the slug spelled out
        const named = list.find(t => (t.name ?? "").toLowerCase() == guess.toLowerCase());
        if (named) return named;

        throw new Error(`No tournament found for "${this.#slug}".`);

    }

    /**
     * Picks which event of a tournament to read
     * @param {Object} tournament - Tournament as returned by the API
     */
    #getEvent(tournament) {

        const events = tournament.events ?? [];
        if (!events.length) throw new Error(`"${tournament.name}" has no events.`);

        const describe = () => events
            .map((e, i) => `${i}: ${e.slug ?? e.name}`).join(", ");

        // nothing typed in, so prefer this tournament's Rivals 2 event
        const autodetect = () =>
            events.find(e => (e.game?.name ?? "").includes("Rivals of Aether II")) ?? events[0];

        // a typed event wins, but a pasted bracket url already named one for us
        const wanted = this.#event || this.#slugEvent;
        if (wanted === "") return autodetect();

        // an index into the event list
        if (/^\d+$/.test(wanted)) {
            const event = events[Number(wanted)];
            if (!event) throw new Error(`No event ${wanted}. Events are - ${describe()}`);
            return event;
        }

        // or the event's own slug
        const bySlug = events.find(e => e.slug == wanted);
        if (bySlug) return bySlug;

        // an event the operator typed is worth complaining about, but one we only
        // guessed out of their url is not, so fall back rather than fail the import
        if (!this.#event) return autodetect();
        throw new Error(`No event "${wanted}". Events are - ${describe()}`);

    }

    /**
     * Grabs every match of an event, following the cursor until parry runs out
     * @param {String} eventId - Event id to read matches from
     */
    async #getMatches(eventId) {

        const all = [];
        let cursor = "";

        do {

            const pagination = { pageSize: 50 };
            if (cursor) pagination.cursor = cursor;

            const data = await this.#post(MATCHES, {
                filter: { event: { id: eventId } },
                pagination
            });

            all.push(...(data?.matches ?? []));

            const page = data?.pagination ?? {};
            cursor = (page.hasMore ?? page.has_more)
                ? (page.nextCursor ?? page.next_cursor ?? "") : "";

        } while (cursor);

        return all;

    }

    /** Every bracket id under an event, across all of its phases */
    #bracketIds(event) {
        const ids = [];
        for (const phase of event.phases ?? []) {
            for (const bracket of phase.brackets ?? []) if (bracket.id) ids.push(bracket.id);
        }
        return ids;
    }

    /**
     * Pulls out the players a seed holds. parry gives one user for singles and
     * two or more for teams, and every one of them carries their own details
     * @param {Object} seed - Seed object from a match context, or a placement
     */
    #playersOfSeed(seed) {

        const entrant = seed?.eventEntrant?.entrant ?? {};
        const users = entrant.users ?? [];
        const seedNum = seed?.seed ?? seed?.eventEntrant?.seed ?? "";

        return users.map(user => ({
            gamerTag: (user.gamerTag ?? user.gamer_tag ?? "").trim(),
            tag: (user.sponsorName ?? user.sponsor_name ?? "").trim(),
            pronouns: (user.pronouns ?? "").trim(),
            country: countryNameFromCode(user.locationCountry ?? user.location_country),
            seed: seedNum
        })).filter(p => p.gamerTag);

    }

    /** The display name of a seed, joining team members together */
    #nameOfSeed(seed) {
        const players = this.#playersOfSeed(seed);
        if (players.length) return players.map(p => p.gamerTag).join(" / ");
        return (seed?.eventEntrant?.name ?? "").trim();
    }

    /** Fetches every entrant of the current event, with their seeds and details */
    async fetchSeeds() {

        this.#seedMap.clear();
        this.#countryMap.clear();
        this.#tagMap.clear();
        this.#pronounMap.clear();
        this.#loaded = false;

        try {

            const tournament = await this.#getTournament();
            const event = this.#getEvent(tournament);

            // matches carry the full entrant list, seeds and all
            const matches = await this.#getMatches(event.id);

            /** @type {Map<string, Object>} gamerTag (lowercase) → entrant details */
            const entrants = new Map();
            const collect = (players) => {
                for (const player of players) {
                    const key = player.gamerTag.toLowerCase();
                    const existing = entrants.get(key);
                    // keep whichever copy tells us the most
                    if (!existing) {
                        entrants.set(key, player);
                    } else {
                        if (!existing.seed && player.seed) existing.seed = player.seed;
                        if (!existing.tag) existing.tag = player.tag;
                        if (!existing.pronouns) existing.pronouns = player.pronouns;
                        if (!existing.country) existing.country = player.country;
                    }
                }
            }

            for (const context of matches) {
                for (const seed of context.seeds ?? []) collect(this.#playersOfSeed(seed));
            }

            // placements cover anyone the match list somehow missed
            for (const bracketId of this.#bracketIds(event)) {
                const data = await this.#post(PLACEMENTS, { id: bracketId }, true);
                for (const placement of data?.placements ?? []) {
                    collect(this.#playersOfSeed(placement));
                }
            }

            if (!entrants.size) {
                throw new Error(`No entrants found in "${event.name ?? event.slug}". The bracket may not be up yet.`);
            }

            for (const [key, player] of entrants) {
                if (player.seed) this.#seedMap.set(key, player.seed);
                if (player.country) this.#countryMap.set(key, player.country);
                if (player.tag) this.#tagMap.set(key, player.tag);
                if (player.pronouns) this.#pronounMap.set(key, player.pronouns);
            }

            this.#loaded = true;

            const allEntrants = [...entrants.values()];

            // create or update presets for all entrants
            let newPresets = 0;
            const newPresetObjects = [];
            if (inside.electron) {
                const entries = [];
                for (const entrant of allEntrants) {
                    const safeName = entrant.gamerTag.replace(/[\\/:*?"<>|]/g, '_');
                    const existing = getPreset("Player Info", safeName);
                    if (existing) {
                        // update existing preset with seed, country, tag, and pronouns
                        if (entrant.seed !== "") existing.seed = entrant.seed;
                        if (entrant.country) existing.country = entrant.country;
                        if (entrant.tag) existing.tag = entrant.tag;
                        if (entrant.pronouns) existing.pronouns = entrant.pronouns;
                        entries.push({ name: safeName, data: existing });
                    } else {
                        // create a new preset
                        const preset = {
                            name: entrant.gamerTag,
                            tag: entrant.tag,
                            pronouns: entrant.pronouns,
                            seed: entrant.seed,
                            country: entrant.country,
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

            // download missing flag images
            if (inside.electron) {
                const fs = require('fs');
                const uniqueCodes = new Set(
                    allEntrants.map(e => countryCodeFromName(e.country)).filter(Boolean)
                );
                for (const code of uniqueCodes) {
                    const flagPath = `${stPath.flags}/${code}.png`;
                    if (!fs.existsSync(flagPath)) {
                        try {
                            const res = await fetch(`https://flagcdn.com/w40/${code}.png`);
                            const buffer = Buffer.from(await res.arrayBuffer());
                            fs.writeFileSync(flagPath, buffer);
                        } catch (e) { /* skip on network error */ }
                    }
                }
            }

            return { success: true, count: this.#seedMap.size, newPresets, newPresetObjects };

        } catch (err) {
            return { success: false, error: err.message };
        }

    }

    /**
     * Pulls the event's bracket and lays its matches out as bracket data
     * @returns {Object} success, phaseName, setsFound and a bracket object, or an error
     */
    async fetchTop8Sets() {

        try {

            const tournament = await this.#getTournament();
            const event = this.#getEvent(tournament);

            const matches = await this.#getMatches(event.id);
            if (!matches.length) throw new Error(`No matches found in "${event.name ?? event.slug}".`);

            return {
                success: true,
                phaseName: event.name ?? event.slug ?? tournament.name,
                setsFound: matches.length,
                bracket: this.#mapMatchesToBracket(matches)
            };

        } catch (err) {
            return { success: false, error: err.message };
        }

    }

    /**
     * Turns an event's match list into this tool's top 8 bracket rounds.
     * parry.gg names every round outright, so unlike start.gg there is no
     * counting backwards to do, only the early losers rounds need ordering
     * @param {Array} matches - Match contexts as returned by the API
     */
    #mapMatchesToBracket(matches) {

        const label = (m) => (m.round?.label ?? "").toLowerCase();

        const bracket = {};
        const used = new Set();

        for (const [key, pattern] of ROUND_LABELS) {
            const round = matches.filter(m => !used.has(m) && pattern.test(label(m)));
            round.forEach(m => used.add(m));
            bracket[key] = this.#slotsFromMatches(round, BRACKET_SLOTS[key]);
        }

        // whatever losers round sits right before losers quarters feeds the top 8
        let topRound = -1;
        const numbered = new Map();
        for (const match of matches) {
            if (used.has(match)) continue;
            const found = label(match).match(/losers round (\d+)/);
            if (!found) continue;
            const number = Number(found[1]);
            if (!numbered.has(number)) numbered.set(number, []);
            numbered.get(number).push(match);
            if (number > topRound) topRound = number;
        }
        bracket.LosersTop8 = this.#slotsFromMatches(
            numbered.get(topRound) ?? [], BRACKET_SLOTS.LosersTop8
        );

        return bracket;

    }

    /**
     * Lays a round's matches out into the flat player slot list a bracket round uses
     * @param {Array} roundMatches - Match contexts belonging to a single round
     * @param {Number} slotCount - How many player slots that round holds
     */
    #slotsFromMatches(roundMatches, slotCount) {

        const slots = [];
        for (let i = 0; i < slotCount; i++) slots.push(blankBracketSlot());

        // parry labels matches A, B, C... going down the bracket, same as start.gg,
        // so that ordering keeps encounters where the operator expects them
        const ordered = [...roundMatches].sort((a, b) =>
            String(a.match?.identifier ?? a.match?.id ?? "")
                .localeCompare(String(b.match?.identifier ?? b.match?.id ?? ""), undefined, { numeric: true })
        );

        for (let i = 0; i < ordered.length && i * 2 < slotCount; i++) {

            const context = ordered[i];
            const seeds = new Map((context.seeds ?? []).map(s => [s.id, s]));
            const matchSlots = context.match?.slots ?? [];

            for (let j = 0; j < 2; j++) {

                // parry carries a slot's position in its own field, not by order
                const slot = matchSlots.find(s => (s.slot ?? 0) == j);
                if (!slot) continue;
                const target = slots[i * 2 + j];

                // a seed we can't resolve means that seat hasn't been decided yet
                const seed = seeds.get(slot.seedId ?? slot.seed_id);
                if (seed) {
                    const players = this.#playersOfSeed(seed);
                    target.name = this.#nameOfSeed(seed) || "-";
                    // singles keep their sponsor, a team name stands on its own
                    if (players.length == 1) target.tag = players[0].tag;
                }

                if (slot.state == "SLOT_STATE_DQ") {
                    target.score = "DQ";
                } else if (context.match?.state == "MATCH_STATE_COMPLETED") {
                    // only the winner is given a score, an unscored side lost with none
                    target.score = String(slot.score ?? 0);
                }

            }

        }

        return slots;

    }

}

export const parryGG = new ParryGG;
