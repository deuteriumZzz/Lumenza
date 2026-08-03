/* Lumenza Knowledge embed widget — vanilla JS, no build step, no
 * dependencies. Meant to run unmodified on an arbitrary third-party
 * domain via a single <script src="…/static/embed.js" data-key="…">
 * tag. Talks to /api/public/embed/<key>/ask/?q=… (a plain GET, CORS
 * "simple request" — the API sets Access-Control-Allow-Origin: * on that
 * one endpoint specifically, see backend/knowledge/views.py).
 */
(function () {
  "use strict";

  var currentScript = document.currentScript;
  if (!currentScript) return;

  var publicKey = currentScript.getAttribute("data-key");
  if (!publicKey) {
    console.error("[lumenza-embed] missing data-key attribute on the script tag");
    return;
  }

  var apiOrigin = new URL(currentScript.src).origin;
  var askUrl = apiOrigin + "/api/public/embed/" + encodeURIComponent(publicKey) + "/ask/";

  var PREFIX = "lumenza-embed-";

  var style = document.createElement("style");
  style.textContent =
    "." + PREFIX + "bubble{position:fixed;bottom:20px;right:20px;width:56px;height:56px;" +
    "border-radius:9999px;background:#6d4aff;color:#fff;border:none;cursor:pointer;" +
    "box-shadow:0 4px 16px rgba(0,0,0,.2);font-size:24px;z-index:2147483000;}" +
    "." + PREFIX + "panel{position:fixed;bottom:88px;right:20px;width:320px;max-width:90vw;" +
    "max-height:60vh;background:#fff;color:#111;border-radius:16px;box-shadow:0 8px 32px rgba(0,0,0,.24);" +
    "display:none;flex-direction:column;overflow:hidden;z-index:2147483000;font-family:sans-serif;font-size:14px;}" +
    "." + PREFIX + "panel.open{display:flex;}" +
    "." + PREFIX + "log{flex:1;overflow-y:auto;padding:12px;display:flex;flex-direction:column;gap:8px;}" +
    "." + PREFIX + "msg{padding:8px 10px;border-radius:10px;max-width:85%;line-height:1.4;}" +
    "." + PREFIX + "msg.user{align-self:flex-end;background:#6d4aff;color:#fff;}" +
    "." + PREFIX + "msg.bot{align-self:flex-start;background:#f1f1f4;color:#111;}" +
    "." + PREFIX + "form{display:flex;gap:6px;padding:10px;border-top:1px solid #eee;}" +
    "." + PREFIX + "input{flex:1;border:1px solid #ddd;border-radius:8px;padding:8px 10px;font-size:14px;}" +
    "." + PREFIX + "send{border:none;background:#6d4aff;color:#fff;border-radius:8px;padding:0 12px;cursor:pointer;}";
  document.head.appendChild(style);

  var bubble = document.createElement("button");
  bubble.className = PREFIX + "bubble";
  bubble.type = "button";
  bubble.setAttribute("aria-label", "Открыть чат");
  bubble.textContent = "💬";

  var panel = document.createElement("div");
  panel.className = PREFIX + "panel";

  var log = document.createElement("div");
  log.className = PREFIX + "log";

  var form = document.createElement("form");
  form.className = PREFIX + "form";
  form.innerHTML =
    '<input class="' + PREFIX + 'input" type="text" placeholder="Задайте вопрос…" autocomplete="off" />' +
    '<button class="' + PREFIX + 'send" type="submit">→</button>';

  panel.appendChild(log);
  panel.appendChild(form);
  document.body.appendChild(bubble);
  document.body.appendChild(panel);

  bubble.addEventListener("click", function () {
    panel.classList.toggle("open");
  });

  function addMessage(text, role) {
    var el = document.createElement("div");
    el.className = PREFIX + "msg " + role;
    el.textContent = text;
    log.appendChild(el);
    log.scrollTop = log.scrollHeight;
  }

  form.addEventListener("submit", function (event) {
    event.preventDefault();
    var input = form.querySelector("input");
    var question = input.value.trim();
    if (!question) return;
    addMessage(question, "user");
    input.value = "";

    fetch(askUrl + "?q=" + encodeURIComponent(question))
      .then(function (response) {
        return response.json().then(function (data) {
          return { ok: response.ok, data: data };
        });
      })
      .then(function (result) {
        var text = result.ok && result.data.answer
          ? result.data.answer
          : (result.data && result.data.detail) || "Не удалось получить ответ.";
        addMessage(text, "bot");
      })
      .catch(function () {
        addMessage("Не удалось получить ответ.", "bot");
      });
  });
})();
