// Profily provozu: jeden Fleet Portal pro autobusy, kamiony, taxi, firemní flotily i zemědělství.
// Firma = množina provozů. Profil přináší moduly, role, KPI, kontroly a pojistné produkty.
// Onboarding podle IČO: ARES (živě) + trAIce analýza (registr vozidel, ekonomika, smlouvy) → doporučené profily.

export const NACE_NAMES = {
  '01': 'Rostlinná a živočišná výroba', '0111': 'Pěstování obilovin a olejnin', '0141': 'Chov mléčného skotu', '0150': 'Smíšené hospodářství', '0161': 'Podpůrné činnosti pro rostlinnou výrobu',
  '10': 'Výroba potravinářských výrobků', '23': 'Výroba nekovových minerálních výrobků', '2361': 'Výroba betonových výrobků pro stavební účely',
  '41': 'Výstavba budov', '4120': 'Výstavba bytových a nebytových budov', '42': 'Inženýrské stavitelství', '4211': 'Výstavba silnic a dálnic', '43': 'Specializované stavební činnosti', '4312': 'Příprava staveniště',
  '4520': 'Opravy a údržba motorových vozidel', '46': 'Velkoobchod', '4690': 'Nespecializovaný velkoobchod', '47': 'Maloobchod', '4730': 'Maloobchod s pohonnými hmotami',
  '4931': 'Městská a příměstská pozemní osobní doprava', '4932': 'Taxislužba a pronájem osobních vozů s řidičem', '49391': 'Meziměstská pravidelná pozemní osobní doprava', '49393': 'Nepravidelná pozemní osobní doprava (zájezdy)', '4939': 'Ostatní pozemní osobní doprava',
  '4941': 'Silniční nákladní doprava', '4942': 'Stěhovací služby', '5210': 'Skladování', '5221': 'Činnosti související s pozemní dopravou', '5229': 'Ostatní vedlejší činnosti v dopravě (spedice)', '5320': 'Kurýrní činnosti',
  '6831': 'Zprostředkovatelské činnosti realitních agentur', '74': 'Ostatní profesní, vědecké a technické činnosti', '7711': 'Pronájem a leasing osobních automobilů', '7712': 'Pronájem a leasing nákladních automobilů', '7731': 'Pronájem zemědělských strojů', '791': 'Činnosti cestovních agentur a kanceláří', '94': 'Činnosti organizací sdružujících osoby', '95': 'Opravy počítačů a výrobků pro osobní potřebu',
}
export const naceName = (code) => {
  const c = String(code)
  for (let n = c.length; n >= 2; n--) { const k = c.slice(0, n); if (NACE_NAMES[k]) return NACE_NAMES[k] }
  return 'Ostatní činnosti'
}
export const naceFmt = (code) => { const c = String(code); return c.length <= 2 ? c : c.slice(0, 2) + '.' + c.slice(2) }
export const LEGAL_FORMS = { 101: 'Fyzická osoba podnikající', 111: 'Veřejná obchodní společnost', 112: 'Společnost s ručením omezeným', 113: 'Komanditní společnost', 121: 'Akciová společnost', 141: 'Obecně prospěšná společnost', 161: 'Ústav', 205: 'Družstvo', 301: 'Státní podnik', 331: 'Příspěvková organizace', 421: 'Odštěpný závod zahraniční osoby', 706: 'Spolek', 707: 'Odborová organizace', 736: 'Pobočný spolek', 751: 'Zájmové sdružení právnických osob', 801: 'Obec', 804: 'Kraj', 931: 'Evropská společnost' }

