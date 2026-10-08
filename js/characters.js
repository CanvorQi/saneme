// js/characters.js - Characters: open a chat, the chat list, matches, her profile page.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Characters: one chat each ----------------
// state.cid = the chat that's open; state.viewCid = whose profile page is shown (can differ)
const charById = cid => (state.characters || []).find(c => c.id === cid);
const chatUrl = (path, cid) => `/api/c/${encodeURIComponent(cid || state.cid)}${path}`;
const storageObj = key => { try { return JSON.parse(localStorage.getItem(key) || "{}"); } catch (e) { return {}; } };
const storageSet = (key, obj) => { try { localStorage.setItem(key, JSON.stringify(obj)); } catch (e) {} };
const seenKey = () => `saneme_seen_msgs:${state.profile ? state.profile.id : ""}`;

function markSeen(cid, msgId) {
    const map = storageObj(seenKey());
    if ((map[cid] || 0) < msgId) { map[cid] = msgId; storageSet(seenKey(), map); }
}
function markCurrentSeen() {
    if (!state.cid || document.hidden || $("#view-chat").classList.contains("hidden")) return;
    const last = state.messages[state.messages.length - 1];
    if (last) markSeen(state.cid, last.id);
    renderSidebar();
}
function isUnread(ch) {
    const last = ch.last;
    return !!(last && last.role === "saneme" && last.id > (storageObj(seenKey())[ch.id] || 0)
        && !(ch.id === state.cid && !$("#view-chat").classList.contains("hidden") && !document.hidden));
}
// light presence until the Presence Engine exists: "online" right after she wrote, or while typing
const isOnline = ch => typingChats.has(ch.id) || !!(ch.last && ch.last.role === "saneme" && (nowMs() / 1000 - ch.last.ts) < 360);

// header, chat chip, story viewer etc. show whoever's chat is open
function applyCharacter() {
    const c = charById(state.cid);
    if (!c) return;
    state.persona = c;
    $$("[data-persona-name]").forEach(e => e.textContent = c.name);
    $$("[data-persona-initial]").forEach(e => e.textContent = c.name[0]);
    $$("[data-persona-meta]").forEach(e => e.textContent = `${c.age} · ${c.city}`);
    $$("[data-persona-photo]").forEach(e => e.innerHTML = c.photo
        ? `<img src="${esc(c.photo)}" alt="">` : `<span data-persona-initial>${esc(c.name[0])}</span>`);
    $("#msgInput").placeholder = `Message ${c.name}…`;
}

async function openChat(cid, opts = {}) {
    if (!charById(cid)) return;
    if (cid !== state.cid || opts.reload) {
        if (replyTimer && replyTimerCid && replyTimerCid !== cid) {
            const left = replyTimerCid;
            clearTimeout(replyTimer); replyTimer = null;
            requestReply(left);  // you texted her and left: she still answers (it lands as unread)
        }
        // unsent text stays with the chat it was typed in (a draft per chat)
        if (state.cid) drafts[state.cid] = input.value;
        input.value = drafts[cid] || "";
        input.style.height = "auto"; if (input.value) input.style.height = Math.min(input.scrollHeight, 120) + "px";
        state.cid = cid;
        setStatus("idle");  // clear the previous chat's "typing…" from the header
        try { localStorage.setItem("saneme_last_chat", cid); } catch (e) {}
        applyCharacter();
        setReplyTo(null);
        toggleStickers(false);
        state.messages = [];
        msgBox.innerHTML = `<div class="heart-loader"><img src="icon.png" alt="">opening the chat…</div>`;
        try {
            const r = await api(chatUrl("/chat"));
            if (state.cid !== cid) return;  // clicked another chat meanwhile
            state.messages = r.messages;
        } catch (e) { sysNote("⚠ " + e.message); }
        renderAll();
        if (typingChats.has(cid)) setStatus("typing");
        api(chatUrl("/debug")).then(renderDebug).catch(() => renderDebug(null));
        updateStoryRings();
        // if your last message is unanswered (e.g. page was reloaded), ask for a reply
        const last = state.messages[state.messages.length - 1];
        if (last && last.role === "user" && !busyChats.has(cid)) scheduleReply(cid, 800);
    }
    if (!opts.stay) showView("chat");
    markCurrentSeen();
}

