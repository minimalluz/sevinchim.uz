// Ҳақиқий суратлар келгунча ишлатиладиган безак расмлар (public/media/*.svg)
import { writeFileSync } from "node:fs";
const mic = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round"><rect x="-30" y="-90" width="60" height="110" rx="30" fill="${c}" fill-opacity=".18"/><path d="M-55 -5a55 55 0 0 0 110 0M0 50v40M-35 90h70"/></g>`;
const phones = (x, y, s, c) => `<g transform="translate(${x} ${y}) scale(${s})" fill="none" stroke="${c}" stroke-width="10" stroke-linecap="round"><path d="M-70 20v-20a70 70 0 0 1 140 0v20"/><rect x="-82" y="10" width="34" height="62" rx="14" fill="${c}" fill-opacity=".25"/><rect x="48" y="10" width="34" height="62" rx="14" fill="${c}" fill-opacity=".25"/></g>`;
const wave = (y, c, o) => { let d = `M0 ${y}`; for (let i = 0; i <= 800; i += 20) d += ` L${i} ${y + Math.sin(i / 38) * 26 * Math.sin(i / 160)}`; return `<path d="${d}" stroke="${c}" stroke-opacity="${o}" stroke-width="6" fill="none" stroke-linecap="round"/>`; };
const bars = (c) => Array.from({ length: 24 }, (_, i) => { const h = 30 + Math.abs(Math.sin(i * 1.7)) * 120; return `<rect x="${110 + i * 24}" y="${470 - h}" width="12" height="${h}" rx="6" fill="${c}" fill-opacity=".55"/>`; }).join("");
const scenes = [
  ["#FF5E3A", "#7A1FA2", mic(400, 280, 1.6, "#fff")],
  ["#2B2D6E", "#FF8A3D", phones(400, 270, 1.8, "#fff")],
  ["#0F766E", "#A78BFA", wave(240, "#fff", .8) + wave(300, "#fff", .4)],
  ["#3B0764", "#F43F5E", bars("#fff")],
  ["#9A3412", "#FBBF24", `<g fill="none" stroke="#fff" stroke-width="10" stroke-linejoin="round"><path d="M220 180h170v240H220zM410 180h170v240H410z" fill="#fff" fill-opacity=".14"/><path d="M260 240h90M260 280h90M260 320h60M450 240h90M450 280h90M450 320h60" stroke-linecap="round"/></g>`],
  ["#1E3A8A", "#EC4899", `<g fill="#fff">${Array.from({ length: 28 }, (_, i) => `<circle cx="${(i * 137) % 800}" cy="${(i * 89) % 600}" r="${4 + (i % 4) * 3}" fill-opacity="${.3 + (i % 3) * .2}"/>`).join("")}</g>` + mic(400, 300, 1.2, "#fff")],
];
scenes.forEach(([a, b, art], i) => writeFileSync(`public/media/studio-${i + 1}.svg`,
`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 600"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="${a}"/><stop offset="1" stop-color="${b}"/></linearGradient></defs><rect width="800" height="600" fill="url(#g)"/><circle cx="660" cy="90" r="190" fill="#fff" fill-opacity=".08"/><circle cx="90" cy="560" r="160" fill="#000" fill-opacity=".1"/>${art}</svg>`));

// Бошловчи портрети ўрнига: микрофон ва овоз тўлқинлари
writeFileSync("public/media/host.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 600 750"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A45"/><stop offset=".55" stop-color="#E0457B"/><stop offset="1" stop-color="#5B2A86"/></linearGradient><radialGradient id="r" cx=".5" cy=".38" r=".5"><stop offset="0" stop-color="#fff" stop-opacity=".35"/><stop offset="1" stop-color="#fff" stop-opacity="0"/></radialGradient></defs><rect width="600" height="750" fill="url(#g)"/><rect width="600" height="750" fill="url(#r)"/>${[120, 170, 220].map((r, i) => `<circle cx="300" cy="330" r="${r}" fill="none" stroke="#fff" stroke-opacity="${.28 - i * .07}" stroke-width="3"/>`).join("")}${mic(300, 340, 2.1, "#fff")}<g fill="#fff" fill-opacity=".5">${Array.from({ length: 21 }, (_, i) => { const h = 16 + Math.abs(Math.sin(i * 1.3)) * 60; return `<rect x="${95 + i * 20}" y="${660 - h / 2}" width="10" height="${h}" rx="5"/>`; }).join("")}</g></svg>`);

// Илова иконкаси
writeFileSync("public/icons/icon.svg", `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#FF7A45"/><stop offset="1" stop-color="#C2367A"/></linearGradient></defs><rect width="512" height="512" fill="url(#g)"/><g fill="none" stroke="#fff" stroke-width="26" stroke-linecap="round"><rect x="211" y="112" width="90" height="170" rx="45" fill="#fff"/><path d="M161 240a95 95 0 0 0 190 0M256 335v60M206 395h100"/><path d="M110 200a170 170 0 0 0 0 110M402 200a170 170 0 0 1 0 110" stroke-opacity=".6"/></g></svg>`);
console.log("ok");
