/**
 * Big5 Admin Yönetici Paneli Betiği
 * 
 * Özellikler:
 * - Aday Ekleme / Fotoğraf Düzenleme
 * - Yapılan değişikliklerin anında merkezi veritabanına (CloudSync) senkronize edilmesi
 * - Cihazlar arası otomatik ortak veri ve fotoğraf aktarımı
 */

const DB_NAME = 'Big5_PhotoRatingDB';
const DB_VERSION = 3;
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
 * CloudSync - Admin Paneli Merkezi Senkronizasyon
 */
class CloudSync {
  static getConfig() {
    return window.BIG5_CONFIG ? window.BIG5_CONFIG.cloud : { enabled: false };
  }

  static async fetchCategory(catId) {
    const cfg = this.getConfig();
    if (!cfg || !cfg.enabled) return null;

    try {
      if (cfg.provider === 'firebase' && cfg.firebaseUrl) {
        const url = `${cfg.firebaseUrl.replace(/\/+$/, '')}/big5/categories/${catId}.json`;
        const res = await fetch(url, { cache: 'no-cache' });
        if (!res.ok) return null;
        return await res.json();
      }

      const endpoint = cfg.endpoints ? cfg.endpoints[catId] : null;
      if (endpoint) {
        const res = await fetch(endpoint, { cache: 'no-cache' });
        if (!res.ok) return null;
        const result = await res.json();
        return result.data || null;
      }
      return null;
    } catch (e) {
      return null;
    }
  }

  static async pushCategory(categoryData) {
    const cfg = this.getConfig();
    if (!cfg || !cfg.enabled) return false;

    try {
      const catId = categoryData.id;
      if (cfg.provider === 'firebase' && cfg.firebaseUrl) {
        const url = `${cfg.firebaseUrl.replace(/\/+$/, '')}/big5/categories/${catId}.json`;
        const res = await fetch(url, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(categoryData)
        });
        return res.ok;
      }

      const endpoint = cfg.endpoints ? cfg.endpoints[catId] : null;
      if (endpoint) {
        const payload = {
          name: `big5_${catId}_live_data`,
          data: categoryData
        };
        const res = await fetch(endpoint, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload)
        });
        return res.ok;
      }
      return false;
    } catch (e) {
      return false;
    }
  }
}

class AdminPanel {
  constructor() {
    this.currentCategory = 'kizlar';
    this.categoryData = null;
  }

  async init() {
    await this.ensureInitialData();
    await this.switchCategory('kizlar');
  }

  async ensureInitialData() {
    for (const catId of ['kizlar', 'erkekler']) {
      let data = await Database.getCategory(catId);
      const cloudData = await CloudSync.fetchCategory(catId);
      const sharedList = (window.BIG5_SHARED_DATA && window.BIG5_SHARED_DATA[catId]) ? window.BIG5_SHARED_DATA[catId] : [];

      if (cloudData && cloudData.photos && cloudData.photos.length > 0) {
        data = cloudData;
        // Eksik fotoğrafları photos.js'ten tamamla
        data.photos.forEach((p, i) => {
          if (!p.dataUrl && sharedList[i] && sharedList[i].dataUrl) {
            p.dataUrl = sharedList[i].dataUrl;
          }
        });
        await Database.saveCategory(data);
      } else if (!data) {
        const targetCount = Math.max(16, sharedList.length);
        data = {
          id: catId,
          name: catId === 'kizlar' ? 'Kızlar' : 'Erkekler',
          photos: Array.from({ length: targetCount }, (_, i) => ({
            id: `${catId}_photo_${i + 1}`,
            slot: i + 1,
            name: (sharedList[i] && sharedList[i].name) ? sharedList[i].name : `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`,
            dataUrl: (sharedList[i] && sharedList[i].dataUrl) ? sharedList[i].dataUrl : null,
            scores: [],
            mvpCount: 0,
            bigNoCount: 0
          })),
          roundsCount: 0,
          lastUpdated: new Date().toISOString()
        };
        await Database.saveCategory(data);
        await CloudSync.pushCategory(data);
      } else {
        let updated = false;
        while (data.photos.length < 16) {
          const newSlot = data.photos.length + 1;
          data.photos.push({
            id: `${catId}_photo_${newSlot}`,
            slot: newSlot,
            name: `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${newSlot}`,
            dataUrl: null,
            scores: [],
            mvpCount: 0,
            bigNoCount: 0
          });
          updated = true;
        }
        if (updated) {
          data.lastUpdated = new Date().toISOString();
          await Database.saveCategory(data);
          await CloudSync.pushCategory(data);
        }
      }
    }
  }

