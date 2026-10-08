// js/language.js - The Sanéme language: underlined words, their meaning, the 📖 glossary.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- The Sanéme language (saneme-language.md, served by /api/language) ----------------
const LANG = { entries: [], byWord: {}, re: null };
async function loadLanguage() {
    try { LANG.entries = (await api("/api/language")).entries; } catch (e) { LANG.entries = []; }
    LANG.byWord = {};
    for (const e of LANG.entries) {
        if (!["word", "pet name", "verb"].includes(e.kind)) continue;
        for (const w of [e.word, e.short].filter(Boolean)) {
            const k = w.toLowerCase();
            (LANG.byWord[k] = LANG.byWord[k] || []).push(e);
        }
    }
    const keys = Object.keys(LANG.byWord).sort((a, b) => b.length - a.length);
    // the word itself or with an English ending: lume, lumes, lumed, luming
    LANG.re = keys.length ? new RegExp(`(^|[^\\p{L}])(${keys.join("|")})(s|d|ed|ing)?(?![\\p{L}])`, "giu") : null;
    if (state.messages.length) renderAll();
}
function langify(html) {
    if (!LANG.re) return html;
    return html.replace(LANG.re, (all, pre, word, end) => `${pre}<span class="sw" data-sw="${word.toLowerCase()}">${word}${end || ""}</span>`);
}
function langText(key) {
    const list = LANG.byWord[key] || [];
    const noun = list.find(e => e.kind !== "verb") || list[0];
    const verb = list.find(e => e.kind === "verb" && e !== noun);
    return { noun, verb };
}
const swPop = document.createElement("div");
swPop.className = "sw-pop hidden";
document.body.appendChild(swPop);
document.addEventListener("click", e => {
    const w = e.target.closest(".sw");
    if (!w) { swPop.classList.add("hidden"); return; }
    const { noun, verb } = langText(w.dataset.sw);
    if (!noun) return;
    swPop.innerHTML = `<b>${esc(noun.word)}</b>${noun.short && noun.short.toLowerCase() !== noun.word.toLowerCase() ? ` <span class="tr">(${esc(noun.short)})</span>` : ""}
        <div>${esc(noun.en)}${verb ? `<br><i>to ${esc(verb.word)}:</i> ${esc(verb.en)}` : ""}</div>
        ${noun.tr ? `<div class="tr">${esc(noun.tr)}</div>` : ""}${(verb || noun).example ? `<div class="ex">${esc((verb || noun).example)}</div>` : ""}`;
    swPop.classList.remove("hidden");
    const r = w.getBoundingClientRect();
    swPop.style.left = Math.max(8, Math.min(window.innerWidth - swPop.offsetWidth - 8, r.left)) + "px";
    swPop.style.top = (r.top - swPop.offsetHeight - 8 < 8 ? r.bottom + 8 : r.top - swPop.offsetHeight - 8) + "px";
});
// 📖: the words SHE has used in this chat, in the order she taught them
function openGlossary() {
    const seen = new Map();
    for (const m of state.messages) {
        if (m.role !== "saneme" || !m.text || !LANG.re) continue;
        for (const match of m.text.matchAll(new RegExp(LANG.re.source, "giu"))) {
            const key = match[2].toLowerCase(), main = langText(key).noun;
            if (main && !seen.has(main.word)) seen.set(main.word, { key, ts: m.ts, line: m.text });
        }
    }
    const rows = [...seen.entries()].map(([word, info]) => {
        const { noun, verb } = langText(info.key);
        return `<div class="lang-row"><b>${esc(noun.word)}</b><span class="k">${esc(noun.kind)}</span>
            <div class="en">${esc(noun.en)}${verb ? ` · <i>to ${esc(verb.word)}</i>: ${esc(verb.en)}` : ""}</div>
            ${noun.tr ? `<div class="tr">${esc(noun.tr)}</div>` : ""}
            <div class="seen">“${esc(info.line)}” · ${esc(dayLabel(info.ts))}</div></div>`;
    }).join("");
    const modal = document.createElement("div");
    modal.className = "lang-modal";
    modal.innerHTML = `<div class="lang-card"><div class="lang-head"><div><h3>📖 Sanéme words</h3>
        <p>The private words ${esc(herName())} has used with you. Tap a word in the chat to see what it means.</p></div>
        <button class="icon-btn" data-close title="Close">✕</button></div>
        <div class="lang-list">${rows || `<div class="lang-empty">No Sanéme words yet.<br>Sanéme is a soft language for two. She might start teaching you some when you two get closer. 🌸</div>`}</div></div>`;
    modal.addEventListener("click", e => { if (e.target === modal || e.target.closest("[data-close]")) modal.remove(); });
    document.body.appendChild(modal);
}
$("#langBtn").addEventListener("click", openGlossary);
document.addEventListener("keydown", e => { if (e.key === "Escape") { $(".lang-modal")?.remove(); swPop.classList.add("hidden"); } });
