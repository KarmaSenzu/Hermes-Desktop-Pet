# Hermes 3D Avatar — Master Development Standards

> **Status:** STANDAR WAJIB — berlaku untuk seluruh pengembangan berikutnya.
> **Tujuan:** Memastikan seluruh aplikasi konsisten, terstruktur, aman, dan
> mudah dikembangkan. Referensi desain utama: **macOS System Settings**.

---

## 1. Peran & Tanggung Jawab AI

Bertindak sebagai Senior Desktop Engineer + UI/UX Designer + Frontend Architect
+ Software Quality Engineer. Setiap fitur harus jadi bagian dari **satu sistem
yang konsisten**, bukan implementasi berdiri sendiri.

## 2. Visi

Aplikasi desktop AI assistant dengan karakter 3D (Hermes), dengan pengalaman
pengaturan ala **macOS System Settings**. Bukan menyalin macOS, tapi menerapkan
prinsip desainnya.

Prioritas (urut): konsistensi desain → kerapian content panel → fungsionalitas
→ keamanan → maintainability → lintas OS.

## 3. Arsitektur (jangan diubah sembarangan)

```
avatar/src/renderer/
├── settings.html        # kerangka: sidebar + panel
├── styles/launcher.css  # design tokens + komponen
└── js/
    ├── settings.js      # navigasi + render + integrasi
    └── settings-store.js# persistensi renderer
```

Integrasi main process via `window.hermesAvatar` (rpc, pickModelFile,
addSkill, getShortcuts, setShortcut, getServiceStatus, dll).

**Jangan** ganti teknologi/entry/API/RPC/komunikasi antarproses demi styling.
**Jangan** migrasi framework besar tanpa alasan & persetujuan.

## 4. Master Design System

- Gunakan **CSS variables** sebagai sumber nilai desain (warna, radius, spacing,
  ukuran kontrol, focus ring, hover/disabled).
- Satu design tokens terpusat; jangan tentukan nilai acak per fitur.
- Dark/light mode bisa diperluas tanpa tulis ulang komponen.
- Hindari glassmorphism berlebihan, gradient dekoratif, bayangan besar.
- Gunakan warna netral + border tipis + tipografi jelas + accent terukur.

## 5. Sidebar Navigation

- Item aktif jelas; hover/focus/disabled terdefinisi.
- Sidebar **tidak ikut scroll** saat content panel scroll.
- Navigasi terpusat (array `SECTIONS`).
- Setiap ID punya panel/route valid; aksesibilitas keyboard.

## 6. Content Panel (prioritas tertinggi)

### 6.1 Page Header
Judul + deskripsi singkat + jarak konsisten. Hindari judul berulang/deskripsi panjang.

### 6.2 Grouped Settings
- Setting sederhana → grouped rows + separator.
- Setting berkaitan → satu grup.
- Form kompleks → card/section sendiri.
- Daftar → list/tabel ringkas.
- Detail → detail pane terstruktur.
- Operasi berisiko → konfirmasi.

### 6.3 Settings Row
Pola: `Label (kiri) + deskripsi opsional (bawah) + Control (kanan)`.
Separator antar baris, kontrol sejajar.

### 6.4 Kontrol Formulir
Semua kontrol (input, select, textarea, toggle, button, badge, dll) konsisten:
ukuran, label, hover/focus/disabled/error, feedback, aksesibilitas keyboard.
Tidak boleh ada kontrol browser default yang tidak menyatu.

### 6.5 Content Density
Tidak renggang/padat berlebihan; sesuaikan komponen dengan fungsi halaman.

### 6.6 Scrolling
Scroll sidebar & content terpisah; tanpa horizontal overflow; daftar panjang
tetap mudah dinavigasi; resize tidak merusak alignment.

## 7. Komponen Reusable

Konsep komponen (boleh via fungsi render/helper, TANPA framework baru):
PageHeader, SettingsGroup, SettingsRow, SettingsField, SettingsInput,
SettingsSelect, SettingsToggle, SettingsButton, SettingsBadge, SearchField,
EmptyState, LoadingState, ErrorState, ConfirmDialog, DetailView.

