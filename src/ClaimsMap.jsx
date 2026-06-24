import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Reálné GPS pozice škodních clusterů (česká města / vozové parky).
const CLAIM_POINTS = [
  { city: 'Praha – Centrála', lat: 50.083, lng: 14.430, n: 12, color: '#4F6FFF' },
  { city: 'Mladá Boleslav', lat: 50.412, lng: 14.903, n: 7, color: '#F59E0B' },
  { city: 'Brno – Pobočka', lat: 49.195, lng: 16.608, n: 9, color: '#22C55E' },
  { city: 'Plzeň', lat: 49.747, lng: 13.378, n: 4, color: '#6D5EF6' },
  { city: 'Ostrava', lat: 49.835, lng: 18.292, n: 5, color: '#EF4444' },
  { city: 'Liberec', lat: 50.767, lng: 15.056, n: 3, color: '#4F6FFF' },
  { city: 'České Budějovice', lat: 48.975, lng: 14.480, n: 2, color: '#22C55E' },
]

// Interaktivní mapa škod (Leaflet + CartoDB light dlaždice). Zoom + posun,
// markery dle počtu otevřených škod. Bez API klíče.
export default function ClaimsMap({ height = 200 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    const map = L.map(elRef.current, { scrollWheelZoom: false, attributionControl: false }).setView([49.85, 15.5], 6)
    mapRef.current = map
    L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', { maxZoom: 19, subdomains: 'abcd' }).addTo(map)
    CLAIM_POINTS.forEach((p) => {
      L.circleMarker([p.lat, p.lng], { radius: Math.min(7 + p.n * 0.9, 20), color: '#fff', weight: 2, fillColor: p.color, fillOpacity: 0.85 })
        .addTo(map)
        .bindPopup(`<b>${p.city}</b><br>${p.n} otevřených škod`)
    })
    const t = setTimeout(() => map.invalidateSize(), 120)
    return () => { clearTimeout(t); map.remove(); mapRef.current = null }
  }, [])
  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', zIndex: 0 }} />
}
