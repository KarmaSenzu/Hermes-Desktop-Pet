import { describe, it, expect } from 'vitest'
import { getLiveWeather, getLiveNews } from '../src/main/feed-service.js'

describe('feed-service', () => {
  it('getLiveWeather dan getLiveNews terdefinisi sebagai fungsi', () => {
    expect(typeof getLiveWeather).toBe('function')
    expect(typeof getLiveNews).toBe('function')
  })
})
