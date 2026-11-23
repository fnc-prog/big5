/**
 * Big5 - Merkezi Yapılandırma ve Bulut Senkronizasyon Ayarları
 * 
 * Bu dosya cihazlar arası ortak/kalıcı veri senkronizasyonunu ve
 * global sıfırlama (Global Reset) sürümünü yönetir.
 */

window.BIG5_CONFIG = {
  // Global Sıfırlama Sürümü:
  // Bu sürüm değiştiğinde tüm cihaz ve tarayıcılardaki eski yerel puanlar
  // otomatik olarak sıfırlanır ve herkes sıfırdan başlar.
  GLOBAL_DATA_VERSION: 'v2_global_reset_20261123',

  // Merkezi Veritabanı / Bulut Senkronizasyon Ayarları:
  // Cihazlar arası puanların ve yeni kişilerin canlı senkronize olması için
  // Firebase Realtime Database veya uyumlu bir REST API kullanılır.
  cloud: {
    // Bulut senkronizasyonu aktif mi? (true: cihazlar arası ortak, false: sadece yerel)
    enabled: true,

    // Sağlayıcı tipi: 'firebase_rtdb' veya 'custom_rest'
    // Firebase Realtime Database en basit, ücretsiz ve sunucusuz çözümdür.
    provider: 'firebase_rtdb',

    // Firebase Realtime Database URL'niz:
    // Örnek: https://proje-adiniz-default-rtdb.firebaseio.com
    // (Firebase Console -> Realtime Database -> Data sekmesindeki URL)
    firebaseUrl: 'https://big5-rating-sync-default-rtdb.firebaseio.com',

    // Özel bir REST API kullanmak isterseniz (Opsiyonel):
    // Örnek: https://api.prensesperver.com/big5
    customApiUrl: ''
  }
};
