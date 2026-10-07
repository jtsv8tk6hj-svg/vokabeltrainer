// Prüfung der App mit Playwright gegen Chromium.
// Aufruf aus dem Projektordner:  node test/pruefung.js
// Erwartet eine gebaute index.html (python3 build.py). Ein lokaler Server auf
// Port 8000 wird mitgestartet, falls keiner läuft. Es gibt keine Testsuite im
// engeren Sinn; dieses Skript deckt die Fälle aus CLAUDE.md ab.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const http = require('http');
const path = require('path');

const PORT = 8000, URL = `http://localhost:${PORT}/`;
const out = [];
const ok = (name, cond, extra='') => out.push(`${cond ? 'OK  ' : 'FEHL'} ${name}${extra ? ' — ' + extra : ''}`);

const erreichbar = () => new Promise(r => { const q = http.get(URL, res => { res.resume(); r(res.statusCode === 200); }); q.on('error', () => r(false)); });
async function server() {
  if (await erreichbar()) return null;
  const s = spawn('python3', ['-m', 'http.server', String(PORT)], { cwd: path.join(__dirname, '..'), stdio: 'ignore' });
  for (let i = 0; i < 50 && !(await erreichbar()); i++) await new Promise(r => setTimeout(r, 100));
  if (!(await erreichbar())) { s.kill(); throw new Error('lokaler Server auf Port ' + PORT + ' startet nicht'); }
  return s;
}

