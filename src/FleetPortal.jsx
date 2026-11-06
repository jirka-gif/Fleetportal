import React, { useState, useRef } from 'react'
import { Icon, czk, linePath, useViewport, buildExecReportHtml, buildPayslipHtml } from './helpers.jsx'
import * as ACC from './accounting.js'
import { PROFILES, profileById, MODULE_PROFILES, BUILT_MODULES, SOON_MODULES, DEMO_FIRMS, recommendProfiles, naceName, naceFmt, naceIsEmpty, LEGAL_FORMS, newLeasingRow, leasingRows, leasingTotal, decodeVin, findVins, vinsFromFile, LEASING_OTHER } from './profiles.js'
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
const TIMEOFF_STATUS = {
  approved: { label: 'Schváleno', color: 'var(--green)', bg: 'var(--green-soft)' },
  pending: { label: 'Čeká na schválení', color: '#B45309', bg: 'var(--amber-soft)' },
  rejected: { label: 'Zamítnuto', color: 'var(--star)', bg: 'var(--star-soft)' },
}
const REPORT_CAT = {
  trasa: { label: 'Problém na trase', icon: 'pin' },
  vozidlo: { label: 'Závada na vozidle', icon: 'wrench' },
  jine: { label: 'Jiné', icon: 'info' },
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
// ---------- HR: dovolená a hlášení řidičů (seed) ----------
const SEED_TIMEOFF = [
  { id: 'to1', driverId: 'dr1', from: '22. 12. 2026', to: '31. 12. 2026', days: 6, type: 'Dovolená', status: 'approved' },
  { id: 'to2', driverId: 'dr1', from: '9. 2. 2027', to: '13. 2. 2027', days: 5, type: 'Dovolená', status: 'pending' },
  { id: 'to3', driverId: 'dr2', from: '2. 1. 2027', to: '2. 1. 2027', days: 1, type: 'Náhradní volno', status: 'approved' },
  { id: 'to4', driverId: 'dr4', from: '15. 11. 2026', to: '15. 11. 2026', days: 1, type: 'Lékař', status: 'approved' },
]
const SEED_DRIVER_REPORTS = [
  { id: 'dr-r1', driverId: 'dr1', cat: 'vozidlo', sev: 'mid', text: 'Při brzdění cítit vibrace na předních kolech, doporučuji kontrolu.', date: '3. 11. 2026', status: 'new' },
  { id: 'dr-r2', driverId: 'dr1', cat: 'trasa', sev: 'low', text: 'Zastávka Vráto trvale zaparkovaná auta, komplikovaný nájezd.', date: '30. 10. 2026', status: 'prog' },
  { id: 'dr-r3', driverId: 'dr3', cat: 'vozidlo', sev: 'high', text: 'Svítí kontrolka motoru, ztráta výkonu do kopce.', date: '1. 11. 2026', status: 'new' },
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
  { id: 'ridic', name: 'Jan Procházka', title: 'Řidič autobusu', initials: 'JP', short: 'Řidič', driverId: 'dr1',
    desc: 'Moje směny, mzda, dovolená a hlášení z provozu.', icon: 'user1' },
  { id: 'ucetni', name: 'Lenka Nováková', title: 'Mzdová účetní', initials: 'LN', short: 'Účetní',
    desc: 'Účetnictví, mzdy, banka, DPH a daňové podklady.', icon: 'banknote' },
]
// Skupiny menu (jako ve Frenkee CRM): Pracovní prostor je vždy otevřený, ostatní jdou sbalit
const NAV_GROUPS = [['work', 'Pracovní prostor'], ['provoz', 'Provoz'], ['flotila', 'Flotila'], ['lide', 'Lidé'], ['finance', 'Finance'], ['firma', 'Firma']]
const NAV_GROUP_OF = { dashboard: 'work', map: 'work', linky: 'provoz', dispatch: 'provoz', optimalizace: 'provoz', eco: 'provoz', zajezdy: 'provoz', fleets: 'flotila', vehicles: 'flotila', anomalies: 'flotila', servis: 'flotila', elektrobusy: 'flotila', insurance: 'flotila', financing: 'flotila', claims: 'flotila', drivers: 'lide', vykony: 'finance', ucetnictvi: 'finance', analytics: 'finance', documents: 'firma', contacts: 'firma', settings: 'firma' }
const ACCOUNTANT_NAV = [['ucetnictvi', 'Účetnictví', 'banknote'], ['vykony', 'Vyúčtování výkonů', 'scales'], ['drivers', 'Lidé a mzdy', 'users'], ['documents', 'Dokumenty', 'file'], ['analytics', 'Reporting', 'trend']]
// Plánování směn: dispečer/správce předá řidiči jízdní řád (datum, linka, autobus), řidič vidí kalendář a potvrdí převzetí
const SHIFT_TURNUS = { 'ranní': ['04:20', '13:10'], 'odpolední': ['12:40', '21:30'], 'celodenní': ['05:00', '17:30'] }
const SHIFT_DAYS = Array.from({ length: 7 }).map((_, i) => { const dt = new Date(2026, 10, 5 + i); const dn = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so'][dt.getDay()]; return { key: `${dt.getFullYear()}-${String(dt.getMonth() + 1).padStart(2, '0')}-${String(dt.getDate()).padStart(2, '0')}`, dateStr: `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}`, label: `${dn} ${dt.getDate()}. ${dt.getMonth() + 1}.`, dow: dt.getDay(), today: i === 0 } })
const SEED_SHIFTS = [
  { id: 's1', dayKey: '2026-11-05', driverId: 'dr1', lineId: 'L5', turnus: 'ranní', status: 'confirmed' },
  { id: 's2', dayKey: '2026-11-06', driverId: 'dr1', lineId: 'L6', turnus: 'celodenní', status: 'planned' },
  { id: 's3', dayKey: '2026-11-07', driverId: 'dr1', lineId: 'L5', turnus: 'odpolední', status: 'planned' },
  { id: 's4', dayKey: '2026-11-09', driverId: 'dr1', lineId: 'L1', turnus: 'ranní', status: 'planned' },
  { id: 's5', dayKey: '2026-11-10', driverId: 'dr1', lineId: 'L1', turnus: 'ranní', status: 'planned' },
  { id: 's6', dayKey: '2026-11-05', driverId: 'dr2', lineId: 'L2', turnus: 'ranní', status: 'confirmed' },
  { id: 's7', dayKey: '2026-11-06', driverId: 'dr2', lineId: 'L2', turnus: 'odpolední', status: 'confirmed' },
  { id: 's8', dayKey: '2026-11-05', driverId: 'dr4', lineId: 'L3', turnus: 'odpolední', status: 'confirmed' },
  { id: 's9', dayKey: '2026-11-06', driverId: 'dr6', lineId: 'L4', turnus: 'ranní', status: 'planned' },
  { id: 's10', dayKey: '2026-11-07', driverId: 'dr9', lineId: 'L6', turnus: 'celodenní', status: 'planned' },
].map((s) => { const l = linesData.find((x) => x.id === s.lineId) || linesData[0]; const [start, end] = SHIFT_TURNUS[s.turnus]; return { ...s, busId: l.busId, start, end, depot: 'Vozovna České Budějovice, Žižkova tř.' } })
const SHIFT_STATUS = { planned: { label: 'Čeká na potvrzení', color: '#B45309', bg: 'var(--amber-soft)' }, confirmed: { label: 'Převzato řidičem', color: 'var(--green)', bg: 'var(--green-soft)' } }

// ---- Vyúčtování výkonů: smlouvy s objednateli, měsíční data po dnech, kontrola, výkaz, fakturace ----
const VYK_CONTRACTS = {
  c2: { id: 'c2', short: 'Město České Budějovice (MHD)', contractNo: 'SML/2023/0412-DOP', valid: '1. 1. 2024 až 31. 12. 2033', penaltyTrip: 1500, advance: 11_600_000, advanceDay: 15, rule: 'Úhrada za uznatelné km podle přílohy 2 (indexace k 1. 1. 2026). Sankce 1 500 Kč za nejetý spoj, náhradní doprava bez sankce. Objížďky uznány po odsouhlasení dispečinkem DPMČB.' },
  c1: { id: 'c1', short: 'JIKORD (Jihočeský kraj)', contractNo: 'JIKORD/2019/VZ-07', valid: '15. 12. 2019 až 14. 12. 2029', penaltyTrip: 2500, advance: 7_250_000, advanceDay: 10, rule: 'Kompenzace = uznatelné km × sazba minus tržby minus sankce. Sankce 2 500 Kč za nejetý spoj. Spoj bez stazky není uznatelný, dokud dopravce nedoloží jízdu z tachografu.' },
}
const VYK_STEPS = ['Sběr dat', 'Kontrola', 'Výkaz', 'Fakturace', 'Uzavřeno']
const VYK_STATUS = { sber: 0, kontrola: 1, vykaz: 2, fakturace: 3, uzavreno: 4 }
const VYK_MONTHS = ['2026-08', '2026-09', '2026-10']
const VYK_YEAR_MONTHS = Array.from({ length: 10 }).map((_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
const vykCustOf = (l) => l.agency && l.agency.includes('Dopravní podnik') ? 'c2' : 'c1'
const vykKmTrip = (l) => 6 + (_hash(l.id + 'km') % 18) + (l.no === '300' ? 42 : 0)
const vykRate = (l) => 41 + (_hash(l.id + 's') % 6)
const vykFare = (l) => 11 + (_hash(l.id + 'f') % 7)
const VYK_MISS_REASONS = ['porucha vozidla', 'dopravní nehoda na trase', 'nenastoupil řidič (nemoc)', 'uzavírka bez objízdné trasy']
const VYK_DOW = ['ne', 'po', 'út', 'st', 'čt', 'pá', 'so']
const vykMonthLabel = (m) => { const [y, mm] = m.split('-').map(Number); return `${['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'][mm - 1]} ${y}` }
const VYK_ISSUE_TYPES = {
  missed: { label: 'Nejeté spoje', color: 'var(--star)', bg: 'var(--star-soft)', actions: [['penalty', 'Uznat sankci'], ['force', 'Vyšší moc, bez sankce']], def: 'penalty' },
  substitute: { label: 'Náhradní doprava', color: 'var(--blue-ink)', bg: 'var(--blue-soft)', actions: [['ok', 'Vzato na vědomí']], def: 'ok' },
  detour: { label: 'Objížďka', color: '#B45309', bg: 'var(--amber-soft)', actions: [['accept', 'Uznat km'], ['reject', 'Neuznat km']], def: 'accept' },
  nostazka: { label: 'Spoj bez stazky', color: 'var(--purple)', bg: 'var(--purple-soft)', actions: [['accept', 'Stazka doplněna, uznat'], ['reject', 'Vyřadit spoj']], def: 'accept' },
}
/** Deterministická data linky za měsíc po dnech: spoje, km, tržby, cestující a události ke kontrole. */
function buildVykLine(l, month) {
  const [y, mm] = month.split('-').map(Number)
  const dim = new Date(y, mm, 0).getDate()
  const kmTrip = vykKmTrip(l), rate = vykRate(l), fare = vykFare(l), penalty = VYK_CONTRACTS[vykCustOf(l)].penaltyTrip
  const days = [], issues = []
  for (let d = 1; d <= dim; d++) {
    const dow = new Date(y, mm - 1, d).getDay(), key = `${l.id}${month}${d}`, h = _hash(key), h2 = _hash(key + 'd'), h3 = _hash(key + 'n'), h4 = _hash(key + 'r')
    const tripsPlan = Math.round(l.tripsDay * (dow === 0 ? 0.45 : dow === 6 ? 0.55 : 1))
    let tripsRun = tripsPlan, kmExtra = 0
    const dayIssues = [], dateKey = `${month}-${String(d).padStart(2, '0')}`, dateLabel = `${VYK_DOW[dow]} ${d}. ${mm}.`
    if (h % 100 < 4) { const n = 1 + (h % 3); tripsRun -= n; dayIssues.push({ id: `${key}-m`, type: 'missed', lineId: l.id, lineNo: l.no, dateKey, dateLabel, label: `${n} nejet${n === 1 ? 'ý spoj' : 'é spoje'}`, detail: VYK_MISS_REASONS[h4 % VYK_MISS_REASONS.length], trips: n, km: 0, penalty: n * penalty }) }
    else if (h % 100 < 6) { const n = 2 + (h % 4); dayIssues.push({ id: `${key}-s`, type: 'substitute', lineId: l.id, lineNo: l.no, dateKey, dateLabel, label: `${n} spoje náhradní dopravou`, detail: 'výluka, nasazen náhradní vůz smluvního dopravce', trips: n, km: 0, penalty: 0 }) }
    if (h2 % 100 < 3) { kmExtra = Math.round(tripsRun * (1.5 + (h2 % 4) * 0.5)); dayIssues.push({ id: `${key}-d`, type: 'detour', lineId: l.id, lineNo: l.no, dateKey, dateLabel, label: `objížďka +${kmExtra} km`, detail: 'uzavírka, objízdná trasa podle rozhodnutí silničního úřadu', trips: 0, km: kmExtra, penalty: 0 }) }
    if (h3 % 100 < 2) { const n = 1 + (h3 % 2); dayIssues.push({ id: `${key}-n`, type: 'nostazka', lineId: l.id, lineNo: l.no, dateKey, dateLabel, label: `${n} spoj${n > 1 ? 'e' : ''} bez stazky`, detail: 'jízda je v tachografu, chybí záznam ve stazce řidiče', trips: n, km: n * kmTrip, penalty: 0 }) }
    const kmReal = tripsRun * kmTrip + kmExtra
    const revFactor = dow === 0 ? 0.5 : dow === 6 ? 0.6 : 1 + (h4 % 7 - 3) / 100
    const revenue = Math.round(tripsRun * kmTrip * fare * revFactor)
    days.push({ d, dateKey, label: dateLabel, dow, tripsPlan, tripsRun, kmPlan: tripsPlan * kmTrip, kmReal, revenue, pax: Math.round(revenue / 14.2), issues: dayIssues })
    issues.push(...dayIssues)
  }
  return { line: l, custId: vykCustOf(l), kmTrip, rate, fare, penalty, days, issues }
}
/** Součty linky za měsíc s ohledem na výsledek kontroly (resolved: id → { action }). */
function vykTotals(b, resolved) {
  const t = { tripsPlan: 0, tripsRun: 0, kmPlan: 0, kmReal: 0, revenue: 0, pax: 0 }
  b.days.forEach((d) => { t.tripsPlan += d.tripsPlan; t.tripsRun += d.tripsRun; t.kmPlan += d.kmPlan; t.kmReal += d.kmReal; t.revenue += d.revenue; t.pax += d.pax })
  let kmUzn = t.kmReal, sankce = 0, kmNeuzn = 0, tripsSub = 0, missed = 0, open = 0
  b.issues.forEach((i) => {
    const r = resolved[i.id]; const a = r ? (r.action === 'closed' ? VYK_ISSUE_TYPES[i.type].def : r.action) : null
    if (!r) open++
    if (i.type === 'missed') { missed += i.trips; if (!a || a === 'penalty') sankce += i.penalty }
    if (i.type === 'detour' && (!a || a === 'reject')) { kmUzn -= i.km; kmNeuzn += i.km }
    if (i.type === 'nostazka' && (!a || a === 'reject')) { kmUzn -= i.km; kmNeuzn += i.km }
    if (i.type === 'substitute') tripsSub += i.trips
  })
  const vykon = kmUzn * b.rate, komp = vykon - t.revenue - sankce
  return { ...t, kmUzn, kmNeuzn, sankce, tripsSub, missed, open, vykon, komp, plneni: t.tripsPlan ? t.tripsRun / t.tripsPlan * 100 : 100, kmPct: t.kmPlan ? t.kmReal / t.kmPlan * 100 : 100 }
}
const VYK_SEED_STATUS = { '2026-08:c1': 'uzavreno', '2026-08:c2': 'uzavreno', '2026-09:c1': 'uzavreno', '2026-09:c2': 'uzavreno', '2026-10:c2': 'kontrola', '2026-10:c1': 'sber' }
const _vykClosedLog = (m, who, d1, d2, d3, d4) => [
  { at: `${d1} 08:30`, who: 'Marie Dvořáková', what: 'Sběr dat uzavřen', detail: 'Km z tachografů, spoje ze stazek a tržby z odbavovacího systému načteny' },
  { at: `${d2} 14:10`, who: 'Marie Dvořáková', what: 'Kontrola potvrzena', detail: 'Všechny události měsíce vyřešeny, uznatelné km odsouhlaseny s dispečinkem objednatele' },
  { at: `${d3} 09:05`, who: who, what: 'Výkaz pro objednatele vystaven', detail: `Výkaz dopravních výkonů za ${vykMonthLabel(m)} odeslán datovou schránkou` },
  { at: `${d4} 10:20`, who: 'Lenka Nováková', what: 'Vyúčtováno fakturou', detail: 'Kompenzace prokazatelné ztráty vystavena v Účetnictví (mimo DPH), zápočet měsíční zálohy' },
]
const VYK_SEED_LOG = {
  '2026-08:c2': _vykClosedLog('2026-08', 'Ing. Pavel Šimek', '1. 9. 2026', '2. 9. 2026', '3. 9. 2026', '5. 9. 2026'),
  '2026-08:c1': _vykClosedLog('2026-08', 'Ing. Pavel Šimek', '1. 9. 2026', '2. 9. 2026', '3. 9. 2026', '3. 9. 2026'),
  '2026-09:c2': _vykClosedLog('2026-09', 'Ing. Pavel Šimek', '1. 10. 2026', '2. 10. 2026', '3. 10. 2026', '5. 10. 2026'),
  '2026-09:c1': _vykClosedLog('2026-09', 'Ing. Pavel Šimek', '1. 10. 2026', '2. 10. 2026', '3. 10. 2026', '3. 10. 2026'),
  '2026-10:c2': [{ at: '3. 11. 2026 08:40', who: 'Marie Dvořáková', what: 'Sběr dat uzavřen', detail: 'Km z tachografů 5 linek MHD, spoje ze stazek, tržby z odbavovacího systému DPMČB načteny; zahájena kontrola událostí' }],
  '2026-10:c1': [{ at: '2. 11. 2026 16:10', who: 'Marie Dvořáková', what: 'Měsíc otevřen', detail: 'Čeká se na import tržeb z odbavovacího systému pro linku 300 (JIKORD)' }],
}
function buildVykazHtml(month, cust, rows, tot, docsNote) {
  const esc = (x) => String(x ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const n = (x) => Math.round(x).toLocaleString('cs-CZ')
  const trs = rows.map((r) => `<tr><td><b>Linka ${esc(r.no)}</b><br><span class="m">${esc(r.name)}</span></td><td class="r">${n(r.t.tripsPlan)} / ${n(r.t.tripsRun)}</td><td class="r">${n(r.t.kmPlan)}</td><td class="r">${n(r.t.kmReal)}</td><td class="r">${n(r.t.kmUzn)}</td><td class="r">${r.rate} Kč</td><td class="r">${n(r.t.vykon)} Kč</td><td class="r">${n(r.t.revenue)} Kč</td><td class="r">${n(r.t.sankce)} Kč</td><td class="r"><b>${n(r.t.komp)} Kč</b></td></tr>`).join('')
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Výkaz výkonů ${esc(vykMonthLabel(month))}</title><style>*{box-sizing:border-box}body{font-family:Inter,-apple-system,system-ui,sans-serif;color:#1b1f2a;margin:0;padding:34px 40px;font-size:11.5px}h1{font-size:20px;margin:0}.top{display:flex;justify-content:space-between;gap:20px;border-bottom:3px solid #6D5EF6;padding-bottom:14px}.m{color:#6b7280}.grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin:16px 0}.box{border:1px solid #E3E6EE;border-radius:10px;padding:10px 12px}.box b.t{display:block;font-size:10px;text-transform:uppercase;letter-spacing:.5px;color:#777;margin-bottom:3px}table{width:100%;border-collapse:collapse;margin-top:8px}th{text-align:left;font-size:9.5px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;border-bottom:1px solid #e7e9f2;padding:0 5px 6px}td{padding:7px 5px;border-bottom:1px solid #eef0f5;vertical-align:top}th.r,td.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.tot{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-top:14px}.tot div{padding:10px 12px;background:#F4F2FF;border-radius:10px}.tot b{display:block;font-size:15px;margin-top:2px}.sig{margin-top:40px;display:flex;gap:30px}.sig div{flex:1;border-top:1px solid #999;padding-top:6px;color:#666;font-size:10.5px}@media print{@page{size:A4 landscape;margin:12mm}body{padding:0}}</style></head><body>
<div class="top"><div><div style="font-weight:800;color:#6D5EF6;font-size:12px">FLEETPORTAL</div><h1>Výkaz dopravních výkonů za ${esc(vykMonthLabel(month))}</h1><div class="m" style="margin-top:3px">Příloha vyúčtování kompenzace podle smlouvy ${esc(cust.contractNo)}</div></div><div class="m" style="text-align:right">${rows.length} linek<br>${n(tot.kmUzn)} uznatelných km<br>${n(tot.tripsRun)} spojů</div></div>
<div class="grid"><div class="box"><b class="t">Dopravce</b>ČSAD AUTOBUSY České Budějovice a.s.<br>IČO 26060451, DIČ CZ26060451</div><div class="box"><b class="t">Objednatel</b>${esc(cust.name)}<br>IČO ${esc(cust.ico)} · smlouva ${esc(cust.contractNo)}, platnost ${esc(cust.valid)}</div></div>
<table><thead><tr><th>Linka</th><th class="r">Spoje plán / jeté</th><th class="r">Km plán</th><th class="r">Km skutečnost</th><th class="r">Km uznatelné</th><th class="r">Sazba</th><th class="r">Výkon</th><th class="r">Tržby</th><th class="r">Sankce</th><th class="r">Kompenzace</th></tr></thead><tbody>${trs}</tbody></table>
<div class="tot"><div>Výkon (uznatelné km × sazba)<b>${n(tot.vykon)} Kč</b></div><div>Tržby z jízdného<b>${n(tot.revenue)} Kč</b></div><div>Sankce za nejeté spoje (${n(tot.missed)})<b>${n(tot.sankce)} Kč</b></div><div>Kompenzace prokazatelné ztráty<b>${n(tot.komp)} Kč</b></div></div>
<div class="m" style="margin-top:14px;font-size:10.5px">${esc(cust.rule)} Záloha za měsíc ${n(cust.advance)} Kč, ${tot.komp - cust.advance >= 0 ? 'doplatek' : 'přeplatek k vrácení'} ${n(Math.abs(tot.komp - cust.advance))} Kč. ${esc(docsNote || '')} Kompenzace ze závazku veřejné služby podle zákona č. 194/2010 Sb. není úplatou za zdanitelné plnění. Modelová data.</div>
<div class="sig"><div>Za dopravce</div><div>Za objednatele (převzetí výkazu)</div></div></body></html>`
}

// ---- Zájezdy: kalkulace nabídek, pipeline a napojení na fakturaci ----
const TRIP_BUS_TYPES = [
  { id: 'midi', label: 'Midibus (30 míst)', seats: 30, rateKm: 32, rateHod: 380 },
  { id: 'standard', label: 'Linkový autobus (49 míst)', seats: 49, rateKm: 38, rateHod: 420 },
  { id: 'lux', label: 'Zájezdový autobus (53 míst, WC, klima)', seats: 53, rateKm: 46, rateHod: 480 },
  { id: 'double', label: 'Dvoupodlažní (78 míst)', seats: 78, rateKm: 58, rateHod: 560 },
]
const TRIP_RATES = { fix: 1500, waitHour: 320, secondDriverDay: 2800, driverNight: 1900, foreignKm: 4, foreignDay: 2500, parkingDay: 600, vat: 12 }
const TRIP_STATUS = {
  koncept: { label: 'Rozpracovaná kalkulace', color: 'var(--ink3)', bg: '#EEF2F9', step: 0 },
  poptavka: { label: 'Poptávka', color: '#B45309', bg: 'var(--amber-soft)', step: 0 },
  nabidka: { label: 'Nabídka odeslána', color: 'var(--blue-ink)', bg: 'var(--blue-soft)', step: 1 },
  schvaleno: { label: 'Schváleno klientem', color: 'var(--purple)', bg: 'var(--purple-soft)', step: 2 },
  potvrzeno: { label: 'Potvrzeno (vůz + řidič)', color: 'var(--blue-ink)', bg: 'var(--blue-soft)', step: 3 },
  realizovano: { label: 'Realizováno', color: 'var(--ink2)', bg: '#EEF2F9', step: 4 },
  vyuctovano: { label: 'Vyúčtováno', color: 'var(--green)', bg: 'var(--green-soft)', step: 5 },
}
const TRIP_STEPS = ['Poptávka', 'Nabídka', 'Schváleno', 'Potvrzeno', 'Realizováno', 'Vyúčtováno']
/** Cena zájezdu z parametrů; druhý řidič automaticky podle AETR (max. 9 h řízení / den, orientačně 450 km / den). */
function computeTripPrice(c) {
  const bt = TRIP_BUS_TYPES.find((b) => b.id === c.busType) || TRIP_BUS_TYPES[1]
  const km = Math.max(0, Number(c.km) || 0), hod = Math.max(0, Number(c.hod) || 0), days = Math.max(1, Number(c.days) || 1)
  const nights = Math.max(0, Number(c.nights) || 0), wait = Math.max(0, Number(c.wait) || 0), pax = Math.max(1, Number(c.pax) || 1)
  // druhý řidič: přes 450 km, přes 9 h řízení (odhad 50 km/h) nebo přes 13 h pracovní doby na den
  const drivers = (km / days > 450 || km / 50 / days > 9 || hod / days > 13) ? 2 : 1
  const lines = [
    { key: 'km', label: `Jízdné ${km.toLocaleString('cs-CZ')} km × ${bt.rateKm} Kč`, amount: km * bt.rateKm },
    { key: 'hod', label: `Čas ${hod} h × ${bt.rateHod} Kč`, amount: hod * bt.rateHod },
    { key: 'fix', label: 'Přistavení a odstavení vozu', amount: TRIP_RATES.fix },
  ]
  if (drivers === 2) lines.push({ key: 'drv2', label: `Druhý řidič (AETR) ${days} ${days === 1 ? 'den' : days < 5 ? 'dny' : 'dní'} × ${TRIP_RATES.secondDriverDay} Kč`, amount: days * TRIP_RATES.secondDriverDay })
  if (wait) lines.push({ key: 'wait', label: `Čekání ${wait} h × ${TRIP_RATES.waitHour} Kč`, amount: wait * TRIP_RATES.waitHour })
  if (nights) lines.push({ key: 'nights', label: `Noclehy řidičů ${nights} × ${drivers} × ${TRIP_RATES.driverNight} Kč`, amount: nights * drivers * TRIP_RATES.driverNight })
  if (c.foreign) lines.push({ key: 'foreign', label: `Zahraničí: mýto a známky (${km} km × ${TRIP_RATES.foreignKm} Kč + ${days} × ${TRIP_RATES.foreignDay} Kč)`, amount: km * TRIP_RATES.foreignKm + days * TRIP_RATES.foreignDay })
  if (days > 1) lines.push({ key: 'park', label: `Parkování ${days} × ${TRIP_RATES.parkingDay} Kč`, amount: days * TRIP_RATES.parkingDay })
  const base = lines.reduce((s, l) => s + l.amount, 0)
  const vat = Math.round(base * TRIP_RATES.vat / 100)
  const foreignKmCost = c.foreign ? km * TRIP_RATES.foreignKm + days * TRIP_RATES.foreignDay : 0
  return { bt, drivers, lines, base, vat, total: base + vat, perPax: Math.round((base + vat) / pax), pax, km, hod, days, nights, wait, foreign: !!c.foreign, foreignKmCost }
}
const fmtIsoDate = (iso) => { if (!iso) return '—'; const [y, m, d] = iso.split('-').map(Number); return `${d}. ${m}. ${y}` }
const isoKey = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`
const tripDayKeys = (t) => { if (!t.dateFrom) return []; const [y, m, d] = t.dateFrom.split('-').map(Number); return Array.from({ length: Math.max(1, Number(t.days) || 1) }).map((_, i) => isoKey(new Date(y, m - 1, d + i))) }
const czToKey = (cz) => { const [d, m, y] = String(cz).split('.').map((x) => Number(x.trim())); return y ? isoKey(new Date(y, m - 1, d)) : '' }
const tripStamp = () => { const n = new Date(); return `${n.getDate()}. ${n.getMonth() + 1}. ${n.getFullYear()} ${String(n.getHours()).padStart(2, '0')}:${String(n.getMinutes()).padStart(2, '0')}` }
/** Odhad vlastních nákladů zájezdu (PHM, opotřebení, mzdy řidičů, diety, mýto) pro výpočet marže. */
function tripCostEstimate(p) {
  return Math.round(p.km * 15.5 + p.hod * p.drivers * 290 + p.nights * p.drivers * 1500 + (p.days > 1 ? p.days * p.drivers * 420 : 0) + (p.foreignKmCost || 0))
}
function buildTripQuoteHtml(t, p, company) {
  const esc = (s) => String(s ?? '').replace(/[&<>]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]))
  const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`
  const rows = p.lines.map((l) => `<tr><td>${esc(l.label)}</td><td class="r">${kc(l.amount)}</td></tr>`).join('')
  const dayLabel = p.days === 1 ? '1 den' : `${p.days} ${p.days < 5 ? 'dny' : 'dní'}`
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>Nabídka ${esc(t.id)}</title>
<style>body{font-family:Inter,Helvetica,Arial,sans-serif;color:#111;margin:0;padding:36px 44px;font-size:12.5px;line-height:1.45}h1{font-size:22px;margin:0 0 2px;letter-spacing:-.4px}.sub{color:#666;margin-bottom:22px}.grid{display:grid;grid-template-columns:1fr 1fr;gap:22px;margin-bottom:20px}.box{border:1px solid #E3E6EE;border-radius:10px;padding:12px 14px}.box b{display:block;font-size:10.5px;text-transform:uppercase;letter-spacing:.5px;color:#777;margin-bottom:4px}table{width:100%;border-collapse:collapse;margin:8px 0 14px}td,th{padding:7px 6px;border-bottom:1px solid #E3E6EE;text-align:left}th{font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#777}.r{text-align:right;white-space:nowrap;font-variant-numeric:tabular-nums}.tot td{font-weight:700;border-bottom:none}.big td{font-size:16px;padding-top:10px}.note{color:#555;font-size:11.5px;margin-top:16px}.sig{margin-top:42px;display:flex;justify-content:space-between;gap:30px}.sig div{flex:1;border-top:1px solid #999;padding-top:6px;color:#666;font-size:11px}@media print{body{padding:18px 22px}}</style></head><body>
<h1>Cenová nabídka ${esc(t.id)}</h1><div class="sub">Nepravidelná (zájezdová) autobusová doprava · vystaveno ${esc(t.offerAt || tripStamp().slice(0, -6))} · platnost 14 dní</div>
<div class="grid"><div class="box"><b>Dopravce</b>${esc(company.name)}<br>IČO ${esc(company.ico)}, DIČ ${esc(company.dic)}<br>${esc(company.address || '')}</div><div class="box"><b>Objednatel</b>${esc(t.custName)}<br>${t.contact ? 'Kontakt: ' + esc(t.contact) : ''}</div></div>
<div class="box" style="margin-bottom:18px"><b>Jízda</b><strong>${esc(t.from)} → ${esc(t.to)}</strong>${t.via ? ' přes ' + esc(t.via) : ''}<br>Termín ${esc(fmtIsoDate(t.dateFrom))}, ${dayLabel} · ${p.km.toLocaleString('cs-CZ')} km · ${p.hod} h · ${p.pax} osob · ${esc(p.bt.label)}${p.drivers === 2 ? ' · dva řidiči (AETR)' : ''}${t.foreign ? ' · jízda do zahraničí' : ''}</div>
<table><thead><tr><th>Položka</th><th class="r">Cena</th></tr></thead><tbody>${rows}
<tr class="tot"><td>Celkem bez DPH</td><td class="r">${kc(p.base)}</td></tr><tr class="tot"><td>DPH 12 % (osobní doprava)</td><td class="r">${kc(p.vat)}</td></tr><tr class="tot big"><td>Celkem k úhradě</td><td class="r">${kc(p.total)}</td></tr><tr><td colspan="2" style="color:#666;border:none">Orientačně ${kc(p.perPax)} na osobu při ${p.pax} cestujících.</td></tr></tbody></table>
${t.note ? `<div class="note"><strong>Poznámka:</strong> ${esc(t.note)}</div>` : ''}
<div class="note">Cena zahrnuje přistavení vozu, řidiče, pohonné hmoty a zákonné pojištění. Čekací doba nad rámec nabídky se účtuje ${TRIP_RATES.waitHour} Kč/h. Parkovné a vstupy nad rámec kalkulace hradí objednatel. Nabídka vychází z modelového ceníku zájezdové dopravy.</div>
<div class="sig"><div>Za dopravce: ${esc(t.offerBy || '')}</div><div>Za objednatele (datum, podpis)</div></div></body></html>`
}
const DEFAULT_TRIP_CALC = { custId: 'c4', custName: '', contact: '', email: '', from: 'České Budějovice', to: 'Praha, ZOO', via: '', dateFrom: '2026-11-14', days: 1, km: 320, hod: 11, pax: 45, busType: 'standard', foreign: false, nights: 0, wait: 2, note: '' }
const _tripBuses = () => { const b = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy'); const pick = (re, n) => b.filter((v) => re.test(`${v.brand} ${v.model}`.trim())).slice(0, n); return [...pick(/^Setra/, 4), ...pick(/^Mercedes/, 4), ...pick(/SOR C 10/, 2), ...pick(/CROSSWAY$/i, 2)] }
const SEED_TRIPS = [
  { id: 'T-2026-241', custId: 'c4', custName: 'ZŠ Máj I, České Budějovice', contact: 'Mgr. Hana Kovářová', email: 'kovarova@zsmaj.cz', from: 'České Budějovice', to: 'Praha, ZOO', via: 'Písek', dateFrom: '2026-11-14', days: 1, km: 320, hod: 11, pax: 45, busType: 'standard', foreign: false, nights: 0, wait: 2, status: 'poptavka', busIdx: 0, driverIds: [], note: 'Školní výlet, 45 dětí + 4 pedagogové. Odjezd 7:00 od školy.', timeline: [{ at: '3. 11. 2026 09:12', who: 'Marie Dvořáková', what: 'Poptávka přijata e-mailem' }] },
  { id: 'T-2026-240', custId: 'c5', custName: 'FK Dynamo České Budějovice a.s.', contact: 'Petr Kříž, vedoucí A-týmu', email: 'kriz@dynamocb.cz', from: 'České Budějovice', to: 'Plzeň, Doosan Arena', via: '', dateFrom: '2026-11-22', days: 1, km: 280, hod: 9, pax: 28, busType: 'lux', foreign: false, nights: 0, wait: 3, status: 'potvrzeno', busIdx: 1, driverIds: ['dr1'], note: 'Zápas, odjezd 11:30 ze Střeleckého ostrova, návrat po zápase.', timeline: [{ at: '28. 10. 2026 10:40', who: 'Marie Dvořáková', what: 'Poptávka přijata' }, { at: '28. 10. 2026 14:05', who: 'Marie Dvořáková', what: 'Nabídka vystavena a odeslána', detail: 'E-mail na kriz@dynamocb.cz, PDF nabídky T-2026-240, 21 574 Kč bez DPH, platnost do 11. 11. 2026' }, { at: '30. 10. 2026 08:50', who: 'Petr Kříž (klient)', what: 'Nabídka schválena klientem', detail: 'Potvrzení e-mailem z kriz@dynamocb.cz, objednávka bez čísla' }, { at: '30. 10. 2026 09:15', who: 'Marie Dvořáková', what: 'Potvrzeno: přidělen vůz a řidič Jan Procházka', detail: 'Směna zapsána do kalendáře řidiče, klientovi odeslána informace o SPZ a kontaktu na řidiče' }] },
  { id: 'T-2026-238', custId: 'c6', custName: 'ENGEL strojírenská spol. s r.o.', contact: 'Ing. Lukas Mayer', email: 'lukas.mayer@engel.at', from: 'Kaplice, závod ENGEL', to: 'Linz, Hauptbahnhof', via: '', dateFrom: '2026-12-03', days: 1, km: 160, hod: 6, pax: 38, busType: 'standard', foreign: true, nights: 0, wait: 1, status: 'nabidka', busIdx: 2, driverIds: [], note: 'Transfer zaměstnanců na školení, zpět tentýž den.', timeline: [{ at: '2. 11. 2026 11:20', who: 'Marie Dvořáková', what: 'Poptávka přijata telefonicky' }, { at: '2. 11. 2026 15:30', who: 'Marie Dvořáková', what: 'Nabídka vystavena a odeslána', detail: 'E-mail na lukas.mayer@engel.at, PDF nabídky T-2026-238, platnost do 16. 11. 2026' }] },
  { id: 'T-2026-236', custId: 'c8', custName: 'Jihočeská univerzita v Českých Budějovicích', contact: 'doc. Ing. Jana Veselá', email: 'vesela@jcu.cz', from: 'České Budějovice, Branišovská', to: 'Vídeň, Technisches Museum', via: 'Třeboň, Gmünd', dateFrom: '2026-12-12', days: 2, km: 460, hod: 14, pax: 50, busType: 'lux', foreign: true, nights: 1, wait: 4, status: 'schvaleno', busIdx: 3, driverIds: [], note: 'Exkurze studentů, 1 nocleh v hotelu Ibis Wien Mariahilf (řidiči zajišťuje objednatel).', timeline: [{ at: '20. 10. 2026 09:00', who: 'Marie Dvořáková', what: 'Poptávka přijata' }, { at: '21. 10. 2026 16:10', who: 'Josef Moučka', what: 'Nabídka vystavena (zájezdový vůz, jeden nocleh)' }, { at: '27. 10. 2026 10:02', who: 'doc. Veselá (klient)', what: 'Nabídka schválena, objednávka č. JU/2026/418' }] },
  { id: 'T-2026-231', custId: 'c3', custName: 'Senioři Hluboká, z. s.', contact: 'Věra Dlouhá', email: 'seniori.hluboka@seznam.cz', from: 'Hluboká nad Vltavou', to: 'Český Krumlov, zámek', via: '', dateFrom: '2026-10-28', days: 1, km: 110, hod: 7, pax: 26, busType: 'midi', foreign: false, nights: 0, wait: 3, status: 'vyuctovano', busIdx: 4, driverIds: ['dr3'], note: 'Senioři, nízkopodlažní nástup, zastávka u lékárny.', timeline: [{ at: '10. 10. 2026 08:30', who: 'Marie Dvořáková', what: 'Poptávka přijata' }, { at: '10. 10. 2026 13:00', who: 'Marie Dvořáková', what: 'Nabídka vystavena' }, { at: '14. 10. 2026 09:20', who: 'Věra Dlouhá (klient)', what: 'Schváleno' }, { at: '14. 10. 2026 09:40', who: 'Marie Dvořáková', what: 'Potvrzeno: vůz a řidič Miroslav Kučera' }, { at: '28. 10. 2026 18:30', who: 'Miroslav Kučera', what: 'Realizováno, 112 km, bez závad' }, { at: '29. 10. 2026 08:15', who: 'Lenka Nováková', what: 'Vyúčtováno fakturou (12 % DPH)', detail: 'Faktura odeslána e-mailem na seniori.hluboka@seznam.cz, splatnost 14 dní' }] },
  { id: 'T-2026-229', custId: 'c7', custName: 'Budějovický Budvar, n. p.', contact: 'Bc. Tomáš Hora', email: 'tomas.hora@budvar.cz', from: 'České Budějovice, Budvar', to: 'Mnichov, Oktoberfest (firemní akce)', via: 'Linz, Passau', dateFrom: '2026-10-02', days: 2, km: 760, hod: 28, pax: 52, busType: 'lux', foreign: true, nights: 1, wait: 6, status: 'realizovano', busIdx: 5, driverIds: ['dr1', 'dr7'], note: 'Firemní zájezd, dva řidiči, parkování u hotelu.', timeline: [{ at: '1. 9. 2026 10:00', who: 'Marie Dvořáková', what: 'Poptávka přijata' }, { at: '2. 9. 2026 09:30', who: 'Josef Moučka', what: 'Nabídka vystavena' }, { at: '5. 9. 2026 14:00', who: 'Bc. Hora (klient)', what: 'Schváleno, zálohová faktura 50 %' }, { at: '8. 9. 2026 08:00', who: 'Marie Dvořáková', what: 'Potvrzeno: vůz a řidiči Procházka + Černý' }, { at: '4. 10. 2026 22:10', who: 'Jan Procházka', what: 'Realizováno, 772 km' }] },
]
// CZ mzdové odvody (orientační, 2026). Zaměstnanec vs OSVČ.
function buildPayroll(d, mode) {
  const gross = 36000 + (_hash(d.id + 'mzda') % 13) * 850 // hrubá mzda / fakturace základ
  const r = (n) => Math.round(n)
  const sleva = 2570 // měsíční sleva na poplatníka
  if (mode === 'osvc') {
    const invoice = r(gross * 1.34)
    const vydaje = r(invoice * 0.6)
    const zaklad = invoice - vydaje
    const soc = r(zaklad * 0.5 * 0.292)
    const zdrav = r(zaklad * 0.5 * 0.135)
    const dan = Math.max(0, r(zaklad * 0.15) - sleva)
    const net = invoice - soc - zdrav - dan
    return {
      mode: 'osvc', modeLabel: 'OSVČ / subdodavatel', gross: invoice,
      rows: [
        ['Fakturováno (měsíčně)', invoice, 'plus'],
        ['Výdaje paušálem 60 %', -vydaje, 'info'],
        ['Základ daně', zaklad, 'info'],
        ['Sociální pojištění (29,2 % z 50 %)', -soc, 'minus'],
        ['Zdravotní pojištění (13,5 % z 50 %)', -zdrav, 'minus'],
        ['Daň 15 % (po slevě na poplatníka)', -dan, 'minus'],
      ],
      net, netLabel: 'Čistý příjem OSVČ', employerCost: invoice, employerLabel: 'Náklad firmy (fakturace)',
      note: 'Orientační výpočet, paušální výdaje 60 %. Skutečná výše dle daňového přiznání a přehledů ČSSZ/ZP.',
    }
  }
  const socEmp = r(gross * 0.071), zdravEmp = r(gross * 0.045)
  const dan = Math.max(0, r(gross * 0.15) - sleva)
  const net = gross - socEmp - zdravEmp - dan
  const socEr = r(gross * 0.248), zdravEr = r(gross * 0.09)
  return {
    mode: 'zamestnanec', modeLabel: 'Zaměstnanec (HPP)', gross,
    rows: [
      ['Hrubá mzda', gross, 'plus'],
      ['Sociální pojištění (zaměstnanec 7,1 %)', -socEmp, 'minus'],
      ['Zdravotní pojištění (zaměstnanec 4,5 %)', -zdravEmp, 'minus'],
      ['Záloha na daň 15 % (po slevě)', -dan, 'minus'],
    ],
    net, netLabel: 'Čistá mzda',
    employer: [
      ['Sociální pojištění (zaměstnavatel 24,8 %)', socEr],
      ['Zdravotní pojištění (zaměstnavatel 9 %)', zdravEr],
    ],
    employerCost: gross + socEr + zdravEr, employerLabel: 'Celkový náklad zaměstnavatele',
    note: 'Orientační výpočet dle sazeb 2026, sleva na poplatníka 2 570 Kč/měs. Bez dalších slev a srážek.',
  }
}
// Personalistika: školení a kvalifikace řidičů (platnosti), docházka, režijní zaměstnanci
const HR_BASE = new Date(2026, 10, 5)
const _hrDate = (offsetDays) => { const dt = new Date(HR_BASE); dt.setDate(dt.getDate() + offsetDays); return `${dt.getDate()}. ${dt.getMonth() + 1}. ${dt.getFullYear()}` }
const TRAINING_TYPES = [
  { key: 'profesni', label: 'Pravidelné školení řidičů (7 h)', law: 'z. 247/2000 Sb.', every: 12, drv: true },
  { key: 'bozp', label: 'Školení BOZP a PO', law: 'zák. práce § 103', every: 24 },
  { key: 'prvni', label: 'První pomoc', law: 'interní směrnice', every: 24 },
  { key: 'tacho', label: 'Digitální tachograf a sociální předpisy', law: 'nař. EU 561/2006', every: 36, drv: true },
  { key: 'referent', label: 'Školení řidičů referentů', law: 'zák. práce § 103', every: 24, ref: true },
]
function buildTraining(d) {
  const isDrv = ['linka', 'mhd', 'dalkova'].includes(d.kind)
  return TRAINING_TYPES.filter((t) => (t.drv ? isDrv : t.ref ? !isDrv : true)).map((t, i) => {
    const off = (_hash(d.id + t.key) % 420) - 25 // −25 až +395 dní
    return { ...t, validTo: _hrDate(off), done: _hrDate(off - t.every * 30), offDays: off }
  })
}
function buildAttendance(d) {
  const R = _rng(_hash('att-' + d.id))
  const vac = new Set(), sick = new Set()
  const vacStart = 1 + Math.floor(R() * 20); if (R() < 0.45) for (let k = 0; k < 1 + Math.floor(R() * 4); k++) vac.add(vacStart + k)
  if (R() < 0.3) { const s = 1 + Math.floor(R() * 26); sick.add(s); sick.add(s + 1) }
  const days = []
  let worked = 0, hours = 0, overtime = 0, night = 0, weekend = 0
  for (let day = 1; day <= 31; day++) {
    const dow = new Date(2026, 9, day).getDay() // říjen 2026
    const isWe = dow === 0 || dow === 6
    let code = 'V'
    if (vac.has(day)) code = 'D'
    else if (sick.has(day)) code = 'N'
    else if (!isWe || R() < 0.3) { code = 'S'; worked++; const h = 7.5 + R() * 3; hours += h; if (h > 9) overtime += h - 9; if (R() < 0.25) night += 2 + R() * 3; if (isWe) weekend++ }
    days.push({ day, code, we: isWe })
  }
  return { month: 'říjen 2026', days, worked, hours: Math.round(hours), overtime: Math.round(overtime), night: Math.round(night), weekend, vacation: vac.size, sick: sick.size }
}
const SEED_STAFF = [
  { id: 'st1', name: 'Marie Dvořáková', initials: 'MD', position: 'Vedoucí dopravního dispečinku', dept: 'Dispečink', employment: 'Hlavní pracovní poměr', since: '1. 3. 2012', phone: '+420 602 331 118', email: 'm.dvorakova@csadbus.cz' },
  { id: 'st2', name: 'Josef Moučka', initials: 'JM', position: 'Vedoucí správy vozového parku', dept: 'Správa parku', employment: 'Hlavní pracovní poměr', since: '15. 6. 2009', phone: '+420 603 445 220', email: 'j.moucka@csadbus.cz' },
  { id: 'st3', name: 'Karel Dvořák', initials: 'KD', position: 'Vedoucí dopravy', dept: 'Provoz', employment: 'Hlavní pracovní poměr', since: '2. 1. 2015', phone: '+420 604 118 905', email: 'k.dvorak@csadbus.cz' },
  { id: 'st4', name: 'Jan Vávra', initials: 'JV', position: 'Automechanik', dept: 'Autoopravna', employment: 'Hlavní pracovní poměr', since: '4. 9. 2017', phone: '+420 605 221 740', email: 'j.vavra@csadbus.cz' },
  { id: 'st5', name: 'Petr Holub', initials: 'PH', position: 'Automechanik', dept: 'Autoopravna', employment: 'Hlavní pracovní poměr', since: '11. 4. 2019', phone: '+420 606 909 332', email: 'p.holub@csadbus.cz' },
  { id: 'st6', name: 'Tomáš Říha', initials: 'TŘ', position: 'Autoelektrikář', dept: 'Autoopravna', employment: 'Dohoda o pracovní činnosti', since: '1. 10. 2022', phone: '+420 607 660 214', email: 't.riha@csadbus.cz' },
  { id: 'st7', name: 'Lenka Nováková', initials: 'LN', position: 'Mzdová účetní', dept: 'Ekonomika', employment: 'Hlavní pracovní poměr', since: '1. 2. 2016', phone: '+420 608 332 551', email: 'l.novakova@csadbus.cz' },
  { id: 'st8', name: 'Ivana Horká', initials: 'IH', position: 'Personalistka', dept: 'Personalistika', employment: 'Zkrácený úvazek (0,6)', since: '1. 9. 2020', phone: '+420 609 118 902', email: 'i.horka@csadbus.cz' },
  { id: 'st9', name: 'Radek Zeman', initials: 'RZ', position: 'Skladník náhradních dílů', dept: 'Sklad', employment: 'Hlavní pracovní poměr', since: '3. 5. 2021', phone: '+420 610 445 118', email: 'r.zeman@csadbus.cz' },
]
// Účetnictví (převzato z Frenkee CRM): seed nad reálnými linkami; mzdové náklady celé firmy modelové
ACC.seedAccounting({ lines: linesData })
const PEOPLE_ALL = () => [...driversData, ...SEED_STAFF]

// Řidičský portál: zprávy, podněty, doklady (seed)
const SEED_DRV_MSGS = [
  { id: 'm1', driverId: 'dr1', with: 'dispecink', from: 'other', who: 'Marie Dvořáková', text: 'Dobrý den Honzo, zítra máte místo linky 11 záskok na 300 (ranní turnus). Vůz 5Z64073.', at: '4. 11. 2026 15:40' },
  { id: 'm2', driverId: 'dr1', with: 'dispecink', from: 'ridic', who: 'Jan Procházka', text: 'Rozumím, díky. Odjezd z vozovny v 4:20?', at: '4. 11. 2026 15:52' },
  { id: 'm3', driverId: 'dr1', with: 'dispecink', from: 'other', who: 'Marie Dvořáková', text: 'Ano, 4:20. Klíče u vrátnice, stazka je v tabletu.', at: '4. 11. 2026 16:01' },
  { id: 'm4', driverId: 'dr1', with: 'vedeni', from: 'other', who: 'Ing. Pavel Šimek', text: 'Děkuji za bezchybný říjen. Eco skóre 88 je nejlepší v parku, promítne se do odměn.', at: '2. 11. 2026 09:10' },
]
const SEED_DRV_IDEAS = [
  { id: 'i1', driverId: 'dr1', cat: 'Provoz', text: 'Na lince 11 posunout odjezd 6:05 o 3 minuty, navazuje vlak z Protivína a lidé ho nestíhají.', date: '28. 10. 2026', status: 'V posouzení', votes: 4 },
  { id: 'i2', driverId: 'dr3', cat: 'Vozidla', text: 'Do vozů SOR doplnit držák na tablet pro stazku, teď leží na palubní desce.', date: '20. 10. 2026', status: 'Přijato', votes: 7 },
  { id: 'i3', driverId: 'dr5', cat: 'Zázemí', text: 'V Kaplici na konečné chybí WC pro řidiče, obratová doba 12 minut nestačí dojít do města.', date: '12. 10. 2026', status: 'Nové', votes: 9 },
]
const SEED_DRV_DOCS = [
  { id: 'd1', driverId: 'dr1', type: 'Občanský průkaz', validTo: '12. 4. 2027', status: 'ok', file: 'op-prochazka.pdf' },
  { id: 'd2', driverId: 'dr1', type: 'Řidičský průkaz (C, D+E)', validTo: '1. 1. 2028', status: 'ok', file: 'rp-prochazka.pdf' },
  { id: 'd3', driverId: 'dr1', type: 'Průkaz profesní způsobilosti', validTo: '1. 1. 2026', status: 'expiring', file: 'ppzr-prochazka.pdf' },
  { id: 'd4', driverId: 'dr1', type: 'Karta řidiče (digitální tachograf)', validTo: '1. 1. 2028', status: 'ok', file: 'karta-ridice.pdf' },
  { id: 'd5', driverId: 'dr1', type: 'Posudek o zdravotní způsobilosti', validTo: '15. 2. 2027', status: 'ok', file: 'lekarska-2025.pdf' },
  { id: 'd6', driverId: 'dr1', type: 'Potvrzení o školení BOZP a PO', validTo: '5. 12. 2026', status: 'expiring', file: null },
  { id: 'd7', driverId: 'dr1', type: 'Výpis z rejstříku trestů', validTo: null, status: 'missing', file: null },
]
const DRV_DOC_STATUS = {
  ok: { label: 'V pořádku', color: 'var(--green)', bg: 'var(--green-soft)' },
  expiring: { label: 'Končí platnost', color: '#B45309', bg: 'var(--amber-soft)' },
  missing: { label: 'Chybí', color: 'var(--star)', bg: 'var(--star-soft)' },
  uploaded: { label: 'Nahráno · čeká na ověření', color: 'var(--blue-ink)', bg: 'var(--blue-soft)' },
}
const DRIVER_NAV = [['dashboard', 'Domů', 'home'], ['drv-smeny', 'Můj kalendář', 'calendar'], ['drv-volno', 'Volno', 'clock'], ['drv-zpravy', 'Zprávy', 'send'], ['drv-podnety', 'Podněty', 'sparkle'], ['drv-doklady', 'Moje doklady', 'file'], ['drv-mzda', 'Mzda', 'banknote']]

// Onboarding nového zákazníka podle IČO: ARES → trAIce analýza → doplňující otázky → návrh portálu na míru
const ONB_ANSWERS = { leasing: [], machines: 'ne', machinesCount: '', telematics: 'ne', telematicsBrand: '', customers: [], platforms: [], drivers: '', extra: [], priorities: [] }
const DEFAULT_ONB = { step: 1, ico: '', loading: false, error: null, firm: null, anIdx: -1, anOpen: false, autoIco: null, answers: { ...ONB_ANSWERS }, selected: null, done: false }
// Zkušební verze: 7 dní se svými daty, pak faktura podle kalkulace z webu, jinak zůstane jen evidence vozidel
const TRIAL_DAYS = 7
const TRIAL_ALLOWED = ['vehicles', 'vehicle-detail', 'fleets', 'fleet-detail', 'settings']
const trialDates = () => { const s = new Date(2026, 10, 6); const e = new Date(2026, 10, 6 + TRIAL_DAYS); const f = (d) => `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}`; return { started: f(s), ends: f(e) } }
const ONB_AN_STEPS = ['Registr ekonomických subjektů (ARES)', 'Obchodní rejstřík a Sbírka listin', 'Registr silničních vozidel', 'Registr smluv a veřejné zakázky', 'Ekonomika a platební morálka', 'Mapování na profily provozu']
const onbAresFirm = (d) => ({
  id: 'ares', live: true,
  company: { name: d.obchodniJmeno, ico: d.ico, dic: d.dic || 'není plátce', address: (d.sidlo && d.sidlo.textovaAdresa) || '—', region: (d.sidlo && d.sidlo.nazevKraje) || '—', legal: Number(d.pravniForma), founded: d.datumVzniku, vat: !!(d.seznamRegistraci && d.seznamRegistraci.stavZdrojeDph === 'AKTIVNI'), vr: !!(d.seznamRegistraci && d.seznamRegistraci.stavZdrojeVr === 'AKTIVNI'), nace: (d.czNace && d.czNace.length ? d.czNace : d.czNace2008) || [] },
})
// Reálný registr vozidel ČSAD (z dat portálu)
const csadRegister = () => {
  const kinds = {}; const brands = {}; const fuel = {}; let ageSum = 0; let ageN = 0
  vehiclesData.forEach((v) => { const k = vehicleTypeCat(v.druh); kinds[k] = (kinds[k] || 0) + 1; if (v.brand && v.brand !== '—') brands[v.brand] = (brands[v.brand] || 0) + 1; const f = v.fuel && v.fuel !== '—' ? v.fuel : 'Neuvedeno'; fuel[f] = (fuel[f] || 0) + 1; if (v.year > 1900) { ageSum += 2026 - v.year; ageN++ } })
  return { total: vehiclesData.length, kinds, brands: Object.entries(brands).sort((a, b) => b[1] - a[1]).slice(0, 5), fuel, age: `${(ageSum / Math.max(1, ageN)).toFixed(1).replace('.', ',')} roku`, sites: fleetsData.map((f) => f.name) }
}
const CSAD_FIRM_EXTRA = {
  register: null, // doplní se živě z dat portálu
  economy: { rows: [], source: 'Výroční zpráva 2025 ve Sbírce listin (PDF, auditovaná)', signal: 'Finanční ukazatele načte trAIce na serveru po připojení klienta. V demu se nezobrazují, aby nevznikla nepřesná čísla.' },
  contracts: { public: null, note: 'Smlouvy s veřejnými objednateli dopravní obslužnosti: Jihočeský kraj (JIKORD) a města. Počet a objem doplní trAIce z registru smluv.' },
  answers: { ...ONB_ANSWERS, customers: ['kraj'], extra: ['zajezdy', 'servis', 'phm'], telematics: 'ne', drivers: '' },
}

export default function FleetPortal() {
  const [state, setStateRaw] = useState(() => ({
    dash: loadDash(), kpi: loadKpi(),
    role: 'majitel', roleMenu: false,
    route: typeof location !== 'undefined' && location.hash.startsWith('#onboarding') ? 'onboarding' : 'dashboard', attnCat: null,
    onb: { ...DEFAULT_ONB, autoIco: (typeof location !== 'undefined' && (location.hash.match(/[?&]ico=(\d{8})/) || [])[1]) || null }, tenant: null, soonModule: null, orderModal: false,
    anoView: 'vse', anoType: null, anoDriver: null, anoVehicle: null, anomalyId: null,
    fleetId: 'f1', vehicleId: 'v1',
    fleetTab: 'overview', vehicleTab: 'overview', fleetsView: 'grid', finTab: 'prehled', rfq: null, rfqs: SEED_RFQS,
    vehEquip: SEED_EQUIP, equipModal: null,
    vehService: SEED_SERVICE, vehTires: SEED_TIRES, vehFines: SEED_FINES, vehCostsExtra: SEED_COSTS,
    serviceModal: null, tireModal: null, fineModal: null,
    audit: SEED_AUDIT,
    search: false, notif: false, ai: false, companyMenu: false, sidebar: false, execReport: null,
    hrMode: {}, timeOff: SEED_TIMEOFF, driverReports: SEED_DRIVER_REPORTS, reportModal: null, timeOffModal: null, reportForm: {}, timeOffForm: {}, optiRun: false,
    ucTab: 'prehled', accVersion: 0, ucInvFilter: 'vse', ucInvDetail: null, ucNew: null, ucAskCredit: false, ucReason: '', ucExpFilter: 'vse', ucExpDetail: null, ucExpNote: '', ucAcc: 'csob', ucBank: 'vse', ucMonth: null, ucNotes: {},
    drvMsgs: SEED_DRV_MSGS, drvMsgTo: 'dispecink', drvMsgText: '', drvIdeas: SEED_DRV_IDEAS, drvIdeaText: '', drvIdeaCat: 'Provoz', drvDocs: SEED_DRV_DOCS,
    navOpen: { provoz: true, flotila: true, lide: true, finance: true, firma: false },
    shifts: SEED_SHIFTS, shiftForm: { dayKey: SHIFT_DAYS[1].key, driverId: 'dr1', lineId: linesData[0].id, busId: linesData[0].busId, turnus: 'ranní' },
    vyk: { month: '2026-10', cust: 'c2', status: { ...VYK_SEED_STATUS }, log: { ...VYK_SEED_LOG }, resolved: {}, docs: {}, lineOpen: null, lineDay: null, showAll: false },
    zajTrips: SEED_TRIPS, zajCalc: { ...DEFAULT_TRIP_CALC }, zajCalcOpen: false, zajDetailId: null, zajFilter: 'vse', zajPick: null, zajPickEdit: false,
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
  const setRole = (id) => setState({ role: id, roleMenu: false, route: id === 'ucetni' ? 'ucetnictvi' : 'dashboard', ucTab: 'prehled', search: false, notif: false })
  const toggleRoleMenu = () => setState((s) => ({ roleMenu: !s.roleMenu, notif: false, companyMenu: false }))
  const openFleet = (id) => navigate('fleet-detail', { fleetId: id, fleetTab: 'overview' })
  // Vozové parky: když je jen jeden, přeskoč dlaždice a jdi rovnou na jeho detail.
  const goParks = () => allFleets.length === 1 ? openFleet(allFleets[0].id) : navigate('fleets')
  const openVehicle = (id) => navigate('vehicle-detail', { vehicleId: id, vehicleTab: 'overview' })
  const openDriver = (id) => navigate('driver-detail', { driverId: id })
  // HR: mzdy, výplatnice, dovolená, hlášení řidičů
  const hrModeOf = (d) => state.hrMode[d.id] || (d.employment && d.employment.includes('OSVČ') ? 'osvc' : 'zamestnanec')
  const setHrMode = (driverId, mode) => setState((s) => ({ hrMode: { ...s.hrMode, [driverId]: mode } }))
  const genPayslip = (d, mode) => setState({ execReport: buildPayslipHtml(d, buildPayroll(d, mode)) })
  const openTimeOffModal = (driverId) => setState({ timeOffModal: { driverId }, timeOffForm: { from: '', to: '', days: '', type: 'Dovolená' } })
  const setTimeOffForm = (k, v) => setState((s) => ({ timeOffForm: { ...s.timeOffForm, [k]: v } }))
  const submitTimeOff = () => { const f = state.timeOffForm, m = state.timeOffModal; if (!m) return; const entry = { id: 'to' + Date.now(), driverId: m.driverId, from: f.from || '—', to: f.to || f.from || '—', days: parseInt(f.days, 10) || 1, type: f.type || 'Dovolená', status: 'pending' }; setState((s) => ({ timeOff: [entry, ...s.timeOff], timeOffModal: null })); showToast('Žádost o volno odeslána ke schválení.') }
  const openReportModal = (driverId, cat) => setState({ reportModal: { driverId }, reportForm: { cat: cat || 'vozidlo', sev: 'mid', text: '' } })
  const setReportForm = (k, v) => setState((s) => ({ reportForm: { ...s.reportForm, [k]: v } }))
  const submitReport = () => { const f = state.reportForm, m = state.reportModal; if (!m || !f.text) return; const entry = { id: 'dr-r' + Date.now(), driverId: m.driverId, cat: f.cat, sev: f.sev, text: f.text, date: '5. 11. 2026', status: 'new' }; setState((s) => ({ driverReports: [entry, ...s.driverReports], reportModal: null })); showToast('Hlášení odesláno dispečinku.') }
  // Účetnictví: nový doklad
  const openNewDoc = (docType) => setState({ ucNew: { docType, custId: '', custName: '', custIco: '', custAddr: '', issued: '2026-11-05', duzp: '2026-11-05', dueDays: 14, method: docType === 'prijmovy' ? 'Hotově' : 'Bankovní převod', withVat: false, rows: [{ text: '', qty: '1', unit: 'ks', price: '', vat: docType === 'faktura' ? 12 : 21 }], note: '', related: '', paidOn: '' } })
  // Řidičský portál: zprávy, podněty, doklady
  const sendDrvMsg = () => { const t = (state.drvMsgText || '').trim(); if (!t) return; setState((s) => ({ drvMsgs: [...s.drvMsgs, { id: 'm' + Date.now(), driverId: 'dr1', with: s.drvMsgTo || 'dispecink', from: 'ridic', who: 'Jan Procházka', text: t, at: '5. 11. 2026 ' + new Date().toTimeString().slice(0, 5) }], drvMsgText: '' })); showToast('Zpráva odeslána.') }
  const addIdea = () => { const t = (state.drvIdeaText || '').trim(); if (!t) return; setState((s) => ({ drvIdeas: [{ id: 'i' + Date.now(), driverId: 'dr1', cat: s.drvIdeaCat || 'Provoz', text: t, date: '5. 11. 2026', status: 'Nové', votes: 1 }, ...s.drvIdeas], drvIdeaText: '' })); showToast('Podnět odeslán vedení. Děkujeme!') }
  const voteIdea = (id) => setState((s) => ({ drvIdeas: s.drvIdeas.map((i) => i.id === id ? { ...i, votes: i.votes + 1 } : i) }))
  const uploadDrvDoc = (id, file) => { if (!file) return; setState((s) => ({ drvDocs: s.drvDocs.map((x) => x.id === id ? { ...x, status: 'uploaded', file: file.name, uploadedAt: '5. 11. 2026' } : x) })); showToast(`Doklad ${file.name} nahrán, personalistika ho ověří.`) }
  // Plánování směn: dispečer/správce předá řidiči jízdní řád, řidič potvrdí převzetí
  const setShiftForm = (k, v) => setState((s) => ({ shiftForm: { ...s.shiftForm, [k]: v, ...(k === 'lineId' ? { busId: (linesData.find((l) => l.id === v) || {}).busId || s.shiftForm.busId } : {}) } }))
  const assignShift = () => { const f = state.shiftForm; const [start, end] = SHIFT_TURNUS[f.turnus] || SHIFT_TURNUS['ranní']; const entry = { id: 's' + Date.now(), dayKey: f.dayKey, driverId: f.driverId, lineId: f.lineId, busId: f.busId, turnus: f.turnus, start, end, depot: 'Vozovna České Budějovice, Žižkova tř.', status: 'planned' }; setState((s) => ({ shifts: [...s.shifts.filter((x) => !(x.dayKey === entry.dayKey && x.driverId === entry.driverId)), entry] })); const dn = (driversData.find((x) => x.id === f.driverId) || {}).name; const ln = (linesData.find((l) => l.id === f.lineId) || {}).no; showToast(`Směna přidělena: ${dn}, linka ${ln}, ${f.turnus}. Řidič ji uvidí v kalendáři a potvrdí převzetí.`) }
  const removeShift = (id) => setState((s) => ({ shifts: s.shifts.filter((x) => x.id !== id) }))
  const confirmShift = (id) => { setState((s) => ({ shifts: s.shifts.map((x) => x.id === id ? { ...x, status: 'confirmed' } : x) })); showToast('Jízdní řád převzat, dispečink dostal potvrzení.') }
  const shiftRow = (s) => {
    if (s.kind === 'zajezd') {
      const t = state.zajTrips.find((x) => x.id === s.tripId); const b = vehiclesData.find((v) => v.id === s.busId); const d = driversData.find((x) => x.id === s.driverId); const day = SHIFT_DAYS.find((x) => x.key === s.dayKey)
      return { ...s, lineNo: 'Z', lineName: t ? `Zájezd: ${t.from} → ${t.to}` : 'Zájezd', lineId: null, from: t ? t.from : '', to: t ? t.to : '', departures: [], tripsDay: 'zájezd', bus: b ? `${b.brand} ${b.model}`.trim() : '—', plate: b ? b.plate : '—', driverName: d ? d.name : '—', driverInitials: d ? d.initials : '', dayLabel: day ? day.label : fmtIsoDate(s.dayKey), dateStr: day ? day.dateStr : fmtIsoDate(s.dayKey), meta: SHIFT_STATUS[s.status], openLine: () => openTrip(s.tripId), remove: () => removeShift(s.id), confirm: () => confirmShift(s.id), tripId: s.tripId, custName: t ? t.custName : '' }
    }
    const l = linesData.find((x) => x.id === s.lineId) || linesData[0]; const b = vehiclesData.find((v) => v.id === s.busId); const d = driversData.find((x) => x.id === s.driverId); const day = SHIFT_DAYS.find((x) => x.key === s.dayKey); return { ...s, lineNo: l.no, lineName: l.name, lineId: l.id, from: l.stops[0] ? l.stops[0].n : '', to: l.stops.length ? l.stops[l.stops.length - 1].n : '', departures: l.departures.slice(0, 8), tripsDay: l.tripsDay, bus: b ? `${b.brand} ${b.model}`.trim() : '—', plate: b ? b.plate : '—', driverName: d ? d.name : '—', driverInitials: d ? d.initials : '', dayLabel: day ? day.label : s.dayKey, dateStr: day ? day.dateStr : s.dayKey, meta: SHIFT_STATUS[s.status], openLine: () => openLine(l.id), remove: () => removeShift(s.id), confirm: () => confirmShift(s.id) } }
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
      ['optimalizace', 'AI optimalizace', 'sparkle', null],
      ['anomalies', 'Anomálie', 'alert', String(FLEET_ANOMALIES.filter((a) => a.status !== 'done').length) || null],
      ['servis', 'Servis a sklady', 'wrench', null],
      ['eco', 'Eco-driving', 'gauge', null],
      ['zajezdy', 'Zájezdy', 'pin', null],
      ['elektrobusy', 'Elektrobusy', 'fuel', null],
      ['insurance', 'Pojištění', 'shield', null],
      ['financing', 'Financování', 'banknote', String(vehiclesData.filter((v) => v.financing && v.financing.active).length)],
      ['vykony', 'Vyúčtování výkonů', 'scales', null],
      ['ucetnictvi', 'Účetnictví', 'banknote', String(ACC.alerts().filter((a) => a.level !== 'info').length) || null],
      ['claims', 'Škody', 'umbrella', String(claimsData.filter((c) => c.status !== 'closed').length) || null],
      ['documents', 'Dokumenty', 'file', null],
      ['analytics', 'Reporting', 'trend', null],
      ['contacts', 'Kontakty', 'users', null],
      ['settings', 'Nastavení', 'settings', null],
    ]
    const activeRoute = r === 'fleet-detail' ? 'fleets' : r === 'vehicle-detail' ? 'vehicles' : r === 'driver-detail' ? 'drivers' : r === 'bonifikace-detail' ? 'bonifikace' : r === 'documents-detail' ? 'documents' : r === 'claim-detail' ? 'claims' : r === 'linky-detail' ? 'linky' : r === 'stazka' ? 'dispatch' : r === 'anomaly-detail' ? 'anomalies' : r === 'zajezd-detail' ? 'zajezdy' : r === 'soon' ? 'soon:' + state.soonModule : r
    // Menu podle zapnutých provozů (po onboardingu): moduly jádra vždy, moduly profilů jen pro zapnuté profily,
    // a k nim moduly, které pro daný profil teprve připravujeme (otevřou stránku s popisem).
    const tenantNav = (items) => {
      const prov = state.tenant && state.tenant.provozy
      if (!prov) return items
      const kept = items.filter(([id]) => !MODULE_PROFILES[id] || MODULE_PROFILES[id].some((p) => prov.includes(p)))
      const soon = []
      prov.forEach((pid) => { const p = profileById(pid); if (p) p.modules.forEach(([mid, label]) => { if (!BUILT_MODULES.has(mid) && !soon.find((s) => s[0] === 'soon:' + mid)) soon.push(['soon:' + mid, label, p.icon, 'brzy']) }) })
      const idx = kept.findIndex(([id]) => id === 'fleets')
      return [...kept.slice(0, idx), ...soon, ...kept.slice(idx)]
    }
    const drvBadge = { 'drv-smeny': state.shifts.filter((s) => s.driverId === 'dr1' && s.status === 'planned').length, 'drv-volno': state.timeOff.filter((t) => t.driverId === 'dr1' && t.status === 'pending').length, 'drv-zpravy': 1, 'drv-doklady': state.drvDocs.filter((x) => x.driverId === 'dr1' && (x.status === 'missing' || x.status === 'expiring')).length }
    const ucBadge = String(ACC.alerts().filter((a) => a.level !== 'info').length) || null
    const navSrc = state.role === 'ridic' ? DRIVER_NAV.map(([id, label, icon]) => [id, label, icon, drvBadge[id] ? String(drvBadge[id]) : null])
      : state.role === 'ucetni' ? ACCOUNTANT_NAV.map(([id, label, icon]) => [id, label, icon, id === 'ucetnictvi' ? ucBadge : null])
      : tenantNav(navItems.filter(([id]) => id !== 'ucetnictvi' || state.role === 'majitel'))
    const expired = !!(state.tenant && state.tenant.expired && !state.tenant.paid)
    const nav = navSrc.map(([id, label, icon, badge]) => {
      const on = activeRoute === id
      const locked = expired && !['vehicles', 'fleets', 'settings'].includes(id)
      return {
        id, label, icon: ic(icon, 20), iconColor: on ? '#fff' : 'var(--side-fg)', lock: locked,
        onClick: () => locked ? setState({ orderModal: true }) : id === 'fleets' ? goParks() : id.startsWith('soon:') ? navigate('soon', { soonModule: id.slice(5) }) : navigate(id),
        style: `position:relative;display:flex;align-items:center;gap:13px;padding:11px 13px;margin:3px 0;border-radius:14px;font-size:14px;font-weight:${on ? '600' : '500'};cursor:pointer;letter-spacing:-.1px;transition:background .16s ease,color .16s ease,box-shadow .16s ease;color:${on ? '#fff' : 'var(--side-fg)'};background:${on ? 'linear-gradient(135deg,#4F6FFF 0%,#6D5EF6 100%)' : 'transparent'};box-shadow:${on ? '0 10px 24px -8px rgba(79,111,255,.7)' : 'none'};${locked ? 'opacity:.42' : ''}`,
        hover: on ? '' : 'background:var(--side-hover);color:var(--side-strong)',
        badge: locked ? null : badge, badgeStyle: `font-size:11px;font-weight:700;font-variant-numeric:tabular-nums;color:${on ? '#fff' : 'var(--side-fg)'};background:rgba(255,255,255,${on ? '.22' : '.07'});padding:2px 8px;border-radius:20px`,
      }
    })
    // skupiny menu podle role: flotilové role mají sekce jako Frenkee CRM, řidič a účetní jednu skupinu
    const toggleNavGroup = (g) => setState((s) => ({ navOpen: { ...s.navOpen, [g]: !s.navOpen[g] } }))
    const navGroups = state.role === 'ridic' ? [{ id: 'portal', title: 'Můj portál', items: nav, open: true, collapsible: false }]
      : state.role === 'ucetni' ? [{ id: 'acc', title: 'Účetní agenda', items: nav, open: true, collapsible: false }]
      : NAV_GROUPS.map(([id, title]) => ({ id, title, items: nav.filter((n) => (NAV_GROUP_OF[n.id] || (n.id.startsWith('soon:') ? 'provoz' : 'firma')) === id), open: id === 'work' ? true : state.navOpen[id] !== false, collapsible: id !== 'work', toggle: () => toggleNavGroup(id) })).filter((g) => g.items.length > 0)
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
      optimalizace: ['AI optimalizace', 'Návrh oběhů vozidel a turnusů řidičů podle zadaných podmínek'],
      servis: ['Servis a sklady', 'Autoopravna, sklad náhradních dílů, PHM a plán údržby'],
      zajezdy: ['Zájezdy', 'Nepravidelná doprava: kalkulace, objednávky a vyúčtování jízd'],
      elektrobusy: ['Elektrobusy', 'Stav baterií, plán nabíjení a dojezd elektrobusů'],
      vykony: ['Vyúčtování výkonů', 'Ujeté km a spoje, plán vs. skutečnost, podklad pro objednatele'],
      ucetnictvi: ['Účetnictví', 'Vydané doklady, náklady, banka, uzávěrka, kontrola vedení a daňové podklady'],
      'drv-volno': ['Volno a dovolená', 'Moje žádosti o volno a zůstatek dovolené'],
      'drv-zpravy': ['Zprávy', 'Komunikace s dispečinkem a vedením'],
      'drv-podnety': ['Podněty', 'Nápady na zlepšení provozu, vozidel a zázemí'],
      'drv-doklady': ['Moje doklady', 'Průkazy, potvrzení a chybějící podklady'],
      'drv-mzda': ['Moje mzda', 'Výplatnice, odvody a docházka'],
      'drv-smeny': ['Můj kalendář', 'Přidělené směny: kdy, na které lince, na kterém autobuse a kde být'],
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
    else if (r === 'zajezd-detail') { const t = state.zajTrips.find((x) => x.id === state.zajDetailId) || state.zajTrips[0]; title = `${t.from} → ${t.to}`; sub = `Zájezd ${t.id} · ${t.custName} · ${fmtIsoDate(t.dateFrom)}` }
    else if (r === 'soon') { const m = SOON_MODULES[state.soonModule] || ['Modul', '']; title = m[0]; sub = 'Modul profilu provozu, který pro vás připravujeme' }
    else { const t = titles[r] || ['', '']; title = t[0]; sub = t[1] }
    const openOrder = () => setState({ orderModal: true })
    const tenantObj = state.tenant
      ? (() => {
        const t = state.tenant
        const provNames = t.provozy.map((p) => profileById(p)).filter(Boolean).map((p) => p.name)
        const banner = t.paid
          ? { tone: 'green', text: `Fleet Portal je aktivní pro ${t.name}. Faktura vystavena, provozy: ${provNames.join(', ')}.${t.preview ? ' Data v obrazovkách jsou ukázková (ČSAD).' : ''}`, actions: t.preview ? [{ label: 'Ukončit náhled', onClick: () => { setState({ tenant: null, route: 'dashboard' }); showToast('Náhled ukončen, zpět v portálu ČSAD') } }] : [] }
          : expired
            ? { tone: 'red', text: `Zkušební doba pro ${t.name} skončila ${t.trial.ends}. Aktivní zůstává jen evidence vozidel a parků. Ostatní moduly se odemknou po uhrazení faktury.`, actions: [{ label: 'Objednat a odemknout', onClick: openOrder, primary: true }, ...(t.preview ? [{ label: 'Ukončit náhled', onClick: () => { setState({ tenant: null, route: 'dashboard' }); showToast('Náhled ukončen, zpět v portálu ČSAD') } }] : [])] }
            : { tone: 'blue', text: `Zkušební verze pro ${t.name}: ${TRIAL_DAYS} dní zdarma se svými daty, do ${t.trial.ends}. Potom buď faktura podle kalkulace z webu, nebo zůstane jen evidence vozidel.${t.preview ? ' Menu je podle návrhu, data v obrazovkách jsou ukázková (ČSAD).' : ''}`, actions: [{ label: 'Objednat', onClick: openOrder, primary: true }, { label: 'Simulovat konec zkušební doby', onClick: () => { setState((s) => ({ tenant: { ...s.tenant, expired: true }, route: TRIAL_ALLOWED.includes(s.route) ? s.route : 'vehicles', orderModal: false })); showToast('Zkušební doba skončila, aktivní je jen evidence vozidel') } }, ...(t.preview ? [{ label: 'Ukončit náhled', onClick: () => { setState({ tenant: null, route: 'dashboard' }); showToast('Náhled ukončen, zpět v portálu ČSAD') } }] : [])] }
        return { name: t.name, vehicles: t.vehicles, preview: !!t.preview, provozy: provNames, trial: t.trial, paid: !!t.paid, expired, banner }
      })()
      : { name: 'ČSAD AUTOBUSY České Budějovice', vehicles: vehiclesData.length, preview: false, provozy: [], banner: null }
    const orderModal = state.orderModal && state.tenant ? {
      tenant: tenantObj, provozy: state.tenant.provozy.map((p) => profileById(p)).filter(Boolean),
      close: () => setState({ orderModal: false }), stop: (e) => e.stopPropagation(),
      confirm: () => { setState((s) => ({ tenant: { ...s.tenant, paid: true, expired: false }, orderModal: false })); showToast('Faktura vystavena a odeslána, Fleet Portal je aktivní') },
    } : null
    const soonObj = r === 'soon' ? (() => { const m = SOON_MODULES[state.soonModule] || ['Modul', '']; const p = PROFILES.find((x) => x.modules.some(([mid]) => mid === state.soonModule)); return { title: m[0], desc: m[1], profile: p ? p.name : '', icon: p ? p.icon : 'info', others: p ? p.modules.filter(([mid]) => mid !== state.soonModule).map(([mid, label]) => ({ id: mid, label, built: BUILT_MODULES.has(mid), open: () => BUILT_MODULES.has(mid) ? navigate(mid) : navigate('soon', { soonModule: mid }) })) : [] } })() : null

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
      nav, navGroups, pageTitle: title, pageSubtitle: sub, route: r, companyVehicles: vehiclesData.length,
      tenant: tenantObj, soon: soonObj, orderModal, isOnboarding: r === 'onboarding', isSoon: r === 'soon',
      startOnboarding: () => { setState({ onb: { ...DEFAULT_ONB }, route: 'onboarding', roleMenu: false, search: false, notif: false, ai: false }) },
      exitPreview: () => { setState({ tenant: null, route: 'dashboard' }); showToast('Náhled ukončen, zpět v portálu ČSAD') },
      isDashboard: r === 'dashboard', isFleets: r === 'fleets', isFleetDetail: r === 'fleet-detail',
      isVehicles: r === 'vehicles', isVehicleDetail: r === 'vehicle-detail',
      isInsurance: r === 'insurance', isInsuranceDetail: r === 'insurance-detail', isClaims: r === 'claims', isDocuments: r === 'documents', isAnalytics: r === 'analytics', isContacts: r === 'contacts', isSettings: r === 'settings', isDrivers: r === 'drivers', isDriverDetail: r === 'driver-detail', isFinancing: r === 'financing',
      isLinky: r === 'linky', isLinkyDetail: r === 'linky-detail', isEco: r === 'eco', isAttention: r === 'attention', isDispatch: r === 'dispatch', isStazka: r === 'stazka', isAnomalies: r === 'anomalies', isAnomalyDetail: r === 'anomaly-detail', isMap: r === 'map', isOptimalizace: r === 'optimalizace', isServis: r === 'servis', isZajezdy: r === 'zajezdy', isZajezdDetail: r === 'zajezd-detail', isElektrobusy: r === 'elektrobusy', isVykony: r === 'vykony', isUcetnictvi: r === 'ucetnictvi', isDrvPortal: r.startsWith('drv-'),
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
      reportModal: state.reportModal ? {
        form: state.reportForm, cats: Object.keys(REPORT_CAT).map((k) => ({ id: k, label: REPORT_CAT[k].label, icon: REPORT_CAT[k].icon })),
        setCat: (c) => setReportForm('cat', c), setSev: (s) => setReportForm('sev', s), setText: (e) => setReportForm('text', e.target.value),
        canSend: !!(state.reportForm.text && state.reportForm.text.trim()), submit: submitReport, close: () => setState({ reportModal: null }), stop,
      } : null,
      timeOffModal: state.timeOffModal ? {
        form: state.timeOffForm, types: ['Dovolená', 'Náhradní volno', 'Lékař', 'Neplacené volno'],
        setType: (t) => setTimeOffForm('type', t), setFrom: (e) => setTimeOffForm('from', e.target.value), setTo: (e) => setTimeOffForm('to', e.target.value), setDays: (e) => setTimeOffForm('days', e.target.value),
        canSend: !!(state.timeOffForm.from && String(state.timeOffForm.from).trim()), submit: submitTimeOff, close: () => setState({ timeOffModal: null }), stop,
      } : null,
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
    const vehAnomAll = FLEET_ANOMALIES.filter((a) => a.vehicleId === v.id)
    const vehAnomalies = vehAnomAll.slice(0, 6).map((a) => ({ id: a.id, typeLabel: a.typeLabel, icon: a.icon, sevMeta: a.sevMeta, date: a.date, detail: a.detail, metric: a.metric, statusMeta: a.statusMeta, onClick: () => openAnomaly(a.id) }))
    return {
      vehicleTabs,
      vd: {
        anomalies: vehAnomalies, anoCount: vehAnomAll.length, anoHigh: vehAnomAll.filter((a) => a.sev === 'high').length,
        goAnomalies: () => openAnomalies({ anoVehicle: v.id }),
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

    // školení a kvalifikace
    const skol = driversData.flatMap((d) => buildTraining(d).map((t) => ({ d, t, due: dueInfo(t.validTo, 60) }))).filter((x) => x.due && x.due.days <= 60).sort((a, b) => a.due.days - b.due.days)
      .map(({ d, t, due }) => ({ title: d.name, sub: `${t.label} · ${t.law}`, icon: ic('doc2', 17), badge: badge(due), onClick: () => openDriver(d.id), actionLabel: 'Naplánovat školení', action: () => showToast(`Školení naplánováno · ${d.name} (${t.label})`) }))

    const defs = [
      { id: 'stk', label: 'Končící STK a emise', icon: 'check2', color: 'var(--amber)', hint: 'Technická prohlídka do 60 dnů nebo po platnosti', items: stk },
      { id: 'lekarska', label: 'Končící lékařské prohlídky', icon: 'shield', color: 'var(--green)', hint: 'Pravidelná prohlídka řidiče (§ 87 z. 361/2000)', items: lek },
      { id: 'skoleni', label: 'Končící školení řidičů', icon: 'doc2', color: '#6D5EF6', hint: 'Pravidelné školení, BOZP, první pomoc, tachograf', items: skol },
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

  // ---- Vyúčtování výkonů dopravce (ujeté km a spoje, plán vs. skutečnost) ----
  // ---- Vyúčtování výkonů: měsíční proces objednatel po objednateli ----
  const vykSet = (patch) => setState((st) => ({ vyk: { ...st.vyk, ...patch } }))
  const vykLog = (key, what, detail, who) => setState((st) => ({ vyk: { ...st.vyk, log: { ...st.vyk.log, [key]: [...(st.vyk.log[key] || []), { at: tripStamp(), who: who || zajUser(), what, detail }] } } }))
  const vykStatusOf = (key) => state.vyk.status[key] || 'sber'
  const vykResolvedMap = (key) => {
    const own = state.vyk.resolved[key] || {}
    if (vykStatusOf(key) !== 'uzavreno') return own
    return new Proxy(own, { get: (o, id) => o[id] || { action: 'closed' } })
  }
  const vykBuilt = (month, custId) => linesData.filter((l) => vykCustOf(l) === custId).map((l) => buildVykLine(l, month))
  const vykSum = (rows) => rows.reduce((a, r) => { Object.keys(r.t).forEach((k) => { a[k] = (a[k] || 0) + r.t[k] }); return a }, {})
  const vykMonthFor = (month, custId) => {
    const key = `${month}:${custId}`; const resolved = vykResolvedMap(key)
    const rows = vykBuilt(month, custId).map((b) => ({ ...b, t: vykTotals(b, resolved) }))
    const tot = vykSum(rows); const c = VYK_CONTRACTS[custId]
    return { key, rows, tot, advance: c.advance, diff: (tot.komp || 0) - c.advance, status: vykStatusOf(key) }
  }
  const linkDocToVyk = (key, r) => {
    setState((st) => ({ vyk: { ...st.vyk, docs: { ...st.vyk.docs, [key]: [...(st.vyk.docs[key] || []), r.id] }, status: { ...st.vyk.status, [key]: 'uzavreno' }, log: { ...st.vyk.log, [key]: [...(st.vyk.log[key] || []), { at: tripStamp(), who: zajUser(), what: 'Vyúčtováno fakturou, měsíc uzavřen', detail: `${r.number} na ${czk(r.total)} (kompenzace mimo DPH), splatnost ${ACC.fmtDate(r.due)}, VS ${r.vs}; zápočet zálohy ${czk(VYK_CONTRACTS[key.split(':')[1]].advance)}` }] } } }))
  }
  const vykOpenDoc = (month, custId) => {
    const m = vykMonthFor(month, custId); const cust = ACC.CUSTOMERS.find((x) => x.id === custId)
    const rows = m.rows.map((r) => ({ text: `Kompenzace prokazatelné ztráty, linka ${r.line.no} ${r.line.name}, ${vykMonthLabel(month)}: ${r.t.kmUzn.toLocaleString('cs-CZ')} uznatelných km × ${r.rate} Kč, minus tržby ${czk(r.t.revenue)}${r.t.sankce ? ', minus sankce ' + czk(r.t.sankce) : ''}`, qty: '1', unit: 'ks', price: String(Math.round(r.t.komp)), vat: 0 }))
    setState({ ucNew: { docType: 'faktura', vykKey: m.key, kompenzace: true, serviceMonth: month, custId, custName: '', custIco: '', custAddr: '', issued: isoKey(new Date()), duzp: `${month}-${new Date(Number(month.slice(0, 4)), Number(month.slice(5)), 0).getDate()}`, dueDays: 30, method: 'Bankovní převod', withVat: false, rows, note: `Vyúčtování prokazatelné ztráty za ${vykMonthLabel(month)} podle smlouvy ${VYK_CONTRACTS[custId].contractNo}; zákon č. 194/2010 Sb., není úplatou za zdanitelné plnění. Měsíční záloha ${czk(VYK_CONTRACTS[custId].advance)} se započítává, ${m.diff >= 0 ? 'doplatek' : 'přeplatek'} ${czk(Math.abs(m.diff))}.`, related: '', paidOn: '' } })
  }
  const vykonyVM = () => {
    if (state.route !== 'vykony') return {}
    void state.accVersion
    const v = state.vyk; const month = v.month, custId = v.cust; const c = VYK_CONTRACTS[custId]; const custAcc = ACC.CUSTOMERS.find((x) => x.id === custId)
    const m = vykMonthFor(month, custId); const key = m.key; const status = m.status; const stepIdx = VYK_STATUS[status]
    const resolved = vykResolvedMap(key)
    const allIssues = m.rows.flatMap((r) => r.issues.map((i) => ({ ...i, lineName: r.line.name, resolved: resolved[i.id] || null })))
    const openIssues = allIssues.filter((i) => !i.resolved)
    const tabs = ['c2', 'c1'].map((id) => { const mm = vykMonthFor(month, id); const open = mm.rows.reduce((a, r) => a + r.t.open, 0); return { id, label: VYK_CONTRACTS[id].short, count: open || null, active: id === custId, onClick: () => vykSet({ cust: id, showAll: false }) } })
    const fmtK = (n) => (n / 1000).toFixed(0)
    const mil = (n) => (n / 1e6).toFixed(2).replace('.', ',')
    const kpis = [
      { value: fmtK(m.tot.kmUzn || 0), unit: 'tis. km', label: 'Uznatelné km', icon: 'bus', note: `${fmtK(m.tot.kmReal || 0)} tis. ujeto, plán ${fmtK(m.tot.kmPlan || 0)} tis., plnění spojů ${(m.tot.tripsPlan ? m.tot.tripsRun / m.tot.tripsPlan * 100 : 100).toFixed(1)} %` },
      { value: mil(m.tot.vykon || 0), unit: 'mil. Kč', label: 'Výkon (km × sazba)', icon: 'banknote', note: `${m.rows.length} linek, sazby ${Math.min(...m.rows.map((r) => r.rate))} až ${Math.max(...m.rows.map((r) => r.rate))} Kč/km` },
      { value: mil(m.tot.revenue || 0), unit: 'mil. Kč', label: 'Tržby z jízdného', icon: 'trend', note: `${((m.tot.pax || 0) / 1000).toFixed(0)} tis. cestujících, ${((m.tot.revenue || 0) / Math.max(1, m.tot.kmReal || 1)).toFixed(1)} Kč/km` },
      { value: mil(m.tot.komp || 0), unit: 'mil. Kč', label: 'Kompenzace (nárok)', icon: 'scales', note: `záloha ${mil(c.advance)} mil., ${m.diff >= 0 ? 'doplatek' : 'přeplatek'} ${czk(Math.abs(m.diff))}${m.tot.sankce ? `, sankce ${czk(m.tot.sankce)}` : ''}` },
    ]
    const months = VYK_MONTHS.map((k) => ({ value: k, label: `${vykMonthLabel(k)}${k === '2026-10' ? ' (zpracovává se)' : ''}` }))
    const lineRows = m.rows.map((r) => ({
      id: r.line.id, no: r.line.no, name: r.line.name, t: r.t, rate: r.rate, open: r.t.open,
      plneniColor: r.t.plneni >= 99 ? 'var(--green)' : r.t.plneni >= 98 ? '#B45309' : 'var(--star)',
      kompF: czk(r.t.komp), vykonF: czk(r.t.vykon), revF: czk(r.t.revenue), sankceF: czk(r.t.sankce),
      flags: [r.t.plneni < 98 ? 'plnění pod 98 %' : null, r.t.revenue / r.t.kmReal < 10 ? 'nízké tržby na km' : null, r.t.kmPct > 103 ? 'km nad plán' : null].filter(Boolean),
      onClick: () => vykSet({ lineOpen: r.line.id, lineDay: null }),
    }))
    const docsList = [...ACC.invoices().filter((i) => i.kompenzace && i.clientId === custId && i.serviceMonth === month), ...(v.docs[key] || []).map((id) => ACC.invoiceById(id)).filter(Boolean)]
    const seen = new Set(); const docs = docsList.filter((d) => { if (seen.has(d.id)) return false; seen.add(d.id); return true }).map((d) => ({ id: d.id, number: d.number, status: d.status, totalF: czk(d.total), issuedF: ACC.fmtDate(d.issued), onOpen: () => (state.role === 'majitel' || state.role === 'ucetni') ? navigate('ucetnictvi', { ucTab: 'faktury', ucInvDetail: d.id }) : showToast('Doklad je v Účetnictví (role majitel nebo účetní)') }))
    const vykazPdf = () => {
      setState({ execReport: buildVykazHtml(month, { ...c, name: custAcc.name, ico: custAcc.ico }, lineRows.map((r) => ({ no: r.no, name: r.name, t: r.t, rate: r.rate })), m.tot, docs.length ? `Vyúčtováno dokladem ${docs.map((d) => d.number).join(', ')}.` : '') })
      if (status === 'vykaz') { setState((st) => ({ vyk: { ...st.vyk, status: { ...st.vyk.status, [key]: 'fakturace' } } })); vykLog(key, 'Výkaz pro objednatele vystaven', `Výkaz dopravních výkonů za ${vykMonthLabel(month)}: ${(m.tot.kmUzn || 0).toLocaleString('cs-CZ')} uznatelných km, kompenzace ${czk(m.tot.komp)}; odesláno datovou schránkou na ${custAcc.name}`) }
    }
    const actions = []
    if (status === 'sber') actions.push({ label: 'Uzavřít sběr dat a zahájit kontrolu', primary: true, icon: 'check', onClick: () => { setState((st) => ({ vyk: { ...st.vyk, status: { ...st.vyk.status, [key]: 'kontrola' } } })); vykLog(key, 'Sběr dat uzavřen', `Načteno ${(m.tot.kmReal || 0).toLocaleString('cs-CZ')} km z tachografů, ${(m.tot.tripsRun || 0).toLocaleString('cs-CZ')} spojů ze stazek, tržby ${czk(m.tot.revenue)} z odbavovacího systému; ke kontrole ${allIssues.length} událostí`); showToast('Sběr dat uzavřen, měsíc je v kontrole') } })
    if (status === 'kontrola') actions.push({ label: openIssues.length ? `Potvrdit kontrolu (zbývá vyřešit ${openIssues.length})` : 'Potvrdit kontrolu a připravit výkaz', primary: true, icon: 'check', disabled: openIssues.length > 0, onClick: () => { setState((st) => ({ vyk: { ...st.vyk, status: { ...st.vyk.status, [key]: 'vykaz' } } })); vykLog(key, 'Kontrola potvrzena', `${allIssues.length} událostí vyřešeno: uznatelné km ${(m.tot.kmUzn || 0).toLocaleString('cs-CZ')}, neuznáno ${(m.tot.kmNeuzn || 0).toLocaleString('cs-CZ')} km, sankce ${czk(m.tot.sankce)}`); showToast('Kontrola potvrzena, výkaz je připraven k vystavení') } })
    if (status === 'vykaz') actions.push({ label: 'Vystavit výkaz pro objednatele (PDF)', primary: true, icon: 'file', onClick: vykazPdf })
    if (status === 'fakturace') actions.push({ label: `Vyúčtovat objednateli: faktura ${czk(m.tot.komp)}`, primary: true, icon: 'banknote', onClick: () => vykOpenDoc(month, custId) })
    const resolve = (issue, action) => {
      const lbl = (VYK_ISSUE_TYPES[issue.type].actions.find((a) => a[0] === action) || [])[1] || action
      setState((st) => ({ vyk: { ...st.vyk, resolved: { ...st.vyk.resolved, [key]: { ...(st.vyk.resolved[key] || {}), [issue.id]: { action, who: zajUser(), at: tripStamp() } } } } }))
      vykLog(key, `Kontrola: ${issue.label}, linka ${issue.lineNo}, ${issue.dateLabel}`, `${lbl}${issue.type === 'missed' ? (action === 'penalty' ? `, sankce ${czk(issue.penalty)}` : ', bez sankce') : issue.km ? (action === 'accept' ? `, ${issue.km} km uznáno` : `, ${issue.km} km neuznáno`) : ''}; důvod: ${issue.detail}`)
    }
    const resolveAll = () => {
      const stamp = tripStamp(); const who = zajUser()
      const add = {}; openIssues.forEach((i) => { add[i.id] = { action: VYK_ISSUE_TYPES[i.type].def, who, at: stamp } })
      setState((st) => ({ vyk: { ...st.vyk, resolved: { ...st.vyk.resolved, [key]: { ...(st.vyk.resolved[key] || {}), ...add } } } }))
      vykLog(key, `Kontrola: ${openIssues.length} událostí vyřešeno podle pravidel smlouvy`, `nejeté spoje se sankcí, objížďky a doplněné stazky uznány, náhradní doprava vzata na vědomí; jednotlivá rozhodnutí lze v seznamu změnit`)
      showToast(`${openIssues.length} událostí vyřešeno podle pravidel smlouvy`)
    }
    const issueRow = (i) => ({ ...i, meta: VYK_ISSUE_TYPES[i.type], actions: VYK_ISSUE_TYPES[i.type].actions.map(([a, label]) => ({ label, onClick: () => resolve(i, a) })), resolvedLabel: i.resolved ? ((VYK_ISSUE_TYPES[i.type].actions.find((a) => a[0] === i.resolved.action) || [])[1] || 'vyřešeno') : null, impact: i.type === 'missed' ? `sankce ${czk(i.penalty)}` : i.km ? `${i.km} km` : `${i.trips} spojů` })
    const sortedIssues = [...openIssues, ...allIssues.filter((i) => i.resolved)].map(issueRow)
    const issueGroups = Object.keys(VYK_ISSUE_TYPES).map((t) => ({ type: t, ...VYK_ISSUE_TYPES[t], total: allIssues.filter((i) => i.type === t).length, open: openIssues.filter((i) => i.type === t).length })).filter((g) => g.total)
    const year = VYK_YEAR_MONTHS.map((k) => { const st = vykStatusOf(`${k}:${custId}`); const closed = k < '2026-08' || st === 'uzavreno'; const rows = vykBuilt(k, custId).map((b) => ({ t: vykTotals(b, closed ? new Proxy({}, { get: () => ({ action: 'closed' }) }) : vykResolvedMap(`${k}:${custId}`)) })); const tot = vykSum(rows); return { k, label: vykMonthLabel(k).split(' ')[0], komp: tot.komp || 0, kompF: czk(tot.komp || 0), advF: czk(c.advance), diff: (tot.komp || 0) - c.advance, diffF: czk(Math.abs((tot.komp || 0) - c.advance)), closed, current: k === month } })
    const ytd = year.reduce((a, y) => ({ komp: a.komp + y.komp, adv: a.adv + c.advance }), { komp: 0, adv: 0 })
    const lo = v.lineOpen ? m.rows.find((r) => r.line.id === v.lineOpen) : null
    const lineDetail = lo ? (() => {
      const [yy, mm] = month.split('-').map(Number)
      const pm = `${mm === 1 ? yy - 1 : yy}-${String(mm === 1 ? 12 : mm - 1).padStart(2, '0')}`
      const pt = vykTotals(buildVykLine(lo.line, pm), new Proxy({}, { get: () => ({ action: 'closed' }) }))
      const t = lo.t
      const delta = (cur, prev, unit = '%') => { if (!prev) return null; const d = (cur - prev) / prev * 100; return { v: `${d >= 0 ? '+' : '−'}${Math.abs(d).toFixed(1).replace('.', ',')} %`, up: d >= 0 } }
      const tiles = [
        { label: 'Spoje jeté / plán', value: `${t.tripsRun.toLocaleString('cs-CZ')} / ${t.tripsPlan.toLocaleString('cs-CZ')}`, note: `plnění ${t.plneni.toFixed(1).replace('.', ',')} %${t.missed ? `, ${t.missed} nejeto` : ''}`, tone: t.plneni >= 99.5 ? 'var(--green)' : t.plneni >= 98 ? '#B45309' : 'var(--star)' },
        { label: 'Km uznatelné', value: t.kmUzn.toLocaleString('cs-CZ'), note: t.kmNeuzn ? `${t.kmNeuzn.toLocaleString('cs-CZ')} km neuznáno` : `plán ${t.kmPlan.toLocaleString('cs-CZ')}`, delta: delta(t.kmUzn, pt.kmUzn) },
        { label: 'Tržby z jízdného', value: czk(t.revenue), note: `${(t.revenue / Math.max(1, t.kmReal)).toFixed(1).replace('.', ',')} Kč na km`, delta: delta(t.revenue, pt.revenue) },
        { label: 'Cestující', value: t.pax.toLocaleString('cs-CZ'), note: `${(t.pax / Math.max(1, t.tripsRun)).toFixed(1).replace('.', ',')} na spoj`, delta: delta(t.pax, pt.pax) },
        { label: 'Sankce', value: czk(t.sankce), note: t.sankce ? `${Math.round(t.sankce / lo.penalty)} spojů × ${czk(lo.penalty)}` : 'bez sankcí', tone: t.sankce ? 'var(--star)' : 'var(--green)' },
        { label: 'Kompenzace', value: czk(t.komp), note: `minulý měsíc ${czk(pt.komp)}`, delta: delta(t.komp, pt.komp), strong: true },
      ]
      const maxKm = Math.max(...lo.days.map((d) => Math.max(d.kmPlan, d.kmReal)))
      const maxRev = Math.max(...lo.days.map((d) => d.revenue))
      const dayState = (d) => { const open = d.issues.some((i) => !resolved[i.id]); return d.tripsRun < d.tripsPlan ? 'missed' : open ? 'open' : d.issues.length ? 'issue' : (d.dow === 0 || d.dow === 6) ? 'weekend' : 'ok' }
      const sel = lo.days.find((d) => d.dateKey === v.lineDay) || lo.days.find((d) => d.issues.some((i) => !resolved[i.id])) || lo.days.find((d) => d.issues.length) || lo.days[0]
      const chart = lo.days.map((d) => ({ d: d.d, dateKey: d.dateKey, label: d.label, kmReal: d.kmReal, kmPlan: d.kmPlan, h: d.kmReal / maxKm, hp: d.kmPlan / maxKm, rev: d.revenue / maxRev, state: dayState(d), selected: d.dateKey === sel.dateKey, onClick: () => vykSet({ lineDay: d.dateKey }) }))
      const firstDow = (new Date(yy, mm - 1, 1).getDay() + 6) % 7
      const calendar = [...Array.from({ length: firstDow }).map(() => null), ...lo.days.map((d) => ({ d: d.d, dateKey: d.dateKey, km: d.kmReal, rev: d.revenue, pct: d.tripsPlan ? d.tripsRun / d.tripsPlan * 100 : 100, state: dayState(d), weekend: d.dow === 0 || d.dow === 6, dots: d.issues.map((i) => ({ color: VYK_ISSUE_TYPES[i.type].color, done: !!resolved[i.id] })), selected: d.dateKey === sel.dateKey, onClick: () => vykSet({ lineDay: d.dateKey }) }))]
      const HW = [0, 0, 0, 0, 2, 5, 9, 10, 7, 5, 5, 5, 6, 6, 8, 9, 9, 7, 5, 4, 3, 2, 1, 0]
      const hw = sel.dow === 0 || sel.dow === 6 ? HW.map((w, h) => h >= 6 && h <= 9 ? Math.round(w * 0.55) : w) : HW
      const wsum = hw.reduce((a, b) => a + b, 0)
      const hours = hw.map((w, h) => ({ h, plan: Math.round(sel.tripsPlan * w / wsum) })).filter((x) => x.h >= 4 && x.h <= 23)
      const missIssue = sel.issues.find((i) => i.type === 'missed'); const subIssue = sel.issues.find((i) => i.type === 'substitute')
      if (missIssue) { const hh = 6 + (_hash(missIssue.id) % 12); const x = hours.find((y) => y.h === hh); if (x) x.missed = missIssue.trips }
      if (subIssue) { const hh = 8 + (_hash(subIssue.id) % 10); const x = hours.find((y) => y.h === hh); if (x) x.sub = subIssue.trips }
      const maxH = Math.max(...hours.map((x) => x.plan), 1)
      const day = { ...sel, kmRealF: sel.kmReal.toLocaleString('cs-CZ'), kmPlanF: sel.kmPlan.toLocaleString('cs-CZ'), revF: czk(sel.revenue), paxF: sel.pax.toLocaleString('cs-CZ'), pct: (sel.tripsPlan ? sel.tripsRun / sel.tripsPlan * 100 : 100).toFixed(1).replace('.', ','), hours: hours.map((x) => ({ ...x, hPct: x.plan / maxH })), issues: sel.issues.map((i) => issueRow({ ...i, resolved: resolved[i.id] || null })), dateLong: `${['neděle', 'pondělí', 'úterý', 'středa', 'čtvrtek', 'pátek', 'sobota'][sel.dow]} ${sel.d}. ${mm}. ${yy}` }
      const wf = [
        { label: 'Výkon', sub: `${t.kmUzn.toLocaleString('cs-CZ')} km × ${lo.rate} Kč`, value: t.vykon, color: '#5B6BF5' },
        { label: 'Tržby z jízdného', sub: `${Math.round(t.revenue / t.vykon * 100)} % výkonu`, value: -t.revenue, color: '#22C55E' },
        { label: 'Sankce', sub: t.sankce ? `${Math.round(t.sankce / lo.penalty)} nejetých spojů` : 'žádné', value: -t.sankce, color: '#EF4444' },
      ]
      let run = 0; const waterfall = wf.map((x) => { const from = run; run += x.value; return { ...x, valueF: `${x.value < 0 ? '−' : ''}${czk(Math.abs(x.value))}`, left: Math.min(from, run) / t.vykon, width: Math.abs(x.value) / t.vykon } })
      waterfall.push({ label: 'Kompenzace', sub: 'doplatí objednatel', value: t.komp, valueF: czk(t.komp), color: '#F43F5E', left: 0, width: t.komp / t.vykon, total: true })
      const lineIssuesOpen = lo.issues.filter((i) => !resolved[i.id])
      const exportRows = lo.days.map((d) => ({ den: d.label, spojePlan: d.tripsPlan, spojeJete: d.tripsRun, kmPlan: d.kmPlan, kmSkut: d.kmReal, trzby: d.revenue, cestujici: d.pax, udalosti: d.issues.map((i) => `${i.label} (${i.detail})`).join('; ') }))
      return {
        no: lo.line.no, name: lo.line.name, t, rate: lo.rate, kmTrip: lo.kmTrip, close: () => vykSet({ lineOpen: null, lineDay: null }), stop, openLine: () => openLine(lo.line.id),
        prevLabel: vykMonthLabel(pm), tiles, chart, calendar, day, waterfall, recovery: Math.round(t.revenue / t.vykon * 100), openCount: lineIssuesOpen.length, openIssues: lineIssuesOpen.map((i) => issueRow({ ...i, resolved: null })),
        resolveLine: lineIssuesOpen.length && status === 'kontrola' ? () => { const stamp = tripStamp(); const who = zajUser(); const add = {}; lineIssuesOpen.forEach((i) => { add[i.id] = { action: VYK_ISSUE_TYPES[i.type].def, who, at: stamp } }); setState((st) => ({ vyk: { ...st.vyk, resolved: { ...st.vyk.resolved, [key]: { ...(st.vyk.resolved[key] || {}), ...add } } } })); vykLog(key, `Kontrola linky ${lo.line.no}: ${lineIssuesOpen.length} událostí vyřešeno podle smlouvy`, lineIssuesOpen.map((i) => `${i.dateLabel} ${i.label}`).join(', ')); showToast(`Linka ${lo.line.no}: ${lineIssuesOpen.length} událostí vyřešeno`) } : null,
        exportCols: [{ key: 'den', label: 'Den' }, { key: 'spojePlan', label: 'Spoje plán' }, { key: 'spojeJete', label: 'Spoje jeté' }, { key: 'kmPlan', label: 'Km plán' }, { key: 'kmSkut', label: 'Km skutečnost' }, { key: 'trzby', label: 'Tržby Kč' }, { key: 'cestujici', label: 'Cestující' }, { key: 'udalosti', label: 'Události' }], exportRows, exportName: `vykony-linka-${lo.line.no}-${month}`, exportTitle: `Linka ${lo.line.no} · ${vykMonthLabel(month)}`,
      }
    })() : null
    return { vykony: {
      month, monthLabel: vykMonthLabel(month), months, setMonth: (e) => vykSet({ month: e.target.value, showAll: false, lineOpen: null }), tabs, custId, cust: { ...c, name: custAcc.name, ico: custAcc.ico }, kpis,
      status, steps: VYK_STEPS.map((lbl, i) => ({ label: lbl, done: i <= stepIdx, current: i === stepIdx, when: (() => { const e = (v.log[key] || []).find((x) => [/Sběr dat uzavřen|Měsíc otevřen/, /Kontrola potvrzena/, /Výkaz/, /Vyúčtováno|faktur/, /uzavřen/][i].test(x.what)); return e && i <= stepIdx ? e.at.split(' ').slice(0, 3).join(' ') : null })() })),
      actions, log: [...(v.log[key] || [])].reverse(), rows: lineRows, tot: m.tot, kompF: czk(m.tot.komp || 0), advanceF: czk(c.advance), diff: m.diff, diffF: czk(Math.abs(m.diff)),
      issues: v.showAll ? sortedIssues : sortedIssues.slice(0, 8), issuesTotal: sortedIssues.length, openCount: openIssues.length, resolveAll, canResolve: status === 'kontrola' && openIssues.length > 0, goReview: () => { const el = document.getElementById('vyk-kontrola'); if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' }) }, showAll: v.showAll, toggleAll: () => vykSet({ showAll: !v.showAll }), issueGroups,
      year, ytd: { kompF: czk(ytd.komp), advF: czk(ytd.adv), diff: ytd.komp - ytd.adv, diffF: czk(Math.abs(ytd.komp - ytd.adv)) },
      docs, vykazPdf, openDoc: () => vykOpenDoc(month, custId), canInvoice: status === 'fakturace', lineDetail, newDoc: state.ucNew && state.ucNew.vykKey === key ? buildNewDocVM() : null,
    } }
  }

  // ---- AI optimalizace oběhů vozidel a turnusů řidičů ----
  const optimalizaceVM = () => {
    if (state.route !== 'optimalizace') return {}
    const run = state.optiRun
    const current = { vozidla: 58, ridici: 71, prazdneKm: 14, nakladRok: 48.9 }
    const navrh = { vozidla: 54, ridici: 66, prazdneKm: 9, nakladRok: 45.1 }
    const saveYear = Math.round((current.nakladRok - navrh.nakladRok) * 1e6)
    const changes = [
      { title: 'Sloučení ranních oběhů linek 7 a 1', sub: 'Jeden vůz pokryje oba špičkové spoje, ušetří 1 vozidlo.', icon: 'refresh' },
      { title: 'Přesun turnusu řidiče z linky 11 na 300', sub: 'Vyrovnání doby řízení pod 9 h, méně přesčasů.', icon: 'users' },
      { title: 'Zkrácení přejezdů naprázdno u linky 13', sub: 'Úprava nástupu z vozovny, −38 km prázdných denně.', icon: 'pin' },
      { title: 'Vyvážení odpoledních směn MHD', sub: 'Rovnoměrnější vytížení, méně krátkých přestávek.', icon: 'calendar' },
    ]
    const podminky = ['Max. doba řízení 9 h', 'Min. přestávka 45 min', 'Dodržet špičky 6–8 a 14–17 h', 'Preferovat domovskou vozovnu']
    const metrics = [
      { label: 'Potřeba vozidel', from: current.vozidla, to: navrh.vozidla, unit: '', better: 'down' },
      { label: 'Potřeba řidičů', from: current.ridici, to: navrh.ridici, unit: '', better: 'down' },
      { label: 'Jízdy naprázdno', from: current.prazdneKm, to: navrh.prazdneKm, unit: ' %', better: 'down' },
      { label: 'Provozní náklad', from: current.nakladRok, to: navrh.nakladRok, unit: ' mil. Kč', better: 'down' },
    ]
    return { optimalizace: { run, podminky, metrics, changes, saveYearF: czk(saveYear), vozUsetri: current.vozidla - navrh.vozidla, ridiciUsetri: current.ridici - navrh.ridici,
      runOpti: () => setState({ optiRun: true }), resetOpti: () => setState({ optiRun: false }) } }
  }

  // ---- Servis a sklady: autoopravna, sklad dílů, PHM, plán údržby ----
  const servisVM = () => {
    if (state.route !== 'servis') return {}
    const buses = vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy')
    const pick = (k) => buses[_hash(k) % buses.length] || vehiclesData[0]
    const mech = ['Jan Vávra', 'Petr Holub', 'Tomáš Říha', 'externě – Bosch Car Service']
    const typy = ['Pravidelný servis', 'Oprava brzd', 'Výměna spojky', 'Diagnostika motoru', 'Oprava dveří', 'Klimatizace']
    const stavy = [['prog', 'V opravě', 'var(--blue-ink)', 'var(--blue-soft)'], ['wait', 'Čeká na díl', '#B45309', 'var(--amber-soft)'], ['done', 'Dokončeno', 'var(--green)', 'var(--green-soft)']]
    const zakazky = Array.from({ length: 6 }).map((_, i) => { const v = pick('z' + i); const st = stavy[i % stavy.length]; return { id: 'ZAK-2026-' + (120 + i), vehicle: `${v.brand} ${v.model}`.trim(), plate: v.plate, type: typy[i % typy.length], mech: mech[i % mech.length], priceF: czk(4000 + (_hash('zc' + i) % 60) * 850), statusLabel: st[1], color: st[2], bg: st[3], onClick: () => openVehicle(v.id) } })
    const parts = [
      { name: 'Brzdové destičky přední (Iveco Crossway)', sku: 'BRK-IVE-204', stock: 3, min: 6, unit: 'sada', priceF: czk(2380) },
      { name: 'Olejový filtr (Mercedes Citaro)', sku: 'FLT-MB-118', stock: 14, min: 8, unit: 'ks', priceF: czk(420) },
      { name: 'Pneumatika 275/70 R22.5', sku: 'TIR-275-225', stock: 5, min: 8, unit: 'ks', priceF: czk(8900) },
      { name: 'Klínový řemen', sku: 'BLT-SOR-33', stock: 2, min: 5, unit: 'ks', priceF: czk(1240) },
      { name: 'Žárovka H7 24V', sku: 'LMP-H7-24', stock: 140, min: 40, unit: 'ks', priceF: czk(85) },
      { name: 'Vzduchový měch (SOR)', sku: 'AIR-SOR-09', stock: 4, min: 4, unit: 'ks', priceF: czk(6700) },
    ].map((p) => ({ ...p, low: p.stock < p.min, pct: Math.min(100, Math.round(p.stock / (p.min * 2) * 100)) }))
    const lowCount = parts.filter((p) => p.low).length
    const udrzba = Array.from({ length: 4 }).map((_, i) => { const v = pick('u' + i); return { vehicle: `${v.brand} ${v.model}`.trim(), plate: v.plate, task: ['Pravidelná prohlídka', 'Výměna oleje', 'STK příprava', 'Seřízení geometrie'][i], due: ['za 4 dny', 'za 9 dní', 'za 12 dní', 'za 18 dní'][i], onClick: () => openVehicle(v.id) } })
    const kpis = [
      { value: String(zakazky.filter((z) => z.statusLabel !== 'Dokončeno').length), label: 'Otevřené zakázky', icon: 'wrench', note: 'v autoopravně' },
      { value: '1,2', unit: 'mil. Kč', label: 'Hodnota skladu', icon: 'fleets', note: 'náhradní díly' },
      { value: String(lowCount), label: 'Položky pod minimem', icon: 'alert', note: 'doporučeno doobjednat' },
      { value: String(udrzba.length), label: 'Nejbližší údržby', icon: 'calendar', note: 'do 18 dní' },
    ]
    const phm = [
      { label: 'Nafta', icon: 'fuel', color: '#6D5EF6', value: czk(2184000), pct: 86 },
      { label: 'AdBlue', icon: 'fuel', color: 'var(--blue)', value: czk(96000), pct: 6 },
      { label: 'CNG', icon: 'fuel', color: 'var(--green)', value: czk(142000), pct: 8 },
    ]
    return { servis: { kpis, zakazky, parts, lowCount, udrzba, phm } }
  }

  // ---- Zájezdy / nepravidelná doprava: kalkulace nabídek, pipeline, fakturace ----
  const zajUser = () => (ROLES.find((x) => x.id === state.role) || ROLES[0]).name
  const zajBuses = _tripBuses()
  const zajDrivers = driversData.filter((d) => ['dalkova', 'linka'].includes(d.kind))
  const updTrip = (id, fn) => setState((s) => ({ zajTrips: s.zajTrips.map((t) => t.id === id ? fn(t) : t) }))
  const tripLog = (t, what, who, detail) => ({ ...t, timeline: [...t.timeline, { at: tripStamp(), who: who || zajUser(), what, detail }] })
  const plusDays = (n) => { const d = new Date(Date.now() + n * 864e5); return `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}` }
  const sentTo = (t) => t.email ? `e-mail na ${t.email}` : t.contact ? `e-mail kontaktu ${t.contact} (adresa nevyplněna)` : 'e-mail objednatele (adresa nevyplněna)'
  const offerDetail = (t, p) => `Odesláno ${sentTo(t)}, PDF nabídky ${t.id}, ${czk(p.base)} bez DPH (${czk(p.total)} s DPH), platnost do ${plusDays(14)}`
  const setZajCalc = (patch) => setState((s) => ({ zajCalc: { ...s.zajCalc, ...patch } }))
  const tripFromCalc = (c, id) => ({ ...c, id, days: Math.max(1, Number(c.days) || 1), km: Number(c.km) || 0, hod: Number(c.hod) || 0, pax: Number(c.pax) || 1, nights: Number(c.nights) || 0, wait: Number(c.wait) || 0, custName: c.custId ? (ACC.CUSTOMERS.find((x) => x.id === c.custId) || {}).name : c.custName, contact: c.contact || '' })
  const calcComplete = (c) => !!((c.custId || (c.custName && c.custName.trim())) && c.from && c.to && Number(c.km) > 0 && Number(c.hod) > 0)
  /** Uložení kalkulace: i nekompletní (status koncept), ke které se lze vrátit; issue=true rovnou vystaví nabídku. */
  const saveQuote = (opts = {}) => {
    const c = state.zajCalc
    const complete = calcComplete(c)
    if (opts.issue && !complete) { showToast('Pro vystavení nabídky doplňte objednatele, trasu, km a hodiny'); return null }
    const stamp = tripStamp()
    if (c.editId) {
      updTrip(c.editId, (t) => {
        const wasDraft = t.status === 'koncept'
        const status = opts.issue && ['koncept', 'poptavka'].includes(t.status) ? 'nabidka' : (wasDraft && complete ? 'poptavka' : t.status)
        let x = { ...t, ...tripFromCalc(c, t.id), editId: undefined, status, timeline: t.timeline, busIdx: t.busIdx, driverIds: t.driverIds, docs: t.docs }
        x = tripLog(x, wasDraft ? 'Kalkulace doplněna' : 'Kalkulace upravena, nabídka přepočítána')
        if (status === 'nabidka' && t.status !== 'nabidka') x = tripLog({ ...x, offerAt: stamp.slice(0, -6), offerBy: zajUser() }, 'Nabídka vystavena a odeslána', null, offerDetail(x, computeTripPrice(c)))
        return x
      })
      setState({ zajCalc: { ...DEFAULT_TRIP_CALC }, zajCalcOpen: false }); if (!opts.silent) showToast(opts.issue ? `Nabídka ${c.editId} vystavena` : `Kalkulace ${c.editId} uložena`)
      return c.editId
    }
    const id = `T-2026-${242 + state.zajTrips.filter((t) => t.id > 'T-2026-241').length}`
    const status = !complete ? 'koncept' : opts.issue ? 'nabidka' : 'poptavka'
    const timeline = [{ at: stamp, who: zajUser(), what: complete ? 'Poptávka zadána a nakalkulována' : 'Kalkulace rozpracována (chybí údaje)' }]
    const t = { ...tripFromCalc(c, id), editId: undefined, status, busIdx: null, driverIds: [], docs: [], offerAt: status === 'nabidka' ? stamp.slice(0, -6) : undefined, offerBy: status === 'nabidka' ? zajUser() : undefined, timeline }
    if (!t.custName) t.custName = 'Objednatel nevyplněn'
    if (status === 'nabidka') timeline.push({ at: stamp, who: zajUser(), what: 'Nabídka vystavena a odeslána', detail: offerDetail(t, computeTripPrice(c)) })
    setState((s) => ({ zajTrips: [t, ...s.zajTrips], zajCalc: { ...DEFAULT_TRIP_CALC }, zajCalcOpen: false }))
    if (!opts.silent) showToast(status === 'koncept' ? `Kalkulace ${id} uložena jako rozpracovaná` : status === 'nabidka' ? `Nabídka ${id} vystavena` : `Poptávka ${id} uložena`)
    return id
  }
  const openCalc = (t) => setState({ zajCalcOpen: true, zajCalc: t ? { ...DEFAULT_TRIP_CALC, ...t, custName: t.custId ? '' : (t.custName === 'Objednatel nevyplněn' ? '' : t.custName), editId: t.id } : { ...DEFAULT_TRIP_CALC } })
  const tripItems = (t, p, kind) => kind === 'zalohova'
    ? [{ text: `Záloha 50 % na zájezd ${t.id}: ${t.from} → ${t.to}, ${fmtIsoDate(t.dateFrom)}`, qty: 1, unit: 'ks', unitPrice: Math.round(p.base / 2), vatRate: 12, amount: Math.round(p.base / 2) }]
    : p.lines.map((l) => ({ text: `${l.label} (zájezd ${t.id}, ${t.from} → ${t.to})`, qty: 1, unit: 'ks', unitPrice: l.amount, vatRate: 12, amount: l.amount }))
  const linkDocToTrip = (id, kind, r) => {
    const label = ACC.DOC_TYPES[kind].short
    updTrip(id, (x) => tripLog({ ...x, status: kind === 'faktura' ? 'vyuctovano' : x.status, docs: [...(x.docs || []), { id: r.id, number: r.number, kind, label, total: r.total }] }, `${label} ${r.number} vystavena v Účetnictví`, null, `${czk(r.total)}, splatnost ${ACC.fmtDate(r.due)}, VS ${r.vs}, ${sentTo(x)}`))
  }
  const tripToInvoicing = (id, kind) => {
    const t = state.zajTrips.find((x) => x.id === id); if (!t) return
    const p = computeTripPrice(t); const cust = ACC.CUSTOMERS.find((x) => x.id === t.custId)
    const r = ACC.issueDocument({ docType: kind, clientId: cust ? cust.id : undefined, customer: t.custName, ico: cust ? cust.ico : undefined, dic: cust ? `CZ${cust.ico}` : undefined, address: cust ? cust.address : undefined, items: tripItems(t, p, kind), dueDays: kind === 'faktura' ? 14 : 7, note: `Zájezd ${t.id}: ${t.from} → ${t.to}, ${fmtIsoDate(t.dateFrom)}${t.contact ? ', kontakt ' + t.contact : ''}`, by: zajUser() })
    linkDocToTrip(id, kind, r)
    setState((s) => ({ accVersion: (s.accVersion || 0) + 1 }))
    showToast(`${ACC.DOC_TYPES[kind].short} ${r.number} vystavena v Účetnictví (${czk(r.total)})`)
  }
  /** Otevře modal nového dokladu (stejný jako v Účetnictví) předvyplněný ze zájezdu. */
  const openTripDoc = (t, kind) => {
    const p = computeTripPrice(t); const today = isoKey(new Date())
    setState({ ucNew: { docType: kind, tripId: t.id, custId: t.custId || '', custName: t.custId ? '' : t.custName, custIco: '', custAddr: '', issued: today, duzp: kind === 'faktura' ? t.dateFrom || today : today, dueDays: kind === 'faktura' ? 14 : 7, method: 'Bankovní převod', withVat: false, rows: tripItems(t, p, kind).map((i) => ({ text: i.text, qty: '1', unit: 'ks', price: String(i.amount), vat: 12 })), note: `Zájezd ${t.id}: ${t.from} → ${t.to}, ${fmtIsoDate(t.dateFrom)}${t.contact ? ', kontakt ' + t.contact : ''}`, related: '', paidOn: '' } })
  }
  const calcToInvoicing = () => { const id = saveQuote({ silent: true, issue: true }); if (id) tripToInvoicing(id, 'proforma') }
  const openTrip = (id) => { const t = state.zajTrips.find((x) => x.id === id); navigate('zajezd-detail', { zajDetailId: id, zajPickEdit: false, zajPick: t ? { busIdx: t.busIdx, driverIds: [...t.driverIds] } : null }) }
  const editTripInCalc = (t) => { navigate('zajezdy'); openCalc(t) }
  /** Potvrzení přiřazení: zablokuje vůz a řidiče na dny zájezdu (směny kind 'zajezd'), řidič to uvidí v kalendáři a profilu. */
  const assignTrip = (id) => {
    const t = state.zajTrips.find((x) => x.id === id); const pick = state.zajPick; if (!t || !pick || pick.busIdx == null || !pick.driverIds.length) return
    const b = zajBuses[pick.busIdx]; const days = tripDayKeys(t); const names = pick.driverIds.map((d) => (driversData.find((x) => x.id === d) || {}).name).join(' + ')
    const newShifts = pick.driverIds.flatMap((drv) => days.map((dayKey) => ({ id: `z-${id}-${drv}-${dayKey}`, kind: 'zajezd', tripId: id, dayKey, driverId: drv, busId: b.id, turnus: 'zájezd', start: '06:00', end: '22:00', depot: 'Vozovna České Budějovice, Žižkova tř.', status: 'planned' })))
    setState((s) => ({ shifts: [...s.shifts.filter((x) => x.tripId !== id), ...newShifts], zajPickEdit: false }))
    const confirmed = t.status === 'schvaleno'
    const dayTxt = days.length === 1 ? fmtIsoDate(days[0]) : `${fmtIsoDate(days[0])} až ${fmtIsoDate(days[days.length - 1])}`
    updTrip(id, (x) => tripLog({ ...x, status: confirmed ? 'potvrzeno' : x.status, busIdx: pick.busIdx, driverIds: [...pick.driverIds] }, confirmed ? `Potvrzeno: vůz ${b.plate} a řidič${pick.driverIds.length > 1 ? 'i' : ''} ${names}` : `Rezervován vůz ${b.plate} a řidič${pick.driverIds.length > 1 ? 'i' : ''} ${names}`, null, `${b.brand}${b.model ? ' ' + b.model : ''} ${b.plate} a ${names} zablokováni na ${dayTxt}; jízda zapsána do kalendáře řidiče${confirmed ? `, klientovi odeslána informace (${sentTo(t)})` : ' jako rezervace do potvrzení klientem'}`))
    showToast(`${b.plate} a ${names}: zablokováno na ${dayTxt}, řidič má jízdu v kalendáři`)
  }
  const upcomingTripsFor = (driverId) => state.zajTrips.filter((t) => t.driverIds.includes(driverId) && !['realizovano', 'vyuctovano'].includes(t.status)).map((t) => { const b = t.busIdx != null ? zajBuses[t.busIdx] : null; const p = computeTripPrice(t); return { id: t.id, route: `${t.from} → ${t.to}`, custName: t.custName, dateF: fmtIsoDate(t.dateFrom), days: t.days, km: t.km, status: TRIP_STATUS[t.status], bus: b ? `${b.brand}${b.model ? ' ' + b.model : ''} · ${b.plate}` : 'vůz se upřesní', coDrivers: t.driverIds.filter((d) => d !== driverId).map((d) => (driversData.find((x) => x.id === d) || {}).name).filter(Boolean), pax: p.pax, onClick: () => openTrip(t.id) } }).sort((a, b) => a.dateF.localeCompare(b.dateF))
  const tripRow = (t) => {
    const p = computeTripPrice(t); const st = TRIP_STATUS[t.status]; const bus = t.busIdx != null ? zajBuses[t.busIdx] : null
    const drv = t.driverIds.map((d) => (driversData.find((x) => x.id === d) || {}).name).filter(Boolean)
    return { ...t, p, dateF: fmtIsoDate(t.dateFrom), route: `${t.from} → ${t.to}`, totalF: czk(p.base), chip: st, busLabel: bus ? `${bus.brand} ${bus.model || ''} · ${bus.plate}`.replace(/\s+·/, ' ·') : 'vůz nepřidělen', drvLabel: drv.length ? drv.join(' + ') : (p.drivers === 2 ? 'dva řidiči (AETR)' : 'řidič nepřidělen'), onClick: () => openTrip(t.id) }
  }
  const zajezdyVM = () => {
    if (state.route !== 'zajezdy') return {}
    const trips = state.zajTrips
    const sumBase = (arr) => arr.reduce((a, t) => a + computeTripPrice(t).base, 0)
    const open = trips.filter((t) => ['koncept', 'poptavka', 'nabidka'].includes(t.status)), won = trips.filter((t) => ['schvaleno', 'potvrzeno'].includes(t.status)), done = trips.filter((t) => ['realizovano', 'vyuctovano'].includes(t.status))
    const margins = trips.map((t) => { const p = computeTripPrice(t); return (p.base - tripCostEstimate(p)) / p.base })
    const kpis = [
      { value: String(open.length), label: 'Otevřené poptávky a nabídky', icon: 'calendar', note: `${(sumBase(open) / 1000).toFixed(0)} tis. Kč v jednání` },
      { value: (sumBase(won) / 1000).toFixed(0), unit: 'tis. Kč', label: 'Schválené zakázky', icon: 'banknote', note: `${won.length} zájezdů čeká na realizaci` },
      { value: String(Math.round(margins.reduce((a, m) => a + m, 0) / margins.length * 100)), unit: '%', label: 'Průměrná marže', icon: 'trend', note: 'po odečtu PHM, mezd a mýta' },
      { value: String(done.length), label: 'Realizováno a vyúčtováno', icon: 'check', note: `${(sumBase(done) / 1000).toFixed(0)} tis. Kč fakturováno` },
    ]
    const f = state.zajFilter || 'vse'
    const FM = { vse: () => true, otevrene: (t) => ['koncept', 'poptavka', 'nabidka'].includes(t.status), schvalene: (t) => ['schvaleno', 'potvrzeno'].includes(t.status), hotove: (t) => ['realizovano', 'vyuctovano'].includes(t.status) }
    const filters = [['vse', 'Vše'], ['otevrene', 'Rozpracované a nabídky'], ['schvalene', 'Schválené a potvrzené'], ['hotove', 'Realizované']].map(([id, label]) => ({ id, label, count: trips.filter(FM[id]).length, active: f === id, onClick: () => setState({ zajFilter: id }) }))
    const c = state.zajCalc; const p = computeTripPrice(c)
    const cost = tripCostEstimate(p)
    const calc = {
      ...c, p, costF: czk(cost), margin: p.base ? Math.round((p.base - cost) / p.base * 100) : 0, baseF: czk(p.base), vatF: czk(p.vat), totalF: czk(p.total), perPaxF: czk(p.perPax),
      busTypes: TRIP_BUS_TYPES, customers: ACC.CUSTOMERS.filter((x) => x.kind === 'zákazník' || x.id === 'c3').map((x) => ({ id: x.id, label: x.name })),
      set: (k) => (e) => setZajCalc({ [k]: e.target.type === 'checkbox' ? e.target.checked : e.target.value }),
      setCust: (e) => setZajCalc({ custId: e.target.value, custName: '' }),
      aetrNote: p.drivers === 2 ? 'Přes 450 km, 9 h řízení nebo 13 h pracovní doby na den: kalkulováno se dvěma řidiči (AETR).' : 'Do 450 km a 13 h pracovní doby na den stačí jeden řidič (AETR).',
      open: !!state.zajCalcOpen, complete: calcComplete(c), openNew: () => openCalc(null), close: () => setState({ zajCalcOpen: false, zajCalc: { ...DEFAULT_TRIP_CALC } }), stop,
      save: () => saveQuote(), saveIssue: () => saveQuote({ issue: true }), toInvoicing: calcToInvoicing, reset: () => setState({ zajCalc: { ...DEFAULT_TRIP_CALC } }),
      print: () => setState({ execReport: buildTripQuoteHtml({ ...c, id: c.editId || 'náhled', custName: c.custId ? (ACC.CUSTOMERS.find((x) => x.id === c.custId) || {}).name : c.custName, offerBy: zajUser() }, p, ACC.COMPANY) }),
    }
    return { zajezdy: { kpis, filters, rows: trips.filter(FM[f]).map(tripRow), calc, statusOrder: TRIP_STEPS } }
  }
  const zajezdDetailVM = () => {
    if (state.route !== 'zajezd-detail') return {}
    const t = state.zajTrips.find((x) => x.id === state.zajDetailId) || state.zajTrips[0]
    const row = tripRow(t); const p = row.p; const st = TRIP_STATUS[t.status]; const cost = tripCostEstimate(p)
    const pick = state.zajPick || { busIdx: t.busIdx, driverIds: [...t.driverIds] }
    const setPick = (patch) => setState((s) => ({ zajPick: { ...(s.zajPick || pick), ...patch } }))
    const canUc = state.role === 'majitel' || state.role === 'ucetni'
    const docs = (t.docs || []).map((d) => { const inv = ACC.invoiceById(d.id); return { ...d, totalF: czk(d.total), status: inv ? inv.status : '—', onOpen: () => canUc ? navigate('ucetnictvi', { ucTab: 'faktury', ucInvDetail: d.id }) : showToast('Doklad je v Účetnictví (role majitel nebo účetní)') } })
    const hasDoc = (k) => (t.docs || []).some((d) => d.kind === k)
    const stepIdx = st.step
    const needDrv = p.drivers
    const busOk = pick.busIdx != null, drvOk = pick.driverIds.length >= needDrv
    const days = tripDayKeys(t)
    const otherTrips = state.zajTrips.filter((x) => x.id !== t.id && !['vyuctovano', 'realizovano'].includes(x.status) && tripDayKeys(x).some((k) => days.includes(k)))
    const busBusy = (b) => { const o = otherTrips.find((x) => x.busIdx != null && zajBuses[x.busIdx] && zajBuses[x.busIdx].id === b.id); if (o) return `zájezd ${o.id} (${o.from} → ${o.to})`; const sh = state.shifts.find((x) => x.busId === b.id && x.tripId !== t.id && days.includes(x.dayKey)); return sh ? `směna ${shiftRow(sh).lineName}` : null }
    const drvBusy = (d) => { const o = otherTrips.find((x) => x.driverIds.includes(d.id)); if (o) return `zájezd ${o.id} (${o.from} → ${o.to})`; const sh = state.shifts.find((x) => x.driverId === d.id && x.tripId !== t.id && days.includes(x.dayKey)); if (sh) { const r = shiftRow(sh); return r.kind === 'zajezd' ? r.lineName : `linka ${r.lineNo}, ${sh.turnus} směna` } const to = state.timeOff.find((x) => x.driverId === d.id && x.status === 'approved' && days.some((k) => k >= czToKey(x.from) && k <= czToKey(x.to))); return to ? `${to.type.toLowerCase()} ${to.from} až ${to.to}` : null }
    const drvOptions = zajDrivers.map((d) => { const busy = drvBusy(d); return { id: d.id, label: `${d.name} (${d.kind === 'dalkova' ? 'dálková a zájezdová' : 'linková'})`, on: pick.driverIds.includes(d.id), busy } })
    const assigned = t.busIdx != null && t.driverIds.length > 0
    const editing = !assigned || state.zajPickEdit
    const changed = pick.busIdx !== t.busIdx || pick.driverIds.length !== t.driverIds.length || pick.driverIds.some((d) => !t.driverIds.includes(d))
    const canAssign = busOk && drvOk && !['realizovano', 'vyuctovano'].includes(t.status) && (changed || t.status === 'schvaleno')
    const whenBy = (match) => { const e = [...t.timeline].reverse().find((x) => match(x.what)); return e ? `${e.at} · ${e.who}` : null }
    const facts = [
      ['Poptávka přijata', whenBy((w) => /Poptávka/.test(w))], ['Nabídka vystavena', whenBy((w) => /Nabídka vystavena|Kalkulace upravena/.test(w))], ['Schváleno klientem', whenBy((w) => /schválen|Schváleno/i.test(w))],
      ['Potvrzen vůz a řidič', whenBy((w) => /Potvrzeno/.test(w))], ['Realizováno', whenBy((w) => /Realizováno/.test(w))], ['Vyúčtováno', whenBy((w) => /Vyúčtováno|Faktura/.test(w))],
    ].map(([label, val]) => ({ label, val: val || 'zatím ne', done: !!val }))
    const actions = []
    if (t.status === 'koncept') actions.push({ label: 'Dokončit kalkulaci', primary: true, icon: 'edit', onClick: () => editTripInCalc(t) })
    if (t.status === 'poptavka') actions.push({ label: 'Vystavit a odeslat nabídku', primary: true, icon: 'file', onClick: () => { updTrip(t.id, (x) => tripLog({ ...x, status: 'nabidka', offerAt: tripStamp().slice(0, -6), offerBy: zajUser() }, 'Nabídka vystavena a odeslána', null, offerDetail(x, p))); showToast(`Nabídka odeslána: ${sentTo(t)}`) } })
    if (t.status === 'nabidka') actions.push({ label: 'Zaznamenat schválení klientem', primary: true, icon: 'check', onClick: () => { updTrip(t.id, (x) => tripLog({ ...x, status: 'schvaleno' }, 'Nabídka schválena klientem', `${t.contact || t.custName} (klient)`, `Souhlas přijat ${t.email ? 'e-mailem z ' + t.email : 'e-mailem'}, zaznamenal(a) ${zajUser()}, cena ${czk(p.base)} bez DPH potvrzena`)); showToast('Schválení klientem zaznamenáno') } })
    if (t.status === 'schvaleno') actions.push({ label: busOk && drvOk ? 'Potvrdit vůz a řidiče' : `Vyberte vůz a ${needDrv === 2 ? 'dva řidiče' : 'řidiče'} (karta Vůz a řidiči)`, primary: true, icon: 'bus', disabled: !(busOk && drvOk), onClick: () => assignTrip(t.id) })
    if (t.status === 'potvrzeno') actions.push({ label: 'Označit jako realizováno', primary: true, icon: 'check', onClick: () => { updTrip(t.id, (x) => tripLog({ ...x, status: 'realizovano' }, 'Realizováno', row.drvLabel.split(' + ')[0], `${p.km + (_hash(t.id) % 15)} km dle tachografu, bez závad, stazka uzavřena; připraveno k vyúčtování`)); showToast('Zájezd označen jako realizovaný') } })
    const invoiceActions = [
      { kind: 'proforma', label: 'Proforma faktura', desc: 'Celá cena předem, není daňový doklad', amount: p.total, minStep: 1, gate: 'po odeslání nabídky' },
      { kind: 'zalohova', label: 'Zálohová faktura 50 %', desc: 'Záloha po schválení, daňový doklad vznikne po úhradě', amount: Math.round(p.base / 2) + Math.round(Math.round(p.base / 2) * 12 / 100), minStep: 2, gate: 'po schválení klientem' },
      { kind: 'faktura', label: 'Konečná faktura', desc: 'Daňový doklad s DPH 12 %, uzavře vyúčtování zájezdu', amount: p.total, minStep: 4, gate: 'po realizaci zájezdu' },
    ].map((a) => { const doc = docs.find((d) => d.kind === a.kind); return { ...a, doc, amountF: czk(a.amount), enabled: !doc && stepIdx >= a.minStep, locked: !doc && stepIdx < a.minStep, onClick: () => openTripDoc(t, a.kind) } })
    const lastEvent = t.timeline[t.timeline.length - 1]
    return { zajezd: {
      ...row, chip: st, lastEvent, steps: TRIP_STEPS.map((s, i) => ({ label: s, done: i <= stepIdx, current: i === stepIdx, when: facts[i] && facts[i].done ? facts[i].val.split(' · ')[0].split(' ').slice(0, 3).join(' ') : null })), cost: czk(cost), margin: Math.round((p.base - cost) / p.base * 100), baseF: czk(p.base), vatF: czk(p.vat), totalF: czk(p.total), perPaxF: czk(p.perPax),
      bus: t.busIdx != null ? zajBuses[t.busIdx] : null, drivers: t.driverIds.map((d) => driversData.find((x) => x.id === d)).filter(Boolean), needDrv,
      pick, editing, assigned, canAssign, changed, closed: ['realizovano', 'vyuctovano'].includes(t.status), daysLabel: days.length === 1 ? fmtIsoDate(days[0]) : `${fmtIsoDate(days[0])} až ${fmtIsoDate(days[days.length - 1])}`,
      busOptions: zajBuses.map((b, i) => ({ idx: i, label: `${b.brand}${b.model ? ' ' + b.model : ''} · ${b.plate} · r. v. ${b.year}`, busy: busBusy(b) })), drvOptions,
      setBus: (e) => setPick({ busIdx: e.target.value === '' || e.target.value == null ? null : Number(e.target.value) }), toggleDrv: (id) => setPick({ driverIds: pick.driverIds.includes(id) ? pick.driverIds.filter((x) => x !== id) : [...pick.driverIds, id] }),
      setDrvSlot: (i) => (e) => { const v = e.target.value; const ids = [...pick.driverIds]; if (!v) ids.splice(i, 1); else ids[i] = v; setPick({ driverIds: ids.filter(Boolean) }) },
      drvSlots: Math.max(needDrv, pick.driverIds.length, state.zajDrvExtra && state.zajDrvExtra === t.id ? 2 : 0), addDrvSlot: () => setState({ zajDrvExtra: t.id }),
      startEdit: () => setState({ zajPickEdit: true, zajPick: { busIdx: t.busIdx, driverIds: [...t.driverIds] } }), cancelEdit: () => setState({ zajPickEdit: false, zajPick: { busIdx: t.busIdx, driverIds: [...t.driverIds] } }), assign: () => assignTrip(t.id),
      assignLabel: t.status === 'schvaleno' ? 'Potvrdit přiřazení a zablokovat termín' : assigned ? 'Potvrdit změnu přiřazení' : 'Potvrdit přiřazení (rezervace termínu)',
      docs, invoiceActions, actions, timeline: [...t.timeline].reverse(), newDoc: state.ucNew && state.ucNew.tripId === t.id ? buildNewDocVM() : null,
      print: () => setState({ execReport: buildTripQuoteHtml(t, p, ACC.COMPANY) }), edit: () => editTripInCalc(t), back: () => navigate('zajezdy'),
      openDriver: (id) => navigate('driver-detail', { driverId: id }),
    } }
  }

  // ---- Elektrobusy: stav baterií, nabíjení, dojezd ----
  const elektrobusyVM = () => {
    if (state.route !== 'elektrobusy') return {}
    const stavy = [['route', 'Na trase', 'var(--green)', 'var(--green-soft)'], ['charge', 'Nabíjí se', 'var(--blue-ink)', 'var(--blue-soft)'], ['depot', 'Vozovna', 'var(--ink3)', '#EEF2F9']]
    const models = ['SOR NS 12 electric', 'Škoda 36BB E’City', 'Iveco E-WAY', 'SOR NS 12 electric', 'Mercedes eCitaro']
    const buses = models.map((m, i) => {
      const soc = 28 + (_hash('eb' + i) % 68)
      const cap = 350
      const st = stavy[i % stavy.length]
      return { name: m, plate: `EB ${20 + i}-${30 + i}C`, soc, dojezd: Math.round(soc / 100 * 240), cap, statusLabel: st[1], color: st[2], bg: st[3], chargeTo: st[0] === 'charge' ? `${_fmtMin(_hash('c' + i) % 300 + 180)}` : null, low: soc < 35 }
    })
    const avgSoc = Math.round(buses.reduce((a, b) => a + b.soc, 0) / buses.length)
    const charging = buses.filter((b) => b.statusLabel === 'Nabíjí se').length
    const kpis = [
      { value: String(buses.length), label: 'Elektrobusů', icon: 'bus', note: 've flotile' },
      { value: String(avgSoc), unit: '%', label: 'Průměrný stav baterie', icon: 'gauge', note: `${buses.filter((b) => b.low).length} pod 35 %` },
      { value: String(charging), label: 'Právě se nabíjí', icon: 'fuel', note: 'na vozovně' },
      { value: '94', unit: 't', label: 'Úspora CO₂ / rok', icon: 'trend', note: 'oproti naftě' },
    ]
    const plan = buses.filter((b) => b.chargeTo).map((b) => ({ name: b.name, plate: b.plate, to: b.chargeTo, soc: b.soc }))
    return { elektrobusy: { kpis, buses, plan } }
  }

  const buildNewDocVM = () => {
    void state.accVersion
    const inv = ACC.invoices(); const kc = ACC.kc
    const me = (ROLES.find((x) => x.id === state.role) || ROLES[0]).name
    const bump = () => setState((s) => ({ accVersion: (s.accVersion || 0) + 1 }))
    const nd = state.ucNew
    const setNd = (p) => setState((s) => ({ ucNew: { ...s.ucNew, ...(typeof p === 'function' ? p(s.ucNew) : p) } }))
    return nd ? (() => {
      const t = ACC.DOC_TYPES[nd.docType]
      const cust = nd.custId ? ACC.CUSTOMERS.find((c) => c.id === nd.custId) : null
      const items = nd.rows.filter((r) => r.text.trim() && Number(r.price) > 0).map((r) => { const qty = Number(r.qty) || 1; const price = Number(r.price); const unitBase = nd.withVat ? Math.round(price / (1 + r.vat / 100)) : price; return { text: r.text.trim(), qty, unit: r.unit, unitPrice: unitBase, vatRate: r.vat, amount: Math.round(unitBase * qty) } })
      const base = items.reduce((s, i) => s + i.amount, 0), vat = items.reduce((s, i) => s + Math.round(i.amount * i.vatRate / 100), 0)
      const number = `${t.series}-2026-${String(inv.filter((i) => i.series === t.series).length + 1).padStart(4, '0')}`
      const relatedOptions = inv.filter((i) => nd.docType === 'opravny' ? i.docType === 'faktura' && i.status === 'Zaplaceno' : (i.docType === 'zalohova' || i.docType === 'vyzva') && i.status === 'Zaplaceno').map((i) => ({ id: i.id, label: `${i.number} · ${i.customer} · ${kc(i.total)}` }))
      const custName = cust ? cust.name : nd.custName
      const ok = !!(custName && custName.trim()) && items.length > 0 && (nd.docType !== 'opravny' || nd.related)
      return {
        ...nd, title: t.label, desc: t.desc, tax: t.tax, number, baseF: kc(base), vatF: kc(vat), totalF: kc(base + vat), ok, relatedOptions, needsRelated: nd.docType === 'opravny' || nd.docType === 'danovy',
        customers: ACC.CUSTOMERS.map((c) => ({ id: c.id, label: `${c.name} · IČO ${c.ico}` })), custLabel: cust ? `${cust.name} · IČO ${cust.ico} · ${cust.address}` : null,
        methods: ACC.PAYMENT_METHODS, units: ['ks', 'km', 'hod', 'měs', 'den', 'os'],
        setCust: (e) => setNd({ custId: e.target.value, custName: '' }), setCustName: (e) => setNd({ custName: e.target.value, custId: '' }), setCustIco: (e) => setNd({ custIco: e.target.value }), setCustAddr: (e) => setNd({ custAddr: e.target.value }),
        setIssued: (e) => setNd({ issued: e.target.value, duzp: e.target.value }), setDuzp: (e) => setNd({ duzp: e.target.value }), setDueDays: (e) => setNd({ dueDays: Number(e.target.value) || 0 }), setMethod: (e) => setNd({ method: e.target.value }), setWithVat: (e) => setNd({ withVat: e.target.value === 's' }), setNote: (e) => setNd({ note: e.target.value }), setPaidOn: (e) => setNd({ paidOn: e.target.value }),
        setRelated: (e) => { const o = inv.find((i) => i.id === e.target.value); setNd({ related: e.target.value, custId: o && o.clientId ? o.clientId : '', custName: o && !o.clientId ? o.customer : '', rows: o ? o.items.map((i) => ({ text: i.text, qty: String(i.qty), unit: i.unit, price: String(nd.docType === 'opravny' ? -i.unitPrice : i.unitPrice), vat: i.vatRate })) : nd.rows }) },
        updRow: (i, patch) => setNd((n) => ({ rows: n.rows.map((r, j) => j === i ? { ...r, ...patch } : r) })), addRow: () => setNd((n) => ({ rows: [...n.rows, { text: '', qty: '1', unit: 'ks', price: '', vat: n.rows[n.rows.length - 1] ? n.rows[n.rows.length - 1].vat : 21 }] })), delRow: (i) => setNd((n) => ({ rows: n.rows.length > 1 ? n.rows.filter((_, j) => j !== i) : [{ text: '', qty: '1', unit: 'ks', price: '', vat: 21 }] })),
        submit: () => { if (!ok) return; const ico = cust ? cust.ico : nd.custIco; const r = ACC.issueDocument({ docType: nd.docType, clientId: cust ? cust.id : undefined, customer: custName.trim(), ico, dic: ico ? `CZ${ico}` : undefined, address: cust ? cust.address : nd.custAddr, items, issued: new Date(nd.issued), duzp: new Date(nd.duzp), dueDays: nd.dueDays, paymentMethod: nd.method, relatedId: nd.related || undefined, note: nd.note.trim() || undefined, paidAt: nd.paidOn ? new Date(nd.paidOn) : undefined, kompenzace: !!nd.kompenzace, serviceMonth: nd.serviceMonth, by: me }); bump(); if (nd.tripId) linkDocToTrip(nd.tripId, nd.docType, r); if (nd.vykKey) linkDocToVyk(nd.vykKey, r); showToast(`Vystaven doklad ${r.number} na ${kc(r.total)}${nd.tripId ? ', založen v Účetnictví a připsán k zájezdu' : nd.vykKey ? ', měsíc vyúčtován a uzavřen' : ''}`); setState({ ucNew: null }) },
        close: () => setState({ ucNew: null }), stop,
      }
    })() : null
  }

  // ---- Účetnictví (převzato z Frenkee CRM, data dopravce) ----
  const ucetnictviVM = () => {
    if (state.route !== 'ucetnictvi') return {}
    void state.accVersion
    const me = state.role === 'majitel' ? 'Ing. Pavel Šimek' : 'Lenka Nováková'
    const bump = () => setState((s) => ({ accVersion: (s.accVersion || 0) + 1 }))
    const kc = ACC.kc, fd = ACC.fmtDate
    const tab = state.ucTab || 'prehled'
    const al = ACC.alerts()
    const TABS = [['prehled', 'Přehled', 'dashboard'], ['faktury', 'Vydané doklady', 'file'], ['naklady', 'Náklady', 'archive'], ['banka', 'Banka', 'banknote'], ['mzdy', 'Mzdy a platby', 'users'], ['uzaverka', 'Uzávěrka a DPH', 'calendar'], ['kontrola', 'Kontrola vedení', 'shield'], ['rok', 'Rok a daň z příjmů', 'scales']]
    const tabs = TABS.map(([id, label, icon]) => ({ id, label, icon, active: tab === id, badge: id === 'kontrola' ? al.filter((a) => a.level !== 'info').length : 0, onClick: () => setState({ ucTab: id }) }))
    const TONE_INV = { Vystaveno: ['var(--ink2)', '#EEF2F9'], Zaplaceno: ['var(--green)', 'var(--green-soft)'], 'Po splatnosti': ['var(--star)', 'var(--star-soft)'], Storno: ['#B45309', 'var(--amber-soft)'], 'Dobropisováno': ['var(--purple)', 'var(--purple-soft)'] }
    const TONE_EXP = { 'Zaúčtováno': ['var(--green)', 'var(--green-soft)'], 'K zaúčtování': ['#B45309', 'var(--amber-soft)'], 'Ke schválení': ['#B45309', 'var(--amber-soft)'], 'Chybí doklad': ['var(--star)', 'var(--star-soft)'] }
    const TONE_CLOSE = { 'Odesláno': ['var(--green)', 'var(--green-soft)'], 'Uzavřeno': ['var(--blue-ink)', 'var(--blue-soft)'], 'Připraveno': ['#B45309', 'var(--amber-soft)'], 'Otevřeno': ['var(--ink2)', '#EEF2F9'] }
    const chip = (m, s) => ({ label: s, color: (m[s] || ['var(--ink2)', '#EEF2F9'])[0], bg: (m[s] || ['var(--ink2)', '#EEF2F9'])[1] })
    const inv = ACC.invoices(), ex = ACC.expenses()
    const kindOf = (i) => i.kompenzace ? 'vyúčtování výkonů' : ACC.DOC_TYPES[i.docType].short
    const invRow = (i) => ({ id: i.id, number: i.number, kind: kindOf(i), customer: i.customer, ico: i.ico, item: (i.items[0] || {}).text || '', more: i.items.length - 1, issuedF: fd(i.issued), dueF: fd(i.due), baseF: kc(i.base), vatF: i.vat ? kc(i.vat) : (ACC.DOC_TYPES[i.docType].tax ? (i.kompenzace ? 'mimo DPH' : 'osv.') : '–'), totalF: kc(i.total), chip: chip(TONE_INV, i.status), onClick: () => setState({ ucInvDetail: i.id, ucAskCredit: false, ucReason: '' }) })

    const cf = ACC.cashflow(); const cur = cf.find((m) => m.month === ACC.CURRENT) || cf[0]
    const open = inv.filter((i) => i.status === 'Vystaveno' || i.status === 'Po splatnosti')
    const prevM = ACC.MONTHS_2026[ACC.MONTHS_2026.indexOf(ACC.CURRENT) - 1]
    const prev = ACC.closes().find((c) => c.month === prevM)
    const cfMax = Math.max(...cf.map((m) => Math.max(m.inflow, m.outflow)), 1)
    const mil = (n) => (n / 1e6).toFixed(1).replace('.', ',')
    const prehled = {
      kpis: [
        { value: mil(ACC.ACCOUNTS.reduce((s, a) => s + a.balance, 0)), unit: 'mil. Kč', label: 'Na účtech', icon: 'banknote', note: ACC.ACCOUNTS.map((a) => `${a.bank} ${mil(a.balance)} mil.`).join(' · ') },
        { value: mil(open.reduce((s, i) => s + i.total, 0)), unit: 'mil. Kč', label: 'Pohledávky', icon: 'file', note: `${open.length} dokladů, ${inv.filter((i) => i.status === 'Po splatnosti').length} po splatnosti` },
        { value: mil(cur.inflow - cur.outflow), unit: 'mil. Kč', label: `Cashflow ${ACC.monthLabel(ACC.CURRENT)}`, icon: 'trend', note: `příjmy ${kc(cur.inflow)}, výdaje ${kc(cur.outflow)}` },
        { value: String(al.filter((a) => a.level !== 'info').length), label: 'Ke kontrole vedení', icon: 'shield', note: al[0] ? al[0].text : 'vše v pořádku' },
      ],
      cf: cf.map((m) => ({ ...m, inH: Math.round(m.inflow / cfMax * 100), outH: Math.round(m.outflow / cfMax * 100), short: m.label.split(' ')[0].slice(0, 3), netK: Math.round((m.inflow - m.outflow) / 1000), cur: m.month === ACC.CURRENT })),
      prev: prev ? { ...prev, label: ACC.monthLabel(prev.month), chip: chip(TONE_CLOSE, prev.status), revenueF: kc(prev.revenue), costsF: kc(prev.costs), vatDueF: kc(prev.vatDue) } : null,
      events: ACC.events().slice(0, 8).map((e) => ({ ...e, when: `${fd(e.at)} ${ACC.fmtTime(e.at)}` })),
    }
    const filt = state.ucInvFilter || 'vse'
    const DF = (i, f) => f === 'vse' ? true : f === 'komp' ? !!i.kompenzace : f === 'faktura' ? i.docType === 'faktura' && !i.kompenzace : f === 'zalohy' ? ['proforma', 'zalohova', 'vyzva', 'danovy'].includes(i.docType) : f === 'opravny' ? i.docType === 'opravny' : ['objednavka', 'prijmovy'].includes(i.docType)
    const faktury = {
      kpis: [
        { value: String(inv.filter((i) => i.docType === 'faktura').length), label: 'Faktury (řada FV)', icon: 'file', note: `${mil(inv.filter((i) => i.docType === 'faktura').reduce((s, i) => s + i.total, 0))} mil. Kč za rok` },
        { value: String(inv.filter((i) => i.kompenzace).length), label: 'Vyúčtování objednatelům', icon: 'scales', note: 'kompenzace JIKORD a město' },
        { value: mil(open.reduce((s, i) => s + i.total, 0)), unit: 'mil. Kč', label: 'Neuhrazeno', icon: 'clock', note: `${open.length} dokladů, ${inv.filter((i) => i.status === 'Po splatnosti').length} po splatnosti` },
        { value: String(inv.filter((i) => i.docType === 'opravny').length), label: 'Opravné doklady', icon: 'refresh', note: 'dobropisy k zaplaceným fakturám' },
      ],
      filters: [['vse', 'Vše'], ['komp', 'Vyúčtování objednatelům'], ['faktura', 'Faktury'], ['zalohy', 'Výzvy, proformy, zálohy'], ['opravny', 'Opravné'], ['ostatni', 'Objednávky a pokladna']].map(([id, label]) => ({ id, label, count: inv.filter((i) => DF(i, id)).length, active: filt === id, onClick: () => setState({ ucInvFilter: id }) })),
      rows: inv.filter((i) => DF(i, filt)).map(invRow),
      docTypes: Object.entries(ACC.DOC_TYPES).map(([k, t]) => ({ id: k, label: t.label, desc: t.desc, onClick: () => openNewDoc(k) })),
    }
    const det = state.ucInvDetail ? ACC.invoiceById(state.ucInvDetail) : null
    const invDetail = det ? (() => {
      const t = ACC.DOC_TYPES[det.docType]; const tx = det.txId ? ACC.txById(det.txId) : null; const rel = det.relatedId ? ACC.invoiceById(det.relatedId) : null
      const hasDD = inv.some((d) => d.docType === 'danovy' && d.relatedId === det.id)
      return {
        ...det, title: `${t.label} ${det.number}`, company: ACC.COMPANY, issuedF: fd(det.issued), duzpF: fd(det.duzp), dueF: fd(det.due), duzpLabel: t.tax ? 'DUZP' : 'Datum plnění', account: ACC.ACCOUNTS[0].number, chip: chip(TONE_INV, det.status), txInfo: tx ? `${fd(tx.at)} z ${tx.counterAccount}` : '', relatedNo: rel ? rel.number : '',
        items: det.items.map((it) => ({ ...it, unitPriceF: kc(it.unitPrice), amountF: kc(it.amount), totalF: kc(it.amount + Math.round(it.amount * it.vatRate / 100)), vatLabel: it.vatRate ? `${it.vatRate} %` : 'osv.' })),
        vatSummary: det.vatSummary.map((r) => ({ ...r, label: `Základ ${r.rate ? r.rate + ' %' : 'osvobozeno / mimo DPH'} ${kc(r.base)}${r.rate ? ', DPH ' + kc(r.vat) : ''}`, totalF: kc(r.base + r.vat) })),
        totalF: kc(det.total), totalLabel: det.docType === 'opravny' ? 'K vrácení' : 'Celkem k úhradě',
        canPay: det.status === 'Vystaveno' || det.status === 'Po splatnosti', canCredit: det.status === 'Zaplaceno' && det.docType === 'faktura', canDD: (det.docType === 'zalohova' || det.docType === 'vyzva') && det.status === 'Zaplaceno' && !hasDD, canCancel: !['Zaplaceno', 'Storno', 'Dobropisováno'].includes(det.status),
        askCredit: state.ucAskCredit, reason: state.ucReason, setReason: (e) => setState({ ucReason: e.target.value }), toggleCredit: (v) => setState({ ucAskCredit: v }),
        print: () => setState({ execReport: ACC.invoiceHtml(det) }),
        send: () => showToast(`Doklad ${det.number} odeslán e-mailem (${det.customer})`),
        pay: () => { ACC.markPaid(det.id, me); bump(); showToast('Označeno jako zaplaceno') },
        credit: () => { const c = ACC.creditNote(det.id, me, state.ucReason.trim()); bump(); showToast(`Vystaven opravný doklad ${c ? c.number : ''}`); setState({ ucInvDetail: null }) },
        dd: () => { const d = ACC.taxDocToPayment(det.id, me); bump(); showToast(`Vystaven daňový doklad ${d ? d.number : ''}`); setState({ ucInvDetail: null }) },
        cancel: () => { ACC.cancelInvoice(det.id, me); bump(); showToast(`Doklad ${det.number} stornován`); setState({ ucInvDetail: null }) },
        close: () => setState({ ucInvDetail: null }), stop,
      }
    })() : null
    const newDoc = buildNewDocVM()
    const ef = state.ucExpFilter || 'vse'
    const exList = ex.filter((e) => ef === 'vse' ? true : ef === 'k' ? e.status !== 'Zaúčtováno' : e.kind === ef)
    const exMonth = ex.filter((e) => ACC.inMonth(e.received, ACC.CURRENT))
    const chart = ACC.CHART.filter((c) => c.type === 'náklad')
    const naklady = {
      kpis: [
        { value: (exMonth.reduce((s, e) => s + e.base, 0) / 1e6).toFixed(2).replace('.', ','), unit: 'mil. Kč', label: `Náklady ${ACC.monthLabel(ACC.CURRENT)}`, icon: 'archive', note: `${exMonth.length} dokladů, DPH na vstupu ${kc(exMonth.reduce((s, e) => s + e.vat, 0))}` },
        { value: String(ex.filter((e) => e.status !== 'Zaúčtováno').length), label: 'K zaúčtování', icon: 'alert', note: 'AI navrhla účet, účetní potvrdí' },
        { value: String(ex.filter((e) => e.source === 'E-mail faktury@').length), label: 'Ze schránky faktury@', icon: 'send', note: 'automaticky stažené faktury' },
        { value: String(ex.filter((e) => e.kind === 'Účtenka').length), label: 'Účtenky a paragony', icon: 'upload', note: 'nahrané přes drag & drop' },
      ],
      filters: [['vse', 'Vše', ex.length], ['Faktura', 'Přijaté faktury', ex.filter((e) => e.kind === 'Faktura').length], ['Účtenka', 'Účtenky', ex.filter((e) => e.kind === 'Účtenka').length], ['k', 'K zaúčtování', ex.filter((e) => e.status !== 'Zaúčtováno').length]].map(([id, label, count]) => ({ id, label, count, active: ef === id, onClick: () => setState({ ucExpFilter: id }) })),
      rows: exList.slice(0, 60).map((e) => ({ id: e.id, supplier: e.supplier, note: e.note, number: e.number, kind: e.kind, category: e.category, account: e.account, receivedF: fd(e.received), baseF: kc(e.base), vatF: e.vatRate ? kc(e.vat) : '–', totalF: kc(e.total), source: e.source, ai: e.ai, chip: chip(TONE_EXP, e.status), unposted: e.status !== 'Zaúčtováno', post: () => { ACC.postExpense(e.id, me); bump(); showToast(`${e.supplier} zaúčtováno na ${e.account}`) }, onClick: () => setState({ ucExpDetail: e.id }) })),
      note: state.ucExpNote, setNote: (e) => setState({ ucExpNote: e.target.value }),
      drop: (files) => { if (!files || !files.length) return; [...files].forEach((f) => ACC.addReceipt({ name: f.name, size: f.size }, me, state.ucExpNote)); bump(); showToast(`${files.length} ${files.length === 1 ? 'doklad nahrán' : files.length < 5 ? 'doklady nahrány' : 'dokladů nahráno'}, AI vyčetla údaje a navrhla zaúčtování`); setState({ ucExpNote: '' }) },
      fetchMail: () => { ACC.fetchMailInvoices(me); bump(); showToast('Schránka faktury@csadbus.cz: staženy 2 nové faktury') },
      chart,
      detail: (() => { const e = state.ucExpDetail ? ACC.expenseById(state.ucExpDetail) : null; return e ? { ...e, title: `${e.kind} ${e.number}`, amountLine: `${kc(e.base)} + DPH ${e.vatRate} % ${kc(e.vat)} = ${kc(e.total)}`, payLine: e.paidAt ? fd(e.paidAt) : e.due < ACC.TODAY ? 'po splatnosti, neuhrazeno' : `splatnost ${fd(e.due)}`, chart, setAccount: (ev) => { ACC.postExpense(e.id, me, ev.target.value); bump(); showToast(`Zaúčtováno na ${ev.target.value}`) }, close: () => setState({ ucExpDetail: null }), stop } : null })(),
    }
    const accId = state.ucAcc || 'csob', only = state.ucBank || 'vse'
    const a = ACC.ACCOUNTS.find((x) => x.id === accId) || ACC.ACCOUNTS[0]
    const allTx = ACC.txs(accId)
    const unmatched = (t) => !t.invoiceId && !t.expenseId && ['Platba odběratele', 'Kompenzace objednatele', 'Náklad', 'Neznámá'].includes(t.kind)
    const txList = allTx.filter((t) => only === 'nesparovane' ? unmatched(t) : only === 'flag' ? !!t.flag && !t.approvedBy : true)
    const banka = {
      accounts: ACC.ACCOUNTS.map((x) => ({ ...x, active: x.id === accId, balanceF: kc(x.balance), syncF: `${fd(x.lastSync)} ${ACC.fmtTime(x.lastSync)}`, onClick: () => setState({ ucAcc: x.id }) })),
      title: `Pohyby: ${a.label} (${a.bank})`, sub: `${allTx.filter((t) => t.invoiceId || t.expenseId).length} z ${allTx.length} pohybů spárováno s fakturou nebo dokladem podle variabilního symbolu a částky`,
      filters: [['vse', 'Vše', allTx.length], ['nesparovane', 'Nespárované', allTx.filter(unmatched).length], ['flag', 'Nesrovnalosti', allTx.filter((t) => t.flag && !t.approvedBy).length]].map(([id, label, count]) => ({ id, label, count, active: only === id, onClick: () => setState({ ucBank: id }) })),
      isImport: a.mode === 'Výpis',
      importFile: (f) => { const n = ACC.importStatement(accId, { name: f.name }, me); bump(); showToast(`Výpis ${f.name} načten, porovnán s fakturami (${n} nově spárováno)`) },
      sync: () => { ACC.importStatement(accId, { name: 'API synchronizace' }, me); bump(); showToast('Účet synchronizován přes bankovní API') },
      rows: txList.slice(0, 80).map((t) => { const i = t.invoiceId ? ACC.invoiceById(t.invoiceId) : null; const e = t.expenseId ? ACC.expenseById(t.expenseId) : null; return { id: t.id, dateF: fd(t.at), counterparty: t.counterparty, counterAccount: t.counterAccount, vs: t.vs || '–', message: t.message, kind: t.kind, amountF: (t.amount >= 0 ? '+' : '−') + kc(Math.abs(t.amount)), pos: t.amount >= 0, flagged: !!t.flag && !t.approvedBy, doc: i ? { label: i.number, color: 'var(--green)', bg: 'var(--green-soft)' } : e ? { label: `${e.kind} ${e.number}`, color: 'var(--green)', bg: 'var(--green-soft)' } : t.flag && !t.approvedBy ? { label: t.flag, color: t.flag === 'Účet mimo systém' ? 'var(--star)' : '#B45309', bg: t.flag === 'Účet mimo systém' ? 'var(--star-soft)' : 'var(--amber-soft)' } : t.approvedBy ? { label: `Schválil ${t.approvedBy}`, color: 'var(--blue-ink)', bg: 'var(--blue-soft)' } : null, canAttach: t.flag === 'Chybí doklad' && !t.approvedBy, attach: () => { ACC.attachDoc(t.id, me); bump(); showToast('Doklad doplněn a zaúčtován') }, toKontrola: ['Účet mimo systém', 'Ke schválení vedením', 'Nesedí částka'].includes(t.flag) && !t.approvedBy ? () => setState({ ucTab: 'kontrola' }) : null } }),
    }
    const people = PEOPLE_ALL().map((p) => ({ p, pr: buildPayroll(p, hrModeOf(p)) }))
    const emp = people.filter((x) => x.pr.mode === 'zamestnanec'), osvc = people.filter((x) => x.pr.mode === 'osvc')
    const sumE = (f) => emp.reduce((s, x) => s + f(x.pr), 0)
    const netSum = sumE((pr) => pr.net), gross = sumE((pr) => pr.gross), socAll = sumE((pr) => -pr.rows[1][1] + pr.employer[0][1]), zdravAll = sumE((pr) => -pr.rows[2][1] + pr.employer[1][1]), danAll = sumE((pr) => -pr.rows[3][1]), osvcSum = osvc.reduce((s, x) => s + x.pr.gross, 0)
    const mzdy = {
      kpis: [
        { value: String(people.length), label: 'Lidí ve mzdách (vzorek)', icon: 'users', note: `${emp.length} zaměstnanců, ${osvc.length} OSVČ` },
        { value: (gross / 1e3).toFixed(0), unit: 'tis. Kč', label: 'Hrubé mzdy říjen', icon: 'banknote', note: 'z karet lidí (Řidiči)' },
        { value: (netSum / 1e3).toFixed(0), unit: 'tis. Kč', label: 'K výplatě 10. 11.', icon: 'send', note: 'čisté mzdy zaměstnanců' },
        { value: ((socAll + zdravAll + danAll) / 1e3).toFixed(0), unit: 'tis. Kč', label: 'Odvody 20. 11.', icon: 'scales', note: 'ČSSZ, ZP a FÚ' },
      ],
      platby: [
        { to: 'Zaměstnanci (hromadný příkaz)', what: 'Čisté mzdy za říjen 2026', due: '10. 11. 2026', acct: 'hromadný příkaz', amountF: kc(netSum), status: 'Ke schválení' },
        { to: 'ČSSZ, OSSZ České Budějovice', what: 'Sociální pojištění (zaměstnanci + zaměstnavatel)', due: '20. 11. 2026', acct: '21012-7926041/0710', amountF: kc(socAll), status: 'Připraveno' },
        { to: 'Zdravotní pojišťovny (VZP, ČPZP, OZP)', what: 'Zdravotní pojištění', due: '20. 11. 2026', acct: 'dle pojišťovny', amountF: kc(zdravAll), status: 'Připraveno' },
        { to: 'Finanční úřad pro Jihočeský kraj', what: 'Zálohy na daň ze závislé činnosti', due: '20. 11. 2026', acct: '713-77627231/0710', amountF: kc(danAll), status: 'Připraveno' },
        { to: 'OSVČ / subdodavatelé', what: 'Fakturace za výkony říjen', due: 'dle splatnosti faktur', acct: 'dle faktury', amountF: kc(osvcSum), status: 'Čeká na faktury' },
      ].map((p) => ({ ...p, chip: { label: p.status, color: p.status === 'Připraveno' ? 'var(--green)' : '#B45309', bg: p.status === 'Připraveno' ? 'var(--green-soft)' : 'var(--amber-soft)' } })),
      rows: people.slice(0, 12).map(({ p, pr }) => ({ id: p.id, name: p.name, position: p.position, mode: pr.modeLabel, grossF: kc(pr.gross), netF: kc(pr.net), costF: kc(pr.employerCost), onClick: p.vehicleIds ? () => openDriver(p.id) : null })),
      sendAll: () => showToast('Platební příkazy (pain.001) předány do banky ke schválení druhou osobou.'),
      goHr: () => navigate('drivers'),
    }
    const closeList = ACC.closes().filter((c) => c.month !== ACC.CURRENT).reverse()
    const selM = state.ucMonth || (closeList[0] ? closeList[0].month : ACC.CURRENT)
    const c = ACC.closes().find((x) => x.month === selM) || ACC.computeClose(selM)
    const kh = ACC.kontrolniHlaseni(selM)
    const uzaverka = {
      rows: closeList.map((x) => ({ month: x.month, label: ACC.monthLabel(x.month), revenueF: Math.round(x.revenue).toLocaleString('cs-CZ'), costsF: Math.round(x.costs).toLocaleString('cs-CZ'), outF: Math.round(x.outputVat).toLocaleString('cs-CZ'), inF: Math.round(x.inputVat).toLocaleString('cs-CZ'), dueF: Math.round(x.vatDue).toLocaleString('cs-CZ'), chip: chip(TONE_CLOSE, x.status), sentNote: x.sentAt ? `${x.sentAt.getDate()}. ${x.sentAt.getMonth() + 1}. · ${x.sentVia === 'Datová schránka' ? 'datovka' : 'XML'}` : '', active: x.month === selM, onClick: () => setState({ ucMonth: x.month }) })),
      sel: { label: ACC.monthLabel(selM), chip: chip(TONE_CLOSE, c.status), outF: kc(c.outputVat), inF: kc(c.inputVat), coef: c.coef, dedF: kc(c.inputVatDeductible), dueF: kc(Math.max(0, c.vatDue)), over: c.vatDue < 0 ? kc(-c.vatDue) : null, faresF: kc(c.fares || 0), kh: `A4 ${kh.A4.length} řádků, A5 ${kc(kh.A5.base)}, B2 ${kh.B2.length} řádků, B3 ${kc(kh.B3.base)}`, issues: c.issues, canClose: c.status === 'Otevřeno' || c.status === 'Připraveno', canSend: c.status === 'Uzavřeno' || c.status === 'Připraveno', sent: c.status === 'Odesláno' },
      closeMonth: () => { ACC.closeMonth(selM, me); bump(); showToast(`${ACC.monthLabel(selM)} uzavřen, DPH k úhradě ${kc(c.vatDue)}`) },
      sendDs: () => { ACC.sendVat(selM, 'Datová schránka', me); bump(); showToast(`Odesláno datovou schránkou (${ACC.COMPANY.dataBox}) na ${ACC.COMPANY.taxOffice}`) },
      exportXml: () => { ACC.downloadText(`DPH_${selM}.xml`, ACC.vatXml(selM), 'application/xml'); if (c.status !== 'Odesláno') { ACC.sendVat(selM, 'Export XML', me); bump() } showToast('XML pro EPO (DPHDP3 + DPHKH1) staženo') },
      company: ACC.COMPANY,
    }
    const allTxs = ACC.txs()
    const flagged = allTxs.filter((t) => t.flag && !t.approvedBy)
    const known = new Set([...ACC.ACCOUNTS.map((x) => x.number), ...inv.map((i) => (ACC.txById(i.txId) || {}).counterAccount || ''), ...ex.map((e) => (ACC.txById(e.txId) || {}).counterAccount || '')])
    const outUnknown = allTxs.filter((t) => t.amount < 0 && t.kind !== 'Mzdy a odvody' && t.kind !== 'DPH' && !known.has(t.counterAccount) && !t.expenseId && !t.invoiceId)
    const kontrola = {
      kpis: [
        { value: String(flagged.length), label: 'K rozhodnutí vedení', icon: 'alert', note: 'platby mimo systém, bez dokladu, výběry' },
        { value: String(outUnknown.length), label: 'Odchozí platby na neznámé účty', icon: 'shield', note: 'účet není u žádné faktury ani dokladu' },
        { value: 'Zapnuto', label: 'Čtyři oči', icon: 'users', note: 'platby nad 100 000 Kč mimo faktury schvaluje majitel' },
      ],
      alerts: al.map((x) => { const t = x.txId ? ACC.txById(x.txId) : null; const needsApprove = !!(t && ['Účet mimo systém', 'Ke schválení vedením', 'Nesedí částka'].includes(t.flag)); return { ...x, color: x.level === 'err' ? 'var(--star)' : x.level === 'warn' ? '#B45309' : 'var(--blue-ink)', bg: x.level === 'err' ? 'var(--star-soft)' : x.level === 'warn' ? 'var(--amber-soft)' : 'var(--blue-soft)', needsApprove, note: t ? (state.ucNotes[t.id] || '') : '', setNote: t ? (e) => setState((s) => ({ ucNotes: { ...s.ucNotes, [t.id]: e.target.value } })) : null, approve: needsApprove ? () => { ACC.approveTx(t.id, me, state.ucNotes[t.id]); bump(); showToast('Platba schválena vedením, zapsáno do auditu') } : null, investigate: t ? () => showToast(`Platba ${t.counterparty} předána k prošetření (banka, účetní)`) : null, attach: t && t.flag === 'Chybí doklad' && !t.approvedBy ? () => { ACC.attachDoc(t.id, me); bump(); showToast('Doklad doplněn') } : null, goInv: x.invoiceId ? () => setState({ ucTab: 'faktury', ucInvDetail: x.invoiceId }) : null, goExp: x.expenseId ? () => setState({ ucTab: 'naklady', ucExpDetail: x.expenseId }) : null } }),
      rules: ['Odchozí platba na účet, který není u žádné faktury, dokladu ani v seznamu firemních účtů → okamžité upozornění majiteli, účetní ji nemůže schválit sama.', 'Platba bez dokladu po 5 dnech → výzva k doplnění, bez dokladu se měsíc neuzavře.', 'Rozdíl mezi fakturou a přijatou částkou (typicky kompenzace objednatele) → nesedí částka, k ručnímu spárování.', 'Výběry a platby vlastníkům, odměny nad limit → schválení druhou osobou (čtyři oči), zápis do auditu.', 'Tankovací karty: čerpání bez přiřazeného vozidla nebo mimo směnu řidiče → upozornění (napojeno na Anomálie).'],
    }
    const ys = ACC.yearSummary()
    const rok = {
      kpis: [
        { value: mil(ys.revenue), unit: 'mil. Kč', label: 'Výnosy 2026 (k dnešku)', icon: 'trend', note: `kompenzace ${mil(ys.komp)} mil., jízdné ${mil(ys.fares)} mil., služby ${mil(ys.services)} mil.` },
        { value: mil(ys.costs), unit: 'mil. Kč', label: 'Náklady 2026', icon: 'archive', note: `daňově neuznatelné ${kc(ys.nonDeductible)}` },
        { value: mil(ys.base), unit: 'mil. Kč', label: 'Základ daně', icon: 'scales', note: 'výnosy − náklady + neuznatelné' },
        { value: (ys.tax / 1e6).toFixed(2).replace('.', ','), unit: 'mil. Kč', label: 'Daň z příjmů 21 %', icon: 'banknote', note: 'odhad DPPO, zálohy se odečtou' },
      ],
      byAccount: ys.byAccount.map(([acc, v]) => ({ account: acc, name: (ACC.CHART.find((x) => x.account === acc) || {}).name || 'Mzdy a odvody', amountF: kc(v), pct: Math.round(v / ys.costs * 100), nd: acc === '513' })),
      closedCount: ACC.MONTHS_2026.length - 1,
      exportCsv: () => { ACC.downloadText('DPPO_2026_podklady.csv', ACC.dppoCsv(), 'text/csv;charset=utf-8'); showToast('Podklady pro daňového poradce staženy (CSV)') },
      prepare: () => showToast('Návrh přiznání DPPO se připraví po uzavření prosince; podklady jsou průběžně k dispozici.'),
    }
    return { ucetnictvi: { tab, tabs, me, company: ACC.COMPANY, prehled, faktury, invDetail, newDoc, naklady, banka, mzdy, uzaverka, kontrola, rok, goTab: (t) => setState({ ucTab: t }) } }
  }

  // ---- Řidičský portál (role Řidič): volno, zprávy, podněty, doklady, mzda ----
  const driverPortalVM = () => {
    if (state.role !== 'ridic' || !state.route.startsWith('drv-')) return {}
    const d = driversData.find((x) => x.id === 'dr1') || driversData[0]
    const hr = buildHrVM(d)
    const withKey = state.drvMsgTo || 'dispecink'
    const msgs = state.drvMsgs.filter((m) => m.driverId === d.id && m.with === withKey)
    const docs = state.drvDocs.filter((x) => x.driverId === d.id).map((x) => ({ ...x, meta: DRV_DOC_STATUS[x.status], upload: (file) => uploadDrvDoc(x.id, file) }))
    const ideaMeta = (s) => s === 'Přijato' ? { label: s, color: 'var(--green)', bg: 'var(--green-soft)' } : s === 'V posouzení' ? { label: s, color: 'var(--blue-ink)', bg: 'var(--blue-soft)' } : { label: s, color: '#B45309', bg: 'var(--amber-soft)' }
    return { drv: {
      view: state.route, name: d.name, hr,
      volno: { items: hr.timeOff, vacLeft: hr.vacLeft, vacTotal: hr.vacTotal, vacUsed: hr.vacUsed, add: hr.addTimeOff },
      zpravy: { with: withKey, channels: [['dispecink', 'Dispečink', 'Marie Dvořáková · vedoucí dispečinku'], ['vedeni', 'Vedení', 'Ing. Pavel Šimek · ředitel']].map(([id, label, who]) => ({ id, label, who, active: withKey === id, onClick: () => setState({ drvMsgTo: id }) })), msgs, text: state.drvMsgText, setText: (e) => setState({ drvMsgText: e.target.value }), send: sendDrvMsg, canSend: !!(state.drvMsgText && state.drvMsgText.trim()) },
      podnety: { items: state.drvIdeas.map((i) => ({ ...i, mine: i.driverId === d.id, who: (driversData.find((x) => x.id === i.driverId) || {}).name || '—', meta: ideaMeta(i.status), vote: () => voteIdea(i.id) })), cats: ['Provoz', 'Vozidla', 'Zázemí', 'Jízdní řády', 'Jiné'], cat: state.drvIdeaCat, setCat: (c) => setState({ drvIdeaCat: c }), text: state.drvIdeaText, setText: (e) => setState({ drvIdeaText: e.target.value }), submit: addIdea, canSend: !!(state.drvIdeaText && state.drvIdeaText.trim()) },
      doklady: { items: docs, missing: docs.filter((x) => x.status === 'missing' || x.status === 'expiring').length },
      report: (cat) => openReportModal(d.id, cat),
      smeny: { days: SHIFT_DAYS.map((day) => ({ ...day, shift: state.shifts.filter((s) => s.driverId === d.id && s.dayKey === day.key).map(shiftRow)[0] || null })), planned: state.shifts.filter((s) => s.driverId === d.id && s.status === 'planned').length, total: state.shifts.filter((s) => s.driverId === d.id && SHIFT_DAYS.some((x) => x.key === s.dayKey)).length, trips: upcomingTripsFor(d.id) },
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
    // plánování směn (předání jízdních řádů řidičům)
    const f = state.shiftForm
    const busDrvs = driversData.filter((x) => ['linka', 'mhd', 'dalkova'].includes(x.kind) && x.status === 'active')
    const planRows = state.shifts.map(shiftRow)
    const busOpts = [...new Set([...linesData.map((l) => l.busId), ...vehiclesData.filter((v) => vehicleTypeCat(v.druh) === 'Autobusy').slice(0, 24).map((v) => v.id)])].map((id) => vehiclesData.find((v) => v.id === id)).filter(Boolean).map((v) => ({ id: v.id, label: `${v.brand} ${v.model}`.trim() + ' · ' + v.plate }))
    const plan = {
      days: SHIFT_DAYS.map((d) => ({ ...d, items: planRows.filter((r) => r.dayKey === d.key) })),
      form: f, dates: SHIFT_DAYS.map((d) => ({ id: d.key, label: `${d.label} ${d.today ? '(dnes)' : ''}` })), drivers: busDrvs.map((x) => ({ id: x.id, label: x.name })), lines: linesData.map((l) => ({ id: l.id, label: `Linka ${l.no} · ${l.name}` })), buses: busOpts, turnusy: Object.keys(SHIFT_TURNUS).map((t) => ({ id: t, label: `${t} (${SHIFT_TURNUS[t][0]}–${SHIFT_TURNUS[t][1]})` })),
      set: setShiftForm, assign: assignShift,
      stats: { total: planRows.length, planned: planRows.filter((r) => r.status === 'planned').length, drivers: new Set(planRows.map((r) => r.driverId)).size },
    }
    return { dispatch: { rows, ticks, duties, kpis, anoms, day: DISPATCH_DAY_LABEL, plan } }
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
      { value: String(SEED_STAFF.length), label: 'Režijních zaměstnanců' },
    ]
    const staffRows = SEED_STAFF.map((s, i) => ({ ...s, grossF: czk(buildPayroll(s, 'zamestnanec').gross), color: DRV_PAL[(i + 3) % DRV_PAL.length] }))
    return { driverRows: rows, drStats, staffRows }
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
    const hr = buildHrVM(d)

    return { dd: { ...d, statusLabel: sm.label, statusC: sm.c, statusBg: sm.bg, vehicles, claims, personal, employment, idDocs, files, perf, hr, trips: upcomingTripsFor(d.id), goDrivers: () => navigate('drivers') } }
  }

  // Sdílené HR view-modelu (karta řidiče i pohled řidiče)
  const buildHrVM = (d) => {
    const czf = (n) => (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('cs-CZ') + ' Kč'
    const mode = hrModeOf(d)
    const pr = buildPayroll(d, mode)
    const to = state.timeOff.filter((t) => t.driverId === d.id)
    const vacUsed = to.filter((t) => t.status === 'approved' && t.type === 'Dovolená').reduce((a, t) => a + t.days, 0)
    const vacTotal = 25
    const reps = state.driverReports.filter((r) => r.driverId === d.id)
    return {
      mode, modeLabel: pr.modeLabel, setMode: (m) => setHrMode(d.id, m),
      grossF: czf(pr.gross), netF: czf(pr.net), netLabel: pr.netLabel, employerCostF: czf(pr.employerCost), employerLabel: pr.employerLabel,
      payRows: pr.rows.map((r) => ({ label: r[0], value: czf(r[1]), kind: r[2] })),
      employerRows: (pr.employer || []).map((r) => ({ label: r[0], value: czf(r[1]) })),
      note: pr.note, genPayslip: () => genPayslip(d, mode),
      timeOff: to.map((t) => ({ ...t, statusMeta: TIMEOFF_STATUS[t.status] })),
      vacUsed, vacTotal, vacLeft: vacTotal - vacUsed, addTimeOff: () => openTimeOffModal(d.id),
      reports: reps.map((r) => ({ ...r, catLabel: REPORT_CAT[r.cat].label, catIcon: REPORT_CAT[r.cat].icon, sevMeta: ANO_SEV[r.sev], statusMeta: ANO_STATUS[r.status], onClick: () => openDriver(d.id) })),
      addReport: () => openReportModal(d.id),
      training: buildTraining(d).map((t) => { const due = dueInfo(t.validTo, 60); const badge = !due ? null : due.expired ? { label: `propadlé · ${-due.days} dní`, color: 'var(--star)', bg: 'var(--star-soft)', sev: 2 } : due.days <= 60 ? { label: `končí za ${due.days} dní`, color: '#B45309', bg: 'var(--amber-soft)', sev: 1 } : { label: 'platné', color: 'var(--green)', bg: 'var(--green-soft)', sev: 0 }; return { ...t, badge } }),
      attendance: buildAttendance(d),
      uploads: state.drvDocs.filter((x) => x.driverId === d.id && x.status === 'uploaded').map((x) => ({ ...x, meta: DRV_DOC_STATUS[x.status] })),
      docGaps: state.drvDocs.filter((x) => x.driverId === d.id && (x.status === 'missing' || x.status === 'expiring')).map((x) => ({ ...x, meta: DRV_DOC_STATUS[x.status] })),
      msgs: state.drvMsgs.filter((m) => m.driverId === d.id).slice(-4),
    }
  }

  // Pohled řidiče (role Řidič) — osobní portál
  const driverSelfVM = () => {
    if (state.route !== 'dashboard' || state.role !== 'ridic') return {}
    const roleObj = ROLES.find((x) => x.id === 'ridic')
    const d = driversData.find((x) => x.id === (roleObj && roleObj.driverId)) || driversData[0]
    const hr = buildHrVM(d)
    const perf = buildDriverPerf(d)
    const line = linesData.find((l) => busDrivers.some((bd) => bd.id === l.driverId)) // demo linka
    const myLine = linesData[_hash(d.id) % linesData.length]
    const bus = vehiclesData.find((v) => v.id === myLine.busId)
    const kpis = [
      { value: String(perf.score), unit: '/ 100', label: 'Moje eco skóre', icon: 'gauge', note: perf.band.label },
      { value: `${perf.onTime}`, unit: '%', label: 'Dodržení JŘ', icon: 'clock', note: `${perf.shifts30} směn / 30 dní` },
      { value: String(hr.vacLeft), unit: 'dní', label: 'Zbývá dovolené', icon: 'calendar', note: `z ${hr.vacTotal} dní / rok` },
      { value: hr.netF, label: hr.netLabel, icon: 'banknote', note: hr.modeLabel },
    ]
    const todayShift = state.shifts.filter((s) => s.driverId === d.id && s.dayKey === SHIFT_DAYS[0].key).map(shiftRow)[0]
    const shift = todayShift
      ? { line: todayShift.lineNo, name: todayShift.lineName, bus: todayShift.bus, plate: todayShift.plate, first: todayShift.start, last: todayShift.end, trips: todayShift.tripsDay, onClick: todayShift.openLine, assigned: true, status: todayShift.meta, depot: todayShift.depot, confirm: todayShift.status === 'planned' ? todayShift.confirm : null }
      : { line: myLine.no, name: myLine.name, bus: bus ? `${bus.brand} ${bus.model}` : '', plate: bus ? bus.plate : '', first: myLine.firstDep, last: myLine.lastDep, trips: myLine.tripsDay, onClick: () => openLine(myLine.id) }
    // úkoly pro řidiče: jen to, co vyžaduje jeho akci (detaily jsou v menu portálu)
    const todo = []
    const planned = state.shifts.filter((s) => s.driverId === d.id && s.status === 'planned' && SHIFT_DAYS.some((x) => x.key === s.dayKey)).sort((a, b) => a.dayKey.localeCompare(b.dayKey)).map(shiftRow)
    if (planned.length === 1) { const s = planned[0]; todo.push({ id: 'sh' + s.id, icon: 'calendar', color: 'var(--blue)', bg: 'var(--blue-soft)', title: `Potvrďte převzetí směny ${s.dayLabel}`, sub: s.kind === 'zajezd' ? `${s.lineName} · ${s.bus} ${s.plate}` : `Linka ${s.lineNo} ${s.lineName} · ${s.turnus} · ${s.bus} ${s.plate}`, action: 'Převzít', onAction: s.confirm, onOpen: () => navigate('drv-smeny') }) }
    else if (planned.length > 1) todo.push({ id: 'sh-all', icon: 'calendar', color: 'var(--blue)', bg: 'var(--blue-soft)', title: `Potvrďte převzetí ${planned.length} směn (${planned[0].dayLabel} až ${planned[planned.length - 1].dayLabel})`, sub: planned.map((s) => `${s.dayLabel.split(' ')[0]} ${s.kind === 'zajezd' ? 'zájezd' : 'linka ' + s.lineNo}`).join(' · '), action: 'Převzít vše', onAction: () => { setState((st) => ({ shifts: st.shifts.map((x) => planned.some((p) => p.id === x.id) ? { ...x, status: 'confirmed' } : x) })); showToast(`Převzato ${planned.length} směn, dispečink dostal potvrzení.`) }, onOpen: () => navigate('drv-smeny') })
    const thread = state.drvMsgs.filter((m) => m.driverId === d.id && m.with === 'dispecink'); const lastMsg = thread[thread.length - 1]
    if (lastMsg && lastMsg.from === 'other') todo.push({ id: 'msg', icon: 'send', color: 'var(--purple)', bg: 'var(--purple-soft)', title: `Nová zpráva od ${lastMsg.who}`, sub: lastMsg.text, action: 'Odpovědět', onAction: () => navigate('drv-zpravy'), onOpen: () => navigate('drv-zpravy') })
    state.drvDocs.filter((x) => x.driverId === d.id && (x.status === 'missing' || x.status === 'expiring')).forEach((x) => todo.push({ id: 'doc' + x.id, icon: 'file', color: '#B45309', bg: 'var(--amber-soft)', title: x.file ? `${x.type}: blíží se konec platnosti` : `${x.type}: chybí doklad`, sub: x.validTo ? `Platnost do ${x.validTo}, nahrajte nový doklad` : 'Personalistika ho potřebuje do spisu, nahrajte sken nebo fotku', action: 'Nahrát', onAction: () => navigate('drv-doklady'), onOpen: () => navigate('drv-doklady') }))
    state.timeOff.filter((t) => t.driverId === d.id && t.status === 'pending').forEach((t) => todo.push({ id: 'to' + t.id, icon: 'clock', color: 'var(--ink3)', bg: 'var(--canvas)', title: `${t.type} ${t.from} až ${t.to} čeká na schválení`, sub: `${t.days} dní, vyřizuje vedoucí dopravy`, info: true, onOpen: () => navigate('drv-volno') }))
    state.driverReports.filter((r) => r.driverId === d.id && r.status === 'new').forEach((r) => todo.push({ id: 'rp' + r.id, icon: 'alert', color: 'var(--ink3)', bg: 'var(--canvas)', title: 'Vaše hlášení čeká na převzetí dispečinkem', sub: r.text, info: true, onOpen: () => navigate('drv-zpravy') }))
    return { driverSelf: { d, name: d.name, initials: d.initials, position: d.position, kpis, hr, shift, trips: upcomingTripsFor(d.id), todo,
      reportCats: [['vozidlo', 'Závada na vozidle', 'wrench'], ['trasa', 'Problém na trase', 'pin'], ['jine', 'Jiné hlášení', 'info']].map((c) => ({ cat: c[0], label: c[1], icon: c[2], onClick: () => openReportModal(d.id, c[0]) })),
    } }
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

  // ---------- ONBOARDING: IČO → ARES → trAIce analýza → doplnění → návrh portálu na míru ----------
  const onboardingVM = () => {
    if (state.route !== 'onboarding') return {}
    const o = state.onb
    const set = (patch) => setState((s) => ({ onb: { ...s.onb, ...(typeof patch === 'function' ? patch(s.onb) : patch) } }))
    const setAns = (k, v) => set((x) => ({ answers: { ...x.answers, [k]: v } }))
    const toggleAns = (k, v) => set((x) => { const arr = x.answers[k] || []; return { answers: { ...x.answers, [k]: arr.includes(v) ? arr.filter((y) => y !== v) : [...arr, v] } } })
    // Operativní leasing: víc společností, u každé počet, volitelně VIN (ručně) nebo nahraný seznam (CSV/XLSX)
    const setLeasingRows = (fn) => set((x) => ({ answers: { ...x.answers, leasing: fn(leasingRows(x.answers)) } }))
    const addLeasing = () => setLeasingRows((rows) => [...rows, newLeasingRow()])
    const patchLeasing = (id, patch) => setLeasingRows((rows) => rows.map((r) => r.id === id ? { ...r, ...patch } : r))
    const removeLeasing = (id) => setLeasingRows((rows) => rows.filter((r) => r.id !== id))
    const uploadLeasing = async (id, file) => {
      if (!file) return
      patchLeasing(id, { fileName: file.name, fileVins: [], fileBusy: true, fileError: '' })
      try { const vins = await vinsFromFile(file); patchLeasing(id, { fileVins: vins, fileBusy: false, fileError: vins.length ? '' : 'V souboru není žádný VIN (17 znaků). Zpracuje ho trAIce ručně.' }) } catch (e) { patchLeasing(id, { fileBusy: false, fileError: 'Soubor se nepodařilo přečíst. Zkuste CSV nebo XLSX.' }) }
    }
    const leasingView = leasingRows(o.answers).map((r) => {
      const manual = findVins(r.vinText)
      const vins = Array.from(new Set([...manual, ...(r.fileVins || [])])).map(decodeVin)
      const cnt = Number(r.count) || 0
      return { ...r, vins, vinCount: vins.length, manualCount: manual.length, over: cnt > 0 && vins.length > cnt, missing: Math.max(0, cnt - vins.length),
        setCount: (e) => patchLeasing(r.id, { count: e.target.value.replace(/[^\d]/g, '') }), setCompany: (e) => patchLeasing(r.id, { company: e.target.value }), setOther: (e) => patchLeasing(r.id, { companyOther: e.target.value }),
        setVinText: (e) => patchLeasing(r.id, { vinText: e.target.value }), toggleOpen: () => patchLeasing(r.id, { open: !r.open }), upload: (e) => { const f = e.target.files && e.target.files[0]; e.target.value = ''; uploadLeasing(r.id, f) },
        clearFile: () => patchLeasing(r.id, { fileName: '', fileVins: [], fileError: '' }), remove: () => removeLeasing(r.id) }
    })
    const leasingSum = { total: leasingTotal(o.answers), companies: leasingView.filter((r) => r.company).length, vins: leasingView.reduce((s, r) => s + r.vinCount, 0) }
    const leasingName = (r) => r.company === LEASING_OTHER ? (r.companyOther || 'jiná společnost') : r.company
    const firm = o.firm
    const c = firm && firm.company
    const reg = firm && firm.register
    const load = async (icoIn) => {
      const ico = String(icoIn ?? o.ico).replace(/\s/g, '')
      if (!/^\d{8}$/.test(ico)) { set({ error: 'IČO má 8 číslic.' }); return }
      set({ loading: true, error: null, ico })
      try {
        const r = await fetch('https://ares.gov.cz/ekonomicke-subjekty-v-be/rest/ekonomicke-subjekty/' + ico)
        if (!r.ok) throw new Error(r.status === 404 ? 'Subjekt s tímto IČO v ARES není.' : 'ARES neodpověděl (' + r.status + ').')
        const d = await r.json()
        let f = onbAresFirm(d)
        if (ico === '26060451') f = { ...f, id: 'csad', ...CSAD_FIRM_EXTRA, register: csadRegister() }
        else f = { ...f, register: null, economy: { rows: [], source: 'Sbírka listin (or.justice.cz)', signal: 'Účetní závěrku, registr vozidel a registr smluv zpracuje trAIce na serveru. V demu jsou živě pro ČSAD a ukázkové firmy.' }, contracts: { public: null, note: 'Registr smluv prohledá trAIce na serveru.' }, answers: { ...ONB_ANSWERS } }
        beginAnalysis({ loading: false, firm: f, answers: { ...f.answers }, selected: null })
      } catch (e) { set({ loading: false, error: (e && e.message) || 'Načtení se nepodařilo.' }) }
    }
    const pickDemo = (id) => { const d = DEMO_FIRMS.find((x) => x.id === id); if (!d) return; if (d.live) { load(d.ico); return } beginAnalysis({ ico: '', error: null, firm: { ...d }, answers: { ...d.answers }, selected: null }) }
    // Analýza běží v modalu hned po načtení firmy; po doběhnutí tlačítko Pokračovat → krok „Co jsme zjistili"
    const beginAnalysis = (patch) => {
      set({ ...(patch || {}), step: 1, anOpen: true, anIdx: 0, autoIco: null })
      for (let i = 1; i <= ONB_AN_STEPS.length; i++) setTimeout(() => set({ anIdx: i }), i * 700)
    }
    const startAnalysis = () => beginAnalysis()
    const recs = c ? recommendProfiles({ nace: c.nace, kinds: reg ? reg.kinds : {}, answers: o.answers }) : []
    const recOf = (id) => recs.find((r) => r.id === id) || { level: 'ne', why: [], score: 0 }
    const selected = o.selected || Object.fromEntries(recs.filter((r) => r.level === 'doporuceno').map((r) => [r.id, true]))
    const selIds = PROFILES.map((p) => p.id).filter((id) => selected[id])
    const selProfiles = selIds.map(profileById)
    const uniq = (arr) => Array.from(new Set(arr))
    const fmtD = (iso) => { if (!iso) return '—'; const [y, m, d] = String(iso).split('-'); return d && m ? `${+d}. ${+m}. ${y}` : iso }
    const kindsSorted = reg ? Object.entries(reg.kinds).sort((a, b) => b[1] - a[1]) : []
    const analysis = c ? [
      { title: ONB_AN_STEPS[0], result: `${c.name}, ${LEGAL_FORMS[c.legal] || 'právní forma ' + c.legal}, vznik ${fmtD(c.founded).slice(-4)}, ${c.nace.length} ${c.nace.length === 1 ? 'činnost' : c.nace.length < 5 ? 'činnosti' : 'činností'} CZ-NACE`, live: !!firm.live },
      { title: ONB_AN_STEPS[1], result: firm.live ? `Zápis v obchodním rejstříku ${c.vr ? 'aktivní' : 'nenalezen'}, DPH: ${c.vat ? 'plátce' : 'neplátce'}. ${firm.economy.source}.` : `${firm.economy.source}. DPH: ${c.vat ? 'plátce' : 'neplátce'}.`, live: !!firm.live },
      { title: ONB_AN_STEPS[2], result: reg ? `${reg.total} vozidel: ${kindsSorted.map(([k, n]) => `${n}× ${k.toLowerCase()}`).join(', ')}. Průměrné stáří ${reg.age}.` : 'Dotaz běží na serveru trAIce (otevřená data registru, 19 mil. záznamů). V demu je registr živě pro ČSAD a ukázkové firmy.', live: firm.id === 'csad', soft: !reg },
      { title: ONB_AN_STEPS[3], result: firm.contracts.public === null ? firm.contracts.note : firm.contracts.public === 0 ? firm.contracts.note : `${firm.contracts.public} smluv s veřejnými zadavateli. ${firm.contracts.note}`, soft: firm.contracts.public === null },
      { title: ONB_AN_STEPS[4], result: firm.economy.rows.length ? firm.economy.rows.map((r) => `${r[0]} ${r[1]}`).join(', ') + '.' : firm.economy.signal, soft: !firm.economy.rows.length },
      { title: ONB_AN_STEPS[5], result: recs.filter((r) => r.level === 'doporuceno').length ? `Doporučené profily: ${recs.filter((r) => r.level === 'doporuceno').map((r) => profileById(r.id).name).join(', ')}.` : 'Z dostupných signálů zatím žádný jasný profil, upřesní ho doplňující otázky.' },
    ].map((it, i) => ({ ...it, status: o.anIdx > i ? 'done' : o.anIdx === i ? 'running' : 'wait' })) : []
    const anDone = o.anIdx >= ONB_AN_STEPS.length
    const a = o.answers
    const prepare = selProfiles.length ? [
      reg ? { icon: 'car', text: `Import ${reg.total} vozidel z registru včetně VIN, SPZ, druhu, paliva a data první registrace. Doklady (ORV, STK) dotáhneme k vozidlům.` } : { icon: 'car', text: 'Import vozidel z registru silničních vozidel přes trAIce (podle IČO provozovatele) včetně VIN, SPZ a dokladů.' },
      leasingSum.total > 0 ? { icon: 'banknote', text: `${leasingSum.total} vozidel na operativní leasing (${leasingView.filter((r) => Number(r.count) > 0).map((r) => `${r.count}× ${leasingName(r) || 'společnost nevyplněna'}`).join(', ')}) v registru nejsou, provozovatelem je leasingová společnost. ${leasingSum.vins ? `${leasingSum.vins} VIN už máme, údaje o vozidlech dotáhne trAIce z registru${leasingSum.total > leasingSum.vins ? `, zbylých ${leasingSum.total - leasingSum.vins} doplníme z výpisu leasingu` : ''}.` : 'Doplníme je z výpisu leasingu (VIN lze zadat i teď).'} Splátky napojíme do financování.` } : { icon: 'banknote', text: 'Bez operativního leasingu: všechna vozidla jsou v registru na vaše IČO, nic se nedoplňuje ručně.' },
      a.machines === 'ano' && Number(a.machinesCount) > 0 ? { icon: 'tire', text: `${a.machinesCount} strojů a nářadí mimo registr založíme s výrobním číslem a motohodinami místo SPZ a km.` } : null,
      a.telematics === 'ano' ? { icon: 'gauge', text: `Napojíme telematiku ${a.telematicsBrand || ''}: poloha, spotřeba, styl jízdy a anomálie paliva poběží od prvního dne.` } : { icon: 'gauge', text: 'Bez telematiky: eco-driving a anomálie paliva zatím z palivových karet a tankování, telematiku lze doplnit později.' },
      { icon: 'users', text: `Role: ${uniq(selProfiles.flatMap((p) => p.roles)).join(', ')}${a.drivers ? `. Pozvánky pro ${a.drivers} lidí v provozu.` : '.'}` },
      { icon: 'shield', text: `Pojištění podle profilu: ${uniq(selProfiles.flatMap((p) => p.insurance)).join(', ')}.` },
      { icon: 'check2', text: `Hlídané lhůty: ${uniq(selProfiles.flatMap((p) => p.checks)).join(', ')}.` },
    ].filter(Boolean) : []
    const plan = [
      ['Den 1', 'Import vozidel, dokladů a smluv, založení provozoven a středisek.'],
      ['Týden 1', 'Pozvánky lidem podle rolí, první přihlášení řidičů a dispečinku.'],
      ['Týden 2', 'Napojení telematiky, banky a palivových karet, kontrola pojistných smluv makléřem.'],
      ['Měsíc 1', 'První měsíční uzávěrka, výkazy a report pro vedení.'],
    ]
    const apply = () => {
      if (!c) return
      const tenant = { name: c.name, ico: c.ico, provozy: selIds, vehicles: (reg ? reg.total : vehiclesData.length) + leasingSum.total, leasing: leasingView.map((r) => ({ company: leasingName(r), count: Number(r.count) || 0, vins: r.vins.map((v) => v.vin) })), preview: firm.id !== 'csad', trial: trialDates(), paid: false, expired: false }
      setState({ tenant, route: 'dashboard', onb: { ...DEFAULT_ONB }, navOpen: { provoz: true, flotila: true, lide: true, finance: true, firma: false } })
      showToast(`Fleet Portal nastaven pro ${c.name}: ${selProfiles.map((p) => p.name).join(', ')}`)
      try { history.replaceState(null, '', location.pathname) } catch (e) { /* bez URL */ }
    }
    // pořadí = priorita pro „hlavní činnost" (doprava před cestovkou, i když ARES uvádí cestovku dřív)
    const NACE_HIT = ['4931', '4932', '4939', '4941', '4942', '5229', '5320', '01', '41', '42', '43', '4520', '7711', '7712', '7731', '791']
    const naceHit = (code) => NACE_HIT.some((p) => String(code).startsWith(p))
    const naceList = c ? c.nace.filter((code) => !naceIsEmpty(code)) : []
    const mainNace = NACE_HIT.map((p) => naceList.find((code) => String(code).startsWith(p))).find(Boolean) || naceList[0]
    const topRecs = recs.filter((r) => r.level !== 'ne').slice(0, 3)
    const company = c ? {
      name: c.name, live: !!firm.live, demo: !firm.live,
      // krátké fakty do jednoho řádku a detail pod nimi (bez duplicit DIČ × plátce DPH)
      facts: [LEGAL_FORMS[c.legal] || null, c.founded ? `od roku ${fmtD(c.founded).slice(-4)}` : null, c.region || null, c.vat ? 'plátce DPH' : 'neplátce DPH'].filter(Boolean),
      details: [['IČO', c.ico], c.vat && c.dic ? ['DIČ', c.dic] : null, ['Sídlo', c.address]].filter(Boolean),
      nace: naceList.map((code) => ({ code: naceFmt(code), name: naceName(code), hit: naceHit(code) })),
      // co z toho plyne: 3 až 4 věty, které si člověk odnese, a náhled profilů (potvrdí se až v Návrhu)
      findings: [
        mainNace ? { icon: 'grid', text: naceHit(mainNace) ? `Hlavní činnost souvisí s dopravou nebo flotilou: ${naceName(mainNace) || 'CZ-NACE ' + naceFmt(mainNace)}.` : `Hlavní činnost: ${naceName(mainNace) || 'CZ-NACE ' + naceFmt(mainNace)}. Vozidla jsou podpůrná, ne jádro byznysu.` } : { icon: 'grid', text: 'ARES u firmy neuvádí žádnou činnost, profil určí doplňující otázky.' },
        reg ? { icon: 'car', text: `V registru je ${reg.total} vozidel na vaše IČO, nejvíc ${kindsSorted[0][0].toLowerCase()} (${kindsSorted[0][1]}). Průměrné stáří ${reg.age}.` } : { icon: 'car', text: 'Vozidla psaná na vaše IČO dotahuje trAIce z registru. Operativní leasing v registru není, doplníte ho v dalším kroku.' },
        firm.contracts.public ? { icon: 'doc2', text: `${firm.contracts.public} smluv s veřejnými zadavateli, hodí se vyúčtování výkonů a evidence zakázek.` } : null,
        firm.economy.rows.length ? { icon: 'trend', text: firm.economy.signal } : null,
      ].filter(Boolean),
      recsPreview: topRecs.map((r) => ({ name: profileById(r.id).name, level: r.level })),
    } : null
    return {
      onboarding: {
        step: o.step, steps: ['Firma', 'Co jsme zjistili', 'Doplnění', 'Návrh portálu'].map((label, i) => ({ label, done: o.step > i + 1, current: o.step === i + 1 })),
        ico: o.ico, setIco: (e) => set({ ico: e.target.value, error: null }), load: () => load(), loadIco: (ico) => load(ico), loading: o.loading, error: o.error, autoIco: o.autoIco,
        anOpen: o.anOpen, anContinue: () => set({ anOpen: false, step: 2 }), anClose: () => set({ anOpen: false }), firmName: c ? c.name : '', firmDemo: !!(firm && !firm.live), trialDays: TRIAL_DAYS,
        demoFirms: DEMO_FIRMS.map((d) => ({ id: d.id, label: d.label, tag: d.tag, live: d.live, pick: () => pickDemo(d.id), on: firm && firm.id === d.id })),
        company, register: reg ? { total: reg.total, kinds: kindsSorted, brands: reg.brands, fuel: Object.entries(reg.fuel).sort((x, y) => y[1] - x[1]), age: reg.age, sites: reg.sites } : null,
        economy: firm ? firm.economy : null, contracts: firm ? firm.contracts : null,
        analysis, anDone, startAnalysis,
        answers: a, setAns: (k) => (e) => setAns(k, e.target.value), setAnsV: setAns, toggleAns,
        leasingCompanies: [...leasingPartners.map((p) => p.name), LEASING_OTHER], leasingOther: LEASING_OTHER, leasing: leasingView, leasingSum, addLeasing,
        recs: PROFILES.map((p) => { const r = recOf(p.id); return { ...p, rec: r, on: !!selected[p.id], toggle: () => set((x) => { const cur = x.selected || Object.fromEntries(recs.filter((q) => q.level === 'doporuceno').map((q) => [q.id, true])); return { selected: { ...cur, [p.id]: !cur[p.id] } } }), modules: p.modules.map(([id, label]) => ({ id, label, built: BUILT_MODULES.has(id) })) } }).sort((x, y) => y.rec.score - x.rec.score),
        selCount: selIds.length, prepare, plan, apply,
        canNext: o.step === 1 ? !!c && anDone : o.step === 2 ? true : o.step === 3 ? true : selIds.length > 0,
        next: () => { if (o.step === 1) { if (anDone) set({ anOpen: false, step: 2 }); else startAnalysis() } else set({ step: o.step + 1 }) },
        back: () => set({ step: Math.max(1, o.step - 1) }),
        exit: () => { setState({ route: 'dashboard' }); try { history.replaceState(null, '', location.pathname) } catch (e) { /* bez URL */ } },
      },
    }
  }

  const vm = {
    dash: state.dash, dashMeta: DASH_WIDGETS, toggleDashWidget, setDashWidth, moveDashWidget, resetDash,
    kpi: state.kpi, kpiCatalog: KPI_CATALOG, kpiVals, kpiLabel, dashKpis, toggleKpi, moveKpi, resetKpi, kpiMax: KPI_MAX, kpiOnCount: state.kpi.filter((k) => k.on).length,
    equipModal: state.equipModal ? { ...state.equipModal, close: () => setState({ equipModal: null }), stop: (e) => e.stopPropagation(), sections: EQUIP_SECTIONS, onSection: (e) => setEquipField('section', e.target.value), onDesc: (e) => setEquipField('desc', e.target.value), onPrice: (e) => setEquipField('price', e.target.value), onDate: (e) => setEquipField('date', e.target.value), onInvoice: onEquipInvoice, save: saveEquip } : null,
    serviceModal: state.serviceModal ? { ...state.serviceModal, close: () => setState({ serviceModal: null }), stop: (e) => e.stopPropagation(), types: SERVICE_TYPES, field: (k) => (e) => setServiceField(k, e.target.value), onInvoice: (e) => { const f = e.target.files && e.target.files[0]; if (f) setServiceField('invoice', f.name) }, save: saveService } : null,
    tireModal: state.tireModal ? { ...state.tireModal, close: () => setState({ tireModal: null }), stop: (e) => e.stopPropagation(), actions: TIRE_ACTIONS, field: (k) => (e) => setTireField(k, e.target.value), onInvoice: (e) => { const f = e.target.files && e.target.files[0]; if (f) setTireField('invoice', f.name) }, save: saveTire } : null,
    fineModal: state.fineModal ? { ...state.fineModal, close: () => setState({ fineModal: null }), stop: (e) => e.stopPropagation(), types: FINE_TYPES, field: (k) => (e) => setFineField(k, e.target.value), togglePaid: () => setState((s) => ({ fineModal: { ...s.fineModal, paid: !s.fineModal.paid } })), save: saveFine } : null,
    ...shellVM(), ...onboardingVM(), ...dashboardVM(), ...fleetsVM(), ...fleetDetailVM(), ...vehiclesVM(), ...vehicleDetailVM(),
    ...insuranceVM(), ...insuranceDetailVM(), ...claimsVM(), ...claimDetailVM(), ...documentsVM(), ...documentsDetailVM(), ...analyticsVM(), ...ownerDashVM(), ...dispatchDashVM(), ...driverSelfVM(), ...attentionVM(), ...anomaliesVM(), ...anomalyDetailVM(), ...mapVM(), ...vykonyVM(), ...optimalizaceVM(), ...servisVM(), ...zajezdyVM(), ...zajezdDetailVM(), ...elektrobusyVM(), ...ucetnictviVM(), ...driverPortalVM(), ...dispatchVM(), ...stazkaVM(), ...contactsVM(), ...settingsVM(), ...bonifikaceVM(), ...bonifikaceDetailVM(), ...driversVM(), ...driverDetailVM(), ...financingVM(), ...rfqVM(), ...wizardVM(), ...addVehicleVM(), ...linkyVM(), ...linkyDetailVM(), ...ecoVM(),
  }

  return <Render vm={vm} />
}
