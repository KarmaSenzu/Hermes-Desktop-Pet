# Struktur Tampilan Settings (Hermes 3D Avatar)

> **Tujuan:** Referensi lengkap struktur folder & komponen tampilan Settings,
> agar saat merombak struktur bisa tetap konsisten.
> **Terakhir diperbarui:** 2026-10-11

---

## 1. Ringkasan Arsitektur UI

Settings adalah **halaman utama (home)** yang tampil pertama kali saat app dibuka.
Layout memakai pola **macOS System Settings**: sidebar kiri + panel konten kanan.

```
┌─────────────────────────────────────────────┐
│  Sidebar (kiri)  │  Panel Konten (kanan)      │
│  ┌────────────┐  │  ┌──────────────────────┐  │
│  │ 🏠 Home     │  │  │  (isi panel aktif)   │  │
│  │ 🎭 Karakter │  │  │                      │  │
│  │ 🎤 Suara    │  │  │                      │  │
│  │ 🧠 LLM      │  │  │                      │  │
│  │ 🧩 Skill    │  │  │                      │  │
│  │ ⌨️ Shortcut │  │  │                      │  │
│  └────────────┘  │  └──────────────────────┘  │
└─────────────────────────────────────────────┘
```

---

## 2. Struktur File (lokasi fisik)

```
avatar/src/renderer/
├── settings.html              # Entry HTML — sidebar + semua panel section
├── styles/
│   └── launcher.css           # Style settings (glassmorphism dark + semua komponen)
└── js/
    ├── settings.js            # Logika settings (navigasi, render tiap panel)
    └── settings-store.js      # Persistensi localStorage (namespace per section)
```

> **Catatan:** File `settings.html` + `settings.js` + `launcher.css` saling
> terkait erat. Jika merombak, ketiganya harus diubah bersamaan.

---

## 3. Sidebar (navigasi)

Didefinisikan **terpusat** di `settings.js` dalam array `SECTIONS`:

```js
const SECTIONS = [
  { id: 'home',      icon: '🏠', label: 'Home' },
  { id: 'character', icon: '🎭', label: 'Karakter' },
  { id: 'voice',     icon: '🎤', label: 'Suara' },
  { id: 'llm',       icon: '🧠', label: 'LLM & Provider' },
  { id: 'skill',     icon: '🧩', label: 'Skill' },
  { id: 'shortcut',  icon: '⌨️', label: 'Shortcut' }
]
```

- Sidebar di-render otomatis dari `SECTIONS` (id, icon, label).
- `id` harus sama dengan `id` elemen panel (`panel-<id>`).

---

## 4. Panel Konten (section per sidebar)

Setiap sidebar item punya satu `<section class="panel" id="panel-<id>">`.

| Sidebar | Panel ID | Isi |
|---------|----------|-----|
| Home | `#panel-home` | Checklist 9Router, status Hermes, karakter aktif, tombol Mulai |
| Karakter | `#panel-character` | 2 view: daftar format → detail format (info + tambah + galeri) |
| Suara | `#panel-voice` | TTS (toggle + voice), STT (model + bahasa) |
| LLM | `#panel-llm` | Model aktif, switch model (RPC), tambah provider, list provider |
| Skill | `#panel-skill` | Tambah skill (nama/kategori/isi + upload .md), list skill (accordion + search) |
| Shortcut | `#panel-shortcut` | Daftar shortcut (edit kombinasi + deteksi keyboard) |

---

## 5. Komponen UI yang Dipakai (CSS class)

| Class | Fungsi |
|-------|--------|
| `.settings` | Container utama (flex 2 kolom) |
| `.sidebar` | Kolom kiri (brand + nav + footer) |
| `.nav-item` | Item sidebar (aktif = background accent) |
| `.content` | Kolom kanan (scrollable) |
| `.panel` | Section panel (`.active` = tampil) |
| `.card` | Kotak glassmorphism (isi konten) |
| `.field` | Label + input/select/textarea |
| `.switch-row` | Baris toggle (checkbox gaya iOS) |
| `.badge` | Pill status (`.on` hijau / `.off` merah) |
| `.primary` | Tombol utama (accent biru) |
| `.browse` | Tombol sekunder (pilih file / muat ulang) |
| `.back-btn` | Tombol kembali (sub-view) |
| `.hint` | Teks bantuan kecil |
| `.hidden` | Sembunyikan elemen |

### Komponen khusus per section

| Class | Section | Fungsi |
|-------|---------|--------|
| `.format-list` / `.format-item` | Karakter | Card format (klik-able) |
| `.format-detail` / `.feature-list` | Karakter | Detail format |
| `.char-gallery` / `.char-grid` / `.char-card` | Karakter | Galeri grid karakter |
| `.active-char-row` | Home | Tampilan karakter aktif |
| `.llm-list` / `.llm-item` | LLM | List provider |
| `.skill-toolbar` / `.skill-acc` / `.skill-chip` | Skill | Search + accordion + chips |
| `.shortcut-row` / `.shortcut-input` | Shortcut | Edit shortcut |

---

## 6. Persistensi (localStorage)

Di `settings-store.js`, satu objek settings dengan **namespace per section**:

```js
{
  tts: { enabled, voice },
  stt: { model, language },
  llm: { providers: [] },
  characters: [],           // [{ id, name, path, format, image, active }]
  routerChecked: false      // checklist 9Router
}
```

- Key localStorage: `hermes-avatar-settings`.
- Shortcut tersimpan terpisah di file `~/.hermes-avatar/shortcuts.json` (main process).
- Skill tersimpan di `~/.hermes/skills/` (via Hermes).

---

## 7. Alur Interaksi (event & RPC)

| Aksi | Mekanisme |
|------|-----------|
| Ganti panel | Klik `.nav-item` → toggle `.active` pada `.panel` |
| Karakter: buka format | `renderFormatList()` → klik → `openFormatDetail(ext)` |
| Karakter: tambah | `window.hermesAvatar.pickModelFile()` + `FileReader` (foto) |
| LLM: model aktif | `window.hermesAvatar.rpc('config.get', { key: 'provider' })` |
| LLM: switch model | `window.hermesAvatar.rpc('config.set', { key: 'model', value })` |
| Skill: list | `window.hermesAvatar.rpc('skills.manage', { action: 'list' })` |
| Skill: tambah | `window.hermesAvatar.addSkill({ name, category, content })` |
| Shortcut: list/ubah | `window.hermesAvatar.getShortcuts()` / `setShortcut(id, accel)` |
| Status Hermes | `window.hermesAvatar.getServiceStatus()` |

---

## 8. Panduan Menambah Sidebar Item Baru

1. Tambah di `SECTIONS` (settings.js):
   ```js
   { id: 'baru', icon: '⭐', label: 'Fitur Baru' }
   ```
2. Tambah panel di `settings.html`:
   ```html
   <section id="panel-baru" class="panel">
     <h1>Fitur Baru</h1>
     <p class="subtitle">Deskripsi.</p>
     ...
   </section>
   ```
3. (Opsional) Tambah logic render + panggil di `init()`.
4. (Opsional) Tambah namespace baru di `settings-store.js`.

---

## 9. Catatan Keamanan

- API key **tidak** disimpan di localStorage (masih form, nanti → `safeStorage`/Hermes config).
- File shortcut & token di `~/.hermes-avatar/` (di luar repo, aman dari git).
- Skill ditulis ke `~/.hermes/skills/` (di luar repo).
