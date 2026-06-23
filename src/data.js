// Realistic Czech fleet data — ported 1:1 from the design bundle.

export const insurersData = [
  { name: 'Kooperativa', pct: 34, color: '#2058C9' },
  { name: 'Allianz', pct: 22, color: '#16A34A' },
  { name: 'ČPP', pct: 18, color: '#C2780C' },
  { name: 'Generali', pct: 14, color: '#8B5CF6' },
  { name: 'UNIQA', pct: 7, color: '#0EA5A5' },
  { name: 'ČSOB Poj.', pct: 5, color: '#9B0E25' },
]

export const brandsData = [
  { name: 'Škoda', count: 119, pct: 38, color: '#2058C9' },
  { name: 'Volkswagen', count: 59, pct: 19, color: '#3A7BE0' },
  { name: 'Audi', count: 37, pct: 12, color: '#16A34A' },
  { name: 'BMW', count: 28, pct: 9, color: '#C2780C' },
  { name: 'Mercedes-Benz', count: 25, pct: 8, color: '#8B5CF6' },
  { name: 'Ostatní', count: 44, pct: 14, color: '#A1A1AA' },
]

export const fleetsData = [
  { id: 'f1', name: 'Praha – Centrála', manager: 'Petr Novák', vehicles: 84, premium: 4280000, claims: 12, risk: 72, insurers: ['Kooperativa', 'Allianz'], renewals: 7, policy: '7720 134 567', policyStart: '1. 1. 2024' },
  { id: 'f2', name: 'Mladá Boleslav – Sklad', manager: 'Jana Dvořáková', vehicles: 56, premium: 2640000, claims: 7, risk: 64, insurers: ['ČPP', 'Generali'], renewals: 4, policy: '0019 283 746', policyStart: '1. 4. 2024' },
  { id: 'f3', name: 'Brno – Pobočka', manager: 'Tomáš Svoboda', vehicles: 48, premium: 2180000, claims: 9, risk: 81, insurers: ['Kooperativa'], renewals: 11, policy: '7720 156 789', policyStart: '1. 7. 2023' },
  { id: 'f4', name: 'Servisní vozy', manager: 'Martin Horák', vehicles: 32, premium: 1120000, claims: 4, risk: 58, insurers: ['UNIQA', 'ČSOB'], renewals: 2, policy: '2401 558 899', policyStart: '1. 10. 2024' },
  { id: 'f5', name: 'Management & Exekutiva', manager: 'Lucie Marešová', vehicles: 18, premium: 1640000, claims: 1, risk: 91, insurers: ['Allianz'], renewals: 1, policy: '4055 123 987', policyStart: '1. 1. 2025' },
  { id: 'f6', name: 'Dlouhodobý pronájem', manager: 'Jan Kučera', vehicles: 74, premium: 3050000, claims: 15, risk: 55, insurers: ['Generali', 'ČPP'], renewals: 9, policy: '5544 098 712', policyStart: '1. 3. 2024' },
]

// Škodní průběh (loss ratio) a nastavená pásma bonifikace (vrácení části provize dle škodního průběhu)
const fleetBonus = {
  f1: { lossRatio: 34, bonus: [[30, 18], [40, 12], [50, 6]] },
  f2: { lossRatio: 41, bonus: [[30, 15], [40, 10], [50, 5]] },
  f3: { lossRatio: 52, bonus: [[30, 20], [40, 14], [50, 8]] },
  f4: { lossRatio: 28, bonus: [[30, 12], [40, 8], [50, 4]] },
  f5: { lossRatio: 19, bonus: [[30, 22], [40, 16], [50, 9]] },
  f6: { lossRatio: 47, bonus: [[30, 16], [40, 11], [50, 6]] },
}
fleetsData.forEach((f) => {
  const b = fleetBonus[f.id]
  if (b) { f.lossRatio = b.lossRatio; f.bonus = b.bonus.map(([threshold, rate]) => ({ threshold, rate })) }
})

