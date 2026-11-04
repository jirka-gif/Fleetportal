import React, { useEffect, useRef } from 'react'
import L from 'leaflet'
import 'leaflet/dist/leaflet.css'

// Reálná mapa linek flotily (Leaflet + OSM, bez klíče). Linky z jízdních řádů přes
// skutečné GPS zastávek. Autobusy = natočené modely, zastavují/rozjíždějí se.
// Klik/hover na vůz = detail jako flightradar (stroj, SPZ, řidič, stav jednotky, jízda).
// Anomálie = piny na mapě, proklik na detail (+ street view v detailu).

const smooth = (x) => x * x * (3 - 2 * x)
const EARTH = Math.PI / 180
const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function busSvg(color) {
  return `<svg width="30" height="15" viewBox="0 0 30 15" xmlns="http://www.w3.org/2000/svg">
    <rect x="1" y="1.5" width="28" height="12" rx="4" fill="${color}" stroke="#ffffff" stroke-width="1.4"/>
    <path d="M24 3.2 Q28 3.2 28 7.5 Q28 11.8 24 11.8 Z" fill="#CFE8FF"/>
    <rect x="4" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="9" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="14" y="3.2" width="4.2" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="19" y="3.2" width="3.4" height="3" rx="1" fill="#DCEBFB" opacity="0.9"/>
    <rect x="3" y="8.4" width="19.5" height="2.2" rx="1.1" fill="#ffffff" opacity="0.28"/>
    <rect x="2.6" y="2" width="24.8" height="2" rx="1" fill="#ffffff" opacity="0.33"/>
  </svg>`
}

function busCard(ln) {
  return `<div class="fp-card">
    <div class="hd">
      <div class="ln" style="background:${ln.color}">${esc(ln.no)}</div>
      <div><div class="t1">${esc(ln.busName)}</div><div class="t2">${esc(ln.plate)} · r. ${esc(ln.year)}${ln.fuelType ? ' · ' + esc(ln.fuelType) : ''}</div></div>
    </div>
    <div class="rows">
      <div><span>Řidič</span><b>${esc(ln.driver)}</b></div>
      <div><span>Trasa</span><b>${esc(ln.from)} → ${esc(ln.to)}</b></div>
      <div><span>Stav</span><b class="fp-stav" style="color:#1f9d57">Na trase</b></div>
      <div><span>Rychlost</span><b class="fp-spd">0 km/h</b></div>
      <div><span>Dodržení JŘ dnes</span><b>${esc(ln.onTime)} %${ln.anom ? ' · ' + ln.anom + '× anom.' : ''}</b></div>
      <div><span>Eco jednotka</span><b>${ln.eco}/100 · ${esc(ln.ecoLabel)}</b></div>
      <div><span>Nádrž</span><b>${ln.fuelPct} %</b></div>
    </div>
    <div class="btns"><button data-act="veh">Detail vozu</button><button data-act="line">Trasa linky</button></div>
  </div>`
}

