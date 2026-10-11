import { useState } from 'react'

type Theme = 'dark' | 'light'
type Fresh = 'fresh' | 'aging' | 'stale'
type Group = '全部' | '消费' | '价格' | '货币'

type Metric = {
  id: string
  name: string
  latest: string
  value: number
  delta: number
  fresh: Fresh
  nextRelease: string
  group: Exclude<Group, '全部'>
  source: string
  gaps: number[] // 缺失期索引（0–11）
  disabled?: boolean
}

const P = Array.from({ length: 12 }, (_, i) => {
  const m = 9 + i
  return `${2025 + Math.floor(m / 12)}-${String((m % 12) + 1).padStart(2, '0')}`
}) // 2025-10 … 2026-09

const METRICS: Metric[] = [
  { id: 'retail', name: '社会消费品零售总额', latest: '2026-09', value: 3.4, delta: 0.3, fresh: 'fresh', nextRelease: '2026-11-14', group: '消费', source: '国家统计局', gaps: [3] },
  { id: 'goods', name: '限额以上商品零售', latest: '2026-09', value: 2.8, delta: -0.2, fresh: 'fresh', nextRelease: '2026-11-14', group: '消费', source: '国家统计局', gaps: [3] },
  { id: 'catering', name: '餐饮收入', latest: '2026-09', value: 4.9, delta: 0.7, fresh: 'fresh', nextRelease: '2026-11-14', group: '消费', source: '国家统计局', gaps: [3] },
  { id: 'cpi', name: 'CPI', latest: '2026-09', value: 0.4, delta: -0.2, fresh: 'aging', nextRelease: '2026-10-15', group: '价格', source: '国家统计局', gaps: [] },
  { id: 'core', name: '核心 CPI', latest: '2026-09', value: 0.9, delta: 0, fresh: 'aging', nextRelease: '2026-10-15', group: '价格', source: '国家统计局', gaps: [] },
  { id: 'm1', name: 'M1', latest: '2026-08', value: 2.1, delta: 0.3, fresh: 'stale', nextRelease: '待确认', group: '货币', source: '中国人民银行', gaps: [5, 11] },
  { id: 'm2', name: 'M2', latest: '2026-08', value: 7.8, delta: -0.1, fresh: 'stale', nextRelease: '待确认', group: '货币', source: '中国人民银行', gaps: [5, 11] },
  { id: 'ppi', name: 'PPI', latest: '—', value: 0, delta: 0, fresh: 'stale', nextRelease: '未接入', group: '价格', source: '国家统计局', gaps: [], disabled: true },
]

const FORMATS = [
  { name: '餐饮', yoy: 4.9, d: 0.7, share: 31.2 },
  { name: '服装鞋帽针纺织品', yoy: 1.8, d: -0.6, share: 18.6 },
  { name: '化妆品', yoy: -1.2, d: -0.3, share: 7.4 },
  { name: '金银珠宝', yoy: 6.3, d: 0.5, share: 5.1 },
  { name: '体育娱乐用品', yoy: 9.7, d: 0.8, share: 4.8 },
  { name: '通讯器材', yoy: null, d: null, share: 3.2 },
  { name: '家用电器和音像器材', yoy: 3.1, d: -1.1, share: 6.9 },
]

const FRESH_COLOR: Record<Fresh, string> = { fresh: 'var(--accent)', aging: 'var(--amber)', stale: 'var(--stale)' }
const FRESH_LABEL: Record<Fresh, string> = { fresh: '最新', aging: '临近更新', stale: '已过期' }

function Delta({ v, size = 14 }: { v: number | null; size?: number }) {
  if (v === null) return <span className="mono text-[var(--muted)]" style={{ fontSize: size }}>—</span>
  const arrow = v > 0 ? '↑' : v < 0 ? '↓' : '→'
  return (
    <span className="mono text-[var(--text)]" style={{ fontSize: size }}>
      {arrow} {Math.abs(v).toFixed(1)}%
    </span>
  )
}

const Dot = ({ c }: { c: string }) => <span className="inline-block size-1.5 shrink-0 rounded-full" style={{ background: c }} />

/* ---------- interactive primitives (default / hover / selected / disabled) ---------- */

