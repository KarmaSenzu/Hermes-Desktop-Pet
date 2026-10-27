#!/usr/bin/env node
import { existsSync, readFileSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import http from 'node:http'
import net from 'node:net'
import { getAllDetectedPaths } from '../src/main/path-resolver.js'

const __dirname = dirname(fileURLToPath(import.meta.url))
const avatarDir = join(__dirname, '..')
const rootDir = join(avatarDir, '..')

const BOLD = '\x1b[1m'
const RESET = '\x1b[0m'
const GREEN = '\x1b[32m'
const YELLOW = '\x1b[33m'
const RED = '\x1b[31m'
const CYAN = '\x1b[36m'
const GRAY = '\x1b[90m'

function pass(title, detail = '') {
  console.log(`  ${GREEN}✓${RESET} ${BOLD}${title}${RESET} ${GRAY}${detail}${RESET}`)
}

function warn(title, detail = '') {
  console.log(`  ${YELLOW}⚠${RESET} ${YELLOW}${BOLD}${title}${RESET} ${GRAY}${detail}${RESET}`)
}

function fail(title, detail = '') {
  console.log(`  ${RED}✗${RESET} ${RED}${BOLD}${title}${RESET} ${detail}`)
}

function info(title, detail = '') {
  console.log(`  ${CYAN}ℹ${RESET} ${title} ${GRAY}${detail}${RESET}`)
}

function compareVersions(v1, v2) {
  const p1 = v1.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  const p2 = v2.replace(/^v/, '').split('.').map((x) => parseInt(x, 10) || 0)
  for (let i = 0; i < Math.max(p1.length, p2.length); i++) {
    const num1 = p1[i] || 0
    const num2 = p2[i] || 0
    if (num1 > num2) return 1
    if (num1 < num2) return -1
  }
  return 0
}

function checkPort(port, host = '127.0.0.1', timeout = 400) {
  return new Promise((resolve) => {
    const socket = new net.Socket()
    socket.setTimeout(timeout)
    socket.on('connect', () => {
      socket.destroy()
      resolve(true)
    })
    socket.on('timeout', () => {
      socket.destroy()
      resolve(false)
    })
    socket.on('error', () => {
      socket.destroy()
      resolve(false)
    })
    socket.connect(port, host)
  })
}

async function runDoctor() {
  console.log(`\n${BOLD}${CYAN}=== Hermes Desktop Pet — Diagnostic Doctor (FTUE Healthcheck) ===${RESET}\n`)

  let issues = 0
  let warnings = 0

  // 1. Node.js & Runtime Check
  console.log(`${BOLD}[1/5] Lingkungan Eksekusi Node.js${RESET}`)
  const nodeVersion = process.versions.node
  const major = parseInt(nodeVersion.split('.')[0], 10)
  if (major >= 18) {
    pass(`Node.js v${nodeVersion}`, `(Direkomendasikan >= v18.0.0)`)

    // Baseline Keamanan Patch Oktober 2026 (Penambalan 11 CVE):
    // - Node.js v26.12.1 (Current)
    // - Node.js v24.22.1 (LTS Krypton)
    // - Node.js v22.23.4 (LTS Jod)
    const isCurrentPatched = (major >= 26 && compareVersions(nodeVersion, '26.12.1') >= 0)
    const isLts24Patched = (major === 24 && compareVersions(nodeVersion, '24.22.1') >= 0)
    const isLts22Patched = (major === 22 && compareVersions(nodeVersion, '22.23.4') >= 0)

    if (isCurrentPatched || isLts24Patched || isLts22Patched) {
      pass(`Status Keamanan Node.js: Patch Oktober 2026 Terpenuhi`, `(Bebas dari 11 CVE)`)
    } else {
      info(`Saran Keamanan Node.js (Oktober 2026)`, `Patch resmi tersedia untuk 11 CVE: v24.22.1 (LTS), v22.23.4 (LTS), atau v26.12.1 (Current).`)
    }
  } else {
    fail(`Node.js v${nodeVersion} terlalu lama`, `Harap gunakan Node.js v18 atau v20+ agar Vite & Electron berjalan optimal.`)
    issues++
  }

  // 2. Dependensi NPM
  console.log(`\n${BOLD}[2/5] Pemeriksaan Dependensi Modul NPM${RESET}`)
  const pkgPath = join(avatarDir, 'package.json')
  if (existsSync(pkgPath)) {
    try {
      const pkg = JSON.parse(readFileSync(pkgPath, 'utf8'))
      const allDeps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies })
      let missingDeps = []
      for (const dep of allDeps) {
        const depPath = join(avatarDir, 'node_modules', dep)
        if (!existsSync(depPath)) {
          missingDeps.push(dep)
        }
      }
      if (missingDeps.length === 0) {
        pass(`Semua ${allDeps.length} paket modul npm terpasang lengkap`, `(Zero Native C++ requirement)`)
      } else {
        fail(`Ada modul npm yang belum terpasang: ${missingDeps.join(', ')}`, `Jalankan: npm install atau npm ci`)
        issues++
      }
    } catch (e) {
      fail(`Gagal membaca package.json`, e.message)
      issues++
    }
  } else {
    fail(`File package.json tidak ditemukan`, pkgPath)
    issues++
  }

  // 3. Aset Model Avatar Bawaan
  console.log(`\n${BOLD}[3/5] Aset Karakter Model Avatar${RESET}`)
  const live2dModelPath = join(avatarDir, 'assets', 'live2d', 'mother', '20250106.model3.json')
  const defaultVrmPath = join(avatarDir, 'assets', 'models', 'default.vrm')
  
  if (existsSync(live2dModelPath)) {
    pass(`Model Live2D Mother terdeteksi`, `(assets/live2d/mother/20250106.model3.json)`)
  } else {
    warn(`Model Live2D default belum terpasang`, `Aplikasi akan menampilkan fallback dialog pemilihan model saat pertama dibuka.`)
    warnings++
  }

  if (existsSync(defaultVrmPath)) {
    pass(`Model 3D VRM terdeteksi`, `(assets/models/default.vrm)`)
  } else {
    info(`Model 3D VRM opsional`, `Pengguna dapat menambahkan model .vrm kustom kapan saja lewat pengaturan.`)
  }

  // 4. Core Skills Hermes
  console.log(`\n${BOLD}[4/5] Ketersediaan Core Skills Bawaan${RESET}`)
  const requiredSkills = [
    'mnemosyne',
    'duckduckgo-search',
    'scrapling',
    'weather-2-0',
    'pdf',
    'open-application',
    'kokoro-tts'
  ]
  let missingSkills = []
  for (const sk of requiredSkills) {
    const rootSk = join(rootDir, 'skills', sk, 'SKILL.md')
    const assetSk = join(avatarDir, 'assets', 'default-skills', sk, 'SKILL.md')
    if (existsSync(rootSk) || existsSync(assetSk)) {
      pass(`Skill ${sk} siap`, `(Built-in mandatory)`)
    } else {
      missingSkills.push(sk)
    }
  }
  if (missingSkills.length > 0) {
    fail(`Core skill belum lengkap: ${missingSkills.join(', ')}`, `Pastikan folder skills/ ada di repositori`)
    issues++
  }

  // 5. Backend Services & Path Discovery Health
  console.log(`\n${BOLD}[5/5] Port & Layanan Latar Belakang (Smart Path Discovery)${RESET}`)
  const paths = await getAllDetectedPaths()
  info(`Drive Terdeteksi`, `[${paths.drives.map((d) => d + ':').join(', ')}]`)

  if (paths.hermes.ok) {
    pass(`Hermes CLI: ${paths.hermes.cmd}`, `(${paths.hermes.source})`)
  } else {
    warn(`Hermes CLI belum terdeteksi di drive manapun`, `(Dapat ditentukan manual di Pengaturan)`)
    warnings++
  }

  if (paths.python.ok) {
    pass(`Python Engine: ${paths.python.cmd} - ${paths.python.version}`, `(${paths.python.source})`)
  } else {
    warn(`Python belum terdeteksi`, `(Dibutuhkan untuk Kokoro-TTS vokal anime lokal)`)
    warnings++
  }

  if (paths.router.ok) {
    pass(`9Router Gateway: ${paths.router.cmd}`, `(${paths.router.source})`)
  } else {
    info(`9Router CLI offline`, `(Opsional — dapat diinstall via npm install -g 9router)`)
  }

  const isHermesUp = await checkPort(9119)
  if (isHermesUp) {
    pass(`Hermes Serve AI terdeteksi di port 9119`, `(JSON-RPC WebSocket Online)`)
  } else {
    info(`Hermes Serve (port 9119) belum aktif`, `Akan otomatis di-spawn oleh service-manager saat aplikasi dijalankan.`)
  }

  const isKokoroUp = await checkPort(8880)
  if (isKokoroUp) {
    pass(`Kokoro-TTS Neural Server terdeteksi di port 8880`, `(Vokal Lokal Anime Aktif)`)
  } else {
    info(`Kokoro-TTS (port 8880) belum aktif`, `Sistem audio avatar akan otomatis memakai fallback Edge-TTS (Zero-Config).`)
  }

  const isRouterUp = await checkPort(20128)
  if (isRouterUp) {
    pass(`9Router Gateway terdeteksi di port 20128`, `(LLM Proxy Aktif)`)
  } else {
    info(`9Router (port 20128) offline`, `Opsional — dipakai jika menggunakan local LLM proxy.`)
  }

  // Ringkasan
  console.log(`\n${BOLD}=== Ringkasan Diagnosa ===${RESET}`)
  if (issues === 0 && warnings === 0) {
    console.log(`${GREEN}${BOLD}✓ SISTEM SIAP 100%! Semua komponen, modul, dan dependensi dalam kondisi prima.${RESET}`)
    console.log(`Jalankan aplikasi dengan: ${CYAN}npm run dev${RESET}\n`)
  } else if (issues === 0) {
    console.log(`${YELLOW}${BOLD}✓ SISTEM SIAP DIGUNAKAN dengan ${warnings} catatan opsional.${RESET}`)
    console.log(`Jalankan aplikasi dengan: ${CYAN}npm run dev${RESET}\n`)
  } else {
    console.log(`${RED}${BOLD}✗ DITEMUKAN ${issues} KENDALA KRUSIAL.${RESET}`)
    console.log(`Silakan ikuti petunjuk perbaikan di atas sebelum menjalankan aplikasi.\n`)
    process.exitCode = 1
  }
}

runDoctor()
