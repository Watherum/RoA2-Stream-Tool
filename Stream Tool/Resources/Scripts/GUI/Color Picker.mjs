/**
 * A small color wheel of our own, used instead of an <input type="color">.
 * Chromium's dialog carries an eyedropper that can only see this window,
 * which is confusing sitting right next to the one that sees every monitor
 */

let pop;            // the popup, built the first time its needed
let svArea, svDot, hueArea, hueDot;
let current = {h: 0, s: 0, v: 0};
let onPick;         // called with a hex every time the color moves
let onClose;        // called once the popup goes away
let anchorEl;       // the swatch this popup belongs to


/** Builds the popup, just the once */
function build() {

    pop = document.createElement('div');
    pop.id = "colorPickerPop";
    pop.innerHTML = `
        <div class="cpSquare">
            <div class="cpDot"></div>
        </div>
        <div class="cpHue">
            <div class="cpHueDot"></div>
        </div>
    `;
    document.body.appendChild(pop);

    svArea = pop.querySelector('.cpSquare');
    svDot = pop.querySelector('.cpDot');
    hueArea = pop.querySelector('.cpHue');
    hueDot = pop.querySelector('.cpHueDot');

    dragify(svArea, (x, y) => {
        current.s = x;
        current.v = 1 - y;
        update(true);
    });
    dragify(hueArea, (x) => {
        current.h = x * 360;
        update(true);
    });

    // clicking anywhere else, or hitting escape, puts it away
    window.addEventListener("mousedown", (event) => {
        if (!pop || pop.style.display != "flex") return;
        if (pop.contains(event.target) || event.target == anchorEl || anchorEl?.contains(event.target)) return;
        close();
    }, true);
    window.addEventListener("keydown", (event) => {
        if (event.key == "Escape") close();
    });

}

/**
 * Makes an area report where inside it the mouse is being dragged
 * @param {HTMLElement} el - The area to listen on
 * @param {Function} callback - Gets x and y, both from 0 to 1
 */
function dragify(el, callback) {

    const report = (event) => {
        const box = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (event.clientX - box.left) / box.width));
        const y = Math.min(1, Math.max(0, (event.clientY - box.top) / box.height));
        callback(x, y);
    };

    el.addEventListener("mousedown", (event) => {

        event.preventDefault();
        report(event);

        const move = (moveEvent) => {report(moveEvent)};
        const up = () => {
            window.removeEventListener("mousemove", move);
            window.removeEventListener("mouseup", up);
            update(true, true); // settled, so this one gets stored
        };

        window.addEventListener("mousemove", move);
        window.addEventListener("mouseup", up);

    });

}

/**
 * Redraws the popup for the color its currently on
 * @param {Boolean} send - Tell whoever opened us about the new color
 * @param {Boolean} store - The user let go, so this color is final
 */
function update(send, store) {

    svArea.style.backgroundColor = `hsl(${current.h}, 100%, 50%)`;
    svDot.style.left = `${current.s * 100}%`;
    svDot.style.top = `${(1 - current.v) * 100}%`;
    svDot.style.backgroundColor = hsvToHex(current);
    hueDot.style.left = `${current.h / 360 * 100}%`;

    if (send && onPick) onPick(hsvToHex(current), !!store);

}

/**
 * Opens the picker right under a swatch
 * @param {HTMLElement} anchor - Element to sit below
 * @param {String} hex - Color to start on
 * @param {Function} pickCallback - Gets (hex, settled) on every change
 * @param {Function} closeCallback - Called when the popup goes away
 */
export function openColorPicker(anchor, hex, pickCallback, closeCallback) {

    if (!pop) build();

    // clicking the same swatch again just closes it
    if (pop.style.display == "flex" && anchorEl == anchor) {
        close();
        return;
    }

    anchorEl = anchor;
    onPick = pickCallback;
    onClose = closeCallback;
    current = hexToHsv(hex);

    pop.style.display = "flex";
    update(false);

    // sit below the swatch, but never off the edge of the window
    const box = anchor.getBoundingClientRect();
    const popBox = pop.getBoundingClientRect();
    let left = box.left;
    let top = box.bottom + 6;
    if (left + popBox.width > window.innerWidth - 6) left = window.innerWidth - popBox.width - 6;
    if (top + popBox.height > window.innerHeight - 6) top = box.top - popBox.height - 6;
    pop.style.left = `${Math.max(6, left)}px`;
    pop.style.top = `${Math.max(6, top)}px`;

}

/** Puts the picker away */
export function close() {

    if (!pop || pop.style.display != "flex") return;

    pop.style.display = "none";
    anchorEl = null;

    if (onClose) onClose();
    onPick = null;
    onClose = null;

}


/**
 * Reads a #rrggbb color into hue, saturation and value
 * @param {String} hex - Color, as #rrggbb
 */
function hexToHsv(hex) {

    const clean = String(hex ?? "").replace(/^#/, "");
    const valid = /^[0-9a-f]{6}$/i.test(clean) ? clean : "000000";

    const r = parseInt(valid.substring(0, 2), 16) / 255;
    const g = parseInt(valid.substring(2, 4), 16) / 255;
    const b = parseInt(valid.substring(4, 6), 16) / 255;

    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const delta = max - min;

    let h = 0;
    if (delta) {
        if (max == r) h = 60 * (((g - b) / delta) % 6);
        else if (max == g) h = 60 * ((b - r) / delta + 2);
        else h = 60 * ((r - g) / delta + 4);
    }
    if (h < 0) h += 360;

    return {h, s: max ? delta / max : 0, v: max};

}

/**
 * Turns hue, saturation and value back into a #rrggbb color
 * @param {Object} hsv - As given by hexToHsv
 */
function hsvToHex({h, s, v}) {

    const c = v * s;
    const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
    const m = v - c;

    let rgb;
    if (h < 60) rgb = [c, x, 0];
    else if (h < 120) rgb = [x, c, 0];
    else if (h < 180) rgb = [0, c, x];
    else if (h < 240) rgb = [0, x, c];
    else if (h < 300) rgb = [x, 0, c];
    else rgb = [c, 0, x];

    return "#" + rgb.map(value => 
        Math.round((value + m) * 255).toString(16).padStart(2, "0")
    ).join("");

}