function Segmented<T extends string>({ value, options, onChange, disabled = [] }: { value: T; options: T[]; onChange: (v: T) => void; disabled?: T[] }) {
  return (
    <div className="inline-flex rounded-lg border border-[var(--stroke)] bg-[var(--card)] p-0.5">
      {options.map((o) => {
        const dis = disabled.includes(o)
        const sel = o === value
        return (
          <button
            key={o}
            disabled={dis}
            onClick={() => onChange(o)}
            className={`rounded-md px-3 py-1 text-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] ${
              dis
                ? 'cursor-not-allowed text-[var(--muted)] opacity-40'
                : sel
                  ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] font-medium text-[var(--accent)]'
                  : 'text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]'
            }`}
          >
            {o}
          </button>
        )
      })}
    </div>
  )
}

function Select({ value, options, onChange, disabled }: { value: string; options: string[]; onChange: (v: string) => void; disabled?: boolean }) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-[30px] rounded-lg border border-[var(--stroke)] bg-[var(--card)] px-2 text-xs text-[var(--text)] outline-none transition-colors hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)] focus:border-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 disabled:hover:border-[var(--stroke)]"
    >
      {options.map((o) => (
        <option key={o}>{o}</option>
      ))}
    </select>
  )
}

function Button({ children, selected, disabled, onClick }: { children: React.ReactNode; selected?: boolean; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      disabled={disabled}
      onClick={onClick}
      className={`h-[30px] rounded-lg border px-3 text-xs transition-colors outline-none focus-visible:ring-1 focus-visible:ring-[var(--accent)] disabled:cursor-not-allowed disabled:opacity-40 ${
        selected
          ? 'border-[var(--accent)] bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]'
          : 'border-[var(--stroke)] text-[var(--text)] enabled:hover:border-[var(--accent)] enabled:hover:text-[var(--accent)]'
      }`}
    >
      {children}
    </button>
  )
}

function Tip({ text, children }: { text: string; children: React.ReactNode }) {
  return (
    <span className="group relative inline-flex">
      {children}
      <span className="pointer-events-none absolute bottom-full right-0 z-20 mb-1.5 hidden whitespace-nowrap rounded-md border border-[var(--stroke)] bg-[var(--pop)] px-2 py-1 text-[11px] text-[var(--text)] group-hover:block">
        {text}
      </span>
    </span>
  )
}

function Badge({ tone, children }: { tone: 'amber' | 'red' | 'neutral'; children: React.ReactNode }) {
  const c = tone === 'amber' ? 'var(--amber)' : tone === 'red' ? 'var(--red)' : 'var(--muted)'
  return (
    <span className="inline-flex items-center gap-1 rounded-md border px-1.5 py-0.5 text-[11px]" style={{ color: c, borderColor: `color-mix(in srgb, ${c} 40%, transparent)` }}>
      {children}
    </span>
  )
}

/* ---------- metric card ---------- */

function MetricCard({ m, selected, onClick, forceHover }: { m: Metric; selected: boolean; onClick?: () => void; forceHover?: boolean }) {
  const dis = m.disabled
  return (
    <button
      disabled={dis}
      onClick={onClick}
      className={`flex flex-col gap-3 rounded-[10px] border bg-[var(--card)] p-4 text-left outline-none transition-colors focus-visible:border-[var(--accent)] ${
        dis
          ? 'cursor-not-allowed border-dashed border-[var(--stroke)] opacity-50'
          : selected
            ? 'border-[var(--accent)] shadow-[inset_0_2px_0_var(--accent)]'
            : forceHover
              ? 'border-[color-mix(in_srgb,var(--text)_30%,transparent)]'
              : 'border-[var(--stroke)] hover:border-[color-mix(in_srgb,var(--text)_30%,transparent)]'
      }`}
    >
      <div className="flex items-center justify-between gap-2">
        <span className={`truncate text-xs ${selected ? 'text-[var(--text)]' : 'text-[var(--muted)]'}`}>{m.name}</span>
        <Tip text={dis ? '数据源未接入' : `${FRESH_LABEL[m.fresh]} · 下次发布 ${m.nextRelease}`}>
          <span className="mono flex items-center gap-1.5 text-[14px] text-[var(--muted)]">
            <Dot c={FRESH_COLOR[m.fresh]} />
            {m.latest}
          </span>
        </Tip>
      </div>
      <div className="flex items-baseline gap-1">
        <span className="mono text-[30px] font-bold leading-none text-[var(--text)]">{dis ? '—' : m.value.toFixed(1)}</span>
        {!dis && <span className="mono text-[14px] font-bold text-[var(--muted)]">%</span>}
        <span className="ml-1 text-[11px] text-[var(--muted)]">同比</span>
      </div>
      <div className="flex items-center justify-between border-t border-[var(--stroke)] pt-2.5">
        <span className="text-[11px] text-[var(--muted)]">较上期</span>
        {dis ? <span className="text-[11px] text-[var(--muted)]">未接入</span> : <Delta v={m.delta} />}
      </div>
    </button>
  )
}

