#!/usr/bin/env node
// Entegra'dan siparişleri çekip docs/data altına aylık dosyalar halinde kaydeder.
//
// Ortam değişkenleri:
//   ENTEGRA_EMAIL, ENTEGRA_PASSWORD  (zorunlu) Entegra API kullanıcısı
//   DASHBOARD_PASSWORD               (önerilir) veri dosyalarını şifreler
//   START_DATE, END_DATE             (isteğe bağlı) YYYY-MM-DD; boşsa son LOOKBACK_DAYS gün
//   LOOKBACK_DAYS                    (isteğe bağlı) varsayılan 7
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ENTEGRA, DEFAULT_LOOKBACK_DAYS, TIMEZONE, FIELDS } from './config.mjs';
import { normalizeOrder, extractList, pick, parseDate } from './lib/normalize.mjs';
import { Store } from './lib/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'docs', 'data');

const env = (k) => (process.env[k] || '').trim();
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const log = (...a) => console.log(new Date().toISOString().slice(11, 19), ...a);

function todayTR() {
  return new Intl.DateTimeFormat('en-CA', { timeZone: TIMEZONE }).format(new Date());
}
function addDays(ymd, n) {
  const d = new Date(`${ymd}T12:00:00Z`);
  d.setUTCDate(d.getUTCDate() + n);
  return d.toISOString().slice(0, 10);
}
function isYmd(s) {
  return /^\d{4}-\d{2}-\d{2}$/.test(s);
}

// Uzun aralıkları en fazla 7 günlük, ay sınırını aşmayan parçalara böler.
// Entegra yavaş yanıt verdiği için her parça bitince kaydedilir.
function chunks(start, end) {
  const out = [];
  let s = start;
  while (s <= end) {
    const monthEnd = addDays(`${addDays(`${s.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
    const weekEnd = addDays(s, 6);
    let e = monthEnd < end ? monthEnd : end;
    if (weekEnd < e) e = weekEnd;
    out.push([s, e]);
    s = addDays(e, 1);
  }
  return out;
}

async function request(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(45000) });
      if (res.status >= 500 && i < tries) throw new Error(`HTTP ${res.status}`);
      return res;
    } catch (err) {
      if (i >= tries) throw err;
      const wait = 2000 * 2 ** (i - 1);
      log(`  ↻ ${err.message} — ${wait / 1000} sn sonra tekrar (${i}/${tries - 1})`);
      await sleep(wait);
    }
  }
}

async function getToken(email, password) {
  const res = await request(ENTEGRA.baseUrl + ENTEGRA.tokenPath, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password }),
  });
  const body = await res.json().catch(() => ({}));
  const token = body.access || body.token || body.access_token;
  if (!res.ok || !token) {
    throw new Error(`Entegra girişi başarısız (HTTP ${res.status}). E-posta/şifreyi ve API yetkisini kontrol edin.`);
  }
  return token;
}

// Kontrol için pazaryeri ve durum DEĞERLERİNİ sayılarıyla yazar (kişisel veri içermez)
const seenSummary = { mp: new Map(), st: new Map(), noItems: 0, total: 0 };
function summarize(raw) {
  for (const o of raw) {
    const n = normalizeOrder(o);
    if (!n) continue;
    const mk = `${pick(o, FIELDS.marketplace) ?? '?'} → ${n.mpLabel}`;
    const sk = `${n.status || '?'} → ${n.sg}`;
    seenSummary.mp.set(mk, (seenSummary.mp.get(mk) || 0) + 1);
    seenSummary.st.set(sk, (seenSummary.st.get(sk) || 0) + 1);
    if (!n.items.length) seenSummary.noItems++;
    seenSummary.total++;
  }
}
function printSummary() {
  const top = (m) => [...m].sort((a, b) => b[1] - a[1]).slice(0, 25).map(([k, v]) => `    ${k}: ${v}`).join('\n');
  if (!seenSummary.total) return;
  log(`Pazaryeri eşleştirmesi (Entegra değeri → rapordaki ad):\n${top(seenSummary.mp)}`);
  log(`Durum eşleştirmesi (Entegra değeri → grup):\n${top(seenSummary.st)}`);
  if (seenSummary.noItems) log(`⚠ ${seenSummary.noItems}/${seenSummary.total} siparişte ürün satırı okunamadı.`);
}

const rawId = (o) => String(pick(o, FIELDS.id) ?? pick(o, FIELDS.orderNo) ?? JSON.stringify(o).slice(0, 200));
const rawDay = (o) => parseDate(pick(o, FIELDS.date))?.date;

