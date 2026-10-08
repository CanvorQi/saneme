// js/social.js - Home feed, Explore, Notifications, Notes, the post window, highlights.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Instagram-style pages: home feed, explore, notifications, notes ----------------
const agoShort = ts => {
    const m = (nowMs() / 1000 - ts) / 60;
    return m < 1 ? "now" : m < 60 ? `${Math.round(m)}m` : m < 1440 ? `${Math.round(m / 60)}h` : m < 10080 ? `${Math.round(m / 1440)}d` : `${Math.round(m / 10080)}w`;
};
// a round avatar with her story ring; clicking it opens her story (or her profile)
function avHTML(c, cls = "", clickable = true) {
    const ring = storyRing(c.id);
    return `<span class="ig-av ${cls} ${ring ? "ring-" + ring : ""}" ${clickable ? `data-av-of="${esc(c.id)}"` : ""} title="${esc(c.name)}"><img src="${esc(c.photo || "icon.png")}" alt=""></span>`;
}
document.addEventListener("click", e => {
    const a = e.target.closest("[data-av-of]");
    if (!a) return;
    closePostModal();
    storyRing(a.dataset.avOf) ? openStories(a.dataset.avOf) : showHer(a.dataset.avOf);
});
document.addEventListener("click", e => {
    const v = e.target.closest("[data-view-go]");
    if (v) showView(v.dataset.viewGo);
});

// ---- Notes ----
async function loadNotes() {
    try { state.notes = (await api("/api/notes")).notes; } catch (e) { state.notes = state.notes || []; }
    renderNotes();
}
const noteOf = cid => (state.notes || []).find(n => n.character_id === cid);
function renderNotes() {
    const list = (state.notes || []).map(n => ({ n, c: charById(n.character_id) })).filter(x => x.c);
    const html = list.length ? list.map(({ n, c }) => `<button class="note-item" data-note-of="${esc(c.id)}" title="Reply to ${esc(c.name)}'s note">
        <span class="nbubble"><span>${esc(n.text)}</span></span><img src="${esc(c.photo || "icon.png")}" alt=""><span class="nm">${esc(c.name)}</span></button>`).join("")
        : `<div class="sb-empty" style="align-self:center">No notes right now.</div>`;
    ["#notesRow", "#mNotes"].forEach(sel => { const el = $(sel); if (el) el.innerHTML = html; });
}
document.addEventListener("click", async e => {
    const b = e.target.closest("[data-note-of]");
    if (!b) return;
    const n = noteOf(b.dataset.noteOf);
    await openChat(b.dataset.noteOf);
    if (n) setReplyTo(null, { id: n.id, text: n.text, kind: "note" });
});

// ---- Feed data (shared by Home, Explore, the post window and her profile grid) ----
async function loadFeed() {
    try { state.feed = (await api("/api/feed")).posts; } catch (e) { state.feed = state.feed || []; }
    return state.feed;
}
const pkey = p => `${p.cid}/${p.photo}`;
// Blur-up: a photo box starts as a soft blur of the photo's own colours (a 16px "lqip" from the server)
// and the real photo fades in sharp on top once it has loaded (the "loaded" class below).
const lqVar = p => p && p.lqip ? `--lq:url('${p.lqip}');` : "";
document.addEventListener("load", e => { if (e.target.tagName === "IMG") e.target.classList.add("loaded"); }, true);
document.addEventListener("error", e => { if (e.target.tagName === "IMG") e.target.classList.add("loaded"); }, true);
// Skeletons: grey shapes of what's coming, shimmering, instead of a "loading…" line
const skeletonFeed = (n = 2) => Array.from({ length: n }, () => `<div class="fpost sk-post" aria-hidden="true">
        <div class="fp-head"><span class="sk sk-circle"></span><span class="sk sk-line" style="width:120px"></span></div>
        <div class="sk sk-photo"></div>
        <div class="sk-body"><span class="sk sk-line" style="width:90px"></span><span class="sk sk-line" style="width:70%"></span><span class="sk sk-line" style="width:45%"></span></div>
    </div>`).join("");
