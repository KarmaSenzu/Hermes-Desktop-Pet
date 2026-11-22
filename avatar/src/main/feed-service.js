/**
 * feed-service.js — Layanan live feed (Cuaca WMO Open-Meteo & Berita RSS Google News)
 */

export async function getLiveWeather(city = 'Jakarta') {
  try {
    const lat = -6.2
    const lon = 106.8
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m&timezone=Asia%2FJakarta`
    const resp = await fetch(url, { headers: { 'User-Agent': 'HermesAvatar/1.0' }, signal: AbortSignal.timeout(5000) })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const data = await resp.json()
    const cur = data.current || {}

    const WMO_MAP = {
      0: 'Cerah',
      1: 'Sebagian Besar Cerah',
      2: 'Sebagian Berawan',
      3: 'Mendung Berawan',
      45: 'Berkabut',
      48: 'Kabut Tebal',
      51: 'Gerimis Ringan',
      53: 'Gerimis Sedang',
      55: 'Gerimis Lebat',
      61: 'Hujan Ringan',
      63: 'Hujan Sedang',
      65: 'Hujan Lebat',
      80: 'Hujan Lokal Singkat',
      81: 'Hujan Lebat Berselang',
      82: 'Hujan Sangat Deras',
      95: 'Hujan Disertai Petir',
      96: 'Badai Petir Ringan',
      99: 'Badai Petir Lebat'
    }
    const condition = WMO_MAP[cur.weather_code] || 'Cerah Berawan'
    return {
      ok: true,
      city: 'Jakarta',
      temp: cur.temperature_2m,
      humidity: cur.relative_humidity_2m,
      wind: cur.wind_speed_10m,
      weatherCode: cur.weather_code,
      condition,
      time: cur.time
    }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

export async function getLiveNews() {
  try {
    const url = 'https://news.google.com/rss?hl=id&gl=ID&ceid=ID:id'
    const resp = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64)' },
      signal: AbortSignal.timeout(6000)
    })
    if (!resp.ok) return { ok: false, error: `HTTP ${resp.status}` }
    const xml = await resp.text()

    const itemRegex = /<item>[\s\S]*?<title>(.*?)<\/title>[\s\S]*?<link>(.*?)<\/link>[\s\S]*?<pubDate>(.*?)<\/pubDate>[\s\S]*?<\/item>/g
    const items = []
    let match
    while ((match = itemRegex.exec(xml)) !== null && items.length < 5) {
      let rawTitle = match[1] || ''
      rawTitle = rawTitle
        .replace(/&quot;/g, '"')
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, '&')
        .replace(/&lt;/g, '<')
        .replace(/&gt;/g, '>')
        .trim()
      items.push({
        title: rawTitle,
        pubDate: match[3] || ''
      })
    }
    return { ok: true, items }
  } catch (err) {
    return { ok: false, error: err?.message || String(err) }
  }
}

/**
 * Membersihkan kalimat percakapan bahasa Indonesia/Inggris menjadi kata kunci pencarian jurnal ilmiah.
 */
export function extractAcademicSearchQuery(rawQuery) {
  const original = String(rawQuery || '').trim()
  if (!original) return ''

  const cleaned = original
    .replace(/\b(?:tolong|mohon|bisa|minta|carikan|cari|berikan|beri|kasih|referensi|daftar|link|tautan|jurnal|paper|makalah|artikel|ilmiah|skripsi|tesis|disertasi|kuliah|akademik|tentang|mengenai|terkait|topik|judul|untuk|membantu|bantu|dari|publish\s*(?:or|and)\s*perish|google\s*scholar|scholar|scopus|sinta|doi|pdf|sitasi|citation|terbaru|tahun|terbaik|dong|ya)\b/gi, ' ')
    .replace(/[^\p{L}\p{N}\s:.\-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()

  return cleaned.length >= 3 ? cleaned : original
}

/**
 * Mencari referensi jurnal ilmiah dari OpenAlex API (gratis, metadata setara Crossref / Publish or Perish)
 * beserta tautan pencarian Google Scholar, DOI, dan PDF Open-Access.
 */
export async function getAcademicPapers(query, limit = 5, { fetchImpl = globalThis.fetch } = {}) {
  const cleanQuery = extractAcademicSearchQuery(query)
  if (!cleanQuery) {
    return { ok: false, error: 'Kata kunci pencarian jurnal kosong', papers: [], scholarSearchUrl: '' }
  }

  const safeLimit = Math.max(1, Math.min(10, Number(limit) || 5))
  const scholarSearchUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(cleanQuery)}`
  const url = `https://api.openalex.org/works?search=${encodeURIComponent(cleanQuery)}&per-page=${safeLimit}&sort=cited_by_count:desc`

  try {
    const resp = await fetchImpl(url, {
      headers: {
        Accept: 'application/json',
        'User-Agent': 'HermesDesktopPet/1.1.2 (academic-assistant)'
      },
      signal: AbortSignal.timeout(8000)
    })

    if (!resp.ok) {
      return { ok: false, error: `HTTP ${resp.status}`, query: cleanQuery, scholarSearchUrl, papers: [] }
    }

    const data = await resp.json()
    const works = Array.isArray(data?.results) ? data.results : []
    const papers = works.map((w) => {
      const title = String(w?.display_name || w?.title || 'Tanpa Judul').trim()
      const authors = Array.isArray(w?.authorships) && w.authorships.length > 0
        ? w.authorships.slice(0, 3).map((a) => a?.author?.display_name).filter(Boolean).join(', ')
        : 'Penulis tidak tercatat'
      const year = w?.publication_year || '-'
      const venue = w?.primary_location?.source?.display_name || 'Jurnal / Prosiding Ilmiah'
      const citedByCount = Number(w?.cited_by_count) || 0
      const doiUrl = w?.doi ? String(w.doi).trim() : ''
      const pdfUrl = String(
        w?.open_access?.oa_url ||
        w?.primary_location?.pdf_url ||
        w?.primary_location?.landing_page_url ||
        doiUrl ||
        ''
      ).trim()
      const scholarUrl = `https://scholar.google.com/scholar?q=${encodeURIComponent(title)}`

      return {
        title,
        authors,
        year,
        venue,
        citedByCount,
        doiUrl,
        pdfUrl,
        scholarUrl
      }
    })

    return {
      ok: true,
      query: cleanQuery,
      scholarSearchUrl,
      papers
    }
  } catch (err) {
    return {
      ok: false,
      error: err?.message || String(err),
      query: cleanQuery,
      scholarSearchUrl,
      papers: []
    }
  }
}
