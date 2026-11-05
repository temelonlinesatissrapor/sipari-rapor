# Entegra Sipariş Raporları

Entegra'daki siparişleri **her gün otomatik** çeker ve pazaryeri bazında üç rapor ekranında gösterir:

- **Günlük** — seçilen günün cirosu, sipariş adedi, pazaryeri dağılımı, saatlik sipariş grafiği, en çok satanlar, son 14 gün ve günün tüm siparişleri
- **Aylık** — ay toplamları, geçen ayla karşılaştırma (içinde bulunulan ayda "geçen ayın aynı dönemi"), ay sonu tahmini, günlük grafik, pazaryeri performansı, sipariş durumları, gün gün özet tablo ve son 12 ay
- **Detaylı Rapor** — tarih aralığı, pazaryeri, durum ve metin aramasıyla filtreleme; ciro trendi, pazaryeri karşılaştırması (komisyon, kargo, net), ürün performansı, şehirler, haftanın günleri, sıralanabilir sipariş listesi ve Excel uyumlu CSV dışa aktarma

Her şey **GitHub üzerinde ücretsiz** çalışır: GitHub Actions siparişleri çeker, GitHub Pages rapor ekranını yayınlar. Sunucu kiralamanız gerekmez.

```
Entegra API ──(her gün 06:17 ve 15:17)──► GitHub Actions ──► docs/data/*.json (şifreli)
                                                              │
                                    Tarayıcı ◄── GitHub Pages ┘  (şifreyle açılır)
```

---

## Kurulum (yaklaşık 10 dakika)

### 1. Entegra API erişimi alın
Entegra destek ekibinden hesabınız için **API kullanıcısı** (e-posta + şifre) isteyin. Normal panel kullanıcınız API'de çalışmayabilir.

> Entegra'nın belgelerine göre API isteklerine yanıt verebilmesi için Entegra programının açık ve internete bağlı olması gerekebilir. İlk çekimde hata alırsanız bunu Entegra destek ile teyit edin.

### 2. Projeyi GitHub'a yükleyin
1. github.com'da **New repository** ile yeni bir repo açın (ör. `siparis-rapor`).
2. Bu klasördeki tüm dosyaları (gizli `.github` klasörü dahil) repoya yükleyin.
   - Web arayüzünden: **Add file → Upload files**, klasörün içeriğini sürükleyip bırakın.
3. `docs/data` klasöründeki **örnek verileri silin** (şifresi `demo`), ya da ilk gerçek çekimden önce silinmeleri için 6. adımı bekleyin.

### 3. Gizli bilgileri ekleyin
Repo → **Settings → Secrets and variables → Actions → New repository secret** ile üç kayıt ekleyin:

| Ad | Değer |
|---|---|
| `ENTEGRA_EMAIL` | Entegra API kullanıcı e-postası |
| `ENTEGRA_PASSWORD` | Entegra API şifresi |
| `DASHBOARD_PASSWORD` | Verileri şifreleyen ana şifre (güçlü bir şifre seçin) |
| `DASHBOARD_USERS` | (İsteğe bağlı) kişiye özel girişler — aşağıdaki **Kullanıcılar** bölümüne bakın |

Bu bilgiler GitHub'da şifreli saklanır, kodda ve kayıtlarda görünmez.

### 4. Yazma iznini açın
**Settings → Actions → General → Workflow permissions → Read and write permissions** seçip kaydedin.

### 5. GitHub Pages'i açın
**Settings → Pages → Source: Deploy from a branch → Branch: `main`, klasör: `/docs`** → Save.
Birkaç dakika sonra adresiniz görünür: `https://KULLANICI_ADINIZ.github.io/siparis-rapor/`

