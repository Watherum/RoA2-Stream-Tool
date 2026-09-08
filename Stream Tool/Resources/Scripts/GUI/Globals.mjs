/** these are set when their respective views are visible */
export const inside = {
    settings : false,
    bracket : false,
    finder : false,
    electron : typeof process !== 'undefined' // if in executable or remote gui
};

/** Paths used for all of the Stream Tool */
const realPath = inside.electron ? __dirname : ""; // local file path if in executable
export const stPath = {
    char : "",
    charRandom : realPath + '/Characters/Random',
    charBase : realPath + '/Characters',
    charWork : realPath + '/Characters/_Workshop',
    overlay: realPath + '/Overlay',
    text : realPath + '/Texts',
    scripts: realPath + '/Scripts',
    flags: realPath + '/Flags'
};

/** Returns the display name for a character, stripping the _Workshop/ prefix if present */
export function charDisplayName(char) {
    return char.startsWith("_Workshop/") ? char.slice(10) : char;
}

/** Current values for stuff */
export const current = {
    focus : -1
}

/** Bracket round keys, paired with how many player slots each one holds */
export const BRACKET_SLOTS = {
    WinnersSemis: 4,
    WinnersFinals: 2,
    GrandFinals: 2,
    TrueFinals: 2,
    LosersTop8: 4,
    LosersQuarters: 4,
    LosersSemis: 2,
    LosersFinals: 2
}

/** A bracket player slot that nobody has been placed into yet */
export function blankBracketSlot() {
    return { name: "-", tag: "", character: "None", skin: "-", iconSrc: "", score: "-" };
}

let _countryByCode = null;
let _codeByCountry = null;
/** Reads COUNTRY_CODES.json once, on first use */
function loadCountryCodes() {
    if (_countryByCode) return;
    _countryByCode = {};
    try {
        if (inside.electron) _countryByCode = JSON.parse(
            require('fs').readFileSync(__dirname + '/COUNTRY_CODES.json', 'utf8')
        );
    } catch (e) { /* remote GUIs have no file system, codes stay empty */ }
    _codeByCountry = Object.fromEntries(
        Object.entries(_countryByCode).map(([code, name]) => [name, code])
    );
}

/**
 * Turns an ISO 3166-1 alpha-2 code into a country name, "us" -> "United States"
 * @param {String} code - Two letter country code, any casing
 */
export function countryNameFromCode(code) {
    if (!code) return "";
    loadCountryCodes();
    return _countryByCode[String(code).toLowerCase()] ?? "";
}

/**
 * Turns a country name into its ISO 3166-1 alpha-2 code, used to find flag images
 * @param {String} name - Full country name
 */
export function countryCodeFromName(name) {
    if (!name) return "";
    loadCountryCodes();
    return _codeByCountry[name] ?? "";
}
