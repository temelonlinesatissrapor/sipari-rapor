/* Sipariş Raporları — Entegra verilerinden günlük, aylık, detaylı ve iade/iptal rapor ekranları */
(() => {
  'use strict';

  // ---------- Yardımcılar ----------
  const $ = (s, r = document) => r.querySelector(s);
  const $$ = (s, r = document) => [...r.querySelectorAll(s)];
  const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const store = {
    get(k, s) { try { return (s ? sessionStorage : localStorage).getItem(k); } catch { return null; } },
    set(k, v, s) { try { (s ? sessionStorage : localStorage).setItem(k, v); } catch { /* yok say */ } },
    del(k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch { /* yok say */ } },
  };

  const fmtTL = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', maximumFractionDigits: 0 });
  const fmtTL2 = new Intl.NumberFormat('tr-TR', { style: 'currency', currency: 'TRY', minimumFractionDigits: 2, maximumFractionDigits: 2 });
  const fmtN = new Intl.NumberFormat('tr-TR');
  const fmtCompact = new Intl.NumberFormat('tr-TR', { notation: 'compact', maximumFractionDigits: 1 });
  const fmtPct = new Intl.NumberFormat('tr-TR', { style: 'percent', maximumFractionDigits: 1 });
  const tl = (n) => fmtTL.format(n || 0);
  const tl2 = (n) => fmtTL2.format(n || 0);
  const n0 = (n) => fmtN.format(Math.round(n || 0));
  const pct = (n) => (Number.isFinite(n) ? fmtPct.format(n) : '—');

  const MONTHS = ['Ocak', 'Şubat', 'Mart', 'Nisan', 'Mayıs', 'Haziran', 'Temmuz', 'Ağustos', 'Eylül', 'Ekim', 'Kasım', 'Aralık'];
  const DAYS = ['Pazar', 'Pazartesi', 'Salı', 'Çarşamba', 'Perşembe', 'Cuma', 'Cumartesi'];
  const D = (ymd) => new Date(`${ymd}T12:00:00Z`);
  const ymd = (d) => d.toISOString().slice(0, 10);
  const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return ymd(d); };
  const addMonths = (m, n) => { const d = new Date(`${m}-15T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + n); return d.toISOString().slice(0, 7); };
  const daysInMonth = (m) => new Date(Date.UTC(+m.slice(0, 4), +m.slice(5, 7), 0)).getUTCDate();
  const dayCount = (a, b) => Math.round((D(b) - D(a)) / 864e5) + 1;
  const todayTR = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Europe/Istanbul' }).format(new Date());
  const trDate = (s) => `${s.slice(8, 10)}.${s.slice(5, 7)}.${s.slice(0, 4)}`;
  const trDateLong = (s) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]} ${s.slice(0, 4)}, ${DAYS[D(s).getUTCDay()]}`;
  const trDayMonth = (s) => `${+s.slice(8, 10)} ${MONTHS[+s.slice(5, 7) - 1]}`;
  const trRange = (a, b) => (a === b ? trDateLong(a) : `${trDayMonth(a)}${a.slice(0, 4) !== b.slice(0, 4) ? ` ${a.slice(0, 4)}` : ''} – ${trDayMonth(b)} ${b.slice(0, 4)} · ${dayCount(a, b)} gün`);
  const trMonth = (m) => `${MONTHS[+m.slice(5, 7) - 1]} ${m.slice(0, 4)}`;
  const weekStart = (s) => { const g = D(s).getUTCDay(); return addDays(s, -((g + 6) % 7)); };
  const sum = (arr, f) => arr.reduce((a, x) => a + (f(x) || 0), 0);
  const groupBy = (arr, f) => { const m = new Map(); for (const x of arr) { const k = f(x); if (!m.has(k)) m.set(k, []); m.get(k).push(x); } return m; };
  const css = (v) => getComputedStyle(document.documentElement).getPropertyValue(v).trim();
  const lc = (s) => String(s || '').toLocaleLowerCase('tr-TR');

  // ---------- Satış / iade ayrımı ----------
  // Satış ekranları yalnızca gerçekleşen satışları gösterir. İptal ve tam iadeler satıştan tamamen çıkar;
  // kısmi iadede yalnızca dönen ürünler düşülür, kalan kısım satış sayılır.
  const STATUS = { yeni: 'Yeni / Hazırlanıyor', kargo: 'Kargoda', teslim: 'Teslim Edildi', kismi: 'Kısmi İade', iptal: 'İptal', iade: 'İade' };
  const RET_TYPES = { iptal: 'İptal', iade: 'İade', kismi: 'Kısmi iade' };
  const isLost = (o) => o.sg === 'iptal' || o.sg === 'iade';
  const isSale = (o) => !isLost(o);
  const isRet = (o) => isLost(o) || o.sg === 'kismi';
  const sales = (list) => list.filter(isSale);
  const saleItems = (o) => (o.items || []).filter((i) => !i.r);
  const retItems = (o) => (isLost(o) ? (o.items || []) : (o.items || []).filter((i) => i.r));
  const retAmt = (o) => (isLost(o) ? (o.ret ?? o.total) : (o.ret || 0));
  const retQty = (o) => o.retQty ?? sum(retItems(o), (i) => i.qty);
  const amt = (o) => (isLost(o) ? 0 : o.total - (o.sg === 'kismi' ? (o.ret || 0) : 0));
  const saleQty = (o) => (isLost(o) ? 0 : (o.items?.length ? sum(saleItems(o), (i) => i.qty) : o.qty));

  function delta(cur, prev) {
    if (!prev) return cur ? '<span class="up">yeni</span>' : '';
    const d = (cur - prev) / prev;
    const cls = d >= 0 ? 'up' : 'down';
    return `<span class="${cls}">${d >= 0 ? '▲' : '▼'} ${pct(Math.abs(d))}</span>`;
  }

  // ---------- Durum ----------
  const S = {
    manifest: null,
    password: '',
    orders: [],
    retOrders: [],
    byDate: new Map(),
    dates: [],
    mp: new Map(), // key -> { label, slot, color }
    mpOrder: [],
    charts: {},
    view: 'gunluk',
    g: { start: null, end: null, page: 0 },
    a: { month: null, list: { month: null, mps: null, q: '', page: 0, sort: { k: 'date', dir: -1 }, src: [] } },
    d: { start: null, end: null, preset: '30', mps: null, status: '', q: '', gran: 'auto', metric: 'total', page: 0, sort: { k: 'date', dir: -1 }, psort: { k: 'total', dir: -1 } },
    r: { start: null, end: null, preset: '30', datetype: 'order', type: '', mps: null, q: '', page: 0, sort: { k: 'date', dir: -1 } },
  };

  // ---------- Şifre çözme ----------
  const unb64 = (s) => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));
  const keyCache = new Map();
  async function decrypt(env, password) {
    const ck = `${env.salt}|${password}`;
    let key = keyCache.get(ck);
    if (!key) {
      const base = await crypto.subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
      key = await crypto.subtle.deriveKey({ name: 'PBKDF2', salt: unb64(env.salt), iterations: env.iterations || 250000, hash: 'SHA-256' },
        base, { name: 'AES-GCM', length: 256 }, false, ['decrypt']);
      keyCache.set(ck, key);
    }
    const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
    return JSON.parse(new TextDecoder().decode(plain));
  }

  async function getJson(url) {
    const res = await fetch(`${url}?t=${Date.now()}`, { cache: 'no-store' });
    if (!res.ok) throw new Error(`${url} yüklenemedi (${res.status})`);
    return res.json();
  }

  async function loadMonths(password) {
    const files = await Promise.all(S.manifest.months.map((m) => getJson(`data/${m}.json`)));
    const out = [];
    for (const f of files) {
      const body = f.alg ? await decrypt(f, password) : f;
      out.push(...(body.orders || []));
    }
    return out;
  }

  // ---------- Kullanıcılar ----------
  // users.json varsa her kişi kendi kullanıcı adı + şifresiyle girer. Dosyada her kullanıcı için
  // ana veri anahtarı, o kişinin adı+şifresinden türetilen anahtarla şifreli durur.
  const normUser = (u) => String(u || '').normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLocaleLowerCase('tr-TR').replace(/ı/g, 'i').replace(/\s+/g, ' ').trim();
  async function userId(u) {
    const h = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(`siparis-rapor:${normUser(u)}`));
    return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
  }
  async function unlockUser(user, pass) {
    const entry = S.users?.users?.[await userId(user)];
    if (!entry) throw Object.assign(new Error('kullanıcı yok'), { reason: 'user' });
    try {
      const { k, n } = await decrypt(entry, `${normUser(user)}\n${String(pass).trim()}`);
      return { key: k, name: n };
    } catch { throw Object.assign(new Error('şifre'), { reason: 'pass' }); }
  }
  const usersOn = () => Boolean(S.users?.enabled);

  // ---------- Açılış ----------
  async function boot() {
    applyTheme(store.get('tema'));
    try {
      S.manifest = await getJson('data/manifest.json');
    } catch {
      $('#boot').innerHTML = 'Henüz veri yok. GitHub Actions\'taki <b>Siparişleri Çek</b> iş akışını çalıştırın.';
      return;
    }
    if (!S.manifest.months?.length) {
      $('#boot').textContent = 'Henüz sipariş verisi yok. İlk çekimden sonra burada görünecek.';
      return;
    }
    try { S.users = await getJson('data/users.json'); } catch { S.users = null; }
    if (!S.manifest.encrypted) { await openWith(''); return; }

    // Kayıtlı giriş her açılışta güncel kullanıcı listesine göre yeniden doğrulanır:
    // listeden çıkarılan kişi, kayıtlı girişi olsa bile giremez.
    let saved = null;
    try { saved = JSON.parse(store.get('rapor-giris') || store.get('rapor-giris', true) || 'null'); } catch { saved = null; }
    if (saved && (await tryLogin(saved.u, saved.p)) === true) return;
    store.del('rapor-giris'); store.del('rapor-sifre');
    showGate();
  }

  // Başarılıysa true, değilse hata nedenini döndürür: 'user' | 'pass' | 'data'
  async function tryLogin(user, pass) {
    let key = pass; let name = '';
    if (usersOn()) {
      try { ({ key, name } = await unlockUser(user, pass)); } catch (e) { return e.reason || 'pass'; }
    }
    try { await openWith(key, name); return true; } catch (e) {
      console.error('Veriler açılamadı:', e);
      return usersOn() ? 'data' : 'pass';
    }
  }

  async function openWith(pass, name) {
    const orders = await loadMonths(pass);
    S.password = pass;
    S.userName = name || '';
    ingest(orders);
    $('#gate').classList.add('hidden');
    $('#boot').classList.add('hidden');
    $('#app').classList.remove('hidden');
    $('#lock-btn').classList.toggle('hidden', !S.manifest.encrypted);
    if (usersOn()) {
      $('#lock-btn').title = 'Çıkış yap'; $('#lock-btn').setAttribute('aria-label', 'Çıkış yap');
    }
    $('#who').classList.toggle('hidden', !S.userName);
    $('#who').textContent = S.userName;
    startApp();
  }

  function showGate() {
    $('#boot').classList.add('hidden');
    $('#gate').classList.remove('hidden');
    const multi = usersOn();
    $('#gate-user').classList.toggle('hidden', !multi);
    $('#gate-user').required = multi;
    $('#gate-pass').placeholder = multi ? 'Şifre' : 'Rapor şifresi';
    $('#gate-text').textContent = multi ? 'Kullanıcı adınız ve şifrenizle giriş yapın.' : 'Veriler şifreli. Devam etmek için rapor şifresini girin.';
    $('#gate-btn').textContent = multi ? 'Giriş yap' : 'Aç';
    if (S.manifest.demo && !multi) $('#gate-err').innerHTML = '<span style="color:var(--muted)">Örnek veri şifresi: <b>demo</b></span>';
    (multi ? $('#gate-user') : $('#gate-pass')).focus();
    $('#gate-form').onsubmit = async (e) => {
      e.preventDefault();
      const user = $('#gate-user').value.trim();
      const pass = $('#gate-pass').value;
      const label = $('#gate-btn').textContent;
      $('#gate-btn').disabled = true;
      $('#gate-btn').textContent = 'Açılıyor…';
      $('#gate-err').textContent = '';
      const res = await tryLogin(user, pass);
      if (res === true) {
        store.set('rapor-giris', JSON.stringify({ u: user, p: pass }), !$('#gate-remember').checked);
      } else {
        $('#gate-err').textContent = {
          user: 'Bu kullanıcı adı tanımlı değil. Yazımı kontrol edin.',
          pass: multi ? 'Şifre hatalı.' : 'Şifre hatalı.',
          data: 'Giriş bilgileri doğru ama veriler açılamadı. Ana şifre (DASHBOARD_PASSWORD) değiştirilmiş olabilir.',
        }[res] || 'Giriş yapılamadı.';
        $('#gate-btn').disabled = false;
        $('#gate-btn').textContent = label;
      }
    };
  }

  function ingest(orders) {
    const seen = new Map();
    for (const o of orders) seen.set(o.id, o);
    S.orders = [...seen.values()].sort((a, b) => (a.date + a.time).localeCompare(b.date + b.time));
    S.byDate = groupBy(S.orders, (o) => o.date);
    S.dates = [...S.byDate.keys()].sort();
    S.retOrders = S.orders.filter(isRet);

    // Renk, pazaryerine bağlıdır (sıraya değil): tüm verideki ciroya göre sabit atanır
    const totals = new Map();
    for (const o of S.orders) {
      const t = totals.get(o.mp) || { label: o.mpLabel, total: 0 };
      t.total += o.total;
      totals.set(o.mp, t);
    }
    S.mpOrder = [...totals.entries()].sort((a, b) => b[1].total - a[1].total).map(([k]) => k);
    S.mp = new Map(S.mpOrder.map((k, i) => [k, { label: totals.get(k).label, slot: i < 8 ? i + 1 : 0 }]));
    refreshColors();

    const statuses = new Set(S.orders.filter(isSale).map((o) => o.sg));
    $('#d-status').innerHTML = '<option value="">Tüm durumlar</option>' +
      Object.entries(STATUS).filter(([k]) => statuses.has(k)).map(([k, v]) => `<option value="${k}">${v}</option>`).join('');
  }

  function refreshColors() {
    for (const v of S.mp.values()) v.color = css(v.slot ? `--s${v.slot}` : '--other');
  }
  const mpColor = (k) => S.mp.get(k)?.color || css('--other');
  const mpLabel = (k) => S.mp.get(k)?.label || k;
  const sw = (k) => `<span class="sw" style="background:${mpColor(k)}"></span>`;
  const mpCell = (k) => `<span class="mp-cell">${sw(k)}${esc(mpLabel(k))}</span>`;

  // Grafiklerde 8'den fazla pazaryeri "Diğer" altında toplanır
  function chartGroups(keys) {
    const main = keys.filter((k) => S.mp.get(k)?.slot);
    const rest = keys.filter((k) => !S.mp.get(k)?.slot);
    const g = main.map((k) => ({ key: k, label: mpLabel(k), color: mpColor(k), members: [k] }));
    if (rest.length) g.push({ key: '_diger', label: 'Diğer', color: css('--other'), members: rest });
    return g;
  }

  // ---------- Uygulama ----------
  const VIEWS = ['gunluk', 'aylik', 'detay', 'iade-iptal'];

  function startApp() {
    const u = S.manifest.updatedAt ? new Date(S.manifest.updatedAt) : null;
    if (u) {
      $('#updated').textContent = `Son güncelleme: ${u.toLocaleString('tr-TR', { dateStyle: 'medium', timeStyle: 'short' })}`;
      const ageH = (Date.now() - u.getTime()) / 36e5;
      if (ageH > 36 && !S.manifest.demo) showNotice(`Veriler ${Math.floor(ageH / 24)} gündür güncellenmedi. GitHub'da <b>Actions</b> sekmesinden iş akışını kontrol edin.`);
    }
    if (S.manifest.demo) showNotice('Bu ekran <b>örnek verilerle</b> çalışıyor. Entegra bilgilerinizi GitHub Secrets\'a ekleyip iş akışını çalıştırdığınızda gerçek siparişler gelir.');

    const last = S.dates[S.dates.length - 1];
    const t = todayTR();
    const day = S.byDate.has(t) ? t : last;
    S.g.start = day; S.g.end = day;
    S.a.month = day.slice(0, 7);
    S.d.mps = new Set(S.mpOrder);
    S.r.mps = new Set(S.mpOrder);
    S.a.list.mps = new Set(S.mpOrder);
    applyPreset(S.d, S.d.preset);
    applyPreset(S.r, S.r.preset);

    bindDaily(); bindMonthly(); bindDetail(); bindReturns();
    $$('.tab').forEach((b) => b.addEventListener('click', () => go(b.dataset.view)));
    $('#theme-btn').onclick = () => {
      const cur = document.documentElement.dataset.theme || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
      const next = cur === 'dark' ? 'light' : 'dark';
      store.set('tema', next);
      applyTheme(next);
      refreshColors();
      render();
    };
    $('#lock-btn').onclick = () => { store.del('rapor-giris'); store.del('rapor-sifre'); location.reload(); };
    matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => { refreshColors(); render(); });
    window.addEventListener('hashchange', () => go(location.hash.slice(1), true));
    go(location.hash.slice(1) || 'gunluk', true);
  }

  function showNotice(html) { const n = $('#notice'); n.innerHTML = html; n.classList.remove('hidden'); }
  function applyTheme(t) { if (t === 'dark' || t === 'light') document.documentElement.dataset.theme = t; }

  function go(view, fromHash) {
    if (!VIEWS.includes(view)) view = 'gunluk';
    S.view = view;
    if (!fromHash && location.hash.slice(1) !== view) history.replaceState(null, '', `#${view}`);
    $$('.tab').forEach((b) => b.setAttribute('aria-selected', String(b.dataset.view === view)));
    $$('.view').forEach((v) => v.classList.toggle('hidden', v.id !== `view-${view}`));
    render();
  }

  function render() {
    if (S.view === 'gunluk') renderDaily();
    else if (S.view === 'aylik') renderMonthly();
    else if (S.view === 'detay') renderDetail();
    else renderReturns();
  }

  // ---------- Ortak hesaplar ----------
  function ordersBetween(start, end) {
    const out = [];
    for (const d of S.dates) if (d >= start && d <= end) out.push(...S.byDate.get(d));
    return out;
  }

  // Satış istatistikleri (iade/iptal hariç, kısmi iadede dönen tutar düşülmüş)
  function stats(list) {
    const ok = sales(list);
    const total = sum(ok, amt);
    return {
      count: ok.length,
      total,
      qty: sum(ok, saleQty),
      avg: ok.length ? total / ok.length : 0,
      commission: sum(ok, (o) => o.commission),
      cargo: sum(ok, (o) => o.cargoPrice),
    };
  }

  function productRows(list, itemsOf = saleItems, limit) {
    const m = new Map();
    for (const o of list) {
      for (const it of itemsOf(o)) {
        const k = it.sku || it.name;
        const r = m.get(k) || { sku: it.sku, name: it.name, qty: 0, total: 0, orders: new Set(), mps: new Map(), types: {} };
        r.qty += it.qty;
        r.total += it.total;
        r.orders.add(o.id);
        r.mps.set(o.mp, (r.mps.get(o.mp) || 0) + it.total);
        const t = isLost(o) ? o.sg : (it.r || 'iade');
        r.types[t] = (r.types[t] || 0) + it.qty;
        m.set(k, r);
      }
    }
    const rows = [...m.values()].map((r) => ({ ...r, orderCount: r.orders.size, avgPrice: r.qty ? r.total / r.qty : 0 }));
    rows.sort((a, b) => b.total - a.total);
    return limit ? rows.slice(0, limit) : rows;
  }

  function kpiHtml(items) {
    return items.map((k) => `<div class="kpi"><div class="k">${k.k}</div><div class="v">${k.v}</div><div class="d">${k.d || '&nbsp;'}</div></div>`).join('');
  }

  // Basit tablo oluşturucu
  function table(el, cols, rows, opts = {}) {
    if (!rows.length) { el.innerHTML = `<tbody><tr><td class="empty" colspan="${cols.length}">${opts.empty || 'Bu aralıkta veri yok.'}</td></tr></tbody>`; return; }
    const sort = opts.sort;
    const head = cols.map((c) => {
      const s = sort && c.sort ? ` sortable" data-k="${c.key}` : '';
      const arrow = sort && sort.k === c.key ? (sort.dir > 0 ? ' ↑' : ' ↓') : '';
      return `<th class="${c.num ? 'num' : ''}${s}">${c.label}${arrow}</th>`;
    }).join('');
    const body = rows.map((r) => `<tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}${c.cls ? ` ${c.cls}` : ''}"${c.title ? ` title="${esc(c.title(r))}"` : ''}>${c.render ? c.render(r) : esc(r[c.key])}</td>`).join('')}</tr>`).join('');
    const foot = opts.foot ? `<tfoot><tr>${cols.map((c) => `<td class="${c.num ? 'num' : ''}">${opts.foot[c.key] ?? ''}</td>`).join('')}</tr></tfoot>` : '';
    el.innerHTML = `<thead><tr>${head}</tr></thead><tbody>${body}</tbody>${foot}`;
    if (sort && opts.onSort) {
      $$('th.sortable', el).forEach((th) => th.addEventListener('click', () => {
        const k = th.dataset.k;
        if (sort.k === k) sort.dir *= -1; else { sort.k = k; sort.dir = -1; }
        opts.onSort();
      }));
    }
  }

  const shareBar = (v, max, color) => `<span class="bar-cell">${pct(max ? v / max : 0)}<span class="track"><span class="fill" style="width:${max ? Math.max(2, (v / max) * 100) : 0}%;background:${color}"></span></span></span>`;
  const itemsText = (its, extraNote = '') => {
    if (!its.length) return '—';
    const first = `${esc(its[0].name)}${its[0].qty > 1 ? ` ×${its[0].qty}` : ''}`;
    return (its.length > 1 ? `${first} <span style="color:var(--muted)">+${its.length - 1} ürün</span>` : first) + extraNote;
  };
  const itemsTitle = (its) => its.map((i) => `${i.qty} × ${i.name}${i.sku ? ` (${i.sku})` : ''}${i.r ? ' — iade' : ''}`).join('\n');
  const rawStatusPill = (o) => `<span class="pill ${o.sg}">${esc(o.status || STATUS[o.sg])}</span>`;

  // Sayfalama
  function paged(list, state, PAGE = 50) {
    const pages = Math.max(1, Math.ceil(list.length / PAGE));
    state.page = Math.min(state.page, pages - 1);
    return { rows: list.slice(state.page * PAGE, state.page * PAGE + PAGE), pages, PAGE };
  }
  function pager(el, total, state, { pages, PAGE }, rerender, anchor, noun = 'sipariş') {
    if (total <= PAGE) { el.innerHTML = total ? `${n0(total)} ${noun}` : ''; return; }
    el.innerHTML = `<span>${n0(state.page * PAGE + 1)}–${n0(Math.min(total, (state.page + 1) * PAGE))} / ${n0(total)} ${noun}</span>
      <span class="controls"><button class="btn" data-p="-1" ${state.page === 0 ? 'disabled' : ''}>‹ Önceki</button>
      <span>Sayfa ${state.page + 1} / ${pages}</span>
      <button class="btn" data-p="1" ${state.page >= pages - 1 ? 'disabled' : ''}>Sonraki ›</button></span>`;
    $$('button[data-p]', el).forEach((b) => b.addEventListener('click', () => { state.page += +b.dataset.p; rerender(); anchor.closest('.card').scrollIntoView({ block: 'start', behavior: 'smooth' }); }));
  }

  // Satış siparişleri tablosu (Günlük ve Detaylı ekran): durum, kargo ve şehir gösterilmez
  function ordersTable(el, pagerEl, list, state, rerender, sortable) {
    const pg = paged(list, state);
    table(el, [
      { key: 'date', label: 'Tarih', sort: true, render: (o) => `${trDate(o.date)} <span style="color:var(--muted)">${o.time || ''}</span>` },
      { key: 'no', label: 'Sipariş no', sort: true, render: (o) => esc(o.no || o.id) },
      { key: 'mp', label: 'Pazaryeri', sort: true, render: (o) => mpCell(o.mp) },
      { key: 'items', label: 'Ürünler', cls: 'trunc', render: (o) => itemsText(saleItems(o).length || !o.items?.length ? saleItems(o) : o.items, o.sg === 'kismi' ? ` <span class="pill kismi">${n0(retQty(o))} ürün iade</span>` : ''), title: (o) => itemsTitle(o.items || []) },
      { key: 'qty', label: 'Adet', num: true, sort: true, render: (o) => n0(saleQty(o)) },
      { key: 'total', label: 'Tutar', num: true, sort: true, render: (o) => tl2(amt(o)) },
    ], pg.rows, { empty: 'Sipariş yok.', sort: sortable ? state.sort : null, onSort: () => { state.page = 0; rerender(); } });
    pager(pagerEl, list.length, state, pg, rerender, el);
  }

  function sortOrders(list, sk, val) {
    return [...list].sort((a, b) => {
      let va; let vb;
      if (sk.k === 'date') { va = a.date + a.time; vb = b.date + b.time; }
      else if (sk.k === 'mp') { va = mpLabel(a.mp); vb = mpLabel(b.mp); }
      else if (val && val[sk.k]) { va = val[sk.k](a); vb = val[sk.k](b); }
      else { va = a[sk.k]; vb = b[sk.k]; }
      return (typeof va === 'number' ? va - vb : String(va ?? '').localeCompare(String(vb ?? ''), 'tr')) * sk.dir;
    });
  }

  // Tarih hazır aralıkları
  function applyPreset(st, p) {
    const t = todayTR();
    const last = S.dates[S.dates.length - 1] > t ? S.dates[S.dates.length - 1] : t;
    st.preset = p;
    if (p === 'custom') return;
    let start; let end = t;
    if (p === 'yesterday') { start = addDays(t, -1); end = start; }
    else if (/^\d+$/.test(p)) start = addDays(t, -(+p - 1));
    else if (p === 'thisMonth') start = `${t.slice(0, 7)}-01`;
    else if (p === 'lastMonth') { const lm = addMonths(t.slice(0, 7), -1); start = `${lm}-01`; end = `${lm}-${String(daysInMonth(lm)).padStart(2, '0')}`; }
    else if (p === 'thisYear') start = `${t.slice(0, 4)}-01-01`;
    else { start = S.dates[0]; end = last; }
    st.start = start; st.end = end;
  }

  function mpChips(el, set, rerender) {
    const all = set.size === S.mpOrder.length;
    el.innerHTML = `<button class="chip" data-all aria-pressed="${all}">Tümü</button>` +
      S.mpOrder.map((k) => `<button class="chip" data-k="${esc(k)}" aria-pressed="${set.has(k)}">${sw(k)}${esc(mpLabel(k))}</button>`).join('');
    $$('.chip', el).forEach((c) => c.addEventListener('click', () => {
      if (c.hasAttribute('data-all')) { if (all) set.clear(); else S.mpOrder.forEach((k) => set.add(k)); }
      else if (set.has(c.dataset.k)) set.delete(c.dataset.k); else set.add(c.dataset.k);
      rerender();
    }));
  }

  // ---------- Grafikler ----------
  function legend(el, groups) {
    el.innerHTML = groups.length > 1 ? groups.map((g) => `<span><span class="sw" style="background:${g.color}"></span>${esc(g.label)}</span>`).join('') : '';
  }

  function niceMax(v) {
    if (v <= 0) return { max: 4, step: 1 };
    const raw = v / 4;
    const mag = 10 ** Math.floor(Math.log10(raw));
    const step = [1, 2, 2.5, 5, 10].map((m) => m * mag).find((s) => s >= raw);
    return { max: Math.ceil(v / step) * step, step };
  }

  function stackedBar(id, labels, groups, opts = {}) {
    S.charts[id] = { labels, groups, opts };
    drawBar(id);
    const wrap = $(`#${id}`).parentElement;
    if (!wrap._ro) {
      let w = wrap.clientWidth;
      wrap._ro = new ResizeObserver(() => { if (Math.abs(wrap.clientWidth - w) > 4) { w = wrap.clientWidth; drawBar(id); } });
      wrap._ro.observe(wrap);
    }
  }

  function drawBar(id) {
    const { labels, groups, opts } = S.charts[id];
    const { money = true, tooltipTitle } = opts;
    const fmt = money ? tl : n0;
    const holder = $(`#${id}`);
    const wrap = holder.parentElement;
    const W = Math.max(280, wrap.clientWidth);
    const H = wrap.clientHeight || 260;
    const n = labels.length;
    const totals = labels.map((_, i) => sum(groups, (g) => g.data[i]));
    if (!groups.length || !totals.some((t) => t > 0)) {
      holder.outerHTML = `<div id="${id}" class="empty" style="height:100%;display:grid;place-items:center">Bu aralıkta veri yok.</div>`;
      return;
    }
    const { max, step } = niceMax(Math.max(...totals));
    const yl = (v) => (money ? `${fmtCompact.format(v)} ₺` : fmtCompact.format(v));
    const ticks = []; for (let v = 0; v <= max + 1e-9; v += step) ticks.push(v);
    const m = { l: Math.max(...ticks.map((t) => yl(t).length)) * 6.6 + 12, r: 6, t: 8, b: 24 };
    const pw = W - m.l - m.r; const ph = H - m.t - m.b;
    const band = pw / n;
    const bw = Math.min(36, Math.max(2, band * 0.72));
    const y = (v) => m.t + ph - (v / max) * ph;
    const every = Math.max(1, Math.ceil((n * 40) / pw));
    let s = '';
    for (const t of ticks) s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(t)}" y2="${y(t)}" stroke="var(--grid)" stroke-width="1"/><text x="${m.l - 8}" y="${y(t) + 4}" text-anchor="end" fill="var(--muted)" font-size="11">${yl(t)}</text>`;
    s += `<line x1="${m.l}" x2="${W - m.r}" y1="${y(0)}" y2="${y(0)}" stroke="var(--axis)"/>`;
    s += `<rect class="hl" x="0" y="${m.t}" width="${band}" height="${ph}" fill="var(--ink)" opacity="0" rx="4"/>`;
    for (let i = 0; i < n; i++) {
      const cx = m.l + band * i + band / 2;
      const x = cx - bw / 2;
      const segs = groups.map((g) => ({ v: g.data[i], c: g.color })).filter((g) => g.v > 0);
      let acc = 0;
      segs.forEach((g, j) => {
        const y0 = y(acc); acc += g.v; const y1 = y(acc);
        const top = j === segs.length - 1;
        const h = Math.max(0, y0 - y1 - (j > 0 ? 2 : 0)); // 2px boşluk
        const yy = y0 - (j > 0 ? 2 : 0) - h;
        if (h <= 0) return;
        if (top) {
          const r = Math.min(4, h, bw / 2);
          s += `<path d="M${x},${yy + h}V${yy + r}Q${x},${yy} ${x + r},${yy}H${x + bw - r}Q${x + bw},${yy} ${x + bw},${yy + r}V${yy + h}Z" fill="${g.c}"/>`;
        } else s += `<rect x="${x}" y="${yy}" width="${bw}" height="${h}" fill="${g.c}"/>`;
      });
      if (i % every === 0) s += `<text x="${cx}" y="${H - 6}" text-anchor="middle" fill="var(--muted)" font-size="11">${esc(labels[i])}</text>`;
    }
    s += `<rect class="hit" x="${m.l}" y="0" width="${pw}" height="${H}" fill="transparent"/>`;
    const aria = `${opts.aria || ''}`;
    holder.outerHTML = `<div id="${id}" style="position:relative;height:100%"><svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" role="img" aria-label="${esc(aria)}" style="display:block;font-family:inherit;touch-action:pan-y">${s}</svg><div class="tip hidden" role="tooltip"></div></div>`;

    const root = $(`#${id}`);
    const svg = $('svg', root); const tip = $('.tip', root); const hl = $('.hl', svg);
    const show = (ev) => {
      const r = svg.getBoundingClientRect();
      const px = ev.clientX - r.left;
      const i = Math.floor((px - m.l) / band);
      if (i < 0 || i >= n) { hide(); return; }
      hl.setAttribute('x', m.l + band * i); hl.setAttribute('opacity', '0.06');
      const items = groups.map((g) => ({ l: g.label, c: g.color, v: g.data[i] })).filter((x) => x.v > 0).sort((a, b) => b.v - a.v);
      tip.innerHTML = `<div class="tt">${esc(tooltipTitle ? tooltipTitle(i) : labels[i])}</div>` +
        (items.length ? items.map((x) => `<div class="tr"><span class="sw" style="background:${x.c}"></span><span>${esc(x.l)}</span><b>${fmt(x.v)}</b></div>`).join('') : '<div class="tr" style="color:var(--muted)"><span style="grid-column:1/-1">Bu gün veri yok</span></div>') +
        (items.length > 1 ? `<div class="tr tot"><span></span><span>Toplam</span><b>${fmt(totals[i])}</b></div>` : '');
      tip.classList.remove('hidden');
      const tw = tip.offsetWidth;
      const cx = m.l + band * i + band / 2;
      let left = cx + 14; if (left + tw > W) left = cx - tw - 14; if (left < 0) left = 0;
      tip.style.left = `${left}px`;
      tip.style.top = `${Math.max(0, Math.min(ev.clientY - r.top - 20, H - tip.offsetHeight))}px`;
    };
    const hide = () => { tip.classList.add('hidden'); hl.setAttribute('opacity', '0'); };
    svg.addEventListener('pointermove', show);
    svg.addEventListener('pointerdown', show);
    svg.addEventListener('pointerleave', hide);
  }


  // Satışları zaman kovalarına ve pazaryeri gruplarına dağıtır
  function seriesBy(list, bucketKeys, bucketOf, metric, keys) {
    const groups = chartGroups(keys || S.mpOrder);
    const idx = new Map(bucketKeys.map((b, i) => [b, i]));
    const gi = new Map();
    groups.forEach((g, i) => g.members.forEach((m) => gi.set(m, i)));
    groups.forEach((g) => { g.data = new Array(bucketKeys.length).fill(0); });
    for (const o of list) {
      const b = idx.get(bucketOf(o));
      const g = gi.get(o.mp);
      if (b === undefined || g === undefined) continue;
      groups[g].data[b] += metric === 'count' ? 1 : metric === 'qty' ? saleQty(o) : amt(o);
    }
    return groups.filter((g) => g.data.some((v) => v > 0));
  }

  // ---------- GÜNLÜK (gün veya gün aralığı) ----------
  function setDaily(start, end) {
    if (!start || !end) return;
    if (start > end) [start, end] = [end, start];
    S.g.start = start; S.g.end = end; S.g.page = 0;
    renderDaily();
  }

  function bindDaily() {
    const min = S.dates[0];
    const max = todayTR() > S.dates[S.dates.length - 1] ? todayTR() : S.dates[S.dates.length - 1];
    for (const id of ['#g-start', '#g-end']) { $(id).min = min; $(id).max = max; }
    $('#g-start').onchange = (e) => { const v = e.target.value; if (v) setDaily(v, S.g.end < v ? v : S.g.end); };
    $('#g-end').onchange = (e) => { const v = e.target.value; if (v) setDaily(S.g.start > v ? v : S.g.start, v); };
    const shift = (dir) => { const n = dayCount(S.g.start, S.g.end); setDaily(addDays(S.g.start, dir * n), addDays(S.g.end, dir * n)); };
    $('#g-prev').onclick = () => shift(-1);
    $('#g-next').onclick = () => shift(1);
    $('#g-today').onclick = () => setDaily(todayTR(), todayTR());
    $('#g-yesterday').onclick = () => { const y = addDays(todayTR(), -1); setDaily(y, y); };
    $('#g-csv').onclick = () => exportOrders(sales(ordersBetween(S.g.start, S.g.end)), S.g.start === S.g.end ? `siparisler-${S.g.start}` : `siparisler-${S.g.start}_${S.g.end}`);
  }

  function renderDaily() {
    const { start, end } = S.g;
    const n = dayCount(start, end);
    const single = n === 1;
    $('#g-start').value = start; $('#g-end').value = end;
    $('#g-title').textContent = single ? (start === todayTR() ? 'Bugün' : start === addDays(todayTR(), -1) ? 'Dün' : 'Günlük Rapor') : 'Seçilen Günler';
    $('#g-sub').textContent = trRange(start, end);

    const list = sales(ordersBetween(start, end));
    const prevList = sales(ordersBetween(addDays(start, -n), addDays(start, -1)));
    const s = stats(list); const p = stats(prevList);
    const cmp = single ? 'önceki güne göre' : `önceki ${n} güne göre`;
    const extra = [];
    if (n <= 7) {
      const w = stats(ordersBetween(addDays(start, -7), addDays(end, -7)));
      extra.push(single ? `geçen hafta bugün ${n0(w.count)}` : `geçen hafta aynı günler ${n0(w.count)}`);
    }

    $('#g-kpis').innerHTML = kpiHtml([
      { k: 'Ciro', v: tl(s.total), d: `${delta(s.total, p.total)} ${cmp}` },
      { k: 'Sipariş', v: n0(s.count), d: `${delta(s.count, p.count)}${extra.length ? ` · ${extra[0]}` : ` ${cmp}`}` },
      { k: 'Satılan ürün', v: n0(s.qty), d: `${single ? 'önceki gün' : 'önceki dönem'} ${n0(p.qty)}` },
      { k: 'Ortalama sepet', v: tl(s.avg), d: `${single ? 'önceki gün' : 'önceki dönem'} ${tl(p.avg)}` },
    ]);

    // Pazaryeri tablosu
    const byMp = groupBy(list, (o) => o.mp);
    const prevByMp = groupBy(prevList, (o) => o.mp);
    const rows = [...byMp.entries()].map(([k, l]) => ({ k, ...stats(l), prev: stats(prevByMp.get(k) || []).total })).sort((a, b) => b.total - a.total);
    table($('#g-mp'), [
      { key: 'k', label: 'Pazaryeri', render: (r) => mpCell(r.k) },
      { key: 'count', label: 'Sipariş', num: true, render: (r) => n0(r.count) },
      { key: 'qty', label: 'Ürün', num: true, render: (r) => n0(r.qty) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
      { key: 'share', label: 'Pay', num: true, render: (r) => shareBar(r.total, s.total, mpColor(r.k)) },
      { key: 'avg', label: 'Ort. sepet', num: true, render: (r) => tl(r.avg) },
      { key: 'd', label: single ? 'Önceki gün' : 'Önceki dönem', num: true, render: (r) => delta(r.total, r.prev) || '—' },
    ], rows, { empty: 'Bu tarihlerde sipariş yok.', foot: rows.length > 1 ? { k: 'Toplam', count: n0(s.count), qty: n0(s.qty), total: tl(s.total), avg: tl(s.avg), d: delta(s.total, p.total) } : null });

    // Saatlik
    const hours = Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0'));
    const hg = seriesBy(list.filter((o) => o.time), hours, (o) => o.time.slice(0, 2), 'count');
    $('#g-hour-sub').textContent = single ? 'Pazaryerine göre sipariş sayısı' : `${n} günün toplamı, pazaryerine göre`;
    legend($('#g-hour-legend'), hg);
    stackedBar('g-hour', hours, hg, { money: false, tooltipTitle: (i) => `${hours[i]}:00 – ${hours[i]}:59` });

    // Son 14 gün (bitiş gününe kadar)
    const days = Array.from({ length: 14 }, (_, i) => addDays(end, i - 13));
    const tg = seriesBy(sales(ordersBetween(days[0], end)), days, (o) => o.date, 'total');
    legend($('#g-trend-legend'), tg);
    stackedBar('g-trend', days.map((d) => `${d.slice(8, 10)}.${d.slice(5, 7)}`), tg, { tooltipTitle: (i) => trDateLong(days[i]) });

    // Ürünler
    $('#g-products-title').textContent = single ? 'Günün en çok satanları' : 'En çok satanlar';
    const prods = productRows(list).sort((a, b) => b.qty - a.qty).slice(0, 10);
    table($('#g-products'), [
      { key: 'name', label: 'Ürün', cls: 'trunc', render: (r) => `${esc(r.name)}${r.sku ? `<br><span style="color:var(--muted);font-size:12px">${esc(r.sku)}</span>` : ''}`, title: (r) => r.name },
      { key: 'mps', label: 'Pazaryeri', render: (r) => [...r.mps.keys()].map((k) => `<span title="${esc(mpLabel(k))}" class="sw" style="display:inline-block;margin-right:3px;background:${mpColor(k)}"></span>`).join('') },
      { key: 'qty', label: 'Adet', num: true, render: (r) => n0(r.qty) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
    ], prods, { empty: 'Satış yok.' });

    $('#g-orders-title').textContent = single ? 'Günün siparişleri' : 'Seçilen günlerin siparişleri';
    $('#g-orders-sub').textContent = `${n0(list.length)} sipariş · iade ve iptaller hariç`;
    ordersTable($('#g-orders'), $('#g-pager'), [...list].reverse(), S.g, renderDaily, false);
  }

  // ---------- AYLIK ----------
  function bindMonthly() {
    const mi = $('#a-month');
    mi.min = S.dates[0].slice(0, 7);
    mi.max = todayTR().slice(0, 7);
    mi.onchange = () => { if (mi.value) { S.a.month = mi.value; renderMonthly(); } };
    $('#a-prev').onclick = () => { S.a.month = addMonths(S.a.month, -1); renderMonthly(); };
    $('#a-next').onclick = () => { S.a.month = addMonths(S.a.month, 1); renderMonthly(); };
    let tmr;
    $('#a-list-q').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { S.a.list.q = e.target.value.trim(); S.a.list.page = 0; renderMonthList(S.a.list.src); }, 200); };
    $('#a-list-csv').onclick = () => {
      const rows = monthListRows(S.a.list.src);
      download([['Tarih', 'Saat', 'Sipariş No', 'Pazaryeri', 'Müşteri', 'Stok Kodu', 'Ürün', 'Adet', 'Satış Fiyatı', 'Tutar'],
        ...rows.map((r) => [trDate(r.o.date), r.o.time, r.no, r.mp, r.customer, r.sku, r.name, r.qty, r2(r.price), r2(r.total)])], `siparis-listesi-${S.a.month}`);
    };
  }

  function renderMonthly() {
    const m = S.a.month;
    $('#a-month').value = m;
    $('#a-title').textContent = trMonth(m);
    const dim = daysInMonth(m);
    const start = `${m}-01`;
    const end = `${m}-${String(dim).padStart(2, '0')}`;
    const today = todayTR();
    const isCurrent = today.slice(0, 7) === m;
    const elapsed = isCurrent ? +today.slice(8, 10) : dim;
    const list = sales(ordersBetween(start, end));

    const pm = addMonths(m, -1);
    const pmFullEnd = `${pm}-${String(daysInMonth(pm)).padStart(2, '0')}`;
    const pmEnd = isCurrent ? `${pm}-${String(Math.min(elapsed, daysInMonth(pm))).padStart(2, '0')}` : pmFullEnd;
    const prevList = sales(ordersBetween(`${pm}-01`, pmEnd));
    const s = stats(list); const p = stats(prevList);
    const cmp = isCurrent ? 'geçen ayın aynı dönemine göre' : 'önceki aya göre';
    $('#a-sub').textContent = isCurrent ? `Ayın ${elapsed}. günü · ${dim - elapsed} gün kaldı · iade ve iptaller hariç` : `${dim} gün · iade ve iptaller hariç`;

    const kp = [
      { k: 'Ciro', v: tl(s.total), d: `${delta(s.total, p.total)} ${cmp}` },
      { k: 'Sipariş', v: n0(s.count), d: `${delta(s.count, p.count)} ${cmp}` },
      { k: 'Satılan ürün', v: n0(s.qty), d: delta(s.qty, p.qty) },
      { k: 'Ortalama sepet', v: tl(s.avg), d: `önceki ${tl(p.avg)}` },
      { k: 'Günlük ortalama', v: tl(s.total / elapsed), d: `${n0(s.count / elapsed)} sipariş / gün` },
    ];
    if (isCurrent && elapsed > 2) kp.push({ k: 'Ay sonu tahmini', v: tl((s.total / elapsed) * dim), d: 'bugünkü hıza göre' });
    $('#a-kpis').innerHTML = kpiHtml(kp);

    // Pazaryeri tablosu
    const byMp = groupBy(list, (o) => o.mp);
    const prevBy = groupBy(prevList, (o) => o.mp);
    const rows = [...byMp.entries()].map(([k, l]) => ({ k, ...stats(l), prev: stats(prevBy.get(k) || []).total })).sort((a, b) => b.total - a.total);
    const hasCom = rows.some((r) => r.commission);
    const cols = [
      { key: 'k', label: 'Pazaryeri', render: (r) => mpCell(r.k) },
      { key: 'count', label: 'Sipariş', num: true, render: (r) => n0(r.count) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
      { key: 'share', label: 'Pay', num: true, render: (r) => shareBar(r.total, s.total, mpColor(r.k)) },
      { key: 'avg', label: 'Ort. sepet', num: true, render: (r) => tl(r.avg) },
    ];
    if (hasCom) cols.push({ key: 'commission', label: 'Komisyon', num: true, render: (r) => tl(r.commission) });
    cols.push(
      { key: 'prev', label: isCurrent ? 'Geçen ay (aynı dönem)' : 'Önceki ay', num: true, render: (r) => tl(r.prev) },
      { key: 'd', label: 'Değişim', num: true, render: (r) => delta(r.total, r.prev) || '—' },
    );
    table($('#a-mp'), cols, rows, { foot: rows.length > 1 ? { k: 'Toplam', count: n0(s.count), total: tl(s.total), avg: tl(s.avg), commission: tl(s.commission), prev: tl(p.total), d: delta(s.total, p.total) } : null });

    // Sipariş listesi (ürün satırı bazında, pazaryeri filtreli)
    if (S.a.list.month !== m) { S.a.list.month = m; S.a.list.page = 0; }
    renderMonthList(list);

    // Ürünler
    table($('#a-products'), [
      { key: 'name', label: 'Ürün', cls: 'trunc', render: (r) => esc(r.name), title: (r) => `${r.name} ${r.sku ? `(${r.sku})` : ''}` },
      { key: 'qty', label: 'Adet', num: true, render: (r) => n0(r.qty) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
      { key: 'mp', label: 'En çok', render: (r) => { const top = [...r.mps.entries()].sort((a, b) => b[1] - a[1])[0]; return top ? mpCell(top[0]) : ''; } },
    ], productRows(list, saleItems, 15));

    // Gün gün
    const days = Array.from({ length: dim }, (_, i) => `${m}-${String(i + 1).padStart(2, '0')}`);
    const groups = chartGroups(S.mpOrder.filter((k) => byMp.has(k)));
    const byDay = groupBy(list, (o) => o.date);
    const dayRows = days.filter((d) => d <= today).reverse().map((d) => {
      const l = byDay.get(d) || [];
      const r = { d, total: sum(l, amt), count: l.length };
      for (const g of groups) r[g.key] = sum(l.filter((o) => g.members.includes(o.mp)), amt);
      return r;
    });
    const foot = { d: 'Toplam', count: n0(s.count), total: tl(s.total) };
    for (const g of groups) foot[g.key] = tl(sum(dayRows, (r) => r[g.key]));
    table($('#a-days'), [
      { key: 'd', label: 'Gün', render: (r) => `${r.d.slice(8, 10)} <span style="color:var(--muted)">${DAYS[D(r.d).getUTCDay()].slice(0, 3)}</span>` },
      ...groups.map((g) => ({ key: g.key, label: `<span class="mp-cell"><span class="sw" style="background:${g.color}"></span>${esc(g.label)}</span>`, num: true, render: (r) => (r[g.key] ? tl(r[g.key]) : '<span style="color:var(--muted)">—</span>') })),
      { key: 'count', label: 'Sipariş', num: true, render: (r) => n0(r.count) },
      { key: 'total', label: 'Toplam', num: true, render: (r) => `<b>${tl(r.total)}</b>` },
    ], dayRows, { foot });

    // 12 ay
    const months = Array.from({ length: 12 }, (_, i) => addMonths(m, i - 11));
    const yList = sales(ordersBetween(`${months[0]}-01`, end));
    const yg = seriesBy(yList, months, (o) => o.date.slice(0, 7), 'total');
    legend($('#a-year-legend'), yg);
    stackedBar('a-year', months.map((x) => `${MONTHS[+x.slice(5, 7) - 1].slice(0, 3)} ${x.slice(2, 4)}`), yg, { tooltipTitle: (i) => trMonth(months[i]) });
  }

  // Aylık sipariş listesi: her ürün satırı ayrı satır (iade/iptal hariç, kısmi iadede dönen ürünler hariç)
  function monthListRows(list) {
    const L = S.a.list;
    const q = lc(L.q);
    const rows = [];
    for (const o of list) {
      if (!L.mps.has(o.mp)) continue;
      const its = o.items?.length ? saleItems(o) : [{ sku: '', name: '—', qty: o.qty, total: amt(o) }];
      for (const it of its) {
        const r = { o, date: o.date + o.time, no: o.no || o.id, mp: mpLabel(o.mp), customer: o.customer || '', name: it.name, sku: it.sku, qty: it.qty, total: it.total, price: it.qty ? it.total / it.qty : it.total };
        if (q && ![r.no, r.customer, r.name, r.sku].some((x) => lc(x).includes(q))) continue;
        rows.push(r);
      }
    }
    const sk = L.sort;
    rows.sort((a, b) => {
      const va = a[sk.k]; const vb = b[sk.k];
      const c = typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'tr');
      return c * sk.dir || a.no.localeCompare(b.no);
    });
    return rows;
  }

  function renderMonthList(list) {
    const L = S.a.list;
    mpChips($('#a-list-mps'), L.mps, () => { L.page = 0; renderMonthList(L.src); });
    L.src = list;
    const rows = monthListRows(list);
    const orderCount = new Set(rows.map((r) => r.o.id)).size;
    const noCustomer = rows.length && rows.every((r) => !r.customer);
    $('#a-list-sub').textContent = `${n0(orderCount)} sipariş · ${n0(rows.length)} ürün satırı · iade ve iptaller hariç${noCustomer ? ' · müşteri adları bir sonraki sipariş çekiminden sonra görünür' : ''}`;
    const pg = paged(rows, L);
    table($('#a-list'), [
      { key: 'date', label: 'Tarih', sort: true, render: (r) => trDate(r.o.date) },
      { key: 'no', label: 'Sipariş no', sort: true, render: (r) => esc(r.no) },
      { key: 'mp', label: 'Pazaryeri', sort: true, render: (r) => mpCell(r.o.mp) },
      { key: 'customer', label: 'Müşteri', sort: true, cls: 'cust', render: (r) => esc(r.customer || '—'), title: (r) => r.customer },
      { key: 'name', label: 'Ürün', sort: true, cls: 'trunc', render: (r) => `${esc(r.name)}${r.sku ? `<br><span style="color:var(--muted);font-size:12px">${esc(r.sku)}</span>` : ''}`, title: (r) => r.name },
      { key: 'qty', label: 'Adet', num: true, sort: true, render: (r) => n0(r.qty) },
      { key: 'price', label: 'Satış fiyatı', num: true, sort: true, render: (r) => tl2(r.price) },
      { key: 'total', label: 'Tutar', num: true, sort: true, render: (r) => tl2(r.total) },
    ], pg.rows, {
      empty: 'Bu ay seçili pazaryerlerinde sipariş yok.',
      sort: L.sort,
      onSort: () => { L.page = 0; renderMonthList(L.src); },
      foot: rows.length ? { date: 'Toplam', qty: n0(sum(rows, (r) => r.qty)), total: tl2(sum(rows, (r) => r.total)) } : null,
    });
    pager($('#a-list-pager'), rows.length, L, pg, () => renderMonthList(L.src), $('#a-list'), 'satır');
  }

  // ---------- DETAYLI ----------
  function bindDetail() {
    const d = S.d;
    $('#d-preset').onchange = (e) => { applyPreset(d, e.target.value); d.page = 0; renderDetail(); };
    const onDate = () => {
      let a = $('#d-start').value || d.start; let b = $('#d-end').value || d.end;
      if (a > b) [a, b] = [b, a];
      d.start = a; d.end = b; d.preset = 'custom'; d.page = 0; renderDetail();
    };
    $('#d-start').onchange = onDate; $('#d-end').onchange = onDate;
    $('#d-status').onchange = (e) => { d.status = e.target.value; d.page = 0; renderDetail(); };
    $('#d-gran').onchange = (e) => { d.gran = e.target.value; renderDetail(); };
    $('#d-metric').onchange = (e) => { d.metric = e.target.value; renderDetail(); };
    let tmr;
    $('#d-q').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { d.q = e.target.value.trim(); d.page = 0; renderDetail(); }, 200); };
    $('#d-csv').onclick = () => exportOrders(detailList(), `siparisler-${d.start}_${d.end}`);
    $('#d-csv-products').onclick = () => exportProducts(detailList(), `urunler-${d.start}_${d.end}`);
  }

  const matchQ = (o, q) => !q || [o.no, o.id, o.mpLabel].some((x) => lc(x).includes(q)) ||
    (o.items || []).some((i) => lc(i.name).includes(q) || lc(i.sku).includes(q));

  // Detaylı rapordaki satış listesi (iade/iptal hariç)
  function detailList(start = S.d.start, end = S.d.end) {
    const d = S.d;
    const q = lc(d.q);
    return ordersBetween(start, end).filter((o) => isSale(o) && d.mps.has(o.mp) && (!d.status || o.sg === d.status) && matchQ(o, q));
  }

  function renderDetail() {
    const d = S.d;
    $('#d-preset').value = d.preset;
    $('#d-start').value = d.start; $('#d-end').value = d.end;
    mpChips($('#d-mps'), d.mps, () => { d.page = 0; renderDetail(); });
    const list = detailList();
    const s = stats(list);
    const ndays = dayCount(d.start, d.end);
    $('#d-sub').textContent = `${trDate(d.start)} – ${trDate(d.end)} · ${ndays} gün · iade ve iptaller hariç`;

    // Önceki eşit dönem
    const pEnd = addDays(d.start, -1); const pStart = addDays(pEnd, -(ndays - 1));
    const p = stats(detailList(pStart, pEnd));
    const cmp = pStart < S.dates[0] ? `önceki ${ndays} güne göre (önceki dönemin verisi eksik)` : `önceki ${ndays} güne göre`;
    const kp = [
      { k: 'Ciro', v: tl(s.total), d: `${delta(s.total, p.total)} ${cmp}` },
      { k: 'Sipariş', v: n0(s.count), d: `${delta(s.count, p.count)} ${cmp}` },
      { k: 'Satılan ürün', v: n0(s.qty), d: `${n0(s.qty / ndays)} / gün` },
      { k: 'Ortalama sepet', v: tl(s.avg), d: `günlük ort. ciro ${tl(s.total / ndays)}` },
    ];
    $('#d-kpis').innerHTML = kpiHtml(kp);

    // Trend
    let gran = d.gran;
    if (gran === 'auto') gran = ndays <= 45 ? 'day' : ndays <= 200 ? 'week' : 'month';
    let buckets; let bucketOf; let label; let title;
    if (gran === 'day') {
      buckets = Array.from({ length: ndays }, (_, i) => addDays(d.start, i));
      bucketOf = (o) => o.date; label = (b) => `${b.slice(8, 10)}.${b.slice(5, 7)}`; title = (b) => trDateLong(b);
    } else if (gran === 'week') {
      buckets = []; for (let w = weekStart(d.start); w <= d.end; w = addDays(w, 7)) buckets.push(w);
      bucketOf = (o) => weekStart(o.date); label = (b) => `${b.slice(8, 10)}.${b.slice(5, 7)}`; title = (b) => `${trDate(b)} haftası`;
    } else {
      buckets = []; for (let m = d.start.slice(0, 7); m <= d.end.slice(0, 7); m = addMonths(m, 1)) buckets.push(m);
      bucketOf = (o) => o.date.slice(0, 7); label = (b) => `${MONTHS[+b.slice(5, 7) - 1].slice(0, 3)} ${b.slice(2, 4)}`; title = trMonth;
    }
    const mName = { total: 'Ciro', count: 'Sipariş', qty: 'Ürün adedi' }[d.metric];
    $('#d-trend-title').textContent = `${mName} trendi`;
    $('#d-trend-sub').textContent = `${{ day: 'Günlük', week: 'Haftalık', month: 'Aylık' }[gran]}, pazaryerine göre`;
    const tg = seriesBy(list, buckets, bucketOf, d.metric, S.mpOrder.filter((k) => d.mps.has(k)));
    legend($('#d-trend-legend'), tg);
    stackedBar('d-trend', buckets.map(label), tg, { money: d.metric === 'total', tooltipTitle: (i) => title(buckets[i]) });

    // Pazaryeri karşılaştırma (komisyon ve kargo sütunları yok)
    const byMp = groupBy(list, (o) => o.mp);
    const rows = [...byMp.entries()].map(([k, l]) => ({ k, ...stats(l) })).sort((a, b) => b.total - a.total);
    table($('#d-mp'), [
      { key: 'k', label: 'Pazaryeri', render: (r) => mpCell(r.k) },
      { key: 'count', label: 'Sipariş', num: true, render: (r) => n0(r.count) },
      { key: 'qty', label: 'Ürün', num: true, render: (r) => n0(r.qty) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
      { key: 'share', label: 'Pay', num: true, render: (r) => shareBar(r.total, s.total, mpColor(r.k)) },
      { key: 'avg', label: 'Ort. sepet', num: true, render: (r) => tl(r.avg) },
    ], rows, { foot: rows.length > 1 ? { k: 'Toplam', count: n0(s.count), qty: n0(s.qty), total: tl(s.total), avg: tl(s.avg) } : null });

    // Ürünler
    const prods = productRows(list);
    const ps = d.psort;
    prods.sort((a, b) => {
      const va = a[ps.k]; const vb = b[ps.k];
      return (typeof va === 'string' ? va.localeCompare(vb, 'tr') : va - vb) * ps.dir;
    });
    const maxT = Math.max(0, ...prods.map((x) => x.total));
    table($('#d-products'), [
      { key: 'name', label: 'Ürün', sort: true, cls: 'trunc', render: (r) => `${esc(r.name)}${r.sku ? `<br><span style="color:var(--muted);font-size:12px">${esc(r.sku)}</span>` : ''}`, title: (r) => r.name },
      { key: 'qty', label: 'Adet', num: true, sort: true, render: (r) => n0(r.qty) },
      { key: 'orderCount', label: 'Sipariş', num: true, sort: true, render: (r) => n0(r.orderCount) },
      { key: 'avgPrice', label: 'Ort. fiyat', num: true, sort: true, render: (r) => tl2(r.avgPrice) },
      { key: 'total', label: 'Ciro', num: true, sort: true, render: (r) => tl(r.total) },
      { key: 'mix', label: 'Pazaryeri dağılımı', render: (r) => mixBar(r.mps, r.total, maxT) },
    ], prods.slice(0, 300), { sort: ps, onSort: renderDetail, empty: 'Bu filtrelerle ürün yok.' });

    // Şehirler
    const byCity = groupBy(list.filter((o) => o.city), (o) => o.city);
    const cityRows = [...byCity.entries()].map(([c, l]) => ({ c, count: l.length, total: sum(l, amt) })).sort((a, b) => b.total - a.total).slice(0, 12);
    table($('#d-cities'), [
      { key: 'c', label: 'Şehir', render: (r) => esc(r.c) },
      { key: 'count', label: 'Sipariş', num: true, render: (r) => n0(r.count) },
      { key: 'total', label: 'Ciro', num: true, render: (r) => tl(r.total) },
    ], cityRows, { empty: 'Şehir bilgisi gelmiyor.' });

    // Hafta günleri
    const wd = Array.from({ length: 7 }, () => ({ total: 0, count: 0, days: 0 }));
    for (let x = d.start; x <= d.end; x = addDays(x, 1)) wd[D(x).getUTCDay()].days++;
    for (const o of list) { const g = D(o.date).getUTCDay(); wd[g].total += amt(o); wd[g].count++; }
    const order = [1, 2, 3, 4, 5, 6, 0];
    const wdMax = Math.max(...order.map((i) => (wd[i].days ? wd[i].total / wd[i].days : 0)));
    table($('#d-weekday'), [
      { key: 'g', label: 'Gün', render: (r) => r.g },
      { key: 'c', label: 'Sipariş/gün', num: true, render: (r) => n0(r.c) },
      { key: 't', label: 'Ciro/gün', num: true, render: (r) => `<span class="bar-cell">${tl(r.t)}<span class="track"><span class="fill" style="width:${wdMax ? (r.t / wdMax) * 100 : 0}%;background:var(--s1)"></span></span></span>` },
    ], order.map((i) => ({ g: DAYS[i], c: wd[i].days ? wd[i].count / wd[i].days : 0, t: wd[i].days ? wd[i].total / wd[i].days : 0 })));

    // Siparişler
    const sorted = sortOrders(list, d.sort, { qty: saleQty, total: amt });
    $('#d-orders-sub').textContent = `${n0(list.length)} sipariş · iade ve iptaller hariç · başlığa tıklayarak sıralayın`;
    ordersTable($('#d-orders'), $('#d-pager'), sorted, d, renderDetail, true);
  }

  function mixBar(mps, total, maxT) {
    const w = maxT ? Math.max(8, (total / maxT) * 140) : 0;
    const segs = [...mps.entries()].sort((a, b) => b[1] - a[1]).map(([k, v]) => `<span title="${esc(mpLabel(k))}: ${tl(v)}" style="display:block;height:100%;width:${total ? (v / total) * 100 : 0}%;background:${mpColor(k)};border-right:2px solid var(--surface)"></span>`).join('');
    return `<span style="display:flex;width:${w}px;height:8px;border-radius:3px;overflow:hidden">${segs}</span>`;
  }

  // ---------- İADE & İPTAL ----------
  function bindReturns() {
    const r = S.r;
    $('#r-preset').onchange = (e) => { applyPreset(r, e.target.value); r.page = 0; renderReturns(); };
    const onDate = () => {
      let a = $('#r-start').value || r.start; let b = $('#r-end').value || r.end;
      if (a > b) [a, b] = [b, a];
      r.start = a; r.end = b; r.preset = 'custom'; r.page = 0; renderReturns();
    };
    $('#r-start').onchange = onDate; $('#r-end').onchange = onDate;
    $('#r-datetype').onchange = (e) => { r.datetype = e.target.value; r.page = 0; renderReturns(); };
    $$('#r-types .chip').forEach((c) => c.addEventListener('click', () => { r.type = c.dataset.t; r.page = 0; renderReturns(); }));
    let tmr;
    $('#r-q').oninput = (e) => { clearTimeout(tmr); tmr = setTimeout(() => { r.q = e.target.value.trim(); r.page = 0; renderReturns(); }, 200); };
    $('#r-csv').onclick = () => exportReturns(returnsList(), `iade-iptal-${r.start}_${r.end}`);
  }

  const retDay = (o) => (o.changed || o.date).slice(0, 10);

  function returnsList(withType = true) {
    const r = S.r;
    const q = lc(r.q);
    const byChanged = r.datetype === 'changed';
    return S.retOrders.filter((o) => {
      const day = byChanged ? retDay(o) : o.date;
      if (day < r.start || day > r.end) return false;
      if (!r.mps.has(o.mp)) return false;
      if (withType && r.type && o.sg !== r.type) return false;
      return !q || matchQ(o, q) || lc(o.status).includes(q);
    });
  }

  function renderReturns() {
    const r = S.r;
    $('#r-preset').value = r.preset;
    $('#r-start').value = r.start; $('#r-end').value = r.end;
    $('#r-datetype').value = r.datetype;
    $$('#r-types .chip').forEach((c) => c.setAttribute('aria-pressed', String(c.dataset.t === r.type)));
    mpChips($('#r-mps'), r.mps, () => { r.page = 0; renderReturns(); });
    const byChanged = r.datetype === 'changed';
    $('#r-sub').textContent = `${trDate(r.start)} – ${trDate(r.end)} · ${byChanged ? 'iade/iptal işleminin yapıldığı tarihe göre' : 'sipariş tarihine göre'}`;

    const allTypes = returnsList(false);
    const list = r.type ? allTypes.filter((o) => o.sg === r.type) : allTypes;
    const of = (t) => allTypes.filter((o) => o.sg === t);
    const iptal = of('iptal'); const iade = of('iade'); const kismi = of('kismi');
    // Oran için paydada aynı tarih aralığı ve pazaryerlerindeki tüm siparişler (sipariş tarihine göre)
    const base = ordersBetween(r.start, r.end).filter((o) => r.mps.has(o.mp));
    const baseRet = base.filter(isRet);

    $('#r-kpis').innerHTML = kpiHtml([
      { k: 'İptal', v: n0(iptal.length), d: tl(sum(iptal, retAmt)) },
      { k: 'İade', v: n0(iade.length), d: tl(sum(iade, retAmt)) },
      { k: 'Kısmi iade', v: n0(kismi.length), d: `${tl(sum(kismi, retAmt))} iade edilen` },
      { k: 'Toplam iade/iptal tutarı', v: tl(sum(allTypes, retAmt)), d: `${n0(sum(allTypes, retQty))} ürün` },
      { k: 'İade/iptal oranı', v: pct(base.length ? baseRet.length / base.length : 0), d: `${n0(baseRet.length)} / ${n0(base.length)} sipariş (sipariş tarihine göre)` },
    ]);

    // Pazaryeri tablosu
    const baseBy = groupBy(base, (o) => o.mp);
    const baseRetBy = groupBy(baseRet, (o) => o.mp);
    const listBy = groupBy(allTypes, (o) => o.mp);
    const mpRows = S.mpOrder.filter((k) => listBy.has(k) || baseRetBy.has(k)).map((k) => {
      const l = listBy.get(k) || [];
      const all = (baseBy.get(k) || []).length;
      const rc = (baseRetBy.get(k) || []).length;
      return { k, iptal: l.filter((o) => o.sg === 'iptal').length, iade: l.filter((o) => o.sg === 'iade').length, kismi: l.filter((o) => o.sg === 'kismi').length, amt: sum(l, retAmt), qty: sum(l, retQty), all, rate: all ? rc / all : 0 };
    }).sort((a, b) => b.amt - a.amt);
    $('#r-mp-sub').textContent = 'Oran: aynı tarih aralığında verilen siparişlerin yüzde kaçı iade/iptal oldu';
    table($('#r-mp'), [
      { key: 'k', label: 'Pazaryeri', render: (x) => mpCell(x.k) },
      { key: 'iptal', label: 'İptal', num: true, render: (x) => n0(x.iptal) },
      { key: 'iade', label: 'İade', num: true, render: (x) => n0(x.iade) },
      { key: 'kismi', label: 'Kısmi iade', num: true, render: (x) => n0(x.kismi) },
      { key: 'qty', label: 'Ürün', num: true, render: (x) => n0(x.qty) },
      { key: 'amt', label: 'Tutar', num: true, render: (x) => `<span class="ret-amt">${tl(x.amt)}</span>` },
      { key: 'all', label: 'Tüm siparişler', num: true, render: (x) => n0(x.all) },
      { key: 'rate', label: 'Oran', num: true, render: (x) => pct(x.rate) },
    ], mpRows, {
      empty: 'Bu aralıkta iade veya iptal yok.',
      foot: mpRows.length > 1 ? { k: 'Toplam', iptal: n0(iptal.length), iade: n0(iade.length), kismi: n0(kismi.length), qty: n0(sum(allTypes, retQty)), amt: tl(sum(allTypes, retAmt)), all: n0(base.length), rate: pct(base.length ? baseRet.length / base.length : 0) } : null,
    });

    // Ürünler
    const prods = productRows(list, retItems).sort((a, b) => b.qty - a.qty || b.total - a.total).slice(0, 50);
    table($('#r-products'), [
      { key: 'name', label: 'Ürün', cls: 'trunc', render: (x) => `${esc(x.name)}${x.sku ? `<br><span style="color:var(--muted);font-size:12px">${esc(x.sku)}</span>` : ''}`, title: (x) => x.name },
      { key: 'iptal', label: 'İptal', num: true, render: (x) => n0(x.types.iptal || 0) },
      { key: 'iade', label: 'İade', num: true, render: (x) => n0(x.types.iade || 0) },
      { key: 'qty', label: 'Toplam adet', num: true, render: (x) => n0(x.qty) },
      { key: 'total', label: 'Tutar', num: true, render: (x) => tl(x.total) },
      { key: 'mp', label: 'En çok', render: (x) => { const top = [...x.mps.entries()].sort((a, b) => b[1] - a[1])[0]; return top ? mpCell(top[0]) : ''; } },
    ], prods, { empty: 'Ürün yok.' });

    // Durumlar (Entegra'daki adlarıyla)
    const bySt = groupBy(list, (o) => o.status || STATUS[o.sg]);
    const stRows = [...bySt.entries()].map(([st, l]) => ({ st, sg: l[0].sg, count: l.length, amt: sum(l, retAmt) })).sort((a, b) => b.count - a.count);
    table($('#r-status'), [
      { key: 'st', label: 'Durum', render: (x) => `<span class="pill ${x.sg}">${esc(x.st)}</span>` },
      { key: 'count', label: 'Sipariş', num: true, render: (x) => n0(x.count) },
      { key: 'amt', label: 'Tutar', num: true, render: (x) => tl(x.amt) },
    ], stRows, { empty: 'Durum yok.' });

    // Liste
    const sorted = sortOrders(list, r.sort, { changed: retDay, total: (o) => o.total, ret: retAmt, status: (o) => o.status });
    const pg = paged(sorted, r);
    $('#r-orders-sub').textContent = `${n0(list.length)} sipariş · başlığa tıklayarak sıralayın`;
    table($('#r-orders'), [
      { key: 'date', label: 'Sipariş tarihi', sort: true, render: (o) => `${trDate(o.date)} <span style="color:var(--muted)">${o.time || ''}</span>` },
      { key: 'changed', label: 'İade/iptal tarihi', sort: true, render: (o) => (o.changed ? `${trDate(o.changed)} <span style="color:var(--muted)">${o.changed.slice(11, 16)}</span>` : '<span style="color:var(--muted)">—</span>'), title: () => 'Entegra\'daki son güncelleme zamanı' },
      { key: 'no', label: 'Sipariş no', sort: true, render: (o) => esc(o.no || o.id) },
      { key: 'mp', label: 'Pazaryeri', sort: true, render: (o) => mpCell(o.mp) },
      { key: 'items', label: 'İade/iptal edilen ürünler', cls: 'trunc', render: (o) => itemsText(retItems(o).length ? retItems(o) : (o.items || [])), title: (o) => itemsTitle(o.items || []) },
      { key: 'total', label: 'Sipariş tutarı', num: true, sort: true, render: (o) => tl2(o.total) },
      { key: 'ret', label: 'İade/iptal tutarı', num: true, sort: true, render: (o) => `<span class="ret-amt">${tl2(retAmt(o))}</span>` },
      { key: 'status', label: 'Durum', sort: true, render: rawStatusPill },
    ], pg.rows, { empty: 'Bu filtrelerle iade veya iptal yok.', sort: r.sort, onSort: () => { r.page = 0; renderReturns(); } });
    pager($('#r-pager'), list.length, r, pg, renderReturns, $('#r-orders'));
  }

  // ---------- CSV ----------
  function download(rows, name) {
    const csv = rows.map((r) => r.map((v) => {
      const s = typeof v === 'number' ? String(v).replace('.', ',') : String(v ?? '');
      return /[";\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
    }).join(';')).join('\r\n');
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = `${name}.csv`;
    document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(a.href), 1000);
  }
  const r2 = (n) => Math.round((n || 0) * 100) / 100;

  function exportOrders(list, name) {
    const rows = [['Tarih', 'Saat', 'Sipariş No', 'Pazaryeri', 'Stok Kodu', 'Ürün', 'Adet', 'Satır Tutarı', 'Sipariş Tutarı']];
    for (const o of list) {
      const items = o.items?.length ? saleItems(o) : [{ sku: '', name: '', qty: o.qty, total: o.total }];
      items.forEach((it, i) => rows.push([trDate(o.date), o.time, o.no || o.id, mpLabel(o.mp), it.sku, it.name, it.qty, r2(it.total), i === 0 ? r2(amt(o)) : '']));
    }
    download(rows, name);
  }

  function exportProducts(list, name) {
    const prods = productRows(list);
    const keys = S.mpOrder;
    const rows = [['Stok Kodu', 'Ürün', 'Adet', 'Sipariş', 'Ort. Fiyat', 'Ciro', ...keys.map(mpLabel)]];
    for (const p of prods) rows.push([p.sku, p.name, p.qty, p.orderCount, r2(p.avgPrice), r2(p.total), ...keys.map((k) => r2(p.mps.get(k) || 0))]);
    download(rows, name);
  }

  function exportReturns(list, name) {
    const rows = [['Sipariş Tarihi', 'İade/İptal Tarihi', 'Sipariş No', 'Pazaryeri', 'Tür', 'Durum', 'Stok Kodu', 'Ürün', 'Adet', 'Satır Tutarı', 'Sipariş Tutarı', 'İade/İptal Tutarı']];
    for (const o of list) {
      const items = retItems(o).length ? retItems(o) : (o.items?.length ? o.items : [{ sku: '', name: '', qty: o.qty, total: o.total }]);
      items.forEach((it, i) => rows.push([trDate(o.date), o.changed ? trDate(o.changed) : '', o.no || o.id, mpLabel(o.mp), RET_TYPES[o.sg] || o.sg, o.status, it.sku, it.name, it.qty, r2(it.total),
        i === 0 ? r2(o.total) : '', i === 0 ? r2(retAmt(o)) : '']));
    }
    download(rows, name);
  }

  boot();
})();
