"""
app_launcher.py
Hermes Fast App Launcher & Application Learning CLI
Part of Hermes 3D Avatar (Apache 2.0 / Commercial friendly).

Usage:
    app open <name>      Membuka aplikasi secara instan
    app list             Melihat daftar aplikasi yang dikenali
    app scan             Memindai ulang semua aplikasi terpasang di Windows
    app learn <name> <path>  Menyimpan aplikasi baru ke memori
"""

import os
import sys
import json
import subprocess

CACHE_DIR = os.path.join(os.path.expanduser("~"), ".hermes-avatar")
CACHE_FILE = os.path.join(CACHE_DIR, "apps_cache.json")
os.makedirs(CACHE_DIR, exist_ok=True)

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

def scan_apps():
    safe_print("[Hermes App] 🔍 Memindai aplikasi Windows (Start Menu & Builtin)...")
    dirs = [
        os.path.join(os.environ.get("APPDATA", ""), "Microsoft", "Windows", "Start Menu", "Programs"),
        os.path.join(os.environ.get("ProgramData", ""), "Microsoft", "Windows", "Start Menu", "Programs")
    ]
    results = []
    seen = set()

    for d in dirs:
        if not os.path.exists(d):
            continue
        for root, _, files in os.walk(d):
            for f in files:
                if f.lower().endswith(".lnk"):
                    raw_name = f[:-4].strip()
                    lower = raw_name.lower()
                    if any(bad in lower for bad in ["uninstall", "readme", "documentation", "help", "setup"]):
                        continue
                    if lower not in seen:
                        seen.add(lower)
                        results.append({
                            "name": raw_name,
                            "command": os.path.join(root, f),
                            "source": "windows-start-menu"
                        })

    builtins = [
        {"name": "Notepad", "command": "notepad.exe", "aliases": ["notepad", "catatan"]},
        {"name": "Kalkulator", "command": "calc.exe", "aliases": ["calc", "kalkulator", "calculator"]},
        {"name": "File Explorer", "command": "explorer.exe", "aliases": ["explorer", "file explorer"]},
        {"name": "Paint", "command": "mspaint.exe", "aliases": ["paint", "mspaint", "gambar"]},
        {"name": "Task Manager", "command": "taskmgr.exe", "aliases": ["taskmgr", "task manager"]},
        {"name": "Command Prompt", "command": "cmd.exe", "aliases": ["cmd", "command prompt"]},
        {"name": "PowerShell", "command": "powershell.exe", "aliases": ["powershell", "pwsh"]},
        {"name": "Pengaturan Windows", "command": "ms-settings:", "aliases": ["settings", "pengaturan"]}
    ]

    for b in builtins:
        if b["name"].lower() not in seen:
            seen.add(b["name"].lower())
            results.append({
                "name": b["name"],
                "command": b["command"],
                "aliases": b.get("aliases", []),
                "source": "builtin"
            })

    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(results, f, ensure_ascii=False, indent=2)

    safe_print(f"[Hermes App] ✅ Selesai! {len(results)} aplikasi berhasil dipelajari dan disimpan ke cache.")
    return results

def load_apps():
    if os.path.exists(CACHE_FILE):
        try:
            with open(CACHE_FILE, "r", encoding="utf-8") as f:
                return json.load(f)
        except Exception:
            pass
    return scan_apps()

def open_app(query):
    if not query.strip():
        safe_print("❌ Mohon tentukan nama aplikasi yang ingin dibuka. Contoh: app open spotify")
        return 1

    apps = load_apps()
    q = query.strip().lower()

    # Exact or alias match
    matched = None
    for a in apps:
        if a["name"].lower() == q:
            matched = a
            break
        if any(alias.lower() == q for alias in a.get("aliases", [])):
            matched = a
            break

    # Substring match if not exact
    if not matched:
        for a in apps:
            if q in a["name"].lower() or a["name"].lower() in q:
                matched = a
                break
            if any(q in alias.lower() or alias.lower() in q for alias in a.get("aliases", [])):
                matched = a
                break

    if not matched:
        safe_print(f"❌ Aplikasi '{query}' belum ditemukan.")
        safe_print("💡 Coba ketik 'app scan' untuk memindai ulang, atau 'app learn <nama> <path>' untuk mendaftarkannya.")
        return 1

    cmd = matched["command"]
    safe_print(f"[Hermes App] 🚀 Membuka {matched['name']}...")
    try:
        if cmd.startswith("ms-settings:") or (":" in cmd and "\\" not in cmd and "/" not in cmd):
            os.system(f'start "" "{cmd}"')
        elif os.path.exists(cmd):
            os.startfile(cmd)
        else:
            subprocess.Popen(f'start "" "{cmd}"', shell=True)
        safe_print(f"[Hermes App] ✅ {matched['name']} berhasil diluncurkan!")
        return 0
    except Exception as e:
        safe_print(f"⚠️ Gagal meluncurkan aplikasi: {e}")
        return 1

def list_apps():
    apps = load_apps()
    safe_print(f"\n[Hermes App] Daftar Aplikasi yang Dikenali ({len(apps)} aplikasi):")
    safe_print("-" * 60)
    for a in apps[:40]:  # Tampilkan 40 pertama
        safe_print(f" • {a['name']:<25} ({a.get('source', 'app')})")
    if len(apps) > 40:
        safe_print(f" ... dan {len(apps) - 40} aplikasi lainnya.")
    safe_print("-" * 60)
    safe_print("💡 Buka aplikasi dengan: app open <nama_aplikasi>\n")

def learn_app(name, path):
    if not name or not path:
        safe_print("❌ Penggunaan: app learn <nama_aplikasi> <path_exe>")
        return 1
    apps = load_apps()
    apps = [a for a in apps if a["name"].lower() != name.lower()]
    apps.insert(0, {
        "name": name,
        "command": path,
        "source": "user-learned"
    })
    with open(CACHE_FILE, "w", encoding="utf-8") as f:
        json.dump(apps, f, ensure_ascii=False, indent=2)
    safe_print(f"[Hermes App] ✅ Aplikasi '{name}' berhasil dipelajari dan disimpan!")
    return 0

def main():
    args = sys.argv[1:]
    if not args:
        safe_print("Hermes Fast App Launcher CLI")
        safe_print("Penggunaan: app <perintah> [argumen]\n")
        safe_print("Perintah:")
        safe_print("  app open <nama>        Membuka aplikasi secara instan (contoh: app open spotify)")
        safe_print("  app list               Melihat daftar aplikasi yang dikenali")
        safe_print("  app scan               Pindai ulang seluruh Start Menu Windows")
        safe_print("  app learn <nama> <path> Pelajari path aplikasi baru")
        safe_print("  app help               Tampilkan petunjuk ini")
        return

    cmd = args[0].lower()
    if cmd in ("open", "launch", "run", "start"):
        sys.exit(open_app(" ".join(args[1:])))
    elif cmd in ("list", "ls"):
        list_apps()
    elif cmd in ("scan", "rescan"):
        scan_apps()
    elif cmd in ("learn", "add"):
        if len(args) >= 3:
            sys.exit(learn_app(args[1], " ".join(args[2:])))
        else:
            safe_print("❌ Penggunaan: app learn <nama_aplikasi> <path_eksekusi>")
    elif cmd in ("help", "--help", "-h"):
        main()
    else:
        # Default fallback: jika user ketik 'app spotify', langsung anggap 'app open spotify'
        sys.exit(open_app(" ".join(args)))

if __name__ == "__main__":
    main()
