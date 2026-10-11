# 宏观数据面板 · UI/UX 设计指导

日期：2026-10-11
性质：插件 UI 实现的**视觉基准与翻译规则**。来源：`prototype/mcd-console/`（Figma Make 生成原型的收敛工程）+ [prototype/README.md](../prototype/README.md)。
定位：原型是视觉基准，不进插件构建链；**数值以原型源码为准，不以截图为准**。

---

## 1. 权威来源（单一事实）

原型已收敛到 `prototype/mcd-console/` 单一工程，`src/App.tsx` 仅为导航壳（不含设计信息）。实现某屏前，先读对应权威文件：

| 屏 | 权威文件 |
|---|---|
| 全局原型（含交互状态规范） | `mcd-console/src/screens/Console.tsx` |
| S1 总览仪表盘 | `mcd-console/src/screens/Overview.tsx` |
| S2 单指标详情页 | `mcd-console/src/screens/Detail.tsx` |
| S3 不可用状态 | `mcd-console/src/screens/DetailLimited.tsx` |
| S4a 设置 | `mcd-console/src/screens/Settings.tsx` |
| S4b 首次运行引导 | `mcd-console/src/screens/Onboarding.tsx` |
| S5 发布日历与采集状态 | `mcd-console/src/screens/ReleaseCalendar.tsx` |
| 设计令牌 | `mcd-console/src/index.css`（59 行，唯一令牌定义处） |

本地预览：`cd prototype/mcd-console && npm install && npm run dev`（与插件构建无关）。

## 2. 设计令牌（源码实测值）

出自 `mcd-console/src/index.css`，深浅两套，`data-theme` 切换：

| 令牌 | 深色 | 浅色 | 用途 |
|---|---|---|---|
| `--bg` | `#1e1e1e` | `#ffffff` | 页面背景 |
| `--card` | `#262626` | `#f6f6f6` | 卡片背景 |
| `--stroke` | `rgba(255,255,255,.1)` | `rgba(0,0,0,.1)` | 描边/分隔线 |
| `--text` | `#dcddde` | `#222222` | 正文 |
| `--muted` | `#999999` | `#6e6e6e` | 次要文字 |
| `--accent` | `#4ec9a5` | `#0e8a6a` | 强调绿（唯一强调色） |
| `--amber` | `#d9a441` | `#b7791f` | 语义：临期/待处理 |
| `--red` | `#e05d5d` | `#c94040` | 语义：需手动/失败 |
| `--stale` | `#6b6b6b` | `#b0b0b0` | 语义：过期 |
| `--grid` | `rgba(255,255,255,.1)` | `rgba(0,0,0,.12)` | 图表网格线 |
| `--wire` | `rgba(255,255,255,.28)` | `rgba(0,0,0,.3)` | 叠加序列/线框 |
| `--hover` | `rgba(255,255,255,.04)` | `rgba(0,0,0,.035)` | 悬停底色 |
| `--chrome` | `#1a1a1a` | `#f0f0f0` | 导航/工具栏铬框 |
| `--pop` | `#333333` | `#ffffff` | 浮层（tooltip 等） |

字体与排版规则：

- 字体栈：`-apple-system, 'PingFang SC', 'Microsoft YaHei', …, sans-serif`；等宽 `'SF Mono', 'JetBrains Mono', Menlo, Consolas, monospace`。
- 全部数字用等宽数字：`.num { font-variant-numeric: tabular-nums }`；数值一律 `.mono`。
- 基准字号 13px；卡片当前值 30px bold；Delta 14px（表格内 12px）；badge/tooltip/注释 11px；页面主标题 16px（`text-base font-medium`）。
- 圆角：控件 8px（`rounded-lg`）、卡片 10px（`rounded-[10px]`）。
- 间距节奏：卡片内边距 16px（`p-4`）/ 20px（`p-5`），卡片间 12px（`gap-3`），区块间 16px（`gap-4`）。

## 3. 主题机制与 Obsidian 映射

- 原型用 `data-theme="dark|light"` 包裹实现双主题；插件**不硬编码** Figma 色值，令牌改接 Obsidian 主题变量，仅强调绿与三个语义色（amber/red/stale）由插件自持。
- 映射基准（实现时在 `styles.css` 顶部声明 `.mcd-root` 作用域变量）：

