# Fleet Portal — Backend & Ecosystem: technický plán

> Cíl: z frontendového prototypu udělat **robustní multi-tenant SaaS**, který je
> **integration-first** — umožní postupně dopojovat pojišťovny, leasingovky,
> registr vozidel, telematiku a další partnery a stát se **ekosystémem**, na
> kterém stavějí i třetí strany. Tenhle dokument je plán, ne kód.

---

## 0. Principy návrhu
1. **Tenant isolation** — data klientských firem jsou striktně oddělená.
2. **Integration-first** — každý partner je *pluggable konektor* za jednotným rozhraním; přidání pojišťovny ≠ zásah do jádra.
3. **Event-driven** — doménové události (vozidlo přidáno, smlouva obnovena, škoda změněna) řídí integrace i notifikace.
4. **API-first** — veřejné REST API + webhooky; UI je jen jeden konzument.
5. **Audit everything** — neměnný audit log (už máme datový tvar).
6. **EU / GDPR / ČNB** — rezidence dat v EU, šifrování PII, recordkeeping makléře.

---

## 1. Rozhodnutí o stacku (a proč)

| Vrstva | Volba | Proč |
|---|---|---|
| Backend | **NestJS (TypeScript)** | Modulární monolit, DI, ideální pro connector/adapter pattern a fronty. Sdílení typů s FE. |
| DB | **PostgreSQL** (Neon nebo AWS RDS, EU) | Relační model sedí na entity; RLS pro multitenancy; zralý ekosystém. |
| ORM | **Prisma** (alt. Drizzle) | Typově bezpečné migrace, generované typy. |
| Cache/fronty | **Redis + BullMQ** (alt. Inngest) | Async sync s partnery, rate-limit per partner, retry, scheduling. |
| Úložiště | **Cloudflare R2 / S3 (EU)** | Faktury, smlouvy, zelené karty, TP; signed URL; antivir scan. |
| Auth | **Keycloak / WorkOS** (OIDC) | B2B SSO, SCIM provisioning, role; nechceme psát auth od nuly. |
| API | **REST + OpenAPI**, **webhooky**, partner OAuth2 (client-credentials) | Generovaný typovaný klient pro FE; standard pro partnery. |
| FE napojení | **TanStack Query** + generovaný klient | Cache + optimistické zápisy (ladí s `vm` patternem). |
| Infra | Backend **Fly.io / Render / AWS ECS**, FE zůstává **Vercel**; **Terraform** + **GitHub Actions** | Oddělený scaling backendu a workerů. |
| Observability | **OpenTelemetry + Sentry + structured logs** | Sledování synců, latencí, chyb integrací. |

> **Proč ne Supabase jako jádro:** skvělé na rychlý start, ale ekosystém s
> per-partner adaptéry, async procesy, webhooky a granulárním RBAC chce service
> vrstvu. Supabase lze využít dílčím způsobem (storage/auth), ale doporučuji
> rovnou vlastní NestJS service.

---

## 2. Architektura (vrstvy)

```
        ┌──────────────────────────── Klienti ────────────────────────────┐
        │   Fleet Portal (React)     Partner aplikace     Mobil (později)  │
        └───────────────┬───────────────────┬──────────────────┬──────────┘
                        │ REST/OpenAPI       │ Partner API+OAuth │ REST
        ┌───────────────▼───────────────────▼──────────────────▼──────────┐
        │                    API Gateway / BFF (NestJS)                    │
        │            authN/Z · tenant context · rate-limit · OpenAPI       │
        ├──────────────────────────────────────────────────────────────────┤
        │  DOMÉNOVÉ MODULY                                                  │
        │  Tenancy · Vehicles · Fleets · Drivers · Insurance · Claims ·     │
        │  Financing · Operations(servis/pneu/pokuty/náklady/usage) ·      │
        │  Documents · Notifications · Entitlements/Billing · Audit        │
        ├───────────────────────────┬──────────────────────────────────────┤
        │     EVENT BUS / OUTBOX     │           INTEGRATION HUB            │
        │  doménové eventy → fronty  │  connector registry + normalizace   │
        └───────────────┬───────────┴───────────────┬──────────────────────┘
                        │ workers (BullMQ)           │ konektory (adaptéry)
        ┌───────────────▼──────────┐   ┌─────────────▼──────────────────────┐
        │ Postgres · Redis · R2/S3 │   │ Pojišťovny · Registr vozidel ·      │
        └──────────────────────────┘   │ eDalnice · Leasing · Telematika ·   │
                                        │ ARES · E-mail/SMS                   │
                                        └─────────────────────────────────────┘
```

