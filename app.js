// Frontend Peta Kopdes. Satu berkas untuk semua halaman; halaman dipilih lewat <body data-halaman>.
const $ = s => document.querySelector(s);
const angka = v => Math.round(v).toLocaleString('id-ID');
const persen = v => v.toFixed(1).replace('.', ',') + '%';
const rupiah = v => v >= 1e12 ? (v / 1e12).toFixed(1).replace('.', ',') + ' triliun' : v >= 1e9 ? (v / 1e9).toFixed(1).replace('.', ',') + ' miliar' : v >= 1e6 ? (v / 1e6).toFixed(1).replace('.', ',') + ' juta' : angka(v);
const param = k => new URLSearchParams(location.search).get(k);
const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

async function api(path) {
  try {
    const r = await fetch('/api/' + path);
    if (!r.ok) throw new Error((await r.json()).error || r.status);
    return await r.json();
  } catch (e) {
    const p = document.createElement('p');
    p.className = 'status';
    p.textContent = 'Data belum bisa dimuat. Pastikan server berjalan dengan perintah "node server.js", lalu buka alamat http://localhost:8000. (' + e.message + ')';
    document.querySelector('main').prepend(p);
    throw e;
  }
}

function isiPilihan(sel, daftar, terpilih) {
  sel.innerHTML = daftar.map(p => `<option value="${p.slug}"${p.slug === terpilih ? ' selected' : ''}>${esc(p.provinsi)}</option>`).join('');
}

// batang tunggal: nilai provinsi + garis rata-rata nasional
const batang = (v, nas, warna = '') => `<div class="bar" role="img" aria-label="${persen(v)}, rata-rata nasional ${persen(nas)}"><span class="${warna}" style="width:${v}%"></span>${nas != null ? `<i style="left:${nas}%"></i>` : ''}</div>`;

