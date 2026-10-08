// js/core.js - Helpers, visual effects, app state, API, theme, the profile form.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ---------------- Visual effects (ported from Gracie's fx helpers) ----------------
const fxOn = () => !document.documentElement.classList.contains("no-fx")
    && !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// emojis float up from the bottom of the screen
function fxBurst(emojis, count = 18) {
    if (!fxOn()) return;
    const layer = document.createElement("div");
    layer.className = "fx-layer";
    for (let i = 0; i < count; i++) {
        const p = document.createElement("span");
        p.className = "fx-particle";
        p.textContent = emojis[i % emojis.length];
        p.style.left = Math.random() * 100 + "%";
        p.style.fontSize = 16 + Math.random() * 18 + "px";
        p.style.animationDelay = Math.random() * 0.5 + "s";
        p.style.animationDuration = 1.6 + Math.random() * 1.2 + "s";
        layer.appendChild(p);
    }
    document.body.appendChild(layer);
    setTimeout(() => layer.remove(), 3500);
}
// a ring expanding from the middle of the screen + a soft flash
function fxRing() {
    if (!fxOn()) return;
    const wrap = document.createElement("div");
    wrap.className = "fx-ring-wrap";
    wrap.innerHTML = `<div class="fx-ring"></div>`;
    const flash = document.createElement("div");
    flash.className = "fx-flash";
    document.body.append(wrap, flash);
    setTimeout(() => { wrap.remove(); flash.remove(); }, 1100);
}
// material-style ripple on buttons
document.addEventListener("pointerdown", e => {
    const b = e.target.closest(".btn, .nav-btn, .icon-btn");
    if (!b || !fxOn()) return;
    const r = b.getBoundingClientRect(), size = Math.max(r.width, r.height);
    const s = document.createElement("span");
    s.className = "ripple";
    if (b.classList.contains("ghost") || b.classList.contains("icon-btn") || (b.classList.contains("nav-btn") && !b.classList.contains("active")))
        s.style.background = "rgba(253,56,128,.18)";
    s.style.cssText += `width:${size}px;height:${size}px;left:${e.clientX - r.left - size / 2}px;top:${e.clientY - r.top - size / 2}px`;
    b.appendChild(s);
    setTimeout(() => s.remove(), 550);
});
// Sideways strips (stories on Home, notes above the chats): ‹ › arrows page through them like on
// Instagram, and the mouse wheel scrolls them too. Markup: .st-scroller > arrow.prev, strip, arrow.next.
// The arrows keep themselves right when the strip is filled, shown or resized (observers below).
function makeScroller(box) {
    const strip = $(":scope > :not(.st-arrow)", box), prev = $(".st-arrow.prev", box), next = $(".st-arrow.next", box);
    const update = () => {
        prev.classList.toggle("hidden", strip.scrollLeft <= 2);
        next.classList.toggle("hidden", strip.scrollLeft + strip.clientWidth >= strip.scrollWidth - 2);
    };
    const page = dir => strip.scrollBy({ left: dir * Math.max(72, strip.clientWidth - 72), behavior: "smooth" });
    prev.addEventListener("click", () => page(-1));
    next.addEventListener("click", () => page(1));
    strip.addEventListener("scroll", update, { passive: true });
    strip.addEventListener("wheel", e => {
        if (Math.abs(e.deltaY) <= Math.abs(e.deltaX) || strip.scrollWidth <= strip.clientWidth) return;
        e.preventDefault(); strip.scrollLeft += e.deltaY;
    }, { passive: false });
    new ResizeObserver(update).observe(strip);
    new MutationObserver(update).observe(strip, { childList: true });
}
$$(".st-scroller").forEach(makeScroller);

function toast(msg) {
    const t = $("#toast");
    t.textContent = msg; t.classList.add("show");
    clearTimeout(t._h); t._h = setTimeout(() => t.classList.remove("show"), 2200);
}
// tab title badge when a message arrives while the tab is in the background
let unread = 0;
const baseTitle = document.title;
function bumpUnread() {
    if (!document.hidden) return;
    unread++;
    document.title = `(${unread}) ${baseTitle}`;
}
document.addEventListener("visibilitychange", () => { if (!document.hidden) { unread = 0; document.title = baseTitle; } });

