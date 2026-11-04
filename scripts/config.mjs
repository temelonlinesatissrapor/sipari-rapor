// Proje ayarları. Entegra'dan gelen alan adları hesabınızda farklıysa
// buradaki listelere ekleme yapmanız yeterli; kodun geri kalanına dokunmanız gerekmez.

export const ENTEGRA = {
  baseUrl: process.env.ENTEGRA_BASE_URL || 'https://apiv2.entegrabilisim.com',
  tokenPath: '/api/user/token/obtain/',
  // {page}, {start}, {end} yer tutucuları doldurulur.
  ordersPath: '/order/page={page}/?start_date={start}&end_date={end}',
  maxPages: 500,
  pageDelayMs: 400,
};

// Her çalışmada kaç gün geriye gidilsin? Siparişlerin durumu (kargo, iptal, iade)
// sonradan değiştiği için son birkaç gün yeniden çekilip güncellenir.
export const DEFAULT_LOOKBACK_DAYS = Number(process.env.LOOKBACK_DAYS || 7);

// Raporlarda kullanılan saat dilimi
export const TIMEZONE = 'Europe/Istanbul';

// Entegra'dan gelen ham alan adı adayları (ilk dolu olan kullanılır)
// (Entegra'nın gerçek sipariş yanıtına göre düzenlendi — Kasım 2026)
export const FIELDS = {
  id: ['id', 'order_id', 'entegra_id'],
  orderNo: ['order_number', 'platform_reference_no', 'supplier_order_id', 'no', 'order_id', 'id'],
  marketplace: ['supplier', 'store', 'marketplace', 'platform', 'source'],
  date: ['datetime', 'order_date', 'date_add', 'created_at', 'date'],
  status: ['store_order_status_name', 'store_order_status', 'status_name', 'status_text', 'status', 'order_status'],
  total: ['grand_total', 'total_paid_price', 'total', 'total_price', 'order_total', 'amount'],
  cargoPrice: ['cargo_cost', 'mut_kargo', 'cargo_price', 'shipping_price', 'cargo_amount'],
  commission: ['total_commission_include_tax', 'commission', 'commission_amount', 'total_commission'],
  discount: ['discount', 'coupon_price', 'total_discount'],
  cargo: ['cargo_company', 'cargo', 'shipping_company'],
  city: ['ship_city', 'invoice_city', 'city'],
  items: ['order_product', 'order_products', 'order_details', 'products', 'items', 'lines'],
  changed: ['date_change', 'updated_at', 'last_update'], // iade/iptal tarihini yaklaşık göstermek için
};

export const ITEM_FIELDS = {
  sku: ['model', 'product_code', 'productCode', 'store_stock_code', 'stock_code', 'sku', 'barcode', 'product_id'],
  name: ['name', 'product_name', 'productName', 'title', 'product_title'],
  quantity: ['quantity', 'qty', 'piece', 'adet'],
  priceInclTax: ['priceIncludedTax', 'price_include_tax'], // KDV dahil birim fiyat (varsa öncelikli)
  price: ['price', 'unit_price', 'sale_price'],
  firstPrice: ['first_price', 'list_price'],
  vat: ['vat', 'kdv', 'tax_rate', 'vat_rate'], // oran (%); Entegra'nın "tax" alanı tutar olabileceği için kullanılmaz
  commission: ['commission', 'commission_amount', 'commission_include_tax'],
  status: ['store_order_status_name', 'status_name', 'store_order_status'], // ürün satırının kendi durumu
};

// Entegra "price" alanını KDV hariç gönderiyor. Satır tutarı hesaplanırken
// KDV eklensin mi? (Sipariş üzerinde toplam alanı varsa o kullanılır.)
export const ITEM_PRICE_EXCLUDES_VAT = true;
export const DEFAULT_VAT = 20;

// Durum metnine göre gruplama (küçük harfle aranır)
export const STATUS_GROUPS = [
  { key: 'kismi', label: 'Kısmi İade', match: ['kısmi', 'kismi', 'partial'] },
  { key: 'iptal', label: 'İptal', match: ['iptal', 'cancel', 'tedarik edilemedi', 'unsupplied'] },
  { key: 'iade', label: 'İade', match: ['iade', 'return', 'refund', 'claim', 'undeliver', 'teslim edilemedi', 'ulaştırılamadı'] },
  { key: 'teslim', label: 'Teslim Edildi', match: ['teslim', 'deliver', 'tamamlan', 'complete'] },
  // "Kargoya Verilecek", "Kargoya Hazır" henüz gönderilmemiş siparişlerdir; "kargo" kuralından önce yakalanır
  { key: 'yeni', label: 'Yeni / Hazırlanıyor', match: ['verilecek', 'hazır', 'hazirlan', 'hazırlan', 'yeni', 'onay', 'paketlen', 'created', 'picking'] },
  { key: 'kargo', label: 'Kargoda', match: ['kargo', 'ship', 'gönderil', 'yolda'] },
  { key: 'yeni', label: 'Yeni / Hazırlanıyor', match: [] }, // varsayılan grup
];

// Pazaryeri adlarını tek tipe indirger (supplier değeri küçük harfle aranır)
export const MARKETPLACES = [
  { key: 'trendyol', label: 'Trendyol', match: ['trendyol'] },
  { key: 'hepsiburada', label: 'Hepsiburada', match: ['hepsiburada', 'hb'] },
  { key: 'n11', label: 'N11', match: ['n11'] },
  { key: 'amazon', label: 'Amazon', match: ['amazon'] },
  { key: 'ciceksepeti', label: 'Çiçeksepeti', match: ['ciceksepeti', 'çiçeksepeti', 'cicek'] },
  { key: 'pttavm', label: 'PttAVM', match: ['ptt'] },
  { key: 'pazarama', label: 'Pazarama', match: ['pazarama'] },
  { key: 'idefix', label: 'İdefix', match: ['idefix'] },
  { key: 'koctas', label: 'Koçtaş', match: ['koctas', 'koçtaş'] },
  { key: 'teknosa', label: 'Teknosa', match: ['teknosa'] },
  { key: 'modanisa', label: 'Modanisa', match: ['modanisa'] },
  { key: 'passo', label: 'Passo', match: ['passo'] },
  { key: 'eticaret', label: 'E-Ticaret Sitesi', match: ['site', 'eticaret', 'e-ticaret', 'web', 'woocommerce', 'ideasoft', 'ticimax', 'opencart', 'shopify'] },
];