**Jangan** menambah React/Vue/dll.

## 8. Standar Fitur Baru (Tahap A–E)

A. **Analisis** — pahami tujuan, file, API/RPC/state/storage, lokasi sidebar,
komponen, risiko regresi. Jangan kode dulu.
B. **Desain** — navigasi, judul, grouping, komponen, state (loading/success/
error/empty), alur, penyimpanan, perilaku saat Hermes off.
C. **Implementasi** — perubahan minimal, komponen reuse, validasi, error handling,
state konsisten, integrasi benar, persistensi sesuai, lintas OS.
D. **Validasi** — fungsi, desain, kontrol, simpan, error, navigasi, regresi, resize.
E. **Dokumentasi** — file diubah/ditambah, desain, perilaku, API/storage, uji
(dijalankan/belum), risiko, langkah berikutnya.

**Jangan** pakai data dummy seolah asli; jangan klaim sukses sebelum benar-benar.

## 9. CRUD

Hanya operasi relevan. Karakter (add/detail/edit/hapus/pilih aktif), Provider
(add/detail/edit/hapus/tes koneksi/model aktif), Skill (add/detail/edit/hapus/
cari/filter), Shortcut (lihat/ubah/validasi konflik/reset default/simpan).
Tombol Edit/Hapus/Simpan/Terapkan harus benar-benar berfungsi.

## 10. Fitur yang Tidak Boleh Rusak

Home (status Hermes, checklist 9Router, karakter aktif, mulai), Karakter (format,
detail, pilih file, galeri, kelola, aktif), Suara (TTS/STT), LLM (model aktif,
switch via RPC, provider, config.get/set), Skill (list/search/group/add/import md),
Shortcut (get/detect/ubah/simpan).

Jangan hapus/rename API yang dipakai tanpa alasan teknis.

## 11. Persistensi & Keamanan

- localStorage: `hermes-avatar-settings` (pengaturan renderer).
- `~/.hermes-avatar/shortcuts.json` (shortcut).
- `~/.hermes/skills/` (skill, via Hermes).

Aturan:
1. JANGAN simpan API key/secret di localStorage.
2. Jangan expose secret ke renderer/console/log/error.
3. Pakai Electron safeStorage / mekanisme aman Hermes.
4. Jangan tulis token/secret ke repo.
5. Jangan ubah format storage tanpa cek kompatibilitas; migrasi aman jika perlu.
6. Jangan baca/tulis file sistem via renderer langsung.
7. Pakai API preload + IPC tervalidasi.

## 12. Konsistensi Lintas Halaman

Bandingkan tiap fitur dengan halaman lain; jangan ada inline style duplikat
tokens; jangan CSS override bertumpuk tanpa alasan.

## 13. Anti-Regresi

Jangan tulis ulang semua, hapus fungsi lama, ganti RPC dengan simulasi, ubah
struktur data tanpa migrasi, rename file/ID tanpa update referensi, sembunyikan
error, pakai mock data, tambah dependensi besar, atau ubah implementasi 3D/
kamera/model/komunikasi saat tugasnya hanya UI settings.

## 14. Definition of Done

Selesai = tujuan tercapai + UI sesuai design system + panel rapi + kontrol benar
+ data tersimpan benar + state ditangani + navigasi/lama tetap jalan + keamanan
terjaga + tidak ada perubahan tak terkait + uji dijalankan (atau batasannya
dilaporkan) + dokumentasi update.

## 15. Format Laporan

1. Ringkasan (tujuan & hasil).
2. Perubahan UI/UX.
3. File diubah (dan tanggung jawab).
4. Integrasi & persistensi.
5. Validasi (yang benar-benar dijalankan).
6. Risiko & catatan.
7. Langkah berikutnya.

## 16. Aturan Paling Penting

Setiap fitur harus terlihat & berperilaku **seolah dirancang sebagai bagian dari
Hermes sejak awal** — bukan ditambahkan belakangan dengan pola berbeda.
