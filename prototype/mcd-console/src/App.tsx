import { useState } from 'react'
import Console from './screens/Console'
import Overview from './screens/Overview'
import Detail from './screens/Detail'
import DetailLimited from './screens/DetailLimited'
import Settings from './screens/Settings'
import Onboarding from './screens/Onboarding'
import ReleaseCalendar from './screens/ReleaseCalendar'

type Theme = 'dark' | 'light'

// 屏清单对应 docs/宏观数据面板_Figma原型提示词.md 的 S1–S5。
// 本壳只做导航与主题切换，不含设计信息；设计规格一律看各屏文件。
const SCREENS: { id: string; label: string; doc: string; render: (theme: Theme) => React.ReactNode }[] = [
  { id: 'console', label: '全局原型', doc: '§1 全局上下文', render: () => <Console /> },
  { id: 'overview', label: 'S1 总览仪表盘', doc: '提示词 S1', render: (t) => <Screen theme={t}><Overview /></Screen> },
  { id: 'detail', label: 'S2 单指标详情', doc: '提示词 S2', render: (t) => <Screen theme={t}><Detail /></Screen> },
  {
    id: 'limited',
    label: 'S3 受限态',
    doc: '提示词 S3',
    render: (t) => (
      <Screen theme={t}>
        <DetailLimited allOff={false} />
      </Screen>
    ),
  },
  {
    id: 'limited-all-off',
    label: 'S3b 全部不可用',
    doc: '提示词 S3 兜底变体',
    render: (t) => (
      <Screen theme={t}>
        <DetailLimited allOff />
      </Screen>
    ),
  },
  { id: 'settings', label: 'S4a 设置', doc: '提示词 S4', render: (t) => <Modal theme={t}><Settings /></Modal> },
  { id: 'onboarding', label: 'S4b 首次运行', doc: '提示词 S4', render: (t) => <Screen theme={t}><Onboarding /></Screen> },
  {
    id: 'onboarding-failed',
    label: 'S4c 校验失败',
    doc: '提示词 S4 变体',
    render: (t) => <Screen theme={t}><Onboarding failed /></Screen>,
  },
  { id: 'calendar', label: 'S5 发布日历', doc: '提示词 S5', render: (t) => <Screen theme={t}><ReleaseCalendar /></Screen> },
]

// 单屏外壳：只提供主题与画布底色，尺寸仍由屏内自身声明
function Screen({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="min-h-full bg-[var(--chrome)]">
      {children}
    </div>
  )
}

// 设置屏在原型里是弹窗（560px），实现时改用 Obsidian 原生 SettingTab；
// 这里保留弹窗版式仅供对照
function Modal({ theme, children }: { theme: Theme; children: React.ReactNode }) {
  return (
    <div data-theme={theme} className="flex min-h-full items-start justify-center bg-[var(--chrome)] p-8">
      <div className="w-[560px] rounded-[12px] border border-[var(--stroke)] bg-[var(--card)]">{children}</div>
    </div>
  )
}

export default function App() {
  const [screen, setScreen] = useState('console')
  const [theme, setTheme] = useState<Theme>('dark')
  const active = SCREENS.find((s) => s.id === screen)!

  return (
    <div className="flex h-full flex-col">
      <div data-theme="dark" className="flex flex-wrap items-center gap-2 border-b border-[var(--stroke)] bg-[var(--chrome)] px-4 py-2 text-[var(--muted)]">
        <span className="mr-1 text-[11px]">MCD 原型基准</span>
        {SCREENS.map((s) => (
          <button
            key={s.id}
            onClick={() => setScreen(s.id)}
            className={`rounded-md px-2.5 py-1 text-xs ${s.id === screen ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]' : 'hover:text-[var(--text)]'}`}
          >
            {s.label}
          </button>
        ))}
        <div className="ml-auto flex items-center gap-2">
          <span className="text-[11px]">主题</span>
          {(['dark', 'light'] as Theme[]).map((t) => (
            <button
              key={t}
              onClick={() => setTheme(t)}
              className={`rounded-md px-2.5 py-1 text-xs ${t === theme ? 'bg-[color-mix(in_srgb,var(--accent)_14%,transparent)] text-[var(--accent)]' : 'hover:text-[var(--text)]'}`}
            >
              {t === 'dark' ? '深色' : '浅色'}
            </button>
          ))}
          <span className="text-[11px]">· {active.doc}</span>
        </div>
      </div>
      <div className="min-h-0 flex-1">{active.render(theme)}</div>
    </div>
  )
}
