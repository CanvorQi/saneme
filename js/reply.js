// js/reply.js - Sending, the streamed reply loop (per chat), debug panel, LLM status.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Sending and reply loop ----------------
// The user may send several messages in a row; once they stop typing (REPLY_WAIT_MS) one reply is requested for all of them.
const REPLY_WAIT_MS = 1800;
let replyTimer = null, replyTimerCid = null;
function scheduleReply(cid, ms) {
    clearTimeout(replyTimer);
    replyTimerCid = cid;
    replyTimer = setTimeout(() => { replyTimer = null; requestReply(cid); }, ms);
}
// typing on/off for one chat; the header only changes if that chat is the open one
function setTyping(cid, on) {
    if (on) typingChats.add(cid); else typingChats.delete(cid);
    if (cid === state.cid) setStatus(on ? "typing" : "idle"); else renderSidebar();
}

const input = $("#msgInput");
input.addEventListener("input", () => {
    input.style.height = "auto"; input.style.height = Math.min(input.scrollHeight, 120) + "px";
    if (replyTimer && replyTimerCid === state.cid) scheduleReply(state.cid, REPLY_WAIT_MS);
});
input.addEventListener("keydown", e => {
    if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); $("#sendForm").requestSubmit(); }
    if (e.key === "Escape") setReplyTo(null);
});
async function sendMessage(text, extra) {
    const m = await api(chatUrl("/messages"), { method: "POST", body: { text, ...extra } });
    state.messages.push(m);
    appendMessage(m, true);
    touchCurrentChat();
    scheduleReply(state.cid, REPLY_WAIT_MS);
    return m;
}
$("#sendForm").addEventListener("submit", async e => {
    e.preventDefault();
    const text = input.value.trim();
    if (!text) return;
    const extra = {};
    if (state.replyStory) extra[state.replyStory.kind === "note" ? "note_id" : "story_id"] = state.replyStory.id;
    else if (state.replyTo) extra.reply_to = state.replyTo.id;
    input.value = ""; input.style.height = "auto";
    setReplyTo(null);
    const sendBtn = $(".send-btn");
    sendBtn.classList.remove("sending"); void sendBtn.offsetWidth; sendBtn.classList.add("sending");
    try { await sendMessage(text, extra); }
    catch (ex) { sysNote("Couldn't send message: " + ex.message); input.value = text; }
});

const sameChat = key => state.profile && `${state.profile.id}:${state.cid}` === key;
async function waitForOtherReply(key, cid) {
    for (let i = 0; i < 40; i++) {
        await sleep(3000);
        if (!sameChat(key)) return;
        let r;
        try { r = await api(chatUrl("/chat", cid)); } catch (e) { continue; }
        const known = new Set(state.messages.map(m => m.id));
        const fresh = r.messages.filter(m => !known.has(m.id));
        if (fresh.length && fresh[fresh.length - 1].role === "saneme") {
            setStatus("idle");
            for (const m of fresh) { state.messages.push(m); appendMessage(m, true); await sleep(250); }
            touchCurrentChat(); markCurrentSeen();
            return;
        }
    }
}

// One reply loop per chat (several chats can be answering at once). If you switch to another
// chat while she's answering, her messages are still saved server side - they show up in the
// list as unread, and the typing state stays with HER chat.
// Her reply as a stream of events: every bubble comes with delay_ms = how long she's "typing" it.
// Web version: the events come from the dialog engine in the page (js/local/server.js).
async function* replyEvents(cid) {
    yield* SL.replyEvents(cid);
}

