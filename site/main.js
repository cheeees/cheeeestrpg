/* ================================================================
   TRPGいろいろ  ─  site/js/main.js(動き)
   ================================================================ */

var SITE_NAME = "TRPGいろいろ";

function executeScriptsSequentially(scripts) {
  if (!scripts || scripts.length === 0) return;
  
  var promise = Promise.resolve();
  scripts.forEach(function(old) {
    promise = promise.then(function() {
      return new Promise(function(resolve) {
        var s = document.createElement("script");
        [].slice.call(old.attributes).forEach(function(a) {
          s.setAttribute(a.name, a.value);
        });
        
        if (old.src) {
          s.onload = s.onerror = resolve;
          document.head.appendChild(s);
        } else {
          s.text = old.textContent;
          if (old.parentNode) {
            old.parentNode.replaceChild(s, old);
          } else {
            document.head.appendChild(s);
          }
          resolve();
        }
      });
    });
  });
}

function loadIncludes(scope) {
  [].slice.call(scope.querySelectorAll("[data-include]")).forEach(function (el) {
    var url = el.getAttribute("data-include");
    el.removeAttribute("data-include");
    fetch(url)
      .then(function (r) { if (!r.ok) throw new Error(r.status); return r.text(); })
      .then(function (html) {
        el.innerHTML = html;
        el.classList.add("loaded");
        var scripts = [].slice.call(el.querySelectorAll("script"));
        executeScriptsSequentially(scripts);
      })
      .catch(function () { el.textContent = "読み込めませんでした: " + url + "(ファイルの場所と名前を確認してください)"; });
  });
}

(function () {
  var pages = [].slice.call(document.querySelectorAll(".page"));
  var check = document.getElementById("nav-check");
  var btn = document.getElementById("to-top");

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
  var first = true;

  function show() {
    var id = location.hash.slice(1) || "top";
    var cur = pages.filter(function (p) { return p.id === "p-" + id; })[0] || pages[0];
    pages.forEach(function (p) { p.classList.toggle("on", p === cur); });
    cur.classList.remove("on"); void cur.offsetWidth; cur.classList.add("on");
    links.forEach(function (a) {
      if (a.getAttribute("href") === "#" + cur.id.slice(2)) a.setAttribute("aria-current", "page");
      else a.removeAttribute("aria-current");
    });
    document.title = (cur.dataset.title ? cur.dataset.title + " | " : "") + SITE_NAME;
    check.checked = false;
    fabOpen(false);
    var hero = cur.querySelector(".hero");
    var top = (!first && hero) ? cur.offsetTop + hero.offsetHeight : 0;
    window.scrollTo({ top: top, behavior: "instant" });
    first = false;
    loadIncludes(cur);
  }
  window.addEventListener("hashchange", show);
  show();

  function updateFab() {
    var on = window.scrollY > 300;
    btn.classList.toggle("show", on);
    fab.classList.toggle("show", on);
    if (!on) fabOpen(false);
  }
  window.addEventListener("scroll", updateFab, { passive: true });
  updateFab();
  btn.addEventListener("click", function () { window.scrollTo({ top: 0, behavior: "smooth" }); });

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