export const PROFILES = [
  { id: 'linkova', name: 'Linková doprava', icon: 'bus', color: 'var(--blue)', soft: 'var(--blue-soft)', ready: true,
    desc: 'Autobusy na linkách pro kraj nebo město: jízdní řády, dispečink, výkony a jejich vyúčtování objednateli.',
    unit: 'km a spoje', work: 'spoj na lince',
    modules: [['linky', 'Linky & JŘ'], ['dispatch', 'Dispečink'], ['vykony', 'Vyúčtování výkonů'], ['eco', 'Eco-driving'], ['elektrobusy', 'Elektrobusy'], ['optimalizace', 'AI optimalizace']],
    roles: ['Dispečer', 'Správce parku', 'Řidič', 'Účetní'], kpis: ['Dodržení jízdního řádu', 'Výkony vs. smlouva', 'Penalizace objednatele'],
    checks: ['Profesní průkaz řidiče', 'Lékařské prohlídky řidičů', 'Platnost jízdních řádů a licencí'],
    insurance: ['Flotilové POV a HAV', 'Odpovědnost dopravce za cestující a zavazadla', 'Přerušení provozu'] },
  { id: 'zajezdy', name: 'Zájezdy a příležitostná doprava', icon: 'pin', color: 'var(--purple)', soft: 'var(--purple-soft)', ready: true,
    desc: 'Nepravidelná doprava na zakázku: kalkulace, nabídka, přiřazení vozu a řidičů, doklady do účetnictví.',
    unit: 'km a dny', work: 'zájezd (zakázka)',
    modules: [['zajezdy', 'Zájezdy'], ['eco', 'Eco-driving']],
    roles: ['Dispečer', 'Obchod', 'Řidič'], kpis: ['Obsazenost vozů', 'Marže na zájezd', 'Nabídky vs. realizace'],
    checks: ['Druhý řidič podle AETR', 'Doba řízení a odpočinku'],
    insurance: ['Flotilové POV a HAV', 'Úrazové pojištění cestujících', 'Pojištění zavazadel'] },
  { id: 'nakladni', name: 'Nákladní doprava', icon: 'truck', color: '#B45309', soft: 'var(--amber-soft)', ready: false,
    desc: 'Přepravy na zakázku, soupravy tahač a návěs, tachograf a AETR, mýto, CMR a ADR.',
    unit: 'km, tuny a palety', work: 'přeprava (zakázka)',
    modules: [['zakazky', 'Zakázky a přepravy'], ['tachograf', 'Tachograf a AETR'], ['myto', 'Mýto a palivo'], ['cmr', 'CMR a ADR'], ['eco', 'Eco-driving']],
    roles: ['Dispečer', 'Speditér', 'Řidič', 'Účetní'], kpis: ['Km s nákladem vs. prázdné', 'Výnos na soupravu', 'Porušení AETR'],
    checks: ['Stažení karty řidiče (28 dní) a vozidla (90 dní)', 'ADR školení', 'Mýto vs. telematika'],
    insurance: ['Odpovědnost silničního dopravce (CMR)', 'Pojištění nákladu', 'Finanční způsobilost dopravce'] },
  { id: 'taxi', name: 'Taxi a ride-hailing', icon: 'car', color: '#0E9F6E', soft: 'var(--green-soft)', ready: false,
    desc: 'Flotila pro Uber, Bolt nebo Liftago: řidiči na pronájem vozu, týdenní vyúčtování, výnos na hodinu online.',
    unit: 'jízdy a hodiny online', work: 'jízda z platformy',
    modules: [['jizdy', 'Jízdy a platformy'], ['vyuctovani-ridicu', 'Vyúčtování řidičů'], ['pronajem', 'Pronájem vozů řidičům']],
    roles: ['Fleet manažer', 'Řidič (OSVČ)', 'Účetní'], kpis: ['Výnos na hodinu online', 'Obsazenost', 'Pokuty a škody na řidiče'],
    checks: ['Koncese taxislužby', 'Evidence vozidla taxislužby', 'Průkaz řidiče taxi', 'Kauce a smlouva o pronájmu'],
    insurance: ['Flotila se zvýšeným rizikem', 'Úraz přepravovaných osob', 'Škoda způsobená nájemcem vozu'] },
  { id: 'firemni', name: 'Firemní flotila', icon: 'fleets', color: '#3E5EF8', soft: 'var(--blue-soft)', ready: false,
    desc: 'Osobní auta, dodávky a nákladní vozy přidělené lidem a střediskům: kniha jízd, pool vozy, car policy.',
    unit: 'km a dny přidělení', work: 'přidělení nebo rezervace vozu',
    modules: [['prideleni', 'Přidělení a předávací protokoly'], ['kniha-jizd', 'Kniha jízd'], ['rezervace', 'Rezervace pool vozů'], ['car-policy', 'Car policy']],
    roles: ['Fleet manažer', 'Vedoucí střediska', 'Zaměstnanec'], kpis: ['TCO na vůz a středisko', 'Soukromé km', 'Využití pool vozů'],
    checks: ['Kniha jízd pro daně', 'Benefit 1 % ze vstupní ceny', 'Předávací protokol se stavem tachometru'],
    insurance: ['Flotilové POV a HAV', 'GAP u financovaných vozů', 'Odpovědnost zaměstnance za škodu'] },
  { id: 'agro', name: 'Zemědělská technika', icon: 'tire', color: '#4D7C0F', soft: '#EEF6E4', ready: false,
    desc: 'Traktory, sklízecí mlátičky a nářadí: úkony na pozemcích, motohodiny, sezóny a zelená nafta.',
    unit: 'motohodiny a hektary', work: 'úkon na pozemku',
    modules: [['pozemky', 'Pozemky a úkony'], ['motohodiny', 'Motohodiny a sezóny'], ['zelena-nafta', 'Zelená nafta'], ['sluzby-stroju', 'Služby strojů']],
    roles: ['Agronom', 'Mechanizátor', 'Obsluha stroje'], kpis: ['Náklady na hektar', 'Využití strojů v sezóně', 'Spotřeba na motohodinu'],
    checks: ['Strojní revize', 'Vratka spotřební daně (zelená nafta)', 'Sezónní STK a pojištění'],
    insurance: ['Strojní pojištění', 'Pojištění plodin a zvířat', 'Odpovědnost z provozu neregistrovaných strojů'] },
]
export const profileById = (id) => PROFILES.find((p) => p.id === id)