function setFx(on) {
    document.documentElement.classList.toggle("no-fx", !on);
    try { localStorage.setItem("saneme_fx", on ? "1" : "0"); } catch (e) {}
    $("#fxSwitch").checked = on;
    if (on) fxBurst(["✨", "💗", "✨"], 10);
}
$("#fxSwitch").addEventListener("change", e => setFx(e.target.checked));

function startOnboardHearts() {
    const box = $("#onboardHearts");
    if (box.childElementCount) return;
    for (let i = 0; i < 14; i++) {
        const h = document.createElement("span");
        h.textContent = "♥";
        h.style.left = Math.random() * 100 + "%";
        h.style.fontSize = 12 + Math.random() * 22 + "px";
        h.style.animationDuration = 9 + Math.random() * 10 + "s";
        h.style.animationDelay = -Math.random() * 15 + "s";
        box.appendChild(h);
    }
}

function showMatch() {
    $("#matchYou").innerHTML = state.profile ? AV.svg(state.profile.appearance) : "?";
    // a fan of everyone you matched with, each photo popping in a beat after the last
    const people = state.characters || [];
    $("#matchFan").innerHTML = people.map((c, i) => `<img src="${esc(c.photo || "icon.png")}" alt="${esc(c.name)}" title="${esc(c.name)}"
        style="--i:${i};--n:${people.length};animation-delay:${0.25 + i * 0.07}s">`).join("");
    $("#matchSub").textContent = `You matched with ${people.length} people. Don't overthink the first message.`;
    const ov = $("#matchOverlay");
    ov.querySelectorAll(".match-particle").forEach(p => p.remove());
    if (fxOn()) {
        for (let i = 0; i < 22; i++) {
            const p = document.createElement("span");
            p.className = "match-particle";
            p.textContent = ["💗", "✨", "💕", "🌸"][i % 4];
            p.style.left = Math.random() * 100 + "%";
            p.style.animationDelay = Math.random() * 1.6 + "s";
            p.style.fontSize = 16 + Math.random() * 18 + "px";
            ov.appendChild(p);
        }
    }
    ov.classList.add("show");
    fxRing();
}
$("#matchGo").addEventListener("click", () => {
    $("#matchOverlay").classList.remove("show");
    showView("matches");
});

const state = { persona: null, profile: null, profiles: [], messages: [], debugOpen: false,
                cid: null, viewCid: null, characters: [], storyGroups: [] };
// Reply state is kept PER CHAT, so one character's "typing…" or pending reply never shows up
// in (or blocks) another character's chat.
const busyChats = new Set(), pendingChats = new Set(), typingChats = new Set();
const drafts = {};  // cid -> text typed but not sent yet

// ---------------- API ----------------
// Web version: there is no server - js/local/server.js answers the same /api/... requests in the page.
async function api(path, opts = {}) {
    return SL.api(path, opts);
}

// ---------------- Theme ----------------
function setTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    try { localStorage.setItem("saneme_theme", t); } catch (e) {}
    $$("[data-theme-toggle]").forEach(b => ($(".ti", b) || b).textContent = t === "dark" ? "☀️" : "🌙");
    $("#darkSwitch").checked = t === "dark";
}
$$("[data-theme-toggle]").forEach(b => b.addEventListener("click", () => {
    setTheme(document.documentElement.getAttribute("data-theme") === "dark" ? "light" : "dark");
    b.classList.remove("spin"); void b.offsetWidth; b.classList.add("spin");
}));
$("#darkSwitch").addEventListener("change", e => setTheme(e.target.checked ? "dark" : "light"));

