type Kind = 'done' | 'pending' | 'polling' | 'manual'
const EVENTS: { day: number; name: string; kind: Kind; note: string }[] = [
  { day: 9, name: 'CPI', kind: 'done', note: 'Released · Collected' },
  { day: 13, name: 'M1/M2', kind: 'done', note: 'Released · Collected' },
  { day: 15, name: 'Retail Sales', kind: 'pending', note: 'Released · Pending next ETL' },
  { day: 20, name: 'Sichuan Retail Sales', kind: 'polling', note: 'Polling within window' },
  { day: 25, name: 'Shanghai Retail Sales', kind: 'manual', note: 'Polling timed out → manual' },
]
const COLOR: Record<Kind, string> = { done: 'var(--accent)', pending: 'var(--amber)', polling: '#5b9cf0', manual: 'var(--red)' }
const TODAY = 18

type St = 'ok' | 'retry' | 'fail' | 'manual'
const ROWS: { metric: string; src: string; st: St; label: string; last: string; next: string }[] = [
  { metric: 'Total Retail Sales', src: 'East Money', st: 'ok', label: 'Normal', last: '10-15 08:02', next: 'Tomorrow 08:00' },
  { metric: 'Sichuan Retail Sales', src: 'Provincial Statistics Bureau', st: 'retry', label: 'Retrying (2/5)', last: '10-18 08:01', next: 'Today 18:00' },
  { metric: 'Shanghai Retail Sales', src: 'Provincial Statistics Bureau', st: 'fail', label: 'Failed · Alert Triggered', last: '10-12 08:03', next: '—' },
  { metric: 'Shanghai Financial Data', src: 'Manual', st: 'manual', label: 'Pending Entry', last: '07-31', next: '—' },
]
const ST_COLOR: Record<St, string> = { ok: 'var(--accent)', retry: '#5b9cf0', fail: 'var(--red)', manual: 'var(--amber)' }

function Marker({ kind }: { kind: Kind }) {
  const c = COLOR[kind]
  if (kind === 'done')
    return (
      <span className="grid size-5 place-items-center rounded-full" style={{ background: c }}>
        <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="#1e1e1e" strokeWidth="3.5" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
      </span>
    )
  return (
    <span className="grid size-5 place-items-center">
      <span className={`size-3 rounded-full ${kind === 'polling' ? 'animate-pulse' : ''}`} style={{ background: c, boxShadow: `0 0 0 4px color-mix(in srgb, ${c} 22%, transparent)` }} />
    </span>
  )
}