// ---------------- Sidebar: chat list, stories strip, you ----------------
let convFilter = "";
function shortWhen(ts) {
    const d = new Date(ts * 1000), now = new Date(nowMs());
    if (d.toDateString() === now.toDateString()) return fmtTime(ts);
    const y = new Date(nowMs()); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Yesterday";
    return d.toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function previewOf(m) {
    const meta = m.meta || {};
    if (meta.deleted) return "🚫 deleted a message";
    if (m.role === "user") {
        if (meta.story) return `You replied to her story: ${m.text}`;
        if (meta.note) return `You replied to her note: ${m.text}`;
        if (meta.post) return `You commented: ${m.text}`;
        if (meta.shared) return `You sent ${meta.shared.own ? "her post" : `${meta.shared.name}'s post`}` + (m.text ? `: ${m.text}` : "");
        if (meta.sticker) return `You sent a sticker ${meta.sticker.emoji}`;
        const rx = (meta.reactions || {}).saneme;
        if (rx) return `Reacted ${rx} to your message`;
        return `You: ${m.text}` + (meta.read_at ? " · Seen" : "");
    }
    if (meta.photo) return "📷 sent a photo";
    return m.text;
}
function convRowHTML(ch) {
    const unread = isUnread(ch), typing = typingChats.has(ch.id);
    const ring = storyRing(ch.id);
    const prev = typing ? "typing…" : ch.last ? previewOf(ch.last) : `New match · ${ch.city}`;
    return `<button class="conv-row ${ch.id === state.cid ? "active" : ""} ${unread ? "is-unread" : ""}" data-chat="${esc(ch.id)}" title="${esc(ch.name)}">
        <span class="conv-av ${ring ? "has-story" : ""} ${ring === "seen" ? "seen" : ""}">
            <span>${ch.photo ? `<img src="${esc(ch.photo)}" alt="">` : `<span>${esc(ch.name[0])}</span>`}</span>
            <span class="dot ${isOnline(ch) ? "ok" : "off"}"></span></span>
        <span class="conv-main">
            <span class="conv-top"><b>${esc(ch.name)}</b><time>${ch.last ? shortWhen(ch.last.ts) : ""}</time></span>
            <span class="conv-bottom"><span class="conv-prev ${typing ? "typing" : unread ? "unread" : ""} ${ch.last ? "" : "is-new"}">${esc(prev)}</span>
            ${unread ? `<span class="conv-badge-dot"></span>` : ""}</span>
        </span>
    </button>`;
}
const chatOpen = () => !$("#view-chat").classList.contains("hidden");
function renderConvList() {
    const all = state.characters || [];
    // the open chat is listed even before the first message (you're about to say hi)
    const list = all.filter(c => c.last || (c.id === state.cid && chatOpen()))
        .filter(c => !convFilter || `${c.name} ${c.city}`.toLowerCase().includes(convFilter))
        .sort((a, b) => (b.last ? b.last.ts : Infinity) - (a.last ? a.last.ts : Infinity));
    const html = list.length ? list.map(convRowHTML).join("")
        : convFilter ? `<div class="sb-empty">No chat with “${esc(convFilter)}”.</div>`
        : `<div class="conv-empty">No chats yet.<br>Pick someone from your <b class="conv-empty-link" data-view-go="matches">matches</b> and say hi, or wait. Some of them might text first 👀</div>`;
    ["#convList", "#mobileConvList"].forEach(sel => { const el = $(sel); if (el) el.innerHTML = html; });
    const unread = (state.characters || []).filter(isUnread).length;
    $$("[data-unread-count]").forEach(e => { e.textContent = unread || ""; e.classList.toggle("hidden", !unread); });
    $$("[data-active-count]").forEach(e => e.textContent = list.length ? `${list.length} ${list.length > 1 ? "chats" : "chat"}` : "");
}
document.addEventListener("click", e => {
    const row = e.target.closest("[data-chat]");
    if (row) openChat(row.dataset.chat);
});
$$("[data-conv-search]").forEach(inp => inp.addEventListener("input", () => {
    convFilter = inp.value.trim().toLowerCase();
    $$("[data-conv-search]").forEach(o => { if (o !== inp) o.value = inp.value; });
    renderConvList();
}));
function renderSidebar() {
    renderConvList();
    if (state.profile) {
        $$("[data-me-name]").forEach(e => e.textContent = state.profile.name);
        const key = JSON.stringify(state.profile.appearance), me = $("#railMe");
        if (me && me.dataset.key !== key) { me.innerHTML = AV.svg(state.profile.appearance); me.dataset.key = key; }
    }
}
// her last message in the current chat moved: keep the list row in sync
function touchCurrentChat() {
    const c = charById(state.cid);
    if (c) c.last = state.messages[state.messages.length - 1] || null;
    renderSidebar();
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) markCurrentSeen(); });
// every so often: other chats' previews and online dots (replies that finished while you were elsewhere)
async function refreshCharacters() {
    try {
        const s = await api("/api/state");
        const fresh = Object.fromEntries(s.characters.map(c => [c.id, c]));
        for (const c of state.characters || []) {
            const f = fresh[c.id];
            if (!f) continue;
            const arrived = f.last && f.last.role === "saneme" && (!c.last || f.last.id > c.last.id);
            const firstMove = arrived && !c.last;
            c.last = f.last; c.mood = f.mood;
            if (!arrived || busyChats.has(c.id) && c.id === state.cid) continue;
            if (c.id === state.cid) {
                // the open chat: show her new bubbles right away
                const r = await api(chatUrl("/chat", c.id));
                const known = new Set(state.messages.map(m => m.id));
                for (const m of r.messages.filter(m => !known.has(m.id))) { state.messages.push(m); appendMessage(m, true); await sleep(250); }
                markCurrentSeen();
            }
            if (firstMove || c.id !== state.cid || !chatOpen()) {
                toast(firstMove ? `${c.name} texted you first 👀` : `New message from ${c.name}`);
                bumpUnread();
                if (firstMove) loadActivity();
            }
        }
        renderSidebar();
    } catch (e) {}
}
// safety net only: new messages arrive live (js/live.js)
setInterval(() => { if (state.profile && !document.hidden) refreshCharacters(); }, 120000);