| 原型令牌 | Obsidian 变量 |
|---|---|
| `--bg` | `--background-primary` |
| `--card` | `--background-secondary` |
| `--stroke` | `--background-modifier-border` |
| `--text` | `--text-normal` |
| `--muted` | `--text-muted` |
| `--hover` | `--background-modifier-hover` |
| `--chrome` | `--background-secondary` |
| `--pop` | `--background-primary`（浮层） |

- 令牌一致性由 `tests/tokens.spec.ts` 强制：`styles.css` 必须覆盖 `mcd-console/src/index.css` 声明的全部令牌名，任一侧新增未同步则 `npm test` 失败。

## 4. 交互状态规范（全局规则）

出自 `Console.tsx` 的 StateSpec，所有交互组件统一：

| 状态 | 规则 |
|---|---|
| 默认 | `--card` 底 + `--stroke` 描边，文字 `--muted` |
| 悬停 | 描边加深（`color-mix(--text 30%, transparent)`）+ 底色 `--hover` 微亮 |
| 选中 | `--accent` 描边，或 `--accent` 14% 底色 + accent 文字（分段器选中项加 `font-medium`）；卡片选中额外加 `inset 0 2px 0 --accent` 顶部内嵌线 |
| 聚焦 | `focus-visible: ring-1 --accent`（键盘可达） |
| 禁用 | `opacity-40` + `cursor-not-allowed`，不响应悬停 |
| 未接入（卡片级） | 虚线描边 + `opacity-50` + 数值显示 `—` + 底部"未接入"说明 |

## 5. 组件规范

实现时将下列组件翻译为 `styles.css` 的 `.mcd-*` 类 + TS 模块（不用 React、不用 Tailwind）：

| 组件 | 关键规格 |
|---|---|
| **MetricCard** | 卡片布局：首行 = 指标名（12px muted，truncate）+ 右侧数据期+新鲜度点（hover 出 tooltip：`{新鲜度标签} · 下次发布 {日期}`）；第二行 = 30px bold mono 当前值 + `%` 单位 + "同比"小字；底行（上边框分隔）= "较上期" + Delta。选中态见 §4 |
| **Delta** | `↑/↓/→ {abs值.toFixed(1)}%`，mono；null 显示 `—`（muted）。注意：率的差值语义应为 pct，见 §9 待裁决 #3 |
| **Dot** | 6px 圆点（size-1.5），颜色即新鲜度/语义 |
| **Badge** | 11px 描边胶囊，描边 = 语义色 40% 透明，文字 = 语义色；tone：amber（待处理）/ red（需手动）/ neutral（缺失） |
| **Segmented** | 容器 `rounded-lg + stroke + card` 底 + `p-0.5`；选项 `px-3 py-1 text-xs`；支持 `disabled[]` 数组置灰个别项 |
| **Select** | 高 30px，`rounded-lg`，悬停描边加深、聚焦 accent 描边 |
| **Button** | 高 30px，`px-3 text-xs`；悬停 = 描边与文字转 accent；选中 = accent 描边 + 14% 底 |
| **Tip（tooltip）** | 悬停触发（CSS `group-hover`，无 JS 定位库）；`--pop` 底 + stroke 边 + 11px 文字，锚定元素上方右对齐 |
| **Sparkline** | 24 个月迷你折线（Overview.tsx）：缺失期画虚线段不跨接，端点圆点，过期态整体降透明度 |
| **EconomistChart（主图规范）** | 顶部 6×32px accent 色条 + 15px bold 标题 + 单位副标题；仅水平网格线，数值标签居右、位于线上方，基线加粗为 `--text`；主线 `--accent` 2.5px，叠加序列 `--wire` 1.5px 虚线（4 3）；最新值端点 3px 实心圆；x 轴短刻度 4px，年份仅在每年 1 月显示完整 `YYYY-MM`，其余 `MM`；图下 figcaption：`来源：{数据源}`。实现时以 ECharts 等价配置替换，保留上述视觉规则 |
| **Wireframe** | 图表不可用时的兜底态（线框示意 + 来源行），可保留为空态组件 |
| **数据状态条** | 可折叠 card：首行 = 折叠箭头 + "数据状态" + amber/red badge 计数 + 右侧三态图例；展开 = 逐条提醒列表（Dot + 文案 + 行内 code 命令），失败项给可执行命令 |
| **数据表格** | 表头 11px muted 无加粗；数值列右对齐 mono；行悬停 `--hover`；缺失单元格用 neutral Badge"缺失"，不填 0；同比列 14px 突出 |

