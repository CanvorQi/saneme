// js/stories.js - 24h stories and the story viewer (also used for highlights).
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Stories (everyone's) ----------------
const storageList = key => { try { return JSON.parse(localStorage.getItem(key) || "[]"); } catch (e) { return []; } };
const storageSave = (key, list) => { try { localStorage.setItem(key, JSON.stringify(list.slice(-400))); } catch (e) {} };
async function loadStories() {
    try { state.storyGroups = (await api("/api/stories")).groups; } catch (e) { state.storyGroups = []; }
    updateStoryRings();
}
const storyGroup = cid => (state.storyGroups || []).find(g => g.character.id === cid);
// "" = no stories, "new" = something unseen, "seen" = all watched
function storyRing(cid) {
    const g = storyGroup(cid);
    if (!g) return "";
    const seen = storageList("saneme_seen_stories");
    return g.stories.every(s => seen.includes(s.id)) ? "seen" : "new";
}
function renderStoryStrip() {
    const groups = [...(state.storyGroups || [])];
    // unseen first (newest first), then the watched ones - like Instagram
    groups.sort((a, b) => (storyRing(a.character.id) === "seen") - (storyRing(b.character.id) === "seen"));

    const html = groups.length ? groups.map(g => {
        const c = g.character, ring = storyRing(c.id);
        return `<button class="sb-story-av ${ring}" data-story-of="${esc(c.id)}" title="${esc(c.name)}: ${g.stories.length} ${g.stories.length > 1 ? "stories" : "story"}">
            <span class="ring">${c.photo ? `<img src="${esc(c.photo)}" alt="">` : ""}</span><span class="nm">${esc(c.name)}</span></button>`;
    }).join("") : `<div class="sb-empty">No stories right now.</div>`;
    ["#homeStories"].forEach(sel => { const el = $(sel); if (el) el.innerHTML = html; });
}
document.addEventListener("click", e => {
    const b = e.target.closest("[data-story-of]");
    if (b) openStories(b.dataset.storyOf);
});
function updateStoryRings() {
    renderStoryStrip();
    renderConvList();
    const ring = state.cid ? storyRing(state.cid) : "";
    const head = $("#headAvatar");
    head.classList.toggle("has-story", !!ring);
    head.classList.toggle("seen", ring === "seen");
    head.title = ring ? "View her story" : "View her profile";
    if (!$("#view-matches").classList.contains("hidden")) renderMatches();
    $$("[data-av-of]").forEach(el => {
        const r = storyRing(el.dataset.avOf);
        el.classList.toggle("ring-new", r === "new"); el.classList.toggle("ring-seen", r === "seen");
    });
}
$("#headAvatar").addEventListener("click", () => storyRing(state.cid) ? openStories(state.cid) : showHer(state.cid));

// The viewer walks through one character's stories, then on to the next one's (like Instagram)
const sv = { list: [], i: 0, elapsed: 0, last: 0, paused: false, raf: 0, dur: 5000, vtSeq: 0 };
function openStories(cid) {
    sv.mode = "live"; $("#storyViewer").classList.remove("hl");
    const groups = [...(state.storyGroups || [])];
    groups.sort((a, b) => (storyRing(a.character.id) === "seen") - (storyRing(b.character.id) === "seen"));
    sv.list = groups.flatMap(g => g.stories.map(s => ({ ...s, character: g.character })));
    if (!sv.list.length) return;
    const seen = storageList("saneme_seen_stories");
    const mine = sv.list.map((s, i) => [s, i]).filter(([s]) => !cid || s.character.id === cid);
    if (!mine.length) return;
    const firstUnseen = mine.find(([s]) => !seen.includes(s.id));
    sv.i = (firstUnseen || mine[0])[1];
    $("#storyViewer").classList.add("show");
    showStory();
    cancelAnimationFrame(sv.raf); sv.last = performance.now(); sv.raf = requestAnimationFrame(storyTick);
}
function closeStories() {
    $("#storyViewer").classList.remove("show", "hl");
    cancelAnimationFrame(sv.raf);
    $("#svInput").value = ""; $("#svInput").blur();
    updateStoryRings();
}
function storyAgo(ts) {
    const m = (nowMs() / 1000 - ts) / 60;
    return m < 60 ? `${Math.max(1, Math.round(m))}m` : `${Math.round(m / 60)}h`;
}
function showStory() {
    const s = sv.list[sv.i], c = s.character;
    sv.elapsed = 0;
    // progress bars for this character's stories only
    const same = sv.list.map((x, k) => [x, k]).filter(([x]) => x.character.id === c.id);
    $("#svBars").innerHTML = same.map(([, k]) => `<div data-k="${k}"><i style="width:${k < sv.i ? 100 : 0}%"></i></div>`).join("");
    $("#svAvatar").src = c.photo || "icon.png";
    $("#svName").textContent = c.name;
    $("#svWhen").textContent = s.posted_at ? storyAgo(s.posted_at) : s.title;
    $("#svInput").placeholder = `Reply to ${c.name}…`;
    const box = $("#svContent");
    box.className = `sv-content bg-${s.bg}${s.photo ? " has-photo" : ""}`;
    // the photo is shown whole (contain) over a blurred copy of itself, so a photo that isn't 9:16
    // gets soft edges of its own colours instead of black bars; it slowly zooms while it's up (Ken Burns)
    const fill = s.photo ? `url('${esc(s.photo)}')${s.lqip ? `, url('${s.lqip}')` : ""}` : "";
    box.innerHTML = `${s.photo ? `<div class="sv-fill" style="background-image:${fill}"></div>
        <img class="sv-photo kb-${sv.i % 2 ? "b" : "a"}" src="${esc(s.photo)}" alt="">` : ""}${s.text ? `<div class="sv-text">${esc(s.text)}</div>` : ""}`;
    const seen = storageList("saneme_seen_stories");
    if (sv.mode !== "highlight" && !seen.includes(s.id)) storageSave("saneme_seen_stories", [...seen, s.id]);
    $("#svLike").classList.toggle("liked", storageList("saneme_story_likes").includes(s.id));
    $("#svLike").textContent = $("#svLike").classList.contains("liked") ? "♥" : "♡";
}
function storyTick(t) {
    const dt = t - sv.last; sv.last = t;
    if (!sv.paused) sv.elapsed += dt;
    $("#storyViewer").classList.toggle("paused", sv.paused);  // freezes the Ken Burns zoom too
    const bar = $(`#svBars div[data-k="${sv.i}"] i`);
    if (bar) bar.style.width = Math.min(100, sv.elapsed / sv.dur * 100) + "%";
    if (sv.elapsed >= sv.dur) { stepStory(1); }
    if ($("#storyViewer").classList.contains("show")) sv.raf = requestAnimationFrame(storyTick);
}
function stepStory(d) {
    const n = sv.i + d;
    if (n >= sv.list.length) return closeStories();
    const prev = sv.list[sv.i];
    sv.i = Math.max(0, n);
    const next = sv.list[sv.i];
    if (next === prev) return;
    // the same person's next story cross-fades; moving on to someone else turns the cube (Instagram)
    const kind = next.character.id === prev.character.id ? "fade" : d > 0 ? "cube-fwd" : "cube-back";
    if (!document.startViewTransition || !fxOn()) return showStory();
    const root = document.documentElement, seq = ++sv.vtSeq;
    root.dataset.svt = kind;
    // a quick second tap skips the running transition: only the newest one clears the flag
    const t = document.startViewTransition(showStory);
    t.ready.catch(() => {});
    t.finished.finally(() => { if (sv.vtSeq === seq) delete root.dataset.svt; });
}
const wasHold = () => performance.now() - (sv.downAt || 0) > 300;  // a hold pauses, it doesn't skip
$("#svNext").addEventListener("click", () => { if (!wasHold()) stepStory(1); });
$("#svPrev").addEventListener("click", () => { if (!wasHold()) stepStory(-1); });
$("#svClose").addEventListener("click", closeStories);
$("#storyViewer").addEventListener("click", e => { if (e.target.id === "storyViewer") closeStories(); });
// hold to pause (like Instagram), and pause while typing a reply
["#svPrev", "#svNext", "#svContent"].forEach(sel => {
    $(sel).addEventListener("pointerdown", () => { sv.paused = true; sv.downAt = performance.now(); });
    $(sel).addEventListener("pointerup", () => { sv.paused = document.activeElement === $("#svInput"); });
});
$("#svInput").addEventListener("focus", () => { sv.paused = true; });
$("#svInput").addEventListener("blur", () => { sv.paused = false; });
document.addEventListener("keydown", e => {
    if (!$("#storyViewer").classList.contains("show") || document.activeElement === $("#svInput")) return;
    if (e.key === "Escape") closeStories();
    if (e.key === "ArrowRight") stepStory(1);
    if (e.key === "ArrowLeft") stepStory(-1);
});
async function replyToStory(text) {
    const s = sv.list[sv.i];
    closeStories();
    await openChat(s.character.id);
    try { await sendMessage(text, { story_id: s.id }); } catch (ex) { sysNote("Couldn't send: " + ex.message); }
}
$("#svReply").addEventListener("submit", e => {
    e.preventDefault();
    const text = $("#svInput").value.trim();
    if (text) replyToStory(text);
});
$("#svLike").addEventListener("click", () => {
    const s = sv.list[sv.i], likes = storageList("saneme_story_likes");
    if (likes.includes(s.id)) { storageSave("saneme_story_likes", likes.filter(x => x !== s.id)); showStory(); return; }
    storageSave("saneme_story_likes", [...likes, s.id]);
    $("#svLike").classList.add("liked"); $("#svLike").textContent = "♥";
    fxBurst(["❤️", "💗"], 8);
    // liking a story sends her a little heart, like on Instagram - that's how chats start
    setTimeout(() => replyToStory("❤️"), 650);
});
// swipe down to close on a phone
let svTouchY = null;
$("#storyViewer").addEventListener("touchstart", e => { svTouchY = e.touches[0].clientY; }, { passive: true });
$("#storyViewer").addEventListener("touchend", e => {
    if (svTouchY != null && e.changedTouches[0].clientY - svTouchY > 90) closeStories();
    svTouchY = null;
});
setInterval(() => { if (state.profile) loadStories(); }, 120000);
