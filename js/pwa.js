// js/pwa.js - Installable app: the service worker (offline) and the "Install" button in Settings.
// A service worker only runs over http(s) (GitHub Pages, a local server) - not from file://.
(function () {
    const btn = document.getElementById("installBtn");
    let deferred = null;
    const standalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    function update() {
        if (!btn) return;
        if (standalone()) { btn.textContent = "Installed ✓"; btn.disabled = true; return; }
        btn.disabled = false;
        btn.textContent = deferred ? "Install" : "How?";
    }
    if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
        window.addEventListener("load", () => navigator.serviceWorker.register("sw.js").catch(e => console.warn("service worker:", e)));
    }
    window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; update(); });
    window.addEventListener("appinstalled", () => { deferred = null; update(); toast("Sanéme is installed 💗"); });
    if (btn) btn.addEventListener("click", async () => {
        if (deferred) {
            deferred.prompt();
            await deferred.userChoice.catch(() => null);
            deferred = null;
            update();
        } else if (ios) {
            toast("On iPhone: Safari → Share → Add to Home Screen");
        } else if (location.protocol === "file:") {
            toast("Open it from its web address (e.g. GitHub Pages) to install it");
        } else {
            toast("Use your browser menu → Install app / Add to Home screen");
        }
    });
    update();
})();
