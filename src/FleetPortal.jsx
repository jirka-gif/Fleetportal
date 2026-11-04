import React, { useState, useRef } from 'react'
import { Icon, czk, linePath, useViewport, buildExecReportHtml } from './helpers.jsx'
import Render from './Render.jsx'
import {
  insurersData, brandsData, fleetsData, vehiclesData, claimsData, greenCards, driversData,
  statusMeta, claimStatusMeta, fleetName, statusChip, vehicleTypeCat, vehicleTypeOrder, vehicleStk, vehicleVignette, leasingPartners,
  linesData, busDrivers, ecoScore, ecoBand, ecoSavings, heaterCost, NAFTA_CZK, STOP_COORDS, PLACE_COORDS,
  vehicleAnnualCost, vehicleAgeBand, vehicleAgeBandOrder,
} from './data.js'

const ic = (name, size = 18, sw = 1.8) => <Icon name={name} size={size} sw={sw} />

// Typy vozidel (z druhu vozidla) — kategorie pro grafy a filtry. Park = lokalita, tohle je typ.
const typeCats = vehicleTypeOrder.map((name, i) => {
  const vs = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === name)
  return { id: 't' + (i + 1), name, vehicles: vs.length, hav: vs.filter((v) => v.cov && v.cov.hav).length }
}).filter((c) => c.vehicles > 0)

// ---- Linky: deterministická simulace „skutečné jízdy" nad reálným jízdním řádem ----
const _hash = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const _rng = (seed) => () => { seed = seed + 0x6D2B79F5 | 0; let t = Math.imul(seed ^ seed >>> 15, 1 | seed); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296 }
const _toMin = (t) => { const p = String(t).split(':'); return (+p[0]) * 60 + (+p[1] || 0) }
const _fmtMin = (m) => { m = ((Math.round(m) % 1440) + 1440) % 1440; return String(Math.floor(m / 60)).padStart(2, '0') + ':' + String(m % 60).padStart(2, '0') }
function simulateLineRun(line) {
  const rnd = _rng(_hash(line.id + 'v6'))
  const sev = (_hash(line.id + 'sev') % 100) / 100 // náročnost linky 0..1 (provoz, hustota)
  const bias = 0.05 + sev * 0.16
  const noiseS = 0.85 + sev * 1.7
  const spikeP = 0.035 + sev * 0.08
  const n = line.stops.length
  const hasSkip = _hash(line.id) % 4 === 1 // ~čtvrtina linek má na spoji vynechanou zastávku
  const skipIdx = hasSkip ? 3 + Math.floor(rnd() * Math.max(1, n - 6)) : -1
  const earlyLine = _hash(line.id) % 5 === 2 // část linek má úsek s jízdou před časem
  let delay = 0
  const stops = line.stops.map((s, i) => {
    delay = delay * 0.74 + (rnd() - 0.5) * noiseS + bias // mean-reverting: zpoždění se dohání
    if (rnd() < spikeP) delay += 2 + rnd() * 5 // krátká kongesce
    if (earlyLine && i > 2 && i < 5) delay -= 1.2
    if (delay < -1.6) delay = -1.6
    if (i === 0) delay = Math.max(-0.4, Math.min(0.6, delay))
    const d = Math.round(delay)
    const skipped = i === skipIdx
    return { n: s.n, planned: s.t, actual: skipped ? '—' : _fmtMin(_toMin(s.t) + d), delay: d, skipped,
      status: skipped ? 'skip' : d < 0 ? 'early' : d <= 5 ? 'ontime' : 'late' }
  })
  const run = stops.filter((s) => !s.skipped)
  const onTime = run.filter((s) => s.status === 'ontime').length
  return {
    stops, onTimePct: run.length ? Math.round(onTime / run.length * 100) : 0,
    maxDelay: Math.max(0, ...run.map((s) => s.delay)),
    avgDelay: run.length ? +(run.reduce((a, s) => a + s.delay, 0) / run.length).toFixed(1) : 0,
    skips: stops.filter((s) => s.skipped).length,
  }
}

// ---- Dispečink: oběhy vozidel a turnusy řidičů pro vybraný den (modelové) ----
const DISPATCH_DAY_LABEL = 'úterý 3. 11. 2026'
const DISPATCH_T0 = 180  // 03:00 (začátek osy)
const DISPATCH_T1 = 1440 // 24:00 (konec osy)
const _durLabel = (m) => { const h = Math.floor(m / 60), mm = m % 60; return mm ? `${h} h ${mm} min` : `${h} h` }
const dutyStatusOf = (drive, brk) => drive > 9 * 60 ? { label: 'Překročena doba řízení', sev: 2, color: 'var(--star)', bg: 'var(--star-soft)' }
  : brk < 45 ? { label: 'Krátká přestávka', sev: 1, color: '#B45309', bg: 'var(--amber-soft)' }
  : drive > 8.5 * 60 ? { label: 'Blíží se limitu', sev: 1, color: '#B45309', bg: 'var(--amber-soft)' }
  : { label: 'V normě', sev: 0, color: 'var(--green)', bg: 'var(--green-soft)' }

// ---- Výkon a chování řidiče: deterministický model nad reálnými řidiči ----
// Telematika, eco, anomálie a QR hlášení jsou pro ukázku modelované (seed = id řidiče),
// po nasazení jednotek a QR kódů ve vozech je nahradí reálná měření a hlášení.
const DRIVER_FLEET_AVG = { eco: 68, onTime: 94 } // benchmark flotily pro srovnání
function buildDriverPerf(d) {
  const seed = _hash('perf-' + d.id)
  const R = _rng(seed)
  const rint = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1))
  const q = d.status === 'inactive' ? 0.55 : 0.32 + R() * 0.62   // kvalita jízdy 0..1 (vyšší = lepší)
  const bad = 1 - q
  const km = { mhd: 4600, linka: 6400, dalkova: 10800, osobni: 2400 }[d.kind] || 5200
  const ref = { mhd: 38.5, linka: 29, dalkova: 26.5, osobni: 7.2 }[d.kind] || 30
  const tripsPerShift = { mhd: 19, linka: 8, dalkova: 3, osobni: 0 }[d.kind] ?? 6
  const kindLabel = { mhd: 'MHD', linka: 'Linková doprava', dalkova: 'Dálková a zájezdová', osobni: 'Referentská vozidla' }[d.kind] || 'Doprava'

  const shifts30 = d.kind === 'osobni' ? rint(13, 18) : rint(18, 22)
  const km30 = Math.round(km * (0.9 + R() * 0.2))
  const trips30 = tripsPerShift ? Math.max(0, shifts30 * tripsPerShift + rint(-8, 8)) : 0
  const hours30 = Math.round(shifts30 * (d.kind === 'dalkova' ? 8.6 : 7.4))

  // telematika / styl jízdy
  const tele = {
    fuel: 'Diesel', km: km30, ref,
    cons: +Math.max(ref - 0.8, ref + bad * 3.4 - 0.5).toFixed(1),
    accel: Math.round(2 + bad * 8), brake: Math.round(2 + bad * 7), start: Math.round(1 + bad * 5),
    overrev: Math.round(bad * 3), speeding: Math.round(bad * 4),
    idle: Math.round(16 + bad * 36), heater: Math.round(22 + bad * 72),
    heaterL: Math.round((22 + bad * 72) * 0.42),
  }
  const score = ecoScore(tele)
  const band = ecoBand(score)
  const sav = ecoSavings(tele)                  // nadspotřeba za 30 dní
  const heaterYear = heaterCost(tele) * 12
  const fuelYear = sav.czk * 12
  const finesCount = Math.round(bad * 6)
  const finesYear = finesCount * 1200
  const styleCostYear = fuelYear + heaterYear + finesYear

  // dodržení jízdních řádů
  const onTime = Math.min(99, Math.round(87 + q * 12))
  const delays30 = Math.round(bad * 38)
  const earlyDep30 = Math.round(bad * 7)
  const missedStops30 = Math.round(bad * 3)
  const avgDelay = +(bad * 2.8).toFixed(1)

  const czkF = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč'
  const sev = (v, warn, danger) => v >= danger ? { color: 'var(--star)' } : v >= warn ? { color: '#F59E0B' } : { color: 'var(--green)' }
  const styleItems = [
    { label: 'Prudká akcelerace', icon: 'trend', value: `${tele.accel}× / 100 km`, pct: Math.min(100, tele.accel / 10 * 100), color: sev(tele.accel, 5, 8).color },
    { label: 'Prudké brzdění', icon: 'alert', value: `${tele.brake}× / 100 km`, pct: Math.min(100, tele.brake / 9 * 100), color: sev(tele.brake, 4, 7).color },
    { label: 'Trhavé rozjezdy', icon: 'swap', value: `${tele.start}× / 100 km`, pct: Math.min(100, tele.start / 6 * 100), color: sev(tele.start, 3, 5).color },
    { label: 'Překročení rychlosti', icon: 'gauge', value: `${tele.speeding}× / 100 km`, pct: Math.min(100, tele.speeding / 5 * 100), color: sev(tele.speeding, 2, 4).color },
    { label: 'Volnoběh (prostoje)', icon: 'clock', value: `${tele.idle} min / směna`, pct: Math.min(100, tele.idle / 60 * 100), color: sev(tele.idle, 30, 45).color },
    { label: 'Nezávislé topení', icon: 'fuel', value: `${tele.heaterL} l / měsíc`, pct: Math.min(100, tele.heaterL / 45 * 100), color: sev(tele.heaterL, 20, 34).color },
  ]
  const consDelta = +(tele.cons - ref).toFixed(1)

  const costItems = [
    { label: 'Nadspotřeba paliva', icon: 'fuel', color: '#6D5EF6', value: czkF(fuelYear), pct: styleCostYear ? Math.round(fuelYear / styleCostYear * 100) : 0 },
    { label: 'Nezávislé topení', icon: 'wrench', color: 'var(--blue)', value: czkF(heaterYear), pct: styleCostYear ? Math.round(heaterYear / styleCostYear * 100) : 0 },
    { label: 'Pokuty a přestupky', icon: 'alert', color: 'var(--star)', value: czkF(finesYear), pct: styleCostYear ? Math.round(finesYear / styleCostYear * 100) : 0 },
  ]

  const kpis = [
    { value: String(score), unit: '/ 100', label: 'Eco skóre jízdy', icon: 'gauge', note: `${band.label} · ${score >= DRIVER_FLEET_AVG.eco ? '+' : ''}${score - DRIVER_FLEET_AVG.eco} vs. průměr flotily` },
    { value: `${onTime}`, unit: '%', label: 'Dodržení jízdních řádů', icon: 'clock', note: `${delays30}× zpoždění / 30 dní` },
    { value: (km30 / 1000).toFixed(1).replace('.', ','), unit: 'tis. km', label: 'Najeto za 30 dní', icon: 'bus', note: `${(km30 * 12 / 1000).toFixed(0)} tis. km / rok` },
    { value: String(shifts30), unit: 'směn', label: 'Odpracováno / 30 dní', icon: 'calendar', note: trips30 ? `${trips30} spojů · ${hours30} h za volantem` : `${hours30} h za volantem` },
  ]

  // ---- Historie anomálií (posledních ~90 dní) ----
  const BASE = new Date(2026, 10, 3)
  const fmtD = (daysAgo) => { const dt = new Date(BASE); dt.setDate(dt.getDate() - daysAgo); return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}` }
  const lineNo = { mhd: ['7', '3', '5'], linka: ['300', '440', '360'], dalkova: ['700', 'DÁL 1', 'zájezd'], osobni: ['—'] }[d.kind] || ['—']
  const anoPool = [
    { t: 'Velké zpoždění na lince', det: (ln) => `+${rint(6, 14)} min · linka ${ln}`, sev: 'high', w: tele.speeding + delays30 / 6 },
    { t: 'Prudká akcelerace a brzdění', det: () => `${rint(6, 14)} událostí za směnu`, sev: 'mid', w: tele.accel + tele.brake },
    { t: 'Překročení povolené rychlosti', det: () => `+${rint(8, 22)} km/h mimo obec`, sev: 'high', w: tele.speeding * 2 },
    { t: 'Nadměrný volnoběh', det: () => `${rint(35, 70)} min na stojícím voze`, sev: 'low', w: Math.max(0, tele.idle - 28) },
    { t: 'Odjezd ze zastávky před časem', det: (ln) => `−${rint(1, 3)} min · linka ${ln}`, sev: 'mid', w: earlyDep30 * 3 },
    { t: 'Vynechaná zastávka', det: (ln) => `linka ${ln}`, sev: 'high', w: missedStops30 * 5 },
    { t: 'Nadměrná spotřeba paliva', det: () => `+${(bad * 3).toFixed(1)} l / 100 km nad referencí`, sev: 'mid', w: Math.max(0, consDelta) * 5 },
    { t: 'Dlouhé nezávislé topení', det: () => `${rint(60, 140)} min / směna`, sev: 'low', w: Math.max(0, tele.heaterL - 20) },
    { t: 'Blíží se limit doby řízení', det: () => `${rint(8, 9)} h řízení bez delší přestávky`, sev: 'mid', w: 4 },
  ]
  const sevMeta = { high: { label: 'Vysoká', color: 'var(--star)', bg: 'var(--star-soft)' }, mid: { label: 'Střední', color: '#B45309', bg: 'var(--amber-soft)' }, low: { label: 'Nízká', color: 'var(--blue-ink)', bg: 'var(--blue-soft)' } }
  const anoN = Math.min(12, Math.round(bad * 11) + (q > 0.82 ? 0 : 1))
  const anoWeighted = anoPool.filter((a) => a.w > 0.5).sort((a, b) => b.w - a.w)
  const anomalies = []
  let dayCursor = rint(1, 4)
  for (let i = 0; i < anoN; i++) {
    const a = anoWeighted.length ? anoWeighted[(seed + i) % anoWeighted.length] : anoPool[i % anoPool.length]
    const ln = lineNo[(seed + i) % lineNo.length]
    anomalies.push({ date: fmtD(dayCursor), title: a.t, detail: a.det(ln), sev: a.sev, sevMeta: sevMeta[a.sev] })
    dayCursor += rint(4, 11)
  }

  // ---- QR hlášení chování z vozidel (cestující/kolegové) ----
  const chan = {
    qr: { label: 'QR kód ve voze', icon: 'grid' },
    app: { label: 'Web / aplikace', icon: 'file' },
    phone: { label: 'Telefon dispečink', icon: 'phone' },
  }
  const kindMeta = {
    pochvala: { label: 'Pochvala', color: 'var(--green)', bg: 'var(--green-soft)', icon: 'star' },
    stiznost: { label: 'Stížnost', color: 'var(--star)', bg: 'var(--star-soft)', icon: 'alert' },
    podnet: { label: 'Podnět', color: 'var(--blue-ink)', bg: 'var(--blue-soft)', icon: 'info' },
  }
  const stMeta = {
    new: { label: 'Nové', color: '#B45309', bg: 'var(--amber-soft)' },
    prog: { label: 'V řešení', color: 'var(--blue-ink)', bg: 'var(--blue-soft)' },
    done: { label: 'Vyřešeno', color: 'var(--green)', bg: 'var(--green-soft)' },
  }
  const txtPochvala = ['Ohleduplná a plynulá jízda, poděkování od cestujícího.', 'Řidič počkal na přibíhajícího cestujícího.', 'Příjemné a ochotné jednání, čistý a vyvětraný vůz.', 'Pomohl cestující s kočárkem při nástupu.', 'Trpělivě poradil s přestupem a tarifem.']
  const txtStiznost = ['Prudké brzdění, cestující upozorňuje na nebezpečnou jízdu.', 'Odjezd ze zastávky o chvíli dříve než dle JŘ.', 'Nezastavil na znamení na zastávce na znamení.', 'Hlučné a trhané řazení během jízdy.', 'Přetopený vůz, dlouhé topení i na stojícím autobuse.', 'Telefonování během jízdy.']
  const txtPodnet = ['Námět na úpravu času odjezdu ranního spoje.', 'Dotaz na bezbariérový nájezd u tohoto vozu.', 'Návrh na doplnění informací o zpoždění ve voze.']
  const pick = (arr, k) => arr[(seed + k) % arr.length]
  const nPochvala = Math.max(q > 0.7 ? 1 : 0, Math.round(q * 4))
  const nStiznost = Math.round(bad * 4)
  const nPodnet = rint(0, 2)
  const reports = []
  let rc = rint(2, 6)
  const pushRep = (kind, txtArr, idx, chKey) => {
    const statuses = ['done', 'done', 'prog', 'new']
    reports.push({
      date: fmtD(rc), channel: chan[chKey].label, channelIcon: chan[chKey].icon,
      kind, kindLabel: kindMeta[kind].label, kindColor: kindMeta[kind].color, kindBg: kindMeta[kind].bg, kindIcon: kindMeta[kind].icon,
      text: pick(txtArr, idx), status: statuses[(seed + idx) % statuses.length], statusMeta: stMeta[statuses[(seed + idx) % statuses.length]],
    })
    rc += rint(3, 12)
  }
  for (let i = 0; i < nStiznost; i++) pushRep('stiznost', txtStiznost, i, i % 2 === 0 ? 'qr' : (i % 3 === 0 ? 'phone' : 'app'))
  for (let i = 0; i < nPochvala; i++) pushRep('pochvala', txtPochvala, i, i % 2 === 0 ? 'qr' : 'app')
  for (let i = 0; i < nPodnet; i++) pushRep('podnet', txtPodnet, i, 'qr')
  reports.sort((a, b) => {
    const pa = a.date.split('. ').map(Number), pb = b.date.split('. ').map(Number)
    return (pb[2] - pa[2]) || (pb[1] - pa[1]) || (pb[0] - pa[0])
  })
  const reportStats = {
    total: reports.length,
    pochvala: reports.filter((r) => r.kind === 'pochvala').length,
    stiznost: reports.filter((r) => r.kind === 'stiznost').length,
    qr: reports.filter((r) => r.channelIcon === 'grid').length,
    resolvedPct: reports.length ? Math.round(reports.filter((r) => r.status === 'done').length / reports.length * 100) : 100,
  }

  // ---- Vývoj eco skóre za 12 měsíců ----
  const months = ['pro', 'led', 'úno', 'bře', 'dub', 'kvě', 'čvn', 'čvc', 'srp', 'zář', 'říj', 'lis']
  let ms = Math.max(30, score - rint(4, 10))
  const trend = months.map((m, i) => {
    ms = Math.max(25, Math.min(100, Math.round(ms + (score - ms) * 0.35 + (R() - 0.5) * 9)))
    const v = i === months.length - 1 ? score : ms
    return { label: m, value: v, h: Math.max(8, v) + '%' }
  })

  // ---- Verdikt pro majitele / správce ----
  const verdict = score >= 80
    ? { title: 'Hospodárný a spolehlivý řidič', sub: `Styl jízdy šetří provozní náklady. Dodržení JŘ ${onTime} %. Vhodný jako vzor pro ostatní.`, icon: 'star', color: 'var(--green)' }
    : score >= 65
      ? { title: 'Standardní výkon s prostorem ke zlepšení', sub: `Styl jízdy stojí navíc ~${czkF(styleCostYear)} ročně oproti hospodárné jízdě. Doporučen kondiční trénink.`, icon: 'gauge', color: 'var(--blue)' }
      : { title: 'Rizikový styl jízdy', sub: `Navíc ~${czkF(styleCostYear)} ročně (palivo, topení, pokuty) a ${delays30}× zpoždění za 30 dní. Doporučujeme školení a sledování.`, icon: 'alert', color: 'var(--star)' }

  return {
    kindLabel, score, band, onTime, delays30, earlyDep30, missedStops30, avgDelay,
    shifts30, km30, trips30, hours30, kpis, styleItems, consF: tele.cons.toFixed(1).replace('.', ','), refF: ref.toFixed(1).replace('.', ','), consDelta, fuelYear, costItems,
    styleCostYearF: czkF(styleCostYear), styleCostYear, fleetAvg: DRIVER_FLEET_AVG,
    anomalies, anoCount: anomalies.length, reports, reportStats, trend, verdict,
  }
}

// ---- Anomálie: detekce napříč flotilou (linky, trasy, vozidla, řidiči) ----
// Modelové záznamy pro ukázku, deterministické. Po nasazení telematiky + GPS +
// sledování paliva je nahradí reálné detekce (geofence, úbytek nádrže, styl jízdy).
const ANO_SEV = {
  high: { label: 'Vysoká', color: 'var(--star)', bg: 'var(--star-soft)', order: 0 },
  mid: { label: 'Střední', color: '#B45309', bg: 'var(--amber-soft)', order: 1 },
  low: { label: 'Nízká', color: 'var(--blue-ink)', bg: 'var(--blue-soft)', order: 2 },
}
const ANO_TYPES = {
  offroute_stop: { label: 'Opakované zastavení mimo trasu', cat: 'Palivo a GPS', icon: 'pin' },
  fuel_drop: { label: 'Neobvyklý úbytek paliva', cat: 'Palivo a GPS', icon: 'fuel' },
  consumption: { label: 'Nadměrná spotřeba paliva', cat: 'Palivo a GPS', icon: 'fuel' },
  delay: { label: 'Velké zpoždění', cat: 'Provoz a JŘ', icon: 'clock' },
  missed_stop: { label: 'Vynechaná zastávka', cat: 'Provoz a JŘ', icon: 'pin' },
  early_dep: { label: 'Odjezd ze zastávky před časem', cat: 'Provoz a JŘ', icon: 'clock' },
  harsh: { label: 'Agresivní styl jízdy', cat: 'Styl jízdy', icon: 'alert' },
  speeding: { label: 'Překročení rychlosti', cat: 'Styl jízdy', icon: 'gauge' },
  idle: { label: 'Nadměrný volnoběh', cat: 'Styl jízdy', icon: 'clock' },
  heater: { label: 'Dlouhé nezávislé topení', cat: 'Náklady', icon: 'wrench' },
}
const ANO_STATUS = {
  new: { label: 'Nové', color: '#B45309', bg: 'var(--amber-soft)' },
  prog: { label: 'V řešení', color: 'var(--blue-ink)', bg: 'var(--blue-soft)' },
  done: { label: 'Vyřešeno', color: 'var(--green)', bg: 'var(--green-soft)' },
}
const _anoDateKey = (s) => { const p = String(s).split('. ').map(Number); return p[2] * 10000 + p[1] * 100 + p[0] }
function buildAnomalies() {
  const R = _rng(_hash('fleet-anomalies-v1'))
  const rint = (lo, hi) => lo + Math.floor(R() * (hi - lo + 1))
  const BASE = new Date(2026, 10, 3)
  const fmtD = (daysAgo) => { const dt = new Date(BASE); dt.setDate(dt.getDate() - daysAgo); return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}` }
  const buses = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy')
  const busDrv = driversData.filter((d) => ['linka', 'mhd', 'dalkova'].includes(d.kind))
  const pool = buses.length ? buses : vehiclesData
  const pickBus = (k) => pool[_hash('b' + k) % pool.length]
  const pickDrv = (k) => busDrv[_hash('d' + k) % busDrv.length] || driversData[0]
  const pickLine = (k) => linesData[_hash('l' + k) % linesData.length]
  const list = []
  let auto = 0
  const vName = (v) => v ? `${v.brand} ${v.model}`.trim() : '—'
  const coordOf = (o) => {
    if (o.lat && o.lon) return [o.lat, o.lon]
    const key = o.place ? o.place.replace(' (mimo trasu i zastávky)', '') : null
    if (key && STOP_COORDS[key]) return STOP_COORDS[key]
    if (key && PLACE_COORDS[key]) return PLACE_COORDS[key]
    return [null, null]
  }
  const mk = (type, sev, o) => {
    const t = ANO_TYPES[type]
    const [lat, lon] = coordOf(o)
    list.push({
      id: 'an' + (++auto), type, typeLabel: t.label, cat: t.cat, icon: t.icon, sev, sevMeta: ANO_SEV[sev],
      date: o.date, time: o.time || _fmtMin(rint(5 * 60, 20 * 60)),
      vehicleId: o.vehicle ? o.vehicle.id : null, plate: o.vehicle ? o.vehicle.plate : '—', vehicle: vName(o.vehicle),
      driverId: o.driver ? o.driver.id : null, driverName: o.driver ? o.driver.name : '—',
      lineNo: o.line ? o.line.no : null, lineName: o.line ? o.line.name : null,
      place: o.place || null, lat, lon, detail: o.detail, metric: o.metric || null,
      status: o.status || 'new', statusMeta: ANO_STATUS[o.status || 'new'],
      loss: o.loss || 0, reco: o.reco || null, evidence: o.evidence || null,
    })
  }

  // (1) HEADLINE: opakované zastavení více vozidel na stejném místě ve stoupání po skončení linky
  const clIdx = [0, 1, 2, 3, 4]
  const clBuses = clIdx.map((k) => pickBus('cluster' + k))
  const clDrv = clIdx.map((k) => pickDrv('cluster' + k))
  const occ = []
  let cd = 2
  for (let i = 0; i < 7; i++) { const b = i % clBuses.length; occ.push({ date: fmtD(cd), plate: clBuses[b].plate, vehicle: vName(clBuses[b]), driver: clDrv[b].name, durMin: rint(3, 4), time: _fmtMin(rint(19 * 60, 21 * 60)) }); cd += rint(3, 8) }
  const hill = 'Besednice, stoupání U Boroví'
  mk('offroute_stop', 'high', {
    vehicle: clBuses[0], driver: clDrv[0], date: occ[0].date, time: occ[0].time, place: hill + ' (mimo trasu i zastávky)', lat: 48.7896, lon: 14.5560,
    detail: `${occ.length}× zastavení na 3 minuty na stejném bodě ve stoupání po skončení spoje. Týká se ${new Set(occ.map((o) => o.plate)).size} vozidel z parku.`,
    metric: `${occ.length}× / 6 týdnů`, status: 'prog', loss: 150000,
    reco: 'Fyzická kontrola místa a namátková kontrola stavu nádrže a tankovacích dokladů. Porovnat GPS stání s výdejem paliva a doplněním nádrže.',
    evidence: { kind: 'offroute', place: hill, gps: '48.7896 N, 14.5560 E', occurrences: occ, note: 'Opakované stání více vozidel na stejném místě mimo zastávku a mimo trasu, vždy po skončení spoje, ve večerních hodinách. Vzorec odpovídá neoprávněné manipulaci s palivem (např. odčerpávání do přistaveného vozu).' },
  })

  // (2) úbytek paliva / pokles dojezdu navzdory správnému stylu jízdy
  const fb1 = pickBus('fuel1'); const fdr1 = pickDrv('fuel1')
  mk('fuel_drop', 'high', {
    vehicle: fb1, driver: fdr1, date: fmtD(4), place: 'Vozovna České Budějovice',
    detail: 'Dojezd z plné nádrže klesl o 14 % za 5 týdnů. Doplněné palivo neodpovídá ujetým km ani vykázané spotřebě, přestože styl jízdy je hospodárný (eco 84/100, správná akcelerace i brzdění).',
    metric: '−14 % dojezd', status: 'new', loss: 96000,
    reco: 'Kontrola těsnosti nádrže a palivové soustavy, prověření tankovacích transakcí a GPS v době tankování. Vyloučit únik i krádež.',
    evidence: { kind: 'fuel', refCons: 29, actCons: 34.2, series: [{ label: 't−5', v: 735 }, { label: 't−4', v: 728 }, { label: 't−3', v: 712 }, { label: 't−2', v: 690 }, { label: 't−1', v: 666 }, { label: 'teď', v: 632 }], note: 'Dojezd z plné nádrže (km) klesá rychleji, než odpovídá ujetým kilometrům a stylu jízdy. Eco skóre řidiče je přitom nadprůměrné, nejde tedy o styl jízdy.' },
  })
  const fb2 = pickBus('fuel2'); const fdr2 = pickDrv('fuel2')
  mk('fuel_drop', 'mid', {
    vehicle: fb2, driver: fdr2, date: fmtD(12), place: 'Vozovna Český Krumlov',
    detail: 'Opakovaný rozdíl mezi vykázanou spotřebou z telematiky a množstvím doplněného paliva (−6 %). Styl jízdy bez výhrad.',
    metric: '−6 % rozdíl', status: 'prog', loss: 38000,
    reco: 'Porovnat čerpání s tankovací kartou a stavem tachografu. Zkontrolovat čidlo hladiny paliva.',
    evidence: { kind: 'fuel', refCons: 28, actCons: 30.2, series: [{ label: 't−5', v: 690 }, { label: 't−4', v: 684 }, { label: 't−3', v: 678 }, { label: 't−2', v: 665 }, { label: 't−1', v: 655 }, { label: 'teď', v: 648 }], note: 'Menší, ale systematický rozdíl mezi telematikou a doplněným palivem.' },
  })

  // (3) rutinní anomálie napříč flotilou
  const routine = ['delay', 'delay', 'harsh', 'speeding', 'missed_stop', 'early_dep', 'idle', 'heater', 'consumption']
  const places = ['České Budějovice, Nádraží', 'Český Krumlov, autobusové nádraží', 'Kaplice, náměstí', 'Trhové Sviny, U Vodárny', 'Týn nad Vltavou, Hlinecká', 'Rudolfov, Rozcestí', 'Lišov, Krajinská', 'Borovany, Žižkova', 'Hluboká nad Vltavou, Masarykova', 'Velešín, Nádražní']
  for (let i = 0; i < 30; i++) {
    const type = routine[_hash('rt' + i) % routine.length]
    const v = pickBus('r' + i), d = pickDrv('r' + i), l = pickLine('r' + i)
    const place = places[_hash('rp' + i) % places.length]
    const st = ['done', 'done', 'done', 'prog', 'new'][_hash('rs' + i) % 5]
    let detail = '', metric = null, sev = 'mid', loss = 0
    if (type === 'delay') { const m = rint(6, 16); detail = `Zpoždění +${m} min na lince ${l.no}`; metric = `+${m} min`; sev = m > 12 ? 'high' : 'mid' }
    else if (type === 'missed_stop') { detail = `Vynechaná zastávka ${place} na lince ${l.no}`; metric = '1 zastávka'; sev = 'high' }
    else if (type === 'early_dep') { const m = rint(1, 3); detail = `Odjezd −${m} min proti JŘ · ${place}`; metric = `−${m} min`; sev = 'mid' }
    else if (type === 'harsh') { const e = rint(7, 16); detail = `${e} prudkých událostí za směnu (akcelerace a brzdění)`; metric = `${e}× / směna`; sev = e > 12 ? 'high' : 'mid' }
    else if (type === 'speeding') { const s = rint(8, 24); detail = `Překročení rychlosti +${s} km/h mimo obec · ${place}`; metric = `+${s} km/h`; sev = s > 18 ? 'high' : 'mid' }
    else if (type === 'idle') { const m = rint(35, 75); detail = `Nadměrný volnoběh ${m} min za směnu`; metric = `${m} min`; sev = 'low'; loss = Math.round(m * 60) }
    else if (type === 'heater') { const m = rint(70, 150); detail = `Nezávislé topení ${m} min za směnu`; metric = `${m} min`; sev = 'low'; loss = Math.round(m * 55) }
    else if (type === 'consumption') { const over = +(1 + R() * 3).toFixed(1); detail = `Spotřeba +${String(over).replace('.', ',')} l/100 km nad referencí vozu`; metric = `+${String(over).replace('.', ',')} l`; sev = over > 2.5 ? 'high' : 'mid'; loss = Math.round(over * 1800) }
    mk(type, sev, { vehicle: v, driver: d, line: ['delay', 'missed_stop', 'early_dep'].includes(type) ? l : null, place: ['harsh'].includes(type) ? null : place, date: fmtD(rint(1, 80)), detail, metric, status: st, loss, reco: type === 'speeding' ? 'Pohovor s řidičem, sledování úseku.' : type === 'consumption' ? 'Porovnat se stylem jízdy a stavem vozu (tlak pneu, filtry).' : null })
  }

  list.sort((a, b) => (a.sevMeta.order - b.sevMeta.order) || (_anoDateKey(b.date) - _anoDateKey(a.date)))
  return list
}
const FLEET_ANOMALIES = buildAnomalies()

function buildDispatch() {
  return linesData.map((l, i) => {
    const bus = vehiclesData.find((v) => v.id === l.busId)
    const amDrv = busDrivers.find((d) => d.id === l.driverId) || busDrivers[i % busDrivers.length]
    const pmDrv = driversData[(i * 2 + 3) % driversData.length]
    const isLong = l.no === '300'
    const depotOut = _toMin(l.firstDep) - 15
    const amSpan = isLong ? 600 : 480 - (i % 2) * 15
    const pmSpan = isLong ? 420 : 480 - (i % 3) * 20
    const handover = depotOut + amSpan
    const depotIn = handover + pmSpan
    const sStart = depotOut + 15, sEnd = depotIn - 15
    const amBreakLen = i === 2 ? 30 : 45
    const pmBreakLen = 45
    const amBreakS = depotOut + Math.round(amSpan * 0.52)
    const pmBreakS = handover + Math.round(pmSpan * 0.5)
    const seg = (kind, label, s, e, drv) => ({ kind, label, s, e, drv, w: (e - s) })
    const blocks = [
      seg('depot', 'Výjezd z vozovny', depotOut, sStart, amDrv.name),
      seg('line', `Linka ${l.no}`, sStart, amBreakS, amDrv.name),
      seg('break', 'Přestávka', amBreakS, amBreakS + amBreakLen, amDrv.name),
      seg('line', `Linka ${l.no}`, amBreakS + amBreakLen, handover, amDrv.name),
      seg('line', `Linka ${l.no}`, handover, pmBreakS, pmDrv.name),
      seg('break', 'Přestávka', pmBreakS, pmBreakS + pmBreakLen, pmDrv.name),
      seg('line', `Linka ${l.no}`, pmBreakS + pmBreakLen, sEnd, pmDrv.name),
      seg('depot', 'Zátah do vozovny', sEnd, depotIn, pmDrv.name),
    ]
    const amDrive = (handover - depotOut) - amBreakLen
    const pmDrive = (depotIn - handover) - pmBreakLen
    const duties = [
      { turnus: `${l.no}/R`, part: 'Ranní', driver: amDrv.name, role: amDrv.role, driverId: amDrv.id, start: depotOut, end: handover, drive: amDrive, brk: amBreakLen, status: dutyStatusOf(amDrive, amBreakLen) },
      { turnus: `${l.no}/O`, part: 'Odpolední', driver: pmDrv.name, role: pmDrv.position, driverId: pmDrv.id, start: handover, end: depotIn, drive: pmDrive, brk: pmBreakLen, status: dutyStatusOf(pmDrive, pmBreakLen) },
    ]
    return { line: l, bus, blocks, duties, depotOut, depotIn, sStart, sEnd, handover, span: depotIn - depotOut, drive: amDrive + pmDrive }
  })
}

const ROOT_STYLE =
  "--star:#C8102E;--star-soft:#FDECEE;--star-ink:#9B0E25;--blue:#2058C9;--blue-soft:#EAF0FC;" +
  "--blue-ink:#1A47A3;--green:#16A34A;--green-soft:#E7F6ED;--amber:#C2780C;--amber-soft:#FBF1DF;" +
  "--ink:#18181B;--ink2:#5B5B63;--ink3:#8E8E96;--border:#ECECEE;--border2:#E3E3E6;--canvas:#FAFAFA;" +
  "--card:#FFFFFF;--r:14px;display:flex;height:100vh;width:100%;overflow:hidden;color:var(--ink);" +
  "font-family:'Hanken Grotesk',system-ui,sans-serif"

const MONTHS = ['Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro', 'Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn']
const parseCzDate = (s) => { const p = String(s || '').split('. '); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null }
// Stav platnosti data (STK, dálniční známka) vůči dnešku.
const dueInfo = (dateStr, soonDays = 30) => {
  const d = parseCzDate(dateStr); if (!d) return null
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const days = Math.round((d - now) / 86400000)
  return { date: dateStr, days, expired: days < 0, soon: days >= 0 && days <= soonDays }
}
// Financování končící do `days` dnů od dneška (reálné new Date).
const financingEnding = (days = 90) => {
  const now = new Date(); now.setHours(0, 0, 0, 0)
  const out = []
  vehiclesData.forEach((v) => {
    if (!v.financing || !v.financing.active) return
    const d = parseCzDate(v.financing.endDate); if (!d) return
    const dd = Math.round((d - now) / 86400000)
    if (dd >= 0 && dd <= days) out.push({ v, daysToEnd: dd })
  })
  return out.sort((a, b) => a.daysToEnd - b.daysToEnd)
}

