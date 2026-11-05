// Kullanıcı listesi: GitHub Secrets'taki DASHBOARD_USERS'tan docs/data/users.json üretir.
//
// DASHBOARD_USERS biçimi (her satıra bir kullanıcı):
//   ahmet:Gizli-Sifre-123
//   ayse:BaskaBirSifre!45
//
// Veriler tek bir ana anahtarla (DASHBOARD_PASSWORD) şifrelenir. users.json'da her kullanıcı için
// bu ana anahtar, o kullanıcının kendi adı+şifresinden türetilen anahtarla ayrıca şifrelenip saklanır.
// Kullanıcı adları ve şifreler dosyada ve kayıtlarda (log) açık halde BULUNMAZ.
import { writeFile, mkdir } from 'node:fs/promises';
import path from 'node:path';
import { encryptJson } from './store.mjs';

const MIN_PASSWORD = 8;

export const normUser = (u) => String(u || '').trim().toLocaleLowerCase('tr-TR');

export async function userId(username) {
  const data = new TextEncoder().encode(`siparis-rapor:${normUser(username)}`);
  const hash = await globalThis.crypto.subtle.digest('SHA-256', data);
  return Buffer.from(hash).toString('hex').slice(0, 32);
}

export function parseUsers(text) {
  const users = [];
  const problems = [];
  const seen = new Set();
  String(text || '').split(/\r?\n/).forEach((line, i) => {
    const s = line.trim();
    if (!s || s.startsWith('#')) return;
    const at = s.indexOf(':');
    if (at < 1) { problems.push(`${i + 1}. satır "ad:şifre" biçiminde değil`); return; }
    const name = s.slice(0, at).trim();
    const pass = s.slice(at + 1);
    if (pass.length < MIN_PASSWORD) { problems.push(`${i + 1}. satırdaki kullanıcının şifresi ${MIN_PASSWORD} karakterden kısa, atlandı`); return; }
    const key = normUser(name);
    if (seen.has(key)) { problems.push(`${i + 1}. satırdaki kullanıcı adı daha önce yazılmış, bu satır atlandı`); return; }
    seen.add(key);
    users.push({ name, pass });
  });
  return { users, problems };
}

// users.json'ı yazar. Kullanıcı listesi boşsa dosyayı "kapalı" olarak yazar (tek şifre ile giriş).
export async function writeUsers(dataDir, usersText, masterPassword, log = console.log) {
  await mkdir(dataDir, { recursive: true });
  const file = path.join(dataDir, 'users.json');
  const { users, problems } = parseUsers(usersText);
  problems.forEach((p) => log(`  ⚠ Kullanıcı listesi: ${p}`));
  if (!users.length) {
    await writeFile(file, JSON.stringify({ v: 1, enabled: false }));
    return 0;
  }
  if (!masterPassword) throw new Error('Kullanıcı tanımlamak için DASHBOARD_PASSWORD da tanımlı olmalı.');
  const entries = {};
  for (const u of users) {
    // Anahtar, kullanıcı adı + şifreden türetilir; böylece aynı şifreyi kullanan iki kişi farklı kayıt üretir
    entries[await userId(u.name)] = await encryptJson({ k: masterPassword, n: u.name }, `${normUser(u.name)}\n${u.pass}`);
  }
  await writeFile(file, JSON.stringify({ v: 1, enabled: true, users: entries }));
  return users.length;
}
