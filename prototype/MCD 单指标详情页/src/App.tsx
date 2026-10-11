import { useMemo, useState } from 'react'

type Pt = { m: string; v: number | null; ov: number }

// Deterministic placeholder series, 2021-10 → 2026-09 (60 months)
function buildSeries(): Pt[] {
  const out: Pt[] = []
  let s = 7
  const rnd = () => ((s = (s * 9301 + 49297) % 233280), s / 233280 - 0.5)
  for (let i = 0; i < 60; i++) {
    const y = 2021 + Math.floor((9 + i) / 12)
    const mo = ((9 + i) % 12) + 1
    const m = `${y}-${String(mo).padStart(2, '0')}`
    let v = 5 + Math.sin(i / 5) * 4 + rnd() * 3
    if (m >= '2022-03' && m <= '2022-06') v -= 9
    if (m >= '2022-11' && m <= '2022-12') v -= 6
    if (m >= '2023-04' && m <= '2023-06') v += 6
    if (i > 40) v = 3.5 + rnd() * 2
    if (m === '2026-09') v = 3.8
    if (m === '2026-08') v = 4.1
    const ov = 5 + Math.cos(i / 7) * 2 + rnd() * 1.2
    out.push({ m, v: m === '2022-04' || m === '2025-02' ? null : Math.max(-4.5, Math.min(14.5, +v.toFixed(1))), ov: +ov.toFixed(1) })
  }
  return out
}

function Seg<T extends string>({ opts, val, set }: { opts: T[]; val: T; set: (v: T) => void }) {
  return (
    <div className="flex rounded-lg border border-[var(--stroke)] bg-[var(--card)] p-0.5">
      {opts.map((o) => (
        <button
          key={o}
          onClick={() => set(o)}
          className={`h-7 rounded-md px-2.5 text-[12px] transition-colors ${val === o ? 'bg-[color-mix(in_srgb,var(--accent)_16%,transparent)] text-[var(--accent)]' : 'text-[var(--muted)] hover:text-[var(--text)]'}`}
        >
          {o}
        </button>
      ))}
    </div>
  )
}

function Chart({ data, overlay }: { data: Pt[]; overlay: boolean }) {
  const W = 912
  const H = 320
  const L = 36, R = 12, T = 14, B = 28
  const x = (i: number) => L + (i / (data.length - 1)) * (W - L - R)
  const y = (v: number) => T + ((15 - v) / 20) * (H - T - B)
  const [hov, setHov] = useState<number | null>(null)

  let d = ''
  let pen = false
  data.forEach((p, i) => {
    if (p.v === null) return void (pen = false)
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.v).toFixed(1)}`
    pen = true
  })
  const od = data.map((p, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(p.ov).toFixed(1)}`).join('')
  const gaps = data.map((p, i) => (p.v === null ? i : -1)).filter((i) => i >= 0)
  const last = data.length - 1

  return (
    <svg
      viewBox={`0 0 ${W} ${H}`}
      className="block h-[320px] w-full"
      onMouseLeave={() => setHov(null)}
      onMouseMove={(e) => {
        const r = e.currentTarget.getBoundingClientRect()
        const px = ((e.clientX - r.left) / r.width) * W
        setHov(Math.max(0, Math.min(last, Math.round(((px - L) / (W - L - R)) * last))))
      }}
    >
      {[-5, 0, 5, 10, 15].map((t) => (
        <g key={t}>
          <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} stroke={t === 0 ? 'var(--wire)' : 'var(--grid)'} strokeDasharray={t === 0 ? undefined : '2 4'} />
          <text x={L - 8} y={y(t) + 4} textAnchor="end" className="mono" fontSize="11" fill="var(--muted)">{t}</text>
        </g>
      ))}
      {data.map((p, i) =>
        p.m.endsWith('-01') || i === 0 || i === last ? (
          <text key={p.m} x={x(i)} y={H - 8} textAnchor={i === 0 ? 'start' : i === last ? 'end' : 'middle'} className="mono" fontSize="11" fill="var(--muted)">{p.m}</text>
        ) : null,
      )}
      {gaps.map((g) => (
        <g key={g}>
          <rect x={x(g) - 7} y={T} width="14" height={H - T - B} fill="var(--hover)" />
          <line x1={x(g)} x2={x(g)} y1={T} y2={H - B} stroke="var(--wire)" strokeDasharray="2 3" />
          <rect x={x(g) - 22} y={T + 2} width="44" height="17" rx="4" fill="var(--pop)" stroke="var(--stroke)" />
          <text x={x(g)} y={T + 14} textAnchor="middle" fontSize="10" fill="var(--muted)">Missing</text>
        </g>
      ))}
      {overlay && <path d={od} fill="none" stroke="#9a9a9a" strokeWidth="1.4" strokeDasharray="5 4" opacity="0.8" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth="2" strokeLinejoin="round" />
      {gaps.flatMap((g) => [g - 1, g + 1]).map((i) => (
        <circle key={i} cx={x(i)} cy={y(data[i].v!)} r="2.5" fill="var(--bg)" stroke="var(--accent)" strokeWidth="1.5" />
      ))}
      <circle cx={x(last)} cy={y(data[last].v!)} r="3.5" fill="var(--accent)" />
      {hov !== null && (
        <g pointerEvents="none">
          <line x1={x(hov)} x2={x(hov)} y1={T} y2={H - B} stroke="var(--wire)" />
          {data[hov].v !== null && <circle cx={x(hov)} cy={y(data[hov].v!)} r="3.5" fill="var(--accent)" />}
          {(() => {
            const bx = Math.min(x(hov) + 10, W - R - 150)
            return (
              <g>
                <rect x={bx} y={T + 26} width="146" height={overlay ? 58 : 40} rx="6" fill="var(--pop)" stroke="var(--stroke)" />
                <text x={bx + 10} y={T + 43} className="mono" fontSize="11" fill="var(--muted)">{data[hov].m}</text>
                <text x={bx + 10} y={T + 59} fontSize="12" fill="var(--accent)">Retail YoY  {data[hov].v === null ? 'Missing' : `${data[hov].v}%`}</text>
                {overlay && <text x={bx + 10} y={T + 75} fontSize="12" fill="#aaa">Income YoY  {data[hov].ov}%</text>}
              </g>
            )
          })()}
        </g>
      )}
    </svg>
  )
}

