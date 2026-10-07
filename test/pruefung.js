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

    // Antwortmodus: drei Chips, Vorgabe „Überlegen und aufdecken“
    const chips = await p.$$eval('#answerPick .chipbtn', b => b.map(x => [x.dataset.a, x.classList.contains('on')]));
    ok('Antwortmodus: drei Chips, Vorgabe check', chips.length === 3 && chips[0][0] === 'check' && chips[0][1] && !chips[1][1] && !chips[2][1], JSON.stringify(chips));
    const dueBefore = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.due).length);
    // Nur anschauen
    await p.click('#answerPick [data-a="look"]');
    ok('Nur anschauen: Startknopf heißt „Durchsehen starten“', (await p.textContent('#start')).trim() === 'Durchsehen starten');
    await p.click('#start'); await p.waitForTimeout(200);
    ok('Nur anschauen: Lösung sofort sichtbar, keine Bewertung, „Weiter“', await p.isVisible('#ans') && !(await p.isVisible('#grades')) && !(await p.isVisible('#reveal')) && await p.isVisible('#next'));
    ok('Nur anschauen: ganze Auswahl, Kennzeichnung „Durchsehen“', /Noch 301 von 301/.test(await p.textContent('#counter')) && (await p.textContent('#cardState')) === 'Durchsehen');
    await p.click('#next'); await p.waitForTimeout(100);
    ok('Nur anschauen: „Weiter“ blättert', /Noch 300 von 301/.test(await p.textContent('#counter')) && await p.isVisible('#ans'));
    await p.keyboard.press('Space'); await p.waitForTimeout(100);
    ok('Nur anschauen: Leertaste blättert', /Noch 299 von 301/.test(await p.textContent('#counter')));
    await p.click('#stop'); await p.waitForTimeout(100);
    const dueAfter = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.due).length);
    ok('Nur anschauen: Lernstand unverändert', dueBefore === dueAfter, dueBefore + ' → ' + dueAfter);
    // Antwort eintippen
    await p.click('#answerPick [data-a="type"]');
    await p.click('#start'); await p.waitForTimeout(200);
    ok('Eintippen: Eingabefeld sichtbar, Knopf heißt „Prüfen“', await p.isVisible('#typed') && (await p.textContent('#reveal')).trim() === 'Prüfen' && !(await p.isVisible('#ans')));
    await p.fill('#typed', 'xyzxyz'); await p.click('#reveal'); await p.waitForTimeout(100);
    const verdict = await p.$eval('#verdict', v => [v.className, v.textContent]);
    ok('Eintippen: falsche Antwort wird als falsch gemeldet, Bewertung offen', /no/.test(verdict[0]) && /Eingetippt/.test(verdict[1]) && await p.isVisible('#grades'), verdict.join(' / '));
    await p.click('#stop'); await p.waitForTimeout(100);
    await p.click('#answerPick [data-a="check"]');
    ok('Antwortmodus gespeichert', await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).cfg.mode === 'check'));
    // Zweiter Start ohne Begrüßung
    await p.reload(); await p.waitForTimeout(400);
    ok('Begrüßung beim zweiten Start nicht mehr', !(await p.isVisible('#welcome')));
    ok('Keine Konsolen- oder Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();

  }

  // 2. Liste übernehmen: ohne Schlüssel, mit Dubletten, dann mit nachgestellter API, Nachübersetzen, Link
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('vokabeltrainer-v1-seen', '1'); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    // Nachgestellte API: füllt leere Felder aus den gelieferten Angaben, prüft Anfrageform
    const requests = [];
    await p.route('https://api.anthropic.com/**', async route => {
      const body = JSON.parse(route.request().postData());
      requests.push(body);
      const list = JSON.parse(body.messages[0].content.slice(body.messages[0].content.indexOf('[')));
      const items = list.map(e => { const w = e.de || e.en || e.wort || 'x'; return { de: e.de || 'de:' + w, en: e.en || 'en:' + w, fr: 'fr:' + w, pl: 'pl:' + w, ru: 'ru:' + w, rulat: 'lat:' + w, ex: 'Ex ' + w + '.', exde: 'Bsp ' + w + '.', cat: e.cat || 'Test' }; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ items }) }] }) });
    });
    await p.goto(URL); await p.waitForTimeout(400);
    await p.click('nav button[data-v="new"]');
    await p.fill('#listBox', '# Dienst\n- Apfel – apple\ndie Birne\n3. Kirsche: cherry\n\n');
    await p.click('#listGo'); await p.waitForTimeout(200);
    let items = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.deck === 'Dienst'));
    ok('Liste ohne Schlüssel: 3 Wörter im Stapel aus der Überschrift', items.length === 3 && items[0].de === 'Apfel' && items[0].en === 'apple' && items[1].de === 'die Birne' && items[1].en === '' && items[2].en === 'cherry', JSON.stringify(items.map(i => [i.de, i.en])));
    ok('Liste ohne Schlüssel: Hinweis auf Schlüssel', /3 Wörter im Stapel „Dienst"/.test(await p.textContent('#listMsg')) && /Schlüssel/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    await p.click('#listGo'); await p.waitForTimeout(200);
    items = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.deck === 'Dienst'));
    ok('Liste erneut: nichts doppelt angelegt', items.length === 3 && /0 Wörter/.test(await p.textContent('#listMsg')) && /3 schon vorhanden/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    ok('Nachübersetzen: 3 unvollständige Wörter gemeldet', /^3 Wörter ohne/.test((await p.textContent('#fillInfo')).trim()), (await p.textContent('#fillInfo')).trim());
    // Schlüssel hinterlegen, Liste in Englisch mit Übersetzung
    await p.fill('#apiKey', 'sk-ant-test'); await p.click('#keySave');
    await p.click('#listLang [data-l="en"]');
    await p.fill('#listDeck', 'Englisch');
    await p.fill('#listBox', 'certificate\ncollective agreement = Tarifvertrag');
    await p.click('#listGo');
    await p.waitForFunction(() => /Alle übersetzt/.test(document.querySelector('#listMsg').textContent), null, { timeout: 5000 }).catch(() => {});
    items = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.deck === 'Englisch'));
    ok('Liste mit Schlüssel: Englisch als Ausgangssprache, alle Felder gefüllt, Vorhandenes bleibt', items.length === 2 && items[0].en === 'certificate' && items[0].de === 'de:certificate' && items[0].ru === 'ru:certificate' && items[0].exde === 'Bsp certificate.' && items[1].de === 'Tarifvertrag' && items[1].fr === 'fr:Tarifvertrag', JSON.stringify(items));
    ok('Liste mit Schlüssel: Feld geleert, Meldung', (await p.inputValue('#listBox')) === '' && /Alle übersetzt/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    const req = requests[0];
    ok('API-Anfrage: Modell, JSON-Schema, Schlüssel im Kopf', req && req.model === 'claude-opus-5-5' && req.output_config.format.type === 'json_schema' && req.output_config.format.schema.properties.items.items.required.includes('rulat') && req.max_tokens >= 4000, req && JSON.stringify([req.model, req.output_config && req.output_config.format.type]));
    // Nachübersetzen füllt die drei alten Wörter
    await p.click('#fillGo');
    await p.waitForFunction(() => /ergänzt/.test(document.querySelector('#fillMsg').textContent), null, { timeout: 5000 }).catch(() => {});
    items = await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).items.filter(i => i.deck === 'Dienst'));
    ok('Nachübersetzen: alte Wörter vervollständigt, eingegebene Übersetzung bleibt', items.every(i => i.fr && i.pl && i.ru && i.ex && i.exde) && items[0].en === 'apple' && items[1].en === 'en:die Birne', JSON.stringify(items.map(i => [i.de, i.en, i.fr])));
    ok('Nachübersetzen: nichts mehr offen', /vollständig übersetzt/.test(await p.textContent('#fillInfo')) && await p.$eval('#fillGo', b => b.disabled), (await p.textContent('#fillInfo')).trim());
    ok('Zwei Aufrufe für zwei Übersetzungsrunden', requests.length === 2, 'Aufrufe: ' + requests.length);
    // Liste aus dem Link
    await p.goto('about:blank'); await p.goto(URL + '#liste=' + encodeURIComponent('Urlaub – leave\nDienstreise')); await p.waitForTimeout(400);
    ok('Link: Liste im Feld, Ansicht „Neu“, Adresse bereinigt', (await p.inputValue('#listBox')) === 'Urlaub – leave\nDienstreise' && await p.$eval('#v-new', v => v.classList.contains('on')) && await p.evaluate(() => location.hash === '' && location.search === '') && /2 Zeilen aus dem Link/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    ok('Liste: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  // 3. Start ohne Speicher
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

  // 4. Leerer Speicherstand
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { localStorage.setItem('vokabeltrainer-v1', JSON.stringify({ cfg: { newPerDay: 5 } })); localStorage.setItem('vokabeltrainer-v1-seen', '1'); });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Leerer Stand: Grundstock wiederhergestellt', /301/.test(await p.textContent('#stat')));
    ok('Leerer Stand: Einstellung erhalten (5/Tag)', await p.evaluate(() => JSON.parse(localStorage.getItem('vokabeltrainer-v1')).cfg.newPerDay === 5));
    await ctx.close();
  }

  // 5. Offline-Start nach erstem Besuch (Service Worker)
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