(async () => {
  const srv = await server();
  const browser = await chromium.launch();

  // 1. Normalstart: Begrüßung, Verbergen/Aufdecken, Bewertung, keine Konsolenfehler
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Begrüßung beim ersten Start sichtbar', await p.isVisible('#welcome'));
    await p.click('#welcomeGo');
    ok('Begrüßung nach „Los geht\'s“ weg', !(await p.isVisible('#welcome')));
    const stat = await p.textContent('#stat');
    ok('Grundstock geladen (301 Wörter im Status)', /301/.test(stat), stat.trim().replace(/\s+/g,' ').slice(0,80));
    await p.click('#start');
    ok('Lernfenster offen', await p.isVisible('#drill'));
    ok('Frage sichtbar', (await p.textContent('#qWord')).trim().length > 0);
    ok('Lösung vor Aufdecken verborgen', !(await p.isVisible('#ans')));
    ok('Bewertungsknöpfe vor Aufdecken verborgen', !(await p.isVisible('#grades')));
    ok('Aufdecken-Knopf sichtbar', await p.isVisible('#reveal'));
    const revealBox = await (await p.$('#reveal')).boundingBox();
    await p.click('#reveal');
    ok('Lösung nach Aufdecken sichtbar', await p.isVisible('#ans'));
    ok('Bewertungsknöpfe nach Aufdecken sichtbar', await p.isVisible('#grades'));
    ok('Aufdecken-Knopf nach Aufdecken weg', !(await p.isVisible('#reveal')));
    const gradesBox = await (await p.$('#grades')).boundingBox();
    ok('Bewertungsknöpfe an Stelle des Aufdecken-Knopfs', revealBox && gradesBox && Math.abs(revealBox.y - gradesBox.y) < 4 && Math.abs(revealBox.height - gradesBox.height) < 4,
       `reveal y=${revealBox && revealBox.y.toFixed(0)} h=${revealBox && revealBox.height.toFixed(0)}, grades y=${gradesBox && gradesBox.y.toFixed(0)} h=${gradesBox && gradesBox.height.toFixed(0)}`);
    const labels = await p.$$eval('#grades button', b => b.map(x => x.innerText.replace(/\s+/g,' ').trim()));
    ok('Knopfbeschriftung mit Abständen', labels.length === 3 && /10 Min/.test(labels[0]) && /1 Tag/.test(labels[1]) && /3 Tage/.test(labels[2]), labels.join(' | '));
    // Knopffarben: Schrift darf nicht gleich Hintergrund sein (Falle 2)
    const contrast = await p.$$eval('#grades button, #start, #reveal', bs => bs.map(b => { const s = getComputedStyle(b); return s.color === s.backgroundColor; }));
    ok('Keine Knöpfe mit Schrift = Hintergrund', !contrast.some(Boolean));
    await p.click('#n1');
    await p.waitForTimeout(200);
    ok('Nächste Karte wieder verdeckt', !(await p.isVisible('#grades')) && await p.isVisible('#reveal'));
    const saved = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('vokabeltrainer-v1')); const l = d.items.filter(i => i.due); return { n: l.length, step: l[0] && l[0].step, log: d.log }; });
    ok('Bewertung gespeichert (1 Karte fällig, Stufe 0→1 Tag)', saved.n === 1 && saved.step === 0, JSON.stringify(saved));
    // Nochmal → in 10 Minuten
    await p.click('#reveal'); await p.click('#n0'); await p.waitForTimeout(200);
    const again = await p.evaluate(() => { const d = JSON.parse(localStorage.getItem('vokabeltrainer-v1')); return d.items.filter(i => i.due && i.due - Date.now() < 7e5 && i.due > Date.now()).length; });
    ok('„Nochmal“ setzt Wiedervorlage auf ~10 Minuten', again === 1);
    await p.click('#stop'); await p.waitForTimeout(200);
    ok('Lernfenster geschlossen', !(await p.isVisible('#drill')));
    // Zweiter Start ohne Begrüßung
    await p.reload(); await p.waitForTimeout(400);
    ok('Begrüßung beim zweiten Start nicht mehr', !(await p.isVisible('#welcome')));
    ok('Keine Konsolen- oder Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();

  }

  // 2. Start ohne Speicher
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('gesperrt'); } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Ohne Speicher: App läuft, Grundstock da', /301/.test(await p.textContent('#stat')));
    ok('Ohne Speicher: roter Balken mit Sichern/Laden', await p.isVisible('#savebar') && await p.isVisible('#sbCopy') && await p.isVisible('#sbLoad'));
    await p.click('#welcomeGo'); await p.waitForTimeout(100);
    await p.click('#start'); await p.click('#reveal'); await p.click('#n1'); await p.waitForTimeout(200);
    await p.click('#reveal'); await p.click('#n2'); await p.waitForTimeout(200);
    await p.click('#stop'); await p.waitForTimeout(200);
    ok('Ohne Speicher: Balken zählt ungesicherte Antworten', /2 Antworten/.test(await p.textContent('#savetxt')), (await p.textContent('#savetxt')).trim());
    await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('kein Zugriff')); });
    await p.click('#sbCopy'); await p.waitForTimeout(300);
    const code = await p.inputValue('#codeBox');
    ok('Ohne Speicher: „Sichern“ zeigt Code (VT1|…)', await p.isVisible('#codeWrap') && /^VT1\|/.test(code), code.slice(0, 50));
    ok('Ohne Speicher: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();

    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p2 = await ctx2.newPage();
    await p2.goto(URL); await p2.waitForTimeout(400);
    await p2.click('#welcomeGo');
    await p2.click('nav button[data-v="data"]'); await p2.click('#codeOpen');
    ok('„Fortschritt einsetzen“ öffnet leeres Feld', await p2.isVisible('#codeApply') && (await p2.inputValue('#codeBox')) === '');
    await p2.fill('#codeBox', code);
    await p2.click('#codeApply'); await p2.waitForTimeout(300);
    const after = await p2.evaluate(() => { const d = JSON.parse(localStorage.getItem('vokabeltrainer-v1')); return { due: d.items.filter(i => i.due).length, steps: d.items.filter(i => i.due).map(i => i.step).sort(), log: d.log }; });
    ok('Code in frischer Sitzung übernommen (2 Karten, Stufen 0 und 1, 2 neue heute)', after.due === 2 && after.steps.join() === '0,1' && Object.values(after.log)[0] === 2, JSON.stringify(after));
    await ctx2.close();
  }

  // 3. Leerer Speicherstand
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { localStorage.setItem('vokabeltrainer-v1', JSON.stringify({ cfg: { newPerDay: 5 } })); localStorage.setItem('vokabeltrainer-v1-seen', '1'); });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Leerer Stand: Grundstock wiederhergestellt', /301/.test(await p.textContent('#stat')));
    ok('Leerer Stand: Einstellung erhalten (5/Tag)', await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).cfg.newPerDay === 5));
    await ctx.close();
  }

  // 4. Offline-Start nach erstem Besuch (Service Worker)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForTimeout(1500);
    const cached = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { keys: ks, n: (await c.keys()).length }; });
    ok('Service Worker aktiv, Cache gefüllt', cached.keys.length === 1 && cached.n >= 3, JSON.stringify(cached));
    await ctx.setOffline(true);
    const p3 = await ctx.newPage();
    let offlineOk = true;
    try { await p3.goto(URL); await p3.waitForTimeout(500); offlineOk = /301/.test(await p3.textContent('#stat')); } catch (e) { offlineOk = false; out.push('   ' + e.message.split('\n')[0]); }
    ok('Offline-Start liefert die App aus dem Cache', offlineOk);
    await ctx.close();
  }

  await browser.close();
  if (srv) srv.kill();
  console.log(out.join('\n'));
  const fails = out.filter(l => l.startsWith('FEHL')).length;
  console.log(`\n${out.length - fails} bestanden, ${fails} fehlgeschlagen`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
