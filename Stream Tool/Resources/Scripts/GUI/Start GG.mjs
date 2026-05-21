import { stPath, inside } from "./Globals.mjs";

const STARTGG_API = "https://api.start.gg/gql/alpha";

let _rawCodes = {};
try { if (inside.electron) _rawCodes = JSON.parse(require('fs').readFileSync(__dirname + '/COUNTRY_CODES.json', 'utf8')); } catch (e) {}
/** Maps country name → ISO 3166-1 alpha-2 code */
const COUNTRY_CODES = Object.fromEntries(Object.entries(_rawCodes).map(([code, name]) => [name, code]));

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
          user { location { country } }
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
    #loaded = false;

    setToken(token) { this.#token = token; }
    setSlug(slug) { this.#slug = slug; }
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

    /** Fetches all entrant seeds and countries from the current event slug */
    async fetchSeeds() {

        this.#seedMap.clear();
        this.#countryMap.clear();
        this.#tagMap.clear();
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
                    const participant = entrant.participants[0];
                    if (!participant) continue;
                    const key = participant.gamerTag.toLowerCase();
                    const country = participant.user?.location?.country || "";
                    const tag = participant.prefix || "";
                    if (entrant.initialSeedNum) this.#seedMap.set(key, entrant.initialSeedNum);
                    if (country) this.#countryMap.set(key, country);
                    if (tag) this.#tagMap.set(key, tag);
                    allEntrants.push({
                        gamerTag: participant.gamerTag,
                        seed: entrant.initialSeedNum || "",
                        country,
                        tag
                    });
                }

                page++;

            } while (page <= totalPages);

            this.#loaded = true;

            // create or update presets for all entrants
            let newPresets = 0;
            const newPresetObjects = [];
            if (inside.electron) {
                const fs = require('fs');
                for (const entrant of allEntrants) {
                    const safeName = entrant.gamerTag.replace(/[\\/:*?"<>|]/g, '_');
                    const filePath = `${stPath.text}/Player Info/${safeName}.json`;
                    try {
                        if (fs.existsSync(filePath)) {
                            // update existing preset with seed, country, and tag
                            const preset = JSON.parse(fs.readFileSync(filePath));
                            if (entrant.seed !== "") preset.seed = entrant.seed;
                            if (entrant.country) preset.country = entrant.country;
                            if (entrant.tag) preset.tag = entrant.tag;
                            fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
                        } else {
                            // create a new preset
                            const preset = {
                                name: entrant.gamerTag,
                                tag: entrant.tag,
                                pronouns: "",
                                seed: entrant.seed,
                                country: entrant.country,
                                socials: {},
                                characters: []
                            };
                            fs.writeFileSync(filePath, JSON.stringify(preset, null, 2));
                            newPresetObjects.push(preset);
                            newPresets++;
                        }
                    } catch (e) {
                        // skip players with filename-unsafe characters in their tag
                    }
                }
            }

            // download missing flag images
            if (inside.electron) {
                const fs = require('fs');
                const uniqueCodes = new Set(
                    allEntrants.map(e => COUNTRY_CODES[e.country]).filter(Boolean)
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

}

export const startGG = new StartGG;
