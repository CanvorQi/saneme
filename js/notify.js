// js/notify.js - Sound and desktop notifications for her messages.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope.
//
// When a message comes in and you're NOT looking at that chat (another chat, another page, or the
// tab is in the background): a soft two-tone "ding" (made with Web Audio, no sound file), and - if
// you turned it on in Settings and the tab is in the background - a desktop notification that opens
// her chat when clicked.

const NOTIFY = {
    sound: (() => { try { return localStorage.getItem("saneme_sound") !== "0"; } catch (e) { return true; } })(),
    desktop: (() => { try { return localStorage.getItem("saneme_notify") === "1"; } catch (e) { return false; } })(),
    lastDing: 0,
};

let audioCtx = null;
// browsers only allow sound after the user has interacted with the page once
document.addEventListener("pointerdown", () => {
    try { audioCtx = audioCtx || new (window.AudioContext || window.webkitAudioContext)(); audioCtx.resume(); } catch (e) {}
}, { once: true });

function playDing() {
    if (!NOTIFY.sound || !audioCtx || performance.now() - NOTIFY.lastDing < 1500) return;  // one ding per burst
    NOTIFY.lastDing = performance.now();
    try {
        const t = audioCtx.currentTime;
        [[880, 0], [1318.5, 0.09]].forEach(([freq, delay]) => {
            const osc = audioCtx.createOscillator(), gain = audioCtx.createGain();
            osc.type = "sine"; osc.frequency.value = freq;
            gain.gain.setValueAtTime(0.0001, t + delay);
            gain.gain.exponentialRampToValueAtTime(0.16, t + delay + 0.015);
            gain.gain.exponentialRampToValueAtTime(0.0001, t + delay + 0.38);
            osc.connect(gain).connect(audioCtx.destination);
            osc.start(t + delay); osc.stop(t + delay + 0.42);
        });
    } catch (e) {}
}

// a message from her arrived (reply stream, a first move, a reply to a chat you left)
function notifyIncoming(cid, m, firstMove) {
    const c = charById(cid);
    if (!c || !m || m.role !== "saneme" || (m.meta || {}).deleted) return;  // not for a message she deleted
    const lookingAtIt = !document.hidden && cid === state.cid && chatOpen();
    if (lookingAtIt) return;
    playDing();
    if (NOTIFY.desktop && document.hidden && "Notification" in window && Notification.permission === "granted") {
        try {
            const n = new Notification(firstMove ? `${c.name} texted you first 👀` : c.name, {
                body: (m.meta || {}).photo ? "📷 sent a photo" : (m.text || "sent you a message"),
                icon: c.photo || "icon.png", tag: `saneme-${cid}`, renotify: true,
            });
            n.onclick = () => { window.focus(); openChat(cid); n.close(); };
        } catch (e) {}
    }
}

// Settings switches
function setSoundOn(on) {
    NOTIFY.sound = on;
    try { localStorage.setItem("saneme_sound", on ? "1" : "0"); } catch (e) {}
    $("#soundSwitch").checked = on;
}
async function setDesktopNotify(on) {
    if (on) {
        if (!("Notification" in window)) { toast("This browser has no notifications"); on = false; }
        else if (Notification.permission !== "granted") {
            const p = await Notification.requestPermission();
            if (p !== "granted") { toast("Notifications are blocked in the browser settings"); on = false; }
        }
    }
    NOTIFY.desktop = on;
    try { localStorage.setItem("saneme_notify", on ? "1" : "0"); } catch (e) {}
    $("#notifySwitch").checked = on;
}
$("#soundSwitch").checked = NOTIFY.sound;
$("#notifySwitch").checked = NOTIFY.desktop && "Notification" in window && Notification.permission === "granted";
$("#soundSwitch").addEventListener("change", e => { setSoundOn(e.target.checked); if (e.target.checked) playDing(); });
$("#notifySwitch").addEventListener("change", e => setDesktopNotify(e.target.checked));