// ---------------- Profile form (shared by onboarding + Profile) ----------------
const BODY_TYPES = ["slim", "fit", "muscular", "average", "heavy"];
const FACIAL = ["none", "stubble", "beard", "mustache"];
const STYLES = ["sporty", "classic", "streetwear", "casual", "smart"];
const esc = s => String(s ?? "").replace(/[&<>"']/g, c => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));

// profile given -> edits that saved profile (PUT); null -> creates a new one (POST) and makes it active
// Instead of uploading photos, the user picks physical features and the "profile photo card"
// (avatar.js) draws itself live. That card is all Sanéme knows about how he looks.
const AV = window.SanemeAvatar;
let formSeq = 0;
function chipGroup(name, values, selected, labels) {
    const id = `f${formSeq}_${name.replace(/\W/g, "")}`;
    return `<div class="chip-group">${values.map((v, i) => `
        <input type="radio" name="${name}" id="${id}${i}" value="${esc(v)}" ${v === selected ? "checked" : ""}>
        <label class="chip-opt" for="${id}${i}">${esc(labels ? labels[i] : v)}</label>`).join("")}</div>`;
}
function swatchGroup(name, colors, selected) {
    const id = `f${formSeq}_${name.replace(/\W/g, "")}`;
    return `<div class="swatch-group">${Object.entries(colors).map(([k, c], i) => `
        <input type="radio" name="${name}" id="${id}${i}" value="${esc(k)}" ${k === selected ? "checked" : ""}>
        <label class="swatch" for="${id}${i}" title="${esc(k)}" style="background:${c}"></label>`).join("")}</div>
        <div class="swatch-label" data-swatch-label="${name}"></div>`;
}
function photoCardHTML(name, age, appearance) {
    const chips = AV.chips(appearance).map(c => `<span>${esc(c)}</span>`).join("");
    return `<div class="pc-avatar">${AV.svg(appearance)}</div>
        <div class="pc-shade"></div>
        <div class="pc-badge">📷 what Sanéme sees</div>
        <div class="pc-info">
            <div class="pc-name">${esc(name || "Your name")}<span>${age ? ", " + esc(age) : ""}</span></div>
            <div class="pc-chips">${chips}</div>
        </div>`;
}
function readAppearance(form) {
    const f = new FormData(form);
    const hairStyle = f.get("hair_style"), hairColor = f.get("hair_color");
    return {
        height_cm: +f.get("height_cm"), body_type: f.get("body_type"),
        skin_tone: f.get("skin_tone"), eye_color: f.get("eye_color"),
        hair_style: hairStyle, hair_color: hairColor,
        hair: hairStyle === "bald" ? "bald" : `${hairStyle} ${hairColor}`,
        facial_hair: f.get("facial_hair"), glasses: f.get("glasses") === "on",
        style: f.get("style"), notable: (f.get("notable") || "").trim() || null,
    };
}

function renderProfileForm(form, profile, submitLabel, onSaved) {
    formSeq++;
    const p = profile || {}, a = AV.normalize(p.appearance || {});
    if (!p.appearance) { a.hair_style = "short"; a.hair_color = "dark brown"; a.style = "streetwear"; }
    form.innerHTML = `
        <div class="builder">
            <div class="builder-preview">
                <div class="photo-card"></div>
                <div class="pc-caption">There are no real photos in Sanéme. This card is how she sees you on the app.</div>
            </div>
            <div class="builder-fields">
                <div class="b-section">
                    <div class="b-title" style="display:flex;justify-content:space-between;align-items:center">The basics
                        <button type="button" class="btn ghost small" data-random title="Pick a random look (name and age stay)">🎲 Random look</button></div>
                    <div class="b-row">
                        <div><label>Name</label><input type="text" name="name" maxlength="40" required value="${esc(p.name)}" placeholder="what she'll call you"></div>
                        <div><label>Age</label><input type="number" name="age" min="18" max="99" required value="${esc(p.age)}" placeholder="18+"></div>
                    </div>
                </div>
                <div class="b-section">
                    <div class="b-title">Face</div>
                    <div class="b-row">
                        <div><label>Skin tone</label>${swatchGroup("skin_tone", AV.options.skin, a.skin_tone)}</div>
                        <div><label>Eye color</label>${swatchGroup("eye_color", AV.options.eyes, a.eye_color)}</div>
                    </div>
                    <label>Hair</label>${chipGroup("hair_style", AV.options.hairStyles, a.hair_style)}
                    <div data-hair-color><label>Hair color</label>${swatchGroup("hair_color", AV.options.hair, a.hair_color)}</div>
                    <label>Facial hair</label>${chipGroup("facial_hair", FACIAL, a.facial_hair)}
                    <div class="chip-group" style="margin-top:12px">
                        <input type="checkbox" name="glasses" id="f${formSeq}_glasses" ${a.glasses ? "checked" : ""}>
                        <label class="chip-opt" for="f${formSeq}_glasses">👓 wears glasses</label>
                    </div>
                </div>
                <div class="b-section">
                    <div class="b-title">Build</div>
                    <label>Height</label>
                    <div class="height-row"><input type="range" name="height_cm" min="150" max="210" step="1" value="${esc(a.height_cm)}"><span class="height-val"></span></div>
                    <label>Body type</label>${chipGroup("body_type", BODY_TYPES, a.body_type)}
                </div>
                <div class="b-section">
                    <div class="b-title">Style</div>
                    <label>How you dress</label>${chipGroup("style", STYLES, a.style)}
                    <label>Anything else she'd notice? (optional)</label>
                    <input type="text" name="notable" maxlength="120" placeholder="a tattoo, an earring, a nice smile…" value="${esc(p.appearance && p.appearance.notable)}">
                </div>
                <div class="form-error"></div>
                <button class="btn block" type="submit">${submitLabel}</button>
            </div>
        </div>`;

    const card = $(".photo-card", form);
    const update = bump => {
        const ap = readAppearance(form);
        card.innerHTML = photoCardHTML(form.elements.name.value.trim(), form.elements.age.value, ap);
        $(".height-val", form).textContent = `${ap.height_cm} cm`;
        $("[data-hair-color]", form).classList.toggle("hidden", ap.hair_style === "bald");
        $$("[data-swatch-label]", form).forEach(el => {
            const checked = form.querySelector(`input[name="${el.dataset.swatchLabel}"]:checked`);
            el.textContent = checked ? checked.value : "";
        });
        if (bump && fxOn()) { card.classList.remove("bump"); void card.offsetWidth; card.classList.add("bump"); }
    };
    form.oninput = e => update(e.target.type === "radio" || e.target.type === "checkbox");
    update(false);

    // 🎲 random look: every visual choice re-rolled, name / age / notes untouched
    $("[data-random]", form).addEventListener("click", () => {
        ["skin_tone", "eye_color", "hair_style", "hair_color", "facial_hair", "body_type", "style"].forEach(name => {
            const opts = $$(`input[name="${name}"]`, form);
            opts[Math.floor(Math.random() * opts.length)].checked = true;
        });
        form.elements.glasses.checked = Math.random() < 0.25;
        // heights cluster around the middle like real ones (sum of two dice)
        form.elements.height_cm.value = Math.round(160 + (Math.random() + Math.random()) * 18);
        update(true);
        if (fxOn()) fxBurst(["🎲", "✨"], 6);
    });

    form.onsubmit = async e => {
        e.preventDefault();
        const f = new FormData(form), err = $(".form-error", form), btn = $("button[type=submit]", form);
        const body = { name: f.get("name").trim(), age: +f.get("age"), appearance: readAppearance(form) };
        if (body.age < 18) { err.textContent = "You must be at least 18."; return; }
        btn.disabled = true; err.textContent = "";
        try {
            const r = profile
                ? await api(`/api/profiles/${profile.id}`, { method: "PUT", body })
                : await api("/api/profiles", { method: "POST", body });
            onSaved && await onSaved(r.profile);
        } catch (ex) { err.textContent = ex.message; }
        btn.disabled = false;
    };
}
