import type { PosterShape } from '../src/domain/poster'

export const DESIGN_IMAGE_MODEL = 'dall-e-3'

export type DesignImageInput = {
  title?: string
  product?: string
  fact?: string
  kind?: string
  brand?: string
  shape?: PosterShape | string
  note?: string
}

const NO_TEXT = [
  'Photorealistic campaign photograph.',
  'Absolutely no text, letters, numbers, logos, watermarks, captions, labels, posters, screens with writing, or signage.',
  'No typography of any kind.',
].join(' ')

export function posterSize(shape: PosterShape | string | undefined): '1024x1024' | '1024x1792' | '1792x1024' {
  if (shape === 'portrait') return '1024x1792'
  if (shape === 'landscape') return '1792x1024'
  return '1024x1024'
}

export function designImagePrompt(input: DesignImageInput): string {
  const brand = clip(input.brand || 'the company', 40)
  const product = clip(input.product || input.title || 'the product', 60)
  const kind = clip(input.kind || 'product', 24)
  const fact = clip(input.fact || '', 140)
  const note = clip(input.note || '', 80)
  const space = input.shape === 'portrait' ? 'Leave empty space in the lower third.' : input.shape === 'landscape' ? 'Leave empty space on the left third.' : 'Leave empty space in the lower third.'
  const scene =
    kind === 'software'
      ? `A quiet modern classroom with a laptop whose screen is fully out of focus so no characters are readable, suggesting ${product} for ${brand}.`
      : kind === 'service'
        ? `People at work in a bright professional space for ${brand}, faces natural, no name tags, suggesting ${product}.`
        : `A premium product still of ${product} for ${brand} on a real desk, catalog lighting.`
  const claim = fact ? `Visual only, never as writing: ${fact}` : ''
  const change = note ? `Direction: ${note}. Still no text.` : ''
  return [NO_TEXT, scene, claim, space, 'Cinematic light, shallow depth of field, social campaign still.', change]
    .filter(Boolean)
    .join(' ')
}

export function designImageBody(input: DesignImageInput) {
  return {
    model: DESIGN_IMAGE_MODEL,
    prompt: designImagePrompt(input).slice(0, 1000),
    size: posterSize(input.shape),
    quality: 'standard' as const,
    response_format: 'b64_json' as const,
    n: 1,
  }
}

export function parseDesignImageInput(raw: unknown): DesignImageInput {
  const data = (raw && typeof raw === 'object' ? raw : {}) as DesignImageInput
  return {
    title: String(data.title ?? ''),
    product: String(data.product ?? ''),
    fact: String(data.fact ?? ''),
    kind: String(data.kind ?? ''),
    brand: String(data.brand ?? ''),
    shape: data.shape === 'portrait' || data.shape === 'landscape' ? data.shape : 'square',
    note: String(data.note ?? ''),
  }
}

export function imageDataUrl(b64: string, mime = 'image/png'): string {
  const clean = b64.replace(/\s+/g, '')
  if (!clean || /[^A-Za-z0-9+/=]/.test(clean)) throw new Error('The image was not a picture.')
  return `data:${mime};base64,${clean}`
}

function clip(value: string, max: number): string {
  return value.replace(/\s+/g, ' ').trim().slice(0, max)
}