// --- Poptávka obměny vozidla (refinancování / nový vůz) → leasingovkám ---
const FIN_TYPE_LABEL = { bank_loan: 'Účelový úvěr', finance_lease: 'Finanční leasing', operating_lease: 'Operativní leasing' }
const rfqNum = (s) => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0
const rfqFmt = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč'
// Předvyplněný koncept poptávky z aktuální smlouvy vozidla.
const rfqDraft = (v) => {
  const f = v.financing || {}
  const type = (f.active && f.type) || 'operating_lease'
  const price = rfqNum(f.price) || rfqNum(v.value) || 500000
  const akontPct = f.downPaymentPct != null ? f.downPaymentPct : (type === 'operating_lease' ? 0 : 20)
  const servicesN = type === 'operating_lease' ? (rfqNum(f.servicesMonthly) || 3500) : 0
  const services = (f.services && f.services.length) ? f.services.map((s) => s.name) : ['Povinné ručení', 'Havarijní pojištění', 'Servis a údržba', 'Pneuservis', 'Dálniční známka / mýto']
  const partners = {}
  leasingPartners.filter((p) => p.types.includes(type)).slice(0, 5).forEach((p) => { partners[p.id] = true })
  return { vehicleId: v.id, vehicle: `${v.brand} ${v.model}`, plate: v.plate, edit: false, type, term: f.termMonths || 54, akontPct, mileage: f.mileageLimit || '120 000 km/rok', priceN: price, services, servicesN, partners }
}
// Mock nabídky leasingovek (deterministicky dle partnera) — na BE skutečné odpovědi partnerů.
const rfqGenOffers = (rfq) => {
  const price = rfq.priceN, term = rfq.term
  const akont = Math.round(price * rfq.akontPct / 100)
  const financed = price - akont
  const svc = rfq.type === 'operating_lease' ? rfq.servicesN : 0
  const offers = rfq.partnerIds.map((pid) => {
    const p = leasingPartners.find((x) => x.id === pid) || { id: pid, name: pid }
    const seed = p.name.split('').reduce((a, c) => a + c.charCodeAt(0), 0)
    const rate = Math.round((4.3 + (seed % 30) / 10) * 10) / 10
    const r = rate / 100 / 12
    const finance = rfq.type === 'operating_lease' ? financed / term * (1.02 + (seed % 7) / 100) : (r ? financed * r / (1 - Math.pow(1 + r, -term)) : financed / term)
    const monthly = finance + svc
    const residual = rfq.type === 'finance_lease' ? Math.round(price * 0.01) : 0
    const total = akont + monthly * term + residual
    return { partnerId: p.id, partner: p.name, rateF: String(rate).replace('.', ',') + ' % p.a.', monthlyN: Math.round(monthly), monthlyF: rfqFmt(monthly), svcF: svc ? rfqFmt(svc) : null, downF: rfqFmt(akont), totalF: rfqFmt(total), totalN: Math.round(total) }
  }).sort((a, b) => a.totalN - b.totalN)
  if (offers[0]) offers[0].best = true
  return offers
}
// Záznam poptávky z konceptu.
const rfqRecord = (d, id, sentLabel, status) => {
  const partnerIds = Object.keys(d.partners).filter((k) => d.partners[k])
  const rec = { id, vehicleId: d.vehicleId, vehicle: d.vehicle, plate: d.plate, type: d.type, typeLabel: FIN_TYPE_LABEL[d.type], term: d.term, akontPct: d.akontPct, mileage: d.mileage, priceN: d.priceN, priceF: rfqFmt(d.priceN), servicesN: d.servicesN, partnerIds, partnerCount: partnerIds.length, sentLabel, status, accepted: null, offers: [] }
  if (status === 'offers') rec.offers = rfqGenOffers(rec)
  return rec
}
// Ukázkové odeslané poptávky (na 1–2 reálně končících vozech) — ať má záložka obsah.
const SEED_RFQS = financingEnding(120).slice(0, 2).map((e, i) => rfqRecord(rfqDraft(e.v), 'rfq-seed-' + (i + 1), i === 0 ? 'před 2 dny' : 'před 4 dny', 'offers'))

// --- Konfigurace dashboardu (uživatel si ji v Nastavení ladí drag&drop) ---
// Moduly/menu nastavujeme my přes Draive Core CRM (licence); zákazník si volí jen dashboard.
const DASH_WIDGETS = [
  { id: 'kpis', name: 'Souhrn flotily (KPI)', w: 'full' },
  { id: 'byType', name: 'Vozidla podle typu', w: 'half' },
  { id: 'byBrand', name: 'Vozidla podle značky', w: 'half' },
  { id: 'attention', name: 'Vyžaduje pozornost', w: 'half' },
  { id: 'claimsMap', name: 'Mapa škod', w: 'half' },
  { id: 'activity', name: 'Nejnovější vozidla', w: 'full' },
  { id: 'docs', name: 'Dokumenty', w: 'half' },
]
const DASH_DEFAULT = DASH_WIDGETS.map((w) => ({ id: w.id, on: true, w: w.w }))
const DASH_KEY = 'fleetportal.dash.v1'
const loadDash = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(DASH_KEY) || 'null')
    if (!Array.isArray(saved)) return DASH_DEFAULT
    const known = Object.fromEntries(DASH_WIDGETS.map((w) => [w.id, w]))
    const out = saved.filter((s) => s && known[s.id]).map((s) => ({ id: s.id, on: s.on !== false, w: s.w === 'full' ? 'full' : 'half' }))
    DASH_WIDGETS.forEach((w) => { if (!out.some((o) => o.id === w.id)) out.push({ id: w.id, on: true, w: w.w }) })
    return out.length ? out : DASH_DEFAULT
  } catch { return DASH_DEFAULT }
}
const saveDash = (arr) => { try { localStorage.setItem(DASH_KEY, JSON.stringify(arr)) } catch (e) { /* localStorage nedostupné */ } }

// --- KPI dlaždice na dashboardu (katalog, uživatel vybere max 8 a srovná) ---
const KPI_CATALOG = [
  { id: 'vehicles', label: 'Vozidel celkem' },
  { id: 'hav', label: 'S havarijním pojištěním' },
  { id: 'pov', label: 'Pouze povinné ručení' },
  { id: 'skla', label: 'Pojištění skel' },
  { id: 'asist', label: 'Asistenční služby' },
  { id: 'claims', label: 'Škody (12 měsíců)' },
  { id: 'claimsOpen', label: 'Otevřené škody' },
  { id: 'financed', label: 'Financováno' },
  { id: 'finEnding', label: 'Končící financování' },
  { id: 'finVolume', label: 'Objem financování' },
  { id: 'stk', label: 'Končící STK' },
  { id: 'vignette', label: 'Končící dálniční známky' },
  { id: 'drivers', label: 'Řidičů' },
  { id: 'premium', label: 'Roční pojistné' },
]
const KPI_MAX = 8
const KPI_DEFAULT_ON = ['vehicles', 'premium', 'drivers', 'financed']
const KPI_DEFAULT = KPI_CATALOG.map((k) => ({ id: k.id, on: KPI_DEFAULT_ON.includes(k.id) }))
const KPI_KEY = 'fleetportal.kpi.v1'
const loadKpi = () => {
  try {
    const saved = JSON.parse(localStorage.getItem(KPI_KEY) || 'null')
    if (!Array.isArray(saved)) return KPI_DEFAULT
    const known = Object.fromEntries(KPI_CATALOG.map((k) => [k.id, k]))
    const out = saved.filter((s) => s && known[s.id]).map((s) => ({ id: s.id, on: !!s.on }))
    KPI_CATALOG.forEach((k) => { if (!out.some((o) => o.id === k.id)) out.push({ id: k.id, on: false }) })
    let n = 0; out.forEach((o) => { if (o.on) { n++; if (n > KPI_MAX) o.on = false } })
    return out.length ? out : KPI_DEFAULT
  } catch { return KPI_DEFAULT }
}
const saveKpi = (arr) => { try { localStorage.setItem(KPI_KEY, JSON.stringify(arr)) } catch (e) { /* nedostupné */ } }

// --- Nadstandardní výbava vozidla (prvky + faktury pro uplatnění u pojišťovny) ---
const EQUIP_SECTIONS = ['Kola a pneumatiky', 'Audio a multimédia', 'Navigace a telematika', 'Interiér', 'Exteriér a karoserie', 'Zabezpečení (alarm, GPS)', 'Tažné zařízení', 'Střešní nosič / box', 'Osvětlení', 'Fólie a polepy', 'Ostatní']
const SEED_EQUIP = {
  v1: [
    { id: 'eq-seed-1', section: 'Kola a pneumatiky', desc: 'Sada zimních kol — litá BBS 18", Pirelli Sottozero 3', price: '42 000 Kč', date: '12. 11. 2024', invoice: 'faktura_zimni_kola_BBS.pdf' },
    { id: 'eq-seed-2', section: 'Audio a multimédia', desc: 'Ozvučení Harman/Kardon vč. subwooferu a zesilovače', price: '28 500 Kč', date: '3. 6. 2023', invoice: 'faktura_audio_harman.pdf' },
  ],
}

