import { describe, it, expect } from 'vitest'
import { formatInline, parseMarkdownTables, renderMarkdown } from '../src/renderer/js/markdown-renderer.js'

describe('markdown-renderer', () => {
  describe('formatInline', () => {
    it('formats inline code', () => {
      expect(formatInline('run `npm test` now')).toBe('run <code>npm test</code> now')
    })

    it('formats bold text', () => {
      expect(formatInline('this is **important** and __critical__')).toBe('this is <strong>important</strong> and <strong>critical</strong>')
    })

    it('formats italic text', () => {
      expect(formatInline('this is *italics* and _more_')).toContain('<em>italics</em>')
      expect(formatInline('this is *italics* and _more_')).toContain('<em>more</em>')
    })

    it('formats strikethrough text', () => {
      expect(formatInline('~~deprecated~~')).toBe('<del>deprecated</del>')
    })

    it('formats links with target blank and noopener', () => {
      const formatted = formatInline('[Hermes](https://hermes.ai)')
      expect(formatted).toBe('<a href="https://hermes.ai" target="_blank" rel="noopener noreferrer">Hermes</a>')
    })

    it('handles empty or null text safely', () => {
      expect(formatInline('')).toBe('')
      expect(formatInline(null)).toBe('')
    })
  })

  describe('parseMarkdownTables', () => {
    it('parses valid markdown table into html table', () => {
      const mdTable = `| Header 1 | Header 2 |
|---|---|
| Cell 1 | Cell 2 |`

      const html = parseMarkdownTables(mdTable)
      expect(html).toContain('<table class="markdown-table">')
      expect(html).toContain('Header 1')
      expect(html).toContain('Cell 1')
    })

    it('handles alignment in table columns', () => {
      const mdTable = `| Left | Center | Right |
| :--- | :---: | ---: |
| L | C | R |`

      const html = parseMarkdownTables(mdTable)
      expect(html).toContain('style="text-align:center"')
      expect(html).toContain('style="text-align:right"')
    })
  })

  describe('renderMarkdown', () => {
    it('renders headers correctly', () => {
      const res = renderMarkdown('# Heading 1\n## Heading 2')
      expect(res).toContain('<h1>Heading 1</h1>')
      expect(res).toContain('<h2>Heading 2</h2>')
    })

    it('renders code blocks with syntax language', () => {
      const md = '```javascript\nconst a = 1\n```'
      const res = renderMarkdown(md)
      expect(res).toContain('<pre class="code-block"><code class="language-javascript">const a = 1</code></pre>')
    })

    it('renders task list items', () => {
      const md = '- [x] Done task\n- [ ] Pending task'
      const res = renderMarkdown(md)
      expect(res).toContain('task-item completed')
      expect(res).toContain('☑')
      expect(res).toContain('☐')
    })

    it('renders blockquotes', () => {
      const md = '> Catatan penting'
      const res = renderMarkdown(md)
      expect(res).toContain('<blockquote>Catatan penting</blockquote>')
    })

    it('returns empty string for null or empty input', () => {
      expect(renderMarkdown('')).toBe('')
      expect(renderMarkdown(null)).toBe('')
    })
  })
})
