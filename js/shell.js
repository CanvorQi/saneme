// js/shell.js - Views (pages), swipe gestures, the left rail.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Views ----------------
// Page order for the slide direction: going "right" in this list slides the new page in from the right.
const VIEW_ORDER = ["home", "explore", "chats", "chat", "activity", "matches", "her", "profile", "settings"];
const currentView = () => { const v = $(".view:not(.hidden)"); return v ? v.id.slice(5) : null; };
// the avatar that was just clicked (feed, explore, notifications…): it grows into her profile photo
let vtAvatar = null, vtSeq = 0;
document.addEventListener("click", e => {
    const a = e.target.closest("[data-av-of], [data-her]");
    vtAvatar = a ? (a.tagName === "IMG" ? a : $("img", a)) : null;
}, true);

function applyView(name) {
    let entered = false;
    $$(".view").forEach(v => {
        const on = v.id === "view-" + name;
        if (on && v.classList.contains("hidden")) entered = v;
        v.classList.toggle("hidden", !on);
    });
    $$("[data-view]").forEach(b => b.classList.toggle("active", b.dataset.view === name));
    document.documentElement.classList.toggle("v-chat", name === "chat");
    updateRail();
    let done = null;
    if (name === "home") done = renderHome();
    if (name === "explore") done = renderExplore();
    if (name === "activity") renderActivity();
    if (name === "chat") { scrollBottom(); paintBubbles(); $("#msgInput").focus(); markCurrentSeen(); }
    if (name === "matches") renderMatches();
    if (name === "chats") renderConvList();
    if (name === "profile") renderProfileView(false);
    if (name === "settings") renderResetPicker();
    if (name === "her") done = renderHerProfile();
    return { entered, done };
}
let viewTarget = null, vtRunning = null;  // the page we're heading to, and the transition taking us there
function showView(name) {
    // The DOM switch of a view transition runs a frame later, so "where we are" is where we're heading.
    // Each call gets a number; a transition only applies its page if no newer showView came after it.
    const from = viewTarget || currentView(), seq = ++vtSeq, root = document.documentElement;
    viewTarget = name;
    // Browsers with View Transitions: the old page slides out and the new one slides in (direction
    // from VIEW_ORDER), and a clicked avatar morphs into her big profile photo.
    if (document.startViewTransition && fxOn() && from && from !== name && !document.hidden) {
        const dir = VIEW_ORDER.indexOf(name) >= VIEW_ORDER.indexOf(from) ? "fwd" : "back";
        root.dataset.vt = dir;
        const av = name === "her" && vtAvatar && vtAvatar.isConnected && vtAvatar.getClientRects().length ? vtAvatar : null;
        if (av) av.style.viewTransitionName = "her-avatar";
        let big = null;
        const t = vtRunning = document.startViewTransition(async () => {
            if (av) av.style.viewTransitionName = "";
            if (seq !== vtSeq) return;  // a newer showView took over
            const { done } = applyView(name);
            // wait (briefly) for the new page's content, so the slide shows it instead of the old one
            if (done) await Promise.race([done, sleep(av ? 450 : 250)]);
            if (av) { big = $("#herProfile .ig-av-col .avatar-frame"); if (big) big.style.viewTransitionName = "her-avatar"; }
        });
        t.ready.catch(() => {});  // skipped by a quicker second click: fine, the page still switches
        t.finished.finally(() => {
            if (vtSeq === seq) { delete root.dataset.vt; vtRunning = null; }
            if (big) big.style.viewTransitionName = "";
        });
        vtAvatar = null;
        return;
    }
    vtAvatar = null;
    if (vtRunning) { vtRunning.skipTransition(); vtRunning = null; delete root.dataset.vt; }
    const { entered } = applyView(name);
    if (entered) { entered.classList.remove("view-enter"); void entered.offsetWidth; entered.classList.add("view-enter"); }
}
$$("[data-view]").forEach(b => b.addEventListener("click", () => showView(b.dataset.view)));
$$("[data-open-her]").forEach(el => el.addEventListener("click", () => showHer(state.cid)));

// ---------------- Swipe gestures (phone) ----------------
// swipe right from the left edge on Profile / her profile / Settings -> back to the chat
let edge = null;
document.addEventListener("touchstart", e => {
    const t = e.touches[0];
    const onSubview = !$("#view-chat").classList.contains("hidden") ? false : !$("#app").classList.contains("hidden");
    edge = onSubview && t.clientX < 36 && !$("#lightbox").classList.contains("show") ? { x: t.clientX, y: t.clientY } : null;
}, { passive: true });
document.addEventListener("touchend", e => {
    if (!edge) return;
    const t = e.changedTouches[0];
    if (t.clientX - edge.x > 80 && Math.abs(t.clientY - edge.y) < 60) showView("home");
    edge = null;
}, { passive: true });
// photo viewer: swipe left / right between photos, down to close
let lbTouch = null;
$("#lightbox").addEventListener("touchstart", e => { lbTouch = { x: e.touches[0].clientX, y: e.touches[0].clientY }; }, { passive: true });
$("#lightbox").addEventListener("touchend", e => {
    if (!lbTouch) return;
    const dx = e.changedTouches[0].clientX - lbTouch.x, dy = e.changedTouches[0].clientY - lbTouch.y;
    if (dy > 90 && Math.abs(dx) < 60) closeLightbox();
    else if (Math.abs(dx) > 60 && Math.abs(dy) < 60) stepLightbox(dx < 0 ? 1 : -1);
    lbTouch = null;
}, { passive: true });

// ---------------- Rail: full width with labels, icons only while a chat is open (like Instagram) ----------------
function updateRail() {
    const chat = document.documentElement.classList.contains("v-chat");
    document.documentElement.classList.toggle("rail-compact", chat || window.innerWidth < 1260);
}
window.addEventListener("resize", updateRail);