// Které stávající moduly menu patří k profilům (ostatní jsou jádro a zůstávají vždy)
export const MODULE_PROFILES = { linky: ['linkova'], dispatch: ['linkova'], optimalizace: ['linkova'], vykony: ['linkova'], elektrobusy: ['linkova'], zajezdy: ['zajezdy'], eco: ['linkova', 'zajezdy', 'nakladni', 'firemni', 'taxi'] }
export const BUILT_MODULES = new Set(['linky', 'dispatch', 'optimalizace', 'vykony', 'elektrobusy', 'zajezdy', 'eco'])
export const SOON_MODULES = {
  zakazky: ['Zakázky a přepravy', 'Objednávka, trasa, nakládka a vykládka, souprava tahač + návěs, řidič, CMR a fakturace. Vzniká zobecněním modulu Zájezdy.'],
  tachograf: ['Tachograf a AETR', 'Lhůty stažení karty řidiče a vozidla, porušení doby řízení, přestávek a odpočinku, podklady pro kontrolu.'],
  myto: ['Mýto a palivo', 'Párování vyúčtování mýta a palivových karet s telematikou, odchylky po soupravách a řidičích.'],
  cmr: ['CMR a ADR', 'Nákladní listy, ADR školení a výbava, reklamace škod na nákladu.'],
  jizdy: ['Jízdy a platformy', 'Import výpisů Uber, Bolt a Liftago, výnos na hodinu online, obsazenost a jízdy po řidičích.'],
  'vyuctovani-ridicu': ['Vyúčtování řidičů', 'Týdenní vyúčtování: výplata z platforem mínus nájem vozu, palivo, pokuty a škody.'],
  pronajem: ['Pronájem vozů řidičům', 'Smlouvy o pronájmu, kauce, předání a vrácení vozu, poškození.'],
  prideleni: ['Přidělení a předávací protokoly', 'Vůz přidělený zaměstnanci nebo středisku, předávací protokol s fotkami a stavem tachometru.'],
  'kniha-jizd': ['Kniha jízd', 'Služební a soukromé jízdy z telematiky, podklad pro daně a benefit 1 %.'],
  rezervace: ['Rezervace pool vozů', 'Kalendář sdílených vozů, schvalování a vyzvednutí.'],
  'car-policy': ['Car policy', 'Nárok na vůz podle pozice, limity výbavy, pravidla soukromého užití.'],
  pozemky: ['Pozemky a úkony', 'Půdní bloky z LPIS, úkony (orba, setí, postřik, sklizeň) po strojích a obsluze.'],
  motohodiny: ['Motohodiny a sezóny', 'Výkony strojů v motohodinách, porovnání se stejným obdobím loňska, špičky sezóny.'],
  'zelena-nafta': ['Zelená nafta', 'Evidence spotřeby na zemědělské práce a čtvrtletní nárok na vratku spotřební daně.'],
  'sluzby-stroju': ['Služby strojů', 'Práce strojů pro cizí: objednávka, výkaz motohodin a hektarů, fakturace.'],
}

