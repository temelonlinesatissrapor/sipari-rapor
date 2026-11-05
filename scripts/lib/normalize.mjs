// Entegra'dan gelen ham siparişi rapor için sade bir biçime çevirir.
// Müşteri adı, e-posta, telefon ve adres gibi kişisel veriler BİLİNÇLİ OLARAK alınmaz.
import {
  FIELDS, ITEM_FIELDS, STATUS_GROUPS, MARKETPLACES,
  ITEM_PRICE_EXCLUDES_VAT, DEFAULT_VAT, TIMEZONE,
} from '../config.mjs';

export function pick(obj, keys) {
  if (!obj) return undefined;
  for (const k of keys) {
    const v = obj[k];
    if (v !== undefined && v !== null && v !== '') return v;
  }
  return undefined;
}

// "1.234,56" / "1234.56" / 1234.56 → 1234.56
export function num(v) {
  if (v === undefined || v === null || v === '') return 0;
  if (typeof v === 'number') return Number.isFinite(v) ? v : 0;
  let s = String(v).replace(/[^\d,.-]/g, '');
  if (s.includes(',') && s.includes('.')) {
    s = s.lastIndexOf(',') > s.lastIndexOf('.') ? s.replace(/\./g, '').replace(',', '.') : s.replace(/,/g, '');
  } else if (s.includes(',')) {
    s = s.replace(',', '.');
  }
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

const round2 = (n) => Math.round(n * 100) / 100;

const fmtParts = new Intl.DateTimeFormat('en-CA', {
  timeZone: TIMEZONE, year: 'numeric', month: '2-digit', day: '2-digit',
  hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
});

// Çeşitli tarih biçimlerini { date: 'YYYY-MM-DD', time: 'HH:MM' } yapar
export function parseDate(v) {
  if (!v) return null;
  const s = String(v).trim();
  let m = s.match(/^(\d{1,2})[./-](\d{1,2})[./-](\d{4})(?:[ T](\d{1,2}):(\d{2}))?/); // 21.09.2020 14:30
  if (m) {
    return { date: `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}`, time: m[4] ? `${m[4].padStart(2, '0')}:${m[5]}` : '' };
  }
  m = s.match(/^(\d{4})-(\d{2})-(\d{2})(?:[ T](\d{2}):(\d{2}))?/);
  if (m && !/[zZ]|[+-]\d{2}:?\d{2}$/.test(s)) {
    return { date: `${m[1]}-${m[2]}-${m[3]}`, time: m[4] ? `${m[4]}:${m[5]}` : '' };
  }
  const d = new Date(/^\d{10,13}$/.test(s) ? Number(s.length === 10 ? s + '000' : s) : s);
  if (Number.isNaN(d.getTime())) return null;
  const p = Object.fromEntries(fmtParts.formatToParts(d).map((x) => [x.type, x.value]));
  return { date: `${p.year}-${p.month}-${p.day}`, time: `${p.hour}:${p.minute}` };
}

const lower = (s) => String(s || '').toLocaleLowerCase('tr-TR');

export function marketplaceOf(raw) {
  const s = lower(raw).replace(/\s+/g, '');
  const hit = MARKETPLACES.find((m) => m.match.some((x) => s.includes(x.replace(/\s+/g, ''))));
  if (hit) return { key: hit.key, label: hit.label };
  const label = String(raw || 'Diğer').trim() || 'Diğer';
  return { key: lower(label).replace(/[^a-z0-9ğüşıöç]+/g, '-') || 'diger', label };
}

export function statusGroupOf(raw) {
  const s = lower(raw);
  const hit = STATUS_GROUPS.find((g) => g.match.some((x) => s.includes(x)));
  return (hit || STATUS_GROUPS[STATUS_GROUPS.length - 1]).key;
}

// Yalnızca ad soyad alınır; boşlukları toparlar
function customerOf(o) {
  let name = pick(o, FIELDS.customer);
  if (!name) name = [pick(o, FIELDS.customerFirst), pick(o, FIELDS.customerLast)].filter(Boolean).join(' ');
  return String(name || '').replace(/\s+/g, ' ').trim().slice(0, 80);
}

export function normalizeOrder(o) {
  const mpRaw = pick(o, FIELDS.marketplace);
  const mp = marketplaceOf(mpRaw);
  const when = parseDate(pick(o, FIELDS.date));
  if (!when) return null;

  const rawItems = pick(o, FIELDS.items);
  const items = (Array.isArray(rawItems) ? rawItems : []).map((it) => {
    const qty = num(pick(it, ITEM_FIELDS.quantity)) || 1;
    const incl = num(pick(it, ITEM_FIELDS.priceInclTax));
    let price = incl || num(pick(it, ITEM_FIELDS.price));
    if (!incl && ITEM_PRICE_EXCLUDES_VAT) {
      const vat = pick(it, ITEM_FIELDS.vat);
      price *= 1 + (vat === undefined ? DEFAULT_VAT : num(vat)) / 100;
    }
    const itemStatus = pick(it, ITEM_FIELDS.status);
    const itemGroup = itemStatus !== undefined ? statusGroupOf(itemStatus) : '';
    return {
      sku: String(pick(it, ITEM_FIELDS.sku) ?? ''),
      name: String(pick(it, ITEM_FIELDS.name) ?? pick(it, ITEM_FIELDS.sku) ?? 'Ürün'),
      qty,
      total: round2(price * qty),
      commission: round2(num(pick(it, ITEM_FIELDS.commission))),
      // r: bu ürün satırı iade/iptal edilmiş (kısmi iadelerde hangi ürünün döndüğünü gösterir)
      ...(itemGroup === 'iade' || itemGroup === 'iptal' ? { r: itemGroup } : {}),
    };
  });

  let itemsTotal = items.reduce((a, b) => a + b.total, 0);
  const totalField = pick(o, FIELDS.total);

  // Ürün satırlarındaki fiyatın KDV dahil/hariç olduğu hesaptan hesaba değişebiliyor.
  // Sipariş toplamı varsa ürün tutarlarını ona orantılayarak ürün cirosunu sipariş cirosuyla tutarlı tutarız.
  const orderTotal = totalField !== undefined ? num(totalField) : 0;
  if (orderTotal > 0 && itemsTotal > 0) {
    const f = orderTotal / itemsTotal;
    if (f > 0.4 && f < 2.5) {
      items.forEach((it) => { it.total = round2(it.total * f); });
      itemsTotal = orderTotal;
    }
  }
  const status = String(pick(o, FIELDS.status) ?? '');
  const itemCommission = items.reduce((a, b) => a + b.commission, 0);
  const total = round2(totalField !== undefined ? num(totalField) : itemsTotal);
  let sg = statusGroupOf(status);
  // Sipariş durumu "iade/iptal" demese de bazı ürünleri dönmüşse kısmi iade say
  const retItems = items.filter((it) => it.r);
  if (!['iade', 'iptal', 'kismi'].includes(sg) && retItems.length && retItems.length < items.length) sg = 'kismi';
  if (!['iade', 'iptal', 'kismi'].includes(sg) && items.length && retItems.length === items.length) sg = retItems[0].r;

  // İade/iptal tutarı: tamamen iade/iptalde siparişin tamamı, kısmi iadede dönen ürünlerin tutarı
  let ret = 0;
  let retQty = 0;
  if (sg === 'iade' || sg === 'iptal') {
    ret = total;
    retQty = items.reduce((a, b) => a + b.qty, 0);
  } else if (sg === 'kismi') {
    ret = round2(retItems.reduce((a, b) => a + b.total, 0));
    retQty = retItems.reduce((a, b) => a + b.qty, 0);
  }
  const changed = parseDate(pick(o, FIELDS.changed));

  return {
    id: String(pick(o, FIELDS.id) ?? pick(o, FIELDS.orderNo)),
    no: String(pick(o, FIELDS.orderNo) ?? ''),
    mp: mp.key,
    mpLabel: mp.label,
    date: when.date,
    time: when.time,
    status,
    sg,
    total,
    ...(ret ? { ret, retQty } : {}),
    ...(changed ? { changed: `${changed.date} ${changed.time}`.trim() } : {}),
    cargoPrice: round2(num(pick(o, FIELDS.cargoPrice))),
    commission: round2(num(pick(o, FIELDS.commission)) || itemCommission),
    discount: round2(num(pick(o, FIELDS.discount))),
    carrier: String(pick(o, FIELDS.cargo) ?? ''),
    city: String(pick(o, FIELDS.city) ?? ''),
    customer: customerOf(o),
    qty: items.reduce((a, b) => a + b.qty, 0),
    items: items.map(({ commission, ...rest }) => rest),
  };
}

// Sayfa yanıtının hangi biçimde geldiğine bakmadan sipariş listesini bulur
export function extractList(body) {
  if (Array.isArray(body)) return body;
  if (!body || typeof body !== 'object') return [];
  for (const k of ['results', 'orders', 'order', 'data', 'items']) {
    if (Array.isArray(body[k])) return body[k];
    if (body[k] && typeof body[k] === 'object') {
      const inner = extractList(body[k]);
      if (inner.length) return inner;
    }
  }
  return [];
}
