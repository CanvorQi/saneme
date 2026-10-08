// js/local/stories.js - 24h stories, notes and highlights (port of backend/stories.py).
// Every day (in her own time zone) 1-3 stories are drawn from characters/<id>/stories.json with the
// date as the random seed, so a day always has the same stories, posted at believable times.
// Every story is one of her own photos with the pool text as caption. Notes: most days she leaves
// one short status above her avatar in the DMs; it stays up for 24h.
window.SL = window.SL || {};

SL.stories = (() => {
    const WINDOWS = { morning: [7, 11], afternoon: [12, 17], evening: [18, 22], night: [22.5, 25.5], any: [9, 23] };
    const { rng, midnight, isoDate, dayBefore } = SL.util;
    const pool = cid => SL.chars.storyFile(cid).pool || [];
    const tzOf = cid => SL.chars.load(cid).timezone || "UTC";

    function day(cid, d, items) {
        const iso = isoDate(d.y, d.mo, d.d);
        const r = rng(`${cid}-stories-${iso}`);
        const picks = r.sample(items, Math.min(items.length, r.choice([0, 1, 2, 2, 3])));
        const own = picks.filter(it => it.photo).map(it => it.photo);
        const spare = rng(`${cid}-story-photos-${iso}`).shuffle(SL.chars.photoFiles(cid).filter(p => !own.includes(p)));
        const base = midnight(tzOf(cid), d.y, d.mo, d.d);
        return picks.map(it => {
            const [lo, hi] = WINDOWS[it.when || "any"] || WINDOWS.any;
            const posted = base + r.uniform(lo, hi) * 3600;
            return { ...it, photo: it.photo || spare.pop() || null, id: `${cid}-${iso}-${it.id}`, character_id: cid, posted_at: posted };
        });
    }
    function active(cid, t) {
        const items = pool(cid);
        if (!items.length) return [];
        const tz = tzOf(cid);
        const cand = [...day(cid, dayBefore(tz, t, 1), items), ...day(cid, dayBefore(tz, t, 0), items)];
        return cand.filter(s => s.posted_at <= t && t < s.posted_at + 86400).sort((a, b) => a.posted_at - b.posted_at);
    }
    function get(cid, t, storyId) {
        const items = pool(cid), tz = tzOf(cid);
        for (let back = 0; back < 3; back++) for (const s of day(cid, dayBefore(tz, t, back), items)) if (s.id === storyId) return s;
        return null;
    }
    const pub = (cid, s) => ({ id: s.id, character_id: cid, text: s.text, bg: s.bg || "pink",
                               photo: SL.chars.photoUrl(cid, s.photo), lqip: s.photo ? SL.chars.lqip(cid, s.photo) : null, posted_at: s.posted_at });

    function noteDay(cid, d, items) {
        const iso = isoDate(d.y, d.mo, d.d);
        const r = rng(`${cid}-notes-${iso}`);
        if (!items.length || r.random() < 0.2) return null;
        const it = r.choice(items);
        const [lo, hi] = WINDOWS[it.when || "any"] || WINDOWS.any;
        const posted = midnight(tzOf(cid), d.y, d.mo, d.d) + r.uniform(lo, hi) * 3600;
        return { id: `${cid}-${iso}-${it.id}`, character_id: cid, text: it.text, posted_at: posted };
    }
    function note(cid, t) {
        const items = SL.chars.storyFile(cid).notes || [], tz = tzOf(cid);
        const up = [0, 1].map(b => noteDay(cid, dayBefore(tz, t, b), items)).filter(n => n && n.posted_at <= t && t < n.posted_at + 86400);
        return up.length ? up.reduce((a, b) => b.posted_at > a.posted_at ? b : a) : null;
    }
    function getNote(cid, t, noteId) {
        const items = SL.chars.storyFile(cid).notes || [], tz = tzOf(cid);
        for (let back = 0; back < 3; back++) { const n = noteDay(cid, dayBefore(tz, t, back), items); if (n && n.id === noteId) return n; }
        return null;
    }
    // one highlight per place in her posts, one for posts without a place, and "Daily" with her text stories
    function highlights(cid) {
        const groups = new Map();
        SL.chars.posts(cid).forEach(p => {
            const place = (p.location ? p.location.split(",").pop().trim() : "") || "Me";
            if (!groups.has(place)) groups.set(place, []);
            groups.get(place).push({ text: p.caption, photo: p.url, bg: "pink" });
        });
        let out = [...groups.entries()].map(([title, items]) => ({ title, items, cover: items[0].photo }));
        out.sort((a, b) => (a.title === "Me") - (b.title === "Me"));
        const daily = pool(cid).map(s => ({ text: s.text, bg: s.bg || "pink", photo: s.photo ? SL.chars.photoUrl(cid, s.photo) : null }));
        if (daily.length) out.push({ title: "Daily", items: daily.slice(0, 8), cover: null, bg: daily[0].bg });
        out.forEach((h, i) => { h.id = `hl-${cid}-${i}`; h.items.forEach((it, k) => it.id = `${h.id}-${k}`); });
        return out.slice(0, 6);
    }
    return { active, get, pub, note, getNote, highlights, pool };
})();
