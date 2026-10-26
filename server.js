// Backend Peta Kopdes: server Node.js tanpa dependensi.
// Membaca data.json, menghitung rata-rata nasional, peringkat, dan ringkasan,
// lalu menyajikannya lewat /api/* dan menyajikan berkas statis dari folder proyek.
const http = require('http');
const fs = require('fs');
const path = require('path');

const PORT = process.env.PORT || 8000;
const PUB = __dirname;
const DB = JSON.parse(fs.readFileSync(path.join(PUB, 'data.json'), 'utf8'));

const slug = s => s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
const rows = DB.data.map(r => ({ ...r, slug: slug(r.provinsi) }));

// Indikator berupa persentase. Urutannya mengikuti tahapan koperasi.
const INDIKATOR = [
  { key: 'nib_pct', label: 'Berizin usaha (NIB)', ringkas: 'NIB', frasa: 'sudah punya NIB' },
  { key: 'npwp_pct', label: 'Terdaftar pajak (NPWP)', ringkas: 'NPWP', frasa: 'sudah punya NPWP' },
  { key: 'rat_pct', label: 'Sudah rapat anggota (RAT 2025)', ringkas: 'RAT', frasa: 'sudah menggelar RAT 2025' },
  { key: 'pemetaan_lahan_pct', label: 'Lahan sudah dipetakan', ringkas: 'Lahan', frasa: 'sudah memetakan lahan' },
  { key: 'pembangunan_gerai_pct', label: 'Progres pembangunan gerai', ringkas: 'Gerai', frasa: 'progres pembangunan gerainya' },
];

const total = rows.reduce((a, r) => a + r.jumlah_koperasi, 0);
const nasional = { jumlah_koperasi: total };
INDIKATOR.forEach(i => {
  nasional[i.key] = rows.reduce((a, r) => a + r[i.key] * r.jumlah_koperasi, 0) / total;
});

const pct = v => v.toFixed(1).replace('.', ',') + '%';
const rank = (k, r) => rows.filter(x => x[k] > r[k]).length + 1;

function detail(r) {
  const selisih = INDIKATOR.map(i => ({ ...i, nilai: r[i.key], nasional: nasional[i.key], selisih: r[i.key] - nasional[i.key], peringkat: rank(i.key, r) }));
  const tertinggal = selisih.filter(s => s.key !== 'npwp_pct').reduce((a, b) => (b.selisih < a.selisih ? b : a));
  const terdepan = selisih.filter(s => s.key !== 'npwp_pct').reduce((a, b) => (b.selisih > a.selisih ? b : a));
  const kalimat = [
    `Di ${r.provinsi} tercatat ${r.jumlah_koperasi.toLocaleString('id-ID')} koperasi. ${pct(r.nib_pct)} di antaranya ${INDIKATOR[0].frasa}, sedangkan ${pct(r.rat_pct)} ${INDIKATOR[2].frasa}.`,
    tertinggal.selisih < 0
      ? `Tahap yang paling tertinggal adalah ${tertinggal.ringkas}: ${pct(tertinggal.nilai)}, ${pct(Math.abs(tertinggal.selisih)).replace('%', '')} poin di bawah rata-rata nasional (${pct(tertinggal.nasional)}).`
      : `Semua tahap berada di atas atau setara rata-rata nasional.`,
    terdepan.selisih > 0 ? `Yang paling unggul adalah ${terdepan.ringkas}, ${pct(terdepan.selisih).replace('%', '')} poin di atas rata-rata nasional.` : '',
  ].filter(Boolean);
  return { ...r, indikator: selisih, kalimat, peringkat_koperasi: rank('jumlah_koperasi', r) };
}

function temuan() {
  return INDIKATOR.map(i => {
    const urut = [...rows].sort((a, b) => b[i.key] - a[i.key]);
    const t = urut[0], b = urut[urut.length - 1];
    return { key: i.key, label: i.label, nasional: nasional[i.key],
      tertinggi: { provinsi: t.provinsi, slug: t.slug, nilai: t[i.key] },
      terendah: { provinsi: b.provinsi, slug: b.slug, nilai: b[i.key] } };
  });
}

const send = (res, code, body, type = 'application/json; charset=utf-8', extra = {}) => {
  res.writeHead(code, { 'Content-Type': type, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
};

function api(url, res) {
  const p = url.pathname.replace(/\/$/, '');
  const q = url.searchParams;
  if (p === '/api/ringkasan') return send(res, 200, { meta: DB.meta, nasional, indikator: INDIKATOR, temuan: temuan() });
  if (p === '/api/provinsi') {
    const urut = q.get('urut') || 'no', arah = q.get('arah') === 'asc' ? 1 : -1;
    if (!(urut in rows[0])) return send(res, 400, { error: `Kolom "${urut}" tidak ada.` });
    const out = [...rows].sort((a, b) => urut === 'provinsi' ? a.provinsi.localeCompare(b.provinsi) * -arah : (a[urut] - b[urut]) * arah);
    return send(res, 200, out);
  }
  if (p.startsWith('/api/provinsi/')) {
    const r = rows.find(x => x.slug === p.split('/')[3]);
    return r ? send(res, 200, { nasional, detail: detail(r) }) : send(res, 404, { error: 'Provinsi tidak ditemukan.' });
  }
  if (p === '/api/bandingkan') {
    const a = rows.find(x => x.slug === q.get('a')), b = rows.find(x => x.slug === q.get('b'));
    if (!a || !b) return send(res, 400, { error: 'Pilih dua provinsi yang valid.' });
    return send(res, 200, { nasional, indikator: INDIKATOR, a: detail(a), b: detail(b) });
  }
  if (p === '/api/unduh.json') return send(res, 200, DB, undefined, { 'Content-Disposition': 'attachment; filename="kopdes.json"' });
  if (p === '/api/unduh.csv') return send(res, 200, fs.readFileSync(path.join(PUB, 'data.csv')), 'text/csv; charset=utf-8', { 'Content-Disposition': 'attachment; filename="kopdes.csv"' });
  return send(res, 404, { error: 'Endpoint tidak ada.' });
}

const MIME = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.json': 'application/json; charset=utf-8', '.csv': 'text/csv; charset=utf-8', '.svg': 'image/svg+xml' };

http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname.startsWith('/api/')) return api(url, res);
  let file = path.normalize(path.join(PUB, url.pathname === '/' ? 'index.html' : url.pathname));
  if (!file.startsWith(PUB)) return send(res, 403, 'Dilarang', 'text/plain');
  fs.readFile(file, (err, buf) => err ? send(res, 404, 'Halaman tidak ditemukan', 'text/plain; charset=utf-8') : send(res, 200, buf, MIME[path.extname(file)] || 'application/octet-stream'));
}).listen(PORT, () => console.log(`Peta Kopdes jalan di http://localhost:${PORT}`));
