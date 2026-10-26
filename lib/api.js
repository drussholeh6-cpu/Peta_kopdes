const fs = require('fs');
const path = require('path');

const DB = JSON.parse(fs.readFileSync(path.join(__dirname, '..', 'data.json'), 'utf8'));
const rows = DB.data.map(r => ({
  ...r,
  slug: r.provinsi.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, ''),
}));

const INDIKATOR = [
  { key: 'nib_pct', label: 'Berizin usaha (NIB)', ringkas: 'NIB', frasa: 'sudah punya NIB' },
  { key: 'npwp_pct', label: 'Terdaftar pajak (NPWP)', ringkas: 'NPWP', frasa: 'sudah punya NPWP' },
  { key: 'rat_pct', label: 'Sudah rapat anggota (RAT 2025)', ringkas: 'RAT', frasa: 'sudah menggelar RAT 2025' },
  { key: 'pemetaan_lahan_pct', label: 'Lahan sudah dipetakan', ringkas: 'Lahan', frasa: 'sudah memetakan lahan' },
  { key: 'pembangunan_gerai_pct', label: 'Progres pembangunan gerai', ringkas: 'Gerai', frasa: 'progres pembangunan gerainya' },
];

const total = rows.reduce((sum, row) => sum + row.jumlah_koperasi, 0);
const nasional = { jumlah_koperasi: total };
INDIKATOR.forEach(indikator => {
  nasional[indikator.key] = rows.reduce(
    (sum, row) => sum + row[indikator.key] * row.jumlah_koperasi,
    0,
  ) / total;
});

const pct = value => value.toFixed(1).replace('.', ',') + '%';
const rank = (key, row) => rows.filter(other => other[key] > row[key]).length + 1;

function detail(row) {
  const indikator = INDIKATOR.map(item => ({
    ...item,
    nilai: row[item.key],
    nasional: nasional[item.key],
    selisih: row[item.key] - nasional[item.key],
    peringkat: rank(item.key, row),
  }));
  const relevan = indikator.filter(item => item.key !== 'npwp_pct');
  const tertinggal = relevan.reduce((a, b) => b.selisih < a.selisih ? b : a);
  const terdepan = relevan.reduce((a, b) => b.selisih > a.selisih ? b : a);
  const kalimat = [
    `Di ${row.provinsi} tercatat ${row.jumlah_koperasi.toLocaleString('id-ID')} koperasi. ${pct(row.nib_pct)} di antaranya ${INDIKATOR[0].frasa}, sedangkan ${pct(row.rat_pct)} ${INDIKATOR[2].frasa}.`,
    tertinggal.selisih < 0
      ? `Tahap yang paling tertinggal adalah ${tertinggal.ringkas}: ${pct(tertinggal.nilai)}, ${pct(Math.abs(tertinggal.selisih)).replace('%', '')} poin di bawah rata-rata nasional (${pct(tertinggal.nasional)}).`
      : 'Semua tahap berada di atas atau setara rata-rata nasional.',
    terdepan.selisih > 0
      ? `Yang paling unggul adalah ${terdepan.ringkas}, ${pct(terdepan.selisih).replace('%', '')} poin di atas rata-rata nasional.`
      : '',
  ].filter(Boolean);
  return {
    ...row,
    indikator,
    kalimat,
    peringkat_koperasi: rank('jumlah_koperasi', row),
  };
}

function temuan() {
  return INDIKATOR.map(indikator => {
    const sorted = [...rows].sort((a, b) => b[indikator.key] - a[indikator.key]);
    const highest = sorted[0];
    const lowest = sorted[sorted.length - 1];
    return {
      key: indikator.key,
      label: indikator.label,
      nasional: nasional[indikator.key],
      tertinggi: { provinsi: highest.provinsi, slug: highest.slug, nilai: highest[indikator.key] },
      terendah: { provinsi: lowest.provinsi, slug: lowest.slug, nilai: lowest[indikator.key] },
    };
  });
}

function send(res, code, body, type = 'application/json; charset=utf-8', extra = {}) {
  res.writeHead(code, { 'Content-Type': type, ...extra });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function handleApi(req, res) {
  const url = new URL(req.url, `http://${req.headers.host || 'localhost'}`);
  const endpoint = url.pathname.replace(/\/$/, '');
  const query = url.searchParams;

  if (endpoint === '/api/ringkasan') {
    return send(res, 200, { meta: DB.meta, nasional, indikator: INDIKATOR, temuan: temuan() });
  }
  if (endpoint === '/api/provinsi') {
    const order = query.get('urut') || 'no';
    const direction = query.get('arah') === 'asc' ? 1 : -1;
    if (!(order in rows[0])) return send(res, 400, { error: `Kolom "${order}" tidak ada.` });
    const result = [...rows].sort((a, b) => order === 'provinsi'
      ? a.provinsi.localeCompare(b.provinsi) * -direction
      : (a[order] - b[order]) * direction);
    return send(res, 200, result);
  }
  if (endpoint.startsWith('/api/provinsi/')) {
    const row = rows.find(item => item.slug === endpoint.split('/')[3]);
    return row
      ? send(res, 200, { nasional, detail: detail(row) })
      : send(res, 404, { error: 'Provinsi tidak ditemukan.' });
  }
  if (endpoint === '/api/bandingkan') {
    const a = rows.find(row => row.slug === query.get('a'));
    const b = rows.find(row => row.slug === query.get('b'));
    if (!a || !b) return send(res, 400, { error: 'Pilih dua provinsi yang valid.' });
    return send(res, 200, { nasional, indikator: INDIKATOR, a: detail(a), b: detail(b) });
  }
  if (endpoint === '/api/unduh.json') {
    return send(res, 200, DB, undefined, {
      'Content-Disposition': 'attachment; filename="kopdes.json"',
    });
  }
  if (endpoint === '/api/unduh.csv') {
    const csv = fs.readFileSync(path.join(__dirname, '..', 'data.csv'));
    return send(res, 200, csv, 'text/csv; charset=utf-8', {
      'Content-Disposition': 'attachment; filename="kopdes.csv"',
    });
  }
  return send(res, 404, { error: 'Endpoint tidak ada.' });
}

module.exports = handleApi;
