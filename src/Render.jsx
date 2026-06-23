import React, { useState } from 'react'
import { css as S, Hov, Icon, InsurerLogo, exportData } from './helpers.jsx'

const ic = (name, size = 18, sw = 1.8) => <Icon name={name} size={size} sw={sw} />
const LOGO = '/fleet-portal/logo-louda.svg'
const STAR_LOGO = '/fleet-portal/star-logo.png'

// Export button with an XLS / CSV / PDF dropdown — exports the given rows.
function ExportMenu({ filename, title, columns, rows, variant }) {
  const [open, setOpen] = useState(false)
  const fmts = [['xls', 'XLS (Excel)', 'banknote'], ['csv', 'CSV', 'doc2'], ['pdf', 'PDF', 'file']]
  const run = (f) => { setOpen(false); exportData(f, { filename, title, columns, rows }) }
  const btn = variant === 'header'
    ? 'height:38px;padding:0 15px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer'
    : 'display:flex;align-items:center;gap:7px;height:38px;padding:0 13px;border:1px solid var(--border);background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer'
  return (
    <div style={{ position: 'relative' }}>
      <Hov onClick={() => setOpen((o) => !o)} base={btn} hover="background:#FAFAFA">{ic('doc2', 16)} Export <span style={S('display:flex;color:var(--ink3)')}>{ic('chevron', 15)}</span></Hov>
      {open && (
        <>
          <div onClick={() => setOpen(false)} style={S('position:fixed;inset:0;z-index:40')}></div>
          <div style={S('position:absolute;right:0;top:44px;z-index:41;width:196px;background:#fff;border:1px solid var(--border2);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.16);padding:6px;animation:popIn .12s ease')}>
            <div style={S('font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px;padding:6px 9px 5px')}>Exportovat {rows.length} záznamů</div>
            {fmts.map((f, i) => (
              <Hov key={i} onClick={() => run(f[0])} base="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer" hover="background:#F5F7FB"><span style={S('display:flex;color:var(--blue)')}>{ic(f[2], 16)}</span> {f[1]}</Hov>
            ))}
          </div>
        </>
      )}
    </div>
  )
}

// Horizontal-scroll wrapper for dense data tables on narrow screens.
function HScroll({ minW, children }) {
  return (
    <div style={S('overflow-x:auto')}>
      <div style={S(`min-width:${minW}px`)}>{children}</div>
    </div>
  )
}

const ROOT_STYLE =
  "--star:#C8102E;--star-soft:#FDECEE;--star-ink:#9B0E25;--blue:#2058C9;--blue-soft:#EAF0FC;" +
  "--blue-ink:#1A47A3;--green:#16A34A;--green-soft:#E7F6ED;--amber:#C2780C;--amber-soft:#FBF1DF;" +
  "--ink:#18181B;--ink2:#5B5B63;--ink3:#8E8E96;--border:#ECECEE;--border2:#E3E3E6;--canvas:#FAFAFA;" +
  "--card:#FFFFFF;--r:14px;display:flex;height:100vh;width:100%;overflow:hidden;color:var(--ink);" +
  "font-family:'Hanken Grotesk',system-ui,sans-serif"

