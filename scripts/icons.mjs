// SVG иконкадан PWA учун PNG иконкалар ва OG расмини яратади (Playwright керак)
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { chromium } = require("playwright");
const svg = readFileSync("public/icons/icon.svg", "utf8");
// OG расм учун бошловчининг сурати
const photo = readFileSync("public/media/sevinch-studiyada.jpg").toString("base64");
const b = await chromium.launch();
const p = await b.newPage();
for (const [name, size, pad] of [["icon-32", 32, 0], ["icon-192", 192, 0], ["icon-512", 512, 0], ["apple-touch-icon", 180, 0], ["icon-maskable-512", 512, 0]]) {
  await p.setViewportSize({ width: size, height: size });
  await p.setContent(`<style>*{margin:0}body{width:${size}px;height:${size}px}</style>${svg.replace("<svg ", `<svg width="${size}" height="${size}" `)}`);
  await p.screenshot({ path: `public/icons/${name}.png`, omitBackground: false });
}
await p.setViewportSize({ width: 1200, height: 630 });
await p.setContent(`<!doctype html><meta charset="utf-8"><style>
*{margin:0;box-sizing:border-box}body{width:1200px;height:630px;background:#0e0c14;color:#f7f3fb;font-family:system-ui,sans-serif;display:flex;align-items:center;gap:56px;padding:64px;position:relative;overflow:hidden}
.glow{position:absolute;right:-120px;top:-160px;width:640px;height:640px;border-radius:50%;background:radial-gradient(closest-side,rgba(255,106,61,.35),transparent)}
.art{width:330px;height:412px;border-radius:40px;overflow:hidden;flex:none;box-shadow:0 30px 80px rgba(224,69,123,.35)}
.art img{width:100%;height:100%;object-fit:cover;object-position:52% 35%}
h1{font-size:92px;font-weight:800;letter-spacing:-2px;line-height:1}
p{font-size:34px;color:#aaa3b8;margin-top:22px;line-height:1.3}
.pill{display:inline-flex;align-items:center;gap:12px;margin-top:36px;background:rgba(255,59,92,.16);color:#ff3b5c;font-weight:700;font-size:26px;padding:12px 22px;border-radius:999px}
.dot{width:14px;height:14px;border-radius:50%;background:#ff3b5c}
</style><div class="glow"></div><div class="art"><img src="data:image/jpeg;base64,${photo}" alt=""></div><div><h1>Севинчим</h1><p>Севинч — радио бошловчи<br>Жонли эфир ва архив дастурлар</p><span class="pill"><span class="dot"></span>sevinchim.uz</span></div>`);
await p.screenshot({ path: "public/og.png" });
await b.close();
console.log("ok");
