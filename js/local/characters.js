// js/local/characters.js - The characters, from js/data/characters.js (built by tools/build-data.py).
// Photos are plain files next to the page: characters/<id>/photos/<file>.
window.SL = window.SL || {};

SL.chars = (() => {
    const D = window.SANEME_DATA || { order: [], characters: {} };
    const ids = () => D.order.slice();
    const has = cid => !!D.characters[cid];
    const entry = cid => D.characters[cid];
    const load = cid => entry(cid).persona;
    const photoUrl = (cid, file) => file ? `characters/${encodeURIComponent(cid)}/photos/${encodeURIComponent(file)}` : null;
    const photoFiles = cid => entry(cid).photos.slice();
    const lqip = (cid, file) => (entry(cid).lqip || {})[file] || null;

    function photos(cid) {
        const p = load(cid), files = photoFiles(cid);
        const prof = files.includes(p.profile_photo) ? p.profile_photo : files[0] || null;
        const cover = files.includes(p.cover_photo) ? p.cover_photo : prof;
        const ordered = (prof ? [prof] : []).concat(files.filter(f => f !== prof));
        return { profile_photo: photoUrl(cid, prof), cover_photo: photoUrl(cid, cover), photos: ordered.map(f => photoUrl(cid, f)), files: ordered };
    }

    // Every photo is a post: caption, date and location from persona.posts, newest first.
    // The like count is a stable fake base per photo (+1 if he liked it) so profiles look lived-in.
    function posts(cid, liked = []) {
        const p = load(cid), files = photoFiles(cid);
        const meta = {};
        (p.posts || []).forEach(x => { if (files.includes(x.photo)) meta[x.photo] = x; });
        const out = files.map(f => {
            const m = meta[f] || {};
            const base = 40 + SL.util.hashStr(`${cid}/${f}`) % 260;
            const on = liked.includes(f);
            return { photo: f, url: photoUrl(cid, f), lqip: lqip(cid, f), caption: m.caption || "", date: m.date || "",
                     location: m.location || "", likes: base + (on ? 1 : 0), liked: on };
        });
        return out.sort((a, b) => (b.date || "0000").localeCompare(a.date || "0000"));
    }

    function stats(cid) {
        const h = SL.util.hashStr(`${cid}/followers`);
        return { posts: photoFiles(cid).length, followers: 380 + h % 2600, following: 140 + (h >>> 16) % 520 };
    }

    function card(cid) {
        const p = load(cid), ph = photos(cid);
        return { id: cid, name: p.name, age: p.age, city: p.city || "", country: p.country || "", occupation: p.occupation || "",
                 bio: p.bio || "", photo: ph.profile_photo, cover: ph.cover_photo, timezone: p.timezone || "UTC" };
    }

    const about = cid => entry(cid).about || {};
    const backstory = cid => entry(cid).backstory || [];
    const storyFile = cid => entry(cid).stories || {};

    return { ids, has, load, photoUrl, photoFiles, lqip, photos, posts, stats, card, about, backstory, storyFile };
})();
