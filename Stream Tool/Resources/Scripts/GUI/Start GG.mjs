import { stPath, inside, BRACKET_SLOTS, blankBracketSlot, countryCodeFromName } from "./Globals.mjs";
import { getPreset, saveManyPresets } from "./File System.mjs";

const STARTGG_API = "https://api.start.gg/gql/alpha";

const SEEDING_QUERY = `
query EventSeeding($slug: String!, $page: Int!, $perPage: Int!) {
  event(slug: $slug) {
    entrants(query: { page: $page, perPage: $perPage }) {
      pageInfo { totalPages }
      nodes {
        initialSeedNum
        participants {
          gamerTag
          prefix
          user { location { country } genderPronoun }
        }
      }
    }
  }
}`;

const PHASES_QUERY = `
query EventPhases($slug: String!) {
  event(slug: $slug) {
    id
    phases { id name phaseOrder }
  }
}`;

const PHASE_SETS_QUERY = `
query PhaseSets($phaseId: ID!, $page: Int!, $perPage: Int!) {
  phase(id: $phaseId) {
    name
    sets(page: $page, perPage: $perPage, sortType: ROUND) {
      pageInfo { totalPages }
      nodes {
        id
        identifier
        round
        fullRoundText
        state
        slots {
          entrant {
            name
            participants { gamerTag prefix }
          }
          standing { stats { score { value } } }
        }
      }
    }
  }
}`;

class StartGG {

    #token = "";
    #slug = "";
    /** @type {Map<string, number>} gamerTag (lowercase) → seed number */
    #seedMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → country */
    #countryMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → sponsor tag/prefix */
    #tagMap = new Map();
    /** @type {Map<string, string>} gamerTag (lowercase) → pronouns */
    #pronounMap = new Map();
    #loaded = false;

