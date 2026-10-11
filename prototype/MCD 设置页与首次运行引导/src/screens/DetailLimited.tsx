import { useState } from 'react'

const PERIODS = Array.from({ length: 22 }, (_, i) => {
  const m = 11 + i // 2024-12 … 2026-09
  return `${2024 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`
})

// 占位形状（确定性，非真实数据）
const SERIES = (() => {
  let s = 1 * 9301 + 49297
  let v = 0.5
  return PERIODS.map(() => {
    s = (s * 9301 + 49297) % 233280
    v = Math.min(0.9, Math.max(0.12, v + (s / 233280 - 0.5) * 0.26))
    return v
  })
})()
const GAPS = [2]

const SEASONAL_TIP =
  '部分视图选项当前不可用：季节性对比。原因：历史数据不足（需 ≥36 个月，当前 22 个月）。已显示当前支持的数据。请检查指标注册表、日期范围与单位/频率，或等待下一次 ETL 运行补齐数据。'

type OverlayItem = { name: string; reason?: string }
const OVERLAYS: OverlayItem[] = [
  { name: '网上零售额（同比）', reason: '单位不一致' },
  { name: '上海社会消费品零售总额', reason: '地区口径不同' },
  { name: '人均可支配收入（同比）' },
]

function Help({ text }: { text: string }) {
  return (
    <span className="group relative inline-flex">
      <span
        tabIndex={0}
        aria-label="不可用原因"
        className="flex size-4 cursor-help items-center justify-center rounded-full border border-[var(--wire)] text-[10px] leading-none text-[var(--muted)] outline-none focus-visible:border-[var(--accent)]"
      >
        ?
      </span>
      <span
        role="tooltip"
        className="pointer-events-none absolute top-full left-1/2 z-30 mt-2 hidden w-[320px] -translate-x-1/2 rounded-lg border border-[var(--stroke)] bg-[var(--pop)] px-3 py-2.5 text-[12px] leading-[1.6] text-[var(--text)] shadow-[0_8px_24px_rgba(0,0,0,0.35)] group-hover:block group-focus-within:block"
      >
        {text}
      </span>
    </span>
  )
}

type Opt = { label: string; disabled?: boolean; note?: string }
function Seg({ label, value, options, onChange }: { label: string; value: string; options: Opt[]; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center gap-2">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <div className="inline-flex rounded-lg border border-[var(--stroke)] bg-[var(--card)] p-0.5">
        {options.map((o) => {
          const sel = o.label === value && !o.disabled
          return (
            <button
              key={o.label}
              disabled={o.disabled}
              aria-disabled={o.disabled}
              onClick={() => onChange(o.label)}
              className={`flex items-center gap-1.5 rounded-md px-3 py-1 text-xs outline-none transition-colors focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
                o.disabled
                  ? 'cursor-not-allowed text-[color-mix(in_srgb,var(--muted)_55%,transparent)]'
                  : sel
                    ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-[var(--accent)]'
                    : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
              }`}
            >
              {o.label}
              {o.note && <span className="rounded border border-[var(--stroke)] px-1 text-[10px] leading-[15px]">{o.note}</span>}
            </button>
          )
        })}
      </div>
    </div>
  )
}

