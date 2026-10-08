// js/live.js - Live updates from the server (Server-Sent Events, /api/events).
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope.
//
// Instead of asking the server every 20 s, the page keeps one connection open and the server tells
// it the moment something happens:
//   bubble    - she wrote a bubble (a first move, or a reply to a chat you left or opened in another tab)
//   activity  - the notifications changed
//   comment   - she answered your comment under one of her posts (social.js shows it in the thread)
// Replies you're watching come through the reply stream (reply.js) with their typing animation;
// those are skipped here. If the connection drops, the browser reconnects by itself, and the
// state is refreshed once to catch up.

let live = null;

function startLive() {
    if (live) return;
    live = new SL.LiveEvents();  // web version: events from js/local/server.js instead of /api/events
    live.addEventListener("bubble", e => onLiveBubble(JSON.parse(e.data)));
    live.addEventListener("activity", e => {
        const ev = JSON.parse(e.data);
        if (state.profile && ev.pid === state.profile.id) loadActivity();
    });
    live.addEventListener("comment", e => {
        const ev = JSON.parse(e.data);
        if (state.profile && ev.pid === state.profile.id) onCommentReply(ev);
    });
    live.onopen = () => { if (live.wasDown) { refreshCharacters(); loadActivity(); if (state.feed) loadFeed().then(refreshAllComments); } live.wasDown = false; };
    live.onerror = () => { live.wasDown = true; };
}

function onLiveBubble(ev) {
    if (!state.profile || ev.pid !== state.profile.id || !charById(ev.cid)) return;
    if (busyChats.has(ev.cid)) return;  // this tab is streaming that reply itself (with typing...)
    const m = ev.message;
    // a bubble's time is when it should appear (she's still "typing" it): wait until then
    const wait = Math.max(0, Math.min(15000, m.ts * 1000 - nowMs()));
    if (wait > 300 && ev.cid === state.cid) setTyping(ev.cid, true);
    setTimeout(() => deliverLive(ev.cid, m, !!ev.opener), wait);
}

function deliverLive(cid, m, opener) {
    const c = charById(cid);
    if (!c) return;
    const firstMove = opener && !c.last;
    if (!c.last || m.id > c.last.id) c.last = m;
    if (cid === state.cid) {
        setTyping(cid, false);
        if (!findMsg(m.id)) {
            state.messages.push(m);
            appendMessage(m, chatOpen());  // drawn even if you're on another page: it's there when you open the chat
            markCurrentSeen();
        }
    }
    if (firstMove) { toast(`${c.name} texted you first 👀`); loadActivity(); }
    else if (cid !== state.cid || !chatOpen()) toast(`New message from ${c.name}`);
    if (cid !== state.cid || !chatOpen() || document.hidden) bumpUnread();
    renderSidebar();
    notifyIncoming(cid, m, firstMove);
}
