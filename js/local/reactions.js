// js/local/reactions.js - Reactions, quoted replies, deleted messages (port of backend/reactions.py).
//   react:         she leaves an emoji on your last message (laughs -> 😂, bad news -> 🥲 ...)
//   reaction only: sometimes a reaction IS the whole reply ("ok" / "lol" closers, or when she's drained)
//   quote:         when you sent several messages, she may answer the earlier question with a quote
//   delete:        now and then she types something and deletes it ("This message was deleted")
window.SL = window.SL || {};

SL.reactions = (() => {
    const LAUGH_RE = /\b(?:ha){2,}|\blol\b|\blmao|\bjk\b|😂|🤣|💀/i;
    const SAD_RE = /\b(?:sad|sick|tired|exhausted|bad day|stressed|rough|ugh|sucks|miss)\b|😢|🥲|😞/i;
    const WOW_RE = /\b(?:omg|wow|no way|crazy|insane|guess what|wild)\b|!{2,}|😮|🤯/i;
    const NICE_RE = /\b(?:nice|cool|great|awesome|amazing|beautiful|congrats|love)\b|🔥|✨/i;
    const CLOSER_RE = /^(?:ok(?:ay)?|k+|lol+|ha(?:ha)+|yeah|ya|yep|same|true|fair|nice|cool|bet|gn|good night|💀|😂|👍)[.!\s]*$/i;
    const EMOJI = { laugh: "😂", sad: "🥲", wow: "😮", nice: "🔥", none: "👍" };
    const P_REACT = { laugh: 0.45, sad: 0.35, wow: 0.35, nice: 0.3, none: 0.06 };
    const MOOD_REACT = { excited: 1.4, content: 1.0, neutral: 0.9, sad: 0.6, tired: 0.7, drained: 0.8, irritated: 0.3 };
    const ALLOWED_USER_REACTIONS = ["❤️", "😂", "😮", "😢", "👍", "🔥"];

    function kindOf(text) {
        for (const [name, rx] of [["laugh", LAUGH_RE], ["sad", SAD_RE], ["wow", WOW_RE], ["nice", NICE_RE]]) if (rx.test(text)) return name;
        return "none";
    }
    function decide(pending, moodLabel, r) {
        const last = (pending[pending.length - 1].text || "").trim();
        const kind = kindOf(last);
        const pReact = SL.util.round(Math.min(0.9, P_REACT[kind] * (MOOD_REACT[moodLabel] ?? 1)), 2);
        let emoji = r.random() < pReact ? EMOJI[kind] : null;
        let pOnly = 0;
        if (CLOSER_RE.test(last) && pending.length === 1) pOnly = 0.45;
        if (moodLabel === "drained" || moodLabel === "tired") pOnly += 0.15;
        else if (moodLabel === "irritated") pOnly += 0.1;
        if (pending.some(m => (m.text || "").includes("?"))) pOnly = 0;  // never leave a question with just a reaction
        pOnly = SL.util.round(pOnly, 2);
        const only = pOnly > 0 && r.random() < pOnly;
        if (only && !emoji) emoji = EMOJI[kind];
        return { emoji, reaction_only: only, kind, p_react: pReact, p_only: pOnly };
    }
    function quoteTarget(pending, r) {
        if (pending.length < 2) return null;
        for (const m of pending.slice(0, -1)) if ((m.text || "").includes("?") && r.random() < 0.6) return m;
        return null;
    }
    function shouldDelete(moodLabel, r) {
        const p = SL.util.round(0.05 * (moodLabel === "irritated" || moodLabel === "sad" ? 2.5 : 1), 3);
        return { delete: r.random() < p, p };
    }
    return { decide, quoteTarget, shouldDelete, kindOf, ALLOWED_USER_REACTIONS };
})();