export default function App() {
  const data = useMemo(buildSeries, [])
  const [open, setOpen] = useState(true)
  const [mode, setMode] = useState<'Calendar series' | 'Seasonal comparison' | 'YoY series'>('Calendar series')
  const [type, setType] = useState<'Line' | 'Bar' | 'Area' | 'Table'>('Line')
  const [tf, setTf] = useState<'Raw value' | 'YoY'>('Raw value')
  const [range, setRange] = useState<'1 year' | '3 years' | '5 years'>('3 years')
  const [chips, setChips] = useState<string[]>(['Disposable Income YoY'])
  const [menu, setMenu] = useState(false)
  const candidates = ['Disposable Income YoY', 'Catering Revenue YoY', 'Online Retail Sales YoY', 'CPI YoY']

  const recent = data.slice(-12).reverse()

  return (
    <div data-theme="dark" className="min-h-full bg-[#141414]">
      <div className="mx-auto w-[960px] bg-[var(--bg)] px-6 py-5 text-[var(--text)]">
        <header>
          <h1 className="text-[20px] font-semibold leading-tight">Total Retail Sales of Consumer Goods – Month-on-Month (YoY)</h1>
          <div className="mt-2 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[14px] text-[var(--muted)]">
            {['Region: National', 'Frequency: Monthly', 'Unit: %', 'Data Period: 2026-09', 'Collected: 2026-10-15'].map((t) => (
              <span key={t} className="flex items-center gap-2.5">{t}<span className="text-[var(--stroke)]">|</span></span>
            ))}
            <span className="flex items-center gap-1.5"><span className="size-2 rounded-full bg-[var(--accent)] shadow-[0_0_0_3px_color-mix(in_srgb,var(--accent)_20%,transparent)]" />Fresh</span>
          </div>
        </header>

        <div className="mt-4 rounded-lg border border-[var(--stroke)] bg-[var(--card)]">
          <button onClick={() => setOpen(!open)} className="flex w-full items-center gap-2 px-3 py-2 text-left text-[12px] font-medium text-[var(--muted)] hover:text-[var(--text)]">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className={`transition-transform ${open ? 'rotate-90' : ''}`}><path d="m9 6 6 6-6 6" /></svg>
            Interpretation
          </button>
          {open && <p className="px-3 pb-3 pl-8 text-[13px] leading-relaxed">Total retail sales YoY growth reflects the momentum of national aggregate consumption; cross-referencing this with growth rates in catering revenue and online retail helps assess the structural composition of business formats.</p>}
        </div>

        <div className="mt-4 flex flex-wrap items-center gap-2">
          <Seg opts={['Calendar series', 'Seasonal comparison', 'YoY series']} val={mode} set={setMode} />
          <Seg opts={['Line', 'Bar', 'Area', 'Table']} val={type} set={setType} />
          <Seg opts={['Raw value', 'YoY']} val={tf} set={setTf} />
          <Seg opts={['1 year', '3 years', '5 years']} val={range} set={setRange} />
          <div className="relative">
            <button onClick={() => setMenu(!menu)} className="h-8 rounded-lg border border-dashed border-[var(--wire)] px-3 text-[12px] text-[var(--muted)] hover:text-[var(--text)]">+ Add comparison indicator</button>
            {menu && (
              <div className="absolute top-9 left-0 z-10 w-56 rounded-lg border border-[var(--stroke)] bg-[var(--pop)] p-1 shadow-xl">
                {candidates.map((c) => {
                  const ok = !chips.includes(c)
                  return (
                    <button key={c} disabled={!ok} onClick={() => { setChips([...chips, c]); setMenu(false) }} className="flex w-full justify-between rounded-md px-2.5 py-1.5 text-left text-[12px] hover:bg-[var(--hover)] disabled:opacity-40">
                      {c}<span className="text-[var(--muted)]">%</span>
                    </button>
                  )
                })}
                <p className="px-2.5 pt-1 pb-1.5 text-[10px] text-[var(--muted)]">Only indicators with matching units can be overlaid.</p>
              </div>
            )}
          </div>
          {chips.map((c) => (
            <span key={c} className="flex h-7 items-center gap-1.5 rounded-full border border-[var(--stroke)] bg-[var(--card)] pr-1 pl-2.5 text-[12px]">
              <svg width="14" height="4"><line x1="0" x2="14" y1="2" y2="2" stroke="#9a9a9a" strokeWidth="1.5" strokeDasharray="3 2" /></svg>
              {c}
              <button aria-label={`Remove ${c}`} onClick={() => setChips(chips.filter((x) => x !== c))} className="flex size-5 items-center justify-center rounded-full text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]">×</button>
            </span>
          ))}
        </div>

        <div className="mt-3 rounded-lg border border-[var(--stroke)] bg-[var(--card)] px-2 pt-2">
          <div className="flex items-center gap-4 px-2 pb-1 text-[11px] text-[var(--muted)]">
            <span className="flex items-center gap-1.5"><span className="h-0.5 w-4 bg-[var(--accent)]" />Retail Sales YoY (%)</span>
            {chips.includes('Disposable Income YoY') && <span className="flex items-center gap-1.5"><span className="w-4 border-t-[1.5px] border-dashed border-[#9a9a9a]" />Disposable Income YoY (%)</span>}
            <span className="ml-auto mono">2021-10 — 2026-09 · 60 periods · 2 missing</span>
          </div>
          <Chart data={data} overlay={chips.includes('Disposable Income YoY')} />
        </div>

        <div className="mt-3 rounded-lg border border-[color-mix(in_srgb,var(--amber)_30%,transparent)] bg-[color-mix(in_srgb,var(--amber)_12%,transparent)] px-3 py-2.5 text-[12px] leading-relaxed text-[color-mix(in_srgb,var(--amber)_70%,var(--text))]">
          <strong className="font-semibold text-[var(--amber)]">Note:</strong> January–February is the period affected by the shifting Spring Festival date; data for these months is merged (average of the two months) in the chart. Please consider the statistical scope when interpreting YoY figures.
        </div>

        <section className="mt-5">
          <div className="mb-2 flex items-baseline justify-between">
            <h2 className="text-[13px] font-semibold">Latest 12 periods</h2>
            <span className="text-[11px] text-[var(--muted)]">The presentation layer always uses the latest version.</span>
          </div>
          <table className="w-full border-collapse text-[13px]">
            <thead>
              <tr className="border-b border-[var(--stroke)] text-left text-[11px] text-[var(--muted)]">
                <th className="py-1.5 pl-3 font-medium">Month</th>
                <th className="py-1.5 text-right font-medium">Value (%)</th>
                <th className="py-1.5 pr-3 text-right font-medium">Revision Version</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => {
                const rev = p.m === '2026-08'
                return (
                  <tr key={p.m} className="border-b border-[var(--stroke)] hover:bg-[var(--hover)]">
                    <td className="mono py-1.5 pl-3">{p.m}</td>
                    <td className="mono py-1.5 text-right">{p.v === null ? <span className="text-[var(--muted)]">— missing</span> : p.v.toFixed(1)}</td>
                    <td className="py-1.5 pr-3 text-right">
                      {rev ? (
                        <span title="New version from data revision or addition" className="mono rounded border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-1.5 py-px text-[11px] text-[var(--accent)]">v2 · revised</span>
                      ) : (
                        <span className="mono text-[11px] text-[var(--muted)]">v1</span>
                      )}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        </section>
      </div>
    </div>
  )
}
