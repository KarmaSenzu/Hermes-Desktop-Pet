/**
 * i18n.js — Internationalization (L10n) ringan untuk renderer.
 *
 * Desain:
 *  - `id` adalah bahasa sumber (canonical). `en` adalah terjemahan.
 *  - `t(key, vars)` mengambil string aktif + interpolasi `{var}`.
 *  - `setLocale(locale)` mengganti bahasa + menyiarkan perubahan (event lokal + storage lintas-window).
 *  - Dilengkapi helper `applyTranslations(root)` untuk patch DOM via atribut data-i18n.
 *
 * Modul ini diimpor oleh window avatar & settings (lewat chunk bersama Vite).
 */

export const SUPPORTED_LOCALES = ['id', 'en']
export const DEFAULT_LOCALE = 'id'
const LANG_KEY = 'hermes-avatar-language'

const DICT = {
  id: {
    // ── Common ──
    'common.save': 'Simpan',
    'common.cancel': 'Batal',
    'common.close': 'Tutup',
    'common.ok': 'Oke',
    'common.yes': 'Ya',
    'common.no': 'Tidak',
    'common.loading': 'Memuat…',
    'common.error': 'Terjadi kesalahan',
    'common.retry': 'Coba lagi',
    'common.search': 'Cari',
    // ── Avatar (bubble/speech) ──
    'avatar.welcome': 'Halo! Selamat datang di Hermes Desktop Pet',
    'avatar.music.playing': 'Memutar musik companion untukmu.',
    'avatar.music.playingSpeak': 'Memutar musik companion untukmu sekarang!',
    'avatar.voice.on': 'Suara diaktifkan 🔊',
    'avatar.voice.off': 'Suara dibisukan 🔇',
    'avatar.thinking': 'Hermes sedang bekerja…',
    'avatar.input.placeholder': 'Ketik pesan...',
    'avatar.app.notFound': 'Aplikasi {name} tidak cocok dengan daftar lokal.',
    // ── Idle chatter (health reminders) ──
    'avatar.idle.lines': [
      'Jangan lupa minum air putih ya 💧',
      'Postur tubuhnya ditegakkan dulu yuk, biar punggung tidak pegal 🧘',
      'Fokus kerja hebat banget! Semangat terus ya ✨',
      'Istirahatkan mata sebentar, lihat sesuatu yang jauh selama 20 detik 👀',
      'Sudah makan belum? Jangan sampai telat makan ya 🍚',
      'Tarik napas dalam-dalam, rileks sejenak 🌿'
    ],
    // ── Settings: language ──
    'settings.language.title': 'Bahasa Antarmuka',
    'settings.language.desc': 'Pilih bahasa tampilan aplikasi. Perubahan langsung diterapkan.',
    'settings.language.id': 'Bahasa Indonesia',
    'settings.language.en': 'English',
    // ── Nav / sidebar (selalu terlihat) ──
    'nav.home': 'Home',
    'nav.package': 'Package Hub',
    'nav.character': 'Karakter & Model',
    'nav.animation': 'Animasi & Emote',
    'nav.voice': 'Suara & TTS',
    'nav.llm': 'LLM & Provider',
    'nav.skill': 'Skill & Ekstensi',
    'nav.brain': 'Hermes Brain & Otomasi',
    'nav.storage': 'Penyimpanan',
    'nav.action': 'Perintah & App',
    'nav.shortcut': 'Shortcut Global',
    // ── Shell / chrome ──
    'shell.search': 'Cari',
    'shell.prev': 'Sebelumnya',
    'shell.next': 'Berikutnya',
    'shell.profileSub': 'Personal Companion',
    'shell.footerTitle': 'Klik untuk memeriksa pembaruan aplikasi',
    'shell.update': 'Update',
    'common.delete': 'Hapus',
    'common.copy': 'Salin',

    // ── Modal ──
    'modal.confirm.title': 'Konfirmasi',
    'modal.prereq.title': 'Prasyarat Sistem Belum Siap',
    'modal.prereq.desc': 'Beberapa komponen belum aktif sebelum avatar dimulai:',
    'modal.prereq.hint': 'Pilih salah satu opsi di bawah untuk menyalakan otomatis, membuka Package Hub, atau tetap menjalankan avatar dalam mode visual tampilan saja.',
    'modal.prereq.openHub': 'Buka Package Hub',
    'modal.prereq.pickLlm': 'Pilih Model LLM',
    'modal.prereq.auto': 'Nyalakan Otomatis',
    'modal.prereq.force': 'Tetap Mulai Saja',
    'modal.update.title': 'Pembaruan Aplikasi Tersedia',
    'modal.update.subtitle': 'Versi baru telah rilis di GitHub.',
    'modal.update.currentVer': 'Versi Terpasang:',
    'modal.update.latestVer': 'Versi Terbaru:',
    'modal.update.latestBadge': 'Rilis Terbaru',
    'modal.update.downloading': 'Mengunduh paket pembaruan...',
    'modal.update.changelog': 'Catatan Perubahan (Changelog):',
    'modal.update.cli': 'Atau Update Otomatis lewat Terminal (1 Baris Perintah):',
    'modal.update.copyTitle': 'Salin perintah terminal',
    'modal.update.githubPage': 'Halaman Rilis GitHub',
    'modal.update.autoNow': 'Update Otomatis Sekarang',

    // ── Panel: Home ──
    'home.subtitle': 'Status sistem & mulai avatar.',
    'home.banner.title': 'Pembaruan Aplikasi Tersedia',
    'home.banner.desc': 'Versi baru telah rilis di GitHub dengan pembaruan stabilitas dan fitur.',
    'home.banner.downloading': 'Mengunduh pembaruan...',
    'home.banner.updateNow': 'Update Sekarang',
    'home.banner.details': 'Info Rilis',
    'home.banner.closeTitle': 'Tutup pemberitahuan ini',
    'home.setup.title': 'Persiapan Paket Diperlukan',
    'home.setup.desc': 'Beberapa paket penting (Hermes atau mesin suara avatar) belum aktif atau belum terpasang. Buka menu Package Hub untuk melengkapi persiapan.',
    'home.setup.install': 'Install Otomatis 1-Klik',
    'home.setup.openHub': 'Buka Package Hub',
    'home.prereq.group': 'Kondisi Prasyarat Memulai (Checklist)',
    'home.prereq.checking': 'Pengecekan…',
    'home.model.title': 'Model Karakter Visual',
    'home.model.desc': 'Model avatar 2D / 3D aktif',
    'home.engine.title': 'Mesin Kecerdasan Avatar',
    'home.engine.desc': 'Otomatis aktif di latar belakang saat avatar berjalan',
    'home.engine.powerOn': 'Nyalakan',
    'home.engine.powerOnTitle': 'Jalankan layanan AI otomatis',
    'home.llm.title': 'Jalur Koneksi & Uji Ping LLM (OAuth / 9Router Opsional)',
    'home.llm.desc': 'Bebas memakai Login OAuth Resmi atau 9Router Lokal (opsional) — yang penting uji ping ke model berhasil & tidak RTO',
    'home.llm.checking': 'Memeriksa…',
    'home.llm.pingTitle': 'Uji koneksi ping ke model LLM aktif untuk memastikan bukan RTO',
    'home.llm.pingBtn': 'Tes Ping',
    'home.llmModel.title': 'Model LLM Terpilih',
    'home.llmModel.desc': 'Model kecerdasan aktif (OAuth Resmi / API Key / 9Router Opsional)',
    'home.tts.title': 'Mesin Suara Avatar (TTS)',
    'home.tts.desc': 'Penyedia suara untuk respons audio',
    'home.version.title': 'Versi & Pembaruan Aplikasi',
    'home.version.desc': 'Versi terpasang: Memeriksa…',
    'home.version.checkTitle': 'Periksa apakah ada pembaruan rilis baru di GitHub',
    'home.version.checkBtn': 'Cek Update',
    'home.start': 'Mulai Desktop Avatar',

    // ── Panel: Voice ──
    'voice.title': 'Suara',
    'voice.subtitle': 'Pengaturan Text-to-Speech & Speech-to-Text.',
    'voice.tts.group': 'Text-to-Speech (TTS)',
    'voice.tts.enable': 'Aktifkan Suara',
    'voice.tts.enableDesc': 'Narasikan teks respon melalui audio avatar',
    'voice.tts.engine': 'Engine Suara (Provider)',
    'voice.tts.engineDesc': 'Modul pemroses sintesis ucapan',
    'voice.tts.optKokoro': 'Kokoro-TTS (Lokal AI Anime)',
    'voice.tts.optEdge': 'Edge-TTS (Microsoft Cloud)',
    'voice.accent.label': 'Negara & Intonasi Aksen',
    'voice.accent.desc': 'Filter karakter vokal berdasarkan rumpun bahasa & negara',
    'voice.accent.all': 'Semua Negara & Aksen (56 Karakter)',
    'voice.voice.label': 'Pilihan Karakter Suara',
    'voice.voice.desc': 'Model timbre dan warna vokal aktif',
    'voice.style.label': 'Gaya Intonasi & Pelafalan',
    'voice.style.desc': 'Metode pengucapan fonem kata (vokal jernih tanpa eja per abjad)',
    'voice.preview.group': 'Pengujian Suara (Audio Preview)',
    'voice.preview.desc': 'Dengarkan sampel ucapan langsung dari karakter vokal yang dipilih',
    'voice.preview.text': 'Halo! Saya adalah avatar desktop pintar Anda.',
    'voice.preview.ph': 'Ketik kalimat tes...',
    'voice.preview.title': 'Dengarkan pengujian suara',
    'voice.preview.btn': 'Uji',
    'voice.endpoint.label': 'Endpoint Server Kokoro',
    'voice.endpoint.desc': 'URL service daemon ONNX lokal',
    'voice.speed.label': 'Kecepatan Bicara',
    'voice.speed.desc': 'Laju tempo pelafalan kata',
    'voice.len.label': 'Panjang Jawaban Dibaca',
    'voice.len.desc': 'Tingkat keringkasan respon yang disuarakan',
    'voice.len.concise': 'Ringkas (ringkasan inti)',
    'voice.len.full': 'Lengkap (seluruh teks)',
    'voice.stt.group': 'Speech-to-Text (STT)',
    'voice.stt.model': 'Model Whisper',
    'voice.stt.modelDesc': 'Keseimbangan kecepatan & akurasi transkripsi',
    'voice.stt.modelBase': 'base (ringan & cepat)',
    'voice.stt.modelSmall': 'small (lebih akurat)',
    'voice.stt.lang': 'Bahasa Pengenalan',
    'voice.stt.langDesc': 'Bahasa utama yang dideteksi mikrofon',
    'voice.stt.langId': 'Bahasa Indonesia',
    'voice.stt.langEn': 'English (US)',
    'voice.interact.group': 'Interaksi & Percakapan',
    'voice.bargein.label': 'Izinkan Interupsi (Barge-In)',
    'voice.bargein.desc': 'Otomatis jeda suara avatar saat Anda mulai berbicara',
    'voice.continuous.label': 'Mode Percakapan Berkelanjutan',
    'voice.continuous.desc': 'Mikrofon otomatis aktif kembali setelah avatar selesai bicara',
    'voice.music.group': 'Pustaka Musik & Playlist Favorit (Penyimpanan Permanen)',
    'voice.music.storage': 'Ruang Penyimpanan Pustaka Musik',
    'voice.music.saved': 'Tersimpan Permanen',
    'voice.music.local': 'Berkas lokal:',
    'voice.music.openFolder': 'Buka Folder',
    'voice.music.status': 'Status Pustaka & Playlist',
    'voice.music.loading': 'Memuat status lagu stream dan favorit tersimpan...',
    'voice.music.refresh': 'Segarkan',
    'voice.music.addStream': 'Tambah Link Stream / YouTube ke Penyimpanan',
    'voice.music.addStreamDesc': 'Disimpan permanen ke perangkat Anda',
    'voice.music.urlPh': 'URL YouTube / Link Stream (https://...)',
    'voice.music.save': 'Simpan ke Pustaka',

    // ── Panel: Karakter ──
    'panel.character.title': 'Karakter',
    'panel.character.subtitle': 'Kelola & pilih avatar.',
    'panel.character.group.formats': 'Format yang Didukung',
    'common.back': 'Kembali',
    // ── Panel: Animasi ──
    'panel.animation.title': 'Animasi',
    'panel.animation.subtitle': 'Atur gaya avatar saat berpikir, memegang jam/timer, memproses, serta kelola animasi kustom.',
    'panel.animation.group.categories': 'Kategori Animasi & Pose',
    // ── Panel: Shortcut ──
    'panel.shortcut.title': 'Shortcut Global',
    'panel.shortcut.subtitle': 'Kombinasi tombol pintasan yang dapat ditekan di aplikasi manapun.',
    'panel.shortcut.group.list': 'Daftar Pintasan Keyboard',
    'panel.shortcut.hint': 'Shortcut global tetap aktif di latar belakang (background) saat Anda sedang membuka aplikasi lain.',
    // ── Panel: Perintah & App ──
    'panel.action.title': 'Perintah & Aplikasi',
    'panel.action.subtitle': 'Atur izin aksi sistem & integrasi peluncuran aplikasi lokal.',
    'panel.action.group.permissions': 'Hak Akses & Izin Sistem',
    'panel.action.hint': 'Aksi berisiko tinggi (terminal/shell) otomatis meminta dialog konfirmasi sebelum dijalankan.',
    'panel.action.group.apps': 'Aplikasi Lokal Terintegrasi',
    'panel.action.scan.title': 'Pindai Aplikasi Otomatis',
    'panel.action.scan.desc': 'Deteksi otomatis seluruh aplikasi terpasang (Windows / macOS / Linux)',
    'panel.action.scan.btn': 'Pindai Aplikasi',
    'panel.action.add.title': 'Tambah Aplikasi Manual',
    'panel.action.add.desc': 'Daftarkan file .exe, .lnk, atau .app aplikasi lokal',
    'panel.action.add.namePh': 'Nama aplikasi',
    'panel.action.add.pathPh': 'Path .exe / .lnk / .app',
    'panel.action.add.pick': 'Pilih…',
    'panel.action.add.btn': 'Tambah',
    'panel.action.group.registered': 'Daftar Aplikasi Terdaftar',
    // ── Panel: Penyimpanan ──
    'panel.storage.title': 'Penyimpanan',
    'panel.storage.subtitle': 'Lihat pemakaian ruang lokal sistem oleh obrolan, gambar, file lampiran, paket, dan cache Anda.',
    'panel.storage.scanning': 'Memindai penyimpanan lokal…',
    'panel.storage.calc': 'Menghitung rincian direktori...',
    'panel.storage.capLabel': 'Batas Pengingat:',
    'panel.storage.refresh': 'Segarkan',
    'panel.storage.archive': 'Arsipkan otomatis screenshot & file yang dijatuhkan ke avatar',
    'panel.storage.cleanCache': 'Bersihkan Cache & Log',
    'panel.storage.group.manage': 'Kelola penyimpanan',
    'panel.storage.manageHint': 'Klik kategori di bawah untuk melihat rincian isi folder, pratinjau gambar, atau mengosongkan ruang.',
    'panel.storage.group.engine': 'Engine & Runtime (Info Saja)',
    'panel.storage.backToStorage': 'Kembali ke Penyimpanan',
    'panel.storage.detailTitle': 'Rincian Kategori',
    // ── Panel: Skill ──
    'panel.skill.title': 'Skill & Ekstensi',
    'panel.skill.subtitle': 'Kelola kemampuan AI, alat bantu, dan integrasi Hermes.',
    'panel.skill.group.installed': 'Pustaka Skill Terpasang',
    'panel.skill.searchPh': 'Cari skill terpasang...',
    'panel.skill.reload': 'Muat Ulang',
    'panel.skill.reloadTitle': 'Muat ulang daftar skill dari disk',
    'panel.skill.group.install': 'Install Skill dari Hub Resmi',
    'panel.skill.idLabel': 'Skill Identifier',
    'panel.skill.idPh': 'official/research/...',
    'panel.skill.installBtn': 'Install Skill',
    'panel.skill.group.create': 'Buat / Unggah Skill Kustom (Opsional)',
    'panel.skill.create.title': 'Buat Skill Baru (Tulis SKILL.md / Upload)',
    'panel.skill.create.sub': 'Tambahkan instruksi AI, prompt kustom, atau file markdown sendiri',
    'panel.skill.name.label': 'Nama Skill',
    'panel.skill.name.desc': 'Identifier unik (huruf kecil & strip)',
    'panel.skill.name.ph': 'cth. my-custom-skill',
    'panel.skill.category.label': 'Kategori (Opsional)',
    'panel.skill.category.desc': 'Pengelompokan folder skill',
    'panel.skill.category.ph': 'cth. general / productivity',
    'panel.skill.content.label': 'Isi Instruksi (SKILL.md):',
    'panel.skill.content.ph': 'Tulis instruksi skill dan peran AI di sini...',
    'panel.skill.upload': 'Unggah File .md',
    'panel.skill.save': 'Simpan Skill ke Disk',
  },
  en: {
    'common.save': 'Save',
    'common.cancel': 'Cancel',
    'common.close': 'Close',
    'common.ok': 'OK',
    'common.yes': 'Yes',
    'common.no': 'No',
    'common.loading': 'Loading…',
    'common.error': 'Something went wrong',
    'common.retry': 'Retry',
    'common.search': 'Search',
    'avatar.welcome': 'Hi! Welcome to Hermes Desktop Pet 👋',
    'avatar.music.playing': 'Playing companion music for you.',
    'avatar.music.playingSpeak': 'Playing companion music for you now!',
    'avatar.voice.on': 'Sound on 🔊',
    'avatar.voice.off': 'Sound muted 🔇',
    'avatar.thinking': 'Hermes is working…',
    'avatar.input.placeholder': 'Type a message...',
    'avatar.app.notFound': 'App {name} does not match the local list.',
    'avatar.idle.lines': [
      "Don't forget to drink water 💧",
      'Straighten your posture, keep your back relaxed 🧘',
      'Great focus! Keep it up ✨',
      'Rest your eyes — look at something far for 20 seconds 👀',
      'Have you eaten? Try not to skip meals 🍚',
      'Take a deep breath and relax for a moment 🌿'
    ],
    'settings.language.title': 'Interface Language',
    'settings.language.desc': 'Choose the app display language. Changes apply instantly.',
    'settings.language.id': 'Bahasa Indonesia',
    'settings.language.en': 'English',
    'nav.home': 'Home',
    'nav.package': 'Package Hub',
    'nav.character': 'Characters & Models',
    'nav.animation': 'Animations & Emotes',
    'nav.voice': 'Voice & TTS',
    'nav.llm': 'LLM & Providers',
    'nav.skill': 'Skills & Extensions',
    'nav.brain': 'Hermes Brain & Automation',
    'nav.storage': 'Storage',
    'nav.action': 'Commands & Apps',
    'nav.shortcut': 'Global Shortcuts',
    'shell.search': 'Search',
    'shell.prev': 'Previous',
    'shell.next': 'Next',
    'shell.profileSub': 'Personal Companion',
    'shell.footerTitle': 'Click to check for application updates',
    'shell.update': 'Update',
    'common.delete': 'Delete',
    'common.copy': 'Copy',

    'modal.confirm.title': 'Confirm',
    'modal.prereq.title': 'System Prerequisites Not Ready',
    'modal.prereq.desc': 'Some components are not active yet before the avatar starts:',
    'modal.prereq.hint': 'Choose one option below to enable automatically, open the Package Hub, or still start the avatar in visual-only mode.',
    'modal.prereq.openHub': 'Open Package Hub',
    'modal.prereq.pickLlm': 'Choose LLM Model',
    'modal.prereq.auto': 'Enable Automatically',
    'modal.prereq.force': 'Start Anyway',
    'modal.update.title': 'Application Update Available',
    'modal.update.subtitle': 'A new version has been released on GitHub.',
    'modal.update.currentVer': 'Installed Version:',
    'modal.update.latestVer': 'Latest Version:',
    'modal.update.latestBadge': 'Latest Release',
    'modal.update.downloading': 'Downloading update package...',
    'modal.update.changelog': 'Changelog:',
    'modal.update.cli': 'Or Auto-Update via Terminal (One Command Line):',
    'modal.update.copyTitle': 'Copy terminal command',
    'modal.update.githubPage': 'GitHub Release Page',
    'modal.update.autoNow': 'Auto-Update Now',

    'home.subtitle': 'System status & start avatar.',
    'home.banner.title': 'Application Update Available',
    'home.banner.desc': 'A new version has been released on GitHub with stability and feature updates.',
    'home.banner.downloading': 'Downloading update...',
    'home.banner.updateNow': 'Update Now',
    'home.banner.details': 'Release Info',
    'home.banner.closeTitle': 'Dismiss this notification',
    'home.setup.title': 'Package Setup Required',
    'home.setup.desc': 'Some important packages (Hermes or the avatar voice engine) are not active or not installed. Open the Package Hub to complete setup.',
    'home.setup.install': 'Auto-Install (1-Click)',
    'home.setup.openHub': 'Open Package Hub',
    'home.prereq.group': 'Startup Prerequisites (Checklist)',
    'home.prereq.checking': 'Checking…',
    'home.model.title': 'Visual Character Model',
    'home.model.desc': 'Active 2D / 3D avatar model',
    'home.engine.title': 'Avatar Intelligence Engine',
    'home.engine.desc': 'Automatically active in the background while the avatar runs',
    'home.engine.powerOn': 'Turn On',
    'home.engine.powerOnTitle': 'Run the AI service automatically',
    'home.llm.title': 'Connection Path & LLM Ping Test (Optional OAuth / 9Router)',
    'home.llm.desc': 'Freely use Official OAuth Login or Local 9Router (optional) — what matters is the model ping succeeds & is not timing out',
    'home.llm.checking': 'Checking…',
    'home.llm.pingTitle': 'Ping the active LLM model to ensure it is not timing out',
    'home.llm.pingBtn': 'Ping Test',
    'home.llmModel.title': 'Selected LLM Model',
    'home.llmModel.desc': 'Active intelligence model (Official OAuth / API Key / Optional 9Router)',
    'home.tts.title': 'Avatar Voice Engine (TTS)',
    'home.tts.desc': 'Voice provider for audio responses',
    'home.version.title': 'App Version & Updates',
    'home.version.desc': 'Installed version: Checking…',
    'home.version.checkTitle': 'Check whether a new release is available on GitHub',
    'home.version.checkBtn': 'Check Update',
    'home.start': 'Start Desktop Avatar',

    'voice.title': 'Voice',
    'voice.subtitle': 'Text-to-Speech & Speech-to-Text settings.',
    'voice.tts.group': 'Text-to-Speech (TTS)',
    'voice.tts.enable': 'Enable Voice',
    'voice.tts.enableDesc': 'Narrate response text through the avatar audio',
    'voice.tts.engine': 'Voice Engine (Provider)',
    'voice.tts.engineDesc': 'Speech synthesis processor module',
    'voice.tts.optKokoro': 'Kokoro-TTS (Local Anime AI)',
    'voice.tts.optEdge': 'Edge-TTS (Microsoft Cloud)',
    'voice.accent.label': 'Country & Accent',
    'voice.accent.desc': 'Filter voice characters by language family & country',
    'voice.accent.all': 'All Countries & Accents (56 Characters)',
    'voice.voice.label': 'Voice Character',
    'voice.voice.desc': 'Active timbre and vocal color model',
    'voice.style.label': 'Intonation & Pronunciation Style',
    'voice.style.desc': 'Word phoneme pronunciation method (clear vowels without per-letter spelling)',
    'voice.preview.group': 'Voice Test (Audio Preview)',
    'voice.preview.desc': 'Listen to a live speech sample from the selected voice character',
    'voice.preview.text': 'Hello! I am your smart desktop avatar.',
    'voice.preview.ph': 'Type a test sentence...',
    'voice.preview.title': 'Listen to the voice test',
    'voice.preview.btn': 'Test',
    'voice.endpoint.label': 'Kokoro Server Endpoint',
    'voice.endpoint.desc': 'Local ONNX daemon service URL',
    'voice.speed.label': 'Speech Rate',
    'voice.speed.desc': 'Word pronunciation tempo',
    'voice.len.label': 'Spoken Answer Length',
    'voice.len.desc': 'How concise the spoken response is',
    'voice.len.concise': 'Concise (key summary)',
    'voice.len.full': 'Full (entire text)',
    'voice.stt.group': 'Speech-to-Text (STT)',
    'voice.stt.model': 'Whisper Model',
    'voice.stt.modelDesc': 'Balance of transcription speed & accuracy',
    'voice.stt.modelBase': 'base (light & fast)',
    'voice.stt.modelSmall': 'small (more accurate)',
    'voice.stt.lang': 'Recognition Language',
    'voice.stt.langDesc': 'Primary language the microphone detects',
    'voice.stt.langId': 'Indonesian',
    'voice.stt.langEn': 'English (US)',
    'voice.interact.group': 'Interaction & Conversation',
    'voice.bargein.label': 'Allow Interruption (Barge-In)',
    'voice.bargein.desc': 'Automatically pause avatar speech when you start talking',
    'voice.continuous.label': 'Continuous Conversation Mode',
    'voice.continuous.desc': 'Microphone automatically reactivates after the avatar finishes speaking',
    'voice.music.group': 'Music Library & Favorite Playlists (Permanent Storage)',
    'voice.music.storage': 'Music Library Storage',
    'voice.music.saved': 'Permanently Saved',
    'voice.music.local': 'Local files:',
    'voice.music.openFolder': 'Open Folder',
    'voice.music.status': 'Library & Playlist Status',
    'voice.music.loading': 'Loading stream and saved favorite song status...',
    'voice.music.refresh': 'Refresh',
    'voice.music.addStream': 'Add Stream / YouTube Link to Storage',
    'voice.music.addStreamDesc': 'Saved permanently to your device',
    'voice.music.urlPh': 'YouTube URL / Stream Link (https://...)',
    'voice.music.save': 'Save to Library',

    'panel.character.title': 'Characters',
    'panel.character.subtitle': 'Manage & choose avatars.',
    'panel.character.group.formats': 'Supported Formats',
    'common.back': 'Back',
    'panel.animation.title': 'Animations',
    'panel.animation.subtitle': 'Control how the avatar looks while thinking, holding a clock/timer, processing, and manage custom animations.',
    'panel.animation.group.categories': 'Animation Categories & Poses',
    'panel.shortcut.title': 'Global Shortcuts',
    'panel.shortcut.subtitle': 'Keyboard shortcuts you can press in any application.',
    'panel.shortcut.group.list': 'Keyboard Shortcut List',
    'panel.shortcut.hint': 'Global shortcuts stay active in the background while you are using other applications.',
    'panel.action.title': 'Commands & Applications',
    'panel.action.subtitle': 'Configure system action permissions & local app launch integration.',
    'panel.action.group.permissions': 'Access & System Permissions',
    'panel.action.hint': 'High-risk actions (terminal/shell) automatically request a confirmation dialog before running.',
    'panel.action.group.apps': 'Integrated Local Applications',
    'panel.action.scan.title': 'Scan Applications Automatically',
    'panel.action.scan.desc': 'Automatically detect all installed applications (Windows / macOS / Linux)',
    'panel.action.scan.btn': 'Scan Applications',
    'panel.action.add.title': 'Add Application Manually',
    'panel.action.add.desc': 'Register a local app .exe, .lnk, or .app file',
    'panel.action.add.namePh': 'Application name',
    'panel.action.add.pathPh': 'Path to .exe / .lnk / .app',
    'panel.action.add.pick': 'Choose…',
    'panel.action.add.btn': 'Add',
    'panel.action.group.registered': 'Registered Applications',
    'panel.storage.title': 'Storage',
    'panel.storage.subtitle': 'View local disk usage by your chats, images, attachments, packages, and cache.',
    'panel.storage.scanning': 'Scanning local storage…',
    'panel.storage.calc': 'Calculating directory details...',
    'panel.storage.capLabel': 'Reminder Cap:',
    'panel.storage.refresh': 'Refresh',
    'panel.storage.archive': 'Automatically archive screenshots & files dropped onto the avatar',
    'panel.storage.cleanCache': 'Clear Cache & Logs',
    'panel.storage.group.manage': 'Manage storage',
    'panel.storage.manageHint': 'Click a category below to view folder contents, preview images, or free up space.',
    'panel.storage.group.engine': 'Engine & Runtime (Info Only)',
    'panel.storage.backToStorage': 'Back to Storage',
    'panel.storage.detailTitle': 'Category Details',
    'panel.skill.title': 'Skills & Extensions',
    'panel.skill.subtitle': 'Manage AI capabilities, tools, and Hermes integrations.',
    'panel.skill.group.installed': 'Installed Skill Library',
    'panel.skill.searchPh': 'Search installed skills...',
    'panel.skill.reload': 'Reload',
    'panel.skill.reloadTitle': 'Reload the skill list from disk',
    'panel.skill.group.install': 'Install Skill from Official Hub',
    'panel.skill.idLabel': 'Skill Identifier',
    'panel.skill.idPh': 'official/research/...',
    'panel.skill.installBtn': 'Install Skill',
    'panel.skill.group.create': 'Create / Upload Custom Skill (Optional)',
    'panel.skill.create.title': 'Create New Skill (Write SKILL.md / Upload)',
    'panel.skill.create.sub': 'Add your own AI instructions, custom prompts, or markdown files',
    'panel.skill.name.label': 'Skill Name',
    'panel.skill.name.desc': 'Unique identifier (lowercase & dashes)',
    'panel.skill.name.ph': 'e.g. my-custom-skill',
    'panel.skill.category.label': 'Category (Optional)',
    'panel.skill.category.desc': 'Skill folder grouping',
    'panel.skill.category.ph': 'e.g. general / productivity',
    'panel.skill.content.label': 'Instruction Content (SKILL.md):',
    'panel.skill.content.ph': 'Write the skill instructions and AI role here...',
    'panel.skill.upload': 'Upload .md File',
    'panel.skill.save': 'Save Skill to Disk'
  }
}

