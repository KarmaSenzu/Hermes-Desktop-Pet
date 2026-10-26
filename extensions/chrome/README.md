# 🌐 Hermes Web Companion (Chrome & Edge Extension)

Ekstensi browser **Ask AI** resmi untuk **Hermes 3D Avatar (Desktop Pet)**. Memungkinkan Anda bertanya, menyeleksi teks, atau merangkum artikel apa pun langsung dari browser web favorit Anda, dan avatar AI di desktop Anda akan langsung merespons dengan notulen di chat panel, membaca rangkumannya dengan suara TTS, serta bereaksi dengan ekspresi dan gerak bibir (lip-sync).

---

## ✨ Fitur Unggulan

1. **Ask AI Teks Apapun (Context Menu):**
   - Blok teks atau artikel menarik di browser → klik kanan → pilih **"Tanyakan ke Hermes Avatar 🎙️"** atau **"Jelaskan Poin Ini 💡"**.
2. **Rangkum Seluruh Halaman (Page Summarizer):**
   - Klik kanan di area mana saja pada halaman → pilih **"Rangkum Halaman Ini dengan Hermes 📑"**.
3. **Shortcut Cepat Keyboard:**
   - Tekan <kbd>Alt + A</kbd> kapan saja di halaman web aktif untuk langsung mengirim teks yang diblok ke avatar.
4. **Popup Interaktif:**
   - Menampilkan status koneksi real-time ke desktop pet (hijau jika terhubung, merah jika aplikasi desktop belum berjalan).
   - 4 tombol aksi instan: *Rangkum Halaman*, *Poin Kunci*, *Jelaskan Topik*, dan *Terjemahkan*.
   - Formulir pesan kustom dengan preview judul dan URL halaman aktif.
5. **Jawaban Muncul di Chat Avatar Desktop:**
   - Sumber artikel dicatat otomatis dengan link dan kutipan teks.
   - Poin-poin penting disusun dalam format Markdown yang rapi.
   - Avatar membacakan intisari via suara Kokoro TTS / Edge TTS dengan gerakan bibir dan ekspresi wajah.

---

## 🚀 Cara Pemasangan (Hanya 3 Langkah)

1. Buka halaman ekstensi browser Anda:
   - **Google Chrome / Brave / Opera:** Kunjungi `chrome://extensions`
   - **Microsoft Edge:** Kunjungi `edge://extensions`
2. Aktifkan toggle **"Developer mode"** (Mode pengembang) di pojok kanan atas layar.
3. Klik tombol **"Load unpacked"** (Muat yang belum dibongkar) di pojok kiri atas, lalu arahkan dan pilih folder ini:
   ```
   hermes-3d-avatar/extensions/chrome/
   ```
   *(Atau klik tombol **"📂 Buka Folder Ekstensi"** langsung dari menu **Package Hub** di jendela Pengaturan Hermes Avatar).*

Ekstensi akan langsung terpasang dan icon Hermes 🤖 akan muncul di toolbar browser Anda!

---

## 🔒 Privasi & Keamanan

- **100% Localhost:** Seluruh komunikasi berjalan langsung secara lokal di komputer Anda melalui port `127.0.0.1:9124`.
- Tidak ada data yang dikirim ke server pihak ketiga atau server cloud eksternal selain model LLM yang sudah Anda konfigurasikan di Hermes CLI (`~/.hermes/config.yaml`).