---

## 3. Datový model (schéma)

Vše s `tenant_id` (kromě platformních číselníků). Klíčové tabulky a pole:

### Identita & tenancy
- **organizations** — `id, type(broker|client), name, ico, ...` (Petrisk = broker org).
- **tenants** — `id, org_id, name, ico, status` (klientská firma, např. Tošovský).
- **users** — `id, email, name, sso_subject, status`.
- **memberships** — `user_id, tenant_id, role` (uživatel ↔ tenant ↔ role).
- **tenant_modules** — `tenant_id, module_key, enabled` (entitlementy — „Draive Core CRM").
- **api_clients** — `id, tenant_id, name, scopes[], secret_hash` (partneři/integrace).
- **invitations** — pozvánky uživatelů.

### Vozový park
- **fleets** — `id, tenant_id, name, address, manager`.
- **vehicles** — `id, tenant_id, fleet_id, plate, vin, brand, model, year, druh, fuel, power, engine, weight, seats, tp, first_reg, status, territory, pov_limit, mileage, value, owner, operator`.
- **drivers** — `id, tenant_id, name, birth, rc(enc), address, phone, email, position, employment, op_*, rp_*(number/groups/validTo/profValidTo), tacho_*, adr`.
- **vehicle_driver_assignments** — `id, vehicle_id, driver_id, from, to, km_start, km_end, handover_note` (historie používání).

### Pojištění
- **insurers** — číselník pojišťoven.
- **insurance_contracts** — `id, tenant_id, fleet_id, insurer_id, policy_no, start, anniversary, premium, status`.
- **coverages** — `id, vehicle_id, contract_id, risk(pov|hav|skla|...), limit, deductible, premium`.
- **claims** — `id, tenant_id, vehicle_id, risk, type, status, reported_by, reported_at, estimate, payout, progress`.
- **claim_events** — historie likvidace.

### Financování
- **financing** — `id, vehicle_id, type(bank_loan|finance_lease|operating_lease), provider, contract_no, monthly_payment, start, end, ...`.
- **leasing_partners** — číselník + `supported_types[]`.
- **rfqs** — `id, tenant_id, vehicle_id, type, params, status, sent_at`.
- **rfq_offers** — `id, rfq_id, partner_id, monthly, terms, accepted`.

### Provoz (záložky, které už máme v UI)
- **service_records** — `vehicle_id, type, date, km, desc, price, shop, next_date, next_km, invoice_doc_id`.
- **tire_records** — `vehicle_id, action, date, km, set, tread, storage, price, next_date, invoice_doc_id`.
- **fines** — `vehicle_id, type, date, driver, location, amount, points, paid`.
- **cost_entries** — `vehicle_id, category, label, date, amount, invoice_doc_id`.
- **equipment** — `vehicle_id, section, desc, price, date, invoice_doc_id`.

### Platforma
- **documents** — `id, tenant_id, owner_type, owner_id, kind, filename, storage_key, size, version` (polymorfní vlastník).
- **audit_log** — `id, tenant_id, when, who, action, entity, entity_id, detail, diff` (append-only).
- **notifications** + **notification_prefs** — fronta + předvolby (e-mail/SMS/in-app).
- **user_settings** — dashboard/KPI config (dnes v localStorage).
- **integration_connections** — `tenant_id, connector_key, credentials(enc), status`.
- **integration_sync_runs** — `connection_id, started, finished, status, stats, log`.
- **external_ids** — mapování `internal_entity ↔ partner_id` (per konektor).
- **webhook_subscriptions** + **webhook_deliveries** — odchozí webhooky pro partnery.

---

## 4. Auth, role, multitenancy

- **Hierarchie:** Broker org spravuje N klientských tenantů. Uživatel má `membership` (role) na konkrétní tenant(y).
- **Role:** `platform_admin`, `broker_admin`, `broker_agent`, `client_admin` (fleet manager), `client_user` (viewer), `driver` (self-service, později), `partner` (API).
- **Model oprávnění:** RBAC + scoping podle `tenant_id`; **modulové entitlementy** (`tenant_modules`) gateují funkce — přesně dnešní „provisioning přes Draive Core CRM".
- **Enforcement:** middleware nastaví tenant kontext z tokenu → každý dotaz filtrován `tenant_id`; **Postgres RLS** jako druhá vrstva.
- **Partneři:** `api_clients` s OAuth2 client-credentials, scoped přístup; vstupní webhooky podepsané HMAC.
- **Tokeny:** krátký JWT + refresh; **OIDC/SAML SSO** pro enterprise klienty; SCIM provisioning později.

---

## 5. API design

- Resource pod `/v1`, tenant z tokenu (nebo `X-Tenant-Id`).
- **Konvence:** stránkování, filtrování, **idempotency-key** u zápisů, ETag, `application/problem+json` chyby, OpenAPI → generovaný FE klient.

Reprezentativní endpointy:

| Zdroj | Endpointy |
|---|---|
| Vehicles | `GET/POST /vehicles`, `GET/PATCH/DELETE /vehicles/{id}`, `GET /vehicles/{id}/usage|service|tires|fines|costs|equipment` |
| Fleets | `GET/POST /fleets`, `GET /fleets/{id}/cost-summary` |
| Drivers | `GET/POST /drivers`, `GET /drivers/{id}` |
| Insurance | `GET /contracts`, `GET /vehicles/{id}/coverage` |
| Claims | `GET/POST /claims`, `PATCH /claims/{id}` |
| Financing | `GET /financing`, `POST /rfqs`, `POST /rfqs/{id}/offers/{p}/accept` |
| Documents | `POST /documents:signed-url`, `GET /documents/{id}` |
| Platform | `GET /audit`, `GET/PUT /settings`, `GET /notifications` |

**Odchozí webhooky:** `vehicle.created`, `contract.renewed`, `claim.statusChanged`,
`document.uploaded`, `rfq.offerReceived`, `compliance.expiringSoon`.

---

## 6. Integration Hub (jádro ekosystému)

Srdce „silného ekosystému". Každá integrace je **konektor** implementující jednotné rozhraní podle schopností (capabilities):

- `vehicle-lookup` (VIN/SPZ → technická data, STK)
- `policy-sync` (smlouvy, krytí, pojistné)
- `claim-sync` (stavy likvidace)
- `vignette-check` (dálniční známky)
- `rfq-dispatch` (poptávky leasingu) + `offer-ingest`
- `telematics-feed` (reálné km)
- `comms` (e-mail/SMS)

**Mechanika:**
- **Registry konektorů** + adapter pattern → přidání partnera = nový konektor, ne zásah do jádra.
- **Connection per tenant** (šifrované credentials, stav), **sync runs** s logem, **retry + rate-limit per partner + circuit breaker**.
- **Normalizační vrstva** — každý konektor mapuje payload partnera na kanonický doménový model → UI je stabilní bez ohledu na partnera.
- **external_ids** — mapování interní ↔ partnerské ID.

**První konektory (dle priority/hodnoty):**
1. **ARES** — přesun na server + cache (rychlá výhra).
2. **Registr vozidel / VIN** (Cebia / SDA) — auto-fill wizardu, STK.
3. **1. pojišťovna** — máte specs (*WS Naše auto*, *ČSOBP XMLLoad*); ingest přes WS / XML import / file import; nightly + on-demand.
4. **eDalnice** (B2B partner API, backend-only) — známky.
5. **Leasing partneři** — RFQ dispatch + ingest nabídek (API/parse e-mailu).
6. **Telematika** — feed km → krmí cashflow predikci a knihu jízd.
7. **E-mail/SMS** — Postmark + SMS brána.

**Partnerská platforma (ekosystém):** veřejné API + webhooky + sandbox + API klíče
+ metering → třetí strany staví nad Fleet Portalem.

---

## 7. Procesy na pozadí
- **Scheduler (cron)** → hlídání platností (STK, emise, známky, ŘP, profesní, obnovy) → emituje eventy → notifikace.
- **Outbox pattern** → spolehlivé doručení eventů → webhooky + notifikace.
- **Sync jobs** per konektor (nightly / poll / webhook).
- **Cashflow predikce** — přepočet z reálných km a nákladů.

---

## 8. Bezpečnost, GDPR, compliance
- **PII:** VIN, SPZ, RČ, ŘP → field-level šifrování RČ; encryption at-rest; **EU rezidence**; RLS; least-privilege; secrets manager.
- **Audit log** neměnný (append-only) — datový tvar už máme.
- **GDPR:** DPA s klienty, retence, právo na výmaz, export dat, souhlasy řidičů.
- **ČNB / IDD:** recordkeeping makléře (ZZJ), doložení doporučení pojistné částky (viz interní stanovisko k havarijní).
- **Repo:** převést na **private**, rotovat exponovaná data — žádné reálné VIN/SPZ ve veřejném repu.

---

## 9. Migrace frontendu
- **Zachovat `vm()` pattern.** Statická pole z `data.js` → API za datovou vrstvou (**TanStack Query**). Optimistické zápisy jsou už přirozené.
- `data.js` se stane **seed skriptem** databáze.
- Pořadí: read-only endpointy (list/detail) → zápisy (provozní záložky, co jsme postavili) → realtime/notifikace.

---

## 10. Fázový roadmap (indikativní, 1–2 vývojáři)

| Fáze | Obsah | Odhad |
|---|---|---|
| **P0 — Foundations** | Repo, infra, CI/CD, Postgres schéma, auth, tenancy, audit, OpenAPI, FE datová vrstva | 2–3 týdny |
| **P1 — Core CRUD + perzistence** | Vozidla/parky/řidiči + provozní záložky (servis/pneu/pokuty/náklady/usage) trvale; upload dokumentů | 3–4 týdny |
| **P2 — Multitenancy + RBAC + entitlementy** | Víc firem, broker konzole, modulové licencování | 2–3 týdny |
| **P3 — Compliance engine + notifikace** | Cron na STK/známky/ŘP/obnovy, e-mail/SMS | ~2 týdny |
| **P4 — Integration Hub + první konektory** | Framework + registr vozidel → 1 pojišťovna → eDalnice → leasing | průběžně, 1–2 týdny/konektor |
| **P5 — Partnerská platforma** | Veřejné API, webhooky, sandbox, API klíče, billing/metering | dle ambice |

> **MVP (P0–P2)** ≈ 2–3 měsíce s 1–2 vývojáři. Integrace jsou pak přírůstkové.

---

## 11. Provozní náklady (řádově, měsíčně)
- Postgres (Neon/RDS) + Redis + R2/S3: nízké desítky až nižší stovky € dle objemu.
- Backend host (Fly/Render/ECS): desítky € na malý provoz.
- Auth (WorkOS/Keycloak): Keycloak self-host levný; WorkOS dle MAU.
- E-mail/SMS: dle objemu.
- Sentry/observability: free–nižší desítky €.

---

## 12. Otevřené otázky k rozhodnutí
1. **Auth**: self-host Keycloak (levné, víc práce) vs WorkOS/Clerk (rychlé, B2B SSO/SCIM)?
2. **Hosting backendu**: Fly.io (jednoduché) vs AWS (enterprise, compliance)?
3. **První pojišťovna** k napojení (podle dostupnosti specifikace a objemu)?
4. **Telematika** — který provider má klient nasazený (krmí cashflow/knihu jízd)?
5. **Billing modelu** licencí (per tenant / per vozidlo / per modul)?
