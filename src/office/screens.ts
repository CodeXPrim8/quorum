import { CanvasTexture, SRGBColorSpace } from 'three'

const cache = new Map<string, CanvasTexture>()

function paint(ctx: CanvasRenderingContext2D, roomId: string, title: string) {
  const themes: Record<string, { bar: string; accent: string }> = {
    sales: { bar: '#12344a', accent: '#3ec6ff' },
    marketing: { bar: '#3a2410', accent: '#ffb15a' },
    comms: { bar: '#3a1830', accent: '#f08ad4' },
    procurement: { bar: '#143028', accent: '#7dcea0' },
    finance: { bar: '#2c2416', accent: '#e6c27a' },
    people: { bar: '#2a1840', accent: '#c9a6f0' },
    technology: { bar: '#102033', accent: '#39e6c5' },
    operations: { bar: '#102820', accent: '#39e6c5' },
    executive: { bar: '#102826', accent: '#8ef0e2' },
    meeting: { bar: '#1a2433', accent: '#9eb6d4' },
  }
  const theme = themes[roomId] ?? themes.technology
  ctx.fillStyle = '#0d141c'
  ctx.fillRect(0, 0, 320, 200)
  ctx.fillStyle = theme.bar
  ctx.fillRect(0, 0, 320, 28)
  ctx.fillStyle = theme.accent
  ctx.fillRect(0, 28, 320, 2)
  ctx.font = '600 13px Segoe UI, sans-serif'
  ctx.fillStyle = '#e9f7f4'
  ctx.fillText(title.slice(0, 34), 12, 19)

  if (roomId === 'operations') {
    ctx.font = '13px Segoe UI, sans-serif'
    ;['Servers', 'Desk net', 'Door log'].forEach((label, index) => {
      ctx.fillStyle = '#102820'
      ctx.fillRect(16 + index * 100, 48, 90, 120)
      ctx.fillStyle = theme.accent
      ctx.fillText(label, 26 + index * 100, 70)
      ctx.fillStyle = index === 2 ? '#e6c27a' : '#7dffa8'
      ctx.fillRect(28 + index * 100, 88, 64, 12)
      ctx.fillRect(28 + index * 100, 110, 40, 12)
    })
    return
  }
  if (roomId === 'technology') {
    const lines = ['const launch = check()', 'sync offline quizzes', 'import priceList', 'ready: classroom os']
    ctx.font = '14px Consolas, monospace'
    lines.forEach((line, index) => {
      ctx.fillStyle = index === 0 ? '#7dffa8' : '#b7d4ff'
      ctx.fillText(line, 16, 58 + index * 28)
    })
    return
  }
  if (roomId === 'finance') {
    ctx.font = '13px Segoe UI, sans-serif'
    ;['Item', 'Qty', 'Margin'].forEach((label, index) => {
      ctx.fillStyle = '#9eb0c4'
      ctx.fillText(label, 16 + index * 96, 56)
    })
    ;[
      ['Dock Pro', '40', '18%'],
      ['Laptop', '27', '22%'],
      ['Monitor', '12', '15%'],
    ].forEach((row, rowIndex) => {
      row.forEach((cell, index) => {
        ctx.fillStyle = '#f4f7fb'
        ctx.fillText(cell, 16 + index * 96, 86 + rowIndex * 28)
      })
    })
    return
  }
  if (roomId === 'sales') {
    ;['Lead', 'Quote', 'Won'].forEach((label, index) => {
      ctx.fillStyle = '#17324a'
      ctx.fillRect(16 + index * 100, 48, 88, 130)
      ctx.fillStyle = theme.accent
      ctx.font = '12px Segoe UI, sans-serif'
      ctx.fillText(label, 26 + index * 100, 68)
      ctx.fillStyle = '#d5e8f5'
      ctx.fillRect(26 + index * 100, 84, 68, 18)
      if (index < 2) ctx.fillRect(26 + index * 100, 110, 68, 18)
    })
    return
  }
  if (roomId === 'comms' || roomId === 'marketing') {
    ctx.fillStyle = '#1a2430'
    ctx.fillRect(16, 48, 288, 56)
    ctx.fillRect(16, 116, 288, 56)
    ctx.fillStyle = theme.accent
    ctx.font = '13px Segoe UI, sans-serif'
    ctx.fillText(roomId === 'comms' ? 'Draft post' : 'Campaign', 28, 72)
    ctx.fillStyle = '#d5dde8'
    ctx.fillText(title.slice(0, 28), 28, 96)
    ctx.fillStyle = theme.accent
    ctx.fillRect(28, 136, 80 + (title.length % 5) * 18, 10)
    return
  }
  if (roomId === 'procurement') {
    ctx.font = '14px Segoe UI, sans-serif'
    ;['Supplier A  £420', 'Supplier B  £455', 'Stock note  40'].forEach((line, index) => {
      ctx.fillStyle = index === 0 ? theme.accent : '#d5e4dc'
      ctx.fillText(line, 20, 64 + index * 36)
    })
    return
  }
  if (roomId === 'people') {
    ;['Role request', 'Onboarding', 'Roster'].forEach((line, index) => {
      ctx.fillStyle = '#241833'
      ctx.fillRect(16, 46 + index * 46, 288, 36)
      ctx.fillStyle = '#f0e6ff'
      ctx.font = '14px Segoe UI, sans-serif'
      ctx.fillText(line, 28, 70 + index * 46)
    })
    return
  }
  ctx.font = '15px Segoe UI, sans-serif'
  ;['Today', 'Decisions', 'Follow ups'].forEach((line, index) => {
    ctx.fillStyle = index === 0 ? theme.accent : '#d5ebe7'
    ctx.fillText(`${index + 1}  ${line}`, 20, 64 + index * 36)
  })
}