  /**
   * 2 & 3. Yeni Kişi Ekleme (Merkezi Buluta Yazılır ve Tüm Cihazlarda Görünür)
   */
  async addNewSlot() {
    if (!this.categoryData) return;
    const catId = this.currentCategory;
    const newSlot = this.categoryData.photos.length + 1;
    this.categoryData.photos.push({
      id: `${catId}_photo_${newSlot}`,
      slot: newSlot,
      name: `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${newSlot}`,
      dataUrl: null,
      scores: [],
      mvpCount: 0,
      bigNoCount: 0
    });
    this.categoryData.lastUpdated = new Date().toISOString();

    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast(`Yeni aday slotu (#${newSlot}) eklendi ve tüm cihazlar için kaydedildi.`);
  }

  async updateCounts() {
    const kizlarData = await Database.getCategory('kizlar');
    const erkeklerData = await Database.getCategory('erkekler');
    const kizlarCount = kizlarData ? kizlarData.photos.filter(p => !!p.dataUrl).length : 0;
    const erkeklerCount = erkeklerData ? erkeklerData.photos.filter(p => !!p.dataUrl).length : 0;
    const kizlarTotal = kizlarData ? kizlarData.photos.length : 16;
    const erkeklerTotal = erkeklerData ? erkeklerData.photos.length : 16;

    const elKizlar = document.getElementById('count-kizlar');
    const elErkekler = document.getElementById('count-erkekler');
    if (elKizlar) elKizlar.textContent = `${kizlarCount}/${kizlarTotal}`;
    if (elErkekler) elErkekler.textContent = `${erkeklerCount}/${erkeklerTotal}`;
  }

  async switchCategory(catId) {
    this.currentCategory = catId;

    const cloudData = await CloudSync.fetchCategory(catId);
    if (cloudData && cloudData.photos) {
      this.categoryData = cloudData;
      await Database.saveCategory(cloudData);
    } else {
      this.categoryData = await Database.getCategory(catId);
    }

    const isGirls = catId === 'kizlar';
    const tabKizlar = document.getElementById('admin-tab-kizlar');
    const tabErkekler = document.getElementById('admin-tab-erkekler');
    const title = document.getElementById('active-category-title');

    const totalSlots = this.categoryData ? this.categoryData.photos.length : 16;

    if (isGirls) {
      tabKizlar.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-white bg-pink-600 shadow-md';
      tabErkekler.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white';
      title.textContent = `Big5 Kızlar (${totalSlots} Aday Slotu)`;
    } else {
      tabErkekler.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-white bg-indigo-600 shadow-md';
      tabKizlar.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white';
      title.textContent = `Big5 Erkekler (${totalSlots} Aday Slotu)`;
    }

    await this.updateCounts();
    this.renderGrid();
  }