/* ---------- Economist-style chart wireframe ---------- */

// 抽象形状（非真实数据），仅用于版式示意
const SHAPE_A = [0.42, 0.45, 0.6, 0.55, 0.7, 0.74, 0.64, 0.82, 0.5, 0.44, 0.47, 0.56]
const SHAPE_B = [0.3, 0.34, 0.38, 0.4, 0.43, 0.46, 0.44, 0.48, 0.5, 0.52, 0.5, 0.53]

function EconomistChart({ m }: { m: Metric }) {
  const W = 720
  const H = 250
  const L = 8
  const R = 40
  const T = 12
  const B = 30
  const iw = W - L - R
  const ih = H - T - B
  const x = (i: number) => L + (i / 11) * iw
  const y = (f: number) => T + ih - f * ih
  const ticks = [0, 0.25, 0.5, 0.75, 1]
  const labels = ['0', '1', '2', '3', '4']

  const path = (shape: number[], gaps: number[]) => {
    let d = ''
    let pen = false
    shape.forEach((f, i) => {
      if (gaps.includes(i)) {
        pen = false
        return
      }
      d += `${pen ? 'L' : 'M'}${x(i).toFixed(1)},${y(f).toFixed(1)}`
      pen = true
    })
    return d
  }

  return (
    <figure className="flex flex-col">
      {/* Economist: 顶部色条 + 粗体标题 + 副标题 */}
      <div className="mb-3">
        <div className="mb-2.5 h-[6px] w-8 bg-[var(--accent)]" />
        <h2 className="text-[15px] font-bold text-[var(--text)]">{m.name}：消费温和回升</h2>
        <p className="mt-0.5 text-xs text-[var(--muted)]">当月同比，%</p>
        <div className="mt-2 flex items-center gap-4 text-[11px] text-[var(--muted)]">
          <span className="flex items-center gap-1.5">
            <span className="h-[2.5px] w-4 bg-[var(--accent)]" />
            {m.name}
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="16" height="4">
              <line x1="0" x2="16" y1="2" y2="2" stroke="var(--wire)" strokeWidth="1.5" strokeDasharray="3 2" />
            </svg>
            CPI（叠加）
          </span>
          <span className="flex items-center gap-1.5">
            <svg width="10" height="10">
              <line x1="5" x2="5" y1="0" y2="10" stroke="var(--wire)" strokeDasharray="2 2" />
            </svg>
            缺失期
          </span>
        </div>
      </div>

      <svg viewBox={`0 0 ${W} ${H}`} className="w-full">
        {/* 仅水平网格线，数值标签位于右侧、网格线上方 */}
        {ticks.map((t, i) => (
          <g key={t}>
            <line x1={L} x2={W - 4} y1={y(t)} y2={y(t)} stroke={i === 0 ? 'var(--text)' : 'var(--grid)'} strokeWidth={i === 0 ? 1 : 0.75} />
            <text x={W - 4} y={y(t) - 4} textAnchor="end" fontSize={11} fill="var(--muted)" className="mono">
              {labels[i]}
            </text>
          </g>
        ))}
        {/* 缺失期标记 */}
        {m.gaps.map((g) => (
          <g key={g}>
            <rect x={x(g) - iw / 22} y={T} width={iw / 11} height={ih} fill="var(--hover)" />
            <line x1={x(g)} x2={x(g)} y1={T} y2={T + ih} stroke="var(--wire)" strokeDasharray="2 3" />
            <text x={x(g)} y={T + 12} textAnchor="middle" fontSize={10} fill="var(--muted)">
              缺失
            </text>
          </g>
        ))}
        {/* 叠加序列：浅灰虚线 */}
        <path d={path(SHAPE_B, [])} fill="none" stroke="var(--wire)" strokeWidth={1.5} strokeDasharray="4 3" />
        {/* 主数据线：强调绿，缺失处断开 */}
        <path d={path(SHAPE_A, m.gaps)} fill="none" stroke="var(--accent)" strokeWidth={2.5} strokeLinejoin="round" />
        {/* 最新值端点 */}
        {!m.gaps.includes(11) && <circle cx={x(11)} cy={y(SHAPE_A[11])} r={3} fill="var(--accent)" />}
        {/* x 轴：短刻度 + 期别 */}
        {P.map((p, i) => (
          <g key={p}>
            <line x1={x(i)} x2={x(i)} y1={T + ih} y2={T + ih + 4} stroke="var(--text)" strokeWidth={0.75} />
            <text x={x(i)} y={H - 8} textAnchor="middle" fontSize={10} fill="var(--muted)" className="mono">
              {i === 0 || p.endsWith('-01') ? p : p.slice(5)}
            </text>
          </g>
        ))}
      </svg>

      <figcaption className="mt-2 text-[11px] text-[var(--muted)]">来源：{m.source} · 线框占位，非真实数据</figcaption>
    </figure>
  )
}

