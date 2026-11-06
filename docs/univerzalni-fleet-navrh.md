# Fleet Portal pro všechny druhy flotil: návrh architektury

> Stav k 6. 11. 2026. Portál je dnes vyladěný pro autobusového dopravce (ČSAD AUTOBUSY České Budějovice).
> Cíl: stejný produkt má obsloužit kamionovou dopravu, taxi a ride-hailing flotily,
> běžné firemní flotily (mix osobních aut, dodávek, nákladních aut) a zemědělskou techniku,
> včetně firem, které jsou mixem několika z toho.

## 1. Kde je skutečný rozdíl mezi segmenty

Správa vozového parku jako taková se mezi segmenty téměř neliší. Vozidlo, doklady, STK, pojištění,
škody, servis, financování, náklady, lidé, účetnictví, mapa, reporting: to všechno dnes už máme a
platí to pro autobus i pro traktor. Liší se pět věcí:

| Oblast | Autobusy (linka) | Kamiony | Taxi / ride-hailing | Firemní flotila | Zemědělství |
|---|---|---|---|---|---|
| **Jednotka práce** | spoj na lince, zájezd | přeprava (zakázka) | jízda z platformy | rezervace / přidělení vozu | úkon na pozemku |
| **Jednotka výkonu** | km, spoje | km, tuny, palety | jízdy, hodiny online | km, dny přidělení | motohodiny, hektary |
| **Odkud přijdou peníze** | kompenzace objednatele, zájezdy | fakturace zakázek | výplaty platforem (Uber, Bolt, Liftago) | interní přeúčtování středisek | služby strojů, vlastní produkce |
| **Compliance** | profesní průkaz, lékařské prohlídky, JŘ | tachograf, AETR, ADR, CMR, mýto | koncese, evidence vozidla taxi, průkaz řidiče taxi | kniha jízd, soukromé jízdy, benefit 1 % | zelená nafta, strojní revize, sezónní STK |
| **Kdo s tím pracuje** | dispečer, správce, řidič | dispečer, speditér, řidič | fleet manažer, řidič (často OSVČ) | fleet manažer, zaměstnanec | agronom, mechanizátor, obsluha |

Z toho plyne hlavní pravidlo návrhu: **zobecnit datový model, ne obrazovky.** Dispečink taxi není
dispečink autobusů a nemá smysl je tlačit do jedné univerzální tabulky. Ale pod nimi má ležet jeden
společný "deník výkonů", který živí náklady, využití, hodnocení řidičů, fakturaci i anomálie.

## 2. Tři vrstvy systému

### 2.1 Jádro (společné pro všechny)

- **Majetek** místo "Vozidla": registr všech aktiv s typem (`kind`). Osobní, dodávka, nákladní, tahač,
  návěs, přívěs, autobus, minibus, traktor, sklízecí mlátička, postřikovač, nářadí, manipulační technika.
  Typ určuje, co se u položky eviduje (SPZ a VIN, nebo výrobní číslo a motohodiny), jaké lhůty hlídáme
  a jaké pojištění dává smysl.
- **Lidé** s rolemi podle provozu (řidič, obsluha stroje, agronom, speditér).
- **Deník výkonů** (viz 2.3): jediná společná tabulka práce.
- **Peníze**: náklady, TCO, účetnictví, financování, fakturace, mzdy. Beze změny.
- **Rizika**: pojištění, škody, anomálie. Pojistné produkty se liší podle profilu (viz §5).
- **Dokumenty, kontakty, mapa, reporting, nastavení.**

### 2.2 Provozní profily (pluginy podle segmentu)

Firma si v nastavení zapne jeden nebo více **provozů**. Každý provoz má profil a profil přináší své
moduly, KPI, role, terminologii a kontroly. Firma není "segment", firma je **množina provozů**:
ČSAD = Linková doprava + Zájezdy + Firemní vozidla. Farma = Zemědělství + Nákladní doprava + Firemní vozidla.

| Profil | Moduly navíc | Dashboard KPI | Specifické kontroly |
|---|---|---|---|
| **Linková doprava** | Linky a JŘ, Vyúčtování výkonů, Eco-driving, Elektrobusy | dodržení JŘ, výkony vs. smlouva, penalizace | profesní průkaz, lékařská prohlídka, JŘ platnost |
| **Zájezdy a příležitostná doprava** | Zájezdy (už máme) | obsazenost vozů, marže na zájezd | 2. řidič podle AETR |
| **Nákladní doprava** | Zakázky a přepravy, Tachograf a AETR, Mýto a palivo, CMR a ADR | km s nákladem vs. prázdné, Kč/km, výnos na soupravu, porušení AETR | stažení tachografu (28/90 dní), ADR školení, mýto vs. telematika |
| **Taxi a ride-hailing** | Jízdy a platformy, Vyúčtování řidičů, Pronájem vozů řidičům | výnos na hodinu online, obsazenost, výnos/km, pokuty | koncese, evidence vozidla taxislužby, průkaz řidiče taxi, kauce |
| **Firemní flotila** | Kniha jízd, Rezervace pool vozů, Přidělení a předávací protokoly, Car policy | TCO na vůz a středisko, soukromé km, využití pool vozů | kniha jízd pro daně, benefit 1 %, předání vozu |
| **Zemědělství** | Pozemky a úkony, Motohodiny a sezóny, Zelená nafta, Služby strojů | náklady na hektar, využití strojů v sezóně, spotřeba na mth | strojní revize, vratka spotřební daně, sezónní pojištění |