export default function Render({ vm }) {
  const mob = vm.vp.isMobile
  const asideStyle = mob
    ? `width:min(86vw,300px);flex-shrink:0;background:#fff;border-right:1px solid var(--border);display:flex;flex-direction:column;height:100%;position:fixed;top:0;left:0;z-index:100;transform:translateX(${vm.sidebarOpen ? '0' : '-100%'});transition:transform .25s ease;box-shadow:${vm.sidebarOpen ? '0 24px 60px rgba(0,0,0,.28)' : 'none'}`
    : 'width:264px;flex-shrink:0;background:#fff;border-right:1px solid var(--border);display:flex;flex-direction:column;height:100%'
  return (
    <div style={S(ROOT_STYLE)}>

      {/* MOBILE SIDEBAR OVERLAY */}
      {mob && vm.sidebarOpen && <div onClick={vm.closeSidebar} style={S('position:fixed;inset:0;z-index:95;background:rgba(15,15,20,.4)')}></div>}

      {/* SIDEBAR */}
      <aside style={S(asideStyle)}>
        <div style={S('padding:22px 20px 18px;border-bottom:1px solid var(--border)')}>
          <img src={LOGO} alt="Louda Auto" style={S('height:20px;width:auto;max-width:100%;display:block')} />
          <div style={S('font-size:11px;color:var(--ink3);font-weight:600;letter-spacing:.4px;text-transform:uppercase;margin-top:10px')}>Fleet Portal</div>
        </div>
        <div style={S('flex:1;overflow-y:auto;padding:4px 12px')}>
          {vm.nav.map((item) => (
            <div key={item.id} onClick={item.onClick} style={S(item.style)}>
              <span style={{ display: 'flex', color: item.iconColor }}>{item.icon}</span>
              <span style={{ flex: 1 }}>{item.label}</span>
              {item.badge ? <span style={S(item.badgeStyle)}>{item.badge}</span> : null}
            </div>
          ))}
        </div>
        <div style={S('padding:14px 18px;border-top:1px solid var(--border)')}>
          <div style={S('font-size:10px;font-weight:700;letter-spacing:.5px;color:var(--ink3);text-transform:uppercase;margin-bottom:8px')}>Spravuje · Powered by</div>
          <img src={STAR_LOGO} alt="STAR Insurance Group" style={S('height:27px;width:auto;display:block')} />
          <div style={S('font-size:11px;color:var(--ink3);margin-top:7px')}>Broker Hub · makléř IS Group, spol. s r.o.</div>
        </div>
      </aside>

      {/* MAIN */}
      <div style={S('flex:1;display:flex;flex-direction:column;min-width:0;height:100%')}>
        {/* TOPBAR */}
        <header style={S(`height:64px;flex-shrink:0;background:rgba(255,255,255,.85);backdrop-filter:blur(8px);border-bottom:1px solid var(--border);display:flex;align-items:center;gap:${mob ? '10px' : '18px'};padding:0 ${mob ? '14px' : '28px'};z-index:20`)}>
          {mob && (
            <Hov onClick={vm.toggleSidebar} base="width:38px;height:38px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink2)" hover="background:#FAFAFA">{ic('menu', 18)}</Hov>
          )}
          <div style={S('min-width:0;flex-shrink:1;overflow:hidden')}>
            <div style={S('font-weight:700;font-size:17px;line-height:1.1;letter-spacing:-.2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{vm.pageTitle}</div>
            <div style={S('font-size:12.5px;color:var(--ink3);line-height:1.3;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{vm.pageSubtitle}</div>
          </div>
          <div style={{ flex: 1 }}></div>
          {mob ? (
            <Hov onClick={vm.openSearch} base="width:38px;height:38px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink2)" hover="background:#FAFAFA">{ic('search', 18)}</Hov>
          ) : (
            <Hov onClick={vm.openSearch} base="display:flex;align-items:center;gap:10px;height:38px;width:300px;padding:0 12px;background:#F4F4F5;border:1px solid var(--border);border-radius:10px;cursor:text;color:var(--ink3)" hover="background:#EFEFF1">
              <span style={{ display: 'flex' }}>{ic('search', 17)}</span>
              <span style={S('flex:1;font-size:13.5px')}>Hledat vozidlo, SPZ, řidiče…</span>
              <span style={S('font-size:11px;font-weight:600;background:#fff;border:1px solid var(--border2);border-radius:6px;padding:2px 6px;color:var(--ink2)')}>⌘K</span>
            </Hov>
          )}
          <Hov onClick={vm.toggleNotif} base="position:relative;width:38px;height:38px;flex-shrink:0;border-radius:10px;border:1px solid var(--border);background:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--ink2)" hover="background:#FAFAFA">
            {ic('bell', 18)}
            <span style={S('position:absolute;top:8px;right:9px;width:7px;height:7px;border-radius:50%;background:var(--star);border:1.5px solid #fff')}></span>
          </Hov>
          {!mob && <div style={S('width:1px;height:28px;background:var(--border)')}></div>}
          <div style={S('display:flex;align-items:center;gap:10px;cursor:pointer;flex-shrink:0')}>
            <div style={S('width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#3A3A42,#18181B);color:#fff;font-weight:700;font-size:13px;display:flex;align-items:center;justify-content:center')}>MK</div>
            {!mob && (
              <div style={S('line-height:1.15')}>
                <div style={S('font-size:13px;font-weight:600')}>Martin Kovář</div>
                <div style={S('font-size:11px;color:var(--ink3)')}>Fleet Manager</div>
              </div>
            )}
          </div>
        </header>

        {/* CONTENT */}
        <main style={S('flex:1;overflow-y:auto;background:var(--canvas)')}>
          <div key={vm.route} style={S(`padding:${mob ? '16px 14px 48px' : '26px 28px 60px'};max-width:1480px;margin:0 auto`)}>

            {vm.isDashboard && <Dashboard vm={vm} />}
            {vm.isFleets && <Fleets vm={vm} />}
            {vm.isFleetDetail && <FleetDetail vm={vm} />}
            {vm.isVehicles && <Vehicles vm={vm} />}
            {vm.isVehicleDetail && <VehicleDetail vm={vm} />}
            {vm.isClaimDetail && <ClaimDetail vm={vm} />}
            {vm.isInsurance && <Insurance vm={vm} />}
            {vm.isInsuranceDetail && <InsuranceDetail vm={vm} />}
            {vm.isClaims && <Claims vm={vm} />}
            {vm.isDocuments && <Documents vm={vm} />}
            {vm.isDocumentsDetail && <DocumentsDetail vm={vm} />}
            {vm.isBonifikace && <Bonifikace vm={vm} />}
            {vm.isBonifikaceDetail && <BonifikaceDetail vm={vm} />}
            {vm.isAnalytics && <Analytics vm={vm} />}
            {vm.isContacts && <Contacts vm={vm} />}
            {vm.isSettings && <Settings vm={vm} />}

          </div>
        </main>
      </div>

      {/* FLOATING AI BUTTON */}
      <Hov onClick={vm.toggleAI} base="position:fixed;right:26px;bottom:26px;z-index:50;width:54px;height:54px;border-radius:50%;background:linear-gradient(135deg,#2563DB,#1A47A3);box-shadow:0 10px 28px rgba(32,88,201,.4);display:flex;align-items:center;justify-content:center;color:#fff;cursor:pointer" hover="transform:translateY(-2px)">
        {ic('sparkle', 22)}
      </Hov>

      {/* TOAST */}
      {vm.toast && (
        <div style={S('position:fixed;left:50%;bottom:28px;transform:translateX(-50%);z-index:90;display:flex;align-items:center;gap:11px;background:#18181B;color:#fff;padding:13px 18px;border-radius:12px;box-shadow:0 16px 44px rgba(0,0,0,.3);font-size:13.5px;font-weight:500;max-width:520px;animation:fadeUp .22s ease')}>
          <span style={S('width:22px;height:22px;border-radius:50%;background:var(--green);display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff')}>{ic('check', 16)}</span>
          <span>{vm.toast}</span>
        </div>
      )}

      {vm.ai && <AIPanel vm={vm} />}
      {vm.notif && <Notifications vm={vm} />}
      {vm.search && <SearchModal vm={vm} />}
      {vm.claimWizard && <ClaimWizard vm={vm} />}
      {vm.av && <AddVehicleWizard vm={vm} />}
      {vm.np && <NewFleetModal vm={vm} />}
      {vm.docPreview && <DocPreviewModal vm={vm} />}
      {vm.unsub && <UnsubscribeModal vm={vm} />}
      {vm.costModal && <CostModal vm={vm} />}
      {vm.noteModal && <NoteModal vm={vm} />}
      {vm.parkModal && <ChangeParkModal vm={vm} />}
      {vm.driverModal && <AssignDriverModal vm={vm} />}
    </div>
  )
}

/* ============================ ODHLÁŠENÍ Z POJIŠTĚNÍ ============================ */
function UnsubscribeModal({ vm }) {
  const u = vm.unsub
  const ap = vm.unsubApprover
  return (
    <div onClick={vm.closeUnsub} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:560px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('logout', 18)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>Odhlášení vozidla z pojištění</div><div style={S('font-size:12.5px;color:var(--ink3)')}>{vm.unsubDone ? 'Hotovo' : 'Rekapitulace a odeslání ke schválení'}</div></div>
          <span onClick={vm.closeUnsub} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          {vm.unsubDone ? (
            <div style={S('text-align:center;padding:24px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--amber-soft);color:var(--amber);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{ic('clock', 30, 2.2)}</div>
              <div style={S('font-size:19px;font-weight:800')}>Žádost odeslána ke schválení</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:400px;margin-left:auto;margin-right:auto')}>Odhlášení vozidla <strong style={S('color:var(--ink)')}>{u.plate}</strong> z pojištění ({u.insurer}) čeká na schválení — <strong style={S('color:var(--ink)')}>{ap.name}</strong>. Po schválení vám přijde potvrzení a vozidlo bude odhlášeno k {vm.unsubDate}.</div>
            </div>
          ) : (
            <>
              {/* rekapitulace — co a odkud */}
              <div style={S('font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:10px')}>Rekapitulace</div>
              <div style={S('border:1px solid var(--border);border-radius:12px;overflow:hidden;margin-bottom:18px')}>
                <div style={S('display:flex;align-items:center;gap:13px;padding:14px 16px;background:#FBFBFC;border-bottom:1px solid var(--border)')}>
                  <div style={S('width:42px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ic('car', 18)}</div>
                  <div style={{ flex: 1 }}><div style={S('font-size:14px;font-weight:700')}>{u.brand} {u.model}</div><div style={S('font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{u.plate} · VIN {u.vin}</div></div>
                </div>
                {[['Vozový park', u.fleetName], ['Pojišťovna', u.insurer], ['Roční pojistné', u.premiumF], ['Konec krytí (povinné ručení)', u.renewal]].map((r, i) => (
                  <div key={i} style={S(`display:flex;justify-content:space-between;gap:14px;padding:11px 16px;font-size:13px;${i < 3 ? 'border-bottom:1px solid var(--border);' : ''}`)}><span style={S('color:var(--ink3)')}>{r[0]}</span><span style={S('font-weight:600;text-align:right')}>{r[1]}</span></div>
                ))}
              </div>

              <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px;margin-bottom:18px')}>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Důvod odhlášení</div>
                  <select value={vm.unsubReason} onChange={vm.setUnsubReason} style={S('width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;background:#fff;cursor:pointer')}>
                    {vm.unsubReasons.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                </div>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Datum odhlášení</div>
                  <input value={vm.unsubDate} onChange={vm.setUnsubDate} style={S('width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none')} />
                </div>
              </div>

              {/* schvalovatel */}
              <div style={S('font-size:12.5px;font-weight:700;color:var(--ink2);margin-bottom:10px')}>Schválení nadřízeným</div>
              <div style={S('display:flex;align-items:center;gap:13px;padding:13px 15px;border:1px solid var(--border);border-radius:12px;background:var(--blue-soft)')}>
                <div style={S('width:42px;height:42px;border-radius:50%;background:linear-gradient(135deg,#2563DB,#1A47A3);color:#fff;font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ap.initials}</div>
                <div style={{ flex: 1 }}><div style={S('font-size:13.5px;font-weight:700')}>{ap.name}</div><div style={S('font-size:12px;color:var(--ink2)')}>{ap.role}</div></div>
                <span style={S('font-size:11px;font-weight:700;color:var(--amber);background:#fff;border:1px solid var(--amber-soft);padding:4px 10px;border-radius:20px;white-space:nowrap')}>Vyžaduje schválení</span>
              </div>
              <div style={S('display:flex;align-items:flex-start;gap:9px;margin-top:12px;font-size:12px;color:var(--ink3)')}><span style={S('display:flex;flex-shrink:0;margin-top:1px')}>{ic('info', 15)}</span><span>Odhlášení je nevratné. Po odeslání jej schvaluje nadřízený pracovník; teprve po schválení makléř zruší krytí u pojišťovny.</span></div>
            </>
          )}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          {vm.unsubDone ? (
            <div onClick={vm.closeUnsub} style={S('height:40px;padding:0 22px;border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:pointer')}>Zavřít</div>
          ) : (
            <>
              <span onClick={vm.closeUnsub} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
              <div onClick={vm.submitUnsub} style={S('height:40px;padding:0 20px;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#fff;background:var(--star);cursor:pointer')}>{ic('logout', 16)} Odeslat ke schválení</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================ PŘIDAT NÁKLAD ============================ */
function CostModal({ vm }) {
  const c = vm.costModal
  return (
    <div onClick={vm.closeCostModal} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:540px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center')}>{ic('banknote', 18)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>{vm.costDone ? 'Náklad přidán' : 'Přidat náklad'}</div><div style={S('font-size:12.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{c.plate} · {c.brand} {c.model}</div></div>
          <span onClick={vm.closeCostModal} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          {vm.costDone ? (
            <div style={S('text-align:center;padding:20px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{ic('check2', 30, 2.2)}</div>
              <div style={S('font-size:19px;font-weight:800')}>Náklad byl uložen</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto')}><strong style={S('color:var(--ink)')}>{vm.costType}</strong>{vm.costAmount ? <> · {vm.costAmount} Kč</> : null} byl přidán k vozidlu {c.plate}{vm.costFile ? <> včetně přílohy <strong style={S('color:var(--ink)')}>{vm.costFile}</strong></> : null}.</div>
            </div>
          ) : (
            <>
              <div style={S('display:grid;grid-template-columns:1fr;gap:14px')}>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Druh nákladu</div>
                  <select value={vm.costType} onChange={vm.setCostType} style={S('width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;background:#fff;cursor:pointer')}>
                    {vm.costTypes.map((o, i) => <option key={i} value={o}>{o}</option>)}
                  </select>
                </div>
                <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                  <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Částka (Kč)</div>
                    <input value={vm.costAmount} onChange={vm.setCostAmount} placeholder="0" inputMode="numeric" style={S('width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;font-variant-numeric:tabular-nums')} />
                  </div>
                  <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Datum</div>
                    <input value={vm.costDate} onChange={vm.setCostDate} style={S('width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none')} />
                  </div>
                </div>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Popis nákladu</div>
                  <textarea value={vm.costDesc} onChange={vm.setCostDesc} placeholder="Např. výměna brzdových destiček a kotoučů, přední náprava…" rows={3} style={S('width:100%;border:1px solid var(--border2);border-radius:9px;padding:10px 12px;font-size:13.5px;font-family:inherit;outline:none;resize:vertical;line-height:1.5')} />
                </div>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Faktura / doklad</div>
                  <label style={S(`display:flex;align-items:center;gap:12px;padding:13px 15px;border:1px dashed ${vm.costFile ? 'var(--green)' : 'var(--border2)'};border-radius:11px;cursor:pointer;background:${vm.costFile ? 'var(--green-soft)' : '#FBFBFC'}`)}>
                    <input type="file" accept=".pdf,.jpg,.jpeg,.png" onChange={vm.pickCostFile} style={{ display: 'none' }} />
                    <span style={S(`width:34px;height:34px;border-radius:9px;background:#fff;border:1px solid var(--border);color:${vm.costFile ? 'var(--green)' : 'var(--ink3)'};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{ic(vm.costFile ? 'check2' : 'upload', 17)}</span>
                    <div style={{ flex: 1 }}><div style={S('font-size:13px;font-weight:600')}>{vm.costFile || 'Připojit fakturu'}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{vm.costFile ? 'Soubor připraven k nahrání' : 'PDF, JPG nebo PNG · přetáhněte nebo klikněte'}</div></div>
                  </label>
                </div>
              </div>
            </>
          )}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          {vm.costDone ? (
            <div onClick={vm.closeCostModal} style={S('height:40px;padding:0 22px;border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:pointer')}>Hotovo</div>
          ) : (
            <>
              <span onClick={vm.closeCostModal} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
              <div onClick={vm.submitCost} style={S('height:40px;padding:0 20px;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#fff;background:var(--star);cursor:pointer')}>{ic('plus', 16)} Přidat náklad</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================ PŘIDAT POZNÁMKU ============================ */
function NoteModal({ vm }) {
  const c = vm.noteModal
  const u = vm.currentUser
  const canSave = (vm.noteText || '').trim().length > 0
  return (
    <div onClick={vm.closeNoteModal} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:520px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('doc2', 18)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>Přidat poznámku</div><div style={S('font-size:12.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{c.plate} · {c.brand} {c.model}</div></div>
          <span onClick={vm.closeNoteModal} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          <div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Text poznámky</div>
          <textarea value={vm.noteText} onChange={vm.setNoteText} autoFocus placeholder="Např. zákazník nahlásil tažení vozu doprava, doporučena geometrie…" rows={5} style={S('width:100%;border:1px solid var(--border2);border-radius:9px;padding:11px 12px;font-size:13.5px;font-family:inherit;outline:none;resize:vertical;line-height:1.55')} />
          <div style={S('display:flex;align-items:center;gap:11px;margin-top:16px;padding:12px 14px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px')}>
            <div style={S('width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#3A3A42,#18181B);color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{u.initials}</div>
            <div style={{ flex: 1 }}><div style={S('font-size:13px;font-weight:700')}>{u.name}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{u.role}</div></div>
            <div style={S('text-align:right')}><div style={S('font-size:11px;color:var(--ink3)')}>Vloženo</div><div style={S('font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums')}>19. 6. 2026</div></div>
          </div>
          <div style={S('display:flex;align-items:flex-start;gap:8px;margin-top:11px;font-size:12px;color:var(--ink3)')}><span style={S('display:flex;flex-shrink:0;margin-top:1px')}>{ic('info', 14)}</span><span>U každé poznámky se ukládá, kdo ji vložil a kdy. Poznámky jsou interní a vidí je pouze správa vozového parku.</span></div>
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          <span onClick={vm.closeNoteModal} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
          <div onClick={canSave ? vm.submitNote : undefined} style={S(`height:40px;padding:0 20px;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#fff;background:var(--star);cursor:${canSave ? 'pointer' : 'not-allowed'};opacity:${canSave ? 1 : .5}`)}>{ic('check', 16)} Uložit poznámku</div>
        </div>
      </div>
    </div>
  )
}

/* ============================ ZMĚNIT PARK ============================ */
function ChangeParkModal({ vm }) {
  const c = vm.parkModal
  const target = vm.parkOptions.find((p) => p.id === vm.parkTarget)
  return (
    <div onClick={vm.closeParkModal} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:540px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('transfer', 18)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>{vm.parkDone ? 'Vozidlo přesunuto' : 'Změnit vozový park'}</div><div style={S('font-size:12.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{c.plate} · {c.brand} {c.model}</div></div>
          <span onClick={vm.closeParkModal} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          {vm.parkDone ? (
            <div style={S('text-align:center;padding:20px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{ic('check2', 30, 2.2)}</div>
              <div style={S('font-size:19px;font-weight:800')}>Vozidlo přesunuto</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto')}>Vozidlo {c.plate} bylo přesunuto z <strong style={S('color:var(--ink)')}>{vm.parkCurrentName}</strong> do <strong style={S('color:var(--ink)')}>{target ? target.name : ''}</strong>.</div>
            </div>
          ) : (
            <>
              <div style={S('display:flex;align-items:center;gap:10px;padding:11px 14px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px;margin-bottom:16px')}>
                <span style={S('color:var(--ink3);display:flex')}>{ic('fleets', 17)}</span>
                <div><div style={S('font-size:11px;color:var(--ink3)')}>Aktuální park</div><div style={S('font-size:13.5px;font-weight:600')}>{vm.parkCurrentName}</div></div>
              </div>
              <div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:8px')}>Přesunout do parku</div>
              <div style={S('display:flex;flex-direction:column;gap:8px')}>
                {vm.parkOptions.map((p, i) => {
                  const on = p.id === vm.parkTarget
                  return (
                    <Hov key={i} onClick={() => vm.setParkTarget(p.id)} base={`display:flex;align-items:center;gap:12px;padding:12px 14px;border:1.5px solid ${on ? 'var(--blue)' : 'var(--border)'};border-radius:11px;cursor:pointer;background:${on ? '#FAFBFF' : '#fff'};transition:border-color .15s ease,background .15s ease`} hover={on ? '' : 'border:1.5px solid #D4D4D8'}>
                      <div style={S(`width:36px;height:36px;border-radius:9px;background:#F1F1F3;color:var(--ink2);display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{ic('fleets', 17)}</div>
                      <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{p.name}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{p.manager} · {p.vehicles} vozidel</div></div>
                      <span style={S(`width:18px;height:18px;border-radius:50%;border:2px solid ${on ? 'var(--blue)' : '#CFCFD4'};background:${on ? 'var(--blue)' : '#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff`)}>{on ? ic('check', 11, 3) : null}</span>
                    </Hov>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          {vm.parkDone ? (
            <div onClick={vm.closeParkModal} style={S('height:40px;padding:0 22px;border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:pointer')}>Hotovo</div>
          ) : (
            <>
              <span onClick={vm.closeParkModal} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
              <div onClick={vm.parkTarget ? vm.submitPark : undefined} style={S(`height:40px;padding:0 20px;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:${vm.parkTarget ? 'pointer' : 'not-allowed'};opacity:${vm.parkTarget ? 1 : .5}`)}>{ic('transfer', 16)} Přesunout vozidlo</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================ PŘIŘADIT ŘIDIČE ============================ */
function AssignDriverModal({ vm }) {
  const c = vm.driverModal
  const sel = vm.drivers.find((d) => d.id === vm.driverSel)
  return (
    <div onClick={vm.closeDriverModal} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:540px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('user1', 18)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>{vm.driverDone ? 'Řidič přiřazen' : 'Přiřadit řidiče'}</div><div style={S('font-size:12.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{c.plate} · {c.brand} {c.model}</div></div>
          <span onClick={vm.closeDriverModal} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          {vm.driverDone ? (
            <div style={S('text-align:center;padding:20px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{ic('check2', 30, 2.2)}</div>
              <div style={S('font-size:19px;font-weight:800')}>Řidič přiřazen</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto')}>Vozidlo {c.plate} bylo přiřazeno řidiči <strong style={S('color:var(--ink)')}>{sel ? sel.name : ''}</strong>.</div>
            </div>
          ) : (
            <>
              <div style={S('display:flex;align-items:center;gap:10px;padding:11px 14px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px;margin-bottom:16px')}>
                <span style={S('color:var(--ink3);display:flex')}>{ic('user1', 17)}</span>
                <div><div style={S('font-size:11px;color:var(--ink3)')}>Aktuální řidič</div><div style={S('font-size:13.5px;font-weight:600')}>{c.driver}</div></div>
              </div>
              <div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:8px')}>Vybrat řidiče z databáze</div>
              <div style={S('display:flex;flex-direction:column;gap:8px')}>
                {vm.drivers.map((d, i) => {
                  const on = d.id === vm.driverSel
                  return (
                    <Hov key={i} onClick={() => vm.setDriverSel(d.id)} base={`display:flex;align-items:center;gap:12px;padding:11px 14px;border:1.5px solid ${on ? 'var(--blue)' : 'var(--border)'};border-radius:11px;cursor:pointer;background:${on ? '#FAFBFF' : '#fff'};transition:border-color .15s ease,background .15s ease`} hover={on ? '' : 'border:1.5px solid #D4D4D8'}>
                      <div style={S('width:36px;height:36px;border-radius:50%;background:linear-gradient(135deg,#3A3A42,#18181B);color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{d.initials}</div>
                      <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{d.name}</div><div style={S('font-size:11.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.role} · {d.loc}</div></div>
                      <span style={S(`width:18px;height:18px;border-radius:50%;border:2px solid ${on ? 'var(--blue)' : '#CFCFD4'};background:${on ? 'var(--blue)' : '#fff'};display:flex;align-items:center;justify-content:center;flex-shrink:0;color:#fff`)}>{on ? ic('check', 11, 3) : null}</span>
                    </Hov>
                  )
                })}
              </div>
            </>
          )}
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          {vm.driverDone ? (
            <div onClick={vm.closeDriverModal} style={S('height:40px;padding:0 22px;border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:pointer')}>Hotovo</div>
          ) : (
            <>
              <span onClick={vm.closeDriverModal} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
              <div onClick={vm.driverSel ? vm.submitDriver : undefined} style={S(`height:40px;padding:0 20px;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);cursor:${vm.driverSel ? 'pointer' : 'not-allowed'};opacity:${vm.driverSel ? 1 : .5}`)}>{ic('check', 16)} Přiřadit řidiče</div>
            </>
          )}
        </div>
      </div>
    </div>
  )
}

/* ============================ DOKUMENT VOZIDLA PREVIEW ============================ */
function VehicleDocPreview({ vm }) {
  const d = vm.docPreview
  const accent = d.accent || 'var(--ink2)'
  const line = (w) => <div style={S(`height:9px;border-radius:4px;background:#ECECEE;width:${w}`)}></div>
  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:760px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <div style={S(`width:36px;height:36px;border-radius:10px;background:${accent};color:#fff;display:flex;align-items:center;justify-content:center`)}>{ic('doc2', 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;background:#F1F1F3;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.08);padding:44px 48px;min-height:780px')}>
            <div style={S(`display:flex;align-items:flex-start;justify-content:space-between;border-bottom:3px solid ${accent};padding-bottom:18px;margin-bottom:26px`)}>
              <div>
                <div style={S('font-size:16px;font-weight:800;letter-spacing:.2px')}>{d.issuer}</div>
                <div style={S('font-size:11px;color:var(--ink3);margin-top:2px')}>Vystavitel dokumentu</div>
              </div>
              <div style={S('text-align:right;font-size:11px;color:var(--ink3)')}>Strana 1 / 1</div>
            </div>

            <div style={S('font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:22px')}>{d.title}</div>

            <div style={S('display:flex;align-items:center;gap:11px;padding:13px 15px;background:#FBFBFC;border:1px solid var(--border);border-radius:8px;margin-bottom:22px')}>
              <div style={S('width:42px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{d.subjectIcon || ic('car', 18)}</div>
              <div><div style={S('font-size:14px;font-weight:700')}>{d.subjectTitle || `${d.brand} ${d.model}`}</div><div style={S('font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{d.subjectSub || `${d.plate} · VIN ${d.vin}`}</div></div>
            </div>

            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;padding:16px 18px;background:#FBFBFC;border:1px solid var(--border);border-radius:8px;margin-bottom:28px')}>
              {(d.rows || []).map((r, i) => (
                <div key={i}><div style={S('font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px')}>{r[0]}</div><div style={S('font-size:13px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums')}>{r[1]}</div></div>
              ))}
            </div>

            <div style={S('display:flex;flex-direction:column;gap:8px;margin-bottom:26px')}>{['100%', '94%', '100%', '86%'].map((w, i) => <React.Fragment key={i}>{line(w)}</React.Fragment>)}</div>
            <div style={S('display:flex;justify-content:space-between;align-items:flex-end;margin-top:40px')}>
              <div><div style={S('width:150px;height:9px;border-radius:4px;background:#ECECEE;margin-bottom:7px')}></div><div style={S('font-size:11px;color:var(--ink3)')}>Razítko a podpis</div></div>
              <div style={S(`font-size:11px;font-weight:700;color:${accent};border:1px solid ${accent};border-radius:7px;padding:5px 11px`)}>OVĚŘENO</div>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ FAKTURA PREVIEW ============================ */
function InvoicePreview({ vm }) {
  const d = vm.docPreview
  const vs = d.num.replace(/\D/g, '')
  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:700px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--amber-soft);color:var(--amber);display:flex;align-items:center;justify-content:center')}>{ic('banknote', 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;background:#E9E9EC;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid #B8B8BE;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:34px 38px;color:#111;position:relative')}>
            {/* stamp */}
            <div style={S(`position:absolute;top:30px;right:38px;transform:rotate(-8deg);border:2px solid ${d.statusColor};color:${d.statusColor};font-size:13px;font-weight:800;letter-spacing:1px;padding:5px 12px;border-radius:6px;text-transform:uppercase;opacity:.85`)}>{d.statusLabel}</div>

            <div style={S('display:flex;align-items:flex-start;gap:12px;margin-bottom:6px')}>
              <InsurerLogo name={d.insurer} size={44} />
              <div><div style={S('font-size:15px;font-weight:800')}>{d.insurer}</div><div style={S('font-size:11px;color:var(--ink3)')}>Pojistitel · dodavatel</div></div>
            </div>
            <div style={S('font-size:22px;font-weight:800;letter-spacing:-.3px;margin:18px 0 2px')}>Faktura — daňový doklad</div>
            <div style={S('font-size:13px;color:var(--ink2);margin-bottom:22px')}>č. <span style={S('font-weight:700;font-variant-numeric:tabular-nums')}>{d.num}</span></div>

            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:22px')}>
              <div style={S('border:1px solid var(--border);border-radius:8px;padding:12px 14px')}>
                <div style={S('font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px')}>Dodavatel</div>
                <div style={S('font-size:13px;font-weight:700')}>{d.insurer}</div>
                <div style={S('font-size:11.5px;color:var(--ink2);margin-top:2px;line-height:1.5')}>Praha, Česká republika<br />IČO 45272956 · DIČ CZ45272956</div>
              </div>
              <div style={S('border:1px solid var(--border);border-radius:8px;padding:12px 14px')}>
                <div style={S('font-size:10px;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px;margin-bottom:5px')}>Odběratel</div>
                <div style={S('font-size:13px;font-weight:700')}>Louda Auto a.s.</div>
                <div style={S('font-size:11.5px;color:var(--ink2);margin-top:2px;line-height:1.5')}>Jankovcova 1827/41, 170 00 Praha 7<br />IČO 25612348 · DIČ CZ25612348</div>
              </div>
            </div>

            <div style={S('display:grid;grid-template-columns:1fr 1fr 1fr;gap:10px;margin-bottom:22px')}>
              {[['Variabilní symbol', vs], ['Datum vystavení', d.issue], ['Datum splatnosti', d.due], ['Forma úhrady', 'Bankovní převod'], ['Číslo účtu', '198452367/0800'], ['Pojistná smlouva', d.policy]].map((r, i) => (
                <div key={i}><div style={S('font-size:9.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.2px')}>{r[0]}</div><div style={S('font-size:12.5px;font-weight:600;margin-top:1px;font-variant-numeric:tabular-nums')}>{r[1]}</div></div>
              ))}
            </div>

            <div style={S('border:1px solid var(--border);border-radius:8px;overflow:hidden;margin-bottom:18px')}>
              <div style={S('display:flex;justify-content:space-between;padding:10px 14px;background:#FBFBFC;border-bottom:1px solid var(--border);font-size:10.5px;font-weight:700;color:var(--ink3);text-transform:uppercase')}>
                <span>Popis plnění</span><span>Částka</span>
              </div>
              <div style={S('display:flex;justify-content:space-between;gap:14px;padding:12px 14px;font-size:12.5px')}>
                <span>Předpis pojistného k pojistné smlouvě č. {d.policy}<br /><span style={S('font-size:11px;color:var(--ink3)')}>Pojištění je osvobozeno od DPH dle § 55 zákona o DPH</span></span>
                <span style={S('font-weight:700;font-variant-numeric:tabular-nums;white-space:nowrap')}>{d.amountF}</span>
              </div>
            </div>

            <div style={S('display:flex;justify-content:flex-end')}>
              <div style={S('display:flex;align-items:center;gap:16px;padding:12px 18px;background:#0F1115;border-radius:10px;color:#fff')}>
                <span style={S('font-size:12.5px;color:#A1A1AA')}>Celkem k úhradě</span>
                <span style={S('font-size:18px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums')}>{d.amountF}</span>
              </div>
            </div>
            {d.paid && <div style={S('font-size:11.5px;color:var(--ink3);margin-top:14px;text-align:right')}>Uhrazeno dne {d.paidDate}</div>}
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ CLAIM DOCUMENT PREVIEW ============================ */
function ClaimDocPreview({ vm }) {
  const d = vm.docPreview
  const line = (w) => <div style={S(`height:9px;border-radius:4px;background:#ECECEE;width:${w}`)}></div>
  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:680px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('doc2', 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>
        <div style={S('flex:1;overflow-y:auto;background:#F1F1F3;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.08);padding:44px 48px;min-height:740px')}>
            <div style={S('display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:26px')}>
              <InsurerLogo name={d.insurer} size={42} />
              <div style={S('text-align:right;font-size:11px;color:var(--ink3)')}>Škoda {d.claimId}<br />{d.date}</div>
            </div>
            <div style={S('font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:18px')}>{d.type}</div>
            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;padding:16px 18px;background:#FBFBFC;border:1px solid var(--border);border-radius:8px;margin-bottom:28px')}>
              {[['Číslo škody', d.claimId], ['Pojistitel', d.insurer], ['Vozidlo', `${d.brand} ${d.model}`], ['SPZ', d.plate], ['Datum nahlášení', d.date], ['Pojistník', 'Louda Auto a.s.']].map((r, i) => (
                <div key={i}><div style={S('font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px')}>{r[0]}</div><div style={S('font-size:13px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums')}>{r[1]}</div></div>
              ))}
            </div>
            <div style={S('display:flex;flex-direction:column;gap:9px')}>{['100%', '94%', '100%', '88%', '96%', '70%'].map((w, i) => <React.Fragment key={i}>{line(w)}</React.Fragment>)}</div>
            <div style={S('margin-top:24px;display:flex;flex-direction:column;gap:9px')}>{['100%', '90%', '100%', '82%'].map((w, i) => <React.Fragment key={i}>{line(w)}</React.Fragment>)}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ ORV PREVIEW (osvědčení o registraci vozidla) ============================ */
// Stylized Czech vehicle registration certificate using the EU harmonised
// item codes (Directive 1999/37/EC). All data is fictional / anonymised.
function OrvPreview({ vm }) {
  const d = vm.docPreview
  const isEv = (d.fuel || '').includes('Elektro')
  const paliva = { Diesel: 'Motorová nafta', 'Benzín': 'Benzín', Elektro: 'Elektřina', Hybrid: 'Hybrid (benzín/elektro)', PHEV: 'Plug-in hybrid' }
  const cat = (d.model || '').includes('Transporter') ? 'N1' : 'M1'
  const fields = [
    ['A', 'Registrační značka', d.plate, false],
    ['B', 'Datum první registrace', `1. 4. ${d.year}`, false],
    ['D.1', 'Tovární značka', d.brand, false],
    ['D.3', 'Obchodní označení', d.model, false],
    ['E', 'Identifikační číslo vozidla (VIN)', d.vin, true],
    ['J', 'Kategorie vozidla', cat, false],
    ['P.3', 'Palivo / zdroj energie', paliva[d.fuel] || d.fuel, false],
    ['P.1', 'Zdvihový objem', isEv ? '—' : '1 968 cm³', false],
    ['P.2', 'Největší výkon', isEv ? '150 kW' : '110 kW', false],
    ['F.1', 'Nejv. tech. příp. hmotnost', cat === 'N1' ? '3 080 kg' : '2 100 kg', false],
    ['G', 'Provozní hmotnost', cat === 'N1' ? '1 980 kg' : '1 540 kg', false],
    ['S.1', 'Počet míst k sezení', cat === 'N1' ? '3' : '5', false],
    ['V.9', 'Emisní úroveň (EHK/EU)', isEv ? 'EL — bez emisí' : 'EURO 6d', false],
    ['Q', 'Poměr výkon / hmotnost', isEv ? '—' : '0,071 kW/kg', false],
  ]
  const LBL = 'font-size:8.5px;font-weight:700;color:#3F3F46;line-height:1.25'
  const SUB = 'font-size:8px;font-style:italic;color:#71717A;line-height:1.2'

  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:700px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('file', 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;background:#E9E9EC;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid #B8B8BE;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:24px 26px;color:#111')}>

            {/* header band */}
            <div style={S('display:flex;align-items:center;gap:14px;border-bottom:2px solid #1A47A3;padding-bottom:12px;margin-bottom:14px')}>
              <div style={S('width:34px;height:46px;border-radius:4px;background:#1A47A3;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:flex-end;padding-bottom:6px;position:relative')}>
                <div style={S('position:absolute;top:6px;left:0;right:0;display:flex;justify-content:center;gap:2px')}>{[0, 1, 2].map((i) => <span key={i} style={S('width:2px;height:2px;border-radius:50%;background:#FFD700')}></span>)}</div>
                <span style={S('font-size:12px;font-weight:800;letter-spacing:.5px')}>CZ</span>
              </div>
              <div style={{ flex: 1 }}>
                <div style={S('font-size:14px;font-weight:800;letter-spacing:.2px')}>OSVĚDČENÍ O REGISTRACI VOZIDLA</div>
                <div style={S('font-size:11px;font-weight:700;color:#1A47A3')}>ČÁST I · Registration Certificate · Part I</div>
                <div style={S(SUB + ';margin-top:2px')}>Česká republika · vydáno podle směrnice 1999/37/ES</div>
              </div>
            </div>

            {/* fields grid */}
            <div style={S('display:grid;grid-template-columns:1fr 1fr')}>
              {fields.map((f, i) => (
                <div key={i} style={S(`border:1px solid #C9C9CF;padding:7px 10px;background:#fff;margin-top:-1px;${i % 2 === 1 ? 'border-left:none;' : ''}${f[3] ? 'grid-column:1 / -1;' : ''}`)}>
                  <div style={S('display:flex;align-items:baseline;gap:7px')}>
                    <span style={S('font-size:9px;font-weight:800;color:#1A47A3;min-width:22px')}>{f[0]}</span>
                    <span style={S(LBL)}>{f[1]}</span>
                  </div>
                  <div style={S(`font-size:13px;font-weight:700;color:#111;margin-top:3px;font-variant-numeric:tabular-nums;${f[0] === 'A' ? 'font-size:15px;letter-spacing:.5px;' : ''}`)}>{f[2]}</div>
                </div>
              ))}
            </div>

            {/* holder */}
            <div style={S('border:1px solid #C9C9CF;border-top:none;padding:8px 10px;background:#FBFBFC')}>
              <div style={S('display:flex;align-items:baseline;gap:7px')}><span style={S('font-size:9px;font-weight:800;color:#1A47A3;min-width:22px')}>C.1</span><span style={S(LBL)}>Provozovatel vozidla</span></div>
              <div style={S('font-size:13px;font-weight:700;color:#111;margin-top:3px')}>Louda Auto a.s.</div>
              <div style={S('font-size:11.5px;color:#27272A;margin-top:1px')}>Jankovcova 1827/41, 170 00 Praha 7, IČO 256 12 348</div>
            </div>

            <div style={S(SUB + ';margin-top:12px;line-height:1.45')}>Osvědčení o registraci vozidla část I se předkládá při kontrole vozidla. Údaje odpovídají zápisu v registru silničních vozidel.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ GREEN CARD PREVIEW ============================ */
// Faithful recreation of the Czech green card (ČKP standard form, black text on
// white paper). All personal data is anonymised / fictional.
const GC_COUNTRIES = ['A', 'B', 'BG', 'CY', 'CZ', 'D', 'DK', 'E', 'EST', 'F', 'FIN', 'GB', 'H', 'HR', 'I', 'IRL', 'IS', 'L', 'LT', 'LV', 'M', 'N', 'NL', 'P', 'PL', 'RO', 'S', 'SK', 'SLO', 'CH', 'AL', 'AND', 'AZ', 'BIH', 'BY', 'IR', 'MA', 'MD', 'MK', 'MNE', 'RUS', 'SRB', 'TN', 'TR', 'UA', 'UK']

function GreenCardPreview({ vm }) {
  const d = vm.docPreview
  const dmy = (s) => { const p = (s || '').replace(/\s/g, '').split('.').filter(Boolean); return { d: (p[0] || '').padStart(2, '0'), m: (p[1] || '').padStart(2, '0'), y: p[2] || '' } }
  const vf = dmy(d.validFrom), vt = dmy(d.validTo)
  const gcNum = '5685' + (d.plate.replace(/\D/g, '') + '000000').slice(0, 6)

  const LBL = 'font-size:8.5px;font-weight:700;color:#3F3F46;line-height:1.25'
  const SUB = 'font-size:8px;font-style:italic;color:#71717A;line-height:1.2'
  const VAL = 'font-size:12.5px;font-weight:700;color:#111;margin-top:4px;font-variant-numeric:tabular-nums'
  const CELL = 'border:1px solid #B8B8BE;padding:8px 10px;background:#fff'

  const DateBox = ({ label, dd }) => (
    <div style={S('display:flex;align-items:center;gap:8px')}>
      <div style={S('width:34px;font-size:9px;font-weight:700;color:#3F3F46')}>{label}</div>
      {[['Den', dd.d], ['Měsíc', dd.m], ['Rok', dd.y]].map((x, i) => (
        <div key={i} style={S('text-align:center')}>
          <div style={S('font-size:7.5px;color:#71717A')}>{x[0]}</div>
          <div style={S('border:1px solid #B8B8BE;border-radius:2px;padding:2px 6px;font-size:12px;font-weight:700;color:#111;font-variant-numeric:tabular-nums;min-width:30px')}>{x[1]}</div>
        </div>
      ))}
    </div>
  )

  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:700px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <InsurerLogo name={d.insurer} size={36} />
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;background:#E9E9EC;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid #B8B8BE;box-shadow:0 6px 24px rgba(0,0,0,.12);padding:24px 26px;color:#111')}>

            {/* heading */}
            <div style={S('display:flex;align-items:flex-start;justify-content:space-between;gap:12px;border-bottom:2px solid #111;padding-bottom:10px;margin-bottom:12px')}>
              <div>
                <div style={S('font-size:13px;font-weight:800;letter-spacing:.2px')}>1. MEZINÁRODNÍ AUTOMOBILOVÁ POJIŠŤOVACÍ KARTA</div>
                <div style={S(SUB)}>International Motor Insurance Card · Carte internationale d’assurance automobile</div>
                <div style={S('font-size:9px;color:#3F3F46;margin-top:4px')}>2. Vydaná z pověření České kanceláře pojistitelů, Praha</div>
              </div>
              <div style={S('font-size:9px;font-weight:800;border:1px solid #111;padding:3px 8px;white-space:nowrap')}>ORIGINÁL</div>
            </div>

            {/* row: policyholder + number/validity */}
            <div style={S('display:grid;grid-template-columns:1fr 1fr')}>
              <div style={S(CELL)}>
                <div style={S(LBL)}>9. Jméno a adresa pojistníka (nebo provozovatele vozidla)</div>
                <div style={S(SUB)}>Name and Address of the Policyholder (or User of the Vehicle)</div>
                <div style={S(VAL)}>Louda Auto a.s.</div>
                <div style={S('font-size:11.5px;color:#27272A;margin-top:1px')}>Jankovcova 1827/41, 170 00 Praha 7, Česká republika</div>
              </div>
              <div style={S(CELL + ';border-left:none')}>
                <div style={S(LBL)}>4. Kód země / Kód pojistitele / Číslo</div>
                <div style={S(SUB)}>Country Code / Insurer’s Code / Number</div>
                <div style={S(VAL)}>CZ / 0001 / {gcNum}</div>
                <div style={S('border-top:1px solid #D4D4D8;margin-top:8px;padding-top:8px')}>
                  <div style={S(LBL)}>3. PLATNÁ / VALID</div>
                  <div style={S('display:flex;flex-direction:column;gap:6px;margin-top:6px')}>
                    <DateBox label="OD" dd={vf} />
                    <DateBox label="DO" dd={vt} />
                  </div>
                  <div style={S('font-size:8px;font-style:italic;color:#71717A;margin-top:4px')}>(Obě data včetně / Both Dates inclusive)</div>
                </div>
              </div>
            </div>

            {/* row: vehicle + issuer */}
            <div style={S('display:grid;grid-template-columns:1fr 1fr')}>
              <div style={S(CELL + ';border-top:none')}>
                <div style={S(LBL)}>5. Registrační značka (není-li, uvede se VIN nebo č. podvozku)</div>
                <div style={S(SUB)}>Registration No. (or if none) Chassis or Engine No.</div>
                <div style={S(VAL + ';font-size:15px;letter-spacing:.5px')}>{d.plate}</div>
                <div style={S('display:flex;gap:18px;margin-top:10px')}>
                  <div><div style={S(LBL)}>6. Druh vozidla</div><div style={S(SUB)}>Category</div><div style={S(VAL)}>A</div></div>
                  <div style={S('flex:1')}><div style={S(LBL)}>7. Značka vozidla</div><div style={S(SUB)}>Make of Vehicle</div><div style={S(VAL)}>{d.brand} {d.model}</div></div>
                </div>
                <div style={S('border-top:1px solid #D4D4D8;margin-top:10px;padding-top:8px')}><div style={S(LBL)}>VIN</div><div style={S('font-size:11.5px;font-weight:700;color:#111;margin-top:2px;font-variant-numeric:tabular-nums')}>{d.vin}</div></div>
              </div>
              <div style={S(CELL + ';border-top:none;border-left:none')}>
                <div style={S(LBL)}>10. Tato karta byla vydána / This Card has been issued by</div>
                <div style={S(VAL)}>{d.insurer}</div>
                <div style={S('font-size:11px;color:#27272A;margin-top:2px')}>Česká republika · tel.: +420 800 100 100</div>
                <div style={S('border-top:1px solid #D4D4D8;margin-top:34px;padding-top:8px')}>
                  <div style={S(LBL)}>11. Podpis za pojistitele / Signature of Insurer</div>
                  <div style={S('font-style:italic;font-size:15px;color:#52525B;margin-top:8px;font-family:Georgia,serif')}>{d.insurer}</div>
                </div>
              </div>
            </div>

            {/* territorial validity */}
            <div style={S(CELL + ';border-top:none')}>
              <div style={S(LBL)}>8. ÚZEMNÍ PLATNOST / TERRITORIAL VALIDITY</div>
              <div style={S('font-size:8px;color:#71717A;margin-top:2px;margin-bottom:8px')}>Karta není platná v zemích, jejichž rubrika je přeškrtnuta (www.cobx.org).</div>
              <div style={S('display:flex;flex-wrap:wrap;gap:4px')}>
                {GC_COUNTRIES.map((c, i) => <span key={i} style={S(`font-size:10.5px;font-weight:700;border:1px solid #B8B8BE;border-radius:2px;padding:3px 7px;min-width:26px;text-align:center;font-variant-numeric:tabular-nums;color:#111;${c === 'CZ' ? 'background:#111;color:#fff' : ''}`)}>{c}</span>)}
              </div>
            </div>

            <div style={S('font-size:8px;color:#71717A;margin-top:10px;line-height:1.4')}>V každé navštívené zemi ručí Kancelář této země za závazky pojistitele vztahující se k použití zmíněného vozidla, a to v souladu se zákony vztahujícími se k povinnému pojištění v této zemi.</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ DOCUMENT PREVIEW MODAL ============================ */
function DocPreviewModal({ vm }) {
  const d = vm.docPreview
  if (d.kind === 'zk') return <GreenCardPreview vm={vm} />
  if (d.kind === 'orv') return <OrvPreview vm={vm} />
  if (d.kind === 'claimdoc') return <ClaimDocPreview vm={vm} />
  if (d.kind === 'faktura') return <InvoicePreview vm={vm} />
  if (d.kind === 'vehdoc') return <VehicleDocPreview vm={vm} />
  const headings = { Smlouva: 'Pojistná smlouva', IPID: 'Informační dokument o pojistném produktu', VPP: 'Všeobecné pojistné podmínky', Záznam: 'Záznam z jednání', Dodatek: 'Dodatek k pojistné smlouvě' }
  const heading = headings[d.type] || d.type
  const line = (w) => <div style={S(`height:9px;border-radius:4px;background:#ECECEE;width:${w}`)}></div>
  const para = (ws) => <div style={S('display:flex;flex-direction:column;gap:8px')}>{ws.map((w, i) => <React.Fragment key={i}>{line(w)}</React.Fragment>)}</div>
  return (
    <div onClick={vm.closeDocPreview} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.45);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={(e) => e.stopPropagation()} style={S('width:760px;max-width:96vw;max-height:92vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('doc2', 18)}</div>
          <div style={{ flex: 1, minWidth: 0 }}><div style={S('font-size:14.5px;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type} · {d.size}</div></div>
          <Hov as="span" base="display:flex;align-items:center;gap:6px;height:34px;padding:0 13px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('arrow', 15)} Stáhnout</Hov>
          <span onClick={vm.closeDocPreview} style={S('color:var(--ink3);cursor:pointer;display:flex;margin-left:4px')}>{ic('close', 18)}</span>
        </div>

        {/* document viewer canvas */}
        <div style={S('flex:1;overflow-y:auto;background:#F1F1F3;padding:24px')}>
          <div style={S('max-width:600px;margin:0 auto;background:#fff;border:1px solid var(--border);border-radius:6px;box-shadow:0 6px 24px rgba(0,0,0,.08);padding:44px 48px;min-height:780px')}>
            <div style={S('display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:30px')}>
              <div style={S('display:flex;align-items:center;gap:11px')}>
                <InsurerLogo name={d.insurer} size={42} />
                <div>
                  <div style={S('font-size:16px;font-weight:800;letter-spacing:.3px')}>{d.insurer}</div>
                  <div style={S('font-size:11px;color:var(--ink3);margin-top:2px')}>Pojistitel</div>
                </div>
              </div>
              <div style={S('text-align:right;font-size:11px;color:var(--ink3)')}>Strana 1 / 3<br />{d.date}</div>
            </div>

            <div style={S('font-size:21px;font-weight:800;letter-spacing:-.3px;margin-bottom:4px')}>{heading}</div>
            <div style={S('font-size:13px;color:var(--ink2);margin-bottom:26px')}>č. <span style={S('font-weight:700;font-variant-numeric:tabular-nums')}>{d.policy}</span></div>

            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:12px 24px;padding:16px 18px;background:#FBFBFC;border:1px solid var(--border);border-radius:8px;margin-bottom:28px')}>
              {[['Pojistník', 'Louda Auto a.s.'], ['Pojistitel', d.insurer], ['Vozový park', d.fleetName], ['Platnost od', d.date], ['Číslo smlouvy', d.policy], ['IČO pojistníka', '256 12 348']].map((r, i) => (
                <div key={i}><div style={S('font-size:10.5px;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px')}>{r[0]}</div><div style={S('font-size:13px;font-weight:600;margin-top:2px;font-variant-numeric:tabular-nums')}>{r[1]}</div></div>
              ))}
            </div>

            <div style={S('font-size:13.5px;font-weight:700;margin-bottom:12px')}>Článek I — Předmět pojištění</div>
            <div style={S('margin-bottom:24px')}>{para(['100%', '96%', '100%', '88%', '92%'])}</div>
            <div style={S('font-size:13.5px;font-weight:700;margin-bottom:12px')}>Článek II — Rozsah pojistného krytí</div>
            <div style={S('margin-bottom:24px')}>{para(['100%', '94%', '100%', '78%'])}</div>
            <div style={S('font-size:13.5px;font-weight:700;margin-bottom:12px')}>Článek III — Pojistné a jeho splatnost</div>
            <div>{para(['100%', '90%', '100%', '85%', '60%'])}</div>
          </div>
        </div>
      </div>
    </div>
  )
}

/* ============================ NEW FLEET MODAL ============================ */
function NewFleetModal({ vm }) {
  const nf = vm.nf
  const fieldWrap = 'display:flex;flex-direction:column;gap:5px'
  const label = 'font-size:11.5px;font-weight:600;color:var(--ink2)'
  const input = 'width:100%;height:42px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;background:#fff'
  return (
    <div onClick={nf.close} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={nf.stop} style={S('width:600px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('fleets', 20)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>Nový vozový park</div><div style={S('font-size:12.5px;color:var(--ink3)')}>Vyplňte údaje parku a flotilové smlouvy</div></div>
          <span onClick={nf.close} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>

        <div style={S('flex:1;overflow-y:auto;padding:22px')}>
          <div style={S('font-size:13.5px;font-weight:700;margin-bottom:12px')}>Základní údaje</div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px')}>
            <div style={S(fieldWrap)}><span style={S(label)}>Název parku</span><input value={nf.name} onChange={nf.onName} placeholder="např. Plzeň – Pobočka" style={S(input)} /></div>
            <div style={S(fieldWrap)}><span style={S(label)}>Fleet manager</span><input value={nf.manager} onChange={nf.onManager} placeholder="Jméno a příjmení" style={S(input)} /></div>
          </div>
          <div style={S('display:flex;align-items:center;gap:10px;margin-top:14px;padding:11px 14px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px')}>
            <span style={S('color:var(--ink3);display:flex;flex-shrink:0')}>{ic('user1', 16)}</span>
            <div style={S('font-size:12.5px;color:var(--ink3)')}>Odpovědný makléř <span style={S('color:var(--ink2);font-weight:600')}>{nf.broker}</span></div>
          </div>

          <div style={S('font-size:13.5px;font-weight:700;margin:20px 0 12px')}>Flotilová smlouva</div>
          <div style={S('display:flex;align-items:flex-start;gap:10px;padding:13px 15px;background:var(--blue-soft);border-radius:12px;margin-bottom:14px')}>
            <span style={S('color:var(--blue);display:flex;flex-shrink:0;margin-top:18px')}>{ic('doc2', 18)}</span>
            <div style={S('flex:1;min-width:0')}>
              <span style={S('font-size:11.5px;font-weight:600;color:var(--blue-ink)')}>Číslo flotilové smlouvy</span>
              <input value={nf.policy} onChange={nf.onPolicy} placeholder="např. 7720 134 567" style={S(input + ';margin-top:5px;font-variant-numeric:tabular-nums;letter-spacing:.3px;font-weight:600')} />
            </div>
          </div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px')}>
            <div style={S(fieldWrap)}><span style={S(label)}>Pojišťovna</span>
              <select value={nf.insurer} onChange={nf.onInsurer} style={S(input + ';cursor:pointer')}>
                {nf.insurerOpts.map((o, i) => <option key={i} value={o}>{o}</option>)}
              </select>
            </div>
            <div style={S(fieldWrap)}><span style={S(label)}>Platnost od</span><input value={nf.start} onChange={nf.onStart} style={S(input)} /></div>
            <div style={S(fieldWrap)}><span style={S(label)}>Počet vozidel</span><input value={nf.vehicles} onChange={nf.onVehicles} placeholder="0" style={S(input + ';font-variant-numeric:tabular-nums')} /></div>
          </div>
        </div>

        <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:10px;padding:16px 22px;border-top:1px solid var(--border)')}>
          <span onClick={nf.close} style={S('height:40px;padding:0 18px;border:1px solid var(--border2);border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:var(--ink2);cursor:pointer')}>Zrušit</span>
          <div onClick={nf.canCreate ? nf.create : undefined} style={S(`height:40px;padding:0 22px;border-radius:10px;display:flex;align-items:center;font-size:13.5px;font-weight:600;color:#fff;background:var(--blue);${nf.canCreate ? 'cursor:pointer' : 'opacity:.5;cursor:not-allowed'}`)}>Vytvořit park</div>
        </div>
      </div>
    </div>
  )
}

/* ============================ DASHBOARD ============================ */
function Dashboard({ vm }) {
  const mob = vm.vp.isMobile
  return (
    <div>
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:14px')}>
        {vm.khero.map((k, i) => (
          <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px')}>
            <div style={S(`width:40px;height:40px;border-radius:11px;background:${k.iconBg};color:${k.iconColor};display:flex;align-items:center;justify-content:center;margin-bottom:16px`)}>{k.icon}</div>
            <div style={S('font-size:30px;font-weight:800;letter-spacing:-1px;line-height:1')}>{k.value}</div>
            <div style={S('font-size:13.5px;font-weight:600;margin-top:7px')}>{k.label}</div>
            <div style={S('font-size:12px;color:var(--ink3);margin-top:1px')}>{k.sub}</div>
          </div>
        ))}
      </div>

      <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '2fr 1fr'};gap:14px;margin-top:14px`)}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px')}>
            <div>
              <div style={S('font-size:15px;font-weight:700')}>Škody</div>
              <div style={S('font-size:12.5px;color:var(--ink3)')}>Vývoj a přehled · posledních 12 měsíců</div>
            </div>
            <div style={S('display:flex;gap:18px;flex-wrap:wrap')}>
              {vm.claimStats.map((s, i) => (
                <div key={i} style={S('text-align:right')}><div style={S(`font-size:18px;font-weight:800;letter-spacing:-.4px;color:${s.color}`)}>{s.value}</div><div style={S('font-size:11px;color:var(--ink3)')}>{s.label}</div></div>
              ))}
            </div>
          </div>
          <div style={S('display:flex;align-items:flex-end;gap:8px;height:130px')}>
            {vm.claimBars.map((b, i) => (
              <div key={i} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:6px;height:100%;justify-content:flex-end')}>
                <div style={S(`width:100%;height:${b.h};background:${b.color};border-radius:5px;min-height:4px`)}></div>
                <span style={S('font-size:10px;color:var(--ink3)')}>{b.label}</span>
              </div>
            ))}
          </div>
        </div>

        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700')}>Pojistné po pojišťovnách</div>
          <div style={S('font-size:12.5px;color:var(--ink3);margin-bottom:16px')}>Podíl na ročním předpisu</div>
          <div style={S('display:flex;align-items:center;gap:18px')}>
            <div style={S(`position:relative;width:108px;height:108px;flex-shrink:0;border-radius:50%;background:${vm.insurerDonut}`)}>
              <div style={S('position:absolute;inset:24px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
                <div style={S('font-size:18px;font-weight:800;letter-spacing:-.5px')}>{vm.insurers.length}</div>
                <div style={S('font-size:10px;color:var(--ink3)')}>pojišťoven</div>
              </div>
            </div>
            <div style={S('flex:1;display:flex;flex-direction:column;gap:9px')}>
              {vm.insurers.map((i, idx) => (
                <div key={idx} style={S('display:flex;align-items:center;gap:8px;font-size:12.5px')}>
                  <span style={S(`width:9px;height:9px;border-radius:3px;background:${i.color};flex-shrink:0`)}></span>
                  <span style={S('flex:1;color:var(--ink2);min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{i.name}</span>
                  <span style={S('color:var(--ink3);font-variant-numeric:tabular-nums')}>{i.volF}</span>
                  <span style={S('font-weight:700;width:34px;text-align:right;font-variant-numeric:tabular-nums')}>{i.pct}%</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-top:14px')}>
        <div style={S('padding:16px 20px;border-bottom:1px solid var(--border);font-size:15px;font-weight:700')}>Poslední aktivita ve správě parku</div>
        <div style={S('padding:6px 20px 16px')}>
          {vm.activity.map((e, i) => (
            <div key={i} style={S('display:flex;gap:12px;padding:9px 0')}>
              <div style={S('display:flex;flex-direction:column;align-items:center;flex-shrink:0')}>
                <span style={S(`width:9px;height:9px;border-radius:50%;background:${e.color};margin-top:4px`)}></span>
                {i < vm.activity.length - 1 && <span style={S('flex:1;width:1.5px;background:var(--border)')}></span>}
              </div>
              <div style={S('flex:1;padding-bottom:4px')}>
                <div style={S('font-size:12.5px;line-height:1.45')}><span style={S('font-weight:700')}>{e.actor}</span> {e.action}</div>
                <div style={S('font-size:11px;color:var(--ink3);margin-top:1px')}>{e.time}</div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================ FLEETS ============================ */
function Fleets({ vm }) {
  const isTable = vm.fleetsView === 'table'
  const segBtn = (on) => `width:34px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:${on ? 'var(--ink)' : 'var(--ink3)'};background:${on ? '#fff' : 'transparent'};box-shadow:${on ? '0 1px 3px rgba(0,0,0,.08)' : 'none'}`
  return (
    <div>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:18px')}>
        <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
          <div style={S('display:flex;align-items:center;gap:7px;height:36px;padding:0 13px;background:#fff;border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer')}>Všechny parky <span style={S('color:var(--ink3);display:flex')}>{ic('chevron', 16)}</span></div>
          <div style={S('display:flex;align-items:center;gap:7px;height:36px;padding:0 13px;background:#fff;border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer')}>Řadit: Pojistné</div>
        </div>
        <div style={S('display:flex;align-items:center;gap:10px')}>
          <div style={S('display:flex;gap:2px;background:#F1F1F3;border-radius:10px;padding:3px')}>
            <div onClick={() => vm.setFleetsView('grid')} style={S(segBtn(!isTable))} title="Dlaždice">{ic('grid', 16)}</div>
            <div onClick={() => vm.setFleetsView('table')} style={S(segBtn(isTable))} title="Tabulka">{ic('rows', 16)}</div>
          </div>
          <ExportMenu {...vm.fleetsExport} />
          <Hov onClick={vm.openNewFleet} base="display:flex;align-items:center;gap:8px;height:38px;padding:0 15px;background:var(--blue);color:#fff;border-radius:10px;font-size:13.5px;font-weight:600;cursor:pointer" hover="background:#1A47A3">{ic('plus', 15)} Nový park</Hov>
        </div>
      </div>

      {isTable ? (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
          <HScroll minW={940}>
            <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
              <div style={S('width:40px;flex-shrink:0')}></div>
              <div style={S('flex:1;min-width:0')}>Park</div>
              <div style={S('width:70px;text-align:right')}>Vozidla</div>
              <div style={S('width:104px;text-align:right')}>Roční pojistné</div>
              <div style={S('width:80px;text-align:right')}>Události</div>
              <div style={S('width:104px')}>Rizikové skóre</div>
              <div style={S('width:150px')}>Pojišťovny</div>
              <div style={S('width:84px')}>Obnovy</div>
              <div style={S('width:18px;flex-shrink:0')}></div>
            </div>
            {vm.fleetCards.map((f, i) => (
              <Hov key={i} onClick={f.onClick} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
                <div style={S('width:40px;height:40px;flex-shrink:0;border-radius:11px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('fleets', 20)}</div>
                <div style={S('flex:1;min-width:0')}><div style={S('font-size:14px;font-weight:700;line-height:1.2')}>{f.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{f.manager}</div></div>
                <div style={S('width:70px;text-align:right;font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums')}>{f.vehicles}</div>
                <div style={S('width:104px;text-align:right;font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums')}>{f.premium}</div>
                <div style={S('width:80px;text-align:right;font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{f.claims}</div>
                <div style={S('width:104px;display:flex;align-items:baseline;gap:5px')}><span style={S(`font-size:15px;font-weight:800;letter-spacing:-.3px;color:${f.riskColor}`)}>{f.risk}</span><span style={S('font-size:11px;color:var(--ink3)')}>/100</span></div>
                <div style={S('width:150px;display:flex;gap:6px;flex-wrap:wrap')}>{f.insurers.map((insN, k) => <span key={k} style={S('font-size:11px;font-weight:600;color:var(--ink2);background:#F4F4F5;border:1px solid var(--border);padding:2px 8px;border-radius:7px')}>{insN}</span>)}</div>
                <div style={S('width:84px')}>{f.renewalsShow ? <span style={S('font-size:11px;font-weight:700;color:var(--amber);background:var(--amber-soft);padding:3px 8px;border-radius:20px;white-space:nowrap')}>{f.renewals} obnov</span> : <span style={S('font-size:12px;color:var(--ink3)')}>—</span>}</div>
                <span style={S('width:18px;flex-shrink:0;color:var(--ink3);display:flex')}>{ic('arrow', 16)}</span>
              </Hov>
            ))}
          </HScroll>
        </div>
      ) : (
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(290px,1fr));gap:14px')}>
        {vm.fleetCards.map((f, i) => (
          <Hov key={i} onClick={f.onClick} base="background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;cursor:pointer;transition:box-shadow .15s,border-color .15s" hover="border:1px solid #D4D4D8;box-shadow:0 8px 24px rgba(0,0,0,.06)">
            <div style={S('display:flex;align-items:flex-start;justify-content:space-between;margin-bottom:16px')}>
              <div style={S('display:flex;align-items:center;gap:12px')}>
                <div style={S('width:44px;height:44px;border-radius:11px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('fleets', 22)}</div>
                <div>
                  <div style={S('font-size:15.5px;font-weight:700;line-height:1.15')}>{f.name}</div>
                  <div style={S('font-size:12.5px;color:var(--ink3)')}>{f.manager}</div>
                </div>
              </div>
              {f.renewalsShow ? <span style={S('font-size:11px;font-weight:700;color:var(--amber);background:var(--amber-soft);padding:3px 8px;border-radius:20px;white-space:nowrap')}>{f.renewals} obnov</span> : null}
            </div>
            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:12px 16px;padding:14px 0;border-top:1px solid var(--border);border-bottom:1px solid var(--border)')}>
              <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Vozidla</div><div style={S('font-size:18px;font-weight:800;letter-spacing:-.5px')}>{f.vehicles}</div></div>
              <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Roční pojistné</div><div style={S('font-size:18px;font-weight:800;letter-spacing:-.5px')}>{f.premium}</div></div>
              <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Události (rok)</div><div style={S('font-size:18px;font-weight:800;letter-spacing:-.5px')}>{f.claims}</div></div>
              <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Rizikové skóre</div><div style={S('display:flex;align-items:center;gap:7px')}><span style={S(`font-size:18px;font-weight:800;letter-spacing:-.5px;color:${f.riskColor}`)}>{f.risk}</span><span style={S('font-size:11px;color:var(--ink3)')}>/100</span></div></div>
            </div>
            <div style={S('display:flex;align-items:center;justify-content:space-between;margin-top:14px')}>
              <div style={S('display:flex;gap:6px')}>
                {f.insurers.map((insN, k) => <span key={k} style={S('font-size:11px;font-weight:600;color:var(--ink2);background:#F4F4F5;border:1px solid var(--border);padding:3px 9px;border-radius:7px')}>{insN}</span>)}
              </div>
              <span style={S('font-size:13px;font-weight:600;color:var(--blue);display:flex;align-items:center;gap:5px')}>Otevřít {ic('arrow', 16)}</span>
            </div>
          </Hov>
        ))}
      </div>
      )}
    </div>
  )
}

/* ============================ FLEET DETAIL ============================ */
function FleetDetail({ vm }) {
  const fd = vm.fd
  const mob = vm.vp.isMobile
  return (
    <div>
      <Hov onClick={vm.goFleets} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Vozové parky</Hov>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px')}>
          <div style={S('display:flex;gap:16px;align-items:center')}>
            <div style={S('width:56px;height:56px;border-radius:14px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('fleets', 28)}</div>
            <div>
              <div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px')}>{fd.name}</div>
              <div style={S('font-size:13px;color:var(--ink3);margin-top:3px')}>Fleet manager <span style={S('color:var(--ink2);font-weight:600')}>{fd.manager}</span> · Odpovědný makléř <span style={S('color:var(--ink2);font-weight:600')}>Robert Harlas, IS Group, spol. s r.o.</span></div>
              <div style={S('display:inline-flex;align-items:center;gap:8px;margin-top:9px;padding:5px 11px;background:var(--blue-soft);border-radius:8px;font-size:12.5px;color:var(--blue-ink)')}><span style={S('display:flex')}>{ic('doc2', 15)}</span>Flotilová smlouva č. <span style={S('font-weight:700;font-variant-numeric:tabular-nums')}>{fd.policy}</span> · platná od {fd.policyStart}</div>
            </div>
          </div>
          <div style={S('display:flex;gap:8px')}>
            <ExportMenu {...fd.export} variant="header" />
            <Hov onClick={vm.openAddVehicle} base="height:38px;padding:0 15px;background:var(--blue);color:#fff;border-radius:10px;display:flex;align-items:center;gap:7px;font-size:13px;font-weight:600;cursor:pointer" hover="background:#1A47A3">{ic('plus', 15)} Přidat vozidlo do flotily</Hov>
          </div>
        </div>
        <div style={S(`display:grid;grid-template-columns:repeat(auto-fit,minmax(${mob ? '120px' : '150px'},1fr));gap:0;margin-top:20px;border:1px solid var(--border);border-radius:12px;overflow:hidden`)}>
          {fd.stats.map((s, i) => (
            <div key={i} style={S('padding:14px 16px;border-right:1px solid var(--border)')}><div style={S('font-size:11.5px;color:var(--ink3)')}>{s.label}</div><div style={S(`font-size:19px;font-weight:800;letter-spacing:-.5px;margin-top:3px;color:${s.color}`)}>{s.value}</div></div>
          ))}
        </div>
      </div>

      <div style={S('display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:20px')}>
        {vm.fleetTabs.map((t, i) => <div key={i} onClick={t.onClick} style={S(t.style)}>{t.label}</div>)}
      </div>

      {fd.isOverview && (
        <>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px')}>
            {fd.summary.map((c, i) => (
              <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>{c.label}</div><div style={S(`font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px;color:${c.color}`)}>{c.value}</div><div style={S('font-size:11.5px;color:var(--ink3);margin-top:2px')}>{c.sub}</div></div>
            ))}
          </div>
          <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '2fr 1fr'};gap:14px`)}>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
              <div style={S('font-size:15px;font-weight:700;margin-bottom:2px')}>Vývoj pojistného</div>
              <div style={S('font-size:12.5px;color:var(--ink3);margin-bottom:8px')}>Park {fd.name} · 12 měsíců</div>
              <svg viewBox="0 0 600 170" style={S('width:100%;height:auto;display:block')} preserveAspectRatio="none"><defs><linearGradient id="fg" x1="0" y1="0" x2="0" y2="1"><stop offset="0" stopColor="#2058C9" stopOpacity="0.16" /><stop offset="1" stopColor="#2058C9" stopOpacity="0" /></linearGradient></defs><path d={fd.line} fill="none" stroke="#2058C9" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"></path><path d={fd.area} fill="url(#fg)"></path></svg>
            </div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
              <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Rozdělení pojistitelů</div>
              <div style={S('display:flex;align-items:center;gap:16px')}>
                <div style={S(`width:96px;height:96px;border-radius:50%;background:${fd.donut};flex-shrink:0`)}></div>
                <div style={S('flex:1;display:flex;flex-direction:column;gap:6px')}>{fd.insurerLegend.map((i, k) => <div key={k} style={S('display:flex;align-items:center;gap:7px;font-size:12px')}><span style={S(`width:8px;height:8px;border-radius:2px;background:${i.color}`)}></span><span style={S('flex:1;color:var(--ink2)')}>{i.name}</span><span style={S('font-weight:700')}>{i.pct}%</span></div>)}</div>
              </div>
            </div>
          </div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(200px,1fr));gap:14px;margin-top:14px')}>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:12px')}>Palivo</div>
              {fd.fuel.map((f, i) => <div key={i} style={S('margin-bottom:10px')}><div style={S('display:flex;justify-content:space-between;font-size:12px;margin-bottom:3px')}><span style={S('font-weight:600')}>{f.name}</span><span style={S('color:var(--ink3)')}>{f.pct}%</span></div><div style={S('height:6px;background:#F1F1F3;border-radius:4px')}><div style={S(`height:100%;width:${f.w};background:${f.color};border-radius:4px`)}></div></div></div>)}
            </div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;display:flex;flex-direction:column;align-items:center;justify-content:center')}>
              <div style={S('font-size:14px;font-weight:700;align-self:flex-start;margin-bottom:14px')}>Elektromobilita</div>
              <div style={S(`position:relative;width:120px;height:120px;border-radius:50%;background:${fd.evDonut}`)}><div style={S('position:absolute;inset:18px;background:#fff;border-radius:50%;display:flex;flex-direction:column;align-items:center;justify-content:center')}><div style={S('font-size:24px;font-weight:800;color:var(--green)')}>{fd.evPct}%</div><div style={S('font-size:10.5px;color:var(--ink3)')}>elektro + hybrid</div></div></div>
            </div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:12px')}>Historie událostí</div>
              <div style={S('display:flex;align-items:flex-end;gap:6px;height:90px')}>
                {fd.claimBars.map((b, i) => <div key={i} style={S('flex:1;height:100%;display:flex;align-items:flex-end')}><div style={S(`width:100%;height:${b.h};background:${b.color};border-radius:4px;min-height:3px`)}></div></div>)}
              </div>
              <div style={S('font-size:11.5px;color:var(--ink3);margin-top:8px')}>{fd.claims} událostí za 12 měsíců</div>
            </div>
          </div>

          {/* all vehicles in fleet */}
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-top:14px')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)')}>
              <div style={S('display:flex;align-items:center;gap:9px')}>
                <span style={S('color:var(--ink2);display:flex')}>{ic('car', 17)}</span>
                <span style={S('font-size:15px;font-weight:700')}>Vozidla ve flotile</span>
                <span style={S('font-size:11.5px;font-weight:700;background:#F1F1F3;color:var(--ink2);padding:2px 8px;border-radius:20px')}>{fd.vehicleCount}</span>
              </div>
              <span onClick={fd.goVehiclesTab} style={S('font-size:12.5px;font-weight:600;color:var(--blue);cursor:pointer')}>Spravovat vozidla →</span>
            </div>
            <HScroll minW={900}>
            <div style={S('display:flex;align-items:center;gap:14px;padding:9px 18px;border-bottom:1px solid var(--border);font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
              <div style={S('width:46px;flex-shrink:0')}></div>
              <div style={S('width:96px;flex-shrink:0')}>SPZ</div>
              <div style={S('flex:1')}>Vozidlo</div>
              <div style={S('width:110px')}>Pojišťovna</div>
              <div style={S('width:100px;text-align:right')}>Pojistné</div>
              <div style={S('width:116px')}>Stav</div>
              <div style={S('width:34px;flex-shrink:0')}></div>
            </div>
            {fd.vehicles.map((v) => (
              <Hov key={v.id} base={v.rowStyle} hover="background:#FAFAFA">
                <div onClick={v.onClick} style={S('width:46px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer')}>{ic('car', 17)}</div>
                <div onClick={v.onClick} style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer')}>{v.plate}</div>
                <div onClick={v.onClick} style={S('flex:1;min-width:0;cursor:pointer')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year} · {v.fuel}</div><div style={S('font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;line-height:1.35')}>VIN {v.vin} · Přihláška {v.prihlaska}</div></div>
                <div style={S('width:110px;font-size:12.5px;color:var(--ink2)')}>{v.insurer}</div>
                <div style={S('width:100px;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.premiumF}</div>
                <div style={S('width:116px')}><span style={S(v.chipStyle)}>{v.statusLabel}</span></div>
                <div onClick={v.toggleMenu} style={S(v.kebabStyle)} title="Akce">{ic('kebab', 18)}</div>
                {v.menuOpen && <RowMenu v={v} />}
              </Hov>
            ))}
            </HScroll>
            {vm.rowMenuOpen && <div onClick={vm.closeRowMenu} style={S('position:fixed;inset:0;z-index:24')}></div>}
          </div>
          <EndedVehiclesTable rows={fd.endedVehicles} count={fd.endedCount} showPark={false} />
        </>
      )}

      {fd.isVehicles && (
        <>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
          <HScroll minW={820}>
          {fd.vehicles.map((v) => (
            <Hov key={v.id} onClick={v.onClick} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
              <div style={S('width:46px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ic('car', 17)}</div>
              <div style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.plate}</div>
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year}</div><div style={S('font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;line-height:1.35')}>VIN {v.vin} · Přihláška {v.prihlaska}</div></div>
              <div style={S('width:120px;font-size:12.5px;color:var(--ink2)')}>{v.insurer}</div>
              <div style={S('width:110px;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.premiumF}</div>
              <span style={S(v.chipStyle)}>{v.statusLabel}</span>
            </Hov>
          ))}
          </HScroll>
        </div>
        <EndedVehiclesTable rows={fd.endedVehicles} count={fd.endedCount} showPark={false} />
        </>
      )}

      {fd.isInsurance && (
        <div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px')}>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Sjednaných rizik</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{fd.riskCount}</div></div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Aktivních vozidel</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{fd.activeCount}</div></div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Objem pojistného celkem</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{fd.riskTotalF}</div></div>
          </div>
          <div style={S('display:flex;justify-content:flex-end;margin-bottom:12px')}><ExportMenu {...fd.risksExport} /></div>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
            <HScroll minW={820}>
              <div style={S('display:flex;align-items:center;gap:28px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
                <div style={S('width:38px;flex-shrink:0')}></div>
                <div style={S('flex:1;min-width:0')}>Riziko</div>
                <div style={S('width:150px;text-align:center')}>Vozidla</div>
                <div style={S('width:150px')}>Pokrytí</div>
                <div style={S('width:150px;text-align:right')}>Objem pojistného</div>
              </div>
              {fd.riskRows.map((r, i) => (
                <Hov key={i} base="display:flex;align-items:center;gap:28px;padding:13px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
                  <div style={S(`width:38px;height:38px;flex-shrink:0;border-radius:10px;background:${r.bg};color:${r.color};display:flex;align-items:center;justify-content:center`)}>{r.icon}</div>
                  <div style={S('flex:1;min-width:0;font-size:13.5px;font-weight:600')}>{r.label}</div>
                  <div style={S('width:150px;text-align:center;font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums')}>{r.count}</div>
                  <div style={S('width:150px')}><div style={S('display:flex;align-items:center;gap:8px')}><div style={S('flex:1;height:6px;background:#F1F1F3;border-radius:4px;overflow:hidden')}><div style={S(`height:100%;width:${r.coverage}%;background:${r.color};border-radius:4px`)}></div></div><span style={S('font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;width:30px;text-align:right')}>{r.coverage}%</span></div></div>
                  <div style={S('width:150px;text-align:right;font-weight:800;font-size:14px;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{r.premiumF}</div>
                </Hov>
              ))}
              <div style={S('display:flex;align-items:center;gap:28px;padding:13px 18px;background:#FBFBFC')}>
                <div style={S('width:38px;flex-shrink:0')}></div>
                <div style={S('flex:1;min-width:0;font-size:12.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>Aktivní objem pojistného celkem</div>
                <div style={S('width:150px')}></div>
                <div style={S('width:150px')}></div>
                <div style={S('width:150px;text-align:right;font-weight:800;font-size:14px;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{fd.riskTotalF}</div>
              </div>
            </HScroll>
          </div>
        </div>
      )}

      {fd.isInsurers && (
        <div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(170px,1fr));gap:14px;margin-bottom:14px')}>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Pojistitelé na parku</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{fd.insurersCount}</div></div>
            <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Objem pojistného celkem</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{fd.insurersTotalF}</div></div>
          </div>
          <div style={S('display:flex;justify-content:flex-end;margin-bottom:12px')}><ExportMenu {...fd.insurersExport} /></div>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
            <HScroll minW={720}>
              <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
                <div style={S('width:40px;flex-shrink:0')}></div>
                <div style={S('flex:1;min-width:0')}>Pojistitel</div>
                <div style={S('width:160px')}>Číslo pojistné smlouvy</div>
                <div style={S('width:90px;text-align:right')}>Vozidla</div>
                <div style={S('width:150px;text-align:right')}>Objem pojistného</div>
              </div>
              {fd.parkInsurers.map((p, i) => (
                <div key={i} style={S('display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border)')}>
                  <InsurerLogo name={p.name} size={40} />
                  <div style={S('flex:1;min-width:0;font-size:14px;font-weight:700')}>{p.name}</div>
                  <div style={S('width:160px;font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{p.policy}</div>
                  <div style={S('width:90px;text-align:right;font-size:13px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{p.count}</div>
                  <div style={S('width:150px;text-align:right;font-weight:800;font-size:14px;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{p.premiumF}</div>
                </div>
              ))}
              <div style={S('display:flex;align-items:center;gap:14px;padding:13px 18px;background:#FBFBFC')}>
                <div style={S('width:40px;flex-shrink:0')}></div>
                <div style={S('flex:1;min-width:0;font-size:12.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>Celkem</div>
                <div style={S('width:160px')}></div>
                <div style={S('width:90px')}></div>
                <div style={S('width:150px;text-align:right;font-weight:800;font-size:14px;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{fd.insurersTotalF}</div>
              </div>
            </HScroll>
          </div>
        </div>
      )}

      {fd.isClaims && (
        <>
          <div style={S('display:flex;justify-content:flex-end;margin-bottom:12px')}><ExportMenu {...fd.claimsExport} /></div>
          <ClaimsTable rows={fd.parkClaims} title="Nahlášené škody parku" />
        </>
      )}

      {fd.isOther && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:48px;text-align:center;color:var(--ink3)')}>
          <div style={S('width:52px;height:52px;border-radius:13px;background:#F4F4F5;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--ink3)')}>{fd.otherIcon}</div>
          <div style={S('font-size:15px;font-weight:700;color:var(--ink2)')}>{fd.otherTitle}</div>
          <div style={S('font-size:13px;margin-top:5px;max-width:380px;margin-left:auto;margin-right:auto')}>{fd.otherDesc}</div>
        </div>
      )}
    </div>
  )
}

function RowMenu({ v }) {
  return (
    <div onClick={v.stop} style={S('position:absolute;right:14px;top:46px;z-index:30;width:210px;background:#fff;border:1px solid var(--border2);border-radius:12px;box-shadow:0 16px 40px rgba(0,0,0,.16);padding:6px;animation:popIn .13s ease')}>
      <Hov onClick={v.changeCover} base="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink);cursor:pointer" hover="background:#F5F7FB"><span style={S('display:flex;color:var(--blue)')}>{ic('shield', 16)}</span> Změnit krytí</Hov>
      <Hov onClick={v.reportClaim} base="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:13px;font-weight:600;color:var(--star-ink);cursor:pointer" hover="background:var(--star-soft)"><span style={S('display:flex;color:var(--star)')}>{ic('alert', 17)}</span> Nahlásit škodu</Hov>
      <div style={S('height:1px;background:var(--border);margin:5px 6px')}></div>
      <Hov onClick={v.unsubscribe} base="display:flex;align-items:center;gap:10px;padding:9px 11px;border-radius:9px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA;color:var(--star)"><span style={S('display:flex')}>{ic('logout', 16)}</span> Odhlásit z pojištění</Hov>
    </div>
  )
}

/* ============================ VEHICLES ============================ */
function Vehicles({ vm }) {
  return (
    <div>
      {vm.rowMenuOpen && <div onClick={vm.closeRowMenu} style={S('position:fixed;inset:0;z-index:25')}></div>}
      <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap;margin-bottom:14px')}>
        <div style={S('display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;background:#fff;border:1px solid var(--border);border-radius:10px;flex:1;min-width:220px;max-width:340px;color:var(--ink3)')}>
          <span style={S('display:flex')}>{ic('search', 17)}</span>
          <input value={vm.vfQuery} onChange={vm.onVfQuery} placeholder="Hledat SPZ, model, řidiče…" style={S('border:none;outline:none;font-size:13.5px;font-family:inherit;flex:1;background:transparent;color:var(--ink)')} />
        </div>
        {vm.vFilters.map((fl, i) => (
          <select key={i} value={fl.value} onChange={fl.onChange} style={S('height:38px;padding:0 10px;background:#fff;border:1px solid var(--border);border-radius:10px;font-size:13px;font-weight:500;font-family:inherit;color:var(--ink2);cursor:pointer')}>
            {fl.options.map((o, k) => <option key={k} value={o.v}>{o.l}</option>)}
          </select>
        ))}
        <div style={{ flex: 1 }}></div>
        <ExportMenu {...vm.vehiclesExport} />
        <Hov onClick={vm.openAddVehicle} base="display:flex;align-items:center;gap:7px;height:38px;padding:0 14px;background:var(--blue);color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer" hover="background:#1A47A3">{ic('plus', 15)} Přidat vozidlo</Hov>
      </div>

      {vm.vSelCount ? (
        <div style={S('display:flex;align-items:center;gap:14px;background:var(--blue-ink);color:#fff;border-radius:11px;padding:10px 16px;margin-bottom:12px;animation:fadeUp .2s ease')}>
          <span style={S('font-size:13px;font-weight:600')}>{vm.vSelCount} vybráno</span>
          <div style={{ flex: 1 }}></div>
          <span style={S('font-size:12.5px;font-weight:600;cursor:pointer;opacity:.92')}>Změnit park</span>
          <span style={S('font-size:12.5px;font-weight:600;cursor:pointer;opacity:.92')}>Hromadná obnova</span>
          <span style={S('font-size:12.5px;font-weight:600;cursor:pointer;opacity:.92')}>Export</span>
          <span onClick={vm.clearSel} style={S('cursor:pointer;display:flex;opacity:.8')}>{ic('close', 17)}</span>
        </div>
      ) : null}

      <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:12px')}>
        <span style={S('font-size:15px;font-weight:700')}>Aktivní vozidla v provozu</span>
        <span style={S('font-size:11.5px;font-weight:700;background:#F1F1F3;color:var(--ink2);padding:2px 8px;border-radius:20px')}>{vm.vehicleRows.length}</span>
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={1000}>
        <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
          <div style={S('width:18px;flex-shrink:0')}></div>
          <div style={S('width:46px;flex-shrink:0')}></div>
          <div style={S('width:96px;flex-shrink:0')}>SPZ</div>
          <div style={S('flex:1')}>Vozidlo / řidič</div>
          <div style={S('width:120px')}>Park</div>
          <div style={S('width:110px')}>Pojišťovna</div>
          <div style={S('width:90px;text-align:right')}>Pojistné</div>
          <div style={S('width:96px')}>Obnova</div>
          <div style={S('width:34px;flex-shrink:0')}></div>
        </div>
        {vm.vehicleRows.map((v) => (
          <Hov key={v.id} base={v.rowStyle} hover="background:#FAFAFA">
            <div onClick={v.toggle} style={S(v.checkStyle)}>{v.checkIcon}</div>
            <div onClick={v.onClick} style={S('width:46px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0;cursor:pointer')}>{ic('car', 17)}</div>
            <div onClick={v.onClick} style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums;cursor:pointer')}>{v.plate}</div>
            <div onClick={v.onClick} style={S('flex:1;min-width:0;cursor:pointer')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year} · {v.fuel}</div><div style={S('font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;line-height:1.35')}>VIN {v.vin} · Přihláška {v.prihlaska}</div></div>
            <div style={S('width:120px;font-size:12.5px;color:var(--ink2)')}>{v.fleetName}</div>
            <div style={S('width:110px;font-size:12.5px;color:var(--ink2)')}>{v.insurer}</div>
            <div style={S('width:90px;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.premiumF}</div>
            <div style={S('width:96px;font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{v.renewal}</div>
            <div onClick={v.toggleMenu} style={S(v.kebabStyle)} title="Akce">{ic('kebab', 18)}</div>
            {v.menuOpen && <RowMenu v={v} />}
          </Hov>
        ))}
        </HScroll>
        <div style={S('display:flex;align-items:center;justify-content:space-between;padding:12px 18px;font-size:12.5px;color:var(--ink3)')}>
          <span>Zobrazeno {vm.vehicleRows.length} z 312 vozidel</span>
          <div style={S('display:flex;gap:6px;align-items:center')}><span style={S('padding:4px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer')}>←</span><span style={S('padding:4px 10px;border:1px solid var(--blue);color:var(--blue);background:var(--blue-soft);border-radius:7px;font-weight:700;cursor:pointer')}>1</span><span style={S('padding:4px 10px;border:1px solid var(--border);border-radius:7px;cursor:pointer')}>2</span><span style={S('padding:4px 10px;border:1px solid var(--border);border-radius:7px;cursor:pointer')}>3</span><span style={S('padding:4px 9px;border:1px solid var(--border);border-radius:7px;cursor:pointer')}>→</span></div>
        </div>
      </div>

      <EndedVehiclesTable rows={vm.endedRows} count={vm.endedCount} />
    </div>
  )
}

/* ============================ UKONČENÁ VOZIDLA (sdílená tabulka) ============================ */
function EndedVehiclesTable({ rows, count, showPark = true }) {
  if (!count) return null
  return (
    <div style={S('margin-top:22px')}>
      <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:12px')}>
        <span style={S('font-size:15px;font-weight:700')}>Ukončená vozidla</span>
        <span style={S('font-size:11.5px;font-weight:700;background:#F1F1F3;color:var(--ink2);padding:2px 8px;border-radius:20px')}>{count}</span>
        <span style={S('font-size:12.5px;color:var(--ink3)')}>odhlášená z pojištění</span>
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={showPark ? 900 : 760}>
          <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
            <div style={S('width:46px;flex-shrink:0')}></div>
            <div style={S('width:96px;flex-shrink:0')}>SPZ</div>
            <div style={S('flex:1;min-width:0')}>Vozidlo</div>
            {showPark && <div style={S('width:120px')}>Park</div>}
            <div style={S('width:110px')}>Pojišťovna</div>
            <div style={S('width:96px')}>Ukončeno</div>
            <div style={S('width:150px')}>Důvod</div>
          </div>
          {rows.map((v) => (
            <Hov key={v.id} onClick={v.onClick} base="display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border);cursor:pointer;opacity:.82" hover="background:#FAFAFA;opacity:1">
              <div style={S('width:46px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ic('car', 17)}</div>
              <div style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.plate}</div>
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year} · {v.fuel}</div></div>
              {showPark && <div style={S('width:120px;font-size:12.5px;color:var(--ink2)')}>{v.fleetName}</div>}
              <div style={S('width:110px;font-size:12.5px;color:var(--ink2)')}>{v.insurer}</div>
              <div style={S('width:96px;font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{v.endedDate}</div>
              <div style={S('width:150px;font-size:12.5px;color:var(--ink2)')}>{v.endReason}</div>
            </Hov>
          ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ VEHICLE DETAIL ============================ */
function VehicleDetail({ vm }) {
  const vd = vm.vd
  const mob = vm.vp.isMobile
  return (
    <div>
      <Hov onClick={vm.goVehicles} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Vozidla</Hov>

      <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '340px 1fr'};gap:16px;margin-bottom:16px`)}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
          <div style={S('height:190px;background:linear-gradient(135deg,#EEF1F6,#E2E7EF);display:flex;align-items:center;justify-content:center;position:relative')}>
            <span style={S('color:#B6BCC6')}>{ic('car', 96, 1.2)}</span>
            <span style={{ position: 'absolute', top: 12, left: 12, ...S(vd.chipStyle) }}>{vd.statusLabel}</span>
          </div>
          <div style={S('padding:18px')}>
            <div style={S('font-size:13px;color:var(--ink3)')}>{vd.fleetName}</div>
            <div style={S('font-size:20px;font-weight:800;letter-spacing:-.5px;line-height:1.1;margin-top:2px')}>{vd.brand} {vd.model}</div>
            <div style={S('display:inline-flex;align-items:center;background:#18181B;color:#fff;font-weight:800;font-size:15px;letter-spacing:1px;padding:5px 12px;border-radius:7px;margin-top:10px;font-variant-numeric:tabular-nums')}>{vd.plate}</div>
            <div style={S('margin-top:14px;display:flex;flex-direction:column;gap:9px')}>
              {vd.facts.map((x, i) => <div key={i} style={S('display:flex;justify-content:space-between;font-size:13px')}><span style={S('color:var(--ink3)')}>{x.k}</span><span style={S('font-weight:600')}>{x.v}</span></div>)}
            </div>
          </div>
        </div>

        <div style={S('display:flex;flex-direction:column;gap:16px')}>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
              <div style={S('font-size:15px;font-weight:700')}>Rychlé akce</div>
              <span style={S('font-size:12px;color:var(--ink3)')}>{vd.driver} · řidič</span>
            </div>
            <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(90px,1fr));gap:9px')}>
              {vd.actions.map((a, i) => (
                <Hov key={i} onClick={a.onClick} base="display:flex;flex-direction:column;align-items:center;gap:7px;padding:13px 6px;border:1px solid var(--border);border-radius:11px;cursor:pointer;text-align:center;transition:border-color .15s ease,background .15s ease" hover="border:1px solid var(--blue);background:#FAFBFF">
                  <span style={{ color: a.color, display: 'flex' }}>{a.icon}</span>
                  <span style={S('font-size:11.5px;font-weight:600;line-height:1.2;color:var(--ink2)')}>{a.label}</span>
                </Hov>
              ))}
            </div>
          </div>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:18px 20px;flex:1')}>
            <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Souhrn pojištění</div>
            <div style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:14px')}>
              <div><div style={S('font-size:12px;color:var(--ink3)')}>Celkové pojistné</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:3px')}>{vd.premiumF}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>ročně</div></div>
              <div><div style={S('font-size:12px;color:var(--ink3)')}>Aktivní produkty</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:3px')}>{vd.productCount}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>krytí</div></div>
              <div><div style={S('font-size:12px;color:var(--ink3)')}>Nejbližší obnova</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:3px;color:var(--amber)')}>{vd.renewal}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>povinné ručení</div></div>
            </div>
          </div>
        </div>
      </div>

      <div style={S('display:flex;gap:4px;border-bottom:1px solid var(--border);margin-bottom:20px')}>
        {vm.vehicleTabs.map((t, i) => <div key={i} onClick={t.onClick} style={S(t.style)}>{t.label}</div>)}
      </div>

      {vd.isOverview && (
        <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '1fr 1fr'};gap:14px`)}>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
            <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Specifikace vozidla</div>
            <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:13px 20px')}>
              {vd.specs.map((x, i) => <div key={i}><div style={S('font-size:11.5px;color:var(--ink3)')}>{x.k}</div><div style={S('font-size:13.5px;font-weight:600;margin-top:1px')}>{x.v}</div></div>)}
            </div>
          </div>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
            <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Přiřazení & lokalita</div>
            <div style={S('display:flex;flex-direction:column;gap:13px')}>
              {vd.assign.map((x, i) => <div key={i} style={S('display:flex;align-items:center;gap:12px')}><div style={S(`width:36px;height:36px;border-radius:9px;background:${x.bg};color:${x.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{x.icon}</div><div><div style={S('font-size:11.5px;color:var(--ink3)')}>{x.k}</div><div style={S('font-size:13.5px;font-weight:600')}>{x.v}</div></div></div>)}
            </div>
          </div>
        </div>
      )}

      {vd.isInsurance && (
        <div>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px')}>
            <div style={S('font-size:13px;color:var(--ink3)')}>{vd.products.length} sjednaných rizik · roční pojistné <span style={S('color:var(--ink);font-weight:700')}>{vd.productsTotalF}</span></div>
            <ExportMenu {...vd.productsExport} />
          </div>
          <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
            <HScroll minW={860}>
              <div style={S('display:grid;grid-template-columns:1fr 150px 124px 116px 96px;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
                <div>Riziko</div>
                <div>Limit / poj. částka</div>
                <div>Spoluúčast</div>
                <div style={S('text-align:right')}>Roční pojistné</div>
                <div style={S('text-align:right')}>Akce</div>
              </div>
              {vd.products.map((p, i) => (
                <Hov key={i} base="display:grid;grid-template-columns:1fr 150px 124px 116px 96px;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
                  <div style={S('display:flex;align-items:center;gap:11px;min-width:0')}>
                    <div style={S(`width:34px;height:34px;border-radius:9px;background:${p.bg};color:${p.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{p.icon}</div>
                    <div style={S('min-width:0')}>
                      <div style={S('display:flex;align-items:center;gap:8px')}><span style={S('font-size:13.5px;font-weight:700')}>{p.name}</span>{p.status === 'nocasco' ? <span style={S(p.chipStyle)}>{p.statusLabel}</span> : null}</div>
                      <div style={S('font-size:11.5px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.insurer} · {p.policy}</div>
                    </div>
                  </div>
                  <div style={S('font-size:13px;font-weight:600;color:var(--ink2)')}>{p.coverage}</div>
                  <div style={S('font-size:13px;color:var(--ink2)')}>{p.deductible}</div>
                  <div style={S('text-align:right;font-size:13.5px;font-weight:800;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{p.premiumF}</div>
                  <div style={S('display:flex;gap:4px;justify-content:flex-end;color:var(--ink3)')}>
                    <Hov as="span" base="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer" hover="background:#F1F1F3;color:var(--ink)" title="Upravit krytí">{ic('edit', 16)}</Hov>
                    <Hov as="span" base="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer;color:var(--star)" hover="background:var(--star-soft)" title="Porovnat nabídky">{ic('scales', 16)}</Hov>
                    <Hov as="span" base="width:30px;height:30px;border-radius:8px;display:flex;align-items:center;justify-content:center;cursor:pointer" hover="background:#F1F1F3;color:var(--ink)" title="Stáhnout PDF">{ic('download', 16)}</Hov>
                  </div>
                </Hov>
              ))}
            </HScroll>
          </div>
        </div>
      )}

      {vd.isClaims && (
        <>
          <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
            <div style={S('font-size:14px;color:var(--ink3)')}>{vd.claims.length} událostí pro toto vozidlo</div>
            <div onClick={vm.openClaimWizard} style={S('display:flex;align-items:center;gap:7px;height:38px;padding:0 15px;background:var(--star);color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer')}>{ic('plus', 15)} Nahlásit škodu</div>
          </div>
          <div style={S('position:relative;padding-left:8px')}>
            {vd.claims.map((c, i) => (
              <div key={i} style={S('display:flex;gap:16px;padding-bottom:18px')}>
                <div style={S('display:flex;flex-direction:column;align-items:center;flex-shrink:0')}><span style={S(`width:14px;height:14px;border-radius:50%;background:${c.dot};border:3px solid #fff;box-shadow:0 0 0 1.5px ${c.dot}`)}></span><span style={S('flex:1;width:2px;background:var(--border)')}></span></div>
                <div style={S('flex:1;background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:16px 18px;margin-top:-4px')}>
                  <div style={S('display:flex;align-items:flex-start;justify-content:space-between')}><div><div style={S('font-size:14.5px;font-weight:700')}>{c.type}</div><div style={S('font-size:12.5px;color:var(--ink3)')}>{c.id} · {c.date} · {c.insurer}</div></div><span style={S(c.chipStyle)}>{c.statusLabel}</span></div>
                  <div style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-top:13px')}><div><div style={S('font-size:11px;color:var(--ink3)')}>Odhad škody</div><div style={S('font-size:14px;font-weight:700')}>{c.estimateF}</div></div><div><div style={S('font-size:11px;color:var(--ink3)')}>Servis</div><div style={S('font-size:13px;font-weight:600')}>{c.shop}</div></div><div><div style={S('font-size:11px;color:var(--ink3)')}>Likvidátor</div><div style={S('font-size:13px;font-weight:600')}>{c.adjuster}</div></div></div>
                  <div style={S('margin-top:13px')}><div style={S('display:flex;justify-content:space-between;font-size:11px;color:var(--ink3);margin-bottom:4px')}><span>Průběh opravy</span><span>{c.progress}%</span></div><div style={S('height:6px;background:#F1F1F3;border-radius:4px')}><div style={S(`height:100%;width:${c.progressW};background:${c.dot};border-radius:4px`)}></div></div></div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}

      {vd.isTimeline && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:24px 26px')}>
          {vd.timeline.map((e, i) => (
            <div key={i} style={S('display:flex;gap:16px')}>
              <div style={S('width:130px;flex-shrink:0;text-align:right;font-size:12px;color:var(--ink3);padding-top:1px')}>{e.date}</div>
              <div style={S('display:flex;flex-direction:column;align-items:center;flex-shrink:0')}><div style={S(`width:30px;height:30px;border-radius:9px;background:${e.bg};color:${e.color};display:flex;align-items:center;justify-content:center`)}>{e.icon}</div><span style={S('flex:1;width:2px;background:var(--border);margin:2px 0')}></span></div>
              <div style={S('flex:1;padding-bottom:22px')}><div style={S('font-size:14px;font-weight:700')}>{e.title}</div><div style={S('font-size:12.5px;color:var(--ink3);margin-top:2px')}>{e.desc}</div></div>
            </div>
          ))}
        </div>
      )}

      {vd.isVehDocs && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)')}>
            <div style={S('font-size:15px;font-weight:700')}>Dokumenty vozidla</div>
            <Hov as="span" base="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:1px solid var(--border2);border-radius:10px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('upload', 15)} Nahrát dokument</Hov>
          </div>
          {vd.vehicleDocs.map((d, i) => (
            <Hov key={i} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
              <div style={S(`width:36px;height:36px;border-radius:9px;background:${d.bg};color:${d.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{d.icon}</div>
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{d.type} · {d.meta}</div></div>
              <div style={S('width:64px;font-size:12px;color:var(--ink3);text-align:right;font-variant-numeric:tabular-nums')}>{d.size}</div>
              <div style={S('display:flex;gap:10px;color:var(--ink3)')}><Hov as="span" onClick={d.openPreview} base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Náhled">{d.preview}</Hov><Hov as="span" base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Stáhnout">{d.download}</Hov></div>
            </Hov>
          ))}
        </div>
      )}

      {vd.isNotes && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;padding:14px 18px;border-bottom:1px solid var(--border)')}>
            <div style={S('font-size:15px;font-weight:700')}>Poznámky <span style={S('font-size:12.5px;font-weight:600;color:var(--ink3)')}>· {vd.notes.length}</span></div>
            <Hov onClick={vd.openNoteModal} as="span" base="display:inline-flex;align-items:center;gap:7px;height:38px;padding:0 15px;background:var(--star);color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer" hover="filter:brightness(.95)">{ic('plus', 15)} Přidat poznámku</Hov>
          </div>
          {vd.notes.length === 0 ? (
            <div style={S('padding:40px 18px;text-align:center;font-size:13px;color:var(--ink3)')}>Zatím žádné poznámky k tomuto vozidlu.</div>
          ) : vd.notes.map((n, i) => (
            <div key={i} style={S('display:flex;gap:13px;padding:15px 18px;border-bottom:1px solid var(--border)')}>
              <div style={S('width:34px;height:34px;border-radius:50%;background:linear-gradient(135deg,#3A3A42,#18181B);color:#fff;font-weight:700;font-size:12px;display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{n.initials}</div>
              <div style={S('flex:1;min-width:0')}>
                <div style={S('display:flex;align-items:baseline;gap:8px;flex-wrap:wrap;margin-bottom:3px')}><span style={S('font-size:13px;font-weight:700')}>{n.author}</span><span style={S('font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{n.date} · {n.time}</span></div>
                <div style={S('font-size:13.5px;line-height:1.55;color:var(--ink2)')}>{n.text}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      {vd.isCosts && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:48px;text-align:center')}>
          <Hov onClick={vd.openCostModal} as="span" base="display:inline-flex;align-items:center;gap:8px;height:42px;padding:0 20px;background:var(--star);color:#fff;border-radius:11px;font-size:13.5px;font-weight:600;cursor:pointer" hover="filter:brightness(.95)">{ic('plus', 16)} Přidat náklad</Hov>
        </div>
      )}

      {vd.isOther && (
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:48px;text-align:center;color:var(--ink3)')}>
          <div style={S('width:52px;height:52px;border-radius:13px;background:#F4F4F5;display:flex;align-items:center;justify-content:center;margin:0 auto 14px;color:var(--ink3)')}>{vd.otherIcon}</div>
          <div style={S('font-size:15px;font-weight:700;color:var(--ink2)')}>{vd.otherTitle}</div>
          <div style={S('font-size:13px;margin-top:5px;max-width:400px;margin:8px auto 0')}>{vd.otherDesc}</div>
        </div>
      )}
    </div>
  )
}

/* ============================ INSURANCE ============================ */
function Insurance({ vm }) {
  return (
    <div>
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px')}>
        {vm.insStats.map((s, i) => <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px')}><div style={S('font-size:12px;color:var(--ink3)')}>{s.label}</div><div style={S(`font-size:24px;font-weight:800;letter-spacing:-.5px;margin-top:5px;color:${s.color}`)}>{s.value}</div><div style={S('font-size:11.5px;color:var(--ink3);margin-top:1px')}>{s.sub}</div></div>)}
      </div>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:14px')}>
        <div style={S('font-size:15px;font-weight:700')}>Pojistné smlouvy <span style={S('font-size:12.5px;font-weight:600;color:var(--ink3)')}>· {vm.contracts.length}</span></div>
        <ExportMenu {...vm.insExport} />
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={920}>
          <div style={S('display:grid;grid-template-columns:40px 1fr 150px 118px 96px 110px 124px;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
            <div></div><div>Pojišťovna / smlouva</div><div>Vozový park</div><div style={S('text-align:right')}>Roční pojistné</div><div>Výročí</div><div>Škodní průběh</div><div></div>
          </div>
          {vm.contracts.map((c, i) => (
            <Hov key={i} onClick={c.onClick} base="display:grid;grid-template-columns:40px 1fr 150px 118px 96px 110px 124px;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
              <InsurerLogo name={c.insurer} size={34} />
              <div style={S('min-width:0')}><div style={S('font-size:13.5px;font-weight:700')}>{c.insurer}{c.coInsurer ? <span style={S('font-weight:600;color:var(--ink3)')}> + {c.coInsurer}</span> : null}</div><div style={S('font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>č. {c.policy} · {c.vehicleCount} vozidel</div></div>
              <div style={S('font-size:12.5px;color:var(--ink2);overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{c.parkName}</div>
              <div style={S('text-align:right;font-weight:800;font-size:13.5px;letter-spacing:-.3px;font-variant-numeric:tabular-nums')}>{c.premiumF}</div>
              <div style={S('font-size:12.5px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{c.anniversary}</div>
              <div style={S('display:flex;align-items:center;gap:7px')}><span style={S(`width:8px;height:8px;border-radius:50%;background:${c.lrColor};flex-shrink:0`)}></span><span style={S('font-size:12.5px;font-weight:600;font-variant-numeric:tabular-nums')}>{c.lossRatio} %</span></div>
              <div style={S('display:flex;align-items:center;justify-content:flex-end;gap:9px')}><span style={S(c.chipStyle)}>{c.statusLabel}</span><span style={S('color:var(--ink3);display:flex')}>{ic('arrow', 16)}</span></div>
            </Hov>
          ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ DETAIL POJISTNÉ SMLOUVY ============================ */
function InsuranceDetail({ vm }) {
  const d = vm.idet
  const card = 'background:var(--card);border:1px solid var(--border);border-radius:var(--r)'
  return (
    <div>
      <Hov onClick={d.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Pojistné smlouvy</Hov>

      {/* hlavička */}
      <div style={S(`${card};padding:22px 24px;margin-bottom:16px`)}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px')}>
          <div style={S('display:flex;gap:15px;align-items:center')}>
            <InsurerLogo name={d.insurer} size={52} />
            <div>
              <div style={S('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}><div style={S('font-size:21px;font-weight:800;letter-spacing:-.5px')}>{d.insurer}{d.coInsurer ? <span style={S('font-size:15px;font-weight:600;color:var(--ink3)')}> + {d.coInsurer}</span> : null}</div><span style={S(d.chipStyle)}>{d.statusLabel}</span></div>
              <div style={S('font-size:13px;color:var(--ink3);margin-top:3px')}>Flotilová pojistná smlouva <span style={S('color:var(--ink2);font-weight:600;font-variant-numeric:tabular-nums')}>č. {d.policy}</span> · {d.parkName}</div>
            </div>
          </div>
          <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
            <div style={S('padding:10px 16px;border:1px solid var(--border);border-radius:12px')}><div style={S('font-size:11.5px;color:var(--ink3)')}>Roční pojistné</div><div style={S('font-size:19px;font-weight:800;letter-spacing:-.5px')}>{d.premiumF}</div></div>
            <div style={S('padding:10px 16px;border:1px solid var(--border);border-radius:12px')}><div style={S('font-size:11.5px;color:var(--ink3)')}>Pojištěno vozidel</div><div style={S('font-size:19px;font-weight:800;letter-spacing:-.5px;font-variant-numeric:tabular-nums')}>{d.vehicleCount}</div></div>
            <div style={S('padding:10px 16px;border:1px solid var(--border);border-radius:12px')}><div style={S('font-size:11.5px;color:var(--ink3)')}>Výročí smlouvy</div><div style={S('font-size:19px;font-weight:800;letter-spacing:-.5px;color:var(--amber);font-variant-numeric:tabular-nums')}>{d.anniversary}</div></div>
          </div>
        </div>
      </div>

      {/* info o smlouvě + zprostředkovatel */}
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:16px')}>
        <div style={S(`${card};padding:20px`)}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Informace o smlouvě</div>
          <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:13px 20px')}>
            {d.facts.map((x, i) => <div key={i}><div style={S('font-size:11.5px;color:var(--ink3)')}>{x.k}</div><div style={S('font-size:13.5px;font-weight:600;margin-top:1px;font-variant-numeric:tabular-nums')}>{x.v}</div></div>)}
          </div>
        </div>
        <div style={S(`${card};padding:20px`)}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Zprostředkovatel pojištění</div>
          <div style={S('display:flex;align-items:center;gap:13px;padding-bottom:14px;border-bottom:1px solid var(--border);margin-bottom:14px')}>
            <div style={S('width:44px;height:44px;border-radius:11px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ic('shield', 22)}</div>
            <div><div style={S('font-size:14.5px;font-weight:700')}>{d.broker.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.broker.role} · {d.broker.reg}</div></div>
          </div>
          <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:13px 20px')}>
            {[['IČO', d.broker.ico], ['Odpovědná osoba', d.broker.person], ['E-mail', d.broker.email], ['Telefon', d.broker.phone]].map((r, i) => <div key={i}><div style={S('font-size:11.5px;color:var(--ink3)')}>{r[0]}</div><div style={S('font-size:13px;font-weight:600;margin-top:1px;font-variant-numeric:tabular-nums')}>{r[1]}</div></div>)}
          </div>
        </div>
      </div>

      {/* bonifikace + škodní průběh */}
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:16px')}>
        <div style={S(`${card};padding:20px`)}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
            <div style={S('font-size:15px;font-weight:700')}>Bonifikace</div>
            <span style={S(`font-size:11.5px;font-weight:700;padding:3px 10px;border-radius:20px;color:${d.bonus.set ? 'var(--green)' : 'var(--ink3)'};background:${d.bonus.set ? 'var(--green-soft)' : '#F1F1F3'}`)}>{d.bonus.set ? 'Nastavena' : 'Bez nároku'}</span>
          </div>
          {d.bonus.set ? (
            <>
              <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:14px')}>
                <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Aktuální pásmo</div><div style={S('font-size:15px;font-weight:700;margin-top:2px')}>Škodní průběh do {d.bonus.threshold} %</div></div>
                <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Vrací se z pojistného</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:1px;color:var(--green)')}>{d.bonus.rate}</div></div>
              </div>
              <div style={S('display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:13px 15px;background:var(--green-soft);border-radius:11px')}>
                <span style={S('font-size:12.5px;color:#15803D;font-weight:600')}>Odhadovaná roční bonifikace</span>
                <span style={S('font-size:17px;font-weight:800;color:var(--green);letter-spacing:-.3px')}>{d.bonus.rebateF}</span>
              </div>
            </>
          ) : (
            <div style={S('font-size:13px;color:var(--ink3);line-height:1.5')}>Při aktuálním škodním průběhu {d.bonus.lossRatio} % nevzniká nárok na bonifikaci.</div>
          )}
          <Hov onClick={d.bonus.goDetail} as="span" base="display:inline-flex;align-items:center;gap:6px;margin-top:14px;font-size:12.5px;font-weight:600;color:var(--blue);cursor:pointer" hover="text-decoration:underline">Detail bonifikace {ic('arrow', 14)}</Hov>
        </div>
        <div style={S(`${card};padding:20px`)}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Škodní průběh & frekvence</div>
          <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:16px')}>
            <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Škodní průběh (loss ratio)</div><div style={S(`font-size:26px;font-weight:800;letter-spacing:-.5px;margin-top:2px;color:${d.loss.lrColor}`)}>{d.loss.lossRatio} %</div></div>
            <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Škodní frekvence</div><div style={S('font-size:26px;font-weight:800;letter-spacing:-.5px;margin-top:2px')}>{d.loss.freqF}<span style={S('font-size:13px;color:var(--ink3);font-weight:600')}> / 100 voz.</span></div></div>
            <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Počet škod (rok)</div><div style={S('font-size:17px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums')}>{d.loss.claims}</div></div>
            <div><div style={S('font-size:11.5px;color:var(--ink3)')}>Vyplaceno (vzorek)</div><div style={S('font-size:17px;font-weight:700;margin-top:2px;font-variant-numeric:tabular-nums')}>{d.loss.paidF}</div></div>
          </div>
        </div>
      </div>

      {/* dokumenty */}
      <div style={S(`${card};overflow:hidden;margin-bottom:16px`)}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid var(--border)')}>
          <div style={S('font-size:15px;font-weight:700')}>Dokumenty ke smlouvě</div>
          <Hov as="span" base="display:inline-flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:1px solid var(--border2);border-radius:10px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('upload', 15)} Nahrát dokument</Hov>
        </div>
        {d.docs.map((doc, i) => (
          <Hov key={i} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
            <div style={S(`width:36px;height:36px;border-radius:9px;background:${doc.bg};color:${doc.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{doc.icon}</div>
            <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{doc.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{doc.type}</div></div>
            <div style={S('width:64px;font-size:12px;color:var(--ink3);text-align:right;font-variant-numeric:tabular-nums')}>{doc.size}</div>
            <div style={S('display:flex;gap:10px;color:var(--ink3)')}><Hov as="span" onClick={doc.openPreview} base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Náhled">{ic('search', 16)}</Hov><Hov as="span" base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Stáhnout">{ic('arrow', 16)}</Hov></div>
          </Hov>
        ))}
      </div>

      {/* aktivní vozidla */}
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;flex-wrap:wrap;margin-bottom:12px')}>
        <div style={S('display:flex;align-items:center;gap:9px')}><span style={S('font-size:15px;font-weight:700')}>Aktivní vozidla ve flotile</span><span style={S('font-size:11.5px;font-weight:700;background:#F1F1F3;color:var(--ink2);padding:2px 8px;border-radius:20px')}>{d.activeCount}</span></div>
        <ExportMenu {...d.vehiclesExport} />
      </div>
      <div style={S(`${card};overflow:hidden;margin-bottom:16px`)}>
        <HScroll minW={820}>
          {d.activeRows.map((v) => (
            <Hov key={v.id} onClick={v.onClick} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
              <div style={S('width:46px;height:34px;border-radius:7px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{ic('car', 17)}</div>
              <div style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.plate}</div>
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year}</div><div style={S('font-size:11px;color:var(--ink3);font-variant-numeric:tabular-nums;line-height:1.35')}>VIN {v.vin} · Přihláška {v.prihlaska}</div></div>
              <div style={S('width:120px;font-size:12.5px;color:var(--ink2)')}>{v.insurer}</div>
              <div style={S('width:110px;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.premiumF}</div>
              <span style={S(v.chipStyle)}>{v.statusLabel}</span>
            </Hov>
          ))}
        </HScroll>
      </div>

      {/* odhlášená vozidla */}
      <EndedVehiclesTable rows={d.endedRows} count={d.endedRows.length} showPark={false} />
    </div>
  )
}

/* ============================ DETAIL ŠKODY ============================ */
function ClaimDetail({ vm }) {
  const cd = vm.cd
  return (
    <div>
      <Hov onClick={cd.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Škody</Hov>

      {/* hlavička */}
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px')}>
          <div style={S('display:flex;gap:16px;align-items:center')}>
            <div style={S('width:52px;height:52px;border-radius:13px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('alert', 26)}</div>
            <div>
              <div style={S('display:flex;align-items:center;gap:10px;flex-wrap:wrap')}><div style={S('font-size:21px;font-weight:800;letter-spacing:-.5px')}>{cd.type}</div><span style={S(cd.riskStyle)}>{cd.risk}</span></div>
              <div style={S('font-size:13px;color:var(--ink3);margin-top:3px')}>Škoda <span style={S('color:var(--ink2);font-weight:600;font-variant-numeric:tabular-nums')}>{cd.id}</span> · <Hov as="span" onClick={cd.goVehicle} base="color:var(--blue);font-weight:600;cursor:pointer" hover="text-decoration:underline">{cd.plate} {cd.brand} {cd.model}</Hov></div>
            </div>
          </div>
          <div style={S('display:flex;gap:10px;flex-wrap:wrap;align-items:center')}>
            <div style={S('padding:10px 16px;border:1px solid var(--border);border-radius:12px;text-align:right')}><div style={S('font-size:11.5px;color:var(--ink3)')}>Výše škody</div><div style={S('font-size:19px;font-weight:800;letter-spacing:-.5px')}>{cd.estimateF}</div></div>
            <div style={S(`padding:10px 16px;border-radius:12px;text-align:right;background:${cd.paid ? 'var(--green-soft)' : '#F4F4F5'}`)}><div style={S('font-size:11.5px;color:var(--ink3)')}>Vyplaceno</div><div style={S(`font-size:19px;font-weight:800;letter-spacing:-.5px;color:${cd.paid ? 'var(--green)' : 'var(--ink3)'}`)}>{cd.payoutF}</div></div>
            <span style={S(cd.chipStyle)}>{cd.statusLabel}</span>
          </div>
        </div>
        {/* průběh */}
        <div style={S('margin-top:18px')}>
          <div style={S('display:flex;justify-content:space-between;font-size:11.5px;color:var(--ink3);margin-bottom:5px')}><span>Průběh likvidace</span><span>{cd.progress}%</span></div>
          <div style={S('height:7px;background:#F1F1F3;border-radius:4px;overflow:hidden')}><div style={S(`height:100%;width:${cd.progress}%;background:${cd.paid ? 'var(--green)' : 'var(--amber)'};border-radius:4px`)}></div></div>
        </div>
      </div>

      {/* souhrn + popis */}
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(300px,1fr));gap:16px;margin-bottom:16px')}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Souhrn události</div>
          <div style={S('display:grid;grid-template-columns:1fr 1fr;gap:13px 20px')}>
            {cd.facts.map((x, i) => <div key={i}><div style={S('font-size:11.5px;color:var(--ink3)')}>{x.k}</div><div style={S('font-size:13.5px;font-weight:600;margin-top:1px;font-variant-numeric:tabular-nums')}>{x.v}</div></div>)}
          </div>
        </div>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Popis události</div>
          <div style={S('font-size:13.5px;line-height:1.6;color:var(--ink2)')}>{cd.description}</div>
          <div style={S('display:flex;align-items:center;gap:9px;margin-top:16px;padding:11px 14px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px')}>
            <span style={S('color:var(--star);display:flex;flex-shrink:0')}>{ic('mapPin', 17)}</span>
            <div><div style={S('font-size:11px;color:var(--ink3)')}>Místo události</div><div style={S('font-size:13px;font-weight:600')}>{cd.location}</div></div>
          </div>
        </div>
      </div>

      {/* fotodokumentace */}
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
          <div style={S('font-size:15px;font-weight:700')}>Fotodokumentace</div>
          <span style={S('font-size:12.5px;color:var(--ink3)')}>{cd.photoCount} snímků</span>
        </div>
        <div style={S('display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:10px')}>
          {Array.from({ length: cd.photoCount }).map((_, i) => (
            <div key={i} style={S('aspect-ratio:4/3;border-radius:10px;background:linear-gradient(135deg,#EEF1F6,#E2E7EF);display:flex;align-items:center;justify-content:center;color:#B6BCC6;position:relative')}>{ic('camera', 24)}<span style={S('position:absolute;bottom:6px;left:8px;font-size:10px;color:#8E99AB;font-weight:600')}>IMG_{String(i + 1).padStart(2, '0')}</span></div>
          ))}
        </div>
      </div>

      {/* AI nástroj */}
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:15px 20px;background:linear-gradient(135deg,#2563DB,#1A47A3);color:#fff')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:rgba(255,255,255,.16);display:flex;align-items:center;justify-content:center')}>{ic('sparkle', 20)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:15px;font-weight:700')}>AI detekce poškození a rozpočet opravy</div><div style={S('font-size:12px;color:rgba(255,255,255,.8)')}>Automatická analýza z fotodokumentace</div></div>
          <span style={S('font-size:11px;font-weight:700;background:rgba(255,255,255,.18);padding:4px 10px;border-radius:20px')}>Fleet AI · beta</span>
        </div>
        <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:0')}>
          {/* detekce */}
          <div style={S('padding:20px;border-right:1px solid var(--border)')}>
            <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}>
              <div style={S('font-size:13.5px;font-weight:700')}>Detekovaná poškození</div>
              <span style={S('font-size:11.5px;font-weight:700;color:var(--blue);background:var(--blue-soft);padding:3px 9px;border-radius:20px')}>přesnost {cd.ai.confidence} %</span>
            </div>
            <div style={S('display:flex;flex-direction:column;gap:13px')}>
              {cd.ai.parts.map((p, i) => (
                <div key={i}>
                  <div style={S('display:flex;align-items:center;justify-content:space-between;gap:10px;margin-bottom:4px')}>
                    <div style={S('min-width:0')}><div style={S('font-size:13px;font-weight:600')}>{p.name}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{p.severity}</div></div>
                    <span style={S('font-size:12px;font-weight:700;color:var(--ink2);font-variant-numeric:tabular-nums;flex-shrink:0')}>{p.confidence} %</span>
                  </div>
                  <div style={S('height:5px;background:#F1F1F3;border-radius:3px;overflow:hidden')}><div style={S(`height:100%;width:${p.confidence}%;background:${p.barColor};border-radius:3px`)}></div></div>
                </div>
              ))}
            </div>
          </div>
          {/* rozpočet */}
          <div style={S('padding:20px')}>
            <div style={S('font-size:13.5px;font-weight:700;margin-bottom:14px')}>Rozpočet opravy (odhad)</div>
            <div style={S('display:flex;flex-direction:column;gap:2px')}>
              {cd.ai.items.map((it, i) => (
                <div key={i} style={S('display:flex;align-items:center;justify-content:space-between;gap:12px;padding:9px 0;border-bottom:1px solid var(--border)')}>
                  <div><div style={S('font-size:13px;font-weight:600')}>{it.k}</div>{it.d ? <div style={S('font-size:11.5px;color:var(--ink3)')}>{it.d}</div> : null}</div>
                  <div style={S('font-size:13px;font-weight:700;font-variant-numeric:tabular-nums')}>{it.v}</div>
                </div>
              ))}
            </div>
            <div style={S('display:flex;align-items:center;justify-content:space-between;margin-top:14px;padding:13px 15px;background:#0F1115;border-radius:11px;color:#fff')}>
              <div style={S('font-size:12.5px;color:#A1A1AA')}>Odhadované náklady na opravu</div>
              <div style={S('font-size:18px;font-weight:800;letter-spacing:-.5px')}>{cd.ai.totalF}</div>
            </div>
            <div style={S('display:flex;gap:8px;margin-top:12px;flex-wrap:wrap')}>
              <span style={S('display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;background:var(--blue);color:#fff;border-radius:9px;font-size:12.5px;font-weight:600;cursor:pointer')}>{ic('check', 15)} Použít odhad</span>
              <Hov as="span" base="display:flex;align-items:center;gap:7px;height:36px;padding:0 14px;border:1px solid var(--border2);border-radius:9px;font-size:12.5px;font-weight:600;color:var(--ink2);cursor:pointer" hover="background:#FAFAFA">{ic('refresh', 15)} Přepočítat</Hov>
            </div>
          </div>
        </div>
      </div>

      {/* dokumenty */}
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden;margin-bottom:16px')}>
        <div style={S('padding:14px 18px;border-bottom:1px solid var(--border);font-size:15px;font-weight:700')}>Nahrané dokumenty</div>
        {cd.docs.map((d, i) => (
          <Hov key={i} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
            <div style={S(`width:36px;height:36px;border-radius:9px;background:${d.bg};color:${d.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{d.icon}</div>
            <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.type}</div></div>
            <div style={S('width:70px;font-size:12px;color:var(--ink3)')}>{d.size}</div>
            <div style={S('display:flex;gap:10px;color:var(--ink3)')}><Hov as="span" onClick={d.openPreview} base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Náhled">{d.preview}</Hov><Hov as="span" base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Stáhnout">{d.download}</Hov></div>
          </Hov>
        ))}
      </div>

      {/* časová osa */}
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px')}>
        <div style={S('font-size:15px;font-weight:700;margin-bottom:18px')}>Časová osa likvidace</div>
        {cd.timeline.map((e, i) => (
          <div key={i} style={S('display:flex;gap:16px')}>
            <div style={S('display:flex;flex-direction:column;align-items:center;flex-shrink:0')}>
              <div style={S(`width:34px;height:34px;border-radius:10px;background:${e.tileBg};color:${e.tileColor};display:flex;align-items:center;justify-content:center`)}>{e.icon}</div>
              {i < cd.timeline.length - 1 && <span style={S('flex:1;width:2px;background:var(--border);margin:3px 0')}></span>}
            </div>
            <div style={S('flex:1;padding-bottom:20px')}>
              <div style={S('display:flex;align-items:center;gap:9px;flex-wrap:wrap')}><div style={S(`font-size:14px;font-weight:700;color:${e.state === 'pending' ? 'var(--ink3)' : 'var(--ink)'}`)}>{e.title}</div>{e.badge ? <span style={S('font-size:10.5px;font-weight:700;color:var(--amber);background:var(--amber-soft);padding:2px 8px;border-radius:20px')}>{e.badge}</span> : null}<span style={S('font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{e.date}</span></div>
              <div style={S('font-size:12.5px;color:var(--ink3);margin-top:2px')}>{e.desc}</div>
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================ ŠKODY (sdílená tabulka) ============================ */
function ClaimsTable({ rows, title }) {
  return (
    <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
      {title && <div style={S('padding:14px 18px;border-bottom:1px solid var(--border);font-size:15px;font-weight:700')}>{title}</div>}
      <HScroll minW={900}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
          <div style={S('width:34px;flex-shrink:0')}></div>
          <div style={S('flex:1;min-width:0')}>Vozidlo</div>
          <div style={S('width:54px')}>Riziko</div>
          <div style={S('width:104px')}>Nahlásil</div>
          <div style={S('width:86px')}>Nahlášeno</div>
          <div style={S('width:96px;text-align:right')}>Výše škody</div>
          <div style={S('width:104px')}>Stav</div>
          <div style={S('width:96px;text-align:right')}>Vyplaceno</div>
        </div>
        {rows.length === 0 ? (
          <div style={S('padding:28px 18px;text-align:center;font-size:13px;color:var(--ink3)')}>Žádné nahlášené škody</div>
        ) : rows.map((c, i) => (
          <Hov key={i} onClick={c.onClick} base="display:flex;align-items:center;gap:12px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
            <div style={S(`width:34px;height:34px;border-radius:9px;background:${c.bg};color:${c.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{ic('alert', 16)}</div>
            <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:700;font-variant-numeric:tabular-nums')}>{c.plate} <span style={S('font-weight:600;color:var(--ink2)')}>· {c.brand} {c.model}</span></div><div style={S('font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>VIN {c.vin} · {c.id} · {c.type}</div></div>
            <div style={S('width:54px')}><span style={S(c.riskStyle)}>{c.risk}</span></div>
            <div style={S('width:104px;font-size:12.5px;color:var(--ink2)')}>{c.reportedBy}</div>
            <div style={S('width:86px;font-size:12.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{c.date}</div>
            <div style={S('width:96px;text-align:right;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{c.estimateF}</div>
            <div style={S('width:104px')}><span style={S(c.chipStyle)}>{c.statusLabel}</span></div>
            <div style={S(`width:96px;text-align:right;font-size:13px;font-variant-numeric:tabular-nums;font-weight:${c.paid ? '700' : '400'};color:${c.paid ? 'var(--green)' : 'var(--ink3)'}`)}>{c.payoutF}</div>
          </Hov>
        ))}
      </HScroll>
    </div>
  )
}

/* ============================ CLAIMS ============================ */
function Claims({ vm }) {
  const mob = vm.vp.isMobile
  return (
    <div>
      <div style={S('display:flex;align-items:center;justify-content:space-between;gap:14px;flex-wrap:wrap;margin-bottom:16px')}>
        <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:14px;flex:1;min-width:260px;max-width:760px')}>
          {vm.claimStats.map((s, i) => <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:15px 16px')}><div style={S('font-size:11.5px;color:var(--ink3)')}>{s.label}</div><div style={S(`font-size:23px;font-weight:800;letter-spacing:-.5px;margin-top:4px;color:${s.color}`)}>{s.value}</div></div>)}
        </div>
        <div style={S('display:flex;align-items:center;gap:8px')}>
          <ExportMenu {...vm.claimsExport} />
          <div onClick={vm.openClaimWizard} style={S('display:flex;align-items:center;gap:8px;height:42px;padding:0 18px;background:var(--star);color:#fff;border-radius:11px;font-size:14px;font-weight:600;cursor:pointer;box-shadow:0 6px 18px rgba(200,16,46,.25)')}>{ic('plus', 15)} Nahlásit událost</div>
        </div>
      </div>
      <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '1fr 1fr'};gap:14px;margin-bottom:14px`)}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Události podle parku</div>
          {vm.claimsByFleet.map((b, i) => <div key={i} style={S('margin-bottom:11px')}><div style={S('display:flex;justify-content:space-between;font-size:12.5px;margin-bottom:4px')}><span style={S('font-weight:600')}>{b.name}</span><span style={S('color:var(--ink3)')}>{b.count}</span></div><div style={S('height:7px;background:#F1F1F3;border-radius:4px')}><div style={S(`height:100%;width:${b.w};background:${b.color};border-radius:4px`)}></div></div></div>)}
        </div>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:14px')}><div style={S('font-size:15px;font-weight:700')}>Trend nahlášených</div><span style={S('font-size:12px;font-weight:600;color:var(--green);background:var(--green-soft);padding:3px 9px;border-radius:20px')}>−14 % r/r</span></div>
          <div style={S('display:flex;align-items:flex-end;gap:7px;height:130px')}>
            {vm.claimTrend.map((b, i) => <div key={i} style={S('flex:1;display:flex;flex-direction:column;align-items:center;gap:5px;height:100%;justify-content:flex-end')}><div style={S(`width:100%;height:${b.h};background:${b.color};border-radius:4px;min-height:3px`)}></div><span style={S('font-size:9.5px;color:var(--ink3)')}>{b.label}</span></div>)}
          </div>
        </div>
      </div>
      <ClaimsTable rows={vm.claimRows} title="Všechny škody" />
    </div>
  )
}

/* ============================ DOCUMENTS ============================ */
function Documents({ vm }) {
  const cols = vm.vp.isMobile || vm.vp.isTablet ? 2 : 4
  return (
    <div>
      <div style={S('display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:center;gap:8px;height:38px;padding:0 12px;background:#fff;border:1px solid var(--border);border-radius:10px;flex:1;min-width:200px;max-width:360px;color:var(--ink3)')}><span style={S('display:flex')}>{ic('search', 17)}</span><input placeholder="Hledat dokument, vozidlo, SPZ…" style={S('border:none;outline:none;font-size:13.5px;font-family:inherit;flex:1;min-width:0;background:transparent')} /></div>
        <div style={{ flex: 1 }}></div>
        <div style={S('display:flex;align-items:center;gap:7px;height:38px;padding:0 13px;border:1px solid var(--border);background:#fff;border-radius:10px;font-size:13px;font-weight:600;color:var(--ink2);cursor:pointer')}>{ic('doc2', 16)} Hromadné stažení</div>
        <div style={S('display:flex;align-items:center;gap:7px;height:38px;padding:0 14px;background:var(--blue);color:#fff;border-radius:10px;font-size:13px;font-weight:600;cursor:pointer')}>{ic('plus', 15)} Nahrát</div>
      </div>
      <div style={S(`display:grid;grid-template-columns:repeat(${cols},1fr);gap:12px;margin-bottom:18px`)}>
        {vm.docFolders.map((f, i) => (
          <Hov key={i} onClick={f.onClick} base="display:flex;align-items:center;gap:12px;background:var(--card);border:1.5px solid var(--border);border-radius:12px;padding:14px 15px;cursor:pointer;transition:border-color .15s ease,box-shadow .15s ease,background .15s ease" hover="border:1.5px solid var(--blue);background:#FAFBFF;box-shadow:0 4px 16px rgba(32,88,201,.12)">
            <div style={S(`width:42px;height:42px;border-radius:11px;background:${f.bg};color:${f.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{f.icon}</div>
            <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:700;overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{f.name}</div><div style={S('font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{f.count} souborů</div></div>
            <span style={S('color:var(--ink3);display:flex;flex-shrink:0')}>{ic('arrow', 16)}</span>
          </Hov>
        ))}
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <div style={S('padding:14px 18px;border-bottom:1px solid var(--border);font-size:15px;font-weight:700')}>Nedávné dokumenty</div>
        <HScroll minW={680}>
        {vm.docRows.map((d, i) => (
          <Hov key={i} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
            <div style={S(`width:36px;height:36px;border-radius:9px;background:${d.bg};color:${d.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{d.icon}</div>
            <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{d.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{d.scope}</div></div>
            <div style={S('width:90px;font-size:12px;color:var(--ink3)')}>{d.type}</div>
            <div style={S('width:80px;font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{d.date}</div>
            <div style={S('width:60px;font-size:12px;color:var(--ink3)')}>{d.size}</div>
            <div style={S('display:flex;gap:8px;color:var(--ink3)')}><span style={S('cursor:pointer;display:flex')}>{d.preview}</span><span style={S('cursor:pointer;display:flex')}>{d.download}</span></div>
          </Hov>
        ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ VEHICLE DOCUMENT LISTS (ZK / ORV) ============================ */
function DocumentsVehicleDocs({ vm }) {
  const dd = vm.dd
  return (
    <div>
      <Hov onClick={dd.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Dokumenty</Hov>

      <div style={S(`display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:13px 16px;background:${dd.bannerBg};border-radius:12px;font-size:12.5px;color:${dd.bannerColor}`)}>
        <span style={S('display:flex;flex-shrink:0')}>{ic('doc2', 17)}</span>
        <span>{dd.banner}</span>
      </div>

      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={840}>
          <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
            <div style={S('width:40px;flex-shrink:0')}></div>
            <div style={S('width:96px;flex-shrink:0')}>SPZ</div>
            <div style={S('flex:1;min-width:0')}>Vozidlo</div>
            <div style={S('width:190px')}>VIN</div>
            <div style={S('width:170px;text-align:right')}>{dd.docColLabel}</div>
          </div>
          {dd.vehicles.map((v) => (
            <Hov key={v.id} base="display:flex;align-items:center;gap:14px;padding:12px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
              <div style={S(`width:40px;height:40px;flex-shrink:0;border-radius:10px;background:${dd.iconBg};color:${dd.iconColor};display:flex;align-items:center;justify-content:center`)}>{ic('car', 18)}</div>
              <div style={S('width:96px;flex-shrink:0;font-weight:700;font-size:13px;font-variant-numeric:tabular-nums')}>{v.plate}</div>
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{v.brand} {v.model}</div><div style={S('font-size:12px;color:var(--ink3)')}>{v.driver} · {v.year} · {v.insurer}</div></div>
              <div style={S('width:190px;font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{v.vin}</div>
              <div style={S('width:170px;display:flex;align-items:center;justify-content:flex-end;gap:10px')}>
                <span style={S(`font-size:11.5px;font-weight:700;color:${dd.bannerColor};background:${dd.iconBg};padding:4px 10px;border-radius:20px;white-space:nowrap`)}>{dd.badgeLabel}</span>
                <Hov as="span" onClick={v.openPreview} base="cursor:pointer;display:flex;color:var(--ink3)" hover="color:var(--blue)" title="Náhled">{v.preview}</Hov>
                <Hov as="span" base="cursor:pointer;display:flex;color:var(--ink3)" hover="color:var(--blue)" title="Stáhnout">{v.download}</Hov>
              </div>
            </Hov>
          ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ FAKTURY ============================ */
function DocumentsInvoices({ vm }) {
  const dd = vm.dd
  return (
    <div>
      <Hov onClick={dd.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Dokumenty</Hov>

      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:16px')}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Faktur celkem</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{dd.count}</div></div>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Předepsáno celkem</div><div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{dd.totalF}</div></div>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}><div style={S('font-size:12px;color:var(--ink3)')}>Neuhrazeno</div><div style={S(`font-size:22px;font-weight:800;letter-spacing:-.5px;margin-top:5px;color:${dd.unpaidCount ? 'var(--star)' : 'var(--green)'}`)}>{dd.unpaidF}</div><div style={S('font-size:11.5px;color:var(--ink3);margin-top:1px')}>{dd.unpaidCount} faktur</div></div>
      </div>

      <div style={S('display:flex;align-items:center;justify-content:space-between;margin-bottom:12px')}>
        <span style={S('font-size:15px;font-weight:700')}>Přehled faktur</span>
        <ExportMenu {...dd.export} />
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={922}>
          <div style={S('display:flex;align-items:center;gap:10px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.3px')}>
            <div style={S('width:112px;flex-shrink:0')}>Číslo faktury</div>
            <div style={S('flex:1;min-width:140px;max-width:230px')}>Pojišťovna</div>
            <div style={S('width:108px')}>Č. smlouvy</div>
            <div style={S('width:92px;text-align:right')}>Předpis</div>
            <div style={S('width:78px;text-align:right')}>Vystaveno</div>
            <div style={S('width:78px;text-align:right')}>Splatnost</div>
            <div style={S('width:78px;text-align:right')}>Uhrazeno</div>
            <div style={S('width:104px')}>Stav</div>
            <div style={S('width:52px;flex-shrink:0;text-align:right')}>Doklad</div>
          </div>
          {dd.invoices.map((iv, i) => (
            <Hov key={i} base="display:flex;align-items:center;gap:10px;padding:12px 18px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
              <div style={S('width:112px;flex-shrink:0;font-size:12px;font-weight:700;color:var(--ink2);font-variant-numeric:tabular-nums')}>{iv.num}</div>
              <div style={S('flex:1;min-width:140px;max-width:230px;display:flex;align-items:center;gap:9px')}><InsurerLogo name={iv.insurer} size={28} /><span style={S('font-size:13px;font-weight:600;white-space:nowrap;overflow:hidden;text-overflow:ellipsis')}>{iv.insurer}</span></div>
              <div style={S('width:108px;font-size:12px;color:var(--ink2);font-variant-numeric:tabular-nums')}>{iv.policy}</div>
              <div style={S('width:92px;text-align:right;font-weight:700;font-size:12.5px;font-variant-numeric:tabular-nums')}>{iv.amountF}</div>
              <div style={S('width:78px;text-align:right;font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{iv.issue}</div>
              <div style={S('width:78px;text-align:right;font-size:11.5px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{iv.due}</div>
              <div style={S(`width:78px;text-align:right;font-size:11.5px;font-variant-numeric:tabular-nums;color:${iv.paid ? 'var(--ink2)' : 'var(--ink3)'}`)}>{iv.paidDate}</div>
              <div style={S('width:104px')}><span style={S(iv.chipStyle)}>{iv.statusLabel}</span></div>
              <div style={S('width:52px;flex-shrink:0;display:flex;align-items:center;justify-content:flex-end;gap:9px;color:var(--ink3)')}><Hov as="span" onClick={iv.openPreview} base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Náhled">{iv.preview}</Hov><Hov as="span" base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Stáhnout">{iv.download}</Hov></div>
            </Hov>
          ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ DOCUMENTS DETAIL ============================ */
function DocumentsDetail({ vm }) {
  const dd = vm.dd
  if (dd.cat === 'zk' || dd.cat === 'orv') return <DocumentsVehicleDocs vm={vm} />
  if (dd.cat === 'faktury') return <DocumentsInvoices vm={vm} />
  return (
    <div>
      <Hov onClick={dd.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Dokumenty</Hov>

      <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:13px 16px;background:var(--blue-soft);border-radius:12px;font-size:12.5px;color:var(--blue-ink)')}>
        <span style={S('display:flex;flex-shrink:0')}>{ic('shield', 17)}</span>
        <span>{dd.count} flotilových smluv. Rozbalte smlouvu pro zobrazení všech dokumentů (smlouva, IPID, VPP, záznam z jednání, dodatky).</span>
      </div>

      <div style={S('display:flex;flex-direction:column;gap:12px')}>
        {dd.contracts.map((c) => (
          <div key={c.id} style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
            <Hov onClick={c.toggle} base={c.headStyle} hover="background:#FAFAFA">
              <InsurerLogo name={c.insurer} size={40} />
              <div style={S('flex:1;min-width:0')}>
                <div style={S('font-size:14.5px;font-weight:700;line-height:1.2')}>{c.insurer}</div>
                <div style={S('font-size:12px;color:var(--ink3)')}>Flotilová smlouva č. <span style={S('font-variant-numeric:tabular-nums')}>{c.policy}</span> · {c.fleetName}</div>
              </div>
              <span style={S('font-size:11.5px;font-weight:700;color:var(--ink2);background:#F1F1F3;padding:3px 9px;border-radius:20px;white-space:nowrap')}>{c.docCount} dokumentů</span>
              <span style={S(c.chevStyle)}>{ic('chevron', 18)}</span>
            </Hov>
            {c.isOpen && (
              <div style={S('border-top:1px solid var(--border)')}>
                <HScroll minW={620}>
                  {c.docs.map((d, j) => (
                    <Hov key={j} base="display:flex;align-items:center;gap:14px;padding:12px 18px 12px 22px;border-bottom:1px solid var(--border)" hover="background:#FAFAFA">
                      <div style={S(`width:34px;height:34px;border-radius:9px;background:${d.bg};color:${d.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{d.icon}</div>
                      <div style={S('flex:1;min-width:0')}><div style={S('font-size:13.5px;font-weight:600')}>{d.name}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{d.type}</div></div>
                      <div style={S('width:90px;font-size:12px;color:var(--ink3);font-variant-numeric:tabular-nums')}>{d.date}</div>
                      <div style={S('width:60px;font-size:12px;color:var(--ink3)')}>{d.size}</div>
                      <div style={S('display:flex;gap:10px;color:var(--ink3)')}><Hov as="span" onClick={d.openPreview} base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Náhled">{d.preview}</Hov><Hov as="span" base="cursor:pointer;display:flex" hover="color:var(--blue)" title="Stáhnout">{d.download}</Hov></div>
                    </Hov>
                  ))}
                </HScroll>
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================ BONIFIKACE ============================ */
function Bonifikace({ vm }) {
  return (
    <div>
      <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:14px;padding:13px 16px;background:var(--blue-soft);border-radius:12px;font-size:12.5px;color:var(--blue-ink)')}>
        <span style={S('display:flex;flex-shrink:0')}>{ic('percent', 17)}</span>
        <span>Bonifikace = vrácení části pojistného podle škodního průběhu smlouvy. Vyberte smlouvu pro zobrazení nastavených pásem.</span>
      </div>
      <div style={S('display:flex;justify-content:flex-end;margin-bottom:12px')}><ExportMenu {...vm.bonifExport} /></div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <HScroll minW={760}>
          <div style={S('display:flex;align-items:center;gap:14px;padding:11px 18px;border-bottom:1px solid var(--border);background:#FBFBFC;font-size:11.5px;font-weight:700;color:var(--ink3);text-transform:uppercase;letter-spacing:.4px')}>
            <div style={S('width:40px;flex-shrink:0')}></div>
            <div style={S('flex:1;min-width:0')}>Pojistitel / smlouva</div>
            <div style={S('width:120px;text-align:right')}>Škodní průběh</div>
            <div style={S('width:180px;text-align:right')}>Vrací se</div>
            <div style={S('width:18px;flex-shrink:0')}></div>
          </div>
          {vm.bonifList.map((b) => (
            <Hov key={b.id} onClick={b.onClick} base="display:flex;align-items:center;gap:14px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
              <InsurerLogo name={b.insurer} size={40} />
              <div style={S('flex:1;min-width:0')}><div style={S('font-size:14px;font-weight:700;line-height:1.2')}>{b.insurer}</div><div style={S('font-size:12px;color:var(--ink3)')}>Flotilová smlouva č. <span style={S('font-variant-numeric:tabular-nums')}>{b.policy}</span></div></div>
              <div style={S(`width:120px;text-align:right;font-weight:700;font-size:13.5px;font-variant-numeric:tabular-nums;color:${b.lrColor}`)}>{b.lossRatio} %</div>
              <div style={S('width:180px;text-align:right')}>{b.rateActive ? (<><span style={S('font-size:12px;font-weight:700;color:var(--green);background:var(--green-soft);padding:4px 10px;border-radius:20px')}>{b.rateLabel} z pojistného</span><div style={S('font-size:12px;color:var(--ink2);font-weight:600;margin-top:4px;font-variant-numeric:tabular-nums')}>{b.rebateF} ročně</div></>) : <span style={S('font-size:12.5px;color:var(--ink3)')}>bez nároku</span>}</div>
              <span style={S('width:18px;flex-shrink:0;color:var(--ink3);display:flex')}>{ic('arrow', 16)}</span>
            </Hov>
          ))}
        </HScroll>
      </div>
    </div>
  )
}

/* ============================ BONIFIKACE DETAIL ============================ */
function BonifikaceDetail({ vm }) {
  const bd = vm.bd
  return (
    <div>
      <Hov onClick={bd.goBack} base="display:inline-flex;align-items:center;gap:6px;font-size:13px;color:var(--ink3);cursor:pointer;margin-bottom:14px" hover="color:var(--ink)"><span style={S('transform:rotate(180deg);display:flex')}>{ic('arrow', 16)}</span> Bonifikace</Hov>

      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px 24px;margin-bottom:16px')}>
        <div style={S('display:flex;align-items:flex-start;justify-content:space-between;flex-wrap:wrap;gap:16px')}>
          <div style={S('display:flex;gap:16px;align-items:center')}>
            <InsurerLogo name={bd.insurer} size={56} />
            <div>
              <div style={S('font-size:22px;font-weight:800;letter-spacing:-.5px')}>{bd.insurer}</div>
              <div style={S('font-size:13px;color:var(--ink3);margin-top:3px')}>Flotilová smlouva č. <span style={S('color:var(--ink2);font-weight:600;font-variant-numeric:tabular-nums')}>{bd.policy}</span></div>
            </div>
          </div>
          <div style={S('display:flex;gap:10px;flex-wrap:wrap')}>
            <div style={S('padding:10px 16px;border:1px solid var(--border);border-radius:12px;text-align:right')}><div style={S('font-size:11.5px;color:var(--ink3)')}>Škodní průběh</div><div style={S(`font-size:20px;font-weight:800;letter-spacing:-.5px;color:${bd.lrColor}`)}>{bd.lossRatio} %</div></div>
            <div style={S(`padding:10px 16px;border-radius:12px;text-align:right;background:${bd.hasActive ? 'var(--green-soft)' : '#F4F4F5'}`)}><div style={S('font-size:11.5px;color:var(--ink3)')}>Aktuální bonifikace</div><div style={S(`font-size:20px;font-weight:800;letter-spacing:-.5px;color:${bd.hasActive ? 'var(--green)' : 'var(--ink3)'}`)}>{bd.hasActive ? bd.rebateF : '—'}</div></div>
          </div>
        </div>
        <div style={S('display:flex;align-items:flex-start;gap:9px;margin-top:18px;padding:12px 15px;background:#FBFBFC;border:1px solid var(--border);border-radius:11px;font-size:12.5px;color:var(--ink2)')}>
          <span style={S('display:flex;flex-shrink:0;color:var(--ink3)')}>{ic('info', 16)}</span><span>{bd.note}</span>
        </div>
      </div>

      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);overflow:hidden')}>
        <div style={S('display:flex;align-items:center;justify-content:space-between;padding:16px 20px;border-bottom:1px solid var(--border)')}>
          <span style={S('font-size:15px;font-weight:700')}>Nastavená pásma bonifikace</span>
          <span style={S('font-size:12.5px;color:var(--ink3)')}>Roční pojistné {bd.premiumF}</span>
        </div>
        {bd.tiers.map((t, i) => (
          <div key={i} style={S(t.rowStyle)}>
            <span style={S(t.dotStyle)}></span>
            <div style={S('flex:1;min-width:0')}>
              <div style={S('font-size:14px;font-weight:700;display:flex;align-items:center;gap:9px;flex-wrap:wrap')}>{t.label}{t.badge ? <span style={S('font-size:10.5px;font-weight:700;color:var(--green);background:#fff;border:1px solid var(--green-soft);padding:2px 8px;border-radius:20px')}>{t.badge}</span> : null}</div>
              <div style={S('font-size:12.5px;color:var(--ink3);margin-top:2px')}>{t.desc}</div>
            </div>
            <div style={S('text-align:right')}><div style={S(t.rateStyle)}>{t.rate}</div><div style={S('font-size:11px;color:var(--ink3)')}>z pojistného</div></div>
          </div>
        ))}
      </div>
    </div>
  )
}

/* ============================ ANALYTICS ============================ */
function Analytics({ vm }) {
  const mob = vm.vp.isMobile
  return (
    <div>
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(180px,1fr));gap:14px;margin-bottom:14px')}>
        {vm.anStats.map((s, i) => <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px 18px')}><div style={S('font-size:12px;color:var(--ink3)')}>{s.label}</div><div style={S('font-size:23px;font-weight:800;letter-spacing:-.5px;margin-top:5px')}>{s.value}</div><div style={S(`font-size:11.5px;font-weight:600;margin-top:3px;color:${s.dColor}`)}>{s.delta}</div></div>)}
      </div>
      <div style={S(`display:grid;grid-template-columns:${mob ? '1fr' : '2fr 1fr'};gap:14px;margin-bottom:14px`)}>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:2px')}>Náklady na pojistné a opravy</div>
          <div style={S('font-size:12.5px;color:var(--ink3);margin-bottom:10px')}>Měsíční · 12 měsíců</div>
          <div style={S('display:flex;align-items:flex-end;gap:10px;height:180px')}>
            {vm.anBars.map((b, i) => <div key={i} style={S('flex:1;display:flex;flex-direction:column;justify-content:flex-end;height:100%;gap:2px')}><div style={S(`width:100%;height:${b.h2};background:var(--star);border-radius:3px 3px 0 0;min-height:2px`)}></div><div style={S(`width:100%;height:${b.h1};background:var(--blue);border-radius:0 0 3px 3px;min-height:3px`)}></div><span style={S('font-size:9.5px;color:var(--ink3);text-align:center')}>{b.label}</span></div>)}
          </div>
          <div style={S('display:flex;gap:18px;margin-top:14px;font-size:12px')}><span style={S('display:flex;align-items:center;gap:6px')}><span style={S('width:10px;height:10px;border-radius:3px;background:var(--blue)')}></span>Pojistné</span><span style={S('display:flex;align-items:center;gap:6px')}><span style={S('width:10px;height:10px;border-radius:3px;background:var(--star)')}></span>Opravy / škody</span></div>
        </div>
        <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}>
          <div style={S('font-size:15px;font-weight:700;margin-bottom:14px')}>Meziroční srovnání</div>
          {vm.anYears.map((y, i) => <div key={i} style={S('margin-bottom:16px')}><div style={S('display:flex;justify-content:space-between;font-size:13px;margin-bottom:5px')}><span style={S('font-weight:700')}>{y.year}</span><span style={S('font-weight:700;font-variant-numeric:tabular-nums')}>{y.value}</span></div><div style={S('height:9px;background:#F1F1F3;border-radius:5px')}><div style={S(`height:100%;width:${y.w};background:${y.color};border-radius:5px`)}></div></div></div>)}
          <div style={S('margin-top:18px;padding:14px;background:var(--green-soft);border-radius:11px')}><div style={S('font-size:12px;color:var(--green);font-weight:600')}>Celková úspora 2025 → 2026</div><div style={S('font-size:22px;font-weight:800;color:var(--green);letter-spacing:-.5px')}>1,84 mil. Kč</div></div>
        </div>
      </div>
      <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(240px,1fr));gap:14px')}>
        {vm.anMini.map((m, i) => <div key={i} style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:20px')}><div style={S('font-size:14px;font-weight:700')}>{m.title}</div><div style={S('font-size:28px;font-weight:800;letter-spacing:-1px;margin-top:8px')}>{m.value}</div><div style={S('font-size:12px;color:var(--ink3);margin-top:2px')}>{m.sub}</div><div style={S('height:6px;background:#F1F1F3;border-radius:4px;margin-top:14px')}><div style={S(`height:100%;width:${m.w};background:${m.color};border-radius:4px`)}></div></div></div>)}
      </div>
    </div>
  )
}

/* ============================ CONTACTS ============================ */
function Contacts({ vm }) {
  return (
    <div>
      {vm.contactGroups.map((g, gi) => (
        <div key={gi} style={S('margin-bottom:24px')}>
          <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:12px')}><span style={S('font-size:15px;font-weight:700')}>{g.name}</span><span style={S('font-size:11.5px;font-weight:700;color:var(--ink3);background:#F1F1F3;padding:2px 8px;border-radius:20px')}>{g.people.length}</span></div>
          <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(230px,1fr));gap:12px')}>
            {g.people.map((p, pi) => (
              <div key={pi} style={S('background:var(--card);border:1px solid var(--border);border-radius:12px;padding:16px')}>
                <div style={S('display:flex;align-items:center;gap:11px')}><div style={S(`width:42px;height:42px;border-radius:50%;background:${p.bg};color:${p.color};font-weight:700;font-size:14px;display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{p.initials}</div><div style={S('min-width:0')}><div style={S('font-size:13.5px;font-weight:700;line-height:1.15')}>{p.name}</div><div style={S('font-size:12px;color:var(--ink3)')}>{p.role}</div></div></div>
                <div style={S('margin-top:13px;display:flex;flex-direction:column;gap:6px;font-size:12.5px;color:var(--ink2)')}><div style={S('display:flex;align-items:center;gap:8px')}><span style={S('color:var(--ink3);display:flex')}>{p.phoneIcon}</span>{p.phone}</div><div style={S('display:flex;align-items:center;gap:8px;min-width:0')}><span style={S('color:var(--ink3);display:flex')}>{p.mailIcon}</span><span style={S('overflow:hidden;text-overflow:ellipsis;white-space:nowrap')}>{p.email}</span></div></div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  )
}

/* ============================ SETTINGS ============================ */
function Settings({ vm }) {
  return (
    <div style={S('max-width:760px')}>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px;margin-bottom:14px')}>
        <div style={S('font-size:15px;font-weight:700;margin-bottom:16px')}>Profil</div>
        <div style={S('display:flex;align-items:center;gap:16px')}><div style={S('width:60px;height:60px;border-radius:50%;background:linear-gradient(135deg,#3A3A42,#18181B);color:#fff;font-weight:700;font-size:20px;display:flex;align-items:center;justify-content:center')}>MK</div><div><div style={S('font-size:16px;font-weight:700')}>Martin Kovář</div><div style={S('font-size:13px;color:var(--ink3)')}>Fleet Manager · Louda Auto</div><div style={S('font-size:13px;color:var(--blue);margin-top:3px')}>martin.kovar@loudaauto.cz</div></div></div>
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px;margin-bottom:14px')}>
        <div style={S('font-size:15px;font-weight:700;margin-bottom:6px')}>Notifikace</div>
        {vm.settingRows.map((s, i) => (
          <div key={i} style={S('display:flex;align-items:center;justify-content:space-between;padding:13px 0;border-bottom:1px solid var(--border)')}><div><div style={S('font-size:13.5px;font-weight:600')}>{s.title}</div><div style={S('font-size:12px;color:var(--ink3)')}>{s.sub}</div></div><div onClick={s.toggle} style={S(s.trackStyle)}><div style={S(s.knobStyle)}></div></div></div>
        ))}
      </div>
      <div style={S('background:var(--card);border:1px solid var(--border);border-radius:var(--r);padding:22px;display:flex;align-items:center;gap:16px')}>
        <img src={STAR_LOGO} alt="STAR Insurance Group" style={S('height:34px;width:auto;flex-shrink:0')} />
        <div style={{ flex: 1 }}><div style={S('font-size:13.5px;font-weight:700')}>Broker Hub powered by STAR Insurance</div><div style={S('font-size:12px;color:var(--ink3)')}>Portál spravuje makléřská kancelář IS Group, spol. s r.o. · podpora po–pá 8–18</div></div>
        <span style={S('font-size:13px;font-weight:600;color:var(--blue);cursor:pointer')}>Kontaktovat</span>
      </div>
    </div>
  )
}

/* ============================ AI PANEL ============================ */
function AIPanel({ vm }) {
  return (
    <div style={S('position:fixed;right:12px;bottom:92px;z-index:55;width:min(384px,calc(100vw - 24px));max-height:min(560px,calc(100vh - 120px));background:#fff;border:1px solid var(--border2);border-radius:18px;box-shadow:0 24px 60px rgba(0,0,0,.22);display:flex;flex-direction:column;overflow:hidden;animation:popIn .18s ease')}>
      <div style={S('padding:15px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;gap:11px')}>
        <div style={S('width:34px;height:34px;border-radius:10px;background:linear-gradient(135deg,#2563DB,#1A47A3);color:#fff;display:flex;align-items:center;justify-content:center')}>{ic('sparkle', 22)}</div>
        <div style={{ flex: 1 }}>
          <div style={S('font-size:14px;font-weight:700')}>Fleet asistent</div>
          <div style={S('font-size:11.5px;color:var(--green);font-weight:600;display:flex;align-items:center;gap:5px')}><span style={S('width:6px;height:6px;border-radius:50%;background:var(--green);display:inline-block')}></span>Online · rozumí přirozenému jazyku</div>
        </div>
        <span onClick={vm.toggleAI} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
      </div>
      <div style={S('flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:12px;background:#FAFAFA')}>
        {vm.aiMessages.map((m, i) => <div key={i} style={S(m.wrap)}><div style={S(m.bubble)}>{m.text}</div></div>)}
      </div>
      <div style={S('padding:12px 14px;border-top:1px solid var(--border)')}>
        <div style={S('display:flex;gap:7px;flex-wrap:wrap;margin-bottom:10px')}>
          {vm.aiChips.map((c, i) => <span key={i} onClick={c.onClick} style={S('font-size:11.5px;font-weight:600;color:var(--blue-ink);background:var(--blue-soft);padding:5px 10px;border-radius:20px;cursor:pointer')}>{c.text}</span>)}
        </div>
        <div style={S('display:flex;align-items:center;gap:8px;border:1px solid var(--border2);border-radius:12px;padding:8px 8px 8px 13px')}>
          <input value={vm.aiInput} onChange={vm.onAiInput} onKeyDown={vm.onAiKey} placeholder="Zeptejte se na cokoliv…" style={S('flex:1;border:none;outline:none;font-size:13.5px;font-family:inherit;background:transparent')} />
          <div onClick={vm.sendAi} style={S('width:32px;height:32px;border-radius:9px;background:var(--blue);color:#fff;display:flex;align-items:center;justify-content:center;cursor:pointer')}>{ic('send', 16)}</div>
        </div>
      </div>
    </div>
  )
}

/* ============================ NOTIFICATIONS ============================ */
function Notifications({ vm }) {
  return (
    <>
      <div onClick={vm.toggleNotif} style={S('position:fixed;inset:0;z-index:60;background:transparent')}></div>
      <div style={S('position:fixed;right:12px;top:66px;z-index:61;width:min(380px,calc(100vw - 24px));max-height:70vh;background:#fff;border:1px solid var(--border2);border-radius:16px;box-shadow:0 24px 60px rgba(0,0,0,.2);overflow:hidden;display:flex;flex-direction:column;animation:popIn .16s ease')}>
        <div style={S('padding:15px 18px;border-bottom:1px solid var(--border);display:flex;align-items:center;justify-content:space-between')}><span style={S('font-size:15px;font-weight:700;flex:1')}>Notifikace</span><span style={S('font-size:12px;color:var(--blue);font-weight:600;cursor:pointer')}>Označit přečtené</span></div>
        <div style={S('overflow-y:auto')}>
          {vm.notifs.map((n, i) => (
            <Hov key={i} base="display:flex;gap:12px;padding:13px 18px;border-bottom:1px solid var(--border);cursor:pointer" hover="background:#FAFAFA">
              <div style={S(`width:34px;height:34px;border-radius:9px;background:${n.bg};color:${n.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{n.icon}</div>
              <div style={{ flex: 1 }}><div style={S('font-size:13px;font-weight:600;line-height:1.3')}>{n.title}</div><div style={S('font-size:12px;color:var(--ink3);margin-top:2px')}>{n.sub}</div><div style={S('font-size:11px;color:var(--ink3);margin-top:3px')}>{n.time}</div></div>
              {n.unread ? <span style={S('width:8px;height:8px;border-radius:50%;background:var(--blue);flex-shrink:0;margin-top:4px')}></span> : null}
            </Hov>
          ))}
        </div>
      </div>
    </>
  )
}

/* ============================ SEARCH ============================ */
function SearchModal({ vm }) {
  return (
    <div onClick={vm.closeSearch} style={S('position:fixed;inset:0;z-index:70;background:rgba(15,15,20,.32);backdrop-filter:blur(2px);display:flex;align-items:flex-start;justify-content:center;padding-top:12vh')}>
      <div onClick={vm.stop} style={S('width:600px;max-width:92vw;background:#fff;border-radius:16px;box-shadow:0 30px 80px rgba(0,0,0,.3);overflow:hidden;animation:popIn .16s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:16px 18px;border-bottom:1px solid var(--border)')}>
          <span style={S('color:var(--ink3);display:flex')}>{ic('search', 17)}</span>
          <input value={vm.searchQuery} onChange={vm.onSearchInput} autoFocus placeholder="Hledat vozidlo, SPZ, řidiče, park, smlouvu…" style={S('flex:1;border:none;outline:none;font-size:16px;font-family:inherit')} />
          <span style={S('font-size:11px;font-weight:600;background:#F4F4F5;border:1px solid var(--border2);border-radius:6px;padding:3px 7px;color:var(--ink2)')}>ESC</span>
        </div>
        <div style={S('max-height:50vh;overflow-y:auto;padding:8px')}>
          {vm.searchResults.map((r, i) => (
            <Hov key={i} onClick={r.onClick} base="display:flex;align-items:center;gap:13px;padding:11px 12px;border-radius:10px;cursor:pointer" hover="background:#F5F7FB">
              <div style={S(`width:34px;height:34px;border-radius:9px;background:${r.bg};color:${r.color};display:flex;align-items:center;justify-content:center;flex-shrink:0`)}>{r.icon}</div>
              <div style={{ flex: 1 }}><div style={S('font-size:13.5px;font-weight:600')}>{r.title}</div><div style={S('font-size:12px;color:var(--ink3)')}>{r.sub}</div></div>
              <span style={S('font-size:11px;color:var(--ink3);background:#F4F4F5;padding:2px 8px;border-radius:6px')}>{r.kind}</span>
            </Hov>
          ))}
        </div>
      </div>
    </div>
  )
}

/* ============================ CLAIM WIZARD ============================ */
function ClaimWizard({ vm }) {
  const cw = vm.cw
  return (
    <div style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div style={S('width:680px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--star-soft);color:var(--star);display:flex;align-items:center;justify-content:center')}>{ic('alert', 17)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>Nahlášení pojistné události</div><div style={S('font-size:12.5px;color:var(--ink3)')}>{cw.stepLabel}</div></div>
          <span onClick={vm.closeClaimWizard} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>
        <div style={S('display:flex;gap:6px;padding:14px 22px;border-bottom:1px solid var(--border)')}>
          {cw.steps.map((s, i) => <div key={i} style={S(`flex:1;height:5px;border-radius:3px;background:${s.color}`)}></div>)}
        </div>
        <div style={S('flex:1;overflow-y:auto;padding:24px 22px')}>
          {cw.isDone && (
            <div style={S('text-align:center;padding:30px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{cw.bigCheck}</div>
              <div style={S('font-size:19px;font-weight:800')}>Událost byla nahlášena</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:380px;margin-left:auto;margin-right:auto')}>Přidělili jsme číslo <strong style={S('color:var(--ink)')}>CLM-2026-0148</strong>. Likvidátor pojišťovny vás kontaktuje do 24 hodin. Stav sledujte v sekci Pojistné události.</div>
            </div>
          )}
          {cw.s1 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Popis události</div>
              <div style={S('display:flex;flex-direction:column;gap:14px')}>
                <div><div style={S('font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px')}>Typ události</div><div style={S('display:grid;grid-template-columns:repeat(3,1fr);gap:8px')}>{cw.types.map((t, i) => <div key={i} onClick={t.onClick} style={S(t.style)}>{t.label}</div>)}</div></div>
                <div><div style={S('font-size:12.5px;font-weight:600;color:var(--ink2);margin-bottom:6px')}>Detailní popis</div><textarea placeholder="Popište, co se stalo…" style={S('width:100%;min-height:90px;border:1px solid var(--border2);border-radius:10px;padding:11px 13px;font-size:13.5px;font-family:inherit;resize:vertical;outline:none')}></textarea></div>
              </div>
            </>
          )}
          {cw.s2 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Fotodokumentace</div>
              <div style={S('border:2px dashed var(--border2);border-radius:14px;padding:40px;text-align:center;color:var(--ink3)')}><div style={S('width:46px;height:46px;border-radius:12px;background:#F4F4F5;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:var(--ink2)')}>{cw.camera}</div><div style={S('font-size:14px;font-weight:600;color:var(--ink2)')}>Přetáhněte fotky sem</div><div style={S('font-size:12.5px;margin-top:3px')}>nebo klikněte pro výběr · min. 4 snímky poškození</div></div>
              <div style={S('display:grid;grid-template-columns:repeat(4,1fr);gap:8px;margin-top:12px')}>{cw.photos.map((p, i) => <div key={i} style={S('aspect-ratio:4/3;border-radius:9px;background:linear-gradient(135deg,#EEF1F6,#E2E7EF);display:flex;align-items:center;justify-content:center;color:#B6BCC6')}>{p}</div>)}</div>
            </>
          )}
          {cw.s3 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Policejní zpráva</div>
              <div style={S('display:flex;align-items:center;gap:12px;padding:14px 16px;border:1px solid var(--border2);border-radius:12px;margin-bottom:12px')}><div style={S('width:38px;height:38px;border-radius:9px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{cw.fileIcon}</div><div style={{ flex: 1 }}><div style={S('font-size:13.5px;font-weight:600')}>Nahrát policejní protokol</div><div style={S('font-size:12px;color:var(--ink3)')}>PDF, JPG · volitelné u škod do 100 000 Kč</div></div><span style={S('font-size:12.5px;font-weight:600;color:var(--blue);cursor:pointer')}>Vybrat</span></div>
              <label style={S('display:flex;align-items:center;gap:10px;font-size:13.5px;color:var(--ink2);cursor:pointer')}><span style={S('width:18px;height:18px;border-radius:5px;border:1.5px solid var(--blue);background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff')}>{cw.check}</span>Událost byla nahlášena Policii ČR</label>
            </>
          )}
          {cw.s4 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Místo události</div>
              <div style={S('height:180px;border-radius:12px;background:linear-gradient(135deg,#EAEFF6,#DCE4EE);position:relative;overflow:hidden;display:flex;align-items:center;justify-content:center')}><span style={S('color:var(--star);display:flex')}>{cw.pin}</span></div>
              <input defaultValue="Praha 4, Jižní spojka × 5. května" style={S('width:100%;margin-top:12px;border:1px solid var(--border2);border-radius:10px;padding:11px 13px;font-size:13.5px;font-family:inherit;outline:none')} />
            </>
          )}
          {cw.s5 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Vozidlo a řidič</div>
              <div style={S('display:flex;flex-direction:column;gap:10px')}>
                {cw.vehiclePick.map((v, i) => <div key={i} onClick={v.onClick} style={S(v.style)}><div style={S('width:40px;height:30px;border-radius:6px;background:#F1F1F3;color:var(--ink3);display:flex;align-items:center;justify-content:center')}>{cw.carSm}</div><div style={{ flex: 1 }}><div style={S('font-size:13px;font-weight:600')}>{v.plate} · {v.name}</div><div style={S('font-size:11.5px;color:var(--ink3)')}>{v.driver}</div></div><span style={S(v.radio)}></span></div>)}
              </div>
            </>
          )}
          {cw.s6 && (
            <>
              <div style={S('font-size:14px;font-weight:700;margin-bottom:14px')}>Shrnutí a odeslání</div>
              <div style={S('border:1px solid var(--border);border-radius:12px;overflow:hidden')}>{cw.summary.map((x, i) => <div key={i} style={S('display:flex;justify-content:space-between;padding:12px 16px;border-bottom:1px solid var(--border);font-size:13px')}><span style={S('color:var(--ink3)')}>{x.k}</span><span style={S('font-weight:600')}>{x.v}</span></div>)}</div>
              <div style={S('margin-top:14px;padding:13px 15px;background:var(--blue-soft);border-radius:11px;font-size:12.5px;color:var(--blue-ink);display:flex;gap:9px')}><span style={S('display:flex;flex-shrink:0')}>{cw.sparkle}</span><span>Fleet asistent předvyplnil pojišťovnu, číslo smlouvy a likvidátora z dat vozidla. Po odeslání proběhne automatické založení u pojišťovny.</span></div>
            </>
          )}
        </div>
        <div style={S('display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-top:1px solid var(--border)')}>
          <span onClick={cw.back} style={S(cw.backStyle)}>← Zpět</span>
          <div onClick={cw.next} style={S(cw.nextStyle)}>{cw.nextLabel}</div>
        </div>
      </div>
    </div>
  )
}

/* ============================ ADD VEHICLE WIZARD ============================ */
function AddVehicleWizard({ vm }) {
  const avm = vm.avm
  return (
    <div onClick={avm.close} style={S('position:fixed;inset:0;z-index:80;background:rgba(15,15,20,.4);backdrop-filter:blur(3px);display:flex;align-items:center;justify-content:center;padding:24px')}>
      <div onClick={avm.stop} style={S('width:760px;max-width:96vw;max-height:90vh;background:#fff;border-radius:18px;box-shadow:0 30px 80px rgba(0,0,0,.32);overflow:hidden;display:flex;flex-direction:column;animation:popIn .2s ease')}>
        <div style={S('display:flex;align-items:center;gap:12px;padding:18px 22px;border-bottom:1px solid var(--border)')}>
          <div style={S('width:36px;height:36px;border-radius:10px;background:var(--blue-soft);color:var(--blue);display:flex;align-items:center;justify-content:center')}>{ic('car', 17)}</div>
          <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:700')}>Přidat vozidlo do flotily</div><div style={S('font-size:12.5px;color:var(--ink3)')}>{avm.fleetName} · {avm.stepLabel}</div></div>
          <span onClick={avm.close} style={S('color:var(--ink3);cursor:pointer;display:flex')}>{ic('close', 17)}</span>
        </div>
        <div style={S('display:flex;gap:6px;padding:14px 22px;border-bottom:1px solid var(--border)')}>
          {avm.steps.map((s, i) => <div key={i} style={S(`flex:1;height:5px;border-radius:3px;background:${s.color}`)}></div>)}
        </div>
        <div style={S('flex:1;overflow-y:auto;padding:24px 22px')}>

          {avm.s1 && (
            <>
              <div style={S('font-size:15px;font-weight:700;margin-bottom:4px')}>Vyberte způsob zadání údajů o vozidle</div>
              <div style={S('font-size:13px;color:var(--ink3);margin-bottom:16px')}>Údaje o vozidle doplníme automaticky z registru.</div>
              <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(150px,1fr));gap:12px')}>
                {avm.methods.map((m, i) => (
                  <div key={i} onClick={m.onClick} style={S(m.style)}>
                    <div style={S(m.iconStyle)}>{m.icon}</div>
                    <div style={S('font-size:14.5px;font-weight:700;margin-top:12px')}>{m.title}</div>
                    <div style={S('font-size:12px;color:var(--ink3);margin-top:3px;line-height:1.4')}>{m.desc}</div>
                  </div>
                ))}
              </div>

              {avm.isUpload && (
                <div style={S('border:2px dashed var(--border2);border-radius:14px;padding:34px;text-align:center;color:var(--ink3);margin-top:18px')}>
                  <div style={S('width:46px;height:46px;border-radius:12px;background:#F4F4F5;display:flex;align-items:center;justify-content:center;margin:0 auto 12px;color:var(--ink2)')}>{avm.uploadIcon}</div>
                  <div style={S('font-size:14px;font-weight:600;color:var(--ink2)')}>Přetáhněte fotografii technického průkazu</div>
                  <div style={S('font-size:12.5px;margin-top:3px')}>obě strany · JPG, PNG nebo PDF — údaje načteme přes OCR</div>
                </div>
              )}
              {avm.isField && (
                <div style={S('display:flex;gap:10px;margin-top:18px')}>
                  <div style={S('flex:1;display:flex;align-items:center;gap:10px;height:48px;border:1px solid var(--border2);border-radius:11px;padding:0 6px 0 0;overflow:hidden')}>
                    <div style={S('width:48px;height:48px;background:var(--blue-soft);color:var(--blue-ink);display:flex;align-items:center;justify-content:center;font-size:12px;font-weight:800;flex-shrink:0')}>{avm.fieldBadge}</div>
                    <input value={vm.avInput} onChange={avm.onInput} placeholder={avm.fieldPlaceholder} style={S('flex:1;border:none;outline:none;font-size:15px;font-family:inherit;letter-spacing:.5px;text-transform:uppercase')} />
                  </div>
                  <Hov onClick={avm.load} base="height:48px;padding:0 22px;background:var(--blue);color:#fff;border-radius:11px;display:flex;align-items:center;font-size:14px;font-weight:600;cursor:pointer" hover="background:#1A47A3">{avm.loadLabel}</Hov>
                </div>
              )}
              <div style={S('display:flex;align-items:center;gap:9px;margin-top:16px;padding:11px 14px;background:var(--blue-soft);border-radius:11px;font-size:12.5px;color:var(--blue-ink)')}>
                <span style={S('display:flex;flex-shrink:0')}>{avm.infoIcon}</span>
                <span>Vyberte jeden ze tří způsobů — z SPZ či VIN načteme údaje z registru vozidel, z technického průkazu pomocí OCR.</span>
              </div>
            </>
          )}

          {avm.s2 && (
            <>
              <div style={S('display:flex;align-items:center;gap:9px;margin-bottom:16px;padding:11px 14px;background:var(--green-soft);border-radius:11px;font-size:13px;color:var(--green);font-weight:600')}>
                <span style={S('display:flex;flex-shrink:0')}>{avm.checkBadge}</span> Údaje úspěšně načteny z registru. Zkontrolujte a doplňte.
              </div>
              <div style={S('display:flex;align-items:center;gap:14px;padding:16px;border:1px solid var(--border);border-radius:12px;margin-bottom:18px;background:#FBFBFC')}>
                <div style={S('width:58px;height:44px;border-radius:8px;background:#EDEFF3;color:var(--ink3);display:flex;align-items:center;justify-content:center;flex-shrink:0')}>{avm.bigCar}</div>
                <div style={{ flex: 1 }}><div style={S('font-size:16px;font-weight:800;letter-spacing:-.3px')}>{avm.loaded.brand} {avm.loaded.model}</div><div style={S('font-size:12.5px;color:var(--ink3)')}>{avm.loaded.plate} · VIN {avm.loaded.vin}</div></div>
                <span style={S('font-size:11.5px;font-weight:700;color:var(--green);background:#fff;border:1px solid var(--green-soft);padding:4px 10px;border-radius:20px')}>Ověřeno v registru</span>
              </div>
              <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(130px,1fr));gap:12px')}>
                {avm.fields.map((f, i) => (
                  <div key={i}><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>{f.label}</div><input defaultValue={f.value} style={S(`width:100%;height:40px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;background:${f.bg}`)} /></div>
                ))}
              </div>
              <div style={S('margin-top:18px;font-size:13.5px;font-weight:700;margin-bottom:10px')}>Zařazení do flotily</div>
              <div style={S('display:flex;align-items:center;gap:10px;padding:12px 14px;background:var(--blue-soft);border-radius:11px')}>
                <span style={S('color:var(--blue);display:flex;flex-shrink:0')}>{ic('fleets', 18)}</span>
                <div style={S('flex:1;min-width:0')}>
                  <div style={S('font-size:11.5px;font-weight:600;color:var(--blue-ink);margin-bottom:4px')}>Vozový park</div>
                  <select value={avm.fleetId} onChange={avm.onFleetChange} style={S('width:100%;max-width:360px;height:38px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none;background:#fff;color:var(--ink);cursor:pointer')}>
                    {avm.fleetOptions.map((o, i) => <option key={i} value={o.v}>{o.l}</option>)}
                  </select>
                </div>
              </div>
              <div style={S('margin-top:18px;font-size:13.5px;font-weight:700;margin-bottom:10px')}>Pojistník a začátek pojištění</div>
              <div style={S('display:grid;grid-template-columns:repeat(auto-fit,minmax(140px,1fr));gap:12px')}>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Pojistník</div><input defaultValue="Louda Auto a.s." style={S('width:100%;height:40px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none')} /></div>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Začátek pojištění</div><input defaultValue="1. 7. 2026" style={S('width:100%;height:40px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;font-family:inherit;outline:none')} /></div>
                <div><div style={S('font-size:11.5px;font-weight:600;color:var(--ink2);margin-bottom:5px')}>Užití vozidla</div><div style={S('width:100%;height:40px;border:1px solid var(--border2);border-radius:9px;padding:0 12px;font-size:13.5px;display:flex;align-items:center;justify-content:space-between;color:var(--ink)')}>{vm.avUziti}<span style={S('color:var(--ink3);display:flex')}>{ic('chevron', 16)}</span></div></div>
              </div>
            </>
          )}

          {avm.s3 && (
            <>
              <div style={S('font-size:15px;font-weight:700;margin-bottom:4px')}>Pojistné krytí</div>
              <div style={S('font-size:13px;color:var(--ink3);margin-bottom:16px')}>Vyberte rizika a parametry krytí pro {avm.loaded.brand} {avm.loaded.model}.</div>
              <div style={S('border:1px solid var(--border);border-radius:12px;overflow:hidden')}>
                {avm.covers.map((c, i) => (
                  <div key={i} style={S(c.rowStyle)}>
                    <div onClick={c.toggle} style={S('display:flex;align-items:center;gap:12px;flex:1;cursor:pointer;min-width:0')}>
                      <span style={S(c.boxStyle)}>{c.checkIcon}</span>
                      <div style={S('min-width:0')}><div style={S(`font-size:13.5px;font-weight:600;color:${c.titleColor}`)}>{c.label}</div>{c.note ? <div style={S('font-size:11.5px;color:var(--ink3)')}>{c.note}</div> : null}</div>
                    </div>
                    {c.hasParams && (
                      <div style={S('display:flex;align-items:center;gap:8px;flex-shrink:0')}>
                        {c.params.map((p, k) => (
                          <div key={k} style={S('display:flex;flex-direction:column;gap:3px')}><span style={S('font-size:10px;color:var(--ink3);font-weight:600')}>{p.label}</span><div style={S('height:32px;min-width:118px;border:1px solid var(--border2);border-radius:8px;padding:0 10px;font-size:12.5px;display:flex;align-items:center;justify-content:space-between;background:#fff;color:var(--ink)')}>{p.value}<span style={S('color:var(--ink3);display:flex;margin-left:6px')}>{ic('chevron', 16)}</span></div></div>
                        ))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
              <div style={S('display:flex;align-items:center;justify-content:space-between;margin-top:16px;padding:15px 18px;background:#0F1115;border-radius:12px;color:#fff')}>
                <div><div style={S('font-size:12px;color:#A1A1AA')}>Odhadované roční pojistné</div><div style={S('font-size:24px;font-weight:800;letter-spacing:-.5px;margin-top:2px')}>{avm.estimate}</div></div>
                <div style={S('text-align:right')}><div style={S('font-size:12px;color:#A1A1AA')}>Vybraná rizika</div><div style={S('font-size:15px;font-weight:700;margin-top:4px')}>{avm.coverCount} z 12</div></div>
              </div>
            </>
          )}

          {avm.isDone && (
            <div style={S('text-align:center;padding:30px 0')}>
              <div style={S('width:64px;height:64px;border-radius:50%;background:var(--green-soft);color:var(--green);display:flex;align-items:center;justify-content:center;margin:0 auto 16px')}>{avm.bigCheck}</div>
              <div style={S('font-size:19px;font-weight:800')}>Vozidlo přidáno do flotily</div>
              <div style={S('font-size:13.5px;color:var(--ink3);margin-top:6px;max-width:420px;margin-left:auto;margin-right:auto')}>{avm.loaded.brand} {avm.loaded.model} ({avm.loaded.plate}) bylo přidáno do parku {avm.fleetName}. Nabídku krytí jsme odeslali makléři ke sjednání — potvrzení obdržíte do 24 hodin.</div>
            </div>
          )}

        </div>
        <div style={S('display:flex;align-items:center;justify-content:space-between;padding:16px 22px;border-top:1px solid var(--border)')}>
          <span onClick={avm.back} style={S(avm.backStyle)}>← Zpět</span>
          <div onClick={avm.next} style={S(avm.nextStyle)}>{avm.nextLabel}</div>
        </div>
      </div>
    </div>
  )
}
