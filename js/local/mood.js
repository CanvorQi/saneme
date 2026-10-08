// js/local/mood.js - Mood Engine (port of backend/mood.py).
// Russell's two axes plus two bars:
//     valence -1..1 unhappy <-> happy      arousal 0..1 calm <-> energized / tense
//     energy   0..1 tired <-> rested       social_battery 0..1 drained <-> wants to talk
// Mood belongs to each character and drifts back to a personality-based baseline:
//     mood += (baseline - mood) * (1 - exp(-dt * ln2 / half_life))
// New in the web version (no LLM to "feel" the chat): the conversation nudges it a little (nudge),
// and energy follows her own clock - she gets tired late at night in her time zone.
window.SL = window.SL || {};

SL.mood = (() => {
    const KEYS = ["valence", "arousal", "energy", "social_battery"];
    const RANGES = { valence: [-1, 1], arousal: [0, 1], energy: [0, 1], social_battery: [0, 1] };
    const { clamp, round, now, local } = SL.util;
    const PRESETS = {
        excited: { valence: 0.75, arousal: 0.85, energy: 0.8, social_battery: 0.85 },
        content: { valence: 0.6, arousal: 0.25, energy: 0.65, social_battery: 0.7 },
        irritated: { valence: -0.6, arousal: 0.8, energy: 0.55, social_battery: 0.35 },
        sad: { valence: -0.65, arousal: 0.2, energy: 0.35, social_battery: 0.3 },
        tired: { valence: 0.0, arousal: 0.15, energy: 0.1, social_battery: 0.45 },
        drained: { valence: -0.1, arousal: 0.3, energy: 0.45, social_battery: 0.08 },
    };

    // energy over her day: rested in the day, fading late, low in the small hours
    // (the night owl - dreamy voice - is the other way round)
    function clockEnergy(persona, ts) {
        const h = local(persona.timezone || "UTC", ts).h;
        if (persona.voice_type === "dreamy") return h >= 22 || h < 4 ? 0.75 : h < 11 ? 0.3 : 0.6;
        if (h >= 1 && h < 7) return 0.22;
        if (h >= 23 || h < 1) return 0.42;
        if (h < 9) return 0.5;
        return 0.68;
    }

    function baseline(persona, ts = now()) {
        const b5 = persona.big_five || {};
        const n = b5.neuroticism ?? 0.5, e = b5.extraversion ?? 0.5;
        return { valence: round(0.25 - 0.4 * (n - 0.5)), arousal: round(0.35 + 0.3 * (e - 0.5)),
                 energy: clockEnergy(persona, ts), social_battery: round(0.6 + 0.3 * (e - 0.5)) };
    }
    const halfLife = persona => round(3.0 * (0.6 + 1.6 * ((persona.big_five || {}).neuroticism ?? 0.5)), 2);
    const key = cid => `mood:${cid}`;

    function current(persona) {
        const base = baseline(persona);
        const st = SL.store.getSetting(key(persona.id));
        if (!st) return { values: { ...base }, anchor: { ...base }, baseline: base, locked: false, cause: null, updated_at: null,
                          source: "baseline", half_life_h: halfLife(persona) };
        const anchor = st.values;
        let values = { ...anchor };
        if (!st.locked) {
            const dt = Math.max(0, now() - st.updated_at);
            const f = 1 - Math.exp(-dt * Math.LN2 / (halfLife(persona) * 3600));
            values = {};
            KEYS.forEach(k => values[k] = round(anchor[k] + (base[k] - anchor[k]) * f));
        }
        let cause = st.cause || null;
        if (cause && Math.max(...KEYS.map(k => Math.abs(values[k] - base[k]))) < 0.12) cause = null;
        return { values, anchor, baseline: base, locked: !!st.locked, cause, updated_at: st.updated_at,
                 source: st.source || "chat", half_life_h: halfLife(persona) };
    }

    function set(persona, values, { cause = null, locked = false, source = "admin" } = {}) {
        const before = current(persona).values;
        const v = {};
        KEYS.forEach(k => v[k] = round(clamp(values[k] ?? before[k], ...RANGES[k])));
        SL.store.setSetting(key(persona.id), { values: v, updated_at: now(), locked: !!locked, cause: (cause || "").trim() || null, source });
        return current(persona);
    }

    // the chat moves her a little: deltas {valence, arousal, energy, social_battery}
    function nudge(persona, deltas) {
        const cur = current(persona);
        if (cur.locked) return cur;
        const v = {};
        KEYS.forEach(k => v[k] = (cur.values[k] ?? 0) + (deltas[k] || 0));
        return set(persona, v, { cause: cur.cause, source: "chat" });
    }

    function label(v) {
        const val = v.valence, ar = v.arousal;
        const quad = val >= 0.2 ? (ar >= 0.55 ? "excited" : "content") : val <= -0.2 ? (ar >= 0.55 ? "irritated" : "sad") : "neutral";
        if (v.energy < 0.25 && ["neutral", "content", "sad"].includes(quad)) return "tired";
        if (v.social_battery < 0.2 && ["neutral", "content"].includes(quad)) return "drained";
        return quad;
    }
    const degree = x => Math.abs(x) >= 0.7 ? "very" : Math.abs(x) >= 0.45 ? "quite" : "a bit";
    function describe(state) {
        const v = state.values, feel = [];
        if (v.valence >= 0.2) feel.push(`${degree(v.valence)} ${v.arousal >= 0.55 ? "excited and happy" : "happy and relaxed"}`);
        else if (v.valence <= -0.2) feel.push(`${degree(v.valence)} ${v.arousal >= 0.55 ? "irritated and on edge" : "down and low"}`);
        else feel.push(v.arousal >= 0.7 ? "restless" : "pretty neutral");
        if (v.energy < 0.3) feel.push(v.energy < 0.15 ? "exhausted" : "tired");
        else if (v.energy > 0.8) feel.push("full of energy");
        if (v.social_battery < 0.3) feel.push(v.social_battery < 0.15 ? "socially drained" : "not very chatty");
        return { label: label(v), text: feel.join(", ") };
    }
    function styleModifiers(state) {
        const v = state.values, lab = label(v);
        const mods = { max_parts: 4, speed: 1.0, extra_first_delay: 0.0, flat: false };
        if (lab === "excited") Object.assign(mods, { max_parts: 4, speed: 1.35 });
        else if (lab === "irritated") Object.assign(mods, { max_parts: 2, speed: 0.85, extra_first_delay: 4.0, flat: true });
        else if (lab === "sad") Object.assign(mods, { max_parts: 2, speed: 0.8, extra_first_delay: 1.5 });
        else if (lab === "tired") Object.assign(mods, { max_parts: 2, speed: 0.65, extra_first_delay: 2.0 });
        else if (lab === "drained") Object.assign(mods, { max_parts: 1, speed: 0.9, extra_first_delay: 2.5 });
        if (v.social_battery < 0.3) mods.max_parts = Math.min(mods.max_parts, 2);
        mods.label = lab;
        return mods;
    }

    return { KEYS, PRESETS, baseline, current, set, nudge, label, describe, styleModifiers };
})();
