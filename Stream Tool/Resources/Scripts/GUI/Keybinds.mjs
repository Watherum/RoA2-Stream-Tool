import { updateBracket } from './Bracket.mjs';
import { clear, clearConfirm } from './Clear.mjs';
import { charFinder } from './Finder/Char Finder.mjs';
import { commFinder } from './Finder/Comm Finder.mjs';
import { playerFinder } from './Finder/Player Finder.mjs';
import { skinFinder } from './Finder/Skin Finder.mjs';
import { current, inside } from './Globals.mjs';
import { profileInfo } from './Profile Info.mjs';
import { playersReady } from './Player/Players.mjs';
import { presetBrowser } from './Preset Browser.mjs';
import { scores } from './Score/Scores.mjs';
import { settings } from './Settings.mjs';
import { viewport } from './Viewport.mjs';
import { writeScoreboard } from './Write Scoreboard.mjs';

export function loadKeybinds() {

    // allow esc to fire even when an input has focus while the char modal or preset browser is open
    const _stopCallback = Mousetrap.prototype.stopCallback;
    Mousetrap.prototype.stopCallback = function(e, element, combo) {
        if (combo === 'esc' && (charFinder.isModalOpen() || presetBrowser.isVisible())) return false;
        return _stopCallback.call(this, e, element, combo);
    };

    // enter
    Mousetrap.bind('enter', () => {

        // if a dropdown menu is open, click on the current focus
        if (current.focus > -1) {
            if (playerFinder.isVisible()) {
                playerFinder.getFinderEntries()[current.focus].click();
            } else if (charFinder.isVisible()) {
                charFinder.getFinderEntries()[current.focus].click();
            } else if (skinFinder.isVisible()) {
                skinFinder.getFinderEntries()[current.focus].click();
            } else if (commFinder.isVisible()) {
                commFinder.getFinderEntries()[current.focus].click();
            }
        } else if (profileInfo.isVisible()) { // if player info menu is up
            profileInfo.apply();
            profileInfo.hide();
        } else if (inside.bracket) {
            updateBracket();
        } else {
            // update scoreboard info (updates botBar color for visual feedback)
            if (playersReady()) {
                writeScoreboard();
                document.getElementById('botBar').style.backgroundColor = "var(--bg3)";   
            }
        }

    }, 'keydown');
    // when releasing enter, change bottom bar's color back to normal
    Mousetrap.bind('enter', () => {
        document.getElementById('botBar').style.backgroundColor = "var(--bg5)";
    }, 'keyup');

    // esc
    Mousetrap.bind('esc', () => {
        if (inside.settings || inside.bracket) {
            viewport.toCenter();
        } else if (charFinder.isModalOpen()) {
            charFinder.closeModal();
        } else if (presetBrowser.isVisible()) {
            presetBrowser.hide();
        } else if (clearConfirm.isVisible()) {
            clearConfirm.hide();
        } else if (charFinder.isVisible() || skinFinder.isVisible()
        || commFinder.isVisible() || playerFinder.isVisible()) {
            document.activeElement.blur();
        } else if (profileInfo.isVisible()) { // if player info menu is up
            document.getElementById("pInfoBackButt").click();
        } else {
            clear(); // by default, clear player info
        }
    });

    // F1 or F2 to give players a score tick
    Mousetrap.bind('f1', () => {
        if (!settings.isScoreAutoChecked() && !settings.isInvertScoreChecked()) return;
        scores[0].giveWin();
        writeScoreboard();
    });
    Mousetrap.bind('f2', () => {
        if (!settings.isScoreAutoChecked() && !settings.isInvertScoreChecked()) return;
        scores[1].giveWin();
        writeScoreboard();
    });

    // Shift+F1 / Shift+F2 — always opposite direction of F1/F2
    Mousetrap.bind('shift+f1', () => {
        if (!settings.isScoreAutoChecked() && !settings.isInvertScoreChecked()) return;
        const value = settings.isInvertScoreChecked() ? 1 : -1;
        scores[0].setScore(scores[0].getScore() + value);
        writeScoreboard();
    });
    Mousetrap.bind('shift+f2', () => {
        if (!settings.isScoreAutoChecked() && !settings.isInvertScoreChecked()) return;
        const value = settings.isInvertScoreChecked() ? 1 : -1;
        scores[1].setScore(scores[1].getScore() + value);
        writeScoreboard();
    });

    // up/down, to navigate the finders (only when one is shown)
    Mousetrap.bind('down', () => {
        if (playerFinder.isVisible()) {
            playerFinder.addActive(true);
        } else if (charFinder.isVisible()) {
            charFinder.addActive(true);
        } else if (skinFinder.isVisible()) {
            skinFinder.addActive(true);
        } else if (commFinder.isVisible()) {
            commFinder.addActive(true);
        }
    });
    Mousetrap.bind('up', () => {
        if (playerFinder.isVisible()) {
            playerFinder.addActive(false);
        } else if (charFinder.isVisible()) {
            charFinder.addActive(false);
        } else if (skinFinder.isVisible()) {
            skinFinder.addActive(false);
        } else if (commFinder.isVisible()) {
            commFinder.addActive(false);
        }
    });
    
}