MCD工作台开发笔记

参考案例
① 宏观专用开源项目（学业务逻辑）
• econdash：核心理念是"少而精的指标策展"——只挑经济学家共识的约 20 个指标做一页速览，而不是堆数据
https://econdash.org/
★★★
• DBnomics 宏观展望看板："概览 → 国家深度 → 指标对比 → 相关性 → 数据表"的五页结构，可直接套用到"全国概览 → 城市深度 → 指标对比"
https://db.nomics.world/
★
• Riley Log 自动化看板：GitHub Actions 定时 ETL + 预计算衍生指标 + 插件只渲染本地文件的架构，非常适合 Obsidian 离线场景
https://rileylog.com/ 
★★★★
② 商用产品（学界面范式）
• FRED：单指标详情页是行业标准——时间范围切换（1Y/5Y/MAX）、频率转换、同比/环比计算是刚需
https://fred.stlouisfed.org/
★★★
• Trading Economics：经济日历（发布日期 + 预期/实际值 + 重要性），契合"跟踪"场景

• YCharts Dashboard：模块自由组合的看板 + 预置模板（你可以做"零售商业地产模板"开箱即用）
https://ycharts.com/dashboard/
必须注册，看怎么绕来看看
③ 通用开源 BI（学图表体系）
• Grafana：KPI 卡片（大字数值 + sparkline + 阈值配色）是宏观监控的最佳范式；模板变量切换城市很有用
是一个dashboard模板网站，类似于ppt模板网站
https://grafana.com/grafana/dashboards/
• Superset：Dataset + 命名指标的轻量语义层 → 对应你的"指标注册表"
https://superset.apache.org/
★★★★ 
一个开源的仪表盘模板，git地址：https://github.com/apache/superset
• Metabase：默认样式"不调参就好看"
https://www.metabase.com/
另外一个开源的数据分析和展示应用，还附带分析、报告工作流
★★★★
④ Obsidian 生态（学技术路线）
• 图表库强烈建议 ECharts（双轴、dataZoom、markLine 标注政策事件、热力图都是宏观刚需；Chart.js 吃力）
• 关键参考：obsidian-echarts（图表点击跳转笔记——这是区别于一切外部 BI 的杀手锏）、SQLSeal Charts（本地 CSV → SQL → ECharts 管道）、Tracker（声明式配置块语法）
待整理的调研内容
好的，我直接在 GitHub 方向做几轮深度搜索（英文 + 中文关键词 + GitHub topic 页），有发现就给你链接。
深度搜索完成。GitHub 上确实已经有一个活跃的生态，确认有不少开发者在做"宏观数据搜集 + 展示"这件事。以下是按相关度整理的结果和链接：
一、最接近你目标的成熟项目（可直接抄架构）
1. space-lumps/macro-financial-indicators ⭐ 强烈推荐
https://github.com/space-lumps/macro-financial-indicators
这个和你的设想架构上几乎同构：Python 脚本从 FRED 拉数 → GitHub Actions 每日定时更新 → 数据落成 JSON 静态文件 → Chart.js 前端渲染，部署在 GitHub Pages 零成本运行。图表带"该指标对市场意味着什么"的说明文字。MIT 协议。
在线演示：https://space-lumps.github.io/macro-financial-indicators/
2. tduic/macro-dashboard
https://github.com/tduic/macro-dashboard
FastAPI + React/Vite/Tailwind 的本地全栈宏观看板。它的卡片设计（IndicatorCard + Sparkline + PercentileBar + 异常值 ±2σ 检测 + "数据距今 X 天"的新鲜度标记）是同类项目里交互设计最用心的，测试也很完整（93 个后端测试 + 70 个前端测试）。
3. bbrigmga/macro-dashboard
https://github.com/bbrigmga/macro-dashboard
Streamlit + FRED + Yahoo Finance，有集中式指标注册表（indicator_registry.py）——"指标定义与展示分离"的做法可以直接借鉴到你的插件设计里。还带预警信号（warning signals）和 Z-score 热力表。
4. wzx11223344/econ-dashboard（中文）
https://github.com/wzx11223344/econ-dashboard
六国宏观对比看板（Streamlit），数据源组合是 World Bank + FRED + akshare（中国数据），五页结构（概览/国家深度/指标对比/相关性/数据浏览）。
二、数据搜集层的成熟基础设施（你做插件绕不开）
5. akfamily/akshare — 中国宏观+财经数据事实标准，star 数万的活跃项目
https://github.com/akfamily/akshare
社零、CPI、GDP、PMI、社融、利率全有，一行代码取数。注意它是 Python 库，Obsidian 插件不能直接调，但它配套的 AKTools（https://github.com/akfamily/aktools）可以把 akshare 包成 HTTP API，这样你的 TypeScript 插件就能直接 fetch 中国数据了——这是很关键的一条路。
6. OpenBB — 开源版 Bloomberg，64k+ star
https://github.com/OpenBB-finance/OpenBB
宏观数据（GDP/CPI/利率）统一访问层，支持 MCP Server 供 AI 调用。
7. JovaniPink/awesome-economic-data ⭐ 对你极有用
https://github.com/JovaniPink/awesome-economic-data
精心策划的经济数据源目录，按主题分类（价格通胀/消费与出行/物流货运/复合追踪指数…），每个源都带方法论说明和获取限制——做零售商业地产指标选品时这是现成的参考书。其中有大量消费高频数据（OpenTable 就餐指数、TSA 出行人数、Visa 消费动能指数等），正是商业地产业务逻辑需要的。
三、值得关注的趋势：MCP 化（2026 年的新动向）
宏观数据的消费方式正在向 MCP（Model Context Protocol）迁移，说明这个需求被大量 AI 开发者关注：
FRED 官方 MCP 客户端（约 80 万条时间序列）：https://github.com/modelcontextprotocol/servers/tree/main/src/fred
EconomyOS（开源经济情报平台，Next.js + NestJS）：https://github.com/topics/economic-data 下可找到
GitHub topic economic-data 下已有 371 个仓库、topic macoreconomics 下 76 个（R 语言方向）。
四、灵感入口（持续刷新的 topic 页）
https://github.com/topics/macro-dashboard
https://github.com/topics/economic-data
https://github.com/topics/macroeconomic-indicators
https://github.com/topics/macro-research
诚实的前提说明
要如实告诉你两点：① 这个生态 90% 是 Python（Streamlit/FastAPI），TypeScript/Obsidian 方向的宏观 dashboard 插件目前没人做——这既是空白也是机会；② 搜索中没有发现针对"零售商业地产"垂直场景的现成开源项目，宏观 dashboard 几乎都面向加密/美股/外汇投资场景，商业地产指标体系（空置率、租金、客流）确实需要自己策展。
对你的插件而言，结论性建议是参考 #1 的"定时脚本 + 本地 JSON + 前端渲染"分层架构，用 #7 做指标选品，用 #5 的 AKTools HTTP 模式解决中国数据源问题。
我可以把上面这些仓库里可借鉴的部分（如 #3 的指标注册表设计、#2 的卡片交互）提炼成一份具体的插件数据结构设计，要我做吗？