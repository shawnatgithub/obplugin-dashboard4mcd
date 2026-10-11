import { useState } from 'react'

type Fresh = 'fresh' | 'aging' | 'stale'
type Card = {
  name: string
  value: string
  unit: string
  delta?: { dir: 'up' | 'down' | 'flat'; v?: string }
  period: string
  fresh: Fresh
  badge?: 'NEW' | '手动'
  expired?: string
  seed: number
  gaps?: number[]
}

const GROUPS: { title: string; cards: Card[] }[] = [
  {
    title: '全国趋势',
    cards: [
      { name: '社会消费品零售总额（同比）', value: '3.8', unit: '%', delta: { dir: 'down', v: '0.3' }, period: '2026-09', fresh: 'fresh', badge: 'NEW', seed: 1, gaps: [4] },
      { name: '网上零售额（同比）', value: '7.4', unit: '%', delta: { dir: 'up', v: '0.2' }, period: '2026-09', fresh: 'fresh', badge: 'NEW', seed: 2, gaps: [4] },
      { name: '服务零售额（同比）', value: '6.2', unit: '%', period: '2026-09', fresh: 'fresh', seed: 3, gaps: [4, 16] },
      { name: '餐饮收入（同比）', value: '3.1', unit: '%', delta: { dir: 'down', v: '0.4' }, period: '2026-09', fresh: 'fresh', seed: 4, gaps: [4] },
      { name: 'CPI（同比）', value: '0.6', unit: '%', period: '2026-09', fresh: 'fresh', seed: 5 },
      { name: '核心 CPI（同比）', value: '0.8', unit: '%', period: '2026-09', fresh: 'fresh', seed: 6 },
      { name: 'M1（同比）', value: '3.2', unit: '%', delta: { dir: 'up', v: '0.5' }, period: '2026-09', fresh: 'fresh', seed: 7 },
      { name: 'M2（同比）', value: '7.1', unit: '%', delta: { dir: 'flat' }, period: '2026-09', fresh: 'fresh', seed: 8 },
    ],
  },
  {
    title: '地方：上海',
    cards: [
      { name: '上海社会消费品零售总额（同比）', value: '2.3', unit: '%', period: '2026-08', fresh: 'aging', seed: 9, gaps: [3] },
      { name: '上海餐饮收入（同比）', value: '1.9', unit: '%', period: '2026-08', fresh: 'aging', seed: 10, gaps: [3] },
      { name: '上海金融数据（季度）', value: '—', unit: '', period: '2026-Q1', fresh: 'stale', expired: '数据已过期 · 请检查采集', seed: 11 },
    ],
  },
  {
    title: '地方：四川 / 成都',
    cards: [
      { name: '四川社会消费品零售总额（同比）', value: '4.1', unit: '%', period: '2026-08', fresh: 'aging', seed: 12, gaps: [3] },
      { name: '成都社会消费品零售总额（同比）', value: '4.5', unit: '%', period: '2026-08', fresh: 'aging', badge: 'NEW', seed: 13, gaps: [3, 15] },
    ],
  },
  {
    title: '补充指标',
    cards: [
      { name: 'M1-M2 剪刀差', value: '-3.9', unit: 'pct', period: '2026-09', fresh: 'fresh', seed: 14 },
      { name: '城市轨道交通客运量（上海）', value: '+5.2', unit: '% 环比', period: '2026-09', fresh: 'fresh', seed: 15 },
      { name: '住户存款增速', value: '12.4', unit: '%', period: '2026-09', fresh: 'stale', badge: '手动', seed: 16 },
    ],
  },
]

const FRESH: Record<Fresh, { c: string; label: string }> = {
  fresh: { c: 'var(--accent)', label: '最新' },
  aging: { c: 'var(--amber)', label: '临近截止' },
  stale: { c: 'var(--stale)', label: '已过期' },
}

// 24 期占位形状（确定性伪随机，非真实数据）
function shape(seed: number) {
  let s = seed * 9301 + 49297
  let v = 0.5
  return Array.from({ length: 24 }, () => {
    s = (s * 9301 + 49297) % 233280
    v = Math.min(0.92, Math.max(0.08, v + (s / 233280 - 0.5) * 0.28))
    return v
  })
}

