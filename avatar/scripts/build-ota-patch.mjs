#!/usr/bin/env node
/**
 * build-ota-patch.mjs — Membangun bundel OTA Code Patch ringan (~1–2 MB).
 * Berisi kode hasil kompilasi (`out/`), metadata `package.json`, ikon minimal,
 * script (`scripts/*.py`), dan ekstensi (`extensions/chrome/`), tanpa mengulang
 * runtime Electron (~150 MB) maupun tekstur Live2D/model (~140 MB).
 */

import { existsSync, mkdirSync, rmSync, cpSync, readFileSync, statSync } from 'node:fs'
import { join, dirname } from 'node:path'
import { fileURLToPath } from 'node:url'
import { execFileSync } from 'node:child_process'

const __dirname = dirname(fileURLToPath(import.meta.url))
const avatarDir = join(__dirname, '..')
const distDir = join(avatarDir, 'dist')
const stagingDir = join(distDir, 'patch-staging')

const pkg = JSON.parse(readFileSync(join(avatarDir, 'package.json'), 'utf8'))
const version = (process.env.GITHUB_REF_NAME || `v${pkg.version}`).replace(/^v/i, '')
const patchFileName = `OTA-Patch-Hermes-Desktop-Pet-v${version}.zip`
const patchPath = join(distDir, patchFileName)

if (!existsSync(join(avatarDir, 'out', 'main', 'index.js'))) {
  console.error('❌ Folder out/ belum ada. Jalankan "npm run build" terlebih dahulu.')
  process.exit(1)
}

mkdirSync(distDir, { recursive: true })
rmSync(stagingDir, { recursive: true, force: true })
rmSync(patchPath, { force: true })

try {
  // 1. Bagian resources/app (kode utama aplikasi + package.json + ikon)
  const appStage = join(stagingDir, 'app')
  mkdirSync(appStage, { recursive: true })
  cpSync(join(avatarDir, 'out'), join(appStage, 'out'), { recursive: true })
  cpSync(join(avatarDir, 'package.json'), join(appStage, 'package.json'))

  const buildStage = join(appStage, 'build')
  mkdirSync(buildStage, { recursive: true })
  for (const iconName of ['icon.png', 'icon.ico']) {
    const srcIcon = join(avatarDir, 'build', iconName)
    if (existsSync(srcIcon)) {
      cpSync(srcIcon, join(buildStage, iconName))
    }
  }

  // 2. Bagian extraResources: scripts/*.py
  const scriptsSrc = join(avatarDir, 'scripts')
  if (existsSync(scriptsSrc)) {
    const scriptsStage = join(stagingDir, 'scripts')
    mkdirSync(scriptsStage, { recursive: true })
    for (const pyName of ['kokoro_server.py', 'app_launcher.py']) {
      const pyFile = join(scriptsSrc, pyName)
      if (existsSync(pyFile)) {
        cpSync(pyFile, join(scriptsStage, pyName))
      }
    }
  }

  // 3. Bagian extraResources: extensions/chrome/
  const extSrc = join(avatarDir, 'extensions')
  if (existsSync(extSrc)) {
    cpSync(extSrc, join(stagingDir, 'extensions'), { recursive: true })
  }

  // 4. Kemas stagingDir -> dist/Hermes-Desktop-Pet-Patch-v<version>.zip
  if (process.platform === 'win32') {
    const safeSrc = stagingDir.replace(/'/g, "''")
    const safeDst = patchPath.replace(/'/g, "''")
    // Gunakan .NET ZipArchive dengan FileShare.ReadWrite agar tahan kunci Windows Defender & memakai forward-slash '/' (kompatibel macOS unzip & Windows Expand-Archive)
    const psScript = [
      "Add-Type -AssemblyName System.IO.Compression",
      "Add-Type -AssemblyName System.IO.Compression.FileSystem",
      `$srcRoot = (Resolve-Path -LiteralPath '${safeSrc}').Path.TrimEnd('\\')`,
      `$dstZip = '${safeDst}'`,
      `$fsOut = [System.IO.File]::Open($dstZip, [System.IO.FileMode]::Create)`,
      `$zip = New-Object System.IO.Compression.ZipArchive($fsOut, [System.IO.Compression.ZipArchiveMode]::Create, $false)`,
      "try {",
      "  foreach ($file in (Get-ChildItem -LiteralPath $srcRoot -Recurse -File)) {",
      "    $rel = $file.FullName.Substring($srcRoot.Length + 1).Replace('\\', '/')",
      "    $entry = $zip.CreateEntry($rel, [System.IO.Compression.CompressionLevel]::Optimal)",
      "    $es = $entry.Open()",
      "    $fsIn = [System.IO.File]::Open($file.FullName, [System.IO.FileMode]::Open, [System.IO.FileAccess]::Read, [System.IO.FileShare]::ReadWrite)",
      "    try { $fsIn.CopyTo($es) } finally { $fsIn.Dispose(); $es.Dispose() }",
      "  }",
      "} finally { $zip.Dispose(); $fsOut.Dispose() }"
    ].join('; ')
    const encoded = Buffer.from(psScript, 'utf16le').toString('base64')
    execFileSync(
      'powershell',
      ['-NoProfile', '-EncodedCommand', encoded],
      { stdio: 'inherit' }
    )
  } else {
    execFileSync('zip', ['-r', '-q', patchPath, '.'], { cwd: stagingDir, stdio: 'inherit' })
  }

  const sizeMb = (statSync(patchPath).size / (1024 * 1024)).toFixed(2)
  console.log(`✅ OTA Patch siap: ${patchPath} (${sizeMb} MB)`)
} finally {
  rmSync(stagingDir, { recursive: true, force: true })
}
