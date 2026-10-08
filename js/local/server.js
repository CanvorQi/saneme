// js/local/server.js - The app's "server", running inside the page.
// The desktop app's frontend talks to a FastAPI backend (/api/...). The web version keeps that
// exact frontend and answers the same requests here, from the browser's storage:
//     SL.api(path, {method, body})  - the REST endpoints (same paths, same JSON)
//     SL.replyEvents(cid)           - her reply as a stream of events (read, reaction, bubble, done)
//     SL.LiveEvents                 - live events (new bubbles, first moves, comment replies)
// Background jobs (first moves, answering comments) run on timers while the app is open.
window.SL = window.SL || {};

(() => {
    const S = SL.store, C = SL.chars, now = SL.util.now;
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    class HttpError extends Error { constructor(status, detail) { super(detail); this.status = status; } }
    const err = (status, detail) => { throw new HttpError(status, detail); };

    // ---- live events (the stand-in for /api/events, Server-Sent Events) ----
    const listeners = {};
    function publish(ev) { (listeners[ev.type] || []).forEach(cb => { try { cb({ data: JSON.stringify(ev) }); } catch (e) { console.error(e); } }); }
    class LiveEvents {
        addEventListener(type, cb) { (listeners[type] = listeners[type] || []).push(cb); }
    }
    SL.LiveEvents = LiveEvents;

    // ---- helpers ----
    const activeProfile = () => { const id = S.getSetting("active_profile"); return id ? S.getProfile(id) : null; };
    const requireProfile = () => activeProfile() || err(400, "Create a profile first");
    const character = cid => C.has(cid) ? C.load(cid) : err(404, "No such character");
    const likedPosts = (pid, cid) => S.getSetting(`likes:${pid}:${cid}`) || [];
    const preview = m => ({ id: m.id, role: m.role, text: (m.text || "").slice(0, 140) });
    const card = cid => ({ ...C.card(cid), last: null });

    // ---- comments (his comment, her reply under the post) ----
    const COMMENT_PENDING_S = 120;
    function commentsOf(pid, cid) {
        const out = {}, msgs = S.getMessages(pid, cid);
        msgs.forEach((m, i) => {
            const post = (m.meta || {}).post;
            if (m.role !== "user" || !post) return;
            const reply = msgs.slice(i + 1).find(x => x.role === "saneme" && !(x.meta || {}).deleted);
            (out[post.photo] = out[post.photo] || []).push({ text: m.text, ts: m.ts, reply: reply ? reply.text : null, where: "dm" });
        });
        const rows = S.getComments(pid, cid), replies = {};
        rows.filter(r => r.role === "saneme").forEach(r => replies[r.reply_to] = r);
        const t = now();
        rows.filter(r => r.role === "user").forEach(r => {
            const rep = replies[r.id];
            (out[r.photo] = out[r.photo] || []).push({ id: r.id, text: r.text, ts: r.ts, where: "post", reply: rep ? rep.text : null,
                                                       reply_ts: rep ? rep.ts : null, pending: !rep && t - r.ts < COMMENT_PENDING_S });
        });
        Object.values(out).forEach(l => l.sort((a, b) => a.ts - b.ts));
        return out;
    }
    async function answerComment(me, persona, post, c) {
        await sleep(SL.util.rng().uniform(2500, 6000));
        const pid = me.id, cid = persona.id;
        try {
            const stage = SL.attraction.stageOf(me, persona);
            const line = SL.engine.commentReply(me, persona, post, c.text, stage, SL.util.rng());
            const { parts } = SL.style.apply([line], persona, { stage, mods: { max_parts: 1, label: "neutral" } });
            const r = S.addComment(pid, cid, post.photo, "saneme", parts.filter(p => !p.startsWith("*")).join(" ").slice(0, 300), c.id);
            publish({ type: "comment", pid, cid, photo: post.photo, reply_to: c.id, reply: r.text, reply_ts: r.ts });
            publish({ type: "activity", pid });
        } catch (e) {
            console.error(e);
            publish({ type: "comment", pid, cid, photo: post.photo, reply_to: c.id, failed: true });
        }
    }

    // ---- the routes ----
    const routes = [];
    const route = (method, pattern, fn) => routes.push({ method, re: new RegExp("^" + pattern.replace(/\{(\w+)\}/g, "(?<$1>[^/?]+)") + "(?:\\?.*)?$"), fn });

    route("GET", "/api/state", () => {
        const profile = activeProfile();
        const last = profile ? S.lastMessages(profile.id) : {};
        return { profile, profiles: S.listProfiles(),
                 characters: C.ids().map(cid => ({ ...C.card(cid), last: last[cid] || null, mood: SL.mood.label(SL.mood.current(C.load(cid)).values) })),
                 now: now() };
    });
    route("GET", "/api/c/{cid}/chat", ({ cid }) => {
        character(cid);
        const me = activeProfile();
        return { character: C.card(cid), messages: me ? S.getMessages(me.id, cid) : [] };
    });
    route("GET", "/api/c/{cid}/profile", ({ cid }) => {
        const p = character(cid), me = activeProfile();
        let you = null;
        if (me) { const n = S.countMessages(me.id, cid); you = { matched_at: me.created_at, messages: n.user + n.saneme }; }
        return { id: cid, name: p.name, age: p.age, city: p.city, district: p.district || "", country: p.country || "", occupation: p.occupation || "",
                 bio: p.bio || "", prompts: p.prompts || [], interests: [...(p.likes || []), ...(p.hobbies || [])].slice(0, 10),
                 ...C.photos(cid), posts: C.posts(cid, me ? likedPosts(me.id, cid) : []), you, stats: C.stats(cid),
                 highlights: SL.stories.highlights(cid), note: SL.stories.note(cid, now()) };
    });
    route("GET", "/api/feed", () => {
        const me = activeProfile(), items = [];
        C.ids().forEach(cid => {
            const comments = me ? commentsOf(me.id, cid) : {};
            C.posts(cid, me ? likedPosts(me.id, cid) : []).forEach(post => {
                // other people's comments + yours, by time
                const all = [...SL.crowd.comments(cid, post), ...(comments[post.photo] || [])].sort((a, b) => a.ts - b.ts);
                items.push({ ...post, cid, comments: all });
            });
        });
        // a different order every time the app opens (stable while it's open, so the feed doesn't jump)
        return { posts: SL.util.rng(`feed-${SL.SESSION}`).shuffle(items) };
    });
    route("POST", "/api/c/{cid}/posts/like", ({ cid }, body) => {
        const p = character(cid), me = requireProfile();
        if (!C.photoFiles(cid).includes(body.photo)) err(404, "No such post");
        const liked = new Set(likedPosts(me.id, cid));
        liked.has(body.photo) ? liked.delete(body.photo) : liked.add(body.photo);
        S.setSetting(`likes:${me.id}:${cid}`, [...liked].sort());
        const post = C.posts(cid, [...liked]).find(x => x.photo === body.photo);
        SL.attraction.onLike(me, p, body.photo, post.liked);
        return { liked: post.liked, likes: post.likes };
    });
    route("POST", "/api/c/{cid}/posts/comment", ({ cid }, body) => {
        const p = character(cid), me = requireProfile();
        const text = (body.text || "").trim();
        if (!text || text.length > 500) err(422, "Comment must be 1-500 characters");
        const post = C.posts(cid).find(x => x.photo === body.photo) || err(404, "No such post");
        const c = S.addComment(me.id, cid, body.photo, "user", text);
        SL.attraction.onComment(me, p, body.photo, text);
        answerComment(me, p, post, c);
        return { comment: { id: c.id, text: c.text, ts: c.ts, where: "post", reply: null, pending: true } };
    });
    route("GET", "/api/notes", () => {
        const t = now();
        const out = C.ids().map(cid => SL.stories.note(cid, t)).filter(Boolean).sort((a, b) => b.posted_at - a.posted_at);
        return { notes: out };
    });
    route("GET", "/api/stories", () => {
        const t = now();
        const out = C.ids().map(cid => {
            const up = SL.stories.active(cid, t);
            return up.length ? { character: C.card(cid), stories: up.map(s => SL.stories.pub(cid, s)) } : null;
        }).filter(Boolean);
        out.sort((a, b) => b.stories[b.stories.length - 1].posted_at - a.stories[a.stories.length - 1].posted_at);
        return { groups: out, now: t };
    });
    route("GET", "/api/activity", () => {
        const me = requireProfile(), t = now(), week = t - 7 * 86400, ev = [];
        C.ids().forEach(cid => {
            const p = C.load(cid), msgs = S.getMessages(me.id, cid);
            const pl = SL.openers.since() ? SL.openers.plan(me, p) : null;
            if (pl && pl.likes && pl.liked_at <= t) ev.push({ type: "like", cid, ts: pl.liked_at, text: "liked your profile card ❤️" });
            msgs.forEach((m, i) => {
                const meta = m.meta || {};
                if (meta.opener && (i === 0 || !(msgs[i - 1].meta || {}).opener)) ev.push({ type: "opener", cid, ts: m.ts, text: `texted you first: "${(m.text || "").slice(0, 60)}"` });
                if (m.role === "user" && (meta.reactions || {}).saneme)
                    ev.push({ type: "reaction", cid, ts: meta.read_at || m.ts, text: `reacted ${meta.reactions.saneme} to your message: "${(m.text || "").slice(0, 60)}"` });
                if (m.role === "user" && (meta.post || meta.story || meta.note)) {
                    const reply = msgs.slice(i + 1).find(x => x.role === "saneme");
                    if (reply && reply.ts <= t) {
                        const what = meta.post ? "comment" : meta.story ? "story reply" : "note reply";
                        ev.push({ type: "answer", cid, ts: reply.ts, text: `answered your ${what}: "${(reply.text || "").slice(0, 60)}"`,
                                  thumb: (meta.post || meta.story || {}).url || (meta.story || {}).photo });
                    }
                }
            });
            S.getComments(me.id, cid).filter(r => r.role === "saneme").forEach(r =>
                ev.push({ type: "comment", cid, ts: r.ts, photo: r.photo, text: `replied to your comment: "${r.text.slice(0, 60)}"`, thumb: C.sizedUrl(cid, r.photo, "sm") }));
            SL.stories.active(cid, t).forEach(s => ev.push({ type: "story", cid, ts: s.posted_at, text: "posted a new story", thumb: C.sizedUrl(cid, s.photo, "sm"), bg: s.bg || "pink" }));
            const n = SL.stories.note(cid, t);
            if (n) ev.push({ type: "note", cid, ts: n.posted_at, text: `left a note: "${n.text}"` });
            C.posts(cid).forEach(post => {
                if (!post.date) return;
                const [y, mo, d] = post.date.split("-").map(Number);
                const ts = SL.util.midnight(p.timezone || "UTC", y, mo, d) + 12 * 3600;
                if (ts <= t) ev.push({ type: "post", cid, ts, photo: post.photo, thumb: C.sizedUrl(cid, post.photo, "sm"), text: post.caption ? `shared a post: "${post.caption.slice(0, 60)}"` : "shared a post" });
            });
            if (me.created_at) ev.push({ type: "match", cid, ts: me.created_at, text: "matched with you. Say hi 👋" });
        });
        const out = ev.filter(e => e.ts >= week || e.type === "match").sort((a, b) => b.ts - a.ts).slice(0, 80);
        return { events: out, now: t };
    });
    route("GET", "/api/llm", () => ({ reachable: true, loaded: true, model: "Sanéme dialog engine", gpu: false, local: true }));
    route("GET", "/api/language", () => ({ entries: window.SANEME_LANGUAGE || [] }));
    route("GET", "/api/stickers", () => ({ stickers: SL.chatmedia.list() }));

    // profiles (you)
    function checkProfile(b) {
        if (!b || !b.name || !String(b.name).trim() || String(b.name).length > 40) err(422, "Name must be 1-40 characters");
        if (!(b.age >= 18 && b.age <= 99)) err(422, "You must be at least 18");
        return { name: String(b.name).trim(), age: +b.age, appearance: b.appearance || {} };
    }
    route("GET", "/api/profiles", () => ({
        profiles: S.listProfiles().map(p => ({ ...p, message_counts: S.countMessages(p.id) })), active: S.getSetting("active_profile") }));
    route("POST", "/api/profiles", (_, b) => { const p = S.createProfile(checkProfile(b)); S.setSetting("active_profile", p.id); return { ok: true, profile: p }; });
    route("PUT", "/api/profiles/{id}", ({ id }, b) => { const p = S.updateProfile(id, checkProfile(b)) || err(404, "Profile not found"); return { ok: true, profile: p }; });
    route("POST", "/api/profiles/{id}/activate", ({ id }) => { const p = S.getProfile(id) || err(404, "Profile not found"); S.setSetting("active_profile", id); return { ok: true, profile: p }; });
    route("DELETE", "/api/profiles/{id}", ({ id }) => {
        S.getProfile(id) || err(404, "Profile not found");
        S.clearChat(id); S.deleteProfile(id);
        if (S.getSetting("active_profile") === id) S.setSetting("active_profile", null);
        return { ok: true };
    });

    // chat
    route("POST", "/api/c/{cid}/messages", ({ cid }, body) => {
        const p = character(cid), profile = requireProfile(), meta = {}, t = now();
        if (body.reply_to) { const target = S.getMessage(profile.id, cid, body.reply_to) || err(404, "The message you're replying to doesn't exist"); meta.reply_to = preview(target); }
        if (body.story_id) {
            const st = SL.stories.get(cid, t, body.story_id) || err(404, "That story is gone");
            meta.story = { id: st.id, text: st.text, photo: C.sizedUrl(cid, st.photo, "sm") };
        }
        if (body.note_id) { const n = SL.stories.getNote(cid, t, body.note_id) || err(404, "That note is gone"); meta.note = { id: n.id, text: n.text }; }
        if (body.post_photo) {
            const post = C.posts(cid).find(x => x.photo === body.post_photo) || err(404, "No such post");
            meta.post = { photo: post.photo, url: post.url, caption: post.caption };
        }
        if (body.share_cid || body.share_photo) {
            const owner = C.has(body.share_cid) ? C.load(body.share_cid) : null;
            const post = owner && C.posts(body.share_cid).find(x => x.photo === body.share_photo);
            if (!post) err(404, "No such post");
            meta.shared = { cid: body.share_cid, name: owner.name, photo: post.photo, url: post.url, caption: post.caption, own: body.share_cid === cid };
        }
        let text = (body.text || "").trim();
        if (text.length > 2000) err(422, "The message is too long");
        if (body.sticker) { const st = SL.chatmedia.stickerMeta(body.sticker) || err(404, "No such sticker"); meta.sticker = st; text = st.emoji; }
        if (!text && !meta.shared) err(422, "The message is empty");
        return S.addMessage(profile.id, cid, "user", text, t, Object.keys(meta).length ? meta : null);
    });
    route("POST", "/api/c/{cid}/messages/{mid}/react", ({ cid, mid }, body) => {
        character(cid);
        const profile = requireProfile();
        if (body.emoji != null && !SL.reactions.ALLOWED_USER_REACTIONS.includes(body.emoji)) err(400, "Unsupported reaction");
        const msg = S.getMessage(profile.id, cid, mid) || err(404, "Message not found");
        const rx = { ...((msg.meta || {}).reactions || {}) };
        if (body.emoji) rx.user = body.emoji; else delete rx.user;
        return S.updateMeta(profile.id, cid, mid, { reactions: Object.keys(rx).length ? rx : null });
    });
    route("GET", "/api/c/{cid}/debug", ({ cid }) => { character(cid); const me = activeProfile(); return (me && S.lastTurn(me.id, cid)) || {}; });
    route("DELETE", "/api/c/{cid}/messages", ({ cid }) => {
        character(cid);
        const profile = requireProfile();
        S.clearChat(profile.id, cid);
        publish({ type: "activity", pid: profile.id, cid });
        return { ok: true, reset: [cid] };
    });
    route("DELETE", "/api/chats", () => {
        const profile = requireProfile();
        S.clearChat(profile.id);
        publish({ type: "activity", pid: profile.id, cid: null });
        return { ok: true, reset: C.ids() };
    });

    async function api(path, opts = {}) {
        const method = (opts.method || "GET").toUpperCase();
        await Promise.resolve();  // like a request: never synchronous
        for (const r of routes) {
            if (r.method !== method) continue;
            const m = path.match(r.re);
            if (!m) continue;
            const params = {};
            Object.entries(m.groups || {}).forEach(([k, v]) => params[k] = decodeURIComponent(v));
            try { return JSON.parse(JSON.stringify(r.fn(params, opts.body || {}) ?? null)); }
            catch (e) { if (e instanceof HttpError) throw e; console.error(e); throw new HttpError(500, `${e.name}: ${e.message}`); }
        }
        throw new HttpError(404, `Not found: ${method} ${path}`);
    }

    // ---- her reply (the stand-in for POST /api/c/<id>/reply?stream=1) ----
    const replying = new Set();
    let lastChatActivity = 0;

    async function* replyEvents(cid) {
        const persona = character(cid), profile = requireProfile(), key = `${profile.id}|${cid}`;
        if (replying.has(key)) { yield { type: "json", data: { busy: true } }; return; }
        replying.add(key);
        lastChatActivity = Date.now();
        try { yield* reply(profile, persona); }
        finally { replying.delete(key); lastChatActivity = Date.now(); publish({ type: "activity", pid: profile.id, cid }); }
    }

    async function* reply(profile, persona) {
        const pid = profile.id, cid = persona.id, r = SL.util.rng();
        const history = S.getMessages(pid, cid, 400);
        if (!history.length || history[history.length - 1].role !== "user") { yield { type: "done", debug: null }; return; }
        const pending = [];
        for (let i = history.length - 1; i >= 0 && history[i].role === "user"; i--) pending.unshift(history[i]);
        const texts = pending.map(m => m.text || "");

        const moodBefore = SL.mood.current(persona), labelBefore = SL.mood.label(moodBefore.values);
        const att = SL.attraction.onHisTurn(profile, persona, history, labelBefore);
        const stage = att.stage;

        // she notices the message and opens the chat: "Seen"
        await sleep(r.uniform(500, 1600));
        const readAt = now();
        pending.forEach(m => S.updateMeta(pid, cid, m.id, { read_at: readAt }));
        yield { type: "read", read_at: readAt };

        // a reaction on his last message - and sometimes that's the whole reply
        const rx = SL.reactions.decide(pending, labelBefore, r);
        // a sweet message gets a ❤️ once she's into him - and never a cold 👍
        const lastIntent = SL.engine.detect(texts[texts.length - 1]).intent;
        const sweetMsg = ["flirt", "miss", "compliment", "kiss", "hug"].includes(lastIntent);
        if (["insult", "creepy"].includes(lastIntent)) { rx.emoji = null; rx.reaction_only = false; }  // no 👍 on an insult
        if (sweetMsg) {
            const warm = stage === "curious" || stage === "crush";
            rx.emoji = warm && r.random() < (stage === "crush" ? 0.55 : 0.3) ? "❤️" : null;
            rx.reaction_only = false;
        }
        if (rx.kind === "none" && /\?\s*$/.test(texts[texts.length - 1])) rx.emoji = null;  // a 👍 on a question reads cold
        if (rx.emoji) {
            const lastMsg = pending[pending.length - 1];
            const rmap = { ...(((S.getMessage(pid, cid, lastMsg.id) || {}).meta || {}).reactions || {}), saneme: rx.emoji };
            S.updateMeta(pid, cid, lastMsg.id, { reactions: rmap });
            yield { type: "reaction", reaction: { message_id: lastMsg.id, emoji: rx.emoji } };
        }
        const debugBase = { time: new Date().toISOString().slice(0, 19), stage, attraction: att, user_messages: texts, reaction: rx, llm_ms: 0, history_turns: history.length };
        if (rx.reaction_only) {
            const debug = { ...debugBase, thought: `just a reaction (${rx.emoji})`, raw: "", parts: [], delays_ms: [],
                            style_trace: [`reaction only (${rx.emoji}): p ${rx.p_only}, no reply`],
                            mood: { label: labelBefore, text: SL.mood.describe(moodBefore).text, values: moodBefore.values }, system_prompt: "" };
            S.addTurn(pid, cid, debug);
            yield { type: "done", debug };
            return;
        }

        const media = SL.chatmedia.decide(persona, stage, texts.join(" "), history, r);
        const res = SL.engine.respond({ profile, persona, history, pending, stage, media, r });
        const mods = { ...res.mods, greeted: history.some(m => m.role === "saneme"), intent: res.intent };
        const { parts, trace } = SL.style.apply(res.lines, persona, { stage, mods, seed: r.random() });
        const delays = SL.style.typingDelays(parts, persona, mods);

        let t = now();
        const replies = [];
        const push = (text, meta, delayMs) => {
            t += delayMs / 1000;
            const msg = S.addMessage(pid, cid, "saneme", text, t, meta && Object.keys(meta).length ? meta : null);
            msg.delay_ms = delayMs;
            replies.push(msg);
            return msg;
        };
        // typed something, then deleted it
        const del = SL.reactions.shouldDelete(res.mood ? SL.mood.label(res.mood.values) : labelBefore, r);
        if (del.delete && !res.leave) {
            const thought = SL.engine.deletedLine(profile, persona, stage, r);
            if (thought) { yield { type: "bubble", message: push("", { deleted: true, deleted_text: thought }, SL.style.typingDelays([thought], persona, mods)[0]) }; trace.push(`typed and deleted a message (p ${del.p})`); }
        }
        if (media.send && media.photo) {
            yield { type: "bubble", message: push("", { photo: media.photo }, 2200) };
            trace.push(`sent a photo (${media.why}, p ${media.p}): ${media.photo.file}`);
        } else if (media.refuse) trace.push(`didn't send a photo (${media.why}, stage ${stage})`);
        const quote = SL.reactions.quoteTarget(pending, r);
        for (let i = 0; i < parts.length; i++) {
            const meta = {};
            if (i === 0 && quote) { meta.reply_to = preview(quote); trace.push("quoted his earlier question"); }
            yield { type: "bubble", message: push(parts[i], meta, delays[i]) };
        }
        SL.attraction.onHerReply(profile, persona, parts);
        const debug = { ...debugBase, thought: res.trace.slice(0, 3).join(" · "), raw: res.lines.join("\n"), parts, delays_ms: replies.map(m => m.delay_ms),
                        style_trace: [...res.trace, ...trace], media: { send: media.send, refuse: media.refuse, why: media.why, p: media.p, photo: media.photo && media.photo.file },
                        mood: { label: SL.mood.label(res.mood.values), text: SL.mood.describe(res.mood).text, values: res.mood.values, cause: res.mood.cause },
                        facts_known: SL.memory.all(pid, cid).length, system_prompt: "" };
        S.addTurn(pid, cid, debug);
        yield { type: "done", debug };
    }

    // ---- first moves: some characters text first (openers.js decides who and when) ----
    function openerTick() {
        const profile = activeProfile();
        if (!profile || Date.now() - lastChatActivity < 40000 || replying.size) return;
        const t = now();
        SL.openers.markSince(t);
        for (const cid of C.ids()) {
            const persona = C.load(cid);
            if (!SL.openers.due(profile, persona, t)) continue;
            const n = S.countMessages(profile.id, cid);
            if (n.user + n.saneme) { SL.openers.setStatus(profile.id, cid, "skip"); continue; }
            const stage = SL.attraction.stageOf(profile, persona), r = SL.util.rng();
            const mods = { ...SL.mood.styleModifiers(SL.mood.current(persona)), greeted: false };
            const { parts } = SL.style.apply(SL.engine.opener(profile, persona, stage, r), persona, { stage, mods, seed: r.random() });
            const delays = SL.style.typingDelays(parts, persona, mods);
            let at = now();
            parts.forEach((text, i) => {
                at += (i ? delays[i] : 0) / 1000;
                const msg = S.addMessage(profile.id, cid, "saneme", text, at, { opener: true });
                publish({ type: "bubble", pid: profile.id, cid, message: msg, opener: true });
            });
            SL.openers.setStatus(profile.id, cid, "sent");
            S.addTurn(profile.id, cid, { time: new Date().toISOString().slice(0, 19), stage, thought: "first move: she texted first", raw: parts.join("\n"),
                                        parts, delays_ms: delays, style_trace: ["first move: she texted first"], user_messages: [], llm_ms: 0, system_prompt: "" });
            publish({ type: "activity", pid: profile.id, cid });
            return;  // one per tick, so they don't all arrive in the same second
        }
    }
    setInterval(openerTick, 30000);
    setTimeout(openerTick, 8000);

    // Sanéme words never get typos
    SL.style.setProtected((window.SANEME_LANGUAGE || []).map(e => e.word).filter(Boolean));

    SL.api = api;
    SL.replyEvents = replyEvents;
    SL.publish = publish;
    SL.openerTick = openerTick;  // (tests / the console can run a first-move check right away)
})();