### 2.3 Deník výkonů: společný základ

Spoj, přeprava, jízda, rezervace i úkon na poli jsou všechno jeden typ záznamu **Výkon**:

```
Výkon {
  id, provoz, typ            // spoj | zajezd | preprava | jizda | rezervace | ukon
  kdo: driverId[]            // řidič, obsluha, 2. řidič
  cim: assetId[]             // tahač + návěs, traktor + nářadí, autobus
  kdy: od, do, status        // plán, potvrzeno, probíhá, hotovo, vyúčtováno
  kde: trasa | místo | pozemek
  kolik: { km, mth, pax, t, palety, ha }     // jen jednotky, které profil používá
  zaKolik: { výnos, zdroj }  // kompenzace, faktura, platforma, interní
  naklady: { palivo, mýto, mzda, opotřebení }
  log: [{ kdy, kdo, co, kam }]  // auditní stopa jako dnes u zájezdů
}
```

Co z toho máme zadarmo napříč segmenty:
- **Blokace** vozu a člověka na termín (dnes už u zájezdů) funguje stejně pro přepravu i úkon na poli.
- **Profil řidiče / obsluhy** ukazuje, co ho čeká, bez ohledu na druh práce.
- **TCO a využití** se počítá z jedné tabulky: km, motohodiny, hodiny v práci.
- **Anomálie** porovnávají výkon vs. telematiku (palivo, trasa, čas) stejně pro kamion jako pro traktor.
- **Fakturace** navazuje na výkon: dnešní kalkulace zájezdu → nabídka → doklad je přesně tok, který
  potřebuje zakázka v kamionové dopravě. Modul Zájezdy je ve skutečnosti první verze modulu Zakázky.

## 3. Jak to dostat do dnešního kódu

Dnešní architektura to unese s malými zásahy, většina práce je konfigurace a data.

1. **`PROFILES`** konfigurace: id, název, moduly (nav id), KPI pro dashboard, role, slovník, jednotky,
   kontroly. **`state.tenant.provozy`** = zapnuté profily. Menu se skládá z jádra + modulů zapnutých profilů
   (dnes `NAV_GROUP_OF`, stačí přidat filtr).
2. **Slovník** `t(klíč)` podle aktivního profilu: řidič / obsluha, vůz / stroj, vozovna / depo /
   středisko, směna / jízda / úkon. Texty v UI jdou přes slovník, výchozí zůstává dnešní.
3. **Typ majetku** `kind` na vozidle (dnes `druh` + `isBus`) rozhoduje o záložkách detailu
   (Tachograf jen u nákladních, Motohodiny u strojů, Platformy u taxi) a o jednotce v KPI.
4. **Výkon** jako datová entita: dnešní `shifts` (spoje), `zajTrips` (zájezdy) a směny řidičů
   převést na jeden seznam `vykony` s `typ`. Obrazovky zůstanou, jen čtou a zapisují do jednoho místa.
5. **Přepínač demo firmy** v topbaru vedle přepínače role. Totéž, co dnes dělá přepínač rolí pro
   persony, udělá pro segmenty: stejný portál se před zákazníkem "přelije" z ČSAD na kamionovou firmu,
   taxi flotilu, stavební firmu nebo farmu. To je nejsilnější prodejní argument, protože ukazuje, že
   produkt není jednoúčelový.
6. **Demo firmy** fiktivní, ale oborově věrné (žádná reálná firma s vymyšlenými daty):
   - **TransLog Jih s.r.o.**: 28 souprav, mezinárodní přepravy, mýto, AETR, dvě základny.
   - **CityRide Praha s.r.o.**: 60 vozů (Toyota Corolla hybrid, Škoda Octavia, VW ID.4), 90 řidičů
     na pronájem vozu, výplaty Uber/Bolt/Liftago týdně.
   - **Stavby Vltava a.s.**: 140 vozidel, mix osobních, dodávek, sklápěčů, manipulační techniky,
     přidělení zaměstnancům a střediskům, kniha jízd.
   - **Agro Blata a.s.**: 1 900 ha, traktory John Deere a Zetor, sklízecí mlátička, postřikovač,
     3 nákladní auta, sezónní špičky, zelená nafta.
   - **ČSAD AUTOBUSY České Budějovice** zůstává jako dnes (reálný park z registru, linková + zájezdy).

