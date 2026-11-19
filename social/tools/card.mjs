// Renders 1080x1080 social cards for Jason Robinson / Prosperity Home Mortgage.
// Usage: node card.mjs <outDir> <cards.json>
// Needs: @sparticuz/chromium puppeteer-core @fontsource/bebas-neue @fontsource/source-sans-3
//        @fontsource/public-sans @fontsource/permanent-marker  (in ./node_modules)
// cards.json = [{ name, layout, ... }]  layouts:
//  bold    {kicker?, headline, highlight?, sub?, sticker?}      big punchy headline, marker sticker
//  chat    {kicker?, bubbles:[{from:"them"|"me", text}], punchline?}   text-message thread
//  versus  {kicker?, headline?, left:{title, items[]}, right:{title, items[]}}   e.g. Expectation vs Reality
//  warning {kicker?, headline, items[]?, sub?}                   caution-tape style
// Any text field is plain text (HTML-escaped). "highlight" = a word/phrase inside headline to paint bronze.
import chromium from '@sparticuz/chromium';
import puppeteer from 'puppeteer-core';
import fs from 'fs'; import path from 'path';

const [outDir, cardsFile] = process.argv.slice(2);
const cards = JSON.parse(fs.readFileSync(cardsFile, 'utf8'));
const nm = path.resolve('node_modules/@fontsource');
const face = (pkg, file, w, fam) => `@font-face{font-family:'${fam}';font-weight:${w};src:url(file://${nm}/${pkg}/files/${file})}`;
const css = [
  face('bebas-neue', 'bebas-neue-latin-400-normal.woff2', 400, 'Bebas Neue'),
  face('permanent-marker', 'permanent-marker-latin-400-normal.woff2', 400, 'Permanent Marker'),
  ...[400, 600, 700].map(w => face('source-sans-3', `source-sans-3-latin-${w}-normal.woff2`, w, 'Source Sans 3')),
  ...[700, 800].map(w => face('public-sans', `public-sans-latin-${w}-normal.woff2`, w, 'Public Sans')),
].join('\n');
const esc = s => String(s ?? '').replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const hl = (text, word, color) => {
  const t = esc(text); if (!word) return t;
  const w = esc(word); const i = t.toLowerCase().indexOf(w.toLowerCase());
  return i < 0 ? t : t.slice(0, i) + `<span style="color:${color}">${t.slice(i, i + w.length)}</span>` + t.slice(i + w.length);
};

const NAVY = '#183F52', IVORY = '#F5F2EC', STONE = '#E7E0D5', BRONZE = '#A88B68', CHAR = '#343B3D', GOLD = '#F2B233', RED = '#C8402F';
const foot = (dark) => `<div class="foot" style="background:${dark ? '#0F2A38' : NAVY}"><b>jasonhomeloan.com</b>Jason Robinson | Sr. Loan Officer | NMLS 1008330 | (913) 687-7247<br>Prosperity Home Mortgage, LLC | NMLS #75164 | Equal Housing Opportunity</div>`;
const kick = (k, color) => k ? `<div class="kicker" style="color:${color}">${esc(k)}</div>` : '';