function OverlayDropdown({ allOff }: { allOff: boolean }) {
  const [open, setOpen] = useState(true)
  const [picked, setPicked] = useState<string | null>(null)
  const items = allOff ? OVERLAYS.map((o) => ({ ...o, reason: o.reason ?? '数据未就绪' })) : OVERLAYS
  return (
    <div className="relative flex items-center gap-2">
      <span className="text-[11px] text-[var(--muted)]">叠加</span>
      <button
        onClick={() => setOpen(!open)}
        className={`flex h-[30px] min-w-[200px] items-center justify-between gap-2 rounded-lg border bg-[var(--card)] px-2.5 text-xs outline-none transition-colors ${open ? 'border-[var(--accent)]' : 'border-[var(--stroke)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'}`}
      >
        <span className={picked ? 'text-[var(--text)]' : 'text-[var(--muted)]'}>{picked ?? '选择叠加序列'}</span>
        <span className="text-[var(--muted)]">{open ? '▴' : '▾'}</span>
      </button>
      {open && (
        <ul role="listbox" className="absolute top-full right-0 z-20 mt-1.5 w-[300px] rounded-lg border border-[var(--stroke)] bg-[var(--pop)] p-1 shadow-[0_8px_24px_rgba(0,0,0,0.35)]">
          {items.map((o) => {
            const dis = !!o.reason
            const sel = picked === o.name
            return (
              <li key={o.name}>
                <button
                  role="option"
                  aria-selected={sel}
                  aria-disabled={dis}
                  disabled={dis}
                  onClick={() => {
                    setPicked(sel ? null : o.name)
                    setOpen(false)
                  }}
                  className={`flex w-full items-center gap-2 rounded-md px-2.5 py-2 text-left text-xs ${
                    dis ? 'cursor-not-allowed text-[color-mix(in_srgb,var(--muted)_55%,transparent)]' : 'text-[var(--text)] hover:bg-[var(--hover)]'
                  }`}
                >
                  <span className={`size-3 shrink-0 rounded-sm border ${sel ? 'border-[var(--accent)] bg-[var(--accent)]' : 'border-[var(--wire)]'} ${dis ? 'opacity-50' : ''}`} />
                  <span className="truncate">{o.name}</span>
                  {dis && <span className="ml-auto shrink-0 rounded border border-[var(--stroke)] px-1.5 text-[10px] leading-[16px] text-[var(--muted)]">{o.reason}</span>}
                </button>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}

function LineChart({ overlay }: { overlay: boolean }) {
  const W = 1000
  const H = 300
  const L = 8
  const R = 36
  const T = 14
  const B = 30
  const iw = W - L - R
  const ih = H - T - B
  const n = PERIODS.length - 1
  const x = (i: number) => L + (i / n) * iw
  const y = (f: number) => T + ih - f * ih
  let d = ''
  let pen = false
  SERIES.forEach((f, i) => {
    if (GAPS.includes(i)) return void (pen = false)
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(f).toFixed(1)}`
    pen = true
  })
  const od = SERIES.map((f, i) => `${i ? 'L' : 'M'}${x(i).toFixed(1)},${y(0.25 + f * 0.35).toFixed(1)}`).join('')
  return (
    <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
      {[0, 0.25, 0.5, 0.75, 1].map((t, i) => (
        <g key={t}>
          <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke={i === 0 ? 'var(--text)' : 'var(--grid)'} strokeWidth={i === 0 ? 1 : 0.75} />
          <text x={W - 4} y={y(t) - 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="mono">
            {i * 2}
          </text>
        </g>
      ))}
      {GAPS.map((g) => (
        <g key={g}>
          <line x1={x(g)} x2={x(g)} y1={T} y2={T + ih} stroke="var(--wire)" strokeDasharray="2 3" />
          <text x={x(g)} y={T + 12} textAnchor="middle" fontSize={10} fill="var(--muted)">缺失</text>
        </g>
      ))}
      {overlay && <path d={od} fill="none" stroke="var(--wire)" strokeWidth={1.5} strokeDasharray="4 3" />}
      <path d={d} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
      <circle cx={x(n)} cy={y(SERIES[n])} r={3.5} fill="var(--accent)" />
      {PERIODS.map((p, i) => (
        <g key={p}>
          <line x1={x(i)} x2={x(i)} y1={T + ih} y2={T + ih + 4} stroke="var(--text)" strokeWidth={0.75} />
          {i % 3 === 0 || i === n ? (
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)" className="mono">
              {i === 0 || p.endsWith('-01') ? p : p.slice(5)}
            </text>
          ) : null}
        </g>
      ))}
    </svg>
  )
}

export default function DetailLimited({ allOff }: { allOff: boolean }) {
  const [chart, setChart] = useState('折线图')
  const [tf, setTf] = useState('原值')
  const effChart = allOff ? '折线图' : chart
  const effTf = allOff ? '原值' : tf

  return (
    <div className="mx-auto min-h-screen w-[1440px] bg-[var(--bg)] text-[var(--text)]">
      <header className="flex h-12 items-center gap-3 border-b border-[var(--stroke)] px-6">
        <span className="text-[12px] text-[var(--muted)]">总览</span>
        <span className="text-[12px] text-[var(--muted)]">/</span>
        <h1 className="text-[15px] font-semibold">社会消费品零售总额（同比）</h1>
        <span className="mono ml-auto text-[12px] text-[var(--muted)]">ETL 更新于 2026-10-11 08:00</span>
      </header>

      <main className="flex flex-col gap-4 px-6 py-6">
        {allOff && (
          <div role="status" className="flex items-center gap-2.5 rounded-[10px] border border-[color-mix(in_srgb,var(--amber)_45%,transparent)] bg-[color-mix(in_srgb,var(--amber)_10%,transparent)] px-4 py-2.5 text-[13px]">
            <span className="size-1.5 rounded-full bg-[var(--amber)]" />
            <span>部分视图选项当前不可用，已回退至默认视图（日历序列 · 折线图 · 原值）</span>
          </div>
        )}

        <div className="flex items-end gap-6">
          <div className="flex items-baseline gap-1.5">
            <span className="mono text-[40px] font-bold leading-none">3.8</span>
            <span className="mono text-[16px] text-[var(--muted)]">%</span>
          </div>
          <span className="mono pb-1 text-[14px]">↓ 0.3pct</span>
          <span className="mono pb-1 text-[12px] text-[var(--muted)]">2026-09 · 国家统计局 · 月度</span>
        </div>

        <div className="flex flex-wrap items-center gap-5 rounded-[10px] border border-[var(--stroke)] bg-[var(--card)] px-4 py-3">
          <div className="flex items-center gap-2">
            <Seg label="视图" value="日历序列" onChange={() => {}} options={[{ label: '日历序列' }, { label: '季节性对比', disabled: true }]} />
            <Help text={SEASONAL_TIP} />
          </div>
          <Seg label="图表" value={effChart} onChange={setChart} options={[{ label: '折线图' }, { label: '柱状图', disabled: allOff }]} />
          <Seg
            label="变换"
            value={effTf}
            onChange={setTf}
            options={[{ label: '原值' }, { label: '同比', disabled: true, note: '派生序列未生成' }, { label: '环比', disabled: allOff }]}
          />
          <div className="ml-auto">
            <OverlayDropdown allOff={allOff} />
          </div>
        </div>

        <section className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)] p-5">
          <div className="mb-2.5 h-[6px] w-8 bg-[var(--accent)]" />
          <h2 className="text-[15px] font-bold">社会消费品零售总额</h2>
          <p className="mt-0.5 mb-3 text-xs text-[var(--muted)]">
            日历序列 · {effChart} · {effTf}，%
          </p>
          {effChart === '折线图' ? (
            <LineChart overlay={false} />
          ) : (
            <div className="flex h-[300px] items-end gap-1.5">
              {SERIES.map((f, i) => (
                <div key={i} className="flex-1 rounded-t-sm bg-[var(--accent)]" style={{ height: GAPS.includes(i) ? 0 : `${f * 100}%` }} />
              ))}
            </div>
          )}
          <p className="mt-2 text-[11px] text-[var(--muted)]">来源：国家统计局 · 22 期 · 虚竖线 = 缺失期（不插值）· 线框占位，非真实数据</p>
        </section>
      </main>
    </div>
  )
}
