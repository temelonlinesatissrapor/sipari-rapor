#!/usr/bin/env node
// Örnek veri üretir: Entegra'dan gelecek siparişlere benzeyen ham kayıtlar oluşturur,
// gerçek akıştaki normalize + kayıt adımlarından geçirir. Şifre: "demo".
// Kullanım: node scripts/demo-data.mjs [ay_sayısı]
import path from 'node:path';
import { rm } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { normalizeOrder } from './lib/normalize.mjs';
import { Store } from './lib/store.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const DATA_DIR = path.join(ROOT, 'docs', 'data');
const MONTHS = Number(process.argv[2] || 14);

let seed = 20261101;
const rnd = () => { seed = (seed * 1664525 + 1013904223) % 4294967296; return seed / 4294967296; };
const pickW = (arr) => { const t = arr.reduce((a, x) => a + x.w, 0); let r = rnd() * t; for (const x of arr) { if ((r -= x.w) < 0) return x; } return arr[arr.length - 1]; };
const pick = (arr) => arr[Math.floor(rnd() * arr.length)];

const MPS = [
  { name: 'Trendyol', w: 40, com: 0.18 }, { name: 'Hepsiburada', w: 22, com: 0.16 }, { name: 'Amazon', w: 12, com: 0.15 },
  { name: 'N11', w: 8, com: 0.14 }, { name: 'Çiçeksepeti', w: 6, com: 0.17 }, { name: 'PttAVM', w: 4, com: 0.10 },
  { name: 'Pazarama', w: 3, com: 0.12 }, { name: 'E-Ticaret Sitesi', w: 5, com: 0.02 },
];
const PRODUCTS = [
  ['Pamuklu Oversize Tişört', 349], ['Basic Bisiklet Yaka Tişört', 249], ['Kapüşonlu Sweatshirt', 699], ['Fermuarlı Polar Ceket', 899],
  ['Yüksek Bel Jean', 799], ['Kargo Pantolon', 749], ['Eşofman Altı', 449], ['Keten Gömlek', 649], ['Triko Kazak', 599],
  ['Şişme Mont', 1899], ['Trençkot', 2299], ['Deri Görünümlü Ceket', 1499], ['Spor Ayakkabı Beyaz', 1299], ['Günlük Sneaker', 1099],
  ['Bot Siyah', 1799], ['Çorap 6\'lı Paket', 149], ['Bere', 179], ['Atkı', 229], ['Sırt Çantası', 549], ['Bel Çantası', 299],
  ['Şort Bermuda', 399], ['Mini Etek', 499], ['Midi Elbise', 899], ['Hırka', 649], ['Tayt', 349], ['Spor Sütyen', 299],
  ['Pijama Takımı', 599], ['Eldiven', 199], ['Kemer Deri', 249], ['Güneş Gözlüğü', 449],
].map(([name, price], i) => ({ name, price, sku: `ENT-${String(1001 + i)}`, w: 1 + rnd() * 6 }));
const CITIES = [['İstanbul', 30], ['Ankara', 11], ['İzmir', 9], ['Bursa', 5], ['Antalya', 4], ['Gaziantep', 3], ['Konya', 3], ['Kocaeli', 3], ['Adana', 3], ['Mersin', 2], ['Kayseri', 2], ['Eskişehir', 2], ['Samsun', 2], ['Diyarbakır', 2], ['Trabzon', 1.5], ['Denizli', 1.5]].map(([n, w]) => ({ n, w }));
const CARGO = [{ n: 'Trendyol Express', w: 3 }, { n: 'Yurtiçi Kargo', w: 3 }, { n: 'Aras Kargo', w: 2 }, { n: 'MNG Kargo', w: 2 }, { n: 'HepsiJet', w: 2 }, { n: 'Sürat Kargo', w: 1 }];
const HOURS = [1, .5, .3, .2, .2, .3, .6, 1.2, 2, 2.6, 3, 3.2, 3.4, 3.3, 3.2, 3.1, 3, 3.1, 3.4, 3.9, 4.4, 4.6, 3.8, 2.2].map((w, h) => ({ h, w }));
const SEASON = [0.9, 0.8, 0.95, 1, 1.05, 0.95, 0.9, 0.95, 1.05, 1.1, 1.5, 1.25]; // Kasım indirimleri

const tz = 'Europe/Istanbul';
const today = new Intl.DateTimeFormat('en-CA', { timeZone: tz }).format(new Date());
const nowHour = Number(new Intl.DateTimeFormat('en-GB', { timeZone: tz, hour: '2-digit', hourCycle: 'h23' }).format(new Date()));
const start = new Date(`${today}T12:00:00Z`);
start.setUTCMonth(start.getUTCMonth() - MONTHS + 1, 1);

