/* Service worker: deixa o app funcionar sem internet e SEMPRE buscar a versão nova quando houver conexão.
   20261007-110611 é trocado a cada build, o que descarta o cache antigo automaticamente. */
const VERSION = "20261007-110611";
const CACHE = "kanban-petrobras-" + VERSION;
const CORE = [
  "./", "index.html", "styles.css", "app.js", "data.js", "sync.js", "manifest.json",
  "icon-192.png", "icon-512.png", "icon-maskable-512.png", "apple-touch-icon.png",
  "vendor/react.production.min.js", "vendor/react-dom.production.min.js",
  "vendor/prop-types.min.js", "vendor/recharts.min.js",
];

self.addEventListener("install", (e) => {
  e.waitUntil(caches.open(CACHE).then((c) => c.addAll(CORE.map((u) => new Request(u, { cache: "reload" })))));
  self.skipWaiting();
});

self.addEventListener("activate", (e) => {
  e.waitUntil(
    caches.keys()
      .then((ks) => Promise.all(ks.filter((k) => k.indexOf("kanban-petrobras-") === 0 && k !== CACHE).map((k) => caches.delete(k))))
      .then(() => self.clients.claim())
  );
});

function comTimeout(promise, ms) {
  return Promise.race([promise, new Promise((_, rej) => setTimeout(() => rej(new Error("timeout")), ms))]);
}

function guardar(req, res) {
  if (res && res.ok) {
    const copia = res.clone();
    caches.open(CACHE).then((c) => c.put(req, copia));
  }
  return res;
}

self.addEventListener("fetch", (e) => {
  const req = e.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return; // api.github.com etc. passam direto

  const estatico = /\/vendor\/|\/icon-|apple-touch-icon/.test(url.pathname);
  if (estatico) {
    // bibliotecas e ícones quase nunca mudam: cache primeiro
    e.respondWith(caches.match(req).then((c) => c || fetch(req).then((r) => guardar(req, r))));
    return;
  }
  // página, código e dados do cronograma: rede primeiro (pega a versão nova), cache como reserva offline
  e.respondWith(
    comTimeout(fetch(req, { cache: "no-cache" }), 6000)
      .then((r) => guardar(req, r))
      .catch(() => caches.match(req).then((c) => c || caches.match("index.html")))
  );
});
