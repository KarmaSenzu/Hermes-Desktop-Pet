# Checklist Uji Coba — Hermes 3D Avatar

> **Status:** SIAP DIUJI (belum dijalankan)
> **Tujuan:** Daftar uji coba manual yang harus dijalankan di akhir sebelum
> commit/release. Coret `[x]` setelah berhasil.

---

## Persiapan

```bash
cd "/Users/damarfikrie/Documents/Coding/Hermes 3D Avatar (Asisten Ai ) /avatar"
rm -rf out node_modules/.vite
npm install   # bila ada dependency baru (mis. ws)
npm run dev
```

Pastikan `9router` jalan di terminal terpisah (checklist di Home).

---

## A. Settings — Navigasi & Tampilan

- [ ] App buka → langsung tampil Settings (bukan avatar).
- [ ] Tema dark macOS System Settings (bukan glassmorphism lama).
- [ ] Sidebar menampilkan **ikon SVG outline** (bukan emoji): house, user-round, mic, brain, puzzle, keyboard.
- [ ] Ikon aktif berwarna putih, normal mengikuti teks.
- [ ] Klik tiap sidebar → panel kanan berubah.
- [ ] Sidebar tidak ikut scroll saat content panel di-scroll.

## B. Home

- [ ] Checklist "9Router aktif" bisa dicentang & tersimpan (persisten).
- [ ] Status Hermes (badge aktif/mati) muncul.
- [ ] "Karakter Aktif" tampil (nama + format + thumbnail).
- [ ] Tombol "Mulai" membuka avatar.

## C. Karakter

- [ ] Daftar format tampil (VRM, GLB, PMX/PMD, FBX) sebagai card klik-able.
- [ ] Klik format → detail format (info lengkap, kelebihan/kekurangan, fitur).
- [ ] Tambah karakter (nama + file + foto JPG) → muncul di galeri grid.
- [ ] "Gunakan" → set karakter aktif → tampil di Home.
- [ ] "Hapus" → muncul modal konfirmasi → Batal (tidak hapus) / Hapus (terhapus).
- [ ] Tombol "‹ Kembali" → balik ke daftar format.

## D. Suara

- [ ] Toggle "Aktifkan suara" berfungsi & tersimpan.
- [ ] Pilih voice (dropdown) tersimpan.
- [ ] STT model & bahasa tersimpan.

## E. LLM & Provider

- [ ] "Model Aktif" terbaca dari Hermes (config.get provider).
- [ ] Switch model (input custom:nama-model → Terapkan) berfungsi.
- [ ] Tambah provider → muncul di daftar + tersimpan.
- [ ] Hapus provider → modal konfirmasi → terhapus.

## F. Skill

- [ ] Daftar skill tampil (accordion per kategori).
- [ ] Klik kategori → expand, lihat chip skill.
- [ ] Search bar → filter skill.
- [ ] Tambah skill (ketik isi SKILL.md) → tersimpan → list update (reload otomatis).
- [ ] Unggah file .md → isi textarea + nama otomatis.
- [ ] Hapus skill (×) → modal konfirmasi → terhapus + list update.

## G. Shortcut

- [ ] Daftar 3 shortcut tampil.
- [ ] Klik input → mode capture (hijau) → tekan kombinasi (mis. Cmd+1) → tampil "CommandOrControl+1".
- [ ] Simpan → tersimpan (persisten di ~/.hermes-avatar/shortcuts.json).
- [ ] Tekan shortcut global → aksi berjalan (toggle chat / mic / settings).

## H. Avatar (window transparan)

- [ ] Mulai → avatar tampil (full body, posisi sesuai).
- [ ] Blink + napas + gerak kepala (idle).
- [ ] Chat toggle (ikon 💬) → hide/show.
- [ ] Kirim pesan → Hermes jawab (streaming + final).
- [ ] TTS → avatar bicara (suara) + mulut gerak (lip sync).
- [ ] Mic 🎤 → bicara → transkripsi → Hermes jawab.
- [ ] Bubble status (Thinking/Processing/Speaking).
- [ ] DVD emote (📀) → bounce 5 detik.
- [ ] Tombol ⚙️ → kembali ke settings → bisa "Mulai" lagi.

---

## Catatan bug/isu yang ditemukan saat uji

| # | Deskripsi | Status |
|---|-----------|--------|
| 1 | | |
| 2 | | |
| 3 | | |

---

> Setelah semua teruji, laporkan hasil ke AI (termasuk bug yang ditemukan)
> sebelum commit final.