export const vehiclesData = [
  { id: 'v1', plate: '5SK 8841', brand: 'Škoda', model: 'Octavia Combi 2.0 TDI', year: 2023, driver: 'Petr Novák', fleet: 'f1', insurer: 'Kooperativa', status: 'active', premium: 18400, renewal: '14. 9. 2026', fuel: 'Diesel', vin: 'TMBJJ7NE5P0123456', mileage: '62 400 km', value: '640 000 Kč' },
  { id: 'v2', plate: '7B2 4410', brand: 'Škoda', model: 'Superb iV', year: 2022, driver: 'Lucie Marešová', fleet: 'f5', insurer: 'Allianz', status: 'active', premium: 26800, renewal: '2. 7. 2026', fuel: 'PHEV', vin: 'TMBJG9NP7N0223344', mileage: '48 100 km', value: '880 000 Kč' },
  { id: 'v3', plate: '4AU 1290', brand: 'Volkswagen', model: 'Passat Variant', year: 2021, driver: 'Tomáš Svoboda', fleet: 'f3', insurer: 'Kooperativa', status: 'soon', premium: 21200, renewal: '28. 6. 2026', fuel: 'Diesel', vin: 'WVWZZZ3CZME556677', mileage: '91 300 km', value: '520 000 Kč' },
  { id: 'v4', plate: '8EX 7733', brand: 'Audi', model: 'A6 Avant 50 TDI', year: 2023, driver: 'Jan Kučera', fleet: 'f6', insurer: 'Generali', status: 'active', premium: 34500, renewal: '20. 11. 2026', fuel: 'Diesel', vin: 'WAUZZZF20PN778899', mileage: '54 700 km', value: '1 240 000 Kč' },
  { id: 'v5', plate: '2BM 5567', brand: 'BMW', model: '320d Touring', year: 2022, driver: 'Martin Horák', fleet: 'f4', insurer: 'UNIQA', status: 'active', premium: 29900, renewal: '5. 10. 2026', fuel: 'Diesel', vin: 'WBA5E710X0G445566', mileage: '70 200 km', value: '780 000 Kč' },
  { id: 'v6', plate: '9ME 2201', brand: 'Mercedes-Benz', model: 'E 220d', year: 2024, driver: 'Lucie Marešová', fleet: 'f5', insurer: 'Allianz', status: 'active', premium: 38200, renewal: '11. 12. 2026', fuel: 'Diesel', vin: 'W1K2130461A998877', mileage: '21 800 km', value: '1 460 000 Kč' },
  { id: 'v7', plate: '1EV 9087', brand: 'Tesla', model: 'Model 3 Long Range', year: 2024, driver: 'Petr Novák', fleet: 'f1', insurer: 'ČPP', status: 'active', premium: 31400, renewal: '19. 8. 2026', fuel: 'Elektro', vin: '5YJ3E7EA7PF112233', mileage: '29 500 km', value: '1 120 000 Kč' },
  { id: 'v8', plate: '3EV 4412', brand: 'Škoda', model: 'Enyaq iV 80', year: 2023, driver: 'Jana Dvořáková', fleet: 'f2', insurer: 'ČPP', status: 'active', premium: 27600, renewal: '30. 9. 2026', fuel: 'Elektro', vin: 'TMBJV9NU2P5334455', mileage: '40 100 km', value: '980 000 Kč' },
  { id: 'v9', plate: '6HY 3320', brand: 'Hyundai', model: 'Tucson 1.6 T-GDI', year: 2021, driver: 'Tomáš Svoboda', fleet: 'f3', insurer: 'Generali', status: 'nocasco', premium: 16900, renewal: '15. 7. 2026', fuel: 'Benzín', vin: 'TMAJ3815AMJ667788', mileage: '88 900 km', value: '440 000 Kč' },
  { id: 'v10', plate: '4VW 8800', brand: 'Volkswagen', model: 'Transporter T6.1', year: 2020, driver: 'Martin Horák', fleet: 'f4', insurer: 'ČSOB', status: 'active', premium: 23100, renewal: '28. 10. 2026', fuel: 'Diesel', vin: 'WV1ZZZ7HZLH009988', mileage: '118 400 km', value: '560 000 Kč' },
  { id: 'v11', plate: '5KQ 1144', brand: 'Škoda', model: 'Kodiaq 2.0 TDI 4×4', year: 2022, driver: 'Jan Kučera', fleet: 'f6', insurer: 'Generali', status: 'active', premium: 24700, renewal: '8. 11. 2026', fuel: 'Diesel', vin: 'TMBJK7NS9N8112299', mileage: '66 700 km', value: '820 000 Kč' },
  { id: 'v12', plate: '7AQ 6651', brand: 'Audi', model: 'Q5 40 TDI quattro', year: 2023, driver: 'Lucie Marešová', fleet: 'f5', insurer: 'Allianz', status: 'active', premium: 33800, renewal: '22. 12. 2026', fuel: 'Diesel', vin: 'WAUZZZFY8P2554433', mileage: '33 200 km', value: '1 180 000 Kč' },
  { id: 'v13', plate: '2SC 7790', brand: 'Škoda', model: 'Scala 1.5 TSI', year: 2021, driver: 'Petr Novák', fleet: 'f1', insurer: 'Kooperativa', status: 'overdue', premium: 14200, renewal: '20. 6. 2026', fuel: 'Benzín', vin: 'TMBEM6NW0M3667722', mileage: '72 600 km', value: '360 000 Kč' },
  { id: 'v14', plate: '8TY 3398', brand: 'Toyota', model: 'Corolla TS Hybrid', year: 2022, driver: 'Jana Dvořáková', fleet: 'f2', insurer: 'ČPP', status: 'active', premium: 15800, renewal: '4. 9. 2026', fuel: 'Hybrid', vin: 'SB1KW3JE10E223311', mileage: '51 900 km', value: '520 000 Kč' },
  { id: 'v15', plate: '1IX 5520', brand: 'BMW', model: 'iX3 M Sport', year: 2024, driver: 'Jan Kučera', fleet: 'f6', insurer: 'Allianz', status: 'active', premium: 35600, renewal: '14. 1. 2027', fuel: 'Elektro', vin: 'WBAEW5104P9554477', mileage: '18 300 km', value: '1 340 000 Kč' },
  { id: 'v16', plate: '9OC 2284', brand: 'Škoda', model: 'Octavia 1.5 TSI', year: 2020, driver: 'Tomáš Svoboda', fleet: 'f3', insurer: 'Kooperativa', status: 'nocasco', premium: 13900, renewal: '22. 7. 2026', fuel: 'Benzín', vin: 'TMBAG7NE0L0998822', mileage: '104 200 km', value: '320 000 Kč' },
  // Ukončená vozidla (odhlášená z pojištění)
  { id: 'v17', plate: '3FA 1180', brand: 'Škoda', model: 'Fabia 1.0 TSI', year: 2019, driver: 'Petr Novák', fleet: 'f3', insurer: 'Generali', status: 'ended', premium: 11200, renewal: '—', fuel: 'Benzín', vin: 'TMBER6NW9K0334411', mileage: '132 800 km', value: '180 000 Kč', endedDate: '12. 5. 2026', endReason: 'Prodej vozidla' },
  { id: 'v18', plate: '1AB 2030', brand: 'Volkswagen', model: 'Golf 1.6 TDI', year: 2018, driver: 'Petr Novák', fleet: 'f1', insurer: 'Kooperativa', status: 'ended', premium: 13400, renewal: '—', fuel: 'Diesel', vin: 'WVWZZZ1KZJW556677', mileage: '168 400 km', value: '150 000 Kč', endedDate: '28. 4. 2026', endReason: 'Vyřazení z provozu' },
  { id: 'v19', plate: '9KL 4477', brand: 'Ford', model: 'Transit Custom', year: 2017, driver: 'Martin Horák', fleet: 'f4', insurer: 'ČSOB', status: 'ended', premium: 18900, renewal: '—', fuel: 'Diesel', vin: 'WF0YXXTTGYHA12345', mileage: '214 000 km', value: '160 000 Kč', endedDate: '3. 3. 2026', endReason: 'Totální škoda' },
  { id: 'v20', plate: '6OP 8812', brand: 'Audi', model: 'A4 Avant 2.0 TDI', year: 2018, driver: 'Jan Kučera', fleet: 'f6', insurer: 'Generali', status: 'ended', premium: 22100, renewal: '—', fuel: 'Diesel', vin: 'WAUZZZ8K9JA778899', mileage: '196 500 km', value: '320 000 Kč', endedDate: '19. 2. 2026', endReason: 'Ukončení leasingu' },
]