// One reply loop per chat (several chats can be answering at once). If you switch to another
// chat while she's answering, her messages are still saved server side - they show up in the
// list as unread, and the typing state stays with HER chat.
async function requestReply(cidArg) {
    const cid = cidArg || state.cid;
    if (!cid || !state.profile) return;
    if (busyChats.has(cid)) { pendingChats.add(cid); return; }
    busyChats.add(cid);
    const key = `${state.profile.id}:${cid}`;
    let notified = false;
    const keepRow = m => {
        const ch = charById(cid); if (ch) ch.last = m; renderSidebar();
        if (!notified) { notified = true; notifyIncoming(cid, m); }  // once per reply, not per bubble
    };
    const readTimer = setTimeout(() => { if (sameChat(key)) markAllRead(); }, 600 + Math.random() * 900);
    const typingTimer = setTimeout(() => setTyping(cid, true), 1400 + Math.random() * 800);
    // events arrive faster than she "types": a small queue, shown one after the other
    const queue = [];
    let reading = true, wake = null, failure = null;
    const pump = (async () => {
        try { for await (const ev of replyEvents(cid)) { queue.push(ev); if (wake) wake(); } }
        catch (ex) { failure = ex; }
        reading = false; if (wake) wake();
    })();
    const next = async () => {
        while (!queue.length && reading) await new Promise(r => wake = r);
        return queue.shift();
    };
    try {
        let ev;
        while ((ev = await next())) {
            if (ev.type === "json" && ev.data.busy) {
                // she's already answering (another tab, or this page was reloaded mid-reply): wait for it
                clearTimeout(readTimer); clearTimeout(typingTimer);
                if (sameChat(key)) { markAllRead(); setTyping(cid, true); await waitForOtherReply(key, cid); }
            } else if (ev.type === "read") {
                clearTimeout(readTimer);
                if (sameChat(key)) markAllRead(ev.read_at);
            } else if (ev.type === "reaction") {
                if (sameChat(key)) {
                    await sleep(500);
                    const m = findMsg(ev.reaction.message_id);
                    if (m) {
                        m.meta = { ...(m.meta || {}), reactions: { ...((m.meta || {}).reactions || {}), saneme: ev.reaction.emoji } };
                        refreshBubble(m);
                    }
                }
            } else if (ev.type === "bubble") {
                const m = ev.message;
                clearTimeout(typingTimer);
                if (!sameChat(key)) { keepRow(m); continue; }  // you're elsewhere: no typing show, just the row
                setTyping(cid, true);
                await sleep(m.delay_ms);
                if (!sameChat(key)) { keepRow(m); continue; }
                setTyping(cid, false);
                if (findMsg(m.id)) continue;  // already on screen (you left and came back: the chat reloaded with it)
                state.messages.push(m);
                appendMessage(m, true);
                touchCurrentChat();
                markCurrentSeen();
                bumpUnread();
                if (document.hidden && !notified) { notified = true; notifyIncoming(cid, m); }
                await sleep(120);
            } else if (ev.type === "done") {
                if (sameChat(key) && ev.debug) renderDebug(ev.debug);
            } else if (ev.type === "error") {
                throw new Error(ev.detail);
            }
        }
        await pump;
        if (failure) throw failure;
    } catch (ex) {
        clearTimeout(readTimer);
        if (sameChat(key)) sysNote("⚠ " + ex.message);
        refreshLLM();
    }
    clearTimeout(typingTimer);
    setTyping(cid, false);
    busyChats.delete(cid);
    updatePresence();
    renderSidebar();
    if (state.feedDirty) { state.feedDirty = false; loadFeed().then(refreshAllComments); loadActivity(); }
    if (pendingChats.delete(cid)) requestReply(cid);
}

// ---------------- Debug panel ----------------
function setDebugOpen(open) {
    state.debugOpen = open;
    $("#debugPanel").classList.toggle("hidden", !open);
    $(".chat-card").classList.toggle("with-debug", open && window.innerWidth > 1100);
    $("#debugToggle").classList.toggle("active", open);
    $("#debugSwitch").checked = open;
    try { localStorage.setItem("saneme_debug", open ? "1" : "0"); } catch (e) {}
}
$("#debugToggle").addEventListener("click", () => setDebugOpen(!state.debugOpen));
$("#debugClose").addEventListener("click", () => setDebugOpen(false));
$("#debugSwitch").addEventListener("change", e => setDebugOpen(e.target.checked));

