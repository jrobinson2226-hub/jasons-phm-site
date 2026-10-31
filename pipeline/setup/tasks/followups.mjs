// Builds each team member's open follow-ups straight from the live Team Pipeline data, using the app's own logic
// (the same list the app shows), so the morning list doesn't depend on Jason having the app open.
// usage: node followups.mjs <sheet.json> <index.html> <out.json>
//   sheet.json: get_values result for docs!A2:L2000 ({"values":[...]} or the bare list)
//   index.html: the live pipeline page (https://raw.githubusercontent.com/jrobinson2226-hub/jasons-phm-site/main/pipeline/index.html)
// out.json: {generatedAt, owner, people:[{uid, role:'owner'|'member', items:[{title,due,borrower,phone,stage,kind,dealId}]}]}
// Read-only: the page runs against an in-memory copy of the data; nothing is written back to the sheet.
import fs from 'fs'; import path from 'path'; import os from 'os'; import { createRequire } from 'module';
const require = createRequire(import.meta.url);
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = await import('playwright')); }

const [sheetF, htmlF, outF] = process.argv.slice(2);
const raw = JSON.parse(fs.readFileSync(sheetF, 'utf8'));
const rows = Array.isArray(raw) ? raw : raw.values;
const docs = {};
for (const r of rows || []) {
  if (!r || !r[0]) continue;
  if (String(r[4] || '').toUpperCase() === 'TRUE') continue;
  const s = r.slice(5, 12).map(p => String(p || '')).filter(Boolean).map(p => p.startsWith('~') ? p.slice(1) : p).join('');
  if (!s) continue;
  try { docs[String(r[0])] = JSON.parse(s); } catch (e) { /* skip unreadable row */ }
}
const owner = (docs['config/team'] || {}).ownerId;
if (!owner) { console.error('No config/team ownerId in the sheet'); process.exit(2); }

const stub = `(function(){
  var cache=new Map(Object.entries(${JSON.stringify(docs)})),listeners=new Set();
  function clone(o){return o==null?o:JSON.parse(JSON.stringify(o));}
  function parentOf(p){var s=p.split('/');s.pop();return s.join('/');}
  function docSnap(p){var e=cache.get(p);return {exists:!!e,id:p.split('/').pop(),ref:{path:p},data:function(){return e?clone(e):undefined;}};}
  function colSnap(p){var d=[];cache.forEach(function(v,k){if(parentOf(k)===p)d.push(docSnap(k));});return {docs:d,size:d.length,empty:!d.length,forEach:function(f){d.forEach(f);}};}
  function fire(p){listeners.forEach(function(l){if((l.kind==='doc'&&l.path===p)||(l.kind==='col'&&parentOf(p)===l.path))l.cb(l.kind==='doc'?docSnap(l.path):colSnap(l.path));});}
  function listen(k,p,cb){var l={kind:k,path:p,cb:cb};listeners.add(l);setTimeout(function(){cb(k==='doc'?docSnap(p):colSnap(p));},0);return function(){listeners.delete(l);};}
  function dm(a,b){for(var k in b){var v=b[k];if(v&&typeof v==='object'&&!Array.isArray(v)&&a[k]&&typeof a[k]==='object'&&!Array.isArray(a[k]))dm(a[k],v);else a[k]=v;}return a;}
  function ref(p){return {path:p,id:p.split('/').pop(),get:function(){return Promise.resolve(docSnap(p));},
    set:function(d){cache.set(p,clone(d));fire(p);return Promise.resolve({});},
    update:function(x){cache.set(p,dm(cache.get(p)||{},clone(x)));fire(p);return Promise.resolve({});},
    delete:function(){cache.delete(p);fire(p);return Promise.resolve();},onSnapshot:function(cb){return listen('doc',p,cb);}};}
  var db={doc:ref,collection:function(p){return {path:p,doc:function(id){return ref(p+'/'+id);},onSnapshot:function(cb){return listen('col',p,cb);}};}};
  var uid=${JSON.stringify(owner)};
  var user={id:function(){return Promise.resolve(uid);},isOwner:function(){return true;},canEdit:function(){return true;},
    me:function(){return Promise.resolve({id:uid,name:'Jason Robinson'});},profiles:function(ids){var o={};(ids||[]).forEach(function(i){o[i]={name:''};});return Promise.resolve(o);}};
  var mcp={callTool:function(){return Promise.reject(new Error('disabled'));}};
  window.claude={use:function(n){return Promise.resolve(n==='db'?db:n==='user'?user:n==='mcp'?mcp:null);}};
})();`;

let html = fs.readFileSync(htmlF, 'utf8')
  .replace(/<script src="config\.js[^"]*"><\/script>/, '')
  .replace(/<script src="api\.js[^"]*"><\/script>/, '<script src="stub.js"></script>');
const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'tpl-'));
fs.writeFileSync(path.join(dir, 'stub.js'), stub);
fs.writeFileSync(path.join(dir, 'index.html'), html);

const browser = await chromium.launch();
const ctx = await browser.newContext({ timezoneId: 'America/Chicago' });
const page = await ctx.newPage();
await page.route(/^https?:/, r => r.abort());          // nothing leaves the machine
const errors = []; page.on('pageerror', e => errors.push(e.message));
await page.goto('file://' + path.join(dir, 'index.html'));
await page.waitForFunction(() => window.TPL_TEAM && window.TPL_TEAM().ready, null, { timeout: 30000 });
await page.waitForTimeout(1500);                         // let every lane load
const out = await page.evaluate(() => {
  const t = window.TPL_TEAM();
  return { generatedAt: new Date().toISOString(), owner: t.owner,
    people: [{ uid: t.owner, role: 'owner', items: window.TPL_DIGEST(t.owner) }]
      .concat(t.members.map(m => ({ uid: m, role: 'member', items: window.TPL_DIGEST(m) }))) };
});
await browser.close();
if (errors.length) console.error('page errors:', errors.join(' | '));
fs.writeFileSync(outF, JSON.stringify(out, null, 1));
console.log(out.people.map(p => `${p.role} ${p.uid}: ${p.items.length} open follow-ups`).join('\n'));
