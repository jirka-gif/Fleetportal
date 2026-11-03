# Fleet Portal pro autobusovou (a kamionovou) dopravu — analýza a návrh

> Podklad pro schůzku s dopravci autobusové dopravy. Cíl: představit Fleet Portal
> jako nástroj správy vozového parku s telematikou, která přináší **reálnou úsporu
> paliva**, a s modulem **jízdních řádů a vyhodnocení jízdy po linkách** včetně
> detekce anomálií. Hodnotíme celý park, jednotlivé autobusy/kamiony i řidiče.

## 1. Co trh používá (CZ / EU / svět)

**Globální hráči (telematika + fleet management):** Samsara, Geotab, Webfleet
(Bridgestone), MiX Telematics / Powerfleet, Microlise, Michelin Connected Fleet.
Výrobci: Scania Fleet Management + Driver support, MAN (RIO/Perform), Volvo
Connect, Mercedes Fleetboard, ZF/Openmatics.

**Veřejná doprava (plánování + sledování provozu, AVL/ITS):** INIT, Trapeze
(TransitMaster), IVU.suite, Hogia, Hanover. Řeší CAD/AVL, dodržování jízdního
řádu (schedule adherence), informace pro cestující, počítání cestujících.

**Česko:** telematiku využívá přes 35 % firem (nad evropským průměrem), ale jen
~13 % kvůli ekologii (vs. ~25 % ve zbytku EU) — prostor odlišit se "úsporovým"
příběhem. Lokální jízdní řády: celostátní systém **CIS JŘ** (data ve formátech
JDF a GTFS), pro jižní Čechy máme reálná data linek (viz §5).

**Doložené úspory paliva z eco-drivingu (vše vendor-reported, berme orientačně):**
- Geotab × DB Regio Bus: úspora paliva až **10 %** (+ Fairfleet Eco app pro řidiče).
- Webfleet OptiDrive 360: snížení spotřeby až **15 %**.
- MiX Telematics (bus): typicky **~8 %**, cíl double-digit (Cardiff Bus).
- Webfleet × EP Cargo (CZ, kamiony): **5–10 %** (cca 2–3 l/100 km).
- Studie: přechod jednoho busu z agresivní na ekonomickou jízdu ~**16,9 l nafty/den**.

**Benchmark dodržení JŘ:** standard TCQSM — spoj je "včas" při zpoždění **0 až +5 min**.
RTC Reno po nasazení AVL zvýšilo on-time z 91,5 % na 95,3 %.

### Co z toho plyne pro nás
Nestavíme "další GPS krabičku". Pozice Fleet Portalu: **jeden portál makléře**,
kde se k pojištění, nákladům a správě parku přidává **telematické hodnocení jízdy
a úspora paliva** + **provozní vyhodnocení linek**. To žádná pojišťovna/makléř
standardně nenabízí a je to silný důvod, proč dopravce chce portál používat.

## 2. Telematika z jednotky — co měříme

Jednotka v autobuse/kamionu čte z CAN/jednotky:
- **Rozjezdy a akcelerace** (prudké rozjezdy, plný plyn)
- **Brzdění** (prudké brzdění, dojíždění/coasting)
- **Volnoběh** (idling) a stání s běžícím motorem
- **Nezávislé topení** (Webasto/Eberspächer) — doba běhu a spotřeba, detekce
  zbytečného provozu (topení běží na odstaveném voze / mimo potřebu)
- **Otáčky** (over-revving), **rychlost** (překračování), **spotřeba l/100 km**

Z toho skládáme **Eco-skóre (0–100)** pro **park → vůz → řidič** (aktuální i
historicky) a **potenciál úspory** v litrech / Kč / CO₂.

## 3. Navrhované moduly do Fleet Portalu

### A) Nová kategorie "Autobusy"
Dnes `vehicleTypeCat` řadí autobusy pod "Nákladní vozidla". Oddělíme **Autobusy**
jako vlastní typ (grafy, filtry, sekce). Eco-driving se týká busů i kamionů.

### B) Modul "Eco-driving / Úspora paliva"
- **Dashboard úspory:** eco-skóre parku, potenciál úspory (l / Kč / CO₂ za měsíc),
  trend, TOP a nejslabší řidiči/vozy.
- **Vůz:** rozpad událostí (rozjezdy, brzdění, volnoběh, topení), spotřeba vs.
  referenční, náklad na volnoběh a nezávislé topení v Kč.
- **Řidič:** eco-skóre, žebříček (gamifikace), historie, coaching tipy, kolik by
  ušetřil při zlepšení na cílové skóre. Hodnotíme i **řidiče, kteří na voze jezdili
  dřív** (navazuje na už hotovou "Historii používání").
- **Nezávislé topení:** samostatný pohled — doba běhu, zbytečné starty, úspora.

### C) Modul "Linky & Jízdní řády" (autobusy)
- **Linky:** číslo, trasa, dopravce, počet zastávek, spojů/den, přiřazený vůz a řidič.
- **Jízdní řád linky:** sekvence zastávek + plánované časy (reálná data).
- **Vyhodnocení jízdy (plán vs. skutečnost):** zpoždění/náskok na každé zastávce,
  **dodržení JŘ** (on-time %, pravidlo 0 až +5 min), profil jízdy po úsecích.
- **Detekce anomálií:** velké zpoždění, předjetí (odjezd dřív), vynechaná zastávka,
  nadměrná spotřeba / běh topení na úseku, nahromadění prudkých událostí na lince.
- **Vyhodnocení per linka / per vůz / per řidič** + feed anomálií.

### D) Hodnocení (park / vůz / řidič)
Průřezově: skóre a trendy na všech třech úrovních, aktuální i historicky.

## 4. Jak to demonstrujeme na schůzce
- Reálné jihočeské linky (DPMČB) v modulu Linky.
- Nad plánovaným JŘ "přehrajeme" skutečnou jízdu (telematická vrstva je pro demo
  dopočítaná deterministicky z plánu — poctivě označeno), ukážeme zpoždění po
  zastávkách a vyskočí anomálie.
- Eco-driving: eco-skóre vozů a řidičů + spočtená úspora paliva a nákladu na
  nezávislé topení.

## 5. Demo data (reálná, jižní Čechy)
Zdroj: **CIS JŘ** přes agregovaný GTFS (tangero/jizdni-rady-czech-republic,
vydání 2026-11-02). Vytaženo **248 autobusových linek DPMČB** (Dopravní podnik
města České Budějovice) vč. meziměstských (např. linka 300 J. Hradec–Třeboň–ČB),
s kompletními itineráři (skutečné zastávky + časy) a seznamem odjezdů. Pro seed
portálu vybereme ~6–8 reprezentativních linek.

## 6. Rozsah pro schůzku (návrh priorit)
1. Kategorie Autobusy + seed reálných linek a pár autobusů s řidiči.
2. Modul Linky & Jízdní řády + vyhodnocení jízdy + anomálie (nejsilnější "aha").
3. Eco-driving / úspora paliva (park/vůz/řidič) + nezávislé topení.
4. Napojení do dashboardu (dlaždice úspory, dodržení JŘ).

> Telematická a "skutečná jízda" vrstva je pro demo modelovaná z reálného JŘ a
> jasně označená jako ukázková; po nasazení jednotek ji nahradí reálná data.
