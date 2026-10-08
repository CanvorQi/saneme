// js/local/attraction.js - Attraction Engine (port of backend/attraction.py).
// Every character has a hidden interest in you (0..1), per profile. It moves by small, explainable
// steps, each logged with its reason:
//   + asking about her, noticing her interests, remembering what she said, effort, quick replies,
//     likes / comments / story replies, making her laugh, compliments once she's into you
//   - dry one-word replies, walls of text, ten messages in a row, too forward for the stage,
//     creepy or rude messages, leaving her waiting for a day, repeating yourself, days of silence
// Time-locked ceiling: nobody falls for someone in an hour.
//     ceiling = 0.22 + 0.78 * (1 - exp(-days_known / tau)),  tau from her personality
// Stages, with a little hysteresis: stranger < 0.30 <= acquaintance < 0.50 <= curious < 0.72 <= crush
window.SL = window.SL || {};

SL.attraction = (() => {
    const STAGES = ["stranger", "acquaintance", "curious", "crush"];
    const THRESHOLDS = { acquaintance: 0.30, curious: 0.50, crush: 0.72 };
    const HYSTERESIS = 0.04, FLOOR = 0.05, LOG_MAX = 400;
    const STAGE_POINTS = { stranger: 0.15, acquaintance: 0.38, curious: 0.6, crush: 0.82 };
    const { round, now } = SL.util;
    const STOP = new Set(`a an the and or but so to of in on at for with from about this that these those is are was were be been
it its i me my you your he him his she her we our they them what when where who why how not no yes just like really
very much more most some any all have has had do does did will would can could should get got go going im youre
dont cant its thats theres there here then than also too maybe kinda sorta gonna wanna lol haha okay ok yeah`.split(/\s+/));
    const DRY = new Set(["hm", "hmm", "hmmm", "k", "kk", "ok", "okay", "lol", "ya", "ye", "yes", "no", "cool", "nice", "yeah", "sure", "mhm",
                         "fine", "same", "true", "idk", "nah", "yep", "nope", "haha", "lmao", "wow"]);
    const QUESTION_RE = /\?|\b(?:what|how|why|where|when|which|who|do you|did you|are you|have you|wbu|hbu|and you)\b/i;
    const ABOUT_HER_RE = /\b(?:you|your|u|ur)\b/i;
    const PET_NAMES_RE = /\b(?:baby|babe|bby|princess|sweetheart|sweetie|honey|darling|hun|cutie|beautiful)\b/i;
    const LOOKS_RE = /\b(?:hot|sexy|gorgeous|pretty|cute|stunning|beautiful|fine as|attractive|lovely)\b/i;
    const RUDE_RE = /\b(?:stupid|idiot|dumb|shut ?up|stfu|bitch|whore|slut|ugly|fat|loser|boring|annoying|f+u+c*k+ (?:you|off)|retard\w*)\b/i;
    const CREEPY_RE = /\b(?:nudes?|sex|sexy pics?|horny|naked|dick|boobs?|tits|send (?:me )?(?:a )?(?:pic|photo) of your (?:body|boobs?))\b/i;
    const warm = s => SL.style.has(SL.style.WARM_EMOJI_RE, s);
    const laughs = s => SL.style.has(SL.style.LAUGH_RE, s);

    const key = (pid, cid) => `interest:${pid}:${cid}`;
    function tauDays(persona) {
        const b5 = persona.big_five || {};
        return round(1.5 + 9 * (0.5 * (b5.conscientiousness ?? 0.5) + 0.5 * (1 - (b5.extraversion ?? 0.5))), 2);
    }
    const daysKnown = (profile, t) => Math.max(0, (t - (profile.created_at || t)) / 86400);
    const ceiling = (profile, persona, t = now()) => round(0.22 + 0.78 * (1 - Math.exp(-daysKnown(profile, t) / tauDays(persona))));
    function stageFor(value, current = "stranger") {
        let target = "stranger";
        STAGES.slice(1).forEach(st => { if (value >= THRESHOLDS[st]) target = st; });
        const ci = STAGES.indexOf(current), ti = STAGES.indexOf(target);
        if (ti < ci && value >= THRESHOLDS[current] - HYSTERESIS) return current;
        return target;
    }
    function save(pid, cid, st) { st.log = st.log.slice(-LOG_MAX); SL.store.setSetting(key(pid, cid), st); }
    function initial(profile, persona, t) {
        const pl = SL.openers.plan(profile, persona);
        const v = round(0.12 + (pl.likes ? 0.08 : 0) + (pl.texts_first ? 0.03 : 0));
        const reason = pl.likes ? "first impression: she liked your profile card" : "first impression: your card didn't really catch her eye";
        return { value: v, stage: "stranger", last_id: 0, credited: [], last_contact: t,
                 log: [{ ts: profile.created_at || t, delta: v, value: v, reason, kind: "start" }] };
    }
    function load(profile, persona) {
        const pid = profile.id, cid = persona.id, t = now();
        let st = SL.store.getSetting(key(pid, cid));
        if (!st) { st = initial(profile, persona, t); save(pid, cid, st); }
        // fading: after 2 days without contact she slowly cools down (applied lazily, once per day)
        const idle = (t - (st.last_contact || t)) / 86400, faded = st.faded_days || 0;
        if (idle >= 3 && Math.floor(idle) - 2 > faded) {
            const n = Math.floor(idle) - 2 - faded;
            apply(st, profile, persona, [[-0.012 * n, `faded: no contact for ${Math.floor(idle)} days`, "fade"]], t);
            st.faded_days = faded + n;
            save(pid, cid, st);
        }
        return st;
    }
    // deltas: [delta, reason, kind]. Gains stop at the ceiling, losses don't. Held by admin: only logged.
    function apply(st, profile, persona, deltas, t, moodLabel = "neutral") {
        if (st.locked) {
            if (deltas.length) st.log.push({ ts: t, delta: 0, value: st.value, kind: "capped",
                reason: "held, not applied: " + deltas.map(([d, r]) => `${r} (${d > 0 ? "+" : ""}${d.toFixed(3)})`).join(", ") });
            return [];
        }
        const b5 = persona.big_five || {};
        const posK = (0.8 + 0.4 * (b5.agreeableness ?? 0.5)) * (["excited", "content"].includes(moodLabel) ? 1.15 : ["sad", "drained", "tired"].includes(moodLabel) ? 0.9 : 1.0);
        const negK = (0.8 + 0.6 * (b5.neuroticism ?? 0.5)) * (moodLabel === "irritated" ? 1.3 : 1.0);
        const cap = ceiling(profile, persona, t);
        const applied = [], capped = [];
        for (let [d, reason, kind] of deltas) {
            d *= d > 0 ? posK : negK;
            const v = st.value;
            if (d > 0) {
                const room = Math.max(0, cap - v);
                if (room <= 0) { capped.push(reason); applied.push({ delta: 0, reason, capped: true }); continue; }
                d = Math.min(d, room);
            }
            const nv = round(Math.max(FLOOR, Math.min(1, v + d)));
            st.value = nv;
            st.log.push({ ts: t, delta: round(nv - v), value: nv, reason, kind });
            applied.push({ delta: round(nv - v), reason });
        }
        if (capped.length) st.log.push({ ts: t, delta: 0, value: st.value, kind: "capped", reason: `too soon, held at the ceiling ${cap.toFixed(2)}: ${capped.join(", ")}` });
        const old = st.stage || "stranger";
        st.stage = stageFor(st.value, old);
        if (st.stage !== old) {
            const up = STAGES.indexOf(st.stage) > STAGES.indexOf(old);
            st.log.push({ ts: t, delta: 0, value: st.value, kind: "stage", reason: `stage ${up ? "up" : "down"}: ${old} → ${st.stage}` });
            applied.push({ stage: st.stage, from: old });
        }
        return applied;
    }
    function keywords(persona) {
        const words = new Set();
        [...(persona.likes || []), ...(persona.hobbies || []), persona.city, persona.district, persona.occupation, persona.pet].forEach(item => {
            ((item || "").toLowerCase().match(/[a-zà-ÿ]+/g) || []).forEach(w => { if (w.length >= 4 && !STOP.has(w)) words.add(w); });
        });
        return words;
    }
    function herWords(history, beforeId) {
        const hers = history.filter(m => m.role === "saneme" && m.id < beforeId && !(m.meta || {}).deleted);
        const words = new Set();
        hers.slice(0, -4).forEach(m => ((m.text || "").toLowerCase().match(/[a-zà-ÿ]+/g) || []).forEach(w => { if (w.length >= 5 && !STOP.has(w)) words.add(w); }));
        return words;
    }

    function scoreTurn(profile, persona, pending, history, st) {
        const stage = st.stage || "stranger", warmOk = stage === "curious" || stage === "crush";
        const text = pending.map(m => m.text).join(" "), low = text.toLowerCase();
        const words = new Set(low.match(/[a-zà-ÿ]+/g) || []);
        const credited = new Set(st.credited || []);
        const out = [];
        const once = (tag, d, reason, kind) => { if (!credited.has(tag)) { credited.add(tag); out.push([d, reason, kind]); } };
        const stripped = low.replace(/[^\p{L}\p{N}\s]/gu, "").trim();
        const reacting = pending.every(m => { const mt = m.meta || {}; return mt.story || mt.sticker || mt.shared; });
        if (!stripped || reacting) { /* a reaction, not a dry reply */ }
        else if (DRY.has(stripped) || stripped.length <= 2) out.push([-0.03, `dry reply ("${text.slice(0, 20)}")`, "dry"]);
        else if (text.length >= 25 && text.length <= 450) out.push([0.01, "put some effort into his message", "effort"]);
        if (text.length > 600) out.push([-0.01, "wall of text", "effort"]);
        if (QUESTION_RE.test(text) && ABOUT_HER_RE.test(text)) out.push([0.02, "asked about her", "curious"]);
        const kw = keywords(persona);
        const hits = [...words].filter(w => kw.has(w) && !credited.has(`kw:${w}`)).sort();
        if (hits.length) { hits.slice(0, 2).forEach(w => credited.add(`kw:${w}`)); out.push([0.03, `noticed her interests (${hits.slice(0, 2).join(", ")})`, "attention"]); }
        if (pending.length) {
            const raw = `${persona.name || ""} ${profile.name || ""}`.toLowerCase();
            const names = new Set((raw + " " + raw.normalize("NFKD").replace(/[̀-ͯ]/g, "")).match(/[a-zà-ÿ]+/g) || []);
            const hw = herWords(history, pending[0].id);
            const mem = [...words].filter(w => hw.has(w) && !names.has(w) && !credited.has(`mem:${w}`)).sort();
            if (mem.length) { mem.slice(0, 2).forEach(w => credited.add(`mem:${w}`)); out.push([0.03, `remembered what she told him (${mem.slice(0, 2).join(", ")})`, "memory"]); }
        }
        pending.forEach(m => {
            const mt = m.meta || {};
            if (mt.story) once(`story:${mt.story.id}`, 0.015, "replied to her story", "attention");
            if (mt.note) once(`note:${mt.note.id}`, 0.01, "replied to her note", "attention");
            if (mt.post) once(`comment:${mt.post.photo}`, 0.015, "commented on her post", "attention");
        });
        const pet = text.match(PET_NAMES_RE);
        if (pet) {
            if (stage === "stranger" || stage === "acquaintance") out.push([-0.035, `pet name too early ("${pet[0]}")`, "forward"]);
            else if (stage === "crush") out.push([0.01, "sweet nickname", "flirt"]);
        }
        if (LOOKS_RE.test(text) && !pet) {
            if (stage === "stranger") out.push([-0.025, "complimented her looks before knowing her", "forward"]);
            else if (warmOk) out.push([0.02, "sweet compliment", "flirt"]);
        }
        if (warm(text)) {
            if (stage === "stranger") out.push([-0.02, "hearts too early", "forward"]);
            else if (warmOk) out.push([0.01, "warm emoji", "flirt"]);
        }
        const rude = text.match(RUDE_RE);
        if (rude) out.push([-0.1, `rude ("${rude[0]}")`, "rude"]);
        if (CREEPY_RE.test(text)) out.push([warmOk ? -0.04 : -0.08, "creepy / sexual message", "rude"]);
        if (pending.length >= 5) out.push([-0.02, `${pending.length} messages in a row without her answering`, "needy"]);
        const earlier = history.filter(m => m.role === "user" && m.id < pending[0].id).map(m => (m.text || "").trim().toLowerCase()).slice(-30);
        if (pending.some(m => { const t = (m.text || "").trim().toLowerCase(); return t.length > 6 && earlier.includes(t); }))
            out.push([-0.02, "repeating himself", "effort"]);
        const hers = history.filter(m => m.role === "saneme" && m.id < pending[0].id);
        if (hers.length) {
            const wait = pending[0].ts - hers[hers.length - 1].ts;
            if (wait > 86400) out.push([-0.02, `left her waiting ${Math.floor(wait / 86400)} day(s)`, "slow"]);
            else if (wait < 180) out.push([0.005, "answered quickly", "fast"]);
        }
        st.credited = [...credited].sort().slice(-300);
        return out;
    }

    function onHisTurn(profile, persona, history, moodLabel = "neutral") {
        const st = load(profile, persona);
        const pending = history.filter(m => m.role === "user" && m.id > (st.last_id || 0));
        let changes = [];
        if (pending.length) {
            const t = now();
            changes = apply(st, profile, persona, scoreTurn(profile, persona, pending, history, st), t, moodLabel);
            st.last_id = Math.max(...pending.map(m => m.id));
            st.last_contact = t;
            st.faded_days = 0;
            save(profile.id, persona.id, st);
        }
        return { value: st.value, stage: st.stage, ceiling: ceiling(profile, persona), changes };
    }
    function onHerReply(profile, persona, parts) {
        if (parts.some(laughs)) {
            const st = load(profile, persona);
            apply(st, profile, persona, [[0.015, "made her laugh", "humor"]], now());
            save(profile.id, persona.id, st);
        }
    }
    function onLike(profile, persona, photo, liked) {
        if (!liked) return;
        const st = load(profile, persona), tag = `like:${photo}`;
        if ((st.credited || []).includes(tag)) return;
        (st.credited = st.credited || []).push(tag);
        apply(st, profile, persona, [[0.01, "liked her post", "attention"]], now());
        save(profile.id, persona.id, st);
    }
    function onComment(profile, persona, photo, text) {
        const st = load(profile, persona), deltas = [], tag = `comment:${photo}`;
        if (!(st.credited || []).includes(tag)) { (st.credited = st.credited || []).push(tag); deltas.push([0.015, "commented on her post", "attention"]); }
        const rude = text.match(RUDE_RE);
        if (rude) deltas.push([-0.1, `rude comment ("${rude[0]}")`, "rude"]);
        else if (CREEPY_RE.test(text)) deltas.push([-0.08, "creepy comment under her post", "rude"]);
        if (deltas.length) { apply(st, profile, persona, deltas, now()); save(profile.id, persona.id, st); }
    }
    function current(profile, persona) {
        const st = load(profile, persona);
        return { value: st.value, stage: st.stage, ceiling: ceiling(profile, persona), tau_days: tauDays(persona), locked: !!st.locked };
    }
    const stageOf = (profile, persona) => profile ? current(profile, persona).stage : "stranger";

    return { STAGES, THRESHOLDS, STAGE_POINTS, RUDE_RE, CREEPY_RE, PET_NAMES_RE, LOOKS_RE, DRY,
             onHisTurn, onHerReply, onLike, onComment, current, stageOf, ceiling, load };
})();
