import { describe, it, expect, vi } from 'vitest'
import { getLiveWeather, getLiveNews, extractAcademicSearchQuery, getAcademicPapers } from '../src/main/feed-service.js'

describe('feed-service', () => {
  it('getLiveWeather dan getLiveNews terdefinisi sebagai fungsi', () => {
    expect(typeof getLiveWeather).toBe('function')
    expect(typeof getLiveNews).toBe('function')
  })

  it('extractAcademicSearchQuery mengekstrak topik inti dari permintaan jurnal berbahasa Indonesia', () => {
    const q = extractAcademicSearchQuery('tolong carikan link jurnal kuliah dari publish or perish dan google scholar tentang deteksi sampah yolo')
    expect(q.toLowerCase()).toContain('deteksi sampah yolo')
    expect(q.toLowerCase()).not.toContain('publish')
    expect(q.toLowerCase()).not.toContain('tolong')
  })

  it('getAcademicPapers memetakan metadata jurnal OpenAlex beserta tautan Google Scholar & DOI', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        results: [
          {
            display_name: 'Deep Learning for Waste Sorting',
            publication_year: 2024,
            cited_by_count: 42,
            doi: 'https://doi.org/10.1000/test-doi',
            authorships: [{ author: { display_name: 'A. Researcher' } }],
            primary_location: { source: { display_name: 'Journal of Applied AI' } },
            open_access: { oa_url: 'https://example.org/paper.pdf' }
          }
        ]
      })
    })

    const res = await getAcademicPapers('carikan jurnal deep learning waste sorting', 3, { fetchImpl: mockFetch })
    expect(res.ok).toBe(true)
    expect(res.papers).toHaveLength(1)
    expect(res.papers[0].title).toBe('Deep Learning for Waste Sorting')
    expect(res.papers[0].authors).toBe('A. Researcher')
    expect(res.papers[0].citedByCount).toBe(42)
    expect(res.papers[0].doiUrl).toBe('https://doi.org/10.1000/test-doi')
    expect(res.papers[0].pdfUrl).toBe('https://example.org/paper.pdf')
    expect(res.papers[0].scholarUrl).toContain('scholar.google.com')
  })
})
