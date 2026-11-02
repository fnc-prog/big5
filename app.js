/**
 * Big5 Puanlama Uygulaması
 * Big5 Kızlar & Big5 Erkekler 15 Puan Değerlendirme & Çoklu Tur Sistemi
 */

const DB_NAME = 'Big5_PhotoRatingDB';
const DB_VERSION = 1;
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

class Big5App {
  constructor() {
    this.currentCategory = null; // 'kizlar' | 'erkekler'
    this.categoryData = null;
    this.currentRound = 1;
    this.tempScores = new Array(15).fill(null);
    this.mvpIndex = null; // Seçilen MVP fotoğrafının index'i
  }

  async init() {
    await this.ensureInitialData();
    await this.updateHomeStatuses();
  }

  async ensureInitialData() {
    for (const catId of ['kizlar', 'erkekler']) {
      let data = await Database.getCategory(catId);
      const sharedList = (window.BIG5_SHARED_DATA && window.BIG5_SHARED_DATA[catId]) ? window.BIG5_SHARED_DATA[catId] : [];

      if (!data) {
        data = {
          id: catId,
          name: catId === 'kizlar' ? 'Big5 Kızlar' : 'Big5 Erkekler',
          photos: Array.from({ length: 15 }, (_, i) => {
            const shared = sharedList[i];
            return {
              id: `${catId}_photo_${i + 1}`,
              slot: i + 1,
              name: (shared && shared.name) ? shared.name : `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`,
              dataUrl: (shared && shared.dataUrl) ? shared.dataUrl : null,
              scores: []
            };
          }),
          roundsCount: 0,
          lastUpdated: new Date().toISOString()
        };
        await Database.saveCategory(data);
      } else if (sharedList.length > 0) {
        // Sunucudan (photos.js) gelen genel fotoğraflarla yerel fotoğrafları güncelle
        let updated = false;
        sharedList.forEach((shared, i) => {
          if (shared && shared.dataUrl && data.photos[i]) {
            if (data.photos[i].dataUrl !== shared.dataUrl || data.photos[i].name !== shared.name) {
              data.photos[i].dataUrl = shared.dataUrl;
              if (shared.name) data.photos[i].name = shared.name;
              updated = true;
            }
          }
        });
        if (updated) {
          await Database.saveCategory(data);
        }
      }
    }
  }

  async updateHomeStatuses() {
    for (const catId of ['kizlar', 'erkekler']) {
      const data = await Database.getCategory(catId);
      const el = document.getElementById(`home-${catId}-status`);
      if (el && data) {
        const count = data.photos.filter(p => !!p.dataUrl).length;
        const rounds = data.roundsCount || 0;
        if (rounds > 0) {
          el.textContent = `${count}/15 Fotoğraf • ${rounds} Tur Puanlandı`;
        } else {
          el.textContent = `${count}/15 Fotoğraf Hazır`;
        }
      }
    }
  }

