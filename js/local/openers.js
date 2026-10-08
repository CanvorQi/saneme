// js/local/openers.js - First moves (port of backend/openers.py).
// After a match every character looks at your profile card once and decides two things, seeded by
// (profile, character) so they never flip: does she like it, and is she bold enough to text first?
// The bold ones send the first message at a believable time (minutes to hours after the match,
// never in the middle of her night). This file decides who and when; dialog/engine.js writes it.
window.SL = window.SL || {};

SL.openers = (() => {
    const SINCE = "openers_since";
    const since = () => SL.store.getSetting(SINCE);
    function markSince(t) { if (!since()) SL.store.setSetting(SINCE, t); }
    const delay = (r, lo, hi) => Math.exp(r.uniform(Math.log(lo), Math.log(hi))) * 60;  // log-uniform minutes
    // nobody texts a stranger at 4am: a time in her night (1-8am) moves to her next morning
    function awake(ts, tz, r) {
        const l = SL.util.local(tz, ts);
        if (l.h >= 1 && l.h < 8) return ts + ((8 - l.h) * 3600 - l.mi * 60 - l.s) + r.uniform(0, 150) * 60;
        return ts;
    }
    function plan(profile, persona) {
        const b5 = persona.big_five || {};
        const r = SL.util.rng(`${profile.id}-${persona.id}-first-move`);
        const pLike = 0.35 + 0.3 * (b5.openness ?? 0.5) + 0.15 * (b5.agreeableness ?? 0.5);
        const pBold = 0.15 + 0.6 * (b5.extraversion ?? 0.5) - 0.2 * (b5.neuroticism ?? 0.5);
        const likes = r.random() < pLike, bold = r.random() < pBold;
        const base = Math.max(profile.created_at || 0, since() || 0);
        const tz = persona.timezone || "UTC";
        const likedAt = awake(base + delay(r, 3, 10 * 60), tz, r);
        const textAt = awake(likedAt + delay(r, 1, 3 * 60), tz, r);
        return { likes, texts_first: likes && bold, liked_at: likedAt, text_at: textAt,
                 p_like: SL.util.round(pLike, 2), p_bold: SL.util.round(pBold, 2) };
    }
    const key = (pid, cid) => `opener:${pid}:${cid}`;
    const status = (pid, cid) => SL.store.getSetting(key(pid, cid));
    const setStatus = (pid, cid, v) => SL.store.setSetting(key(pid, cid), v);
    function due(profile, persona, t) {
        const pl = plan(profile, persona);
        if (!pl.texts_first || t < pl.text_at) return false;
        const st = status(profile.id, persona.id);
        return st !== "sent" && st !== "skip";
    }
    return { since, markSince, plan, status, setStatus, due };
})();
