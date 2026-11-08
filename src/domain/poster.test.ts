import { describe, expect, it } from 'vitest'
import { campaignPoster, composePoster, posterKicker, posterShape } from './poster'

describe('campaign posters', () => {
  it('draws square, portrait, and landscape frames with readable type', () => {
    const square = composePoster({
      title: 'Dock Pro',
      brief: 'A desk dock sold with the Classroom laptop bundle.',
      brand: 'Northline Supply Co.',
      productName: 'Dock Pro',
      fact: 'A desk dock sold with the Classroom laptop bundle.',
      platform: 'instagram',
      format: 'flyer',
      revision: 1,
    })
    expect(square).toContain('viewBox="0 0 1080 1080"')
    expect(square).toContain('Dock Pro')
    expect(square).toContain('NORTHLINE')
    expect(square).toContain('INSTAGRAM')
    expect(posterShape('cover')).toBe('portrait')
    expect(posterShape('thumbnail')).toBe('landscape')
    expect(posterKicker('tiktok', 'cover')).toBe('TikTok · Cover')
    const portrait = campaignPoster({
      title: 'Set up Dock Pro',
      kicker: 'TikTok · Cover',
      brand: 'Northline Supply Co.',
      product: 'Dock Pro',
      fact: 'A desk dock sold with the Classroom laptop bundle.',
      shape: 'portrait',
      revision: 2,
    })
    expect(portrait).toContain('viewBox="0 0 1080 1920"')
    const landscape = campaignPoster({
      title: 'Dock Pro, step by step',
      kicker: 'YouTube · Thumbnail',
      brand: 'Northline Supply Co.',
      shape: 'landscape',
      revision: 3,
    })
    expect(landscape).toContain('viewBox="0 0 1280 720"')
  })

  it('escapes copy and can lay a photograph under the type', () => {
    const svg = campaignPoster({
      title: 'Dock & Pro <launch>',
      kicker: 'Draft',
      brand: 'Acme "Co"',
      shape: 'square',
      revision: 4,
      art: 'data:image/jpeg;base64,abc',
    })
    expect(svg).toContain('Dock &amp; Pro &lt;launch&gt;')
    expect(svg).toContain('ACME &quot;CO&quot;')
    expect(svg).toContain('href="data:image/jpeg;base64,abc"')
    expect(svg).not.toContain('<launch>')
  })
})
