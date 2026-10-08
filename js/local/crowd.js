// js/local/crowd.js - Other people's comments under her posts, so posts look lived-in (like the like counts).
// Made up but stable: seeded by the photo, so a post always has the same comments, from the same accounts.
// Some of them got a reply from her. Your own comments go between them by time (server.js /api/feed).
window.SL = window.SL || {};

SL.crowd = (() => {
    const NAMES = ["mert", "elif", "lucas", "emma", "deniz", "noah", "mia", "can", "zeynep", "leo", "sofia", "arda", "lina", "omar", "ece",
                   "jonas", "ines", "kerem", "chloe", "max", "selin", "theo", "lara", "yusuf", "ella", "nil", "matteo", "aylin", "felix",
                   "ada", "hugo", "irem", "daniel", "maya", "emir", "nora", "luca", "defne", "sam", "zoe"];
    const HANDLES = [n => `${n}.${"abcdeklmrsty"[n.length % 12]}`, n => `${n}_${10 + (n.length * 7) % 89}`, n => `the.${n}`, n => `${n}.official`,
                     n => `${n}x`, n => `itss${n}`, n => `${n}.daily`, n => `${n}__`];
    const ANY = ["obsessed 😍", "this is so pretty", "omg the vibes", "queen 👑", "stunning", "😍😍", "ok but the lighting", "iconic",
                 "love this", "the colors!!", "you look so good here", "need this energy", "🔥🔥", "so cute 🥺", "wow", "goals honestly",
                 "this pic >>>", "main character energy", "literally glowing", "can't stop looking at this", "ate", "the vibe is immaculate",
                 "favorite post", "okay we see you 👀", "so pretty omg", "❤️", "post more!!"];
    const PLACE = ["{place} looks so beautiful", "wait you're in {place}?!", "{place} 😍", "miss {place} so much", "i was just there!!"];
    const CAPTION = ["haha this caption", "the caption 😭", "relatable", "same honestly", "lmao"];
    const REPLY = ["thank youu 🥰", "haha thanks", "😘", "omg thank you", "stoppp 🥹", "❤️", "you're sweet", "hehe thanks"];

    function comments(cid, post) {
        const r = SL.util.rng(`${cid}/${post.photo}/comments`);
        const n = r.randint(2, 9);
        // the post went up around noon of its date; comments came in over the next day or two
        const base = (post.date ? Date.parse(post.date + "T12:00:00Z") / 1000 : SL.util.now() - 30 * 86400);
        const used = new Set(), said = new Set(), out = [];
        for (let i = 0; i < n; i++) {
            const name = r.choice(NAMES);
            const author = r.choice(HANDLES)(name);
            const roll = r.random();
            const text = post.location && roll < 0.18 ? r.choice(PLACE).replace("{place}", post.location.split(",")[0])
                : post.caption && roll < 0.3 ? r.choice(CAPTION) : r.choice(ANY);
            if (used.has(author) || said.has(text)) continue;  // one comment per account, no two alike
            used.add(author); said.add(text);
            const ts = base + r.uniform(0.02, 1.5) * 86400;
            out.push({ author, text, ts, where: "crowd", reply: r.random() < 0.3 ? r.choice(REPLY) : null });
        }
        return out.sort((a, b) => a.ts - b.ts);
    }
    return { comments };
})();
