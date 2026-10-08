/*
 * Sanéme Web - service worker (offline + installable)
 * ---------------------------------------------------
 * The app files are cached on install; afterwards they come from the cache and are refreshed in
 * the background (stale-while-revalidate). Character photos are cached the first time they're seen.
 * When you publish a new version, bump VERSION (saneme-v2, ...) so phones drop the old files.
 */
const VERSION = "saneme-v2";
const IMG_CACHE = "saneme-img";
const CORE = [
    "./", "./index.html", "./manifest.json", "./icon.png", "./avatar.js", "./css/app.css", "./css/pages.css",
    "./js/data/characters.js", "./js/data/language.js",
    "./js/local/util.js", "./js/local/store.js", "./js/local/characters.js", "./js/local/mood.js", "./js/local/openers.js",
    "./js/local/style.js", "./js/local/attraction.js", "./js/local/reactions.js", "./js/local/chatmedia.js", "./js/local/stories.js", "./js/local/crowd.js",
    "./js/local/memory.js", "./js/local/dialog/intents.js", "./js/local/dialog/lines.js", "./js/local/dialog/topics.js",
    "./js/local/dialog/engine.js", "./js/local/server.js",
    "./js/core.js", "./js/shell.js", "./js/characters.js", "./js/stories.js", "./js/social.js", "./js/lightbox.js", "./js/profiles.js",
    "./js/chat.js", "./js/language.js", "./js/reply.js", "./js/notify.js", "./js/live.js", "./js/main.js", "./js/pwa.js",
    "./icons/icon-192.png", "./icons/icon-512.png", "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
    e.waitUntil(caches.open(VERSION).then(c => c.addAll(CORE)).then(() => self.skipWaiting()));
});

self.addEventListener("activate", e => {
    e.waitUntil(caches.keys()
        .then(keys => Promise.all(keys.filter(k => k !== VERSION && k !== IMG_CACHE).map(k => caches.delete(k))))
        .then(() => self.clients.claim()));
});

self.addEventListener("fetch", e => {
    const req = e.request;
    if (req.method !== "GET") return;
    const url = new URL(req.url);
    // character photos: cache first (they never change under the same name)
    if (url.origin === location.origin && url.pathname.includes("/characters/")) {
        e.respondWith(caches.open(IMG_CACHE).then(async cache => {
            const hit = await cache.match(req);
            if (hit) return hit;
            const res = await fetch(req);
            if (res.ok) cache.put(req, res.clone());
            return res;
        }));
        return;
    }
    // app files and Google Fonts: from the cache, refreshed in the background
    if (url.origin === location.origin || url.host.endsWith("googleapis.com") || url.host.endsWith("gstatic.com")) {
        e.respondWith(caches.open(VERSION).then(async cache => {
            const hit = await cache.match(req, { ignoreSearch: true });
            const net = fetch(req).then(res => {
                if (res.ok || res.type === "opaque") cache.put(req, res.clone());
                return res;
            }).catch(() => hit || (req.mode === "navigate" ? cache.match("./index.html") : undefined));
            return hit || net;
        }));
    }
});
