/**
 * Účetnictví dopravce ČSAD AUTOBUSY České Budějovice a.s. (majitel a účetní).
 * Převzato z Frenkee CRM (accounting.ts) a přizpůsobeno autobusové dopravě:
 * vydané doklady v číselných řadách (FV = faktury: vyúčtování výkonů objednatelům, zájezdy, reklama;
 * VP/PF/ZF/OB/OD/PD/DD), náklady (faktury ze schránky faktury@, účtenky drag & drop, AI předkontace),
 * banka (API nebo import výpisu, párování dle VS, nesrovnalosti), měsíční uzávěrka s DPH a kontrolním
 * hlášením (XML pro EPO), kontrola vedení (čtyři oči), cashflow a podklady k DPPO.
 * Demo: data se generují deterministicky, akce drží stav v paměti relace.
 */

export const TODAY = new Date(2026, 10, 5, 9, 0)
export const COMPANY = {
  name: 'ČSAD AUTOBUSY České Budějovice a.s.',
  ico: '26060451',
  dic: 'CZ26060451',
  vatPayer: true,
  vatPeriod: 'měsíční',
  address: 'Žižkova tř. 1321/1, 370 01 České Budějovice',
  dataBox: 'q4ucsad',
  taxOffice: 'Finanční úřad pro Jihočeský kraj, ÚzP v Českých Budějovicích',
  registration: 'zapsána v obchodním rejstříku vedeném Krajským soudem v Českých Budějovicích',
}

export const ACCOUNTS = [
  { id: 'csob', label: 'Provozní účet', bank: 'ČSOB', number: '217845612/0300', mode: 'API', balance: 0, lastSync: new Date(+TODAY - 25 * 60000), purpose: 'úhrady od objednatelů, náklady, mzdy, leasing' },
  { id: 'kb', label: 'Tržbový účet', bank: 'Komerční banka', number: '115-4420380227/0100', mode: 'Výpis', balance: 0, lastSync: new Date(2026, 10, 1, 8, 10), purpose: 'tržby z jízdného a odbavovacího systému, zájezdy' },
]

export const DOC_TYPES = {
  faktura: { label: 'Faktura (daňový doklad)', short: 'Faktura', series: 'FV', tax: true, desc: 'Vyúčtování dopravních výkonů objednateli, zájezdy (12 %), reklama na vozech a pronájmy (21 %).' },
  vyzva: { label: 'Výzva k platbě', short: 'Výzva', series: 'VP', tax: false, desc: 'Není daňový doklad; po úhradě se vystaví daňový doklad k platbě.' },
  proforma: { label: 'Proforma faktura', short: 'Proforma', series: 'PF', tax: false, desc: 'Nabídka platby před plněním (typicky zájezd), neúčtuje se.' },
  zalohova: { label: 'Zálohová faktura', short: 'Záloha', series: 'ZF', tax: false, desc: 'Po přijetí zálohy vzniká daňový doklad k přijaté platbě.' },
  objednavka: { label: 'Objednávka', short: 'Objednávka', series: 'OB', tax: false, desc: 'Objednávka u dodavatele (díly, servis), páruje se s přijatou fakturou.' },
  opravny: { label: 'Opravný daňový doklad (dobropis)', short: 'Dobropis', series: 'OD', tax: true, desc: 'Oprava základu daně k původní faktuře; zaplacená faktura se nestornuje, dobropisuje se.' },
  prijmovy: { label: 'Příjmový pokladní doklad', short: 'Příjmový', series: 'PD', tax: false, desc: 'Hotovostní příjem do pokladny (doplatky, pokladna informační kanceláře).' },
  danovy: { label: 'Daňový doklad k přijaté platbě', short: 'DD k platbě', series: 'DD', tax: true, desc: 'Vystavuje se do 15 dnů po přijetí zálohy nebo platby na výzvu.' },
}
export const PAYMENT_METHODS = ['Bankovní převod', 'Hotově', 'Kartou', 'Inkaso z účtu']

export const CHART = [
  { account: '221', name: 'Bankovní účty', type: 'aktivum' },
  { account: '311', name: 'Pohledávky z obchodních vztahů', type: 'aktivum' },
  { account: '321', name: 'Závazky z obchodních vztahů', type: 'pasivum' },
  { account: '343', name: 'DPH', type: 'pasivum' },
  { account: '501', name: 'Spotřeba materiálu (PHM, náhradní díly, pneumatiky)', type: 'náklad' },
  { account: '502', name: 'Spotřeba energie (vozovna, nabíjení)', type: 'náklad' },
  { account: '511', name: 'Opravy a udržování (externí servis)', type: 'náklad' },
  { account: '512', name: 'Cestovné', type: 'náklad' },
  { account: '513', name: 'Náklady na reprezentaci (daňově neuznatelné)', type: 'náklad' },
  { account: '518', name: 'Ostatní služby (leasing, software, telematika, nájem)', type: 'náklad' },
  { account: '521', name: 'Mzdové náklady', type: 'náklad' },
  { account: '524', name: 'Zákonné sociální a zdravotní pojištění', type: 'náklad' },
  { account: '538', name: 'Ostatní daně a poplatky (mýto, dálniční známky, silniční daň)', type: 'náklad' },
  { account: '548', name: 'Ostatní provozní náklady (pojištění vozidel)', type: 'náklad' },
  { account: '602', name: 'Tržby z prodeje služeb (doprava, zájezdy, reklama)', type: 'výnos' },
  { account: '648', name: 'Ostatní provozní výnosy (kompenzace a dotace objednatelů)', type: 'výnos' },
]

