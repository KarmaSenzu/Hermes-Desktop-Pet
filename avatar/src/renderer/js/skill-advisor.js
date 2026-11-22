/**
 * skill-advisor.js — Deteksi kebutuhan skill yang belum terpasang, generator SKILL.md,
 * dan kartu rekomendasi instalasi 1-klik langsung di panel Chat Avatar.
 */

export function isAcademicJournalQuery(text) {
  const t = String(text || '').trim()
  if (!t) return false
  return /\b(jurnal|paper|makalah|publish\s*(?:or|and)\s*perish|google\s*scholar|scholar|scopus|sinta|openalex|crossref|arxiv|sitasi|citation|doi|daftar\s+pustaka|referensi\s+(?:ilmiah|kuliah|penelitian|jurnal|akademik|skripsi|tesis|disertasi)|literature\s+review|bibliografi)\b/i.test(t) ||
    /\b(?:cari(?:kan)?|beri(?:kan)?|minta|link|rekomendasi|sumber|daftar)\b[^.?!]*\b(?:skripsi|tesis|disertasi|penelitian\s+kuliah)\b/i.test(t)
}

export const CURATED_SKILLS = [
  {
    id: 'visual-presentation-designer',
    category: 'productivity',
    title: 'Arsitek Visual Presentasi, Slide Deck & Diagram',
    description: 'Merancang struktur slide presentasi (PPT / Pitch Deck / Sidang), naskah pembicara, visual cues, dan diagram alur Mermaid siap pakai.',
    benefits: [
      'Susunan slide demi slide (Judul, Poin Visual, Catatan Pembicara)',
      'Diagram alur atau arsitektur Mermaid yang rapi',
      'Cocok untuk bahan presentasi kuliah, sidang skripsi, atau kerja'
    ],
    matches: (t) => /\b(presentasi|slide\s*(?:deck|ppt|presentasi)?|power\s*point|pptx|pitch\s*deck|visual\s+presentasi|bahan\s+sidang|infografis)\b/i.test(t),
    enrichmentHint: '[SKILL AKTIF: visual-presentation-designer — Susun jawaban dalam struktur Slide-by-Slide (Judul Slide, Poin Kunci singkat, Arahan Visual/Grafik atau Diagram Mermaid, serta Speaker Notes).]',
    content: `---
name: visual-presentation-designer
description: Perancang struktur slide presentasi visual, pitch deck, infografis, dan diagram alur.
---

# Visual Presentation Designer

Gunakan skill ini untuk menyusun materi presentasi profesional:
1. Bagi menjadi blok **Slide 1, Slide 2, ... Slide N** (maksimal 3-5 poin singkat per slide).
2. Untuk setiap slide sertakan: **Judul Slide**, **Isi Ringkas**, **Saran Visual / Diagram** (gunakan Mermaid flowchart bila cocok), dan **Speaker Notes**.
`
  },
  {
    id: 'deep-data-analyst',
    category: 'analysis',
    title: 'Analis Data, Statistik & Matriks Keputusan',
    description: 'Melakukan analisis data terstruktur, perbandingan multi-faktor, SWOT, dan rekomendasi uji statistik (regresi, uji-t, korelasi, ANOVA).',
    benefits: [
      'Tabel matriks perbandingan, analisis SWOT & pembobotan',
      'Panduan uji statistik, validitas, reliabilitas, dan interpretasi p-value',
      'Ringkasan temuan inti & rekomendasi langkah lanjut'
    ],
    matches: (t) => /\b(analis(?:is|a)\s+(?:data|statistik|mendalam|komparatif|swot|risiko|kualitatif|kuantitatif|kuesioner|spss)|olah\s+data|matriks\s+(?:keputusan|perbandingan)|uji\s+(?:statistik|normalitas|validitas|reliabilitas|regresi|hipotesis|t|anova))\b/i.test(t),
    enrichmentHint: '[SKILL AKTIF: deep-data-analyst — Sajikan analisis terstruktur memakai tabel perbandingan/matriks, interpretasi statistik yang jelas, SWOT atau temuan kunci, dan kesimpulan berbasis bukti.]',
    content: `---
name: deep-data-analyst
description: Analis data terstruktur, statistik penelitian, matriks keputusan, dan SWOT.
---

# Deep Data Analyst

Gunakan skill ini untuk tugas analisis mendalam dan olah data:
1. Sajikan data atau perbandingan dalam **tabel Markdown / matriks** agar mudah dibaca.
2. Jelaskan metode analisis atau uji statistik yang relevan beserta syarat asumsi dan interpretasi angkanya.
3. Tutup dengan ringkasan keputusan & prioritas langkah berikutnya.
`
  },
  {
    id: 'code-architect-reviewer',
    category: 'development',
    title: 'Auditor Arsitektur Kode & Debugging',
    description: 'Meninjau kualitas kode, menemukan akar bug atau celah keamanan, dan merancang struktur modul yang bersih serta teruji.',
    benefits: [
      'Identifikasi akar masalah, race condition, dan edge-case',
      'Rekomendasi arsitektur & contoh kode bersih siap pakai',
      'Checklist pengujian & verifikasi sebelum rilis'
    ],
    matches: (t) => /\b(audit\s+kode|review\s+(?:kode|code|arsitektur|pr)|refactor(?:ing)?|arsitektur\s+(?:sistem|aplikasi|backend|frontend)|design\s+pattern|cari\s+bug)\b/i.test(t),
    enrichmentHint: '[SKILL AKTIF: code-architect-reviewer — Berikan audit terstruktur meliputi Akar Masalah / Risiko, Rekomendasi Perbaikan Modular, dan Rencana Verifikasi.]',
    content: `---
name: code-architect-reviewer
description: Auditor arsitektur kode, pelacakan bug, keamanan aplikasi, dan refactoring modular.
---

# Code Architect Reviewer

1. Pisahkan temuan berdasarkan tingkat dampak (Kritis, Menengah, Minor).
2. Tunjukkan contoh perbaikan yang minimal dan mudah diuji.
`
  },
  {
    id: 'academic-journal-finder',
    category: 'academic',
    title: 'Riset Jurnal Ilmiah, Google Scholar & Publish or Perish',
    description: 'Mencari referensi jurnal kuliah terverifikasi, jumlah sitasi, DOI, link PDF Open-Access, tautan Google Scholar, dan format sitasi APA/IEEE.',
    benefits: [
      'Metadata jurnal nyata setara Publish or Perish (OpenAlex / Crossref)',
      'Tautan klik langsung Google Scholar, DOI, dan PDF Open-Access',
      'Format daftar pustaka APA / IEEE & ringkasan abstrak kuliah'
    ],
    matches: (t) => isAcademicJournalQuery(t),
    enrichmentHint: '[SKILL AKTIF: academic-journal-finder — Sajikan referensi jurnal akademik yang terstruktur dengan Judul, Penulis, Tahun, Nama Jurnal, Jumlah Sitasi, Link DOI/PDF asli, Link Google Scholar, serta kutipan format APA.]',
    content: `---
name: academic-journal-finder
description: Pencari jurnal ilmiah, metadata Publish or Perish / OpenAlex, Google Scholar, DOI, sitasi, dan daftar pustaka akademik.
---

# Academic Journal Finder

Gunakan skill ini saat pengguna meminta referensi jurnal, makalah, skripsi, tesis, literature review, atau bantuan Google Scholar / Publish or Perish:

1. Prioritaskan data paper terverifikasi yang disediakan oleh sistem OpenAlex / Crossref.
2. Untuk setiap jurnal, sertakan secara rapi:
   - **Judul Lengkap**
   - **Penulis & Tahun Terbit**
   - **Nama Jurnal / Prosiding & Jumlah Sitasi (Cited by)**
   - **Link Asli yang Dapat Diklik** (DOI / PDF Open-Access + Tautan Google Scholar)
   - **Ringkasan Relevansi 1-2 kalimat**
3. Di akhir daftar, sediakan contoh **Daftar Pustaka (Format APA)**.
4. Dilarang mengarang DOI atau URL jurnal yang tidak ada di hasil pencarian terverifikasi.
`
  }
]

