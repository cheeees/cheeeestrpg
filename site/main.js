/* ================================================================
   TRPGいろいろ  ─  site/js/main.js(動き)
   ・ページ切り替え / トップに戻るボタン / 画像の拡大表示 / 埋め込みパーツの読み込み
   ・ページを増やしても書き換え不要(main.html にメニューと section を足すだけ)
   ・サイト名を変えるときだけ、下の SITE_NAME を書き換える
   ================================================================ */

var SITE_NAME = "TRPGいろいろ";   /* ブラウザのタブに出る名前(例: 武器 | TRPGいろいろ) */

/* 埋め込みパーツの読み込み
   main.html に <div data-include="embed/ファイル名.html"></div> と書くと、そのファイルの中身が入ります。
   ・そのページを開いたときに初めて読み込みます(使わないページの分は読み込まない)
   ・読み込む HTML の中の <script> は動きません(<style> と HTML はそのまま動きます)
   ・GitHub Pages では動きます。パソコンでファイルを直接開いたときは読み込めません */
function loadIncludes(scope) {
  [].slice.call(scope.querySelectorAll("[data-include]")).forEach(function (el) {
    var url = el.getAttribute("data-include");
    el.removeAttribute("data-include");
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) { el.innerHTML = html; el.classList.add("loaded"); })
      .catch(function () { el.textContent = "読み込めませんでした: " + url + "(ファイルの場所と名前を確認してください)"; });
  });
}

(function () {
  var pages = [].slice.call(document.querySelectorAll(".page"));
  var check = document.getElementById("nav-check");
  var btn = document.getElementById("to-top");

  /* 右下のメニューボタン: 上のメニュー(.nav-list)の項目をそのままコピーして一覧を作る。
     ページを増やしても、ここは書き換え不要 */
  var fab = document.getElementById("fab-menu");
  var fabBtn = document.getElementById("fab-btn");
  var fabList = document.getElementById("fab-list");
  [].slice.call(document.querySelectorAll(".nav-list a")).forEach(function (a) {
    var li = document.createElement("li"), c = a.cloneNode(true);
    c.removeAttribute("aria-current");
    li.appendChild(c);
    fabList.appendChild(li);
  });
  function fabOpen(open) {
    fabList.hidden = !open;
    fabBtn.setAttribute("aria-expanded", open ? "true" : "false");
    fabBtn.setAttribute("aria-label", open ? "メニューを閉じる" : "メニューを開く");
  }
  fabBtn.addEventListener("click", function () { fabOpen(fabList.hidden); });
  document.addEventListener("click", function (e) { if (!fab.contains(e.target)) fabOpen(false); });
  document.addEventListener("keydown", function (e) { if (e.key === "Escape") fabOpen(false); });

  var links = [].slice.call(document.querySelectorAll(".nav-list a, .fab-list a"));

  var first = true;   /* 最初の表示だけは一番上から(hero画像も見せる) */

  function show() {
    var id = location.hash.slice(1) || "top";
    var cur = pages.filter(function (p) { return p.id === "p-" + id; })[0] || pages[0];
    pages.forEach(function (p) { p.classList.toggle("on", p === cur); });
    /* アニメーションを必ず最初から再生し直す */
    cur.classList.remove("on"); void cur.offsetWidth; cur.classList.add("on");
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + cur.id.slice(2)) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = (cur.dataset.title ? cur.dataset.title + " | " : "") + SITE_NAME;
    check.checked = false;
    fabOpen(false);
    /* ページを切り替えたとき: hero画像があるページは、画像を飛ばして中身の先頭へ。
       ない(画像なしの)ページは一番上へ。移動はアニメーションなしで一瞬で行う */
    var hero = cur.querySelector(".hero");
    var top = (!first && hero) ? cur.offsetTop + hero.offsetHeight : 0;
    window.scrollTo({ top: top, behavior: "instant" });
    first = false;
    loadIncludes(cur);
  }
  window.addEventListener("hashchange", show);
  show();

  /* 少しスクロールしたら、メニューボタンとトップに戻るボタンを出す */
  function updateFab() {
    var on = window.scrollY > 300;
    btn.classList.toggle("show", on);
    fab.classList.toggle("show", on);
    if (!on) fabOpen(false);
  }
  window.addEventListener("scroll", updateFab, { passive: true });
  updateFab();
  btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

  /* 画像の拡大表示 */
  var lb = document.getElementById("lightbox"), lbImg = lb.querySelector("img");
  document.addEventListener("click", function (e) {
    var z = e.target.closest(".zoomable");
    if (z) { lbImg.src = z.currentSrc || z.src; lbImg.alt = z.alt; lb.hidden = false; }
    else if (!lb.hidden) { lb.hidden = true; }
  });
  document.addEventListener("keydown", function (e) {
    if (e.key === "Escape") lb.hidden = true;
    if (e.key === "Enter" && document.activeElement.classList.contains("zoomable")) document.activeElement.click();
  });
})();
