/* ================================================================
   TRPGいろいろ  ─  site/js/main.js(動き)
   ・ページ切り替え / トップに戻るボタン / 画像の拡大表示
   ・ページを増やしても書き換え不要(main.html にメニューと section を足すだけ)
   ・サイト名を変えるときだけ、下の SITE_NAME を書き換える
   ================================================================ */

var SITE_NAME = "TRPGいろいろ";   /* ブラウザのタブに出る名前(例: 武器 | TRPGいろいろ) */

(function () {
  var pages = [].slice.call(document.querySelectorAll(".page"));
  var links = [].slice.call(document.querySelectorAll(".nav-list a"));
  var check = document.getElementById("nav-check");
  var btn = document.getElementById("to-top");

  function show() {
    var id = location.hash.slice(1) || "top";
    var cur = pages.filter(function (p) { return p.id === "p-" + id; })[0] || pages[0];
    pages.forEach(function (p) { p.classList.toggle("on", p === cur); });
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + cur.id.slice(2)) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = (cur.dataset.title ? cur.dataset.title + " | " : "") + SITE_NAME;
    check.checked = false;
    window.scrollTo(0, 0);
  }
  window.addEventListener("hashchange", show);
  show();

  window.addEventListener("scroll", function () { btn.classList.toggle("show", window.scrollY > 300); }, { passive: true });
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
