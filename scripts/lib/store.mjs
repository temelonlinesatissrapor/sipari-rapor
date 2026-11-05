// Aylık veri dosyalarını okur/yazar. DASHBOARD_PASSWORD tanımlıysa dosyalar
// AES-GCM ile şifrelenir; rapor ekranı aynı şifreyle tarayıcıda çözer.
// Böylece repo herkese açık olsa bile sipariş verileriniz okunamaz.
import { readFile, writeFile, mkdir, readdir } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';

const { subtle } = globalThis.crypto;
const ITERATIONS = 250000;

const b64 = (buf) => Buffer.from(buf).toString('base64');
const unb64 = (s) => new Uint8Array(Buffer.from(s, 'base64'));

async function deriveKey(password, salt) {
  const base = await subtle.importKey('raw', new TextEncoder().encode(password), 'PBKDF2', false, ['deriveKey']);
  return subtle.deriveKey(
    { name: 'PBKDF2', salt, iterations: ITERATIONS, hash: 'SHA-256' },
    base,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt'],
  );
}

export async function encryptJson(obj, password) {
  const salt = globalThis.crypto.getRandomValues(new Uint8Array(16));
  const iv = globalThis.crypto.getRandomValues(new Uint8Array(12));
  const key = await deriveKey(password, salt);
  const data = await subtle.encrypt({ name: 'AES-GCM', iv }, key, new TextEncoder().encode(JSON.stringify(obj)));
  return { v: 1, alg: 'AES-GCM/PBKDF2-SHA256', iterations: ITERATIONS, salt: b64(salt), iv: b64(iv), data: b64(data) };
}

export async function decryptJson(env, password) {
  const key = await deriveKey(password, unb64(env.salt));
  const plain = await subtle.decrypt({ name: 'AES-GCM', iv: unb64(env.iv) }, key, unb64(env.data));
  return JSON.parse(new TextDecoder().decode(plain));
}

export class Store {
  constructor(dir, password) {
    this.dir = dir;
    this.password = password || '';
    this.readable = new Map(); // ay → mevcut şifreyle açılabiliyor mu (tekrar tekrar çözmemek için)
  }

  file(month) {
    return path.join(this.dir, `${month}.json`);
  }

  async readMonth(month) {
    const f = this.file(month);
    if (!existsSync(f)) return [];
    const raw = JSON.parse(await readFile(f, 'utf8'));
    if (raw && raw.alg) {
      if (!this.password) throw new Error(`${month}.json şifreli ama DASHBOARD_PASSWORD tanımlı değil.`);
      try {
        const orders = (await decryptJson(raw, this.password)).orders || [];
        this.readable.set(month, true);
        return orders;
      } catch {
        throw Object.assign(new Error(`${month}.json çözülemedi: DASHBOARD_PASSWORD değişmiş olabilir.`), { code: 'DECRYPT' });
      }
    }
    return raw.orders || [];
  }

  async writeMonth(month, orders) {
    await mkdir(this.dir, { recursive: true });
    const payload = { month, orders };
    const out = this.password ? await encryptJson(payload, this.password) : payload;
    this.readable.set(month, true);
    await writeFile(this.file(month), JSON.stringify(out));
  }

  async months() {
    if (!existsSync(this.dir)) return [];
    return (await readdir(this.dir))
      .filter((f) => /^\d{4}-\d{2}\.json$/.test(f))
      .map((f) => f.slice(0, 7))
      .sort();
  }

  // Yalnızca mevcut şifreyle açılabilen aylar rapora alınır; açılamayanlar (eski şifreyle kaydedilmiş) listelenir
  async readableMonths() {
    const ok = [];
    const stale = [];
    for (const m of await this.months()) {
      if (this.readable.get(m)) { ok.push(m); continue; }
      try { await this.readMonth(m); ok.push(m); } catch (e) { if (e.code === 'DECRYPT') stale.push(m); else throw e; }
    }
    return { ok, stale };
  }

  async writeManifest(extra = {}) {
    const { ok, stale } = await this.readableMonths();
    const manifest = {
      updatedAt: new Date().toISOString(),
      encrypted: Boolean(this.password),
      months: ok,
      ...(stale.length ? { staleMonths: stale } : {}),
      ...extra,
    };
    await writeFile(path.join(this.dir, 'manifest.json'), JSON.stringify(manifest, null, 2));
    return manifest;
  }
}