async function fetchRange(token, start, end, onFirst) {
  const all = [];
  const seen = new Set();
  let warnedRange = false;
  for (let page = 1; page <= ENTEGRA.maxPages; page++) {
    const url = ENTEGRA.baseUrl + ENTEGRA.ordersPath
      .replace('{page}', page).replace('{start}', start).replace('{end}', end);
    const t0 = Date.now();
    const res = await request(url, { headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 404) break; // sayfa bitti
    if (!res.ok) throw new Error(`Sipariş listesi alınamadı (HTTP ${res.status}) — ${start}…${end} sayfa ${page}`);
    const body = await res.json();
    const list = extractList(body);
    if (page === 1 && list.length && onFirst) onFirst(list[0], body);

    const fresh = list.filter((o) => !seen.has(rawId(o)));
    fresh.forEach((o) => seen.add(rawId(o)));
    const days = list.map(rawDay).filter(Boolean).sort();
    const span = days.length ? ` (tarihler ${days[0]} … ${days[days.length - 1]})` : '';
    log(`  sayfa ${page}: ${list.length} sipariş, ${fresh.length} yeni${span} — ${((Date.now() - t0) / 1000).toFixed(1)} sn`);

    // Güvenlik freni 1: aynı siparişler tekrar geliyorsa sayfalama çalışmıyordur
    if (list.length && !fresh.length) { log('  ⚠ Bu sayfadaki siparişlerin hepsi daha önce geldi; sayfalama sona erdi sayılıyor.'); break; }

    // Güvenlik freni 2: Entegra tarih filtresini yok sayıyorsa aralık dışına çıkınca dur
    const inRange = days.filter((d) => d >= start && d <= end).length;
    if (days.length && inRange < days.length && !warnedRange) {
      warnedRange = true;
      log(`  ⚠ Entegra istenen aralığın dışında siparişler de gönderiyor; yalnızca ${start} … ${end} arası kaydedilecek.`);
    }
    if (days.length && days[days.length - 1] < start) { log('  Tüm sayfa başlangıç tarihinden eski; durduruluyor.'); break; }

    all.push(...fresh);
    const hasNextField = body && typeof body === 'object' && !Array.isArray(body) && 'next' in body;
    if (!list.length || (hasNextField && !body.next)) break;
    await sleep(ENTEGRA.pageDelayMs);
  }
  return all;
}

async function main() {
  const email = env('ENTEGRA_EMAIL');
  const password = env('ENTEGRA_PASSWORD');
  if (!email || !password) {
    console.error('ENTEGRA_EMAIL ve ENTEGRA_PASSWORD tanımlı değil. GitHub > Settings > Secrets bölümüne ekleyin.');
    process.exit(1);
  }
  const dashPass = env('DASHBOARD_PASSWORD');
  if (!dashPass) log('⚠ DASHBOARD_PASSWORD tanımlı değil: veriler ŞİFRESİZ kaydedilecek.');

  const end = isYmd(env('END_DATE')) ? env('END_DATE') : todayTR();
  const start = isYmd(env('START_DATE')) ? env('START_DATE') : addDays(end, -(DEFAULT_LOOKBACK_DAYS - 1));
  if (start > end) throw new Error(`Başlangıç (${start}) bitişten (${end}) sonra olamaz.`);
  log(`Tarih aralığı: ${start} → ${end}`);

  const token = await getToken(email, password);
  log('Entegra girişi tamam.');

  const store = new Store(DATA_DIR, dashPass);
  let showedKeys = false;
  let added = 0;
  let updated = 0;
  let fetched = 0;
  const parts = chunks(start, end);

  // Her ay bittiğinde hemen kaydedilir: iş yarıda kesilse bile o ana kadar çekilenler kaybolmaz.
  for (const [i, [s, e]] of parts.entries()) {
    log(`▸ ${s} … ${e}  (${i + 1}/${parts.length})`);
    const raw = await fetchRange(token, s, e, (first, body) => {
      if (showedKeys) return;
      showedKeys = true;
      if (body && !Array.isArray(body)) log('  Yanıt alanları:', Object.keys(body).join(', '));
      // Yalnızca alan ADLARI yazdırılır (değerler değil) — alan eşlemesini kontrol etmek için
      log('  Örnek sipariş alanları:', Object.keys(first).join(', '));
      const items = pick(first, FIELDS.items);
      if (Array.isArray(items) && items[0]) log('  Örnek ürün satırı alanları:', Object.keys(items[0]).join(', '));
      else log('  ⚠ Ürün satırı bulunamadı. Gelen değer türü:', Array.isArray(items) ? 'boş liste' : typeof items);
    });
    summarize(raw);

    const parsed = raw.map(normalizeOrder).filter(Boolean);
    const orders = parsed.filter((o) => o.date >= s && o.date <= e);
    const skipped = raw.length - parsed.length;
    const outside = parsed.length - orders.length;
    fetched += orders.length;
    if (skipped || outside) log(`  ${skipped ? `${skipped} tarihsiz` : ''}${skipped && outside ? ', ' : ''}${outside ? `${outside} aralık dışı` : ''} sipariş atlandı.`);

    const month = s.slice(0, 7);
    const existing = new Map((await store.readMonth(month)).map((o) => [o.id, o]));
    for (const o of orders) {
      if (existing.has(o.id)) updated++; else added++;
      existing.set(o.id, o);
    }
    const list = [...existing.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    if (list.length) {
      await store.writeMonth(month, list);
      await store.writeManifest({ lastRun: { start, end, fetched, added, updated, completedUntil: e } });
    }
    log(`  ✓ ${month} kaydedildi: ${list.length} sipariş`);
  }

  await store.writeManifest({ lastRun: { start, end, fetched, added, updated } });
  printSummary();
  log(`Bitti: ${added} yeni, ${updated} güncellenen sipariş.`);
}

main().catch((err) => {
  console.error('HATA:', err.message);
  process.exit(1);
});