// Číslo přihlášky vozidla do flotilové smlouvy (registration into the fleet policy)
vehiclesData.forEach((v, i) => { v.prihlaska = `PŘ-${v.year}/${String(118 + i * 13).padStart(4, '0')}` })

export const claimsData = [
  { id: 'CLM-2026-0142', vehicle: 'Škoda Octavia · 5SK 8841', vId: 'v1', type: 'Havárie – křižovatka', risk: 'HAV', reportedBy: 'Petr Novák', status: 'repair', insurer: 'Kooperativa', estimate: 84000, payout: 0, date: '28. 5. 2026', shop: 'AutoCentrum Praha', adjuster: 'Pavel Říha', progress: 60, location: 'Praha 4, Jižní spojka × 5. května', police: true, description: 'Protijedoucí vozidlo nedalo přednost v jízdě při odbočování vlevo a došlo k čelnímu střetu. Poškozena přední část vozu (nárazník, kapota, chladič, levý světlomet). Vozidlo nepojízdné, odtaženo na servis.' },
  { id: 'CLM-2026-0138', vehicle: 'Tesla Model 3 · 1EV 9087', vId: 'v7', type: 'Sklo – čelní', risk: 'Skla', reportedBy: 'Petr Novák', status: 'approved', insurer: 'ČPP', estimate: 12400, payout: 11400, date: '12. 5. 2026', shop: 'AutoSklo Express', adjuster: 'Eva Horká', progress: 100, location: 'D1, km 21 směr Brno', police: false, description: 'Odlétnutý kamínek od projíždějícího nákladního vozidla způsobil prasklinu čelního skla v délce cca 25 cm v zorném poli řidiče. Sklo vyměněno.' },
  { id: 'CLM-2026-0131', vehicle: 'BMW 320d · 2BM 5567', vId: 'v5', type: 'Parkovací škoda', risk: 'POV', reportedBy: 'Martin Horák', status: 'reported', insurer: 'UNIQA', estimate: 31500, payout: 0, date: '2. 6. 2026', shop: '—', adjuster: 'Nepřiřazen', progress: 10, location: 'Praha 5, OC Nový Smíchov – parkoviště', police: false, description: 'Vozidlo bylo na parkovišti poškozeno neznámým vozidlem při couvání. Promáčknutý zadní nárazník a pátá dveře, viník z místa ujel. Hrazeno z povinného ručení viníka.' },
  { id: 'CLM-2026-0125', vehicle: 'VW Transporter · 4VW 8800', vId: 'v10', type: 'Krupobití', risk: 'HAV', reportedBy: 'Martin Horák', status: 'closed', insurer: 'ČSOB', estimate: 47800, payout: 42800, date: '18. 4. 2026', shop: 'Servis MB Brno', adjuster: 'Jiří Malý', progress: 100, location: 'Brno, Heršpická – venkovní stání', police: false, description: 'Zaparkované vozidlo bylo zasaženo silným krupobitím. Vícečetné promáčkliny na kapotě, střeše a víku zavazadlového prostoru. Oprava metodou bezlakového vyrovnání.' },
  { id: 'CLM-2026-0119', vehicle: 'Audi A6 · 8EX 7733', vId: 'v4', type: 'Odcizení kol', risk: 'HAV', reportedBy: 'Jan Kučera', status: 'liquidation', insurer: 'Generali', estimate: 58000, payout: 0, date: '30. 5. 2026', shop: '—', adjuster: 'Petra Nová', progress: 40, location: 'Praha 1, Opletalova – ulice', police: true, description: 'Z odstaveného vozidla byla v noci odcizena všechna čtyři kola z lehkých slitin i s pneumatikami. Vozidlo ponecháno na zvedácích. Událost nahlášena Policii ČR.' },
  { id: 'CLM-2026-0112', vehicle: 'Hyundai Tucson · 6HY 3320', vId: 'v9', type: 'Střet se zvěří', risk: 'HAV', reportedBy: 'Tomáš Svoboda', status: 'closed', insurer: 'Generali', estimate: 26300, payout: 21300, date: '22. 3. 2026', shop: 'AutoCentrum Brno', adjuster: 'Pavel Říha', progress: 100, location: 'I/43 u Černé Hory', police: true, description: 'Na silnici vběhla do vozovky srna, došlo ke střetu. Poškozená přední maska, chladič a kapota. Doložen doklad od myslivecké stráže.' },
  { id: 'CLM-2026-0151', vehicle: 'VW Passat · 4AU 1290', vId: 'v3', type: 'Škoda způsobená třetí osobě', risk: 'POV', reportedBy: 'Tomáš Svoboda', status: 'liquidation', insurer: 'Kooperativa', estimate: 56000, payout: 0, date: '8. 6. 2026', shop: '—', adjuster: 'Petra Nová', progress: 30, location: 'Brno, Pekařská – parkoviště', police: false, description: 'Při couvání řidič přehlédl zaparkované vozidlo třetí osoby a narazil do jeho boku. Škoda na cizím vozidle hrazena z povinného ručení naší flotily.' },
  { id: 'CLM-2026-0147', vehicle: 'Mercedes E 220d · 9ME 2201', vId: 'v6', type: 'Sklo – boční', risk: 'Skla', reportedBy: 'Lucie Marešová', status: 'approved', insurer: 'Allianz', estimate: 8600, payout: 7600, date: '5. 6. 2026', shop: 'AutoSklo Express', adjuster: 'Eva Horká', progress: 100, location: 'Praha 7, Jankovcova', police: true, description: 'Rozbité boční okno řidiče při pokusu o vloupání do vozidla. Sklo vyměněno, interiér nepoškozen. Událost nahlášena Policii ČR.' },
]