export default function LineMap({ lines = [], anomalyMarkers = [], onOpenVehicle, onOpenLine, onOpenAnomaly, height = 560 }) {
  const elRef = useRef(null)
  const mapRef = useRef(null)
  const rafRef = useRef(null)

  useEffect(() => {
    if (mapRef.current || !elRef.current) return
    if (!document.getElementById('fp-map-style')) {
      const st = document.createElement('style'); st.id = 'fp-map-style'
      st.textContent = `
        .fp-hot{position:relative;width:20px;height:20px}
        .fp-hot b{position:absolute;left:5px;top:5px;width:10px;height:10px;border-radius:50%;background:#EF4444;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.4)}
        .fp-hot span{position:absolute;left:1px;top:1px;width:18px;height:18px;border-radius:50%;background:#EF4444;opacity:.5;animation:fpHot 2s ease-out infinite}
        @keyframes fpHot{0%{transform:scale(.5);opacity:.6}100%{transform:scale(2.2);opacity:0}}
        .fp-ano{width:16px;height:16px;border-radius:50%;border:2px solid #fff;box-shadow:0 1px 3px rgba(0,0,0,.35)}
        .fp-bus{position:relative;width:38px;height:38px;cursor:pointer}
        .fp-bus .sh{position:absolute;left:9px;top:22px;width:20px;height:8px;border-radius:50%;background:rgba(20,25,40,.28);filter:blur(1.5px)}
        .fp-bus .rot{position:absolute;left:4px;top:11px;width:30px;height:15px;transform-origin:50% 50%;transition:transform .12s linear}
        .fp-bus .rot svg{display:block;filter:drop-shadow(0 2px 2px rgba(20,25,40,.28))}
        .fp-card{font-family:inherit;min-width:230px}
        .fp-card .hd{display:flex;align-items:center;gap:9px;margin-bottom:9px}
        .fp-card .ln{min-width:30px;height:26px;padding:0 8px;border-radius:7px;color:#fff;font-weight:800;font-size:14px;display:flex;align-items:center;justify-content:center}
        .fp-card .t1{font-size:13.5px;font-weight:700;color:#18181B}
        .fp-card .t2{font-size:11.5px;color:#6b7280}
        .fp-card .rows>div{display:flex;justify-content:space-between;gap:12px;padding:3.5px 0;font-size:12px;border-top:1px solid #eef0f4}
        .fp-card .rows>div:first-child{border-top:none}
        .fp-card .rows span{color:#6b7280}.fp-card .rows b{color:#18181B;font-weight:650;text-align:right}
        .fp-card .btns{display:flex;gap:7px;margin-top:10px}
        .fp-card .btns button{flex:1;border:none;cursor:pointer;height:32px;border-radius:9px;font-size:12px;font-weight:600;font-family:inherit}
        .fp-card .btns button[data-act=veh]{background:linear-gradient(135deg,#5B6BF5,#7A5CF8);color:#fff}
        .fp-card .btns button[data-act=line]{background:#EEF2F9;color:#334155}
        .fp-anocard{font-family:inherit;min-width:200px}
        .fp-anocard .t{font-size:13px;font-weight:750;color:#18181B}
        .fp-anocard .s{font-size:11.5px;color:#6b7280;margin:2px 0 9px}
        .fp-anocard button{border:none;cursor:pointer;height:32px;padding:0 12px;border-radius:9px;font-size:12px;font-weight:600;font-family:inherit;background:linear-gradient(135deg,#EF4444,#F97316);color:#fff}
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

      const segs = []
      let totalDist = 0
      for (let i = 1; i < pts.length; i++) {
        const a = pts[i - 1], b = pts[i]
        const dx = (b[1] - a[1]) * Math.cos(a[0] * EARTH), dy = (b[0] - a[0])
        const dist = Math.hypot(dx, dy); totalDist += dist
        segs.push({ a, b, dist, deg: Math.atan2(-dy, dx) * 180 / Math.PI, name: ln.stops[i] ? ln.stops[i].name : '' })
      }
      const avg = totalDist / segs.length || 1
      let cycle = 0
      segs.forEach((s, i) => { s.travel = Math.max(1200, Math.min(6500, (s.dist / avg) * 2300)); s.dwell = 1300 + ((li * 7 + i * 13) % 10) * 130; s.t0 = cycle; cycle += s.travel + s.dwell })
      const maxSpeed = ln.no === '300' ? 72 : 46

      const makeBus = (offset) => {
        const icon = L.divIcon({ className: '', html: `<div class="fp-bus"><div class="sh"></div><div class="rot">${busSvg(ln.color)}</div></div>`, iconSize: [38, 38], iconAnchor: [19, 19] })
        const marker = L.marker(pts[0], { icon, zIndexOffset: 500, riseOnHover: true }).addTo(map)
        marker.bindTooltip(`Linka ${ln.no} · ${ln.plate}`, { direction: 'top', offset: [0, -8], opacity: 0.95 })
        marker.bindPopup(busCard(ln), { minWidth: 240, className: 'fp-pop', autoPan: true })
        const bus = { segs, cycle, marker, offset, maxSpeed, ln, rotEl: null, open: false }
        marker.on('popupopen', (e) => {
          bus.open = true
          const el = e.popup.getElement()
          const vb = el.querySelector('[data-act=veh]'); if (vb && onOpenVehicle && ln.vehicleId) vb.onclick = () => onOpenVehicle(ln.vehicleId)
          const lb = el.querySelector('[data-act=line]'); if (lb && onOpenLine && ln.lineId) lb.onclick = () => onOpenLine(ln.lineId)
        })
        marker.on('popupclose', () => { bus.open = false })
        buses.push(bus)
      }
      makeBus((li * 3700) % Math.max(1, cycle))
      if (ln.stops.length > 24) makeBus(((li * 3700) + cycle / 2) % cycle)
    })

    // anomálie na mapě
    anomalyMarkers.forEach((a) => {
      allLatLngs.push([a.lat, a.lon])
      const icon = a.hot
        ? L.divIcon({ className: '', html: `<div class="fp-hot"><span></span><b></b></div>`, iconSize: [20, 20], iconAnchor: [10, 10] })
        : L.divIcon({ className: '', html: `<div class="fp-ano" style="background:${a.color}"></div>`, iconSize: [16, 16], iconAnchor: [8, 8] })
      const mk = L.marker([a.lat, a.lon], { icon, zIndexOffset: a.hot ? 1000 : 800 }).addTo(map)
      mk.bindPopup(`<div class="fp-anocard"><div class="t">${esc(a.typeLabel)}</div><div class="s">${esc(a.place)}${a.metric ? ' · ' + esc(a.metric) : ''}</div><button data-ano="${a.id}">Zobrazit detail →</button></div>`, { minWidth: 200, className: 'fp-pop' })
      mk.on('popupopen', (e) => { const b = e.popup.getElement().querySelector('[data-ano]'); if (b && onOpenAnomaly) b.onclick = () => onOpenAnomaly(a.id) })
    })

    if (allLatLngs.length) map.fitBounds(L.latLngBounds(allLatLngs).pad(0.08))

    const lerp = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t]
    const start = performance.now()
    const tick = (now) => {
      const t0 = now - start
      buses.forEach((bus) => {
        if (!bus.rotEl && bus.marker._icon) bus.rotEl = bus.marker._icon.querySelector('.rot')
        let tt = (t0 + bus.offset) % bus.cycle
        let pos = bus.segs[bus.segs.length - 1].b, deg = 0, dwell = false, p = 0, name = ''
        for (const s of bus.segs) {
          if (tt < s.travel) { p = tt / s.travel; pos = lerp(s.a, s.b, smooth(p)); deg = s.deg; dwell = false; name = s.name; break }
          tt -= s.travel
          if (tt < s.dwell) { pos = s.b; deg = s.deg; dwell = true; name = s.name; break }
          tt -= s.dwell
        }
        bus.marker.setLatLng(pos)
        if (bus.rotEl) bus.rotEl.style.transform = `rotate(${deg}deg) scale(${dwell ? 0.84 : 1})`
        if (bus.open) {
          const el = bus.marker.getPopup() && bus.marker.getPopup().getElement()
          if (el) {
            const spd = el.querySelector('.fp-spd'), st = el.querySelector('.fp-stav')
            if (dwell) { if (spd) spd.textContent = '0 km/h'; if (st) { st.textContent = name ? 'Zastávka: ' + name : 'Zastávka — nástup'; st.style.color = '#B45309' } }
            else { const kmh = Math.round(bus.maxSpeed * 6 * p * (1 - p)); if (spd) spd.textContent = kmh + ' km/h'; if (st) { st.textContent = name ? 'Na trase → ' + name : 'Na trase'; st.style.color = '#1f9d57' } }
          }
        }
      })
      rafRef.current = requestAnimationFrame(tick)
    }
    rafRef.current = requestAnimationFrame(tick)

    const t = setTimeout(() => map.invalidateSize(), 150)
    return () => { clearTimeout(t); if (rafRef.current) cancelAnimationFrame(rafRef.current); map.remove(); mapRef.current = null }
  }, [lines, anomalyMarkers, onOpenVehicle, onOpenLine, onOpenAnomaly])

  return <div ref={elRef} style={{ height, width: '100%', borderRadius: 14, overflow: 'hidden', border: '1px solid var(--border)', zIndex: 0 }} />
}
