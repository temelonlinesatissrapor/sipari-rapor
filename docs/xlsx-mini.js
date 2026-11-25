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
          // Aylar: satırdaki ay adı esas alınır (yalnızca "Ekim" satırı olan bir dosya da olur).
          // Aynı ay adı ikinci kez geçerse (yazım hatası) satırın sırasındaki ay kullanılır.
          let pos = 0;
          const used = new Set();
          for (let k = r + 1; k < grid.length && pos < 12; k++) {
            const lab = cell(k, c);
            if (isTotal(lab) || !monthOf(lab)) break;
            pos++;
            let m = monthOf(lab);
            if (used.has(m)) {
              const prev = m;
              m = pos;
              if (used.has(m)) { for (m = 1; m <= 12 && used.has(m); m++); }
              if (i === 0) out.warnings.push(`"${String(head).trim()}" bölümünde "${String(lab).trim()}" satırı ikinci kez geçiyor; ${m}. ay olarak okundu.`);
            }
            used.add(m);
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

  // ---- Excel YAZMA (.xlsx) ----
  // sheets: [{ name, rows: [[hücre, ...], ...], boldRows: Set(satır no), header: true }]
  // hücre: sayı | metin | null | { v, s: 'money'|'int'|'pct'|'num'|'text', b: kalın }
  const CRC = (() => { const t = new Uint32Array(256); for (let n = 0; n < 256; n++) { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1; t[n] = c >>> 0; } return t; })();
  const crc32 = (u8) => { let c = 0xffffffff; for (let i = 0; i < u8.length; i++) c = CRC[(c ^ u8[i]) & 0xff] ^ (c >>> 8); return (c ^ 0xffffffff) >>> 0; };

  function zipStore(files) {
    const enc = new TextEncoder();
    const parts = []; const central = []; let off = 0;
    for (const f of files) {
      const name = enc.encode(f.name); const data = typeof f.data === 'string' ? enc.encode(f.data) : f.data;
      const crc = crc32(data);
      const lh = new DataView(new ArrayBuffer(30));
      lh.setUint32(0, 0x04034b50, true); lh.setUint16(4, 20, true); lh.setUint16(6, 0x0800, true); lh.setUint16(8, 0, true);
      lh.setUint32(14, crc, true); lh.setUint32(18, data.length, true); lh.setUint32(22, data.length, true); lh.setUint16(26, name.length, true);
      parts.push(new Uint8Array(lh.buffer), name, data);
      const ch = new DataView(new ArrayBuffer(46));
      ch.setUint32(0, 0x02014b50, true); ch.setUint16(4, 20, true); ch.setUint16(6, 20, true); ch.setUint16(8, 0x0800, true);
      ch.setUint32(16, crc, true); ch.setUint32(20, data.length, true); ch.setUint32(24, data.length, true); ch.setUint16(28, name.length, true); ch.setUint32(42, off, true);
      central.push(new Uint8Array(ch.buffer), name);
      off += 30 + name.length + data.length;
    }
    const csize = central.reduce((a, b) => a + b.length, 0);
    const end = new DataView(new ArrayBuffer(22));
    end.setUint32(0, 0x06054b50, true); end.setUint16(8, files.length, true); end.setUint16(10, files.length, true); end.setUint32(12, csize, true); end.setUint32(16, off, true);
    return new Blob([...parts, ...central, new Uint8Array(end.buffer)], { type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  }

  const xe = (s) => String(s).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').replace(/[<>&"]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;' }[c]));
  const colName = (i) => { let s = ''; i++; while (i > 0) { const m = (i - 1) % 26; s = String.fromCharCode(65 + m) + s; i = Math.floor((i - 1) / 26); } return s; };
  // Stil sırası styles.xml'deki cellXfs ile aynı
  const STYLE = { text: 0, head: 1, money: 2, int: 3, pct: 4, num: 5, btext: 6, bmoney: 7, bint: 8, bpct: 9, bnum: 10 };

  function cellXml(ref, c, boldRow) {
    if (c === null || c === undefined || c === '') return '';
    const o = typeof c === 'object' ? c : { v: c };
    if (o.v === null || o.v === undefined || o.v === '') return '';
    const bold = o.b || boldRow;
    if (typeof o.v === 'number' && Number.isFinite(o.v)) {
      let s = o.s || (Number.isInteger(o.v) ? 'int' : 'num');
      if (s === 'text') s = 'num';
      const st = STYLE[(bold ? 'b' : '') + s] ?? STYLE.num;
      return `<c r="${ref}" s="${st}"><v>${o.v}</v></c>`;
    }
    return `<c r="${ref}" t="inlineStr" s="${o.head ? STYLE.head : bold ? STYLE.btext : STYLE.text}"><is><t xml:space="preserve">${xe(o.v)}</t></is></c>`;
  }

  function sheetXml(sh) {
    const rows = sh.rows || [];
    const ncol = Math.max(1, ...rows.map((r) => r.length));
    const widths = Array.from({ length: ncol }, (_, i) => Math.min(60, Math.max(8, ...rows.map((r) => {
      const c = r[i]; const v = c && typeof c === 'object' ? c.v : c;
      if (v === null || v === undefined) return 0;
      return typeof v === 'number' ? String(Math.round(v)).length + 5 : String(v).length + 2;
    }))));
    const body = rows.map((r, ri) => `<row r="${ri + 1}">${r.map((c, ci) => {
      const head = sh.header !== false && ri === 0;
      const cc = head ? { v: c && typeof c === 'object' ? c.v : c, head: true } : c;
      return cellXml(`${colName(ci)}${ri + 1}`, cc, sh.boldRows && sh.boldRows.has(ri));
    }).join('')}</row>`).join('');
    const freeze = sh.header !== false && rows.length > 1 ? '<sheetViews><sheetView workbookViewId="0"><pane ySplit="1" topLeftCell="A2" activePane="bottomLeft" state="frozen"/></sheetView></sheetViews>' : '<sheetViews><sheetView workbookViewId="0"/></sheetViews>';
    const filter = sh.header !== false && rows.length > 1 && sh.filter !== false ? `<autoFilter ref="A1:${colName(ncol - 1)}${sh.filterEnd || rows.length}"/>` : '';
    return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><worksheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">${freeze}<cols>${widths.map((w, i) => `<col min="${i + 1}" max="${i + 1}" width="${w}" customWidth="1"/>`).join('')}</cols><sheetData>${body}</sheetData>${filter}</worksheet>`;
  }

  function sheetNames(sheets) {
    const used = new Set();
    return sheets.map((s, i) => {
      let n = String(s.name || `Sayfa ${i + 1}`).replace(/[\\/?*[\]:]/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 31) || `Sayfa ${i + 1}`;
      let k = n; let j = 2;
      while (used.has(k.toLocaleLowerCase('tr-TR'))) { const suf = ` (${j++})`; k = n.slice(0, 31 - suf.length) + suf; }
      used.add(k.toLocaleLowerCase('tr-TR'));
      return k;
    });
  }

  function writeXlsx(sheets) {
    const names = sheetNames(sheets);
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><styleSheet xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main">
<numFmts count="4"><numFmt numFmtId="164" formatCode="#,##0.00\\ &quot;₺&quot;"/><numFmt numFmtId="165" formatCode="#,##0"/><numFmt numFmtId="166" formatCode="0.0%"/><numFmt numFmtId="167" formatCode="#,##0.0#"/></numFmts>
<fonts count="2"><font><sz val="11"/><name val="Calibri"/></font><font><b/><sz val="11"/><name val="Calibri"/></font></fonts>
<fills count="3"><fill><patternFill patternType="none"/></fill><fill><patternFill patternType="gray125"/></fill><fill><patternFill patternType="solid"><fgColor rgb="FFE8EEFC"/><bgColor indexed="64"/></patternFill></fill></fills>
<borders count="2"><border><left/><right/><top/><bottom/><diagonal/></border><border><left/><right/><top/><bottom style="thin"><color rgb="FF9AA6B8"/></bottom><diagonal/></border></borders>
<cellStyleXfs count="1"><xf numFmtId="0" fontId="0" fillId="0" borderId="0"/></cellStyleXfs>
<cellXfs count="11">
<xf numFmtId="0" fontId="0" fillId="0" borderId="0" xfId="0"/>
<xf numFmtId="0" fontId="1" fillId="2" borderId="1" xfId="0" applyFont="1" applyFill="1" applyBorder="1"/>
<xf numFmtId="164" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="0" fillId="0" borderId="0" xfId="0" applyNumberFormat="1"/>
<xf numFmtId="0" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1"/>
<xf numFmtId="164" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="165" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="166" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
<xf numFmtId="167" fontId="1" fillId="0" borderId="0" xfId="0" applyFont="1" applyNumberFormat="1"/>
</cellXfs><cellStyles count="1"><cellStyle name="Normal" xfId="0" builtinId="0"/></cellStyles></styleSheet>`;
    const files = [
      { name: '[Content_Types].xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/xl/workbook.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet.main+xml"/><Override PartName="/xl/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.styles+xml"/>${names.map((_, i) => `<Override PartName="/xl/worksheets/sheet${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.spreadsheetml.worksheet+xml"/>`).join('')}</Types>` },
      { name: '_rels/.rels', data: '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="xl/workbook.xml"/></Relationships>' },
      { name: 'xl/workbook.xml', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><workbook xmlns="http://schemas.openxmlformats.org/spreadsheetml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"><sheets>${names.map((n, i) => `<sheet name="${xe(n)}" sheetId="${i + 1}" r:id="rId${i + 1}"/>`).join('')}</sheets></workbook>` },
      { name: 'xl/_rels/workbook.xml.rels', data: `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">${names.map((_, i) => `<Relationship Id="rId${i + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/worksheet" Target="worksheets/sheet${i + 1}.xml"/>`).join('')}<Relationship Id="rId${names.length + 1}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/></Relationships>` },
      { name: 'xl/styles.xml', data: styles },
      ...sheets.map((sh, i) => ({ name: `xl/worksheets/sheet${i + 1}.xml`, data: sheetXml(sh) })),
    ];
    return zipStore(files);
  }

  window.MiniXlsx = { readXlsx, parseHistory, writeXlsx };
}());
