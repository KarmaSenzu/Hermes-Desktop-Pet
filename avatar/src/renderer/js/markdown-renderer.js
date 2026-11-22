/**
 * markdown-renderer.js — Parser dan renderer Markdown komprehensif untuk chat dan notulen
 */

import { escapeHtml } from './utils.js'
import { renderIcon } from './icons.js'

export function formatInline(text) {
  if (!text) return ''
  return text
    .replace(/`([^`\n]+)`/g, '<code>$1</code>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/__(.+?)__/g, '<strong>$1</strong>')
    .replace(/(^|[^\*])\*([^\*\n]+)\*([^\*]|$)/g, '$1<em>$2</em>$3')
    .replace(/(^|[^_])_([^_\n]+)_([^_]|$)/g, '$1<em>$2</em>$3')
    .replace(/~~(.+?)~~/g, '<del>$1</del>')
    .replace(/\[([^\]]+)\]\((https?:\/\/[^\s\)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
}

export function parseMarkdownTables(text) {
  const tableBlockRegex = /(?:^|\n)((?:[ \t]*\|?[^\n|]+(?:\|[^\n|]+)+\|?[ \t]*\n)(?:[ \t]*\|?[ \t]*(?:[ \t]*:?-{2,}:?[ \t]*\|)+(?:[ \t]*:?-{2,}:?[ \t]*)?\n)(?:[ \t]*\|?[^\n|]+(?:\|[^\n|]+)+\|?[ \t]*(?:\n|$))+)/g

  return text.replace(tableBlockRegex, (match, block) => {
    const lines = block.trim().split('\n').map((l) => l.trim()).filter(Boolean)
    if (lines.length < 2) return match

    const headerLine = lines[0]
    const separatorLine = lines[1]
    const dataLines = lines.slice(2)

    if (!/^\|?(\s*:?-{2,}:?\s*\|)+\s*:?-{2,}:?\s*\|?$/.test(separatorLine)) {
      return match
    }

    const parseRow = (line) => {
      let clean = line.replace(/^\|/, '').replace(/\|$/, '')
      return clean.split('|').map((cell) => cell.trim())
    }

    const parseAlignments = (line) => {
      let clean = line.replace(/^\|/, '').replace(/\|$/, '')
      return clean.split('|').map((cell) => {
        const c = cell.trim()
        if (c.startsWith(':') && c.endsWith(':')) return 'center'
        if (c.endsWith(':')) return 'right'
        return 'left'
      })
    }

    const alignments = parseAlignments(separatorLine)
    const headers = parseRow(headerLine)

    let out = '\n<div class="table-container"><table class="markdown-table"><thead><tr>'
    headers.forEach((h, i) => {
      const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
      out += `<th${align}>${formatInline(h)}</th>`
    })
    out += '</tr></thead><tbody>'

    dataLines.forEach((rowLine) => {
      const cells = parseRow(rowLine)
      out += '<tr>'
      headers.forEach((_, i) => {
        const val = cells[i] !== undefined ? cells[i] : ''
        const align = alignments[i] ? ` style="text-align:${alignments[i]}"` : ''
        out += `<td${align}>${formatInline(val)}</td>`
      })
      out += '</tr>'
    })

    out += '</tbody></table></div>\n'
    return out
  })
}

export function renderMarkdown(md) {
  if (!md) return ''

  let raw = String(md).replace(/\r\n/g, '\n').replace(/\r/g, '\n')

  const codeBlocks = []
  raw = raw.replace(/```([a-z0-9_-]+)?\n([\s\S]*?)```/gi, (_, lang, code) => {
    const idx = codeBlocks.length
    const cleanCode = escapeHtml(code.trim())
    codeBlocks.push(`<pre class="code-block"><code class="language-${lang || 'text'}">${cleanCode}</code></pre>`)
    return `\n%%CODEBLOCK_${idx}%%\n`
  })

  const dynamicAssessmentCards = []
  raw = raw.replace(/<assessment(?:\s+title="([^"]*)")?(?:\s+prompt="([^"]*)")?[^>]*>([\s\S]*?)<\/assessment>/gi, (_, title, prompt, inner) => {
    const cardId = 'dyn-card-' + Math.random().toString(36).slice(2, 9)
    const options = []
    const optRegex = /<option(?:\s+id="([^"]*)")?(?:\s+title="([^"]*)")?[^>]*>([\s\S]*?)<\/option>/gi
    let o
    while ((o = optRegex.exec(inner)) !== null) {
      options.push({
        id: o[1] || String(options.length + 1),
        title: o[2] || `Opsi ${options.length + 1}`,
        desc: o[3].trim()
      })
    }

    if (options.length === 0) return ''

    const cardHtml = `
