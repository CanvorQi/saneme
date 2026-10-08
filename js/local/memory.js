// js/local/memory.js - What she knows about you (the web version's stand-in for backend/memory.py).
// No model to read the chat, so facts come from patterns in your messages (like Amor):
//     "my name is Alex", "i'm 25", "i live in Izmir", "i work as an engineer", "i study law",
//     "i have a cat named Luna", "i love football", "i hate mornings", "i have an exam tomorrow"
// She reacts when she learns something, brings it up again later ("how's Luna?"), and asks how
// an event went once its time has passed ("how did the exam go?"). "Do you remember me?" -> summary.
window.SL = window.SL || {};

SL.memory = (() => {
    const W = "[a-zà-ÿ'][a-zà-ÿ' -]";
    const END = "(?=[.,!?;:)]|\\s+(?:and|but|so|too|tbh|lol|haha|rn|now|right now|a lot|though|tho|because|bc|since|for|with)\\b|$)";
    const NOT_OBJ = /^(?:you|u|it|that|this|her|him|them|that|to|the way|when|how|being|your|ur)\b/i;
    const JOBS = "engineer|developer|designer|teacher|nurse|doctor|student|lawyer|chef|cook|barista|artist|photographer|manager|accountant|programmer|mechanic|pilot|driver|architect|writer|musician|dj|police officer|soldier|firefighter|consultant|analyst|marketer|salesman|cashier|waiter|bartender|electrician|plumber|builder|trainer|coach|dentist|pharmacist|vet|researcher|scientist|freelancer|entrepreneur|software engineer|web developer|game developer|graphic designer|data scientist|personal trainer|real estate agent|journalist|editor|translator|banker|economist|surgeon|paramedic|carpenter|farmer|fisherman|model|actor|singer|producer|streamer|youtuber|athlete|footballer|intern";
    const PETS = "cat|dog|puppy|kitten|hamster|bird|parrot|rabbit|bunny|fish|turtle|tortoise|snake|gecko|lizard|horse";
    const EVENTS = "exam|test|interview|date|game|match|meeting|presentation|appointment|surgery|flight|concert|party|shift|deadline|class|lecture|trip|wedding|birthday|audition|competition|race|finals?|job interview|driving test";
    const WHEN = "today|tonight|tomorrow|this weekend|next week|on (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this (?:monday|tuesday|wednesday|thursday|friday|saturday|sunday)";
    const cap = s => s.replace(/\b\p{L}/gu, c => c.toUpperCase());
    const tidy = s => s.trim().replace(/\s+/g, " ").replace(/^(?:a|an|the)\s+/i, "").replace(/\s+(?:lol|haha|tbh)$/i, "");

    // when an event is "over" and can be asked about, from his own clock (the browser's)
    function dueOf(when, t) {
        const d = new Date(t * 1000);
        const at = (days, hour) => { const x = new Date(d); x.setDate(x.getDate() + days); x.setHours(hour, 0, 0, 0); return x.getTime() / 1000; };
        const w = (when || "").toLowerCase();
        if (w === "today") return Math.max(t + 3 * 3600, at(0, 19));
        if (w === "tonight") return at(1, 9);
        if (w === "tomorrow") return at(1, 19);
        if (w.includes("weekend")) { const add = (6 - d.getDay() + 7) % 7 || 7; return at(add + 1, 19); }
        if (w === "next week") return at(8, 19);
        const days = ["sunday", "monday", "tuesday", "wednesday", "thursday", "friday", "saturday"];
        const k = days.findIndex(x => w.includes(x));
        if (k >= 0) { const add = (k - d.getDay() + 7) % 7 || 7; return at(add, 19); }
        return at(1, 19);
    }

    // one message -> facts [{type, value, text, ...}]
    function extract(raw, t, expect) {
        const s = " " + raw.replace(/[’]/g, "'") + " ";
        const out = [], m = (re) => s.match(re);
        let x;
        const NOT_NAME = /^(?:tired|good|fine|great|okay|ok|bored|sad|happy|here|back|home|sorry|busy|alone|single|hungry|sick|ready|done|free|sure|serious|kidding|joking|lost|late|new|old|cold|hot|drunk|high|broke|scared|nervous|excited|awake|up|down|out|in|off|on|so|very|not|just|really|also|still|from|at|into|gonna|well|alright|cool|bad|sleepy|exhausted|confused|curious|shy|interested|glad|lucky|jealous|dead|fat|tall|short|single|taken|straight|gay|human|real|a|an|the|bot|ai|fine|chill|chilling|good|great|amazing|awesome|perfect|bored|sure|sorry)$/i;
        let nm;
        if ((x = m(/\b(?:my name is|my name's|call me|i'm called|i am called|name's)\s+([A-Za-zÀ-ÿ]{2,15})\b/i))) out.push({ type: "name", value: cap(x[1].toLowerCase()) });
        // "i'm alex" / "hey, it's alex" on its own (not "i'm tired")
        else if ((nm = raw.trim().match(/^(?:hi|hey|hello|yo)?[\s,!.]*(?:i'm|im|i am|it's|its|this is)\s+([A-Za-zÀ-ÿ]{2,15})(?:\s+(?:btw|by the way|lol|haha|here|:\)|nice to meet you))?[\s.!]*$/i))
                 && !NOT_NAME.test(nm[1]) && !/(?:ing|ed|ly)$/i.test(nm[1])) out.push({ type: "name", value: cap(nm[1].toLowerCase()) });
        else if (expect === "name") {
            const w = raw.trim().replace(/[.!]+$/, "").split(/\s+/);
            const cand = w.length <= 3 ? w[w.length - 1] : null;
            if (cand && /^\p{L}{2,15}$/u.test(cand) && !/^(?:hi|hey|hello|yes|no|lol|haha|ok)$/i.test(cand)) out.push({ type: "name", value: cap(cand.toLowerCase()) });
        }
        if ((x = m(/\b(?:i'm|i am|im)\s+(1[89]|[2-6]\d)\b(?!\s*(?:min|minutes|hours?|km|%|percent|kg|cm|mins|days?|times?|euros?|dollars?|\$|k\b))/i))
            || (x = m(/\b(1[89]|[2-6]\d)\s*(?:years old|yo|y\/o|yrs old)\b/i))
            || (expect === "age" && (x = raw.match(/^\D{0,10}(1[89]|[2-6]\d)\D{0,12}$/)))) out.push({ type: "age", value: +x[1] });
        if ((x = m(new RegExp(`\\b(?:i live in|i'm from|im from|i am from|i'm based in|living in|i moved to|i grew up in|born in)\\s+(${W}{1,28}?)${END}`, "i")))
            || (x = s.match(/\b(?:i'm in|im in)\s+([A-Z][\wà-ÿ' -]{1,25}?)(?=[.,!?]|\s+(?:and|but|now|rn|right|for|with)\b|\s*$)/))
            || (expect === "city" && raw.trim().split(/\s+/).length <= 3 && (x = [null, raw.trim().replace(/[.!?]+$/, "").replace(/^(?:in|from)\s+/i, "")])))
            if (x[1] && !/^(?:bed|class|work|the|a|my|love|trouble|pain|town|here|there|home)\b/i.test(x[1])
                && !/\b(?:i|you|u|me|my|we|it|is|was|am|are|do|don't|lol|haha|yes|no)\b/i.test(x[1])) out.push({ type: "city", value: cap(tidy(x[1])) });
        if ((x = m(new RegExp(`\\bi(?:'m| am|m)\\s+(?:an?\\s+)?((?:[a-z-]+\\s+){0,2}(?:${JOBS}))\\b`, "i")))
            || (x = m(/\b(?:i work as|i'm working as|working as|my job is)\s+(?:an?\s+)?([a-z][a-z -]{2,30}?)(?=[.,!?]|\s+(?:at|in|for|and|but)\b|\s*$)/i)))
            out.push({ type: "job", value: tidy(x[1]).toLowerCase() });
        else if ((x = m(/\bi work (?:at|in|for)\s+(?:an?\s+|the\s+)?([a-z][\wà-ÿ' -]{2,30}?)(?=[.,!?]|\s+(?:and|but|as|now)\b|\s*$)/i)))
            out.push({ type: "job", value: "working at " + tidy(x[1]) });
        if ((x = m(/\bi(?:'m| am|m)?\s+(?:currently\s+)?(?:study|studying|majoring in|doing a degree in)\s+([a-z][a-z ]{2,30}?)(?=[.,!?]|\s+(?:at|in|and|but)\b|\s*$)/i)))
            out.push({ type: "study", value: tidy(x[1]).toLowerCase() });
        if ((x = m(new RegExp(`\\bi (?:have|got|own) (?:an?|two|2|three|3) (${PETS})s?\\b(?:\\s+(?:named|called)\\s+([A-Za-z]{2,15}))?`, "i")))
            || (x = m(new RegExp(`\\bmy (${PETS})(?:'s name is| is called| named| called|,)?\\s+([A-Z][a-z]{1,14})\\b`))))
            out.push({ type: "pet", value: x[1].toLowerCase(), name: x[2] ? cap(x[2].toLowerCase()) : null });
        for (const re of [new RegExp(`\\bi (?:really |also |just |kinda |absolutely )?(?:love|like|enjoy|adore)\\s+(${W}{2,30}?)${END}`, "gi"),
                          new RegExp(`\\bi'?m (?:really |so |kinda )?(?:into|obsessed with)\\s+(${W}{2,30}?)${END}`, "gi")]) {
            for (const mm of s.matchAll(re)) if (!NOT_OBJ.test(mm[1])) out.push({ type: "like", value: tidy(mm[1]).toLowerCase() });
        }
        if ((x = m(/\bmy fav(?:ou?rite)?\s+([a-z]+)\s+is\s+([\wà-ÿ' -]{2,30}?)(?=[.,!?]|\s+(?:and|but|lol)\b|\s*$)/i)))
            out.push({ type: "like", value: `${tidy(x[2])} (favorite ${x[1].toLowerCase()})` });
        if ((x = m(new RegExp(`\\bi (?:hate|can't stand|cant stand|don't like|dont like|do not like|really don't like)\\s+(${W}{2,30}?)${END}`, "i"))) && !NOT_OBJ.test(x[1]))
            out.push({ type: "dislike", value: tidy(x[1]).toLowerCase() });
        if ((x = m(new RegExp(`\\b(?:i have|i've got|ive got|i got|there's|i've)\\s+(?:an?\\s+|my\\s+|a big\\s+|this\\s+)?(${EVENTS})\\b[^.?!]{0,30}?\\b(${WHEN})\\b`, "i")))
            || (x = m(new RegExp(`\\b(${WHEN})\\b[^.?!]{0,12}?\\bi (?:have|got)\\s+(?:an?\\s+|my\\s+)?(${EVENTS})\\b`, "i")))) {
            const ev = new RegExp(`^(?:${EVENTS})$`, "i").test(x[1]) ? x[1] : x[2], when = ev === x[1] ? x[2] : x[1];
            out.push({ type: "event", value: ev.toLowerCase(), when: when.toLowerCase(), due: dueOf(when, t) });
        }
        return out;
    }

    const TEXT = {
        name: f => `His name is ${f.value}`, age: f => `He's ${f.value}`, city: f => `He lives in / is from ${f.value}`,
        job: f => `He's ${/^working at/.test(f.value) ? f.value : "a " + f.value}`, study: f => `He studies ${f.value}`,
        pet: f => `He has a ${f.value}${f.name ? " called " + f.name : ""}`, like: f => `He likes ${f.value}`,
        dislike: f => `He doesn't like ${f.value}`, event: f => `He has a ${f.value} (${f.when})`,
    };
    const SINGLE = ["name", "age", "city", "job", "study"];

    // learns from his pending messages; returns the facts that are new
    function learn(pid, cid, texts, expect) {
        const t = SL.util.now(), facts = SL.store.getFacts(pid, cid), fresh = [];
        let id = facts.reduce((a, f) => Math.max(a, f.id), 0);
        texts.forEach(raw => extract(raw, t, expect).forEach(f => {
            f.text = TEXT[f.type](f);
            const same = facts.find(o => o.type === f.type && (SINGLE.includes(f.type) || o.value === f.value));
            if (same) {
                if (same.value !== f.value || (f.type === "event")) { Object.assign(same, f, { updated_at: t, asked: false }); fresh.push(same); }
                else same.updated_at = t;
            } else {
                const nf = { id: ++id, source: "auto", created_at: t, updated_at: t, ...f };
                facts.push(nf);
                fresh.push(nf);
            }
        }));
        SL.store.setFacts(pid, cid, facts);
        return fresh;
    }
    const all = (pid, cid) => SL.store.getFacts(pid, cid);
    const get = (pid, cid, type) => all(pid, cid).filter(f => f.type === type);
    const one = (pid, cid, type) => get(pid, cid, type).slice(-1)[0] || null;

    // an event whose time has passed and she hasn't asked about yet
    function followup(pid, cid) {
        const t = SL.util.now(), facts = all(pid, cid);
        const f = facts.find(x => x.type === "event" && !x.asked && x.due && t >= x.due && t - x.due < 4 * 86400);
        return f || null;
    }
    function markAsked(pid, cid, fid) {
        const facts = all(pid, cid), f = facts.find(x => x.id === fid);
        if (f) { f.asked = true; SL.store.setFacts(pid, cid, facts); }
    }
    // an older fact to bring back up ("how's Luna?") - not one from the last few minutes
    function callbackFact(pid, cid, r) {
        const t = SL.util.now();
        const old = all(pid, cid).filter(f => ["pet", "like", "city", "job", "study"].includes(f.type) && t - f.created_at > 20 * 60);
        return old.length ? r.choice(old) : null;
    }
    return { learn, all, get, one, followup, markAsked, callbackFact, extract };
})();
