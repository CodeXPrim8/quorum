import { useEffect, useState } from 'react'

type Sky = 'sun' | 'cloud' | 'rain' | 'snow' | 'fog' | 'storm'

type Reading = {
  place: string
  temp: number
  sky: Sky
  label: string
}

export function PlaceWidget() {
  const [now, setNow] = useState(() => new Date())
  const [reading, setReading] = useState<Reading | null>(null)
  const [note, setNote] = useState('Finding your weather')

  useEffect(() => {
    const id = window.setInterval(() => setNow(new Date()), 1000)
    return () => window.clearInterval(id)
  }, [])

  useEffect(() => {
    let gone = false
    void locate()
      .then(async (spot) => {
        if (!spot || gone) {
          if (!gone) setNote('Weather unavailable')
          return
        }
        const next = await loadPlace(spot.latitude, spot.longitude, spot.place)
        if (!gone) {
          setReading(next)
          setNote('')
        }
      })
      .catch(() => {
        if (!gone) setNote('Weather unavailable')
      })
    return () => {
      gone = true
    }
  }, [])

  const time = now.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
  const spoken = reading
    ? `${time}, ${Math.round(reading.temp)} degrees, ${reading.label}${reading.place ? `, ${reading.place}` : ''}`
    : `${time}. ${note}`

  return (
    <div className="place-widget" role="status" aria-label={spoken}>
      <span className={`place-sky place-sky-${reading?.sky ?? 'cloud'}`} aria-hidden="true">
        <SkyMark kind={reading?.sky ?? 'cloud'} />
      </span>
      <span>
        <strong>{time}</strong>
        <small>
          {reading ? `${Math.round(reading.temp)}° ${reading.label}${reading.place ? ` · ${reading.place}` : ''}` : note}
        </small>
      </span>
    </div>
  )
}

async function locate(): Promise<{ latitude: number; longitude: number; place: string } | null> {
  const precise = await new Promise<GeolocationPosition | null>((resolve) => {
    if (!navigator.geolocation) {
      resolve(null)
      return
    }
    navigator.geolocation.getCurrentPosition(
      (position) => resolve(position),
      () => resolve(null),
      { enableHighAccuracy: false, maximumAge: 30 * 60_000, timeout: 8_000 },
    )
  })
  if (precise) {
    return { latitude: precise.coords.latitude, longitude: precise.coords.longitude, place: '' }
  }
  const ip = await fetch('https://api.bigdatacloud.net/data/reverse-geocode-client?localityLanguage=en')
    .then((response) => response.json() as Promise<{ latitude?: number; longitude?: number; city?: string; locality?: string }>)
    .catch(() => null)
  if (!ip || typeof ip.latitude !== 'number' || typeof ip.longitude !== 'number') return null
  return { latitude: ip.latitude, longitude: ip.longitude, place: (ip.city || ip.locality || '').trim() }
}

async function loadPlace(latitude: number, longitude: number, knownPlace: string): Promise<Reading> {
  const weather = new URL('https://api.open-meteo.com/v1/forecast')
  weather.searchParams.set('latitude', String(latitude))
  weather.searchParams.set('longitude', String(longitude))
  weather.searchParams.set('current', 'temperature_2m,weather_code')
  weather.searchParams.set('timezone', 'auto')
  const place = new URL('https://api.bigdatacloud.net/data/reverse-geocode-client')
  place.searchParams.set('latitude', String(latitude))
  place.searchParams.set('longitude', String(longitude))
  place.searchParams.set('localityLanguage', 'en')
  const where = knownPlace
    ? { city: knownPlace, locality: knownPlace }
    : await fetch(place).then((response) => response.json() as Promise<{ city?: string; locality?: string }>).catch(() => ({ city: '', locality: '' }))
  const forecast = await fetch(weather).then(
    (response) => response.json() as Promise<{ current?: { temperature_2m?: number; weather_code?: number } }>,
  )
  const temp = forecast.current?.temperature_2m
  const code = forecast.current?.weather_code
  if (typeof temp !== 'number' || typeof code !== 'number') throw new Error('No weather')
  const sky = skyOf(code)
  return {
    place: (where.city || where.locality || '').trim(),
    temp,
    sky: sky.kind,
    label: sky.label,
  }
}

function skyOf(code: number): { kind: Sky; label: string } {
  if (code === 0) return { kind: 'sun', label: 'Clear' }
  if (code === 1) return { kind: 'sun', label: 'Fair' }
  if (code === 2 || code === 3) return { kind: 'cloud', label: 'Cloudy' }
  if (code === 45 || code === 48) return { kind: 'fog', label: 'Fog' }
  if ((code >= 71 && code <= 77) || code === 85 || code === 86) return { kind: 'snow', label: 'Snow' }
  if (code >= 95) return { kind: 'storm', label: 'Storm' }
  if (code >= 51) return { kind: 'rain', label: 'Rain' }
  return { kind: 'cloud', label: 'Cloudy' }
}

function SkyMark({ kind }: { kind: Sky }) {
  if (kind === 'sun') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <circle cx="12" cy="12" r="4" fill="currentColor" />
        <path d="M12 2v3M12 19v3M2 12h3M19 12h3M4.9 4.9l2.1 2.1M17 17l2.1 2.1M19.1 4.9 17 7M7 17l-2.1 2.1" />
      </svg>
    )
  }
  if (kind === 'rain' || kind === 'storm') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M7 15a5 5 0 0 1 .5-9.5A6 6 0 0 1 18 8a4 4 0 0 1 1 8H7z" fill="currentColor" opacity="0.25" />
        <path d="M8 18l-1 3M12 18l-1 3M16 18l-1 3" />
      </svg>
    )
  }
  if (kind === 'snow') {
    return (
      <svg viewBox="0 0 24 24" aria-hidden="true">
        <path d="M12 3v18M5 7l14 10M19 7 5 17" />
      </svg>
    )
  }
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true">
      <path d="M7 16a5 5 0 0 1 .4-9.6A6 6 0 0 1 18 9a4 4 0 0 1 .5 8H7z" fill="currentColor" />
    </svg>
  )
}