<div class="assessment-card dynamic-assessment-card" data-assessment-id="${cardId}">
  <div class="assessment-card-header">
    <div class="assessment-badge"><span class="btn-svg-icon">${renderIcon('sparkles', { size: 12 })}</span> ${escapeHtml((title || 'AI Assessment & Rekomendasi').toUpperCase())}</div>
    <span class="assessment-type-pill">Multi-Select Aktif</span>
  </div>
  <div class="assessment-prompt-text">
    ${escapeHtml(prompt || 'Silakan pilih satu atau beberapa langkah di bawah ini untuk saya jelaskan atau eksekusi lebih lanjut:')}
  </div>
  <div class="assessment-options-list">
    ${options.map((opt) => `
      <div class="assessment-option-item" data-id="${escapeHtml(opt.id)}" data-title="${escapeHtml(opt.title)}">
        <div class="assessment-custom-checkbox"></div>
        <div class="assessment-option-content">
          <div class="assessment-option-title">${escapeHtml(opt.title)}</div>
          <div class="assessment-option-desc">${escapeHtml(opt.desc)}</div>
        </div>
      </div>
    `).join('')}
  </div>
  <div class="assessment-quick-presets">
    <span style="font-size: 10px; color: #94a3b8; align-self: center;">Preset:</span>
    <button type="button" class="assessment-preset-chip" data-preset="all"><span class="btn-svg-icon">${renderIcon('list-checks', { size: 12 })}</span> Pilih Semua</button>
  </div>
  <div class="assessment-footer">
    <button type="button" class="assessment-execute-btn" disabled><span class="btn-svg-icon">${renderIcon('zap', { size: 12 })}</span> Eksekusi Pilihan (0 Dipilih)</button>
    <span class="assessment-status-text">Centang opsi lalu klik tombol eksekusi</span>
  </div>