const layouts = {
  bold: c => `<body style="background:${NAVY};color:${IVORY}">
<div class="main" style="padding:90px 80px 30px">
${kick(c.kicker, GOLD)}
<h1 style="font:400 ${c.headline.length > 40 ? 120 : 150}px/0.92 'Bebas Neue';letter-spacing:1px;color:${IVORY};${c.sticker ? 'max-width:680px;' : ''}">${hl(c.headline, c.highlight, GOLD)}</h1>
<div style="width:220px;height:10px;background:${GOLD};margin:34px 0 0;border-radius:5px;transform:rotate(-1.5deg)"></div>
${c.sub ? `<p style="font:400 38px/1.3 'Source Sans 3';color:#DDE6EA;margin-top:30px">${esc(c.sub)}</p>` : ''}
</div>
${c.sticker ? `<div class="sticker">${esc(c.sticker)}</div>` : ''}
${foot(true)}</body>`,

  chat: c => `<body style="background:${STONE};color:${CHAR}">
<div class="main" style="padding:70px 70px 20px;justify-content:flex-start;gap:22px">
${kick(c.kicker, NAVY)}
${(c.bubbles || []).map(b => b.from === 'me'
    ? `<div style="align-self:flex-end;max-width:78%;background:#2F7DF6;color:#fff;font:600 36px/1.25 'Source Sans 3';padding:20px 28px;border-radius:34px 34px 8px 34px">${esc(b.text)}</div>`
    : `<div style="align-self:flex-start;max-width:78%;background:#ffffff;color:${CHAR};font:600 36px/1.25 'Source Sans 3';padding:20px 28px;border-radius:34px 34px 34px 8px;box-shadow:0 2px 0 rgba(0,0,0,.06)">${esc(b.text)}</div>`).join('\n')}
${c.punchline ? `<div style="margin-top:auto;font:400 52px/1.05 'Permanent Marker';color:${RED};transform:rotate(-2deg)">${esc(c.punchline)}</div>` : ''}
</div>
${foot(false)}</body>`,

  versus: c => `<body style="background:${IVORY};color:${CHAR}">
<div class="main" style="padding:70px 60px 30px;justify-content:flex-start;gap:26px">
${kick(c.kicker, BRONZE)}
${c.headline ? `<h1 style="font:400 92px/0.95 'Bebas Neue';color:${NAVY}">${esc(c.headline)}</h1>` : ''}
<div style="display:flex;gap:22px;flex:1">
${[['left', '#ffffff', CHAR, RED], ['right', NAVY, IVORY, GOLD]].map(([k, bg, fg, ac]) => `<div style="flex:1;background:${bg};color:${fg};border-radius:22px;padding:34px 32px;display:flex;flex-direction:column;gap:26px;${k === 'left' ? 'border:3px solid #D6CDBF' : ''}">
<div style="font:400 58px/1 'Permanent Marker';color:${ac}">${esc(c[k]?.title)}</div>
${(c[k]?.items || []).map(i => `<div style="font:600 38px/1.22 'Source Sans 3'">${esc(i)}</div>`).join('')}
</div>`).join('\n')}
</div>
</div>
${foot(false)}</body>`,

  warning: c => `<body style="background:#111A1F;color:${IVORY}">
<div style="height:46px;background:repeating-linear-gradient(-45deg,${GOLD} 0 34px,#111A1F 34px 68px)"></div>
<div class="main" style="padding:56px 80px 30px">
${kick(c.kicker || 'WARNING', GOLD)}
<h1 style="font:400 ${c.headline.length > 34 ? 104 : 128}px/0.93 'Bebas Neue';color:#ffffff">${hl(c.headline, c.highlight, GOLD)}</h1>
${(c.items || []).length ? `<div style="display:flex;flex-direction:column;gap:12px;margin-top:30px">${c.items.map(i => `<div style="font:600 34px/1.25 'Source Sans 3';color:#E9E4DA"><span style="color:${RED};font-weight:700">✕</span>&nbsp; ${esc(i)}</div>`).join('')}</div>` : ''}
${c.sub ? `<p style="font:400 46px/1.1 'Permanent Marker';color:${GOLD};margin-top:30px;transform:rotate(-1.5deg)">${esc(c.sub)}</p>` : ''}
</div>
<div style="height:46px;background:repeating-linear-gradient(-45deg,${GOLD} 0 34px,#111A1F 34px 68px)"></div>
${foot(true)}</body>`,
};

fs.mkdirSync(outDir, { recursive: true });
const b = await puppeteer.launch({ executablePath: await chromium.executablePath(), args: [...chromium.args, '--allow-file-access-from-files'], headless: true });
const pg = await b.newPage(); await pg.setViewport({ width: 1080, height: 1080 });
for (const c of cards) {
  const body = (layouts[c.layout] || layouts.bold)(c);
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>${css}
*{margin:0;padding:0;box-sizing:border-box}
body{width:1080px;height:1080px;overflow:hidden;font-family:'Source Sans 3';display:flex;flex-direction:column;position:relative}
.main{flex:1;display:flex;flex-direction:column;justify-content:center}
.kicker{font:800 28px 'Public Sans';letter-spacing:5px;text-transform:uppercase;margin-bottom:22px}
.foot{color:${IVORY};padding:26px 70px;font:600 23px/1.45 'Source Sans 3'}
.foot b{font:700 30px 'Public Sans';display:block;margin-bottom:2px}
.sticker{position:absolute;right:56px;top:70px;width:250px;height:250px;border-radius:50%;background:${GOLD};color:${NAVY};display:flex;align-items:center;justify-content:center;text-align:center;padding:26px;font:400 38px/1.05 'Permanent Marker';transform:rotate(10deg);box-shadow:0 8px 0 rgba(0,0,0,.25)}
</style></head>${body}</html>`;
  const tmp = path.resolve(outDir, `_${c.name}.html`); fs.writeFileSync(tmp, html);
  await pg.goto('file://' + tmp, { waitUntil: 'networkidle0' }); await pg.evaluate(() => document.fonts.ready);
  await pg.screenshot({ path: path.join(outDir, `${c.name}.png`) }); fs.unlinkSync(tmp);
}
await b.close(); console.log('cards', cards.length);