/* ------------------------------------------------------------------ */
const hashOf = (s) => { let h = 2166136261; s = String(s); for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) } return h >>> 0 }
const key = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`
const dt = (y, m, d, h = 9) => new Date(y, m - 1, d, h, 0)
const round = (n, to = 1) => Math.round(n / to) * to
const DAY = 86400000
export const monthLabel = (k) => { const [y, m] = k.split('-').map(Number); return `${['leden', 'únor', 'březen', 'duben', 'květen', 'červen', 'červenec', 'srpen', 'září', 'říjen', 'listopad', 'prosinec'][m - 1]} ${y}` }
export const CURRENT = key(TODAY)
export const MONTHS_2026 = Array.from({ length: TODAY.getMonth() + 1 }, (_, i) => `2026-${String(i + 1).padStart(2, '0')}`)
export const fmtDate = (d) => d ? `${d.getDate()}. ${d.getMonth() + 1}. ${d.getFullYear()}` : '—'
export const fmtTime = (d) => d ? `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}` : ''
export const kc = (n) => `${Math.round(n).toLocaleString('cs-CZ')} Kč`
export const inMonth = (d, m) => key(d) === m
const now = () => new Date(+TODAY + (Date.now() % 3600000))

const store = {
  seeded: false, version: 0,
  invoices: [], expenses: [], txs: [], closes: new Map(), events: [],
  seq: { FV: 0, VP: 0, PF: 0, ZF: 0, OB: 0, OD: 0, PD: 0, DD: 0 },
  payroll: { net: 0, levies: 0 },
}
export const accVersion = () => store.version
const emit = () => { store.version++ }
const log = (who, text, at = now()) => store.events.push({ id: `ae${store.events.length}`, at, who, text })

function nextNumber(series, issued) { store.seq[series]++; return `${series}-${issued.getFullYear()}-${String(store.seq[series]).padStart(4, '0')}` }
const vsOf = (number) => number.replace(/\D/g, '')
const vatOf = (base, rate) => Math.round(base * (rate / 100))
function summarize(items) {
  const by = new Map()
  for (const it of items) { const r = by.get(it.vatRate) || { rate: it.vatRate, base: 0, vat: 0 }; r.base += it.amount; r.vat += vatOf(it.amount, it.vatRate); by.set(it.vatRate, r) }
  const vatSummary = [...by.values()].sort((a, b) => b.rate - a.rate)
  const base = vatSummary.reduce((s, r) => s + r.base, 0)
  const vat = vatSummary.reduce((s, r) => s + r.vat, 0)
  const dominant = ([...vatSummary].sort((a, b) => b.base - a.base)[0] || { rate: 0 }).rate
  return { vatSummary, base, vat, total: base + vat, vatRate: dominant }
}
export const item = (text, amount, vatRate, qty = 1, unit = 'ks') => ({ text, qty, unit, unitPrice: Math.round(amount / qty), vatRate, amount })
function postingOf(docType, vat, kompenzace) {
  if (kompenzace) return '311 / 648 (kompenzace objednatele, mimo předmět DPH)'
  if (docType === 'opravny') return '602 / 311 (snížení výnosu), DPH 343 / 311'
  if (docType === 'danovy') return '324 / 602 (zúčtování zálohy), DPH 324 / 343'
  if (['zalohova', 'proforma', 'vyzva', 'objednavka'].includes(docType)) return 'neúčtuje se (až platba 221 / 324)'
  if (docType === 'prijmovy') return '211 / 602'
  return vat ? '311 / 602, DPH 311 / 343' : '311 / 602 (osvobozeno)'
}
function addInvoice(x) {
  const number = nextNumber(x.series, x.issued)
  const sum = summarize(x.items)
  const inv = { ...x, ...sum, id: `inv${store.invoices.length + 1}`, number, vs: vsOf(number), duzp: x.duzp || x.issued, paymentMethod: x.paymentMethod || 'Bankovní převod', currency: x.currency || 'CZK', posting: postingOf(x.docType, sum.vat, x.kompenzace) }
  store.invoices.push(inv)
  return inv
}
function addExpense(x) {
  const vat = Math.round(x.base * (x.vatRate / 100))
  const e = { ...x, id: `ex${store.expenses.length + 1}`, vat, total: x.base + vat, posting: `${x.account} / 321${x.vatRate ? ', DPH 343 / 321' : ''}` }
  store.expenses.push(e)
  return e
}
function addTx(x) { const t = { ...x, id: `tx${store.txs.length + 1}` }; store.txs.push(t); return t }

/* Pravidelné náklady dopravce: faktury ze schránky faktury@csadbus.cz */
const EXPENSE_RULES = [
  { supplier: 'ČEPRO a.s. (palivová karta)', ico: '60193531', category: 'Pohonné hmoty', account: '501', vatRate: 21, monthly: 1_820_000, day: 4 },
  { supplier: 'Iveco Czech Republic a.s.', ico: '48171131', category: 'Náhradní díly', account: '501', vatRate: 21, monthly: 186_000, day: 7 },
  { supplier: 'SOR Libchavy spol. s r.o.', ico: '15030865', category: 'Náhradní díly', account: '501', vatRate: 21, monthly: 74_000, day: 9 },
  { supplier: 'Continental Barum s.r.o.', ico: '45788235', category: 'Pneumatiky', account: '501', vatRate: 21, monthly: 96_000, day: 11 },
  { supplier: 'ČSOB Leasing a.s.', ico: '63998980', category: 'Leasing autobusů', account: '518', vatRate: 21, monthly: 642_000, day: 15 },
  { supplier: 'Petrisk a.s. (pojištění flotily)', ico: '25680951', category: 'Pojištění vozidel', account: '548', vatRate: 0, monthly: 1_394_000, day: 1 },
  { supplier: 'CzechToll s.r.o. (mýto)', ico: '06315160', category: 'Mýto a poplatky', account: '538', vatRate: 0, monthly: 38_000, day: 6 },
  { supplier: 'E.ON Energie a.s. (vozovna)', ico: '26078201', category: 'Energie', account: '502', vatRate: 21, monthly: 58_000, day: 18 },
  { supplier: 'Telematika Fleet s.r.o.', ico: '09432110', category: 'Telematika a software', account: '518', vatRate: 21, monthly: 46_000, day: 3 },
  { supplier: 'Autoservis Bosch Car Service ČB', ico: '28112233', category: 'Externí servis', account: '511', vatRate: 21, monthly: 112_000, day: 20 },
  { supplier: 'Účetní kancelář Jihočeská s.r.o.', ico: '08122334', category: 'Účetní a daňové služby', account: '518', vatRate: 21, monthly: 24_500, day: 10 },
]
const RECEIPTS = [
  ['Shell Czech Republic', 'Pohonné hmoty', '501', 21, 2_640, 'dotankování zájezd Praha, vůz 5Z64073'],
  ['ASFINAG (dálniční známka AT)', 'Mýto a poplatky', '538', 0, 1_180, 'zájezd Linz, 10denní známka'],
  ['Myčka Autobusy ČB', 'Externí servis', '511', 21, 890, 'mytí vozu před zájezdem'],
  ['Alza.cz', 'Kancelářské potřeby a IT', '501', 21, 3_290, 'tablet pro dispečink'],
  ['Restaurace U Malše', 'Reprezentace', '513', 12, 1_420, 'oběd s objednatelem JIKORD, daňově neuznatelné'],
  ['Autodíly Pešek', 'Náhradní díly', '501', 21, 2_150, 'žárovky, stěrače, drobný materiál'],
  ['České dráhy', 'Cestovné', '512', 12, 418, 'jízdenka řidiče na střídání v J. Hradci'],
  ['Bolt', 'Cestovné', '512', 21, 310, 'odvoz řidiče po noční'],
]

/** Odběratelé dopravce (objednatelé a zákazníci) */
export const CUSTOMERS = [
  { id: 'c1', name: 'JIKORD s.r.o. (koordinátor Jihočeského kraje)', ico: '28117018', address: 'Okružní 517/10, 370 01 České Budějovice', kind: 'objednatel' },
  { id: 'c2', name: 'Statutární město České Budějovice', ico: '00244732', address: 'nám. Přemysla Otakara II. 1/1, 370 92 České Budějovice', kind: 'objednatel' },
  { id: 'c3', name: 'Město Trhové Sviny', ico: '00245551', address: 'Žižkovo nám. 32, 374 01 Trhové Sviny', kind: 'objednatel' },
  { id: 'c4', name: 'ZŠ Máj I, České Budějovice', ico: '62537741', address: 'M. Chlajna 21, 370 05 České Budějovice', kind: 'zákazník' },
  { id: 'c5', name: 'FK Dynamo České Budějovice a.s.', ico: '25187465', address: 'Střelecký ostrov 3, 370 21 České Budějovice', kind: 'zákazník' },
  { id: 'c6', name: 'ENGEL strojírenská spol. s r.o.', ico: '49060228', address: 'Pod Stráží 630, 382 41 Kaplice', kind: 'zákazník' },
  { id: 'c7', name: 'Budějovický Budvar, n. p.', ico: '00514152', address: 'Karoliny Světlé 512/4, 370 04 České Budějovice', kind: 'zákazník' },
  { id: 'c8', name: 'Jihočeská univerzita v Českých Budějovicích', ico: '60076658', address: 'Branišovská 1645/31a, 370 05 České Budějovice', kind: 'zákazník' },
  { id: 'c9', name: 'Outdoor Media CZ s.r.o. (reklama)', ico: '27187541', address: 'Rohanské nábř. 678/23, 186 00 Praha 8', kind: 'zákazník' },
]
const custById = (id) => CUSTOMERS.find((c) => c.id === id)

/* ------------------------------------------------------------------ */
/* Seed                                                                */
/* ------------------------------------------------------------------ */
export function seedAccounting(opts = {}) {
  if (store.seeded) return
  store.seeded = true
  const y = 2026
  const months = MONTHS_2026
  const lines = opts.lines || []
  store.payroll = { net: opts.payrollNet || 3_120_000, levies: opts.payrollLevies || 1_860_000 }
  const by = 'Lenka Nováková'

  /* 1) vyúčtování výkonů objednatelům: měsíčně za každou linku (kompenzace mimo DPH) */
  for (const m of months) {
    if (m === months[0] || m === CURRENT) continue // vyúčtování se vystavuje měsíc po výkonu; aktuální měsíc řeší modul Vyúčtování výkonů
    const [yy, mm] = m.split('-').map(Number)
    const svc = `${yy}-${String(mm - 1).padStart(2, '0')}` // měsíc výkonu
    const groups = { c1: [], c2: [] }
    lines.forEach((l) => { const isMhd = l.agency && l.agency.includes('Dopravní podnik'); groups[isMhd ? 'c2' : 'c1'].push(l) })
    for (const cid of ['c1', 'c2']) {
      if (!groups[cid].length) continue
      const c = custById(cid)
      const issued = dt(yy, mm, 3 + (cid === 'c2' ? 2 : 0))
      const due = new Date(+issued + 30 * DAY)
      const items = groups[cid].map((l) => {
        const kmTrip = 6 + (hashOf(l.id + 'km') % 18) + (l.no === '300' ? 42 : 0)
        const km = Math.round(l.tripsDay * kmTrip * 26 * (0.97 + (hashOf(l.id + svc) % 5) / 100))
        const sazba = 41 + (hashOf(l.id + 's') % 6), fare = 11 + (hashOf(l.id + 'f') % 7)
        return item(`Kompenzace prokazatelné ztráty, linka ${l.no} ${l.name}, ${monthLabel(svc)} (${km.toLocaleString('cs-CZ')} km × ${sazba - fare} Kč)`, km * (sazba - fare), 0, km, 'km')
      })
      const inv = addInvoice({ docType: 'faktura', series: 'FV', clientId: cid, customer: c.name, ico: c.ico, dic: `CZ${c.ico}`, address: c.address, issued, due, items, status: 'Vystaveno', kompenzace: true, by, serviceMonth: svc,
        note: `Vyúčtování prokazatelné ztráty za ${monthLabel(svc)} ze závazku veřejné služby podle zákona č. 194/2010 Sb.; není úplatou za zdanitelné plnění.` })
      const h = hashOf(inv.id)
      const late = m === CURRENT ? true : h % 100 < 8
      if (!late) {
        const paidAt = new Date(+due - (h % 12) * DAY)
        const tx = addTx({ accountId: 'csob', at: paidAt, amount: inv.total, counterparty: c.name, counterAccount: `${100_000_000 + (hashOf(c.ico) % 899_999_999)}/0100`, vs: inv.vs, message: `Kompenzace ${inv.number}`, invoiceId: inv.id, kind: 'Kompenzace objednatele' })
        inv.status = 'Zaplaceno'; inv.paidAt = paidAt; inv.txId = tx.id
      } else if (due < TODAY) inv.status = 'Po splatnosti'
    }
  }
  /* 2) běžné faktury: zájezdy (12 %), reklama na autobusech (21 %), pronájem vozu s řidičem (12 %) */
  const FV_ITEMS = [
    ['Zájezdová doprava ČB – Praha ZOO – ČB, 1 autobus, 320 km / 11 h', 18_280, 12, 'c4'],
    ['Pronájem autobusu s řidičem, zápas Plzeň, 280 km / 9 h', 15_920, 12, 'c5'],
    ['Reklamní plocha na zadním čele 6 autobusů MHD, měsíční pronájem', 54_000, 21, 'c9'],
    ['Smluvní doprava zaměstnanců Kaplice – závod, měsíční paušál', 86_400, 12, 'c6'],
    ['Zájezd Vídeň a zpět, 1 autobus, 460 km / 14 h', 24_740, 12, 'c8'],
    ['Celopolep autobusu linky 300, 12 měsíců (poměrná část)', 32_000, 21, 'c7'],
    ['Transfer zaměstnanců Linz, 160 km / 6 h', 10_100, 12, 'c6'],
  ]
  let fi = 0
  for (const m of months) {
    const [yy, mm] = m.split('-').map(Number)
    const n = 2 + (hashOf(m + 'fv') % 2)
    for (let k = 0; k < n; k++) {
      const [text, amount, vatRate, cid] = FV_ITEMS[fi % FV_ITEMS.length]; fi++
      const c = custById(cid)
      const issued = dt(yy, mm, 6 + k * 8)
      const due = new Date(+issued + 14 * DAY)
      const inv = addInvoice({ docType: 'faktura', series: 'FV', clientId: cid, customer: c.name, ico: c.ico, dic: `CZ${c.ico}`, address: c.address, issued, due, items: [item(text, amount, vatRate)], status: 'Vystaveno', by })
      const h = hashOf(inv.id)
      if (m !== CURRENT ? h % 100 < 92 : h % 100 < 30) {
        const paidAt = new Date(+due - (h % 10) * DAY)
        const tx = addTx({ accountId: vatRate === 21 ? 'csob' : 'kb', at: paidAt, amount: inv.total, counterparty: inv.customer, counterAccount: `${100_000_000 + (hashOf(inv.ico) % 899_999_999)}/0100`, vs: inv.vs, message: inv.number, invoiceId: inv.id, kind: 'Platba odběratele' })
        inv.status = 'Zaplaceno'; inv.paidAt = paidAt; inv.txId = tx.id
      } else if (due < TODAY) inv.status = 'Po splatnosti'
    }
  }
  /* 3) tržby z jízdného (odbavovací systém) na tržbový účet, týdně */
  for (const m of months) {
    const [yy, mm] = m.split('-').map(Number)
    for (const d of [7, 14, 21, 28]) {
      const at = dt(yy, mm, d, 6)
      if (at > TODAY) continue
      addTx({ accountId: 'kb', at, amount: round(640_000 * (0.9 + (hashOf(m + d) % 21) / 100), 100), counterparty: 'Odbavovací systém (Mikroelektronika)', counterAccount: 'zúčtování tržeb', vs: `${yy}${String(mm).padStart(2, '0')}${d}`, message: `Tržby z jízdného, týden do ${d}. ${mm}.`, kind: 'Tržby jízdné' })
    }
  }
  /* 4) náklady: pravidelné faktury + účtenky; mzdy a odvody; DPH */
  for (const m of months) {
    const [yy, mm] = m.split('-').map(Number)
    for (const r of EXPENSE_RULES) {
      const received = dt(yy, mm, r.day)
      if (received > TODAY) continue
      const h = hashOf(r.supplier + m)
      const base = round(r.monthly * (0.94 + (h % 13) / 100), 10)
      const due = new Date(+received + 14 * DAY)
      const e = addExpense({ kind: 'Faktura', supplier: r.supplier, ico: r.ico, number: `${yy}${String(mm).padStart(2, '0')}${String(100 + (h % 900))}`, received, due, base, vatRate: r.vatRate, category: r.category, account: r.account, source: 'E-mail faktury@', note: '', status: m === CURRENT && h % 100 < 35 ? 'K zaúčtování' : 'Zaúčtováno', ai: true, file: `${r.supplier.split(' ')[0].toLowerCase()}-${m}.pdf` })
      const paidAt = new Date(+due - (h % 6) * DAY)
      if (paidAt <= TODAY) {
        const tx = addTx({ accountId: 'csob', at: paidAt, amount: -e.total, counterparty: r.supplier, counterAccount: `${300_000_000 + (hashOf(r.supplier) % 699_999_999)}/${['0100', '0300', '0800', '5500'][h % 4]}`, vs: e.number, message: `Úhrada ${e.number}`, expenseId: e.id, kind: r.category === 'Leasing autobusů' ? 'Leasing' : 'Náklad' })
        e.paidAt = paidAt; e.txId = tx.id
      }
    }
    RECEIPTS.forEach(([supplier, category, account, vatRate, amount, note], i) => {
      const h = hashOf(m + supplier)
      if (h % 100 > 55) return
      const received = dt(yy, mm, 3 + ((h + i * 4) % 24))
      if (received > TODAY) return
      const base = round(amount * (0.9 + (h % 20) / 100))
      const e = addExpense({ kind: 'Účtenka', supplier, ico: '', number: `U-${yy}${String(mm).padStart(2, '0')}-${String(i + 1).padStart(2, '0')}`, received, due: received, base, vatRate, category, account, source: 'Drag & drop', note, status: m === CURRENT && i % 3 === 0 ? 'K zaúčtování' : 'Zaúčtováno', ai: true, file: `uctenka-${m}-${i + 1}.jpg`, paidAt: received })
      const tx = addTx({ accountId: 'csob', at: received, amount: -e.total, counterparty: supplier, counterAccount: 'karta •••• 4471', vs: '', message: `Platba kartou ${supplier}`, expenseId: e.id, kind: 'Náklad' })
      e.txId = tx.id
    })
    const prevKey = mm === 1 ? `${yy - 1}-12` : `${yy}-${String(mm - 1).padStart(2, '0')}`
    if (dt(yy, mm, 10, 7) <= TODAY) addTx({ accountId: 'csob', at: dt(yy, mm, 10, 7), amount: -store.payroll.net, counterparty: 'Mzdy zaměstnanců (hromadný příkaz)', counterAccount: 'hromadný příkaz', vs: prevKey.replace('-', ''), message: `Mzdy ${monthLabel(prevKey)}`, kind: 'Mzdy a odvody' })
    if (dt(yy, mm, 20, 7) <= TODAY) addTx({ accountId: 'csob', at: dt(yy, mm, 20, 7), amount: -store.payroll.levies, counterparty: 'ČSSZ, zdravotní pojišťovny a finanční úřad', counterAccount: '10006-77627231/0710', vs: COMPANY.ico, message: `Odvody a zálohy na daň ${monthLabel(prevKey)}`, kind: 'Mzdy a odvody' })
    const vatAt = dt(yy, mm, 25, 7)
    if (vatAt <= TODAY && mm > 1) {
      const prevClose = computeClose(prevKey)
      if (prevClose.vatDue > 0) addTx({ accountId: 'csob', at: vatAt, amount: -round(prevClose.vatDue, 100), counterparty: 'Finanční úřad pro Jihočeský kraj', counterAccount: '705-77627231/0710', vs: COMPANY.ico, message: `DPH za ${monthLabel(prevKey)}`, kind: 'DPH' })
    }
  }
  /* 5) nesrovnalosti pro kontrolu vedení */
  addTx({ accountId: 'csob', at: dt(y, TODAY.getMonth() + 1, 2, 11), amount: -24_800, counterparty: 'Veletrh Czechbus 2026', counterAccount: '115-2233445566/0100', vs: '2026117', message: 'Vstupenky a stánek', kind: 'Náklad', flag: 'Chybí doklad' })
  addTx({ accountId: 'csob', at: dt(y, TODAY.getMonth() + 1, 4, 15), amount: -86_500, counterparty: 'Neznámý příjemce', counterAccount: '2900455133/2010', vs: '', message: 'Náhradní díly, záloha', kind: 'Neznámá', flag: 'Účet mimo systém' })
  addTx({ accountId: 'csob', at: dt(y, TODAY.getMonth(), 27, 9), amount: -250_000, counterparty: 'Ing. Pavel Šimek', counterAccount: '1234567890/0800', vs: '', message: 'Záloha na podíl na zisku', kind: 'Výběr', flag: 'Ke schválení vedením' })
  addTx({ accountId: 'csob', at: dt(y, TODAY.getMonth() + 1, 3, 10), amount: 1_412_000, counterparty: 'JIKORD s.r.o.', counterAccount: '7788990011/0100', vs: '2026000999', message: 'kompenzace rijen', kind: 'Kompenzace objednatele', flag: 'Nesedí částka' })
  addExpense({ kind: 'Faktura', supplier: 'Polep Studio Jih s.r.o.', ico: '09988776', number: '2026091', received: dt(y, TODAY.getMonth(), 22), due: dt(y, TODAY.getMonth() + 1, 5), base: 47_000, vatRate: 21, category: 'Externí servis', account: '511', source: 'E-mail faktury@', note: 'celopolep autobusu linky 300', status: 'Ke schválení', ai: true, file: 'polep-2026091.pdf' })
  /* zůstatky */
  for (const a of ACCOUNTS) a.balance = round((a.id === 'csob' ? 6_480_000 : 2_920_000) + store.txs.filter((t) => t.accountId === a.id).reduce((s, t) => s + t.amount, 0), 1)
  /* uzávěrky */
  for (const m of months) {
    if (m === CURRENT) continue
    const c = computeClose(m)
    const prev = months[months.indexOf(CURRENT) - 1]
    if (m === prev) c.status = TODAY.getDate() >= 20 ? 'Připraveno' : 'Otevřeno'
    else { c.status = 'Odesláno'; const [yy, mm] = m.split('-').map(Number); c.closedAt = dt(yy, mm + 1, 20, 14); c.closedBy = by; c.sentAt = dt(yy, mm + 1, 22, 9); c.sentVia = 'Datová schránka' }
    store.closes.set(m, c)
  }
  log('Systém', `Načteno ${store.invoices.length} vydaných dokladů, ${store.expenses.length} nákladových dokladů, ${store.txs.length} bankovních pohybů`, dt(y, TODAY.getMonth() + 1, TODAY.getDate(), 6))
}

/* ------------------------------------------------------------------ */
/* Dotazy                                                              */
/* ------------------------------------------------------------------ */
export const invoices = () => [...store.invoices].sort((a, b) => +b.issued - +a.issued)
export const expenses = () => [...store.expenses].sort((a, b) => +b.received - +a.received)
export const txs = (accountId) => store.txs.filter((t) => !accountId || t.accountId === accountId).sort((a, b) => +b.at - +a.at)
export const events = () => [...store.events].sort((a, b) => +b.at - +a.at)
export const closes = () => MONTHS_2026.map((m) => store.closes.get(m) || computeClose(m))
export const invoiceById = (id) => store.invoices.find((i) => i.id === id)
export const expenseById = (id) => store.expenses.find((e) => e.id === id)
export const txById = (id) => store.txs.find((t) => t.id === id)

export function computeClose(m) {
  const inv = store.invoices.filter((i) => inMonth(i.duzp, m) && DOC_TYPES[i.docType].tax && i.status !== 'Storno')
  const ex = store.expenses.filter((e) => inMonth(e.received, m))
  const outputVat = inv.reduce((s, i) => s + i.vat, 0)
  const inputVat = ex.reduce((s, e) => s + e.vat, 0)
  const fares = store.txs.filter((t) => t.kind === 'Tržby jízdné' && inMonth(t.at, m)).reduce((s, t) => s + t.amount, 0)
  const fareVat = Math.round(fares - fares / 1.12) // jízdné je plnění se sníženou sazbou 12 %
  const taxable = inv.filter((i) => i.vat > 0).reduce((s, i) => s + i.base, 0) + (fares - fareVat)
  const exempt = inv.filter((i) => i.vat === 0 && !i.kompenzace).reduce((s, i) => s + i.base, 0)
  const coef = taxable + exempt > 0 ? Math.min(1, Math.ceil((taxable / (taxable + exempt)) * 100) / 100) : 1
  const inputVatDeductible = Math.round(inputVat * coef)
  const revenue = inv.reduce((s, i) => s + i.base, 0) + (fares - fareVat)
  const payroll = -store.txs.filter((t) => t.kind === 'Mzdy a odvody' && inMonth(t.at, m)).reduce((s, t) => s + t.amount, 0)
  const costs = ex.reduce((s, e) => s + e.base, 0) + payroll + (inputVat - inputVatDeductible)
  const issues = []
  const noDoc = store.txs.filter((t) => inMonth(t.at, m) && t.flag === 'Chybí doklad').length
  if (noDoc) issues.push(`${noDoc} platba bez dokladu`)
  const unposted = ex.filter((e) => e.status !== 'Zaúčtováno').length
  if (unposted) issues.push(`${unposted} doklady k zaúčtování`)
  const unknown = store.txs.filter((t) => inMonth(t.at, m) && t.flag === 'Účet mimo systém' && !t.approvedBy).length
  if (unknown) issues.push(`${unknown} platba na účet mimo systém`)
  const missingDd = store.invoices.filter((i) => (i.docType === 'zalohova' || i.docType === 'vyzva') && i.paidAt && inMonth(i.paidAt, m) && !store.invoices.some((d) => d.docType === 'danovy' && d.relatedId === i.id)).length
  if (missingDd) issues.push(`${missingDd} přijatá záloha bez daňového dokladu k platbě`)
  return { month: m, status: 'Otevřeno', outputVat: outputVat + fareVat, inputVat, coef, inputVatDeductible, vatDue: outputVat + fareVat - inputVatDeductible, revenue, costs, fares, issues }
}

export function alerts() {
  const out = []
  for (const t of store.txs.filter((x) => x.flag && !x.approvedBy)) out.push({ id: `a-${t.id}`, level: t.flag === 'Účet mimo systém' ? 'err' : 'warn', text: `${t.flag}: ${t.counterparty}, ${kc(Math.abs(t.amount))}`, detail: `${t.counterAccount} · ${t.message}`, txId: t.id })
  for (const i of store.invoices.filter((x) => x.status === 'Po splatnosti')) out.push({ id: `a-${i.id}`, level: 'warn', text: `Faktura ${i.number} po splatnosti: ${i.customer}`, detail: `${kc(i.total)}, splatnost ${fmtDate(i.due)}`, invoiceId: i.id })
  for (const e of store.expenses.filter((x) => x.status === 'Ke schválení' || (x.kind === 'Faktura' && !x.paidAt && x.due < TODAY))) out.push({ id: `e-${e.id}`, level: e.status === 'Ke schválení' ? 'info' : 'warn', text: e.status === 'Ke schválení' ? `Faktura ${e.supplier} čeká na schválení` : `Neuhrazená faktura ${e.supplier} po splatnosti`, detail: `${kc(e.total)}, ${e.category}`, expenseId: e.id })
  return out.sort((a, b) => ['err', 'warn', 'info'].indexOf(a.level) - ['err', 'warn', 'info'].indexOf(b.level))
}

export function cashflow() {
  const out = []
  for (const m of MONTHS_2026) {
    const ts = store.txs.filter((t) => inMonth(t.at, m))
    const inflow = ts.filter((t) => t.amount > 0).reduce((s, t) => s + t.amount, 0)
    const outflow = -ts.filter((t) => t.amount < 0).reduce((s, t) => s + t.amount, 0)
    out.push({ month: m, label: monthLabel(m), inflow, outflow, forecast: false, fares: ts.filter((t) => t.kind === 'Tržby jízdné').reduce((s, t) => s + t.amount, 0), komp: ts.filter((t) => t.kind === 'Kompenzace objednatele').reduce((s, t) => s + t.amount, 0) })
  }
  const recurring = EXPENSE_RULES.reduce((s, r) => s + r.monthly * (1 + r.vatRate / 100), 0) + store.payroll.net + store.payroll.levies + 120_000
  const avgIn = out.slice(-3).reduce((s, x) => s + x.inflow, 0) / 3
  const season = [1.02, 0.96, 1.0, 1.04, 1.03, 1.06]
  for (let k = 1; k <= 6; k++) {
    const d = new Date(TODAY.getFullYear(), TODAY.getMonth() + k, 1)
    const m = key(d)
    out.push({ month: m, label: monthLabel(m), inflow: Math.round(avgIn * season[k - 1]), outflow: Math.round(recurring), forecast: true, fares: 0, komp: 0 })
  }
  return out
}

export function yearSummary() {
  const inv = store.invoices.filter((i) => DOC_TYPES[i.docType].tax && i.status !== 'Storno')
  const fares = store.txs.filter((t) => t.kind === 'Tržby jízdné').reduce((s, t) => s + t.amount, 0)
  const faresBase = Math.round(fares / 1.12)
  const komp = inv.filter((i) => i.kompenzace).reduce((s, i) => s + i.base, 0)
  const services = inv.filter((i) => !i.kompenzace).reduce((s, i) => s + i.base, 0)
  const revenue = komp + services + faresBase
  const byAccount = new Map()
  for (const e of store.expenses) byAccount.set(e.account, (byAccount.get(e.account) || 0) + e.base)
  const payroll = -store.txs.filter((t) => t.kind === 'Mzdy a odvody').reduce((s, t) => s + t.amount, 0)
  byAccount.set('521/524', payroll)
  const costs = [...byAccount.values()].reduce((a, b) => a + b, 0)
  const nonDeductible = byAccount.get('513') || 0
  const base = revenue - costs + nonDeductible
  const tax = Math.max(0, Math.round((base * 0.21) / 100) * 100)
  return { revenue, komp, services, fares: faresBase, costs, byAccount: [...byAccount.entries()].sort((a, b) => b[1] - a[1]), nonDeductible, base, tax }
}

/* ------------------------------------------------------------------ */
/* Akce                                                                */
/* ------------------------------------------------------------------ */
export function issueDocument(x) {
  const issued = x.issued || now()
  const series = DOC_TYPES[x.docType].series
  const inv = addInvoice({ docType: x.docType, series, clientId: x.clientId, customer: x.customer, ico: x.ico, dic: x.dic, address: x.address, issued, duzp: x.duzp || issued, due: new Date(+issued + (x.dueDays ?? 14) * DAY), paymentMethod: x.paymentMethod, currency: x.currency, items: x.items, status: x.paidAt ? 'Zaplaceno' : 'Vystaveno', paidAt: x.paidAt, relatedId: x.relatedId, note: x.note, kompenzace: !!x.kompenzace, by: x.by })
  if (x.docType === 'opravny' && x.relatedId) { const orig = invoiceById(x.relatedId); if (orig) orig.status = 'Dobropisováno' }
  log(x.by, `Vystaven doklad ${inv.number} (${DOC_TYPES[x.docType].short}) pro ${inv.customer}, ${kc(inv.total)}`)
  emit()
  return inv
}
export function creditNote(id, by, reason) {
  const o = invoiceById(id); if (!o) return
  return issueDocument({ docType: 'opravny', clientId: o.clientId, customer: o.customer, ico: o.ico, dic: o.dic, address: o.address, items: o.items.map((i) => ({ ...i, amount: -i.amount, unitPrice: -i.unitPrice })), relatedId: o.id, note: `Opravný daňový doklad k faktuře ${o.number}. Důvod: ${reason}`, by })
}
export function taxDocToPayment(id, by) {
  const inv = invoiceById(id); if (!inv) return
  return issueDocument({ docType: 'danovy', clientId: inv.clientId, customer: inv.customer, ico: inv.ico, dic: inv.dic, address: inv.address, items: inv.items, relatedId: inv.id, paidAt: inv.paidAt, note: `Daňový doklad k platbě přijaté ${fmtDate(inv.paidAt)} na doklad ${inv.number}.`, by })
}
export function markPaid(id, by, at = now()) {
  const i = invoiceById(id); if (!i || i.status === 'Zaplaceno') return
  const tx = addTx({ accountId: 'csob', at, amount: i.total, counterparty: i.customer, counterAccount: 'ruční spárování', vs: i.vs, message: i.number, invoiceId: i.id, kind: 'Platba odběratele' })
  i.status = 'Zaplaceno'; i.paidAt = at; i.txId = tx.id
  log(by, `Doklad ${i.number} označen jako zaplacený`); emit()
}
export function cancelInvoice(id, by) {
  const i = invoiceById(id); if (!i || i.status === 'Zaplaceno') return
  i.status = 'Storno'; log(by, `Doklad ${i.number} stornován (číslo v řadě zůstává)`); emit()
}
export function addReceipt(file, by, note) {
  const h = hashOf(file.name + Date.now())
  const [supplier, category, account, vatRate, amount] = RECEIPTS[h % RECEIPTS.length]
  const e = addExpense({ kind: /pdf|fak/i.test(file.name) ? 'Faktura' : 'Účtenka', supplier, ico: '', number: `U-${CURRENT.replace('-', '')}-${String(store.expenses.length + 1).padStart(2, '0')}`, received: now(), due: now(), base: round(amount * (0.85 + (h % 30) / 100)), vatRate, category, account, source: 'Drag & drop', note, status: 'K zaúčtování', ai: true, file: file.name })
  log(by, `Nahrán doklad ${file.name}: AI vyčetla ${e.supplier}, ${kc(e.total)}, navržen účet ${e.account}`); emit()
  return e
}
export function fetchMailInvoices(by) {
  const pool = EXPENSE_RULES.slice(1, 5)
  const added = []
  for (let i = 0; i < 2; i++) {
    const r = pool[(hashOf(String(Date.now()) + i) + i) % pool.length]
    const received = now()
    added.push(addExpense({ kind: 'Faktura', supplier: r.supplier, ico: r.ico, number: `${CURRENT.replace('-', '')}${String(500 + i + store.expenses.length)}`, received, due: new Date(+received + 14 * DAY), base: round(r.monthly * (0.2 + (hashOf(r.supplier + Date.now()) % 20) / 100), 10), vatRate: r.vatRate, category: r.category, account: r.account, source: 'E-mail faktury@', note: 'doplňková faktura', status: 'K zaúčtování', ai: true, file: `${r.supplier.split(' ')[0].toLowerCase()}-${Date.now() % 1000}.pdf` }))
  }
  log(by, 'Ze schránky faktury@csadbus.cz staženy 2 nové faktury, AI vyčetla dodavatele, částky a navrhla účty'); emit()
  return added
}
export function postExpense(id, by, account) {
  const e = expenseById(id); if (!e) return
  if (account) { e.account = account; e.posting = `${account} / 321${e.vatRate ? ', DPH 343 / 321' : ''}` }
  e.status = 'Zaúčtováno'; log(by, `Doklad ${e.number} (${e.supplier}) zaúčtován na ${e.account}`); emit()
}
export function approveTx(txId, by, note) {
  const t = txById(txId); if (!t) return
  t.approvedBy = by; log(by, `Platba ${t.counterparty} ${kc(Math.abs(t.amount))} schválena vedením: ${note || 'bez poznámky'}`); emit()
}
export function attachDoc(txId, by) {
  const t = txById(txId); if (!t) return
  const e = addExpense({ kind: 'Faktura', supplier: t.counterparty, ico: '', number: t.vs || `D-${Date.now() % 10000}`, received: now(), due: now(), base: Math.round(Math.abs(t.amount) / 1.21), vatRate: 21, category: 'Ostatní služby', account: '518', source: 'Ručně', note: 'doklad doplněn k platbě', status: 'Zaúčtováno', ai: false, file: 'doklad.pdf', paidAt: t.at, txId: t.id })
  t.expenseId = e.id; t.flag = undefined
  log(by, `K platbě ${t.counterparty} doplněn doklad ${e.number}`); emit()
}
export function importStatement(accountId, file, by) {
  const a = ACCOUNTS.find((x) => x.id === accountId); if (!a) return 0
  a.lastSync = now()
  let matched = 0
  for (const t of store.txs.filter((x) => x.accountId === accountId && !x.invoiceId && !x.expenseId && (x.kind === 'Platba odběratele' || x.kind === 'Kompenzace objednatele') && !x.flag)) {
    const inv = store.invoices.find((i) => i.vs === t.vs)
    if (inv) { t.invoiceId = inv.id; matched++ }
  }
  log(by, `Import výpisu ${file.name} (${a.bank}): výpis porovnán s fakturami, ${matched} nově spárováno`); emit()
  return matched
}
export function closeMonth(m, by) {
  const c = store.closes.get(m) || computeClose(m)
  Object.assign(c, computeClose(m), { status: 'Uzavřeno', closedAt: now(), closedBy: by })
  store.closes.set(m, c)
  log(by, `Měsíc ${monthLabel(m)} uzavřen: DPH na výstupu ${kc(c.outputVat)}, odpočet ${kc(c.inputVatDeductible)} (koeficient ${c.coef}), k úhradě ${kc(c.vatDue)}`); emit()
}
export function sendVat(m, via, by) {
  const c = store.closes.get(m); if (!c || (c.status !== 'Uzavřeno' && c.status !== 'Připraveno')) return
  c.status = 'Odesláno'; c.sentAt = now(); c.sentVia = via
  log(by, via === 'Datová schránka' ? `Přiznání k DPH a kontrolní hlášení za ${monthLabel(m)} odesláno datovou schránkou na ${COMPANY.taxOffice}` : `Přiznání k DPH a kontrolní hlášení za ${monthLabel(m)} exportováno do XML (EPO)`); emit()
}
export function kontrolniHlaseni(m) {
  const out = store.invoices.filter((i) => inMonth(i.duzp, m) && DOC_TYPES[i.docType].tax && i.vat !== 0 && i.status !== 'Storno')
  const inp = store.expenses.filter((e) => inMonth(e.received, m) && e.vatRate > 0)
  return {
    A4: out.filter((i) => i.total > 10_000).map((i) => ({ dic: `CZ${i.ico}`, number: i.number, date: i.issued, base: i.base, vat: i.vat })),
    A5: out.filter((i) => i.total <= 10_000).reduce((s, i) => ({ base: s.base + i.base, vat: s.vat + i.vat }), { base: 0, vat: 0 }),
    B2: inp.filter((e) => e.total > 10_000 && e.ico).map((e) => ({ dic: `CZ${e.ico}`, number: e.number, date: e.received, base: e.base, vat: e.vat })),
    B3: inp.filter((e) => e.total <= 10_000 || !e.ico).reduce((s, e) => ({ base: s.base + e.base, vat: s.vat + e.vat }), { base: 0, vat: 0 }),
  }
}
export function vatXml(m) {
  const c = store.closes.get(m) || computeClose(m)
  const kh = kontrolniHlaseni(m)
  const [y, mm] = m.split('-')
  const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  return [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<Pisemnost nazevSW="Fleet Portal" verzeSW="1.0">',
    `  <DPHDP3><VetaD rok="${y}" mesic="${Number(mm)}" dapdph_forma="B" d_poddp="${new Date().toISOString().slice(0, 10)}"/>`,
    `    <VetaP dic="${COMPANY.ico}" typ_ds="P" naz_prav_os="${esc(COMPANY.name)}" c_ufo="462" c_pracufo="2201"/>`,
    `    <Veta1 obrat23="${Math.round(c.outputVat / 0.21)}" dan23="${c.outputVat}"/>`,
    `    <Veta4 pln23="${Math.round(c.inputVat / 0.21)}" odp_tuz23_nar="${c.inputVat}" odp_tuz23="${c.inputVatDeductible}"/>`,
    `    <Veta5 koef_p20_nov="${c.coef}"/>`,
    `    <Veta6 dan_zocelk="${c.outputVat}" odp_zocelk="${c.inputVatDeductible}" dano_da="${Math.max(0, c.vatDue)}" dano_no="${Math.max(0, -c.vatDue)}"/>`,
    '  </DPHDP3>',
    `  <DPHKH1><VetaD rok="${y}" mesic="${Number(mm)}" khdph_forma="B"/>`,
    ...kh.A4.map((r) => `    <VetaA4 dic_odb="${r.dic}" c_evid_dd="${r.number}" dppd="${fmtDate(r.date)}" zakl_dane1="${r.base}" dan1="${r.vat}"/>`),
    `    <VetaA5 zakl_dane1="${kh.A5.base}" dan1="${kh.A5.vat}"/>`,
    ...kh.B2.map((r) => `    <VetaB2 dic_dod="${r.dic}" c_evid_dd="${r.number}" dppd="${fmtDate(r.date)}" zakl_dane1="${r.base}" dan1="${r.vat}"/>`),
    `    <VetaB3 zakl_dane1="${kh.B3.base}" dan1="${kh.B3.vat}"/>`,
    '  </DPHKH1>',
    '</Pisemnost>',
  ].join('\n')
}
export function dppoCsv() {
  const s = yearSummary()
  const rows = [
    ['Položka', 'Účet', 'Kč'],
    ['Výnosy celkem', '602+648', s.revenue],
    ['z toho kompenzace objednatelů', '648', s.komp],
    ['z toho tržby z jízdného (základ)', '602', s.fares],
    ['z toho zájezdy, reklama, pronájmy', '602', s.services],
    ...s.byAccount.map(([a, v]) => [(CHART.find((c) => c.account === a) || {}).name || (a === '521/524' ? 'Mzdy a odvody' : a), a, v]),
    ['Náklady celkem', '', s.costs],
    ['Daňově neuznatelné (513)', '513', s.nonDeductible],
    ['Základ daně', '', s.base],
    ['Daň 21 %', '', s.tax],
  ]
  return '﻿' + rows.map((r) => r.map((v) => (typeof v === 'string' && /[;"\n]/.test(v) ? `"${v.replace(/"/g, '""')}"` : String(v))).join(';')).join('\r\n')
}
export function downloadText(name, text, type = 'text/plain;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([text], { type }))
  const a = document.createElement('a'); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1500)
}

