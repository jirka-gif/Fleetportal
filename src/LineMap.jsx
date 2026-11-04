import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Reálná mapa linek flotily (Leaflet + CartoDB, bez klíče). Linky z jízdních řádů
// vykreslené přes skutečné GPS zastávek, autobusy se pohybují po trase.
export default function LineMap({ lines = [], hotspot, height = 560 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    if (!document.getElementById('fp-hot-style')) {
      const st = document.createElement('style'); st.id = 'fp-hot-style'
      st.textContent = `.fp-hot{position:relative;width:20px;height:20px}.fp-hot b{position:absolute;left:5px;top:5px;width:10px;height:10px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}.fp-hot span{position:absolute;left:1px;top:1px;width:18px;height:18px;border-radius:50%;background:#EF4444;opacity:.5;animation:fpHot 2s ease-out infinite}@keyframes fpHot{0%{transform:scale(.5);opacity:.6}100%{transform:scale(2.2);opacity:0}}`
      document.head.appendChild(st)
    }
    const map = L.map(elRef.current, { scrollWheelZoom: true, attributionControl: true, zoomControl: true }).setView([48.97, 14.5], 10)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', attribution: '© OpenStreetMap' }).addTo(map)

    const allLatLngs = []
    const buses = []

    lines.forEach((ln) => {
      const pts = ln.stops.map((s) => [s.lat, s.lon])
      if (pts.length < 2) return
      pts.forEach((p) => allLatLngs.push(p))
      // trasa linky
      L.polyline(pts, { color: ln.color, weight: 4, opacity: 0.75, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      // zastávky
      ln.stops.forEach((s, i) => {
        const end = i === 0 || i === ln.stops.length - 1
        L.circleMarker([s.lat, s.lon], { radius: end ? 4.5 : 2.6, color: '#fff', weight: end ? 2 : 1, fillColor: ln.color, fillOpacity: end ? 1 : 0.65 })
          .addTo(map).bindTooltip(s.name, { direction: 'top', opacity: 0.95 })
      })
      // délky segmentů pro rovnoměrný pohyb autobusu
      const seg = []
      let total = 0
      for (let i = 1; i < pts.length; i++) {
        const d = Math.hypot(pts[i][0] - pts[i - 1][0], pts[i][1] - pts[i - 1][1])
        seg.push(d); total += d
      }
      const marker = L.circleMarker(pts[0], { radius: 7, color: '#fff', weight: 2.5, fillColor: ln.color, fillOpacity: 1 })
        .addTo(map).bindTooltip(`Linka ${ln.no} · ${ln.bus || ''}`, { direction: 'top', opacity: 0.95 })
      buses.push({ pts, seg, total, marker, dur: ln.dur || 26000, offset: (ln.offset || 0) * 1000 })
    })

    // hotspot (anomálie – odčerpávání nafty)
    if (hotspot) {
      const icon = L.divIcon({ className: '', html: `<div class="fp-hot"><span></span><b></b></div>`, iconSize: [20, 20], iconAnchor: [10, 10] })
      L.marker([hotspot.lat, hotspot.lon], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup(`<b>Anomálie</b><br>${hotspot.label}`)
      allLatLngs.push([hotspot.lat, hotspot.lon])
    }

    if (allLatLngs.length) map.fitBounds(L.latLngBounds(allLatLngs).pad(0.08))

    // animace autobusů po trase
    const posAt = (b, p) => {
      let d = p * b.total
      for (let i = 0; i < b.seg.length; i++) {
        if (d <= b.seg[i] || i === b.seg.length - 1) {
          const t = b.seg[i] ? d / b.seg[i] : 0
          const a = b.pts[i], c = b.pts[i + 1]
          return [a[0] + (c[0] - a[0]) * t, a[1] + (c[1] - a[1]) * t]
        }
        d -= b.seg[i]
      }
      return b.pts[b.pts.length - 1]
    }
    const start = performance.now()
    const tick = (now) => {
      buses.forEach((b) => {
        const el = (((now - start + b.offset) % b.dur) / b.dur)
        const ll = posAt(b, el)
        b.marker.setLatLng(ll)
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => { clearTimeout(t); if (rafRef.current) cancelAnimationFrame(rafRef.current); map.remove(); mapRef.current = null }
  }, [lines, hotspot])

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', zIndex: 0 }} />
}