## 4. Co je v jednotlivých segmentech specifické a nesmí se zjednodušit

**Kamiony.** Tachograf není jen další doklad: zákon chce stažení karty řidiče každých 28 dní a vozidla
každých 90, portál má hlídat lhůty a ukazovat porušení AETR (denní doba řízení, přestávky, týdenní
odpočinek). Mýto se páruje s telematikou (ujeté zpoplatněné úseky vs. vyúčtování mýta). Zakázka má
nakládku, vykládku, CMR, palety a často cizí měnu a diety. Souprava = tahač + návěs jako dva majetky
spojené na čas zakázky.

**Taxi a ride-hailing.** Řidič je často OSVČ, který si vůz pronajímá. Modul proto potřebuje smlouvu o
pronájmu, kauci, týdenní vyúčtování (výplata z platformy mínus nájem, palivo, pokuty, poškození) a import
výpisů z platforem. Hlavní metrika není km, ale výnos na hodinu online a obsazenost. Pokuty se
přefakturují konkrétnímu řidiči podle času jízdy. Compliance: koncese, evidence vozidla taxislužby,
průkaz řidiče taxi, u elektromobilů nabíjení v plánu směn.

**Firemní flotila.** Tady portál nevydělává, šetří. Jádrem je přidělení vozu zaměstnanci nebo středisku,
předávací protokol s fotkami a stavem tachometru, kniha jízd rozdělená na služební a soukromé jízdy
(podklad pro daně a benefit 1 % ze vstupní ceny), rezervace pool vozů, car policy (kdo má na jaký vůz
nárok), palivové karty a přiřazení pokut. Reporting jde po střediscích, ne po linkách.

**Zemědělství.** Kilometry nedávají smysl, počítá se v motohodinách a hektarech. Výkon je úkon
(orba, setí, postřik, sklizeň) na pozemku, pozemky lze načíst z LPIS (veřejné rozhraní). Sezóna mění
všechno: KPI se porovnávají se stejným obdobím loňska, ne s minulým měsícem. Stroje často nejsou
registrované, takže místo POV a havarijního jde o strojní pojištění a pojištění plodin. Zelená nafta
je reálná agenda: evidence spotřeby na zemědělské práce a čtvrtletní nárok na vratku spotřební daně.
Telematika přichází z platforem výrobců (John Deere Operations Center, CLAAS Telematics, Fendt).

## 5. Pojištění jako spojovací prvek (makléřský úhel)

Portál provozuje makléř, a právě pojištění je oblast, kde se segmenty liší nejvíc a kde makléř
přidává hodnotu. Profil provozu přinese vlastní sadu produktů do modulu Pojištění:

- Linková doprava: flotilové POV a HAV, odpovědnost dopravce za cestující a zavazadla, přerušení provozu.
- Kamiony: odpovědnost silničního dopravce (CMR), pojištění nákladu, kabotáž, finanční způsobilost dopravce.
- Taxi: flotila s vyšším rizikem, úrazové pojištění přepravovaných osob, pojištění pronajatého vozu
  proti škodě způsobené nájemcem.
- Firemní flotila: flotila POV a HAV, GAP u financovaných vozů, pojištění odpovědnosti zaměstnance.
- Zemědělství: strojní pojištění, pojištění plodin a zvířat, odpovědnost z provozu nerezistrovaných strojů.

Škodní událost pak dostane i oborové kroky (CMR reklamace, škoda na nákladu, škoda nájemce vozu).

## 6. Doporučené pořadí

1. **Základ (1 blok práce):** profily, slovník, `kind` majetku, deník výkonů ze stávajících směn a zájezdů,
   přepínač demo firmy. Nic viditelného se nerozbije, ale všechno další se na to postaví.
2. **Firemní flotila:** nejblíž tomu, co máme, nejširší trh, data ČSAD už obsahují osobní auta a
   přívěsy. Přidělení, předávací protokol, kniha jízd, rezervace pool vozů.
3. **Kamiony:** Zakázky vzniknou zobecněním Zájezdů (kalkulace, nabídka, přiřazení soupravy a řidiče,
   doklad). Nově tachograf a AETR, mýto, CMR.
4. **Taxi:** import výpisů platforem, vyúčtování řidičů, pronájem vozů. Účetnictví máme.
5. **Zemědělství:** pozemky a úkony, motohodiny, sezóny, zelená nafta. Nejodlišnější, ale největší
   odlišení od konkurence a nejzajímavější makléřsky.

## 7. Rozhodnutí k potvrzení

- Firma = množina provozů (doporučeno), ne jeden segment na firmu.
- Přepínač demo firmy v topbaru vedle rolí; ČSAD zůstává výchozí.
- Názvy demo firem fiktivní (návrhy v §3).
- Zájezdy přejmenovat obecně na Zakázky až ve chvíli, kdy přibude kamionový profil, do té doby nechat.
