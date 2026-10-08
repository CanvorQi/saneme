// js/lightbox.js - The photo viewer.
// Classic script (not a module): index.html loads all js/*.js in order and they share one global scope,
// exactly like the single <script> they were split from.

// ---------------- Lightbox ----------------
const lb = { list: [], i: 0 };
function openLightbox(list, i) {
    if (!list.length) return;
    lb.list = list; lb.i = i;
    showLightboxImage();
    $("#lightbox").classList.add("show");
}
function showLightboxImage() {
    const item = lb.list[lb.i];
    $("#lightbox img").src = typeof item === "string" ? item : item.url;
    $("#lightbox .lb-caption").textContent = (item && item.caption) || "";
    $("#lightbox .lb-caption").classList.toggle("hidden", !(item && item.caption));
    $("#lightbox .lb-count").textContent = `${lb.i + 1} / ${lb.list.length}`;
    $$("#lightbox .lb-prev, #lightbox .lb-next").forEach(b => b.classList.toggle("hidden", lb.list.length < 2));
}
function stepLightbox(d) { lb.i = (lb.i + d + lb.list.length) % lb.list.length; showLightboxImage(); }
const closeLightbox = () => $("#lightbox").classList.remove("show");
$("#lightbox").addEventListener("click", e => {
    const act = e.target.dataset.lb;
    if (act === "prev") stepLightbox(-1);
    else if (act === "next") stepLightbox(1);
    else if (act === "close" || e.target.id === "lightbox") closeLightbox();
});
document.addEventListener("keydown", e => {
    if (!$("#lightbox").classList.contains("show")) return;
    if (e.key === "Escape") closeLightbox();
    if (e.key === "ArrowLeft") stepLightbox(-1);
    if (e.key === "ArrowRight") stepLightbox(1);
});