let currentLocale = DEFAULT_LOCALE
const listeners = new Set()
const _anyHandlers = new Set()

function normalizeLocale(loc) {
  const l = String(loc || '').toLowerCase()
  if (l.startsWith('en')) return 'en'
  if (l.startsWith('id')) return 'id'
  return DEFAULT_LOCALE
}

export function getLocale() {
  return currentLocale
}

/** Interpolasi `{var}` dari objek vars. */
function interpolate(str, vars) {
  if (!vars) return str
  return String(str).replace(/\{(\w+)\}/g, (m, k) => (k in vars ? String(vars[k]) : m))
}

/**
 * Terjemahkan key. Bila key tidak ada di locale aktif, fallback ke DEFAULT_LOCALE,
 * lalu ke key itu sendiri. Mendukung nilai array (mis. idle lines).
 */
export function t(key, vars) {
  const table = DICT[currentLocale] || DICT[DEFAULT_LOCALE]
  const base = DICT[DEFAULT_LOCALE]
  let val = table[key]
  if (val == null) val = base[key]
  if (val == null) return key
  if (Array.isArray(val)) return val.map((v) => interpolate(v, vars))
  return interpolate(val, vars)
}

export function tList(key) {
  const table = DICT[currentLocale] || DICT[DEFAULT_LOCALE]
  const val = table[key] || DICT[DEFAULT_LOCALE][key]
  return Array.isArray(val) ? val.slice() : []
}

