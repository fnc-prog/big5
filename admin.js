/**
 * Big5 Admin Yönetici Paneli Betiği
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
      if (!data) {
        data = {
          id: catId,
          name: catId === 'kizlar' ? 'Kızlar' : 'Erkekler',
          photos: Array.from({ length: 15 }, (_, i) => ({
            id: `${catId}_photo_${i + 1}`,
            slot: i + 1,
            name: `${catId === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`,
            dataUrl: null,
            scores: []
          })),
          roundsCount: 0,
          lastUpdated: new Date().toISOString()
        };
        await Database.saveCategory(data);
      }
    }
  }

  async updateCounts() {
    const kizlarData = await Database.getCategory('kizlar');
    const erkeklerData = await Database.getCategory('erkekler');
    const kizlarCount = kizlarData ? kizlarData.photos.filter(p => !!p.dataUrl).length : 0;
    const erkeklerCount = erkeklerData ? erkeklerData.photos.filter(p => !!p.dataUrl).length : 0;

    const elKizlar = document.getElementById('count-kizlar');
    const elErkekler = document.getElementById('count-erkekler');
    if (elKizlar) elKizlar.textContent = `${kizlarCount}/15`;
    if (elErkekler) elErkekler.textContent = `${erkeklerCount}/15`;
  }

  async switchCategory(catId) {
    this.currentCategory = catId;
    this.categoryData = await Database.getCategory(catId);

    const isGirls = catId === 'kizlar';
    const tabKizlar = document.getElementById('admin-tab-kizlar');
    const tabErkekler = document.getElementById('admin-tab-erkekler');
    const title = document.getElementById('active-category-title');

    if (isGirls) {
      tabKizlar.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-white bg-pink-600 shadow-md';
      tabErkekler.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white';
      title.textContent = 'Big5 Kızlar (15 Fotoğraf)';
    } else {
      tabErkekler.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-white bg-indigo-600 shadow-md';
      tabKizlar.className = 'flex-1 py-2 rounded-xl text-xs font-bold transition text-slate-400 hover:text-white';
      title.textContent = 'Big5 Erkekler (15 Fotoğraf)';
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

    const dataUrl = await this.readFile(file);
    this.categoryData.photos[idx].dataUrl = dataUrl;
    const cleanName = file.name.replace(/\.[^/.]+$/, "").substring(0, 20);
    this.categoryData.photos[idx].name = cleanName || `#${idx + 1}`;

    await Database.saveCategory(this.categoryData);
    await this.updateCounts();
    this.renderGrid();
    this.showToast(`#${idx + 1} nolu fotoğraf yüklendi.`);
  }

  async handleBulkUpload(event) {
    const files = Array.from(event.target.files);
    if (!files || files.length === 0) return;

    for (let i = 0; i < files.length && i < 15; i++) {
      const dataUrl = await this.readFile(files[i]);
      this.categoryData.photos[i].dataUrl = dataUrl;
      const cleanName = files[i].name.replace(/\.[^/.]+$/, "").substring(0, 20);
      this.categoryData.photos[i].name = cleanName || `#${i + 1}`;
    }

    await Database.saveCategory(this.categoryData);
    await this.updateCounts();
    this.renderGrid();
    this.showToast(`${Math.min(files.length, 15)} fotoğraf yüklendi.`);
    event.target.value = '';
  }

  async deleteSinglePhoto(idx) {
    if (!confirm(`#${idx + 1} fotoğrafı silmek istiyor musunuz?`)) return;
    this.categoryData.photos[idx].dataUrl = null;
    this.categoryData.photos[idx].scores = [];
    await Database.saveCategory(this.categoryData);
    await this.updateCounts();
    this.renderGrid();
    this.showToast('Fotoğraf silindi.');
  }

  async updatePhotoName(idx, name) {
    this.categoryData.photos[idx].name = name.trim() || `#${idx + 1}`;
    await Database.saveCategory(this.categoryData);
  }

  async clearCategoryPhotos() {
    if (!confirm('Bu kategorideki tüm fotoğrafları silmek istediğinize emin misiniz?')) return;
    this.categoryData.photos.forEach((p, i) => {
      p.dataUrl = null;
      p.scores = [];
      p.name = `${this.currentCategory === 'kizlar' ? 'Kız' : 'Erkek'} #${i + 1}`;
    });
    this.categoryData.roundsCount = 0;
    await Database.saveCategory(this.categoryData);
    await this.updateCounts();
    this.renderGrid();
    this.showToast('Kategori temizlendi.');
  }

  async loadSamplePhotos() {
    const isGirls = this.currentCategory === 'kizlar';
    const names = isGirls ? [
      'Aday 1', 'Aday 2', 'Aday 3', 'Aday 4', 'Aday 5',
      'Aday 6', 'Aday 7', 'Aday 8', 'Aday 9', 'Aday 10',
      'Aday 11', 'Aday 12', 'Aday 13', 'Aday 14', 'Aday 15'
    ] : [
      'Aday 1', 'Aday 2', 'Aday 3', 'Aday 4', 'Aday 5',
      'Aday 6', 'Aday 7', 'Aday 8', 'Aday 9', 'Aday 10',
      'Aday 11', 'Aday 12', 'Aday 13', 'Aday 14', 'Aday 15'
    ];

    const colors = [
      ['#ec4899', '#f43f5e'], ['#8b5cf6', '#6366f1'], ['#06b6d4', '#3b82f6'],
      ['#10b981', '#059669'], ['#f59e0b', '#d97706'], ['#d946ef', '#a855f7'],
      ['#3b82f6', '#1d4ed8'], ['#14b8a6', '#0d9488'], ['#fb7185', '#e11d48'],
      ['#a855f7', '#7c3aed'], ['#eab308', '#ca8a04'], ['#64748b', '#334155'],
      ['#f97316', '#c2410c'], ['#2dd4bf', '#0f766e'], ['#ec4899', '#8b5cf6']
    ];

    for (let i = 0; i < 15; i++) {
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
      ctx.fillText(names[i], 200, 465);

      this.categoryData.photos[i].dataUrl = canvas.toDataURL('image/jpeg', 0.9);
      this.categoryData.photos[i].name = names[i];
    }

    await Database.saveCategory(this.categoryData);
    await this.updateCounts();
    this.renderGrid();
    this.showToast('15 örnek fotoğraf yüklendi!');
  }

  readFile(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = (e) => resolve(e.target.result);
      reader.onerror = (e) => reject(e);
      reader.readAsDataURL(file);
    });
  }

  showToast(msg) {
    const c = document.getElementById('toast-container');
    const t = document.createElement('div');
    t.className = 'bg-slate-800 text-white text-xs px-3 py-2 rounded-lg shadow-lg border border-slate-700';
    t.textContent = msg;
    c.appendChild(t);
    setTimeout(() => t.remove(), 2500);
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
