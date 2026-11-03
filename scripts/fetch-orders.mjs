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
import { ENTEGRA, DEFAULT_LOOKBACK_DAYS, TIMEZONE } from './config.mjs';
import { normalizeOrder, extractList } from './lib/normalize.mjs';
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

// Uzun aralıkları aylık parçalara böler (Entegra uzun aralıklarda zaman aşımına düşebiliyor)
function chunks(start, end) {
  const out = [];
  let s = start;
  while (s <= end) {
    const monthEnd = addDays(`${addDays(`${s.slice(0, 7)}-28`, 4).slice(0, 7)}-01`, -1);
    const e = monthEnd < end ? monthEnd : end;
    out.push([s, e]);
    s = addDays(e, 1);
  }
  return out;
}

async function request(url, opts = {}, tries = 4) {
  for (let i = 1; ; i++) {
    try {
      const res = await fetch(url, { ...opts, signal: AbortSignal.timeout(90000) });
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

async function fetchRange(token, start, end, onFirst) {
  const all = [];
  for (let page = 1; page <= ENTEGRA.maxPages; page++) {
    const url = ENTEGRA.baseUrl + ENTEGRA.ordersPath
      .replace('{page}', page).replace('{start}', start).replace('{end}', end);
    const res = await request(url, { headers: { Authorization: `JWT ${token}`, 'Content-Type': 'application/json' } });
    if (res.status === 404) break; // sayfa bitti
    if (!res.ok) throw new Error(`Sipariş listesi alınamadı (HTTP ${res.status}) — ${start}…${end} sayfa ${page}`);
    const body = await res.json();
    const list = extractList(body);
    if (page === 1 && list.length && onFirst) onFirst(list[0]);
    all.push(...list);
    log(`  sayfa ${page}: ${list.length} sipariş`);
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

  let showedKeys = false;
  const raw = [];
  for (const [s, e] of chunks(start, end)) {
    log(`▸ ${s} … ${e}`);
    raw.push(...await fetchRange(token, s, e, (first) => {
      if (showedKeys) return;
      showedKeys = true;
      // Yalnızca alan ADLARI yazdırılır (değerler değil) — alan eşlemesini kontrol etmek için
      log('  Örnek sipariş alanları:', Object.keys(first).join(', '));
      const items = first.order_details || first.products || first.items;
      if (Array.isArray(items) && items[0]) log('  Örnek ürün satırı alanları:', Object.keys(items[0]).join(', '));
    }));
  }

  const normalized = raw.map(normalizeOrder).filter(Boolean);
  const skipped = raw.length - normalized.length;
  log(`Toplam ${raw.length} ham sipariş, ${normalized.length} işlendi${skipped ? `, ${skipped} tarihsiz atlandı` : ''}.`);

  const store = new Store(DATA_DIR, dashPass);
  const byMonth = new Map();
  for (const o of normalized) {
    const m = o.date.slice(0, 7);
    if (!byMonth.has(m)) byMonth.set(m, []);
    byMonth.get(m).push(o);
  }

  let added = 0;
  let updated = 0;
  for (const [month, orders] of [...byMonth].sort()) {
    const existing = new Map((await store.readMonth(month)).map((o) => [o.id, o]));
    for (const o of orders) {
      if (existing.has(o.id)) updated++; else added++;
      existing.set(o.id, o);
    }
    const list = [...existing.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    await store.writeMonth(month, list);
    log(`  ${month}: ${list.length} sipariş kayıtlı`);
  }

  await store.writeManifest({ lastRun: { start, end, fetched: normalized.length, added, updated } });
  log(`Bitti: ${added} yeni, ${updated} güncellenen sipariş.`);
}

main().catch((err) => {
  console.error('HATA:', err.message);
  process.exit(1);
});
