/**
 * Big5 Puanlama Uygulaması
 * Big5 Kızlar & Big5 Erkekler 15 Puan Değerlendirme & Çoklu Tur Sistemi
 * 
 * Özellikler:
 * - Merkezi Bulut Senkronizasyonu (Cihazlar ve Tarayıcılar Arası Ortak Veri & Kalıcı Puanlama)
 * - Global Puan Sıfırlama (Tüm cihazlarda eski puanları temizleme)
 * - 0-15 Puanlama + 'E' Harfi (0 Puan) + 'Y' Harfi (0 Puan)
 * - MVP Seçimi: Tur başına 1 adaya +1 bonus puan (⭐)
 * - Big No Seçimi: Tur başına 1 adaya -1 ceza puanı (🚫, MVP'nin tam tersi)
 * - Dinamik Aday Sistemi (Yeni kişi eklendiğinde tüm cihazlara anında yansıma)
 */

const DB_NAME = 'Big5_PhotoRatingDB';
const DB_VERSION = 2; // Sürüm artırılarak eski yerel şema güncellendi
const STORE_NAME = 'categories';

class Database {
  static open() {
    return new Promise((resolve, reject) => {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = (e) => {
        const db = e.target.result;
        if (!db.objectStoreNames.contains(STORE_NAME)) {
          db.createObjectStore(STORE_NAME, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }

  static async getCategory(id) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readonly');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.get(id);
      request.onsuccess = () => resolve(request.result || null);
      request.onerror = () => reject(request.error);
    });
  }

  static async saveCategory(categoryData) {
    const db = await this.open();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(STORE_NAME, 'readwrite');
      const store = transaction.objectStore(STORE_NAME);
      const request = store.put(categoryData);
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => reject(request.error);
    });
  }
}

/**
 * CloudSync - Merkezi Veritabanı ve Cihazlar Arası Senkronizasyon Servisi
 */
class CloudSync {
  static getConfig() {
    return window.BIG5_CONFIG ? window.BIG5_CONFIG.cloud : { enabled: false };
  }

  static getEndpoint(catId) {
    const cfg = this.getConfig();
    if (!cfg || !cfg.enabled) return null;
    if (cfg.provider === 'firebase_rtdb' && cfg.firebaseUrl) {
      const base = cfg.firebaseUrl.replace(/\/+$/, '');
      return `${base}/big5/categories/${catId}.json`;
    }
    if (cfg.customApiUrl) {
      const base = cfg.customApiUrl.replace(/\/+$/, '');
      return `${base}/categories/${catId}`;
    }
    return null;
  }

  static updateStatusIndicator(status) {
    const el = document.getElementById('cloud-sync-status');
    if (!el) return;
    if (status === 'syncing') {
      el.className = 'text-[11px] px-2 py-0.5 rounded-full bg-amber-500/15 text-amber-300 border border-amber-500/30 font-medium flex items-center gap-1.5';
      el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span> Bulut Senkronize Ediliyor...';
    } else if (status === 'synced') {
      el.className = 'text-[11px] px-2 py-0.5 rounded-full bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 font-medium flex items-center gap-1.5';
      el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-emerald-400"></span> Ortak Bulut Aktif';
    } else if (status === 'error' || status === 'offline') {
      el.className = 'text-[11px] px-2 py-0.5 rounded-full bg-slate-800 text-slate-400 border border-slate-700 font-medium flex items-center gap-1.5';
      el.innerHTML = '<span class="w-1.5 h-1.5 rounded-full bg-slate-500"></span> Yerel Mod';
    }
  }

  static async fetchCategory(catId) {
    const endpoint = this.getEndpoint(catId);
    if (!endpoint) return null;
    try {
      this.updateStatusIndicator('syncing');
      const res = await fetch(endpoint, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      const data = await res.json();
      this.updateStatusIndicator('synced');
      return data;
    } catch (err) {
      console.warn(`[CloudSync] ${catId} verisi buluttan çekilemedi, yerel veri kullanılacak:`, err);
      this.updateStatusIndicator('offline');
      return null;
    }
  }

  static async pushCategory(categoryData) {
    const endpoint = this.getEndpoint(categoryData.id);
    if (!endpoint) return false;
    try {
      this.updateStatusIndicator('syncing');
      const res = await fetch(endpoint, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(categoryData)
      });
      if (!res.ok) throw new Error(`HTTP error ${res.status}`);
      this.updateStatusIndicator('synced');
      return true;
    } catch (err) {
      console.warn(`[CloudSync] ${categoryData.id} verisi buluta yazılamadı:`, err);
      this.updateStatusIndicator('offline');
      return false;
    }
  }
}

