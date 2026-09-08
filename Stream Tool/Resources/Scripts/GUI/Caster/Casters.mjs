import { Caster } from "./Caster.mjs";

const addCasterButt = document.getElementById("addCasterButt");
const casterDiv = document.getElementById("casterDiv");

/** @type {Caster[]} */
export const casters = [];

/** Maximum amount of commentators the GUI allows */
export const maxCasters = 9;

let idCounter = 1;

addCasterButt.addEventListener("click", addCaster);

/** Adds a new commentator (unless theres too many) */
export function addCaster() {
    if (casters.length < maxCasters) {
        casters.push(new Caster(idCounter));
        casterDiv.appendChild(addCasterButt);
        idCounter++;
        if (casters.length == maxCasters) {
            addCasterButt.disabled = true;
        } else {
            addCasterButt.disabled = false;
        }
    }
}

/**
 * Removes a commentator for the array
 * @param {Number} id - Caster identifier
 */
export function deletCaster(id) {
    for (let i = 0; i < casters.length; i++) {
        if (casters[i].getId() == id) {
            casters.splice(i, 1);
        }        
    }
    addCasterButt.disabled = false;
}