const raw = [];
let id = 50000;
for (let d = new Date(start); d.toISOString().slice(0, 10) <= today; d.setUTCDate(d.getUTCDate() + 1)) {
  const ymd = d.toISOString().slice(0, 10);
  const isToday = ymd === today;
  const ageDays = Math.round((new Date(`${today}T12:00:00Z`) - d) / 864e5);
  const growth = 1 + (MONTHS * 30 - ageDays) / (MONTHS * 30) * 0.45;
  const dow = d.getUTCDay();
  const weekly = dow === 0 ? 1.15 : dow === 6 ? 1.05 : dow === 1 ? 1.1 : 1;
  let n = Math.round(42 * growth * weekly * SEASON[d.getUTCMonth()] * (0.8 + rnd() * 0.4));
  if (isToday) n = Math.round(n * (nowHour + 1) / 24 * 1.15);
  for (let i = 0; i < n; i++) {
    let hr = pickW(HOURS).h;
    if (isToday && hr > nowHour) hr = Math.floor(rnd() * (nowHour + 1));
    const mp = pickW(MPS);
    const lines = [];
    const nl = rnd() < 0.72 ? 1 : rnd() < 0.8 ? 2 : 3;
    for (let j = 0; j < nl; j++) {
      const p = pickW(PRODUCTS);
      const disc = rnd() < 0.3 ? 0.85 + rnd() * 0.1 : 1;
      const priceIncl = Math.round(p.price * disc * (mp.name === 'Amazon' ? 1.04 : 1));
      lines.push({ product_code: p.sku, product_name: p.name, quantity: rnd() < 0.88 ? 1 : 2, price: +(priceIncl / 1.2).toFixed(2), first_price: +(p.price / 1.2).toFixed(2), vat: 20 });
    }
    const gross = lines.reduce((a, l) => a + l.price * 1.2 * l.quantity, 0);
    let status;
    if (ageDays === 0) status = pickW([{ s: 'Yeni Sipariş', w: 6 }, { s: 'Hazırlanıyor', w: 3 }, { s: 'İptal Edildi', w: 0.3 }]).s;
    else if (ageDays <= 2) status = pickW([{ s: 'Hazırlanıyor', w: 2 }, { s: 'Kargoya Verildi', w: 6 }, { s: 'İptal Edildi', w: 0.4 }]).s;
    else if (ageDays <= 5) status = pickW([{ s: 'Kargoya Verildi', w: 4 }, { s: 'Teslim Edildi', w: 5 }, { s: 'İptal Edildi', w: 0.4 }, { s: 'İade Edildi', w: 0.2 }]).s;
    else status = pickW([{ s: 'Teslim Edildi', w: 90 }, { s: 'İptal Edildi', w: 4 }, { s: 'İade Edildi', w: mp.name === 'Trendyol' ? 6 : 4 }, { s: 'Kısmi İade Yapıldı', w: lines.length > 1 ? 12 : 0 }]).s;
    // Ürün satırı durumları: kısmi iadede bir ürün iade edilmiş olur
    lines.forEach((l) => { l.store_order_status_name = status === 'Kısmi İade Yapıldı' ? 'Teslim Edildi' : status; });
    if (status === 'Kısmi İade Yapıldı') lines[lines.length - 1].store_order_status_name = 'İade Edildi';
    const lag = status.includes('İade') ? 4 + Math.floor(rnd() * 12) : status === 'İptal Edildi' ? Math.floor(rnd() * 2) : Math.min(ageDays, 3);
    const changedAt = new Date(d); changedAt.setUTCDate(changedAt.getUTCDate() + Math.min(lag, ageDays));
    const [y, m, dd] = ymd.split('-');
    raw.push({
      id: id++,
      order_id: `${mp.name.slice(0, 2).toUpperCase()}${String(9000000 + id * 7)}`,
      supplier: mp.name,
      order_date: `${dd}.${m}.${y} ${String(hr).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}`,
      status,
      date_change: `${changedAt.toISOString().slice(0, 10)} ${String(9 + Math.floor(rnd() * 9)).padStart(2, '0')}:${String(Math.floor(rnd() * 60)).padStart(2, '0')}:00`,
      total: +gross.toFixed(2),
      commission: +(gross * mp.com).toFixed(2),
      cargo_price: mp.name === 'E-Ticaret Sitesi' ? 0 : +(gross > 750 ? 0 : 54.99).toFixed(2),
      cargo: mp.name === 'Trendyol' ? 'Trendyol Express' : mp.name === 'Hepsiburada' ? 'HepsiJet' : pickW(CARGO).n,
      ship_city: pickW(CITIES).n,
      // Kişisel alanlar gerçekte de gelir; normalize adımı bunları atar
      full_name: 'Örnek Müşteri', email: 'ornek@example.com', mobile_phone: '05000000000', ship_address: 'Örnek adres',
      order_details: lines,
    });
  }
}

const orders = raw.map(normalizeOrder).filter(Boolean);
const store = new Store(DATA_DIR, 'demo');
await rm(DATA_DIR, { recursive: true, force: true });
const byMonth = new Map();
for (const o of orders) { const k = o.date.slice(0, 7); if (!byMonth.has(k)) byMonth.set(k, []); byMonth.get(k).push(o); }
for (const [m, list] of byMonth) await store.writeMonth(m, list);
await store.writeManifest({ demo: true });
console.log(`${orders.length} örnek sipariş, ${byMonth.size} ay yazıldı → docs/data (şifre: demo)`);
