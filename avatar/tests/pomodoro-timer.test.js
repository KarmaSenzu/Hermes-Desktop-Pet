import { describe, it, expect } from 'vitest'
import { formatTimer, getTimerMilestoneStep } from '../src/renderer/js/pomodoro-timer.js'

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

  describe('getTimerMilestoneStep', () => {
    it('returns milestone info every 20% elapsed for a 10-minute timer', () => {
      expect(getTimerMilestoneStep(600, 600)).toBeNull()
      expect(getTimerMilestoneStep(600, 500)).toBeNull()
      expect(getTimerMilestoneStep(600, 480)).toEqual({
        step: 1,
        elapsedPercent: 20,
        remainingPercent: 80,
        elapsedSeconds: 120,
        remainingSeconds: 480
      })
      expect(getTimerMilestoneStep(600, 360)).toEqual({
        step: 2,
        elapsedPercent: 40,
        remainingPercent: 60,
        elapsedSeconds: 240,
        remainingSeconds: 360
      })
      expect(getTimerMilestoneStep(600, 240)).toEqual({
        step: 3,
        elapsedPercent: 60,
        remainingPercent: 40,
        elapsedSeconds: 360,
        remainingSeconds: 240
      })
      expect(getTimerMilestoneStep(600, 120)).toEqual({
        step: 4,
        elapsedPercent: 80,
        remainingPercent: 20,
        elapsedSeconds: 480,
        remainingSeconds: 120
      })
      expect(getTimerMilestoneStep(600, 0)).toBeNull()
    })
  })
})
