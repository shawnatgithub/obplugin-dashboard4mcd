import { useState, type ReactNode } from 'react'

function Section({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="border-t border-[var(--stroke)] px-6 py-5 first:border-t-0">
      <h3 className="mb-3.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-[var(--muted)]">{title}</h3>
      <div className="space-y-4">{children}</div>
    </section>
  )
}

function Radios({ label, options, value, onChange }: { label: string; options: string[]; value: string; onChange: (v: string) => void }) {
  return (
    <div className="flex items-center justify-between gap-4">
      <span className="text-[13px] text-[var(--text)]">{label}</span>
      <div role="radiogroup" className="flex gap-4">
        {options.map((o) => (
          <label key={o} className="flex cursor-pointer items-center gap-1.5 text-[13px] text-[var(--text)]">
            <input type="radio" className="sr-only" checked={value === o} onChange={() => onChange(o)} />
            <span className={`grid size-3.5 place-items-center rounded-full border ${value === o ? 'border-[var(--accent)]' : 'border-[var(--wire)]'}`}>
              {value === o && <span className="size-1.5 rounded-full bg-[var(--accent)]" />}
            </span>
            {o}
          </label>
        ))}
      </div>
    </div>
  )
}

function Toggle({ label, note, on, onChange }: { label: string; note?: string; on: boolean; onChange: (v: boolean) => void }) {
  return (
    <div className="flex items-start justify-between gap-4">
      <div>
        <div className="text-[13px] text-[var(--text)]">{label}</div>
        {note && <div className="mt-0.5 text-[11.5px] text-[var(--muted)]">{note}</div>}
      </div>
      <button
        role="switch"
        aria-checked={on}
        onClick={() => onChange(!on)}
        className={`relative mt-0.5 h-[18px] w-8 shrink-0 rounded-full transition-colors ${on ? 'bg-[var(--accent)]' : 'bg-[var(--wire)]'}`}
      >
        <span className={`absolute top-[2px] size-[14px] rounded-full bg-white transition-all ${on ? 'left-[16px]' : 'left-[2px]'}`} />
      </button>
    </div>
  )
}

export default function Settings() {
  const [range, setRange] = useState('3yr')
  const [chart, setChart] = useState('Line')
  const [markers, setMarkers] = useState(true)
  const [cny, setCny] = useState(true)
  return (
    <div className="grid min-h-[calc(100vh-41px)] place-items-center bg-black/50 p-8">
      <div className="w-[560px] overflow-hidden rounded-xl border border-[var(--stroke)] bg-[var(--bg)] shadow-2xl shadow-black/60">
        <header className="flex items-center justify-between border-b border-[var(--stroke)] px-6 py-4">
          <h2 className="text-[15px] font-semibold text-[var(--text)]">Settings</h2>
          <button aria-label="Close" className="rounded-md p-1 text-[var(--muted)] hover:bg-[var(--hover)] hover:text-[var(--text)]">
            <svg width="14" height="14" viewBox="0 0 14 14" stroke="currentColor" strokeWidth="1.5"><path d="M3 3l8 8M11 3l-8 8" /></svg>
          </button>
        </header>

        <Section title="Data">
          <div>
            <div className="mb-1.5 flex items-center justify-between">
              <label className="text-[13px] text-[var(--text)]">Data directory</label>
              <span className="flex items-center gap-1.5 rounded-full bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] px-2 py-0.5 text-[11px] font-medium text-[var(--accent)]">
                <span className="size-1.5 rounded-full bg-[var(--accent)]" />
                Connected · 12 metrics available
              </span>
            </div>
            <input
              defaultValue="/Users/gm/MacroData"
              className="w-full rounded-md border border-[var(--stroke)] bg-[var(--card)] px-3 py-2 font-mono text-[12.5px] text-[var(--text)] outline-none focus:border-[var(--accent)]"
            />
            <button className="mt-2.5 rounded-md border border-[var(--stroke)] px-3 py-1.5 text-xs text-[var(--text)] hover:bg-[var(--hover)]">Re-detect</button>
          </div>
        </Section>

        <Section title="Default View">
          <Radios label="Default range" options={['1yr', '3yr', '5yr']} value={range} onChange={setRange} />
          <Radios label="Default chart type" options={['Line', 'Bar', 'Area', 'Table']} value={chart} onChange={setChart} />
        </Section>

        <Section title="Chart Display">
          <Toggle label="Show missing data markers" on={markers} onChange={setMarkers} />
          <Toggle label="Merge Jan–Feb for Chinese New Year" note="Affects display only; does not alter data." on={cny} onChange={setCny} />
        </Section>

        <Section title="About">
          <dl className="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-[13px]">
            <dt className="text-[var(--muted)]">Data contract version</dt>
            <dd className="font-mono text-[12px] text-[var(--text)]">indicator_series_v1</dd>
            <dt className="text-[var(--muted)]">Plugin version</dt>
            <dd className="font-mono text-[12px] text-[var(--text)]">0.1.0</dd>
          </dl>
          <p className="rounded-md bg-[var(--card)] px-3 py-2.5 text-[12px] leading-relaxed text-[var(--muted)]">
            This plugin reads local data only; no internet connection or data collection.
          </p>
        </Section>
      </div>
    </div>
  )
}
