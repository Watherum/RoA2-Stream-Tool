import { startGG } from "./Start GG.mjs";
import { parryGG } from "./Parry GG.mjs";
import { challonge } from "./Challonge.mjs";

/**
 * Every importer exposes the same thing, so the GUI never has to care which
 * bracket site it is talking to:
 *   setToken, setSlug, isLoaded, fetchSeeds, fetchTop8Sets,
 *   getSeed, getCountry, getTag, getPronouns
 * Ones with `needsEvent` also take a setEvent, since their slug points at a
 * whole tournament rather than a single event.
 */
export const importers = {
    startgg: {
        name: "start.gg",
        api: startGG,
        needsEvent: false,
        tokenLabel: "API Token",
        slugHint: "tournament/slug/event/slug",
        propsKey: "startgg.apiKey",
        tokenSetting: "startGGToken",
        slugSetting: "startGGSlug",
        propsSetting: "startGGTokenFromProps"
    },
    parrygg: {
        name: "parry.gg",
        api: parryGG,
        needsEvent: true,
        tokenLabel: "API Key",
        slugHint: "tournament-slug, or paste the bracket URL",
        propsKey: "parrygg.apiKey",
        tokenSetting: "parryGGToken",
        slugSetting: "parryGGSlug",
        propsSetting: "parryGGTokenFromProps"
    },
    challonge: {
        name: "Challonge",
        api: challonge,
        needsEvent: false,
        tokenLabel: "API Key, or clientId:clientSecret",
        slugHint: "tournament-slug, or paste the bracket URL",
        propsKey: "challonge.apiKey",
        propsKeyPair: ["challonge.clientId", "challonge.clientSecret"],
        tokenSetting: "challongeToken",
        slugSetting: "challongeSlug",
        propsSetting: "challongeTokenFromProps"
    }
};

let activeSource = "startgg";

/**
 * Changes which site imports read from
 * @param {String} source - Key of the importer, "startgg" or "parrygg"
 */
export function setActiveSource(source) {
    if (importers[source]) activeSource = source;
}

/** Key of the importer currently selected */
export function getActiveSource() { return activeSource; }

/** Config of the importer currently selected */
export function getActiveConfig() { return importers[activeSource]; }

/** Display name of the importer currently selected, for notifications */
export function getActiveName() { return importers[activeSource].name; }

/** The importer currently selected */
export function getActiveImporter() { return importers[activeSource].api; }

/**
 * Asks every loaded importer for a player detail, so data pulled from a
 * tournament always wins over whatever the local preset happens to hold
 * @param {String} getter - Which importer method to call
 * @param {String} name - Player name to look up
 */
function live(getter, name) {

    if (!name) return "";

    // whichever source is selected gets asked first
    const order = [activeSource, ...Object.keys(importers).filter(s => s != activeSource)];

    for (const source of order) {
        const api = importers[source].api;
        if (!api.isLoaded()) continue;
        const value = api[getter](name);
        if (value) return value;
    }

    return "";

}

/** Sponsor tag for a player, from whichever tournament is loaded */
export function liveTag(name) { return live("getTag", name); }
/** Seed for a player, from whichever tournament is loaded */
export function liveSeed(name) { return live("getSeed", name); }
/** Country for a player, from whichever tournament is loaded */
export function liveCountry(name) { return live("getCountry", name); }
/** Pronouns for a player, from whichever tournament is loaded */
export function livePronouns(name) { return live("getPronouns", name); }
