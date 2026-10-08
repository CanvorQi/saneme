// js/local/style.js - Texting Style Engine (port of backend/style.py).
// The dialog engine writes clean lines; this turns them into HER texts, using the persona's
// texting signature: split into bubbles, mood (fewer bubbles when sad, flat when irritated),
// stage contract (no warm emojis with a stranger), her laugh style (keysmash on her keyboard
// layout, lmao, xd, jaja, hehe), lowercase, abbreviations (u, rn, idk, tbh...), punctuation,
// emoji budget, her verbal tics / native-language slips, typos with a "*correction".
// typingDelays() says how long each bubble is "typed". Every step is written to `trace`.
window.SL = window.SL || {};

SL.style = (() => {
    const MAX_PARTS = 4;
    const HOME_ROWS = { qwerty: ["asdfghjkl", "asd"], azerty: ["qsdfghjklm", "qsd"], qwertz: ["asdfghjklö", "asd"],
                        turkish: ["asdfghjklşi", "asd"], spanish: ["asdfghjklñ", "asd"] };
    const NEIGHBORS = { a: "qsz", s: "adwx", d: "sfec", f: "dgrv", g: "fhtb", h: "gjyn", j: "hkum", k: "jli", l: "ko", q: "wa", w: "qes",
                        e: "wrd", r: "etf", t: "ryg", y: "tuh", u: "yij", i: "uok", o: "ipl", p: "o", z: "xa", x: "zcs", c: "xvd",
                        v: "cbf", b: "vng", n: "bmh", m: "nj" };
    const ABBREVIATIONS = [
        [/\bwhat are you doing\b/gi, "wyd", 0.8], [/\bi don'?t know\b/gi, "idk", 0.9], [/\bto be honest\b/gi, "tbh", 1.0],
        [/\bnot gonna lie\b/gi, "ngl", 1.0], [/\boh my god\b/gi, "omg", 1.0], [/\bright now\b/gi, "rn", 0.8],
        // "going to sleep" -> "gonna sleep", but "going to the beach" stays (a place, not a verb)
        [/\bgoing to\b(?!\s+(?:the|a|an|my|your|ur|his|her|our|their|bed|school|work|uni|class|town|church|paris|london|\p{Lu}))/giu, "gonna", 0.9],
        [/\bwant to\b/gi, "wanna", 0.9], [/\bgot to\b(?!\s+(?:the|a|an|my|your|bed|school|work|class|\p{Lu}))/giu, "gotta", 0.8], [/\bkind of\b/gi, "kinda", 0.8],
        [/\bbecause\b/gi, "bc", 0.6], [/\bthough\b/gi, "tho", 0.7], [/\bokay\b/gi, "ok", 0.7], [/\bplease\b/gi, "pls", 0.5],
        [/\bprobably\b/gi, "prob", 0.4], [/\bpeople\b/gi, "ppl", 0.3], [/\byou're\b/gi, "ur", 0.5], [/\byour\b/gi, "ur", 0.6],
        [/\byou\b(?!['’])/gi, "u", 0.6], [/\bi'm\b/gi, "im", 0.8], [/\b(don|can|won|isn|didn|doesn)'t\b/gi, "$1t", 0.7],
        [/\b(it|that|what)'s\b/gi, "$1s", 0.7], [/\b(you|i|we|they|she|he)'(d|ll|ve)\b/gi, "$1$2", 0.5],
    ];
    const LAUGH_RE = /\b(?:a?(?:ha){2,}h?|(?:he){2,}|(?:ja){2,}|lol+|lmf?ao+|rofl|x+d+)\b|[😂🤣]+/giu;  // "u": emoji are 2 code units
    const STAGE_EMOJIS = { curious: ["🙈", "🥺", "😊"], crush: ["🥰", "❤️", "🥺", "😘"] };
    const WARM_EMOJI_RE = /(?:❤️|❤|💕|💖|💗|💓|💞|💘|💝|😍|🥰|😘|🥺|😻|💋|♥️|♥)+/gu;
    const ANY_EMOJI_RE = /(?:\p{Extended_Pictographic}(?:‍\p{Extended_Pictographic})*️?)+/gu;
    const MOOD_EMOJIS = { excited: ["😭", "✨", "😆", "🤩", "👀"], content: null, neutral: null, sad: ["🥲", "😮‍💨"],
                          tired: ["🥱", "😴", "😮‍💨"], drained: ["🫠"], irritated: [] };
    const MOOD_EMOJI_MULT = { excited: 1.6, content: 1.0, neutral: 0.9, sad: 0.5, tired: 0.6, drained: 0.5, irritated: 0.0 };
    const EMOJI_BUDGET = { excited: 2 };
    const has = (re, s) => { re.lastIndex = 0; return re.test(s); };

    function keysmash(r, keyboard = "qwerty") {
        const [row, starts] = HOME_ROWS[keyboard] || HOME_ROWS.qwerty;
        const n = r.randint(6, 11), out = [r.choice(starts)];
        while (out.length < n) { const c = r.choice(row); if (c !== out[out.length - 1]) out.push(c); }
        return out.join("");
    }
    function makeLaugh(style, r, keyboard) {
        if (style === "keysmash") return keysmash(r, keyboard);
        if (style === "lmao") return r.choice(["lmao", "lmaooo", "LMAO"]);
        if (style === "haha") { const s = "ha".repeat(r.randint(2, 4)); return r.random() < 0.3 ? s.toUpperCase() : s; }
        if (style === "xd") return r.choice(["xD", "xd", "XD", "xDD"]);
        if (style === "jaja") { const s = "ja".repeat(r.randint(2, 4)); return r.random() < 0.25 ? s.toUpperCase() : s; }
        if (style === "hehe") return r.choice(["hehe", "hehe", "hihi"]);
        return "haha";
    }

    let PROTECTED = new Set();  // Sanéme language words never get typos
    const protectedWord = w => { const x = w.toLowerCase().replace(/[^a-zà-ÿ]/g, ""); return [...PROTECTED].some(p => x === p || (x.startsWith(p) && x.length - p.length <= 3)); };
    function makeTypo(word, r) {
        if (word.length < 4) return null;
        const i = r.randint(1, word.length - 2);
        const kind = r.choice(["swap", "drop", "neighbor", "double"]);
        if (kind === "swap") return word.slice(0, i) + word[i + 1] + word[i] + word.slice(i + 2);
        if (kind === "drop") return word.slice(0, i) + word.slice(i + 1);
        if (kind === "double") return word.slice(0, i) + word[i] + word.slice(i);
        const ch = word[i].toLowerCase();
        return NEIGHBORS[ch] ? word.slice(0, i) + r.choice(NEIGHBORS[ch]) + word.slice(i + 1) : null;
    }

    // people text in bursts: two sentences become two bubbles once the line is a bit long
    function splitLong(part, r) {
        if (part.length < 40) return [part];
        const pieces = SL.util.sentences(part);
        if (pieces.length > 1) return pieces;
        if (part.length >= 60 && r.random() < 0.6) {
            const m = part.slice(15, -10).match(/,\s+|\s+(?=(?:but|and then)\s)/);
            if (m) { const cut = m.index + 15; return [part.slice(0, cut).replace(/[ ,]+$/, ""), part.slice(cut).replace(/^[ ,]+/, "")]; }
        }
        return [part];
    }
    function mergeToMax(parts, max) {
        parts = [...parts];
        while (parts.length > max) {
            let best = 0;
            for (let i = 1; i < parts.length - 1; i++) if (parts[i].length + parts[i + 1].length < parts[best].length + parts[best + 1].length) best = i;
            parts.splice(best, 2, parts[best] + " " + parts[best + 1]);
        }
        return parts;
    }
    function limitEmojis(out, mods, r, trace) {
        const budget = EMOJI_BUDGET[mods.label] || 1;
        const hits = [];
        out.forEach((s, i) => { for (const m of s.matchAll(ANY_EMOJI_RE)) hits.push([i, m[0]]); });
        if (hits.length <= budget) return out;
        const keep = new Set(r.sample([...hits.keys()], budget));
        const res = out.map((s, i) => {
            hits.forEach(([j, e], n) => { if (j === i && !keep.has(n)) s = s.replace(e, ""); });
            return s.replace(/\s{2,}/g, " ").trim();
        }).filter(Boolean);
        trace.push(`emoji budget (${budget}): removed ${hits.length - budget}`);
        return res;
    }
    function maybeAddEmoji(out, tx, stage, mods, r, trace) {
        // no cute emoji on a refusal or an insult; bad news gets a soft one at most
        if (!out.length || mods.flat || out.some(s => has(ANY_EMOJI_RE, s)) || ["insult", "creepy"].includes(mods.intent)) return out;
        const lab = mods.label || "neutral";
        if (r.random() >= (tx.emoji_rate || 0) * (MOOD_EMOJI_MULT[lab] ?? 1)) return out;
        let pool = mods.intent === "answer_bad" ? ["🥺", "🫂"] : MOOD_EMOJIS[lab] || tx.favorite_emojis || [];
        if (stage === "stranger" || stage === "acquaintance") pool = pool.filter(e => !has(WARM_EMOJI_RE, e));
        else if (STAGE_EMOJIS[stage]) pool = [...pool, ...STAGE_EMOJIS[stage]];
        if (!pool.length) return out;
        const emoji = r.choice(pool), i = r.randint(0, out.length - 1);
        out = [...out];
        if (r.random() < 0.2 && out.length < MAX_PARTS) out.splice(i + 1, 0, emoji);
        else out[i] = `${out[i]} ${emoji}`;
        trace.push(`emoji added (${lab}): ${emoji}`);
        return out;
    }
    // her own words: a verbal tic ("honestly", "noted") or a word from her first language ("valla").
    // Where a tic goes depends on the word: an opener ("honestly ..."), a closer ("... fr"), or a little
    // reaction of its own ("noted") that only fits when she's reacting to what he said.
    const TIC_START = new Set(["omg", "wait", "ok but", "honestly", "actually", "oh", "listen", "no but listen", "bro", "ugh", "ahh", "lowkey",
                               "literally", "babe", "babes", "dude", "no bc", "not gonna lie", "hm, ok", "anyway"]);
    const TIC_END = new Set(["fr", "lol", "innit", "babe", "babes", "bro", "dude", "ya know", "i'm dead", "allegedly", "mm", "anyway"]);
    const TIC_ALONE = new Set(["noted", "fair", "fair point", "objection", "be serious", "i see you", "sure", "whatever", "let's go", "no way",
                               "so chill", "i'm obsessed", "obsessed", "wait really", "nooo"]);
    const REACTING = ["fallback", "agree", "disagree", "answer_good", "laugh", "compliment", "question"];
    // native words that belong to a moment (hello / bye / thanks / "I don't know"); the rest go anywhere
    const SLIP_ONLY = { labas: ["greet"], servus: ["greet", "bye", "night"], doei: ["bye", "night"], "ačiū": ["thanks", "compliment"],
                        "nu știu": ["question", "ask_about"], hai: ["meet", "bored"], pame: ["meet"], "hadi": ["meet", "bored", "agree"],
                        "yalla": ["meet", "bored", "agree"], "putain": ["answer_bad", "fallback"], "qué fuerte": ["fallback", "answer_good", "answer_bad"] };
    function flavor(out, persona, mods, r, trace) {
        const tx = persona.texting || {}, intent = mods.intent || "fallback";
        if (mods.flat || !out.length || ["insult", "creepy"].includes(intent)) return out;
        out = [...out];
        const has2 = w => out.join(" ").toLowerCase().includes(w.toLowerCase());
        if ((tx.verbal_tics || []).length && r.random() < 0.13) {
            const t = r.choice(tx.verbal_tics).toLowerCase();
            if (!has2(t)) {
                if (TIC_ALONE.has(t) && REACTING.includes(intent)) { out.unshift(t); trace.push(`her tic: "${t}"`); }
                else if (TIC_START.has(t) && (!TIC_END.has(t) || r.random() < 0.5)) { out[0] = `${t} ${out[0]}`; trace.push(`her tic: "${t}"`); }
                else if (TIC_END.has(t)) { out[out.length - 1] = `${out[out.length - 1]} ${t}`; trace.push(`her tic: "${t}"`); }
            }
        }
        const slips = (tx.native_slips || []).filter(s => !SLIP_ONLY[s.toLowerCase()] || SLIP_ONLY[s.toLowerCase()].includes(intent));
        if (slips.length && r.random() < 0.09) {
            const s = r.choice(slips);
            if (!has2(s)) { out[0] = `${s} ${out[0]}`; trace.push(`native slip: "${s}"`); }
        }
        return out;
    }

    // lines: the clean sentences from the dialog engine ("|" already split). Returns {parts, trace}.
    function apply(lines, persona, { stage = "stranger", mods = {}, seed } = {}) {
        const r = SL.util.rng(seed), tx = persona.texting || {}, trace = [];
        let parts = [];
        lines.filter(Boolean).forEach(l => parts.push(...splitLong(String(l).trim(), r)));
        parts = mergeToMax(parts, MAX_PARTS);
        const limit = mods.max_parts || MAX_PARTS;
        if (parts.length > limit) { trace.push(`mood ${mods.label}: kept ${limit} of ${parts.length} bubbles`); parts = parts.slice(0, limit); }

        let out = [];
        for (const p of parts) {
            let s = p.replace(/’/g, "'").replace(/\s*[—–]\s*/g, " ");
            if (mods.flat) {
                const flat = s.replace(ANY_EMOJI_RE, "").replace(LAUGH_RE, "").replace(/!/g, "").trim();
                if (flat !== s) trace.push(`mood ${mods.label}: flattened (emoji / laugh / ! removed)`);
                s = flat || s;
            }
            if ((stage === "stranger" || stage === "acquaintance") && has(WARM_EMOJI_RE, s)) {
                s = s.replace(WARM_EMOJI_RE, "").trim();
                trace.push(`${stage} stage: warm emoji removed`);
            }
            if (has(LAUGH_RE, s)) {
                s = s.replace(LAUGH_RE, () => makeLaugh(tx.laugh_style || "keysmash", r, tx.keyboard || "qwerty"));
                trace.push(`laugh → ${tx.laugh_style} (${tx.keyboard || "qwerty"})`);
            }
            if (r.random() < (tx.lowercase_rate ?? 0.9)) s = s.toLowerCase();
            const abbr = tx.abbreviation_rate ?? 0.6;
            for (const [re, rep, w] of ABBREVIATIONS) { re.lastIndex = 0; if (re.test(s) && r.random() < abbr * w) { re.lastIndex = 0; s = s.replace(re, rep); } }
            const strip = tx.punctuation_strip ?? 1.0;
            if (r.random() < strip) s = /\d\.\d/.test(s) ? s.replace(/\.$/, "") : s.replace(/\.+/g, m => m.length > 1 ? m : "");  // single periods go, "..." stays
            if (r.random() < 0.7 * strip) s = s.replace(/,/g, "");
            if (r.random() < 0.2 * strip) s = s.replace(/[?!]+$/, "");
            s = s.replace(/\s{2,}/g, " ").trim();
            if (s) out.push(s);
        }
        out = flavor(out, persona, mods, r, trace);
        out = limitEmojis(out, mods, r, trace);
        out = maybeAddEmoji(out, tx, stage, mods, r, trace);

        const final = [];
        for (const s of out) {
            final.push(s);
            const rate = (tx.typo_rate ?? 0.06) * Math.min(2.0, s.length / 30);
            if (r.random() < rate) {
                const words = s.split(" ");
                const cand = words.map((w, i) => i).filter(i => words[i].length >= 4 && /^\p{L}+$/u.test(words[i]) && !protectedWord(words[i]));
                if (cand.length) {
                    const i = r.choice(cand), typo = makeTypo(words[i], r);
                    if (typo && typo !== words[i]) {
                        const correct = words[i];
                        words[i] = typo;
                        final[final.length - 1] = words.join(" ");
                        trace.push(`typo: ${correct} → ${typo}`);
                        if (r.random() < (tx.typo_fix_rate ?? 0.4) && final.length < MAX_PARTS + 1) { final.push("*" + correct); trace.push("typo corrected"); }
                    }
                }
            }
        }
        if (!final.length) { final.push("hm"); trace.push("empty output → fallback reply"); }
        return { parts: final, trace };
    }

    function typingDelays(parts, persona, mods = {}) {
        const r = SL.util.rng(), cps = ((persona.texting || {}).typing_speed_cps || 6.0) * (mods.speed || 1.0);
        return parts.map((p, i) => {
            let base = p.length / cps, pause = i ? r.uniform(0.3, 1.0) : r.uniform(0.8, 2.0) + (mods.extra_first_delay || 0);
            const noise = r.lognorm(0, 0.3);
            if (p.startsWith("*")) { base = 0.6; pause = 0.2; }
            const cap = 5.5 + (i === 0 ? mods.extra_first_delay || 0 : 0);
            return Math.round(Math.max(0.6, Math.min(cap, base * noise + pause)) * 1000);
        });
    }

    const setProtected = words => { PROTECTED = new Set(words.map(w => w.toLowerCase())); };
    return { apply, typingDelays, makeLaugh, setProtected, LAUGH_RE, WARM_EMOJI_RE, ANY_EMOJI_RE, has };
})();