function Wireframe({ title }: { title: string }) {
  return (
    <figure>
      <div className="mb-2 h-[5px] w-6 bg-[var(--accent)]" />
      <h3 className="text-[13px] font-bold">{title}</h3>
      <p className="mb-2 text-[11px] text-[var(--muted)]">当月同比，%</p>
      <svg viewBox="0 0 300 90" className="w-full">
        {[10, 35, 60].map((yy) => (
          <line key={yy} x1="0" x2="300" y1={yy} y2={yy} stroke="var(--grid)" strokeWidth="0.75" />
        ))}
        <line x1="0" x2="300" y1="85" y2="85" stroke="var(--text)" strokeWidth="1" />
        <path d="M0,60 L50,55 L100,48 L150,52" fill="none" stroke="var(--wire)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d="M150,52 L200,40 L250,44 L300,30" fill="none" stroke="var(--wire)" strokeWidth="1.5" strokeDasharray="4 3" />
        <path d="M0,50 L50,42 L100,46" fill="none" stroke="var(--accent)" strokeWidth="2.25" />
        <path d="M150,36 L200,28 L250,33 L300,20" fill="none" stroke="var(--accent)" strokeWidth="2.25" />
        <line x1="125" x2="125" y1="5" y2="85" stroke="var(--wire)" strokeDasharray="2 3" />
      </svg>
      <figcaption className="mt-1 text-[10px] text-[var(--muted)]">来源：国家统计局</figcaption>
    </figure>
  )
}

/* ---------- state spec ---------- */

function StateSpec() {
  const noop = () => {}
  const m = METRICS[0]
  const Row = ({ label, children }: { label: string; children: React.ReactNode }) => (
    <div className="grid grid-cols-[88px_1fr] items-center gap-3 border-t border-[var(--stroke)] py-3 first:border-0">
      <span className="text-[11px] text-[var(--muted)]">{label}</span>
      <div className="flex flex-wrap items-center gap-3">{children}</div>
    </div>
  )
  const Cap = ({ t, children }: { t: string; children: React.ReactNode }) => (
    <div className="flex flex-col items-start gap-1.5">
      {children}
      <span className="text-[10px] text-[var(--muted)]">{t}</span>
    </div>
  )
  return (
    <section className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)] p-4">
      <h2 className="mb-1 text-sm font-medium">交互状态规范</h2>
      <p className="mb-2 text-[11px] text-[var(--muted)]">默认 / 悬停 / 选中；禁用状态单列。悬停 = 描边加深 + 背景微亮；选中 = 强调绿描边或底色 14%；禁用 = 40% 不透明 + 禁用光标。</p>
      <Row label="按钮">
        <Cap t="默认"><Button>插入到笔记</Button></Cap>
        <Cap t="悬停"><span className="pointer-events-none"><button className="h-[30px] rounded-lg border border-[var(--accent)] px-3 text-xs text-[var(--accent)]">插入到笔记</button></span></Cap>
        <Cap t="选中"><Button selected>插入到笔记</Button></Cap>
        <span className="mx-2 h-8 w-px bg-[var(--stroke)]" />
        <Cap t="禁用"><Button disabled>插入到笔记</Button></Cap>
      </Row>
      <Row label="分段控件">
        <Cap t="默认 · 悬停 · 选中">
          <div className="inline-flex rounded-lg border border-[var(--stroke)] bg-[var(--card)] p-0.5 text-xs">
            <span className="rounded-md px-3 py-1 text-[var(--muted)]">消费</span>
            <span className="rounded-md bg-[var(--hover)] px-3 py-1 text-[var(--text)]">价格</span>
            <span className="rounded-md bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-3 py-1 font-medium text-[var(--accent)]">货币</span>
          </div>
        </Cap>
        <span className="mx-2 h-8 w-px bg-[var(--stroke)]" />
        <Cap t="禁用项"><Segmented value={'消费' as string} options={['消费', '房地产']} onChange={noop} disabled={['房地产']} /></Cap>
      </Row>
      <Row label="下拉选择">
        <Cap t="默认"><Select value="近 12 个月" options={['近 12 个月']} onChange={noop} /></Cap>
        <Cap t="悬停"><span className="flex h-[30px] items-center rounded-lg border border-[color-mix(in_srgb,var(--text)_30%,transparent)] bg-[var(--card)] px-2 text-xs">近 12 个月 ▾</span></Cap>
        <Cap t="选中 / 聚焦"><span className="flex h-[30px] items-center rounded-lg border border-[var(--accent)] bg-[var(--card)] px-2 text-xs">近 24 个月 ▾</span></Cap>
        <span className="mx-2 h-8 w-px bg-[var(--stroke)]" />
        <Cap t="禁用"><Select value="近 12 个月" options={['近 12 个月']} onChange={noop} disabled /></Cap>
      </Row>
      <Row label="指标卡片">
        <div className="grid w-full grid-cols-4 gap-3 [&>div>button]:w-full [&>div]:items-stretch">
          <Cap t="默认"><MetricCard m={m} selected={false} /></Cap>
          <Cap t="悬停"><MetricCard m={m} selected={false} forceHover /></Cap>
          <Cap t="选中"><MetricCard m={m} selected /></Cap>
          <Cap t="禁用（未接入）"><MetricCard m={METRICS[7]} selected={false} /></Cap>
        </div>
      </Row>
    </section>
  )
}

