// js/local/util.js - Small helpers for the in-browser backend: seeded randomness, time zones.
// Everything of the local backend lives under window.SL (Sanéme Local), so it never collides with
// the app's own global functions (the app's js/*.js files share one global scope).
window.SL = window.SL || {};
SL.SESSION = Math.floor(Math.random() * 1e9);  // one per app start: the feed and explore order shuffle with it

SL.util = (() => {
    // String -> 32-bit seed (xmur3), and a small fast PRNG (mulberry32): the same seed always
    // gives the same sequence, like Python's random.Random(seed) did on the server.
    function hashStr(str) {
        let h = 1779033703 ^ str.length;
        for (let i = 0; i < str.length; i++) {
            h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
            h = (h << 13) | (h >>> 19);
        }
        h = Math.imul(h ^ (h >>> 16), 2246822507);
        h = Math.imul(h ^ (h >>> 13), 3266489909);
        return (h ^= h >>> 16) >>> 0;
    }
    function rng(seed) {
        let a = seed === undefined ? (Math.random() * 2 ** 32) >>> 0 : typeof seed === "number" ? seed >>> 0 : hashStr(String(seed));
        const random = () => {
            a = (a + 0x6D2B79F5) >>> 0;
            let t = a;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        };
        const r = {
            random,
            uniform: (lo, hi) => lo + random() * (hi - lo),
            randint: (lo, hi) => lo + Math.floor(random() * (hi - lo + 1)),
            choice: arr => arr[Math.floor(random() * arr.length)],
            shuffle(arr) {
                const a2 = [...arr];
                for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [a2[i], a2[j]] = [a2[j], a2[i]]; }
                return a2;
            },
            sample: (arr, k) => r.shuffle(arr).slice(0, k),
            // log-normal noise (typing speed), Box-Muller
            lognorm(mu, sigma) {
                const u = 1 - random(), v = random();
                return Math.exp(mu + sigma * Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v));
            },
        };
        return r;
    }

    const now = () => Date.now() / 1000;
    const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
    const round = (v, n = 3) => Math.round(v * 10 ** n) / 10 ** n;

    // ---- time zones (a character lives in hers: "it's 2am in Paris") ----
    const fmtCache = {};
    function fmt(tz) {
        if (!fmtCache[tz]) {
            try {
                fmtCache[tz] = new Intl.DateTimeFormat("en-US", { timeZone: tz, hourCycle: "h23", year: "numeric", month: "2-digit",
                    day: "2-digit", hour: "2-digit", minute: "2-digit", second: "2-digit", weekday: "short" });
            } catch (e) { fmtCache[tz] = tz === "UTC" ? null : fmt("UTC"); }
        }
        return fmtCache[tz];
    }
    // her wall clock at a moment: {y, mo, d, h, mi, s, dow (0 = Sunday)}
    function local(tz, ts = now()) {
        const f = fmt(tz || "UTC");
        const parts = {};
        for (const p of f.formatToParts(new Date(ts * 1000))) parts[p.type] = p.value;
        return { y: +parts.year, mo: +parts.month, d: +parts.day, h: +parts.hour % 24, mi: +parts.minute, s: +parts.second,
                 dow: ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].indexOf(parts.weekday) };
    }
    // seconds east of UTC for that zone at that moment
    function offset(tz, ts = now()) {
        const l = local(tz, ts);
        return Math.round((Date.UTC(l.y, l.mo - 1, l.d, l.h, l.mi, l.s) / 1000 - Math.floor(ts)) / 60) * 60;
    }
    // the timestamp of local midnight of a calendar day in her zone
    function midnight(tz, y, mo, d) {
        const guess = Date.UTC(y, mo - 1, d) / 1000;
        return guess - offset(tz, guess - offset(tz, guess));
    }
    const isoDate = (y, mo, d) => `${y}-${String(mo).padStart(2, "0")}-${String(d).padStart(2, "0")}`;
    // the calendar day `back` days before her today
    function dayBefore(tz, ts, back) {
        const l = local(tz, ts);
        const t = new Date(Date.UTC(l.y, l.mo - 1, l.d - back));
        return { y: t.getUTCFullYear(), mo: t.getUTCMonth() + 1, d: t.getUTCDate() };
    }

    // "One. Two! Three?" -> ["One.", "Two!", "Three?"] (no regex lookbehind: older iPhones' Safari can't parse it)
    const sentences = s => (String(s).match(/[^.!?…]+(?:[.!?…]+|$)/g) || [String(s)]).map(x => x.trim()).filter(Boolean);

    return { hashStr, rng, now, clamp, round, local, offset, midnight, isoDate, dayBefore, sentences };
})();