/**
 * Ganti bahasa aktif. Menyimpan ke localStorage, mengatur <html lang>,
 * memberi tahu listener lokal dan mengirim event `storage` (lintas-window).
 */
export function setLocale(loc, { persist = true } = {}) {
  const next = normalizeLocale(loc)
  const changed = next !== currentLocale
  currentLocale = next
  try {
    document.documentElement.lang = next
  } catch { /* abaikan */ }
  if (persist) {
    try { localStorage.setItem(LANG_KEY, next) } catch { /* abaikan */ }
  }
  if (changed || persist) {
    for (const fn of listeners) {
      try { fn(next) } catch { /* abaikan */ }
    }
    for (const fn of _anyHandlers) {
      try { fn(next) } catch { /* abaikan */ }
    }
  }
  return next
}

/** Muat bahasa dari localStorage (boot). Tidak menimpa bila belum ada (default id). */
export function initLocale() {
  let loc = null
  try { loc = localStorage.getItem(LANG_KEY) } catch { /* abaikan */ }
  currentLocale = normalizeLocale(loc || DEFAULT_LOCALE)
  try { document.documentElement.lang = currentLocale } catch { /* abaikan */ }
  return currentLocale
}

/** Daftarkan listener perubahan bahasa. Kembalikan fungsi unsubscribe. */
export function onLocaleChange(fn) {
  listeners.add(fn)
  return () => listeners.delete(fn)
}

