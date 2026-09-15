import {readFile, writeFile} from "node:fs/promises";
import {extname, resolve} from "node:path";

const root = resolve(import.meta.dirname, "..");
const outputDirectory = resolve(root, "dist");
const assetDirectory = resolve(outputDirectory, "assets");

const mimeTypes = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".svg": "image/svg+xml",
  ".woff2": "font/woff2",
  ".woff": "font/woff",
};

async function dataUri(filename) {
  const bytes = await readFile(resolve(assetDirectory, filename));
  const mime = mimeTypes[extname(filename).toLowerCase()] || "application/octet-stream";
  return `data:${mime};base64,${bytes.toString("base64")}`;
}

async function inlineCssAssets(source) {
  let result = source;
  const references = [...new Set([...source.matchAll(/url\((?:["']?)(?:\.\/)?([^)'"?#]+)(?:["']?)\)/g)].map((match) => match[1]))];
  for (const filename of references) {
    if (filename.startsWith("data:")) continue;
    const uri = await dataUri(filename);
    result = result.split(`url(./${filename})`).join(`url(${uri})`);
    result = result.split(`url(${filename})`).join(`url(${uri})`);
  }
  return result;
}

async function inlineJavascriptAssets(source) {
  let result = source;
  const literalReferences = [...new Set([...source.matchAll(/\.\/assets\/([A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|svg))/g)].map((match) => match[1]))];
  for (const filename of literalReferences) {
    result = result.split(`./assets/${filename}`).join(await dataUri(filename));
  }

  const viteUrlReferences = [...new Set([...result.matchAll(/new URL\(["'](?:\.\/)?([A-Za-z0-9_.-]+\.(?:png|jpe?g|webp|svg))["'],\s*import\.meta\.url\)\.href/g)].map((match) => match[1]))];
  for (const filename of viteUrlReferences) {
    const uri = JSON.stringify(await dataUri(filename));
    const escapedFilename = filename.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    result = result.replace(
      new RegExp(`new URL\\(["'](?:\\.\\/)?${escapedFilename}["'],\\s*import\\.meta\\.url\\)\\.href`, "g"),
      uri,
    );
  }
  return result;
}

const indexHtml = await readFile(resolve(outputDirectory, "index.html"), "utf8");
const javascriptName = indexHtml.match(/src="\.\/assets\/([^"]+\.js)"/)?.[1];
const cssName = indexHtml.match(/href="\.\/assets\/([^"]+\.css)"/)?.[1];
if (!javascriptName || !cssName) throw new Error("无法定位 Vite 编译后的 JS/CSS 资源");

const [compiledCss, compiledJavascript] = await Promise.all([
  readFile(resolve(assetDirectory, cssName), "utf8"),
  readFile(resolve(assetDirectory, javascriptName), "utf8"),
]);
const [css, javascript] = await Promise.all([
  inlineCssAssets(compiledCss),
  inlineJavascriptAssets(compiledJavascript),
]);

const html = `<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1">
    <title>ZYMIX-UI-设计验收工作台</title>
    <style>${css}</style>
  </head>
  <body>
    <div id="root"><div data-loading style="display:grid;place-items:center;height:100vh;font:14px system-ui;color:#666">正在加载 ZYMIX-UI-设计验收工作台…</div></div>
    <script>
      (() => {
        const showBootError = (message) => {
          const root = document.getElementById("root");
          if (!root) return;
          root.innerHTML = '<div style="max-width:680px;margin:15vh auto;padding:24px;border:1px solid #ead3cf;border-radius:12px;background:#fff7f5;color:#6f2f28;font:14px/1.6 system-ui"><strong>工作台启动失败</strong><div style="margin-top:8px"></div></div>';
          root.lastElementChild.lastElementChild.textContent = message || "未知错误";
        };
        // Boot phase only. These handlers replace #root wholesale, so once the app has mounted a
        // late runtime error must not wipe the reviewer's uploaded evidence and edited issues.
        const booting = () => Boolean(document.querySelector("#root [data-loading]"));
        const onError = (event) => { if (booting()) showBootError(event.message); };
        const onRejection = (event) => { if (booting()) showBootError(event.reason?.message || String(event.reason)); };
        window.addEventListener("error", onError);
        window.addEventListener("unhandledrejection", onRejection);
        window.setTimeout(() => {
          if (booting()) showBootError("应用脚本未完成启动，请重新打开此文件。");
          window.removeEventListener("error", onError);
          window.removeEventListener("unhandledrejection", onRejection);
        }, 4000);
      })();
    </script>
    <script type="module">${javascript}</script>
  </body>
</html>`;

// The single served artifact lives beside the app source; dist/ is a disposable build intermediate.
await writeFile(resolve(root, "workbench.html"), html);
