/**
 * Big5 - Merkezi Yapılandırma ve Bulut Senkronizasyon Ayarları
 * 
 * Bu dosya:
 * 1. Puanların tüm cihazlarda aynı ve kalıcı olmasını,
 * 2. Yeni eklenen kişilerin ve fotoğrafların diğer tüm cihazlara anında yansımasını sağlar.
 */

window.BIG5_CONFIG = {
  // Global Sıfırlama Sürümü:
  // Bu sürüm değiştikçe eski yerel önbellekler otomatik sıfırlanır.
  GLOBAL_DATA_VERSION: 'v3_global_reset_20261123_live',

  // Merkezi Veritabanı (Backend) Ayarları
  cloud: {
    enabled: true,

    // 'rest_api' (Anında hazır, kurulumsuz) veya 'firebase' (Kendi Firebase projeniz)
    provider: 'rest_api',

    // Canlı Merkezi REST Uç Noktaları (Cihazlar arası anında senkronize):
    endpoints: {
      kizlar: 'https://api.restful-api.dev/objects/ff808181a09d98f701a2085d5798265a',
      erkekler: 'https://api.restful-api.dev/objects/ff808181a09d98f701a2085d8655265c'
    },

    // Kendi Firebase Realtime Database projenizi bağlamak isterseniz (Opsiyonel):
    // Örnek: 'https://proje-adiniz-default-rtdb.firebaseio.com'
    firebaseUrl: '',

    // Kendi Supabase projenizi bağlamak isterseniz (Opsiyonel):
    supabase: {
      url: '',
      anonKey: ''
    }
  }
};