// ---------------- Matches: everyone you matched with ----------------
function renderMatches() {
    const grid = $("#matchGrid");
    grid.innerHTML = (state.characters || []).map((c, i) => {
        const ring = storyRing(c.id);
        return `<article class="mcard" style="animation-delay:${i * 0.04}s">
            <div class="mc-cover" style="${c.cover ? `background-image:url('${esc(c.cover)}')` : ""}" data-her="${esc(c.id)}"></div>
            <div class="mc-av ${ring ? "has-story" : ""} ${ring === "seen" ? "seen" : ""}" data-mc-avatar="${esc(c.id)}" title="${ring ? "View her story" : "View profile"}">
                ${c.photo ? `<img src="${esc(c.photo)}" alt="">` : ""}<span class="dot ${isOnline(c) ? "ok" : "off"}"></span></div>
            <div class="mc-body">
                <div class="mc-name">${esc(c.name)}<span>, ${c.age}</span></div>
                <div class="mc-sub">📍 ${esc(c.city)}${c.country ? ", " + esc(c.country) : ""}</div>
                <div class="mc-sub">${esc(c.occupation)}</div>
                <p class="mc-bio">${esc(c.bio)}</p>
                <div class="mc-actions">
                    <button class="btn ghost small" data-her="${esc(c.id)}">Profile</button>
                    <button class="btn small" data-chat="${esc(c.id)}">${c.last ? "Open chat" : "Say hi 👋"}</button>
                </div>
            </div>
        </article>`;
    }).join("");
    $$("[data-mc-avatar]", grid).forEach(el => el.addEventListener("click", () => {
        const cid = el.dataset.mcAvatar;
        storyRing(cid) ? openStories(cid) : showHer(cid);
    }));
}
document.addEventListener("click", e => {
    const h = e.target.closest("[data-her]");
    if (h) showHer(h.dataset.her);
});
function showHer(cid) { state.viewCid = cid; showView("her"); }

