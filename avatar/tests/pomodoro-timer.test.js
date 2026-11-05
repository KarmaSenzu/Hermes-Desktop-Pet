import { describe, it, expect } from 'vitest'
import { formatTimer } from '../src/renderer/js/pomodoro-timer.js'

describe('pomodoro-timer', () => {
  describe('formatTimer', () => {
    it('formats seconds into mm:ss with zero-padding', () => {
      expect(formatTimer(0)).toBe('00:00')
      expect(formatTimer(5)).toBe('00:05')
      expect(formatTimer(60)).toBe('01:00')
      expect(formatTimer(1500)).toBe('25:00')
      expect(formatTimer(3599)).toBe('59:59')
    })
  })
})
