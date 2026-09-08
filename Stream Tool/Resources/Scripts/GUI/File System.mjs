import { casters, maxCasters } from './Caster/Casters.mjs';
import { charDisplayName, inside, stPath } from './Globals.mjs';
import { players } from './Player/Players.mjs';
import { round } from './Round.mjs';
import { scores } from './Score/Scores.mjs';
import { teams } from './Team/Teams.mjs';
import { tournament } from './Tournament.mjs';
import { wl } from './WinnersLosers.mjs';

/**
 * Returns parsed json data from a local file
 * @param {String} jPath - Path to local file
 * @returns {Object?} - Parsed json object
*/
export async function getJson(jPath) {

    if (inside.electron) {

        // the electron version
        const fs = require('fs');
        if (fs.existsSync(jPath + ".json")) {
            return JSON.parse(fs.readFileSync(jPath + ".json"));
        } else {
            return null;
        }

    } else {

        // the browser version
        try {
            return await (await fetch(jPath + ".json", {cache: "no-store"})).json();
        } catch (e) {
            return null;
        }

    }

}

/**
 * Checks if the requested file exists/can be accessed
 * @param {String} filePath - Path to the file
 * @returns True or False, pretty self explanatory if you ask me
 */
export async function fileExists(filePath) {

    if (inside.electron) {

        const fs = require('fs');
        return fs.existsSync(filePath);
        
    } else {

        return (await fetch(filePath, {method: "HEAD"})).ok;
    
    }

}

/**
 * Generates a character list depending on the folders of the character path
 * @param {Boolean} includeWorkshop - Whether to include characters from the _Workshop subfolder
 * @returns Character list array
 */
export async function getCharacterList(includeWorkshop = false) {

    if (inside.electron) {

        const fs = require('fs');
        const characterList = fs.readdirSync(stPath.char, { withFileTypes: true })
            .filter(dirent => dirent.isDirectory())
            .map(dirent => dirent.name)
            .filter(name => name !== "_Workshop" && name !== "_RoA1" && name !== "Random");

        if (includeWorkshop && fs.existsSync(stPath.charWork)) {
            const workshopChars = fs.readdirSync(stPath.charWork, { withFileTypes: true })
                .filter(dirent => dirent.isDirectory())
                .map(dirent => `_Workshop/${dirent.name}`);
            characterList.push(...workshopChars);
        }

        // add random to the end of the character list
        characterList.push("Random");

        // save the data for the remote gui
        saveJson(`/Character List`, characterList);

        return characterList;

    } else {

        return await getJson(`${stPath.text}/Character List`);

    }

}

/**
 * In-memory cache of preset folders, keyed by folder name (e.g. "Player Info")
 * to a Map of preset name -> preset data. Avoids re-reading every preset file
 * from disk on every list/save/delete once a folder has been scanned once.
 * @type {Map<string, Map<string, Object>>}
 */
const presetCaches = new Map();

/**
 * Loads (once) and returns the in-memory cache for a preset folder.
 * Subsequent calls return the same Map without rescanning the disk.
 * @param {String} folderName
 * @returns {Map<string, Object>}
 */
function loadPresetCache(folderName) {

    if (presetCaches.has(folderName)) return presetCaches.get(folderName);

    const fs = require('fs');
    const folderPath = `${stPath.text}/${folderName}/`;
    fs.mkdirSync(folderPath, { recursive: true });

    const cache = new Map();
    for (const file of fs.readdirSync(folderPath)) {
        const filePath = `${folderPath}${file}`;
        if (fs.statSync(filePath).isDirectory() || !file.endsWith('.json')) continue;
        const name = file.substring(0, file.length - 5);
        try {
            cache.set(name, JSON.parse(fs.readFileSync(filePath)));
        } catch (e) { /* skip unreadable preset files */ }
    }

    presetCaches.set(folderName, cache);
    return cache;

}

/** Rewrites the combined preset list file from the in-memory cache (for the remote GUI) */
async function flushPresetCache(folderName) {
    const cache = loadPresetCache(folderName);
    await saveJson(`/${folderName}`, [...cache.values()]);
}

/**
 * Generates a json with each of the files on a presets folder
 * @returns Array of preset jsons
 */
export async function getPresetList(folderName) {

    if (inside.electron) {

        return [...loadPresetCache(folderName).values()];

    } else {

        return await getJson(`${stPath.text}/${folderName}`);

    }

}

/**
 * Returns a single cached preset by name, or undefined if not found
 * @param {String} folderName
 * @param {String} name
 */
export function getPreset(folderName, name) {
    return loadPresetCache(folderName).get(name);
}

/**
 * Saves a single preset: updates the in-memory cache, writes its file,
 * and refreshes the combined list file used by the remote GUI
 * @param {String} folderName - "Player Info" or "Commentator Info"
 * @param {String} name - Preset name (used as the filename)
 * @param {Object} data - Preset data
 */
export async function savePreset(folderName, name, data) {

    if (inside.electron) {

        const cache = loadPresetCache(folderName);
        cache.set(name, data);

        const fs = require('fs');
        fs.writeFileSync(`${stPath.text}/${folderName}/${name}.json`, JSON.stringify(data, null, 2));

        await flushPresetCache(folderName);

    } else {

        const remote = await import("./Remote Requests.mjs");
        remote.sendRemoteData({ ...data, message: "RemoteSaveJson", path: `/${folderName}/${name}` });

    }

}

/**
 * Saves several presets at once (e.g. a bulk start.gg import), writing each
 * preset's file but only refreshing the combined list once at the end
 * @param {String} folderName
 * @param {{name: String, data: Object}[]} entries
 */