</div>`
    const cIdx = dynamicAssessmentCards.length
    dynamicAssessmentCards.push(cardHtml)
    return `\n@@@DYNAMICASSESSMENTCARD${cIdx}@@@\n`
  })

  raw = raw.replace(/<assessment[\s\S]*$/i, '')

  let text = escapeHtml(raw)
  text = parseMarkdownTables(text)
  text = text.replace(/^[ \t]*([-*_]){3,}[ \t]*$/gm, '\n<hr class="markdown-hr">\n')

  text = text.replace(/(?:^[ \t]*\&gt;[^\n]*(?:\n|$))+/gm, (match) => {
    const lines = match.split('\n')
      .map((l) => l.replace(/^[ \t]*\&gt;\s?/, '').trim())
      .filter(Boolean)
    return `\n<blockquote>${lines.map(formatInline).join('<br>')}</blockquote>\n`
  })

  const rawLines = text.split('\n')
  const blocks = []
  let currentList = null
  let currentParagraph = []

  function flushParagraph() {
    if (currentParagraph.length > 0) {
      const pText = currentParagraph.join('\n').trim()
      if (pText) {
        blocks.push(`<p>${formatInline(pText).replace(/\n/g, '<br>')}</p>`)
      }
      currentParagraph = []
    }
  }

  function flushList() {
    if (currentList) {
      const tag = currentList.type
      const itemsHtml = currentList.items.map((it) => {
        let titleHtml = formatInline(it.text)
        let subHtml = ''
        if (it.subLines && it.subLines.length > 0) {
          const formattedSubLines = it.subLines.map((sl) => {
            const bMatch = sl.match(/^[-*+•]\s+(.*)$/)
            if (bMatch) {
              return `<li class="sub-bullet-item">${formatInline(bMatch[1])}</li>`
            }
            return `<div class="sub-paragraph">${formatInline(sl)}</div>`
          })

          if (formattedSubLines.some((l) => l.startsWith('<li'))) {
            subHtml = `<ul class="sub-list">${formattedSubLines.join('')}</ul>`
          } else {
            subHtml = `<div class="sub-content">${formattedSubLines.join('')}</div>`
          }
        }

        if (tag === 'ol') {
          return `<li class="numbered-item" data-num="${it.num}"><div class="item-title">${titleHtml}</div>${subHtml}</li>`
        }

        if (it.isTask) {
          const check = it.checked ? '☑' : '☐'
          const cls = it.checked ? 'task-item completed' : 'task-item'
          return `<li class="${cls}"><span class="task-checkbox">${check}</span> <div class="item-title">${titleHtml}</div>${subHtml}</li>`
        }

        return `<li class="bullet-item"><div class="item-title">${titleHtml}</div>${subHtml}</li>`
      }).join('')

      blocks.push(`<${tag} class="markdown-${tag}">${itemsHtml}</${tag}>`)
      currentList = null
    }
  }

  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i]
    const trimmed = line.trim()

    if (!trimmed) {
      flushParagraph()
      let nextNonEmptyIndex = -1
      for (let j = i + 1; j < rawLines.length; j++) {
        if (rawLines[j].trim()) {
          nextNonEmptyIndex = j
          break
        }
      }

      if (nextNonEmptyIndex !== -1 && currentList) {
        const nextLine = rawLines[nextNonEmptyIndex].trim()
        const isNextList = /^(\d+\.|[-*+•]|- \[[ xX]\])/.test(nextLine)
        const isNextMajorBlock = /^(\#{1,6}\s+|<hr|<div|<blockquote|%%CODEBLOCK_|@@@DYNAMICASSESSMENTCARD)/.test(nextLine)

        if (isNextMajorBlock) {
          flushList()
        } else if (!isNextList && currentList.type === 'ol') {
          continue
        } else if (!isNextList) {
          flushList()
        }
      } else if (!currentList) {
        continue
      }
      continue
    }

    if (trimmed.startsWith('<div class="table-container">') ||
        trimmed.startsWith('<hr class="markdown-hr">') ||
        trimmed.startsWith('<blockquote>') ||
        trimmed.startsWith('%%CODEBLOCK_') ||
        trimmed.startsWith('@@@DYNAMICASSESSMENTCARD')) {
      flushParagraph()
      flushList()
      blocks.push(trimmed)
      continue
    }

    const headerMatch = trimmed.match(/^(#{1,6})\s+(.*)$/)
    if (headerMatch) {
      flushParagraph()
      flushList()
      const level = headerMatch[1].length
      const title = formatInline(headerMatch[2])
      blocks.push(`<h${level}>${title}</h${level}>`)
      continue
    }

    const taskMatch = trimmed.match(/^[-*+]\s+\[([ xX])\]\s+(.*)$/)
    if (taskMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      const checked = taskMatch[1].toLowerCase() === 'x'
      currentList.items.push({ isTask: true, checked, text: taskMatch[2], subLines: [] })
      continue
    }

    const numMatch = trimmed.match(/^(\d+)\.\s+(.*)$/)
    if (numMatch) {
      flushParagraph()
      if (!currentList || currentList.type !== 'ol') {
        flushList()
        currentList = { type: 'ol', items: [] }
      }
      currentList.items.push({ num: numMatch[1], text: numMatch[2], subLines: [] })
      continue
    }

    const bulletMatch = trimmed.match(/^[-*+•]\s+(.*)$/)
    if (bulletMatch) {
      flushParagraph()
      if (currentList && currentList.type === 'ol' && currentList.items.length > 0) {
        const lastItem = currentList.items[currentList.items.length - 1]
        lastItem.subLines.push(trimmed)
        continue
      }
      if (!currentList || currentList.type !== 'ul') {
        flushList()
        currentList = { type: 'ul', items: [] }
      }
      currentList.items.push({ text: bulletMatch[1], subLines: [] })
      continue
    }

    if (currentList && currentList.items.length > 0) {
      const lastItem = currentList.items[currentList.items.length - 1]
      lastItem.subLines.push(trimmed)
      continue
    }

    flushList()
    currentParagraph.push(trimmed)
  }

  flushParagraph()
  flushList()

  let finalHtml = blocks.join('\n')
  finalHtml = finalHtml.replace(/%%CODEBLOCK_(\d+)%%/g, (_, idx) => {
    return codeBlocks[Number(idx)] || ''
  })
  finalHtml = finalHtml.replace(/<p>\s*@@@DYNAMICASSESSMENTCARD(\d+)@@@\s*<\/p>|@@@DYNAMICASSESSMENTCARD(\d+)@@@/g, (_, id1, id2) => {
    const idx = Number(id1 !== undefined ? id1 : id2)
    return dynamicAssessmentCards[idx] || ''
  })
  finalHtml = finalHtml.replace(/<p>\s*%%DYNAMIC(?:<em>)?_?ASSESSMENT_?(?:<\/em>)?(\d+)%%\s*<\/p>|%%DYNAMIC(?:<em>)?_?ASSESSMENT_?(?:<\/em>)?(\d+)%%/gi, (_, id1, id2) => {
    const idx = Number(id1 !== undefined ? id1 : id2)
    return dynamicAssessmentCards[idx] || ''
  })

  return finalHtml
}
