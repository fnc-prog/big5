/**
 * Big5 Puanlama Uygulaması
 * Big5 Kızlar & Big5 Erkekler 15 Puan Değerlendirme & Çoklu Tur Sistemi
 * Özellikler:
 * - 0-15 Puanlama + 'E' Harfi (Otomatik 0 Puan)
 * - MVP Seçimi: Tur başına 1 adaya +1 bonus puan (⭐)
 * - Big No Seçimi: Tur başına 1 adaya -1 ceza puanı (🚫, MVP'nin tam tersi)
 * - 16+ Aday Desteği (Dinamik slot ve fotoğraf sayısı)
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
    this.tempScores = [];
    this.tempEliminated = []; // E harfine basılanlar
    this.mvpIndex = null; // Seçilen MVP fotoğrafının index'i
    this.bigNoIndex = null; // Seçilen Big No fotoğrafının index'i
  }

  async init() {
    await this.ensureInitialData();
    await this.updateHomeStatuses();
  }

  async ensureInitialData() {
    for (const catId of ['kizlar', 'erkekler']) {
      let data = await Database.getCategory(catId);
      const sharedList = (window.BIG5_SHARED_DATA && window.BIG5_SHARED_DATA[catId]) ? window.BIG5_SHARED_DATA[catId] : [];
      const targetCount = Math.max(16, sharedList.length);

      if (!data) {
        data = {
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
        await Database.saveCategory(data);
      } else {
        let updated = false;

        // En az 16 slot olmasını sağla
        while (data.photos.length < targetCount) {
          const newSlot = data.photos.length + 1;
          const shared = sharedList[newSlot - 1];
          data.photos.push({
            id: `${catId}_photo_${newSlot}`,
            slot: newSlot,
            name: (shared && shared.name) ? shared.name : `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${newSlot}`,
            dataUrl: (shared && shared.dataUrl) ? shared.dataUrl : null,
            scores: [],
            mvpCount: 0,
            bigNoCount: 0
          });
          updated = true;
        }

        // Sunucudan (photos.js) gelen genel fotoğraflarla yerel fotoğrafları senkronize et
        if (sharedList.length > 0) {
          sharedList.forEach((shared, i) => {
            if (shared && data.photos[i]) {
              if (shared.dataUrl && data.photos[i].dataUrl !== shared.dataUrl) {
                data.photos[i].dataUrl = shared.dataUrl;
                updated = true;
              }
              if (shared.name && data.photos[i].name !== shared.name) {
                data.photos[i].name = shared.name;
                updated = true;
              }
            }
          });
        }

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
    this.categoryData = await Database.getCategory(catId);

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
    this.tempEliminated = new Array(len).fill(false);
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
      const isMvp = this.mvpIndex === idx;
      const isBigNo = this.bigNoIndex === idx;
      const isEliminated = !!this.tempEliminated[idx];

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
      const eBtnSelected = isEliminated;
      let pillsHtml = `
        <button onclick="app.setEliminated(${idx})" 
                title="E: Elendi / 0 Puan"
                class="score-pill-btn min-w-[26px] h-7 rounded text-[11px] font-black border transition ${
                  eBtnSelected
                    ? 'active bg-rose-600 text-white border-rose-400 font-black shadow-md shadow-rose-600/30'
                    : 'bg-rose-950/40 hover:bg-rose-900/60 text-rose-300 border-rose-800/80'
                }">
          E
        </button>
      `;

      // 0'dan 15'e kadar puan hapları
      for (let s = 0; s <= 15; s++) {
        const isSelected = currentScore === s && !eBtnSelected;
        pillsHtml += `
          <button onclick="app.setScore(${idx}, ${s})" 
                  class="score-pill-btn flex-1 min-w-[22px] h-7 rounded text-[11px] font-bold border transition ${
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
        } else if (isEliminated) {
          scoreDisplay = `0 / 15 <span class="text-xs text-rose-400 font-bold">(E)</span>`;
          scoreColorClass = 'text-rose-400';
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

        <!-- E ve 0-15 Puan Butonları -->
        <div class="flex flex-wrap gap-1 pt-1 border-t border-slate-800/60">
          ${pillsHtml}
        </div>

        <!-- MVP ve Big No Seçim Butonları (Yan Yana) -->
        <div class="grid grid-cols-2 gap-2 mt-2 pt-2 border-t border-slate-800/40">
          <!-- MVP Butonu -->
          <button onclick="app.setMvp(${idx})"
                  class="py-1.5 px-2 rounded-xl text-xs font-bold transition-all border flex items-center justify-center gap-1 ${
                    isMvp
                      ? 'bg-amber-500/25 border-amber-400 text-amber-300 shadow-sm shadow-amber-500/30 ring-1 ring-amber-400/40'
                      : 'bg-slate-800/60 border-slate-700 text-slate-400 hover:border-amber-500/40 hover:text-amber-300'
                  }">
            <i class="fa-${isMvp ? 'solid' : 'regular'} fa-star text-amber-400"></i>
            <span>${isMvp ? 'MVP (+1)' : 'MVP Seç (+1)'}</span>
          </button>

          <!-- Big No Butonu -->
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
    this.tempEliminated[idx] = false;
    this.updateProgress();
    this.renderRatingPhotos();
  }

  setEliminated(idx) {
    this.tempScores[idx] = 0;
    this.tempEliminated[idx] = true;
    this.updateProgress();
    this.renderRatingPhotos();
    const name = this.categoryData.photos[idx]?.name || '';
    this.showToast(`🚫 ${name} için E seçildi (0 Puan)`, 'error');
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
    await Database.saveCategory(this.categoryData);

    const mvpName = this.mvpIndex !== null ? this.categoryData.photos[this.mvpIndex]?.name : null;
    const bigNoName = this.bigNoIndex !== null ? this.categoryData.photos[this.bigNoIndex]?.name : null;
    let extraMsg = '';
    if (mvpName) extraMsg += ` • ⭐ MVP: ${mvpName}`;
    if (bigNoName) extraMsg += ` • 🚫 Big No: ${bigNoName}`;

    this.showToast(`${this.currentRound}. Tur kaydedildi${extraMsg}`);

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
    const confirmReset = confirm(`${catName} kategorisindeki tüm turları ve verilen puanları sıfırlamak istediğinize emin misiniz?\n\n(Fotoğraflarınız silinmez, sadece puanlar 1. Tura döner)`);
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

      this.currentRound = 1;
      this.initTempScores(false);

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
