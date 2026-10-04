/* ================================================================
   editter 共通メニュー  ─  editter/editter.js
   ・各ページの </body> の直前(または <head> 内)に、この1行を足すだけで上部にメニューが出ます:
        <script src="editter.js"></script>
   ・CSS(editter.css)は、この JS が自動で読み込みます(HTML 側に <link> は不要)
   ・ページを増やしたいとき → 下の TOOLS に1行足す(すべてのページに反映されます)
   ・サイト本体へのリンク先を変えたいとき → SITE_URL を書き換える
   ================================================================ */
(function () {
  /* ■ メニューの項目(上から順に左→右へ並ぶ)。href は editter フォルダ内のファイル名 */
  var TOOLS = [
    { href: "main.html",         label: "エディタ", sub: "editter" },
    { href: "chara-editter.html", label: "キャラ編集",    sub: "chara" },
    { href: "formatter.html",    label: "ログ整形",      sub: "formatter" },
    { href: "webp.html",         label: "WebP変換",      sub: "webp" },
    { href: "rename.html",       label: "リネーム",      sub: "rename" },
    { href: "icon.html",         label: "アイコン変換",  sub: "icon" }
  ];
  /* ■ 右端の「サイトを見る」リンク先(空文字にするとリンクごと消える) */
  var SITE_URL = "../site/main.html";

  /* CSS をこの JS と同じ場所から読み込む */
  var me = document.currentScript;
  var base = me && me.src ? me.src.replace(/[^\/]*(\?.*)?$/, "") : "";
  if (!document.querySelector('link[data-et-css]')) {
    var css = document.createElement("link");
    css.rel = "stylesheet"; css.href = base + "editter.css"; css.setAttribute("data-et-css", "");
    document.head.appendChild(css);
  }

  /* 今開いているページ名(editter/ や editter/main や main.html を同じものとして扱う) */
  function pageName(p) {
    var f = (p || "").split(/[?#]/)[0].split("/").pop().replace(/\.html$/i, "");
    return f === "" || f === "index" ? "main" : f;
  }
  var here = pageName(location.pathname);

  function build() {
    if (document.getElementById("et-nav")) return;
    var nav = document.createElement("nav");
    nav.id = "et-nav"; nav.className = "et-nav"; nav.setAttribute("aria-label", "editterメニュー");
    var ul = document.createElement("ul");
    TOOLS.forEach(function (t) {
      var li = document.createElement("li"), a = document.createElement("a");
      a.href = t.href;
      a.innerHTML = t.label + (t.sub ? "<small>" + t.sub + "</small>" : "");
      if (pageName(t.href) === here) a.setAttribute("aria-current", "page");
      li.appendChild(a); ul.appendChild(li);
    });
    nav.appendChild(ul);
    if (SITE_URL) {
      var s = document.createElement("a");
      s.className = "et-site"; s.href = SITE_URL; s.target = "_blank"; s.rel = "noopener";
      s.textContent = "サイトを見る ↗";
      nav.appendChild(s);
    }
    document.body.insertBefore(nav, document.body.firstChild);
  }
  if (document.body) build();
  else document.addEventListener("DOMContentLoaded", build);
})();
