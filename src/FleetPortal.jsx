import React, { useState, useRef } from 'react'
import { Icon, czk, linePath, useViewport } from './helpers.jsx'
import Render from './Render.jsx'
import {
  insurersData, brandsData, fleetsData, vehiclesData, claimsData,
  statusMeta, claimStatusMeta, fleetName, statusChip,
} from './data.js'

const ic = (name, size = 18, sw = 1.8) => <Icon name={name} size={size} sw={sw} />

const ROOT_STYLE =
  "--star:#C8102E;--star-soft:#FDECEE;--star-ink:#9B0E25;--blue:#2058C9;--blue-soft:#EAF0FC;" +
  "--blue-ink:#1A47A3;--green:#16A34A;--green-soft:#E7F6ED;--amber:#C2780C;--amber-soft:#FBF1DF;" +
  "--ink:#18181B;--ink2:#5B5B63;--ink3:#8E8E96;--border:#ECECEE;--border2:#E3E3E6;--canvas:#FAFAFA;" +
  "--card:#FFFFFF;--r:14px;display:flex;height:100vh;width:100%;overflow:hidden;color:var(--ink);" +
  "font-family:'Hanken Grotesk',system-ui,sans-serif"

const MONTHS = ['Čvc', 'Srp', 'Zář', 'Říj', 'Lis', 'Pro', 'Led', 'Úno', 'Bře', 'Dub', 'Kvě', 'Čvn']
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
const BROKER = { name: 'IS Group, spol. s r.o.', role: 'Pojišťovací makléř', reg: 'ČNB, reg. č. 197542PM', ico: '264 18 920', person: 'Martin Kovář', email: 'martin.kovar@isgroup.cz', phone: '+420 222 119 350' }
const POJISTNIK = { name: 'Louda Auto a.s.', ico: '256 12 348' }

