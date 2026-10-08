// js/local/chatmedia.js - Photos and stickers in the chat (port of backend/chatmedia.py).
// She can send one of her own photos; whether she does depends on the stage, like with a real person:
//     you ask for a pic      stranger never (she teases / dodges)  acquaintance 60%  curious 85%  crush 95%
//     "where are you / wyd"  0%                                    15%               30%          45%
//     out of the blue        0%                                     3%                6%          10%
// You can't send real photos, but you can send stickers (big animated emojis).
window.SL = window.SL || {};

SL.chatmedia = (() => {
    const ASK_RE = /\b(?:pics?|picture|photos?|selfie|send (?:me )?(?:a )?(?:pic|photo|selfie)|show me|let me see|wanna see)\b/i;
    const CONTEXT_RE = /\b(?:where are (?:you|u)|wyd|what are (?:you|u) (?:doing|up to)|what(?:'| a)?re (?:you|u) wearing|whatcha doing)\b/i;
    const CREEPY_RE = /\b(?:nudes?|naked|body pic|boobs?|tits|lingerie|bikini pic|sexy pic)\b/i;
    const P_ASK = { stranger: 0, acquaintance: 0.6, curious: 0.85, crush: 0.95 };
    const P_CONTEXT = { stranger: 0, acquaintance: 0.15, curious: 0.3, crush: 0.45 };
    // (a bit rarer than the desktop app: without a model the caption can't refer to the conversation)
    const P_RANDOM = { stranger: 0, acquaintance: 0.02, curious: 0.04, crush: 0.06 };
    const STICKERS = {
        laugh: ["😂", "crying laughing"], dead: ["💀", "dead (from laughing)"], cry: ["😭", "dramatic crying"],
        plead: ["🥺", "puppy eyes"], shy: ["🙈", "shy, covering eyes"], eyes: ["👀", "curious eyes"],
        fire: ["🔥", "that's fire"], heart: ["❤️", "a heart"], rose: ["🌹", "a rose"], hug: ["🫂", "a hug"],
        coffee: ["☕", "coffee? (an invite)"], night: ["🌙", "goodnight"], wave: ["👋", "hi wave"],
        clown: ["🤡", "clown (roasting himself)"], think: ["🤔", "thinking..."], party: ["🥳", "celebrating"],
    };
    const stickerMeta = sid => STICKERS[sid] ? { id: sid, emoji: STICKERS[sid][0], label: STICKERS[sid][1] } : null;
    const list = () => Object.entries(STICKERS).map(([id, [emoji, label]]) => ({ id, emoji, label }));
    const sentFiles = history => history.filter(m => (m.meta || {}).photo).map(m => m.meta.photo.file);

    function decide(persona, stage, pendingText, history, r) {
        if (CREEPY_RE.test(pendingText)) return { send: false, refuse: true, why: "creepy photo request", p: 0, photo: null };
        const asked = ASK_RE.test(pendingText);
        let p, why;
        if (asked) { p = P_ASK[stage] || 0; why = "he asked for a photo"; }
        else if (CONTEXT_RE.test(pendingText)) { p = P_CONTEXT[stage] || 0; why = "he asked what she's doing / where she is"; }
        else {
            p = P_RANDOM[stage] || 0; why = "spontaneous";
            if (history.slice(-30).some(m => (m.meta || {}).photo)) p = 0;  // not twice in a short while
        }
        let send = r.random() < p, refuse = asked && !send;
        const photo = send ? pick(persona, history, r) : null;
        if (send && !photo) { send = false; refuse = asked; }
        return { send, refuse, asked, why, p: SL.util.round(p, 2), photo };
    }
    function pick(persona, history, r) {
        const posts = SL.chars.posts(persona.id);
        if (!posts.length) return null;
        const sent = sentFiles(history);
        const fresh = posts.filter(p => !sent.includes(p.photo));
        const pool = fresh.length ? fresh : posts.filter(p => !sent.slice(-2).includes(p.photo)).length ? posts.filter(p => !sent.slice(-2).includes(p.photo)) : posts;
        const p = r.choice(pool);
        return { file: p.photo, url: p.thumb, caption: p.caption, location: p.location, date: p.date };
    }
    return { decide, stickerMeta, list, ASK_RE, CREEPY_RE };
})();
