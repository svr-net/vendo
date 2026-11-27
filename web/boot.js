/* Loaded first on every page of the GitHub Pages build. Installs the Service Worker that runs
   Vendo's server (with SQLite as WebAssembly) inside the browser, and gates API calls until it is ready. */
(function () {
  var base = document.querySelector('base').href;
  function banner(html, kind) {
    var add = function () {
      var el = document.createElement('div');
      el.setAttribute('role', 'note');
      el.style.cssText = 'padding:8px 16px;text-align:center;font:14px/1.4 system-ui,sans-serif;' +
        (kind === 'bad' ? 'background:#fde8ea;color:#a3162a' : 'background:#eceafe;color:#3b33b8');
      el.innerHTML = html;
      document.body.prepend(el);
    };
    if (document.body) add(); else document.addEventListener('DOMContentLoaded', add);
  }
  if (!('serviceWorker' in navigator) || !window.isSecureContext) {
    banner('This demo needs a browser with Service Worker support (HTTPS).', 'bad');
    window.__vendoReady = Promise.reject(new Error('Service Workers unavailable'));
    window.__vendoReady.catch(function () {});
    return;
  }
  window.__vendoReady = navigator.serviceWorker.register(base + 'sw.js', { scope: base }).then(function () {
    if (navigator.serviceWorker.controller) return;
    return new Promise(function (resolve) {
      navigator.serviceWorker.addEventListener('controllerchange', function () { resolve(); }, { once: true });
    });
  });
})();
