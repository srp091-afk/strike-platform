/**
 * Загрузчик веб-виджета для сайтов клиентов:
 * <script src="https://<платформа>/widget/embed.js" data-agent="<agentId>" async></script>
 *
 * Создаёт fixed-iframe с /widget/chat/<agentId> и меняет его размер по
 * postMessage из виджета: свёрнутый — 76×76 (только лаунчер, без невидимой
 * подложки над сайтом), открытый — 432×652, на узких экранах — весь экран.
 * Угол берётся из события виджета, поэтому смена widget_position в кабинете
 * применяется без переустановки кода.
 */
const EMBED_SCRIPT = `(function () {
  var script = document.currentScript;
  var agent = script && script.getAttribute("data-agent");
  if (!agent) return;
  var registry = (window.__strikeWidgets = window.__strikeWidgets || {});
  if (registry[agent]) return;
  registry[agent] = true;

  var origin = new URL(script.src).origin;
  var positions = ["bottom-right", "bottom-left", "bottom-center"];
  var position = "bottom-right";
  var open = false;
  var frame = document.createElement("iframe");
  var style = frame.style;

  frame.src = origin + "/widget/chat/" + encodeURIComponent(agent);
  frame.title = "Чат";
  frame.setAttribute("allowtransparency", "true");
  style.position = "fixed";
  style.zIndex = "2147483000";
  style.border = "0";
  style.margin = "0";
  style.padding = "0";
  style.background = "transparent";
  style.colorScheme = "dark";
  style.opacity = "0";
  style.pointerEvents = "none";
  style.transition = "opacity .2s ease";

  function layout() {
    var full = open && window.innerWidth < 480;
    var gap = full ? "0" : "8px";
    style.width = full ? "100vw" : open ? "min(432px, calc(100vw - 16px))" : "76px";
    style.height = full ? "100vh" : open ? "min(652px, calc(100vh - 16px))" : "76px";
    if (full) style.height = "100dvh";
    else if (open) style.height = "min(652px, calc(100dvh - 16px))";
    style.top = "auto";
    style.bottom = gap;
    style.left = "auto";
    style.right = "auto";
    style.transform = "none";
    if (full) style.left = "0";
    else if (position === "bottom-left") style.left = gap;
    else if (position === "bottom-center") {
      style.left = "50%";
      style.transform = "translateX(-50%)";
    } else style.right = gap;
  }

  window.addEventListener("message", function (event) {
    if (event.source !== frame.contentWindow || event.origin !== origin) return;
    var data = event.data;
    if (!data || data.source !== "strike-widget") return;
    if (positions.indexOf(data.position) !== -1) position = data.position;
    if (data.type === "open") open = true;
    if (data.type === "close") open = false;
    if (data.type === "ready") {
      style.opacity = "1";
      style.pointerEvents = "auto";
    }
    layout();
  });
  window.addEventListener("resize", layout);
  layout();

  function mount() {
    document.body.appendChild(frame);
  }
  if (document.body) mount();
  else document.addEventListener("DOMContentLoaded", mount);
})();
`;

export function GET() {
  return new Response(EMBED_SCRIPT, {
    headers: {
      "Content-Type": "application/javascript; charset=utf-8",
      "Cache-Control": "public, max-age=300, s-maxage=3600",
      "Access-Control-Allow-Origin": "*",
    },
  });
}
