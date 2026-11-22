import { describe, it, expect, vi } from 'vitest'
import {
  isAcademicJournalQuery,
  detectSkillRecommendation,
  getInstalledSkillEnrichment,
  renderSkillInstallRecommendationCard
} from '../src/renderer/js/skill-advisor.js'

function createFakeDomEnv() {
  const createEl = (tag) => {
    const el = {
      tagName: tag.toUpperCase(),
      className: '',
      attributes: {},
      style: {},
      children: [],
      disabled: false,
      textContent: '',
      scrollTop: 0,
      scrollHeight: 120,
      _handlers: {},
      setAttribute(k, v) { el.attributes[k] = String(v) },
      getAttribute(k) { return el.attributes[k] ?? null },
      appendChild(ch) { el.children.push(ch); return ch },
      addEventListener(evt, fn) {
        el._handlers[evt] = el._handlers[evt] || []
        el._handlers[evt].push(fn)
      },
      async click() {
        for (const fn of el._handlers.click || []) {
          await fn({ target: el })
        }
      }
    }
    return el
  }
  return {
    createEl,
    withDocument(fn) {
      const prev = globalThis.document
      globalThis.document = { createElement: createEl }
      try {
        return fn()
      } finally {
        globalThis.document = prev
      }
    }
  }
}

describe('skill-advisor', () => {
  it('mendeteksi permintaan jurnal kuliah / Publish or Perish / Google Scholar bila belum terpasang', () => {
    expect(isAcademicJournalQuery('berikan link jurnal kuliah dari publish and perish atau google scholar tentang AI')).toBe(true)
    const rec = detectSkillRecommendation(
      'tolong carikan jurnal dari google scholar untuk skripsi tentang deep learning',
      [{ name: 'mnemosyne' }, { name: 'pdf' }]
    )
    expect(rec).not.toBeNull()
    expect(rec.id).toBe('academic-journal-finder')
    expect(rec.category).toBe('academic')
    expect(rec.content).toContain('name: academic-journal-finder')
  })

  it('tidak menawari install ulang bila skill sudah ada di sistem', () => {
    const rec = detectSkillRecommendation(
      'tolong carikan jurnal kuliah dari google scholar',
      [{ name: 'mnemosyne' }, { name: 'academic-journal-finder' }]
    )
    expect(rec).toBeNull()

    const hint = getInstalledSkillEnrichment(
      'tolong carikan jurnal kuliah dari google scholar',
      [{ name: 'academic-journal-finder' }]
    )
    expect(hint).toContain('academic-journal-finder')
  })

  it('mendeteksi skill visual presentasi, analisa data, serta membuat skill kustom untuk topik random', () => {
    const pres = detectSkillRecommendation('buatkan slide presentasi sidang skripsi tentang IoT', [])
    expect(pres?.id).toBe('visual-presentation-designer')

    const data = detectSkillRecommendation('tolong analisa statistik regresi data kuesioner ini', [])
    expect(data?.id).toBe('deep-data-analyst')

    const custom = detectSkillRecommendation('tolong installkan skill untuk membuat resep masakan nusantara', [])
    expect(custom).not.toBeNull()
    expect(custom.id).toContain('custom-')
    expect(custom.category).toBe('custom')
    expect(custom.content).toContain('resep masakan nusantara')
  })

  it('renderSkillInstallRecommendationCard menginstall skill 1-klik lalu langsung menjalankan permintaan awal', async () => {
    const env = createFakeDomEnv()
    const installSkill = vi.fn().mockResolvedValue({ ok: true, path: '/tmp/skills/academic/academic-journal-finder' })
    const onInstallAndRun = vi.fn().mockResolvedValue(undefined)
    const onSkipAndRun = vi.fn()
    const onOpenSettings = vi.fn()

    const skill = detectSkillRecommendation('carikan jurnal google scholar tentang blockchain', [])
    const chatLog = env.createEl('div')

    const card = await env.withDocument(async () => {
      const rendered = renderSkillInstallRecommendationCard({
        chatLog,
        skill,
        originalPrompt: 'carikan jurnal google scholar tentang blockchain',
        installSkill,
        onInstallAndRun,
        onOpenSettings,
        onSkipAndRun
      })
      expect(rendered).not.toBeNull()
      expect(chatLog.children).toHaveLength(1)

      const footer = rendered.children.find((c) => c.className === 'assessment-footer')
      const actionRow = footer.children[0]
      const installBtn = actionRow.children[0]
      await installBtn.click()
      return rendered
    })

    expect(installSkill).toHaveBeenCalledTimes(1)
    expect(installSkill).toHaveBeenCalledWith(expect.objectContaining({
      name: 'academic-journal-finder',
      category: 'academic'
    }))
    expect(onInstallAndRun).toHaveBeenCalledTimes(1)
    expect(onSkipAndRun).not.toHaveBeenCalled()
    expect(card.children[0].children[0].textContent).toBe('SKILL TERPASANG')
  })
})