const DEBUG_EMPTY = $("#debugBody").innerHTML;
function renderDebug(d) {
    if (!d || (!d.raw && !d.reaction)) { $("#debugBody").innerHTML = DEBUG_EMPTY; return; }
    const block = (k, v) => `<div class="debug-block"><div class="k">${k}</div>${v}</div>`;
    $("#debugBody").innerHTML =
        block("Decision", d.thought ? `<div class="debug-thought">${esc(d.thought)}</div>` : `<span class="debug-empty">—</span>`) +
        block("Summary", `<pre>${esc(`time: ${d.time}\nstage: ${d.stage}${d.attraction ? `\ninterest: ${d.attraction.value.toFixed(2)} (ceiling ${d.attraction.ceiling.toFixed(2)})${(d.attraction.changes || []).filter(c => c.reason).map(c => `\n  ${c.capped ? "held" : (c.delta >= 0 ? "+" : "") + c.delta.toFixed(3)} ${c.reason}`).join("")}` : ""}${d.media && (d.media.send || d.media.refuse) ? `\nphoto: ${d.media.send ? "sent " + d.media.photo : "refused"} (${d.media.why}, p ${d.media.p})` : ""}${d.mood ? `\nmood: ${d.mood.label} (${d.mood.text})${d.mood.cause ? `\ncause: ${d.mood.cause}` : ""}` : ""}\nmodel time: ${(d.llm_ms / 1000).toFixed(1)} s${d.first_bubble_ms != null ? ` (first bubble ready after ${(d.first_bubble_ms / 1000).toFixed(1)} s)` : ""}\nhistory: ${d.history ? `${d.history.exchanges} exchanges (${d.history.turns_kept}/${d.history.turns_total} turns, ~${d.history.history_tokens} tokens)` : d.history_turns + " turns"}\nfacts about him: ${d.facts_known ?? 0}${d.intent ? `\nintent: ${d.intent.ask_question ? "ask him something" : "just react"} (p ${d.intent.p}, ${d.intent.no_question_streak} replies without a question) → ${d.intent.asked ? "asked" : "didn't ask"}` : ""}\ntyping delays: ${d.delays_ms.join(", ")} ms`)}</pre>`) +
        block("Lines picked", `<pre>${esc(d.raw)}</pre>`) +
        block("Steps", d.style_trace.length ? `<ul>${d.style_trace.map(t => `<li>${esc(t)}</li>`).join("")}</ul>` : `<span class="debug-empty">no changes (besides lowercase / abbreviations / punctuation)</span>`) +
        block("Bubbles", `<pre>${esc(d.parts.join("\n"))}</pre>`);
}

// ---------------- LLM status ----------------
async function refreshLLM() {
    $$("[data-llm-text]").forEach(e => e.textContent = "Checking model…");
    let s;
    try { s = await api("/api/llm"); } catch (e) { s = { reachable: false, error: "Could not reach the API" }; }
    const cls = s.loaded ? "ok" : s.reachable ? "warn" : "err";
    const text = s.loaded ? s.model.replace(/\.gguf$/, "") : s.reachable ? "Model failed to load" : "LLM server offline";
    $$("[data-llm-dot]").forEach(e => e.className = "dot " + cls);
    $$("[data-llm-text]").forEach(e => e.textContent = text);
    $$("[data-llm-detail]").forEach(e => e.textContent = s.local
        ? "Pattern-based, like Amor: no AI model, everything runs in this browser and works offline."
        : s.loaded ? `${s.model} is loaded and ready, running on the ${s.gpu ? "GPU" : "CPU (slow: replies take ~30 s, see start.bat)"}.` : (s.error || text));
}
$("#llmRefresh").addEventListener("click", refreshLLM);

// ---------------- Reset a chat (Settings): pick one character, or all of them ----------------
function renderResetPicker() {
    const sel = $("#resetWho");
    const chars = state.characters || [];
    sel.innerHTML = chars.map(c => `<option value="${esc(c.id)}">${esc(c.name)}${c.last ? "" : " (no messages yet)"}</option>`).join("")
        + `<option value="__all">All chats (${chars.length})</option>`;
    sel.value = charById(state.cid) ? state.cid : (chars[0] || {}).id;  // the chat you had open
}
$("#resetChat").addEventListener("click", async () => {
    const who = $("#resetWho").value, all = who === "__all", c = charById(who);
    if (!all && !c) return;
    const question = all
        ? `Delete ALL ${state.characters.length} chats? Every character forgets you, and they all go back to your matches. Your profile stays.`
        : `Delete the whole chat with ${c.name}? She forgets what she learned about you and how much she liked you, and goes back to your matches.`;
    if (!confirm(question)) return;
    let r;
    try { r = await api(all ? "/api/chats" : chatUrl("/messages", who), { method: "DELETE" }); }
    catch (ex) { toast(ex.message); return; }
    // forget everything this page kept about those chats too
    const seen = storageObj(seenKey());
    for (const id of r.reset) {
        const ch = charById(id);
        if (ch) ch.last = null;
        delete seen[id]; delete drafts[id];
        typingChats.delete(id); pendingChats.delete(id);
    }
    storageSet(seenKey(), seen);
    if (r.reset.includes(state.cid)) {
        clearTimeout(replyTimer); replyTimer = null;
        state.messages = []; renderAll(); renderDebug(null); setReplyTo(null);
        input.value = ""; input.style.height = "auto";
    }
    renderSidebar(); renderResetPicker(); loadActivity();
    if (state.feed) loadFeed();  // comments on her posts were messages too
    toast(all ? "All chats reset. A fresh start with everyone" : `Chat with ${c.name} reset. A fresh start`);
});