export default function ReleaseCalendar() {
  const pos = (d: number) => `${((d - 0.5) / 31) * 100}%`
  return (
    <div className="mx-auto min-h-screen w-[1440px] bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-12 items-center gap-4 border-b border-[var(--stroke)] px-6">
        <h1 className="text-[15px] font-semibold">Release Calendar & Collection Status</h1>
        <span className="text-[12px] text-[var(--muted)]">October 2026</span>
        <div className="ml-auto flex items-center gap-4 text-[12px] text-[var(--muted)]">
          {([['done', 'Collected'], ['pending', 'Pending ETL'], ['polling', 'Polling'], ['manual', 'Manual required']] as [Kind, string][]).map(([k, l]) => (
            <span key={k} className="flex items-center gap-1.5"><span className="size-2 rounded-full" style={{ background: COLOR[k] }} />{l}</span>
          ))}
        </div>
      </header>

      <main className="space-y-8 px-6 py-6">
        <section className="rounded-xl border border-[var(--stroke)] bg-[var(--card)] px-8 pb-6 pt-5">
          <h2 className="mb-4 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Release timeline</h2>
          <div className="relative h-[190px]">
            {/* today marker */}
            <div className="absolute bottom-6 top-0 w-px bg-[var(--wire)]" style={{ left: pos(TODAY) }}>
              <span className="absolute -top-0.5 left-1.5 whitespace-nowrap text-[10.5px] text-[var(--muted)]">Today</span>
            </div>
            {EVENTS.map((e, i) => {
              const c = COLOR[e.kind]
              const top = i % 2 === 0 ? 22 : 82
              return (
                <div key={e.day} className="absolute -translate-x-1/2" style={{ left: pos(e.day), top, bottom: 24 }}>
                  <div className="absolute left-1/2 top-[44px] bottom-0 -translate-x-1/2 border-l" style={{ borderColor: c, borderStyle: e.kind === 'polling' ? 'dashed' : 'solid', opacity: 0.7 }} />
                  <div className="flex flex-col items-center text-center">
                    <div className="flex items-center gap-1.5 whitespace-nowrap">
                      <span className="mono text-[11px] text-[var(--muted)]">10-{String(e.day).padStart(2, '0')}</span>
                      <span className="text-[13px] font-medium">{e.name}</span>
                    </div>
                    <div className="mt-0.5 whitespace-nowrap text-[11.5px]" style={{ color: c }}>{e.note}</div>
                    {e.kind === 'manual' && (
                      <span className="mt-1 whitespace-nowrap rounded-md border border-[color-mix(in_srgb,var(--red)_50%,transparent)] bg-[color-mix(in_srgb,var(--red)_16%,transparent)] px-1.5 py-0.5 text-[10.5px] font-semibold text-[var(--red)]">Manual Entry Required</span>
                    )}
                  </div>
                  <div className="absolute bottom-0 left-1/2 -translate-x-1/2 translate-y-1/2"><Marker kind={e.kind} /></div>
                </div>
              )
            })}
            <div className="absolute inset-x-0 bottom-6 h-px bg-[var(--grid)]" />
            <div className="absolute inset-x-0 bottom-0 flex">
              {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => (
                <span key={d} className={`mono flex-1 text-center text-[10.5px] ${EVENTS.some((e) => e.day === d) ? 'font-semibold text-[var(--text)]' : d === TODAY ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>{d}</span>
              ))}
            </div>
          </div>
        </section>

        <section className="overflow-hidden rounded-xl border border-[var(--stroke)] bg-[var(--card)]">
          <h2 className="px-6 pb-3 pt-5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">Collection status</h2>
          <div className="grid grid-cols-[1.4fr_1.4fr_1.3fr_1fr_1fr_100px] border-y border-[var(--stroke)] px-6 py-2.5 text-[11.5px] text-[var(--muted)]">
            <span>Metric</span><span>Data Source</span><span>Status</span><span>Last Success</span><span>Next Run</span><span />
          </div>
          {ROWS.map((r) => {
            const fail = r.st === 'fail'
            return (
              <div key={r.metric} className={`grid grid-cols-[1.4fr_1.4fr_1.3fr_1fr_1fr_100px] items-center border-b border-[var(--stroke)] px-6 py-3.5 text-[13px] last:border-b-0 ${fail ? 'border-l-2 border-l-[var(--red)] bg-[color-mix(in_srgb,var(--red)_12%,transparent)] pl-[22px]' : 'hover:bg-[var(--hover)]'}`}>
                <span className="font-medium">{r.metric}</span>
                <span className="text-[var(--muted)]">{r.src}</span>
                <span className="flex items-center gap-2 font-medium" style={{ color: ST_COLOR[r.st] }}>
                  <span className={`size-2 rounded-full ${r.st === 'retry' ? 'animate-pulse' : ''}`} style={{ background: ST_COLOR[r.st] }} />
                  {r.label}
                </span>
                <span className="mono text-[var(--muted)]">{r.last}</span>
                <span className="mono text-[var(--muted)]">{r.next}</span>
                <span className="text-right">
                  {fail && <a href="#" onClick={(e) => e.preventDefault()} className="text-[12.5px] font-medium text-[var(--red)] underline-offset-2 hover:underline">View Log →</a>}
                </span>
              </div>
            )
          })}
        </section>
      </main>
    </div>
  )
}
