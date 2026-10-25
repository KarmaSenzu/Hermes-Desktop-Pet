"""
kokoro_server.py
Lightweight OpenAI-compatible Local TTS Server using Kokoro-ONNX.
Part of Hermes 3D Avatar (Apache 2.0 / Commercial friendly).

Requirements:
    py -m pip install kokoro-onnx soundfile

Run:
    py scripts/kokoro_server.py
"""

import os
import sys
import json
import io
import urllib.request
from http.server import HTTPServer, BaseHTTPRequestHandler

# Pastikan encoding UTF-8 di Windows agar tidak crash charmap cp1252
if sys.platform == "win32":
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
        sys.stderr.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

def safe_print(*args, **kwargs):
    sep = kwargs.get("sep", " ")
    end = kwargs.get("end", "\n")
    msg = sep.join(str(a) for a in args)
    try:
        sys.stdout.write(msg + end)
        sys.stdout.flush()
    except Exception:
        try:
            sys.stdout.write(msg.encode("ascii", "replace").decode("ascii") + end)
            sys.stdout.flush()
        except Exception:
            pass

print = safe_print

PORT = 8880
HOST = "127.0.0.1"

# Folder penyimpanan model Kokoro (disimpan di ~/.hermes-avatar/packages/kokoro/ agar terpusat dan mudah dikelola)
PACKAGE_DIR = os.path.join(os.path.expanduser("~"), ".hermes-avatar", "packages", "kokoro")
LEGACY_DIR = os.path.join(os.path.expanduser("~"), ".kokoro-models")
os.makedirs(PACKAGE_DIR, exist_ok=True)

MODEL_DIR = PACKAGE_DIR
MODEL_FILE = os.path.join(MODEL_DIR, "kokoro-v1.0.onnx")
VOICES_FILE = os.path.join(MODEL_DIR, "voices-v1.0.bin")

# Migrasi otomatis jika sebelumnya pernah diunduh ke folder lama ~/.kokoro-models
if not os.path.exists(MODEL_FILE) and os.path.exists(os.path.join(LEGACY_DIR, "kokoro-v1.0.onnx")):
    try:
        import shutil
        print(f"[Kokoro] Memindahkan model dari folder lama ke {PACKAGE_DIR}...")
        for fname in ["kokoro-v1.0.onnx", "voices-v1.0.bin"]:
            src = os.path.join(LEGACY_DIR, fname)
            dst = os.path.join(PACKAGE_DIR, fname)
            if os.path.exists(src) and not os.path.exists(dst):
                shutil.move(src, dst)
        if os.path.exists(LEGACY_DIR) and not os.listdir(LEGACY_DIR):
            os.rmdir(LEGACY_DIR)
    except Exception as e:
        print(f"[Kokoro] Info migrasi: {e}")

MODEL_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/kokoro-v1.0.onnx"
VOICES_URL = "https://github.com/thewh1teagle/kokoro-onnx/releases/download/model-files-v1.1/voices-v1.0.bin"

def ensure_model_files():
    def download(url, dest):
        if not os.path.exists(dest):
            print(f"[Kokoro] Mengunduh {os.path.basename(dest)} dari GitHub releases...")
            part_file = dest + ".download"
            req = urllib.request.Request(url, headers={"User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64)"})
            with urllib.request.urlopen(req) as resp, open(part_file, "wb") as f:
                while True:
                    chunk = resp.read(1024 * 1024)
                    if not chunk:
                        break
                    f.write(chunk)
            os.replace(part_file, dest)
            print(f"[Kokoro] Selesai: {dest}")

    download(MODEL_URL, MODEL_FILE)
    download(VOICES_URL, VOICES_FILE)

# Inisialisasi model (thread-safe)
import threading
kokoro_instance = None
_model_lock = threading.Lock()