// Ukázkové firmy pro onboarding: fiktivní, oborově věrné. ČSAD jde živě přes ARES + reálný registr vozidel.
export const DEMO_FIRMS = [
  { id: 'csad', ico: '26060451', label: 'ČSAD AUTOBUSY České Budějovice', tag: 'Autobusy · živě z ARES a registru', live: true },
  { id: 'translog', label: 'TransLog Jih s.r.o.', tag: 'Kamiony · fiktivní firma', live: false,
    company: { name: 'TransLog Jih s.r.o.', ico: 'ukázka', dic: 'CZ ukázka', address: 'Průmyslová 1402, 370 01 České Budějovice', region: 'Jihočeský kraj', legal: 112, founded: '2009-04-14', vat: true, nace: ['49410', '52290', '77120'] },
    register: { total: 69, kinds: { 'Tahače': 26, 'Návěsy': 31, 'Nákladní vozidla': 6, 'Osobní vozidla': 4, 'Přívěsy': 2 }, brands: [['DAF', 14], ['Scania', 8], ['Volvo', 4], ['Schmitz Cargobull', 19], ['Krone', 12]], fuel: { Diesel: 65, LNG: 2, Benzín: 2 }, age: '4,2 roku', sites: ['České Budějovice (základna)', 'Brno, Slatina'] },
    economy: { rows: [['Tržby 2025', '186 mil. Kč', '+9 % meziročně'], ['EBITDA marže', '7,8 %', 'odvětvový průměr 6 až 9 %'], ['Zadluženost', '61 %', 'soupravy na úvěr a leasing'], ['Splatnost závazků', '38 dní', 'bez evidovaných nedoplatků']], source: 'Účetní závěrka 2025 ve Sbírce listin (XML)', signal: 'Zdravý růst s vyšší zadlužeností. Portál má hlídat splátky souprav a výnos na soupravu.' },
    contracts: { public: 0, note: 'V registru smluv žádné veřejné zakázky, zákazníci jsou soukromé firmy a spedice.' },
    answers: { leasingCount: '14', leasingCompany: 'ČSOB Leasing', machines: 'ne', machinesCount: '', telematics: 'ano', telematicsBrand: 'Webfleet', customers: ['spedice'], platforms: [], drivers: '34', extra: [], priorities: ['palivo', 'compliance'] } },
  { id: 'cityride', label: 'CityRide Praha s.r.o.', tag: 'Taxi a ride-hailing · fiktivní firma', live: false,
    company: { name: 'CityRide Praha s.r.o.', ico: 'ukázka', dic: 'CZ ukázka', address: 'Kolbenova 882/5a, 190 00 Praha 9', region: 'Hlavní město Praha', legal: 112, founded: '2019-11-02', vat: true, nace: ['49320', '77110'] },
    register: { total: 58, kinds: { 'Osobní vozidla': 58 }, brands: [['Toyota', 31], ['Škoda', 17], ['Volkswagen', 10]], fuel: { Hybrid: 31, Benzín: 17, Elektro: 10 }, age: '2,1 roku', sites: ['Praha 9, Kolbenova (základna a myčka)'] },
    economy: { rows: [['Tržby 2025', '94 mil. Kč', '+21 % meziročně'], ['EBITDA marže', '4,1 %', 'nízká, typické pro ride-hailing'], ['Zadluženost', '78 %', 'vozy na operativní leasing'], ['Splatnost závazků', '24 dní', 'platby platforem týdně']], source: 'Účetní závěrka 2025 ve Sbírce listin (XML)', signal: 'Tenká marže a vysoká zadluženost. Rozhoduje výnos na hodinu online a disciplína řidičů (pokuty, škody).' },
    contracts: { public: 0, note: 'Bez veřejných smluv. Příjmy přes platformy Uber, Bolt a Liftago.' },
    answers: { leasingCount: '46', leasingCompany: 'Ayvens (ALD Automotive)', machines: 'ne', machinesCount: '', telematics: 'ne', telematicsBrand: '', customers: [], platforms: ['uber', 'bolt', 'liftago'], drivers: '92', extra: ['pronajem'], priorities: ['naklady', 'pojisteni'] } },
  { id: 'stavby', label: 'Stavby Vltava a.s.', tag: 'Firemní mix · fiktivní firma', live: false,
    company: { name: 'Stavby Vltava a.s.', ico: 'ukázka', dic: 'CZ ukázka', address: 'Soběslavská 2140, 390 02 Tábor', region: 'Jihočeský kraj', legal: 121, founded: '1996-06-20', vat: true, nace: ['41200', '42110', '43120', '23610', '49410'] },
    register: { total: 144, kinds: { 'Osobní vozidla': 62, 'Dodávky': 38, 'Nákladní vozidla': 24, 'Přívěsy': 11, 'Traktory a stroje': 9 }, brands: [['Škoda', 48], ['Volkswagen', 27], ['Ford', 16], ['Tatra', 11], ['MAN', 9]], fuel: { Diesel: 118, Benzín: 12, Hybrid: 8, Elektro: 6 }, age: '5,4 roku', sites: ['Tábor (centrála)', 'České Budějovice', 'Písek', 'Jindřichův Hradec', 'Praha', 'Plzeň'] },
    economy: { rows: [['Tržby 2025', '1,24 mld. Kč', '+4 % meziročně'], ['EBITDA marže', '6,1 %', 'stabilní'], ['Zadluženost', '44 %', 'zdravá'], ['Splatnost závazků', '52 dní', 'delší, typické pro stavebnictví']], source: 'Výroční zpráva 2025 ve Sbírce listin (PDF, auditovaná)', signal: 'Flotila je nákladové středisko. Hodnota je v TCO po střediscích, knize jízd a přidělení vozů.' },
    contracts: { public: 37, note: '37 smluv s veřejnými zadavateli v registru smluv (kraj, města, ŘSD).' },
    answers: { leasingCount: '41', leasingCompany: 'Raiffeisen‑Leasing', machines: 'ano', machinesCount: '26', telematics: 'ano', telematicsBrand: 'Výrobce (Škoda Connect, Ford Pro)', customers: ['verejne'], platforms: [], drivers: '140', extra: [], priorities: ['naklady', 'administrativa'] } },
  { id: 'agro', label: 'Agro Blata a.s.', tag: 'Zemědělství · fiktivní firma', live: false,
    company: { name: 'Agro Blata a.s.', ico: 'ukázka', dic: 'CZ ukázka', address: 'Ševětín 211, 373 63 Ševětín', region: 'Jihočeský kraj', legal: 121, founded: '1993-01-01', vat: true, nace: ['01110', '01410', '01610', '49410', '77310'] },
    register: { total: 57, kinds: { 'Traktory a stroje': 23, 'Přívěsy': 19, 'Osobní vozidla': 7, 'Nákladní vozidla': 5, 'Dodávky': 3 }, brands: [['John Deere', 9], ['Zetor', 5], ['Fendt', 3], ['CLAAS', 4], ['Tatra', 3]], fuel: { Diesel: 55, Benzín: 2 }, age: '7,8 roku', sites: ['Ševětín (středisko mechanizace)', 'Dynín (živočišná výroba)'] },
    economy: { rows: [['Tržby 2025', '212 mil. Kč', 'z toho dotace SZIF 38 mil.'], ['EBITDA marže', '11,2 %', 'sezónně kolísá'], ['Zadluženost', '39 %', 'stroje na úvěr'], ['Obhospodařovaná půda', '1 870 ha', 'z LPIS']], source: 'Účetní závěrka 2025 ve Sbírce listin (XML) a LPIS', signal: 'Kilometry nedávají smysl, počítá se v motohodinách a hektarech. Důležitá je zelená nafta a strojní pojištění.' },
    contracts: { public: 3, note: '3 smlouvy v registru smluv (pacht pozemků od obce a SPÚ).' },
    answers: { leasingCount: '0', leasingCompany: '', machines: 'ano', machinesCount: '11', telematics: 'ano', telematicsBrand: 'John Deere Operations Center', customers: [], platforms: [], drivers: '18', extra: ['sluzby'], priorities: ['palivo', 'compliance'] } },
]

