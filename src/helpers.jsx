import React, { useState, useEffect } from 'react'

// ---------------------------------------------------------------------------
// useViewport — track window width and derive responsive breakpoints.
//   isMobile  < 860px  → off-canvas sidebar, single-column, condensed topbar
//   isTablet  860–1179 → intermediate (grids already reflow via auto-fit)
// ---------------------------------------------------------------------------
export function useViewport() {
  const read = () => (typeof window !== 'undefined' ? window.innerWidth : 1440)
  const [w, setW] = useState(read)
  useEffect(() => {
    const onResize = () => setW(window.innerWidth)
    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [])
  return { w, isMobile: w < 860, isTablet: w >= 860 && w < 1180 }
}

// ---------------------------------------------------------------------------
// css(str) — parse a design-style CSS declaration string into a React style
// object. Lets us port the prototype's inline style strings nearly verbatim.
// Custom properties (--foo) are preserved; everything else is camelCased.
// ---------------------------------------------------------------------------
const _cache = new Map()
export function css(str) {
  if (!str) return undefined
  if (typeof str !== 'string') return str
  if (_cache.has(str)) return _cache.get(str)
  const out = {}
  for (const decl of str.split(';')) {
    const i = decl.indexOf(':')
    if (i === -1) continue
    let key = decl.slice(0, i).trim()
    const val = decl.slice(i + 1).trim()
    if (!key) continue
    if (key.startsWith('--')) {
      out[key] = val
    } else {
      // camelCase, mapping leading -webkit-/-moz-/-ms- vendor prefixes too
      const camel = key.replace(/^-(webkit|moz|ms|o)-/, (m, p) => p[0].toUpperCase() + p.slice(1) + '-')
        .replace(/-([a-z])/g, (m, c) => c.toUpperCase())
      out[camel] = val
    }
  }
  _cache.set(str, out)
  return out
}

// ---------------------------------------------------------------------------
// Hov — a hover-aware element. Merges `hover` declarations onto `base` while
// the pointer is over it, replicating the prototype's `style-hover` attribute.
// ---------------------------------------------------------------------------
export function Hov({ base, hover, as = 'div', style, children, ...rest }) {
  const [h, setH] = useState(false)
  const Tag = as
  const styleStr = h && hover ? `${base};${hover}` : base
  return (
    <Tag
      style={{ ...css(styleStr), ...style }}
      onMouseEnter={() => hover && setH(true)}
      onMouseLeave={() => hover && setH(false)}
      {...rest}
    >
      {children}
    </Tag>
  )
}

// ---------------------------------------------------------------------------
// Icon — stroke-based line icons, ported 1:1 from the design's `ic()` map.
// ---------------------------------------------------------------------------
const PATHS = {
  dashboard: '<path d="M3 3h7v7H3z"/><path d="M14 3h7v7h-7z"/><path d="M14 14h7v7h-7z"/><path d="M3 14h7v7H3z"/>',
  fleets: '<path d="M12 2 2 7l10 5 10-5-10-5z"/><path d="M2 17l10 5 10-5"/><path d="M2 12l10 5 10-5"/>',
  car: '<path d="M5 11l1.6-4.2A2 2 0 0 1 8.5 5.5h7A2 2 0 0 1 17.4 6.8L19 11"/><path d="M3 11h18v6H3z"/><circle cx="7.5" cy="17" r="1.6"/><circle cx="16.5" cy="17" r="1.6"/>',
  shield: '<path d="M12 2l8 3.5v6c0 4.8-3.4 7.8-8 9.5-4.6-1.7-8-4.7-8-9.5v-6z"/>',
  alert: '<path d="M12 3l9.5 17h-19z"/><path d="M12 9v5"/><path d="M12 17.5h.01"/>',
  file: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/>',
  users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>',
  chart: '<path d="M3 3v18h18"/><path d="M7 15v-4"/><path d="M12 15V8"/><path d="M17 15v-7"/>',
  settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.6 1.6 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.6 1.6 0 0 0-1.8-.3 1.6 1.6 0 0 0-1 1.5V21a2 2 0 0 1-4 0v-.1a1.6 1.6 0 0 0-1-1.5 1.6 1.6 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.6 1.6 0 0 0 .3-1.8 1.6 1.6 0 0 0-1.5-1H3a2 2 0 0 1 0-4h.1a1.6 1.6 0 0 0 1.5-1 1.6 1.6 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.6 1.6 0 0 0 1.8.3H9a1.6 1.6 0 0 0 1-1.5V3a2 2 0 0 1 4 0v.1a1.6 1.6 0 0 0 1 1.5 1.6 1.6 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.6 1.6 0 0 0-.3 1.8V9a1.6 1.6 0 0 0 1.5 1H21a2 2 0 0 1 0 4h-.1a1.6 1.6 0 0 0-1.5 1z"/>',
  search: '<circle cx="11" cy="11" r="7"/><path d="M21 21l-4.3-4.3"/>',
  bell: '<path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/>',
  chevron: '<path d="M6 9l6 6 6-6"/>',
  plus: '<path d="M12 5v14M5 12h14"/>',
  check: '<path d="M20 6L9 17l-5-5"/>',
  star: '<path d="M12 2.5l2.9 6.1 6.6.7-4.9 4.5 1.3 6.6L12 17.6l-5.9 2.8 1.3-6.6L2.5 9.3l6.6-.7z" fill="currentColor" stroke="none"/>',
  arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
  close: '<path d="M6 6l12 12M18 6L6 18"/>',
  sparkle: '<path d="M12 3l1.8 4.7L18.5 9l-4.7 1.3L12 15l-1.8-4.7L5.5 9l4.7-1.3z"/><path d="M19 14l.7 1.9 1.9.7-1.9.7-.7 1.9-.7-1.9-1.9-.7 1.9-.7z"/>',
  send: '<path d="M22 2L11 13"/><path d="M22 2l-7 20-4-9-9-4z"/>',
  clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
  doc2: '<path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><path d="M14 2v6h6"/><path d="M8 13h8M8 17h5"/>',
  refresh: '<path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/>',
  user1: '<circle cx="12" cy="8" r="4"/><path d="M5.5 21a6.5 6.5 0 0 1 13 0"/>',
  transfer: '<path d="M16 3l4 4-4 4"/><path d="M20 7H8"/><path d="M8 21l-4-4 4-4"/><path d="M4 17h12"/>',
  swap: '<path d="M7 4v13"/><path d="M4 7l3-3 3 3"/><path d="M17 20V7"/><path d="M14 17l3 3 3-3"/>',
  archive: '<path d="M3 7h18v4H3z"/><path d="M5 11v9h14v-9"/><path d="M10 15h4"/>',
  trash: '<path d="M4 7h16"/><path d="M9 7V5h6v2"/><path d="M6 7l1 13h10l1-13"/>',
  pin: '<path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  gauge: '<path d="M12 13l3.5-3.5"/><path d="M4 17a8 8 0 1 1 16 0"/>',
  calendar: '<rect x="3" y="4.5" width="18" height="16.5" rx="2"/><path d="M3 9.5h18"/><path d="M8 2.5v4M16 2.5v4"/>',
  wrench: '<path d="M14.5 6.2a3.6 3.6 0 0 1-4.7 4.7L4 16.7 7.3 20l5.8-5.8a3.6 3.6 0 0 0 4.7-4.7l-2.1 2.1-2.6-.5-.5-2.6z"/>',
  glass: '<path d="M4 8l2-3h12l2 3v9a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2z"/><path d="M4 8h16"/><path d="M12 5v14"/>',
  banknote: '<rect x="3" y="6" width="18" height="12" rx="2"/><circle cx="12" cy="12" r="2.5"/><path d="M6 9v6M18 9v6"/>',
  check2: '<path d="M9 12l2 2 4-4"/><circle cx="12" cy="12" r="9"/>',
  camera: '<path d="M4 8h3l1.5-2h7L17 8h3a1 1 0 0 1 1 1v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V9a1 1 0 0 1 1-1z"/><circle cx="12" cy="13" r="3.5"/>',
  mapPin: '<path d="M12 21s7-6.3 7-12a7 7 0 1 0-14 0c0 5.7 7 12 7 12z"/><circle cx="12" cy="9" r="2.5"/>',
  phone: '<path d="M5 4h4l1.5 5-2.5 1.5a12 12 0 0 0 5.5 5.5L15 18.5 20 20v-4a14 14 0 0 1-15-15z"/>',
  kebab: '<circle cx="12" cy="5" r="1.4"/><circle cx="12" cy="12" r="1.4"/><circle cx="12" cy="19" r="1.4"/>',
  upload: '<path d="M12 16V4"/><path d="M7 9l5-5 5 5"/><path d="M4 17v2a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-2"/>',
  hash: '<path d="M9 4L7 20M17 4l-2 16M4 9h16M3 15h16"/>',
  info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5"/><path d="M12 8h.01"/>',
  logout: '<path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><path d="M16 17l5-5-5-5"/><path d="M21 12H9"/>',
  menu: '<path d="M3 6h18M3 12h18M3 18h18"/>',
  grid: '<rect x="3" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="3" width="7" height="7" rx="1.5"/><rect x="14" y="14" width="7" height="7" rx="1.5"/><rect x="3" y="14" width="7" height="7" rx="1.5"/>',
  rows: '<rect x="3" y="5" width="18" height="4" rx="1"/><rect x="3" y="14" width="18" height="4" rx="1"/>',
  percent: '<path d="M19 5L5 19"/><circle cx="6.5" cy="6.5" r="2.5"/><circle cx="17.5" cy="17.5" r="2.5"/>',
  edit: '<path d="M4 20h4L19 9l-4-4L4 16v4z"/><path d="M14 6l4 4"/>',
  scales: '<path d="M12 4v16"/><path d="M7 20h10"/><path d="M5 7h14"/><path d="M8 4l-4 8a3 3 0 0 0 6 0L6 4"/><path d="M18 4l-4 8a3 3 0 0 0 6 0l-4-8"/>',
}

// ---------------------------------------------------------------------------
// InsurerLogo — stylized brand mark (monogram chip in the insurer's brand
// colour). A placeholder for the real (trademarked) logo; swap for an <img>
// pointing at /public if licensed assets are available.
// ---------------------------------------------------------------------------
const INSURER_BRAND = {
  'Kooperativa': { bg: '#E2231A', fg: '#fff', label: 'K' },
  'Allianz': { bg: '#003781', fg: '#fff', label: 'A' },
  'ČPP': { bg: '#0069B4', fg: '#fff', label: 'ČPP' },
  'Generali': { bg: '#C8102E', fg: '#fff', label: 'G' },
  'UNIQA': { bg: '#001E50', fg: '#fff', label: 'U' },
  'ČSOB Poj.': { bg: '#003D7D', fg: '#fff', label: 'ČSOB' },
  'ČSOB': { bg: '#003D7D', fg: '#fff', label: 'ČSOB' },
}

export function InsurerLogo({ name, size = 40, radius }) {
  const b = INSURER_BRAND[name] || { bg: '#3F3F46', fg: '#fff', label: (name || '?').slice(0, 1) }
  const r = radius ?? Math.round(size * 0.28)
  const fs = b.label.length >= 3 ? Math.round(size * 0.30) : Math.round(size * 0.46)
  return (
    <div style={{
      width: size, height: size, flexShrink: 0, borderRadius: r,
      background: b.bg, color: b.fg, display: 'flex', alignItems: 'center',
      justifyContent: 'center', fontWeight: 800, fontSize: fs,
      letterSpacing: b.label.length >= 3 ? '.2px' : '0', lineHeight: 1,
    }}>{b.label}</div>
  )
}

export function Icon({ name, size = 18, sw = 1.8, style }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={sw}
      strokeLinecap="round"
      strokeLinejoin="round"
      style={style}
      dangerouslySetInnerHTML={{ __html: PATHS[name] || '' }}
    />
  )
}

