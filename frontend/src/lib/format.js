// Formatting and small helpers shared across screens.

export const fmt = {
  kcal: (n) => Math.round(n).toLocaleString('en-MY'),
  kg: (n) => (Math.round(n * 10) / 10).toFixed(1),
  rm: (n) => `RM${Number(n).toFixed(2)}`,
  date: (iso, opts = { day: 'numeric', month: 'short', year: 'numeric' }) =>
    new Date(`${iso}T00:00:00`).toLocaleDateString('en-MY', opts),
};

export function localISO(d = new Date()) {
  const z = new Date(d.getTime() - d.getTimezoneOffset() * 60000);
  return z.toISOString().slice(0, 10);
}
export function addDays(iso, n) {
  const d = new Date(`${iso}T00:00:00`);
  d.setDate(d.getDate() + n);
  return localISO(d);
}
export function daysBetween(a, b) {
  return Math.round((new Date(`${b}T00:00:00`) - new Date(`${a}T00:00:00`)) / 86400000);
}

export function debounce(fn, ms = 300) {
  let t;
  return (...args) => { clearTimeout(t); t = setTimeout(() => fn(...args), ms); };
}

export const clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, v));

export function bmiOf(kg, cm) { const m = cm / 100; return Math.round((kg / (m * m)) * 10) / 10; }

// Shrink photos in the browser before upload: faster, cheaper, more private.
export async function resizeImage(file, max = 1024, quality = 0.85) {
  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bitmap.width, bitmap.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bitmap.width * scale);
  canvas.height = Math.round(bitmap.height * scale);
  canvas.getContext('2d').drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close?.();
  return new Promise((resolve) => canvas.toBlob(resolve, 'image/jpeg', quality));
}

export function greeting() {
  const h = new Date().getHours();
  if (h < 12) return 'Selamat pagi';
  if (h < 15) return 'Selamat tengah hari';
  if (h < 19) return 'Selamat petang';
  return 'Selamat malam';
}
