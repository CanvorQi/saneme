// js/local/store.js - Everything the app remembers, kept in this browser (localStorage).
// The web version's stand-in for the desktop app's SQLite database + profiles/ folder:
// profiles, chats, comments, her memory of you, her interest in you, mood, first-move state.
// One JSON document under one key; written after every change.
window.SL = window.SL || {};

SL.store = (() => {
    const KEY = "saneme_web_db";
    // per-chat state in settings, "<prefix>:<pid>:<cid>[...]" - wiped when a chat is reset
    const CHAT_STATE_PREFIXES = ["memory", "likes", "interest", "opener", "dlg"];
    let db = null;

    function fresh() {
        return { v: 1, nextId: 1, nextComment: 1, settings: {}, profiles: {}, messages: {}, turns: {}, facts: {}, comments: [] };
    }
    function load() {
        if (db) return db;
        try { db = JSON.parse(localStorage.getItem(KEY) || "null"); } catch (e) { db = null; }
        if (!db || db.v !== 1) db = fresh();
        return db;
    }
    let warned = false;
    function save() {
        try { localStorage.setItem(KEY, JSON.stringify(db)); }
        catch (e) {
            if (!warned) { warned = true; console.warn("Sanéme: couldn't save (storage full or blocked)", e); }
        }
    }
    const chatKey = (pid, cid) => `${pid}|${cid}`;
    const clone = o => o == null ? o : JSON.parse(JSON.stringify(o));

    // ---- settings ----
    function getSetting(k, dflt = null) { const v = load().settings[k]; return v === undefined ? dflt : v; }
    function setSetting(k, v) { load(); if (v === null || v === undefined) delete db.settings[k]; else db.settings[k] = v; save(); }

    // ---- profiles (you) ----
    function slug(name) {
        const s = name.normalize("NFKD").replace(/[̀-ͯ]/g, "").toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
        return s.slice(0, 30) || "user";
    }
    const hex = () => Math.floor(Math.random() * 65536).toString(16).padStart(4, "0");
    function listProfiles() { return Object.values(load().profiles).map(clone).sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0)); }
    function getProfile(id) { return clone(load().profiles[id] || null); }
    function createProfile(data) {
        load();
        let id;
        do { id = `${slug(data.name)}-${hex()}`; } while (db.profiles[id]);
        const t = SL.util.now();
        db.profiles[id] = { id, ...data, created_at: t, updated_at: t };
        save();
        return clone(db.profiles[id]);
    }
    function updateProfile(id, data) {
        const p = load().profiles[id];
        if (!p) return null;
        for (const [k, v] of Object.entries(data)) if (k !== "id" && k !== "created_at") p[k] = v;
        p.updated_at = SL.util.now();
        save();
        return clone(p);
    }
    function deleteProfile(id) { load(); delete db.profiles[id]; save(); }

    // ---- messages ----
    function addMessage(pid, cid, role, text, ts, meta) {
        load();
        const m = { id: db.nextId++, role, text, ts: ts || SL.util.now(), meta: meta || null };
        (db.messages[chatKey(pid, cid)] = db.messages[chatKey(pid, cid)] || []).push(m);
        save();
        return clone(m);
    }
    const getMessages = (pid, cid, limit) => {
        const all = load().messages[chatKey(pid, cid)] || [];
        return clone(limit ? all.slice(-limit) : all);
    };
    const getMessage = (pid, cid, id) => clone((load().messages[chatKey(pid, cid)] || []).find(m => m.id === +id) || null);
    function updateMeta(pid, cid, id, patch) {
        const m = (load().messages[chatKey(pid, cid)] || []).find(x => x.id === +id);
        if (!m) return null;
        const meta = { ...(m.meta || {}) };
        for (const [k, v] of Object.entries(patch)) { if (v === null || v === undefined) delete meta[k]; else meta[k] = v; }
        m.meta = Object.keys(meta).length ? meta : null;
        save();
        return clone(m);
    }
    function countMessages(pid, cid) {
        const out = { user: 0, saneme: 0 };
        const add = list => list.forEach(m => out[m.role] = (out[m.role] || 0) + 1);
        if (cid) add(load().messages[chatKey(pid, cid)] || []);
        else Object.entries(load().messages).forEach(([k, list]) => { if (k.startsWith(pid + "|")) add(list); });
        return out;
    }
    function lastMessages(pid) {
        const out = {};
        for (const [k, list] of Object.entries(load().messages)) {
            const [p, c] = k.split("|");
            if (p === pid && list.length) out[c] = clone(list[list.length - 1]);
        }
        return out;
    }

    // ---- comments under her posts ----
    function addComment(pid, cid, photo, role, text, replyTo = null) {
        load();
        const c = { id: db.nextComment++, pid, cid, photo, role, text, ts: SL.util.now(), reply_to: replyTo };
        db.comments.push(c);
        save();
        return clone(c);
    }
    const getComments = (pid, cid, photo) => clone(load().comments.filter(c => c.pid === pid && c.cid === cid && (!photo || c.photo === photo)));

    // ---- her last reply's decision trace (the 🐞 panel) ----
    function addTurn(pid, cid, data) { load().turns[chatKey(pid, cid)] = data; save(); }
    const lastTurn = (pid, cid) => clone(load().turns[chatKey(pid, cid)] || null);

    // ---- what she knows about you ----
    const getFacts = (pid, cid) => clone(load().facts[chatKey(pid, cid)] || []);
    function setFacts(pid, cid, facts) { load().facts[chatKey(pid, cid)] = facts; save(); }

    // ---- a fresh start with one character (or all of them) ----
    function clearChat(pid, cid = null) {
        load();
        const mine = k => k.startsWith(pid + "|") && (!cid || k === chatKey(pid, cid));
        for (const table of ["messages", "turns", "facts"]) for (const k of Object.keys(db[table])) if (mine(k)) delete db[table][k];
        db.comments = db.comments.filter(c => !(c.pid === pid && (!cid || c.cid === cid)));
        for (const k of Object.keys(db.settings)) {
            for (const prefix of CHAT_STATE_PREFIXES) {
                const base = `${prefix}:${pid}:`;
                if (k.startsWith(base) && (!cid || k === base + cid || k.startsWith(base + cid + ":"))) delete db.settings[k];
            }
        }
        save();
    }

    return { getSetting, setSetting, listProfiles, getProfile, createProfile, updateProfile, deleteProfile,
             addMessage, getMessages, getMessage, updateMeta, countMessages, lastMessages,
             addComment, getComments, addTurn, lastTurn, getFacts, setFacts, clearChat, chatKey };
})();