## 6. 数据诚实性展示规则（不可妥协）

- **断线**：数据缺失处折线中断，不跨点连线；缺失期画竖虚线 + "缺失"标签 + 底部 hover 色带（见 EconomistChart 缺失标记）。
- **双时间戳**：每条数据同时展示数据期与更新时间（页面级元信息行：`数据截至 {期} · 更新于 {时间} · {文件名}`）。
- **来源标注**：每张图/表带 figcaption 来源；原型占位图必须注明"线框占位，非真实数据"。
- **手动数据**：badge 标注"手动"。
- **春节合并**：显示层合并 1–2 月时必须带文字注释条（浅琥珀底）说明口径。
- **新鲜度三态**：Dot 颜色 fresh=`--accent` / aging=`--amber` / stale=`--stale`；标签文案见 §9 待裁决 #2。
- **失败不静默**：置灰 + 原因 tooltip（统一文案模板，v0.1 §5）；数据状态条列出待处理项与可执行命令。
- **表格缺失**：用 Badge"缺失"，绝不填 0 或留空白。

## 7. 布局骨架（每屏一句话）

- **Console（全局）**：左侧 44px 图标铬栏 → 顶部标签铬栏 → 内容区居中 `max-w-1180px p-24px`：页头（标题+元信息+筛选控件）/ 数据状态条 / 卡片网格 `auto-fill minmax(210px,1fr) gap-12` / 主图+右栏表格（`xl: 1fr 340px`）/ 三联 Wireframe / 交互状态规范。
- **Overview（S1）**：按分组纵向排列的卡片网格，每卡含 sparkline。
- **Detail（S2）**：页头（指标名+元信息）→ 可折叠解读条 → 工具栏（模式/图型/变换/范围分段器 + 叠加下拉）→ 主图 → 注释条 → 数据表。
- **DetailLimited（S3）**：与 S2 同构，重点表达置灰 + 原因 tooltip + 兜底横幅。
- **Settings（S4a）**：560px 弹窗，分区"数据 / 默认视图 / 图表显示 / 关于"。
- **Onboarding（S4b）**：居中空状态：标题 + 三步引导 + 主/次按钮；含校验失败变体。
- **ReleaseCalendar（S5）**：横向日历时间线（状态点：已采集绿勾/待采集琥珀/轮询中蓝点虚线/超时红点）+ 采集状态列表（五列，失败行浅红底）。

## 8. 实现翻译规则

1. **Tailwind → CSS 类**：原型的 Tailwind 任意值 class 人工翻译为 `styles.css` 的 `.mcd-*` 类；间距/圆角/色值按 §2 令牌，不逐个内联。
2. **数值以源码为准**：实现与原型有出入时，以 `mcd-console/src/` 源码为准，不以截图为准；截图仅用于整体核对。
3. **图表**：以 ECharts 实现（G6 决策），对齐 §5 EconomistChart 视觉规则（网格、色线、断线、端点、图例、来源）；`Wireframe` 保留为图表不可用兜底。
4. **令牌门禁**：`tests/tokens.spec.ts` 校验两侧令牌名一致（§3）。
5. **组件作用域**：所有类名加 `mcd-` 前缀，避免污染 Obsidian 全局样式；颜色不得硬编码，必须走令牌。

## 9. 待裁决项（G 类，实现前须用户定夺）

| # | 事项 | 原型现状 | 文档口径 | 建议 |
|---|---|---|---|---|
| 1 | 分组口径 | Console segmented：全部/消费/价格/货币 | 提示词 S1：全国大势/本地上海/本地成都/辅助 | 二选一后统一 manifest 分组字段 |
| 2 | 新鲜度文案 | `最新 / 临近更新 / 已过期` | `新鲜 / 临期 / 过期` | 统一到一套，落在单一常量（D8） |
| 3 | 变化量单位 | `↑ 0.7%` | 率差应为 `pct` | Delta 对"同比的差值"输出 pct，避免口径歧义 |
| 4 | 占位数值 | Console：社零 3.4%、CPI 0.4% | 提示词 §4 素材库：3.8%、0.6% | 统一到素材库；正式数据由 ETL 产出后自然替代 |
| 5 | 页面标题 | 「宏观数据看板」/「Macro Data Dashboard」混用 | — | 定中文单标题 |

以上均不改数据契约，按 [开发计划](宏观数据面板_开发计划_v1.0.md) §3.2 G 类流程处理。