class Big5App {
  constructor() {
    this.currentCategory = null; // 'kizlar' | 'erkekler'
    this.categoryData = null;
    this.currentRound = 1;
    this.tempScores = [];
    this.tempSpecialCodes = []; // 'E' | 'Y' | null
    this.mvpIndex = null;
    this.bigNoIndex = null;
    this.isSyncing = false;
  }

  async init() {
    await this.handleGlobalReset();
    await this.ensureInitialData();
    await this.updateHomeStatuses();
    this.setupAutoSync();
  }

  /**
   * 1. Tüm Mevcut Puanları Sıfırla (Global Reset)
   * GLOBAL_DATA_VERSION değiştiğinde tüm cihazlarda eski puanları tamamen temizler.
   */
  async handleGlobalReset() {
    const requiredVersion = window.BIG5_CONFIG ? window.BIG5_CONFIG.GLOBAL_DATA_VERSION : 'v2_global_reset_20261123';
    const currentVersion = localStorage.getItem('big5_global_reset_version');

    if (currentVersion !== requiredVersion) {
      console.log('[Big5] Global sıfırlama uygulanıyor... Tüm eski puanlar sıfırlanıyor.');
      for (const catId of ['kizlar', 'erkekler']) {
        let localData = await Database.getCategory(catId);
        if (localData && localData.photos) {
          localData.photos.forEach(p => {
            p.scores = [];
            p.mvpCount = 0;
            p.bigNoCount = 0;
          });
          localData.roundsCount = 0;
          localData.lastUpdated = new Date().toISOString();
          await Database.saveCategory(localData);
          await CloudSync.pushCategory(localData);
        }
      }
      localStorage.setItem('big5_global_reset_version', requiredVersion);
      this.showToast('Tüm puanlar merkezi olarak sıfırlandı. 1. Turdan başlayabilirsiniz.');
    }
  }

  /**
   * 2 & 3. Kalıcı ve Cihazlar Arası Ortak Veri & Yeni Kişi Eklemenin Tüm Cihazlarda Görünmesi
   */
  async ensureInitialData() {
    for (const catId of ['kizlar', 'erkekler']) {
      let localData = await Database.getCategory(catId);
      const sharedList = (window.BIG5_SHARED_DATA && window.BIG5_SHARED_DATA[catId]) ? window.BIG5_SHARED_DATA[catId] : [];
      
      // Buluttan merkezi veriyi çekmeyi dene
      const cloudData = await CloudSync.fetchCategory(catId);

      let finalData = null;

      if (cloudData && cloudData.photos && cloudData.photos.length > 0) {
        // Buluttaki veri geçerliyse öncelik buluttadır (cihazlar arası paylaşım)
        finalData = cloudData;

        // Yerel photos.js'te yeni eklenmiş kişi varsa ve bulutta yoksa buluta ekle
        let addedNew = false;
        if (sharedList.length > finalData.photos.length) {
          for (let i = finalData.photos.length; i < sharedList.length; i++) {
            const sh = sharedList[i];
            finalData.photos.push({
              id: `${catId}_photo_${i + 1}`,
              slot: i + 1,
              name: sh.name || `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`,
              dataUrl: sh.dataUrl || null,
              scores: [],
              mvpCount: 0,
              bigNoCount: 0
            });
            addedNew = true;
          }
        }
        if (addedNew) {
          finalData.lastUpdated = new Date().toISOString();
          await CloudSync.pushCategory(finalData);
        }
        await Database.saveCategory(finalData);
      } else if (localData && localData.photos) {
        finalData = localData;
        // Bulut boşsa yerel veriyi buluta ilk seed olarak gönder
        await CloudSync.pushCategory(finalData);
      } else {
        // İlk başlangıç oluşturma
        const targetCount = Math.max(16, sharedList.length);
        finalData = {
          id: catId,
          name: catId === 'kizlar' ? 'Big5 Kızlar' : 'Big5 Erkekler',
          photos: Array.from({ length: targetCount }, (_, i) => {
            const shared = sharedList[i];
            return {
              id: `${catId}_photo_${i + 1}`,
              slot: i + 1,
              name: (shared && shared.name) ? shared.name : `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`,
              dataUrl: (shared && shared.dataUrl) ? shared.dataUrl : null,
              scores: [],
              mvpCount: 0,
              bigNoCount: 0
            };
          }),
          roundsCount: 0,
          lastUpdated: new Date().toISOString()
        };
        await Database.saveCategory(finalData);
        await CloudSync.pushCategory(finalData);
      }
    }
  }