  async selectCategory(catId) {
    this.currentCategory = catId;
    this.categoryData = await Database.getCategory(catId);

    const isGirls = catId === 'kizlar';
    document.getElementById('nav-brand-title').textContent = isGirls ? 'Big5 Kızlar Puanlama' : 'Big5 Erkekler Puanlama';
    document.getElementById('category-page-title').textContent = isGirls ? 'Big5 Kızlar Puanlama' : 'Big5 Erkekler Puanlama';
    document.getElementById('results-page-title').textContent = isGirls ? 'Big5 Kızlar Puan Listesi' : 'Big5 Erkekler Puan Listesi';
    
    document.getElementById('btn-back-home').classList.remove('hidden');
    document.getElementById('view-home').classList.add('hidden');

    // Eğer daha önce puanlama yapılmışsa doğrudan sonuçları veya puanlamayı aç
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
    this.tempScores = this.categoryData.photos.map(p => {
      if (useLastRound && p.scores && p.scores.length > 0) {
        return p.scores[p.scores.length - 1];
      }
      return null;
    });
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
      if (!photo.dataUrl) return; // Yüklenmemişse gösterme

      const currentScore = this.tempScores[idx];
      const isMvp = this.mvpIndex === idx;
      const card = document.createElement('div');
      card.className = `p-3 rounded-2xl border transition-all ${
        isMvp
          ? 'bg-amber-950/20 border-amber-500/60 shadow-md shadow-amber-500/10'
          : currentScore !== null 
            ? 'bg-slate-900 border-pink-500/40 shadow-sm' 
            : 'bg-slate-900/60 border-slate-800'
      }`;

      // 0'dan 15'e kadar puan hapları
      let pillsHtml = '';
      for (let s = 0; s <= 15; s++) {
        const isSelected = currentScore === s;
        pillsHtml += `
          <button onclick="app.setScore(${idx}, ${s})" 
                  class="score-pill-btn flex-1 min-w-[24px] h-7 rounded text-[11px] font-bold border transition ${
                    isSelected 
                      ? 'active bg-pink-600 text-white border-pink-400 font-extrabold shadow' 
                      : 'bg-slate-800 hover:bg-slate-700 text-slate-300 border-slate-700'
                  }">
            ${s}
          </button>
        `;
      }

      const scoreDisplay = currentScore !== null
        ? (isMvp ? `${currentScore + 1} <span class="text-xs text-amber-300 font-semibold">(+1 MVP)</span>` : `${currentScore} / 15`)
        : (isMvp ? `<span class="text-xs text-amber-300 font-semibold">+1 MVP</span>` : '—');

      card.innerHTML = `
        <div class="flex items-center gap-3 mb-2.5">
          <div class="w-14 h-16 rounded-xl overflow-hidden bg-slate-950 flex-shrink-0 cursor-pointer border ${isMvp ? 'border-amber-400 ring-2 ring-amber-400/30' : 'border-slate-700'}"
               onclick="app.openImageModal('${photo.dataUrl}', '${photo.name}')">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
          </div>
          <div class="flex-1 min-w-0">
            <div class="flex items-center justify-between">
              <div class="flex items-center gap-1.5 truncate">
                <h4 class="font-bold text-white text-sm truncate">${photo.name}</h4>
                ${isMvp ? '<span class="text-[10px] px-1.5 py-0.2 rounded bg-amber-500/30 text-amber-300 font-extrabold border border-amber-400/50">⭐ MVP</span>' : ''}
              </div>
              <span id="score-val-${idx}" class="text-sm font-extrabold ${isMvp ? 'text-amber-400' : currentScore !== null ? 'text-pink-400' : 'text-slate-600'}">
                ${scoreDisplay}
              </span>
            </div>
            ${photo.scores && photo.scores.length > 0 ? `
              <span class="text-[10px] text-slate-400 block mt-0.5">Önceki Puanlar: [${photo.scores.join(', ')}]</span>
            ` : ''}
          </div>
        </div>

        <!-- 0-15 Puan Butonları -->
        <div class="grid grid-cols-8 gap-1 pt-1 border-t border-slate-800/60">
          ${pillsHtml}
        </div>

        <!-- MVP Seçim Butonu -->
        <div class="mt-2 pt-2 border-t border-slate-800/40">
          <button onclick="app.setMvp(${idx})"
                  class="w-full py-1.5 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1.5 ${
                    isMvp
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-sm shadow-amber-500/30 ring-1 ring-amber-400/40'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                  }">
            <i class="fa-${isMvp ? 'solid' : 'regular'} fa-star text-amber-400"></i>
            ${isMvp ? 'Turun MVP\'si Seçildi (+1 Puan Eklendi)' : 'Bu Turun MVP\'si Olarak Seç (+1 Puan)'}
          </button>
        </div>
      `;

      container.appendChild(card);
    });
  }

  setScore(idx, score) {
    this.tempScores[idx] = score;
    this.updateProgress();

    // Hızlı UI güncellemesi
    const el = document.getElementById(`score-val-${idx}`);
    if (el) {
      el.textContent = `${score} / 15`;
      el.className = 'text-sm font-extrabold text-pink-400';
    }

    this.renderRatingPhotos();
  }

  setMvp(idx) {
    // Aynıya tekrar basılırsa MVP seçimini kaldır
    if (this.mvpIndex === idx) {
      this.mvpIndex = null;
      this.showToast('MVP seçimi kaldırıldı.');
    } else {
      this.mvpIndex = idx;
      const name = this.categoryData.photos[idx]?.name || '';
      this.showToast(`⭐ ${name} MVP seçildi! (+1 bonus puan)`);
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

  async saveRatingAndShowList() {
    const loadedIndices = [];
    this.categoryData.photos.forEach((p, i) => {
      if (p.dataUrl) loadedIndices.push(i);
    });

    const unrated = loadedIndices.filter(i => this.tempScores[i] === null);
    if (unrated.length > 0) {
      const confirmZero = confirm(`${unrated.length} fotoğrafa puan verilmedi. Sıfır (0) olarak kaydedilsin mi?`);
      if (!confirmZero) return;
      unrated.forEach(i => this.tempScores[i] = 0);
    }

    const isNew = this.currentRound > (this.categoryData.roundsCount || 0);

    this.categoryData.photos.forEach((photo, idx) => {
      if (!photo.dataUrl) return;
      if (!photo.scores) photo.scores = [];
      if (!photo.mvpCount) photo.mvpCount = 0;
      let score = this.tempScores[idx] !== null ? this.tempScores[idx] : 0;

      // MVP bonusu: +1 puan
      if (idx === this.mvpIndex) {
        score = score + 1;
        photo.mvpCount = (photo.mvpCount || 0) + 1;
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
    await Database.saveCategory(this.categoryData);

    const mvpName = this.mvpIndex !== null ? this.categoryData.photos[this.mvpIndex]?.name : null;
    const mvpMsg = mvpName ? ` • ⭐ MVP: ${mvpName}` : '';
    this.showToast(`${this.currentRound}. Tur kaydedildi${mvpMsg}`);

    // MVP sıfırla (bir sonraki tur için)
    this.mvpIndex = null;
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
        return {
          ...p,
          total,
          avg: parseFloat(avg.toFixed(2)),
          last,
          mvpCount
        };
      })
      .sort((a, b) => b.avg - a.avg || b.mvpCount - a.mvpCount);

    list.forEach((photo, idx) => {
      const rank = idx + 1;
      const isTop5 = rank <= 5;
      const tr = document.createElement('tr');
      
      // İlk 5 sıradaki adayı yeşil tonuyla hafifçe vurgula
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

      tr.innerHTML = `
        <td class="px-4 py-2.5 text-center">${rankHtml}</td>
        <td class="px-4 py-2.5">
          <div class="w-10 h-12 rounded-lg overflow-hidden bg-slate-950 ${isTop5 ? 'border-2 border-emerald-500/50 shadow-sm shadow-emerald-500/20' : 'border border-slate-700'} cursor-pointer"
               onclick="app.openImageModal('${photo.dataUrl}', '${photo.name}')">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
          </div>
        </td>
        <td class="px-4 py-2.5 font-semibold text-white">
          <div class="flex items-center gap-2 flex-wrap">
            <span>${photo.name}</span>
            ${isTop5 ? '<span class="text-[9px] px-1.5 py-0.5 rounded bg-emerald-500/20 text-emerald-300 font-bold border border-emerald-500/30">İlk 5</span>' : ''}
            ${mvpBadge}
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
    this.tempScores = new Array(15).fill(null);
    this.mvpIndex = null;
    this.showRating();
    this.showToast(`${nextRound}. Tur başlatıldı. Yeniden puanlayabilirsiniz.`);
  }

  editLatestRound() {
    this.currentRound = this.categoryData.roundsCount || 1;
    this.mvpIndex = null;
    this.initTempScores(true);
    this.showRating();
  }

  async resetAllScores() {
    // Kategori seçili değilse işlem yapma
    if (!this.currentCategory || !this.categoryData) {
      this.showToast('Lütfen önce bir kategori seçin.', 'error');
      return;
    }

    const isGirls = this.currentCategory === 'kizlar';
    const catName = isGirls ? 'Kızlar' : 'Erkekler';
    const confirmReset = confirm(`${catName} kategorisindeki tüm turları ve verilen puanları sıfırlamak istediğinize emin misiniz?\n\n(Fotoğraflarınız silinmez, sadece puanlar 1. Tura döner)`);
    if (!confirmReset) return;

    try {
      this.categoryData.photos.forEach(p => {
        p.scores = [];
        p.mvpCount = 0;
      });
      this.categoryData.roundsCount = 0;
      this.categoryData.lastUpdated = new Date().toISOString();
      await Database.saveCategory(this.categoryData);

      this.currentRound = 1;
      this.tempScores = new Array(15).fill(null);
      this.mvpIndex = null;
      this.initTempScores(false);

      // Sonuçlar ve puanlama ekranlarını gizle, puanlama ekranını göster
      document.getElementById('view-results').classList.add('hidden');
      this.showRating();
      this.showToast(`${catName} puanları sıfırlandı! 1. Turdan başlayabilirsiniz.`);
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