  renderGrid() {
    const container = document.getElementById('admin-photo-grid');
    container.innerHTML = '';

    this.categoryData.photos.forEach((photo, idx) => {
      const card = document.createElement('div');
      card.className = `rounded-xl border overflow-hidden transition ${
        photo.dataUrl ? 'bg-slate-900 border-slate-700' : 'bg-slate-900/40 border-dashed border-slate-800'
      }`;

      if (photo.dataUrl) {
        card.innerHTML = `
          <div class="relative aspect-[3/4] bg-slate-950 group cursor-pointer" onclick="adminApp.openImageModal('${photo.dataUrl}')">
            <img src="${photo.dataUrl}" alt="${photo.name}" class="w-full h-full object-cover">
            <span class="absolute top-1.5 left-1.5 px-2 py-0.5 rounded bg-black/75 text-[10px] font-bold text-white">#${idx + 1}</span>
            
            <div class="absolute top-1.5 right-1.5 flex gap-1 opacity-0 group-hover:opacity-100 transition">
              <button onclick="event.stopPropagation(); adminApp.triggerSingleUpload(${idx})" class="w-6 h-6 rounded bg-slate-800 hover:bg-pink-600 text-white flex items-center justify-center text-[10px]" title="Değiştir">
                <i class="fa-solid fa-arrows-rotate"></i>
              </button>
              <button onclick="event.stopPropagation(); adminApp.deleteSinglePhoto(${idx})" class="w-6 h-6 rounded bg-slate-800 hover:bg-rose-600 text-white flex items-center justify-center text-[10px]" title="Sil">
                <i class="fa-solid fa-trash-can"></i>
              </button>
            </div>
          </div>
          <div class="p-2 bg-slate-900">
            <input type="text" value="${photo.name}" 
                   onchange="adminApp.updatePhotoName(${idx}, this.value)" 
                   class="w-full bg-slate-800 border border-slate-700 text-slate-200 text-xs px-2 py-1 rounded focus:outline-none focus:border-pink-500 font-medium">
          </div>
        `;
      } else {
        card.innerHTML = `
          <div class="aspect-[3/4] flex flex-col items-center justify-center p-3 text-center cursor-pointer hover:bg-slate-800/40 transition" 
               onclick="adminApp.triggerSingleUpload(${idx})">
            <div class="w-8 h-8 rounded-full bg-slate-800 text-slate-400 flex items-center justify-center text-xs mb-1.5">
              <i class="fa-solid fa-plus"></i>
            </div>
            <span class="text-xs font-semibold text-slate-300">#${idx + 1} Fotoğraf</span>
            <span class="text-[10px] text-slate-500">Yükle</span>
            <input type="file" id="admin-file-${idx}" class="hidden" accept="image/*" onchange="adminApp.handleSingleUpload(event, ${idx})">
          </div>
          <div class="p-2 bg-slate-900/60">
            <span class="text-[11px] text-slate-500 block text-center">Boş Slot</span>
          </div>
        `;
      }

      container.appendChild(card);
    });
  }

  triggerSingleUpload(idx) {
    let input = document.getElementById(`admin-file-${idx}`);
    if (!input) {
      input = document.createElement('input');
      input.type = 'file';
      input.accept = 'image/*';
      input.className = 'hidden';
      input.onchange = (e) => this.handleSingleUpload(e, idx);
      document.body.appendChild(input);
    }
    input.click();
  }

  async handleSingleUpload(event, idx) {
    const file = event.target.files[0];
    if (!file) return;

    this.showToast('Fotoğraf optimize ediliyor ve buluta yükleniyor...');
    const dataUrl = await this.readFile(file);
    this.categoryData.photos[idx].dataUrl = dataUrl;
    const cleanName = file.name.replace(/\.[^/.]+$/, "").substring(0, 20);
    this.categoryData.photos[idx].name = cleanName || `#${idx + 1}`;
    this.categoryData.lastUpdated = new Date().toISOString();

    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast(`#${idx + 1} nolu fotoğraf kaydedildi ve tüm cihazlara eşitlendi!`);
  }

  async handleBulkUpload(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    this.showToast('Fotoğraflar işleniyor ve buluta aktarılıyor...');
    const totalSlots = this.categoryData.photos.length;
    for (let i = 0; i < files.length && i < totalSlots; i++) {
      const dataUrl = await this.readFile(files[i]);
      this.categoryData.photos[i].dataUrl = dataUrl;
      const cleanName = files[i].name.replace(/\.[^/.]+$/, "").substring(0, 20);
      this.categoryData.photos[i].name = cleanName || `#${i + 1}`;
    }

    this.categoryData.lastUpdated = new Date().toISOString();
    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast(`${Math.min(files.length, totalSlots)} fotoğraf yüklendi ve tüm cihazlara eşitlendi.`);
    event.target.value = '';
  }

