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
// Lernstand aus dem Speicher: [{id, lang, s, d, r}] über alle Wörter
const STATES = `(() => { const d = vtStore.read(); const out = [];
  d.items.forEach(i => Object.keys(i.p || {}).forEach(k => out.push({ id: i.id, k, s: i.p[k].s, d: i.p[k].d, r: i.p[k].r || 0 }))); return out; })()`;

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
  // Doppeltipp-Sperre in der App für die Prüfung abschalten; der eigene Prüffall schaltet sie wieder ein
  const newCtx = browser.newContext.bind(browser);
  browser.newContext = async o => { const c = await newCtx(o); await c.addInitScript(() => { window.vtTapLock = 0; }); return c; };

  // 1. Normalstart: Begrüßung, Verbergen/Aufdecken, Bewertung, keine Konsolenfehler
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    const errs = [];
    p.on('pageerror', e => errs.push('pageerror: ' + e.message));
    p.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Begrüßung beim ersten Start sichtbar', await p.isVisible('#welcome'));
    const wl = await p.$$eval('#wLang [data-wl]', b => b.map(x => x.dataset.wl + (x.classList.contains('on') ? '*' : '')));
    const wd = await p.$$eval('#wDeckPick [data-wd]', b => b.map(x => x.dataset.wd + (x.classList.contains('on') ? '*' : '')));
    ok('Begrüßung: kurze Erklärung, Sprache (EN vorgewählt) und Stapel zum Anfangen (Alltag vorgewählt), Langtext aufklappbar', wl.join() === 'en*,fr,pl,ru' && wd[0] === 'Alltag*' && wd.includes('alle') && !(await p.isVisible('#welcome .whelp .panel')), wl.join() + ' / ' + wd.join());
    // für die folgenden Prüfungen alle Stapel, damit die Zahlen des ganzen Bestands gelten
    await p.click('#wDeckPick [data-wd="alle"]');
    await p.click('#welcomeGo');
    ok('Begrüßung nach „Los geht\'s“ weg', !(await p.isVisible('#welcome')));
    const stat = await p.textContent('#stat');
    ok('Grundstock geladen (3512 Wörter im Status)', /3512/.test(stat), stat.trim().replace(/\s+/g,' ').slice(0,80));
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
    let states = await p.evaluate(STATES);
    const log0 = await p.evaluate(() => vtStore.read().log);
    ok('Bewertung gespeichert: ein Stand, Zielsprache DE oder EN, Stufe 0, 1 Tag', states.length === 1 && /^(de|en)$/.test(states[0].k) && states[0].s === 0 && Math.abs(states[0].d - Date.now() - 864e5) < 6e4 && Object.values(log0)[0] === 1, JSON.stringify(states));
    const cardA = states[0];
    // Nochmal → in 10 Minuten, Wiederanlauf markiert
    await p.click('#reveal'); await p.click('#n0'); await p.waitForTimeout(200);
    // Wort- oder Formkarte: der Wiederanlauf kann in p oder g liegen
    const rel = await p.evaluate(() => { const out = []; vtStore.read().items.forEach(i => { Object.values(i.p || {}).forEach(x => { if (x.r) out.push(x); });
      Object.values(i.g || {}).forEach(gk => Object.values(gk).forEach(x => { if (x.r) out.push(x); })); }); return out; });
    states = await p.evaluate(STATES);
    ok('„Nochmal“ setzt Wiedervorlage auf ~10 Minuten', rel.length === 1 && rel[0].d - Date.now() < 7e5 && rel[0].d > Date.now(), JSON.stringify(states));
    await p.click('#stop'); await p.waitForTimeout(200);
    ok('Lernfenster geschlossen', !(await p.isVisible('#drill')));

    // Antwortmodus: drei Chips, Vorgabe „Überlegen und aufdecken“
    const chips = await p.$$eval('#answerPick .chipbtn', b => b.map(x => [x.dataset.a, x.classList.contains('on')]));
    ok('Antwortmodus: drei Chips, Vorgabe check', chips.length === 3 && chips[0][0] === 'check' && chips[0][1] && !chips[1][1] && !chips[2][1], JSON.stringify(chips));
    const dueBefore = JSON.stringify(await p.evaluate(STATES));
    // Nur anschauen
    await p.click('#answerPick [data-a="look"]');
    ok('Nur anschauen: Startknopf heißt „Durchsehen starten“', (await p.textContent('#start')).trim() === 'Durchsehen starten');
    await p.click('#start'); await p.waitForTimeout(200);
    ok('Nur anschauen: Lösung sofort sichtbar, keine Bewertung, „Weiter“', await p.isVisible('#ans') && !(await p.isVisible('#grades')) && !(await p.isVisible('#reveal')) && await p.isVisible('#next'));
    const total = +((await p.textContent('#counter')).match(/von (\d+)/) || [0, 0])[1];
    ok('Nur anschauen: ganze Auswahl samt Form- und Kasuskarten, Kennzeichnung „Durchsehen“', total === 3512 + 1082 && (await p.textContent('#counter')) === '1 von ' + total && (await p.textContent('#cardState')) === 'Durchsehen', await p.textContent('#counter'));
    await p.click('#next'); await p.waitForTimeout(100);
    ok('Nur anschauen: „Weiter“ blättert', (await p.textContent('#counter')) === '2 von ' + total && await p.isVisible('#ans'));
    await p.keyboard.press('Space'); await p.waitForTimeout(100);
    ok('Nur anschauen: Leertaste blättert', (await p.textContent('#counter')) === '3 von ' + total);
    await p.click('#stop'); await p.waitForTimeout(100);
    const dueAfter = JSON.stringify(await p.evaluate(STATES));
    ok('Nur anschauen: Lernstand unverändert', dueBefore === dueAfter);
    // Antwort eintippen
    await p.click('#answerPick [data-a="type"]');
    await p.click('#start'); await p.waitForTimeout(200);
    ok('Eintippen: ein Eingabefeld sichtbar, Knopf heißt „Prüfen“', (await p.$$('#typeFields input:visible')).length === 1 && (await p.textContent('#reveal')).trim() === 'Prüfen' && !(await p.isVisible('#ans')));
    await p.fill('#typeFields input', 'xyzxyz'); await p.click('#reveal'); await p.waitForTimeout(100);
    const verdict = await p.$eval('#ans .verdict', v => [v.className, v.textContent]);
    const picked = await p.$eval('#grades .g.pick', b => b.dataset.g).catch(() => null);
    ok('Eintippen: falsche Antwort gemeldet, „Nochmal“ vorgewählt, Bewertung offen', /no/.test(verdict[0]) && /Eingetippt/.test(verdict[1]) && await p.isVisible('#grades') && picked === '0', verdict.join(' / ') + ' / vorgewählt: ' + picked);
    await p.click('#stop'); await p.waitForTimeout(100);
    await p.click('#answerPick [data-a="check"]');
    ok('Antwortmodus gespeichert', await p.evaluate(() => vtStore.read().cfg.mode === 'check'));

    // Themen (Kategorien) folgen dem gewählten Stapel
    const catsAll = (await p.$$('#catPick .chipbtn')).length;
    await p.click('#deckPick [data-d="Alltag"]'); await p.waitForTimeout(100);
    const catsAlltag = await p.$$eval('#catPick .chipbtn', b => b.map(x => x.textContent));
    await p.click('#catPick [data-c="Wohnen"]'); await p.waitForTimeout(100);
    const poolWohnen = await p.textContent('#cPool');
    await p.click('#deckPick [data-d="Personalgewinnung"]'); await p.waitForTimeout(100);
    const catsPg = await p.$$eval('#catPick .chipbtn', b => b.map(x => x.textContent));
    await p.click('#deckPick [data-d="Küche"]'); await p.waitForTimeout(100);
    const catsKueche = await p.$$eval('#catPick .chipbtn', b => b.map(x => x.textContent));
    await p.click('#deckPick [data-d="Reisen"]'); await p.waitForTimeout(100);
    const catsReisen = await p.$$eval('#catPick [data-c]', b => b.map(x => x.dataset.c));
    ok('Stapel Reisen: 500 Wörter in zwanzig Themen', (await p.textContent('#cPool')) === '500' && catsReisen.length === 21 && catsReisen.includes('Am Flughafen'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsReisen.length - 1));
    await p.click('#deckPick [data-d="Auto"]'); await p.waitForTimeout(100);
    const catsAuto = await p.$$eval('#catPick [data-c]', b => b.map(x => x.dataset.c));
    ok('Stapel Auto: 300 Wörter in zwölf Themen', (await p.textContent('#cPool')) === '300' && catsAuto.length === 13 && catsAuto.includes('Räder und Reifen'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsAuto.length - 1));
    await p.click('#deckPick [data-d="Beruf"]'); await p.waitForTimeout(100);
    const catsBeruf = await p.$$eval('#catPick [data-c]', b => b.map(x => x.dataset.c));
    ok('Stapel Beruf: 500 Wörter in zwanzig Themen', (await p.textContent('#cPool')) === '500' && catsBeruf.length === 21 && catsBeruf.includes('Vorstellungsgespräch'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsBeruf.length - 1));
    await p.click('#deckPick [data-d="Gesundheit"]'); await p.waitForTimeout(100);
    const catsGes = await p.$$eval('#catPick [data-c]', b => b.map(x => x.dataset.c));
    ok('Stapel Gesundheit: 500 Wörter in zwanzig Themen', (await p.textContent('#cPool')) === '500' && catsGes.length === 21 && catsGes.includes('In der Apotheke'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsGes.length - 1));
    await p.click('#deckPick [data-d="Wohnen"]'); await p.waitForTimeout(100);
    const catsWo = await p.$$eval('#catPick [data-c]', b => b.map(x => x.dataset.c));
    ok('Stapel Wohnen: 500 Wörter in zwanzig Themen', (await p.textContent('#cPool')) === '500' && catsWo.length === 21 && catsWo.includes('Haushaltsgeräte'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsWo.length - 1));
    await p.click('#deckPick [data-d="Küche"]'); await p.waitForTimeout(100);
    ok('Stapel Küche: 500 Wörter in zwanzig Themen', (await p.textContent('#cPool')) === '500' && catsKueche.length === 21 && catsKueche.includes('Garmethoden'), 'pool=' + await p.textContent('#cPool') + ' themen=' + (catsKueche.length - 1));
    await p.click('#deckPick [data-d="Personalgewinnung"]'); await p.waitForTimeout(100);
    ok('Themen je Stapel: bei allen Stapeln keine Themen-Chips, Alltag zeigt seine zwölf Themen, Personalgewinnung seine elf, Stapelwechsel setzt das Thema zurück', catsAll === 0 && !(await p.isVisible('#catPick')) === false && catsAlltag.length === 13 && catsAlltag.includes('Wohnen') && poolWohnen === '20' && catsPg.length === 12 && !catsPg.includes('Wohnen') && (await p.$eval('#catPick .chipbtn.on', b => b.textContent)) === 'Alle Themen', 'alle=' + catsAll + ' alltag=' + catsAlltag.length + ' wohnen=' + poolWohnen + ' pg=' + catsPg.length);
    await p.click('#deckPick [data-d="alle"]'); await p.waitForTimeout(100);
    // Richtung: Vorgabe gemischt, feste Richtung mit zwei Zielsprachen und Eintippen
    const fromChips = await p.$$eval('#fromPick .chipbtn', b => b.map(x => [x.dataset.f, x.classList.contains('on')]));
    ok('Richtung: sechs Chips, Vorgabe gemischt, Zielsprachen verborgen', fromChips.length === 6 && fromChips[0][0] === 'mix' && fromChips[0][1] && !(await p.isVisible('#toPick')), JSON.stringify(fromChips));
    await p.click('#fromPick [data-f="de"]');
    ok('Richtung: von Deutsch, Vorgabe nach Englisch, Zielsprachen sichtbar', await p.isVisible('#toPick') && await p.evaluate(() => { const c = vtStore.read().cfg; return c.from === 'de' && c.to.join() === 'en'; }));
    await p.click('#toPick [data-t="pl"]'); await p.click('#toPick [data-t="ru"]'); await p.click('#toPick [data-t="en"]');
    const cfgTo = await p.evaluate(() => vtStore.read().cfg.to.join());
    ok('Richtung: nach Polnisch und Russisch, Englisch abgewählt', cfgTo === 'pl,ru' && /Polnisch, Russisch/.test(await p.textContent('#dirHint')), cfgTo);
    await p.click('#toPick [data-t="pl"]'); await p.click('#toPick [data-t="ru"]');
    ok('Richtung: letzte Zielsprache lässt sich nicht abwählen', (await p.evaluate(() => vtStore.read().cfg.to.join())) === 'ru');
    await p.click('#toPick [data-t="pl"]');
    await p.click('#answerPick [data-a="type"]');
    await p.click('#start'); await p.waitForTimeout(200);
    const fields = await p.$$eval('#typeFields input', b => b.map(x => x.dataset.k));
    ok('Zwei Zielsprachen: zwei Felder PL und RU, Frage auf Deutsch', fields.join() === 'pl,ru' && (await p.textContent('#qLang')) === 'DE', fields.join());
    // richtige polnische Antwort aus dem Speicher holen, russische falsch lassen
    const cur = await p.evaluate(() => { const d = vtStore.read(); const w = document.querySelector('#qWord').firstChild.textContent.trim(); return d.items.find(i => i.de === w && i.pl && i.ru); });
    await p.fill('#typeFields input[data-k="pl"]', cur.pl); await p.fill('#typeFields input[data-k="ru"]', 'falsch');
    await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    ok('Zwei Zielsprachen: Enter im letzten Feld deckt auf, Urteile je Sprache, Übernehmen statt Knöpfe', await p.isVisible('#ans') && await p.isVisible('#apply') && !(await p.isVisible('#grades')) && (await p.$$('#ans .vsel:visible')).length === 2);
    const vs = await p.$$eval('#ans .vsel', v => v.map(x => [x.dataset.k, [...x.querySelectorAll('button')].find(b => b.classList.contains('on')).dataset.g]));
    ok('Zwei Zielsprachen: PL als Gut, RU als Nochmal vorgeschlagen', JSON.stringify(vs) === '[["pl","1"],["ru","0"]]', JSON.stringify(vs));
    await p.click('#ans .vsel[data-k="pl"] button[data-g="2"]');
    await p.click('#apply'); await p.waitForTimeout(200);
    states = await p.evaluate(STATES);
    const spl = states.find(x => x.id === cur.id && x.k === 'pl'), sru = states.find(x => x.id === cur.id && x.k === 'ru');
    ok('Zwei Zielsprachen: PL auf Leicht umgestellt (Stufe 1, 3 Tage), RU Nochmal (10 Min), Karte kommt wieder', spl && spl.s === 1 && Math.abs(spl.d - Date.now() - 3 * 864e5) < 6e4 && sru && sru.r === 1 && /^\d+ von \d+$/.test(await p.textContent('#counter')), JSON.stringify([spl, sru]));
    await p.click('#stop'); await p.waitForTimeout(100);
    const semCol = await p.evaluate(() => { const cs = getComputedStyle(document.documentElement); const v = n => cs.getPropertyValue(n).trim(); const col = (el, prop) => getComputedStyle(document.querySelector(el))[prop];
      const hex = h => { const m = h.match(/^#(..)(..)(..)$/); return m ? 'rgb(' + m.slice(1).map(x => parseInt(x, 16)).join(', ') + ')' : h; };
      return { ok: v('--ok') !== v('--fr') && v('--bad') !== v('--en'), g3: col('#grades .g3 b', 'color') === hex(v('--ok')), g1: col('#grades .g1 b', 'color') === hex(v('--bad')), az: col('#ans', 'boxShadow').includes(hex(v('--ok'))), bar: col('#grades .g1', 'boxShadow').includes(hex(v('--bad'))) }; });
    ok('Urteilsfarben getrennt von Sprachfarben: Leicht und Lösungskarte in --ok, Nochmal in --bad mit Balken', semCol.ok && semCol.g3 && semCol.g1 && semCol.az && semCol.bar, JSON.stringify(semCol));
    ok('Pensum zählt je Wort und Zielsprache', (await p.textContent('#cNew')) === '16', 'cNew=' + await p.textContent('#cNew'));

    // Tagespensum erreicht: Weitermachen in Schritten des Pensums, Zuschlag gilt nur heute
    const logHeute = await p.evaluate(() => { const d = vtStore.read(); const k = Object.keys(d.log)[0]; d.cfg.newPerDay = d.log[k]; vtStore.write(d); return d.log[k]; });
    await p.reload(); await p.waitForTimeout(400);
    ok('Pensum erreicht: Startknopf meldet es, Knopf „Weiter lernen“ mit Schritt 5 sichtbar', (await p.textContent('#start')).trim() === 'Für heute geschafft' && await p.isVisible('#more') && (await p.textContent('#more')) === 'Weiter lernen: 5 neue Karten dazu' && (await p.textContent('#cNew')) === '0', (await p.textContent('#start')) + ' / ' + (await p.textContent('#more')));
    await p.click('#more'); await p.waitForTimeout(200);
    const moreState = await p.evaluate(() => vtStore.read().more);
    ok('Weiter lernen: Runde startet sofort, Zuschlag 5 für heute gespeichert', await p.isVisible('#drill') && /^\d+ von \d+$/.test(await p.textContent('#counter')) && moreState && moreState.n === 5 && moreState.d === await p.evaluate(() => { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }), JSON.stringify(moreState));
    await p.click('#stop'); await p.waitForTimeout(100);
    ok('Weiter lernen: Pensum um 5 erhöht, Startknopf wieder aktiv', (await p.textContent('#cNew')) === '5' && (await p.textContent('#start')).trim() === 'Lernen starten' && !(await p.isVisible('#more')), 'cNew=' + await p.textContent('#cNew'));
    await p.evaluate(() => { const d = vtStore.read(); d.more = { d: '2000-01-01', n: 5 }; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    ok('Zuschlag eines anderen Tages zählt nicht', (await p.textContent('#cNew')) === '0' && await p.isVisible('#more'));
    await p.evaluate(() => { const d = vtStore.read(); d.cfg.newPerDay = 20; delete d.more; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    ok('Pensum zurück auf 20', (await p.textContent('#cNew')) === String(20 - logHeute), 'cNew=' + await p.textContent('#cNew'));

    // Fortschrittsübersicht: je Stapel und Thema, Sprache wählbar, Stapel aufklappbar
    const fromVorher = await p.evaluate(() => { const d = vtStore.read(); const t = Date.now() + 9e8, f = d.cfg.from;
      d.items.forEach(i => { i.p = {}; if (i.deck === 'Küche' && i.cat === 'Obst') i.p = { en: { s: 5, d: t }, pl: { s: 1, d: t } }; });
      d.cfg.from = 'mix'; vtStore.write(d); return f; });
    await p.reload(); await p.waitForTimeout(400);
    const prog = async sel => (await p.$$eval(sel, r => r.map(x => [...x.querySelectorAll('.pn,.pp')].map(s => s.textContent.trim()).filter(Boolean).join(' '))));
    ok('Fortschritt: Leiste oben zeigt begonnen und sicher für DE, EN', /^\d+ % begonnen · \d+ % sicher · DE, EN$/.test((await p.textContent('#pstripText')).trim()), await p.textContent('#pstripText'));
    ok('Fortschritt: Zeile je Stapel, Gesamtzeile, Summe in DE, EN', (await prog('#progList button.prow')).length === 12 && /^Alle Stapel.*\d+ %$/.test((await prog('#progAll .prow'))[0]) && /^25 sicher · 0 im Lernen · \d+ neu · 7024 Karten in DE, EN$/.test(await p.textContent('#progSum')), await p.textContent('#progSum'));
    await p.click('#progList [data-pd="Küche"]'); await p.waitForTimeout(100);
    const sub = await prog('#progList .prow.sub');
    ok('Fortschritt: Stapel Küche aufgeklappt, 20 Themen, Obst 50 % (EN sicher, DE neu)', sub.length === 20 && sub.includes('Obst 50 %') && (await p.getAttribute('#progList [data-pd="Küche"]', 'aria-expanded')) === 'true', JSON.stringify(sub.filter(x => /Obst/.test(x))));
    await p.click('#progPick [data-p="pl"]'); await p.waitForTimeout(100);
    ok('Fortschritt: Sprache Polnisch gewählt, Obst 100 % begonnen, 25 im Lernen', /^0 sicher · 25 im Lernen · \d+ neu · \d+ Karten in PL$/.test(await p.textContent('#progSum')) && (await prog('#progList .prow.sub')).includes('Obst 100 %') && (await p.evaluate(() => vtStore.read().cfg.prog)) === 'pl', await p.textContent('#progSum'));
    await p.click('#progPick [data-p="auto"]'); await p.click('#progList [data-pd="Küche"]'); await p.waitForTimeout(100);
    ok('Fortschritt: Stapel wieder zugeklappt', (await prog('#progList .prow.sub')).length === 0);
    await p.evaluate(f => { const d = vtStore.read(); d.cfg.from = f; vtStore.write(d); }, fromVorher);

    // Vorzeitigkeitsregel: Karte A hat EN in einem Tag, PL neu → Richtung DE→EN,PL, beides richtig
    await p.evaluate(aId => { const d = vtStore.read(); const far = Date.now() + 200 * 864e5;
      d.items.forEach(i => { if (i.id !== aId) i.p = { en: { s: 6, d: far }, pl: { s: 6, d: far } }; else i.p = { en: { s: 0, d: Date.now() + 864e5 } }; });
      d.cfg.to = ['en', 'pl']; d.cfg.forms = false; vtStore.write(d); }, cardA.id);
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#start'); await p.waitForTimeout(200);
    const curA = await p.evaluate(aId => vtStore.read().items.find(i => i.id === aId), cardA.id);
    ok('Vorzeitig: Karte mit neuer Zielsprache erscheint, Kennzeichnung neu', (await p.textContent('#qWord')).includes(curA.de) && (await p.textContent('#cardState')) === 'neu');
    await p.fill('#typeFields input[data-k="en"]', curA.en); await p.fill('#typeFields input[data-k="pl"]', curA.pl);
    await p.click('#reveal'); await p.click('#apply');
    await p.waitForFunction(() => !document.querySelector('#rsheet').hidden, null, { timeout: 3000 }).catch(() => {});
    states = await p.evaluate(STATES);
    const aEn = states.find(x => x.id === cardA.id && x.k === 'en'), aPl = states.find(x => x.id === cardA.id && x.k === 'pl');
    ok('Vorzeitig richtig zählt nicht: EN unverändert, PL neu auf Stufe 0', aEn && aEn.s === 0 && Math.abs(aEn.d - Date.now() - 864e5) < 6e4 && aPl && aPl.s === 0, JSON.stringify([aEn, aPl]));
    const rs = (await p.textContent('#rsheet')).replace(/\s+/g, ' ');
    ok('Einzige Karte: Runde endet mit Ergebnisblatt (1 Karte, 1 gewusst), Bewertungsknöpfe weg, „Fertig“ da', await p.isVisible('#rsheet') && /Runde geschafft/.test(rs) && /1 Karten · 1 auf Anhieb gewusst · 0 noch einmal/.test(rs) && !(await p.isVisible('#grades')) && await p.isVisible('#roundEnd') && !(await p.isVisible('#roundNext')), rs);
    await p.click('#roundEnd'); await p.waitForTimeout(100);
    ok('Ergebnisblatt: „Fertig“ schließt das Lernfenster', !(await p.isVisible('#drill')));
    // Alte Sicherung: step/due werden beim Laden in Stände für DE und EN übernommen
    await p.evaluate(() => { const d = vtStore.read(); d.items.forEach(i => { delete i.p; }); d.items[5].step = 3; d.items[5].due = Date.now() + 5 * 864e5; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    states = await p.evaluate(STATES);
    ok('Alter Speicherstand übernommen: Stufe 3 für DE und EN, step/due entfernt', states.length === 2 && states.every(x => x.s === 3) && states.map(x => x.k).sort().join() === 'de,en' && await p.evaluate(() => !('due' in vtStore.read().items[5])), JSON.stringify(states));
    // Alter Code VT1 bleibt lesbar
    await p.click('nav button[data-v="data"]'); await p.click('#codeOpen'); await p.fill('#codeBox', 'VT1|d.2.fzz,e.0.g01|2'); await p.click('#codeApply'); await p.waitForTimeout(200);
    states = await p.evaluate(STATES);
    ok('Alter Code VT1 übernommen: je Wort Stände für DE und EN', states.length === 6 && states.filter(x => x.s === 2).length === 2, JSON.stringify(states.map(x => [x.id, x.k, x.s])));
    await p.evaluate(() => { const d = vtStore.read(); d.cfg.from = 'mix'; d.cfg.mode = 'check'; vtStore.write(d); });
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
    const requests = [], formReqs = [], topicReqs = [];
    await p.route('https://api.anthropic.com/**', async route => {
      const body = JSON.parse(route.request().postData());
      if (/^Thema: /.test(body.messages[0].content)) {
        // Thema aufbereiten: n Einträge zum Thema, einer davon schon vorhanden (Apfel)
        topicReqs.push(body);
        const n = +body.messages[0].content.match(/Anzahl: (\d+)/)[1], topic = body.messages[0].content.match(/^Thema: (.*)/)[1];
        const items = Array.from({ length: n }, (_, k) => ({ de: k === 0 ? 'Zahnrad' : 'Wort' + k, en: k === 0 ? 'cogwheel' : 'word' + k, fr: 'fr' + k, pl: 'pl' + k, ru: 'ru' + k, rulat: 'lat' + k, ex: 'Ex ' + k + '.', exde: 'Bsp ' + k + '.', cat: topic }));
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify({ items }) }] }) });
        return;
      }
      if (body.output_config.format.schema.properties.de) {
        // Formentafel für ein Verb: kleinste gültige Antwort
        formReqs.push(body);
        const lang = { inf: 'x', aspect: '', pair: '', note: '', tenses: [{ t: 'Präsens', rows: [{ p: 'ich', f: 'x' }] }] };
        const o = { de: lang, en: lang, fr: lang, pl: lang, ru: lang, ex: 'Ex.', exde: 'Bsp.' };
        await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'text', text: JSON.stringify(o) }] }) });
        return;
      }
      requests.push(body);
      const list = JSON.parse(body.messages[0].content.slice(body.messages[0].content.indexOf('[')));
      const items = list.map(e => { const w = e.de || e.en || e.wort || 'x'; return { de: e.de || 'de:' + w, en: e.en || 'en:' + w, fr: 'fr:' + w, pl: 'pl:' + w, ru: 'ru:' + w, rulat: 'lat:' + w, ex: 'Ex ' + w + '.', exde: 'Bsp ' + w + '.', cat: e.cat || 'Test' }; });
      await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ stop_reason: 'end_turn', content: [{ type: 'thinking', thinking: '' }, { type: 'text', text: JSON.stringify({ items }) }] }) });
    });
    await p.goto(URL); await p.waitForTimeout(400);
    await p.click('nav button[data-v="new"]');
    await p.fill('#listBox', '# Dienst\n- Zahnrad – cogwheel\ndie Dachrinne\n3. Schneeschaufel: snow shovel\n\n');
    await p.click('#listGo'); await p.waitForTimeout(200);
    let items = await p.evaluate(() => vtStore.read().items.filter(i => i.deck === 'Dienst'));
    ok('Liste ohne Schlüssel: 3 Wörter im Stapel aus der Überschrift', items.length === 3 && items[0].de === 'Zahnrad' && items[0].en === 'cogwheel' && items[1].de === 'die Dachrinne' && items[1].en === '' && items[2].en === 'snow shovel', JSON.stringify(items.map(i => [i.de, i.en])));
    ok('Liste ohne Schlüssel: Hinweis auf Schlüssel', /3 Wörter im Stapel „Dienst"/.test(await p.textContent('#listMsg')) && /Schlüssel/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    await p.click('#listGo'); await p.waitForTimeout(200);
    items = await p.evaluate(() => vtStore.read().items.filter(i => i.deck === 'Dienst'));
    ok('Liste erneut: nichts doppelt angelegt', items.length === 3 && /0 Wörter/.test(await p.textContent('#listMsg')) && /3 schon vorhanden/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    ok('Nachübersetzen: 3 unvollständige Wörter gemeldet, keine Tafeln offen', /^3 Wörter ohne vollständige Übersetzung oder Beispielsatz\.$/.test((await p.textContent('#fillInfo')).trim()), (await p.textContent('#fillInfo')).trim());
    // Schlüssel hinterlegen, Liste in Englisch mit Übersetzung
    await p.fill('#apiKey', 'sk-ant-test'); await p.click('#keySave');
    await p.click('#listLang [data-l="en"]');
    await p.fill('#listDeck', 'Englisch');
    await p.fill('#listBox', 'sailboat\nlighthouse = Leuchtturm');
    await p.click('#listGo');
    await p.waitForFunction(() => /Alle übersetzt/.test(document.querySelector('#listMsg').textContent), null, { timeout: 5000 }).catch(() => {});
    items = await p.evaluate(() => vtStore.read().items.filter(i => i.deck === 'Englisch'));
    ok('Liste mit Schlüssel: Englisch als Ausgangssprache, alle Felder gefüllt, Vorhandenes bleibt', items.length === 2 && items[0].en === 'sailboat' && items[0].de === 'de:sailboat' && items[0].ru === 'ru:sailboat' && items[0].exde === 'Bsp sailboat.' && items[1].de === 'Leuchtturm' && items[1].fr === 'fr:Leuchtturm', JSON.stringify(items));
    ok('Liste mit Schlüssel: Feld geleert, Meldung', (await p.inputValue('#listBox')) === '' && /Alle übersetzt/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    const req = requests[0];
    ok('API-Anfrage: Modell, JSON-Schema, Schlüssel im Kopf', req && req.model === 'claude-opus-5-5' && req.output_config.format.type === 'json_schema' && req.output_config.format.schema.properties.items.items.required.includes('rulat') && req.max_tokens >= 4000, req && JSON.stringify([req.model, req.output_config && req.output_config.format.type]));
    // Nachübersetzen füllt die drei alten Wörter
    await p.click('#fillGo');
    await p.waitForFunction(() => /ergänzt|Formentafeln/.test(document.querySelector('#fillMsg').textContent), null, { timeout: 60000 }).catch(() => {});
    items = await p.evaluate(() => vtStore.read().items.filter(i => i.deck === 'Dienst'));
    ok('Nachübersetzen: alte Wörter vervollständigt, eingegebene Übersetzung bleibt', items.every(i => i.fr && i.pl && i.ru && i.ex && i.exde) && items[0].en === 'cogwheel' && items[1].en === 'en:die Dachrinne', JSON.stringify(items.map(i => [i.de, i.en, i.fr])));
    ok('Nachübersetzen: nichts mehr offen', /vollständig übersetzt/.test(await p.textContent('#fillInfo')) && await p.$eval('#fillGo', b => b.disabled), (await p.textContent('#fillInfo')).trim());
    ok('Zwei Aufrufe für zwei Übersetzungsrunden, keine für Formentafeln (Grundstock vollständig)', requests.length === 2 && formReqs.length === 0, 'Aufrufe: ' + requests.length + ' / Formen: ' + formReqs.length);
    // Formentafel für ein eigenes Verb beim Anlegen unter „Neu“
    await p.click('nav button[data-v="new"]'); await p.fill('#f-de', 'tanzen'); await p.fill('#f-en', 'to dance'); await p.click('#fSave');
    await p.waitForFunction(() => /Formentafel ergänzt/.test(document.querySelector('#fMsg').textContent), null, { timeout: 10000 }).catch(() => {});
    const own = await p.evaluate(() => vtStore.read().items.find(i => i.de === 'tanzen'));
    // Thema aufbereiten
    await p.fill('#topicName', 'Beim Arzt'); await p.fill('#topicN', '8'); await p.fill('#topicDeck', 'Themen'); await p.click('#topicGo');
    await p.waitForFunction(() => /angelegt/.test(document.querySelector('#topicMsg').textContent), null, { timeout: 10000 }).catch(() => {});
    const th = await p.evaluate(() => vtStore.read().items.filter(i => i.deck === 'Themen'));
    ok('Thema aufbereiten: 7 neue Wörter im Stapel „Themen“ mit Thema als Kategorie, Dublette „Zahnrad“ übersprungen', topicReqs.length === 1 && th.length === 7 && th.every(i => i.cat === 'Beim Arzt' && i.ru && i.exde) && /7 Wörter.*1 schon vorhanden/.test(await p.textContent('#topicMsg')) && topicReqs[0].system.length > 100, (await p.textContent('#topicMsg')).trim());
    await p.click('nav button[data-v="learn"]'); await p.click('#deckPick [data-d="Themen"]'); await p.waitForTimeout(100);
    ok('Thema abrufen: Stapel „Themen“ zeigt das Thema als Kategorie', (await p.$$eval('#catPick .chipbtn', b => b.map(x => x.textContent))).join() === 'Alle Themen,Beim Arzt' && (await p.textContent('#cPool')) === '7');
    await p.click('nav button[data-v="new"]');
    ok('Eigenes Verb: Tafel über die API geholt und am Wort gespeichert', formReqs.length === 1 && own && own.forms && own.forms.ru && own.ex === 'Ex.' && formReqs[0].output_config.format.schema.required.includes('ru'), JSON.stringify(own && Object.keys(own.forms || {})));
    // Liste aus dem Link
    await p.goto('about:blank'); await p.goto(URL + '#liste=' + encodeURIComponent('Urlaub – leave\nDienstreise')); await p.waitForTimeout(400);
    ok('Link: Liste im Feld, Ansicht „Neu“, Adresse bereinigt', (await p.inputValue('#listBox')) === 'Urlaub – leave\nDienstreise' && await p.$eval('#v-new', v => v.classList.contains('on')) && await p.evaluate(() => location.hash === '' && location.search === '') && /2 Zeilen aus dem Link/.test(await p.textContent('#listMsg')), (await p.textContent('#listMsg')).trim());
    ok('Liste: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  // 3. Formkarten: Stapel Verben, Richtung DE→EN, nur Formen fällig
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('vokabeltrainer-v1-seen', '1'); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { const d = vtStore.read(); const far = Date.now() + 200 * 864e5;
      d.items.forEach(i => { i.p = { en: { s: 6, d: far } }; }); d.cfg.from = 'de'; d.cfg.to = ['en']; d.cfg.mode = 'type';
      vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#deckPick [data-d="Verben"]'); await p.waitForTimeout(100);
    ok('Stapel Verben: 60 Verben in der Auswahl, Tagespensum 20 aus 360 neuen Formkarten', (await p.textContent('#cPool')) === '60' && (await p.textContent('#cNew')) === '20', 'pool=' + await p.textContent('#cPool') + ' neu=' + await p.textContent('#cNew'));
    await p.click('#start'); await p.waitForTimeout(200);
    const task = await p.innerHTML('#qTask');
    ok('Formkarte: Infinitiv, Aufgabe „Tempus · Person“, Sprache EN, ein Feld', /^(to |can)/.test((await p.textContent('#qWord')).trim()) && await p.isVisible('#qTask') && /<b>[^<]+<\/b> · .+/.test(task) && (await p.textContent('#qLang')) === 'EN' && (await p.$$('#typeFields input')).length === 1 && (await p.textContent('#counter')) === '1 von 20', task + ' / ' + (await p.textContent('#qWord')).trim());
    await p.fill('#typeFields input', 'zzz'); await p.click('#reveal'); await p.waitForTimeout(100);
    const hit = await p.$eval('#ans .ftab tr.hit td:last-child', td => td.textContent);
    const shown = await p.$eval('#ans .aword', a => a.textContent);
    const hitSeen = await p.evaluate(() => { const m = document.querySelector('#dmid').getBoundingClientRect(), r = document.querySelector('#ans tr.hit').getBoundingClientRect(); return r.top >= m.top && r.bottom <= m.bottom; });
    ok('Formkarte: Auflösung beginnt oben, Trefferzeile im Bild, Anfang erreichbar', (await p.$eval('#dmid', e => getComputedStyle(e).justifyContent)) === 'flex-start' && hitSeen && ((await p.$eval('#dmid', e => e.scrollTop)) === 0 || (await p.$eval('#ans', e => e.scrollHeight)) > (await p.$eval('#dmid', e => e.clientHeight))), 'scrollTop=' + await p.$eval('#dmid', e => e.scrollTop) + ' hit=' + hitSeen);
    ok('Formkarte: Tafel mit markierter Zeile, Form als Lösung, „Nochmal“ vorgewählt, Melde-Knopf', await p.isVisible('#ans .ftab') && hit === shown && (await p.$$('#ans .ftab tr:not(.grp)')).length >= 2 && (await p.$eval('#grades .g.pick', b => b.dataset.g)) === '0' && await p.isVisible('#repBtn'), hit + ' / ' + shown);
    await p.click('#repBtn'); await p.waitForTimeout(100);
    const rep1 = await p.evaluate(() => vtStore.read().rep);
    ok('Form melden: Eintrag mit Verb, Sprache, Tempus, Person, Form', rep1.length === 1 && rep1[0].lang === 'en' && rep1[0].f === hit && rep1[0].tense && rep1[0].p && (await p.textContent('#repBtn')) === 'Gemeldet', JSON.stringify(rep1));
    await p.click('#n1'); await p.waitForTimeout(100);
    let g = await p.evaluate(() => { const d = vtStore.read(); const out = []; d.items.forEach(i => Object.keys(i.g || {}).forEach(k => Object.keys(i.g[k]).forEach(t => out.push([i.id, k, +t, i.g[k][t].s])))); return out; });
    ok('Formkarte „Gut“: Stand je Verb, Sprache, Tempus auf Stufe 0, Zähler weiter', g.length === 1 && g[0][1] === 'en' && g[0][3] === 0 && (await p.textContent('#counter')) === '2 von 20', JSON.stringify(g));
    // zweite Karte richtig: Lösung steht verborgen schon im DOM
    const answer = await p.$eval('#ans .aword', a => a.textContent.trim());
    await p.fill('#typeFields input', answer); await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    ok('Formkarte richtig: „Gut“ vorgewählt, Verdict grün', (await p.$eval('#grades .g.pick', b => b.dataset.g)) === '1' && /ok/.test(await p.$eval('#ans .verdict', v => v.className)));
    await p.keyboard.press('Enter'); await p.waitForTimeout(100);
    await p.click('#stop'); await p.waitForTimeout(200);
    ok('Meldungen unter Daten gezählt', /1 gemeldete/.test(await p.textContent('#repInfo')), (await p.textContent('#repInfo')).trim());
    // Fortschritts-Code trägt Grammatikstände (fünftes Feld)
    await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('kein Zugriff')); });
    await p.click('nav button[data-v="data"]'); await p.click('#codeCopy'); await p.waitForTimeout(200);
    const code = await p.inputValue('#codeBox');
    const f = code.split('|');
    ok('Code VT2 mit Grammatikfeld: zwei Einträge index.e.tempus.stufe.tag', f.length === 5 && f[4].split(',').length === 2 && /^[0-9a-z]+\.e\.[0-9a-z]+\.0\.[0-9a-z]+$/.test(f[4].split(',')[0]), f[4]);
    await p.click('#codeClose');
    // Verbformen abschalten: nichts mehr fällig
    await p.click('#modePick [data-m="forms"]'); await p.waitForTimeout(100);
    await p.click('nav button[data-v="learn"]');
    ok('„Verbformen mitlernen“ aus: Startknopf meldet nichts Fälliges', (await p.textContent('#start')).trim() === 'Heute nichts fällig' && (await p.textContent('#cNew')) === '0');
    ok('Formkarten: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();
    // Code in frischer Sitzung: Grammatikstände kommen an
    const ctx2 = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx2.addInitScript(() => { try { localStorage.setItem('vokabeltrainer-v1-seen', '1'); } catch (e) {} });
    const p2 = await ctx2.newPage(); await p2.goto(URL); await p2.waitForTimeout(400);
    await p2.click('nav button[data-v="data"]'); await p2.click('#codeOpen'); await p2.fill('#codeBox', code); await p2.click('#codeApply'); await p2.waitForTimeout(200);
    g = await p2.evaluate(() => { const d = vtStore.read(); const out = []; d.items.forEach(i => Object.keys(i.g || {}).forEach(k => Object.keys(i.g[k]).forEach(t => out.push([i.id, k, +t, i.g[k][t].s])))); return out; });
    ok('Code eingesetzt: zwei Grammatikstände wiederhergestellt', g.length === 2 && g.every(x => x[1] === 'en' && x[3] === 0), JSON.stringify(g));
    await ctx2.close();
  }

  // 4. Kasuskarten: Stapel Substantive, Richtung DE→RU
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('vokabeltrainer-v1-seen', '1'); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { const d = vtStore.read(); const far = Date.now() + 200 * 864e5;
      d.items.forEach(i => { i.p = { ru: { s: 6, d: far } }; }); d.cfg.from = 'de'; d.cfg.to = ['ru']; d.cfg.mode = 'check';
      vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#deckPick [data-d="Substantive"]'); await p.waitForTimeout(100);
    ok('Stapel Substantive: 60 Wörter, Tagespensum 20 aus den Kasuskarten', (await p.textContent('#cPool')) === '60' && (await p.textContent('#cNew')) === '20', 'pool=' + await p.textContent('#cPool') + ' neu=' + await p.textContent('#cNew'));
    await p.click('#start'); await p.waitForTimeout(200);
    const qw = (await p.textContent('#qWord')).replace(/\s+/g, ' ').trim(), task = await p.innerHTML('#qTask');
    ok('Kasuskarte: Grundform mit Genus, Aufgabe „Numerus · Fall“ mit Frage', /^[\u0400-\u04ff\u0301 ]+ · (m|f|n)/.test(qw) && /<b>(Singular|Plural)<\/b> · (Nominativ|Genitiv|Dativ|Akkusativ|Instrumental|Präpositiv) <span class="qq">[^<]*\?[^<]*<\/span>/.test(task), qw + ' / ' + task);
    await p.click('#reveal'); await p.waitForTimeout(100);
    const rows = await p.$$eval('#ans .ftab tr:not(.grp)', tr => tr.map(r => r.children[0].textContent));
    ok('Kasuskarte: Tafel mit sechs Fällen, Lösung markiert', rows.length === 6 && /^Nominativ/.test(rows[0]) && /^Präpositiv/.test(rows[5]) && (await p.$$('#ans .ftab tr.hit')).length === 1, rows.join(','));
    const smalls = await p.$$eval('#ans .ftab tr td:first-child small', el => el.map(x => x.textContent));
    ok('Kasuskarte: Fragewörter und russische Fallnamen in Aufgabe und Tafel', /\?/.test(task) && smalls.length === 6 && smalls[0] === 'имени́тельный · кто? что?' && smalls[2] === 'да́тельный · кому́? чему́?', smalls.join(' | '));
    await p.click('#n2'); await p.waitForTimeout(100);
    const g = await p.evaluate(() => { const d = vtStore.read(); const out = []; d.items.forEach(i => Object.keys(i.g || {}).forEach(k => Object.keys(i.g[k]).forEach(t => out.push([i.id, k, +t, i.g[k][t].s])))); return out; });
    ok('Kasuskarte „Leicht“: Stand auf Stufe 1 unter sb-Kennung und ru', g.length === 1 && /^sb/.test(g[0][0]) && g[0][1] === 'ru' && g[0][3] === 1, JSON.stringify(g));
    await p.click('#stop'); await p.waitForTimeout(100);
    ok('Kasuskarten: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  // 5. Adjektiv- und Pronomenkarten: DE→PL, Stapel Adjektive und Pronomen
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { try { localStorage.setItem('vokabeltrainer-v1-seen', '1'); } catch (e) {} });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(400);
    await p.evaluate(() => { const d = vtStore.read(); const far = Date.now() + 200 * 864e5;
      d.items.forEach(i => { i.p = { pl: { s: 6, d: far } }; }); d.cfg.from = 'de'; d.cfg.to = ['pl']; d.cfg.mode = 'check';
      vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#deckPick [data-d="Adjektive"]'); await p.waitForTimeout(100);
    ok('Stapel Adjektive: 40 Wörter, Tagespensum 20 aus 120 Tafelkarten', (await p.textContent('#cPool')) === '40' && (await p.textContent('#cNew')) === '20', 'pool=' + await p.textContent('#cPool') + ' neu=' + await p.textContent('#cNew'));
    await p.click('#start'); await p.waitForTimeout(200);
    const task = await p.innerHTML('#qTask');
    ok('Adjektivkarte: polnisches Adjektiv, Aufgabe aus Komparation oder Kasus mit Genus', /^\p{Ll}/u.test((await p.textContent('#qWord')).trim()) && /<b>(Komparation|Singular|Plural)<\/b> · /.test(task), task + ' / ' + (await p.textContent('#qWord')).trim());
    await p.click('#reveal'); await p.waitForTimeout(100);
    const n = (await p.$$('#ans .ftab tr:not(.grp)')).length;
    const grp = (await p.$$('#ans .ftab tr.grp')).length;
    const qs = (await p.$$('#ans .ftab tr.grp td small')).length;
    const genus = await p.$$eval('#ans .ftab tr:not(.grp) td:first-child', td => td.map(x => x.textContent.trim()));
    ok('Adjektivkarte: Tafel vollständig (3, 21 oder 14 Zeilen), Kasuszeilen in sieben Gruppen mit Fragewörtern, Zeilen nur mit Genus', [3, 21, 14].includes(n) && (await p.$$('#ans .ftab tr.hit')).length === 1 && grp === (n === 3 ? 0 : 7) && qs === grp && (n === 3 || genus.every(g => /^\S{1,10}$/.test(g) && !/^(Nominativ|Genitiv|Dativ)/.test(g))), 'Zeilen: ' + n + ', Gruppen: ' + grp + ', mit Frage: ' + qs + ', ' + genus.slice(0, 4).join('|'));
    await p.click('#n1'); await p.waitForTimeout(100); await p.click('#stop'); await p.waitForTimeout(100);
    await p.click('#deckPick [data-d="Pronomen"]'); await p.waitForTimeout(100);
    ok('Stapel Pronomen: 11 Wörter, 11 neue Tafelkarten (je eine Tafel Fälle)', (await p.textContent('#cPool')) === '11' && (await p.textContent('#cNew')) === '11', 'neu=' + await p.textContent('#cNew'));
    await p.click('#start'); await p.waitForTimeout(200);
    const pw = (await p.textContent('#qWord')).trim(), pt = await p.innerHTML('#qTask');
    await p.click('#reveal'); await p.waitForTimeout(100);
    const rows = await p.$$eval('#ans .ftab tr:not(.grp)', tr => tr.map(r => r.children[1].textContent));
    ok('Pronomenkarte: polnisches Pronomen, Fälle mit Fragewörtern, Tafel mit sechs Formen', /^\p{L}/u.test(pw) && /<b>Fälle<\/b> · (Nominativ|Genitiv|Dativ|Akkusativ|Instrumental|Lokativ) <span class="qq">/.test(pt) && rows.length === 6 && rows.every(Boolean), pw + ' / ' + rows.join(','));
    await p.click('#stop'); await p.waitForTimeout(100);
    ok('Adjektive und Pronomen: keine Seitenfehler', errs.length === 0, errs.join('; '));
    await ctx.close();
  }

  // 6. Start ohne Speicher
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { Object.defineProperty(window, 'localStorage', { get() { throw new Error('gesperrt'); } }); });
    const p = await ctx.newPage();
    const errs = []; p.on('pageerror', e => errs.push(e.message));
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Ohne Speicher: App läuft, Grundstock da', /3512/.test(await p.textContent('#stat')));
    ok('Ohne Speicher: roter Balken mit Sichern/Laden', await p.isVisible('#savebar') && await p.isVisible('#sbCopy') && await p.isVisible('#sbLoad'));
    await p.click('#welcomeGo'); await p.waitForTimeout(100);
    await p.click('#start'); await p.click('#reveal'); await p.click('#n1'); await p.waitForTimeout(200);
    await p.click('#reveal'); await p.click('#n2'); await p.waitForTimeout(200);
    await p.click('#stop'); await p.waitForTimeout(200);
    ok('Ohne Speicher: Balken zählt ungesicherte Antworten', /2 Antworten/.test(await p.textContent('#savetxt')), (await p.textContent('#savetxt')).trim());
    await p.evaluate(() => { navigator.clipboard.writeText = () => Promise.reject(new Error('kein Zugriff')); });
    await p.click('#sbCopy'); await p.waitForTimeout(300);
    const code = await p.inputValue('#codeBox');
    ok('Ohne Speicher: „Sichern“ zeigt Code (VT2|…)', await p.isVisible('#codeWrap') && /^VT2\|[0-9a-z]+\.[de]\.[0-9a-z]+\.[0-9a-z]+,/.test(code), code.slice(0, 50));
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
    const after = await p2.evaluate(STATES);
    const log2 = await p2.evaluate(() => vtStore.read().log);
    ok('Code in frischer Sitzung übernommen (2 Stände, Stufen 0 und 1, 2 neue heute)', after.length === 2 && after.map(x => x.s).sort().join() === '0,1' && Object.values(log2)[0] === 2, JSON.stringify(after));
    await ctx2.close();
  }

  // 7. Leerer Speicherstand
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    await ctx.addInitScript(() => { localStorage.setItem('vokabeltrainer-v1', JSON.stringify({ cfg: { newPerDay: 5 } })); localStorage.setItem('vokabeltrainer-v1-seen', '1'); });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(500);
    ok('Leerer Stand: Grundstock wiederhergestellt', /3512/.test(await p.textContent('#stat')));
    ok('Leerer Stand: Einstellung erhalten (5/Tag)', await p.evaluate(() => vtStore.read().cfg.newPerDay === 5));
    await ctx.close();
  }

  // 7b. Runden, gemischtes Neues, Pensum im gemischten Modus, Ergebnisblatt, Serie, gemerkte Auswahl
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(400);
    await p.click('#wLang [data-wl="pl"]'); await p.click('#wDeckPick [data-wd="Küche"]'); await p.click('#welcomeGo'); await p.waitForTimeout(100);
    const cfg0 = await p.evaluate(() => vtStore.read().cfg);
    ok('Begrüßung: Polnisch und Küche gewählt ergibt Richtung DE→PL und Stapel Küche', cfg0.from === 'de' && cfg0.to.join() === 'pl' && cfg0.deck === 'Küche' && (await p.textContent('#cPool')) === '500', JSON.stringify([cfg0.from, cfg0.to, cfg0.deck]));
    await p.reload(); await p.waitForTimeout(400);
    ok('Stapelwahl bleibt nach Neuladen erhalten', (await p.$eval('#deckPick .chipbtn.on', b => b.textContent)) === 'Küche' && (await p.textContent('#cPool')) === '500');
    await p.click('#start'); await p.waitForTimeout(150);
    ok('Frageseite nennt die gesuchte Sprache', /gesucht: .*Polnisch/.test(await p.textContent('#qTo')) && await p.isVisible('#qTo'));
    await p.click('#reveal');
    ok('Nach dem Aufdecken ist der Hinweis auf die gesuchte Sprache weg', !(await p.isVisible('#qTo')));
    await p.click('#stop'); await p.waitForTimeout(100);
    // viel Fälliges: Runde bleibt bei 20, davon mindestens 5 neue
    await p.evaluate(() => { const d = vtStore.read(); const t = Date.now() - 1000;
      d.items.forEach((i, n) => { i.p = n % 2 ? { pl: { s: 2, d: t } } : {}; delete i.g; }); d.cfg.forms = false; d.cfg.deck = 'alle'; d.cfg.from = 'mix'; d.log = {}; d.days = {}; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    // gemischt: ein neues Wort belastet das Pensum einmal, nicht für DE und EN getrennt
    ok('Gemischt: Pensum 20 ergibt 20 neue Karten', (await p.textContent('#cNew')) === '20', 'neu=' + await p.textContent('#cNew'));
    await p.evaluate(() => { const d = vtStore.read(); d.cfg.from = 'de'; d.cfg.to = ['pl']; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#start'); await p.waitForTimeout(150);
    const roundIds = await p.evaluate(() => document.querySelector('#counter').textContent);
    ok('Runde: höchstens 20 Karten trotz über 1.000 fälligen', roundIds === '1 von 20', roundIds);
    // die Runde zu Ende bewerten (alles „Gut“), Neues muss aus mehreren Stapeln kommen
    const newDe = await p.evaluate(() => { const d = vtStore.read(); const m = {}; d.items.forEach(x => { if (!(x.p && x.p.pl) && x.de && x.pl) m[x.de] = x.deck; }); return m; });
    const seenDecks = new Set(); let guard = 0;
    while (await p.isVisible('#reveal') && guard++ < 40) {
      const w = (await p.textContent('#qWord')).trim().replace(/\s*►$/, '');
      if (newDe[w]) seenDecks.add(newDe[w]);
      await p.click('#reveal'); await p.click('#n1'); await p.waitForTimeout(30);
    }
    const sheet = (await p.textContent('#rsheet')).replace(/\s+/g, ' ');
    ok('Ergebnisblatt nach 20 Karten: 20 gewusst, nächste Runde angeboten', /20 Karten · 20 auf Anhieb gewusst · 0 noch einmal geübt/.test(sheet) && await p.isVisible('#roundNext') && /Nächste Runde \(20\)/.test(await p.textContent('#roundNext')), sheet);
    ok('Neues aus mehreren Stapeln gemischt, nicht nur Personalgewinnung', seenDecks.size >= 3, [...seenDecks].join(', '));
    const days = await p.evaluate(() => vtStore.read().days);
    ok('Tagesserie: heutige Bewertungen gezählt', Object.values(days).reduce((a, b) => a + b, 0) === 20, JSON.stringify(days));
    await p.click('#roundNext'); await p.waitForTimeout(150);
    ok('„Nächste Runde“ startet sofort die nächsten 20', await p.isVisible('#reveal') && (await p.textContent('#counter')) === '1 von 20' && !(await p.isVisible('#rsheet')));
    await p.click('#reveal'); await p.click('#n1'); await p.waitForTimeout(50);
    await p.click('#stop'); await p.waitForTimeout(100);
    ok('Beenden mitten in der Runde: Hinweis „Gespeichert“', /Gespeichert/.test(await p.textContent('#toast')));
    // Serie über drei Tage
    await p.evaluate(() => { const d = vtStore.read(); const k = x => x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0');
      const t = new Date(); d.days = {}; for (let n = 1; n <= 3; n++) { const x = new Date(t); x.setDate(t.getDate() - n); d.days[k(x)] = 5; } vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('#start'); await p.waitForTimeout(100);
    for (let n = 0; n < 20 && await p.isVisible('#reveal'); n++) { await p.click('#reveal'); await p.click('#n1'); await p.waitForTimeout(20); }
    ok('Ergebnisblatt zeigt die Serie (heute plus drei Tage davor)', /4 Tage in Folge/.test(await p.textContent('#rsheet')), (await p.textContent('#rsheet')).replace(/\s+/g, ' '));
    await ctx.close();
  }

  // 7c. Speicherform v2: Übernahme aus v1, Größe, Korrekturen am Grundstock, Sicherungsdatei, Escaping, Doppeltipp
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, acceptDownloads: true });
    await ctx.addInitScript(() => { window.vtTapLock = 400; });
    const p = await ctx.newPage();
    await p.goto(URL); await p.waitForTimeout(400);
    // alten v1-Stand nachbauen: ganzer Bestand mit veraltetem Text, nachgetragenem Feld, Lernstand, eigenem Wort, gelöschtem Grundstockwort
    const v1 = await p.evaluate(() => {
      const items = SEED.map(x => Object.assign({}, x, { p: {} }));
      items[0].de = 'ALTER TEXT'; items[0].p = { en: { s: 3, d: 1e12 } };
      const blank = items.find(x => !x.rulat && x.ru); if (blank) blank.rulat = 'nachgetragen';
      const gone = items.splice(5, 1)[0].id;
      items.unshift({ id: 'u1', de: 'Eigenwort', en: 'own word', deck: 'Eigene', p: { en: { s: 1, d: 2e12 } } });
      localStorage.clear(); localStorage.setItem('vokabeltrainer-v1', JSON.stringify({ items, cfg: { newPerDay: 7 }, log: {}, seedn: SEED.length }));
      localStorage.setItem('vokabeltrainer-v1-seen', '1');
      return { first: SEED[0].id, firstDe: SEED[0].de, blank: blank && blank.id, gone, size: localStorage.getItem('vokabeltrainer-v1').length };
    });
    await p.reload(); await p.waitForTimeout(500);
    const v2 = await p.evaluate(() => ({ raw: localStorage.getItem('vokabeltrainer-v2'), d: vtStore.read() }));
    const it = id => v2.d.items.find(x => x.id === id);
    ok('v1 → v2: Lernstand, eigenes Wort, Pensum und Löschung übernommen', it(v1.first).p.en.s === 3 && !!it('u1') && it('u1').p.en.s === 1 && v2.d.cfg.newPerDay === 7 && !it(v1.gone), JSON.stringify([it(v1.first) && it(v1.first).p, !!it('u1'), v2.d.cfg.newPerDay, !!it(v1.gone)]));
    ok('v1 → v2: veralteter Grundstocktext durch aktuellen ersetzt, nachgetragenes Feld bleibt', it(v1.first).de === v1.firstDe && (!v1.blank || it(v1.blank).rulat === 'nachgetragen'), it(v1.first).de);
    ok('v2 ist klein: unter 5 % des alten Stands', v2.raw.length < v1.size * 0.05, v2.raw.length + ' statt ' + v1.size + ' Zeichen');
    ok('v1 bleibt als Rückfall liegen', await p.evaluate(() => !!localStorage.getItem('vokabeltrainer-v1')));
    // Sicherungsdatei: ohne Schlüssel, und sie bringt den Lernstand zurück
    await p.evaluate(() => { const d = vtStore.read(); d.key = 'sk-ant-geheim'; vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('nav button[data-v="data"]');
    const [dlEv] = await Promise.all([p.waitForEvent('download'), p.click('#expJson')]);
    const file = require('fs').readFileSync(await dlEv.path(), 'utf8');
    ok('Sicherungsdatei enthält keinen API-Schlüssel', !/sk-ant-geheim/.test(file) && /"items"/.test(file));
    await p.evaluate(() => { const d = vtStore.read(); d.items.forEach(i => { i.p = {}; }); vtStore.write(d); });
    await p.reload(); await p.waitForTimeout(400);
    await p.click('nav button[data-v="data"]');
    await p.setInputFiles('#imp', { name: 'sicherung.json', mimeType: 'application/json', buffer: Buffer.from(file) });
    await p.waitForTimeout(400);
    const back = await p.evaluate(id => vtStore.read().items.find(x => x.id === id).p, v1.first);
    ok('Sicherungsdatei bringt den Lernstand zurück', back.en && back.en.s === 3 && /Lernstände übernommen/.test(await p.textContent('#toast')), JSON.stringify(back) + ' / ' + await p.textContent('#toast'));
    // präparierte Datei: Id mit HTML wird abgewiesen, kein Skript läuft
    const evil = JSON.stringify({ items: [{ id: 'x"><img src=x onerror="window.__pwn=1">', de: 'böse', en: 'evil' }, { id: 'ok1', de: 123, en: 'zahlwortqq' }] });
    await p.setInputFiles('#imp', { name: 'evil.json', mimeType: 'application/json', buffer: Buffer.from(evil) });
    await p.waitForTimeout(300);
    await p.click('nav button[data-v="words"]'); await p.fill('#search', 'zahlwortqq'); await p.waitForTimeout(300);
    ok('Import: Id mit HTML abgewiesen, Zahl als Text übernommen, kein Skript', !(await p.evaluate(() => window.__pwn)) && await p.evaluate(() => vtStore.read().items.some(i => i.id === 'ok1' && i.de === '123')) && /1 Treffer/.test(await p.textContent('#wCount')));
    // Doppeltipp auf Aufdecken bewertet nicht ungesehen
    await p.click('nav button[data-v="learn"]');
    await p.click('#start'); await p.waitForTimeout(100);
    const before = await p.textContent('#counter');
    await p.click('#reveal'); await p.click('#n1', { force: true, noWaitAfter: true });
    ok('Doppeltipp: zweiter Tipp direkt nach dem Aufdecken bewertet nicht', (await p.textContent('#counter')) === before && await p.isVisible('#grades'), before + ' → ' + await p.textContent('#counter'));
    await p.waitForTimeout(450); await p.click('#n1'); await p.waitForTimeout(100);
    ok('Doppeltipp: nach kurzer Pause bewertet der Tipp', (await p.textContent('#counter')) !== before);
    ok('Lernfenster sperrt den Hintergrund (inert)', await p.evaluate(() => document.querySelector('.wrap').inert && document.querySelector('header').inert));
    await p.click('#stop'); await p.waitForTimeout(100);
    ok('Nach Beenden ist der Hintergrund wieder bedienbar', await p.evaluate(() => !document.querySelector('.wrap').inert));
    await ctx.close();
  }

  // 8. Offline-Start nach erstem Besuch (Service Worker)
  {
    const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
    const p = await ctx.newPage();
    await p.goto(URL);
    await p.evaluate(() => navigator.serviceWorker.ready);
    await p.waitForTimeout(1500);
    const cached = await p.evaluate(async () => { const ks = await caches.keys(); const c = await caches.open(ks[0]); return { keys: ks, n: (await c.keys()).length }; });
    ok('Service Worker aktiv, Cache gefüllt', cached.keys.length === 1 && cached.n >= 3, JSON.stringify(cached));
    // die Anleitung online öffnen: darf den Speichereintrag der App nicht überschreiben
    const pk = await ctx.newPage(); await pk.goto(URL + 'kurzbefehl.html'); await pk.waitForTimeout(800); await pk.close();
    await ctx.setOffline(true);
    const p3 = await ctx.newPage();
    let offlineOk = true;
    try { await p3.goto(URL); await p3.waitForTimeout(500); offlineOk = /3512/.test(await p3.textContent('#stat')); } catch (e) { offlineOk = false; out.push('   ' + e.message.split('\n')[0]); }
    ok('Offline-Start liefert die App aus dem Cache, auch nach Besuch der Anleitung', offlineOk && await p3.isVisible('#start'));
    const p4 = await ctx.newPage(); let howOk = false;
    try { await p4.goto(URL + 'kurzbefehl.html'); howOk = !(await p4.$('#start')) && /Kurzbefehl/.test(await p4.title() + await p4.textContent('body')); } catch (e) { }
    ok('Offline: die Anleitung kommt unter ihrer eigenen Adresse', howOk);
    await ctx.close();
  }

  await browser.close();
  if (srv) srv.kill();
  console.log(out.join('\n'));
  const fails = out.filter(l => l.startsWith('FEHL')).length;
  console.log(`\n${out.length - fails} bestanden, ${fails} fehlgeschlagen`);
  process.exit(fails ? 1 : 0);
})().catch(e => { console.error(e); process.exit(2); });