export default function FleetPortal() {
  const [state, setStateRaw] = useState({
    route: 'dashboard',
    fleetId: 'f1', vehicleId: 'v1',
    fleetTab: 'overview', vehicleTab: 'overview', fleetsView: 'grid',
    search: false, notif: false, ai: false, companyMenu: false, sidebar: false,
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
    avHavRozsah: 'allrisk', avHavSpoluucast: '5% / 5 000 Kč', avPrLimit: '100 / 100 mil. Kč', avUziti: 'Běžné užití',
    vf: { fleet: 'all', brand: 'all', fuel: 'all', insurer: 'all', status: 'all', q: '' },
    selected: {},
    pref: { renewal: true, claim: true, docs: true, email: true, sms: false },
    cwType: 'Havárie', cwVehicle: 'v1',
    searchQuery: '',
    aiInput: '',
    aiMessages: [
      { role: 'ai', text: 'Dobrý den, Martine. Jsem váš fleet asistent. Můžu vyhledávat vozidla, hlídat obnovy nebo nahlásit škodu — stačí napsat.' },
    ],
  })
  const ttRef = useRef(null)
  const vp = useViewport()
  const setState = (patch) => setStateRaw((s) => ({ ...s, ...(typeof patch === 'function' ? patch(s) : patch) }))
  const allFleets = [...fleetsData, ...state.newFleets]

  // ---------- ACTIONS ----------
  const navigate = (route, patch) => setState({ route, ...(patch || {}), search: false, notif: false, companyMenu: false, sidebar: false })
  const openFleet = (id) => navigate('fleet-detail', { fleetId: id, fleetTab: 'overview' })
  const openVehicle = (id) => navigate('vehicle-detail', { vehicleId: id, vehicleTab: 'overview' })
  const openClaim = (id) => navigate('claim-detail', { claimId: id })
  const toggleNotif = () => setState((s) => ({ notif: !s.notif, companyMenu: false }))
  const toggleAI = () => setState((s) => ({ ai: !s.ai }))
  const openSearch = () => setState({ search: true })
  const closeSearch = () => setState({ search: false })
  const stop = (e) => e.stopPropagation()
  const showToast = (msg) => { if (ttRef.current) clearTimeout(ttRef.current); setState({ toast: msg }); ttRef.current = setTimeout(() => setState({ toast: null }), 3800) }
  const openUnsub = (v) => setState({ rowMenu: null, unsubDone: false, unsubReason: 'Prodej vozidla', unsubDate: '1. 7. 2026', unsub: { plate: v.plate, brand: v.brand, model: v.model, vin: v.vin, fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), renewal: v.renewal } })
  const openCostModal = (v) => setState({ costModal: { plate: v.plate, brand: v.brand, model: v.model }, costDone: false, costType: 'Servis a opravy', costDesc: '', costAmount: '', costDate: '19. 6. 2026', costFile: null })
  const openNoteModal = (v) => setState({ noteModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model }, noteText: '' })
  const openParkModal = (v) => setState({ parkModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, fleet: v.fleet }, parkTarget: null, parkDone: false })
  const openDriverModal = (v) => setState({ driverModal: { vid: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver }, driverSel: null, driverDone: false })
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
  const toggleSel = (id) => setState((s) => { const n = { ...s.selected }; if (n[id]) delete n[id]; else n[id] = true; return { selected: n } })

  const aiReply = (q) => {
    const l = q.toLowerCase()
    if (l.includes('obnov') || l.includes('renew')) return '34 vozidel má obnovu do 30 dnů. Nejbližší: Škoda Scala (2SC 7790) — 20. 6. Chcete je zobrazit ve filtru?'
    if (l.includes('nejvíc') || l.includes('nejdráž') || l.includes('cost')) return 'Nejnákladnější park je Praha – Centrála s ročním pojistným 4,28 mil. Kč (84 vozidel). Druhý je Dlouhodobý pronájem (3,05 mil. Kč).'
    if (l.includes('gap')) return 'Našel jsem 41 vozidel bez plného krytí. 12 z nich nemá GAP — převážně v parku Brno. Mám připravit hromadnou nabídku?'
    if (l.includes('škod') || l.includes('damage') || l.includes('nehod')) return 'Spustil jsem průvodce nahlášením škody. Vyberte vozidlo a popište událost — zbytek doplním z dat parku.'
    if (l.includes('claim') || l.includes('událost')) return 'Aktuálně je 9 otevřených událostí. Nejvyšší odhad: Audi A6 — odcizení kol, 58 000 Kč (Generali, v likvidaci).'
    if (l.includes('úspor') || l.includes('saving')) return 'Oproti loňsku šetříte 1,84 mil. Kč (−11 %). Konsolidací havarijního u Kooperativy lze ušetřit dalších ~320 000 Kč ročně.'
    return 'Rozumím. Pracuji s daty 312 vozidel napříč 6 parky. Zkuste např. „Najdi vozidla bez GAP" nebo „Který park stojí nejvíc?".'
  }
  const sendAi = (t) => {
    const q = (typeof t === 'string' ? t : state.aiInput).trim()
    if (!q) return
    const reply = aiReply(q)
    setState((s) => ({ aiInput: '', aiMessages: [...s.aiMessages, { role: 'user', text: q }, { role: 'ai', text: reply }] }))
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
        broker: 'Robert Harlas, IS Group, spol. s r.o.',
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
      ['dashboard', 'Přehled', 'dashboard', null],
      ['fleets', 'Vozové parky', 'fleets', null],
      ['vehicles', 'Vozidla', 'car', '312'],
      ['insurance', 'Pojištění', 'shield', null],
      ['claims', 'Škody', 'alert', '9'],
      ['documents', 'Dokumenty', 'file', null],
      ['bonifikace', 'Bonifikace', 'percent', null],
      ['contacts', 'Kontakty', 'users', null],
      ['analytics', 'Analytika', 'chart', null],
      ['settings', 'Nastavení', 'settings', null],
    ]
    const activeRoute = r === 'fleet-detail' ? 'fleets' : r === 'vehicle-detail' ? 'vehicles' : r === 'bonifikace-detail' ? 'bonifikace' : r === 'documents-detail' ? 'documents' : r === 'claim-detail' ? 'claims' : r
    const nav = navItems.map(([id, label, icon, badge]) => {
      const on = activeRoute === id
      return {
        id, label, icon: ic(icon, 18), iconColor: on ? 'var(--blue)' : '#8E8E96',
        onClick: () => navigate(id),
        style: `display:flex;align-items:center;gap:11px;padding:9px 11px;margin:2px 0;border-radius:10px;font-size:13.5px;font-weight:${on ? '600' : '500'};cursor:pointer;color:${on ? 'var(--blue-ink)' : '#3F3F46'};background:${on ? 'var(--blue-soft)' : 'transparent'}`,
        badge, badgeStyle: `font-size:11px;font-weight:700;color:${on ? 'var(--blue)' : '#8E8E96'};background:${on ? '#fff' : '#F1F1F3'};padding:1px 7px;border-radius:20px`,
      }
    })
    const titles = {
      dashboard: ['Přehled', 'Souhrn vozového parku Louda Auto'],
      fleets: ['Vozové parky', '6 parků · 312 vozidel'],
      vehicles: ['Vozidla', '312 vozidel celkem'],
      insurance: ['Pojištění', 'Smlouvy a krytí napříč parky'],
      claims: ['Škody', '9 otevřených · 47 uzavřených letos'],
      documents: ['Dokumenty', 'Centrální úložiště dokumentů'],
      'documents-detail': ['Pojistné smlouvy', 'Flotilové smlouvy a jejich dokumenty'],
      bonifikace: ['Bonifikace', 'Vrácení části pojistného dle škodního průběhu'],
      contacts: ['Kontakty', 'Manažeři, řidiči, partneři'],
      analytics: ['Analytika', 'Náklady, trendy a úspory'],
      settings: ['Nastavení', 'Profil a předvolby portálu'],
    }
    let title, sub
    if (r === 'fleet-detail') { const f = allFleets.find((x) => x.id === state.fleetId); title = f.name; sub = `Fleet manager · ${f.manager} · ${f.vehicles} vozidel` }
    else if (r === 'vehicle-detail') { const v = vehiclesData.find((x) => x.id === state.vehicleId); title = `${v.brand} ${v.model}`; sub = `${v.plate} · ${fleetName(v.fleet)}` }
    else if (r === 'bonifikace-detail') { const f = allFleets.find((x) => x.id === state.fleetId) || allFleets[0]; title = `Bonifikace · ${f.insurers[0]}`; sub = `Flotilová smlouva č. ${f.policy || '—'}` }
    else if (r === 'documents-detail') { const tm = { zk: ['Zelené karty', 'Zelená karta ke každému vozidlu'], orv: ['Technické průkazy', 'Osvědčení o registraci vozidla (ORV)'], faktury: ['Faktury', 'Faktury za pojištění'] }; const t = tm[state.docCat] || ['Pojistné smlouvy', 'Flotilové smlouvy a jejich dokumenty']; title = t[0]; sub = t[1] }
    else if (r === 'claim-detail') { const c = claimsData.find((x) => x.id === state.claimId) || claimsData[0]; title = `Škoda ${c.id}`; sub = `${c.type} · ${c.vehicle}` }
    else { const t = titles[r] || ['', '']; title = t[0]; sub = t[1] }

    const aiMessages = state.aiMessages.map((m) => ({
      text: m.text,
      wrap: `display:flex;justify-content:${m.role === 'user' ? 'flex-end' : 'flex-start'}`,
      bubble: m.role === 'user'
        ? 'max-width:80%;background:var(--blue);color:#fff;padding:9px 13px;border-radius:14px 14px 4px 14px;font-size:13px;line-height:1.5'
        : 'max-width:84%;background:#fff;border:1px solid var(--border);padding:9px 13px;border-radius:14px 14px 14px 4px;font-size:13px;line-height:1.5;color:#27272A',
    }))
    const aiChips = [
      { text: 'Obnovy tento měsíc', onClick: () => sendAi('Ukaž vozidla s obnovou tento měsíc') },
      { text: 'Který park stojí nejvíc?', onClick: () => sendAi('Který park stojí nejvíc?') },
      { text: 'Vozidla bez GAP', onClick: () => sendAi('Najdi vozidla bez GAP') },
      { text: 'Nahlásit škodu', onClick: () => sendAi('Chci nahlásit škodu') },
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
      nav, pageTitle: title, pageSubtitle: sub, route: r,
      isDashboard: r === 'dashboard', isFleets: r === 'fleets', isFleetDetail: r === 'fleet-detail',
      isVehicles: r === 'vehicles', isVehicleDetail: r === 'vehicle-detail',
      isInsurance: r === 'insurance', isInsuranceDetail: r === 'insurance-detail', isClaims: r === 'claims', isDocuments: r === 'documents', isAnalytics: r === 'analytics', isContacts: r === 'contacts', isSettings: r === 'settings',
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
      unsubApprover: { name: 'Ing. Tomáš Bartoš', role: 'Vedoucí správy vozového parku · Louda Auto a.s.', initials: 'TB' },
      costModal: state.costModal, costDone: state.costDone, costType: state.costType, costDesc: state.costDesc, costAmount: state.costAmount, costDate: state.costDate, costFile: state.costFile,
      closeCostModal: () => setState({ costModal: null }),
      setCostType: (e) => setState({ costType: e.target.value }),
      setCostDesc: (e) => setState({ costDesc: e.target.value }),
      setCostAmount: (e) => setState({ costAmount: e.target.value }),
      setCostDate: (e) => setState({ costDate: e.target.value }),
      pickCostFile: (e) => { const f = e.target.files && e.target.files[0]; if (f) setState({ costFile: f.name }) },
      submitCost: () => setState({ costDone: true }),
      costTypes: ['Servis a opravy', 'Dálniční známka', 'Pneumatiky / přezutí', 'STK a emise', 'Palivo', 'Mytí a péče o vůz', 'Parkování', 'Mýtné (zahraničí)', 'Pokuta', 'Náhradní vozidlo', 'Leasing / splátka', 'Ostatní'],
      noteModal: state.noteModal, noteText: state.noteText, currentUser: { name: 'Martin Kovář', initials: 'MK', role: 'Fleet Manager · Louda Auto' },
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
      goFleets: () => navigate('fleets'),
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
    }
  }

  const dashboardVM = () => {
    if (state.route !== 'dashboard') return {}
    const totalPremium = fleetsData.reduce((a, f) => a + f.premium, 0)
    const totalVehicles = fleetsData.reduce((a, f) => a + f.vehicles, 0)
    const premiumMil = (totalPremium / 1e6).toFixed(2).replace('.', ',') + ' mil.'
    const khero = [
      { icon: ic('fleets', 20), iconBg: 'var(--blue-soft)', iconColor: 'var(--blue)', value: String(fleetsData.length), label: 'Vozové parky', sub: 'aktivní pobočky' },
      { icon: ic('car', 20), iconBg: '#F1F1F3', iconColor: '#3F3F46', value: String(totalVehicles), label: 'Vozidla', sub: 'pojištěných vozidel' },
      { icon: ic('shield', 20), iconBg: 'var(--star-soft)', iconColor: 'var(--star)', value: premiumMil, label: 'Roční pojistné', sub: 'předepsané ročně (Kč)' },
      { icon: ic('alert', 20), iconBg: 'var(--amber-soft)', iconColor: 'var(--amber)', value: '9', label: 'Otevřené škody', sub: '47 uzavřených letos' },
    ]
    const claimStats = [
      { label: 'Otevřené', value: '9', color: 'var(--star)' },
      { label: 'Uzavřené (rok)', value: '47', color: 'var(--ink)' },
      { label: 'Vyplaceno (rok)', value: '1,24 mil.', color: 'var(--ink)' },
    ]
    const cb = [3, 2, 4, 1, 3, 2, 5, 3, 4, 2, 3, 2]; const cbMax = Math.max(...cb)
    const claimBars = cb.map((v, i) => ({ h: Math.round(v / cbMax * 100) + '%', color: i >= 10 ? 'var(--star)' : '#E3B7BE', label: MONTHS[i][0] }))
    let acc = 0; const segs = insurersData.map((i) => { const a = acc; acc += i.pct / 100 * 360; return `${i.color} ${a}deg ${acc}deg` })
    const insurerDonut = `conic-gradient(${segs.join(',')})`
    const insurers = insurersData.map((i) => ({ ...i, volF: (totalPremium * i.pct / 100 / 1e6).toFixed(2).replace('.', ',') + ' mil.' }))
    const activity = [
      { actor: 'Škoda Octavia (5SK 8841)', action: 'přidána do parku Praha – Centrála', time: 'před 2 h', color: 'var(--blue)' },
      { actor: 'BMW 320d (2BM 5567)', action: 'nahlášena pojistná událost – parkovací škoda', time: 'před 5 h', color: 'var(--star)' },
      { actor: 'VW Transporter (4VW 8800)', action: 'obnoveno povinné ručení (ČSOB)', time: 'včera', color: 'var(--green)' },
      { actor: 'Audi A6 (8EX 7733)', action: 'změněn řidič na Jan Kučera', time: 'včera', color: '#A1A1AA' },
      { actor: 'Tesla Model 3 (1EV 9087)', action: 'nahrána zelená karta', time: 'před 2 dny', color: 'var(--blue)' },
      { actor: 'Škoda Fabia (3FA 1180)', action: 'vyřazena z parku Brno', time: 'před 2 dny', color: '#A1A1AA' },
      { actor: 'Hyundai Tucson (6HY 3320)', action: 'přidáno havarijní pojištění (Generali)', time: 'před 3 dny', color: 'var(--amber)' },
    ]
    return { khero, claimStats, months: MONTHS, claimBars, insurerDonut, insurers, activity }
  }

  const fleetsVM = () => {
    if (state.route !== 'fleets') return {}
    const riskColor = (r) => r >= 75 ? 'var(--green)' : r >= 62 ? 'var(--amber)' : 'var(--star)'
    const fleetCards = allFleets.map((f) => ({
      name: f.name, manager: f.manager, vehicles: f.vehicles, policy: f.policy || '—',
      premium: (f.premium / 1000000).toFixed(2).replace('.', ',') + ' mil.',
      claims: f.claims, risk: f.risk, riskColor: riskColor(f.risk),
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
    const stats = [
      { label: 'Vozidla', value: String(f.vehicles), color: 'var(--ink)' },
      { label: 'Roční pojistné', value: (f.premium / 1000000).toFixed(2).replace('.', ',') + ' mil.', color: 'var(--ink)' },
      { label: 'Ø / vozidlo', value: Math.round(f.premium / (f.vehicles || 1)).toLocaleString('cs-CZ'), color: 'var(--ink)' },
      { label: 'Škodní průběh', value: (f.lossRatio ?? Math.round(f.claims / (f.vehicles || 1) * 100 * 4)) + ' %', color: lrColorFor(f.lossRatio ?? 50) },
      { label: 'Rizikové skóre', value: f.risk + '/100', color: riskColor(f.risk) },
    ]
    const tabsDef = [['overview', 'Přehled'], ['vehicles', 'Vozidla'], ['insurers', 'Pojistitelé'], ['insurance', 'Pojištění'], ['claims', 'Škody'], ['documents', 'Dokumenty'], ['analytics', 'Analytika'], ['timeline', 'Timeline']]
    const fleetTabs = tabsDef.map(([id, label]) => { const on = tab === id; return { label, onClick: () => setState({ fleetTab: id }), style: `padding:10px 14px;font-size:13.5px;font-weight:600;cursor:pointer;color:${on ? 'var(--blue-ink)' : 'var(--ink3)'};border-bottom:2px solid ${on ? 'var(--blue)' : 'transparent'};margin-bottom:-1px` } })
    const summary = [
      { label: 'Předepsané pojistné', value: (f.premium / 1000000).toFixed(2).replace('.', ',') + ' mil.', sub: 'ročně', color: 'var(--ink)' },
      { label: 'Pojistné události', value: String(f.claims), sub: 'za 12 měsíců', color: 'var(--ink)' },
      { label: 'Ø pojistné / vozidlo', value: Math.round(f.premium / (f.vehicles || 1)).toLocaleString('cs-CZ'), sub: 'Kč ročně', color: 'var(--ink)' },
      { label: 'Obnovy do 30 dnů', value: String(f.renewals), sub: 'smluv', color: 'var(--amber)' },
    ]
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
        rowStyle: `position:relative;z-index:${mo ? 30 : 'auto'};background:${mo ? '#FAFAFA' : 'transparent'};display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border)`,
        kebabStyle: `width:30px;height:30px;flex-shrink:0;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${mo ? 'var(--blue)' : 'var(--ink3)'};background:${mo ? 'var(--blue-soft)' : 'transparent'}`,
        toggleMenu: (e) => { e.stopPropagation(); setState((s) => ({ rowMenu: s.rowMenu === v.id ? null : v.id })) },
        changeCover: (e) => { e.stopPropagation(); setState({ rowMenu: null }); openVehicle(v.id); setState({ vehicleTab: 'insurance' }) },
        reportClaim: (e) => { e.stopPropagation(); setState({ rowMenu: null, claimWizard: true, claimStep: 1, claimData: { vehicleId: v.id } }) },
        unsubscribe: (e) => { e.stopPropagation(); openUnsub(v) },
      }
    })
    const fleetEnded = vehiclesData.filter((v) => v.fleet === f.id && v.status === 'ended').map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel,
      fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), endedDate: v.endedDate, endReason: v.endReason,
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
    const fleetClaims = claimsData.filter((c) => { const cv = vehiclesData.find((x) => x.id === c.vId); return cv && cv.fleet === f.id }).map(buildClaimRow)

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
        name: f.name, manager: f.manager, policy: f.policy || '—', policyStart: f.policyStart || '—', stats, summary, line: lp.line, area: lp.area, donut, insurerLegend, fuel, evPct, evDonut, claimBars, claims: f.claims,
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
      { value: vf.fleet, onChange: (e) => setVf('fleet', e.target.value), options: [{ v: 'all', l: 'Všechny parky' }, ...fleetsData.map((f) => ({ v: f.id, l: f.name }))] },
      { value: vf.brand, onChange: (e) => setVf('brand', e.target.value), options: opt('Všechny značky', [...new Set(vehiclesData.map((v) => v.brand))]) },
      { value: vf.fuel, onChange: (e) => setVf('fuel', e.target.value), options: opt('Palivo', [...new Set(vehiclesData.map((v) => v.fuel))]) },
      { value: vf.insurer, onChange: (e) => setVf('insurer', e.target.value), options: opt('Pojišťovna', [...new Set(vehiclesData.map((v) => v.insurer))]) },
      { value: vf.status, onChange: (e) => setVf('status', e.target.value), options: [{ v: 'all', l: 'Stav' }, { v: 'active', l: 'Aktivní' }, { v: 'soon', l: 'Brzy obnova' }, { v: 'overdue', l: 'Po splatnosti' }, { v: 'nocasco', l: 'Bez havarijního' }] },
    ]
    const q = vf.q.toLowerCase()
    const matchBase = (v) => {
      if (vf.fleet !== 'all' && v.fleet !== vf.fleet) return false
      if (vf.brand !== 'all' && v.brand !== vf.brand) return false
      if (vf.fuel !== 'all' && v.fuel !== vf.fuel) return false
      if (vf.insurer !== 'all' && v.insurer !== vf.insurer) return false
      if (q && !`${v.plate} ${v.brand} ${v.model} ${v.driver}`.toLowerCase().includes(q)) return false
      return true
    }
    const rows = vehiclesData.filter((v) => v.status !== 'ended' && matchBase(v) && (vf.status === 'all' || v.status === vf.status))
    const endedRows = vehiclesData.filter((v) => v.status === 'ended' && matchBase(v)).map((v) => ({
      id: v.id, plate: v.plate, brand: v.brand, model: v.model, driver: v.driver, year: v.year, fuel: v.fuel,
      fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), endedDate: v.endedDate, endReason: v.endReason,
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
        fleetName: fleetName(v.fleet), insurer: v.insurer, premiumF: czk(v.premium), renewal: v.renewal,
        statusLabel: statusMeta[v.status].label, chipStyle: statusChip(v.status),
        onClick: () => openVehicle(v.id),
        toggle: (e) => { e.stopPropagation(); toggleSel(v.id) },
        checkStyle: `width:18px;height:18px;border-radius:5px;border:1.5px solid ${on ? 'var(--blue)' : '#CFCFD4'};background:${on ? 'var(--blue)' : '#fff'};display:flex;align-items:center;justify-content:center;cursor:pointer;flex-shrink:0;color:#fff`,
        checkIcon: on ? ic('check', 12, 2.5) : null,
        menuOpen: mo, stop: (e) => e.stopPropagation(),
        rowStyle: `position:relative;z-index:${mo ? 30 : 'auto'};background:${mo ? '#FAFAFA' : 'transparent'};display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border)`,
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
      { k: 'Rok výroby', v: String(v.year) }, { k: 'Palivo', v: v.fuel }, { k: 'Nájezd', v: v.mileage },
      { k: 'Pojišťovna', v: v.insurer }, { k: 'Aktuální hodnota', v: v.value },
    ]
    const actions = [
      { label: 'Změnit park', icon: ic('transfer', 20), color: 'var(--blue)', onClick: () => openParkModal(v) },
      { label: 'Přiřadit řidiče', icon: ic('user1', 20), color: 'var(--blue)', onClick: () => openDriverModal(v) },
      { label: 'Odebrat', icon: ic('trash', 20), color: 'var(--star)', onClick: () => openUnsub(v) },
    ]
    const specs = [
      { k: 'Značka', v: v.brand }, { k: 'Model', v: v.model }, { k: 'VIN', v: v.vin }, { k: 'Číslo přihlášky', v: v.prihlaska },
      { k: 'Rok výroby', v: String(v.year) }, { k: 'Palivo', v: v.fuel }, { k: 'Nájezd', v: v.mileage }, { k: 'Účetní hodnota', v: v.value },
    ]
    const assign = [
      { k: 'Odpovědný řidič', v: v.driver, icon: ic('user1', 18), bg: 'var(--blue-soft)', color: 'var(--blue)' },
      { k: 'Vozový park', v: fleetName(v.fleet), icon: ic('fleets', 18), bg: '#F1F1F3', color: 'var(--ink2)' },
      { k: 'Lokalita', v: fleetName(v.fleet).split(' – ')[0], icon: ic('mapPin', 18), bg: 'var(--green-soft)', color: 'var(--green)' },
      { k: 'Fleet manager', v: fleetsData.find((f) => f.id === v.fleet).manager, icon: ic('users', 18), bg: 'var(--amber-soft)', color: 'var(--amber)' },
    ]
    const pchip = (s) => statusChip(s)
    const products = [
      { name: 'Povinné ručení', icon: ic('shield', 20), bg: 'var(--star-soft)', color: 'var(--star)', insurer: v.insurer, policy: 'PR-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.34)), coverage: '200 / 200 mil. Kč', renewal: v.renewal, deductible: '—', status: 'active' },
      { name: 'Havarijní pojištění', icon: ic('car', 20), bg: 'var(--star-soft)', color: 'var(--star)', insurer: v.insurer, policy: 'HAV-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.46)), coverage: 'All-risk', renewal: v.renewal, deductible: '5 % / min. 5 000', status: v.status === 'nocasco' ? 'nocasco' : 'active' },
      { name: 'Pojištění skel', icon: ic('glass', 20), bg: 'var(--blue-soft)', color: 'var(--blue)', insurer: v.insurer, policy: 'SKL-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.07)), coverage: 'do 30 000 Kč', renewal: v.renewal, deductible: '1 000 Kč', status: 'active' },
      { name: 'GAP pojištění', icon: ic('refresh', 20), bg: 'var(--green-soft)', color: 'var(--green)', insurer: v.insurer, policy: 'GAP-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.08)), coverage: 'pořizovací cena 5 let', renewal: v.renewal, deductible: '—', status: v.id === 'v9' || v.id === 'v16' ? 'nocasco' : 'active' },
      { name: 'Asistenční služby', icon: ic('wrench', 20), bg: 'var(--amber-soft)', color: 'var(--amber)', insurer: 'Global Assistance', policy: 'AS-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.03)), coverage: 'ČR + Evropa', renewal: v.renewal, deductible: '—', status: 'active' },
      { name: 'Právní ochrana', icon: ic('doc2', 20), bg: '#F1F1F3', color: 'var(--ink2)', insurer: 'D.A.S.', policy: 'PO-' + v.plate.replace(/\s/g, ''), premiumF: czk(Math.round(v.premium * 0.02)), coverage: 'do 1 mil. Kč', renewal: v.renewal, deductible: '—', status: 'active' },
    ].map((p) => ({ ...p, statusLabel: statusMeta[p.status].label, chipStyle: pchip(p.status) }))
    const productsTotal = products.filter((p) => p.status !== 'nocasco').reduce((s, p) => s + parseInt(String(p.premiumF).replace(/[^\d]/g, ''), 10), 0)
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
      { name: `Zelená karta ${plateNo}.pdf`, type: 'Zelená karta', meta: `${v.insurer} · platná do 31. 12. 2026`, size: '94 kB', icon: ic('doc2', 17), bg: 'var(--green-soft)', color: 'var(--green)', preview: prev, download: dl, openPreview: open({ kind: 'zk', name: `Zelená karta ${plateNo}.pdf`, type: 'Zelená karta', size: '94 kB', insurer: v.insurer, plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, validFrom: '1. 1. 2026', validTo: '31. 12. 2026' }) },
      { name: `Technický průkaz ${plateNo}.pdf`, type: 'Osvědčení o registraci vozidla', meta: 'ORV část I · velký TP', size: '118 kB', icon: ic('car', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', preview: prev, download: dl, openPreview: open({ kind: 'orv', name: `Technický průkaz ${plateNo}.pdf`, type: 'Osvědčení o registraci vozidla', size: '118 kB', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, year: v.year, fuel: v.fuel }) },
      { name: `STK a emise ${plateNo}.pdf`, type: 'Protokol STK', meta: 'platná do 5. 2. 2028', size: '88 kB', icon: ic('check2', 17), bg: 'var(--green-soft)', color: 'var(--green)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `STK a emise ${plateNo}.pdf`, type: 'Protokol STK', size: '88 kB', title: 'Protokol o technické prohlídce a měření emisí', issuer: 'Stanice technické kontroly', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--green)', rows: [['Evidenční číslo', 'STK-' + plateNo], ['Datum prohlídky', '5. 2. 2026'], ['Platnost do', '5. 2. 2028'], ['Výsledek', 'Způsobilé k provozu'], ['Stav tachometru', v.mileage], ['Měření emisí', 'Vyhovuje']] }) },
      { name: `Dálniční známka ${plateNo}.pdf`, type: 'Dálniční známka', meta: 'roční · ČR · 2026', size: '42 kB', icon: ic('calendar', 17), bg: 'var(--amber-soft)', color: 'var(--amber)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Dálniční známka ${plateNo}.pdf`, type: 'Dálniční známka', size: '42 kB', title: 'Elektronická dálniční známka (e-známka)', issuer: 'Státní fond dopravní infrastruktury', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--amber)', rows: [['Typ kupónu', 'Roční (12 měsíců)'], ['Platnost od', '1. 1. 2026'], ['Platnost do', '31. 1. 2027'], ['Země platnosti', 'Česká republika'], ['Cena', '2 440 Kč'], ['Stav', 'Aktivní']] }) },
      { name: `Servisní kniha ${plateNo}.pdf`, type: 'Servisní historie', meta: 'poslední servis 12. 3. 2026', size: '156 kB', icon: ic('wrench', 17), bg: '#F1F1F3', color: 'var(--ink2)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Servisní kniha ${plateNo}.pdf`, type: 'Servisní historie', size: '156 kB', title: 'Servisní kniha vozidla', issuer: 'Louda Auto a.s. — autorizovaný servis', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--ink2)', rows: [['Poslední servis', '12. 3. 2026'], ['Stav tachometru', v.mileage], ['Provedené úkony', 'Výměna oleje a filtrů'], ['Příští servis', 'za 15 000 km'], ['Záruka', 'do ' + (v.year + 5)], ['Servisní partner', 'Louda Auto a.s.']] }) },
      { name: `Leasingová smlouva ${plateNo}.pdf`, type: 'Financování', meta: 'operativní leasing', size: '198 kB', icon: ic('banknote', 17), bg: 'var(--blue-soft)', color: 'var(--blue)', preview: prev, download: dl, openPreview: open({ kind: 'vehdoc', name: `Leasingová smlouva ${plateNo}.pdf`, type: 'Financování', size: '198 kB', title: 'Smlouva o operativním leasingu', issuer: 'ČSOB Leasing, a.s.', plate: v.plate, vin: v.vin, brand: v.brand, model: v.model, accent: 'var(--blue)', rows: [['Číslo smlouvy', 'LE-' + plateNo], ['Typ financování', 'Operativní leasing'], ['Měsíční splátka', '12 900 Kč'], ['Doba trvání', '48 měsíců'], ['Konec leasingu', '31. 3. 2028'], ['Účetní hodnota', v.value]] }) },
    ]
    const mgr = fleetsData.find((f) => f.id === v.fleet).manager
    const mgrInit = mgr.replace(/\b\wng?\.\s*/gi, '').trim().split(/\s+/).map((w) => w[0]).join('').slice(0, 2).toUpperCase()
    const seedNotes = [
      { text: `Vozidlo předáno řidiči ${v.driver} — plná nádrž, 2 ks klíčů, čistý interiér, bez závad.`, author: mgr, initials: mgrInit || 'FM', date: '18. 11. 2025', time: '09:24' },
      { text: 'Při přebírce zaevidován drobný odřený zadní nárazník — bez nároku na pojistné plnění.', author: 'Martin Kovář', initials: 'MK', date: '3. 4. ' + v.year, time: '14:10' },
    ]
    const notes = [...(state.vehNotes[v.id] || []), ...seedNotes]
    const tabsDef = [['overview', 'Přehled'], ['insurance', 'Pojištění'], ['claims', 'Škody'], ['documents', 'Dokumenty'], ['timeline', 'Timeline'], ['costs', 'Náklady'], ['notes', 'Poznámky']]
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
        statusLabel: m.label, chipStyle: statusChip(v.status), facts, actions, specs, assign, products, productsExport, productsTotalF: czk(productsTotal), claims, timeline, vehicleDocs, notes, openNoteModal: () => openNoteModal(v),
        premiumF: czk(v.premium), productCount: products.filter((p) => p.status !== 'nocasco').length, renewal: v.renewal,
        isOverview: tab === 'overview', isInsurance: tab === 'insurance', isClaims: tab === 'claims', isTimeline: tab === 'timeline',
        isNotes: tab === 'notes', isCosts: tab === 'costs', openCostModal: () => openCostModal(v),
        isVehDocs: tab === 'documents',
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
    return { contracts, insStats, insExport }
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
    const claimStats = [
      { label: 'Otevřené události', value: '9', color: 'var(--star)' },
      { label: 'Uzavřené (rok)', value: '47', color: 'var(--ink)' },
      { label: 'Ø doba likvidace', value: '18 dní', color: 'var(--ink)' },
      { label: 'Náklady (rok)', value: '1,24 mil.', color: 'var(--ink)' },
    ]
    const cf = [['Praha – Centrála', 12, '#2058C9'], ['Dlouhodobý pronájem', 15, '#3A7BE0'], ['Brno – Pobočka', 9, '#16A34A'], ['Ml. Boleslav', 7, '#C2780C'], ['Servisní vozy', 4, '#8B5CF6'], ['Management', 1, '#A1A1AA']]
    const cfMax = Math.max(...cf.map((x) => x[1]))
    const claimsByFleet = cf.map(([name, count, color]) => ({ name, count, color, w: Math.round(count / cfMax * 100) + '%' }))
    const ct = [5, 4, 6, 3, 5, 4, 7, 4, 6, 3, 4, 2]; const ctMax = Math.max(...ct)
    const claimTrend = ct.map((v, i) => ({ h: Math.round(v / ctMax * 100) + '%', color: i >= 10 ? 'var(--star)' : '#E3B7BE', label: MONTHS[i][0] }))
    const claimRows = claimsData.map(buildClaimRow)
    const claimsExport = { filename: 'skody', title: 'Škody', columns: CLAIM_EXPORT_COLS, rows: claimRows.map(claimExportRow) }
    return { claimStats, claimsByFleet, claimTrend, claimRows, claimsExport }
  }

  const documentsVM = () => {
    if (state.route !== 'documents') return {}
    const F = (name, count, icon, bg, color, onClick) => ({ name, count, icon: ic(icon, 18), bg, color, onClick, nav: !!onClick })
    const docFolders = [
      F('Pojistné smlouvy', 1174, 'shield', 'var(--star-soft)', 'var(--star)', () => navigate('documents-detail', { docCat: 'smlouvy', docOpen: {} })),
      F('Zelené karty', 312, 'doc2', 'var(--green-soft)', 'var(--green)', () => navigate('documents-detail', { docCat: 'zk', docOpen: {} })),
      F('Technické průkazy', 312, 'file', 'var(--blue-soft)', 'var(--blue)', () => navigate('documents-detail', { docCat: 'orv', docOpen: {} })),
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

  const analyticsVM = () => {
    if (state.route !== 'analytics') return {}
    const anStats = [
      { label: 'TCO flotily (rok)', value: '31,4 mil.', delta: '▼ 6 % r/r', dColor: 'var(--green)' },
      { label: 'Náklady na škody', value: '1,24 mil.', delta: '▼ 14 % r/r', dColor: 'var(--green)' },
      { label: 'Frekvence škod', value: '7,4 %', delta: '▼ 1,2 pb', dColor: 'var(--green)' },
      { label: 'Ø oprava', value: '43 200 Kč', delta: '▲ 4 % r/r', dColor: 'var(--star)' },
    ]
    const ins = [1.05, 1.07, 1.09, 1.10, 1.13, 1.15, 1.18, 1.17, 1.20, 1.22, 1.21, 1.24]
    const rep = [0.12, 0.08, 0.15, 0.05, 0.11, 0.07, 0.18, 0.09, 0.14, 0.06, 0.10, 0.05]
    const mx = Math.max(...ins.map((v, i) => v + rep[i]))
    const anBars = ins.map((v, i) => ({ label: MONTHS[i], h1: Math.round(v / mx * 100) + '%', h2: Math.round(rep[i] / mx * 100) + '%' }))
    const anYears = [{ year: '2024', value: '34,8 mil.', w: '100%', color: '#A1A1AA' }, { year: '2025', value: '33,2 mil.', w: '95%', color: '#3A7BE0' }, { year: '2026', value: '31,4 mil.', w: '90%', color: 'var(--green)' }]
    const anMini = [
      { title: 'Úspora vs. trh', value: '12,4 %', sub: 'pod průměrem segmentu', w: '78%', color: 'var(--green)' },
      { title: 'Bonus / malus', value: '+8 stupňů', sub: 'průměr flotily', w: '82%', color: 'var(--blue)' },
      { title: 'Elektrifikace', value: '22 %', sub: 'cíl 35 % do 2028', w: '62%', color: 'var(--green)' },
    ]
    return { anStats, anBars, anYears, anMini }
  }

  const contactsVM = () => {
    if (state.route !== 'contacts') return {}
    const init = (n) => n.split(' ').map((x) => x[0]).slice(0, 2).join('')
    const P = (name, role, phone, email, bg, color) => ({ name, role, phone, email, initials: init(name), bg, color, phoneIcon: ic('phone', 14), mailIcon: ic('file', 14) })
    const contactGroups = [
      { name: 'Fleet manažeři', people: fleetsData.map((f, i) => P(f.manager, f.name, '+420 ' + (602 + i) + ' 1' + (20 + i) + ' ' + (300 + i * 7), f.manager.toLowerCase().replace(/[^a-z]/g, '.') + '@loudaauto.cz', 'var(--blue-soft)', 'var(--blue)')) },
      { name: 'Makléři & poradci', people: [P('Robert Harlas', 'Odpovědný makléř · IS Group, spol. s r.o.', '+420 777 123 456', 'robert.harlas@isgroup.cz', 'var(--star-soft)', 'var(--star)'), P('Petra Veselá', 'Account manager · STAR', '+420 605 998 112', 'petra.vesela@star.cz', 'var(--star-soft)', 'var(--star)')] },
      { name: 'Servisy & opravny', people: [P('AutoCentrum Praha', 'Autorizovaný servis', '+420 244 010 200', 'servis@acpraha.cz', 'var(--green-soft)', 'var(--green)'), P('AutoSklo Express', 'Opravy skel', '+420 800 100 200', 'info@autosklo.cz', 'var(--green-soft)', 'var(--green)'), P('Servis MB Brno', 'Karosárna', '+420 545 221 330', 'brno@servismb.cz', 'var(--green-soft)', 'var(--green)')] },
      { name: 'Likvidátoři & asistence', people: [P('Pavel Říha', 'Likvidátor · Kooperativa', '+420 957 105 105', 'p.riha@koop.cz', 'var(--amber-soft)', 'var(--amber)'), P('Global Assistance', 'Asistenční linka 24/7', '1220', 'dispecink@1220.cz', 'var(--amber-soft)', 'var(--amber)'), P('Nouzová linka', 'Havárie & odtah', '+420 800 124 124', 'sos@loudaauto.cz', 'var(--star-soft)', 'var(--star)')] },
    ]
    return { contactGroups }
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
    return { settingRows }
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
    const fieldVals = [
      ['Značka', 'Škoda', 1], ['Model', 'Octavia Combi', 1], ['Rok výroby', '2023', 1],
      ['Palivo', 'Diesel', 1], ['Objem / výkon', '1 968 cm³ / 110 kW', 1], ['Převodovka', 'Automat DSG', 1],
      ['SPZ', loaded.plate, 0], ['VIN', loaded.vin, 1], ['Hodnota vozidla', '640 000 Kč', 0],
    ]
    const fields = fieldVals.map(([label, value, locked]) => ({ label, value, bg: locked ? '#F7F8FA' : '#fff' }))
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
        stepLabel: done ? 'Hotovo' : `Krok ${step} ze 3 · ${labels[step - 1]}`, steps,
        s1: step === 1, s2: step === 2, s3: step === 3, isDone: done,
        methods, isUpload: m === 'doklad', isField: m !== 'doklad',
        fieldBadge: m === 'vin' ? 'VIN' : 'CZ', fieldPlaceholder: m === 'vin' ? 'Zadejte VIN' : 'Zadejte SPZ',
        onInput: (e) => setState({ avInput: e.target.value }),
        load: () => setState({ avLoaded: true, avStep: 2 }), loadLabel: 'Načíst z registru',
        uploadIcon: ic('upload', 22), infoIcon: ic('info', 16), checkBadge: ic('check', 16, 2.5),
        bigCar: ic('car', 26), bigCheck: ic('check', 30, 2.5),
        loaded, fields, covers, coverCount, estimate,
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

  const vm = {
    ...shellVM(), ...dashboardVM(), ...fleetsVM(), ...fleetDetailVM(), ...vehiclesVM(), ...vehicleDetailVM(),
    ...insuranceVM(), ...insuranceDetailVM(), ...claimsVM(), ...claimDetailVM(), ...documentsVM(), ...documentsDetailVM(), ...analyticsVM(), ...contactsVM(), ...settingsVM(), ...bonifikaceVM(), ...bonifikaceDetailVM(), ...wizardVM(), ...addVehicleVM(),
  }

  return <Render vm={vm} />
}