const skeletonTiles = (n = 12) => Array.from({ length: n }, (_, i) => `<div class="sk ex-tile${i % 10 === 2 || i % 10 === 5 ? " tall" : ""}" aria-hidden="true"></div>`).join("");
const findPost = key => (state.feed || []).find(p => pkey(p) === key);
const ICON_HEART = `<svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.4 2.4h1.6c.8-1.3 2.3-2.4 4.4-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg>`;
const ICON_COMMENT = `<svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></svg>`;
const ICON_SEND = `<svg viewBox="0 0 24 24"><path d="M22 3 2 10.5l8 3 3 8z"/><path d="m10 13.5 5.5-5.5"/></svg>`;

// Comments under a post: yours, and her reply right under it (or "replying…" while she writes it).
// Old comments from before were DMs and she answered in the chat: those keep a "· in DMs" mark.
function commentsHTML(p, max) {
    const list = p.comments || [], c = charById(p.cid), her = esc(c ? c.name.toLowerCase() : "her");
    if (!list.length) return max ? "" : `<div class="pm-empty">No comments yet. Say something, ${esc(c ? c.name : "she")} answers right here.</div>`;
    const shown = max ? list.slice(-max) : list;
    return (max && list.length > max ? `<button class="fp-more" data-pm-open="${esc(pkey(p))}">View all ${list.length} comments</button>` : "")
        + shown.map(x => `<div class="fp-c"><b>${esc(x.author || "you")}</b>${esc(x.text)}</div>${x.reply
            ? `<div class="fp-c fp-reply${x.fresh ? " fp-new" : ""}"><b>${her}</b>${esc(x.reply)}${x.where === "dm" ? ` <span class="fp-dm">· in DMs</span>` : ""}</div>`
            : x.pending ? `<div class="fp-c fp-reply fp-typing"><b>${her}</b><span class="fp-dm">is replying</span><span class="typing-dots"><span></span><span></span><span></span></span></div>` : ""}`).join("");
}
function postActionsHTML(p, c) {
    return `<div class="post-actions">
            <button class="like-btn ${p.liked ? "liked" : ""}" data-like title="Like">${ICON_HEART}</button>
            <button data-comment-focus title="Comment">${ICON_COMMENT}</button>
            <button data-share="${esc(pkey(p))}" title="Send this post to someone">${ICON_SEND}</button>
        </div>
        <div class="like-count">${p.likes} likes</div>`;
}
const commentFormHTML = () => `<form class="fp-form" data-comment-form><input type="text" maxlength="500" placeholder="Add a comment…" autocomplete="off"><button type="submit" class="fp-post">Post</button></form>`;
function feedPostHTML(p, i) {
    const c = charById(p.cid);
    if (!c) return "";
    return `<article class="fpost" data-pkey="${esc(pkey(p))}" style="animation-delay:${Math.min(i, 6) * 0.04}s">
        <div class="fp-head">${avHTML(c, "sm")}
            <div class="fp-who"><button class="fp-name" data-her="${esc(c.id)}">${esc(c.name.toLowerCase())}</button>${p.location ? `<span class="fp-loc">${esc(p.location)}</span>` : ""}</div>
            <span class="fp-when">${postWhen(p.date)}</span></div>
        <div class="post-photo fp-photo lq" style="${lqVar(p)}" data-dbl-like><img src="${esc(p.url)}" loading="lazy" alt=""><span class="big-heart">♥</span></div>
        ${postActionsHTML(p, c)}
        ${p.caption ? `<div class="post-caption"><b>${esc(c.name.toLowerCase())}</b> ${esc(p.caption)}</div>` : ""}
        <div class="fp-comments">${commentsHTML(p, 2)}</div>
        ${commentFormHTML()}
    </article>`;
}
async function toggleLike(key, onlyLike) {
    const p = findPost(key);
    if (!p || (onlyLike && p.liked)) return p && p.liked;
    const r = await api(`/api/c/${encodeURIComponent(p.cid)}/posts/like`, { method: "POST", body: { photo: p.photo } });
    p.liked = r.liked; p.likes = r.likes;
    $$(`[data-pkey="${CSS.escape(key)}"]`).forEach(el => {
        $("[data-like]", el)?.classList.toggle("liked", p.liked);
        const lc = $(".like-count", el); if (lc) lc.textContent = `${p.likes} likes`;
    });
    return p.liked;
}
function refreshAllComments() {
    $$("[data-pkey]").forEach(el => {
        const p = findPost(el.dataset.pkey), box = $(".fp-comments", el);
        if (p && box) box.innerHTML = commentsHTML(p, el.classList.contains("pm-card") ? 0 : 2);
    });
}
// A comment stays under the post: she reads it a few seconds later and answers in the thread
// (the server sends her reply as a live "comment" event -> onCommentReply)
async function commentOn(key, text) {
    const p = findPost(key);
    if (!p) return;
    const r = await api(`/api/c/${encodeURIComponent(p.cid)}/posts/comment`, { method: "POST", body: { photo: p.photo, text } });
    p.comments = [...(p.comments || []), r.comment];
    refreshAllComments();
    // safety net if the live connection missed her reply
    setTimeout(() => { if (r.comment.pending) loadFeed().then(refreshAllComments); }, 45000);
}
function onCommentReply(ev) {
    const p = (state.feed || []).find(x => x.cid === ev.cid && x.photo === ev.photo);
    const cm = p && (p.comments || []).find(x => x.id === ev.reply_to);
    if (!cm) { if (state.feed) loadFeed().then(refreshAllComments); return; }
    cm.pending = false;
    if (!ev.failed) { cm.reply = ev.reply; cm.reply_ts = ev.reply_ts; cm.fresh = true; }
    refreshAllComments();
    cm.fresh = false;  // the pop-in plays once
    const c = charById(ev.cid);
    if (!ev.failed && c) toast(`${c.name} replied to your comment 💬`);
}
document.addEventListener("click", e => {
    const lk = e.target.closest("[data-like]");
    if (lk) {
        const el = lk.closest("[data-pkey]");
        toggleLike(el.dataset.pkey).then(on => { if (on) heartPop(el); }).catch(ex => toast(ex.message));
        return;
    }
    const cf = e.target.closest("[data-comment-focus]");
    if (cf) { $(".fp-form input", cf.closest("[data-pkey]")).focus(); return; }
    const po = e.target.closest("[data-pm-open]");
    if (po) { openPostModal(po.dataset.pmOpen); return; }
    if (e.target.closest("[data-pm-close]") || e.target.id === "postModal") closePostModal();
});
document.addEventListener("dblclick", e => {
    const ph = e.target.closest("[data-dbl-like]");
    if (!ph) return;
    e.preventDefault();
    const el = ph.closest("[data-pkey]");
    heartPop(el);
    toggleLike(el.dataset.pkey, true).catch(ex => toast(ex.message));
});
document.addEventListener("submit", e => {
    const f = e.target.closest("[data-comment-form]");
    if (!f) return;
    e.preventDefault();
    const inp = $("input", f), text = inp.value.trim();
    if (!text) return;
    inp.value = "";
    commentOn(f.closest("[data-pkey]").dataset.pkey, text).catch(ex => toast("Couldn't send: " + ex.message));
});

