/* オフライン用の仕組み（Service Worker）
   - ページ本体（index.html）：電波があれば最新版を取りに行き、だめなら保存しておいた版を出す（3秒で見切る）
   - 読み取り部品・アイコン：保存しておいた版を使う（版を上げたときだけ入れ替わる）
   版を変えたら VER を書き換えること */
const VER = "scan-2026-10-31b";
const ASSETS = [
  "./",
  "./index.html",
  "./manifest.webmanifest",
  "./vendor/barcode-detector-ponyfill.js",
  "./vendor/zxing_reader.wasm",
  "./icons/icon-192.png",
  "./icons/icon-512.png",
  "./icons/apple-touch-icon.png",
];

self.addEventListener("install", e => {
  e.waitUntil(
    caches.open(VER)
      .then(c => c.addAll(ASSETS.map(u => new Request(u, { cache: "reload" }))))
      .then(() => self.skipWaiting())
  );
});

self.addEventListener("activate", e => {
  e.waitUntil(
    caches.keys()
      .then(keys => Promise.all(keys.filter(k => k.startsWith("scan-") && k !== VER).map(k => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

self.addEventListener("message", e => {
  if (e.data === "version" && e.source) e.source.postMessage({ type: "version", ver: VER });
});

function isPage(req) {
  const u = new URL(req.url);
  return req.mode === "navigate" || u.pathname.endsWith("/") || u.pathname.endsWith("/index.html");
}

async function pageNetworkFirst(req) {
  const cache = await caches.open(VER);
  try {
    const res = await Promise.race([
      fetch(req, { cache: "no-store" }),
      new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), 3000)),
    ]);
    if (res && res.ok) { cache.put("./index.html", res.clone()); return res; }
    throw new Error("bad response");
  } catch (err) {
    return (await cache.match("./index.html")) || (await cache.match("./")) || Response.error();
  }
}

async function assetCacheFirst(req) {
  const cache = await caches.open(VER);
  const hit = await cache.match(req, { ignoreSearch: true });
  if (hit) return hit;
  const res = await fetch(req);
  if (res && res.ok) cache.put(req, res.clone());
  return res;
}

self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || new URL(req.url).origin !== self.location.origin) return;
  e.respondWith(isPage(req) ? pageNetworkFirst(req) : assetCacheFirst(req));
});