// ---------------- Her profile page (any of them) ----------------
let herTab = "grid";  // "grid" (Instagram default), "photos" = the post feed, "about"
function relDays(ts) {
    const days = Math.round((new Date(nowMs()).setHours(0, 0, 0, 0) - new Date(ts * 1000).setHours(0, 0, 0, 0)) / 86400000);
    return days <= 0 ? "today" : days === 1 ? "yesterday" : `${days} days ago`;
}
function setHerTab(name) {
    herTab = name;
    $$("[data-htab]").forEach(b => b.classList.toggle("active", b.dataset.htab === name));
    $$("[data-hpane]").forEach(p => {
        const on = p.dataset.hpane === name;
        if (on && p.classList.contains("hidden")) { p.classList.remove("view-enter"); void p.offsetWidth; p.classList.add("view-enter"); }
        p.classList.toggle("hidden", !on);
    });
}
async function renderHerProfile() {
    const cid = state.viewCid || state.cid;
    const box = $("#herProfile");
    // another her (or nothing yet) on screen: show the shape of a profile while hers loads
    if (box.dataset.cid !== cid) {
        box.dataset.cid = cid;
        box.innerHTML = `<div class="ig-head sk-head" aria-hidden="true"><span class="sk sk-avatar"></span>
            <div class="sk-body"><span class="sk sk-line" style="width:140px;height:18px"></span><span class="sk sk-line" style="width:240px"></span><span class="sk sk-line" style="width:60%"></span></div></div>
            <div class="her-photo-grid" style="padding:24px 40px">${Array.from({ length: 6 }, () => `<div class="sk her-photo"></div>`).join("")}</div>`;
    }
    let h;
    try { [h] = await Promise.all([api(`/api/c/${encodeURIComponent(cid)}/profile`), state.feed ? null : loadFeed()]); }
    catch (e) { box.innerHTML = `<div class="empty-state" style="padding:40px">${esc(e.message)}</div>`; return; }
    if ((state.viewCid || state.cid) !== cid) return;
    const posts = h.posts, where = [h.district, h.city].filter(Boolean).join(", ");
    const profileIdx = Math.max(0, posts.findIndex(p => p.url === h.profile_photo));
    const ring = storyRing(cid), c = charById(cid) || {};
    const fmtN = n => n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, "") + "k" : String(n);
    state.herHighlights = h.highlights || [];
    box.innerHTML = `
        <div class="ig-head">
            <div class="ig-av-col">
                ${h.note ? `<button class="nbubble ig-note" data-note-of="${esc(cid)}" title="Reply to her note"><span>${esc(h.note.text)}</span></button>` : ""}
                <div class="avatar-frame-wrap ${ring ? "has-story" : ""} ${ring === "seen" ? "seen" : ""}" id="herAvatarWrap"><div class="avatar-frame" data-avatar-open title="${ring ? "View her story" : "View photo"}">${h.profile_photo ? `<img src="${esc(h.profile_photo)}" alt="">` : ""}<span class="her-online ${isOnline(c) ? "" : "off"}"></span></div></div>
            </div>
            <div class="ig-info">
                <div class="ig-row1">
                    <span class="ig-user">${esc(h.name.toLowerCase())}</span>
                    <button class="btn ghost small" data-follow>Following ✓</button>
                    <button class="btn small" data-her-msg>Message</button>
                </div>
                <div class="ig-stats"><span><b>${h.stats.posts}</b> posts</span><span><b>${fmtN(h.stats.followers)}</b> followers</span><span><b>${fmtN(h.stats.following)}</b> following</span></div>
                <div class="ig-name">${esc(h.name)}<span>, ${esc(h.age)}</span></div>
                <div class="sub">📍 ${esc(where)}${h.country ? ", " + esc(h.country) : ""}${h.occupation ? ` · ${esc(h.occupation)}` : ""}</div>
                ${h.bio ? `<p class="her-bio">${esc(h.bio)}</p>` : ""}
            </div>
        </div>
        ${state.herHighlights.length ? `<div class="ig-highlights">${state.herHighlights.map((x, i) => `
            <button class="ig-hl" data-hl="${i}" title="${esc(x.title)}"><span class="ig-hl-ring"><span class="ig-hl-in ${x.cover ? "" : "bg-" + esc(x.bg || "pink")}">${x.cover
                ? `<img src="${esc(x.cover)}" alt="">` : `<span>${esc(x.title[0])}</span>`}</span></span><span class="nm">${esc(x.title)}</span></button>`).join("")}</div>` : ""}
        <div class="profile-page-grid">
            <div class="profile-main">
                <div class="her-chips">${h.interests.map(i => `<span class="chip">${esc(i)}</span>`).join("")}</div>
                <div class="profile-tabs">
                    <button class="ptab" data-htab="grid">Posts · ${posts.length}</button>
                    <button class="ptab" data-htab="photos">Feed</button>
                    <button class="ptab" data-htab="about">About her</button>
                </div>
                <div data-hpane="grid">
                    ${posts.length ? `<div class="her-photo-grid">${posts.map(p => `
                        <div class="her-photo lq" style="${lqVar(p)}" data-pm-open="${esc(cid + "/" + p.photo)}" title="${esc(p.caption)}"><img src="${esc(p.url)}" loading="lazy" alt="">
                        <span class="hp-ov">♥ ${p.likes}</span></div>`).join("")}</div>`
                    : `<div class="empty-state">No posts yet. Put photos in <code>characters/${esc(cid)}/photos</code>.</div>`}
                </div>
                <div data-hpane="photos" class="hidden">
                    ${posts.length ? `<div class="post-feed">${posts.map((p, i) => postHTML(h, p, i)).join("")}</div>` : ""}
                </div>
                <div data-hpane="about" class="hidden">
                    ${h.prompts.map(p => `<div class="prompt-card"><div class="q">${esc(p.q)}</div><div class="a">${esc(p.a)}</div></div>`).join("")}
                    <div style="margin-top:12px">
                        ${h.occupation ? `<div class="about-row"><span class="ic">💼</span>${esc(h.occupation)}</div>` : ""}
                        ${where ? `<div class="about-row"><span class="ic">📍</span>Lives in ${esc(where)}${h.country ? ", " + esc(h.country) : ""}</div>` : ""}
                        <div class="about-row"><span class="ic">✨</span>Into ${esc(h.interests.slice(0, 4).join(", "))}</div>
                    </div>
                </div>
            </div>
            <aside class="profile-side">
                ${posts.length ? `<div class="side-section"><div class="side-title">Recent</div>
                    <div class="side-recent">${posts.slice(0, 6).map((p, i) => `<div data-goto-post="${i}" title="${esc(p.caption)}"><img src="${esc(p.url)}" loading="lazy" alt=""></div>`).join("")}</div></div>` : ""}
                ${h.you ? `<div class="side-section"><div class="side-title">You two</div>
                    <div class="side-kv">💞 matched <b>${relDays(h.you.matched_at)}</b><br>💬 <b>${h.you.messages}</b> messages so far</div></div>` : ""}
            </aside>
        </div>`;
    setHerTab(herTab);
    const lbItems = posts.map(p => ({ url: p.url, caption: p.caption }));
    $$("[data-htab]", box).forEach(b => b.addEventListener("click", () => setHerTab(b.dataset.htab)));
    $$("[data-hl]", box).forEach(b => b.addEventListener("click", () => openHighlight(cid, +b.dataset.hl)));
    $("[data-follow]", box).addEventListener("click", e => {
        const b = e.currentTarget, on = b.textContent.startsWith("Following");
        b.textContent = on ? "Follow" : "Following ✓";
        b.classList.toggle("ghost", !on);
    });
    // her avatar: stories first if she has any up, otherwise the profile photo
    $("[data-avatar-open]", box).addEventListener("click", () => storyRing(cid) ? openStories(cid) : openLightbox(lbItems, profileIdx));
    $("[data-her-msg]", box).addEventListener("click", () => openChat(cid));
    // Recent thumbnails jump to that post in the feed
    $$("[data-goto-post]", box).forEach(el => el.addEventListener("click", () => {
        setHerTab("photos");
        const post = $(`.post[data-post="${el.dataset.gotoPost}"]`, box);
        post.scrollIntoView({ behavior: "smooth", block: "start" });
        post.classList.remove("flash"); void post.offsetWidth; post.classList.add("flash");
    }));
    // like: the heart button, or double-click the photo (with a big heart pop, like Instagram)
    $$(".post", box).forEach(el => {
        const p = posts[+el.dataset.post];
        const like = async (fromPhoto) => {
            if (fromPhoto && p.liked) { heartPop(el); return; }
            const r = await api(`/api/c/${encodeURIComponent(cid)}/posts/like`, { method: "POST", body: { photo: p.photo } });
            p.liked = r.liked; p.likes = r.likes;
            const fp = findPost(`${cid}/${p.photo}`);
            if (fp) { fp.liked = r.liked; fp.likes = r.likes; }
            $(".like-btn", el).classList.toggle("liked", p.liked);
            $(".like-count", el).textContent = `${p.likes} likes`;
            if (p.liked) heartPop(el);
        };
        $(".like-btn", el).addEventListener("click", () => like(false));
        $(".post-photo", el).addEventListener("dblclick", e => { e.preventDefault(); like(true); });
        $(".post-photo", el).addEventListener("click", e => {
            // single click opens the viewer, but wait to see if it becomes a double-click
            clearTimeout(el._t);
            if (e.detail === 1) el._t = setTimeout(() => openLightbox(lbItems, +el.dataset.post), 260);
        });
        // the speech bubble opens the post with the comment box (she answers under the post)
        $(".reply-btn", el).addEventListener("click", () => openPostModal(`${cid}/${p.photo}`, true));
    });
}
function postWhen(d) {
    if (!d) return "";
    const days = Math.round((new Date(nowMs()).setHours(0, 0, 0, 0) - new Date(d + "T00:00:00").getTime()) / 86400000);
    if (days <= 0) return "today";
    if (days === 1) return "yesterday";
    if (days < 7) return `${days}d`;
    if (days < 60) return `${Math.round(days / 7)}w`;
    return new Date(d + "T00:00:00").toLocaleDateString("en-US", { month: "short", day: "numeric" });
}
function postHTML(h, p, i) {
    return `<article class="post" data-post="${i}">
        <div class="post-head">
            <img src="${esc(h.profile_photo || p.url)}" alt="">
            <div><div class="n">${esc(h.name.toLowerCase())}</div>${p.location ? `<div class="loc">${esc(p.location)}</div>` : ""}</div>
            <div class="when">${postWhen(p.date)}</div>
        </div>
        <div class="post-photo lq" style="${lqVar(p)}"><img src="${esc(p.url)}" loading="lazy" alt=""><span class="big-heart">♥</span></div>
        <div class="post-actions">
            <button class="like-btn ${p.liked ? "liked" : ""}" title="Like"><svg viewBox="0 0 24 24"><path d="M12 21s-7.5-4.6-9.6-9.2C.9 8.4 3 4.5 6.8 4.5c2.1 0 3.6 1.1 4.4 2.4h1.6c.8-1.3 2.3-2.4 4.4-2.4 3.8 0 5.9 3.9 4.4 7.3C19.5 16.4 12 21 12 21z"/></svg></button>
            <button class="reply-btn" title="Comment on this post"><svg viewBox="0 0 24 24"><path d="M21 12a8.5 8.5 0 0 1-12.6 7.4L3 21l1.6-5.2A8.5 8.5 0 1 1 21 12z"/></svg></button>
            <button data-share="${esc(h.id + "/" + p.photo)}" title="Send this post to someone">${ICON_SEND}</button>
        </div>
        <div class="like-count">${p.likes} likes</div>
        ${p.caption ? `<div class="post-caption"><b>${esc(h.name.toLowerCase())}</b> ${esc(p.caption)}</div>` : ""}
    </article>`;
}
function heartPop(el) {
    const heart = $(".big-heart", el);
    heart.classList.remove("pop"); void heart.offsetWidth; heart.classList.add("pop");
}