// Doporučení profilů ze signálů: NACE, složení registru, odpovědi. Vrací seřazený seznam se zdůvodněním.
export function recommendProfiles({ nace = [], kinds = {}, answers = {} }) {
  const n = (k) => kinds[k] || 0
  const has = (pref) => nace.some((c) => String(c).startsWith(pref))
  const naceStr = (pref) => { const c = nace.find((x) => String(x).startsWith(pref)); return c ? `NACE ${naceFmt(c)} ${naceName(c)}` : '' }
  const a = answers
  const out = PROFILES.map((p) => {
    let score = 0; const why = []
    const add = (s, t) => { if (t) { score += s; why.push(t) } }
    if (p.id === 'linkova') {
      add(3, (has('4931') || has('49391')) && naceStr(has('4931') ? '4931' : '49391'))
      add(3, n('Autobusy') >= 5 && `${n('Autobusy')} autobusů v registru vozidel`)
      add(2, (a.customers || []).includes('kraj') && 'Objednatelem je kraj nebo město')
    }
    if (p.id === 'zajezdy') {
      add(2, has('49393') && naceStr('49393'))
      add(2, has('791') && naceStr('791'))
      add(1, n('Autobusy') >= 1 && !has('49393') && 'Autobusy v registru vozidel')
      add(3, (a.extra || []).includes('zajezdy') && 'Uvedli jste zájezdy a nepravidelnou dopravu')
    }
    if (p.id === 'nakladni') {
      add(3, has('4941') && naceStr('4941'))
      add(1, has('5229') && naceStr('5229'))
      add(2, (n('Tahače') + n('Nákladní vozidla')) >= 3 && `${n('Tahače') ? n('Tahače') + ' tahačů' : ''}${n('Tahače') && n('Nákladní vozidla') ? ' a ' : ''}${n('Nákladní vozidla') ? n('Nákladní vozidla') + ' nákladních vozidel' : ''} v registru`)
      add(1, n('Návěsy') >= 1 && `${n('Návěsy')} návěsů v registru`)
      add(2, (a.customers || []).includes('spedice') && 'Zákazníky jsou spedice a výrobní firmy')
    }
    if (p.id === 'taxi') {
      add(2, has('4932') && naceStr('4932'))
      add(3, (a.platforms || []).length > 0 && `Jezdíte pro ${(a.platforms || []).map((x) => ({ uber: 'Uber', bolt: 'Bolt', liftago: 'Liftago' })[x]).join(', ')}`)
      add(1, has('4932') && n('Osobní vozidla') >= 10 && `${n('Osobní vozidla')} osobních vozidel v registru`)
    }
    if (p.id === 'firemni') {
      const os = n('Osobní vozidla') + n('Dodávky')
      add(2, os >= 5 && `${n('Osobní vozidla')} osobních vozidel${n('Dodávky') ? ' a ' + n('Dodávky') + ' dodávek' : ''} v registru`)
      add(2, (has('41') || has('42') || has('43')) && naceStr(has('41') ? '41' : has('42') ? '42' : '43'))
      add(1, Number(a.leasingCount) > 0 && `${a.leasingCount} vozů na operativní leasing (v registru nejsou vidět)`)
      add(1, Number(a.drivers) >= 50 && !has('4932') && `${a.drivers} lidí s přiděleným vozem`)
    }
    if (p.id === 'agro') {
      add(3, has('01') && naceStr('01'))
      add(3, n('Traktory a stroje') >= 1 && `${n('Traktory a stroje')} traktorů a strojů v registru`)
      add(2, a.machines === 'ano' && Number(a.machinesCount) > 0 && `${a.machinesCount} strojů a nářadí mimo registr`)
    }
    const level = score >= 4 ? 'doporuceno' : score >= 2 ? 'zvazte' : 'ne'
    return { id: p.id, score, why, level }
  })
  return out.sort((x, y) => y.score - x.score)
}

