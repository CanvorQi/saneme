// js/profiles.js - Your saved profile cards.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Saved profiles ----------------
function profileSub(p) {
    const a = p.appearance || {};
    const c = p.message_counts;
    return [`${p.age}`, a.body_type, a.style, c ? `${c.user + c.saneme} messages` : null].filter(Boolean).join(" · ");
}
function renderSavedList(el, list, onPick, pickLabel) {
    if (!list.length) { el.innerHTML = `<p class="section-sub" style="margin:0">No saved profiles yet.</p>`; return; }
    el.innerHTML = list.map(p => {
        const isActive = state.profile && p.id === state.profile.id;
        return `<div class="profile-row">
            <div class="p-avatar has-svg">${AV.svg(p.appearance)}</div>
            <div class="p-info">
                <div class="name">${esc(p.name)}${isActive ? `<span class="active-pill">active</span>` : ""}</div>
                <div class="sub">${esc(profileSub(p))}</div>
            </div>
            ${isActive ? "" : `<button class="btn ghost small" data-pick="${esc(p.id)}">${pickLabel}</button>`}
        </div>`;
    }).join("");
    $$("[data-pick]", el).forEach(b => b.addEventListener("click", () => onPick(b.dataset.pick)));
}
async function refreshProfiles() {
    const r = await api("/api/profiles");
    state.profiles = r.profiles;
    return r.profiles;
}
async function switchProfile(id) {
    await api(`/api/profiles/${id}/activate`, { method: "POST" });
    await loadState();
    enterApp();
    toast(`Now chatting as ${state.profile.name}`);
}
async function renderProfileView(creating) {
    const form = $("#profileForm");
    $("#profileFormTitle").textContent = creating ? "New profile card" : "Profile card";
    renderProfileForm(form, creating ? null : state.profile, creating ? "Create & switch" : "Save", async saved => {
        if (creating) { await loadState(); enterApp(); showMatch(); return; }
        state.profile = saved;
        const btn = $("#profileForm button[type=submit]");
        btn.textContent = "Saved ✓"; setTimeout(() => btn.textContent = "Save", 1500);
        toast("Profile saved");
        renderSavedList($("#savedList"), await refreshProfiles(), switchProfile, "Switch");
    });
    renderSavedList($("#savedList"), await refreshProfiles(), switchProfile, "Switch");
}
$("#newProfileBtn").addEventListener("click", () => { renderProfileView(true); $(".app-shell").scrollTo?.(0, 0); $("#view-profile").scrollTo(0, 0); });