### 6. Geçmiş siparişleri yükleyin
1. `docs/data` içindeki örnek dosyaları silin (repo'da klasöre girip dosyaları silebilirsiniz).
2. **Actions → Siparişleri Çek → Run workflow** deyin.
3. **Başlangıç tarihi** kutusuna örneğin `2025-01-01` yazın, bitişi boş bırakın → Run.

Bundan sonra iş akışı **her gün 06:17 ve 15:17'de** son 7 günü yeniden çeker; yeni siparişler eklenir, durumu değişenler (kargo, iptal, iade) güncellenir.

---

## Güvenlik ve gizlilik

- Ücretsiz GitHub Pages için repo **herkese açık** olmalıdır. Bu yüzden:
  - Veri dosyaları `DASHBOARD_PASSWORD` ile **AES-256 şifrelenir**; şifreyi bilmeyen kimse ciro veya sipariş bilgilerini okuyamaz.
  - Müşteriden yalnızca **ad soyad** kaydedilir (aylık sipariş listesi için). **Telefon, e-posta, adres ve TC kimlik no kaydedilmez.** Bunun dışında sipariş no, pazaryeri, tarih, tutar, durum, ürünler, kargo firması ve şehir saklanır.
  - Müşteri adları da şifreli dosyalarda durduğu için `DASHBOARD_PASSWORD` en az 12 karakterli, tahmin edilemeyen bir şifre olmalıdır.
  - İş akışı kayıtlarına yalnızca alan **adları** yazılır, değerler yazılmaz.
- Rapor şifresini değiştirirseniz eski dosyalar açılamaz: `docs/data` içini silip 6. adımdaki geçmiş yüklemeyi tekrarlayın.
- Rapor ekranında "Bu cihazda hatırla" işaretlenirse şifre o tarayıcıda saklanır; ortak bilgisayarda işaretlemeyin. Sağ üstteki kilit simgesi şifreyi unutturur.

## Kullanıcılar

Herkesin kendi kullanıcı adı ve şifresiyle girmesi için **Settings → Secrets and variables → Actions** bölümüne `DASHBOARD_USERS` adında bir secret ekleyin. Her satıra bir kullanıcı yazın:

```
ahmet:Ahmet-Guclu-Sifre-1
ayse:Baska.Bir.Sifre.2026
muhasebe:Muhasebe-Raporu-77
```

- Kullanıcı adıyla şifre arasında `:` olur. Şifre en az 8 karakter olmalıdır (12+ önerilir).
- Kullanıcı adında büyük/küçük harf farkı önemli değildir.
- Liste değişince **Actions → Siparişleri Çek → Run workflow** ile bir kez çalıştırın; değişiklik o anda geçerli olur. Çalıştırmazsanız bir sonraki otomatik çekimde (06:17 / 15:17) geçerli olur.
- Listeden silinen kişi, "bu cihazda hatırla" demiş olsa bile artık giriş yapamaz.
- `DASHBOARD_USERS` tanımlıyken rapor şifresi (`DASHBOARD_PASSWORD`) tek başına giriş için kullanılamaz; yalnızca verileri şifreleyen ana anahtar olarak kalır. Kendinizi de listeye ekleyin.
- Kullanıcı adları ve şifreler repodaki dosyalarda ve Actions kayıtlarında açık halde görünmez.
- Ayrılan bir çalışanın erişimini **kesin** kapatmak için ayrıca `DASHBOARD_PASSWORD`'ü değiştirin, `docs/data` klasöründeki ay dosyalarını silin ve geçmişi yeniden çekin. (Teknik bilgisi olan biri giriş yaptığı sırada ana anahtarı tarayıcıdan alıp saklamış olabilir.)

## Geçmiş yıl karşılaştırması

**Karşılaştırma** ekranı, geçmiş bir yılın aylık özetini bu yılın Entegra siparişleriyle ay ay karşılaştırır.

1. Rapor ekranında **Karşılaştırma → Geçmiş yıl ekle** deyin ve aylık özet Excel'inizi seçin. Dosya yalnızca tarayıcıda okunur.
2. Önizlemedeki rakamları Excel'le kontrol edip **Şifreli dosyayı indir** deyin.
3. İnen `gecmis.json` dosyasını GitHub'da `docs/data` klasörüne yükleyin.

- **Excel'i GitHub'a doğrudan yüklemeyin**; repo herkese açıktır. `gecmis.json` ise rapor verileriyle aynı şifreyle şifrelidir.
- Yeni bir yıl eklediğinizde önceki yıllar dosyada korunur; aynı yılı tekrar eklerseniz yeni hali kullanılır.
- Excel'de ay adları (Ocak … Aralık) bir sütunda alt alta, ölçü başlığı (Satış tutarı, İade, Komisyon…) ay adlarının üstünde olmalıdır. 2024 dosyasındaki düzen bu şekildedir.
- `DASHBOARD_PASSWORD` değişirse `gecmis.json` açılamaz; Excel'i aynı adımlarla yeniden ekleyin.

## Alan eşleştirme (gerekirse)

Entegra hesaplarında alan adları farklılık gösterebilir. İlk çalıştırmada Actions kaydında şu satırları göreceksiniz:

```
Örnek sipariş alanları: id, order_id, supplier, order_date, status, ...
Örnek ürün satırı alanları: product_code, product_name, quantity, price, ...
```

Ekranda tutar, pazaryeri veya durum yanlış görünürse `scripts/config.mjs` dosyasında ilgili listeye bu adları ekleyin (ör. ciro alanınız `toplam_tutar` ise `total: ['toplam_tutar', ...]`). Aynı dosyada:

- `MARKETPLACES` — pazaryeri adlarının nasıl tanınacağı
- `STATUS_GROUPS` — Entegra durumlarının İptal / İade / Kargoda / Teslim gruplarına dağılımı
- `ITEM_PRICE_EXCLUDES_VAT` — ürün fiyatı KDV hariç mi geliyor (Entegra belgelerine göre evet)
- `DEFAULT_LOOKBACK_DAYS` — her çalışmada kaç gün geriye gidileceği

## Saat değişikliği

`.github/workflows/siparisleri-cek.yml` içindeki `cron` satırları UTC saatidir (Türkiye = UTC+3). Örneğin 09:00 TR için `0 6 * * *`.

## Yerelde deneme

Node.js 20+ ile:

```bash
node scripts/demo-data.mjs            # örnek veri üretir (şifre: demo)
cd docs && python3 -m http.server     # http://localhost:8000
```

Gerçek çekim:

```bash
ENTEGRA_EMAIL=... ENTEGRA_PASSWORD=... DASHBOARD_PASSWORD=... \
START_DATE=2026-10-01 node scripts/fetch-orders.mjs
```

## Sık karşılaşılan sorunlar

| Belirti | Çözüm |
|---|---|
| `Entegra girişi başarısız (HTTP 401)` | API kullanıcı bilgileri yanlış veya API yetkisi açık değil |
| `HTTP 500` / zaman aşımı | Entegra programı kapalı olabilir; betik 3 kez tekrar dener |
| `çözülemedi: DASHBOARD_PASSWORD değişmiş olabilir` | `docs/data` içini silip geçmişi yeniden yükleyin |
| `Permission denied` / push hatası | 4. adımdaki yazma iznini açın |
| Ekranda "X gündür güncellenmedi" uyarısı | Actions sekmesinde son çalışmanın hatasına bakın |
| İş akışı kendiliğinden durdu | GitHub, 60 gün boyunca hiç commit olmayan repolarda zamanlanmış görevleri durdurabilir; Actions sekmesinden yeniden etkinleştirin |