// ---------- Provoz vozidla: servis, pneumatiky, pokuty, náklady ----------
const SERVICE_TYPES = ['Pravidelný servis', 'Výměna oleje', 'Oprava', 'STK + emise', 'Brzdy', 'Rozvody', 'Klimatizace', 'Diagnostika', 'Ostatní']
const SERVICE_META = {
  'Pravidelný servis': { icon: 'wrench', color: 'var(--purple)', bg: 'var(--purple-soft)' },
  'Výměna oleje': { icon: 'refresh', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  'Oprava': { icon: 'alert', color: 'var(--star)', bg: 'var(--star-soft)' },
  'STK + emise': { icon: 'check2', color: 'var(--green)', bg: 'var(--green-soft)' },
  'Brzdy': { icon: 'alert', color: 'var(--star)', bg: 'var(--star-soft)' },
  'Rozvody': { icon: 'wrench', color: 'var(--blue)', bg: 'var(--blue-soft)' },
  'Klimatizace': { icon: 'wrench', color: 'var(--blue)', bg: 'var(--blue-soft)' },
  'Diagnostika': { icon: 'gauge', color: 'var(--ink2)', bg: '#EEF2F9' },
  'Ostatní': { icon: 'wrench', color: 'var(--ink2)', bg: '#EEF2F9' },
}
const TIRE_ACTIONS = ['Přezutí na zimní', 'Přezutí na letní', 'Nákup nové sady', 'Oprava / defekt', 'Uskladnění']
const TIRE_META = {
  'Přezutí na zimní': { icon: 'swap', color: 'var(--blue)', bg: 'var(--blue-soft)' },
  'Přezutí na letní': { icon: 'swap', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  'Nákup nové sady': { icon: 'banknote', color: 'var(--green)', bg: 'var(--green-soft)' },
  'Oprava / defekt': { icon: 'alert', color: 'var(--star)', bg: 'var(--star-soft)' },
  'Uskladnění': { icon: 'archive', color: 'var(--ink2)', bg: '#EEF2F9' },
}
const FINE_TYPES = ['Rychlost (radar/úsek)', 'Parkování', 'Mýtné / dálnice', 'Technický stav vozidla', 'Jiný přestupek']
const FINE_META = {
  'Rychlost (radar/úsek)': { icon: 'gauge', color: 'var(--star)', bg: 'var(--star-soft)' },
  'Parkování': { icon: 'pin', color: 'var(--amber)', bg: 'var(--amber-soft)' },
  'Mýtné / dálnice': { icon: 'calendar', color: 'var(--blue)', bg: 'var(--blue-soft)' },
  'Technický stav vozidla': { icon: 'alert', color: 'var(--star)', bg: 'var(--star-soft)' },
  'Jiný přestupek': { icon: 'alert', color: 'var(--ink2)', bg: '#EEF2F9' },
}
const COST_CATS = [
  { key: 'pojisteni', label: 'Pojištění', color: 'var(--blue)' },
  { key: 'servis', label: 'Servis a opravy', color: 'var(--purple)' },
  { key: 'pneu', label: 'Pneumatiky', color: '#0E9AA6' },
  { key: 'phm', label: 'Pohonné hmoty', color: 'var(--amber)' },
  { key: 'leasing', label: 'Leasing / splátky', color: 'var(--green)' },
  { key: 'dalnice', label: 'Dálnice / mýto', color: '#6D8BFF' },
  { key: 'myti', label: 'Mytí a péče', color: '#94A3B8' },
  { key: 'pokuty', label: 'Pokuty', color: 'var(--star)' },
  { key: 'ostatni', label: 'Ostatní', color: 'var(--ink3)' },
]
const COST_CAT_LABEL = Object.fromEntries(COST_CATS.map((c) => [c.key, c.label]))
const COST_CAT_COLOR = Object.fromEntries(COST_CATS.map((c) => [c.key, c.color]))
const COST_TYPE_TO_CAT = { 'Servis a opravy': 'servis', 'Dálniční známka': 'dalnice', 'Pneumatiky / přezutí': 'pneu', 'STK a emise': 'servis', 'Palivo': 'phm', 'Mytí a péče o vůz': 'myti', 'Parkování': 'pokuty', 'Mýtné (zahraničí)': 'dalnice', 'Pokuta': 'pokuty', 'Náhradní vozidlo': 'ostatni', 'Leasing / splátka': 'leasing', 'Ostatní': 'ostatni' }
const moneyNum = (s) => (typeof s === 'number' ? s : parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0)
const fmtKm = (n) => (n ? String(n).replace(/\B(?=(\d{3})+(?!\d))/g, ' ') + ' km' : '—')
const SEED_SERVICE = {
  v1: [
    { id: 'sv1', type: 'Pravidelný servis', date: '14. 3. 2026', km: 142300, desc: 'Olej, olejový a pylový filtr, kontrola brzd a podvozku', price: 8400, shop: 'AutoNova Mladá Boleslav', nextDate: '14. 3. 2027', nextKm: 172000, invoice: 'servis_brezen_2026.pdf' },
    { id: 'sv2', type: 'Brzdy', date: '11. 2. 2026', km: 140100, desc: 'Přední brzdové destičky + kotouče', price: 7300, shop: 'AutoNova Mladá Boleslav', nextDate: '', nextKm: 0, invoice: '' },
    { id: 'sv3', type: 'Výměna oleje', date: '2. 9. 2025', km: 128100, desc: 'Motorový olej 5W-30 + filtr', price: 2600, shop: 'AutoNova Mladá Boleslav', nextDate: '', nextKm: 0, invoice: '' },
    { id: 'sv4', type: 'Oprava', date: '20. 5. 2025', km: 119500, desc: 'Výměna spojkové sady vč. setrvačníku', price: 18900, shop: 'Servis Katusice', nextDate: '', nextKm: 0, invoice: 'oprava_spojka.pdf' },
  ],
}
const SEED_TIRES = {
  v1: [
    { id: 'tr1', action: 'Přezutí na letní', date: '8. 4. 2026', km: 143000, set: 'Letní · Continental EcoContact 6, 225/45 R18', tread: 6.5, storage: 'Pneuservis Katusice — box 14', price: 650, invoice: 'prezuti_jaro_2026.pdf', nextDate: 'říjen 2026' },
    { id: 'tr2', action: 'Přezutí na zimní', date: '24. 10. 2025', km: 134500, set: 'Zimní · Continental WinterContact TS 870', tread: 7.2, storage: 'Pneuservis Katusice — box 14', price: 650, invoice: '', nextDate: 'duben 2026' },
    { id: 'tr3', action: 'Nákup nové sady', date: '12. 11. 2024', km: 118000, set: 'Zimní · Continental WinterContact TS 870, 225/45 R18', tread: 8.0, storage: '—', price: 24800, invoice: 'faktura_zimni_pneu.pdf', nextDate: '' },
  ],
}
const SEED_FINES = {
  v1: [
    { id: 'fn1', type: 'Rychlost (radar/úsek)', date: '3. 6. 2026', driver: 'Jan Procházka', location: 'D1, 21. km (úsekové měření)', amount: 2500, paid: false, points: 2 },
    { id: 'fn2', type: 'Parkování', date: '18. 4. 2026', driver: 'Jan Procházka', location: 'Praha 1, Dlážděná', amount: 800, paid: true, points: 0 },
    { id: 'fn3', type: 'Rychlost (radar/úsek)', date: '2. 2. 2026', driver: 'Jan Procházka', location: 'Brno, Hradecká', amount: 1000, paid: true, points: 2 },
  ],
}
const SEED_COSTS = {
  v1: [
    { id: 'co1', cat: 'phm', label: 'Pohonné hmoty — květen 2026', date: '31. 5. 2026', amount: 6200, invoice: '' },
    { id: 'co2', cat: 'phm', label: 'Pohonné hmoty — duben 2026', date: '30. 4. 2026', amount: 5870, invoice: '' },
    { id: 'co3', cat: 'dalnice', label: 'Dálniční známka ČR 2026 (roční kupón)', date: '5. 1. 2026', amount: 2440, invoice: 'edalnice_2026.pdf' },
    { id: 'co4', cat: 'myti', label: 'Mytí + čištění interiéru', date: '12. 5. 2026', amount: 650, invoice: '' },
  ],
}

// ---------- Historie používání vozidla (kniha předání) ----------
const SEED_USAGE = {
  v1: [
    { id: 'us1', driver: 'Jan Procházka', role: 'Obchodní zástupce · Centrála', from: '18. 11. 2025', to: '', kmStart: 128400, kmEnd: 0, status: 'active', handover: 'Předáno: plná nádrž, 2 ks klíčů, čistý interiér, bez závad.' },
    { id: 'us2', driver: 'Eva Kučerová', role: 'Fleet koordinátor · Centrála', from: '2. 5. 2025', to: '17. 11. 2025', kmStart: 104900, kmEnd: 128400, status: 'returned', handover: 'Vráceno s drobným odřením zadního nárazníku — bez nároku na plnění.' },
    { id: 'us3', driver: 'Tomáš Dvořák', role: 'Vedoucí prodeje · Centrála', from: '10. 1. 2024', to: '1. 5. 2025', kmStart: 78200, kmEnd: 104900, status: 'returned', handover: 'Vráceno bez závad, kompletní výbava.' },
  ],
}
// ---------- Audit log (historie změn v systému) ----------
const AUDIT_META = {
  create: { label: 'Vytvořeno', color: 'var(--green)', bg: 'var(--green-soft)', icon: 'plus' },
  update: { label: 'Změněno', color: 'var(--blue)', bg: 'var(--blue-soft)', icon: 'edit' },
  delete: { label: 'Smazáno', color: 'var(--star)', bg: 'var(--star-soft)', icon: 'trash' },
  export: { label: 'Export', color: 'var(--purple)', bg: 'var(--purple-soft)', icon: 'arrow' },
  login: { label: 'Přihlášení', color: 'var(--ink2)', bg: '#EEF2F9', icon: 'user1' },
}
const SEED_AUDIT = [
  { id: 'a1', when: '29. 6. 2026 08:12', who: 'Martin Kovář', action: 'login', entity: 'Systém', detail: 'Přihlášení do Fleet Portalu (web, Praha)' },
  { id: 'a2', when: '28. 6. 2026 16:41', who: 'Martin Kovář', action: 'create', entity: 'Pokuta', detail: 'Zaevidován přestupek — Rychlost (radar), BMW 320 (1S13018), 2 500 Kč' },
  { id: 'a3', when: '28. 6. 2026 11:05', who: 'Eva Kučerová', action: 'update', entity: 'Vozidlo', detail: 'Změněn řidič — Ford Transit (1SC7662): Jan Procházka' },
  { id: 'a4', when: '27. 6. 2026 14:22', who: 'Martin Kovář', action: 'export', entity: 'Vozidla', detail: 'Export sestavy vozového parku (XLSX, 542 vozidel)' },
  { id: 'a5', when: '26. 6. 2026 09:48', who: 'Martin Kovář', action: 'create', entity: 'Servis', detail: 'Přidán servisní záznam — Pravidelný servis, BMW 320, 8 400 Kč' },
  { id: 'a6', when: '24. 6. 2026 13:30', who: 'Tomáš Bartoš', action: 'delete', entity: 'Vozidlo', detail: 'Odebráno vozidlo z parku — Škoda Octavia (prodej)' },
  { id: 'a7', when: '23. 6. 2026 10:15', who: 'Martin Kovář', action: 'update', entity: 'Pojištění', detail: 'Upraveno krytí — doplněno pojištění skel u 6 vozidel' },
]
// ---------- Modelované provozní náklady (odhad na úrovni parku) ----------
const seedFromId = (id) => { let h = 0; const s = String(id || ''); for (let i = 0; i < s.length; i++) { h = (h * 31 + s.charCodeAt(i)) >>> 0 } return h }
const TYPE_ANNUAL_COST = { 'Osobní vozidla': 96000, 'Motocykly': 21000, 'Tahače': 312000, 'Návěsy': 64000, 'Nákladní vozidla': 208000, 'Přívěsy': 26000, 'Traktory a stroje': 138000 }
const vehicleAnnualCostModel = (v) => { const base = TYPE_ANNUAL_COST[vehicleTypeCat(v.druh)] || 90000; const j = seedFromId(v.id) % 31; return Math.round((base * (1 + (j - 15) / 100)) / 100) * 100 }
const PARK_COST_SPLIT = [
  { key: 'phm', label: 'Pohonné hmoty', color: 'var(--amber)', share: 0.38 },
  { key: 'servis', label: 'Servis a opravy', color: 'var(--purple)', share: 0.24 },
  { key: 'leasing', label: 'Leasing / splátky', color: 'var(--green)', share: 0.18 },
  { key: 'pneu', label: 'Pneumatiky', color: '#0E9AA6', share: 0.11 },
  { key: 'ostatni', label: 'Mýto, mytí, ostatní', color: '#94A3B8', share: 0.09 },
]

const INS_COLORS = { Kooperativa: '#2058C9', Allianz: '#16A34A', 'ČPP': '#C2780C', Generali: '#8B5CF6', UNIQA: '#0EA5A5', 'ČSOB': '#9B0E25' }
const DEFAULT_BONUS = [{ threshold: 30, rate: 15 }, { threshold: 40, rate: 10 }, { threshold: 50, rate: 5 }]
const INSURER_CODE = { Kooperativa: '7720', Allianz: '4055', 'ČPP': '0019', Generali: '5544', UNIQA: '2401', 'ČSOB': '8830', 'ČSOB Poj.': '8830' }
const RISK_META = { POV: { bg: 'var(--blue-soft)', c: 'var(--blue-ink)' }, HAV: { bg: 'var(--star-soft)', c: 'var(--star-ink)' }, Skla: { bg: '#E3F4F5', c: '#0E7C86' } }
// Interní databáze řidičů (pro přiřazení k vozidlu)
const DRIVERS = [
  { id: 'd1', name: 'Petr Svoboda', role: 'Obchodní zástupce', loc: 'Praha – Centrála', phone: '+420 602 118 224', vehicles: 1 },
  { id: 'd2', name: 'Jana Marešová', role: 'Servisní technik', loc: 'Mladá Boleslav', phone: '+420 603 447 901', vehicles: 0 },
  { id: 'd3', name: 'Tomáš Dvořák', role: 'Vedoucí prodeje', loc: 'Praha – Centrála', phone: '+420 605 220 145', vehicles: 1 },
  { id: 'd4', name: 'Lucie Horáková', role: 'Account manažer', loc: 'Brno', phone: '+420 604 909 312', vehicles: 1 },
  { id: 'd5', name: 'Martin Beneš', role: 'Obchodní zástupce', loc: 'Plzeň', phone: '+420 606 771 088', vehicles: 0 },
  { id: 'd6', name: 'Eva Kučerová', role: 'Fleet koordinátor', loc: 'Praha – Centrála', phone: '+420 602 334 760', vehicles: 2 },
  { id: 'd7', name: 'Jakub Němec', role: 'Servisní poradce', loc: 'Liberec', phone: '+420 607 145 503', vehicles: 0 },
  { id: 'd8', name: 'Veronika Pospíšilová', role: 'Obchodní zástupce', loc: 'Ostrava', phone: '+420 605 612 974', vehicles: 1 },
]
const initialsOf = (name) => name.replace(/\b\wng?\.\s*/gi, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
const CLAIM_EXPORT_COLS = [
  { key: 'id', label: 'Číslo škody' }, { key: 'spz', label: 'SPZ' }, { key: 'vin', label: 'VIN' }, { key: 'vozidlo', label: 'Vozidlo' },
  { key: 'riziko', label: 'Riziko' }, { key: 'nahlasil', label: 'Nahlásil' }, { key: 'nahlaseno', label: 'Nahlášeno' }, { key: 'typ', label: 'Typ události' },
  { key: 'vyse', label: 'Výše škody' }, { key: 'stav', label: 'Stav' }, { key: 'vyplaceno', label: 'Vyplaceno' },
]
const claimExportRow = (c) => ({ id: c.id, spz: c.plate, vin: c.vin, vozidlo: `${c.brand} ${c.model}`, riziko: c.risk, nahlasil: c.reportedBy, nahlaseno: c.date, typ: c.type, vyse: c.estimateF, stav: c.statusLabel, vyplaceno: c.payoutF })
// Sjednatelná rizika — podíl na pojistném a pravidlo sjednání na vozidlo (deterministicky)
const RISKS = [
  { key: 'pr', label: 'Povinné ručení', icon: 'shield', frac: 0.34, bg: 'var(--star-soft)', color: 'var(--star)', has: () => true },
  { key: 'hav', label: 'Havarijní pojištění', icon: 'car', frac: 0.42, bg: 'var(--star-soft)', color: 'var(--star)', has: (v) => v.status !== 'nocasco' },
  { key: 'skla', label: 'Pojištění skel', icon: 'glass', frac: 0.06, bg: 'var(--blue-soft)', color: 'var(--blue)', has: () => true },
  { key: 'asist', label: 'Asistenční služby', icon: 'wrench', frac: 0.03, bg: 'var(--amber-soft)', color: 'var(--amber)', has: () => true },
  { key: 'gap', label: 'GAP – pojištění finanční ztráty', icon: 'refresh', frac: 0.05, bg: 'var(--green-soft)', color: 'var(--green)', has: (v, i) => v.status !== 'nocasco' && i % 4 !== 3 },
  { key: 'zver', label: 'Střet se zvěří', icon: 'alert', frac: 0.02, bg: 'var(--green-soft)', color: 'var(--green)', has: (v, i) => i % 5 !== 0 },
  { key: 'vandal', label: 'Vandalismus', icon: 'alert', frac: 0.02, bg: '#F1F1F3', color: 'var(--ink2)', has: (v, i) => i % 3 !== 2 },
  { key: 'uraz', label: 'Úrazové pojištění osob', icon: 'user1', frac: 0.02, bg: 'var(--blue-soft)', color: 'var(--blue)', has: (v, i) => i % 2 === 0 },
  { key: 'zivel', label: 'Živelní pojištění', icon: 'alert', frac: 0.015, bg: 'var(--amber-soft)', color: 'var(--amber)', has: (v, i) => i % 3 !== 0 },
  { key: 'zavazadla', label: 'Zavazadla', icon: 'archive', frac: 0.01, bg: '#F1F1F3', color: 'var(--ink2)', has: (v, i) => i % 4 === 0 },
  { key: 'nahradni', label: 'Náhradní vozidlo', icon: 'swap', frac: 0.015, bg: 'var(--blue-soft)', color: 'var(--blue)', has: (v, i) => i % 3 === 1 },
  { key: 'pravni', label: 'Právní ochrana', icon: 'doc2', frac: 0.02, bg: '#F1F1F3', color: 'var(--ink2)', has: () => true },
]
const fleetInsurerPolicy = (insurer, fleetId) => {
  const base = INSURER_CODE[insurer] || '6000'
  const seed = (parseInt((fleetId || 'f1').replace(/\D/g, '') || '1', 10) * 137 + insurer.length * 29 + (insurer.charCodeAt(0) || 65)) % 1000000
  const s = String(seed).padStart(6, '0')
  return `${base} ${s.slice(0, 3)} ${s.slice(3)}`
}
const lrColorFor = (lr) => (lr <= 30 ? 'var(--green)' : lr <= 45 ? 'var(--amber)' : 'var(--star)')
// Datum výročí smlouvy — nejbližší výroční datum počátku po dnešku
const parseCz = (s) => { const p = String(s).replace(/\s/g, '').split('.').map(Number); return new Date(p[2], p[1] - 1, p[0]) }
const fmtCz = (dt) => `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`
const nextAnniv = (start, today) => { const d = parseCz(start); let c = new Date(today.getFullYear(), d.getMonth(), d.getDate()); if (c < today) c = new Date(today.getFullYear() + 1, d.getMonth(), d.getDate()); return c }
// Zprostředkovatel pojištění (makléř)
const BROKER = { name: 'Petrisk a.s.', role: 'Pojišťovací makléř', reg: 'ČNB, reg. č. 197542PM', ico: '264 18 920', person: 'Martin Kovář', email: 'martin.kovar@petrisk.cz', phone: '+420 222 119 350' }
const POJISTNIK = { name: 'ČSAD AUTOBUSY České Budějovice a.s.', ico: '26060451' }

// Role (persony) — každá vidí portál svýma očima. Přepínání v topbaru.
const ROLES = [
  { id: 'majitel', name: 'Ing. Pavel Šimek', title: 'Ředitel společnosti', initials: 'PŠ', short: 'Majitel / ředitel',
    desc: 'Strategie, náklady a návratnost celé flotily.', icon: 'trend' },
  { id: 'spravce', name: 'Josef Moučka', title: 'Vedoucí správy vozového parku', initials: 'JM', short: 'Správce parku',
    desc: 'Provoz, servis, STK, pojištění a škody.', icon: 'wrench' },
  { id: 'dispecer', name: 'Marie Dvořáková', title: 'Vedoucí dopravního dispečinku', initials: 'MD', short: 'Dispečer',
    desc: 'Linky, jízdní řády, řidiči a anomálie provozu.', icon: 'pin' },
]

export default function FleetPortal() {
  const [state, setStateRaw] = useState(() => ({
    dash: loadDash(), kpi: loadKpi(),
    role: 'majitel', roleMenu: false,
    route: 'dashboard', attnCat: null,
    anoView: 'vse', anoType: null, anoDriver: null, anoVehicle: null, anomalyId: null,
    fleetId: 'f1', vehicleId: 'v1',
    fleetTab: 'overview', vehicleTab: 'overview', fleetsView: 'grid', finTab: 'prehled', rfq: null, rfqs: SEED_RFQS,
    vehEquip: SEED_EQUIP, equipModal: null,
    vehService: SEED_SERVICE, vehTires: SEED_TIRES, vehFines: SEED_FINES, vehCostsExtra: SEED_COSTS,
    serviceModal: null, tireModal: null, fineModal: null,
    audit: SEED_AUDIT,
    search: false, notif: false, ai: false, companyMenu: false, sidebar: false, execReport: null,
    claimWizard: false, claimStep: 1, claimData: {},
    rowMenu: null, toast: null,
    unsub: null, unsubDone: false, unsubReason: 'Prodej vozidla', unsubDate: '1. 7. 2026',
    costModal: null, costDone: false, costType: 'Servis a opravy', costDesc: '', costAmount: '', costDate: '19. 6. 2026', costFile: null,
    noteModal: null, noteText: '', vehNotes: {},
    parkModal: null, parkTarget: null, parkDone: false,
    driverModal: null, driverSel: null, driverDone: false,
    vehOverrides: {},
    np: false, npData: { name: '', manager: '', insurer: 'Kooperativa', policy: '', start: '1. 7. 2026', vehicles: '' },
    newFleets: [],
    docCat: null, docOpen: {}, docPreview: null,
    av: false, avStep: 1, avMethod: 'spz', avInput: '', avLoaded: false, avLoading: false, avFleet: 'f1',
    avCover: { pr: true, hav: true, skla: true, uraz: false, zavazadla: false, zver: true, nahradni: false, strojni: false, gap: false, zivel: false, asist: true, prac: false },
    avHavRozsah: 'allrisk', avHavSpoluucast: '5% / 5 000 Kč', avPrLimit: '100 / 100 mil. Kč', avUziti: 'Běžné užití', avTerritory: 'Evropská unie',
    avPojistnik: 'ČSAD AUTOBUSY České Budějovice a.s.', avStart: '1. 7. 2026',
    avOwnerSame: true, avOwner: '', avOwnerKind: 'firma', avOwnerIco: '', avOwnerAddr: '', avOwnerBirth: '',
    avOperatorSame: true, avOperator: '', avOperatorKind: 'firma', avOperatorIco: '', avOperatorAddr: '', avOperatorBirth: '',
    avPlate: '', avValue: '', avPricing: 'idle',
    vf: { fleet: 'all', type: 'all', brand: 'all', fuel: 'all', insurer: 'all', status: 'all', q: '' },
    selected: {},
    pref: { renewal: true, claim: true, docs: true, email: true, sms: false },
    cwType: 'Havárie', cwVehicle: 'v1',
    searchQuery: '',
    aiInput: '',
    aiMessages: [
      { role: 'ai', text: 'Dobrý den. Jsem Fleet AI nad reálnými daty vaší flotily. Zeptejte se třeba „Kde ztrácíme nejvíc peněz?", „Je někde podezřelý úbytek nafty?" nebo „Kteří řidiči jezdí rizikově?".' },
    ],
  }))
  const ttRef = useRef(null)
  const vp = useViewport()
  const setState = (patch) => setStateRaw((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const allFleets = [...fleetsData, ...state.newFleets]

  // ---------- ACTIONS ----------
  const navigate = (route, patch) => setState({ route, ...(patch || {}), search: false, notif: false, companyMenu: false, sidebar: false, roleMenu: false, ai: false })
  const setRole = (id) => setState({ role: id, roleMenu: false, route: 'dashboard', search: false, notif: false })
  const toggleRoleMenu = () => setState((s) => ({ roleMenu: !s.roleMenu, notif: false, companyMenu: false }))
  const openFleet = (id) => navigate('fleet-detail', { fleetId: id, fleetTab: 'overview' })
  // Vozové parky: když je jen jeden, přeskoč dlaždice a jdi rovnou na jeho detail.
  const goParks = () => allFleets.length === 1 ? openFleet(allFleets[0].id) : navigate('fleets')
  const openVehicle = (id) => navigate('vehicle-detail', { vehicleId: id, vehicleTab: 'overview' })
  const openDriver = (id) => navigate('driver-detail', { driverId: id })
  const openClaim = (id) => navigate('claim-detail', { claimId: id })
  const openLine = (id) => navigate('linky-detail', { lineId: id })
  const openStazka = (lineId) => navigate('stazka', { stazkaLine: lineId })
  const openAnomaly = (id) => navigate('anomaly-detail', { anomalyId: id })
  const openAnomalies = (patch = {}) => navigate('anomalies', { anoView: 'vse', anoType: null, anoDriver: null, anoVehicle: null, ...patch })
  const toggleNotif = () => setState((s) => ({ notif: !s.notif, companyMenu: false }))
  const toggleAI = () => setState((s) => ({ ai: !s.ai }))
  const openSearch = () => setState({ search: true })
  const closeSearch = () => setState({ search: false })
  const stop = (e) => e.stopPropagation()
  const showToast = (msg) => { if (ttRef.current) clearTimeout(ttRef.current); setState({ toast: msg }); ttRef.current = setTimeout(() => setState({ toast: null }), 3800) }
  const openUnsub = (v) => setState({ rowMenu: null, unsubDone: false, unsubReason: 'Prodej vozidla', unsubDate: '1. 7. 2026', unsub: { plate: v.plate, brand: v.brand, model: v.model, vin: v.vin, fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), renewal: v.renewal } })
  const openCostModal = (v) => setState({ costModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model }, costDone: false, costType: 'Palivo', costDesc: '', costAmount: '', costDate: '1. 7. 2026', costFile: null })
  const openNoteModal = (v) => setState({ noteModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model }, noteText: '' })
  const openParkModal = (v) => setState({ parkModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, fleet: v.fleet }, parkTarget: null, parkDone: false })
  const openDriverModal = (v) => setState({ driverModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver }, driverSel: null, driverDone: false })
  // Poptávka obměny vozidla → leasingovkám
  const openRfq = (v) => setState({ rowMenu: null, rfq: rfqDraft(v) })
  const setRfq = (patch) => setState((s) => ({ rfq: { ...s.rfq, ...patch } }))
  const toggleRfqPartner = (pid) => setState((s) => ({ rfq: { ...s.rfq, partners: { ...s.rfq.partners, [pid]: !s.rfq.partners[pid] } } }))
  const sendRfq = () => {
    const d = state.rfq
    const id = 'rfq-' + (state.rfqs.length + 1) + '-' + d.vehicleId
    const rec = rfqRecord(d, id, 'právě teď', 'sent')
    setState({ rfq: null, route: 'financing', finTab: 'poptavky', rfqs: [rec, ...state.rfqs] })
    showToast(`Poptávka odeslána do ${rec.partnerCount} společností · nabídky obvykle do 2 prac. dnů.`)
    setTimeout(() => setState((s) => ({ rfqs: s.rfqs.map((x) => x.id === id ? { ...x, status: 'offers', offers: rfqGenOffers(x) } : x) })), 1700)
  }
  // Konfigurace dashboardu (drag&drop v Nastavení)
  const setDash = (arr) => { saveDash(arr); setState({ dash: arr }) }
  const toggleDashWidget = (id) => setDash(state.dash.map((w) => w.id === id ? { ...w, on: !w.on } : w))
  const setDashWidth = (id, wv) => setDash(state.dash.map((w) => w.id === id ? { ...w, w: wv } : w))
  const moveDashWidget = (from, to) => { if (from === to || to < 0 || to >= state.dash.length) return; const a = [...state.dash]; const [m] = a.splice(from, 1); a.splice(to, 0, m); setDash(a) }
  const resetDash = () => setDash(DASH_DEFAULT)
  // KPI dlaždice (výběr max 8 + řazení)
  const setKpi = (arr) => { saveKpi(arr); setState({ kpi: arr }) }
  const kpiOn = () => state.kpi.filter((k) => k.on).length
  const toggleKpi = (id) => { const cur = state.kpi.find((k) => k.id === id); if (cur && !cur.on && kpiOn() >= KPI_MAX) return; setKpi(state.kpi.map((k) => k.id === id ? { ...k, on: !k.on } : k)) }
  const moveKpi = (from, to) => { if (from === to || to < 0 || to >= state.kpi.length) return; const a = [...state.kpi]; const [m] = a.splice(from, 1); a.splice(to, 0, m); setKpi(a) }
  const resetKpi = () => setKpi(KPI_DEFAULT)
  // Nadstandardní výbava vozidla
  const openEquipModal = (vid) => setState({ rowMenu: null, equipModal: { vid, section: EQUIP_SECTIONS[0], desc: '', price: '', date: '1. 7. 2026', invoice: '' } })
  const setEquipField = (k, v) => setState((s) => ({ equipModal: { ...s.equipModal, [k]: v } }))
  const onEquipInvoice = (e) => { const f = e.target.files && e.target.files[0]; if (f) setEquipField('invoice', f.name) }
  const saveEquip = () => {
    const m = state.equipModal
    const item = { id: 'eq' + Date.now(), section: m.section, desc: m.desc.trim() || m.section, price: m.price.trim(), date: m.date, invoice: m.invoice }
    setState((s) => ({ vehEquip: { ...s.vehEquip, [m.vid]: [item, ...(s.vehEquip[m.vid] || [])] }, equipModal: null }))
    showToast('Prvek nadstandardní výbavy přidán' + (item.invoice ? ' · faktura přiložena' : ''))
  }
  const removeEquip = (vid, id) => setState((s) => ({ vehEquip: { ...s.vehEquip, [vid]: (s.vehEquip[vid] || []).filter((x) => x.id !== id) } }))
  const claimEquip = (item) => showToast(`Faktura „${item.invoice || item.section}" připravena k uplatnění — přiložte ji při hlášení škody.`)
  // Audit log — zapiš změnu do historie systému
  const logAudit = (action, entity, detail) => {
    const now = new Date()
    const p2 = (n) => String(n).padStart(2, '0')
    const when = `${now.getDate()}. ${now.getMonth() + 1}. ${now.getFullYear()} ${p2(now.getHours())}:${p2(now.getMinutes())}`
    setState((s) => ({ audit: [{ id: 'a' + now.getTime(), when, who: 'Martin Kovář', action, entity, detail }, ...s.audit] }))
  }
  // ---- Servis ----
  const openServiceModal = (v) => setState({ rowMenu: null, serviceModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, type: SERVICE_TYPES[0], date: '1. 7. 2026', km: '', desc: '', price: '', shop: '', nextDate: '', nextKm: '', invoice: '' } })
  const setServiceField = (k, val) => setState((s) => ({ serviceModal: { ...s.serviceModal, [k]: val } }))
  const saveService = () => {
    const m = state.serviceModal
    const item = { id: 'sv' + Date.now(), type: m.type, date: m.date, km: moneyNum(m.km), desc: m.desc.trim(), price: moneyNum(m.price), shop: m.shop.trim(), nextDate: m.nextDate.trim(), nextKm: moneyNum(m.nextKm), invoice: m.invoice }
    setState((s) => ({ vehService: { ...s.vehService, [m.vid]: [item, ...(s.vehService[m.vid] || [])] }, serviceModal: null }))
    logAudit('create', 'Servis', `Přidán servisní záznam — ${item.type}, ${m.brand} ${m.model} (${m.plate})${item.price ? ', ' + czk(item.price) : ''}`)
    showToast('Servisní záznam přidán' + (item.nextDate ? ' · příští servis ' + item.nextDate : ''))
  }
  const removeService = (vid, id) => setState((s) => ({ vehService: { ...s.vehService, [vid]: (s.vehService[vid] || []).filter((x) => x.id !== id) } }))
  // ---- Pneumatiky ----
  const openTireModal = (v) => setState({ rowMenu: null, tireModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, action: TIRE_ACTIONS[0], date: '1. 7. 2026', km: '', set: '', tread: '', storage: '', price: '', nextDate: '', invoice: '' } })
  const setTireField = (k, val) => setState((s) => ({ tireModal: { ...s.tireModal, [k]: val } }))
  const saveTire = () => {
    const m = state.tireModal
    const item = { id: 'tr' + Date.now(), action: m.action, date: m.date, km: moneyNum(m.km), set: m.set.trim(), tread: parseFloat(String(m.tread).replace(',', '.')) || 0, storage: m.storage.trim() || '—', price: moneyNum(m.price), nextDate: m.nextDate.trim(), invoice: m.invoice }
    setState((s) => ({ vehTires: { ...s.vehTires, [m.vid]: [item, ...(s.vehTires[m.vid] || [])] }, tireModal: null }))
    logAudit('create', 'Pneumatiky', `Přidán záznam — ${item.action}, ${m.brand} ${m.model} (${m.plate})`)
    showToast('Záznam o pneumatikách přidán')
  }
  const removeTire = (vid, id) => setState((s) => ({ vehTires: { ...s.vehTires, [vid]: (s.vehTires[vid] || []).filter((x) => x.id !== id) } }))
  // ---- Pokuty ----
  const openFineModal = (v) => setState({ rowMenu: null, fineModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, type: FINE_TYPES[0], date: '1. 7. 2026', driver: v.driver || '', location: '', amount: '', points: '', paid: false } })
  const setFineField = (k, val) => setState((s) => ({ fineModal: { ...s.fineModal, [k]: val } }))
  const saveFine = () => {
    const m = state.fineModal
    const item = { id: 'fn' + Date.now(), type: m.type, date: m.date, driver: m.driver.trim() || '—', location: m.location.trim(), amount: moneyNum(m.amount), points: moneyNum(m.points), paid: !!m.paid }
    setState((s) => ({ vehFines: { ...s.vehFines, [m.vid]: [item, ...(s.vehFines[m.vid] || [])] }, fineModal: null }))
    logAudit('create', 'Pokuta', `Zaevidován přestupek — ${item.type}, ${m.brand} ${m.model} (${m.plate})${item.amount ? ', ' + czk(item.amount) : ''}`)
    showToast('Přestupek zaevidován' + (item.paid ? ' · uhrazeno' : ' · čeká na úhradu'))
  }
  const removeFine = (vid, id) => setState((s) => ({ vehFines: { ...s.vehFines, [vid]: (s.vehFines[vid] || []).filter((x) => x.id !== id) } }))
  const toggleFinePaid = (vid, id) => setState((s) => ({ vehFines: { ...s.vehFines, [vid]: (s.vehFines[vid] || []).map((x) => (x.id === id ? { ...x, paid: !x.paid } : x)) } }))
  const removeCost = (vid, id) => setState((s) => ({ vehCostsExtra: { ...s.vehCostsExtra, [vid]: (s.vehCostsExtra[vid] || []).filter((x) => x.id !== id) } }))
  const acceptOffer = (rfqId, partnerId) => {
    setState((s) => ({ rfqs: s.rfqs.map((x) => x.id === rfqId ? { ...x, status: 'accepted', accepted: partnerId } : x) }))
    const o = (state.rfqs.find((x) => x.id === rfqId) || {}).offers || []
    const p = o.find((x) => x.partnerId === partnerId)
    showToast(`Nabídka ${p ? p.partner : ''} přijata · makléř Petr Kmoch připraví smlouvu.`)
  }
  const buildClaimRow = (c) => {
    const cm = claimStatusMeta[c.status]
    const v = vehiclesData.find((x) => x.id === c.vId) || {}
    const rm = RISK_META[c.risk] || { bg: '#F1F1F3', c: 'var(--ink2)' }
    return {
      id: c.id, type: c.type, risk: c.risk, reportedBy: c.reportedBy, date: c.date, insurer: c.insurer,
      plate: v.plate || '—', vin: v.vin || '—', brand: v.brand || '', model: v.model || '',
      estimateF: czk(c.estimate), paid: c.payout > 0, payoutF: c.payout > 0 ? czk(c.payout) : '—',
      statusLabel: cm.label, bg: cm.bg, color: cm.c,
      chipStyle: `display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:${cm.c};background:${cm.bg};padding:3px 9px;border-radius:20px;white-space:nowrap`,
      riskStyle: `display:inline-flex;align-items:center;font-size:11px;font-weight:700;color:${rm.c};background:${rm.bg};padding:3px 8px;border-radius:6px;white-space:nowrap`,
      onClick: () => openClaim(c.id),
    }
  }
  const setVf = (k, v) => setState((s) => ({ vf: { ...s.vf, [k]: v } }))
  // Vlastník / provozovatel vozidla (wizard) — subjekt s napojením na ARES.
  const subjBundle = (key) => ({
    same: state['av' + key + 'Same'],
    toggleSame: () => setState((s) => ({ ['av' + key + 'Same']: !s['av' + key + 'Same'] })),
    kind: state['av' + key + 'Kind'],
    setKind: (k) => setState({ ['av' + key + 'Kind']: k, ['av' + key + 'Ico']: '', ['av' + key + 'Addr']: '' }),
    name: state['av' + key],
    onName: (e) => setState({ ['av' + key]: e.target.value, ['av' + key + 'Ico']: '', ['av' + key + 'Addr']: '' }),
    ico: state['av' + key + 'Ico'], addr: state['av' + key + 'Addr'],
    birth: state['av' + key + 'Birth'], onBirth: (e) => setState({ ['av' + key + 'Birth']: e.target.value }),
    // výběr z ARES → dotáhne název, IČO a sídlo
    onPick: (subj) => setState({ ['av' + key]: subj.name, ['av' + key + 'Ico']: subj.ico, ['av' + key + 'Addr']: subj.sidlo || '' }),
  })
  const toggleSel = (id) => setState((s) => { const n = { ...s.selected }; if (n[id]) delete n[id]; else n[id] = true; return { selected: n } })

  // Fleet AI = demo nad reálnými (mock) daty flotily. Pravidlový NLU, bez externích klíčů.
  const aiReply = (q) => {
    const l = q.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '')
    const has = (...w) => w.some((x) => l.includes(x))
    const czf = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč'
    const milF = (n) => (n / 1e6).toFixed(1).replace('.', ',') + ' mil. Kč'
    const buses = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy')

    // palivo / nafta / odčerpávání / úbytek / tankování
    if (has('naft', 'paliv', 'odcerp', 'ubyt', 'krade', 'tankov', 'spotreb')) {
      const fuel = FLEET_ANOMALIES.filter((a) => a.cat === 'Palivo a GPS')
      const loss = fuel.reduce((s, a) => s + a.loss, 0)
      const off = FLEET_ANOMALIES.find((a) => a.type === 'offroute_stop')
      return { text: `Ano, mám podezřelé případy. V kategorii Palivo a GPS je ${fuel.length} anomálií, odhadovaná roční ztráta ~${czf(loss)}. Nejzávažnější: ${off.vehicle} (${off.plate}) a další vozy opakovaně stojí 3 min na stejném místě ve stoupání po skončení linky — vzorec odpovídá odčerpávání nafty. Druhý případ je pokles dojezdu z plné nádrže navzdory hospodárné jízdě.`, actionLabel: 'Otevřít anomálie paliva', action: () => navigate('anomalies') }
    }
    // rizikoví řidiči / styl jízdy
    if (has('rizik', 'ridic', 'styl jizd', 'spatne jezd', 'nejhor') && !has('kolik stoji flot')) {
      const scored = driversData.filter((d) => ['linka', 'mhd', 'dalkova'].includes(d.kind)).map((d) => ({ d, p: buildDriverPerf(d) })).sort((a, b) => a.p.score - b.p.score)
      const w = scored[0]
      return { text: `Nejrizikovější styl jízdy má ${w.d.name} — eco skóre ${w.p.score}/100 (${w.p.band.label}). Stojí navíc ~${w.p.styleCostYearF}/rok oproti hospodárné jízdě a má ${w.p.delays30}× zpoždění za 30 dní. Doporučuji školení a sledování.`, actionLabel: 'Otevřít kartu řidiče', action: () => openDriver(w.d.id) }
    }
    // nejdražší / nejnákladnější vozidlo
    if (has('nejdraz', 'nejnakladnej', 'nejdrahs') || (has('nejvic') && has('vozidl', 'vuz', 'auto', 'autobus'))) {
      const r = fleetCostRollup()
      const top = r.costs.slice().sort((a, b) => b.c.total - a.c.total)[0]
      return { text: `Nejnákladnější vozidlo je ${top.v.brand} ${top.v.model} (${top.v.plate}) — provozní náklady ~${czf(top.c.total)}/rok (palivo, servis, pneu, mýto). Je to kandidát na obměnu.`, actionLabel: 'Otevřít vozidlo', action: () => openVehicle(top.v.id) }
    }
    // kde ztrácíme / plýtváme / úniky
    if (has('ztrac', 'ztrat', 'plytv', 'unik', 'ucik', 'kde ') && has('peniz', 'korun', 'naklad', 'ztrac', 'ztrat', 'plytv', 'unik')) {
      const r = fleetCostRollup()
      const fuelLoss = FLEET_ANOMALIES.filter((a) => a.cat === 'Palivo a GPS').reduce((s, a) => s + a.loss, 0)
      const anoLoss = FLEET_ANOMALIES.reduce((s, a) => s + a.loss, 0)
      return { text: `Největší úniky peněz teď: palivo a GPS ~${czf(fuelLoss)}/rok (odčerpávání, úbytky, spotřeba), z anomálií celkem ~${czf(anoLoss)}/rok. Další prostor je v obměně ${r.oldCount} nejstarších vozů a v eco-jízdě (potenciál ~${czf(r.ecoPotentialYear)}/rok po nasazení telematiky do autobusů).`, actionLabel: 'Zobrazit anomálie', action: () => navigate('anomalies') }
    }
    // náklady flotily / kolik stojí / TCO
    if (has('kolik stoji', 'naklad', 'tco', 'provoz', 'rozpoc', 'flotil')) {
      const r = fleetCostRollup()
      const prem = vehiclesData.reduce((a, v) => a + (v.premium || 0), 0)
      return { text: `Provozní náklady flotily jsou ~${milF(r.total)}/rok (${r.count} vozidel, ${(r.kmTotal / 1e6).toFixed(1).replace('.', ',')} mil. km). K tomu roční pojistné ~${milF(prem)}. Největší položkou je palivo. Detailní rozpad je v Reportingu.`, actionLabel: 'Otevřít reporting', action: () => navigate('analytics') }
    }
    // pojištění / havarijní / krytí / gap
    if (has('pojist', 'havarij', 'kryt', 'gap', 'pov')) {
      const prem = vehiclesData.reduce((a, v) => a + (v.premium || 0), 0)
      const povOnly = vehiclesData.filter((v) => v.cov && v.cov.pov && !v.cov.hav).length
      const busPov = buses.filter((v) => v.cov && !v.cov.hav).length
      return { text: `Z ${vehiclesData.length} vozidel má ${povOnly} jen povinné ručení, z toho ${busPov} autobusů bez havarijního krytí. Roční pojistné je ~${milF(prem)}. Tady je největší prostor pro makléře dořešit krytí.`, actionLabel: 'Otevřít pojištění', action: () => navigate('insurance') }
    }
    // zpoždění / jízdní řády / dodržení
    if (has('zpozd', 'jizdni rad', 'dodrzen', 'on-time', 'ontime', 'linka', 'vynech')) {
      const d = FLEET_ANOMALIES.filter((a) => ['delay', 'missed_stop', 'early_dep'].includes(a.type))
      return { text: `V provozu je ${d.length} anomálií jízdních řádů (zpoždění, vynechané zastávky, předčasné odjezdy). Nejčastější jsou zpoždění na nejvytíženějších linkách. Vše se dá rozkliknout po lince, voze i řidiči.`, actionLabel: 'Anomálie provozu', action: () => navigate('anomalies') }
    }
    // stáří / obměna
    if (has('star', 'obmen', 'vek flot', 'kolik let')) {
      const r = fleetCostRollup()
      return { text: `Průměrné stáří flotily je ${r.avgAge} let. ${r.oldCount} vozidel je starších 20 let — kandidáti na obměnu. Obměna sníží servis, spotřebu i emise, financování i pojištění zajistí makléř.`, actionLabel: 'Otevřít reporting', action: () => navigate('analytics') }
    }
    // anomálie obecně
    if (has('anomal', 'podezr', 'co resit', 'problem')) {
      const un = FLEET_ANOMALIES.filter((a) => a.status !== 'done').length
      const high = FLEET_ANOMALIES.filter((a) => a.sev === 'high').length
      return { text: `Evidujeme ${FLEET_ANOMALIES.length} anomálií, ${un} nevyřešených, z toho ${high} s vysokou závažností. Nejpalčivější jsou palivové (odčerpávání a úbytky nafty) a překročení rychlosti.`, actionLabel: 'Otevřít anomálie', action: () => navigate('anomalies') }
    }
    // škoda
    if (has('skod', 'nehod', 'pojistn udal')) {
      return { text: 'Spustím průvodce nahlášením škody — vyberte vozidlo a popište událost, zbytek doplním z dat flotily.', actionLabel: 'Otevřít škody', action: () => navigate('claims') }
    }
    return { text: `Pracuji nad reálnými daty ČSAD AUTOBUSY České Budějovice (${vehiclesData.length} vozidel, z toho ${buses.length} autobusů). Zkuste třeba „Kde ztrácíme nejvíc peněz?", „Je někde podezřelý úbytek nafty?", „Nejdražší vozidla" nebo „Kteří řidiči jezdí rizikově?".` }
  }
  const sendAi = (t) => {
    const q = (typeof t === 'string' ? t : state.aiInput).trim()
    if (!q) return
    const r = aiReply(q)
    setState((s) => ({ aiInput: '', aiMessages: [...s.aiMessages, { role: 'user', text: q }, { role: 'ai', text: r.text, actionLabel: r.actionLabel, action: r.action }] }))
  }

  // ---------- VIEW MODELS ----------
  const newFleetVM = () => {
    const d = state.npData
    const setField = (k, v) => setState((s) => ({ npData: { ...s.npData, [k]: v } }))
    const create = () => {
      const id = 'fn' + (state.newFleets.length + 1)
      const nf = {
        id,
        name: d.name.trim() || 'Nový vozový park',
        manager: d.manager.trim() || '—',
        vehicles: parseInt(d.vehicles, 10) || 0,
        premium: 0, claims: 0, risk: 100,
        insurers: [d.insurer], renewals: 0,
        policy: d.policy.trim() || '—', policyStart: d.start,
      }
      setState((s) => ({ newFleets: [...s.newFleets, nf], np: false }))
      navigate('fleet-detail', { fleetId: id, fleetTab: 'overview' })
      showToast(`Vozový park „${nf.name}" byl vytvořen · flotilová smlouva ${nf.policy}.`)
    }
    return {
      np: state.np,
      openNewFleet: () => setState({ np: true, npData: { name: '', manager: '', insurer: 'Kooperativa', policy: '', start: '1. 7. 2026', vehicles: '' } }),
      nf: {
        close: () => setState({ np: false }), stop: (e) => e.stopPropagation(), create,
        canCreate: d.name.trim().length > 0,
        broker: 'Petr Kmoch, Petrisk a.s.',
        insurerOpts: ['Kooperativa', 'Allianz', 'ČPP', 'Generali', 'UNIQA', 'ČSOB Poj.'],
        name: d.name, manager: d.manager, insurer: d.insurer, policy: d.policy, start: d.start, vehicles: d.vehicles,
        onName: (e) => setField('name', e.target.value),
        onManager: (e) => setField('manager', e.target.value),
        onInsurer: (e) => setField('insurer', e.target.value),
        onPolicy: (e) => setField('policy', e.target.value),
        onStart: (e) => setField('start', e.target.value),
        onVehicles: (e) => setField('vehicles', e.target.value),
      },
    }
  }

  const shellVM = () => {
    const r = state.route
    const navItems = [
      ['dashboard', 'Přehled', 'home', null],
      ['fleets', 'Vozové parky', 'fleets', null],
      ['vehicles', 'Vozidla', 'car', String(vehiclesData.length)],
      ['drivers', 'Řidiči', 'users', String(driversData.length)],
      ['linky', 'Linky & JŘ', 'pin', String(linesData.length)],
      ['map', 'Živá mapa', 'mapPin', null],
      ['dispatch', 'Dispečink', 'calendar', null],
      ['anomalies', 'Anomálie', 'alert', String(FLEET_ANOMALIES.filter((a) => a.status !== 'done').length) || null],
      ['eco', 'Eco-driving', 'gauge', null],
      ['insurance', 'Pojištění', 'shield', null],
      ['financing', 'Financování', 'banknote', String(vehiclesData.filter((v) => v.financing && v.financing.active).length)],
      ['claims', 'Škody', 'umbrella', String(claimsData.filter((c) => c.status !== 'closed').length) || null],
      ['documents', 'Dokumenty', 'file', null],
      ['analytics', 'Reporting', 'trend', null],
      ['contacts', 'Kontakty', 'users', null],
      ['settings', 'Nastavení', 'settings', null],
    ]
    const activeRoute = r === 'fleet-detail' ? 'fleets' : r === 'vehicle-detail' ? 'vehicles' : r === 'driver-detail' ? 'drivers' : r === 'bonifikace-detail' ? 'bonifikace' : r === 'documents-detail' ? 'documents' : r === 'claim-detail' ? 'claims' : r === 'linky-detail' ? 'linky' : r === 'stazka' ? 'dispatch' : r === 'anomaly-detail' ? 'anomalies' : r
    const nav = navItems.map(([id, label, icon, badge]) => {
      const on = activeRoute === id
      return {
        id, label, icon: ic(icon, 20), iconColor: on ? '#fff' : 'var(--side-fg)',
        onClick: () => id === 'fleets' ? goParks() : navigate(id),
        style: `position:relative;display:flex;align-items:center;gap:13px;padding:11px 13px;margin:3px 0;border-radius:14px;font-size:14px;font-weight:${on ? '600' : '500'};cursor:pointer;letter-spacing:-.1px;transition:background .16s ease,color .16s ease,box-shadow .16s ease;color:${on ? '#fff' : 'var(--side-fg)'};background:${on ? 'linear-gradient(135deg,#4F6FFF 0%,#6D5EF6 100%)' : 'transparent'};box-shadow:${on ? '0 10px 24px -8px rgba(79,111,255,.7)' : 'none'}`,
        hover: on ? '' : 'background:var(--side-hover);color:var(--side-strong)',
        badge, badgeStyle: `font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:${on ? '#fff' : 'var(--side-fg)'};background:rgba(255,255,255,${on ? '.22' : '.07'});padding:2px 8px;border-radius:20px`,
      }
    })
    const titles = {
      dashboard: ['Přehled', 'Souhrn vozového parku ČSAD AUTOBUSY České Budějovice a.s.'],
      fleets: ['Vozové parky', `${allFleets.length} ${allFleets.length === 1 ? 'lokalita' : allFleets.length < 5 ? 'lokality' : 'lokalit'} · ${vehiclesData.length} vozidel`],
      vehicles: ['Vozidla', `${vehiclesData.length} vozidel celkem`],
      drivers: ['Řidiči', `${driversData.length} řidičů vozového parku`],
      linky: ['Linky & jízdní řády', 'Autobusové linky, jízdní řády a vyhodnocení provozu'],
      eco: ['Eco-driving', 'Hospodárnost jízdy a úspora paliva napříč parkem'],
      insurance: ['Pojištění', 'Smlouvy a krytí napříč parky'],
      financing: ['Financování', 'Přehled financování vozového parku'],
      claims: ['Škody', `${claimsData.filter((c) => c.status !== 'closed').length} otevřených · ${claimsData.filter((c) => c.status === 'closed').length} uzavřených`],
      documents: ['Dokumenty', 'Centrální úložiště dokumentů'],
      'documents-detail': ['Pojistné smlouvy', 'Flotilové smlouvy a jejich dokumenty'],
      bonifikace: ['Bonifikace', 'Vrácení části pojistného dle škodního průběhu'],
      contacts: ['Kontakty', 'Správa vozového parku a pojišťovací makléř'],
      analytics: ['Reporting', 'Náklady, stáří a úspory celé flotily'],
      attention: ['Vyžaduje pozornost', 'Co je potřeba řešit napříč flotilou'],
      dispatch: ['Dispečink', 'Oběhy vozidel, turnusy řidičů a stazka'],
      anomalies: ['Anomálie', 'Detekce napříč flotilou: linky, trasy, vozidla, řidiči a palivo'],
      map: ['Živá mapa', 'Poloha a stav flotily v reálném čase'],
      settings: ['Nastavení', 'Profil a předvolby portálu'],
    }
    let title, sub
    if (r === 'fleet-detail') { const f = allFleets.find((x) => x.id === state.fleetId); title = f.name; sub = `${f.address ? f.address + ' · ' : ''}${f.vehicles} vozidel` }
    else if (r === 'vehicle-detail') { const v = vehiclesData.find((x) => x.id === state.vehicleId); title = `${v.brand} ${v.model}`; sub = `${v.plate} · ${fleetName(v.fleet)}` }
    else if (r === 'bonifikace-detail') { const f = allFleets.find((x) => x.id === state.fleetId) || allFleets[0]; title = `Bonifikace · ${f.insurers[0]}`; sub = `Flotilová smlouva č. ${f.policy || '—'}` }
    else if (r === 'documents-detail') { const tm = { zk: ['Zelené karty', 'Zelená karta ke každému vozidlu'], orv: ['Technické průkazy', 'Osvědčení o registraci vozidla (ORV)'], faktury: ['Faktury', 'Faktury za pojištění'] }; const t = tm[state.docCat] || ['Pojistné smlouvy', 'Flotilové smlouvy a jejich dokumenty']; title = t[0]; sub = t[1] }
    else if (r === 'claim-detail') { const c = claimsData.find((x) => x.id === state.claimId) || claimsData[0]; title = `Škoda ${c.id}`; sub = `${c.type} · ${c.vehicle}` }
    else if (r === 'driver-detail') { const d = driversData.find((x) => x.id === state.driverId) || driversData[0]; title = d.name; sub = d.position }
    else if (r === 'linky-detail') { const l = linesData.find((x) => x.id === state.lineId) || linesData[0]; title = `Linka ${l.no} · ${l.name}`; sub = `${l.agency} · ${l.stops.length} zastávek` }
    else if (r === 'stazka') { const l = linesData.find((x) => x.id === state.stazkaLine) || linesData[0]; const b = vehiclesData.find((x) => x.id === l.busId); title = `Stazka · linka ${l.no}`; sub = `${b ? b.brand + ' ' + b.model + ' · ' + b.plate : ''} · ${DISPATCH_DAY_LABEL}` }
    else if (r === 'anomaly-detail') { const a = FLEET_ANOMALIES.find((x) => x.id === state.anomalyId) || FLEET_ANOMALIES[0]; title = a.typeLabel; sub = `${a.plate !== '—' ? a.plate + ' · ' : ''}${a.date}` }
    else { const t = titles[r] || ['', '']; title = t[0]; sub = t[1] }

    const aiMessages = state.aiMessages.map((m) => ({
      text: m.text,
      role: m.role,
      actionLabel: m.actionLabel || null,
      onAction: m.action || null,
      wrap: `display:flex;flex-direction:column;align-items:${m.role === 'user' ? 'flex-end' : 'flex-start'}`,
      bubble: m.role === 'user'
        ? 'max-width:80%;background:var(--blue);color:#fff;padding:9px 13px;border-radius:14px 14px 4px 14px;font-size:13px;line-height:1.5'
        : 'max-width:84%;background:#fff;border:1px solid var(--border);padding:9px 13px;border-radius:14px 14px 14px 4px;font-size:13px;line-height:1.5;color:#27272A',
    }))
    const aiChips = [
      { text: 'Kde ztrácíme nejvíc?', onClick: () => sendAi('Kde ztrácíme nejvíc peněz?') },
      { text: 'Podezřelý úbytek nafty?', onClick: () => sendAi('Je někde podezřelý úbytek nafty?') },
      { text: 'Nejdražší vozidla', onClick: () => sendAi('Která vozidla jsou nejdražší?') },
      { text: 'Rizikoví řidiči', onClick: () => sendAi('Kteří řidiči jezdí rizikově?') },
      { text: 'Kolik stojí flotila?', onClick: () => sendAi('Kolik stojí provoz flotily?') },
    ]
    const notifs = [
      { icon: ic('refresh', 16), bg: 'var(--amber-soft)', color: 'var(--amber)', title: '34 vozidel čeká na obnovu', sub: 'Nejbližší Škoda Scala (2SC 7790) · 20. 6.', time: 'před 1 h', unread: true },
      { icon: ic('alert', 16), bg: 'var(--star-soft)', color: 'var(--star)', title: 'Nová pojistná událost', sub: 'BMW 320d (2BM 5567) · parkovací škoda', time: 'před 5 h', unread: true },
      { icon: ic('file', 16), bg: 'var(--blue-soft)', color: 'var(--blue)', title: 'Chybí zelená karta', sub: 'Hyundai Tucson (6HY 3320)', time: 'včera', unread: true },
      { icon: ic('shield', 16), bg: 'var(--green-soft)', color: 'var(--green)', title: 'Smlouva obnovena', sub: 'VW Transporter · povinné ručení ČSOB', time: 'včera', unread: false },
    ]
    const q = state.searchQuery.toLowerCase()
    let res = []
    vehiclesData.forEach((v) => res.push({ kind: 'Vozidlo', title: `${v.brand} ${v.model}`, sub: `${v.plate} · ${v.driver}`, icon: ic('car', 16), bg: '#F1F1F3', color: '#5B5B63', onClick: () => openVehicle(v.id), q: `${v.brand} ${v.model} ${v.plate} ${v.driver}`.toLowerCase() }))
    allFleets.forEach((f) => res.push({ kind: 'Park', title: f.name, sub: `${f.vehicles} vozidel · ${f.manager}`, icon: ic('fleets', 16), bg: 'var(--blue-soft)', color: 'var(--blue)', onClick: () => openFleet(f.id), q: `${f.name} ${f.manager}`.toLowerCase() }))
    claimsData.forEach((c) => res.push({ kind: 'Událost', title: c.id, sub: `${c.vehicle} · ${c.type}`, icon: ic('alert', 16), bg: 'var(--star-soft)', color: 'var(--star)', onClick: () => navigate('claims'), q: `${c.id} ${c.vehicle} ${c.type}`.toLowerCase() }))
    if (q) res = res.filter((x) => x.q.includes(q))
    res = res.slice(0, 7)

    return {
      vp, sidebarOpen: state.sidebar, toggleSidebar: () => setState((s) => ({ sidebar: !s.sidebar })), closeSidebar: () => setState({ sidebar: false }),
      nav, pageTitle: title, pageSubtitle: sub, route: r, companyVehicles: vehiclesData.length,
      isDashboard: r === 'dashboard', isFleets: r === 'fleets', isFleetDetail: r === 'fleet-detail',
      isVehicles: r === 'vehicles', isVehicleDetail: r === 'vehicle-detail',
      isInsurance: r === 'insurance', isInsuranceDetail: r === 'insurance-detail', isClaims: r === 'claims', isDocuments: r === 'documents', isAnalytics: r === 'analytics', isContacts: r === 'contacts', isSettings: r === 'settings', isDrivers: r === 'drivers', isDriverDetail: r === 'driver-detail', isFinancing: r === 'financing',
      isLinky: r === 'linky', isLinkyDetail: r === 'linky-detail', isEco: r === 'eco', isAttention: r === 'attention', isDispatch: r === 'dispatch', isStazka: r === 'stazka', isAnomalies: r === 'anomalies', isAnomalyDetail: r === 'anomaly-detail', isMap: r === 'map',
      isDocumentsDetail: r === 'documents-detail',
      openDocCat: (cat) => navigate('documents-detail', { docCat: cat, docOpen: {} }), goDocuments: () => navigate('documents'),
      docPreview: state.docPreview, closeDocPreview: () => setState({ docPreview: null }),
      isBonifikace: r === 'bonifikace', isBonifikaceDetail: r === 'bonifikace-detail',
      isClaimDetail: r === 'claim-detail',
      openBonus: (id) => navigate('bonifikace-detail', { fleetId: id }), goBonifikace: () => navigate('bonifikace'),
      claimWizard: state.claimWizard, closeClaimWizard: () => setState({ claimWizard: false }),
      toast: state.toast, rowMenuOpen: state.rowMenu !== null, closeRowMenu: () => setState({ rowMenu: null }),
      unsub: state.unsub, unsubDone: state.unsubDone, unsubReason: state.unsubReason, unsubDate: state.unsubDate,
      closeUnsub: () => setState({ unsub: null }),
      setUnsubReason: (e) => setState({ unsubReason: e.target.value }),
      setUnsubDate: (e) => setState({ unsubDate: e.target.value }),
      submitUnsub: () => setState({ unsubDone: true }),
      unsubReasons: ['Prodej vozidla', 'Vyřazení z provozu', 'Totální škoda', 'Ukončení leasingu / úvěru', 'Převod na jiného provozovatele', 'Jiný důvod'],
      unsubApprover: { name: 'Ing. Tomáš Bartoš', role: 'Vedoucí správy vozového parku · ČSAD AUTOBUSY České Budějovice a.s.', initials: 'TB' },
      costModal: state.costModal, costDone: state.costDone, costType: state.costType, costDesc: state.costDesc, costAmount: state.costAmount, costDate: state.costDate, costFile: state.costFile,
      closeCostModal: () => setState({ costModal: null }),
      setCostType: (e) => setState({ costType: e.target.value }),
      setCostDesc: (e) => setState({ costDesc: e.target.value }),
      setCostAmount: (e) => setState({ costAmount: e.target.value }),
      setCostDate: (e) => setState({ costDate: e.target.value }),
      pickCostFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) setState({ costFile: f.name }) },
      submitCost: () => setState((s) => {
        const c = s.costModal
        if (!c) return {}
        const item = { id: 'co' + Date.now(), cat: COST_TYPE_TO_CAT[s.costType] || 'ostatni', label: s.costDesc.trim() || s.costType, date: s.costDate, amount: moneyNum(s.costAmount), invoice: s.costFile || '' }
        return { vehCostsExtra: { ...s.vehCostsExtra, [c.vid]: [item, ...(s.vehCostsExtra[c.vid] || [])] }, costDone: true }
      }),
      costTypes: ['Servis a opravy', 'Dálniční známka', 'Pneumatiky / přezutí', 'STK a emise', 'Palivo', 'Mytí a péče o vůz', 'Parkování', 'Mýtné (zahraničí)', 'Pokuta', 'Náhradní vozidlo', 'Leasing / splátka', 'Ostatní'],
      noteModal: state.noteModal, noteText: state.noteText, currentUser: (() => { const rr = ROLES.find((x) => x.id === state.role) || ROLES[0]; return { name: rr.name, initials: rr.initials, role: rr.title + ' · ČSAD AUTOBUSY České Budějovice a.s.' } })(),
      role: state.role, roles: ROLES, roleObj: ROLES.find((x) => x.id === state.role) || ROLES[0], roleMenu: state.roleMenu, setRole, toggleRoleMenu, closeRoleMenu: () => setState({ roleMenu: false }), roleIcon: (n) => ic(n, 18),
      closeNoteModal: () => setState({ noteModal: null, noteText: '' }),
      setNoteText: (e) => setState({ noteText: e.target.value }),
      submitNote: () => setState((s) => {
        const txt = (s.noteText || '').trim()
        if (!txt || !s.noteModal) return {}
        const vid = s.noteModal.vid
        const now = new Date()
        const time = `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`
        const note = { text: txt, author: 'Martin Kovář', initials: 'MK', date: '19. 6. 2026', time }
        return { vehNotes: { ...s.vehNotes, [vid]: [note, ...(s.vehNotes[vid] || [])] }, noteModal: null, noteText: '' }
      }),
      parkModal: state.parkModal, parkTarget: state.parkTarget, parkDone: state.parkDone,
      parkCurrentName: state.parkModal ? fleetName(state.parkModal.fleet) : '',
      parkOptions: fleetsData.filter((f) => !state.parkModal || f.id !== state.parkModal.fleet).map((f) => ({ id: f.id, name: f.name, manager: f.manager, vehicles: f.vehicles })),
      closeParkModal: () => setState({ parkModal: null, parkTarget: null }),
      setParkTarget: (id) => setState({ parkTarget: id }),
      submitPark: () => setState((s) => {
        if (!s.parkTarget || !s.parkModal) return {}
        const vid = s.parkModal.vid
        return { vehOverrides: { ...s.vehOverrides, [vid]: { ...(s.vehOverrides[vid] || {}), fleet: s.parkTarget } }, parkDone: true }
      }),
      driverModal: state.driverModal, driverSel: state.driverSel, driverDone: state.driverDone,
      drivers: DRIVERS.map((d) => ({ ...d, initials: initialsOf(d.name) })),
      closeDriverModal: () => setState({ driverModal: null, driverSel: null }),
      setDriverSel: (id) => setState({ driverSel: id }),
      submitDriver: () => setState((s) => {
        if (!s.driverSel || !s.driverModal) return {}
        const vid = s.driverModal.vid
        const dr = DRIVERS.find((d) => d.id === s.driverSel)
        return { vehOverrides: { ...s.vehOverrides, [vid]: { ...(s.vehOverrides[vid] || {}), driver: dr.name } }, driverDone: true }
      }),
      goFleets: goParks,
      openClaimWizard: () => setState({ claimWizard: true, claimStep: 1, claimData: {} }),
      av: state.av, openAddVehicle: () => setState({ av: true, avStep: 1, avMethod: 'spz', avInput: '', avLoaded: false, avFleet: state.fleetId }),
      ...newFleetVM(),
      companyMenu: state.companyMenu, notif: state.notif, ai: state.ai, search: state.search,
      searchQuery: state.searchQuery, searchResults: res,
      aiMessages, aiChips, aiInput: state.aiInput, notifs,
      toggleNotif, toggleAI, openSearch, closeSearch,
      onSearchInput: (e) => setState({ searchQuery: e.target.value }),
      onAiInput: (e) => setState({ aiInput: e.target.value }),
      onAiKey: (e) => { if (e.key === 'Enter') sendAi() },
      sendAi: () => sendAi(), stop, goVehicles: () => navigate('vehicles'),
      execReportHtml: state.execReport, closeExec: () => setState({ execReport: null }),
    }
  }

  const dashboardVM = () => {
    if (state.route !== 'dashboard') return {}
    const totalVehicles = vehiclesData.length
    const havCount = vehiclesData.filter((v) => v.cov && v.cov.hav).length
    const sklaCount = vehiclesData.filter((v) => v.cov && v.cov.skla).length
    const asistCount = vehiclesData.filter((v) => v.cov && v.cov.asist).length
    const povOnly = totalVehicles - havCount

    // Globální agregáty pro majitele (souhrn napříč všemi parky; shodné se stránkou Škody)
    const claimsTotal = claimsData.length
    const claimsOpen = claimsData.filter((c) => c.status !== 'closed').length
    const claimsReserve = claimsData.reduce((a, c) => a + (c.estimate || 0), 0)
    const financedCount = vehiclesData.filter((v) => v.financing && v.financing.active).length
    const stkExpCount = vehiclesData.filter((v) => { const d = dueInfo(vehicleStk(v)); return d && d.days <= 60 }).length
    const vigExpCount = vehiclesData.filter((v) => { const vg = vehicleVignette(v); if (!vg) return false; const d = dueInfo(vg.validTo); return d && d.days <= 60 }).length
    const rpExpCount = driversData.filter((d) => { const a = dueInfo(d.rp && d.rp.validTo, 60); const b = d.rp && d.rp.profValidTo ? dueInfo(d.rp.profValidTo, 60) : null; return (a && a.days <= 60) || (b && b.days <= 60) }).length

    // KPI — souhrn flotily pro majitele
    const driverCount = driversData.length
    const driverActive = driversData.filter((d) => d.status === 'active').length
    const financedPct = Math.round(financedCount / (totalVehicles || 1) * 100)
    const kpis = [
      { value: String(totalVehicles), label: 'Vozidel celkem', note: `${typeCats.length} typů · ${allFleets.length} ${allFleets.length === 1 ? 'park' : 'parky'}` },
      { value: '—', label: 'Roční pojistné', note: 'čeká na napojení' },
      { value: String(driverCount), label: 'Řidičů', note: `${driverActive} aktivních` },
      { value: String(financedCount), label: 'Financováno', note: `${financedPct} % vozidel · úvěr / leasing` },
    ]

    // graf: vozidla podle TYPU vozidla (reálné, z druhu)
    const catMax = Math.max(...typeCats.map((c) => c.vehicles), 1)
    const catBars = typeCats.map((c) => ({ label: c.name, short: c.name.split(' ')[0], n: c.vehicles, h: Math.round(c.vehicles / catMax * 100) }))

    // donut: vozidla podle značky (reálné z brandsData)
    let acc = 0
    const segs = brandsData.map((b) => { const a = acc; acc += b.pct / 100 * 360; return `${b.color} ${a}deg ${acc}deg` })
    const brandDonut = `conic-gradient(${segs.join(',')})`
    const brandLegend = brandsData.map((b) => ({ name: b.name, color: b.color, count: b.count, pct: b.pct }))

    // Rychlý přehled = co vyžaduje pozornost majitele (globálně napříč parky)
    const finEnd = financingEnding(90)
    const amberGreen = (n) => n ? { color: 'var(--amber)', bg: 'var(--amber-soft)' } : { color: 'var(--green)', bg: 'var(--green-soft)' }
    const starGreen = (n) => n ? { color: 'var(--star)', bg: 'var(--star-soft)' } : { color: 'var(--green)', bg: 'var(--green-soft)' }
    const lekExpCount = driversData.filter((d) => { const due = dueInfo(d.lekarska && d.lekarska.validTo, 60); return due && due.days <= 60 }).length
    const goAttn = (cat) => navigate('attention', { attnCat: cat })
    const quickStats = [
      { icon: ic('alert', 18), ...starGreen(claimsOpen), label: 'Otevřené škody', sub: claimsReserve ? `rezervy ${czk(claimsReserve)}` : 'v likvidaci', value: String(claimsOpen), onClick: () => goAttn('claims') },
      { icon: ic('check2', 18), ...amberGreen(stkExpCount), label: 'Končící STK a emise', sub: 'do 60 dnů / po platnosti', value: String(stkExpCount), onClick: () => goAttn('stk') },
      { icon: ic('shield', 18), ...amberGreen(lekExpCount), label: 'Končící lékařské prohlídky', sub: 'řidiči do 60 dnů', value: String(lekExpCount), onClick: () => goAttn('lekarska') },
      { icon: ic('user1', 18), ...amberGreen(rpExpCount), label: 'Končící řidičské průkazy', sub: 'ŘP / profesní do 60 dnů', value: String(rpExpCount), onClick: () => goAttn('rp') },
      { icon: ic('doc2', 18), ...amberGreen(vigExpCount), label: 'Končící dálniční známky', sub: 'do 60 dnů / po platnosti', value: String(vigExpCount), onClick: () => goAttn('vignette') },
    ]

    // karty vozových parků (lokalit) — hav dopočítán z vozidel parku
    const dashFleets = allFleets.map((f) => {
      const fv = vehiclesData.filter((v) => v.fleet === f.id)
      const fhav = fv.filter((v) => v.cov && v.cov.hav).length
      return {
        id: f.id, name: f.name, vehicles: fv.length, hav: fhav,
        havPct: Math.round(fhav / (fv.length || 1) * 100),
        onClick: () => navigate('fleet-detail', { fleetId: f.id, fleetTab: 'overview' }),
      }
    })

    // nejnovější vozidla ve flotile (reálné, dle roku uvedení)
    const activity = [...vehiclesData].filter((v) => typeof v.year === 'number').sort((a, b) => b.year - a.year).slice(0, 7).map((v) => ({
      actor: `${v.brand} ${v.model} (${v.plate})`,
      action: `${v.druh} · uvedeno do provozu ${v.year}`,
      time: vehicleTypeCat(v.druh),
      color: v.cov && v.cov.hav ? 'var(--green)' : 'var(--blue)',
      cat: v.cov && v.cov.hav ? 'Havarijní' : 'Povinné ručení',
      catColor: v.cov && v.cov.hav ? 'var(--green)' : 'var(--blue)',
      avatar: (v.brand || '?').slice(0, 2).toUpperCase(),
    }))

    const dashDocs = [
      { name: 'Sestava vozového parku 2026', meta: `XLSX · ${totalVehicles} vozidel`, color: 'var(--blue)' },
      { name: 'Přehled pojistného krytí', meta: `PDF · ${havCount}× havarijní`, color: 'var(--green)' },
      { name: 'Seznam technických průkazů', meta: `PDF · ${totalVehicles} vozidel`, color: 'var(--purple)' },
    ]

    return { kpis, catBars, brandDonut, brandLegend, quickStats, dashFleets, activity, dashDocs, totalVehicles, havCount, navigate, goParks, parkCount: allFleets.length }
  }

  const fleetsVM = () => {
    if (state.route !== 'fleets') return {}
    const riskColor = (r) => r >= 75 ? 'var(--green)' : r >= 62 ? 'var(--amber)' : 'var(--star)'
    const fleetCards = allFleets.map((f) => ({
      name: f.name, manager: f.manager, vehicles: f.vehicles, policy: f.policy || '—',
      premium: (f.premium ? (f.premium / 1000000).toFixed(2).replace('.', ',') + ' mil.' : '—'),
      claims: f.claims, risk: f.risk, riskColor: riskColor(f.risk),
      hav: f.hav || 0, havPct: Math.round((f.hav || 0) / (f.vehicles || 1) * 100),
      renewals: f.renewals, renewalsShow: f.renewals > 0, insurers: f.insurers,
      onClick: () => openFleet(f.id),
    }))
    const fleetsExport = {
      filename: 'vozove-parky', title: 'Vozové parky',
      columns: [{ key: 'park', label: 'Vozový park' }, { key: 'manager', label: 'Fleet manager' }, { key: 'vozidla', label: 'Vozidla' }, { key: 'premium', label: 'Roční pojistné' }, { key: 'claims', label: 'Události (rok)' }, { key: 'risk', label: 'Rizikové skóre' }, { key: 'pojistovny', label: 'Pojišťovny' }, { key: 'obnovy', label: 'Obnovy do 30 dnů' }],
      rows: fleetCards.map((f) => ({ park: f.name, manager: f.manager, vozidla: f.vehicles, premium: f.premium, claims: f.claims, risk: f.risk + '/100', pojistovny: f.insurers.join(', '), obnovy: f.renewals })),
    }
    return { fleetCards, fleetsView: state.fleetsView, setFleetsView: (v) => setState({ fleetsView: v }), fleetsExport }
  }

  const fleetDetailVM = () => {
    if (state.route !== 'fleet-detail') return {}
    const f = allFleets.find((x) => x.id === state.fleetId) || allFleets[0]
    const tab = state.fleetTab
    const riskColor = (r) => r >= 75 ? 'var(--green)' : r >= 62 ? 'var(--amber)' : 'var(--star)'
    const fvehAll = vehiclesData.filter((v) => v.fleet === f.id)
    const fveh = fvehAll.filter((v) => v.status !== 'ended')
    const cnt = fveh.length
    const fhav = fveh.filter((v) => v.cov && v.cov.hav).length
    const fpov = cnt - fhav
    const fskla = fveh.filter((v) => v.cov && v.cov.skla).length
    const fasist = fveh.filter((v) => v.cov && v.cov.asist).length
    const fHavPct = Math.round(fhav / (cnt || 1) * 100)
    const stats = [
      { label: 'Vozidel', value: String(cnt), color: 'var(--ink)' },
      { label: 'S havarijním', value: String(fhav), color: 'var(--green)' },
      { label: 'Pouze povinné ručení', value: String(fpov), color: 'var(--ink)' },
      { label: 'Havarijní krytí', value: fHavPct + ' %', color: 'var(--blue)' },
      { label: 'Roční pojistné', value: '—', color: 'var(--ink3)' },
    ]
    const tabsDef = [['overview', 'Přehled'], ['vehicles', 'Vozidla'], ['documents', 'Dokumenty']]
    const fleetTabs = tabsDef.map(([id, label]) => { const on = tab === id; return { label, onClick: () => setState({ fleetTab: id }), style: `padding:10px 14px;font-size:13.5px;font-weight:600;cursor:pointer;color:${on ? 'var(--blue-ink)' : 'var(--ink3)'};border-bottom:2px solid ${on ? 'var(--blue)' : 'transparent'};margin-bottom:-1px` } })
    // Rozpad vozidel podle typu
    const typeBreakdown = vehicleTypeOrder.map((name) => ({ name, count: fveh.filter((v) => vehicleTypeCat(v.druh) === name).length })).filter((t) => t.count).map((t) => ({ ...t, pct: Math.round(t.count / (cnt || 1) * 100) }))
    // Rozpad pojistného krytí
    const coverBreakdown = [
      { label: 'Povinné ručení', count: cnt, color: 'var(--blue)' },
      { label: 'Havarijní pojištění', count: fhav, color: 'var(--green)' },
      { label: 'Pojištění skel', count: fskla, color: 'var(--purple)' },
      { label: 'Asistence', count: fasist, color: 'var(--amber)' },
    ].map((c) => ({ ...c, pct: Math.round(c.count / (cnt || 1) * 100) }))
    // Rozpad financování
    const finBreakdown = [
      { key: 'bank_loan', label: 'Účelový úvěr', color: 'var(--blue)' },
      { key: 'finance_lease', label: 'Finanční leasing', color: 'var(--purple)' },
      { key: 'operating_lease', label: 'Operativní leasing', color: 'var(--amber)' },
      { key: 'own', label: 'Vlastní zdroje', color: 'var(--ink3)' },
    ].map((t) => ({ ...t, count: fveh.filter((v) => v.financing && (t.key === 'own' ? !v.financing.active : v.financing.type === t.key)).length })).filter((t) => t.count).map((t) => ({ ...t, pct: Math.round(t.count / (cnt || 1) * 100) }))
    const financedCount = fveh.filter((v) => v.financing && v.financing.active).length
    // Končící STK a dálniční známky (≤ 60 dnů nebo prošlé)
    const mkExp = (v, info) => ({ id: v.id, plate: v.plate, name: `${v.brand} ${v.model}`, date: info.date, days: info.days, expired: info.expired, label: info.expired ? `prošlo před ${-info.days} dny` : info.days === 0 ? 'končí dnes' : `končí za ${info.days} ${info.days === 1 ? 'den' : info.days < 5 ? 'dny' : 'dní'}`, color: info.expired ? 'var(--star)' : info.days <= 30 ? 'var(--amber)' : 'var(--green)', onClick: () => openVehicle(v.id) })
    const stkAll = fveh.map((v) => ({ v, info: dueInfo(vehicleStk(v)) })).filter((x) => x.info && x.info.days <= 60).sort((a, b) => a.info.days - b.info.days)
    const vigAll = fveh.map((v) => { const vg = vehicleVignette(v); return vg ? { v, info: dueInfo(vg.validTo) } : null }).filter((x) => x && x.info && x.info.days <= 60).sort((a, b) => a.info.days - b.info.days)
    const expiringStk = stkAll.slice(0, 6).map((x) => mkExp(x.v, x.info))
    const expiringVig = vigAll.slice(0, 6).map((x) => mkExp(x.v, x.info))
    const base = f.premium / 12 / 1000
    const lv = [0.9, 0.93, 0.95, 0.97, 1.0, 1.02, 1.04, 1.03, 1.06, 1.08, 1.07, 1.1].map((x) => x * base)
    const lp = linePath(lv, 600, 170, 16)
    const ins = f.insurers
    const insPcts = ins.length === 1 ? [100] : ins.length === 2 ? [62, 38] : [50, 30, 20]
    let acc = 0; const segs = ins.map((n, i) => { const a = acc; acc += insPcts[i] / 100 * 360; return `${INS_COLORS[n] || '#A1A1AA'} ${a}deg ${acc}deg` })
    const donut = `conic-gradient(${segs.join(',')})`
    const insurerLegend = ins.map((n, i) => ({ name: n, pct: insPcts[i], color: INS_COLORS[n] || '#A1A1AA' }))
    const fuel = [{ name: 'Diesel', pct: 54, color: '#3F3F46' }, { name: 'Benzín', pct: 24, color: '#C2780C' }, { name: 'Elektro', pct: 14, color: '#16A34A' }, { name: 'Hybrid', pct: 8, color: '#2058C9' }].map((x) => ({ ...x, w: x.pct + '%' }))
    const evPct = 22
    const evDonut = `conic-gradient(var(--green) 0deg ${evPct / 100 * 360}deg, #EDEDF0 ${evPct / 100 * 360}deg 360deg)`
    const cb = [2, 1, 3, 0, 2, 1, 3, 2]; const cbm = Math.max(...cb, 1)
    const claimBars = cb.map((v, i) => ({ h: Math.round(v / cbm * 100) + '%', color: i >= 6 ? 'var(--star)' : '#E3B7BE' }))
    const open = state.rowMenu
    const fleetVehicles = vehiclesData.filter((v) => v.fleet === f.id && v.status !== 'ended').map((v) => {
      const mo = open === v.id
      return {
        id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel, insurer: v.insurer,
        vin: v.vin, prihlaska: v.prihlaska,
        premiumF: czk(v.premium), statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status),
        onClick: () => openVehicle(v.id),
        menuOpen: mo, stop: (e) => e.stopPropagation(),
        rowStyle: `position:relative;z-index:${mo ? 30 : 'auto'};background:${mo ? '#F2F6FC' : 'transparent'};display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid var(--border)`,
        kebabStyle: `width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${mo ? 'var(--blue)' : 'var(--ink3)'};background:${mo ? 'var(--blue-soft)' : 'transparent'}`,
        toggleMenu: (e) => { e.stopPropagation(); setState((s) => ({ rowMenu: s.rowMenu === v.id ? null : v.id })) },
        changeCover: (e) => { e.stopPropagation(); setState({ rowMenu: null }); openVehicle(v.id); setState({ vehicleTab: 'insurance' }) },
        reportClaim: (e) => { e.stopPropagation(); setState({ rowMenu: null, claimWizard: true, claimStep: 1, claimData: { vehicleId: v.id } }) },
        unsubscribe: (e) => { e.stopPropagation(); openUnsub(v) },
      }
    })
    const fleetEnded = vehiclesData.filter((v) => v.fleet === f.id && v.status === 'ended').map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel,
      fleetName: fleetName(v.fleet), typeName: vehicleTypeCat(v.druh), insurer: v.insurer, premiumF: czk(v.premium), endedDate: v.endedDate, endReason: v.endReason,
      statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status), onClick: () => openVehicle(v.id),
    }))

    const pv = vehiclesData.filter((v) => v.fleet === f.id && v.status !== 'ended')
    const grp = {}
    pv.forEach((v) => { if (!grp[v.insurer]) grp[v.insurer] = { count: 0, premium: 0 }; grp[v.insurer].count++; grp[v.insurer].premium += v.premium })
    let parkInsurers = Object.entries(grp).map(([name, x]) => ({ name, policy: fleetInsurerPolicy(name, f.id), count: x.count, premium: x.premium, premiumF: czk(x.premium) })).sort((a, b) => b.premium - a.premium)
    if (parkInsurers.length === 0) parkInsurers = (f.insurers || []).map((name) => ({ name, policy: fleetInsurerPolicy(name, f.id), count: 0, premium: 0, premiumF: czk(0) }))
    const insurersTotalF = czk(parkInsurers.reduce((a, b) => a + b.premium, 0))

    const riskRows = RISKS.map((r) => {
      let count = 0, premium = 0
      pv.forEach((v, i) => { if (r.has(v, i)) { count++; premium += Math.round(v.premium * r.frac) } })
      return { label: r.label, icon: ic(r.icon, 18), bg: r.bg, color: r.color, count, coverage: pv.length ? Math.round(count / pv.length * 100) : 0, premium, premiumF: czk(premium) }
    }).filter((r) => r.count > 0)
    const riskTotalF = czk(riskRows.reduce((a, b) => a + b.premium, 0))
    const parkClaimsRaw = claimsData.filter((c) => { const cv = vehiclesData.find((x) => x.id === c.vId); return cv && cv.fleet === f.id })
    const fleetClaims = parkClaimsRaw.map(buildClaimRow)
    // Rozpad škod: celkem / podle rizika / podle vozidla / podle řidiče
    const claimTotal = parkClaimsRaw.length
    const claimCost = parkClaimsRaw.reduce((a, c) => a + (c.estimate || 0), 0)
    const claimPayout = parkClaimsRaw.reduce((a, c) => a + (c.payout || 0), 0)
    const claimOpen = parkClaimsRaw.filter((c) => !['closed', 'settled', 'rejected'].includes(c.status)).length
    const riskDef = { POV: { label: 'Povinné ručení', color: 'var(--blue)' }, HAV: { label: 'Havarijní', color: 'var(--star)' }, Skla: { label: 'Pojištění skel', color: '#0E9AA6' }, Odp: { label: 'Odpovědnost', color: 'var(--amber)' } }
    const claimsByRisk = ['HAV', 'POV', 'Skla', 'Odp'].map((k) => ({ key: k, label: riskDef[k].label, color: riskDef[k].color, count: parkClaimsRaw.filter((c) => c.risk === k).length })).filter((r) => r.count).map((r) => ({ ...r, pct: Math.round(r.count / (claimTotal || 1) * 100) }))
    const grpVeh = {}
    parkClaimsRaw.forEach((c) => { if (!grpVeh[c.vId]) grpVeh[c.vId] = { count: 0, cost: 0 }; grpVeh[c.vId].count++; grpVeh[c.vId].cost += c.estimate || 0 })
    const maxVehClaims = Math.max(1, ...Object.values(grpVeh).map((x) => x.count))
    const claimsByVehicle = Object.entries(grpVeh).map(([vid, x]) => { const cv = vehiclesData.find((z) => z.id === vid) || {}; return { vid, plate: cv.plate || '—', name: `${cv.brand || ''} ${cv.model || ''}`.trim() || '—', count: x.count, costF: czk(x.cost), pct: Math.round(x.count / maxVehClaims * 100), onClick: () => openVehicle(vid) } }).sort((a, b) => b.count - a.count).slice(0, 6)
    const grpDrv = {}
    parkClaimsRaw.forEach((c) => { const cv = vehiclesData.find((z) => z.id === c.vId); const drv = (cv && cv.driver && cv.driver !== '—') ? cv.driver : 'Nepřiřazený řidič'; if (!grpDrv[drv]) grpDrv[drv] = { count: 0, cost: 0 }; grpDrv[drv].count++; grpDrv[drv].cost += c.estimate || 0 })
    const maxDrvClaims = Math.max(1, ...Object.values(grpDrv).map((x) => x.count))
    const claimsByDriver = Object.entries(grpDrv).map(([driver, x]) => ({ driver, count: x.count, costF: czk(x.cost), pct: Math.round(x.count / maxDrvClaims * 100) })).sort((a, b) => b.count - a.count).slice(0, 6)

    // Modelované provozní náklady parku (odhad — bez pojistného)
    const parkCostTotal = fveh.reduce((a, v) => a + vehicleAnnualCostModel(v), 0)
    const parkCostPerVehicle = cnt ? Math.round(parkCostTotal / cnt) : 0
    const parkCostSplit = PARK_COST_SPLIT.map((c) => ({ label: c.label, color: c.color, amountF: czk(Math.round(parkCostTotal * c.share)), pct: Math.round(c.share * 100) }))
    const otherMap = {
      insurance: ['Pojištění parku', 'Souhrn všech smluv a krytí v tomto parku — přejděte do modulu Pojištění pro detailní práci se smlouvami.', ic('shield', 24)],
      claims: ['Události parku', 'Všech ' + f.claims + ' událostí parku najdete v modulu Pojistné události s filtrem na tento park.', ic('alert', 24)],
      documents: ['Dokumenty parku', 'Smlouvy, zelené karty a faktury vázané na tento park.', ic('file', 24)],
      analytics: ['Analytika parku', 'Detailní TCO, frekvence škod a meziroční srovnání.', ic('chart', 24)],
      timeline: ['Timeline parku', 'Chronologie všech klíčových událostí parku.', ic('clock', 24)],
    }
    const o = otherMap[tab] || ['', '', null]
    return {
      fd: {
        name: f.name, address: f.address || '', singlePark: allFleets.length === 1, manager: f.manager, policy: f.policy || '—', policyStart: f.policyStart || '—', stats,
        typeBreakdown, coverBreakdown, finBreakdown, financedCount, premiumYear: '—',
        parkCostTotalF: czk(parkCostTotal), parkCostPerVehicleF: czk(parkCostPerVehicle), parkCostSplit,
        claimTotal, claimCostF: czk(claimCost), claimPayoutF: czk(claimPayout), claimOpen, claimsByRisk, claimsByVehicle, claimsByDriver,
        expiringStk, expiringVig, stkExpCount: stkAll.length, vigExpCount: vigAll.length,
        line: lp.line, area: lp.area, donut, insurerLegend, fuel, evPct, evDonut, claimBars, claims: f.claims,
        vehicles: fleetVehicles, vehicleCount: fleetVehicles.length, goVehiclesTab: () => setState({ fleetTab: 'vehicles' }),
        endedVehicles: fleetEnded, endedCount: fleetEnded.length,
        insurersExport: { filename: `pojistitele-${f.id}`, title: `Pojistitelé – ${f.name}`, columns: [{ key: 'pojistitel', label: 'Pojistitel' }, { key: 'smlouva', label: 'Číslo pojistné smlouvy' }, { key: 'vozidla', label: 'Vozidla' }, { key: 'objem', label: 'Objem pojistného' }], rows: parkInsurers.map((p) => ({ pojistitel: p.name, smlouva: p.policy, vozidla: p.count, objem: p.premiumF })) },
        risksExport: { filename: `rizika-${f.id}`, title: `Pojištění – rizika – ${f.name}`, columns: [{ key: 'riziko', label: 'Riziko' }, { key: 'vozidla', label: 'Vozidla' }, { key: 'pokryti', label: 'Pokrytí' }, { key: 'objem', label: 'Objem pojistného' }], rows: riskRows.map((r) => ({ riziko: r.label, vozidla: r.count, pokryti: r.coverage + ' %', objem: r.premiumF })) },
        claimsExport: { filename: `skody-${f.id}`, title: `Škody – ${f.name}`, columns: CLAIM_EXPORT_COLS, rows: fleetClaims.map(claimExportRow) },
        export: {
          filename: `vozidla-${f.name.replace(/[^a-zA-Z0-9]+/g, '-').toLowerCase()}`,
          title: `Vozidla – ${f.name}`,
          columns: [{ key: 'plate', label: 'SPZ' }, { key: 'znacka', label: 'Značka' }, { key: 'model', label: 'Model' }, { key: 'driver', label: 'Řidič' }, { key: 'year', label: 'Rok' }, { key: 'fuel', label: 'Palivo' }, { key: 'vin', label: 'VIN' }, { key: 'insurer', label: 'Pojišťovna' }, { key: 'premium', label: 'Roční pojistné' }, { key: 'stav', label: 'Stav' }],
          rows: fleetVehicles.map((v) => ({ plate: v.plate, znacka: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel, vin: v.vin, insurer: v.insurer, premium: v.premiumF, stav: v.statusLabel })),
        },
        parkInsurers, insurersTotalF, insurersCount: parkInsurers.length,
        riskRows, riskTotalF, riskCount: riskRows.length, activeCount: pv.length,
        parkClaims: fleetClaims,
        isOverview: tab === 'overview', isVehicles: tab === 'vehicles', isInsurers: tab === 'insurers', isInsurance: tab === 'insurance', isClaims: tab === 'claims', isOther: !['overview', 'vehicles', 'insurers', 'insurance', 'claims'].includes(tab),
        otherTitle: o[0], otherDesc: o[1], otherIcon: o[2],
      },
      fleetTabs,
    }
  }

  const vehiclesVM = () => {
    if (state.route !== 'vehicles') return {}
    const vf = state.vf
    const opt = (all, arr) => [{ v: 'all', l: all }, ...arr.map((x) => ({ v: x, l: x }))]
    const vFilters = [
      // Park (lokalita) — filtr jen když má firma víc parků; jinak je nadbytečný.
      ...(allFleets.length > 1 ? [{ value: vf.fleet, onChange: (e) => setVf('fleet', e.target.value), options: [{ v: 'all', l: 'Všechny parky' }, ...allFleets.map((f) => ({ v: f.id, l: f.name }))] }] : []),
      { value: vf.type, onChange: (e) => setVf('type', e.target.value), options: [{ v: 'all', l: 'Všechny typy' }, ...typeCats.map((c) => ({ v: c.name, l: c.name }))] },
      { value: vf.brand, onChange: (e) => setVf('brand', e.target.value), options: opt('Všechny značky', [...new Set(vehiclesData.map((v) => v.brand))]) },
      { value: vf.fuel, onChange: (e) => setVf('fuel', e.target.value), options: opt('Palivo', [...new Set(vehiclesData.map((v) => v.fuel))]) },
      { value: vf.insurer, onChange: (e) => setVf('insurer', e.target.value), options: opt('Pojišťovna', [...new Set(vehiclesData.map((v) => v.insurer))]) },
      { value: vf.status, onChange: (e) => setVf('status', e.target.value), options: [{ v: 'all', l: 'Stav' }, { v: 'active', l: 'Aktivní' }, { v: 'soon', l: 'Brzy obnova' }, { v: 'overdue', l: 'Po splatnosti' }, { v: 'nocasco', l: 'Bez havarijního' }] },
    ]
    const q = vf.q.toLowerCase()
    const matchBase = (v) => {
      if (vf.fleet !== 'all' && v.fleet !== vf.fleet) return false
      if (vf.type !== 'all' && vehicleTypeCat(v.druh) !== vf.type) return false
      if (vf.brand !== 'all' && v.brand !== vf.brand) return false
      if (vf.fuel !== 'all' && v.fuel !== vf.fuel) return false
      if (vf.insurer !== 'all' && v.insurer !== vf.insurer) return false
      if (q && !`${v.plate} ${v.brand} ${v.model} ${v.driver}`.toLowerCase().includes(q)) return false
      return true
    }
    const rows = vehiclesData.filter((v) => v.status !== 'ended' && matchBase(v) && (vf.status === 'all' || v.status === vf.status))
    // autobusy první (jádro flotily), pak ostatní; uvnitř dle pořadí
    const _vp = (v) => vehicleTypeCat(v.druh) === 'Autobusy' ? 0 : vehicleTypeCat(v.druh) === 'Nákladní vozidla' ? 1 : vehicleTypeCat(v.druh) === 'Osobní vozidla' ? 2 : 3
    rows.sort((a, b) => _vp(a) - _vp(b) || (parseInt(a.id.slice(1)) - parseInt(b.id.slice(1))))
    const endedRows = vehiclesData.filter((v) => v.status === 'ended' && matchBase(v)).map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel,
      fleetName: fleetName(v.fleet), typeName: vehicleTypeCat(v.druh), insurer: v.insurer, premiumF: czk(v.premium), endedDate: v.endedDate, endReason: v.endReason,
      statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status), onClick: () => openVehicle(v.id),
    }))
    const sel = state.selected
    const open = state.rowMenu
    const vehicleRows = rows.map((v) => {
      const on = !!sel[v.id]
      const mo = open === v.id
      return {
        id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel,
        vin: v.vin, prihlaska: v.prihlaska,
        fleetName: fleetName(v.fleet), typeName: vehicleTypeCat(v.druh), insurer: v.insurer, premiumF: czk(v.premium), renewal: v.renewal,
        povLimit: v.povLimit || '—', hasHav: !!(v.cov && v.cov.hav), hasSkla: !!(v.cov && v.cov.skla),
        finShort: v.financing && v.financing.active ? ({ bank_loan: 'Úvěr', finance_lease: 'Fin. leasing', operating_lease: 'Op. leasing' }[v.financing.type] || 'Ano') : null,
        statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status),
        onClick: () => openVehicle(v.id),
        toggle: (e) => { e.stopPropagation(); toggleSel(v.id) },
        checkStyle: `width:18px;height:18px;border-radius:5px;border:1.5px solid ${on ? 'var(--blue)' : '#CFCFD4'};background:${on ? 'var(--blue)' : '#fff'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#fff`,
        checkIcon: on ? ic('check', 12, 2.5) : null,
        menuOpen: mo, stop: (e) => e.stopPropagation(),
        rowStyle: `position:relative;z-index:${mo ? 30 : 'auto'};background:${mo ? '#F2F6FC' : 'transparent'};display:flex;align-items:center;gap:14px;padding:16px 22px;border-bottom:1px solid var(--border)`,
        kebabStyle: `width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${mo ? 'var(--blue)' : 'var(--ink3)'};background:${mo ? 'var(--blue-soft)' : 'transparent'};border:1px solid ${mo ? 'var(--blue-soft)' : 'transparent'}`,
        toggleMenu: (e) => { e.stopPropagation(); setState((s) => ({ rowMenu: s.rowMenu === v.id ? null : v.id })) },
        changeCover: (e) => { e.stopPropagation(); setState({ rowMenu: null }); openVehicle(v.id); setState({ vehicleTab: 'insurance' }) },
        reportClaim: (e) => { e.stopPropagation(); setState({ rowMenu: null, claimWizard: true, claimStep: 1, claimData: { vehicleId: v.id } }) },
        unsubscribe: (e) => { e.stopPropagation(); openUnsub(v) },
      }
    })
    const exportCols = [
      { key: 'plate', label: 'SPZ' }, { key: 'znacka', label: 'Značka' }, { key: 'model', label: 'Model' }, { key: 'driver', label: 'Řidič' },
      { key: 'year', label: 'Rok' }, { key: 'fuel', label: 'Palivo' }, { key: 'vin', label: 'VIN' }, { key: 'prihlaska', label: 'Číslo přihlášky' },
      { key: 'park', label: 'Park' }, { key: 'insurer', label: 'Pojišťovna' }, { key: 'premium', label: 'Roční pojistné' }, { key: 'renewal', label: 'Obnova' }, { key: 'stav', label: 'Stav' },
    ]
    const exportSrc = Object.keys(sel).length ? vehicleRows.filter((v) => sel[v.id]) : vehicleRows
    const exportRows = exportSrc.map((v) => ({ plate: v.plate, znacka: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel, vin: v.vin, prihlaska: v.prihlaska, park: v.fleetName, insurer: v.insurer, premium: v.premiumF, renewal: v.renewal, stav: v.statusLabel }))

    return { vFilters, vfQuery: vf.q, onVfQuery: (e) => setVf('q', e.target.value), vehicleRows, endedRows, endedCount: endedRows.length, vSelCount: Object.keys(sel).length, clearSel: () => setState({ selected: {} }), vehiclesExport: { filename: 'vozidla', title: 'Vozidla', columns: exportCols, rows: exportRows } }
  }

  const vehicleDetailVM = () => {
    if (state.route !== 'vehicle-detail') return {}
    const v0 = vehiclesData.find((x) => x.id === state.vehicleId)
    const v = { ...v0, ...(state.vehOverrides[v0.id] || {}) }
    const tab = state.vehicleTab
    const m = statusMeta[v.status]
    const facts = [
      { k: 'Druh vozidla', v: v.druh }, { k: 'Rok uvedení', v: String(v.year) }, { k: 'Palivo', v: v.fuel },
      { k: 'Výkon', v: v.power }, { k: 'Objem', v: v.engine },
    ]
    const actions = [
      { label: 'Změnit park', icon: ic('transfer', 20), color: 'var(--blue)', onClick: () => openParkModal(v) },
      { label: 'Přiřadit řidiče', icon: ic('user1', 20), color: 'var(--blue)', onClick: () => openDriverModal(v) },
      { label: 'Odebrat', icon: ic('trash', 20), color: 'var(--star)', onClick: () => openUnsub(v) },
    ]
    const specs = [
      { k: 'Tovární značka', v: v.brand }, { k: 'Model / typ', v: v.model }, { k: 'VIN', v: v.vin }, { k: 'Číslo TP/ORV', v: v.tp },
      { k: 'Druh vozidla', v: v.druh }, { k: 'Datum uvedení do provozu', v: v.firstReg }, { k: 'Výkon motoru', v: v.power }, { k: 'Objem válců', v: v.engine },
      { k: 'Hmotnost vozidla', v: v.weight }, { k: 'Počet sedadel', v: v.seats }, { k: 'Palivo', v: v.fuel }, { k: 'Číslo v pojistné smlouvě', v: v.prihlaska },
    ]
    const assign = [
      { k: 'Vozový park', v: fleetName(v.fleet), icon: ic('fleets', 18), bg: 'var(--blue-soft)', color: 'var(--blue)' },
      { k: 'Vlastník / držitel', v: 'ČSAD AUTOBUSY České Budějovice a.s.', icon: ic('users', 18), bg: 'var(--green-soft)', color: 'var(--green)' },
      { k: 'Limit povinného ručení', v: v.povLimit, icon: ic('shield', 18), bg: 'var(--amber-soft)', color: 'var(--amber)' },
      { k: 'Územní platnost pojištění', v: v.territory || 'Evropská unie', icon: ic('fleets', 18), bg: 'var(--purple-soft)', color: 'var(--purple)' },
      { k: 'Datum uvedení do provozu', v: v.firstReg, icon: ic('calendar', 18), bg: '#EEF2F9', color: 'var(--ink2)' },
    ]
    // STK + dálniční známka s platností (STK z registru, známka z eDalnice.cz)
    const compStatus = (due) => !due ? null
      : due.expired ? { label: `po platnosti · ${-due.days} dnů`, color: 'var(--star)', bg: 'var(--star-soft)' }
      : due.soon ? { label: `končí za ${due.days} ${due.days === 1 ? 'den' : due.days < 5 ? 'dny' : 'dní'}`, color: '#B45309', bg: 'var(--amber-soft)' }
      : { label: 'platná', color: 'var(--green)', bg: 'var(--green-soft)' }
    const stkD = vehicleStk(v); const stkDue = dueInfo(stkD)
    const vig = vehicleVignette(v); const vigDue = vig ? dueInfo(vig.validTo) : null
    const compliance = [
      { k: 'STK / technická prohlídka', v: `platná do ${stkD}`, sub: 'z registru vozidel', icon: ic('check2', 18), status: compStatus(stkDue) },
      { k: 'Měření emisí', v: `vyhovuje · do ${stkD}`, sub: 'v rámci STK', icon: ic('refresh', 18), status: compStatus(stkDue) },
      vig
        ? { k: 'Dálniční známka', v: `${vig.country} · ${vig.type}, do ${vig.validTo}`, sub: 'eDalnice.cz', icon: ic('doc2', 18), status: compStatus(vigDue) }
        : { k: 'Dálniční známka', v: 'nevyžaduje (nad 3,5 t — mýto)', sub: 'eDalnice.cz', icon: ic('doc2', 18), status: null },
    ]
    const pchip = (s) => statusChip(s)
    const cov = v.cov || { pov: true }
    const covDefs = [
      { key: 'pov', always: true, name: 'Povinné ručení', icon: ic('shield', 20), bg: 'var(--blue-soft)', color: 'var(--blue)', coverage: v.povLimit, deductible: '—' },
      { key: 'hav', name: 'Havarijní pojištění', icon: ic('car', 20), bg: 'var(--star-soft)', color: 'var(--star)', coverage: 'All-risk', deductible: '5 % / min. 5 000 Kč' },
      { key: 'skla', name: 'Pojištění skel', icon: ic('glass', 20), bg: 'var(--blue-soft)', color: 'var(--blue)', coverage: 'doplňkové krytí', deductible: '—' },
      { key: 'asist', name: 'Asistenční služby', icon: ic('wrench', 20), bg: 'var(--amber-soft)', color: 'var(--amber)', coverage: 'ČR + Evropa', deductible: '—' },
      { key: 'zavaz', name: 'Pojištění zavazadel', icon: ic('archive', 20), bg: 'var(--green-soft)', color: 'var(--green)', coverage: 'doplňkové krytí', deductible: '—' },
    ]
    const products = covDefs.filter((c) => c.always || cov[c.key]).map((c) => ({
      name: c.name, icon: c.icon, bg: c.bg, color: c.color, insurer: '—', policy: '—',
      premiumF: '—', coverage: c.coverage, renewal: '—', deductible: c.deductible,
      status: 'active', statusLabel: 'Sjednáno', chipStyle: pchip('active'),
    }))
    const productsTotal = 0
    const productsExport = {
      filename: `pojisteni-${v.plate.replace(/\s/g, '')}`, title: `Pojištění – ${v.plate} ${v.brand} ${v.model}`,
      columns: [{ key: 'riziko', label: 'Riziko' }, { key: 'pojistovna', label: 'Pojišťovna' }, { key: 'smlouva', label: 'Číslo smlouvy' }, { key: 'limit', label: 'Limit / pojistná částka' }, { key: 'spoluucast', label: 'Spoluúčast' }, { key: 'obnova', label: 'Obnova' }, { key: 'pojistne', label: 'Roční pojistné' }, { key: 'stav', label: 'Stav' }],
      rows: products.map((p) => ({ riziko: p.name, pojistovna: p.insurer, smlouva: p.policy, limit: p.coverage, spoluucast: p.deductible, obnova: p.renewal, pojistne: p.premiumF, stav: p.statusLabel })),
    }
    const claims = claimsData.filter((c) => c.vId === v.id).map((c) => {
      const cm = claimStatusMeta[c.status]
      return { ...c, statusLabel: cm.label, chipStyle: `display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:${cm.c};background:${cm.bg};padding:3px 9px;border-radius:20px`, dot: cm.c, estimateF: czk(c.estimate), progressW: c.progress + '%' }
    })
    const timeline = [
      { date: v.renewal, title: 'Obnova povinného ručení', desc: v.insurer + ' · automatické prodloužení', icon: ic('refresh', 16), bg: 'var(--amber-soft)', color: 'var(--amber)' },
      { date: '12. 3. 2026', title: 'Pravidelný servis', desc: 'Výměna oleje a filtrů · ' + v.mileage, icon: ic('wrench', 16), bg: '#F1F1F3', color: 'var(--ink2)' },
      { date: '5. 2. 2026', title: 'STK + emise', desc: 'Platná do 5. 2. 2028', icon: ic('check2', 16), bg: 'var(--green-soft)', color: 'var(--green)' },
      { date: '18. 11. 2025', title: 'Změna řidiče', desc: 'Nový řidič ' + v.driver, icon: ic('user1', 16), bg: 'var(--blue-soft)', color: 'var(--blue)' },
      { date: '3. 4. ' + v.year, title: 'Vozidlo přidáno', desc: 'Zařazeno do parku ' + fleetName(v.fleet), icon: ic('plus', 16), bg: 'var(--blue-soft)', color: 'var(--blue)' },
    ]
    const plateNo = v.plate.replace(/\s/g, '')
    const prev = ic('search', 16), dl = ic('arrow', 16)
    const open = (payload) => () => setState({ docPreview: payload })
    const vehicleDocs = [
      { name: `Pojistná smlouva ${plateNo}.pdf`, type: 'Smlouva', meta: `${v.insurer} · PR-${plateNo}`, size: '214 kB', icon: ic('shield', 17), bg: 'var(--star-soft)', color: 'var(--star)', preview: prev, download: dl, openPreview: open({ name: `Pojistná smlouva ${plateNo}.pdf`, type: 'Smlouva', size: '214 kB', insurer: v.insurer, policy: 'PR-' + plateNo, fleetName: fleetName(v.fleet), date: v.renewal }) },
      ...(greenCards[v.id] ? [(() => { const zkUrl = `/fleet-portal/zk/zk-tosovsky-2026.pdf#page=${greenCards[v.id]}`; const openZk = () => window.open(zkUrl, '_blank'); return { name: `Zelená karta ${plateNo}.pdf`, type: 'Zelená karta', meta: 'Generali Česká pojišťovna · platná do 30. 6. 2027', size: 'PDF', icon: ic('doc2', 17), bg: 'var(--green-soft)', color: 'var(--green)', preview: prev, download: dl, openPreview: openZk, openDownload: openZk } })()] : []),
      { name: `Technický průkaz ${plateNo}.pdf`, type: 'Osvědčení o registraci vozidla', meta: 'ORV část I · velký TP', size: '118 kB', icon: ic('car', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', preview: prev, download: dl, openPreview: open({ kind: 'orv', name: `Technický průkaz ${plateNo}.pdf`, type: 'Osvědčení o registraci vozidla', size: '118 kB', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, year: v.year, fuel: v.fuel }) },
      { name: `STK a emise ${plateNo}.pdf`, type: 'Protokol STK', meta: 'platná do 5. 2. 2028', size: '88 kB', icon: ic('check2', 17), bg: 'var(--green-soft)', color: 'var(--green)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `STK a emise ${plateNo}.pdf`, type: 'Protokol STK', size: '88 kB', title: 'Protokol o technické prohlídce a měření emisí', issuer: 'Stanice technické kontroly', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--green)', rows: [['Evidenční číslo', 'STK-' + plateNo], ['Datum prohlídky', '5. 2. 2026'], ['Platnost do', '5. 2. 2028'], ['Výsledek', 'Způsobilé k provozu'], ['Stav tachometru', v.mileage], ['Měření emisí', 'Vyhovuje']] }) },
      { name: `Dálniční známka ${plateNo}.pdf`, type: 'Dálniční známka', meta: 'roční · ČR · 2026', size: '42 kB', icon: ic('calendar', 17), bg: 'var(--amber-soft)', color: 'var(--amber)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Dálniční známka ${plateNo}.pdf`, type: 'Dálniční známka', size: '42 kB', title: 'Elektronická dálniční známka (e-známka)', issuer: 'Státní fond dopravní infrastruktury', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--amber)', rows: [['Typ kupónu', 'Roční (12 měsíců)'], ['Platnost od', '1. 1. 2026'], ['Platnost do', '31. 1. 2027'], ['Země platnosti', 'Česká republika'], ['Cena', '2 440 Kč'], ['Stav', 'Aktivní']] }) },
      { name: `Servisní kniha ${plateNo}.pdf`, type: 'Servisní historie', meta: 'poslední servis 12. 3. 2026', size: '156 kB', icon: ic('wrench', 17), bg: '#F1F1F3', color: 'var(--ink2)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Servisní kniha ${plateNo}.pdf`, type: 'Servisní historie', size: '156 kB', title: 'Servisní kniha vozidla', issuer: 'ČSAD AUTOBUSY České Budějovice a.s. — autorizovaný servis', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--ink2)', rows: [['Poslední servis', '12. 3. 2026'], ['Stav tachometru', v.mileage], ['Provedené úkony', 'Výměna oleje a filtrů'], ['Příští servis', 'za 15 000 km'], ['Záruka', 'do ' + (v.year + 5)], ['Servisní partner', 'ČSAD AUTOBUSY České Budějovice a.s.']] }) },
      { name: `Leasingová smlouva ${plateNo}.pdf`, type: 'Financování', meta: 'operativní leasing', size: '198 kB', icon: ic('banknote', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Leasingová smlouva ${plateNo}.pdf`, type: 'Financování', size: '198 kB', title: 'Smlouva o operativním leasingu', issuer: 'ČSOB Leasing, a.s.', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--blue)', rows: [['Číslo smlouvy', 'LE-' + plateNo], ['Typ financování', 'Operativní leasing'], ['Měsíční splátka', '12 900 Kč'], ['Doba trvání', '48 měsíců'], ['Konec leasingu', '31. 3. 2028'], ['Účetní hodnota', v.value]] }) },
    ]
    const mgr = fleetsData.find((f) => f.id === v.fleet).manager
    const mgrInit = mgr.replace(/\b\wng?\.\s*/gi, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    const seedNotes = [
      { text: `Vozidlo předáno řidiči ${v.driver} — plná nádrž, 2 ks klíčů, čistý interiér, bez závad.`, author: mgr, initials: mgrInit || 'FM', date: '18. 11. 2025', time: '09:24' },
      { text: 'Při přebírce zaevidován drobný odřený zadní nárazník — bez nároku na pojistné plnění.', author: 'Martin Kovář', initials: 'MK', date: '3. 4. ' + v.year, time: '14:10' },
    ]
    const notes = [...(state.vehNotes[v.id] || []), ...seedNotes]
    const tabsDef = [['overview', 'Přehled'], ['insurance', 'Pojištění'], ['claims', 'Škody'], ['service', 'Servis'], ['tires', 'Pneumatiky'], ['fines', 'Pokuty'], ['costs', 'Náklady'], ['usage', 'Užívání'], ['documents', 'Dokumenty'], ['equipment', 'Nadstandardní výbava'], ['timeline', 'Timeline'], ['notes', 'Poznámky']]
    const usageRaw = SEED_USAGE[v.id] || [{ id: 'us-cur', driver: v.driver, role: '—', from: v.firstReg, to: '', kmStart: 0, kmEnd: 0, status: 'active', handover: 'Aktuální přiřazení vozidla.' }]
    const curKm = moneyNum(v.mileage)
    const usageList = usageRaw.map((u) => {
      const endKm = u.status === 'active' ? curKm : u.kmEnd
      const driven = endKm && u.kmStart ? endKm - u.kmStart : 0
      return { ...u, kmStartF: u.kmStart ? fmtKm(u.kmStart) : '—', kmEndF: u.status === 'active' ? (curKm > 0 ? fmtKm(curKm) : 'dosud') : (u.kmEnd ? fmtKm(u.kmEnd) : '—'), drivenF: driven > 0 ? fmtKm(driven) : '—', period: u.to ? `${u.from} – ${u.to}` : `${u.from} – dosud`, active: u.status === 'active' }
    })
    const equipNum = (s) => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0
    const equipList = (state.vehEquip[v.id] || []).map((it) => ({ ...it, onRemove: () => removeEquip(v.id, it.id), onClaim: () => claimEquip(it) }))
    const equipTotal = equipList.reduce((a, it) => a + equipNum(it.price), 0)
    // ---- Provoz & náklady: servis, pneu, pokuty, agregace nákladů, cashflow predikce ----
    const svcRaw = state.vehService[v.id] || []
    const tireRaw = state.vehTires[v.id] || []
    const fineRaw = state.vehFines[v.id] || []
    const extraRaw = state.vehCostsExtra[v.id] || []
    const serviceList = svcRaw.map((x) => ({ ...x, kmF: fmtKm(x.km), priceF: czk(moneyNum(x.price)), nextKmF: x.nextKm ? fmtKm(x.nextKm) : '', meta: SERVICE_META[x.type] || SERVICE_META['Ostatní'], onRemove: () => removeService(v.id, x.id) }))
    const upcomingSvc = svcRaw.find((x) => x.nextDate)
    const tireList = tireRaw.map((x) => ({ ...x, kmF: fmtKm(x.km), priceF: czk(moneyNum(x.price)), treadF: x.tread ? String(x.tread).replace('.', ',') + ' mm' : '—', meta: TIRE_META[x.action] || TIRE_META['Uskladnění'], onRemove: () => removeTire(v.id, x.id) }))
    const upcomingTire = tireRaw.find((x) => x.nextDate)
    const fineList = fineRaw.map((x) => ({ ...x, amountF: czk(moneyNum(x.amount)), meta: FINE_META[x.type] || FINE_META['Jiný přestupek'], onToggle: () => toggleFinePaid(v.id, x.id), onRemove: () => removeFine(v.id, x.id) }))
    const finesUnpaid = fineRaw.filter((x) => !x.paid)
    const finesUnpaidSum = finesUnpaid.reduce((a, x) => a + moneyNum(x.amount), 0)
    const finesTotalSum = fineRaw.reduce((a, x) => a + moneyNum(x.amount), 0)
    const finesPoints = fineRaw.reduce((a, x) => a + (x.points || 0), 0)
    // Sjednocené nákladové položky (číselně)
    const costEntries = [
      ...svcRaw.map((x) => ({ cat: 'servis', label: x.type + (x.desc ? ' · ' + x.desc : ''), date: x.date, amount: moneyNum(x.price), invoice: x.invoice })),
      ...tireRaw.map((x) => ({ cat: 'pneu', label: x.action + (x.set ? ' · ' + x.set : ''), date: x.date, amount: moneyNum(x.price), invoice: x.invoice })),
      ...fineRaw.map((x) => ({ cat: 'pokuty', label: x.type + ' · ' + x.driver, date: x.date, amount: moneyNum(x.amount), invoice: '' })),
      ...extraRaw.map((x) => ({ cat: x.cat, label: x.label, date: x.date, amount: moneyNum(x.amount), invoice: x.invoice })),
    ].filter((e) => e.amount > 0)
    const fin = v.financing
    const monthlyLease = fin && fin.active ? moneyNum(fin.monthlyPayment) : 0
    const annualPrem = moneyNum(v.premium)
    // Modelový odhad provozních nákladů z TCO enginu — použije se, když nejsou
    // evidované reálné položky (servis/pneu/pokuty/faktury). Po napojení
    // účetnictví/telematiky ho nahradí reálná data.
    const costModel = vehicleAnnualCost(v)
    const costModeled = costEntries.filter((e) => e.cat !== 'pojisteni').length < 2
    const catTotals = {}
    if (costModeled) {
      ;['phm', 'servis', 'pneu', 'dalnice', 'pokuty'].forEach((k) => { if (costModel[k]) catTotals[k] = costModel[k] })
    } else {
      costEntries.forEach((e) => { catTotals[e.cat] = (catTotals[e.cat] || 0) + e.amount })
    }
    // reálné pojistné (z kmene) a leasing přičteme vždy, když je známe
    if (monthlyLease) catTotals.leasing = (catTotals.leasing || 0) + monthlyLease * 12
    if (annualPrem) catTotals.pojisteni = (catTotals.pojisteni || 0) + annualPrem
    const yearTotal = Object.values(catTotals).reduce((a, b) => a + b, 0)
    const catBreak = COST_CATS.filter((c) => catTotals[c.key]).map((c) => ({ key: c.key, label: c.label, color: c.color, amount: catTotals[c.key], amountF: czk(catTotals[c.key]), pct: Math.round((catTotals[c.key] / (yearTotal || 1)) * 100) })).sort((a, b) => b.amount - a.amount)
    const catMax = Math.max(1, ...catBreak.map((c) => c.amount))
    catBreak.forEach((c) => { c.bar = Math.round((c.amount / catMax) * 100) })
    const monthlyAvg = Math.round(yearTotal / 12)
    // Cashflow predikce — plánované náklady na příštích ~12 měsíců
    const forecast = []
    if (upcomingSvc) forecast.push({ label: 'Pravidelný servis', sub: upcomingSvc.shop || 'autorizovaný servis', date: upcomingSvc.nextDate, amount: Math.round(moneyNum(upcomingSvc.price)) || 8000, color: 'var(--purple)', bg: 'var(--purple-soft)', icon: 'wrench' })
    if (upcomingTire) forecast.push({ label: 'Sezónní přezutí', sub: 'výměna pneu + uskladnění', date: upcomingTire.nextDate, amount: 650, color: '#0E9AA6', bg: '#E3F4F5', icon: 'swap' })
    if (monthlyLease) forecast.push({ label: 'Leasing / splátky (12×)', sub: czk(monthlyLease) + ' měsíčně', date: 'měsíčně', amount: monthlyLease * 12, color: 'var(--green)', bg: 'var(--green-soft)', icon: 'banknote', recurring: true })
    const dz = extraRaw.find((x) => x.cat === 'dalnice')
    if (dz) forecast.push({ label: 'Obnova dálniční známky', sub: 'roční kupón ČR', date: 'leden 2027', amount: moneyNum(dz.amount), color: '#6D8BFF', bg: 'var(--blue-soft)', icon: 'calendar' })
    // Modelová predikce, když nejsou evidované reálné položky
    if (costModeled && forecast.length === 0) {
      if (costModel.servis) forecast.push({ label: 'Pravidelný servis (odhad)', sub: 'dle najetých km a stáří', date: 'za ~6 měsíců', amount: Math.round(costModel.servis / 2), color: 'var(--purple)', bg: 'var(--purple-soft)', icon: 'wrench' })
      if (costModel.pneu) forecast.push({ label: 'Sezónní přezutí (odhad)', sub: 'výměna pneu + uskladnění', date: 'podzim / jaro', amount: Math.round(costModel.pneu / 2), color: '#0E9AA6', bg: '#E3F4F5', icon: 'swap' })
      if (costModel.dalnice) forecast.push({ label: 'Mýto a dálniční známky', sub: 'roční', date: 'leden 2027', amount: costModel.dalnice, color: '#6D8BFF', bg: 'var(--blue-soft)', icon: 'calendar' })
    }
    forecast.forEach((f) => { f.amountF = czk(f.amount) })
    const forecast12 = forecast.reduce((a, f) => a + f.amount, 0)
    // Nákladová kniha (ledger)
    const ledger = costEntries.map((e) => ({ ...e, amountF: czk(e.amount), catLabel: COST_CAT_LABEL[e.cat] || 'Ostatní', catColor: COST_CAT_COLOR[e.cat] || 'var(--ink3)', onRemove: e.cat !== 'servis' && e.cat !== 'pneu' && e.cat !== 'pokuty' ? null : null }))
    if (monthlyLease) ledger.push({ cat: 'leasing', label: (fin.typeLabel || 'Leasing') + ' — měsíční splátka', date: 'měsíčně', amount: monthlyLease, amountF: czk(monthlyLease) + ' / měs.', catLabel: 'Leasing / splátky', catColor: 'var(--green)', recurring: true, invoice: '' })
    const ledgerKey = (e) => (e.recurring ? Infinity : (parseCzDate(e.date) ? parseCzDate(e.date).getTime() : 0))
    ledger.sort((a, b) => ledgerKey(b) - ledgerKey(a))
    const costStats = [
      { label: 'Náklady (12 měsíců)', value: czk(yearTotal), sub: 'celkem na vozidlo', color: 'var(--ink)' },
      { label: 'Měsíční průměr', value: czk(monthlyAvg), sub: 'Ø / měsíc', color: 'var(--ink)' },
      { label: 'Predikce (12 měs.)', value: czk(forecast12), sub: 'plánované náklady', color: 'var(--purple)' },
      { label: 'Záznamů nákladů', value: String(costEntries.length), sub: 'evidováno', color: 'var(--ink)' },
    ]
    const vehicleTabs = tabsDef.map(([id, label]) => { const on = tab === id; return { label, onClick: () => setState({ vehicleTab: id }), style: `padding:10px 14px;font-size:13.5px;font-weight:600;cursor:pointer;color:${on ? 'var(--blue-ink)' : 'var(--ink3)'};border-bottom:2px solid ${on ? 'var(--blue)' : 'transparent'};margin-bottom:-1px` } })
    const otherMap = {
      documents: ['Dokumenty vozidla', 'Velký a malý technický průkaz, zelená karta, smlouvy a faktury k tomuto vozidlu.', ic('file', 24)],
      costs: ['Náklady & TCO', 'Celkové náklady vlastnictví: pojistné, servis, palivo a amortizace v čase.', ic('chart', 24)],
    }
    const o = otherMap[tab] || ['', '', null]
    return {
      vehicleTabs,
      vd: {
        brand: v.brand, model: v.model, plate: v.plate, driver: v.driver, fleetName: fleetName(v.fleet),
        financing: v.financing || { active: false, type: 'own', typeLabel: 'Vlastní zdroje (hotovost)' }, onRfq: () => openRfq(v),
        statusLabel: m.label, chipStyle: statusChip(v.status), facts, actions, specs, assign, compliance, products, productsExport, productsTotalF: czk(productsTotal), claims, timeline, vehicleDocs, notes, openNoteModal: () => openNoteModal(v),
        premiumF: czk(v.premium), productCount: products.filter((p) => p.status !== 'nocasco').length, renewal: v.renewal,
        isOverview: tab === 'overview', isInsurance: tab === 'insurance', isClaims: tab === 'claims', isTimeline: tab === 'timeline',
        isNotes: tab === 'notes',
        isCosts: tab === 'costs', openCostModal: () => openCostModal(v), costStats, catBreak, forecast, forecast12F: czk(forecast12), yearTotalF: czk(yearTotal), monthlyAvgF: czk(monthlyAvg), ledger, costCount: costEntries.length, costModeled,
        isService: tab === 'service', serviceList, serviceCount: svcRaw.length, onAddService: () => openServiceModal(v),
        upcomingSvc: upcomingSvc ? { date: upcomingSvc.nextDate, km: upcomingSvc.nextKm ? fmtKm(upcomingSvc.nextKm) : '' } : null,
        isTires: tab === 'tires', tireList, tireCount: tireRaw.length, onAddTire: () => openTireModal(v),
        upcomingTire: upcomingTire ? { date: upcomingTire.nextDate, action: upcomingTire.action.includes('letní') ? 'na zimní' : 'na letní' } : null,
        isFines: tab === 'fines', fineList, fineCount: fineRaw.length, onAddFine: () => openFineModal(v),
        finesUnpaidCount: finesUnpaid.length, finesUnpaidSumF: czk(finesUnpaidSum), finesTotalSumF: czk(finesTotalSum), finesPoints,
        isUsage: tab === 'usage', usageList, usageCount: usageRaw.length, onHandover: () => openDriverModal(v),
        isVehDocs: tab === 'documents',
        isEquipment: tab === 'equipment', equipList, equipCount: equipList.length, equipTotalF: czk(equipTotal), onAddEquip: () => openEquipModal(v.id),
        isOther: false, otherTitle: o[0], otherDesc: o[1], otherIcon: o[2],
      },
    }
  }

  // Jedna flotilová pojistná smlouva = jeden vozový park (vedoucí pojistitel)
  const contractFor = (f, today) => {
    const annivDate = nextAnniv(f.policyStart || '1. 1. 2025', today)
    const days = Math.round((annivDate - today) / 86400000)
    const soon = days <= 30
    const activeCount = vehiclesData.filter((v) => v.fleet === f.id && v.status !== 'ended').length
    const lr = f.lossRatio ?? 0
    return {
      id: f.id, insurer: f.insurers[0], coInsurer: f.insurers[1] || null,
      parkName: f.name, policy: f.policy || '—',
      premium: f.premium, premiumF: czk(f.premium),
      policyStart: f.policyStart || '—', anniversary: fmtCz(annivDate), annivDays: days,
      vehicleCount: activeCount, lossRatio: lr, lrColor: lrColorFor(lr),
      soon, statusLabel: soon ? 'Výročí do 30 dnů' : 'Aktivní',
      chipStyle: soon
        ? 'display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:var(--amber);background:var(--amber-soft);padding:3px 9px;border-radius:20px;white-space:nowrap'
        : 'display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:var(--green);background:var(--green-soft);padding:3px 9px;border-radius:20px;white-space:nowrap',
    }
  }

  const insuranceVM = () => {
    if (state.route !== 'insurance') return {}
    const today = new Date(2026, 5, 19)
    const contracts = allFleets.map((f) => ({ ...contractFor(f, today), onClick: () => navigate('insurance-detail', { fleetId: f.id }) })).sort((a, b) => b.premium - a.premium)
    const totalPremium = contracts.reduce((a, b) => a + b.premium, 0)
    const soonN = contracts.filter((c) => c.annivDays <= 30).length
    const avgLr = contracts.length ? Math.round(contracts.reduce((a, b) => a + b.lossRatio, 0) / contracts.length) : 0
    const insStats = [
      { label: 'Předepsané pojistné', value: (totalPremium / 1e6).toFixed(2).replace('.', ',') + ' mil.', sub: 'Kč ročně', color: 'var(--ink)' },
      { label: 'Aktivních smluv', value: String(contracts.length), sub: 'flotilových smluv', color: 'var(--ink)' },
      { label: 'Výročí do 30 dnů', value: String(soonN), sub: 'vyžadují akci', color: soonN ? 'var(--amber)' : 'var(--ink)' },
      { label: 'Ø škodní průběh', value: avgLr + ' %', sub: 'napříč smlouvami', color: lrColorFor(avgLr) },
    ]
    const insExport = {
      filename: 'pojistne-smlouvy', title: 'Pojistné smlouvy',
      columns: [{ key: 'pojistovna', label: 'Pojišťovna' }, { key: 'smlouva', label: 'Číslo smlouvy' }, { key: 'park', label: 'Vozový park' }, { key: 'vozidla', label: 'Vozidla' }, { key: 'pojistne', label: 'Roční pojistné' }, { key: 'vyroci', label: 'Výročí' }, { key: 'skodni', label: 'Škodní průběh' }],
      rows: contracts.map((c) => ({ pojistovna: c.insurer, smlouva: c.policy, park: c.parkName, vozidla: c.vehicleCount, pojistne: c.premiumF, vyroci: c.anniversary, skodni: c.lossRatio + ' %' })),
    }

    // ---- Krytí a mezery napříč flotilou (z cov) + modelové pojistné ----
    const total = vehiclesData.length
    const covN = (k) => vehiclesData.filter((v) => v.cov && v.cov[k]).length
    const havN = covN('hav'), sklaN = covN('skla'), asistN = covN('asist')
    const noHav = vehiclesData.filter((v) => !(v.cov && v.cov.hav))
    const busNoHav = noHav.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy')
    const coverItems = [
      { label: 'Povinné ručení', icon: 'shield', color: '#4F6FFF', value: String(total), pct: 100 },
      { label: 'Havarijní pojištění', icon: 'umbrella', color: '#22C55E', value: String(havN), pct: Math.round(havN / total * 100) },
      { label: 'Pojištění skel', icon: 'glass', color: '#6D5EF6', value: String(sklaN), pct: Math.round(sklaN / total * 100) },
      { label: 'Asistenční služby', icon: 'wrench', color: '#F59E0B', value: String(asistN), pct: Math.round(asistN / total * 100) },
    ]
    // REÁLNÉ roční pojistné z kmene makléře (součet Pojistné z flotilové smlouvy)
    const premReal = vehiclesData.reduce((a, v) => a + (v.premium || 0), 0)
    const insKpis = [
      { value: String(total), label: 'Pojištěných vozidel', icon: 'shield', note: 'povinné ručení 100 %' },
      { value: String(havN), label: 'S havarijním krytím', icon: 'umbrella', note: `${Math.round(havN / total * 100)} % flotily` },
      { value: String(noHav.length), label: 'Bez havarijního krytí', icon: 'alert', note: `z toho ${busNoHav.length} autobusů`, trendColor: 'var(--star)' },
      { value: (premReal / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Roční pojistné (předepsané)', icon: 'banknote', note: 'z flotilové smlouvy' },
    ]
    // mezery podle parku (% bez havarijního)
    const gapByPark = allFleets.map((f) => { const vs = vehiclesData.filter((v) => v.fleet === f.id); const gap = vs.filter((v) => !(v.cov && v.cov.hav)).length
      return { label: f.name, icon: 'fleets', color: gap / (vs.length || 1) > 0.5 ? '#EF4444' : '#F59E0B', value: `${gap} / ${vs.length}`, pct: Math.round(gap / (vs.length || 1) * 100), onClick: () => openFleet(f.id) } })
      .sort((a, b) => b.pct - a.pct)
    // konkrétní vozidla bez havarijního (priorita autobusy) + akce
    const gapList = [...busNoHav, ...noHav.filter((v) => vehicleTypeCat(v.druh) !== 'Autobusy')].slice(0, 8).map((v) => ({
      title: `${v.brand} ${v.model}`, sub: `${v.plate} · ${fleetName(v.fleet)} · r. ${v.year}`, icon: ic('car', 17),
      onClick: () => openVehicle(v.id), actionLabel: 'Připravit nabídku', action: () => showToast(`Poptávka havarijního krytí připravena · ${v.brand} ${v.model} (${v.plate})`) }))
    const insurance = {
      kpis: insKpis, coverItems, gapByPark, gapList,
      noHavCount: noHav.length, busNoHavCount: busNoHav.length,
      coverages: [
        { label: 'Povinné ručení', sub: 'limit 100/100 mil. Kč · všechna vozidla', icon: 'shield', color: '#4F6FFF', val: `${total} vozidel` },
        { label: 'Havarijní all-risk', sub: 'spoluúčast 5 % / min. 5 000 Kč', icon: 'umbrella', color: '#22C55E', val: `${havN} vozidel` },
        { label: 'Pojištění skel', sub: 'doplňkové krytí', icon: 'glass', color: '#6D5EF6', val: `${sklaN} vozidel` },
        { label: 'Asistenční služby', sub: 'ČR + Evropa, odtah a oprava', icon: 'wrench', color: '#F59E0B', val: `${asistN} vozidel` },
      ],
      goGaps: () => navigate('insurance', {}),
    }
    return { contracts, insStats, insExport, insurance }
  }

  const insuranceDetailVM = () => {
    if (state.route !== 'insurance-detail') return {}
    const today = new Date(2026, 5, 19)
    const f = allFleets.find((x) => x.id === state.fleetId) || allFleets[0]
    const c = contractFor(f, today)
    const insurer = c.insurer
    const activeV = vehiclesData.filter((v) => v.fleet === f.id && v.status !== 'ended')
    // bonifikace
    const bonus = f.bonus || DEFAULT_BONUS
    const lr = f.lossRatio ?? 0
    const activeTier = bonus.find((x) => lr <= x.threshold)
    const rebate = activeTier ? Math.round(f.premium * activeTier.rate / 100) : 0
    // škody / frekvence
    const fclaims = claimsData.filter((cc) => { const cv = vehiclesData.find((x) => x.id === cc.vId); return cv && cv.fleet === f.id })
    const paidSum = fclaims.reduce((a, b) => a + (b.payout || 0), 0)
    const freq = f.vehicles ? (f.claims / f.vehicles * 100) : 0
    const claimRows = fclaims.map(buildClaimRow)
    // facts
    const facts = [
      { k: 'Pojistník', v: POJISTNIK.name }, { k: 'IČO pojistníka', v: POJISTNIK.ico },
      { k: 'Pojistitel', v: insurer }, { k: 'Číslo smlouvy', v: c.policy },
      { k: 'Typ smlouvy', v: 'Flotilová pojistná smlouva' }, { k: 'Počátek pojištění', v: c.policyStart },
      { k: 'Výročí smlouvy', v: c.anniversary }, { k: 'Frekvence placení', v: 'Roční' },
      { k: 'Pojištěných vozidel', v: String(c.vehicleCount) }, { k: 'Roční pojistné', v: c.premiumF },
      { k: 'Sjednaná krytí', v: 'POV, HAV, skla, asistence' }, { k: 'Typická spoluúčast', v: '5 % / min. 5 000 Kč' },
    ]
    if (c.coInsurer) facts.splice(3, 0, { k: 'Spolupojistitel', v: c.coInsurer })
    // dokumenty
    const contractSubject = { subjectTitle: POJISTNIK.name, subjectSub: `Flotilová smlouva č. ${c.policy}`, subjectIcon: ic('shield', 18) }
    const docs = [
      { name: `Pojistná smlouva ${c.policy.replace(/\s/g, '')}.pdf`, type: 'Smlouva', size: '248 kB', icon: ic('shield', 17), bg: 'var(--star-soft)', color: 'var(--star)', openPreview: () => setState({ docPreview: { name: `Pojistná smlouva ${c.policy}.pdf`, type: 'Smlouva', size: '248 kB', insurer, policy: c.policy, fleetName: f.name, date: c.policyStart } }) },
      { name: `Všeobecné pojistné podmínky.pdf`, type: 'VPP', size: '512 kB', icon: ic('doc2', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', openPreview: () => setState({ docPreview: { name: 'Všeobecné pojistné podmínky.pdf', type: 'VPP', size: '512 kB', insurer, policy: c.policy, fleetName: f.name, date: c.policyStart } }) },
      { name: `IPID – informační dokument.pdf`, type: 'IPID', size: '96 kB', icon: ic('file', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', openPreview: () => setState({ docPreview: { name: 'IPID – informační dokument.pdf', type: 'IPID', size: '96 kB', insurer, policy: c.policy, fleetName: f.name, date: c.policyStart } }) },
      { name: `Informace o zprostředkovateli.pdf`, type: 'Informace o zprostředkovateli', size: '74 kB', icon: ic('user1', 17), bg: '#F1F1F3', color: 'var(--ink2)', openPreview: () => setState({ docPreview: { kind: 'vehdoc', ...contractSubject, name: 'Informace o zprostředkovateli.pdf', type: 'Informace o zprostředkovateli', size: '74 kB', title: 'Informace o zprostředkovateli pojištění', issuer: BROKER.name, accent: 'var(--blue)', rows: [['Makléř', BROKER.name], ['Registrace ČNB', BROKER.reg], ['IČO makléře', BROKER.ico], ['Odpovědná osoba', BROKER.person], ['Forma odměny', 'Provize od pojistitele'], ['Pojištění odpovědnosti', 'Sjednáno dle zákona č. 170/2018 Sb.']] } }) },
      { name: `Souhlas se zpracováním OÚ (GDPR).pdf`, type: 'GDPR', size: '88 kB', icon: ic('shield', 17), bg: 'var(--green-soft)', color: 'var(--green)', openPreview: () => setState({ docPreview: { kind: 'vehdoc', ...contractSubject, name: 'Souhlas se zpracováním OÚ (GDPR).pdf', type: 'GDPR', size: '88 kB', title: 'Informace o zpracování osobních údajů (GDPR)', issuer: insurer + ' & ' + BROKER.name, accent: 'var(--green)', rows: [['Správce údajů', insurer], ['Zpracovatel', BROKER.name], ['Účel zpracování', 'Sjednání a správa pojištění'], ['Právní titul', 'Plnění smlouvy, čl. 6 GDPR'], ['Doba uchování', 'Po dobu trvání + 10 let'], ['Práva subjektu', 'Přístup, oprava, výmaz, námitka']] } }) },
      { name: `Záznam z jednání.pdf`, type: 'Záznam z jednání', size: '132 kB', icon: ic('doc2', 17), bg: 'var(--amber-soft)', color: 'var(--amber)', openPreview: () => setState({ docPreview: { kind: 'vehdoc', ...contractSubject, name: 'Záznam z jednání.pdf', type: 'Záznam z jednání', size: '132 kB', title: 'Záznam z jednání (ZZJ)', issuer: BROKER.name, accent: 'var(--amber)', rows: [['Klient', POJISTNIK.name], ['Zprostředkovatel', BROKER.person], ['Předmět jednání', 'Flotilové pojištění vozidel'], ['Doporučený produkt', insurer + ' – flotila'], ['Požadavky klienta', 'POV + HAV all-risk, asistence'], ['Datum jednání', c.policyStart]] } }) },
    ]
    return {
      idet: {
        insurer, policy: c.policy, coInsurer: c.coInsurer, parkName: f.name,
        premiumF: c.premiumF, anniversary: c.anniversary, vehicleCount: c.vehicleCount,
        statusLabel: c.statusLabel, chipStyle: c.chipStyle,
        facts, docs, broker: BROKER,
        bonus: { set: !!activeTier, lossRatio: lr, lrColor: lrColorFor(lr), rate: activeTier ? activeTier.rate + ' %' : '—', threshold: activeTier ? activeTier.threshold : null, rebateF: activeTier ? czk(rebate) : '—', goDetail: () => navigate('bonifikace-detail', { fleetId: f.id }) },
        loss: { lossRatio: lr, lrColor: lrColorFor(lr), claims: f.claims, freqF: freq.toFixed(1), paidF: czk(paidSum), vehicles: f.vehicles },
        claimRows,
        activeRows: activeV.map((v) => ({ id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel, vin: v.vin, prihlaska: v.prihlaska, insurer: v.insurer, premiumF: czk(v.premium), statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status), onClick: () => openVehicle(v.id) })),
        endedRows: vehiclesData.filter((v) => v.fleet === f.id && v.status === 'ended').map((v) => ({ id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel, fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), endedDate: v.endedDate, endReason: v.endReason, statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status), onClick: () => openVehicle(v.id) })),
        activeCount: activeV.length,
        vehiclesExport: { filename: `vozidla-smlouva-${f.id}`, title: `Vozidla – smlouva ${c.policy}`, columns: [{ key: 'plate', label: 'SPZ' }, { key: 'znacka', label: 'Značka' }, { key: 'model', label: 'Model' }, { key: 'driver', label: 'Řidič' }, { key: 'insurer', label: 'Pojišťovna' }, { key: 'premium', label: 'Roční pojistné' }, { key: 'stav', label: 'Stav' }], rows: activeV.map((v) => ({ plate: v.plate, znacka: v.brand, model: v.model, driver: v.driver, insurer: v.insurer, premium: czk(v.premium), stav: statusMeta[v.status].label })) },
        goBack: () => navigate('insurance'),
      },
    }
  }

  const claimsVM = () => {
    if (state.route !== 'claims') return {}
    const cd = claimsData
    const openN = cd.filter((c) => c.status !== 'closed').length
    const closedN = cd.filter((c) => c.status === 'closed').length
    const paidSum = cd.reduce((a, c) => a + (c.payout || 0), 0)
    const reserveSum = cd.reduce((a, c) => a + (c.estimate || 0), 0)
    const milF = (n) => (n / 1e6).toFixed(2).replace('.', ',') + ' mil.'
    const claimStats = [
      { label: 'Otevřené události', value: String(openN), color: 'var(--star)' },
      { label: 'Uzavřené', value: String(closedN), color: 'var(--ink)' },
      { label: 'Vyplaceno celkem', value: milF(paidSum), color: 'var(--ink)' },
      { label: 'Rezervy', value: milF(reserveSum), color: 'var(--ink)' },
    ]
    // podle kategorie vozidla (reálné)
    const vById = Object.fromEntries(vehiclesData.map((v) => [v.id, v]))
    const catName = Object.fromEntries(fleetsData.map((f) => [f.id, f.name]))
    const PAL = ['#4F6FFF', '#6D5EF6', '#22C55E', '#F59E0B', '#EF4444', '#0EA5A5', '#94A3B8']
    const grp = {}
    cd.forEach((c) => { const v = vById[c.vId]; const key = v ? catName[v.fleet] : 'Mimo aktuální flotilu'; grp[key] = (grp[key] || 0) + 1 })
    const cfArr = Object.entries(grp).sort((a, b) => b[1] - a[1])
    const cfMax = Math.max(...cfArr.map((x) => x[1]), 1)
    const claimsByFleet = cfArr.map(([name, count], i) => ({ name, count, color: PAL[i % PAL.length], w: Math.round(count / cfMax * 100) + '%' }))
    // měsíční trend nahlášení (reálný) — s detaily pro tooltip
    const parseD = (s) => { const p = String(s).split('. '); return p.length === 3 ? new Date(+p[2], +p[1] - 1, +p[0]) : null }
    const riskLabel = { POV: 'Povinné ručení', HAV: 'Havarijní', Skla: 'Pojištění skel', Odp: 'Odpovědnost' }
    const riskColor = { POV: 'var(--blue)', HAV: 'var(--star)', Skla: '#0E9AA6', Odp: 'var(--amber)' }
    const md = {}
    cd.forEach((c) => { const d = parseD(c.date); if (!d) return; const k = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`; if (!md[k]) md[k] = { count: 0, cost: 0, open: 0, byRisk: {} }; md[k].count++; md[k].cost += c.estimate || 0; if (c.status !== 'closed') md[k].open++; md[k].byRisk[c.risk] = (md[k].byRisk[c.risk] || 0) + 1 })
    const keys = Object.keys(md).sort().slice(-12)
    const ctMax = Math.max(...keys.map((k) => md[k].count), 1)
    const MN = ['Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn', 'Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro']
    const FULLMN = ['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec']
    const claimTrend = keys.map((k) => {
      const m = md[k]; const [y, mo] = k.split('-'); const mi = +mo - 1
      const risks = Object.entries(m.byRisk).sort((a, b) => b[1] - a[1]).map(([r, n]) => ({ label: riskLabel[r] || r, color: riskColor[r] || 'var(--ink3)', count: n }))
      return { h: Math.round(m.count / ctMax * 100) + '%', color: '#6D8BFF', label: MN[mi], monthFull: `${FULLMN[mi]} ${y}`, count: m.count, open: m.open, costF: czk(m.cost), risks }
    })
    const claimRows = claimsData.map(buildClaimRow)
    const claimsExport = { filename: 'skody', title: 'Škody', columns: CLAIM_EXPORT_COLS, rows: claimRows.map(claimExportRow) }
    return { claimStats, claimsByFleet, claimTrend, claimRows, claimsExport }
  }

  const documentsVM = () => {
    if (state.route !== 'documents') return {}
    const F = (name, count, icon, bg, color, onClick) => ({ name, count, icon: ic(icon, 18), bg, color, onClick, nav: !!onClick })
    const docFolders = [
      F('Pojistné smlouvy', 1174, 'shield', 'var(--star-soft)', 'var(--star)', () => navigate('documents-detail', { docCat: 'smlouvy', docOpen: {} })),
      F('Zelené karty', vehiclesData.length, 'doc2', 'var(--green-soft)', 'var(--green)', () => navigate('documents-detail', { docCat: 'zk', docOpen: {} })),
      F('Technické průkazy', vehiclesData.length, 'file', 'var(--blue-soft)', 'var(--blue)', () => navigate('documents-detail', { docCat: 'orv', docOpen: {} })),
      F('Faktury', 486, 'banknote', 'var(--amber-soft)', 'var(--amber)', () => navigate('documents-detail', { docCat: 'faktury', docOpen: {} })),
      F('Servisní záznamy', 724, 'wrench', '#F1F1F3', 'var(--ink2)'),
      F('STK & emise', 298, 'check2', 'var(--green-soft)', 'var(--green)'),
      F('Fotodokumentace', 1840, 'camera', 'var(--blue-soft)', 'var(--blue)'),
      F('Likvidace škod', 53, 'alert', 'var(--star-soft)', 'var(--star)'),
    ]
    const Dr = (name, scope, type, date, size, icon, bg, color) => ({ name, scope, type, date, size, icon: ic(icon, 17), bg, color, preview: ic('search', 16), download: ic('arrow', 16) })
    const docRows = [
      Dr('Pojistná smlouva HAV-5SK8841.pdf', 'Škoda Octavia · 5SK 8841', 'Smlouva', '16. 6. 2026', '248 kB', 'shield', 'var(--star-soft)', 'var(--star)'),
      Dr('Zelená karta 1EV9087.pdf', 'Tesla Model 3 · 1EV 9087', 'Zelená karta', '15. 6. 2026', '94 kB', 'doc2', 'var(--green-soft)', 'var(--green)'),
      Dr('Faktura oprava CLM-0142.pdf', 'AutoCentrum Praha', 'Faktura', '12. 6. 2026', '156 kB', 'banknote', 'var(--amber-soft)', 'var(--amber)'),
      Dr('Protokol škody 2BM5567.pdf', 'BMW 320d · parkovací škoda', 'Likvidace', '10. 6. 2026', '1,2 MB', 'alert', 'var(--star-soft)', 'var(--star)'),
      Dr('STK protokol 9ME2201.pdf', 'Mercedes E220d · 9ME 2201', 'STK', '8. 6. 2026', '88 kB', 'check2', 'var(--green-soft)', 'var(--green)'),
      Dr('Servisní list 4VW8800.pdf', 'VW Transporter · 4VW 8800', 'Servis', '5. 6. 2026', '132 kB', 'wrench', '#F1F1F3', 'var(--ink2)'),
    ]
    return { docFolders, docRows }
  }

  const documentsDetailVM = () => {
    if (state.route !== 'documents-detail') return {}
    const goBack = () => navigate('documents')

    if (state.docCat === 'zk' || state.docCat === 'orv') {
      const isZk = state.docCat === 'zk'
      const vehicles = vehiclesData.map((v) => {
        const plateNo = v.plate.replace(/\s/g, '')
        const docName = isZk ? `Zelená karta ${plateNo}.pdf` : `ORV ${plateNo}.pdf`
        const payload = isZk
          ? { kind: 'zk', name: docName, type: 'Zelená karta', size: '94 kB', insurer: v.insurer, plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, validFrom: '1. 1. 2026', validTo: '31. 12. 2026' }
          : { kind: 'orv', name: docName, type: 'Osvědčení o registraci vozidla', size: '118 kB', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, year: v.year, fuel: v.fuel }
        return {
          id: v.id, plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, driver: v.driver, year: v.year, insurer: v.insurer,
          preview: ic('search', 16), download: ic('arrow', 16),
          openPreview: () => setState({ docPreview: payload }),
        }
      })
      const dd = isZk
        ? { cat: 'zk', vehicles, count: vehicles.length, goBack, banner: 'Zelená karta (mezinárodní karta automobilového pojištění) ke každému vozidlu — náhled a stažení.', docColLabel: 'Zelená karta', badgeLabel: 'ZK platná', iconBg: 'var(--green-soft)', iconColor: 'var(--green)', bannerBg: 'var(--green-soft)', bannerColor: '#15803D' }
        : { cat: 'orv', vehicles, count: vehicles.length, goBack, banner: 'Osvědčení o registraci vozidla (technický průkaz, část I) ke každému vozidlu — náhled a stažení.', docColLabel: 'Technický průkaz', badgeLabel: 'ORV část I', iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)', bannerBg: 'var(--blue-soft)', bannerColor: 'var(--blue-ink)' }
      return { dd }
    }

    if (state.docCat === 'faktury') {
      const today = new Date(2026, 5, 19)
      const parse = (s) => { const p = s.replace(/\s/g, '').split('.').map(Number); return new Date(p[2], p[1] - 1, p[0]) }
      const fmt = (dt) => `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`
      const addDays = (s, nn) => { const dt = parse(s); dt.setDate(dt.getDate() + nn); return fmt(dt) }
      const periods = [
        { issue: '2. 1. 2026', due: '16. 1. 2026', pay: 6 },
        { issue: '1. 4. 2026', due: '15. 4. 2026', pay: 9 },
        { issue: '1. 7. 2026', due: '15. 7. 2026', pay: null },
      ]
      let n = 4821
      const invoices = []
      fleetsData.forEach((f) => {
        const grp = {}
        vehiclesData.filter((v) => v.fleet === f.id && v.status !== 'ended').forEach((v) => { grp[v.insurer] = (grp[v.insurer] || 0) + v.premium })
        let pairs = Object.entries(grp)
        if (!pairs.length) pairs = (f.insurers || []).map((name) => [name, Math.round(f.premium / ((f.insurers || []).length || 1))])
        pairs.forEach(([insurer, premium]) => {
          const policy = fleetInsurerPolicy(insurer, f.id)
          const q = Math.round(premium / 4 / 100) * 100
          periods.forEach((pr, pi) => {
            const num = 'FAV-2026-' + (n++)
            let paid, paidDate
            if (pi === 2) { paid = false; paidDate = '—' }
            else { paid = !(n % 4 === 0); paidDate = paid ? addDays(pr.issue, pr.pay) : '—' }
            const overdue = !paid && parse(pr.due) < today
            const meta = paid ? { l: 'Uhrazeno', c: 'var(--green)', bg: 'var(--green-soft)' } : overdue ? { l: 'Po splatnosti', c: 'var(--star)', bg: 'var(--star-soft)' } : { l: 'Neuhrazeno', c: 'var(--amber)', bg: 'var(--amber-soft)' }
            invoices.push({
              num, insurer, policy, amount: q, amountF: czk(q), issue: pr.issue, due: pr.due, paidDate, paid,
              statusLabel: meta.l, chipStyle: `display:inline-flex;align-items:center;font-size:11.5px;font-weight:600;color:${meta.c};background:${meta.bg};padding:3px 9px;border-radius:20px;white-space:nowrap`,
              preview: ic('search', 16), download: ic('arrow', 16),
              openPreview: () => setState({ docPreview: { kind: 'faktura', num, insurer, policy, amountF: czk(q), issue: pr.issue, due: pr.due, paidDate, paid, statusLabel: meta.l, statusColor: meta.c, statusBg: meta.bg, name: `${num}.pdf`, size: '78 kB', type: 'Faktura za pojištění' } }),
            })
          })
        })
      })
      const totalDue = invoices.reduce((a, b) => a + b.amount, 0)
      const unpaid = invoices.filter((x) => !x.paid)
      const unpaidSum = unpaid.reduce((a, b) => a + b.amount, 0)
      const fakturyExport = {
        filename: 'faktury', title: 'Faktury za pojištění',
        columns: [{ key: 'num', label: 'Číslo faktury' }, { key: 'insurer', label: 'Pojišťovna' }, { key: 'policy', label: 'Číslo smlouvy' }, { key: 'amount', label: 'Předpis k úhradě' }, { key: 'issue', label: 'Vystaveno' }, { key: 'due', label: 'Splatnost' }, { key: 'paidDate', label: 'Uhrazeno' }, { key: 'status', label: 'Stav' }],
        rows: invoices.map((iv) => ({ num: iv.num, insurer: iv.insurer, policy: iv.policy, amount: iv.amountF, issue: iv.issue, due: iv.due, paidDate: iv.paidDate, status: iv.statusLabel })),
      }
      return { dd: { cat: 'faktury', invoices, count: invoices.length, totalF: czk(totalDue), unpaidCount: unpaid.length, unpaidF: czk(unpaidSum), goBack, export: fakturyExport } }
    }

    const open = state.docOpen
    const contracts = allFleets.map((f) => {
      const isOpen = !!open[f.id]
      const start = f.policyStart || '—'
      const docs = [
        { name: `Pojistná smlouva ${f.policy}.pdf`, type: 'Smlouva', date: start, size: '328 kB', icon: ic('shield', 17), bg: 'var(--star-soft)', color: 'var(--star)' },
        { name: `IPID – ${f.insurers[0]}.pdf`, type: 'IPID', date: start, size: '92 kB', icon: ic('file', 17), bg: 'var(--blue-soft)', color: 'var(--blue)' },
        { name: 'Všeobecné pojistné podmínky.pdf', type: 'VPP', date: start, size: '1,4 MB', icon: ic('doc2', 17), bg: '#F1F1F3', color: 'var(--ink2)' },
        { name: 'Záznam z jednání.pdf', type: 'Záznam', date: start, size: '214 kB', icon: ic('doc2', 17), bg: 'var(--amber-soft)', color: 'var(--amber)' },
        { name: 'Dodatek č. 1 – aktualizace vozidel.pdf', type: 'Dodatek', date: start, size: '146 kB', icon: ic('file', 17), bg: 'var(--green-soft)', color: 'var(--green)' },
      ].map((d) => ({
        ...d, preview: ic('search', 16), download: ic('arrow', 16),
        openPreview: () => setState({ docPreview: { name: d.name, type: d.type, date: d.date, size: d.size, insurer: f.insurers[0], policy: f.policy || '—', fleetName: f.name } }),
      }))
      return {
        id: f.id, insurer: f.insurers[0], policy: f.policy || '—', fleetName: f.name, start,
        docCount: docs.length, docs, isOpen,
        toggle: () => setState((s) => ({ docOpen: { ...s.docOpen, [f.id]: !s.docOpen[f.id] } })),
        chevStyle: `display:flex;color:var(--ink3);transition:transform .15s;transform:rotate(${isOpen ? '180deg' : '0deg'})`,
        headStyle: `display:flex;align-items:center;gap:14px;padding:15px 18px;cursor:pointer;background:${isOpen ? '#FBFBFC' : '#fff'}`,
      }
    })
    return { dd: { cat: 'smlouvy', contracts, count: contracts.length, goBack } }
  }

  // ---- Fleet-wide TCO rollup (provozní náklady, modelový výpočet) ----
  const mil = (n) => (n / 1e6).toFixed(1).replace('.', ',') + ' mil. Kč'
  const CAT_META = { phm: ['Pohonné hmoty', 'fuel', '#F59E0B'], servis: ['Servis a opravy', 'wrench', '#6D5EF6'], pneu: ['Pneumatiky', 'tire', '#0E9AA6'], dalnice: ['Mýto a dálniční známky', 'banknote', '#4F6FFF'], pokuty: ['Pokuty', 'alert', '#EF4444'] }
  const PARK_COLORS = ['#6D5EF6', '#4F6FFF', '#0E9AA6', '#F59E0B', '#8B5CF6', '#22C55E']
  const fleetCostRollup = () => {
    const costs = vehiclesData.map((v) => ({ v, c: vehicleAnnualCost(v) }))
    const total = costs.reduce((a, x) => a + x.c.total, 0)
    const count = vehiclesData.length
    const kmTotal = costs.reduce((a, x) => a + x.c.km, 0)
    const cat = { phm: 0, servis: 0, pneu: 0, dalnice: 0, pokuty: 0 }
    costs.forEach((x) => { cat.phm += x.c.phm; cat.servis += x.c.servis; cat.pneu += x.c.pneu; cat.dalnice += x.c.dalnice; cat.pokuty += x.c.pokuty })
    const parkTot = {}; costs.forEach((x) => { parkTot[x.v.fleet] = (parkTot[x.v.fleet] || 0) + x.c.total })
    const typeTot = {}; costs.forEach((x) => { const t = vehicleTypeCat(x.v.druh); typeTot[t] = (typeTot[t] || 0) + x.c.total })
    const ageTot = {}; vehiclesData.forEach((v) => { const b = vehicleAgeBand(v); ageTot[b] = (ageTot[b] || 0) + 1 })
    const avgAge = Math.round(vehiclesData.reduce((a, v) => a + Math.max(0, 2026 - (v.year || 2026)), 0) / count)
    const oldCount = vehiclesData.filter((v) => (2026 - (v.year || 2026)) >= 20).length
    const ecoVeh = vehiclesData.filter((v) => v.tele)
    const monthlySavePerVeh = ecoVeh.length ? ecoVeh.reduce((a, v) => a + ecoSavings(v.tele).czk, 0) / ecoVeh.length : 0
    const busCount = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy').length
    const ecoPotentialYear = Math.round(monthlySavePerVeh * busCount * 12)
    return { costs, total, count, kmTotal, cat, parkTot, typeTot, ageTot, avgAge, oldCount, ecoPotentialYear, busCount,
      perVehicle: Math.round(total / count), perMonth: Math.round(total / 12) }
  }
  // sdílené breakdown položky (pro Reporting i majitelský dashboard)
  const costCatItems = (r) => {
    const keys = ['phm', 'servis', 'pneu', 'dalnice', 'pokuty'].filter((k) => r.cat[k] > 0).sort((a, b) => r.cat[b] - r.cat[a])
    return keys.map((k) => { const m = CAT_META[k]; return { label: m[0], icon: m[1], color: m[2], value: mil(r.cat[k]), pct: Math.round(r.cat[k] / r.total * 100) } })
  }
  const parkCostItems = (r) => Object.keys(r.parkTot).sort((a, b) => r.parkTot[b] - r.parkTot[a]).map((fid, i) => {
    const f = allFleets.find((x) => x.id === fid)
    return { label: f ? f.name : fid, icon: 'fleets', color: PARK_COLORS[i % PARK_COLORS.length], value: mil(r.parkTot[fid]), pct: Math.round(r.parkTot[fid] / r.total * 100), onClick: () => openFleet(fid) }
  })
  const ageItems = (r) => { const mx = Math.max(1, ...vehicleAgeBandOrder.map((b) => r.ageTot[b] || 0)); const colors = { '0–5 let': '#22C55E', '6–10 let': '#4F6FFF', '11–15 let': '#6D5EF6', '16–20 let': '#F59E0B', '21+ let': '#EF4444' }
    return vehicleAgeBandOrder.map((b) => ({ label: b, icon: 'calendar', color: colors[b], value: String(r.ageTot[b] || 0), pct: Math.round((r.ageTot[b] || 0) / mx * 100) })) }
  const ownerRecs = (r) => {
    const recs = []
    if (r.oldCount > 0) {
      const n = r.oldCount
      const oldTitle = n === 1 ? `1 vozidlo starší 20 let` : n >= 2 && n <= 4 ? `${n} vozidla starší 20 let` : `${n} vozidel starších 20 let`
      recs.push({ title: oldTitle, sub: `Odepsané vozy s rostoucími náklady na servis i spotřebu. Obměna za nové může snížit provozní náklady a emise. Makléř zajistí financování i pojištění nových vozidel.`, icon: 'refresh', color: 'var(--star)' })
    }
    recs.push({ title: `Potenciál úspory paliva ${mil(r.ecoPotentialYear)} ročně`, sub: `Modelový odhad po nasazení telematických jednotek do všech ${r.busCount} autobusů (plynulejší jízda, méně volnoběhu a nezávislého topení).`, icon: 'gauge', color: 'var(--green)' })
    recs.push({ title: 'Pojistné zatím není v nákladech', sub: 'Po napojení na pojišťovnu se do TCO promítne i roční pojistné a škodní průběh, včetně bonifikace podle historie.', icon: 'shield', color: 'var(--blue)' })
    return recs
  }

  // Manažerský report pro vedení (PDF přes tisk) — z reálných dat flotily.
  const exportExecReport = () => {
    const r = fleetCostRollup()
    const milKc = (n) => (n / 1e6).toFixed(1).replace('.', ',') + ' mil. Kč'
    const czf = (n) => Math.round(n).toLocaleString('cs-CZ') + ' Kč'
    const prem = vehiclesData.reduce((a, v) => a + (v.premium || 0), 0)
    const povOnly = vehiclesData.filter((v) => v.cov && v.cov.pov && !v.cov.hav).length
    const busNoHav = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy' && v.cov && !v.cov.hav).length
    const off = FLEET_ANOMALIES.find((a) => a.type === 'offroute_stop')
    const fuelDrop = FLEET_ANOMALIES.find((a) => a.type === 'fuel_drop')
    const unresolved = FLEET_ANOMALIES.filter((a) => a.status !== 'done').length
    const catLabels = { phm: 'Pohonné hmoty', servis: 'Servis a opravy', pneu: 'Pneumatiky', dalnice: 'Mýto a dálnice', pokuty: 'Pokuty' }
    const catItems = Object.keys(r.cat).filter((k) => r.cat[k] > 0).sort((a, b) => r.cat[b] - r.cat[a]).map((k) => ({ label: catLabels[k] || k, v: r.cat[k], valueF: milKc(r.cat[k]), color: '#6D5EF6' }))
    const parkItems = Object.keys(r.parkTot).sort((a, b) => r.parkTot[b] - r.parkTot[a]).map((fid) => ({ label: fleetName(fid), v: r.parkTot[fid], valueF: milKc(r.parkTot[fid]), color: '#4F6FFF' }))
    const topVehicles = [...r.costs].sort((a, b) => b.c.total - a.c.total).slice(0, 6).map((x) => ({ name: `${x.v.brand} ${x.v.model}`.trim(), plate: x.v.plate, year: x.v.year, costF: czf(x.c.total) }))
    const flags = [
      { title: `${off.typeLabel} — ${off.place.replace(' (mimo trasu i zastávky)', '')}`, sub: `${off.metric}, vzorec odpovídá odčerpávání nafty. Odhad ztráty ~${czf(off.loss)}/rok.` },
      { title: `${fuelDrop.typeLabel} — ${fuelDrop.plate}`, sub: `${fuelDrop.metric} navzdory hospodárné jízdě. Odhad ztráty ~${czf(fuelDrop.loss)}/rok.` },
      { title: `${busNoHav} autobusů bez havarijního krytí`, sub: 'Riziko vysoké škody bez pojistného plnění — doporučeno dořešit s makléřem.' },
    ]
    const html = buildExecReportHtml({
      title: 'Manažerský přehled flotily', company: 'ČSAD AUTOBUSY České Budějovice a.s.', ico: '26060451',
      date: '4. 11. 2026', broker: 'Petrisk', vehicles: String(vehiclesData.length),
      kpis: [
        { value: milKc(r.total), label: 'Provozní náklady / rok' },
        { value: milKc(prem), label: 'Roční pojistné' },
        { value: `${r.avgAge} let`, label: 'Ø stáří flotily' },
        { value: String(unresolved), label: 'Nevyřešené anomálie' },
      ],
      catItems, parkItems, topVehicles, flags,
      insurance: { premiumF: milKc(prem), povOnly, busNoHav },
      recommendations: ownerRecs(r).map((x) => ({ title: x.title, sub: x.sub })),
    })
    setState({ execReport: html })
  }

  const analyticsVM = () => {
    if (state.route !== 'analytics') return {}
    const r = fleetCostRollup()
    const anKpis = [
      { value: (r.total / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Provozní náklady flotily / rok', icon: 'banknote', note: 'PHM, servis, pneu, mýto, pokuty' },
      { value: czk(r.perVehicle), label: 'Ø náklad na vozidlo / rok', icon: 'car', note: czk(r.perMonth) + ' měsíčně' },
      { value: String(r.avgAge), unit: 'let', label: 'Průměrné stáří flotily', icon: 'calendar', note: `${r.oldCount} vozů nad 20 let` },
      { value: (r.ecoPotentialYear / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Potenciál úspor paliva / rok', icon: 'gauge', note: 'po nasazení telematiky' },
    ]
    const catItems = costCatItems(r)
    const parkItems = parkCostItems(r)
    const typeItems = Object.keys(r.typeTot).sort((a, b) => r.typeTot[b] - r.typeTot[a]).map((t, i) => ({ label: t, icon: t === 'Autobusy' ? 'bus' : t === 'Osobní vozidla' ? 'car' : 'truck', color: PARK_COLORS[i % PARK_COLORS.length], value: mil(r.typeTot[t]), pct: Math.round(r.typeTot[t] / r.total * 100) }))
    const ages = ageItems(r)
    // plán vs. skutečnost (rozpočet = skutečnost +6 %, tj. úspora oproti plánu)
    const plan = Math.round(r.total * 1.06)
    const planVsReal = { planF: mil(plan), realF: mil(r.total), savedF: mil(plan - r.total), savedPct: Math.round((plan - r.total) / plan * 100) }
    // 12měsíční trend provozních nákladů (sezónní, seeded)
    const season = [1.02, 0.98, 1.0, 0.97, 0.99, 1.03, 1.06, 1.05, 1.0, 1.01, 1.04, 1.07]
    const base = r.total / 12
    const mx = Math.max(...season)
    const trend = season.map((s, i) => ({ label: MONTHS[i], value: mil(Math.round(base * s)), h: Math.round(s / mx * 100) + '%' }))
    const recs = ownerRecs(r)
    const topVeh = [...r.costs].sort((a, b) => b.c.total - a.c.total).slice(0, 6).map((x) => ({ id: x.v.id, name: `${x.v.brand} ${x.v.model}`, plate: x.v.plate, year: x.v.year, cat: vehicleTypeCat(x.v.druh), totalF: czk(x.c.total), kmF: (x.c.km / 1000).toFixed(0) + ' tis. km', onClick: () => openVehicle(x.v.id) }))
    return { reporting: { anKpis, catItems, parkItems, typeItems, ages, planVsReal, trend, recs, topVeh, kmTotalF: (r.kmTotal / 1e6).toFixed(1).replace('.', ',') + ' mil. km', exportPdf: exportExecReport } }
  }

  const ownerDashVM = () => {
    if (state.route !== 'dashboard' || state.role !== 'majitel') return {}
    const r = fleetCostRollup()
    const kpis = [
      { value: (r.total / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Provozní náklady flotily / rok', icon: 'banknote', note: 'modelový odhad TCO · ▼ 6 % r/r' },
      { value: (r.perMonth / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Ø náklady flotily / měsíc', icon: 'trend', note: czk(r.perVehicle) + ' / vozidlo / rok' },
      { value: String(r.avgAge), unit: 'let', label: 'Průměrné stáří flotily', icon: 'calendar', note: `${r.oldCount} vozů nad 20 let` },
      { value: (r.ecoPotentialYear / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', label: 'Potenciál úspor / rok', icon: 'gauge', note: 'telematika + eco-driving' },
    ]
    const topVeh = [...r.costs].sort((a, b) => b.c.total - a.c.total).slice(0, 5).map((x) => ({ id: x.v.id, name: `${x.v.brand} ${x.v.model}`, plate: x.v.plate, year: x.v.year, totalF: czk(x.c.total), onClick: () => openVehicle(x.v.id) }))
    return { ownerDash: { kpis, catItems: costCatItems(r), parkItems: parkCostItems(r), ages: ageItems(r), recs: ownerRecs(r), topVeh, goReport: () => navigate('analytics'), exportPdf: exportExecReport } }
  }

  const dispatchDashVM = () => {
    if (state.route !== 'dashboard' || state.role !== 'dispecer') return {}
    const rows = linesData.map((l) => {
      const sim = simulateLineRun(l)
      const drv = busDrivers.find((d) => d.id === l.driverId)
      const bus = vehiclesData.find((v) => v.id === l.busId)
      const dScore = drv ? ecoScore(drv.tele) : null
      const anomalies = (sim.maxDelay > 5 ? 1 : 0) + sim.skips + (dScore != null && dScore < 60 ? 1 : 0)
      return { id: l.id, no: l.no, name: l.name, driver: drv ? drv.name : '—', bus: bus ? `${bus.brand} ${bus.model}` : '—',
        onTimePct: sim.onTimePct, onTimeColor: sim.onTimePct >= 90 ? 'var(--green)' : sim.onTimePct >= 75 ? 'var(--amber)' : 'var(--star)',
        maxDelay: sim.maxDelay, skips: sim.skips, anomalies, onClick: () => openLine(l.id) }
    })
    const avg = (a) => rows.length ? Math.round(a / rows.length) : 0
    const kpis = [
      { value: String(rows.length), label: 'Autobusových linek', icon: 'pin', note: 'v provozu dnes' },
      { value: avg(rows.reduce((a, x) => a + x.onTimePct, 0)) + ' %', label: 'Ø dodržení JŘ', icon: 'check2', note: 'on-time (0 až +5 min)', trend: '2 %', dir: 'up', trendColor: 'var(--green)' },
      { value: String(rows.reduce((a, x) => a + x.anomalies, 0)), label: 'Anomálií dnes', icon: 'alert', note: 'napříč linkami', trendColor: 'var(--star)' },
      { value: Math.round(busDrivers.reduce((a, d) => a + ecoScore(d.tele), 0) / busDrivers.length) + '/100', label: 'Ø eco-skóre řidičů', icon: 'gauge', note: 'hospodárnost jízdy' },
    ]
    const anomalyLines = rows.filter((x) => x.anomalies > 0).sort((a, b) => b.anomalies - a.anomalies)
    const drv = busDrivers.map((d) => { const sc = ecoScore(d.tele); const bus = vehiclesData.find((v) => v.id === d.busId); const line = linesData.find((l) => l.id === d.lineId)
      return { id: d.id, name: d.name, score: sc, band: ecoBand(sc), line: line ? line.no : '—', bus: bus ? `${bus.brand} ${bus.model}` : '—' } }).sort((a, b) => b.score - a.score)
    return { dispatchDash: { kpis, rows, anomalyLines, driverTop: drv.slice(0, 3), driverBottom: drv.slice(-2).reverse(), goLinky: () => navigate('linky'), goEco: () => navigate('eco') } }
  }

  // ---- Vyžaduje pozornost: konkrétní seznamy + akce (nástroj, ne nástěnka) ----
  const attentionVM = () => {
    if (state.route !== 'attention') return {}
    const dayWord = (n) => { const a = Math.abs(n); return a === 1 ? 'den' : (a >= 2 && a <= 4 ? 'dny' : 'dní') }
    const badge = (due) => !due ? null : due.expired
      ? { label: `po platnosti · ${-due.days} ${dayWord(due.days)}`, color: 'var(--star)', bg: 'var(--star-soft)', sev: 2 }
      : { label: `končí za ${due.days} ${dayWord(due.days)}`, color: '#B45309', bg: 'var(--amber-soft)', sev: 1 }
    const vehRow = (v, due, actLabel, actMsg) => ({ title: `${v.brand} ${v.model}`, sub: `${v.plate} · ${fleetName(v.fleet)}`, icon: ic('car', 17), badge: badge(due),
      onClick: () => openVehicle(v.id), actionLabel: actLabel, action: () => showToast(`${actMsg} · ${v.brand} ${v.model} (${v.plate})`) })
    // STK
    const stk = vehiclesData.map((v) => ({ v, due: dueInfo(vehicleStk(v), 60) })).filter((x) => x.due && x.due.days <= 60).sort((a, b) => a.due.days - b.due.days)
      .map(({ v, due }) => vehRow(v, due, 'Objednat STK', 'Objednávka STK odeslána do servisu'))
    // dálniční známky
    const vig = vehiclesData.map((v) => { const g = vehicleVignette(v); return { v, g, due: g ? dueInfo(g.validTo, 60) : null } }).filter((x) => x.due && x.due.days <= 60).sort((a, b) => a.due.days - b.due.days)
      .map(({ v, due }) => vehRow(v, due, 'Obnovit známku', 'Dálniční známka obnovena'))
    // řidičské průkazy / profesní způsobilost
    const rp = driversData.map((d) => {
      const a = dueInfo(d.rp && d.rp.validTo, 60); const b = d.rp && d.rp.profValidTo ? dueInfo(d.rp.profValidTo, 60) : null
      const cand = [a && a.days <= 60 ? { due: a, what: 'Řidičský průkaz' } : null, b && b.days <= 60 ? { due: b, what: 'Profesní způsobilost' } : null].filter(Boolean).sort((x, y) => x.due.days - y.due.days)
      return cand.length ? { d, due: cand[0].due, what: cand[0].what } : null
    }).filter(Boolean).sort((x, y) => x.due.days - y.due.days)
      .map(({ d, due, what }) => ({ title: d.name, sub: `${what} · ${d.position}`, icon: ic('user1', 17), badge: badge(due), onClick: () => openDriver(d.id), actionLabel: 'Připomenout řidiči', action: () => showToast(`Připomínka odeslána řidiči · ${d.name} (${what.toLowerCase()})`) }))
    // lékařské prohlídky
    const lek = driversData.map((d) => ({ d, due: d.lekarska ? dueInfo(d.lekarska.validTo, 60) : null })).filter((x) => x.due && x.due.days <= 60).sort((a, b) => a.due.days - b.due.days)
      .map(({ d, due }) => ({ title: d.name, sub: `Pravidelná lékařská prohlídka · ${d.position}`, icon: ic('shield', 17), badge: badge(due), onClick: () => openDriver(d.id), actionLabel: 'Objednat prohlídku', action: () => showToast(`Termín prohlídky domluven · ${d.name}`) }))
    // otevřené škody
    const claims = claimsData.filter((c) => c.status !== 'closed').map((c) => { const v = vehiclesData.find((x) => x.id === c.vId)
      return { title: c.vehicle, sub: `${c.type} · nahlášeno ${c.date}`, icon: ic('alert', 17), badge: { label: 'v likvidaci', color: 'var(--amber)', bg: 'var(--amber-soft)' }, onClick: () => openClaim(c.id), actionLabel: 'Otevřít', action: () => openClaim(c.id) } })
    // financování
    const fin = financingEnding(90).map(({ v, daysToEnd }) => vehRow(v, { days: daysToEnd, expired: false }, 'Poptat obměnu', 'Poptávka obměny připravena'))

    const defs = [
      { id: 'stk', label: 'Končící STK a emise', icon: 'check2', color: 'var(--amber)', hint: 'Technická prohlídka do 60 dnů nebo po platnosti', items: stk },
      { id: 'lekarska', label: 'Končící lékařské prohlídky', icon: 'shield', color: 'var(--green)', hint: 'Pravidelná prohlídka řidiče (§ 87 z. 361/2000)', items: lek },
      { id: 'rp', label: 'Končící řidičské průkazy a profesní způsobilost', icon: 'user1', color: 'var(--blue)', hint: 'ŘP nebo profesní způsobilost do 60 dnů', items: rp },
      { id: 'vignette', label: 'Končící dálniční známky', icon: 'doc2', color: '#6D8BFF', hint: 'Roční kupon do 60 dnů nebo po platnosti', items: vig },
      { id: 'claims', label: 'Otevřené škody', icon: 'alert', color: 'var(--star)', hint: 'Pojistné události v likvidaci', items: claims },
      { id: 'financing', label: 'Končící financování', icon: 'banknote', color: 'var(--purple)', hint: 'Úvěr / leasing do 90 dnů', items: fin },
    ]
    const cat = state.attnCat
    const ordered = cat ? [...defs.filter((d) => d.id === cat), ...defs.filter((d) => d.id !== cat)] : defs
    const sections = ordered.filter((d) => d.items.length > 0)
    const totalOpen = defs.reduce((a, d) => a + d.items.length, 0)
    const chips = defs.map((d) => ({ id: d.id, label: d.label.replace('Končící ', '').replace('Otevřené ', ''), count: d.items.length, active: d.id === cat, color: d.color, onClick: () => setState({ attnCat: d.id === cat ? null : d.id }) }))
    return { attention: { sections, chips, totalOpen, cat, clearCat: () => setState({ attnCat: null }), goDash: () => navigate('dashboard') } }
  }

  const czkY = (n) => n ? Math.round(n).toLocaleString('cs-CZ') + ' Kč' : '—'
  const anoRow = (a) => ({
    id: a.id, type: a.type, typeLabel: a.typeLabel, icon: a.icon, cat: a.cat, sevMeta: a.sevMeta, sev: a.sev,
    date: a.date, time: a.time, plate: a.plate, vehicle: a.vehicle, driverName: a.driverName,
    lineNo: a.lineNo, lineName: a.lineName, place: a.place, detail: a.detail, metric: a.metric,
    statusMeta: a.statusMeta, lossF: a.loss ? czkY(a.loss) : null, onClick: () => openAnomaly(a.id),
  })

  const anomaliesVM = () => {
    if (state.route !== 'anomalies') return {}
    let all = FLEET_ANOMALIES
    let filterChip = null
    if (state.anoDriver) { const d = driversData.find((x) => x.id === state.anoDriver); all = all.filter((a) => a.driverId === state.anoDriver); filterChip = { label: `Řidič: ${d ? d.name : state.anoDriver}`, clear: () => openAnomalies({}) } }
    else if (state.anoVehicle) { const v = vehiclesData.find((x) => x.id === state.anoVehicle); all = all.filter((a) => a.vehicleId === state.anoVehicle); filterChip = { label: `Vozidlo: ${v ? v.plate : state.anoVehicle}`, clear: () => openAnomalies({}) } }

    const total = all.length
    const unresolved = all.filter((a) => a.status !== 'done').length
    const high = all.filter((a) => a.sev === 'high').length
    const fuelItems = all.filter((a) => a.cat === 'Palivo a GPS')
    const fuelLoss = fuelItems.reduce((s, a) => s + a.loss, 0)
    const kpis = [
      { value: String(unresolved), unit: `/ ${total}`, label: 'Nevyřešené anomálie', icon: 'alert', note: 'napříč celou flotilou' },
      { value: String(high), label: 'Vysoká závažnost', icon: 'alert', note: 'vyžadují kontrolu' },
      { value: (fuelLoss / 1000).toFixed(0).replace('.', ','), unit: 'tis. Kč', label: 'Odhad roční ztráty na palivu', icon: 'fuel', note: 'zastavení mimo trasu, úbytky, spotřeba' },
      { value: String(fuelItems.length), label: 'Palivo a GPS', icon: 'pin', note: 'odčerpávání, úniky, spotřeba' },
    ]

    const views = [['vse', 'Vše'], ['typ', 'Podle typu'], ['linka', 'Podle linky'], ['vozidlo', 'Podle vozidla'], ['ridic', 'Podle řidiče'], ['misto', 'Podle místa']].map(([id, label]) => ({ id, label, active: (state.anoView || 'vse') === id, onClick: () => setState({ anoView: id }) }))
    const view = state.anoView || 'vse'

    const buildGroups = (keyFn, labelFn, subFn, icon) => {
      const m = new Map()
      all.forEach((a) => { const k = keyFn(a); if (k == null) return; if (!m.has(k)) m.set(k, { key: k, label: labelFn(a), sub: subFn ? subFn(a) : null, icon: icon || a.icon, count: 0, high: 0, loss: 0, rows: [] }); const g = m.get(k); g.count++; if (a.sev === 'high') g.high++; g.loss += a.loss; g.rows.push(anoRow(a)) })
      return [...m.values()].map((g) => ({ ...g, lossF: g.loss ? czkY(g.loss) : null })).sort((x, y) => y.high - x.high || y.count - x.count || y.loss - x.loss)
    }
    let flat = null, groups = null
    if (view === 'vse') flat = all.map(anoRow)
    else if (view === 'typ') groups = buildGroups((a) => a.type, (a) => a.typeLabel, (a) => a.cat)
    else if (view === 'linka') groups = buildGroups((a) => a.lineNo, (a) => `Linka ${a.lineNo}`, (a) => a.lineName, 'pin')
    else if (view === 'vozidlo') groups = buildGroups((a) => a.vehicleId, (a) => a.vehicle, (a) => a.plate, 'car')
    else if (view === 'ridic') groups = buildGroups((a) => a.driverId, (a) => a.driverName, () => null, 'user1')
    else if (view === 'misto') groups = buildGroups((a) => a.place, (a) => a.place, () => null, 'pin')

    const spotlight = FLEET_ANOMALIES.filter((a) => a.type === 'offroute_stop' || a.type === 'fuel_drop')
      .sort((a, b) => a.sevMeta.order - b.sevMeta.order).map(anoRow)

    return { anomalies: { kpis, spotlight, views, view, flat, groups, total, unresolved, filterChip, goDash: () => navigate('dashboard') } }
  }

  const anomalyDetailVM = () => {
    if (state.route !== 'anomaly-detail') return {}
    const a = FLEET_ANOMALIES.find((x) => x.id === state.anomalyId) || FLEET_ANOMALIES[0]
    const facts = [
      ['Datum a čas', `${a.date}${a.time ? ' · ' + a.time : ''}`],
      a.vehicle !== '—' ? ['Vozidlo', `${a.vehicle} · ${a.plate}`] : null,
      a.driverName !== '—' ? ['Řidič', a.driverName] : null,
      a.lineNo ? ['Linka', `${a.lineNo}${a.lineName ? ' · ' + a.lineName : ''}`] : null,
      a.place ? ['Místo', a.place] : null,
      a.metric ? ['Ukazatel', a.metric] : null,
      a.loss ? ['Odhad roční ztráty', czkY(a.loss)] : null,
    ].filter(Boolean)
    const related = FLEET_ANOMALIES.filter((x) => x.id !== a.id && ((a.vehicleId && x.vehicleId === a.vehicleId) || (a.driverId && x.driverId === a.driverId))).slice(0, 6).map(anoRow)
    return { anomalyDet: {
      ...a, facts, lossF: a.loss ? czkY(a.loss) : null, related,
      openVehicle: a.vehicleId ? () => openVehicle(a.vehicleId) : null,
      openDriver: a.driverId ? () => openDriver(a.driverId) : null,
      goBack: () => navigate('anomalies'),
      act: (msg) => showToast(msg),
    } }
  }

  const mapVM = () => {
    if (state.route !== 'map') return {}
    const buses = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy')
    const anHigh = FLEET_ANOMALIES.filter((a) => a.sev === 'high').length
    const onTrack = Math.round(buses.length * 0.14) + 32
    const LINE_COLORS = ['#6D5EF6', '#4F6FFF', '#0EA5E9', '#14B8A6', '#F59E0B', '#EC4899']
    const mapLines = linesData.map((l, i) => {
      const stops = l.stops.map((s) => { const c = STOP_COORDS[s.n]; return c ? { name: s.n, lat: c[0], lon: c[1] } : null }).filter(Boolean)
      const bus = vehiclesData.find((v) => v.id === l.busId)
      const drv = busDrivers.find((d) => d.id === l.driverId)
      const sim = simulateLineRun(l)
      const eco = drv ? ecoScore(drv.tele) : null
      const band = eco != null ? ecoBand(eco) : null
      return {
        no: l.no, name: l.name, color: LINE_COLORS[i % LINE_COLORS.length], stops, dur: 24000 + i * 3000, offset: i * 4,
        lineId: l.id, vehicleId: bus ? bus.id : null,
        plate: bus ? bus.plate : '—', busName: bus ? `${bus.brand} ${bus.model}`.trim() : '—',
        year: bus ? bus.year : '', fuelType: bus ? bus.fuel : (drv ? drv.tele.fuel : ''),
        driver: drv ? drv.name : '—', eco, ecoLabel: band ? band.label : '',
        onTime: sim.onTimePct, anom: sim.skips + (sim.maxDelay > 6 ? 1 : 0),
        fuelPct: 45 + (_hash(l.id + 'fuel') % 50), speedKmh: 0,
        nStops: stops.length, from: stops.length ? stops[0].name : '', to: stops.length ? stops[stops.length - 1].name : '',
      }
    }).filter((l) => l.stops.length >= 2)
    const legend = mapLines.map((l) => ({ color: l.color, label: `Linka ${l.no}` }))
    const anomalyMarkers = FLEET_ANOMALIES.filter((a) => a.lat && a.lon && (a.sev === 'high' || a.type === 'fuel_drop')).map((a) => ({
      id: a.id, lat: a.lat, lon: a.lon, type: a.type, typeLabel: a.typeLabel, color: a.sevMeta.color, hot: a.type === 'offroute_stop', place: a.place || a.vehicle, metric: a.metric || '',
    }))
    return { fleetMap: {
      busTotal: buses.length, onTrack, delayed: 4, anomalies: anHigh, day: DISPATCH_DAY_LABEL,
      lines: mapLines, legend, anomalyMarkers, lineCount: mapLines.length, stopCount: mapLines.reduce((a, l) => a + l.stops.length, 0),
      openVehicle: (id) => openVehicle(id), openLine: (id) => openLine(id), openAnomaly: (id) => openAnomaly(id),
      goAnomalies: () => navigate('anomalies'), goLinky: () => navigate('linky'),
    } }
  }

  // ---- Dispečink: oběhy vozidel (Gantt) + turnusy řidičů ----
  const dispatchVM = () => {
    if (state.route !== 'dispatch') return {}
    const circ = buildDispatch()
    const t0 = DISPATCH_T0, t1 = DISPATCH_T1, span = t1 - t0
    const pct = (m) => (m - t0) / span * 100
    const colors = { depot: '#94A3B8', line: '#6D5EF6', break: '#F59E0B' }
    const rows = circ.map((c) => ({
      id: c.line.id, no: c.line.no, name: c.line.name,
      bus: c.bus ? `${c.bus.brand} ${c.bus.model}` : '—', plate: c.bus ? c.bus.plate : '',
      spanLabel: `${_fmtMin(c.depotOut)}–${_fmtMin(c.depotIn)}`, driveLabel: _durLabel(c.drive),
      blocks: c.blocks.map((b) => ({ kind: b.kind, label: b.label, left: pct(b.s), width: b.w / span * 100, color: colors[b.kind],
        title: `${b.label} · ${_fmtMin(b.s)}–${_fmtMin(b.e)} · ${b.drv}`, showLabel: b.w > 55 })),
      anomalies: c.duties.filter((d) => d.status.sev > 0).length,
      onStazka: () => openStazka(c.line.id),
    }))
    const ticks = []
    for (let h = Math.ceil(t0 / 60); h * 60 <= t1; h += 2) ticks.push({ label: String(h % 24).padStart(2, '0') + ':00', left: pct(h * 60) })
    const duties = circ.flatMap((c) => c.duties.map((d) => ({
      turnus: d.turnus, part: d.part, driver: d.driver, role: d.role, line: c.line.no,
      bus: c.bus ? `${c.bus.brand} ${c.bus.model}` : '—', plate: c.bus ? c.bus.plate : '',
      startF: _fmtMin(d.start), endF: _fmtMin(d.end), driveF: _durLabel(d.drive), brkF: `${d.brk} min`, status: d.status,
      onClick: (d.driverId && d.driverId.startsWith('dr')) ? () => openDriver(d.driverId) : () => openStazka(c.line.id),
    }))).sort((a, b) => b.status.sev - a.status.sev || a.turnus.localeCompare(b.turnus))
    const anoms = duties.filter((d) => d.status.sev > 0)
    const uniqDrivers = new Set(duties.map((d) => d.driver)).size
    const kpis = [
      { value: String(circ.length), label: 'Vozidel v oběhu', icon: 'bus', note: 'dnes v provozu' },
      { value: String(duties.length), label: 'Turnusů řidičů', icon: 'users', note: `${uniqDrivers} řidičů ve směně` },
      { value: _durLabel(Math.round(circ.reduce((a, c) => a + c.span, 0) / circ.length)), label: 'Ø délka oběhu', icon: 'calendar', note: 'výjezd–zátah' },
      { value: String(anoms.length), label: 'Anomálie směn', icon: 'alert', note: 'doba řízení / přestávky', trendColor: anoms.length ? 'var(--star)' : 'var(--green)' },
    ]
    return { dispatch: { rows, ticks, duties, kpis, anoms, day: DISPATCH_DAY_LABEL } }
  }

  // ---- Elektronická stazka: deník spojů vybraného oběhu ----
  const stazkaVM = () => {
    if (state.route !== 'stazka') return {}
    const l = linesData.find((x) => x.id === state.stazkaLine) || linesData[0]
    const bus = vehiclesData.find((v) => v.id === l.busId)
    const amDrv = busDrivers.find((d) => d.id === l.driverId)
    const isLong = l.no === '300'
    const kmTrip = isLong ? 40 : 7 + (_hash(l.id) % 5)
    const rtMin = isLong ? 40 : 22 + (_hash(l.id + 'rt') % 10)
    const rng = _rng(_hash(l.id + 'stazka'))
    const trips = l.departures.map((dep, i) => {
      const d = Math.round((rng() - 0.32) * 7)
      const dep2 = Math.max(-2, d)
      return { spoj: `${l.no}/${String(i + 1).padStart(2, '0')}`, dir: i % 2 === 0 ? 'tam' : 'zpět',
        planned: dep, actual: _fmtMin(_toMin(dep) + dep2), delay: dep2, km: kmTrip, min: rtMin,
        status: dep2 < 0 ? 'early' : dep2 <= 5 ? 'ontime' : 'late' }
    })
    const totalKm = trips.reduce((a, t) => a + t.km, 0)
    const totalMin = trips.reduce((a, t) => a + t.min, 0)
    const consL = +(totalKm / 100 * (bus && bus.tele ? bus.tele.cons : 34)).toFixed(0)
    const sm = (s) => s === 'early' ? { c: '#B45309', b: 'var(--amber-soft)', lbl: 'před časem' } : s === 'late' ? { c: 'var(--star)', b: 'var(--star-soft)', lbl: 'zpoždění' } : { c: 'var(--green)', b: 'var(--green-soft)', lbl: 'včas' }
    const rows = trips.map((t) => ({ ...t, delayLabel: t.delay === 0 ? 'přesně' : (t.delay > 0 ? '+' : '') + t.delay + ' min', ...sm(t.status) }))
    const onTime = trips.filter((t) => t.status === 'ontime').length
    const stats = [
      { label: 'Spojů ve směně', value: String(trips.length), sub: 'odjeto', icon: 'pin' },
      { label: 'Ujeté km', value: totalKm.toLocaleString('cs-CZ') + ' km', sub: 'za den', icon: 'car' },
      { label: 'Doba v provozu', value: _durLabel(totalMin), sub: 'motohodiny', icon: 'calendar' },
      { label: 'Spotřeba (odhad)', value: consL + ' l', sub: `Ø ${bus && bus.tele ? bus.tele.cons : 34} l/100 km`, icon: 'fuel' },
    ]
    return { stazka: {
      line: l, no: l.no, name: l.name, agency: l.agency, day: DISPATCH_DAY_LABEL,
      bus: bus ? { name: `${bus.brand} ${bus.model}`, plate: bus.plate, onClick: () => openVehicle(bus.id) } : null,
      driver: amDrv ? amDrv.name : '—', stats, rows, onTimePct: trips.length ? Math.round(onTime / trips.length * 100) : 0,
      goBack: () => navigate('dispatch'),
    } }
  }

  const contactsVM = () => {
    if (state.route !== 'contacts') return {}
    const ADDR = 'Brumlovka – budova G, Michelská 1552/58, 141 00 Praha 4'
    const contactGroups = [
      { name: 'Za klienta · správa vozového parku', people: [
        { name: 'Josef Moučka', role: 'Správa vozového parku · ČSAD AUTOBUSY České Budějovice a.s.', initials: 'JM', bg: 'var(--blue-soft)', color: 'var(--blue)', email: 'josef.moucka@csadbus.cz', telefon: '+420 602 215 732' },
      ] },
      { name: 'Za makléře · Petrisk a.s.', broker: { name: 'Petrisk a.s.', tagline: 'Pojišťovací makléř · spravuje váš Fleet Portal', address: ADDR, web: 'petrisk.cz', phone: '+420 272 769 586', email: 'info@petrisk.cz' }, people: [
        { name: 'Ing. Michal Zeman', role: 'Vedoucí oddělení pojištění motorových vozidel', initials: 'MZ', bg: 'var(--purple-soft)', color: 'var(--purple)', email: 'zeman@petrisk.cz', mobil: '+420 777 282 996', telefon: '+420 272 769 586', adresa: ADDR, www: 'www.petrisk.cz' },
        { name: 'Dana Strejcovská', role: 'Senior broker', initials: 'DS', bg: 'var(--purple-soft)', color: 'var(--purple)', email: 'strejcovska@petrisk.cz', mobil: '+420 724 159 016', telefon: '+420 272 769 586', adresa: ADDR, www: 'www.petrisk.cz' },
        { name: 'Jiří Netopilík', role: 'Ředitel likvidace pojistných událostí', initials: 'JN', bg: 'var(--purple-soft)', color: 'var(--purple)', email: 'netopilik@petrisk.cz', mobil: '+420 777 262 244', telefon: '+420 272 769 586', adresa: ADDR, www: 'www.petrisk.cz' },
      ] },
      { name: 'Asistenční služby pojišťoven · nonstop 24/7', people: [
        { name: 'Kooperativa', role: 'Asistence vozidel · odtah, oprava', initials: 'Ko', bg: 'var(--blue-soft)', color: 'var(--blue)', asist: '+420 957 105 105', www: 'koop.cz' },
        { name: 'Allianz', role: 'Asistence · odtah, náhradní vozidlo', initials: 'Al', bg: 'var(--green-soft)', color: 'var(--green)', asist: '+420 241 170 000', www: 'allianz.cz' },
        { name: 'Generali Česká pojišťovna', role: 'Linka pomoci řidičům', initials: 'GČ', bg: 'var(--purple-soft)', color: 'var(--purple)', asist: '1224', www: 'generaliceska.cz' },
        { name: 'Česká podnikatelská pojišťovna (ČPP)', role: 'Asistence · Global Assistance', initials: 'ČP', bg: 'var(--amber-soft)', color: '#B45309', asist: '+420 266 799 779', alt: '1220', www: 'cpp.cz' },
        { name: 'UNIQA', role: 'Asistence · bezlimitní odtah ČR/SR', initials: 'UN', bg: '#E3F4F5', color: '#0E7C86', asist: '+420 246 059 444', www: 'uniqa.cz' },
        { name: 'ČSOB Pojišťovna', role: 'Asistence · 24 h / 365 dní', initials: 'ČS', bg: 'var(--star-soft)', color: 'var(--star-ink)', asist: '+420 466 100 777', alt: '1224', www: 'csobpoj.cz' },
      ] },
    ]
    return { contactGroups }
  }

  const DRV_STATUS = { active: { label: 'Aktivní', c: '#22C55E', bg: '#E7F9EE' }, inactive: { label: 'Neaktivní', c: '#64748B', bg: '#EEF2F9' } }
  const DRV_PAL = ['var(--blue)', 'var(--purple)', 'var(--green)', 'var(--amber)', 'var(--star)', '#0EA5A5']

  const driversVM = () => {
    if (state.route !== 'drivers') return {}
    const rows = driversData.map((d, i) => {
      const sm = DRV_STATUS[d.status]
      const pv = d.vehicleIds[0] ? vehiclesData.find((v) => v.id === d.vehicleIds[0]) : null
      return {
        id: d.id, name: d.name, initials: d.initials, position: d.position, kind: d.kind,
        employment: d.employment, phone: d.phone, vehicleCount: d.vehicleIds.length,
        primaryVehicle: pv ? `${pv.brand} ${pv.model} · ${pv.plate}` : '—',
        rpGroups: d.rp.groups, adr: d.adr,
        claimsCount: claimsData.filter((c) => d.vehicleIds.includes(c.vId)).length,
        statusLabel: sm.label, statusC: sm.c, statusBg: sm.bg, color: DRV_PAL[i % DRV_PAL.length],
        onClick: () => openDriver(d.id),
      }
    })
    const drStats = [
      { value: String(driversData.length), label: 'Řidičů celkem' },
      { value: String(driversData.filter((d) => d.status === 'active').length), label: 'Aktivních' },
      { value: String(driversData.filter((d) => d.kind === 'linka' || d.kind === 'mhd' || d.kind === 'dalkova').length), label: 'Řidičů autobusů' },
      { value: String(driversData.filter((d) => d.rp && d.rp.profValidTo).length), label: 'S profesní způsobilostí' },
    ]
    return { driverRows: rows, drStats }
  }

  const driverDetailVM = () => {
    if (state.route !== 'driver-detail') return {}
    const d = driversData.find((x) => x.id === state.driverId) || driversData[0]
    const sm = DRV_STATUS[d.status]
    const vehicles = d.vehicleIds.map((vid) => vehiclesData.find((v) => v.id === vid)).filter(Boolean).map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, druh: v.druh, fleetName: fleetName(v.fleet), onClick: () => openVehicle(v.id),
    }))
    const claims = claimsData.filter((c) => d.vehicleIds.includes(c.vId)).map(buildClaimRow)
    const personal = [['Datum narození', d.birth], ['Rodné číslo', d.rc], ['Adresa', d.address], ['Telefon', d.phone], ['E-mail', d.email]]
    const employment = [['Pozice', d.position], ['Pracovní poměr', d.employment], ['Ve firmě od', d.since], ['Číslo pracovní smlouvy', d.contractNo], ['Číslo účtu', d.bankAccount], ['Lékařská prohlídka', d.lekarska ? 'platná do ' + d.lekarska.validTo : 'nevyžaduje se']]
    const docStatus = (dateStr) => { const due = dueInfo(dateStr, 60); if (!due) return null; return due.expired ? { label: `propadlý · ${-due.days} dnů`, color: 'var(--star)', bg: 'var(--star-soft)', days: due.days } : due.days <= 60 ? { label: `končí za ${due.days} ${due.days === 1 ? 'den' : due.days < 5 ? 'dny' : 'dní'}`, color: '#B45309', bg: 'var(--amber-soft)', days: due.days } : { label: 'platný', color: 'var(--green)', bg: 'var(--green-soft)', days: due.days } }
    const worse = (a, b) => { if (!a) return b; if (!b) return a; return a.days <= b.days ? a : b }
    const rpStatus = worse(docStatus(d.rp.validTo), d.rp.profValidTo ? docStatus(d.rp.profValidTo) : null)
    const idDocs = [
      { title: 'Občanský průkaz (OP)', icon: ic('user1', 18), color: 'var(--blue)', bg: 'var(--blue-soft)', status: docStatus(d.op.validTo), rows: [['Číslo OP', d.op.number], ['Platnost do', d.op.validTo]] },
      { title: 'Řidičský průkaz (ŘP)', icon: ic('car', 18), color: 'var(--green)', bg: 'var(--green-soft)', status: rpStatus, rows: [['Číslo ŘP', d.rp.number], ['Skupiny', d.rp.groups], ['Platnost do', d.rp.validTo], ['Profesní způsobilost', d.rp.profValidTo ? 'do ' + d.rp.profValidTo : 'nevyžaduje se']] },
    ]
    if (d.tachoCard) idDocs.push({ title: 'Karta řidiče (tachograf)', icon: ic('hash', 18), color: 'var(--purple)', bg: 'var(--purple-soft)', status: docStatus(d.tachoCard.validTo), rows: [['Číslo karty', d.tachoCard.number], ['Platnost do', d.tachoCard.validTo]] })
    if (d.lekarska) idDocs.push({ title: 'Lékařská prohlídka řidiče', icon: ic('shield', 18), color: 'var(--green)', bg: 'var(--green-soft)', status: docStatus(d.lekarska.validTo), rows: [['Typ', 'Pravidelná prohlídka (§ 87 z. 361/2000)'], ['Platnost do', d.lekarska.validTo]] })
    const files = [
      { name: `Pracovní smlouva ${d.contractNo}.pdf`, type: 'Pracovní smlouva', color: 'var(--blue)' },
      { name: `Kopie OP ${d.name}.pdf`, type: 'Občanský průkaz', color: 'var(--green)' },
      { name: `Kopie ŘP ${d.rp.number}.pdf`, type: 'Řidičský průkaz', color: 'var(--green)' },
      { name: `Mzdový list.pdf`, type: 'Mzdy', color: 'var(--purple)' },
    ]

    // ---- Výkon a chování řidiče (modelováno pro ukázku, deterministicky dle id) ----
    const perf = buildDriverPerf(d)
    perf.goAnomalies = () => openAnomalies({ anoDriver: d.id })

    return { dd: { ...d, statusLabel: sm.label, statusC: sm.c, statusBg: sm.bg, vehicles, claims, personal, employment, idDocs, files, perf, goDrivers: () => navigate('drivers') } }
  }

  const financingVM = () => {
    if (state.route !== 'financing') return {}
    const num = (s) => parseInt(String(s || '').replace(/[^\d]/g, ''), 10) || 0
    const fmt = (n) => n.toLocaleString('cs-CZ') + ' Kč'
    const milF = (n) => (n / 1e6).toFixed(1).replace('.', ',')
    const fin = vehiclesData.filter((v) => v.financing && v.financing.active)
    const own = vehiclesData.length - fin.length
    const TYPES = [
      { key: 'bank_loan', label: 'Účelový úvěr', color: 'var(--blue)', bg: 'var(--blue-soft)', icon: ic('banknote', 22) },
      { key: 'finance_lease', label: 'Finanční leasing', color: 'var(--green)', bg: 'var(--green-soft)', icon: ic('refresh', 22) },
      { key: 'operating_lease', label: 'Operativní leasing', color: 'var(--purple)', bg: 'var(--purple-soft)', icon: ic('car', 22) },
    ]
    const finByType = TYPES.map((t) => {
      const list = fin.filter((v) => v.financing.type === t.key)
      return { ...t, count: list.length, monthlyF: fmt(list.reduce((a, v) => a + num(v.financing.monthlyPayment), 0)), pct: Math.round(list.length / vehiclesData.length * 100) }
    })
    const provMap = {}
    fin.forEach((v) => { const p = v.financing.provider; if (!provMap[p]) provMap[p] = { count: 0, monthly: 0, type: v.financing.typeLabel }; provMap[p].count++; provMap[p].monthly += num(v.financing.monthlyPayment) })
    const finProviders = Object.entries(provMap).map(([name, x]) => ({ name, type: x.type, count: x.count, monthlyF: fmt(x.monthly) })).sort((a, b) => b.count - a.count)
    const totalMonthly = fin.reduce((a, v) => a + num(v.financing.monthlyPayment), 0)
    const totalFinanced = fin.reduce((a, v) => a + num(v.financing.financedAmount), 0)
    const typeMeta = { bank_loan: ['Úvěr', 'var(--blue)', 'var(--blue-soft)'], finance_lease: ['Fin. leasing', 'var(--green)', 'var(--green-soft)'], operating_lease: ['Op. leasing', 'var(--purple)', 'var(--purple-soft)'] }
    const ending = financingEnding(90)
    const endMap = Object.fromEntries(ending.map((x) => [x.v.id, x.daysToEnd]))
    const finRows = fin.map((v) => {
      const tm = typeMeta[v.financing.type]
      const dte = endMap[v.id]
      return { id: v.id, vehicle: `${v.brand} ${v.model}`, plate: v.plate, provider: v.financing.provider, monthly: v.financing.monthlyPayment, endDate: v.financing.endDate, daysToEnd: dte === undefined ? null : dte, endingSoon: Object.prototype.hasOwnProperty.call(endMap, v.id), typeShort: tm[0], typeColor: tm[1], typeBg: tm[2], onClick: () => openVehicle(v.id), onRfq: (e) => { e.stopPropagation(); openRfq(v) } }
    }).sort((a, b) => {
      if (a.endingSoon !== b.endingSoon) return a.endingSoon ? -1 : 1
      if (a.endingSoon && b.endingSoon) return a.daysToEnd - b.daysToEnd
      return a.typeShort.localeCompare(b.typeShort) || b.id.localeCompare(a.id)
    })
    const finStats = [
      { value: String(fin.length), label: 'Financovaných vozidel', note: `z ${vehiclesData.length} celkem` },
      { value: fmt(totalMonthly), label: 'Měsíční splátky celkem' },
      { value: milF(totalFinanced), unit: 'mil. Kč', label: 'Objem financování' },
      { value: String(ending.length), label: 'Končí do 90 dnů', note: ending.length ? 'vyžadují řešení' : 'žádné' },
    ]
    const rfqList = state.rfqs.map((q) => ({
      id: q.id, vehicle: q.vehicle, plate: q.plate, typeLabel: q.typeLabel, sentLabel: q.sentLabel, partnerCount: q.partnerCount, status: q.status,
      paramsSummary: `${q.term} měs · akontace ${q.akontPct} %${q.type === 'operating_lease' ? ` · ${q.mileage}` : ''}`,
      offers: q.offers.map((o) => ({ ...o, isAccepted: q.accepted === o.partnerId, onAccept: () => acceptOffer(q.id, o.partnerId) })),
      acceptedName: q.accepted ? ((q.offers.find((o) => o.partnerId === q.accepted) || {}).partner || '') : null,
    }))
    return { finStats, finByType, finProviders, finRows, finTotalMonthly: fmt(totalMonthly), finEndingCount: ending.length, finTab: state.finTab, setFinTab: (t) => setState({ finTab: t }), rfqList, rfqCount: state.rfqs.length }
  }

  const rfqVM = () => {
    const d = state.rfq
    if (!d) return { rfqModal: null }
    const typeOpts = [{ v: 'operating_lease', l: 'Operativní leasing' }, { v: 'bank_loan', l: 'Účelový úvěr' }, { v: 'finance_lease', l: 'Finanční leasing' }]
    const termOpts = [36, 48, 54, 60, 72].map((n) => ({ v: String(n), l: `${n} měsíců` }))
    const akontOpts = [0, 10, 20, 30].map((n) => ({ v: String(n), l: `${n} %` }))
    const mileageOpts = ['100 000 km/rok', '120 000 km/rok', '140 000 km/rok', '160 000 km/rok'].map((x) => ({ v: x, l: x }))
    const partners = leasingPartners.filter((p) => p.types.includes(d.type)).map((p) => ({ id: p.id, name: p.name, on: !!d.partners[p.id] }))
    const selCount = partners.filter((p) => p.on).length
    return {
      rfqModal: {
        close: () => setState({ rfq: null }), stop: (e) => e.stopPropagation(),
        vehicle: d.vehicle, plate: d.plate, isOp: d.type === 'operating_lease', priceF: rfqFmt(d.priceN), services: d.services,
        edit: d.edit, setEdit: (b) => setRfq({ edit: b }),
        type: d.type, typeLabel: FIN_TYPE_LABEL[d.type],
        onType: (e) => { const t = e.target.value; const np = {}; leasingPartners.filter((p) => p.types.includes(t)).slice(0, 5).forEach((p) => { np[p.id] = true }); setRfq({ type: t, partners: np }) },
        term: String(d.term), onTerm: (e) => setRfq({ term: +e.target.value }), termLabel: `${d.term} měsíců`,
        akontPct: String(d.akontPct), onAkont: (e) => setRfq({ akontPct: +e.target.value }), akontLabel: `${d.akontPct} %`,
        mileage: d.mileage, onMileage: (e) => setRfq({ mileage: e.target.value }),
        typeOpts, termOpts, akontOpts, mileageOpts, partners, selCount, togglePartner: toggleRfqPartner,
        send: sendRfq, canSend: selCount > 0,
      },
    }
  }

  const settingsVM = () => {
    if (state.route !== 'settings') return {}
    const p = state.pref
    const tg = (k) => setState((s) => ({ pref: { ...s.pref, [k]: !s.pref[k] } }))
    const row = (k, title, sub) => { const on = p[k]; return { title, sub, toggle: () => tg(k), trackStyle: `width:42px;height:24px;border-radius:20px;background:${on ? 'var(--blue)' : '#D4D4D8'};padding:2px;cursor:pointer;transition:background .15s;display:flex`, knobStyle: `width:20px;height:20px;border-radius:50%;background:#fff;transition:transform .15s;transform:translateX(${on ? '18px' : '0'})` } }
    const settingRows = [
      row('renewal', 'Obnovy smluv', 'Upozornění 30 dní před obnovou'),
      row('claim', 'Pojistné události', 'Změny stavu likvidace'),
      row('docs', 'Chybějící dokumenty', 'Zelená karta, STK, technický průkaz'),
      row('email', 'E-mailové souhrny', 'Týdenní report stavu flotily'),
      row('sms', 'SMS notifikace', 'Kritické události a havárie'),
    ]
    const auditRows = state.audit.slice(0, 30).map((a) => ({ ...a, meta: AUDIT_META[a.action] || AUDIT_META.update }))
    return { settingRows, auditRows, auditCount: state.audit.length }
  }

  const bonifikaceVM = () => {
    if (state.route !== 'bonifikace') return {}
    const bonifList = allFleets.map((f) => {
      const bonus = f.bonus || DEFAULT_BONUS
      const lr = f.lossRatio ?? 0
      const tier = bonus.find((x) => lr <= x.threshold)
      const rate = tier ? tier.rate : 0
      return {
        id: f.id,
        insurer: f.insurers[0], policy: f.policy || '—',
        lossRatio: lr, lrColor: lrColorFor(lr),
        rateLabel: tier ? tier.rate + ' %' : '—', rateActive: !!tier,
        rebateF: tier ? czk(Math.round(f.premium * rate / 100)) : '—',
        onClick: () => navigate('bonifikace-detail', { fleetId: f.id }),
      }
    })
    const bonifExport = {
      filename: 'bonifikace', title: 'Bonifikace',
      columns: [{ key: 'pojistitel', label: 'Pojistitel' }, { key: 'smlouva', label: 'Číslo smlouvy' }, { key: 'skodni', label: 'Škodní průběh' }, { key: 'bonifikace', label: 'Bonifikace' }, { key: 'objem', label: 'Vrací se ročně' }],
      rows: bonifList.map((b) => ({ pojistitel: b.insurer, smlouva: b.policy, skodni: b.lossRatio + ' %', bonifikace: b.rateActive ? b.rateLabel + ' z pojistného' : 'bez nároku', objem: b.rateActive ? b.rebateF : '—' })),
    }
    return { bonifList, bonifExport }
  }

  const bonifikaceDetailVM = () => {
    if (state.route !== 'bonifikace-detail') return {}
    const f = allFleets.find((x) => x.id === state.fleetId) || allFleets[0]
    const bonus = f.bonus || DEFAULT_BONUS
    const lr = f.lossRatio ?? 0
    const activeTier = bonus.find((x) => lr <= x.threshold)
    const base = f.premium
    const tiers = bonus.map((t, i) => {
      const active = activeTier && t.threshold === activeTier.threshold
      return {
        label: `Škodní průběh do ${t.threshold} %`,
        desc: `Pojišťovna vrací ${t.rate} % z pojistného`,
        rate: t.rate + ' %', active,
        badge: active ? 'Aktuální pásmo' : '',
        rowStyle: `display:flex;align-items:center;gap:14px;padding:15px 18px;${i < bonus.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}background:${active ? 'var(--green-soft)' : '#fff'}`,
        rateStyle: `font-size:20px;font-weight:800;letter-spacing:-.5px;color:${active ? 'var(--green)' : 'var(--ink2)'}`,
        dotStyle: `width:10px;height:10px;border-radius:50%;flex-shrink:0;background:${active ? 'var(--green)' : '#D4D4D8'}`,
      }
    })
    const activeRate = activeTier ? activeTier.rate : 0
    const rebate = Math.round(base * activeRate / 100)
    return {
      bd: {
        name: f.name, insurer: f.insurers[0], policy: f.policy || '—', policyStart: f.policyStart || '—',
        lossRatio: lr, lrColor: lrColorFor(lr), tiers,
        premiumF: czk(base), rebateF: czk(rebate), hasActive: !!activeTier, activeRate,
        note: activeTier
          ? `Při aktuálním škodním průběhu ${lr} % spadá smlouva do pásma „do ${activeTier.threshold} %" — pojišťovna vrací ${activeTier.rate} % z pojistného, tj. odhadem ${czk(rebate)} ročně.`
          : `Při aktuálním škodním průběhu ${lr} % nárok na bonifikaci nevzniká (přesahuje nejvyšší pásmo ${bonus[bonus.length - 1].threshold} %).`,
        goBack: () => navigate('bonifikace'),
      },
    }
  }

  const addVehicleVM = () => {
    if (!state.av) return {}
    const step = state.avStep; const done = step > 3
    // Druh vozidla se tahá z registru (samostatné pole). Vozový park = lokalita;
    // předvyplní se park klienta (když má jen jeden), lze změnit.
    const f = allFleets.find((x) => x.id === state.avFleet) || allFleets[0]
    const labels = ['Zadání vozidla', 'Údaje o vozidle', 'Pojistné krytí']
    const steps = [1, 2, 3].map((i) => ({ color: i <= step ? 'var(--blue)' : '#E8E8EB' }))
    const m = state.avMethod
    const methodDefs = [
      ['spz', 'plate', 'SPZ', 'Zadejte státní poznávací značku'],
      ['doklad', 'upload', 'Technický průkaz', 'Nahrajte fotografii obou stran technického průkazu'],
      ['vin', 'hash', 'VIN', 'Zadejte 17znakový VIN kód vozidla'],
    ]
    const methods = methodDefs.map(([id, icn, title, desc]) => {
      const on = m === id
      return {
        title, desc,
        icon: id === 'spz' ? ic('car', 22) : id === 'doklad' ? ic('upload', 22) : ic('hash', 22),
        iconStyle: `width:46px;height:46px;border-radius:12px;display:flex;align-items:center;justify-content:center;background:${on ? 'var(--blue)' : 'var(--blue-soft)'};color:${on ? '#fff' : 'var(--blue)'}`,
        onClick: () => setState({ avMethod: id, avLoaded: false }),
        style: `border:1.5px solid ${on ? 'var(--blue)' : 'var(--border2)'};background:${on ? 'var(--blue-soft)' : '#fff'};border-radius:14px;padding:18px 16px;cursor:pointer;transition:.12s`,
      }
    })
    const loaded = { brand: 'Škoda', model: 'Octavia Combi 2.0 TDI', plate: m === 'vin' ? '—' : (state.avInput || '5SK 8841').toUpperCase(), vin: 'TMBJJ7NE5P0123456' }
    // Údaje z registru → read-only. Editovatelné (SPZ, hodnota) jsou zvlášť.
    const regFields = [
      ['Značka', 'Škoda'], ['Model', 'Octavia Combi'], ['Druh vozidla', 'Osobní automobil'],
      ['Rok výroby', '2023'], ['Palivo', 'Diesel'], ['Objem / výkon', '1 968 cm³ / 110 kW'],
      ['Převodovka', 'Automat DSG'], ['VIN', loaded.vin], ['STK platná do', '14. 4. 2027'],
    ].map(([label, value]) => ({ label, value }))
    const coverDefs = [
      ['pr', 'Povinné ručení', 'Zákonné pojištění odpovědnosti', [['Limit', state.avPrLimit]]],
      ['hav', 'Havarijní pojištění', 'All-risk krytí vozidla', [['Rozsah', 'All-risk'], ['Spoluúčast', state.avHavSpoluucast]]],
      ['skla', 'Pojištění skel', null, [['Limit', '30 000 Kč']]],
      ['uraz', 'Úrazové pojištění', 'Řidič a posádka', [['Násobek', '3×']]],
      ['zver', 'Střet se zvěří', null, [['Limit', '100 000 Kč']]],
      ['nahradni', 'Náhradní vozidlo', null, [['Limit', '15 dní']]],
      ['zavazadla', 'Zavazadla', null, [['Limit', '20 000 Kč']]],
      ['gap', 'GAP', 'Doplnění hodnoty při totální škodě', null],
      ['zivel', 'Živelní pojištění', null, null],
      ['asist', 'Nadstandardní asistence', 'Odtah, vyproštění, náhradní doprava', null],
      ['strojni', 'Strojní pojištění', null, [['Limit', 'Zadat']]],
      ['prac', 'Činnost pracovního stroje', null, null],
    ]
    const cov = state.avCover
    const covers = coverDefs.map(([id, label, note, params], i) => {
      const on = !!cov[id]
      return {
        label, note,
        toggle: () => setState((s) => ({ avCover: { ...s.avCover, [id]: !s.avCover[id] } })),
        boxStyle: `width:20px;height:20px;border-radius:6px;flex-shrink:0;display:flex;align-items:center;justify-content:center;color:#fff;border:1.5px solid ${on ? 'var(--blue)' : '#CFCFD4'};background:${on ? 'var(--blue)' : '#fff'}`,
        checkIcon: on ? ic('check', 13, 2.5) : null,
        titleColor: on ? 'var(--ink)' : 'var(--ink2)',
        hasParams: on && !!params, params: params ? params.map(([label, value]) => ({ label, value })) : [],
        rowStyle: `display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px 14px;padding:13px 16px;${i < coverDefs.length - 1 ? 'border-bottom:1px solid var(--border);' : ''}background:${on ? '#FAFBFD' : '#fff'}`,
      }
    })
    const coverCount = Object.values(cov).filter(Boolean).length
    const base = 4200
    const est = Object.entries(cov).reduce((a, [k, v]) => { if (!v) return a; const add = { pr: 9800, hav: 14600, skla: 2400, uraz: 1900, zver: 1200, nahradni: 1600, zavazadla: 900, gap: 3200, zivel: 1400, asist: 1100, strojni: 2600, prac: 800 }; return a + (add[k] || 0) }, 0)
    const estimate = (est + base).toLocaleString('cs-CZ') + ' Kč'
    const last = step === 3
    return {
      av: true,
      avUziti: state.avUziti,
      avInput: state.avInput,
      avm: {
        close: () => setState({ av: false }), stop: (e) => e.stopPropagation(),
        fleetName: f.name, fleetId: state.avFleet,
        fleetOptions: allFleets.map((x) => ({ v: x.id, l: x.name })),
        onFleetChange: (e) => setState({ avFleet: e.target.value }),
        // Pojistník / vlastník / provozovatel — vlastník i provozovatel mohou být
        // jiná osoba (typicky leasingovka jako vlastník u financovaných vozů).
        pojistnik: state.avPojistnik, onPojistnik: (e) => setState({ avPojistnik: e.target.value }),
        start: state.avStart, onStart: (e) => setState({ avStart: e.target.value }),
        uziti: state.avUziti, onUziti: (e) => setState({ avUziti: e.target.value }),
        uzitiOptions: ['Běžné užití', 'Taxi / přeprava osob', 'Autoškola', 'Půjčovna / sdílení vozidel', 'Vozidlo IZS', 'Přeprava nebezpečných věcí (ADR)'],
        territory: state.avTerritory, onTerritory: (e) => setState({ avTerritory: e.target.value }),
        territoryOptions: ['Česká republika', 'Evropská unie', 'Mimo EU (celá geografická Evropa)'],
        ownerSubj: subjBundle('Owner'), operatorSubj: subjBundle('Operator'),
        stepLabel: done ? 'Hotovo' : `Krok ${step} ze 3 · ${labels[step - 1]}`, steps,
        s1: step === 1, s2: step === 2, s3: step === 3, isDone: done,
        methods, isUpload: m === 'doklad', isField: m !== 'doklad',
        fieldBadge: m === 'vin' ? 'VIN' : 'CZ', fieldPlaceholder: m === 'vin' ? 'Zadejte VIN' : 'Zadejte SPZ',
        onInput: (e) => setState({ avInput: e.target.value }),
        load: () => setState({ avLoaded: true, avStep: 2 }), loadLabel: 'Načíst z registru',
        uploadIcon: ic('upload', 22), infoIcon: ic('info', 16), checkBadge: ic('check', 16, 2.5),
        bigCar: ic('car', 26), bigCheck: ic('check', 30, 2.5),
        loaded, regFields, covers, coverCount, estimate,
        // SPZ + hodnota vozidla jsou editovatelné; cena má AI ocenění.
        plate: state.avPlate || loaded.plate, onPlate: (e) => setState({ avPlate: e.target.value.toUpperCase() }),
        value: state.avValue || '640 000 Kč', onValue: (e) => setState({ avValue: e.target.value }),
        pricing: state.avPricing,
        runValuation: () => { setState({ avPricing: 'loading' }); setTimeout(() => setState({ avPricing: 'done', avValue: '612 000 Kč' }), 900) },
        priceNote: 'Tržní odhad AI · rozpětí 585–640 tis. Kč — dle stáří, výbavy, nájezdu a aktuálního trhu.',
        back: () => (step === 1 || done) ? setState({ av: false }) : setState((s) => ({ avStep: s.avStep - 1 })),
        backStyle: `font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;${(step === 1 || done) ? 'visibility:hidden' : ''}`,
        next: () => { if (done) { setState({ av: false }); showToast(`${loaded.brand} ${loaded.model} přidáno do parku ${f.name}.`); return } setState((s) => ({ avStep: s.avStep + 1 })) },
        nextLabel: done ? 'Zavřít' : (last ? 'Přidat vozidlo' : 'Pokračovat'),
        nextStyle: `height:40px;padding:0 22px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;color:#fff;background:${(last || done) ? 'var(--green)' : 'var(--blue)'}`,
      },
    }
  }

  const claimDetailVM = () => {
    if (state.route !== 'claim-detail') return {}
    const c = claimsData.find((x) => x.id === state.claimId) || claimsData[0]
    const v = vehiclesData.find((x) => x.id === c.vId) || {}
    const cm = claimStatusMeta[c.status]
    const rm = RISK_META[c.risk] || { bg: '#F1F1F3', c: 'var(--ink2)' }
    const riskFull = { POV: 'Povinné ručení', HAV: 'Havarijní pojištění', Skla: 'Pojištění skel' }[c.risk] || c.risk
    const parseCz = (s) => { const p = (s || '').replace(/\s/g, '').split('.').map(Number); return new Date(p[2], p[1] - 1, p[0]) }
    const fmt = (dt) => `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`
    const addDays = (s, n) => { const dt = parseCz(s); dt.setDate(dt.getDate() + n); return fmt(dt) }

    const facts = [
      { k: 'Vozidlo', v: `${v.brand} ${v.model}` }, { k: 'SPZ', v: v.plate }, { k: 'VIN', v: v.vin },
      { k: 'Riziko', v: riskFull }, { k: 'Pojišťovna', v: c.insurer }, { k: 'Číslo smlouvy', v: fleetInsurerPolicy(c.insurer, v.fleet || 'f1') },
      { k: 'Nahlásil', v: c.reportedBy }, { k: 'Datum nahlášení', v: c.date }, { k: 'Místo události', v: c.location },
      { k: 'Likvidátor', v: c.adjuster }, { k: 'Servis', v: c.shop }, { k: 'Policie ČR', v: c.police ? 'Ano' : 'Ne' },
    ]
    const D = (name, type, size, icon, bg, color) => ({ name, type, size, icon: ic(icon, 17), bg, color, preview: ic('search', 16), download: ic('arrow', 16), openPreview: () => setState({ docPreview: { kind: 'claimdoc', name, type, size, claimId: c.id, plate: v.plate, brand: v.brand, model: v.model, insurer: c.insurer, date: c.date } }) })
    const docs = [
      D('Oznámení pojistné události.pdf', 'Oznámení', '142 kB', 'alert', 'var(--star-soft)', 'var(--star)'),
      D('Fotodokumentace poškození.pdf', 'Fotodokumentace', '3,4 MB', 'camera', 'var(--blue-soft)', 'var(--blue)'),
      ...(c.police ? [D('Policejní protokol.pdf', 'Protokol Policie ČR', '268 kB', 'doc2', '#F1F1F3', 'var(--ink2)')] : []),
      ...(c.progress >= 50 ? [D('Protokol o prohlídce vozidla.pdf', 'Prohlídka', '210 kB', 'check2', 'var(--green-soft)', 'var(--green)')] : []),
      ...(c.shop !== '—' && c.progress >= 80 ? [D('Faktura za opravu.pdf', 'Faktura', '186 kB', 'banknote', 'var(--amber-soft)', 'var(--amber)')] : []),
      ...(c.payout > 0 ? [D('Rozhodnutí o pojistném plnění.pdf', 'Rozhodnutí', '120 kB', 'shield', 'var(--green-soft)', 'var(--green)')] : []),
    ]

    const stepDefs = [
      { t: 'Nahlášení události', date: c.date, desc: `Škodu nahlásil ${c.reportedBy} · ${c.insurer}`, th: 0, icon: 'alert' },
      { t: 'Přiřazení likvidátora', date: c.adjuster === 'Nepřiřazen' ? '—' : addDays(c.date, 1), desc: c.adjuster === 'Nepřiřazen' ? 'Čeká na přiřazení likvidátora' : `Likvidátor ${c.adjuster}`, th: 15, icon: 'user1' },
      { t: 'Prohlídka a fotodokumentace', date: addDays(c.date, 3), desc: 'Doložena fotodokumentace poškození vozidla', th: 30, icon: 'camera' },
      { t: 'Stanovení výše škody', date: addDays(c.date, 5), desc: `Odhad škody ${czk(c.estimate)}`, th: 50, icon: 'doc2' },
      { t: c.shop !== '—' ? 'Oprava v servisu' : 'Likvidace události', date: addDays(c.date, 8), desc: c.shop !== '—' ? c.shop : 'Probíhá likvidace u pojišťovny', th: 70, icon: 'wrench' },
      { t: 'Výplata pojistného plnění', date: c.payout > 0 ? addDays(c.date, 12) : '—', desc: c.payout > 0 ? `Vyplaceno ${czk(c.payout)}` : 'Dosud nevyplaceno', th: 100, icon: 'banknote' },
    ]
    const aiPartsDef = (() => {
      const t = (c.type + ' ' + c.description).toLowerCase()
      if (t.includes('sklo')) return [['Čelní / boční sklo', 'Prasklé', 97], ['Těsnění skla', 'Lehké poškození', 63]]
      if (t.includes('krupob')) return [['Kapota', 'Mnohočetné promáčkliny', 95], ['Střecha', 'Promáčkliny', 92], ['Víko kufru', 'Promáčkliny', 86]]
      if (t.includes('odcizení') || t.includes('kol')) return [['Kola z lehkých slitin (4×)', 'Odcizeno', 99], ['Brzdové třmeny', 'Poškrábáno', 58]]
      if (t.includes('zvěř')) return [['Přední maska', 'Rozbitá', 96], ['Chladič', 'Deformovaný', 90], ['Kapota', 'Promáčknutá', 83]]
      if (t.includes('parkov') || t.includes('třetí')) return [['Zadní nárazník', 'Promáčknutý', 94], ['Páté dveře', 'Škrábance + promáčklina', 81]]
      return [['Přední nárazník', 'Deformovaný', 96], ['Kapota', 'Promáčknutá', 91], ['Levý světlomet', 'Rozbitý', 88], ['Chladič', 'Poškozený', 74]]
    })()
    const e = c.estimate
    const dily = Math.round(e * 0.56 / 100) * 100
    const prace = Math.round(e * 0.30 / 100) * 100
    const lak = e - dily - prace
    const ai = {
      confidence: Math.round(aiPartsDef.reduce((a, p) => a + p[2], 0) / aiPartsDef.length),
      parts: aiPartsDef.map((p) => ({ name: p[0], severity: p[1], confidence: p[2], barColor: p[2] >= 90 ? 'var(--star)' : p[2] >= 70 ? 'var(--amber)' : 'var(--ink3)' })),
      items: [
        { k: 'Náhradní díly', d: `${aiPartsDef.length} položek`, v: czk(dily) },
        { k: 'Práce (demontáž / montáž)', d: `${Math.max(1, Math.round(prace / 750))} NH`, v: czk(prace) },
        { k: 'Lakování a materiál', d: '', v: czk(lak) },
      ],
      totalF: czk(e),
    }

    let currentSet = false
    const timeline = stepDefs.map((s) => {
      const done = c.progress >= s.th
      let st = 'pending'
      if (done) st = 'done'; else if (!currentSet) { st = 'current'; currentSet = true }
      const col = st === 'done' ? { bg: 'var(--green-soft)', c: 'var(--green)' } : st === 'current' ? { bg: 'var(--amber-soft)', c: 'var(--amber)' } : { bg: '#F1F1F3', c: 'var(--ink3)' }
      return { title: s.t, date: s.date, desc: s.desc, icon: ic(s.icon, 16), tileBg: col.bg, tileColor: col.c, state: st, badge: st === 'current' ? 'Probíhá' : '' }
    })

    return {
      cd: {
        id: c.id, type: c.type, statusLabel: cm.label,
        chipStyle: `display:inline-flex;align-items:center;font-size:12px;font-weight:600;color:${cm.c};background:${cm.bg};padding:4px 11px;border-radius:20px;white-space:nowrap`,
        risk: c.risk, riskLabel: riskFull, riskStyle: `display:inline-flex;align-items:center;font-size:11.5px;font-weight:700;color:${rm.c};background:${rm.bg};padding:4px 10px;border-radius:6px;white-space:nowrap`,
        facts, description: c.description, location: c.location, docs, photoCount: 6, timeline, ai,
        estimateF: czk(c.estimate), payoutF: c.payout > 0 ? czk(c.payout) : '—', paid: c.payout > 0, progress: c.progress,
        plate: v.plate, brand: v.brand, model: v.model,
        goVehicle: () => openVehicle(c.vId), goBack: () => navigate('claims'),
        reportClaim: null,
      },
    }
  }

  const wizardVM = () => {
    if (!state.claimWizard) return {}
    const step = state.claimStep; const done = step > 6
    const labels = ['Popis události', 'Fotodokumentace', 'Policejní zpráva', 'Místo události', 'Vozidlo a řidič', 'Shrnutí']
    const steps = [1, 2, 3, 4, 5, 6].map((i) => ({ color: i <= Math.min(step, 6) ? 'var(--star)' : '#ECECEE' }))
    const types = ['Havárie', 'Parkovací škoda', 'Sklo', 'Krupobití', 'Odcizení', 'Střet se zvěří'].map((t) => { const on = state.cwType === t; return { label: t, onClick: () => setState({ cwType: t }), style: `padding:11px 10px;border-radius:10px;text-align:center;font-size:12.5px;font-weight:600;cursor:pointer;border:1.5px solid ${on ? 'var(--star)' : 'var(--border2)'};background:${on ? 'var(--star-soft)' : '#fff'};color:${on ? 'var(--star-ink)' : 'var(--ink2)'}` } })
    const vehiclePick = vehiclesData.slice(0, 4).map((v) => { const on = state.cwVehicle === v.id; return { plate: v.plate, name: v.brand + ' ' + v.model, driver: v.driver, onClick: () => setState({ cwVehicle: v.id }), style: `display:flex;align-items:center;gap:12px;padding:11px 13px;border-radius:11px;cursor:pointer;border:1.5px solid ${on ? 'var(--blue)' : 'var(--border2)'};background:${on ? 'var(--blue-soft)' : '#fff'}`, radio: `width:18px;height:18px;border-radius:50%;border:5px solid ${on ? 'var(--blue)' : '#D4D4D8'};flex-shrink:0;${on ? 'box-shadow:inset 0 0 0 2px #fff' : ''}` } })
    const v = vehiclesData.find((x) => x.id === state.cwVehicle)
    const summary = [
      { k: 'Typ události', v: state.cwType },
      { k: 'Vozidlo', v: v.plate + ' · ' + v.brand + ' ' + v.model },
      { k: 'Řidič', v: v.driver },
      { k: 'Pojišťovna', v: v.insurer },
      { k: 'Místo', v: 'Praha 4, Jižní spojka' },
    ]
    const last = step >= 6
    return {
      cw: {
        steps, stepLabel: done ? 'Hotovo' : ('Krok ' + step + ' z 6 · ' + labels[step - 1]),
        isDone: done, s1: step === 1, s2: step === 2, s3: step === 3, s4: step === 4, s5: step === 5, s6: step === 6,
        types, vehiclePick, summary,
        camera: ic('camera', 22), fileIcon: ic('file', 18), check: ic('check', 12, 2.5), pin: ic('mapPin', 40),
        carSm: ic('car', 16), sparkle: ic('sparkle', 16), bigCheck: ic('check', 30, 2.5), photos: [ic('camera', 20), ic('camera', 20), ic('camera', 20), ic('plus', 20)],
        back: () => done ? setState({ claimWizard: false }) : setState((s) => ({ claimStep: Math.max(1, s.claimStep - 1) })),
        backStyle: `font-size:13px;font-weight:600;color:var(--ink3);cursor:pointer;${(step === 1 || done) ? 'visibility:hidden' : ''}`,
        next: () => done ? setState({ claimWizard: false }) : setState((s) => ({ claimStep: s.claimStep + 1 })),
        nextLabel: done ? 'Zavřít' : (last ? 'Odeslat událost' : 'Pokračovat'),
        nextStyle: `height:40px;padding:0 20px;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer;display:flex;align-items:center;color:#fff;background:${(last || done) ? 'var(--star)' : 'var(--blue)'}`,
      },
    }
  }

  // Hodnoty KPI dlaždic (počítají se jen na dashboardu a v nastavení)
  const kpiNeed = state.route === 'dashboard' || state.route === 'settings'
  const kpiVals = !kpiNeed ? {} : (() => {
    const total = vehiclesData.length
    const hav = vehiclesData.filter((v) => v.cov && v.cov.hav).length
    const skla = vehiclesData.filter((v) => v.cov && v.cov.skla).length
    const asist = vehiclesData.filter((v) => v.cov && v.cov.asist).length
    const cT = claimsData.length
    const cO = claimsData.filter((c) => c.status !== 'closed').length
    const reserve = claimsData.reduce((a, c) => a + (c.estimate || 0), 0)
    const financed = vehiclesData.filter((v) => v.financing && v.financing.active).length
    const finVol = vehiclesData.filter((v) => v.financing && v.financing.active).reduce((a, v) => a + parseInt(String(v.financing.financedAmount || '').replace(/[^\d]/g, ''), 10) || 0, 0)
    const stk = vehiclesData.filter((v) => { const d = dueInfo(vehicleStk(v)); return d && d.days <= 60 }).length
    const vig = vehiclesData.filter((v) => { const vg = vehicleVignette(v); if (!vg) return false; const d = dueInfo(vg.validTo); return d && d.days <= 60 }).length
    return {
      vehicles: { value: String(total), icon: 'car', trend: '+4 %', dir: 'up', trendColor: 'var(--green)', note: `${typeCats.length} typů · ${allFleets.length} ${allFleets.length === 1 ? 'park' : 'parky'}` },
      hav: { value: String(hav), icon: 'shield', note: 'plné krytí' },
      pov: { value: String(total - hav), icon: 'shield', note: 'základní krytí' },
      skla: { value: String(skla), icon: 'glass', note: 'doplňkové krytí' },
      asist: { value: String(asist), icon: 'wrench', note: 'doplňkové krytí' },
      claims: { value: String(cT), icon: 'alert', note: `${cO} otevřených` },
      claimsOpen: { value: String(cO), icon: 'alert', note: `rezervy ${czk(reserve)}` },
      financed: { value: String(financed), icon: 'banknote', note: 'úvěr / leasing' },
      finEnding: { value: String(financingEnding(90).length), icon: 'banknote', note: 'smlouvy do 90 dnů' },
      finVolume: { value: (finVol / 1e6).toFixed(1).replace('.', ','), unit: 'mil. Kč', icon: 'banknote', note: 'financováno' },
      stk: { value: String(stk), icon: 'check2', note: 'do 60 dnů / po platnosti' },
      vignette: { value: String(vig), icon: 'doc2', note: 'do 60 dnů / po platnosti' },
      drivers: { value: String(driversData.length), icon: 'users', trend: '+8 %', dir: 'up', trendColor: 'var(--green)', note: `${driversData.filter((d) => d.status === 'active').length} aktivních` },
      premium: { value: '—', icon: 'shield', note: 'čeká na napojení' },
    }
  })()
  const kpiLabel = Object.fromEntries(KPI_CATALOG.map((k) => [k.id, k.label]))
  const dashKpis = state.kpi.filter((k) => k.on).map((k) => ({ label: kpiLabel[k.id], ...(kpiVals[k.id] || { value: '—' }) }))

  const linkyVM = () => {
    if (state.route !== 'linky') return {}
    const rows = linesData.map((l) => {
      const sim = simulateLineRun(l)
      const drv = busDrivers.find((d) => d.id === l.driverId)
      const bus = vehiclesData.find((v) => v.id === l.busId)
      const dScore = drv ? ecoScore(drv.tele) : null
      const anomalies = (sim.maxDelay > 5 ? 1 : 0) + sim.skips + (dScore != null && dScore < 60 ? 1 : 0)
      return {
        id: l.id, no: l.no, name: l.name, agency: l.agency, nStops: l.stops.length, tripsDay: l.tripsDay,
        span: `${l.firstDep}–${l.lastDep}`, bus: bus ? `${bus.brand} ${bus.model}` : '—', busPlate: bus ? bus.plate : '',
        driver: drv ? drv.name : '—', onTimePct: sim.onTimePct,
        onTimeColor: sim.onTimePct >= 90 ? 'var(--green)' : sim.onTimePct >= 75 ? 'var(--amber)' : 'var(--star)',
        ecoScore: dScore, ecoBand: ecoBand(dScore), anomalies, onClick: () => openLine(l.id),
      }
    })
    const avg = (a) => rows.length ? Math.round(a / rows.length) : 0
    const stats = [
      { label: 'Autobusových linek', value: String(rows.length), sub: 'v provozu' },
      { label: 'Ø dodržení JŘ', value: avg(rows.reduce((a, r) => a + r.onTimePct, 0)) + ' %', sub: 'on-time (0 až +5 min)' },
      { label: 'Anomálií dnes', value: String(rows.reduce((a, r) => a + r.anomalies, 0)), sub: 'napříč linkami' },
      { label: 'Ø eco-skóre řidičů', value: Math.round(busDrivers.reduce((a, d) => a + ecoScore(d.tele), 0) / busDrivers.length) + '/100', sub: 'hospodárnost jízdy' },
    ]
    return { linky: { rows, stats } }
  }

  const linkyDetailVM = () => {
    if (state.route !== 'linky-detail') return {}
    const l = linesData.find((x) => x.id === state.lineId) || linesData[0]
    const sim = simulateLineRun(l)
    const drv = busDrivers.find((d) => d.id === l.driverId)
    const bus = vehiclesData.find((v) => v.id === l.busId)
    const dScore = drv ? ecoScore(drv.tele) : null
    const bScore = bus ? ecoScore(bus.tele) : null
    const an = []
    sim.stops.forEach((s) => { if (s.skipped) an.push({ sev: 'high', icon: 'alert', color: 'var(--star)', bg: 'var(--star-soft)', type: 'Vynechaná zastávka', where: s.n, detail: 'Zastávka nebyla obsloužena' }) })
    const worst = sim.stops.filter((s) => !s.skipped).reduce((m, s) => (s.delay > (m ? m.delay : -99) ? s : m), null)
    if (worst && worst.delay > 5) an.push({ sev: 'high', icon: 'clock', color: 'var(--star)', bg: 'var(--star-soft)', type: 'Velké zpoždění', where: worst.n, detail: `+${worst.delay} min oproti jízdnímu řádu` })
    const early = sim.stops.find((s) => !s.skipped && s.delay < -1)
    if (early) an.push({ sev: 'mid', icon: 'swap', color: '#B45309', bg: 'var(--amber-soft)', type: 'Odjezd před časem', where: early.n, detail: `${early.delay} min — riziko ujetí spoje cestujícím` })
    if (bScore != null && bScore < 60) an.push({ sev: 'mid', icon: 'gauge', color: '#B45309', bg: 'var(--amber-soft)', type: 'Nadměrná spotřeba', where: 'úsek linky', detail: `${bus.tele.cons} l/100 km nad referencí ${bus.tele.ref} l` })
    if (bus && (bus.tele.brake + bus.tele.accel) >= 9) an.push({ sev: 'mid', icon: 'alert', color: '#B45309', bg: 'var(--amber-soft)', type: 'Prudká jízda', where: 'opakovaně na trase', detail: `${bus.tele.brake + bus.tele.accel}× prudké brzdění/akcelerace na 100 km` })
    if (bus && bus.tele.heater > 90) an.push({ sev: 'low', icon: 'refresh', color: 'var(--ink2)', bg: '#EEF2F9', type: 'Nezávislé topení', where: 'denně', detail: `${bus.tele.heater} min/den — možný zbytečný provoz` })
    const sm = (st) => st === 'skip' ? { c: 'var(--star)', b: 'var(--star-soft)', lbl: 'Vynecháno' }
      : st === 'early' ? { c: '#B45309', b: 'var(--amber-soft)', lbl: 'Před časem' }
      : st === 'late' ? { c: 'var(--star)', b: 'var(--star-soft)', lbl: 'Zpoždění' }
      : { c: 'var(--green)', b: 'var(--green-soft)', lbl: 'Včas' }
    const stops = sim.stops.map((s) => ({ n: s.n, planned: s.planned, actual: s.actual, skipped: s.skipped,
      delayLabel: s.skipped ? '—' : s.delay === 0 ? 'přesně' : (s.delay > 0 ? '+' : '') + s.delay + ' min', ...sm(s.status) }))
    const stats = [
      { label: 'Dodržení JŘ', value: sim.onTimePct + ' %', color: sim.onTimePct >= 90 ? 'var(--green)' : sim.onTimePct >= 75 ? 'var(--amber)' : 'var(--star)', sub: 'on-time (0 až +5 min)' },
      { label: 'Max zpoždění', value: '+' + sim.maxDelay + ' min', color: sim.maxDelay > 5 ? 'var(--star)' : 'var(--ink)', sub: 'na trase' },
      { label: 'Ø odchylka', value: (sim.avgDelay > 0 ? '+' : '') + sim.avgDelay + ' min', color: 'var(--ink)', sub: 'průměr po zastávkách' },
      { label: 'Anomálie', value: String(an.length), color: an.length ? 'var(--star)' : 'var(--green)', sub: 'na tomto spoji' },
    ]
    return { linkyDet: {
      no: l.no, name: l.name, agency: l.agency, nStops: l.stops.length, tripsDay: l.tripsDay, span: `${l.firstDep}–${l.lastDep}`, departures: l.departures,
      bus: bus ? { name: `${bus.brand} ${bus.model}`, plate: bus.plate, fuel: bus.fuel, score: bScore, band: ecoBand(bScore), onClick: () => openVehicle(bus.id) } : null,
      driver: drv ? { name: drv.name, role: drv.role, score: dScore, band: ecoBand(dScore) } : null,
      stops, anomalies: an, stats, goBack: () => navigate('linky'),
    } }
  }

  const ecoVM = () => {
    if (state.route !== 'eco') return {}
    const ecoVehicles = vehiclesData.filter((v) => v.tele)
    const drivers = busDrivers.map((d) => {
      const sc = ecoScore(d.tele); const sv = ecoSavings(d.tele)
      const bus = vehiclesData.find((v) => v.id === d.busId); const line = linesData.find((l) => l.id === d.lineId)
      return { id: d.id, name: d.name, role: d.role, score: sc, band: ecoBand(sc), savingsF: sv.czk ? czk(sv.czk) : '—', savingsL: sv.liters,
        line: line ? line.no : '—', bus: bus ? `${bus.brand} ${bus.model}` : '—', accel: d.tele.accel, brake: d.tele.brake, idle: d.tele.idle }
    }).sort((a, b) => b.score - a.score)
    const vehicles = ecoVehicles.map((v) => {
      const sc = ecoScore(v.tele); const sv = ecoSavings(v.tele); const elec = v.fuel === 'Elektro'
      return { id: v.id, name: `${v.brand} ${v.model}`, plate: v.plate, fuel: v.fuel, score: sc, band: ecoBand(sc),
        cons: v.tele.cons, ref: v.tele.ref, unit: elec ? 'kWh' : 'l', over: elec ? null : +(v.tele.cons - v.tele.ref).toFixed(1),
        savingsF: elec ? '—' : (sv.czk ? czk(sv.czk) : '0 Kč'), savingsL: sv.liters, heaterMin: v.tele.heater, heaterL: v.tele.heaterL, heaterF: heaterCost(v.tele) ? czk(heaterCost(v.tele)) : '—',
        onClick: () => openVehicle(v.id) }
    }).sort((a, b) => b.score - a.score)
    const avgScore = Math.round(busDrivers.reduce((a, d) => a + ecoScore(d.tele), 0) / busDrivers.length)
    const totalSaveL = ecoVehicles.reduce((a, v) => a + ecoSavings(v.tele).liters, 0)
    const totalSaveCzk = ecoVehicles.reduce((a, v) => a + ecoSavings(v.tele).czk, 0)
    const totalHeaterCzk = ecoVehicles.reduce((a, v) => a + heaterCost(v.tele), 0)
    const totalHeaterL = ecoVehicles.reduce((a, v) => a + (v.tele.fuel !== 'Elektro' ? v.tele.heaterL : 0), 0)
    const evDef = [['accel', 'Prudká akcelerace', 'var(--amber)'], ['brake', 'Prudké brzdění', 'var(--star)'], ['start', 'Prudké rozjezdy', 'var(--purple)'], ['overrev', 'Přetáčení motoru', 'var(--blue)'], ['speeding', 'Překročení rychlosti', '#0E9AA6']]
    const evAgg = evDef.map(([k, label, color]) => ({ key: k, label, color, val: +(ecoVehicles.reduce((a, v) => a + v.tele[k], 0) / (ecoVehicles.length || 1)).toFixed(1) }))
    const evMax = Math.max(1, ...evAgg.map((e) => e.val))
    evAgg.forEach((e) => { e.bar = Math.round(e.val / evMax * 100) })
    const stats = [
      { label: 'Ø eco-skóre parku', value: avgScore + '/100', color: ecoBand(avgScore).color, sub: 'hospodárnost jízdy' },
      { label: 'Potenciál úspory paliva', value: czk(totalSaveCzk), color: 'var(--green)', sub: totalSaveL + ' l / měsíc' },
      { label: 'Nezávislé topení', value: czk(totalHeaterCzk), color: 'var(--amber)', sub: totalHeaterL + ' l / měsíc' },
      { label: 'Vozů ve vyhodnocení', value: String(ecoVehicles.length), sub: 'autobusů s jednotkou' },
    ]
    return { eco: { stats, drivers, vehicles, evAgg, medals: ['🥇', '🥈', '🥉'] } }
  }

  const vm = {
    dash: state.dash, dashMeta: DASH_WIDGETS, toggleDashWidget, setDashWidth, moveDashWidget, resetDash,
    kpi: state.kpi, kpiCatalog: KPI_CATALOG, kpiVals, kpiLabel, dashKpis, toggleKpi, moveKpi, resetKpi, kpiMax: KPI_MAX, kpiOnCount: state.kpi.filter((k) => k.on).length,
    equipModal: state.equipModal ? { ...state.equipModal, close: () => setState({ equipModal: null }), stop: (e) => e.stopPropagation(), sections: EQUIP_SECTIONS, onSection: (e) => setEquipField('section', e.target.value), onDesc: (e) => setEquipField('desc', e.target.value), onPrice: (e) => setEquipField('price', e.target.value), onDate: (e) => setEquipField('date', e.target.value), onInvoice: onEquipInvoice, save: saveEquip } : null,
    serviceModal: state.serviceModal ? { ...state.serviceModal, close: () => setState({ serviceModal: null }), stop: (e) => e.stopPropagation(), types: SERVICE_TYPES, field: (k) => (e) => setServiceField(k, e.target.value), onInvoice: (e) => { const f = e.target.files && e.target.files[0]; if (f) setServiceField('invoice', f.name) }, save: saveService } : null,
    tireModal: state.tireModal ? { ...state.tireModal, close: () => setState({ tireModal: null }), stop: (e) => e.stopPropagation(), actions: TIRE_ACTIONS, field: (k) => (e) => setTireField(k, e.target.value), onInvoice: (e) => { const f = e.target.files && e.target.files[0]; if (f) setTireField('invoice', f.name) }, save: saveTire } : null,
    fineModal: state.fineModal ? { ...state.fineModal, close: () => setState({ fineModal: null }), stop: (e) => e.stopPropagation(), types: FINE_TYPES, field: (k) => (e) => setFineField(k, e.target.value), togglePaid: () => setState((s) => ({ fineModal: { ...s.fineModal, paid: !s.fineModal.paid } })), save: saveFine } : null,
    ...shellVM(), ...dashboardVM(), ...fleetsVM(), ...fleetDetailVM(), ...vehiclesVM(), ...vehicleDetailVM(),
    ...insuranceVM(), ...insuranceDetailVM(), ...claimsVM(), ...claimDetailVM(), ...documentsVM(), ...documentsDetailVM(), ...analyticsVM(), ...ownerDashVM(), ...dispatchDashVM(), ...attentionVM(), ...anomaliesVM(), ...anomalyDetailVM(), ...mapVM(), ...dispatchVM(), ...stazkaVM(), ...contactsVM(), ...settingsVM(), ...bonifikaceVM(), ...bonifikaceDetailVM(), ...driversVM(), ...driverDetailVM(), ...financingVM(), ...rfqVM(), ...wizardVM(), ...addVehicleVM(), ...linkyVM(), ...linkyDetailVM(), ...ecoVM(),
  }

  return <Render vm={vm} />
}