/** Tisk dokladu (A4 HTML) s platebními údaji a SPD řetězcem pro QR platbu. */
export function invoiceHtml(inv) {
  const esc = (s) => String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
  const acc = ACCOUNTS[0]
  const t = DOC_TYPES[inv.docType]
  const iban = (() => { const [pre, rest] = acc.number.includes('-') ? acc.number.split('-') : ['', acc.number]; const [num, bank] = rest.split('/'); const bban = bank + pre.padStart(6, '0') + num.padStart(10, '0'); const n = BigInt(bban + '123500'); return 'CZ' + String(98n - (n % 97n)).padStart(2, '0') + bban })()
  const spd = `SPD*1.0*ACC:${iban}*AM:${inv.total.toFixed(2)}*CC:CZK*X-VS:${inv.vs}*MSG:${inv.number}`
  const rows = inv.items.map((it) => `<tr><td>${esc(it.text)}</td><td class="r">${it.qty} ${esc(it.unit)}</td><td class="r">${kc(it.unitPrice)}</td><td class="r">${it.vatRate ? it.vatRate + ' %' : 'osv.'}</td><td class="r">${kc(it.amount)}</td><td class="r"><b>${kc(it.amount + Math.round(it.amount * it.vatRate / 100))}</b></td></tr>`).join('')
  const vs = inv.vatSummary.map((r) => `<tr><td colspan="4" class="r muted">Základ ${r.rate ? r.rate + ' %' : 'osvobozeno / mimo DPH'} ${kc(r.base)}${r.rate ? ', DPH ' + kc(r.vat) : ''}</td><td colspan="2" class="r">${kc(r.base + r.vat)}</td></tr>`).join('')
  return `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${esc(inv.number)}</title><style>*{box-sizing:border-box}body{font-family:-apple-system,system-ui,sans-serif;color:#1b1f2a;margin:0;padding:40px 46px;font-size:12.5px;line-height:1.5}h1{font-size:22px;margin:0}.top{display:flex;justify-content:space-between;border-bottom:3px solid #6D5EF6;padding-bottom:14px}.brand{font-weight:800;color:#6D5EF6;font-size:12px;letter-spacing:.3px}.muted{color:#6b7280}.two{display:grid;grid-template-columns:1fr 1fr;gap:26px;margin:18px 0}.two b{display:block;font-size:14px}.meta{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin:14px 0;padding:12px 14px;background:#faf9ff;border:1px solid #e7e9f2;border-radius:10px}.meta small{display:block;color:#6b7280;font-size:10.5px}table{width:100%;border-collapse:collapse;margin-top:10px}th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.4px;color:#6b7280;border-bottom:1px solid #e7e9f2;padding:0 0 6px}td{padding:7px 0;border-bottom:1px solid #f0f1f5;vertical-align:top}.r{text-align:right}.tot{display:flex;justify-content:space-between;align-items:center;margin-top:14px;padding:14px 16px;background:#F1ECFF;border-radius:12px;font-weight:800;font-size:16px}.pay{display:flex;gap:18px;align-items:center;margin-top:18px;padding:14px;border:1px solid #e7e9f2;border-radius:12px}.qr{width:96px;height:96px;border:1px dashed #c9cfe6;border-radius:8px;display:flex;align-items:center;justify-content:center;font-size:9px;color:#6b7280;text-align:center;padding:6px}.foot{margin-top:24px;color:#9AA3B2;font-size:10.5px}@media print{@page{size:A4;margin:16mm}body{padding:0}}</style></head><body>
  <div class="top"><div><div class="brand">FLEETPORTAL · ÚČETNICTVÍ</div><h1>${esc(t.label)} ${esc(inv.number)}</h1></div><div class="muted" style="text-align:right">${inv.status === 'Zaplaceno' ? '<b style="color:#1f9d57">UHRAZENO</b><br>' : ''}VS ${esc(inv.vs)}</div></div>
  <div class="two"><div><small class="muted">Dodavatel</small><b>${esc(COMPANY.name)}</b>${esc(COMPANY.address)}<br>IČO ${COMPANY.ico}, DIČ ${COMPANY.dic}<br><span class="muted">${esc(COMPANY.registration)}</span></div>
  <div><small class="muted">Odběratel</small><b>${esc(inv.customer)}</b>${esc(inv.address || '')}<br>${inv.ico ? 'IČO ' + esc(inv.ico) : ''}${inv.dic ? ', DIČ ' + esc(inv.dic) : ''}</div></div>
  <div class="meta"><div><small>Vystaveno</small>${fmtDate(inv.issued)}</div><div><small>${t.tax ? 'DUZP' : 'Datum plnění'}</small>${fmtDate(inv.duzp)}</div><div><small>Splatnost</small>${fmtDate(inv.due)}</div><div><small>Úhrada</small>${esc(inv.paymentMethod)}</div></div>
  <table><thead><tr><th>Položka</th><th class="r">Množství</th><th class="r">Cena / MJ</th><th class="r">DPH</th><th class="r">Bez DPH</th><th class="r">Celkem</th></tr></thead><tbody>${rows}${vs}</tbody></table>
  <div class="tot"><span>${inv.docType === 'opravny' ? 'K vrácení' : 'Celkem k úhradě'}</span><span>${kc(inv.total)}</span></div>
  <div class="pay"><div class="qr">QR platba<br>(SPD)<br><span style="font-size:7px;word-break:break-all">${esc(spd)}</span></div><div><b>Platební údaje</b><br>Účet ${esc(acc.number)} (${esc(acc.bank)})<br>IBAN ${iban}<br>VS ${esc(inv.vs)} · částka ${kc(inv.total)}</div></div>
  ${inv.note ? `<p class="muted">${esc(inv.note)}</p>` : ''}
  <div class="foot">Zaúčtování: ${esc(inv.posting)} · Vystavil(a): ${esc(inv.by)} · ${COMPANY.vatPayer ? 'plátce DPH' : 'neplátce DPH'}</div>
  </body></html>`
}