// ---- Share: send a post (anyone's) to one or more people in the DMs, like Instagram's ✈ ----
// Each one gets the post as a card in her chat (meta.shared) plus your optional message, and answers
// it like any message. The characters don't know each other: to her it's a stranger's post.
let shareKey = null;
const shareSel = new Set();
function shareSheet() {
    let el = $("#shareSheet");
    if (el) return el;
    el = document.createElement("div");
    el.className = "share-sheet"; el.id = "shareSheet";
    el.innerHTML = `<div class="sh-panel" role="dialog" aria-label="Share">
        <div class="sh-top"><b>Share</b><button class="sh-x" data-share-close aria-label="Close">✕</button></div>
        <div class="sb-search sh-search"><input type="text" placeholder="Search" autocomplete="off" data-share-q></div>
        <div class="sh-grid" data-share-grid></div>
        <form class="sh-send" data-share-form><input type="text" maxlength="500" placeholder="Write a message…" autocomplete="off" data-share-msg>
            <button class="btn block" type="submit" data-share-go disabled>Send</button></form>
    </div>`;
    document.body.appendChild(el);
    el.addEventListener("click", e => {
        if (e.target === el || e.target.closest("[data-share-close]")) return closeShare();
        const b = e.target.closest("[data-share-to]");
        if (!b) return;
        const id = b.dataset.shareTo;
        shareSel.has(id) ? shareSel.delete(id) : shareSel.add(id);
        b.classList.toggle("on", shareSel.has(id));
        updateShareButton();
    });
    $("[data-share-q]", el).addEventListener("input", renderShareGrid);
    $("[data-share-form]", el).addEventListener("submit", e => { e.preventDefault(); sendShare(); });
    return el;
}
function updateShareButton() {
    const go = $("[data-share-go]");
    go.disabled = !shareSel.size;
    go.textContent = shareSel.size > 1 ? `Send separately (${shareSel.size})` : "Send";
}
function renderShareGrid() {
    const q = $("[data-share-q]").value.trim().toLowerCase();
    // the people you talk to most recently first, then everyone else
    const people = [...(state.characters || [])].sort((a, b) => (b.last ? b.last.ts : 0) - (a.last ? a.last.ts : 0))
        .filter(c => !q || `${c.name} ${c.city}`.toLowerCase().includes(q));
    $("[data-share-grid]").innerHTML = people.length ? people.map(c => `<button type="button" class="sh-person ${shareSel.has(c.id) ? "on" : ""}" data-share-to="${esc(c.id)}">
        <span class="sh-av"><img src="${esc(c.photo || "icon.png")}" alt=""><span class="sh-check">✓</span></span><span class="nm">${esc(c.name)}</span></button>`).join("")
        : `<div class="sb-empty">No one called “${esc(q)}”.</div>`;
}
async function openShare(key) {
    if (!state.feed) await loadFeed();
    if (!findPost(key)) return toast("That post is gone");
    shareKey = key; shareSel.clear();
    const el = shareSheet();
    $("[data-share-q]", el).value = ""; $("[data-share-msg]", el).value = "";
    renderShareGrid(); updateShareButton();
    el.classList.add("show");
}
function closeShare() { const el = $("#shareSheet"); if (el) el.classList.remove("show"); }
async function sendShare() {
    const p = findPost(shareKey), text = $("[data-share-msg]").value.trim(), to = [...shareSel];
    if (!p || !to.length) return;
    $("[data-share-go]").disabled = true;
    const sent = [];
    for (const cid of to) {
        try {
            const m = await api(chatUrl("/messages", cid), { method: "POST", body: { text, share_cid: p.cid, share_photo: p.photo } });
            const ch = charById(cid); if (ch) ch.last = m;
            if (cid === state.cid) { state.messages.push(m); appendMessage(m, chatOpen()); }
            // she sees it a moment later and answers (lands as unread if that chat isn't open)
            setTimeout(() => requestReply(cid), 1200 + Math.random() * 1800);
            sent.push(charById(cid).name);
        } catch (ex) { toast(`Couldn't send to ${charById(cid)?.name || cid}: ${ex.message}`); }
    }
    renderSidebar();
    closeShare();
    if (sent.length) { toast(`Sent to ${sent.join(", ")} ✈️`); if (fxOn()) fxBurst(["✈️", "💌"], 6); }
}
document.addEventListener("click", e => {
    const s = e.target.closest("[data-share]");
    if (s) openShare(s.dataset.share);
});
// Esc closes only the share sheet, not the post window under it (capture runs before that listener)
document.addEventListener("keydown", e => {
    if (e.key === "Escape" && $("#shareSheet.show")) { e.stopImmediatePropagation(); closeShare(); }
}, true);

