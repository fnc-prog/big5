/**
 * Big5 Genel Fotoğraf Verisi (GitHub Pages üzerinden tüm ziyaretçilere sunulur)
 * Admin panelinden güncellenip GitHuba_Yukle.bat ile GitHub'a yüklendiğinde herkes görür.
 */

function generateSvgAvatar(text, subtext, color1, color2) {
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 400 500" width="400" height="500">
    <defs>
      <linearGradient id="grad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="${color1}"/>
        <stop offset="100%" stop-color="${color2}"/>
      </linearGradient>
    </defs>
    <rect width="400" height="500" fill="url(#grad)" rx="24"/>
    <circle cx="200" cy="200" r="110" fill="rgba(255,255,255,0.15)"/>
    <text x="200" y="225" font-family="sans-serif" font-size="80" font-weight="900" fill="#ffffff" text-anchor="middle">${text}</text>
    <rect y="410" width="400" height="90" fill="rgba(0,0,0,0.4)" rx="0"/>
    <text x="200" y="465" font-family="sans-serif" font-size="24" font-weight="bold" fill="#ffffff" text-anchor="middle">${subtext}</text>
  </svg>`;
  return 'data:image/svg+xml;utf8,' + encodeURIComponent(svg);
}

const colors = [
  ['#ec4899', '#f43f5e'], ['#8b5cf6', '#6366f1'], ['#06b6d4', '#3b82f6'],
  ['#10b981', '#059669'], ['#f59e0b', '#d97706'], ['#d946ef', '#a855f7'],
  ['#3b82f6', '#1d4ed8'], ['#14b8a6', '#0d9488'], ['#fb7185', '#e11d48'],
  ['#a855f7', '#7c3aed'], ['#eab308', '#ca8a04'], ['#64748b', '#334155'],
  ['#f97316', '#c2410c'], ['#2dd4bf', '#0f766e'], ['#ec4899', '#8b5cf6']
];

const kizIsimleri = ['Selin', 'Elif', 'Zeynep', 'Melis', 'Derin', 'Aslı', 'İpek', 'Ece', 'Damla', 'Bahar', 'Defne', 'Cemre', 'Naz', 'Lara', 'Deniz'];
const erkekIsimleri = ['Emir', 'Kaan', 'Burak', 'Mert', 'Can', 'Doruk', 'Arda', 'Eren', 'Ozan', 'Tolga', 'Barış', 'Sarp', 'Alp', 'Yiğit', 'Rüzgar'];

window.BIG5_SHARED_DATA = {
  kizlar: kizIsimleri.map((name, i) => ({
    slot: i + 1,
    name: name,
    dataUrl: generateSvgAvatar(`#${i + 1}`, name, colors[i][0], colors[i][1])
  })),
  erkekler: erkekIsimleri.map((name, i) => ({
    slot: i + 1,
    name: name,
    dataUrl: generateSvgAvatar(`#${i + 1}`, name, colors[i][0], colors[i][1])
  }))
};
