# MCD 原型基准（去重后）

本目录原先有 6 个 Figma Make 独立工程，同一份文件最多重复 6 次。设计信息已收敛到单一工程 `mcd-console/`，作为唯一权威来源。

6 个原始目录仍原样保留在工作区（尚未删除），仅作导出存档。删除与否需人工确认，确认后本表「原出处」一列改为只指向 git 历史。

## 权威归属

| 屏 | 对应提示词 | 权威文件 | 原出处 |
|---|---|---|---|
| 全局原型（含交互状态规范） | §1 / §2 / S1 变体 | `mcd-console/src/screens/Console.tsx` | `MCD 全局原型/src/App.tsx` |
| S1 总览仪表盘 | S1 | `mcd-console/src/screens/Overview.tsx` | `MCD 总览仪表盘/src/App.tsx` |
| S2 单指标详情页 | S2 | `mcd-console/src/screens/Detail.tsx` | `MCD 单指标详情页/src/App.tsx` |
| S3 不可用状态 | S3 | `mcd-console/src/screens/DetailLimited.tsx` | 同名文件 ×3，内容一致 |
| S4a 设置 | S4 第一屏 | `mcd-console/src/screens/Settings.tsx` | 同名文件 ×2，内容一致 |
| S4b 首次运行引导 | S4 第二屏 | `mcd-console/src/screens/Onboarding.tsx` | 同名文件 ×2，内容一致 |
| S5 发布日历与采集状态 | S5 | `mcd-console/src/screens/ReleaseCalendar.tsx` | 同名文件（唯一副本） |

`mcd-console/src/App.tsx` 是新写的导航壳，可在一屏内切换上述 7 屏与深浅主题。它不含设计信息，只做路由与 `data-theme` 包裹，改动它不影响视觉规格。

各原始目录下的 `src/App.tsx` 是 Figma 为每屏自动生成的导航壳，内容互不相同但设计信息都在屏组件里，因此**未纳入**权威表；原始目录整体保留为存档，不作为修改对象。

## 重复文件清单（按内容哈希核对）

下列文件原先每个目录各一份且内容完全相同，现在 `mcd-console/` 里是权威版本：

`src/index.css`（设计令牌，59 行，×6）、`package.json`（×6）、`tsconfig.json`（×6）、`vite.config.ts`（×6）、`index.html`（×6）、`src/main.tsx`（×6）、`src/vite-env.d.ts`（×6）、`public/favicon.svg`（×6）、`.figma/make/*`（各 ×6）、`src/screens/DetailPrototype.tsx`（×5，496 行）、`src/screens/DetailLimited.tsx`（×3，251 行）、`src/screens/Settings.tsx`（×2）、`src/screens/Onboarding.tsx`（×2）。

原始 6 个目录共有 158 个入库文件；`mcd-console/` 用 29 个文件承载同一套设计信息，其中仅 `src/App.tsx`（导航壳）是新写的。

未随迁的文件：各目录的 `AGENTS.md` / `CLAUDE.md`（Figma Make 自动生成的 Agent 说明，与视觉无关，仓库根 `AGENTS.md` 已覆盖插件侧规则）。

## 与插件实现的关系

原型是**视觉基准**，不进插件构建链：

- `prototype/mcd-console/node_modules/`、`dist/`、`.vite/` 不入库（该目录自带 `.gitignore`）。
- 插件不用 React、不用 Tailwind。原型的 Tailwind 任意值 class 需人工翻译成 `styles.css` 里的 `.mcd-*` 类；数值以原型源码为准，不以截图为准。
- 色彩令牌在 `styles.css` 中改接 Obsidian 主题变量（`--background-primary` 等），不硬编码 Figma 色值；只有强调绿与三个语义色由插件自持。依据 `docs/宏观数据面板_Figma原型提示词.md` §6。
- 原型的图表区（`EconomistChart` / `Wireframe`）是 SVG 线框、非真实数据，实现时替换为 ECharts；`Wireframe` 可保留为图表不可用时的兜底态。

令牌一致性由 `tests/tokens.spec.ts` 校验：`styles.css` 必须覆盖 `mcd-console/src/index.css` 声明的全部令牌名。两边任一侧新增令牌而未同步时，`npm test` 失败。

## 本地预览（可选）

原型工程可独立跑起来自查，与插件构建无关：

```bash
cd prototype/mcd-console && npm install && npm run dev
```

`vite.config.ts` 里的 `.figma/make/*` 插件是 Figma 预览所需，本地 `npm run dev` 直接可用。

## 已知待裁决项（原型与文档冲突，需人工定夺）

1. 分组口径：提示词 S1 用「全国大势 / 本地上海 / 本地成都 / 辅助指标」，`Console.tsx` 用「全部 / 消费 / 价格 / 货币」segmented。影响 manifest 是否需要 group 字段。
2. 新鲜度文案：文档「新鲜 / 临期 / 过期」vs 代码 `FRESH_LABEL`「最新 / 临近更新 / 已过期」。
3. 变化量单位：文档「↓0.3pct」vs `Console.tsx` 的 `Delta` 组件输出「↑ 0.7%」。率的差值应为 pct。
4. 占位数值：`Console.tsx` 内 METRICS（社零 3.4%、CPI 0.4%）与提示词 §4 素材库（社零 3.8%、CPI 0.6%）不一致，建议统一到 §4。
5. 页面标题：原型有「宏观数据看板」与「Macro Data Dashboard」两种（后者见 `Onboarding.tsx`，整屏英文文案），需定中文稿。

以上均不改数据契约，属 G 类，按 `docs/宏观数据面板_开发计划_v1.0.md` §3.2 处理。
