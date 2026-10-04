/* ================================================================
   GitHub を「フォルダ」のように読み書きする共通部品  ─  editter/ghfs.js
   ・webp.html / rename.html / icon.html / formatter.html が使います。各ページの </body> の直前に、この1行を足す:
        <script src="ghfs.js"></script>
   ・GitHub の API(Git Data API)だけで動きます。インストール・サーバー不要
   ・読み込み: リポジトリのファイル一覧を取り、選んだフォルダのファイルを「フォルダの中身」として見せる
   ・書き込み: ページ側の操作(WebP を保存・名前を変更・削除)は、いったんメモリ上に溜めておき、
              最後に commit() で「1回のコミット」にまとめて GitHub に送る(途中で失敗しても半端に残らない)
   ・リネームはファイルの中身を送り直さず、名前だけを付け替えるので速い
   ・リポジトリ・ブランチ・トークンは editter/main.html と共有(同じブラウザ・同じサイトなら入力は1回)
   ================================================================ */
(function () {
  "use strict";
  var LS_CFG = "ghCfg", LS_TOKEN = "ghToken";

  /* ---------- 小道具 ---------- */
  function encPath(p) { return p.split("/").map(encodeURIComponent).join("/"); }
  function dirname(p) { var i = p.lastIndexOf("/"); return i < 0 ? "" : p.slice(0, i); }
  function basename(p) { return p.slice(p.lastIndexOf("/") + 1); }
  function nfErr(msg) { var e = new Error(msg || "見つかりません"); e.name = "NotFoundError"; return e; }
  function cloneMap(m) { var n = new Map(); m.forEach(function (e, p) { n.set(p, { sha: e.sha, size: e.size, mode: e.mode, blob: e.blob || null }); }); return n; }
  function mime(name) {
    var x = (name.split(".").pop() || "").toLowerCase();
    return { png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif", webp: "image/webp", svg: "image/svg+xml" }[x] || "";
  }
  async function toB64(blob) {
    var buf = new Uint8Array(await blob.arrayBuffer()), s = "", n = 0x8000;
    for (var i = 0; i < buf.length; i += n) s += String.fromCharCode.apply(null, buf.subarray(i, i + n));
    return btoa(s);
  }
  async function pool(items, n, fn) {
    var i = 0;
    await Promise.all(Array.from({ length: Math.min(n, items.length) }, async function () {
      while (i < items.length) { var it = items[i++]; await fn(it); }
    }));
  }

  /* ---------- リポジトリ(GitHub API の窓口) ---------- */
  function Repo(cfg) {
    this.repo = cfg.repo; this.branch = cfg.branch || "main"; this.token = cfg.token || "";
    this.head = ""; this.mtime = Date.now();
    this.base = new Map();   /* 読み込んだときの状態: パス → {sha,size,mode} */
    this.cur = new Map();    /* 今の状態(メモリ上で変更していく): パス → {sha,size,mode,blob} */
  }
  Repo.prototype.api = async function (path, opt) {
    opt = opt || {};
    var h = { "Accept": opt.buf ? "application/vnd.github.raw+json" : "application/vnd.github+json", "X-GitHub-Api-Version": "2022-11-28" };
    if (this.token) h["Authorization"] = "Bearer " + this.token;
    if (opt.body) h["Content-Type"] = "application/json";
    var r = await fetch("https://api.github.com/repos/" + this.repo + path,
      { method: opt.method || "GET", headers: h, body: opt.body ? JSON.stringify(opt.body) : undefined, cache: "no-store" });
    if (!r.ok) {
      var m = ""; try { m = (await r.json()).message || ""; } catch (e) { }
      var hint = r.status === 401 ? "(トークンが正しくないか期限切れです)" :
        r.status === 403 ? "(権限不足、または回数制限です)" :
        r.status === 404 ? "(リポジトリ・ブランチ名が違うか、トークンにこのリポジトリの権限がありません)" : "";
      throw new Error(r.status + " " + m + hint);
    }
    return opt.buf ? r.arrayBuffer() : r.json();
  };
  /* ブランチの最新を読み込む */
  Repo.prototype.connect = async function () {
    var ref = await this.api("/git/ref/heads/" + encPath(this.branch));
    this.head = ref.object.sha;
    var tr = await this.api("/git/trees/" + this.head + "?recursive=1");
    if (tr.truncated) throw new Error("リポジトリのファイルが多すぎて、一覧を最後まで取得できません");
    var self = this;
    this.base = new Map();
    tr.tree.forEach(function (e) { if (e.type === "blob") self.base.set(e.path, { sha: e.sha, size: e.size || 0, mode: e.mode || "100644", blob: null }); });
    this.cur = cloneMap(this.base);
    try { var c = await this.api("/git/commits/" + this.head); this.mtime = Date.parse(c.committer.date) || Date.now(); } catch (e) { }
  };
  /* フォルダごとの直下のファイル名一覧: Map(フォルダパス → [名前…]) */
  Repo.prototype.dirInfos = function () {
    var m = new Map();
    this.cur.forEach(function (e, p) { var d = dirname(p); if (!m.has(d)) m.set(d, []); m.get(d).push(basename(p)); });
    return m;
  };
  /* 下の階層まで含めた一覧: Map(フォルダパス → [フォルダからの相対パス…])。親フォルダ(pic など)を選ばせたいとき用 */
  Repo.prototype.deepInfos = function () {
    var m = new Map();
    this.cur.forEach(function (e, p) {
      var parts = p.split("/"), i;
      for (i = 0; i < parts.length; i++) {
        var d = parts.slice(0, i).join("/"), rest = parts.slice(i).join("/");
        if (!m.has(d)) m.set(d, []);
        m.get(d).push(rest);
      }
    });
    return m;
  };
  Repo.prototype.discard = function () { this.cur = cloneMap(this.base); };
  /* メモリ上の変更を、1回のコミットにまとめて GitHub に送る。送った件数を返す(変更なしなら 0) */
  Repo.prototype.commit = async function (message) {
    var self = this, changes = [];
    this.cur.forEach(function (e, p) { var b = self.base.get(p); if (!b || e.blob || e.sha !== b.sha) changes.push({ path: p, e: e, del: false }); });
    this.base.forEach(function (b, p) { if (!self.cur.has(p)) changes.push({ path: p, del: true }); });
    if (!changes.length) return 0;
    var ref = await this.api("/git/ref/heads/" + encPath(this.branch)), head = ref.object.sha;
    if (head !== this.head) {
      /* 読み込んだ後に GitHub 側が更新されていた: 触るファイルが変わっていないか確かめる */
      var tr = await this.api("/git/trees/" + head + "?recursive=1"), latest = new Map();
      tr.tree.forEach(function (e) { if (e.type === "blob") latest.set(e.path, e.sha); });
      var bad = changes.filter(function (c) { var b = self.base.get(c.path); return (latest.get(c.path) || "") !== (b ? b.sha : ""); })
        .map(function (c) { return c.path; });
      if (bad.length) throw new Error("読み込んだ後に、GitHub側で次のファイルが変更されています。読み込み直してください: " + bad.slice(0, 3).join(", ") + (bad.length > 3 ? " ほか" : ""));
    }
    var commit = await this.api("/git/commits/" + head);
    var todo = changes.filter(function (c) { return !c.del && c.e.blob; });
    await pool(todo, 3, async function (c) {
      var b = await self.api("/git/blobs", { method: "POST", body: { content: await toB64(c.e.blob), encoding: "base64" } });
      c.newSha = b.sha;
    });
    var tree = changes.map(function (c) {
      return c.del ? { path: c.path, mode: "100644", type: "blob", sha: null }
        : { path: c.path, mode: c.e.mode || "100644", type: "blob", sha: c.e.blob ? c.newSha : c.e.sha };
    });
    var nt = await this.api("/git/trees", { method: "POST", body: { base_tree: commit.tree.sha, tree: tree } });
    var nc = await this.api("/git/commits", { method: "POST", body: { message: message, tree: nt.sha, parents: [head] } });
    await this.api("/git/refs/heads/" + encPath(this.branch), { method: "PATCH", body: { sha: nc.sha } });
    this.head = nc.sha; this.mtime = Date.now();
    changes.forEach(function (c) { if (!c.del && c.e.blob) { c.e.sha = c.newSha; c.e.size = c.e.blob.size; c.e.blob = null; } });
    this.base = cloneMap(this.cur);
    return changes.length;
  };

  /* ---------- フォルダ・ファイルのふりをする部品(File System Access API と同じ形) ---------- */
  function GhFile(repo, full) { this.kind = "file"; this.isGh = true; this.repo = repo; this.full = full; this.name = basename(full); }
  Object.defineProperty(GhFile.prototype, "ghSize", { get: function () { var e = this.repo.cur.get(this.full); return e ? e.size : 0; } });
  /* 中身をダウンロードせずに、サイズと(最新コミットの)日時だけ返す */
  GhFile.prototype.ghMeta = async function () { return { name: this.name, size: this.ghSize, lastModified: this.repo.mtime }; };
  GhFile.prototype.getFile = async function () {
    var e = this.repo.cur.get(this.full); if (!e) throw nfErr();
    var o = { type: mime(this.name), lastModified: this.repo.mtime };
    if (e.blob) return new File([e.blob], this.name, o);
    var buf = await this.repo.api("/git/blobs/" + e.sha, { buf: true });
    return new File([buf], this.name, o);
  };
  GhFile.prototype.createWritable = async function () {
    var self = this, parts = [];
    return {
      write: async function (d) { parts.push(d); },
      close: async function () {
        var blob = new Blob(parts), old = self.repo.cur.get(self.full);
        self.repo.cur.set(self.full, { sha: old ? old.sha : "", size: blob.size, mode: old ? old.mode : "100644", blob: blob });
      },
      abort: async function () { }
    };
  };
  /* 名前の変更(中身は送らない。commit() のときに「名前の付け替え」としてまとめて反映される) */
  GhFile.prototype.move = async function (newName) {
    var cur = this.repo.cur, e = cur.get(this.full); if (!e) throw nfErr();
    var nf = dirname(this.full) ? dirname(this.full) + "/" + newName : newName;
    if (nf !== this.full && cur.has(nf)) throw new Error("同名のファイルが既にあります: " + newName);
    cur.set(nf, e); if (nf !== this.full) cur.delete(this.full);
    this.full = nf; this.name = newName;
  };

  function GhDir(repo, path) { this.kind = "directory"; this.isGh = true; this.repo = repo; this.fs = repo; this.path = path; this.name = basename(path) || "/"; this.label = ""; }
  GhDir.prototype.entries = async function* () {
    var prefix = this.path ? this.path + "/" : "", files = [], dirs = new Set();
    this.repo.cur.forEach(function (e, p) {
      if (p.indexOf(prefix) !== 0) return;
      var rest = p.slice(prefix.length), i = rest.indexOf("/");
      if (i < 0) files.push(rest); else dirs.add(rest.slice(0, i));
    });
    for (var n of files) yield [n, new GhFile(this.repo, prefix + n)];
    for (var d of dirs) yield [d, new GhDir(this.repo, prefix + d)];
  };
  GhDir.prototype.getFileHandle = async function (name, opt) {
    var full = (this.path ? this.path + "/" : "") + name;
    if (!this.repo.cur.has(full) && !(opt && opt.create)) throw nfErr();
    return new GhFile(this.repo, full);
  };
  GhDir.prototype.getDirectoryHandle = async function (name, opt) {
    var full = (this.path ? this.path + "/" : "") + name, pre = full + "/", has = false;
    this.repo.cur.forEach(function (e, p) { if (p.indexOf(pre) === 0) has = true; });
    if (!has && !(opt && opt.create)) throw nfErr();
    var d = new GhDir(this.repo, full); d.label = this.label; return d;
  };
  GhDir.prototype.removeEntry = async function (name) {
    var full = (this.path ? this.path + "/" : "") + name;
    if (!this.repo.cur.has(full)) throw nfErr();
    this.repo.cur.delete(full);
  };

  /* ---------- 接続ダイアログ ---------- */
  var cssDone = false;
  function addCss() {
    if (cssDone) return; cssDone = true;
    var s = document.createElement("style");
    s.textContent =
      ".ghfs-bg{position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.55);display:flex;align-items:center;justify-content:center;padding:16px}" +
      ".ghfs-bg[hidden]{display:none}" +
      ".ghfs-box{width:min(520px,100%);max-height:100%;overflow:auto;background:var(--panel,#fff);color:var(--text,#222);border:1px solid var(--line,#e6dccb);border-radius:10px;padding:16px;display:flex;flex-direction:column;gap:8px;font:14px/1.5 system-ui,'Yu Gothic UI',sans-serif;letter-spacing:normal}" +
      ".ghfs-box h3{margin:0;font-size:16px}" +
      ".ghfs-box [hidden]{display:none}" +
      ".ghfs-box label{display:flex;flex-direction:column;gap:3px;font-size:12px;color:var(--sub,#7a6f62);cursor:default}" +
      ".ghfs-box input[type=text],.ghfs-box input[type=password],.ghfs-box select{font:inherit;padding:6px 8px;border:1px solid var(--line,#e6dccb);border-radius:5px;background:var(--bg,#fff);color:var(--text,#222)}" +
      ".ghfs-box .chk{flex-direction:row;align-items:center;gap:6px;cursor:pointer}" +
      ".ghfs-box .row{display:flex;gap:8px;justify-content:flex-end;flex-wrap:wrap}" +
      ".ghfs-box button{font:inherit;padding:6px 14px;border:1px solid var(--line,#e6dccb);border-radius:6px;background:var(--panel,#fff);color:var(--text,#222);cursor:pointer}" +
      ".ghfs-box button:disabled{opacity:.45;cursor:default}" +
      ".ghfs-box button.pri{background:var(--acc,#8e632b);color:var(--acc-t,#fff);border-color:var(--acc,#8e632b);font-weight:600}" +
      ".ghfs-st{font-size:12px;min-height:1.4em;color:var(--sub,#7a6f62)}.ghfs-st.err{color:var(--err,#dc2626)}" +
      ".ghfs-note{font-size:11px;line-height:1.6;color:var(--sub,#7a6f62);margin:0}";
    document.head.appendChild(s);
  }
  function loadCfg() { try { return JSON.parse(localStorage.getItem(LS_CFG) || "{}"); } catch (e) { return {}; } }

  /* opts: { purpose:"webp"|"rename"|…, title, describe(info)→説明文 または null(候補に出さない),
            deep: true で下の階層のファイルも数えた親フォルダ(pic など)も候補に出す / prefer: 最初に選んでおくフォルダ /
            newFolder: true で「選んだフォルダの中に新しいフォルダを作る」欄を出す(保存先選び用) }
     info = { path, names:[…] }。開いたら GhDir を返す(キャンセルなら null) */
  function pick(opts) {
    addCss();
    return new Promise(function (resolve) {
      var c = loadCfg(), tok = localStorage.getItem(LS_TOKEN) || "";
      var bg = document.createElement("div"); bg.className = "ghfs-bg";
      bg.innerHTML =
        '<div class="ghfs-box" role="dialog" aria-modal="true"><h3></h3>' +
        '<label>リポジトリ(ユーザー名/リポジトリ名)<input type="text" id="gf-repo" spellcheck="false"></label>' +
        '<label>ブランチ<input type="text" id="gf-branch" spellcheck="false"></label>' +
        '<label>アクセストークン(保存・削除に必要。読むだけなら空欄でも可)<input type="password" id="gf-token" autocomplete="off" spellcheck="false" placeholder="github_pat_..."></label>' +
        '<label class="chk"><input type="checkbox" id="gf-rem"> このブラウザにトークンを記憶する</label>' +
        '<div class="row"><button id="gf-conn" class="pri">接続してフォルダ一覧を出す</button></div>' +
        '<div class="ghfs-st" id="gf-st"></div>' +
        '<label id="gf-dl" hidden>' + (opts.newFolder ? '保存先フォルダ' : '開くフォルダ') + '<select id="gf-dir"></select></label>' +
        '<label id="gf-nl" hidden>この中に新しいフォルダを作って保存(空欄ならそのまま。例: log/2026)<input type="text" id="gf-new" spellcheck="false"></label>' +
        '<p class="ghfs-note">トークンは Fine-grained token で、このリポジトリだけを選び「Contents: Read and write」にしたものを使います(editter/main.html と共通)。</p>' +
        '<div class="row"><button id="gf-cancel">キャンセル</button><button id="gf-open" class="pri" disabled>開く</button></div></div>';
      document.body.appendChild(bg);
      var $ = function (id) { return bg.querySelector("#" + id); };
      bg.querySelector("h3").textContent = opts.title || "GitHubのフォルダを開く";
      $("gf-repo").value = c.repo || "cheeees/cheeeestrpg";
      $("gf-branch").value = c.branch || "main";
      $("gf-token").value = tok;
      $("gf-rem").checked = c.remember !== false;
      var repo = null;
      function st(t, err) { var e = $("gf-st"); e.textContent = t; e.className = "ghfs-st" + (err ? " err" : ""); }
      function close(v) { document.removeEventListener("keydown", onKey, true); bg.remove(); resolve(v); }
      function onKey(e) { if (e.key === "Escape") { e.stopPropagation(); close(null); } }
      document.addEventListener("keydown", onKey, true);
      bg.addEventListener("mousedown", function (e) { if (e.target === bg) close(null); });
      $("gf-cancel").onclick = function () { close(null); };

      $("gf-conn").onclick = async function () {
        var rp = $("gf-repo").value.trim().replace(/^https?:\/\/github\.com\//i, "").replace(/\.git$/, "").replace(/\/+$/, "");
        if (!/^[\w.-]+\/[\w.-]+$/.test(rp)) { st("リポジトリは「ユーザー名/リポジトリ名」の形で入れてください", true); return; }
        $("gf-conn").disabled = true; $("gf-open").disabled = true; $("gf-dl").hidden = true;
        st("GitHubに接続中…");
        var r = new Repo({ repo: rp, branch: $("gf-branch").value.trim() || "main", token: $("gf-token").value.trim() });
        try { await r.connect(); }
        catch (e) { st("接続できません: " + e.message, true); $("gf-conn").disabled = false; return; }
        $("gf-conn").disabled = false;
        repo = r;
        var rem = $("gf-rem").checked, old = loadCfg();
        localStorage.setItem(LS_CFG, JSON.stringify(Object.assign({}, old, { repo: r.repo, branch: r.branch, remember: rem })));
        if (rem && r.token) localStorage.setItem(LS_TOKEN, r.token); else localStorage.removeItem(LS_TOKEN);
        var list = [];
        (opts.deep ? r.deepInfos() : r.dirInfos()).forEach(function (names, path) {
          var d = opts.describe ? opts.describe({ path: path, names: names }) : (names.length + "件");
          if (d != null) list.push({ path: path, text: (path || "(リポジトリ直下)") + "  —  " + d });
        });
        list.sort(function (a, b) { return a.path < b.path ? -1 : a.path > b.path ? 1 : 0; });
        var sel = $("gf-dir"); sel.innerHTML = "";
        if (!list.length) { st("条件に合うフォルダがリポジトリの中にありません", true); return; }
        list.forEach(function (x) { var o = document.createElement("option"); o.value = x.path; o.textContent = x.text; sel.appendChild(o); });
        var last = localStorage.getItem("ghDir:" + (opts.purpose || ""));
        var pref = [last, opts.prefer, "site/img"].filter(function (v) { return v != null && list.some(function (x) { return x.path === v; }); })[0];
        if (pref != null) sel.value = pref;
        $("gf-dl").hidden = false; $("gf-nl").hidden = !opts.newFolder; $("gf-open").disabled = false;
        st(r.repo + "@" + r.branch + " に接続しました。フォルダを選んで「開く」を押してください");
      };
      $("gf-open").onclick = function () {
        if (!repo) return;
        var path = $("gf-dir").value;
        localStorage.setItem("ghDir:" + (opts.purpose || ""), path);
        if (opts.newFolder) {
          var nf = $("gf-new").value.trim().replace(/^\/+|\/+$/g, "");
          if (nf) {
            if (/\\/.test(nf) || /(^|\/)\.\.?(\/|$)/.test(nf) || /\/\//.test(nf)) { st("フォルダ名に使えない文字が含まれています", true); return; }
            path = path ? path + "/" + nf : nf;
          }
        }
        var d = new GhDir(repo, path);
        d.label = repo.repo + "@" + repo.branch + " : " + (path || "/");
        close(d);
      };
      /* 前回の設定とトークンが残っていれば、そのまま自動で接続する */
      if (c.repo && tok) $("gf-conn").click(); else $("gf-token").focus();
    });
  }
  /* 保存に失敗したときなど: 同じフォルダを GitHub の最新で読み直す */
  async function reopen(dir) {
    var r = new Repo({ repo: dir.repo.repo, branch: dir.repo.branch, token: dir.repo.token });
    await r.connect();
    var d = new GhDir(r, dir.path); d.label = dir.label; return d;
  }

  window.GhFS = { pick: pick, reopen: reopen, Repo: Repo, GhDir: GhDir, GhFile: GhFile };
})();
