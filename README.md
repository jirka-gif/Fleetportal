# Fleetportal

Portál pro správu vozového parku a flotilového pojištění — **redesign větev**. Forknuto z `louda-fleet-portal` se zachováním veškeré funkcionality; tato kopie slouží k přepracování grafiky/UI.

Postaveno v **React + Vite**, bez routeru (navigace řešená vnitřním stavem). UI v češtině.

## Lokální vývoj

```bash
npm install
npm run dev        # dev server
npm run build      # produkční build do dist/
npm run preview
```

## Struktura

- `src/FleetPortal.jsx` — stav + view-modely (`vm`) pro všechny routy
- `src/Render.jsx` — všechny view komponenty (render z `vm`)
- `src/helpers.jsx` — `css()`, `Hov`, `Icon`/`ic()`, `InsurerLogo`, export utility
- `src/data.js` — ukázková data (parky, vozidla, škody)
- `src/styles.css` — globální styly a CSS proměnné

## Nasazení na Vercel

Framework auto-detekován jako **Vite**: Build `npm run build`, Output `dist`. SPA (navigace vnitřním stavem) — bez rewrite konfigurace.