export function tvTexture(roomId: string): CanvasTexture {
  const key = `tv|${roomId}`
  const found = cache.get(key)
  if (found) return found
  const canvas = document.createElement('canvas')
  canvas.width = 480
  canvas.height = 270
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a television')
  const themes: Record<string, { bg: string; accent: string; title: string }> = {
    sales: { bg: '#10283a', accent: '#3ec6ff', title: 'Pipeline' },
    executive: { bg: '#102826', accent: '#8ef0e2', title: 'Briefing' },
    comms: { bg: '#2a1424', accent: '#f08ad4', title: 'Channels' },
    meeting: { bg: '#121a28', accent: '#9eb6d4', title: 'Agenda' },
    operations: { bg: '#0c1c18', accent: '#39e6c5', title: 'Operations' },
  }
  const theme = themes[roomId] ?? themes.meeting
  ctx.fillStyle = theme.bg
  ctx.fillRect(0, 0, 480, 270)
  ctx.fillStyle = theme.accent
  ctx.fillRect(0, 0, 480, 36)
  ctx.fillStyle = '#081018'
  ctx.font = '700 26px Segoe UI, sans-serif'
  ctx.fillText(theme.title, 24, 27)
  if (roomId === 'meeting') {
    ;['1  Riverside lead', '2  Launch checklist', '3  Open questions'].forEach((line, index) => {
      ctx.fillStyle = '#1c2838'
      ctx.fillRect(28, 78 + index * 56, 424, 44)
      ctx.fillStyle = '#e7eef8'
      ctx.font = '22px Segoe UI, sans-serif'
      ctx.fillText(line, 44, 108 + index * 56)
    })
  } else if (roomId === 'comms') {
    ;['Draft ready', 'Review', 'Hold'].forEach((line, index) => {
      ctx.fillStyle = '#3a2034'
      ctx.fillRect(28, 78 + index * 56, 424, 44)
      ctx.fillStyle = theme.accent
      ctx.fillRect(40, 90 + index * 56, 18, 18)
      ctx.fillStyle = '#f8e8f4'
      ctx.font = '22px Segoe UI, sans-serif'
      ctx.fillText(line, 72, 108 + index * 56)
    })
  } else {
    ;[0.72, 0.46, 0.84, 0.33].forEach((amount, index) => {
      const x = 48 + index * 108
      ctx.fillStyle = '#1a3040'
      ctx.fillRect(x, 80, 72, 150)
      ctx.fillStyle = theme.accent
      ctx.fillRect(x, 230 - amount * 140, 72, amount * 140)
    })
  }
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  cache.set(key, texture)
  return texture
}

export function workTexture(roomId: string, title: string): CanvasTexture {
  const key = `${roomId}|${title}`
  const found = cache.get(key)
  if (found) return found
  const canvas = document.createElement('canvas')
  canvas.width = 320
  canvas.height = 200
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Could not draw a desk screen')
  paint(ctx, roomId, title)
  const texture = new CanvasTexture(canvas)
  texture.colorSpace = SRGBColorSpace
  cache.set(key, texture)
  return texture
}