const halaman = {
  async beranda() {
    const [daftar, ring] = await Promise.all([api('provinsi?urut=provinsi&arah=asc'), api('ringkasan')]);
    isiPilihan($('#pilih'), daftar);
    $('#form').addEventListener('submit', e => { e.preventDefault(); location.href = 'provinsi.html?p=' + $('#pilih').value; });
    $('#total').textContent = angka(ring.nasional.jumlah_koperasi);
    $('#temuan').innerHTML = ring.temuan.filter(t => t.key !== 'npwp_pct').map(t => `
      <div class="temuan"><h3>${esc(t.label)}</h3>
      <p>Tertinggi di <a href="provinsi.html?p=${t.tertinggi.slug}">${esc(t.tertinggi.provinsi)}</a> (${persen(t.tertinggi.nilai)}), terendah di <a href="provinsi.html?p=${t.terendah.slug}">${esc(t.terendah.provinsi)}</a> (${persen(t.terendah.nilai)}). Rata-rata nasional ${persen(t.nasional)}.</p></div>`).join('');
  },

  async provinsi() {
    const daftar = await api('provinsi?urut=provinsi&arah=asc');
    const slug = param('p') || daftar[0].slug;
    isiPilihan($('#pilih'), daftar, slug);
    $('#pilih').addEventListener('change', e => { location.href = 'provinsi.html?p=' + e.target.value; });
    const { detail: d, nasional } = await api('provinsi/' + slug);
    document.title = d.provinsi + ' | Peta Kopdes';
    $('#judul').textContent = d.provinsi;
    $('#kalimat').innerHTML = d.kalimat.map(k => `<p>${esc(k)}</p>`).join('');
    $('#angka').innerHTML = `
      <div><strong>${angka(d.jumlah_koperasi)}</strong><span>koperasi tercatat, peringkat ${d.peringkat_koperasi} dari 38</span></div>
      <div><strong>Rp ${rupiah(d.simpanan_pokok + d.simpanan_wajib)}</strong><span>simpanan pokok dan wajib</span></div>
      <div><strong>${angka(d.volume_transaksi_2026)}</strong><span>transaksi di 2026, senilai Rp ${rupiah(d.nilai_transaksi_2026)}</span></div>`;
    $('#tahap').innerHTML = d.indikator.map(i => `
      <div class="baris"><span class="nama">${esc(i.label)}<br><small class="redup">peringkat ${i.peringkat} dari 38</small></span>
      ${batang(i.nilai, i.nasional, 'b')}<span class="angka">${persen(i.nilai)}</span></div>`).join('');
    $('#bandingkan').href = 'bandingkan.html?a=' + slug;
  },

  async bandingkan() {
    const daftar = await api('provinsi?urut=provinsi&arah=asc');
    const a = param('a') || daftar[0].slug, b = param('b') || daftar.find(p => p.slug !== a).slug;
    isiPilihan($('#a'), daftar, a); isiPilihan($('#b'), daftar, b);
    $('#form').addEventListener('submit', e => { e.preventDefault(); location.href = `bandingkan.html?a=${$('#a').value}&b=${$('#b').value}`; });
    if ($('#a').value === $('#b').value) { $('#hasil').innerHTML = '<p class="status">Pilih dua provinsi yang berbeda.</p>'; return; }
    const r = await api(`bandingkan?a=${a}&b=${b}`);
    $('#kunci').innerHTML = `<span><b style="background:var(--merah)"></b>${esc(r.a.provinsi)}</span><span><b style="background:var(--biru)"></b>${esc(r.b.provinsi)}</span><span><b style="background:var(--tinta);width:2px"></b>rata-rata nasional</span>`;
    $('#hasil').innerHTML = r.indikator.map((ind, n) => {
      const x = r.a.indikator[n], y = r.b.indikator[n];
      const barG = (v, w) => `<div class="bar ganda"><span class="${w}" style="width:${v}%"></span><i style="left:${x.nasional}%"></i></div>`;
      return `<div class="baris"><span class="nama">${esc(ind.label)}</span><div>${barG(x.nilai, 'b')}${barG(y.nilai, '')}</div>
        <span class="angka">${persen(x.nilai)}<br>${persen(y.nilai)}</span></div>`;
    }).join('');
    const jauh = r.indikator.map((ind, n) => ({ ind, s: r.a.indikator[n].nilai - r.b.indikator[n].nilai })).filter(o => o.ind.key !== 'npwp_pct').sort((p, q) => Math.abs(q.s) - Math.abs(p.s))[0];
    $('#simpul').textContent = `Selisih terbesar ada di tahap ${jauh.ind.ringkas}: ${jauh.s > 0 ? r.a.provinsi : r.b.provinsi} unggul ${persen(Math.abs(jauh.s)).replace('%', '')} poin.`;
  },

  async data() {
    const ring = await api('ringkasan');
    const sel = $('#indikator');
    sel.innerHTML = ring.indikator.map(i => `<option value="${i.key}">${esc(i.label)}</option>`).join('');
    $('#tanggal').textContent = ring.meta.tanggal_data || 'belum dicantumkan di berkas data';
    const gambar = async () => {
      const k = sel.value, nas = ring.nasional[k];
      const list = await api('provinsi?urut=' + k + '&arah=desc');
      $('#rata').textContent = persen(nas);
      $('#peringkat').innerHTML = list.map((p, n) => `<div class="baris"><span class="no">${n + 1}</span><a href="provinsi.html?p=${p.slug}">${esc(p.provinsi)}</a>${batang(p[k], nas, 'b')}<span class="angka">${persen(p[k])}</span></div>`).join('');
    };
    sel.addEventListener('change', gambar); gambar();

    const kolom = [['provinsi', 'Provinsi'], ['jumlah_koperasi', 'Koperasi'], ['nib_pct', 'NIB'], ['npwp_pct', 'NPWP'], ['rat_pct', 'RAT'], ['pemetaan_lahan_pct', 'Lahan'], ['pembangunan_gerai_pct', 'Gerai'], ['nilai_transaksi_2026', 'Nilai transaksi 2026 (Rp)']];
    let urut = 'provinsi', arah = 'asc';
    const tabel = async () => {
      const list = await api(`provinsi?urut=${urut}&arah=${arah}`);
      $('#tabel thead').innerHTML = '<tr>' + kolom.map(([k, n]) => `<th scope="col"${k === urut ? ` aria-sort="${arah === 'asc' ? 'ascending' : 'descending'}"` : ''}><button data-k="${k}">${n}</button></th>`).join('') + '</tr>';
      $('#tabel tbody').innerHTML = list.map(p => `<tr><td><a href="provinsi.html?p=${p.slug}">${esc(p.provinsi)}</a></td><td>${angka(p.jumlah_koperasi)}</td>${['nib_pct', 'npwp_pct', 'rat_pct', 'pemetaan_lahan_pct', 'pembangunan_gerai_pct'].map(k => `<td>${persen(p[k])}</td>`).join('')}<td>${angka(p.nilai_transaksi_2026)}</td></tr>`).join('');
    };
    $('#tabel').addEventListener('click', e => {
      const k = e.target.dataset.k; if (!k) return;
      arah = k === urut && arah === 'asc' ? 'desc' : 'asc'; urut = k; tabel();
    });
    tabel();
  },
};

const nama = document.body.dataset.halaman;
document.querySelectorAll('nav a').forEach(a => { if (a.dataset.h === nama) a.setAttribute('aria-current', 'page'); });
if (halaman[nama]) halaman[nama]().catch(() => {});