export const statusMeta = {
  active: { label: 'Aktivní', c: '#16A34A', bg: '#E7F6ED' },
  soon: { label: 'Brzy obnova', c: '#C2780C', bg: '#FBF1DF' },
  overdue: { label: 'Po splatnosti', c: '#C8102E', bg: '#FDECEE' },
  nocasco: { label: 'Bez havarijního', c: '#2058C9', bg: '#EAF0FC' },
  ended: { label: 'Ukončeno', c: '#5B5B63', bg: '#F1F1F3' },
}

export const claimStatusMeta = {
  reported: { label: 'Nahlášeno', c: '#2058C9', bg: '#EAF0FC' },
  liquidation: { label: 'V likvidaci', c: '#C2780C', bg: '#FBF1DF' },
  repair: { label: 'V opravě', c: '#C2780C', bg: '#FBF1DF' },
  approved: { label: 'Schváleno', c: '#16A34A', bg: '#E7F6ED' },
  closed: { label: 'Uzavřeno', c: '#5B5B63', bg: '#F1F1F3' },
}

export const fleetName = (id) => {
  const f = fleetsData.find((x) => x.id === id)
  return f ? f.name : '—'
}

export const statusChip = (s) => {
  const m = statusMeta[s]
  return `display:inline-flex;align-items:center;gap:6px;font-size:11.5px;font-weight:600;color:${m.c};background:${m.bg};padding:3px 9px;border-radius:20px;white-space:nowrap`
}