  async deleteSinglePhoto(idx) {
    if (!confirm(`#${idx + 1} fotoğrafı silmek istiyor musunuz?`)) return;
    this.categoryData.photos[idx].dataUrl = null;
    this.categoryData.photos[idx].scores = [];
    this.categoryData.lastUpdated = new Date().toISOString();

    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast('Fotoğraf silindi ve tüm cihazlara eşitlendi.');
  }

  async updatePhotoName(idx, name) {
    this.categoryData.photos[idx].name = name.trim() || `#${idx + 1}`;
    this.categoryData.lastUpdated = new Date().toISOString();

    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);
  }

  async clearCategoryPhotos() {
    if (!confirm('Bu kategorideki tüm fotoğrafları ve puanları silmek istediğinize emin misiniz?')) return;
    this.categoryData.photos.forEach((p, i) => {
      p.dataUrl = null;
      p.scores = [];
      p.mvpCount = 0;
      p.bigNoCount = 0;
      p.name = `${this.currentCategory === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`;
    });
    this.categoryData.roundsCount = 0;
    this.categoryData.lastUpdated = new Date().toISOString();

    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast('Kategori temizlendi ve tüm cihazlara eşitlendi.');
  }

  async loadSamplePhotos() {
    const isGirls = this.currentCategory === 'kizlar';
    const names = isGirls ? [
      'Aday 1', 'Aday 2', 'Aday 3', 'Aday 4', 'Aday 5',
      'Aday 6', 'Aday 7', 'Aday 8', 'Aday 9', 'Aday 10',
      'Aday 11', 'Aday 12', 'Aday 13', 'Aday 14', 'Aday 15', 'Aday 16'
    ] : [
      'Aday 1', 'Aday 2', 'Aday 3', 'Aday 4', 'Aday 5',
      'Aday 6', 'Aday 7', 'Aday 8', 'Aday 9', 'Aday 10',
      'Aday 11', 'Aday 12', 'Aday 13', 'Aday 14', 'Aday 15', 'Aday 16'
    ];

    const colors = [
      ['#ec4899', '#f43f5e'], ['#8b5cf6', '#6366f1'], ['#06b6d4', '#3b82f6'],
      ['#10b981', '#059669'], ['#f59e0b', '#d97706'], ['#d946ef', '#a855f7'],
      ['#3b82f6', '#1d4ed8'], ['#14b8a6', '#0d9488'], ['#fb7185', '#e11d48'],
      ['#a855f7', '#7c3aed'], ['#eab308', '#ca8a04'], ['#64748b', '#334155'],
      ['#f97316', '#c2410c'], ['#2dd4bf', '#0f766e'], ['#ec4899', '#8b5cf6'], ['#6366f1', '#a855f7']
    ];

    const len = this.categoryData.photos.length;
    for (let i = 0; i < len; i++) {
      const canvas = document.createElement('canvas');
      canvas.width = 400;
      canvas.height = 500;
      const ctx = canvas.getContext('2d');

      const [c1, c2] = colors[i % colors.length];
      const grad = ctx.createLinearGradient(0, 0, 400, 500);
      grad.addColorStop(0, c1);
      grad.addColorStop(1, c2);
      ctx.fillStyle = grad;
      ctx.fillRect(0, 0, 400, 500);

      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 80px sans-serif';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(`#${i + 1}`, 200, 220);

      ctx.fillStyle = 'rgba(0, 0, 0, 0.4)';
      ctx.fillRect(0, 420, 400, 80);
      ctx.fillStyle = '#ffffff';
      ctx.font = 'bold 24px sans-serif';
      const name = names[i] || `Aday ${i + 1}`;
      ctx.fillText(name, 200, 465);

      this.categoryData.photos[i].dataUrl = canvas.toDataURL('image/jpeg', 0.85);
      this.categoryData.photos[i].name = name;
    }

    this.categoryData.lastUpdated = new Date().toISOString();
    await Database.saveCategory(this.categoryData);
    await CloudSync.pushCategory(this.categoryData);

    await this.updateCounts();
    this.renderGrid();
    this.showToast('Örnek fotoğraflar yüklendi ve senkronize edildi!');
  }

  async publishToPhotosJs() {
    this.showToast('Fotoğraflar merkezi buluta ve yayına aktarılıyor...');
    const kizlarData = await Database.getCategory('kizlar');
    const erkeklerData = await Database.getCategory('erkekler');

    // 1. Doğrudan Canlı Merkezi Buluta Gönder (Tüm cihazlar anında görsün)
    let cloudSuccess = false;
    if (kizlarData) {
      kizlarData.lastUpdated = new Date().toISOString();
      await Database.saveCategory(kizlarData);
      cloudSuccess = await CloudSync.pushCategory(kizlarData);
    }
    if (erkeklerData) {
      erkeklerData.lastUpdated = new Date().toISOString();
      await Database.saveCategory(erkeklerData);
      cloudSuccess = await CloudSync.pushCategory(erkeklerData) || cloudSuccess;
    }

    const cleanPhotos = (catData) => {
      if (!catData || !catData.photos) return [];
      return catData.photos.map(p => ({
        slot: p.slot,
        name: p.name || `#${p.slot}`,
        dataUrl: p.dataUrl || null
      }));
    };

    const sharedData = {
      kizlar: cleanPhotos(kizlarData),
      erkekler: cleanPhotos(erkeklerData)
    };

    const fileContent = `/**
 * Big5 Genel Fotoğraf Verisi (GitHub Pages üzerinden tüm ziyaretçilere sunulur)
 * Güncellenme Tarihi: ${new Date().toLocaleString('tr-TR')}
 */
window.BIG5_SHARED_DATA = ${JSON.stringify(sharedData, null, 2)};
`;

    // 2. Dosya Kaydetme (Modern Picker)
    if (window.showSaveFilePicker) {
      try {
        const handle = await window.showSaveFilePicker({
          suggestedName: 'photos.js',
          types: [{
            description: 'JavaScript Dosyası',
            accept: { 'text/javascript': ['.js'] }
          }]
        });
        const writable = await handle.createWritable();
        await writable.write(fileContent);
        await writable.close();
        this.showToast('🎉 Fotoğraflar hem merkezi buluta yüklendi hem photos.js kaydedildi!');
        return;
      } catch (err) {
        if (err.name === 'AbortError') {
          if (cloudSuccess) {
            this.showToast('✅ Fotoğraflar merkezi buluta başarıyla yüklendi! Tüm cihazlarda yayında.');
          }
          return;
        }
      }
    }

    // 3. Dosya İndirme Alternatifi
    const blob = new Blob([fileContent], { type: 'text/javascript;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'photos.js';
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    this.showToast('✅ Fotoğraflar canlı buluta aktarıldı! (photos.js de indirildi)');
  }

  // Fotoğrafları otomatik optimize et (Maksimum 500px, %78 kalite ile buluta hızlı ve hafif aktarım)
  readFile(file) {
    return new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        const img = new Image();
        img.onload = () => {
          let width = img.width;
          let height = img.height;
          const maxDim = 500;

          if (width > maxDim || height > maxDim) {
            if (width > height) {
              height = Math.round((height * maxDim) / width);
              width = maxDim;
            } else {
              width = Math.round((width * maxDim) / height);
              height = maxDim;
            }
          }

          const canvas = document.createElement('canvas');
          canvas.width = width;
          canvas.height = height;
          const ctx = canvas.getContext('2d');
          ctx.drawImage(img, 0, 0, width, height);
          resolve(canvas.toDataURL('image/jpeg', 0.78));
        };
        img.src = e.target.result;
      };
      reader.readAsDataURL(file);
    });
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

  openImageModal(url) {
    const m = document.getElementById('image-modal');
    document.getElementById('modal-img').src = url;
    m.classList.remove('hidden');
    m.classList.add('flex');
  }

  closeImageModal() {
    const m = document.getElementById('image-modal');
    m.classList.add('hidden');
    m.classList.remove('flex');
  }
}

const adminApp = new AdminPanel();
document.addEventListener('DOMContentLoaded', () => adminApp.init());
