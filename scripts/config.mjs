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
export const FIELDS = {
  id: ['id', 'order_id', 'entegra_id'],
  orderNo: ['order_id', 'order_number', 'order_no', 'id'],
  marketplace: ['supplier', 'store', 'marketplace', 'platform', 'source'],
  date: ['order_date', 'datetime', 'created_at', 'date'],
  status: ['status_name', 'status_text', 'status', 'order_status'],
  total: ['total', 'grand_total', 'total_price', 'order_total', 'amount'],
  cargoPrice: ['cargo_price', 'shipping_price', 'cargo_amount'],
  commission: ['commission', 'commission_amount', 'total_commission'],
  discount: ['discount', 'total_discount'],
  cargo: ['cargo', 'cargo_company', 'shipping_company'],
  city: ['ship_city', 'invoice_city', 'city'],
  items: ['order_details', 'products', 'items', 'lines'],
};

export const ITEM_FIELDS = {
  sku: ['product_code', 'sku', 'stock_code', 'barcode'],
  name: ['product_name', 'name', 'title'],
  quantity: ['quantity', 'qty', 'amount'],
  price: ['price', 'unit_price', 'sale_price'],
  firstPrice: ['first_price', 'list_price'],
  vat: ['vat', 'kdv', 'tax_rate'],
  commission: ['commission', 'commission_amount'],
};

// Entegra "price" alanını KDV hariç gönderiyor. Satır tutarı hesaplanırken
// KDV eklensin mi? (Sipariş üzerinde toplam alanı varsa o kullanılır.)
export const ITEM_PRICE_EXCLUDES_VAT = true;
export const DEFAULT_VAT = 20;

// Durum metnine göre gruplama (küçük harfle aranır)
export const STATUS_GROUPS = [
  { key: 'iptal', label: 'İptal', match: ['iptal', 'cancel', 'tedarik edilemedi', 'unsupplied'] },
  { key: 'iade', label: 'İade', match: ['iade', 'return', 'refund', 'claim'] },
  { key: 'teslim', label: 'Teslim Edildi', match: ['teslim', 'deliver', 'tamamlan', 'complete'] },
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
  { key: 'eticaret', label: 'E-Ticaret Sitesi', match: ['site', 'eticaret', 'e-ticaret', 'web', 'woocommerce', 'ideasoft', 'ticimax', 'opencart', 'shopify'] },
];