    setToken(token) { this.#token = token; }
    setSlug(slug) {
        // accept full start.gg URLs — extract "tournament/.../event/..." portion
        const match = slug.match(/tournament\/[^/]+\/event\/[^/?#]+/);
        this.#slug = match ? match[0] : slug.trim();
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

    /**
     * Returns the country for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getCountry(name) {
        return this.#countryMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Returns the sponsor tag/prefix for a given player name, or "" if not found
     * @param {String} name - Player gamerTag
     */
    getTag(name) {
        return this.#tagMap.get(name.toLowerCase()) ?? "";
    }

    /**
     * Returns the pronouns for a given player name, or "" if not found/set
     * @param {String} name - Player gamerTag
     */
    getPronouns(name) {
        return this.#pronounMap.get(name.toLowerCase()) ?? "";
    }

    /** Fetches all entrant seeds and countries from the current event slug */
    async fetchSeeds() {

        this.#seedMap.clear();
        this.#countryMap.clear();
        this.#tagMap.clear();
        this.#pronounMap.clear();
        this.#loaded = false;

        const perPage = 200;
        let page = 1;
        let totalPages = 1;
        const allEntrants = [];

        try {

            do {

                const res = await fetch(STARTGG_API, {
                    method: "POST",
                    headers: {
                        "Content-Type": "application/json",
                        "Authorization": `Bearer ${this.#token}`
                    },
                    body: JSON.stringify({
                        query: SEEDING_QUERY,
                        variables: { slug: this.#slug, page, perPage }
                    })
                });

                const json = await res.json();

                if (json.errors) throw new Error(json.errors[0].message);
                if (!json.data?.event) throw new Error("Event not found. Check the slug.");

                const entrants = json.data.event.entrants;
                totalPages = entrants.pageInfo.totalPages;

                for (const entrant of entrants.nodes) {
                    if (!entrant.participants?.length) continue;
                    for (const participant of entrant.participants) {
                        const key = participant.gamerTag.toLowerCase();
                        const country = participant.user?.location?.country || "";
                        const tag = participant.prefix || "";
                        const pronouns = participant.user?.genderPronoun || "";
                        if (entrant.initialSeedNum) this.#seedMap.set(key, entrant.initialSeedNum);
                        if (country) this.#countryMap.set(key, country);
                        if (tag) this.#tagMap.set(key, tag);
                        if (pronouns) this.#pronounMap.set(key, pronouns);
                        allEntrants.push({
                            gamerTag: participant.gamerTag,
                            seed: entrant.initialSeedNum || "",
                            country,
                            tag,
                            pronouns
                        });
                    }
                }

                page++;

            } while (page <= totalPages);

            this.#loaded = true;

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
                            pronouns: entrant.pronouns || "",
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

    /** Runs a GraphQL query against start.gg, throwing on any API error */
    async #gql(query, variables) {

        const res = await fetch(STARTGG_API, {
            method: "POST",
            headers: {
                "Content-Type": "application/json",
                "Authorization": `Bearer ${this.#token}`
            },
            body: JSON.stringify({ query, variables })
        });

        const json = await res.json();

        if (json.errors) throw new Error(json.errors[0].message);

        return json.data;

    }

    /**
     * Pulls the sets of the event's final phase and lays them out as bracket data
     * @returns {Object} success, phaseName, setsFound and a bracket object, or an error
     */
    async fetchTop8Sets() {

        try {

            if (!this.#slug) throw new Error("No event slug set.");

            // the top 8 always lives in the last phase of an event
            const data = await this.#gql(PHASES_QUERY, { slug: this.#slug });
            const phases = data?.event?.phases;
            if (!phases?.length) throw new Error("Event not found, or it has no phases. Check the slug.");
            const phase = [...phases].sort((a, b) => a.phaseOrder - b.phaseOrder).pop();

            // grab every set in there
            const sets = [];
            let page = 1;
            let totalPages = 1;
            do {
                const pData = await this.#gql(PHASE_SETS_QUERY, { phaseId: phase.id, page, perPage: 60 });
                const conn = pData?.phase?.sets;
                if (!conn) break;
                totalPages = conn.pageInfo.totalPages;
                sets.push(...conn.nodes);
                page++;
            } while (page <= totalPages);

            if (!sets.length) throw new Error(`No sets found in phase "${phase.name}".`);

            return {
                success: true,
                phaseName: phase.name,
                setsFound: sets.length,
                bracket: this.#mapSetsToBracket(sets)
            };

        } catch (err) {
            return { success: false, error: err.message };
        }

    }

    /**
     * Turns a phase's set list into this tool's top 8 bracket rounds
     * @param {Array} sets - Set nodes as returned by the start.gg API
     */
    #mapSetsToBracket(sets) {

        const text = (set) => (set.fullRoundText || "").toLowerCase();

        // grand finals sit in the winners bracket, so pull them out before
        // we start counting winners rounds backwards
        const grands = sets.filter(s => text(s).includes("grand final"));
        const reset = grands.find(s => /reset|second/.test(text(s)));
        const grandFinal = grands.find(s => s != reset);

        // start.gg numbers winners rounds upwards and losers rounds downwards,
        // so in both cases the final round is the one furthest from zero
        const byRound = (list) => {
            const map = new Map();
            for (const set of list) {
                if (!map.has(set.round)) map.set(set.round, []);
                map.get(set.round).push(set);
            }
            return map;
        }
        const wRounds = [...byRound(sets.filter(s => s.round > 0 && !grands.includes(s))).entries()]
            .sort((a, b) => b[0] - a[0]);
        const lRounds = [...byRound(sets.filter(s => s.round < 0)).entries()]
            .sort((a, b) => a[0] - b[0]);

        // the deep rounds are usually named outright, so trust the text when
        // it's there and fall back to counting back from the final round
        const pick = (rounds, rank, pattern) => {
            if (pattern) {
                for (const [, roundSets] of rounds) {
                    if (roundSets.every(s => pattern.test(text(s)))) return roundSets;
                }
            }
            return rounds[rank] ? rounds[rank][1] : [];
        }

        const bracket = {};
        const fill = (key, roundSets) => {
            bracket[key] = this.#slotsFromSets(roundSets, BRACKET_SLOTS[key]);
        }

        fill("WinnersFinals",  pick(wRounds, 0, /winners final/));
        fill("WinnersSemis",   pick(wRounds, 1, /winners semi/));
        fill("LosersFinals",   pick(lRounds, 0, /losers final/));
        fill("LosersSemis",    pick(lRounds, 1, /losers semi/));
        fill("LosersQuarters", pick(lRounds, 2, /losers quarter/));
        fill("LosersTop8",     pick(lRounds, 3));
        fill("GrandFinals",    grandFinal ? [grandFinal] : []);
        fill("TrueFinals",     reset ? [reset] : []);

        return bracket;

    }

    /**
     * Lays a round's sets out into the flat player slot list a bracket round uses
     * @param {Array} roundSets - Sets belonging to a single round
     * @param {Number} slotCount - How many player slots that round holds
     */
    #slotsFromSets(roundSets, slotCount) {

        const slots = [];
        for (let i = 0; i < slotCount; i++) {
            slots.push(blankBracketSlot());
        }

        // start.gg labels sets A, B, C... going down the bracket, so that
        // ordering keeps encounters where the operator expects them
        const ordered = [...roundSets].sort((a, b) => String(a.identifier ?? a.id)
            .localeCompare(String(b.identifier ?? b.id), undefined, { numeric: true }));

        for (let i = 0; i < ordered.length && i * 2 < slotCount; i++) {
            for (let j = 0; j < 2; j++) {

                const slot = ordered[i].slots?.[j];
                if (!slot) continue;
                const target = slots[i * 2 + j];

                // an empty slot means that seat hasn't been decided yet
                if (slot.entrant) {
                    const parts = slot.entrant.participants || [];
                    if (parts.length == 1) {
                        target.name = parts[0].gamerTag;
                        target.tag = parts[0].prefix || "";
                    } else {
                        target.name = slot.entrant.name;
                    }
                }

                const score = slot.standing?.stats?.score?.value;
                if (score != null) target.score = score < 0 ? "DQ" : String(score);

            }
        }

        return slots;

    }

}

export const startGG = new StartGG;
