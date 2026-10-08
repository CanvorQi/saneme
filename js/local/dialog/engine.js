// js/local/dialog/engine.js - The dialog engine: her reply without an AI model (Amor-style).
//  1) what kind of message is it (intents.js) and what's it about (topics.js, kept for a few messages)
//  2) what she learns about you (memory.js) and how it moves her mood (mood.js)
//  3) which line bank fits: her voice + the relationship stage + her mood (lines.js)
//  4) her own life fills the lines: city, job, likes, pet, family, stories, backstory (unlocked by stage)
//  5) extras: reacting to what she learned, "how did the exam go?", a sweet line when she's into you,
//     a question back to keep the chat going (and she remembers what she asked, to react to your answer)
// The Texting Style Engine (style.js) then turns the lines into her texts.
window.SL = window.SL || {};
SL.dialog = SL.dialog || {};

SL.engine = (() => {
    const D = SL.dialog, L = SL.dialog.LINES;

    // ---------- text normalizing + matching ----------
    const lower = s => s.toLowerCase().replace(/[’`]/g, "'");
    const clean = s => lower(s).replace(/[^\p{L}\p{N}\p{Extended_Pictographic}'\s]/gu, " ").replace(/\s+/g, " ").trim();
    // "heyyy" -> "hey", "soooo good" -> "so good": only when he stretched a word (3+ of a letter), so a
    // normal "late" never turns into "latte"
    const forms = s => {
        const c = clean(s), stretched = /(\p{L})\1{2,}/u.test(c);
        return [c, stretched ? c.replace(/(\p{L})\1+/gu, "$1") : null];
    };
    const esc = s => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    function compile(w) {
        const start = w.startsWith("^"), whole = w.startsWith("="), prefix = w.endsWith("*");
        const core = w.replace(/^[\^=]/, "").replace(/\*$/, "");
        const emoji = !/[\p{L}\p{N}]/u.test(core);
        const mk = text => {
            if (emoji) return { emoji: true, s: core };
            const body = esc(text);
            if (whole) return new RegExp("^" + body + "$", "u");
            return new RegExp((start ? "^" : "(?<![\\p{L}\\p{N}'])") + body + (prefix ? "" : "(?![\\p{L}\\p{N}])"), "u");
        };
        const exact = clean(core);
        return { w, a: mk(exact), b: mk(exact.replace(/(\p{L})\1+/gu, "$1")), raw: core };
    }
    function hit(pat, f, raw) {
        if (pat.a.emoji) return raw.includes(pat.a.s);
        return pat.a.test(f[0]) || (f[1] !== null && pat.b.test(f[1]));
    }
    const INTENTS = D.INTENTS.map(([intent, words]) => ({ intent, pats: words.map(compile) }));
    const ORDER = INTENTS.map(x => x.intent);
    const TOPICS = D.TOPICS.map(t => ({ t, pats: t.words.map(compile), tastes: (t.tastes || []).map(compile) }));
    const TONES = { good: D.TONES.good.map(compile), bad: D.TONES.bad.map(compile), close: D.TONES.close.map(compile) };
    const QUESTION_START = /^(?:what|why|how|where|when|who|whom|which|do|does|did|are|is|am|can|could|would|will|have|has|should|shall|wanna|r u|u)\b/i;
    const isQuestion = raw => /\?\s*$/.test(raw.trim()) || QUESTION_START.test(raw.trim());

    function detect(raw) {
        const f = forms(raw);
        // a keysmash ("asdfghjk") is a laugh
        if (/^[asdfghjklşiqwe]{6,}$/i.test(f[0]) && !/[aeiou]{2}/i.test(f[0])) return { intent: "laugh", word: "keysmash" };
        for (const { intent, pats } of INTENTS) {
            const p = pats.find(x => hit(x, f, raw));
            if (p) return { intent, word: p.raw };
        }
        return { intent: isQuestion(raw) ? "question" : "fallback", word: null };
    }
    const rank = i => i === "question" ? 998 : i === "fallback" ? 999 : ORDER.indexOf(i);

    function toneOf(raw, intent) {
        if (intent === "answer_bad") return "bad";
        if (intent === "answer_good") return "good";
        const f = forms(raw);
        if (TONES.bad.some(p => hit(p, f, raw))) return "bad";
        if (TONES.good.some(p => hit(p, f, raw))) return "good";
        return isQuestion(raw) ? "ask" : "any";
    }
    function topicOf(raw, current) {
        const f = forms(raw);
        let best = null;
        TOPICS.forEach(T => {
            const hits = T.pats.filter(p => hit(p, f, raw));
            if (!hits.length) return;
            const top = hits.reduce((a, b) => b.raw.length > a.raw.length ? b : a);
            const score = hits.length * 10 + top.raw.length + (T.t.id === current ? 5 : 0);
            if (!best || score > best.score) best = { id: T.t.id, topic: T.t, word: top.raw, score };
        });
        return best;
    }

    // ---------- per-chat dialog state (what she asked, topic on her mind, lines she used) ----------
    const skey = (pid, cid) => `dlg:${pid}:${cid}`;
    const loadState = (pid, cid) => SL.store.getSetting(skey(pid, cid)) || { recent: [], expect: null, topic: null, shared: [], used_ex: [], asked_q: [], greeted_at: 0 };
    const saveState = (pid, cid, st) => { st.recent = st.recent.slice(0, 24); st.used_ex = st.used_ex.slice(-6); SL.store.setSetting(skey(pid, cid), st); };

    // ---------- her own facts as fill-ins ----------
    const has = v => v !== undefined && v !== null && String(v).trim() !== "";
    function daypart(persona) {
        const h = SL.util.local(persona.timezone || "UTC").h;
        return h >= 5 && h < 12 ? "morning" : h < 17 ? "afternoon" : h < 22 ? "evening" : "night";
    }
    function cardBit(profile) {
        const a = (profile && profile.appearance) || {};
        const bits = [];
        if (a.notable) bits.push(a.notable.replace(/^(?:a|an|my)\s+/i, ""));
        if (a.glasses) bits.push("glasses");
        const st = { sporty: "sporty look", classic: "classic style", streetwear: "streetwear fit", casual: "casual vibe", smart: "smart look" }[a.style];
        if (st) bits.push(st);
        if (a.hair_style && a.hair_style !== "bald" && a.hair_color) bits.push(`${a.hair_color} hair`);
        return bits;
    }
    function jobPlace(persona) {
        const o = (persona.occupation || "").toLowerCase();
        return /student|studies|uni/.test(o) ? (/intern/.test(o) ? "the firm" : "uni") : /studio/.test(o) ? "the studio" : "work";
    }

    function makeCtx(c) {
        const p = c.persona, ab = SL.chars.about(p.id), r = c.r;
        const likes = r.shuffle(p.likes || []), hobbies = r.shuffle(p.hobbies || []);
        const nameFact = c.profile ? SL.memory.one(c.profile.id, p.id, "name") : null;
        return {
            name: (nameFact && nameFact.value) || (c.profile && c.profile.name) || "", self: p.name, age: p.age, city: p.city,
            district: p.district && p.district !== p.city ? p.district.split(",")[0] : "", country: p.country, job: ab.job,
            occupation: p.occupation, like: likes[0], like2: likes[1], hobby: hobbies[0], hobby2: hobbies[1], pet: ab.pet,
            family: ab.family, jobplace: jobPlace(p), laugh: "haha", cardbit: r.choice(cardBit(c.profile).concat([undefined]).filter(Boolean)) || "",
            doing: () => doing(c),
        };
    }
    // fills {tokens}; null when a token it needs is empty (the caller then picks another line)
    function fill(c, line, extra = {}) {
        let ok = true;
        const out = line.replace(/\{(\w+)\}/g, (_, k) => {
            let v = k in extra ? extra[k] : c.ctx[k];
            if (typeof v === "function") v = v();
            if (!has(v)) { ok = false; return ""; }
            return String(v);
        });
        // "a exam" -> "an exam" (a filled-in word decides the article)
        return ok ? out.replace(/\s+([,.!?])/g, "$1").replace(/\s{2,}/g, " ").replace(/\b([Aa]) (?=(?:[aeioAEIO]|[uU](?!ni|se|su|ro))(?![A-Z]))/g, "$1n ").trim() : null;
    }

    // ---------- picking lines ----------
    const voiceOf = p => L[p.voice_type] ? p.voice_type : "witty";
    function bank(c, key) {
        const v = L[voiceOf(c.persona)], s = L.shared, st = c.stage;
        const band = st === "curious" || st === "crush" ? "warm" : "cold";
        for (const b of [v, s]) for (const k of [`${key}@${st}`, `${key}@${band}`, key]) if (b && b[k] && b[k].length) return b[k];
        return null;
    }
    function moodBank(c, grp, intent) {
        const v = (L[voiceOf(c.persona)].mood || {})[grp] || {}, s = L.shared.mood[grp] || {};
        return v[intent] || s[intent] || v.any || s.any;
    }
    // a line from the pool she hasn't used lately, that can be filled
    function pick(c, pool, extra) {
        if (!pool || !pool.length) return null;
        const filled = c.r.shuffle(pool).map(l => [l, fill(c, l, extra)]).filter(([, f]) => f);
        if (!filled.length) return null;
        const fresh = filled.filter(([l]) => !c.st.recent.includes(l));
        const [line, text] = (fresh.length ? fresh : filled)[0];
        c.st.recent.unshift(line);
        return text;
    }
    const say = (c, key, extra) => pick(c, bank(c, key), extra);

    // ---------- what she's doing right now (wyd) ----------
    function doing(c) {
        const p = c.persona, t = SL.util.now(), part = daypart(p), r = c.r;
        const live = SL.stories.active(p.id, t).filter(s => t - s.posted_at < 4 * 3600);
        if (live.length && r.random() < 0.5) return r.choice(live).text;
        const windows = { morning: ["morning"], afternoon: ["afternoon"], evening: ["evening"], night: ["night"] };
        const pool = SL.stories.pool(p.id).filter(s => windows[part].includes(s.when) || (s.when === "any" && part !== "night"));
        if (pool.length && r.random() < 0.45) return r.choice(pool).text;
        return pick(c, bank(c, `doing_${part}`)) || "Not much";
    }

    // ---------- reflecting his sentence ----------
    const SWAP = { my: "your", me: "you", i: "you", "i'm": "you're", im: "you're", myself: "yourself", mine: "yours", our: "your", we: "you" };
    const swap = s => s.split(/\s+/).map(w => SWAP[w.toLowerCase()] || w).join(" ").replace(/[.!?,;]+$/, "").trim();
    function reflect(c, raw) {
        const s = lower(raw).trim();
        let m;
        if ((m = s.match(/\bi (?:just |finally |also |really )?(went to|watched|ate|saw|played|bought|made|cooked|finished|started|got|visited|met|tried|read|passed|won|lost|failed|baked|drew|painted|ran|walked|wrote) ([^.!?,]{2,40})/)))
            return say(c, "reflect_past", { x: swap(`${m[1]} ${m[2]}`) });
        if ((m = s.match(/\bi(?:'m| am|m) (?:going to|gonna|planning to|about to|thinking of|thinking about) ([^.!?,]{2,40})/)))
            return say(c, "reflect_future", { x: swap(`going to ${m[1].replace(/^going to /, "")}`) });
        if ((m = s.match(/\bi(?:'m| am|m) (?!going|gonna|doing|feeling|thinking|kidding|joking|sorry|getting)(\w+ing\b[^.!?,]{0,30})/)))
            return say(c, "reflect_now", { x: swap(m[1]) });
        return null;
    }

    // ---------- she talks about herself ----------
    const WANTS = {
        ask_music: SL.dialog.TOPICS.find(t => t.id === "music").tastes,
        ask_food: SL.dialog.TOPICS.find(t => t.id === "food").tastes.concat(SL.dialog.TOPICS.find(t => t.id === "coffee").tastes),
        ask_movie: SL.dialog.TOPICS.find(t => t.id === "movies").tastes,
    };
    // whole words only: "film photography" is not "rap"
    const hasWord = (text, w) => new RegExp(`(?<![\\p{L}])${esc(w)}(?![\\p{L}])`, "iu").test(text);
    function fromLikes(c, intent) {
        const words = WANTS[intent] || [];
        const items = [...(c.persona.likes || []), ...(c.persona.hobbies || [])].filter(l => words.some(w => hasWord(l, w)));
        return items.length ? c.r.choice(items) : null;
    }
    const ABOUT_LIKE = ["{x}, always", "Honestly? {x}", "I'm really into {x} lately", "{x}. Don't judge"];
    function personal(c, intent) {
        const p = c.persona, ab = SL.chars.about(p.id);
        switch (intent) {
            case "ask_pet": return has(ab.pet) ? say(c, "ask_pet") : say(c, "ask_pet_none");
            case "ask_music": case "ask_food": case "ask_movie": {
                const x = fromLikes(c, intent);
                return x ? pick(c, ABOUT_LIKE, { x }) : say(c, intent);
            }
            case "ask_about": {
                const order = SL.attraction.STAGES, allowed = order.slice(0, order.indexOf(c.stage) + 1);
                const fresh = SL.chars.backstory(p.id).filter(b => allowed.includes(b.share) && b.me && !c.st.shared.includes(b.title));
                if (!fresh.length) return say(c, "ask_about_done");
                const b = fresh[0];
                c.st.shared.push(b.title);
                c.trace.push(`shared a part of her story: "${b.title}" (${b.share})`);
                // her story in texting-sized pieces: a sentence each, long ones cut at a comma or semicolon
                const pieces = [];
                b.me.split(/(?<=[.!?])\s+/).slice(0, 2).forEach(s => {
                    if (s.length <= 90) { pieces.push(s); return; }
                    const cut = s.slice(30, -20).search(/[,;:]\s/);
                    if (cut < 0) { pieces.push(s); return; }
                    pieces.push(s.slice(0, cut + 30), s.slice(cut + 32));
                });
                return (say(c, "ask_about_intro") || "") + "|" + pieces.join("|");
            }
            default: return say(c, intent);
        }
    }
    // "do you like coffee?" -> her likes / dislikes
    function likesAnswer(c, raw) {
        const text = lower(raw);
        if (!/\b(?:do|are|r)\s+(?:you|u)\b/.test(text) && !/\byou like\b/.test(text)) return null;
        const words = (text.match(/[a-zà-ÿ]{4,}/g) || []).filter(w => !["like", "love", "enjoy", "into", "about", "what", "your", "have", "watch", "listen", "play", "really"].includes(w));
        const find = list => (list || []).find(item => words.some(w => hasWord(item, w) || hasWord(item, w.replace(/s$/, ""))));
        const yes = find(c.persona.likes) || find(c.persona.hobbies), no = find(c.persona.dislikes);
        if (yes) return pick(c, ["Yes! I love {x}", "{x}? Always", "Yes, {x} is my thing", "Do I? {x} is literally my favorite"], { x: yes });
        if (no) return pick(c, ["Not really, I'm not into {x}", "{x}? Not my thing, sorry", "Honestly? No haha"], { x: no });
        return null;
    }

    // ---------- the reply ----------
    const PERSONAL = ["ask_name", "ask_age", "ask_city", "ask_job", "ask_pet", "ask_family", "ask_hobby", "ask_music", "ask_food", "ask_movie",
                      "ask_weekend", "ask_about", "ask_day", "wyd", "ask_bot"];
    const ASK_BACK = { ask_name: "name", ask_age: "age", ask_city: "city", ask_job: "job" };
    const CASUAL = ["fallback", "agree", "answer_good", "laugh", "question", "disagree"];
    const NO_ASK = ["bye", "night", "insult", "creepy", "kiss", "hug", "ask_about"];  // (a shared story is enough for one reply)
    const MOOD_GROUP = { irritated: "neg", sad: "sad", tired: "low", drained: "low" };
    const ASK_MULT = { excited: 1.3, content: 1.0, neutral: 1.0, sad: 0.5, tired: 0.35, drained: 0.25, irritated: 0.1 };

    // Is his message an answer to her question qid? A keyword hit always counts; otherwise only a plain
    // statement does ("i had a bad day" or a question of his own is not an answer to "coffee or tea?")
    function answerTo(qid, raw, intent, dry) {
        const Q = D.QUESTIONS.find(q => q.id === qid);
        if (!Q || ["greet", "insult", "creepy", "bye", "night"].includes(intent) || PERSONAL.includes(intent)) return null;
        const fx = " " + clean(raw) + " ";
        const a = (Q.answers || []).find(a2 => a2.m.some(w => fx.includes(" " + w + " ")));
        if (a) return { Q, a };
        // a short plain answer ("hmm both i guess"); a long new sentence is its own topic
        const words = clean(raw).split(" ").length;
        if (!dry && words <= 4 && !/^(?:i|i'm|im|my|we)\b/i.test(raw.trim()) && ["fallback", "agree", "disagree"].includes(intent) && !isQuestion(raw))
            return { Q, a: null };
        return null;
    }

    function asksStreak(history) {
        let streak = 0, cur = null;
        const replies = [];
        history.forEach(m => { if (m.role === "saneme") cur = (cur ? cur + "\n" : "") + (m.text || ""); else if (cur !== null) { replies.push(cur); cur = null; } });
        if (cur !== null) replies.push(cur);
        for (const rep of replies.slice(-4).reverse()) { if (/\?|\b(?:wbu|hbu|wyd|and (?:you|u)|what about (?:you|u))\b/i.test(rep)) break; streak++; }
        return streak;
    }

    function respond(args) {
        const { profile, persona, history, pending, stage, media, r } = args;
        const pid = profile.id, cid = persona.id;
        const c = { profile, persona, stage, r, st: loadState(pid, cid), trace: [] };
        c.ctx = makeCtx(c);
        const texts = pending.map(m => m.text || "");
        const last = pending[pending.length - 1], lastMeta = last.meta || {};

        // 1) intent: the strongest of his messages
        let best = null, greeted = false;
        texts.forEach(t => { const d = detect(t); if (d.intent === "greet") greeted = true; if (!best || rank(d.intent) < rank(best.intent)) best = d; });
        const intent = best.intent;
        c.trace.push(`intent: ${intent}${best.word ? ` ("${best.word}")` : ""}`);

        // 2) what she learns about him + what she was waiting for
        const expect = c.st.expect;
        c.st.expect = null;
        // a bare "Izmir" after "where are you from?" is his city - but "i missed you" is not
        const plain = ["fallback", "agree", "answer_good"].includes(intent);
        const newFacts = SL.memory.learn(pid, cid, texts, expect && !expect.q && plain ? expect.type : null);
        if (newFacts.length) c.trace.push("learned: " + newFacts.map(f => f.text).join("; "));

        // 3) mood: his message moves her a little; every message costs some social battery
        const e = (persona.big_five || {}).extraversion ?? 0.5, eff = D.EFFECTS[intent] || {};
        SL.mood.nudge(persona, { valence: eff.valence || 0, arousal: eff.arousal || 0, energy: -0.003 * pending.length,
                                 social_battery: -(0.012 + (1 - e) * 0.02) * pending.length });
        const moodState = SL.mood.current(persona), mods = SL.mood.styleModifiers(moodState), grp = MOOD_GROUP[mods.label] || "good";
        c.trace.push(`mood: ${mods.label}`);

        const out = [];  // lines; "|" splits bubbles
        const add = l => { if (l) out.push(l); };
        const finish = (flags = {}) => {
            saveState(pid, cid, c.st);
            const lines = out.join("|").split("|").map(s => s.trim()).filter(Boolean);
            return { lines, mods, mood: moodState, intent, trace: c.trace, topic: flags.topic || null, leave: !!flags.leave,
                     asked: lines.some(l => l.includes("?")), photo_caption: !!flags.photo };
        };

        // her social battery is empty: she wraps up
        if (moodState.values.social_battery < 0.1 && !["insult", "creepy"].includes(intent)) {
            add(say(c, "leave"));
            c.trace.push("social battery empty: she leaves the chat");
            return finish({ leave: true });
        }

        // the topic on her mind
        const raw = texts.join(" ");
        let topic = c.st.topic && SL.util.now() - (c.st.topic.ts || 0) < 30 * 60 ? c.st.topic : null;
        let tp = topicOf(raw, topic && topic.id);
        const f = forms(raw);
        if (!tp && topic && TONES.close.some(p => hit(p, f, raw))) { topic = null; c.trace.push("topic closed"); }
        const dry = SL.attraction.DRY.has(clean(raw)) || clean(raw).length <= 3;
        // a short statement with no topic of its own still belongs to the topic ("it was so bad"); a question,
        // "i'm sad" or a long new sentence doesn't
        if (!tp && topic && !dry && intent === "fallback" && clean(raw).split(" ").length <= 8) {
            const t = D.TOPICS.find(x => x.id === topic.id);
            if (t) tp = { id: t.id, topic: t, word: topic.word, inherited: true };
        }
        if (tp) {
            const same = topic && topic.id === tp.id;
            c.st.topic = { id: tp.id, word: tp.word, streak: same ? topic.streak + 1 : 1, ts: SL.util.now() };
            tp.tone = toneOf(raw, intent);
            tp.streak = c.st.topic.streak;
            c.trace.push(`topic: ${tp.id}${tp.inherited ? " (still)" : ""}, tone ${tp.tone}`);
        } else if (topic) {
            c.st.topic = (topic.idle || 0) < 2 ? { ...topic, idle: (topic.idle || 0) + 1 } : null;
        }
        const topicLine = () => {
            if (!tp) return null;
            const Lt = tp.topic.lines || {}, neutral = tp.tone === "any" || tp.tone === "ask";
            if (neutral && Lt.cont && tp.streak >= 2 && r.random() < 0.45) return pick(c, Lt.cont);
            if (tp.inherited && neutral) return null;
            let taste = null;
            if (neutral && r.random() < 0.65) {
                const T = TOPICS.find(x => x.t.id === tp.id);
                const likesIt = list => (list || []).some(item => { const fi = forms(item); return T.tastes.some(p => hit(p, fi, item)); });
                taste = likesIt(persona.likes) || likesIt(persona.hobbies) ? "love" : likesIt(persona.dislikes) ? "meh" : null;
            }
            const pool = taste ? (Lt[taste] || D.TOPIC_SHARED[taste]) : Lt[tp.tone] || (tp.tone === "ask" ? Lt.any : null);
            if (taste) c.trace.push(`her taste: ${taste}`);
            return pick(c, pool, { x: tp.word });
        };

        const repeated = (() => {
            const earlier = history.filter(m => m.role === "user" && m.id < pending[0].id).slice(-30).map(m => lower(m.text || "").trim());
            return texts.some(t => lower(t).trim().length > 6 && earlier.includes(lower(t).trim()));
        })();
        const localH = SL.util.local(persona.timezone || "UTC").h;

        // 4) the main line
        if (intent === "creepy" || (media && media.refuse && media.why === "creepy photo request")) {
            add(say(c, "creepy"));
        } else if (intent === "insult") {
            add(say(c, "insult"));
        } else if (media && media.refuse) {
            add(say(c, "photo_refuse"));
        } else if (media && media.send && media.asked) {
            add(say(c, "photo_send"));  // he asked: the photo is the answer
            c.trace.push("caption for the photo he asked for");
        } else if (lastMeta.sticker) {
            add(say(c, `sticker_${lastMeta.sticker.id}`) || say(c, "fallback"));
        } else if (lastMeta.shared) {
            add(say(c, lastMeta.shared.own ? "shared_own" : "shared_post"));
            if (texts[texts.length - 1].trim()) { const d = detect(texts[texts.length - 1]); if (d.intent === "question") add(say(c, "question")); }
        } else if (lastMeta.story) {
            const t = clean(last.text || "");
            add(say(c, !t || /^(?:❤️|❤|😍|🔥|😂)+$/u.test((last.text || "").trim()) ? "story_heart" : "story_reply"));
        } else if (lastMeta.note) {
            add(say(c, "note_reply"));
        } else if (repeated && r.random() < 0.7) {
            add(say(c, "repeat"));
        } else if (expect && expect.q && answerTo(expect.q, raw, intent, dry)) {
            // his answer to the question she asked ("coffee or tea?" -> "tea" -> "a tea person, interesting")
            const { Q, a } = answerTo(expect.q, raw, intent, dry);
            add(pick(c, a ? a.r : Q.any));
            c.trace.push(`reacted to his answer to "${Q.id}"`);
        } else if (grp !== "good" && !PERSONAL.includes(intent)) {
            add(pick(c, moodBank(c, grp, intent)));
            if (intent === "how_are_you" && moodState.cause && (stage === "curious" || stage === "crush")) add(say(c, "cause", { x: moodState.cause }));
            c.trace.push(`mood bank: ${grp}`);
        } else if (PERSONAL.includes(intent)) {
            add(personal(c, intent));
            // ask the same thing back, if she doesn't know it about him yet
            const type = ASK_BACK[intent];
            if (type && !SL.memory.one(pid, cid, type) && r.random() < 0.6) { add(say(c, "ask_back")); c.st.expect = { type }; }
        } else if (intent === "ask_memory") {
            const facts = SL.memory.all(pid, cid).filter(x => x.type !== "event");
            if (!facts.length) add(say(c, "ask_memory_none"));
            else {
                add(say(c, "ask_memory"));
                const bits = r.shuffle(facts).slice(0, 3).map(x => x.text.replace(/^His\b/, "your").replace(/^He's\b/, "you're").replace(/^He\b/, "you")
                    .replace(/\bHe lives in \/ is from\b/, "you live in").replace(/^you lives in \/ is from/, "you're from").replace(/\bdoesn't\b/, "don't")
                    .replace(/^you (likes|has|studies)\b/, (m0, v) => "you " + { likes: "like", has: "have", studies: "study" }[v]));
                add(bits.join(", "));
            }
        } else {
            const ex = exampleFor(c, texts[texts.length - 1], intent);
            if (ex) { add(ex); }
            else if (intent === "greet") {
                const again = SL.util.now() - (c.st.greeted_at || 0) < 2 * 3600 && history.some(m => m.role === "saneme");
                add(again ? say(c, "greet_again") : localH >= 0 && localH < 5 ? say(c, "greet_late") : localH >= 5 && localH < 11 && r.random() < 0.5 ? say(c, "greet_morning") : say(c, "greet"));
                c.st.greeted_at = SL.util.now();
                const tl = topicLine();
                if (tl) add(tl);
            } else {
                const likeAns = intent === "question" ? likesAnswer(c, texts[texts.length - 1]) : null;
                const tl = likeAns ? null : topicLine();
                // good / bad news with no topic of its own: "i had a great day!" -> "yay, what happened?"
                const tone = intent === "fallback" && !tl ? toneOf(raw, intent) : null;
                const news = tone === "good" ? say(c, "news_good") : tone === "bad" ? say(c, "answer_bad") : null;
                if (news) c.trace.push(`his news: ${tone}`);
                let line = likeAns || news || (["fallback", "question", "answer_good", "answer_bad", "agree", "disagree", "laugh"].includes(intent) && tl ? tl : say(c, intent) || say(c, "fallback"));
                if (tl && !["fallback", "question", "answer_good", "answer_bad", "agree", "disagree", "laugh"].includes(intent)) line += "|" + tl;
                const rf = !repeated && ["fallback", "answer_good", "answer_bad", "agree", "laugh"].includes(intent) ? reflect(c, texts[texts.length - 1]) : null;
                if (rf) { c.trace.push("reflected his sentence"); line = intent === "fallback" && !tl ? (r.random() < 0.85 ? rf : line) : r.random() < 0.55 ? rf + "|" + line : line; }
                if (greeted && !["greet"].includes(intent)) line = (say(c, "greet") || "").split("|")[0] + "|" + line;
                add(line);
            }
        }

        // 5) reacting to what she just learned
        if (newFacts.length && !["insult", "creepy"].includes(intent) && grp === "good" && !repeated) {
            const fct = newFacts[0];
            let reaction = null;
            if (fct.type === "city") reaction = lower(fct.value) === lower(persona.city || "") ? say(c, "react_city_same", { x: fct.value }) : say(c, "react_city", { x: fct.value });
            else if (fct.type === "job") reaction = /^working at/.test(fct.value) ? say(c, "react_job_at") : say(c, "react_job", { x: fct.value });
            else if (fct.type === "pet") reaction = fct.name ? say(c, "react_pet_named", { x: fct.name }) : say(c, "react_pet", { x: fct.value });
            else if (fct.type === "like") {
                const mine = [...(persona.likes || []), ...(persona.hobbies || [])].some(l => lower(l).includes(fct.value.split(" ")[0]));
                reaction = say(c, mine ? "react_like_shared" : "react_like", { x: fct.value.replace(/\s*\(.*\)$/, "") });
            } else if (fct.type === "dislike") reaction = say(c, "react_dislike", { x: fct.value });
            else if (fct.type === "event") reaction = say(c, "react_event", { x: fct.value });
            else reaction = say(c, `react_${fct.type}`, { x: fct.value });
            if (reaction) {
                if (CASUAL.includes(intent) || intent === "answer_bad") { out.length = 0; add(reaction); }
                else if (intent === "greet") out.push(reaction);
                else out.unshift(reaction);
                c.trace.push(`reacted to a new fact (${fct.type})`);
            }
        }

        const good = grp === "good" && !["insult", "creepy"].includes(intent);
        // 6) remembering: on a greeting she asks how his event went, or brings up something he told her
        if (good && ["greet", "how_are_you", "morning", "ask_day"].includes(intent)) {
            const fu = SL.memory.followup(pid, cid);
            if (fu) { add(say(c, "followup_event", { x: fu.value })); SL.memory.markAsked(pid, cid, fu.id); c.trace.push(`followed up on his ${fu.value}`); }
            else if (r.random() < 0.35) {
                const cb = SL.memory.callbackFact(pid, cid, r);
                const line = cb && say(c, `callback_${cb.type}`, { x: cb.type === "pet" ? (cb.name || cb.value) : cb.value });
                if (line) { add(line); c.trace.push(`brought up: ${cb.text}`); }
            }
        }
        // 7) a sweet extra when she's into him
        let sweet = false;
        if (good && (stage === "curious" || stage === "crush") && !NO_ASK.includes(intent) && !repeated && r.random() < (stage === "crush" ? 0.18 : 0.08)) {
            const l = say(c, "sweet");
            if (l) { add(l); sweet = true; c.trace.push("sweet line"); }
        }
        // 8) a question back, to keep it going (more likely the longer she hasn't asked anything)
        const joined = out.join(" ");
        if (good && !sweet && !NO_ASK.includes(intent) && !joined.includes("?") && !c.st.expect) {
            const base = 0.4 + 0.4 * (e - 0.5), streak = asksStreak(history);
            const p = Math.max(0.03, Math.min(0.92, (base + 0.2 * streak) * (ASK_MULT[mods.label] ?? 1)));
            if (r.random() < p) {
                const missing = ["name", "city", "job", "age"].find(tpe => !SL.memory.one(pid, cid, tpe) && !(tpe === "name" && profile.name) && !c.st.asked_q.includes("him:" + tpe));
                if (missing && r.random() < 0.6) {
                    add(pick(c, D.ASK_HIM[missing]));
                    c.st.expect = { type: missing };
                    c.st.asked_q.push("him:" + missing);
                } else {
                    const qs = D.QUESTIONS.filter(q => !c.st.asked_q.includes(q.id));
                    if (qs.length) { const q = r.choice(qs); add(pick(c, q.q)); c.st.expect = { q: q.id }; c.st.asked_q.push(q.id); }
                }
                c.trace.push(`asked him something (p ${p.toFixed(2)}, ${streak} replies without a question)`);
            }
        }
        if (!out.length) add(say(c, "fallback"));
        // a photo out of the blue gets its own little caption before her answer
        if (media && media.send && !media.asked) { out.unshift(say(c, media.why.startsWith("he asked what") ? "photo_wyd" : "photo_spont")); c.trace.push("caption for a photo she sent on her own"); }
        return finish({ topic: tp && tp.id, photo: media && media.send });
    }

    // her own example lines from persona.examples: used when his message is close to the example's
    const EX_STOP = new Set(["you", "your", "you're", "youre", "are", "the", "and", "what", "haha", "lol", "really", "just", "that", "this", "with", "have", "too", "so"]);
    function exampleFor(c, raw, intent) {
        const ex = c.persona.examples || [];
        const words = s => new Set((clean(s).match(/[\p{L}']{3,}/gu) || []).filter(w => !EX_STOP.has(w)));
        const mine = words(raw);
        let best = null;
        ex.forEach((e2, i) => {
            if (c.st.used_ex.includes(i)) return;
            const theirs = words(e2.him), inter = [...mine].filter(w => theirs.has(w)).length;
            const sim = inter / Math.max(1, new Set([...mine, ...theirs]).size);
            const sameIntent = intent !== "fallback" && intent !== "question" && detect(e2.him).intent === intent;
            const score = sim + (sameIntent ? 0.25 : 0);
            // close in words (not just the same kind of message): "you're so pretty" is not "haha you're funny"
            if (((sim >= 0.4 && score >= 0.6) || sim >= 0.7) && (!best || score > best.score)) best = { i, score, e: e2 };
        });
        if (!best || c.r.random() > Math.min(0.9, best.score)) return null;
        c.st.used_ex.push(best.i);
        c.trace.push(`her own example line (match ${best.score.toFixed(2)})`);
        return best.e.her.join("|");
    }

    // ---------- first move, comments ----------
    function opener(profile, persona, stage, r) {
        const c = { profile, persona, stage, r, st: loadState(profile.id, persona.id), trace: [] };
        c.ctx = makeCtx(c);
        const out = [];
        const roll = r.random();
        if (c.ctx.cardbit && roll < 0.3) out.push(say(c, "opener_card"));      // something on his card
        else if (roll < 0.5) out.push(say(c, "opener_like"));                  // one of her own things
        if (!out[0]) out.push(say(c, "opener"));
        if (r.random() < 0.5 && !out.join(" ").includes("?")) {
            const q = r.choice(D.QUESTIONS);
            out.push(pick(c, q.q));
            c.st.expect = { q: q.id };
            c.st.asked_q.push(q.id);
        }
        saveState(profile.id, persona.id, c.st);
        return out.filter(Boolean).join("|").split("|");
    }
    function commentReply(profile, persona, post, comment, stage, r) {
        const c = { profile, persona, stage, r, st: loadState(profile.id, persona.id), trace: [] };
        c.ctx = makeCtx(c);
        const d = detect(comment), text = lower(comment);
        let line;
        if (d.intent === "insult" || d.intent === "creepy") line = say(c, "comment_rude");
        else if (d.intent === "compliment" || /\b(?:cute|pretty|beautiful|gorgeous|stunning|lovely|wow|queen|perfect)\b|😍|🔥|❤️|🥰/.test(text)) line = say(c, "comment_compliment");
        else if (/\bwhere\b/.test(text) && post.location) line = say(c, "comment_where", { x: post.location });
        else if (isQuestion(comment)) line = say(c, "comment_question");
        else line = say(c, "comment_generic");
        saveState(profile.id, persona.id, c.st);
        return (line || "Thank you").split("|")[0];
    }
    const deletedLine = (profile, persona, stage, r) => {
        const c = { profile, persona, stage, r, st: loadState(profile.id, persona.id), trace: [] };
        c.ctx = makeCtx(c);
        return say(c, "deleted");
    };

    return { respond, opener, commentReply, deletedLine, detect };
})();
