/* Küçük, kütüphanesiz Excel (.xlsx) okuyucu ve geçmiş yıl özet şablonu ayrıştırıcısı.
   - Dosya tarayıcıda okunur; hiçbir yere gönderilmez.
   - readXlsx(file) → ilk sayfanın hücre tablosu (satır × sütun).
   - parseHistory(grid) → { year, months: {1: {...}, ...}, labels, warnings } */
(function () {
  'use strict';

  // ---- ZIP ----
  async function inflate(bytes, method) {
    if (method === 0) return bytes;
    if (method !== 8) throw new Error('Desteklenmeyen sıkıştırma');
    const ds = new DecompressionStream('deflate-raw');
    const out = new Response(new Blob([bytes]).stream().pipeThrough(ds));
    return new Uint8Array(await out.arrayBuffer());
  }

  async function unzip(buf) {
    const u8 = new Uint8Array(buf);
    const dv = new DataView(buf);
    let eocd = -1;
    for (let i = u8.length - 22; i >= Math.max(0, u8.length - 65557); i--) {
      if (dv.getUint32(i, true) === 0x06054b50) { eocd = i; break; }
    }
    if (eocd < 0) throw new Error('Dosya bir Excel (.xlsx) dosyası değil');
    const count = dv.getUint16(eocd + 10, true);
    let p = dv.getUint32(eocd + 16, true);
    const files = {};
    const dec = new TextDecoder();
    for (let n = 0; n < count; n++) {
      if (dv.getUint32(p, true) !== 0x02014b50) break;
      const method = dv.getUint16(p + 10, true);
      const csize = dv.getUint32(p + 20, true);
      const nlen = dv.getUint16(p + 28, true);
      const elen = dv.getUint16(p + 30, true);
      const clen = dv.getUint16(p + 32, true);
      const off = dv.getUint32(p + 42, true);
      const name = dec.decode(u8.subarray(p + 46, p + 46 + nlen));
      const lnlen = dv.getUint16(off + 26, true);
      const lelen = dv.getUint16(off + 28, true);
      const start = off + 30 + lnlen + lelen;
      files[name] = { method, data: u8.subarray(start, start + csize) };
      p += 46 + nlen + elen + clen;
    }
    return {
      has: (n) => Boolean(files[n]),
      async text(n) { const f = files[n]; if (!f) return null; return dec.decode(await inflate(f.data, f.method)); },
    };
  }

  // ---- XLSX ----
  const xml = (s) => new DOMParser().parseFromString(s, 'application/xml');
  const byTag = (node, tag) => [...node.getElementsByTagNameNS('*', tag)];
  const colIndex = (ref) => { let n = 0; for (const ch of ref.replace(/\d+/g, '')) n = n * 26 + (ch.charCodeAt(0) - 64); return n - 1; };

  async function readXlsx(file) {
    const zip = await unzip(await file.arrayBuffer());
    // İlk sayfanın yolunu bul
    let sheetPath = 'xl/worksheets/sheet1.xml';
    const wb = await zip.text('xl/workbook.xml');
    const rels = await zip.text('xl/_rels/workbook.xml.rels');
    if (wb && rels) {
      const first = byTag(xml(wb), 'sheet')[0];
      const rid = first && (first.getAttribute('r:id') || first.getAttributeNS('http://schemas.openxmlformats.org/officeDocument/2006/relationships', 'id'));
      const rel = byTag(xml(rels), 'Relationship').find((r) => r.getAttribute('Id') === rid);
      if (rel) {
        const t = rel.getAttribute('Target').replace(/^\//, '');
        sheetPath = t.startsWith('xl/') ? t : `xl/${t}`;
      }
    }
    const shared = [];
    const ss = await zip.text('xl/sharedStrings.xml');
    if (ss) for (const si of byTag(xml(ss), 'si')) shared.push(byTag(si, 't').map((t) => t.textContent).join(''));
    const sheet = await zip.text(sheetPath);
    if (!sheet) throw new Error('Excel sayfası okunamadı');
    const grid = [];
    for (const row of byTag(xml(sheet), 'row')) {
      const r = Number(row.getAttribute('r')) - 1;
      grid[r] = grid[r] || [];
      for (const c of byTag(row, 'c')) {
        const ci = colIndex(c.getAttribute('r'));
        const t = c.getAttribute('t');
        const v = byTag(c, 'v')[0]?.textContent;
        let val = null;
        if (t === 's') val = shared[Number(v)] ?? null;
        else if (t === 'inlineStr') val = byTag(c, 't').map((x) => x.textContent).join('');
        else if (t === 'str') val = v ?? null;
        else if (t === 'b') val = v === '1';
        else if (v !== undefined && v !== '') val = Number(v);
        grid[r][ci] = val;
      }
    }
    for (let i = 0; i < grid.length; i++) grid[i] = grid[i] || [];
    return grid;
  }

  // ---- Aylık özet şablonu ----
  const MONTHS = ['ocak', 'subat', 'mart', 'nisan', 'mayis', 'haziran', 'temmuz', 'agustos', 'eylul', 'ekim', 'kasim', 'aralik'];
  const norm = (s) => String(s ?? '').normalize('NFKD').replace(/[̀-ͯ]/g, '').toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  const monthOf = (s) => (typeof s === 'string' ? MONTHS.indexOf(norm(s)) + 1 : 0);
  const isTotal = (s) => typeof s === 'string' && /^(toplam|genel toplam|total)$/.test(norm(s));

  // Başlık → ölçü anahtarı (sıra önemli: "tedarik iptal" "iptal"den önce)
  const METRICS = [
    { re: /tedarik/, key: 'supplyCancel', label: 'Tedarik iptal' },
    { re: /iptal/, key: 'cancel', label: 'İptal' },
    { re: /iade/, key: 'return', label: 'İade' },
    { re: /fatura|farutal/, key: 'invoice', label: 'Kesilen fatura' },
    { re: /gelen para|odeme|hakedis/, key: 'payout', label: 'Pazaryerlerinden gelen para' },
    { re: /urun adet|satilan urun/, key: 'units', label: 'Satılan ürün adedi', count: true },
    { re: /satis tutar|ciro/, key: 'sales', label: 'Satış tutarı' },
    { re: /komisyon/, key: 'commission', label: 'Komisyon' },
    { re: /kargo/, key: 'cargo', label: 'Kargo' },
    { re: /masraf/, key: 'fees', label: 'Pazaryeri masrafları' },
    { re: /ceza/, key: 'penalty', label: 'Kesilen ceza' },
  ];

  function parseHistory(grid) {
    const out = { year: null, months: {}, labels: {}, warnings: [] };
    const cell = (r, c) => (grid[r] ? grid[r][c] : null);
    const seenKeys = new Set();
    for (let r = 0; r < grid.length; r++) {
      const row = grid[r] || [];
      for (let c = 0; c < row.length; c++) {
        const head = cell(r, c);
        if (typeof head !== 'string' || monthOf(head) || isTotal(head) || !monthOf(cell(r + 1, c))) continue;
        // Bu sütun bir grubun başlığı: altında ay adları var
        const h = norm(head);
        const def = METRICS.find((m) => m.re.test(h));
        let key = def ? def.key : `ozel_${h.replace(/[^a-z0-9]+/g, '_')}`;
        if (seenKeys.has(key)) key = `${key}_${c}`;
        seenKeys.add(key);
        // Değer sütunları: sağdaki, bir sonraki ay sütununa kadar
        const valueCols = [];
        for (let v = c + 1; v < c + 6; v++) {
          if (monthOf(cell(r + 1, v))) break; // sonraki grubun ay sütunu
          const sub = cell(r, v);
          if (typeof cell(r + 1, v) !== 'number') {
            // Boş sütun: geç. Başka bir başlık: grup bitti.
            if (typeof sub === 'string' && sub.trim() && !/^(para|adet|tl|tutar)$/.test(norm(sub))) break;
            continue;
          }
          const isCount = (typeof sub === 'string' && /adet/.test(norm(sub))) || Boolean(def?.count);
          valueCols.push({ v, isCount });
        }
        if (!valueCols.length) continue;
        // Yıl: başlıktaki sayı (ör. 2024)
        for (let v = c + 1; v < c + 3; v++) { const y = cell(r, v); if (typeof y === 'number' && y > 1990 && y < 2100) out.year = out.year || y; }
        const onlyCount = valueCols.every((x) => x.isCount);
        const base = def ? def.label : String(head).trim();
        valueCols.forEach((vc, i) => {
          const mk = onlyCount ? key : (vc.isCount ? `${key}Cnt` : key);
          if (out.labels[mk]) return; // aynı türden ikinci sütun: ilkini kullan
          out.labels[mk] = onlyCount ? base : vc.isCount ? `${base} (adet)` : valueCols.length > 1 ? `${base} (tutar)` : base;
          // Aylar: başlığın altındaki satırlar, sırayla 1..12 (etikette yazım hatası olsa da sıra esas alınır)
          let m = 0;
          for (let k = r + 1; k < grid.length && m < 12; k++) {
            const lab = cell(k, c);
            if (isTotal(lab) || !monthOf(lab)) break;
            m++;
            if (monthOf(lab) !== m && i === 0) out.warnings.push(`"${String(head).trim()}" bölümünde ${m}. ay satırı "${String(lab).trim()}" yazıyor; ${m}. ay olarak okundu.`);
            const val = cell(k, vc.v);
            if (typeof val !== 'number') continue;
            out.months[m] = out.months[m] || {};
            out.months[m][mk] = Math.round(val * 100) / 100;
          }
        });
      }
    }
    if (!Object.keys(out.months).length) throw new Error('Dosyada ay adlarıyla (Ocak, Şubat…) düzenlenmiş bir tablo bulunamadı.');
    return out;
  }

  window.MiniXlsx = { readXlsx, parseHistory };
}());
