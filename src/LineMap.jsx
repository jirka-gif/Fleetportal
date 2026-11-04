import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Reálná mapa linek flotily (Leaflet + OSM, bez klíče). Linky z jízdních řádů
// přes skutečné GPS zastávek. Autobusy = natočené modely, které zastavují na
// zastávkách, rozjíždějí se a zpomalují (živý model provozu).

const smooth = (x) => x * x * (3 - 2 * x) // ease-in-out → rozjezd a zpomalení
const EARTH = Math.PI / 180

function busSvg(color) {
  // pohled shora, nos vozidla míří doprava (východ) = směr 0°
  return `<svg width="30" height="15" viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1.5" width="28" height="12" rx="4" fill="${color}" stroke="#ffffff" stroke-width="1.4"/>
    <rect x="2.6" y="3" width="24.8" height="9" rx="3" fill="${color}"/>
    <path d="M24 3.2 Q28 3.2 28 7.5 Q28 11.8 24 11.8 Z" fill="#CFE8FF"/>
    <rect x="4" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="9" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="14" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="19" y="3.2" width="3.4" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="3" y="8.4" width="19.5" height="2.2" rx="1.1" fill="#ffffff" opacity="0.28"/>
    <rect x="2.6" y="2" width="24.8" height="2" rx="1" fill="#ffffff" opacity="0.33"/>
  </svg>`
}

export default function LineMap({ lines = [], hotspot, height = 560 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    if (!document.getElementById('fp-hot-style')) {
      const st = document.createElement('style'); st.id = 'fp-hot-style'
      st.textContent = `
        .fp-hot{position:relative;width:20px;height:20px}
        .fp-hot b{position:absolute;left:5px;top:5px;width:10px;height:10px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
        .fp-hot span{position:absolute;left:1px;top:1px;width:18px;height:18px;border-radius:50%;background:#EF4444;opacity:.5;animation:fpHot 2s ease-out infinite}
        @keyframes fpHot{0%{transform:scale(.5);opacity:.6}100%{transform:scale(2.2);opacity:0}}
        .fp-bus{position:relative;width:38px;height:38px;pointer-events:none}
        .fp-bus .sh{position:absolute;left:9px;top:22px;width:20px;height:8px;border-radius:50%;background:rgba(20,25,40,.28);filter:blur(1.5px)}
        .fp-bus .rot{position:absolute;left:4px;top:11px;width:30px;height:15px;transform-origin:50% 50%;transition:transform .12s linear}
        .fp-bus .rot svg{display:block;filter:drop-shadow(0 2px 2px rgba(20,25,40,.28))}
      `
      document.head.appendChild(st)
    }

    const map = L.map(elRef.current, { scrollWheelZoom: true, attributionControl: true, zoomControl: true }).setView([48.97, 14.5], 10)
    mapRef.current = map
    L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', { maxZoom: 19, subdomains: 'abc', attribution: '© OpenStreetMap' }).addTo(map)

    const allLatLngs = []
    const buses = []

    lines.forEach((ln, li) => {
      const pts = ln.stops.map((s) => [s.lat, s.lon])
      if (pts.length < 2) return
      pts.forEach((p) => allLatLngs.push(p))
      L.polyline(pts, { color: ln.color, weight: 4, opacity: 0.7, lineJoin: 'round', lineCap: 'round' }).addTo(map)
      ln.stops.forEach((s, i) => {
        const end = i === 0 || i === ln.stops.length - 1
        L.circleMarker([s.lat, s.lon], { radius: end ? 4.5 : 2.6, color: '#fff', weight: end ? 2 : 1, fillColor: ln.color, fillOpacity: end ? 1 : 0.6 })
          .addTo(map).bindTooltip(s.name, { direction: 'top', opacity: 0.95 })
      })

      // segmenty mezi zastávkami: doba jízdy úměrná vzdálenosti + prodleva na zastávce
      const segs = []
      let totalDist = 0
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const dx = (b[1] - a[1]) * Math.cos(a[0] * EARTH)
        const dy = (b[0] - a[0])
        const dist = Math.hypot(dx, dy)
        totalDist += dist
        const deg = Math.atan2(-dy, dx) * 180 / Math.PI // CSS: 0°=východ (nos doprava)
        segs.push({ a, b, dist, deg })
      }
      const avg = totalDist / segs.length || 1
      let cycle = 0
      segs.forEach((s, i) => {
        s.travel = Math.max(1200, Math.min(6500, (s.dist / avg) * 2300))
        s.dwell = 1300 + ((li * 7 + i * 13) % 10) * 130 // prodleva na zastávce 1,3–2,6 s
        s.t0 = cycle
        cycle += s.travel + s.dwell
      })

      const makeBus = (offset) => {
        const icon = L.divIcon({ className: '', html: `<div class="fp-bus"><div class="sh"></div><div class="rot">${busSvg(ln.color)}</div></div>`, iconSize: [38, 38], iconAnchor: [19, 19] })
        const marker = L.marker(pts[0], { icon, zIndexOffset: 500, interactive: false, keyboard: false }).addTo(map)
        buses.push({ segs, cycle, marker, offset, rotEl: null })
      }
      makeBus((li * 3700) % Math.max(1, cycle))
      if (ln.stops.length > 24) makeBus(((li * 3700) + cycle / 2) % cycle) // druhý vůz na dlouhé lince
    })

    if (hotspot) {
      const icon = L.divIcon({ className: '', html: `<div class="fp-hot"><span></span><b></b></div>`, iconSize: [20, 20], iconAnchor: [10, 10] })
      L.marker([hotspot.lat, hotspot.lon], { icon, zIndexOffset: 1000 }).addTo(map).bindPopup(`<b>Anomálie</b><br>${hotspot.label}`)
      allLatLngs.push([hotspot.lat, hotspot.lon])
    }
    if (allLatLngs.length) map.fitBounds(L.latLngBounds(allLatLngs).pad(0.08))

    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const start = performance.now()
    const tick = (now) => {
      const t0 = (now - start)
      buses.forEach((bus) => {
        if (!bus.rotEl && bus.marker._icon) bus.rotEl = bus.marker._icon.querySelector('.rot')
        let tt = (t0 + bus.offset) % bus.cycle
        let pos = bus.segs[bus.segs.length - 1].b, deg = 0, dwell = false
        for (const s of bus.segs) {
          if (tt < s.travel) { pos = lerp(s.a, s.b, smooth(tt / s.travel)); deg = s.deg; dwell = false; break }
          tt -= s.travel
          if (tt < s.dwell) { pos = s.b; deg = s.deg; dwell = true; break }
          tt -= s.dwell
        }
        bus.marker.setLatLng(pos)
        if (bus.rotEl) bus.rotEl.style.transform = `rotate(${deg}deg) scale(${dwell ? 0.84 : 1})`
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => { clearTimeout(t); if (rafRef.current) cancelAnimationFrame(rafRef.current); map.remove(); mapRef.current = null }
  }, [lines, hotspot])

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', zIndex: 0 }} />
}