// ---- The post window ----
async function openPostModal(key, focus) {
    if (!state.feed) await loadFeed();
    const p = findPost(key), c = p && charById(p.cid);
    if (!p || !c) return;
    const box = $("#postModal");
    box.innerHTML = `<button class="pm-close" data-pm-close title="Close (Esc)">✕</button>
        <div class="pm-card" data-pkey="${esc(key)}">
            <div class="post-photo pm-photo lq" style="${lqVar(p)}" data-dbl-like><img src="${esc(p.url)}" alt=""><span class="big-heart">♥</span></div>
            <div class="pm-side">
                <div class="fp-head">${avHTML(c, "sm")}
                    <div class="fp-who"><button class="fp-name" data-her="${esc(c.id)}" data-pm-close>${esc(c.name.toLowerCase())}</button>${p.location ? `<span class="fp-loc">${esc(p.location)}</span>` : ""}</div></div>
                <div class="pm-body">
                    ${p.caption ? `<div class="post-caption"><b>${esc(c.name.toLowerCase())}</b> ${esc(p.caption)}</div>` : ""}
                    <div class="fp-comments">${commentsHTML(p, 0)}</div>
                </div>
                ${postActionsHTML(p, c)}
                <div class="pm-date">${postWhen(p.date)}</div>
                ${commentFormHTML()}
            </div>
        </div>`;
    box.classList.add("show");
    if (focus) setTimeout(() => $(".fp-form input", box)?.focus(), 60);
}
function closePostModal() { $("#postModal").classList.remove("show"); }
document.addEventListener("keydown", e => { if (e.key === "Escape" && $("#postModal").classList.contains("show")) closePostModal(); });

