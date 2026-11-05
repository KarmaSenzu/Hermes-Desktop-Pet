import { describe, it, expect } from 'vitest'
import {
  extractAppQueries,
  findMatchingApp,
  getRegisteredApps
} from '../src/renderer/js/app-launcher.js'

describe('app-launcher', () => {
  describe('extractAppQueries', () => {
    it('extracts single app query from natural language command', () => {
      expect(extractAppQueries('buka vscode')).toEqual(['vscode'])
      expect(extractAppQueries('tolong buka task manager dong')).toEqual(['task manager'])
      expect(extractAppQueries('jalankan notepad ya')).toEqual(['notepad'])
    })

    it('extracts multiple app queries joined by conjunctions', () => {
      expect(extractAppQueries('buka word, excel dan powerpoint')).toEqual(['word', 'excel', 'powerpoint'])
      expect(extractAppQueries('jalankan notepad serta kalkulator')).toEqual(['notepad', 'kalkulator'])
    })

    it('returns empty array when command does not match open/launch pattern', () => {
      expect(extractAppQueries('siapa presiden indonesia?')).toEqual([])
      expect(extractAppQueries('')).toEqual([])
      expect(extractAppQueries(null)).toEqual([])
    })
  })

  describe('findMatchingApp', () => {
    it('matches builtin direct applications', () => {
      const app = findMatchingApp('task manager')
      expect(app).toBeDefined()
      expect(app?.name).toBe('Task Manager')
      expect(app?.command).toBe('taskmgr.exe')
    })

    it('matches builtin applications with aliases and compact keys', () => {
      const vsc = findMatchingApp('vscode')
      expect(vsc?.name).toBe('Visual Studio Code')

      const word = findMatchingApp('word')
      expect(word?.name).toBe('Microsoft Word')
    })

    it('matches from cachedInstalledApps list', () => {
      const cache = [
        { id: '1234567890abcdef', name: 'Spotify', command: 'spotify.exe' },
        { id: 'abcdef1234567890', name: 'Discord', command: 'discord.exe' }
      ]
      const found = findMatchingApp('spotify', cache)
      expect(found).toBeDefined()
      expect(found?.name).toBe('Spotify')
    })

    it('returns null for unknown query', () => {
      expect(findMatchingApp('aplikasitidakdikenalxyz')).toBeNull()
      expect(findMatchingApp('')).toBeNull()
    })
  })

  describe('getRegisteredApps', () => {
    it('returns list of registered app names', () => {
      const cache = [
        { name: 'App A' },
        { name: 'App B' }
      ]
      const list = getRegisteredApps(cache)
      expect(list).toContain('App A')
      expect(list).toContain('App B')
    })
  })
})