function normalizeInstalledSet(installedSkills = []) {
  const set = new Set()
  for (const s of Array.isArray(installedSkills) ? installedSkills : []) {
    const raw = typeof s === 'string' ? s : s?.name
    const clean = String(raw || '').trim().toLowerCase()
    if (clean) set.add(clean)
  }
  return set
}

function buildCustomSkillFromRequest(rawText) {
  const raw = String(rawText || '').trim()
  const explicit = /(?:install(?:kan)?|pasang(?:kan)?|tambahkan?|buat(?:kan)?|pelajari|aktifkan)\s+(?:skill|modul|kemampuan)\b/i.test(raw) ||
    /(?:apakah|bisa)\s+.*\b(?:install(?:kan)?|tambah(?:kan)?|pasang)\s+(?:skill|kemampuan)\b/i.test(raw)
  if (!explicit) return null

  const extractedTopic = raw
    .replace(/^.*?\b(?:install(?:kan)?|pasang(?:kan)?|tambahkan?|buat(?:kan)?|pelajari|aktifkan)\s+(?:skill|modul|kemampuan)\s*(?:baru\s*)?(?:untuk|tentang|mengenai|agar\s+bisa|supaya\s+bisa|agar|supaya)?\s*/i, '')
    .replace(/[.!?]+$/g, '')
    .trim()

  const topic = extractedTopic.length >= 3 ? extractedTopic.slice(0, 80) : 'Asisten Tugas Kustom'
  const slug = topic
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 36) || 'task-helper'
  const skillId = `custom-${slug}`
  const title = `Skill Kustom: ${topic}`

  return {
    id: skillId,
    category: 'custom',
    title,
    description: `Modul instruksi khusus yang diracik otomatis agar Hermes menguasai: "${topic}".`,
    benefits: [
      `Terpasang permanen di ~/.hermes/skills/custom/${skillId}/SKILL.md`,
      `Dapat dilihat, diedit, atau dihapus kapan saja di Settings → Skill & Ekstensi`,
      'Otomatis dimuat ke konteks Hermes tanpa perlu restart aplikasi'
    ],
    enrichmentHint: `[SKILL KUSTOM AKTIF (${skillId}): Terapkan keahlian khusus "${topic}" secara mendalam, terstruktur, dan praktis.]`,
    content: `---
name: ${skillId}
description: Skill kustom untuk ${topic}
---

# ${title}

Saat pengguna meminta bantuan terkait **${topic}**:
1. Berikan jawaban yang terstruktur, praktis, akurat, dan mudah diterapkan langsung.
2. Sertakan contoh nyata, tabel, atau langkah bertahap sesuai kebutuhan topik.
`
  }
}