// ---- Home ----
async function renderHome() {
    renderStoryStrip();
    if (!state.feed) { $("#feed").innerHTML = skeletonFeed(); await loadFeed(); }
    $("#feed").innerHTML = state.feed.length ? state.feed.map(feedPostHTML).join("") : `<div class="empty-state">No posts yet.</div>`;
}

// ---- Explore ----
let exFilter = "";
$("#exSearch").addEventListener("input", e => { exFilter = e.target.value.trim().toLowerCase(); renderExplore(); });
async function renderExplore() {
    if (!state.feed) { $("#exGrid").innerHTML = skeletonTiles(); await loadFeed(); }
    const people = exFilter ? (state.characters || []).filter(c => `${c.name} ${c.city} ${c.country} ${c.occupation}`.toLowerCase().includes(exFilter)) : [];
    $("#exPeople").classList.toggle("hidden", !exFilter);
    $("#exPeople").innerHTML = people.length ? people.map(c => `<button class="ex-person" data-her="${esc(c.id)}">${avHTML(c, "lg", false)}
        <span><b>${esc(c.name.toLowerCase())}</b><small>${esc(c.name)} · ${esc(c.city)} · ${esc(c.occupation)}</small></span></button>`).join("")
        : `<div class="sb-empty" style="padding:10px">No one matches “${esc(exFilter)}”.</div>`;
    // shuffled anew every time the app opens, but stable while it's open (the mosaic doesn't jump around)
    const hash = str => { let h = 7; for (const ch of str) h = (h * 31 + ch.charCodeAt(0)) | 0; return h; };
    const posts = state.feed.filter(p => !exFilter || people.some(c => c.id === p.cid))
        .sort((a, b) => hash(pkey(a) + SL.SESSION) - hash(pkey(b) + SL.SESSION));
    $("#exGrid").innerHTML = posts.map((p, i) => `<button class="ex-tile lq ${i % 10 === 2 || i % 10 === 5 ? "tall" : ""}" data-pm-open="${esc(pkey(p))}" style="${lqVar(p)}animation-delay:${Math.min(i, 12) * 0.025}s">
        <img src="${esc(p.url)}" loading="lazy" alt=""><span class="ex-ov"><span>♥ ${p.likes}</span>${p.comments.length ? `<span>💬 ${p.comments.length}</span>` : ""}</span></button>`).join("");
}

