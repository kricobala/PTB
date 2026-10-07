/* Armazenamento local + conexão com o GitHub Gist (sincronização entre aparelhos).
   O token fica só neste aparelho (localStorage). Nada aqui é enviado para outro lugar além do api.github.com. */
(function () {
  // ---------------- armazenamento local (mesma interface usada pelo app) ----------------
  function seguro(fn, padrao) { try { return fn(); } catch (e) { return padrao; } }
  window.storage = {
    async get(key) {
      const v = seguro(() => localStorage.getItem(key), null);
      return v === null ? null : { key: key, value: v, shared: false };
    },
    async set(key, value) {
      localStorage.setItem(key, value);
      return { key: key, value: value, shared: false };
    },
    async delete(key) {
      seguro(() => localStorage.removeItem(key));
      return { key: key, deleted: true, shared: false };
    },
    async list(prefix) {
      const keys = seguro(() => Object.keys(localStorage), []).filter((k) => !prefix || k.indexOf(prefix) === 0);
      return { keys: keys, prefix: prefix, shared: false };
    },
  };

  // ---------------- GitHub Gist ----------------
  window.GH_SYNC_ENABLED = true;
  var GIST_FILE = "kanban-petrobras-dados.json";
  var FOTO_FILE = "kanban-petrobras-foto.json";
  var API = "https://api.github.com/gists";

  function cabecalhos(token) {
    return {
      Authorization: "Bearer " + token,
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
    };
  }

  async function chamar(url, opcoes) {
    var res;
    try {
      res = await fetch(url, opcoes);
    } catch (e) {
      throw new Error("Sem conexão com o GitHub.");
    }
    if (res.ok) return res;
    if (res.status === 401) throw new Error("Token inválido ou expirado. Gere outro no GitHub.");
    if (res.status === 403) throw new Error("O GitHub recusou (permissão ou limite de requisições). Confirme que o token tem o escopo \"gist\".");
    if (res.status === 404) throw new Error("Gist não encontrado. Confira o ID e se o token é da mesma conta que criou o Gist.");
    throw new Error("O GitHub respondeu com o erro " + res.status + ".");
  }

  window.ghSync = {
    getConfig: function () {
      return {
        token: seguro(() => localStorage.getItem("pb_gh_token"), "") || "",
        gistId: seguro(() => localStorage.getItem("pb_gh_gist_id"), "") || "",
      };
    },
    setConfig: function (token, gistId) {
      localStorage.setItem("pb_gh_token", token || "");
      localStorage.setItem("pb_gh_gist_id", gistId || "");
    },
    createGist: async function (doc) {
      var token = window.ghSync.getConfig().token;
      var files = {};
      files[GIST_FILE] = { content: JSON.stringify(doc) };
      var res = await chamar(API, {
        method: "POST",
        headers: cabecalhos(token),
        body: JSON.stringify({ description: "Kanban de Estudos - Petrobras (progresso)", public: false, files: files }),
      });
      var data = await res.json();
      return data.id;
    },
    // lê o Gist inteiro: progresso (doc) e foto de inspiração (foto)
    rawPullAll: async function () {
      var cfg = window.ghSync.getConfig();
      if (!cfg.token || !cfg.gistId) return { doc: null, foto: null };
      var res = await chamar(API + "/" + cfg.gistId, { headers: cabecalhos(cfg.token), cache: "no-store" });
      var data = await res.json();
      async function ler(nome, tolerante) {
        var file = data.files && data.files[nome];
        if (!file) return null;
        var texto = file.content;
        if (file.truncated && file.raw_url) {
          var r2 = await chamar(file.raw_url, { cache: "no-store" });
          texto = await r2.text();
        }
        if (!texto) return null;
        try { return JSON.parse(texto); } catch (e) {
          if (tolerante) return null; // foto corrompida não pode travar a sincronização do progresso
          throw new Error("O conteúdo do Gist está corrompido.");
        }
      }
      return { doc: await ler(GIST_FILE, false), foto: await ler(FOTO_FILE, true) };
    },
    rawPull: async function () {
      return (await window.ghSync.rawPullAll()).doc;
    },
    // grava só o que foi informado: progresso (doc) e/ou foto
    rawPush: async function (doc, foto) {
      var cfg = window.ghSync.getConfig();
      if (!cfg.token || !cfg.gistId) return;
      var files = {};
      if (doc) files[GIST_FILE] = { content: JSON.stringify(doc) };
      if (foto) files[FOTO_FILE] = { content: JSON.stringify(foto) };
      if (!Object.keys(files).length) return;
      await chamar(API + "/" + cfg.gistId, { method: "PATCH", headers: cabecalhos(cfg.token), body: JSON.stringify({ files: files }) });
    },
  };
})();