/**
 * Memeriksa apakah prompt pengguna membutuhkan skill yang BELUM terpasang di sistem saat ini.
 * Mengembalikan objek skill yang direkomendasikan bila belum ada, atau `null` bila sudah terpasang / tidak perlu.
 */
export function detectSkillRecommendation(text, installedSkills = []) {
  const t = String(text || '').trim()
  if (!t) return null

  const installedSet = normalizeInstalledSet(installedSkills)

  for (const skill of CURATED_SKILLS) {
    if (skill.matches(t)) {
      if (installedSet.has(skill.id.toLowerCase())) {
        return null
      }
      return {
        ...skill,
        alreadyInstalled: false
      }
    }
  }

  const customSkill = buildCustomSkillFromRequest(t)
  if (customSkill && !installedSet.has(customSkill.id.toLowerCase())) {
    return {
      ...customSkill,
      alreadyInstalled: false
    }
  }

  return null
}

/**
 * Mengambil panduan pengayaan prompt bila skill relevan sudah terpasang (atau baru saja diinstal).
 */
export function getInstalledSkillEnrichment(text, installedSkills = [], activatedSkill = null) {
  const hints = []
  const t = String(text || '').trim()
  const installedSet = normalizeInstalledSet(installedSkills)
  if (activatedSkill?.id) {
    installedSet.add(String(activatedSkill.id).toLowerCase())
  }

  for (const skill of CURATED_SKILLS) {
    if (skill.matches(t) && installedSet.has(skill.id.toLowerCase()) && skill.enrichmentHint) {
      hints.push(skill.enrichmentHint)
    }
  }

  if (activatedSkill?.enrichmentHint && !hints.includes(activatedSkill.enrichmentHint)) {
    hints.push(activatedSkill.enrichmentHint)
  }

  return hints.join('\n')
}

/**
 * Merender Kartu Penawaran Install Skill 1-Klik langsung di dalam kotak Chat Avatar.
 */