// ---- Notifications ----
const actSeenKey = () => `saneme_activity_seen:${state.profile ? state.profile.id : ""}`;
const actSeen = () => { try { return +localStorage.getItem(actSeenKey()) || 0; } catch (e) { return 0; } };
async function loadActivity() {
    try { state.activity = (await api("/api/activity")).events; } catch (e) { state.activity = state.activity || []; }
    const seen = actSeen(), n = state.activity.filter(e => e.ts > seen && e.type !== "match").length;
    renderConvList();
    $$("[data-activity-count]").forEach(el => { el.textContent = n > 9 ? "9+" : n || ""; el.classList.toggle("hidden", !n); });
}
function actRowHTML(e, seen) {
    const c = charById(e.cid);
    if (!c) return "";
    const right = e.type === "match" ? `<button class="btn small" data-chat="${esc(c.id)}">Message</button>`
        : e.thumb ? `<img class="act-thumb" src="${esc(e.thumb)}" alt="">`
        : e.type === "story" ? `<span class="act-thumb swatch bg-${esc(e.bg || "pink")}"></span>` : "";
    return `<div class="act-row ${e.ts > seen && e.type !== "match" ? "unseen" : ""}" data-act-type="${esc(e.type)}" data-act-cid="${esc(c.id)}" data-act-photo="${esc(e.photo || "")}">
        ${avHTML(c, "lg")}<div class="act-txt"><b>${esc(c.name.toLowerCase())}</b> ${esc(e.text)} <time>${agoShort(e.ts)}</time></div>${right}</div>`;
}
async function renderActivity() {
    await loadActivity();
    const seen = actSeen(), nowS = nowMs() / 1000, used = new Set();
    let html = "";
    for (const [title, test] of [["Today", e => nowS - e.ts < 86400], ["This week", e => nowS - e.ts < 7 * 86400], ["Earlier", () => true]]) {
        const items = state.activity.filter(e => !used.has(e) && test(e));
        items.forEach(e => used.add(e));
        if (items.length) html += `<div class="act-h">${title}</div>` + items.map(e => actRowHTML(e, seen)).join("");
    }
    $("#actList").innerHTML = html || `<div class="empty-state">Nothing yet.</div>`;
    try { localStorage.setItem(actSeenKey(), String(nowS)); } catch (e) {}
    $$("[data-activity-count]").forEach(el => el.classList.add("hidden"));
}
document.addEventListener("click", e => {
    const r = e.target.closest("[data-act-type]");
    if (!r || e.target.closest("[data-av-of], button")) return;
    const { actType: t, actCid: cid, actPhoto: photo } = r.dataset;
    if (t === "story") storyRing(cid) ? openStories(cid) : showHer(cid);
    else if (t === "like") showHer(cid);
    else if (t === "post" || t === "comment") openPostModal(`${cid}/${photo}`);
    else openChat(cid);
});
// notes change a few times a day; activity also comes live (js/live.js)
setInterval(() => { if (state.profile) { loadNotes(); loadActivity(); } }, 300000);

// ---- Highlights on her profile: the story viewer, without the 24h / reply parts ----
function openHighlight(cid, idx) {
    const h = (state.herHighlights || [])[idx], c = charById(cid);
    if (!h || !c || !h.items.length) return;
    sv.mode = "highlight";
    sv.list = h.items.map(it => ({ ...it, bg: it.bg || h.bg || "pink", posted_at: null, title: h.title, character: c }));
    sv.i = 0;
    $("#storyViewer").classList.add("show", "hl");
    showStory();
    cancelAnimationFrame(sv.raf); sv.last = performance.now(); sv.raf = requestAnimationFrame(storyTick);
}