function Sparkline({ seed, gaps = [], muted }: { seed: number; gaps?: number[]; muted?: boolean }) {
  const W = 300
  const H = 40
  const pts = shape(seed)
  const x = (i: number) => (i / 23) * W
  const y = (f: number) => 3 + (1 - f) * (H - 6)
  let d = ''
  let pen = false
  pts.forEach((f, i) => {
    if (gaps.includes(i)) return void (pen = false)
    d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(f).toFixed(1)}`
    pen = true
  })
  const last = pts[23]
  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className="h-10 w-full overflow-visible">
      <line x1="0" x2={W} y1={H - 0.5} y2={H - 0.5} stroke="var(--grid)" vectorEffect="non-scaling-stroke" />
      {gaps.map((g) => (
        <line key={g} x1={x(g)} x2={x(g)} y1="2" y2={H} stroke="var(--wire)" strokeDasharray="2 2" vectorEffect="non-scaling-stroke" />
      ))}
      <path d={d} fill="none" stroke={muted ? 'var(--wire)' : 'var(--accent)'} strokeWidth="1.5" strokeDasharray={muted ? '3 3' : undefined} vectorEffect="non-scaling-stroke" strokeLinejoin="round" />
      {!muted && <circle cx={W} cy={y(last)} r="2.5" fill="var(--accent)" />}
    </svg>
  )
}

function Delta({ d }: { d?: Card['delta'] }) {
  if (!d) return null
  const t = d.dir === 'flat' ? '→ 持平' : `${d.dir === 'up' ? '↑' : '↓'} ${d.v}pct`
  return <span className="mono text-[14px] text-[var(--text)]">{t}</span>
}

function MetricCard({ c, selected, onClick }: { c: Card; selected: boolean; onClick: () => void }) {
  const f = FRESH[c.fresh]
  const exp = !!c.expired
  return (
    <button
      onClick={onClick}
      className={`relative flex flex-col gap-3 rounded-[10px] border bg-[var(--card)] p-4 text-left outline-none transition-colors focus-visible:border-[var(--accent)] ${
        selected ? 'border-[var(--accent)]' : exp ? 'border-dashed border-[color-mix(in_srgb,var(--text)_22%,transparent)] hover:border-[color-mix(in_srgb,var(--text)_35%,transparent)]' : 'border-[var(--stroke)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'
      }`}
    >
      {c.badge === '手动' && (
        <span className="absolute top-3 right-3 inline-flex items-center gap-1 rounded-md border border-[color-mix(in_srgb,var(--red)_40%,transparent)] px-1.5 py-0.5 text-[11px] text-[var(--red)]">
          <span className="size-1.5 rounded-full bg-[var(--red)]" />
          手动
        </span>
      )}
      <div className={`truncate pr-12 text-[14px] text-[var(--muted)]`}>{c.name}</div>

      <div className="flex items-baseline gap-1.5">
        <span className={`mono text-[28px] font-bold leading-none ${exp ? 'text-[var(--muted)]' : 'text-[var(--text)]'}`}>{c.value}</span>
        {c.unit && <span className="mono text-[14px] text-[var(--muted)]">{c.unit}</span>}
        <span className="ml-auto">
          <Delta d={c.delta} />
        </span>
      </div>

      {exp ? (
        <div className="flex h-10 items-center justify-center rounded-md border border-dashed border-[var(--stroke)] text-[11px] text-[var(--muted)]">近 24 期无可用更新</div>
      ) : (
        <Sparkline seed={c.seed} gaps={c.gaps} muted={c.fresh === 'stale'} />
      )}

      <div className="flex items-center gap-2 border-t border-[var(--stroke)] pt-2.5 text-[12px] text-[var(--muted)]">
        <span className="mono text-[14px]">{c.period}</span>
        <span className="size-1.5 rounded-full" style={{ background: f.c }} title={f.label} />
        <span>{exp ? <span className="text-[var(--text)]">{c.expired}</span> : f.label}</span>
        {c.badge === 'NEW' && <span className="ml-auto rounded-md border border-[color-mix(in_srgb,var(--accent)_45%,transparent)] px-1.5 py-px text-[10px] font-semibold tracking-wide text-[var(--accent)]">NEW</span>}
        {c.gaps && c.gaps.length > 0 && !c.badge && <span className="ml-auto text-[11px]">含 {c.gaps.length} 期缺失</span>}
      </div>
    </button>
  )
}

export default function App() {
  const [sel, setSel] = useState<string | null>(null)
  const [spin, setSpin] = useState(false)

  return (
    <div data-theme="dark" className="min-h-full bg-[#141414]">
      <div className="mx-auto min-h-screen w-[1440px] bg-[var(--bg)] text-[var(--text)]">
        <header className="sticky top-0 z-10 flex h-12 items-center gap-4 border-b border-[var(--stroke)] bg-[var(--bg)] px-6">
          <h1 className="text-[15px] font-semibold">宏观数据看板</h1>
          <span className="text-[12px] text-[var(--muted)]">总览</span>
          <div className="ml-auto flex items-center gap-3">
            <span className="mono text-[12px] text-[var(--muted)]">ETL 更新于 2026-10-11 08:00</span>
            <button
              aria-label="刷新"
              title="重新读取本地 JSON"
              onClick={() => {
                setSpin(true)
                setTimeout(() => setSpin(false), 700)
              }}
              className="flex size-8 items-center justify-center rounded-lg text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)] focus-visible:outline focus-visible:outline-1 focus-visible:outline-[var(--accent)]"
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" className={spin ? 'animate-spin' : ''}>
                <path d="M20 11a8 8 0 1 0-2.3 5.7M20 4v7h-7" />
              </svg>
            </button>
            <button className="h-8 rounded-lg px-3 text-[13px] text-[var(--muted)] transition-colors hover:bg-[var(--hover)] hover:text-[var(--text)]">设置</button>
          </div>
        </header>

        <main className="flex flex-col gap-8 px-6 py-6">
          {GROUPS.map((g) => (
            <section key={g.title}>
              <div className="mb-3 flex items-baseline gap-3">
                <h2 className="text-[13px] font-semibold">{g.title}</h2>
                <span className="mono text-[12px] text-[var(--muted)]">{g.cards.length} 项</span>
                <span className="h-px flex-1 self-center bg-[var(--stroke)]" />
              </div>
              <div className="grid grid-cols-4 gap-3">
                {g.cards.map((c) => (
                  <MetricCard key={c.name} c={c} selected={sel === c.name} onClick={() => setSel(sel === c.name ? null : c.name)} />
                ))}
              </div>
            </section>
          ))}
          <p className="text-[11px] text-[var(--muted)]">迷你折线为 24 期线框占位，虚竖线 = 缺失期（不插值）。数据来源：本地 ETL JSON。</p>
        </main>
      </div>
    </div>
  )
}