export const TELEMATICS = ['Webfleet', 'Geotab', 'Samsara', 'Výrobce (Scania, Volvo, MAN RIO, Mercedes)', 'Výrobce (Škoda Connect, Ford Pro)', 'John Deere Operations Center', 'CLAAS Telematics', 'Jiná']
export const CUSTOMER_OPTS = [['kraj', 'Kraj nebo město (veřejná doprava)'], ['verejne', 'Veřejní zadavatelé (stavby, služby)'], ['spedice', 'Spedice a výrobní firmy'], ['firmy', 'Firemní zákazníci'], ['verejnost', 'Veřejnost']]
export const PLATFORM_OPTS = [['uber', 'Uber'], ['bolt', 'Bolt'], ['liftago', 'Liftago']]
export const EXTRA_OPTS = [['zajezdy', 'Zájezdy a nepravidelná doprava'], ['pronajem', 'Pronájem vozidel'], ['servis', 'Servis pro cizí'], ['phm', 'Prodej pohonných hmot'], ['sluzby', 'Služby strojů pro cizí']]
export const PRIORITY_OPTS = [['palivo', 'Úspora paliva'], ['naklady', 'Přehled o nákladech (TCO)'], ['administrativa', 'Méně administrativy'], ['pojisteni', 'Pojištění a škody'], ['compliance', 'Lhůty a compliance']]