/* ---------- dashboard ---------- */

function Dashboard({ theme }: { theme: Theme }) {
  const [group, setGroup] = useState<Group>('全部')
  const [sel, setSel] = useState('retail')
  const [range, setRange] = useState('近 12 个月')
  const [infoOpen, setInfoOpen] = useState(true)
  const list = METRICS.filter((m) => group === '全部' || m.group === group)
  const active = METRICS.find((m) => m.id === sel)!

  return (
    <div data-theme={theme} className="flex h-full min-w-0 flex-1 bg-[var(--bg)] text-[var(--text)]">
      <div className="flex w-11 shrink-0 flex-col items-center gap-4 border-r border-[var(--stroke)] bg-[var(--chrome)] py-3 text-[var(--muted)]">
        {['M4 6h16M4 12h16M4 18h10', 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14zM20 20l-4-4', 'M4 19V9M10 19V5M16 19v-7M22 19H2'].map((d, i) => (
          <svg key={i} width="18" height="18" viewBox="0 0 24 24" fill="none" stroke={i === 2 ? 'var(--accent)' : 'currentColor'} strokeWidth="1.6">
            <path d={d} />
          </svg>
        ))}
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex h-9 items-end gap-1 border-b border-[var(--stroke)] bg-[var(--chrome)] px-2">
          <div className="rounded-t-md px-3 py-1.5 text-xs text-[var(--muted)]">2026-09 月度经营分析.md</div>
          <div className="rounded-t-md border border-b-0 border-[var(--stroke)] bg-[var(--bg)] px-3 py-1.5 text-xs">宏观消费看板</div>
        </div>

        <main className="flex-1 overflow-auto">
          <div className="mx-auto flex max-w-[1180px] flex-col gap-4 p-6">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h1 className="text-base font-medium">宏观与消费数据看板</h1>
                <p className="mono mt-1 text-[11px] text-[var(--muted)]">数据截至 2026-09 · 更新于 2026-10-12 21:40 · data/macro_2026-10.json</p>
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Segmented value={group} options={['全部', '消费', '价格', '货币']} onChange={setGroup} />
                <Select value={range} options={['近 12 个月', '近 24 个月', '2026 年至今']} onChange={setRange} />
                <Button>插入到笔记</Button>
              </div>
            </div>

            <div className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)]">
              <button onClick={() => setInfoOpen(!infoOpen)} className="flex w-full flex-wrap items-center gap-3 rounded-[10px] px-4 py-2.5 text-left hover:bg-[var(--hover)]">
                <span className="text-xs text-[var(--muted)]">{infoOpen ? '▾' : '▸'}</span>
                <span className="text-xs">数据状态</span>
                <Badge tone="amber">2 项待处理提醒</Badge>
                <Badge tone="red"><Dot c="var(--red)" />1 项需手动操作</Badge>
                <span className="ml-auto flex items-center gap-3 text-[11px] text-[var(--muted)]">
                  {(['fresh', 'aging', 'stale'] as Fresh[]).map((f) => (
                    <span key={f} className="flex items-center gap-1.5"><Dot c={FRESH_COLOR[f]} />{FRESH_LABEL[f]}</span>
                  ))}
                </span>
              </button>
              {infoOpen && (
                <ul className="flex flex-col gap-2 border-t border-[var(--stroke)] px-4 py-3 text-xs">
                  <li className="flex items-center gap-2"><Dot c="var(--red)" />M1 / M2 2026-09 抓取失败，请手动运行 <code className="mono rounded bg-[var(--hover)] px-1">python fetch_pboc.py --month 2026-09</code></li>
                  <li className="flex items-center gap-2"><Dot c="var(--amber)" />CPI 2026-10 预计 2026-10-15 发布，届时需重新生成 JSON</li>
                  <li className="flex items-center gap-2"><Dot c="var(--amber)" />社零 2026-01 / 02 为合并发布，单月值记为缺失</li>
                </ul>
              )}
            </div>

            <div className="grid grid-cols-[repeat(auto-fill,minmax(210px,1fr))] gap-3">
              {list.map((m) => (
                <MetricCard key={m.id} m={m} selected={m.id === sel} onClick={() => setSel(m.id)} />
              ))}
            </div>

            <div className="grid grid-cols-1 gap-3 xl:grid-cols-[1fr_340px]">
              <section className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)] p-5">
                <EconomistChart m={active} />
              </section>
              <section className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)]">
                <div className="px-4 pt-4 pb-3">
                  <div className="mb-2 h-[5px] w-6 bg-[var(--accent)]" />
                  <h2 className="text-[13px] font-bold">分业态零售（限额以上）</h2>
                  <p className="mono text-[11px] text-[var(--muted)]">2026-09，当月同比</p>
                </div>
                <table className="w-full text-xs">
                  <thead>
                    <tr className="border-y border-[var(--stroke)] text-[11px] text-[var(--muted)]">
                      <th className="px-4 py-2 text-left font-normal">业态</th>
                      <th className="px-2 py-2 text-right font-normal">同比</th>
                      <th className="px-2 py-2 text-right font-normal">较上月</th>
                      <th className="px-4 py-2 text-right font-normal">占比</th>
                    </tr>
                  </thead>
                  <tbody>
                    {FORMATS.map((f) => (
                      <tr key={f.name} className="border-b border-[var(--stroke)] last:border-0 hover:bg-[var(--hover)]">
                        <td className="px-4 py-2">{f.name}</td>
                        <td className="mono px-2 py-2 text-right text-[14px]">{f.yoy === null ? <Badge tone="neutral">缺失</Badge> : `${f.yoy.toFixed(1)}%`}</td>
                        <td className="px-2 py-2 text-right"><Delta v={f.d} size={12} /></td>
                        <td className="mono px-4 py-2 text-right text-[var(--muted)]">{f.share.toFixed(1)}%</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </section>
            </div>

            <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
              {['餐饮收入 vs 社零', '核心 CPI vs CPI', 'M1 vs M2'].map((t) => (
                <section key={t} className="rounded-[10px] border border-[var(--stroke)] bg-[var(--card)] p-4">
                  <Wireframe title={t} />
                </section>
              ))}
            </div>

            <StateSpec />
          </div>
        </main>
      </div>
    </div>
  )
}

export default function App() {
  const [mode, setMode] = useState<'深色' | '浅色' | '并排对比'>('深色')
  return (
    <div className="flex h-full flex-col">
      <div data-theme="dark" className="flex items-center gap-3 border-b border-[var(--stroke)] bg-[#141414] px-4 py-2 text-[var(--muted)]">
        <span className="text-[11px]">原型预览 · 主题</span>
        <Segmented value={mode} options={['深色', '浅色', '并排对比']} onChange={setMode} />
      </div>
      <div className="flex min-h-0 flex-1">
        {mode !== '浅色' && <Dashboard theme="dark" />}
        {mode === '并排对比' && <div className="w-px bg-black" />}
        {mode !== '深色' && <Dashboard theme="light" />}
      </div>
    </div>
  )
}