// ---------------------------------------------------------------------------
// Shared formatting / chart helpers (ported from the design).
// ---------------------------------------------------------------------------
export const czk = (n) => n.toLocaleString('cs-CZ') + ' Kč'

export function linePath(vals, w, h, pad) {
  const mn = Math.min(...vals), mx = Math.max(...vals), rg = (mx - mn) || 1
  const pts = vals.map((v, i) => {
    const x = pad + (i / (vals.length - 1)) * (w - 2 * pad)
    const y = h - pad - ((v - mn) / rg) * (h - 2 * pad)
    return [x, y]
  })
  const line = pts.map((p, i) => (i ? 'L' : 'M') + p[0].toFixed(1) + ' ' + p[1].toFixed(1)).join(' ')
  const area = line + ` L${(w - pad).toFixed(1)} ${(h - pad).toFixed(1)} L${pad} ${(h - pad).toFixed(1)} Z`
  return { line, area }
}

// ---------------------------------------------------------------------------
// Export — CSV / XLS / PDF of a tabular dataset (columns + rows).
// Runs entirely client-side and triggers a real download (PDF via print).
// ---------------------------------------------------------------------------
const escHtml = (s) => String(s ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

function toDelimited(columns, rows, sep) {
  const re = new RegExp('["' + sep + '\\n]')
  const esc = (v) => { const s = String(v ?? ''); return re.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s }
  return [columns.map((c) => esc(c.label)).join(sep), ...rows.map((r) => columns.map((c) => esc(r[c.key])).join(sep))].join('\r\n')
}

function downloadFile(name, content, mime) {
  const blob = new Blob([content], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove()
  setTimeout(() => URL.revokeObjectURL(url), 1000)
}

function xlsHtml(title, columns, rows) {
  const th = columns.map((c) => `<th style="background:#f0f0f0;border:1px solid #999;padding:5px 9px;text-align:left;font-family:sans-serif;font-size:11px">${escHtml(c.label)}</th>`).join('')
  const trs = rows.map((r) => '<tr>' + columns.map((c) => `<td style="border:1px solid #ccc;padding:5px 9px;font-family:sans-serif;font-size:11px">${escHtml(r[c.key])}</td>`).join('') + '</tr>').join('')
  return `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:x="urn:schemas-microsoft-com:office:excel"><head><meta charset="utf-8"><!--[if gte mso 9]><xml><x:ExcelWorkbook><x:ExcelWorksheets><x:ExcelWorksheet><x:Name>${escHtml(title)}</x:Name></x:ExcelWorksheet></x:ExcelWorksheets></x:ExcelWorkbook></xml><![endif]--></head><body><table>${'<tr>' + th + '</tr>'}${trs}</table></body></html>`
}

function printRows(title, columns, rows) {
  const th = columns.map((c) => `<th>${escHtml(c.label)}</th>`).join('')
  const trs = rows.map((r) => '<tr>' + columns.map((c) => `<td>${escHtml(r[c.key])}</td>`).join('') + '</tr>').join('')
  const html = `<!doctype html><html lang="cs"><head><meta charset="utf-8"><title>${escHtml(title)}</title><style>body{font-family:-apple-system,system-ui,sans-serif;color:#111;margin:28px}h1{font-size:18px;margin:0 0 3px}.sub{color:#666;font-size:12px;margin-bottom:18px}table{border-collapse:collapse;width:100%;font-size:11px}th,td{border:1px solid #d0d0d0;padding:6px 8px;text-align:left}th{background:#f3f3f3}@media print{@page{size:landscape;margin:14mm}}</style></head><body><h1>${escHtml(title)}</h1><div class="sub">Louda Auto Fleet Portal · ${rows.length} záznamů</div><table><thead><tr>${th}</tr></thead><tbody>${trs}</tbody></table><script>window.onload=function(){setTimeout(function(){window.print()},250)}</script></body></html>`
  const w = window.open('', '_blank')
  if (w) { w.document.write(html); w.document.close() }
}

export function exportData(format, { filename, title, columns, rows }) {
  if (!rows || !rows.length) return
  if (format === 'csv') downloadFile(filename + '.csv', '﻿' + toDelimited(columns, rows, ';'), 'text/csv;charset=utf-8')
  else if (format === 'xls') downloadFile(filename + '.xls', xlsHtml(title, columns, rows), 'application/vnd.ms-excel;charset=utf-8')
  else if (format === 'pdf') printRows(title, columns, rows)
}