  setupAutoSync() {
    // Sayfa tekrar aktif olduğunda veya odaklandığında buluttan en güncel puanları çek
    window.addEventListener('focus', () => this.syncFromCloudSilently());
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) this.syncFromCloudSilently();
    });

    // 25 saniyede bir periyodik arka plan senkronizasyonu
    setInterval(() => {
      if (!document.hidden) this.syncFromCloudSilently();
    }, 25000);
  }

  async syncFromCloudSilently() {
    if (!this.currentCategory || this.isSyncing) return;
    this.isSyncing = true;
    try {
      const cloudData = await CloudSync.fetchCategory(this.currentCategory);
      if (cloudData && cloudData.lastUpdated && this.categoryData) {
        if (cloudData.lastUpdated !== this.categoryData.lastUpdated || cloudData.photos.length !== this.categoryData.photos.length) {
          this.categoryData = cloudData;
          await Database.saveCategory(cloudData);
          if (document.getElementById('view-results') && !document.getElementById('view-results').classList.contains('hidden')) {
            this.showResults();
          } else if (document.getElementById('view-rating') && !document.getElementById('view-rating').classList.contains('hidden')) {
            this.renderRatingPhotos();
            this.updateProgress();
          }
          await this.updateHomeStatuses();
        }
      }
    } catch (e) {
      console.warn('Silent sync error:', e);
    } finally {
      this.isSyncing = false;
    }
  }

  async updateHomeStatuses() {
    for (const catId of ['kizlar', 'erkekler']) {
      const data = await Database.getCategory(catId);
      const el = document.getElementById(`home-${catId}-status`);
      if (el && data) {
        const count = data.photos.filter(p => !!p.dataUrl).length;
        const total = data.photos.length;
        const rounds = data.roundsCount || 0;
        if (rounds > 0) {
          el.textContent = `${count}/${total} Fotoğraf • ${rounds} Tur Puanlandı`;
        } else {
          el.textContent = `${count}/${total} Fotoğraf Hazır`;
        }
      }
    }
  }

  async selectCategory(catId) {
    this.currentCategory = catId;

    // Kategori seçildiğinde buluttaki en güncel veriyi çek
    const cloudData = await CloudSync.fetchCategory(catId);
    if (cloudData && cloudData.photos) {
      this.categoryData = cloudData;
      await Database.saveCategory(cloudData);
    } else {
      this.categoryData = await Database.getCategory(catId);
    }

    const isGirls = catId === 'kizlar';
    document.getElementById('nav-brand-title').textContent = isGirls ? 'Big5 Kızlar Puanlama' : 'Big5 Erkekler Puanlama';
    document.getElementById('category-page-title').textContent = isGirls ? 'Big5 Kızlar Puanlama' : 'Big5 Erkekler Puanlama';
    document.getElementById('results-page-title').textContent = isGirls ? 'Big5 Kızlar Puan Listesi' : 'Big5 Erkekler Puan Listesi';
    
    document.getElementById('btn-back-home').classList.remove('hidden');
    document.getElementById('view-home').classList.add('hidden');

    const hasRounds = (this.categoryData.roundsCount || 0) > 0;
    if (hasRounds) {
      this.showResults();
    } else {
      this.currentRound = 1;
      this.initTempScores(false);
      this.showRating();
    }
  }

  initTempScores(useLastRound = false) {
    if (!this.categoryData) return;
    const len = this.categoryData.photos.length;
    this.tempScores = new Array(len).fill(null);
    this.tempSpecialCodes = new Array(len).fill(null); // 'E' veya 'Y'
    this.mvpIndex = null;
    this.bigNoIndex = null;

    if (useLastRound) {
      this.categoryData.photos.forEach((p, idx) => {
        if (p.scores && p.scores.length > 0) {
          this.tempScores[idx] = p.scores[p.scores.length - 1];
        }
      });
    }
  }

  showRating() {
    document.getElementById('view-results').classList.add('hidden');
    document.getElementById('view-rating').classList.remove('hidden');

    const totalRounds = this.categoryData.roundsCount || 0;
    const btnResults = document.getElementById('btn-show-results-top');
    if (totalRounds > 0) {
      btnResults.classList.remove('hidden');
    } else {
      btnResults.classList.add('hidden');
    }

    document.getElementById('round-indicator').textContent = `${this.currentRound}. Tur Puanlama`;

    this.renderRatingPhotos();
    this.updateProgress();
  }

  renderRatingPhotos() {
    const container = document.getElementById('photos-rating-list');
    const warning = document.getElementById('no-photos-warning');
    const bottomBar = document.getElementById('rating-bottom-bar');
    container.innerHTML = '';

    const loadedPhotos = this.categoryData.photos.filter(p => !!p.dataUrl);
    if (loadedPhotos.length === 0) {
      warning.classList.remove('hidden');
      bottomBar.classList.add('hidden');
      return;
    }
    warning.classList.add('hidden');
    bottomBar.classList.remove('hidden');

    this.categoryData.photos.forEach((photo, idx) => {
      if (!photo.dataUrl) return;

      const currentScore = this.tempScores[idx];
      const specialCode = this.tempSpecialCodes[idx]; // 'E' | 'Y' | null
      const isMvp = this.mvpIndex === idx;
      const isBigNo = this.bigNoIndex === idx;

      const card = document.createElement('div');
      card.className = `p-3 rounded-2xl border transition-all ${
        isMvp
          ? 'bg-amber-950/20 border-amber-500/60 shadow-md shadow-amber-500/10'
          : isBigNo
            ? 'bg-rose-950/25 border-rose-500/60 shadow-md shadow-rose-500/10'
            : currentScore !== null 
              ? 'bg-slate-900 border-pink-500/40 shadow-sm' 
              : 'bg-slate-900/60 border-slate-800'
      }`;

      // 'E' Harfi Butonu (Otomatik 0 Puan)
      const isESelected = specialCode === 'E';
      // 'Y' Harfi Butonu (Otomatik 0 Puan)
      const isYSelected = specialCode === 'Y';

      let pillsHtml = `
        <!-- E Harfi Butonu (0 Puan) -->
        <button onclick="app.setSpecialScore(${idx}, 'E')" 
                title="E: Elendi (0 Puan)"
                class="score-pill-btn min-w-[26px] h-7 rounded text-[11px] font-black border transition ${
                  isESelected
                    ? 'active bg-rose-600 text-white border-rose-400 font-black shadow-md shadow-rose-600/30'
                    : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/80'
                }">
          E
        </button>

        <!-- Y Harfi Butonu (0 Puan) -->
        <button onclick="app.setSpecialScore(${idx}, 'Y')" 
                title="Y: Yok / 0 Puan"
                class="score-pill-btn min-w-[26px] h-7 rounded text-[11px] font-black border transition ${
                  isYSelected
                    ? 'active bg-amber-600 text-white border-amber-400 font-black shadow-md shadow-amber-600/30'
                    : 'bg-amber-950/40 hover:bg-amber-900/60 text-amber-300 border-amber-800/80'
                }">
          Y
        </button>
      `;

      // 0'dan 15'e kadar puan butonları
      for (let s = 0; s <= 15; s++) {
        const isSelected = currentScore === s && !isESelected && !isYSelected;
        pillsHtml += `
          <button onclick="app.setScore(${idx}, ${s})" 
                  class="score-pill-btn flex-1 min-w-[20px] h-7 rounded text-[11px] font-bold border transition ${
                    isSelected 
                      ? 'active bg-pink-600 text-white border-pink-400 font-extrabold shadow' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }">
            ${s}
          </button>
        `;
      }

      // Puan Durumu Göstergesi
      let scoreDisplay = '—';
      let scoreColorClass = 'text-slate-600';

      if (currentScore !== null) {
        if (isMvp) {
          scoreDisplay = `${currentScore + 1} <span class="text-xs text-amber-300 font-semibold">(+1 MVP)</span>`;
          scoreColorClass = 'text-amber-400';
        } else if (isBigNo) {
          scoreDisplay = `${currentScore - 1} <span class="text-xs text-rose-400 font-semibold">(-1 Big No)</span>`;
          scoreColorClass = 'text-rose-400';
        } else if (isESelected) {
          scoreDisplay = `0 / 15 <span class="text-xs text-rose-400 font-bold">(E)</span>`;
          scoreColorClass = 'text-rose-400';
        } else if (isYSelected) {
          scoreDisplay = `0 / 15 <span class="text-xs text-amber-400 font-bold">(Y)</span>`;
          scoreColorClass = 'text-amber-400';
        } else {
          scoreDisplay = `${currentScore} / 15`;
          scoreColorClass = 'text-pink-400';
        }
      } else if (isMvp) {
        scoreDisplay = `<span class="text-xs text-amber-300 font-semibold">+1 MVP</span>`;
        scoreColorClass = 'text-amber-400';
      } else if (isBigNo) {
        scoreDisplay = `<span class="text-xs text-rose-400 font-semibold">-1 Big No</span>`;
        scoreColorClass = 'text-rose-400';
      }

      // Rozet
      let badgeHtml = '';
      if (isMvp) {
        badgeHtml = '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 font-extrabold border border-amber-400/50">⭐ MVP</span>';
      } else if (isBigNo) {
        badgeHtml = '<span class="text-[10px] px-1.5 py-0.2 rounded bg-rose-500/30 text-rose-300 font-extrabold border border-rose-400/50">🚫 BIG NO</span>';
      }

      card.innerHTML = `
        <div class="flex items-center gap-3 mb-2.5">
          <div class="w-14 h-16 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 cursor-pointer border ${
            isMvp ? 'border-amber-400 ring-2 ring-amber-400/30' : isBigNo ? 'border-rose-400 ring-2 ring-rose-400/30' : 'border-slate-700'
          }" onclick="app.openImageModal('${photo.dataUrl}', '${photo.name}')">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 truncate">
                <h4 class="font-bold text-white text-sm truncate">${photo.name}</h4>
                ${badgeHtml}
              </div>
              <span id="score-val-${idx}" class="text-sm font-extrabold ${scoreColorClass}">
                ${scoreDisplay}
              </span>
            </div>
            ${photo.scores && photo.scores.length > 0 ? `
              <span class="text-[10px] text-slate-400 block mt-0.5">Önceki Puanlar: [${photo.scores.join(', ')}]</span>
            ` : ''}
          </div>
        </div>

        <!-- E, Y ve 0-15 Puan Butonları -->
        <div class="flex flex-wrap gap-1 pt-1 border-t border-slate-800/60">
          ${pillsHtml}
        </div>

        <!-- MVP ve Big No Seçim Butonları -->
        <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/40">
          <button onclick="app.setMvp(${idx})"
                  class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                    isMvp
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-sm shadow-amber-500/30 ring-1 ring-amber-400/40'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                  }">
            <i class="fa-${isMvp ? 'solid' : 'regular'} fa-star text-amber-400"></i>
            <span>${isMvp ? 'MVP (+1)' : 'MVP Seç (+1)'}</span>
          </button>

          <button onclick="app.setBigNo(${idx})"
                  class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                    isBigNo
                      ? 'bg-rose-500/25 border-rose-400 text-rose-300 shadow-sm shadow-rose-500/30 ring-1 ring-rose-400/40'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-rose-500/40 hover:text-rose-300'
                  }">
            <i class="fa-solid fa-ban text-rose-400"></i>
            <span>${isBigNo ? 'Big No (-1)' : 'Big No (-1)'}</span>
          </button>
        </div>
      `;

      container.appendChild(card);
    });
  }

  setScore(idx, score) {
    this.tempScores[idx] = score;
    this.tempSpecialCodes[idx] = null;
    this.updateProgress();
    this.renderRatingPhotos();
  }

  /**
   * 4. 'E' ve 'Y' Harfi Seçimi (Her ikisi de 0 puan işler)
   */
  setSpecialScore(idx, code) {
    this.tempScores[idx] = 0;
    this.tempSpecialCodes[idx] = code;
    this.updateProgress();
    this.renderRatingPhotos();
    const name = this.categoryData.photos[idx]?.name || '';
    if (code === 'E') {
      this.showToast(`🚫 ${name} için 'E' seçildi (0 Puan)`);
    } else {
      this.showToast(`⚠️ ${name} için 'Y' seçildi (0 Puan)`);
    }
  }

  setMvp(idx) {
    if (this.mvpIndex === idx) {
      this.mvpIndex = null;
      this.showToast('MVP seçimi kaldırıldı.');
    } else {
      if (this.bigNoIndex === idx) {
        this.bigNoIndex = null;
      }
      this.mvpIndex = idx;
      const name = this.categoryData.photos[idx]?.name || '';
      this.showToast(`⭐ ${name} MVP seçildi! (+1 bonus puan)`);
    }
    this.renderRatingPhotos();
  }

  setBigNo(idx) {
    if (this.bigNoIndex === idx) {
      this.bigNoIndex = null;
      this.showToast('Big No seçimi kaldırıldı.');
    } else {
      if (this.mvpIndex === idx) {
        this.mvpIndex = null;
      }
      this.bigNoIndex = idx;
      const name = this.categoryData.photos[idx]?.name || '';
      this.showToast(`🚫 ${name} Big No seçildi! (-1 ceza puanı)`, 'error');
    }
    this.renderRatingPhotos();
  }

  updateProgress() {
    const loadedCount = this.categoryData.photos.filter(p => !!p.dataUrl).length;
    const ratedCount = this.tempScores.filter((s, i) => s !== null && this.categoryData.photos[i].dataUrl).length;
    const indicator = document.getElementById('progress-indicator');
    if (indicator) {
      indicator.textContent = `${ratedCount} / ${loadedCount} Puanlandı`;
      indicator.className = ratedCount === loadedCount 
        ? 'text-xs font-bold text-emerald-400' 
        : 'text-xs font-bold text-slate-400';
    }
  }

  /**
   * Puanları Kaydet & Merkezi Sunucuya Senkronize Et
   */
  async saveRatingAndShowList() {
    const loadedIndices = [];
    this.categoryData.photos.forEach((p, i) => {
      if (p.dataUrl) loadedIndices.push(i);
    });

    const unrated = loadedIndices.filter(i => this.tempScores[i] === null);
    if (unrated.length > 0) {
      const confirmZero = confirm(`${unrated.length} fotoğrafa puan verilmedi. Sıfır (0) olarak kaydedilsin mi?`);
      if (!confirmZero) return;
      unrated.forEach(i => {
        this.tempScores[i] = 0;
      });
    }

    const isNew = this.currentRound > (this.categoryData.roundsCount || 0);

    this.categoryData.photos.forEach((photo, idx) => {
      if (!photo.dataUrl) return;
      if (!photo.scores) photo.scores = [];
      if (!photo.mvpCount) photo.mvpCount = 0;
      if (!photo.bigNoCount) photo.bigNoCount = 0;

      let score = this.tempScores[idx] !== null ? this.tempScores[idx] : 0;

      // MVP Bonusu: +1 puan
      if (idx === this.mvpIndex) {
        score = score + 1;
        photo.mvpCount = (photo.mvpCount || 0) + 1;
      }

      // Big No Cezası: -1 puan
      if (idx === this.bigNoIndex) {
        score = score - 1;
        photo.bigNoCount = (photo.bigNoCount || 0) + 1;
      }

      if (isNew) {
        photo.scores.push(score);
      } else {
        const roundIdx = this.currentRound - 1;
        photo.scores[roundIdx] = score;
      }
    });

    if (isNew) {
      this.categoryData.roundsCount = this.currentRound;
    }

    this.categoryData.lastUpdated = new Date().toISOString();

    // 1. Yerel IndexedDB'ye kaydet
    await Database.saveCategory(this.categoryData);

    // 2. Merkezi Bulut Veritabanına asenkron push et (cihazlar arası paylaşım)
    CloudSync.pushCategory(this.categoryData);

    const mvpName = this.mvpIndex !== null ? this.categoryData.photos[this.mvpIndex]?.name : null;
    const bigNoName = this.bigNoIndex !== null ? this.categoryData.photos[this.bigNoIndex]?.name : null;
    let extraMsg = '';
    if (mvpName) extraMsg += ` • ⭐ MVP: ${mvpName}`;
    if (bigNoName) extraMsg += ` • 🚫 Big No: ${bigNoName}`;

    this.showToast(`${this.currentRound}. Tur puanları kalıcı olarak kaydedildi${extraMsg}`);

    this.mvpIndex = null;
    this.bigNoIndex = null;
    this.showResults();
  }

  showResults() {
    document.getElementById('view-rating').classList.add('hidden');
    document.getElementById('view-results').classList.remove('hidden');

    const totalRounds = this.categoryData.roundsCount || 0;
    document.getElementById('results-round-info').textContent = `${totalRounds} Puanlama Turu Kayıtlı`;

    this.renderResultsTable();
  }

  renderResultsTable() {
    const tbody = document.getElementById('results-table-body');
    tbody.innerHTML = '';

    const list = this.categoryData.photos
      .filter(p => !!p.dataUrl)
      .map(p => {
        const scores = p.scores || [];
        const total = scores.reduce((sum, s) => sum + s, 0);
        const avg = scores.length > 0 ? (total / scores.length) : 0;
        const last = scores.length > 0 ? scores[scores.length - 1] : 0;
        const mvpCount = p.mvpCount || 0;
        const bigNoCount = p.bigNoCount || 0;
        return {
          ...p,
          total,
          avg: parseFloat(avg.toFixed(2)),
          last,
          mvpCount,
          bigNoCount
        };
      })
      .sort((a, b) => b.avg - a.avg || b.mvpCount - a.mvpCount || a.bigNoCount - b.bigNoCount);

    list.forEach((photo, idx) => {
      const rank = idx + 1;
      const isTop5 = rank <= 5;
      const tr = document.createElement('tr');
      
      tr.className = `transition ${
        isTop5 
          ? 'bg-emerald-950/25 hover:bg-emerald-900/30 border-l-4 border-emerald-500/80' 
          : 'hover:bg-slate-800/30'
      }`;
      
      const rankHtml = isTop5
        ? `<span class="inline-flex items-center justify-center w-6 h-6 rounded-md bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 font-extrabold text-xs">${rank}</span>`
        : `<span class="font-bold text-slate-400">${rank}</span>`;

      const mvpBadge = photo.mvpCount > 0
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-amber-500/20 text-amber-300 font-bold border border-amber-500/30 flex items-center gap-0.5">⭐ MVP ×${photo.mvpCount}</span>`
        : '';

      const bigNoBadge = photo.bigNoCount > 0
        ? `<span class="text-[9px] px-1.5 py-0.5 rounded bg-rose-500/20 text-rose-300 font-bold border border-rose-500/30 flex items-center gap-0.5">🚫 Big No ×${photo.bigNoCount}</span>`
        : '';

      tr.innerHTML = `
        <td class="px-4 py-2.5 text-center">${rankHtml}</td>
        <td class="px-4 py-2.5">
          <div class="w-10 h-12 rounded-lg overflow-hidden bg-slate-950 ${isTop5 ? 'border-2 border-emerald-500/50 shadow-sm shadow-emerald-500/20' : 'border border-slate-700'} cursor-pointer"
               onclick="app.openImageModal('${photo.dataUrl}', '${photo.name}')">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
          </div>
        </td>
        <td class="px-4 py-2.5 font-semibold text-white">
          <div class="flex items-center gap-1.5 flex-wrap">
            <span>${photo.name}</span>
            ${isTop5 ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">İlk 5</span>' : ''}
            ${mvpBadge}
            ${bigNoBadge}
          </div>
          <span class="text-[10px] text-slate-400 font-normal">[${photo.scores.join(', ')}]</span>
        </td>
        <td class="px-4 py-2.5 text-center font-bold text-slate-200">${photo.last} / 15</td>
        <td class="px-4 py-2.5 text-center font-bold text-indigo-400">${photo.total}</td>
        <td class="px-4 py-2.5 text-center">
          <span class="px-2.5 py-1 rounded-full font-bold text-xs ${
            isTop5 ? 'text-emerald-300 bg-emerald-500/20 border border-emerald-500/40 shadow-sm' :
            photo.avg >= 8 ? 'text-pink-400 bg-pink-500/10' : 'text-slate-300 bg-slate-800'
          }">
            ${photo.avg} / 15
          </span>
        </td>
      `;
      tbody.appendChild(tr);
    });
  }

  startNewRound() {
    const nextRound = (this.categoryData.roundsCount || 0) + 1;
    this.currentRound = nextRound;
    this.initTempScores(false);
    this.showRating();
    this.showToast(`${nextRound}. Tur başlatıldı. Yeniden puanlayabilirsiniz.`);
  }

  editLatestRound() {
    this.currentRound = this.categoryData.roundsCount || 1;
    this.initTempScores(true);
    this.showRating();
  }

  async resetAllScores() {
    if (!this.currentCategory || !this.categoryData) {
      this.showToast('Lütfen önce bir kategori seçin.', 'error');
      return;
    }

    const isGirls = this.currentCategory === 'kizlar';
    const catName = isGirls ? 'Kızlar' : 'Erkekler';
    const confirmReset = confirm(`${catName} kategorisindeki tüm turları ve verilen puanları sıfırlamak istediğinize emin misiniz?\n\n(Bu işlem tüm cihazlardaki puanları 1. Tura sıfırlar)`);
    if (!confirmReset) return;

    try {
      this.categoryData.photos.forEach(p => {
        p.scores = [];
        p.mvpCount = 0;
        p.bigNoCount = 0;
      });
      this.categoryData.roundsCount = 0;
      this.categoryData.lastUpdated = new Date().toISOString();
      
      await Database.saveCategory(this.categoryData);
      await CloudSync.pushCategory(this.categoryData);

      this.currentRound = 1;
      this.initTempScores(false);

      document.getElementById('view-results').classList.add('hidden');
      this.showRating();
      this.showToast(`${catName} puanları tüm cihazlar için sıfırlandı!`);
      await this.updateHomeStatuses();
    } catch (err) {
      console.error('Reset hatası:', err);
      this.showToast('Sıfırlama sırasında bir hata oluştu!', 'error');
    }
  }

  navigate(view) {
    if (view === 'home') {
      document.getElementById('view-rating').classList.add('hidden');
      document.getElementById('view-results').classList.add('hidden');
      document.getElementById('view-home').classList.remove('hidden');
      document.getElementById('btn-back-home').classList.add('hidden');
      document.getElementById('nav-brand-title').textContent = 'Big5 Puanlama';
      this.currentCategory = null;
      this.updateHomeStatuses();
    }
  }

  openImageModal(url, name) {
    const m = document.getElementById('image-modal');
    document.getElementById('modal-img').src = url;
    document.getElementById('modal-caption').textContent = name;
    m.classList.remove('hidden');
    m.classList.add('flex');
  }

  closeImageModal() {
    const m = document.getElementById('image-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }

  showToast(msg, type = 'success') {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    const colorClass = type === 'error'
      ? 'bg-rose-900 text-white border-rose-700'
      : 'bg-slate-800 text-white border-slate-700';
    t.className = `${colorClass} text-xs px-3 py-2 rounded-lg shadow-lg border`;
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 2800);
  }
}

const app = new Big5App();
document.addEventListener('DOMContentLoaded', () => app.init());