export function renderSkillInstallRecommendationCard({
  chatLog,
  skill,
  originalPrompt,
  installSkill,
  onInstallAndRun = () => {},
  onOpenSettings = () => {},
  onSkipAndRun = () => {}
}) {
  if (!chatLog || !skill) return null

  const card = document.createElement('div')
  card.className = 'avatar assessment-card widget-card skill-install-card'
  card.setAttribute('data-skill-id', skill.id)

  const header = document.createElement('div')
  header.className = 'assessment-card-header'
  const badge = document.createElement('div')
  badge.className = 'assessment-badge'
  badge.textContent = 'SKILL BELUM TERPASANG'
  const pill = document.createElement('span')
  pill.className = 'assessment-type-pill'
  pill.textContent = `${skill.id} (${skill.category})`
  header.appendChild(badge)
  header.appendChild(pill)
  card.appendChild(header)

  const promptEl = document.createElement('div')
  promptEl.className = 'assessment-prompt-text'
  promptEl.textContent = `Untuk permintaan ini, saya menemukan kemampuan "${skill.title}" yang belum ada di sistem Anda. Mau saya instalkan skill tersebut sekarang agar saya bisa mengerjakannya?`
  card.appendChild(promptEl)

  const descEl = document.createElement('div')
  descEl.className = 'widget-meta-line'
  descEl.textContent = skill.description
  card.appendChild(descEl)

  if (Array.isArray(skill.benefits) && skill.benefits.length > 0) {
    const listEl = document.createElement('ul')
    listEl.style.margin = '4px 0 6px 16px'
    listEl.style.padding = '0'
    listEl.style.fontSize = '11.5px'
    listEl.style.color = 'rgba(226, 232, 240, 0.85)'
    for (const b of skill.benefits) {
      const li = document.createElement('li')
      li.textContent = b
      listEl.appendChild(li)
    }
    card.appendChild(listEl)
  }

  const footer = document.createElement('div')
  footer.className = 'assessment-footer'

  const actionRow = document.createElement('div')
  actionRow.className = 'assessment-action-row'

  const installBtn = document.createElement('button')
  installBtn.type = 'button'
  installBtn.className = 'assessment-execute-btn'
  installBtn.textContent = 'Ya, Install Skill & Lanjutkan'

  const settingsBtn = document.createElement('button')
  settingsBtn.type = 'button'
  settingsBtn.className = 'assessment-retake-btn'
  settingsBtn.textContent = 'Menu Skill & Ekstensi'

  const skipBtn = document.createElement('button')
  skipBtn.type = 'button'
  skipBtn.className = 'assessment-discard-btn'
  skipBtn.textContent = 'Lewati (Jawab Tanpa Install)'

  actionRow.appendChild(installBtn)
  actionRow.appendChild(settingsBtn)
  actionRow.appendChild(skipBtn)
  footer.appendChild(actionRow)

  const statusSpan = document.createElement('span')
  statusSpan.className = 'assessment-status-text'
  statusSpan.textContent = 'Siap dipasang 1-klik ke ~/.hermes/skills/'
  footer.appendChild(statusSpan)

  card.appendChild(footer)

  let decided = false

  installBtn.addEventListener('click', async () => {
    if (decided) return
    installBtn.disabled = true
    skipBtn.disabled = true
    installBtn.textContent = 'Menginstall…'
    statusSpan.textContent = 'Memasang SKILL.md ke sistem & memuat ulang Hermes...'

    try {
      const res = typeof installSkill === 'function'
        ? await installSkill({ name: skill.id, category: skill.category, content: skill.content })
        : { ok: true }

      if (!res?.ok) {
        throw new Error(res?.error || 'Gagal memasang skill ke disk')
      }

      decided = true
      badge.textContent = 'SKILL TERPASANG'
      pill.textContent = `${skill.id} • Aktif`
      installBtn.textContent = 'Terpasang & Dipakai'
      statusSpan.textContent = 'Skill berhasil dipasang ke sistem (tampil di Settings → Skill & Ekstensi). Memproses permintaan...'
      await onInstallAndRun(skill, originalPrompt)
    } catch (err) {
      installBtn.disabled = false
      skipBtn.disabled = false
      installBtn.textContent = 'Coba Install Lagi'
      statusSpan.textContent = `Gagal pasang: ${err?.message || err}`
    }
  })

  settingsBtn.addEventListener('click', () => {
    onOpenSettings(skill)
  })

  skipBtn.addEventListener('click', async () => {
    if (decided) return
    decided = true
    installBtn.disabled = true
    skipBtn.disabled = true
    pill.textContent = 'Dilewati'
    statusSpan.textContent = 'Menjawab langsung tanpa menginstal skill...'
    await onSkipAndRun(skill, originalPrompt)
  })

  chatLog.appendChild(card)
  chatLog.scrollTop = chatLog.scrollHeight
  return card
}
