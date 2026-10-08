// js/main.js - Startup: loading state, deep links.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Startup ----------------
async function loadState() {
    clearTimeout(replyTimer); replyTimer = null; pendingChats.clear();
    const s = await api("/api/state");
    state.profile = s.profile; state.profiles = s.profiles; state.characters = s.characters;
    if (s.now) clockSkew = s.now * 1000 - Date.now();  // virtual clock (admin time skip)
    $$("[data-stage]").forEach(e => e.textContent = s.stage);
    // reopen the last chat; otherwise the one with the latest message; otherwise Sanéme
    let last = null;
    try { last = localStorage.getItem("saneme_last_chat"); } catch (e) {}
    const byRecent = [...s.characters].sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0));
    state.cid = charById(last) ? last : (byRecent[0] || {}).id;
    state.messages = [];
    applyCharacter();
    if (s.profile) loadStories();
    return s;
}

function showOnboarding() {
    $("#app").classList.add("hidden");
    $("#onboard").classList.remove("hidden");
    $("#onboardSaved").classList.toggle("hidden", !state.profiles.length);
    renderSavedList($("#onboardSavedList"), state.profiles, switchProfile, "Continue");
    renderProfileForm($("#onboardForm"), null, "Start", async () => { await loadState(); await enterApp(); showMatch(); });
    startOnboardHearts();
}

async function enterApp() {
    $("#onboard").classList.add("hidden");
    $("#app").classList.remove("hidden");
    renderSidebar();
    refreshLLM();
    loadNotes(); loadActivity(); loadLanguage(); startLive();
    // land on Home (like Instagram); the last chat is loaded behind it, one click away
    await openChat(state.cid, { reload: true, stay: true });
    showView("home");
}

(async function init() {
    setTheme(document.documentElement.getAttribute("data-theme") || "light");
    let open = false;
    try { open = localStorage.getItem("saneme_debug") === "1"; } catch (e) {}
    setDebugOpen(open && window.innerWidth > 1100);
    $("#fxSwitch").checked = !document.documentElement.classList.contains("no-fx");

    const shownAt = Date.now();
    try {
        await loadState();
    } catch (e) {
        $("#splash .splash-name").textContent = "Can't reach the app server";
        return;
    }
    if (state.profile) {
        await enterApp();
        // deep links: /#home, /#explore, /#activity, /#her/aece, /#matches, /#profile, /#settings, /#chat/aece, /#stories
        const [link, arg] = location.hash.slice(1).split("/");
        if (link === "chat" && charById(arg)) await openChat(arg);
        if (["her", "matches", "profile", "settings", "chats", "home", "explore", "activity"].includes(link)) {
            if (link === "her" && charById(arg)) showHer(arg); else showView(link);
        }
        if (link === "stories") setTimeout(() => openStories(arg && charById(arg) ? arg : null), 600);
        if (link === "post") openPostModal(decodeURIComponent(location.hash.slice(1).split("/").slice(1).join("/")));
    } else showOnboarding();
    // keep the splash up briefly so it doesn't just flicker, then fade it out
    setTimeout(() => {
        const splash = $("#splash");
        splash.classList.add("hide");
        setTimeout(() => splash.remove(), 600);  // gone for good once faded
    }, Math.max(0, 700 - (Date.now() - shownAt)));
})();