/** Terapkan terjemahan ke DOM: elemen dengan `data-i18n="key"` (textContent),
 *  `data-i18n-html="key"` (innerHTML), `data-i18n-attr="title|placeholder|aria-label:key"`. */
export function applyTranslations(root = document) {
  if (!root || !root.querySelectorAll) return
  root.querySelectorAll('[data-i18n]').forEach((el) => {
    const k = el.getAttribute('data-i18n')
    if (k) el.textContent = t(k)
  })
  root.querySelectorAll('[data-i18n-html]').forEach((el) => {
    const k = el.getAttribute('data-i18n-html')
    if (k) el.innerHTML = t(k)
  })
  root.querySelectorAll('[data-i18n-attr]').forEach((el) => {
    const spec = String(el.getAttribute('data-i18n-attr') || '')
    // format: "title:i18n.key" atau "title:i18n.key,placeholder:i18n.key2"
    for (const part of spec.split(',')) {
      const [attr, key] = part.split(':').map((s) => s.trim())
      if (attr && key) el.setAttribute(attr, t(key))
    }
  })
}

// Muat otomatis saat modul diimpor (aman di semua window renderer).
initLocale()

// Sinkronkan saat window lain mengganti bahasa (event storage lintas-window).
try {
  window.addEventListener('storage', (e) => {
    if (e.key !== LANG_KEY) return
    setLocale(e.newValue || DEFAULT_LOCALE, { persist: false })
  })
} catch { /* abaikan */ }