export async function saveManyPresets(folderName, entries) {

    if (!inside.electron || !entries.length) return;

    const cache = loadPresetCache(folderName);
    const fs = require('fs');

    for (const { name, data } of entries) {
        try {
            fs.writeFileSync(`${stPath.text}/${folderName}/${name}.json`, JSON.stringify(data, null, 2));
            cache.set(name, data);
        } catch (e) {
            // skip entries with filename-unsafe names
        }
    }

    await flushPresetCache(folderName);

}

/**
 * Forces a full rescan of a preset folder from disk, discarding the in-memory
 * cache. Useful if preset files were added/edited outside the app.
 * @param {String} folderName
 */
export async function rescanPresetCache(folderName) {
    presetCaches.delete(folderName);
    await flushPresetCache(folderName);
}

/**
 * Generates a json with each of the files on the plugins folder
 * @returns Array of plugin filenames
 */
export async function getPluginList() {

    if (inside.electron) {
        
        // get us the files to look for
        const fs = require('fs');
        const files = fs.readdirSync(`${stPath.scripts}/GUI Plugins/`);

        // save for remote gui
        saveJson(`/Plugin List`, files);

        return files;

    } else {

        return await getJson(`${stPath.text}/Plugin List`);
        
    }
    
}

/**
 * Saves a local json file with the provided values
 * @param {String} path - Path where the file will be saved
 * @param {Object} data - Data to be saved
 */
export async function saveJson(path, data) {

    if (inside.electron) {

        // save the file
        const fs = require('fs');
        fs.writeFileSync(`${stPath.text}${path}.json`, JSON.stringify(data, null, 2));
        
        // send signal to update remote GUIs
        const ipc = await import("./IPC.mjs");
        ipc.updateRemotePresets();

    } else {
        const remote = await import("./Remote Requests.mjs");
        data.message = "RemoteSaveJson";
        data.path = path;
        remote.sendRemoteData(data);
    }
    
}

/**
 * Deletes a player preset file by name
 * @param {String} name - Name of the preset to delete
 */
export async function deletePreset(name) {

    if (inside.electron) {

        loadPresetCache("Player Info").delete(name);

        const fs = require('fs');
        const path = `${stPath.text}/Player Info/${name}.json`;
        if (fs.existsSync(path)) {
            fs.unlinkSync(path);
        }

        await flushPresetCache("Player Info");

    } else {

        const remote = await import("./Remote Requests.mjs");
        remote.sendRemoteData({ message: "RemoteDeletePreset", name: name });

    }

}

/** Saves simple text files to a folder, to be read by other programs */
export function saveSimpleTexts() {

    const fs = require('fs');

    fs.writeFileSync(`${stPath.text}/Simple Texts/Team 1.txt`, teams[0].getName());
    fs.writeFileSync(`${stPath.text}/Simple Texts/Team 2.txt`, teams[1].getName());

    fs.writeFileSync(`${stPath.text}/Simple Texts/Score L.txt`, scores[0].getScore().toString());
    fs.writeFileSync(`${stPath.text}/Simple Texts/Score R.txt`, scores[1].getScore().toString());
    fs.writeFileSync(`${stPath.text}/Simple Texts/bestOf.txt`, 'Best of ' + scores[0].getMode().toString());

    fs.writeFileSync(`${stPath.text}/Simple Texts/Left Winnerslosers.txt`, wl.getLeft());
    fs.writeFileSync(`${stPath.text}/Simple Texts/Right Winnerslosers.txt`, wl.getRight());

    fs.writeFileSync(`${stPath.text}/Simple Texts/Round.txt`, round.getText());
    fs.writeFileSync(`${stPath.text}/Simple Texts/Tournament Name.txt`, tournament.getText());

    // go through every possible caster slot, so removed casters get their texts blanked
    for (let i = 0; i < maxCasters; i++) {

        const socials = casters[i] ? casters[i].getSocials() : {};
        const casterTexts = {
            "Name": casters[i] ? casters[i].getName() : "",
            "Twitter": socials.twitter || "",
            "Twitch": socials.twitch || "",
            "Youtube": socials.yt || ""
        }

        for (const key in casterTexts) {
            const path = `${stPath.text}/Simple Texts/Caster ${i + 1} ${key}.txt`;
            // dont create files for slots that never had a caster
            if (casters[i] || fs.existsSync(path)) {
                fs.writeFileSync(path, casterTexts[key]);
            }
        }

    }

    for (let i = 0; i < players.length; i++) {
        fs.writeFileSync(`${stPath.text}/Simple Texts/Player ${i+1}.txt`, players[i].getName());
        fs.writeFileSync(`${stPath.text}/Simple Texts/Player ${i+1} Tag.txt`, players[i].getTag());
        fs.writeFileSync(`${stPath.text}/Simple Texts/Player ${i+1} Pronouns.txt`, players[i].getPronouns());
        fs.writeFileSync(`${stPath.text}/Simple Texts/Player ${i+1} Seed.txt`, players[i].seed?.toString() || "");
        fs.writeFileSync(`${stPath.text}/Simple Texts/Player ${i + 1} Character.txt`, charDisplayName(players[i].char));
        fs.copyFileSync(`${stPath.charBase}/${players[i].char}/icons/Default.png`, `${stPath.text}/Simple Texts/Player ${i + 1} Character Icon/Default.png`);
        if (players[i].country) {
            fs.copyFileSync(`${stPath.flags}/${players[i].country}.png`, `${stPath.text}/Simple Texts/Player ${i + 1} Flag/flag.png`);
        }
    }

    
    
}