def get_kokoro():
    global kokoro_instance
    if kokoro_instance is None:
        with _model_lock:
            if kokoro_instance is None:
                try:
                    from kokoro_onnx import Kokoro
                except ImportError:
                    print("\n❌ Modul 'kokoro-onnx' atau 'soundfile' belum terpasang.")
                    print("👉 Silakan jalankan perintah ini di terminal:")
                    print("    py -m pip install kokoro-onnx soundfile\n")
                    sys.exit(1)

                ensure_model_files()
                print("[Kokoro] Memuat model ONNX ke memori...")
                kokoro_instance = Kokoro(MODEL_FILE, VOICES_FILE)
                print("[Kokoro] ✅ Model siap digunakan!")
    return kokoro_instance

class KokoroHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        if self.path in ("/", "/health"):
            self.send_response(200)
            self.send_header("Content-Type", "application/json")
            self.send_header("Access-Control-Allow-Origin", "*")
            self.end_headers()
            self.wfile.write(json.dumps({
                "status": "ok",
                "engine": "Kokoro-TTS",
                "license": "Apache-2.0",
                "voices": [
                    "af_heart", "af_bella", "af_nicole", "af_sky",
                    "jf_alpha", "jf_gongitsune", "am_adam", "am_michael"
                ]
            }).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

    def do_OPTIONS(self):
        self.send_response(200)
        self.send_header("Access-Control-Allow-Origin", "*")
        self.send_header("Access-Control-Allow-Methods", "POST, GET, OPTIONS")
        self.send_header("Access-Control-Allow-Headers", "Content-Type")
        self.end_headers()

    def do_POST(self):
        if self.path in ("/v1/audio/speech", "/api/audio/speak"):
            content_length = int(self.headers.get("Content-Length", 0))
            body = self.rfile.read(content_length).decode("utf-8")
            try:
                data = json.loads(body)
            except Exception:
                data = {}

            text = data.get("input") or data.get("text", "")
            voice = data.get("voice", "af_heart")
            speed = float(data.get("speed", 1.0))

            intonation = data.get("intonation", "anime")
            req_lang = data.get("lang")

            if not text.strip():
                self.send_response(400)
                self.end_headers()
                self.wfile.write(b"Text is empty")
                return

            try:
                import re
                import soundfile as sf
                k = get_kokoro()
                
                # Bersihkan emoji dan karakter dekoratif yang membuat TTS salah eja nama emoji
                clean_text = re.sub(r'[\U00010000-\U0010ffff\u2600-\u26ff\u2700-\u27bf]', '', text)
                clean_text = re.sub(r'[\r\n\t]+', ' ', clean_text).strip()
                if not clean_text:
                    clean_text = text.strip()

                # Validasi suara agar tidak error jika dikirim nama voice dari provider lain (seperti GadisNeural)
                avail = k.get_voices()
                if voice not in avail:
                    safe_print(f"[Kokoro] Voice '{voice}' tidak dikenali, fallback otomatis ke 'af_heart'")
                    voice = "af_heart"

                # Deteksi karakter CJK (Jepang/Mandarin asli: Kanji, Hiragana, Katakana, Hanzi)
                is_cjk = bool(re.search(r'[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]', clean_text))
                prefix = voice[0].lower() if voice else 'a'

                # PENTING: Jika teks ditulis dalam alfabet Latin (misal Bahasa Indonesia / Inggris):
                # JANGAN PERNAH gunakan 'ja' (Misaki) atau 'zh', karena tokenizer Kokoro
                # akan menganggap alfabet Latin sebagai singkatan dan mengeja tiap huruf per abjad (s-a-y-a)!
                # Untuk vokal Jepang (jf_*) atau intonasi anime yang membaca teks Latin,
                # gunakan 'es' (Spanish phonetics: vokal murni a-i-u-e-o) agar terdengar seperti
                # karakter anime seiyuu fasih berbahasa Indonesia dengan pengucapan kata utuh & manis!
                if req_lang:
                    lang = req_lang
                elif is_cjk:
                    lang = 'ja' if prefix == 'j' else ('zh' if prefix == 'z' else 'en-us')
                else:
                    if intonation == 'anime' or prefix in ('j', 'z'):
                        lang = 'es'
                    elif intonation == 'british' or prefix == 'b':
                        lang = 'en-gb'
                    elif intonation == 'international' or prefix in ('a', 'h'):
                        lang = 'en-us'
                    else:
                        lang = 'es'

                try:
                    samples, sample_rate = k.create(
                        clean_text,
                        voice=voice,
                        speed=speed,
                        lang=lang
                    )
                except Exception as ex:
                    safe_print(f"[Kokoro] Fallback intonasi en-us untuk {voice}: {ex}")
                    samples, sample_rate = k.create(
                        clean_text,
                        voice=voice,
                        speed=speed,
                        lang='en-us'
                    )

                # Export ke WAV buffer in-memory
                buf = io.BytesIO()
                sf.write(buf, samples, sample_rate, format="WAV")
                wav_bytes = buf.getvalue()

                self.send_response(200)
                self.send_header("Content-Type", "audio/wav")
                self.send_header("Content-Length", str(len(wav_bytes)))
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(wav_bytes)

            except Exception as err:
                print(f"[Kokoro Error] {err}")
                self.send_response(500)
                self.send_header("Content-Type", "application/json")
                self.send_header("Access-Control-Allow-Origin", "*")
                self.end_headers()
                self.wfile.write(json.dumps({"error": str(err)}).encode("utf-8"))
        else:
            self.send_response(404)
            self.end_headers()

def cli_status():
    safe_print("[Kokoro CLI] Memeriksa status Kokoro-TTS...")
    model_ok = os.path.exists(MODEL_FILE)
    voices_ok = os.path.exists(VOICES_FILE)
    safe_print(f"  Model ONNX ({os.path.basename(MODEL_FILE)}): {'✅ Ditemukan' if model_ok else '❌ Belum diunduh'}")
    safe_print(f"  Voices BIN ({os.path.basename(VOICES_FILE)}): {'✅ Ditemukan' if voices_ok else '❌ Belum diunduh'}")
    
    server_online = False
    try:
        req = urllib.request.Request(f"http://{HOST}:{PORT}/health")
        with urllib.request.urlopen(req, timeout=2) as resp:
            if resp.status == 200:
                server_online = True
                data = json.loads(resp.read().decode("utf-8"))
                safe_print(f"  Status Server: 🟢 AKTIF di http://{HOST}:{PORT}")
                safe_print(f"  Engine: {data.get('engine', 'Kokoro-TTS')} (Lisensi: {data.get('license', 'Apache-2.0')})")
                safe_print(f"  Voice tersedia: {', '.join(data.get('voices', []))}")
    except Exception:
        safe_print(f"  Status Server: ⚪ TIDAK AKTIF (Port {PORT} belum berjalan)")

    return 0 if (server_online and model_ok and voices_ok) else 1

def cli_stop():
    safe_print(f"[Kokoro CLI] Menghentikan server Kokoro di port {PORT}...")
    import subprocess
    stopped = False
    if sys.platform == "win32":
        try:
            out = subprocess.check_output(f'netstat -ano | findstr :{PORT}', shell=True).decode()
            pids = set()
            for line in out.strip().splitlines():
                parts = line.split()
                if len(parts) >= 5 and f":{PORT}" in parts[1]:
                    pids.add(parts[-1])
            for pid in pids:
                if pid and pid != "0":
                    subprocess.run(f"taskkill /F /PID {pid}", shell=True, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
                    safe_print(f"  ✅ Proses PID {pid} dihentikan.")
                    stopped = True
        except Exception:
            pass
    if not stopped:
        safe_print("  ℹ️ Tidak ada server Kokoro aktif yang berjalan di port 8880.")

def cli_say(text, voice="af_heart"):
    if not text.strip():
        safe_print("❌ Teks untuk diucapkan tidak boleh kosong.")
        return
    safe_print(f"[Kokoro Say] Mengucapkan: '{text}' (Voice: {voice})...")
    try:
        req = urllib.request.Request(
            f"http://{HOST}:{PORT}/v1/audio/speech",
            data=json.dumps({"input": text, "voice": voice}).encode("utf-8"),
            headers={"Content-Type": "application/json"}
        )
        with urllib.request.urlopen(req, timeout=15) as resp:
            wav_data = resp.read()
            import tempfile
            with tempfile.NamedTemporaryFile(suffix=".wav", delete=False) as tmp:
                tmp.write(wav_data)
                tmp_path = tmp.name
            
            # Putar audio di Windows via winsound jika tersedia
            if sys.platform == "win32":
                try:
                    import winsound
                    winsound.PlaySound(tmp_path, winsound.SND_FILENAME)
                except Exception:
                    safe_print(f"  Audio tersimpan di: {tmp_path}")
            else:
                safe_print(f"  Audio tersimpan di: {tmp_path}")
            try:
                os.remove(tmp_path)
            except Exception:
                pass
            safe_print("  ✅ Selesai!")
    except Exception as e:
        safe_print(f"❌ Gagal memutar suara: {e}")
        safe_print("💡 Pastikan server Kokoro sudah berjalan dengan mengetik: kokoro start")

def run_server_foreground():
    safe_print("=" * 60)
    safe_print(" [Kokoro] Hermes 3D Avatar - Kokoro-TTS Server (Apache 2.0)")
    safe_print(f" [Kokoro] Berjalan di: http://{HOST}:{PORT}")
    safe_print(" [Kokoro] Endpoint OpenAI-compatible: /v1/audio/speech")
    safe_print("=" * 60)
    
    server = HTTPServer((HOST, PORT), KokoroHandler)

    import threading
    t = threading.Thread(target=get_kokoro, daemon=True)
    t.start()

    try:
        server.serve_forever()
    except KeyboardInterrupt:
        safe_print("\n[Kokoro] Server dihentikan.")
        server.server_close()

def main():
    args = sys.argv[1:]
    if not args:
        run_server_foreground()
        return

    cmd = args[0].lower()
    if cmd in ("status", "--status", "-s"):
        sys.exit(cli_status())
    elif cmd in ("stop", "kill"):
        cli_stop()
    elif cmd in ("say", "speak"):
        text = " ".join(args[1:]) if len(args) > 1 else "Halo! Kokoro TTS siap digunakan."
        cli_say(text)
    elif cmd in ("start", "run"):
        if "-d" in args or "--daemon" in args:
            import subprocess
            safe_print(f"[Kokoro] Menjalankan server di background (port {PORT})...")
            # Jalankan script ini sendiri di background tanpa membuka CMD baru
            script_path = os.path.abspath(__file__)
            DETACHED = 0x00000008 if sys.platform == "win32" else 0
            CREATE_NO_WINDOW = 0x08000000 if sys.platform == "win32" else 0
            subprocess.Popen(
                [sys.executable, script_path],
                creationflags=DETACHED | CREATE_NO_WINDOW,
                close_fds=True
            )
            import time
            time.sleep(1)
            cli_status()
        else:
            run_server_foreground()
    elif cmd in ("help", "--help", "-h"):
        safe_print("Hermes Kokoro-TTS Engine CLI (Apache 2.0)")
        safe_print("Penggunaan: kokoro <perintah> [opsi]")
        safe_print("")
        safe_print("Perintah:")
        safe_print("  kokoro start          Jalankan server Kokoro di foreground")
        safe_print("  kokoro start -d       Jalankan server Kokoro di background (daemon)")
        safe_print("  kokoro stop           Hentikan server Kokoro yang sedang aktif")
        safe_print("  kokoro status         Periksa status server dan ketersediaan model ONNX")
        safe_print("  kokoro say <teks>     Ucapkan teks secara instan dari terminal")
        safe_print("  kokoro help           Tampilkan petunjuk ini")
    else:
        safe_print(f"Perintah '{cmd}' tidak dikenali. Ketik 'kokoro help' untuk bantuan.")

if __name__ == "__main__":
    main()
