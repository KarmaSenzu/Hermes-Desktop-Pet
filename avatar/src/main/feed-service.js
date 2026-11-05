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
