# M0 阶段 1：环境引导与仓库骨架 · 实施计划

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 建立 MacroDataETL 仓骨架与两个隔离的 Python 虚拟环境，并用真实运行的冒烟证据决定 M0 ETL 跑在 pandas 2 还是 pandas 3 上。

**Architecture:** ETL 仓是独立交付物，位于 vault 与插件仓之外（`D:\Codex\MacroDataETL`），自带 git。两个 venv 也在仓库外（`D:\Codex\venv-pandas2`、`D:\Codex\venv-akshare`），因此仓库靠两份 `requirements-*.txt` 锁文件保证可复现。所有目录解析集中在 `etl/paths.py`（单一事实源），所有入口第一行过 `tools/assert_env.py`（激活门禁），使「用错环境」在启动瞬间就失败而不是产出错数据。

**Tech Stack:** Python 3.14.8、`python -m venv`、pip、akshare 1.19.1、pandas 2.3.3 / 3.0.6、pytest、ruff、python-dotenv。

**Spec:** [docs/superpowers/specs/2026-10-11-m0-contract-and-validation-gate-design.md](../specs/2026-10-11-m0-contract-and-validation-gate-design.md) —— 本计划实现其 §4.1、§4.3、§4.4、§4.5、§7.9、§14 第 13 条。执行者须同时读 spec 与本计划；冲突时以 spec 为准。

## Global Constraints

以下每条都逐字来自 spec / v0.1，**每个任务的要求都隐含包含本节**：

- **解释器**：Python 3.14.8，本机唯一解释器。真实安装位于 `C:\Users\Pandora\AppData\Local\Python\pythoncore-3.14-64\`；`WindowsApps\python.exe` 与 `py.exe` 是其应用执行别名。无 conda / mamba / uv，只能用 `python -m venv` 创建环境。
- **双环境版本锁（G29）**：环境A `D:\Codex\venv-pandas2` = `akshare==1.19.1` + `pandas==2.3.3` + `pytz==2026.5` + `numpy==2.5.4`；环境B `D:\Codex\venv-akshare` = `akshare==1.19.1`，pandas **不设上界**（预期 3.0.6）。
- **两环境的包永不交叉安装（G30）**。任何 `pip install` 之前必须先经 `tools/assert_env.py` 确认当前身处哪个环境。
- **Windows 必须 `PYTHONUTF8=1`**。实测依据：pip 输出含中文时在 cp1252 控制台抛 `UnicodeEncodeError` 崩溃（spec §16）。漏设会让定时任务静默失败，违反产品简介 §7 规则 4。
- **所有脚本入口执行 `sys.stdout.reconfigure(encoding="utf-8")`**；所有 `.bat` 文件设 `set PYTHONUTF8=1`（spec §7.9）。
- **换行规则（v0.1 §6.1，逐字）**：`*.py text eol=lf`、`*.yaml text eol=lf`、`*.json text eol=lf`、`*.sh text eol=lf`、`*.bat text eol=crlf`。
- **代码只用相对路径和 `pathlib`；不写死 `C:\...`、`/Users/...`**（v0.1 §6.1）。机器相关值只从 `.env` 读。
- **数据落位（G13，用户已明确确认）**：只有 `processed/` 与 `signals/` 落 vault（`DATA_ROOT`）；`raw/`、`probe/`、`logs/` 留 ETL 仓内，**不入 Git、不进 vault**。
- **限速（G23）**：请求间隔 3 秒、超时 30 秒、最多重试 2 次、指数退避。任何真实抓取都受此约束。
- **验证金字塔自下而上，L2/L3 不可跳过**（手册 §2）。L0 = `ruff check . && ruff format --check .`；L1 = `<py> -m pytest`。任何一层失败，修复后重跑该层及以上。
- **不猜端点（D10）**：禁止硬编码未经发现的 akshare 函数名。冒烟脚本必须先按关键词发现候选，再取可调用者。
- **失败不掩盖原始异常（D2）**、**错误消息给出完整因果链（D5）**、**区分「操作失败」与「环境不支持」（D3）**。
- **没有失败的测试就不写实现代码（D6）**；**变更最小化（D7）**；**单一事实源（D8）**；**可重入且幂等（D9）**。
- **提交格式**：Conventional Commits + `Agent-Task` / `Agent-Decision` / `Agent-Limitation` trailers。**`Agent-Model` 一律省略**（模型身份不得披露，系统约束优先于技能规范）。提交信息用英文（沿用仓库既有历史，同时规避 PowerShell→git 的编码风险）。
- **PowerShell 注意**：不支持 `&&` 作语句分隔符，用 `;`。git 把进度写 stderr，PowerShell 会误报 `NativeCommandError`——**必须用后续命令核实真实结果**，不能只看退出码。
- **沙箱**：`D:\Codex\MacroDataETL`、`D:\Codex\venv-pandas2`、`D:\Codex\venv-akshare` 均在工作区之外，创建它们的命令需要越出沙箱写权限（`required_permissions='all'`）。

---

## 文件结构

本阶段创建的文件及各自唯一职责：

| 文件 | 职责 |
|---|---|
| `D:\Codex\MacroDataETL\.gitattributes` | 固定换行规则，保证 Windows 开发 / macOS 运行一致 |
| `D:\Codex\MacroDataETL\.gitignore` | 排除 `.env`、`data/`、`logs/`、缓存目录 |
| `D:\Codex\MacroDataETL\pyproject.toml` | ruff（L0）与 pytest（L1）的唯一配置点 |
| `D:\Codex\MacroDataETL\.env.example` | 机器相关键的清单与说明（不含真实值） |
| `D:\Codex\MacroDataETL\.env` | 本机真实值，不入 Git |
| `D:\Codex\MacroDataETL\requirements-pandas2.txt` | 环境A 完整锁定集（`pip freeze` 产物） |
| `D:\Codex\MacroDataETL\requirements-akshare.txt` | 环境B 完整锁定集（`pip freeze` 产物） |
| `D:\Codex\MacroDataETL\etl\__init__.py` | 使 `etl` 可被 pytest 以 `pythonpath=["."]` 导入 |
| `D:\Codex\MacroDataETL\etl\paths.py` | **数据根目录的唯一解析点**（G12/D8） |
| `D:\Codex\MacroDataETL\tools\__init__.py` | 使 `tools` 可导入 |
| `D:\Codex\MacroDataETL\tools\assert_env.py` | 激活门禁：校验 `sys.prefix`（G30） |
| `D:\Codex\MacroDataETL\tools\smoke_env.py` | 双环境运行期冒烟判定（退出标准 #13） |
| `D:\Codex\MacroDataETL\run_etl.py` | 入口骨架，第一行过门禁 |
| `D:\Codex\MacroDataETL\run_etl.bat` | Windows 入口，硬编码 `MCD_PYTHON`，不依赖 `activate` |
| `D:\Codex\MacroDataETL\run_etl.sh` | macOS 入口（M4 才真正使用，此处仅占位并保留可执行位） |
| `D:\Codex\MacroDataETL\tests\test_paths.py` | `paths` 的单测，含缺配置报错断言 |
| `D:\Codex\MacroDataETL\tests\test_assert_env.py` | 门禁正反用例 + 子进程退出码 |
| `D:\Codex\MacroDataETL\tests\test_smoke_env.py` | 发现逻辑的纯函数单测（不触网） |

`etl/core.py`、`registry_io.py`、`normalize.py`、`validate.py`、`capabilities.py`、`export.py`、`fetchers/`、`schemas/`、`registry/`、`tests/golden/` **不在本阶段创建**——它们属阶段 2/3，此处只建空目录占位会误导，故不建。

---

### Task 1: 创建 ETL 仓骨架

**Files:**
- Create: `D:\Codex\MacroDataETL\.gitattributes`
- Create: `D:\Codex\MacroDataETL\.gitignore`
- Create: `D:\Codex\MacroDataETL\pyproject.toml`
- Create: `D:\Codex\MacroDataETL\.env.example`
- Create: `D:\Codex\MacroDataETL\etl\__init__.py`
- Create: `D:\Codex\MacroDataETL\tools\__init__.py`
- Create: `D:\Codex\MacroDataETL\tests\__init__.py`

**Interfaces:**
- Consumes: 无（起始任务）
- Produces: 一个已 `git init` 的仓库；`pyproject.toml` 中的 `[tool.pytest.ini_options] pythonpath = ["."]` 使后续任务能写 `from etl import paths` 与 `from tools import assert_env`；`[tool.ruff]` 配置供 L0 使用。

- [ ] **Step 1: 确认目标路径不存在，然后创建目录树**

Run（需 `required_permissions='all'`，路径在工作区外）:

```powershell
foreach ($p in @("D:\Codex\MacroDataETL","D:\Codex\venv-pandas2","D:\Codex\venv-akshare")) {
  if (Test-Path $p) { "ALREADY EXISTS - STOP: $p" } else { "absent (ok): $p" }
}
New-Item -ItemType Directory -Force -Path "D:\Codex\MacroDataETL\etl","D:\Codex\MacroDataETL\tools","D:\Codex\MacroDataETL\tests" | Out-Null
Get-ChildItem "D:\Codex\MacroDataETL" -Recurse -Directory | ForEach-Object { $_.FullName }
```

Expected: 三个路径均报 `absent (ok)`，随后列出 `etl`、`tools`、`tests` 三个子目录。若任一路径报 `ALREADY EXISTS - STOP`，**停止并报告**，不要覆盖已有内容（D7）。

- [ ] **Step 2: 写 `.gitattributes`（逐字照抄 v0.1 §6.1）**

`D:\Codex\MacroDataETL\.gitattributes`:

```gitattributes
*.py text eol=lf
*.yaml text eol=lf
*.json text eol=lf
*.sh text eol=lf
*.bat text eol=crlf
```

- [ ] **Step 3: 写 `.gitignore`**

`D:\Codex\MacroDataETL\.gitignore`:

```gitignore
# 机器相关配置，绝不入库（v0.1 §6.1）
.env

# G13：raw/probe/logs 留仓内但不入 Git、不进 vault
data/
logs/

# Python 缓存
__pycache__/
*.pyc
.pytest_cache/
.ruff_cache/
```

- [ ] **Step 4: 写 `pyproject.toml`**

`D:\Codex\MacroDataETL\pyproject.toml`:

```toml
[project]
name = "macro-data-etl"
version = "0.1.0"
description = "Macro economic data ETL for the mcd Obsidian plugin"
requires-python = ">=3.14"

# ruff 是 L0（G26）：lint + format，不引入 flake8/black/mypy 组合。
# 不设 target-version，让 ruff 从上面的 requires-python 推断，避免写死不存在的枚举值。
[tool.ruff]
line-length = 100
# "." 让仓库根的直接入口（run_etl）也被认作 first-party；否则 isort 会把 import run_etl
# 当第三方，与 from etl import ... 之间的空行判断出错，ruff check 报 I001。
src = [".", "etl", "tools", "tests"]

[tool.ruff.lint]
select = ["E", "F", "I", "UP", "B", "SIM"]

[tool.pytest.ini_options]
testpaths = ["tests"]
# 让 tests/ 能直接 import etl.* 与 tools.*，无需安装本包
pythonpath = ["."]
addopts = "-q"
```

- [ ] **Step 5: 写 `.env.example`**

`D:\Codex\MacroDataETL\.env.example`:

```dotenv
# 机器相关配置只放本地 .env（v0.1 §6.1：代码不猜机器，不写死路径）。
# 复制本文件为 .env 后填写；.env 已在 .gitignore 中，不会入库。

# Obsidian vault 根目录。若未单独给 DATA_ROOT，则派生为 <VAULT_ROOT>\MacroData
VAULT_ROOT=

# 数据输出根目录。优先级高于 VAULT_ROOT。其下只有 processed/ 与 signals/ 会落 vault（G13）
DATA_ROOT=

# 选定环境的 python.exe 绝对路径（G29/G30）。由 Task 4 的冒烟判定结果填写。
# run_etl.bat 直接用这个路径，不依赖 activate
MCD_PYTHON=

# 以下两项 M4 才用到，此处先声明以免日后改契约（v0.1 §6.1）
SCHEDULER_NAME=
BACKUP_TARGET=
```

- [ ] **Step 6: 写三个 `__init__.py`（均为空文件）**

`D:\Codex\MacroDataETL\etl\__init__.py`、`D:\Codex\MacroDataETL\tools\__init__.py`、`D:\Codex\MacroDataETL\tests\__init__.py` 三个文件内容均为空（0 字节）。

- [ ] **Step 7: 初始化 git 仓并首次提交**

Run（需 `required_permissions='all'`）:

```powershell
cd D:\Codex\MacroDataETL
git init -q
git add -A
git diff --cached --name-only
```

Expected: 列出 7 个文件（`.env.example`、`.gitattributes`、`.gitignore`、`pyproject.toml`、三个 `__init__.py`）。**确认列表里没有 `.env`**——它此时还不存在，若出现说明前面步骤写错了文件。

```powershell
$msg = @'
chore: scaffold MacroDataETL repository

Add the repository skeleton for the macro data ETL deliverable: line-ending
rules, ignore boundaries, ruff and pytest configuration, and the machine
config template.

No source modules yet. Line endings follow the cross-platform rule verbatim
so Windows development and the macOS runner agree. data/ and logs/ are
ignored because raw snapshots, probe evidence and logs stay in the repo but
never enter Git or the vault.

Agent-Task: M0-T1
Agent-Decision: Configure pytest pythonpath instead of installing the package, so L1 runs from a clean checkout without an editable install step
Agent-Limitation: No git remote configured yet; where this repo is hosted is undecided and must be settled before the validation reports need to be shared
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `chore: scaffold MacroDataETL repository`。

---

### Task 2: 创建环境A（pandas 2.3.3）并固化锁文件

**Files:**
- Create: `D:\Codex\MacroDataETL\requirements-pandas2.txt`（由 `pip freeze` 生成）
- Create: `D:\Codex\venv-pandas2\`（venv 本体，不入库）

**Interfaces:**
- Consumes: Task 1 的仓库路径
- Produces: `D:\Codex\venv-pandas2\Scripts\python.exe`（后续任务用 `<pyA>` 代指）；`requirements-pandas2.txt`；环境A 内可用的 `pytest`、`ruff`、`akshare`、`pandas`

- [ ] **Step 1: 创建 venv**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
python -m venv D:\Codex\venv-pandas2
Test-Path "D:\Codex\venv-pandas2\Scripts\python.exe"
& "D:\Codex\venv-pandas2\Scripts\python.exe" -c "import sys; print(sys.version); print(sys.prefix)"
```

Expected: `True`，然后打印 `3.14.8` 与 `D:\Codex\venv-pandas2`。若版本不是 3.14.8，**停止并报告**（本机只有一个解释器，出现别的版本说明 PATH 被污染）。

- [ ] **Step 2: 安装锁定版本（直接钉住 spec §4.4 的四个版本）**

Run（需 `required_permissions='all'`；耗时较长，`timeout` 给足）:

```powershell
$env:PYTHONUTF8="1"
$pyA = "D:\Codex\venv-pandas2\Scripts\python.exe"
& $pyA -m pip install --upgrade pip
& $pyA -m pip install "akshare==1.19.1" "pandas==2.3.3" "pytz==2026.5" "numpy==2.5.4" "curl_cffi==0.16.3" "tzdata==2026.5" PyYAML jsonschema python-dotenv pytest ruff
& $pyA -m pip list --format=freeze | Select-String -Pattern "^(akshare|pandas|pytz|numpy|curl_cffi|tzdata|PyYAML|jsonschema|python-dotenv|pytest|ruff)="
```

Expected: 11 行，其中 `akshare==1.19.1`、`pandas==2.3.3`、`pytz==2026.5`、`numpy==2.5.4`。若 pip 报 `ResolutionImpossible`，**停止并报告完整错误**——spec §16 已实测该组合可解析（EXITCODE=0），失败意味着环境或网络变化，需要重新评估而不是硬装。

- [ ] **Step 3: 确认没有装进 pandas 3（G30 的反向检查）**

Run:

```powershell
& "D:\Codex\venv-pandas2\Scripts\python.exe" -c "import pandas; assert pandas.__version__.startswith('2.'), pandas.__version__; print('OK pandas', pandas.__version__)"
```

Expected: `OK pandas 2.3.3`。若 AssertionError，说明版本锁失效，**停止并报告**。

- [ ] **Step 4: 固化锁文件到仓库**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pip freeze | Out-File -FilePath "D:\Codex\MacroDataETL\requirements-pandas2.txt" -Encoding utf8
(Get-Content "D:\Codex\MacroDataETL\requirements-pandas2.txt").Count
Select-String -Path "D:\Codex\MacroDataETL\requirements-pandas2.txt" -Pattern "^(akshare|pandas|pytz|numpy)="
```

Expected: 行数约 30；四条匹配显示 `akshare==1.19.1`、`numpy==2.5.4`、`pandas==2.3.3`、`pytz==2026.5`。

注意 `Out-File -Encoding utf8` 在 Windows PowerShell 5.1 下会写 BOM。检查并去掉：

```powershell
$p = "D:\Codex\MacroDataETL\requirements-pandas2.txt"
$bytes = [System.IO.File]::ReadAllBytes($p)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  [System.IO.File]::WriteAllBytes($p, $bytes[3..($bytes.Length-1)]); "BOM stripped"
} else { "no BOM" }
```

Expected: `BOM stripped` 或 `no BOM`。BOM 会让 `pip install -r` 在第一行包名上出错，必须去掉。

- [ ] **Step 5: 验证锁文件真的可用（写后回读校验，D1）**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pip install --dry-run -r "D:\Codex\MacroDataETL\requirements-pandas2.txt" 2>&1 | Select-Object -Last 5
```

Expected: 输出以 `Would install` 开头或提示全部已满足，**无 ERROR**。这一步证明锁文件不是残缺的。

- [ ] **Step 6: 提交**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add requirements-pandas2.txt
git diff --cached --name-only
$msg = @'
build(env): pin environment A to pandas 2.3.3 with akshare 1.19.1

Freeze the full resolved set for the pandas 2 environment. The venv itself
lives outside the repository, so this lock file is the only thing that makes
the environment reproducible from a clean checkout.

akshare is deliberately included here rather than excluded: a scan of the
machine found no pandas-only business code, so an akshare-free pandas 2
environment would serve nothing.

Agent-Task: M0-T1
Agent-Decision: Pin numpy and pytz explicitly alongside pandas so the pandas 2 environment cannot drift toward pandas 3 transitive requirements
Agent-Limitation: Lock file records resolution only; whether akshare 1.19.1 actually runs on pandas 2.3.3 is decided by the Task 4 smoke test
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `build(env): pin environment A to pandas 2.3.3 with akshare 1.19.1`。

---

### Task 3: 创建环境B（pandas 3.0.6）并固化锁文件

**Files:**
- Create: `D:\Codex\MacroDataETL\requirements-akshare.txt`
- Create: `D:\Codex\venv-akshare\`（不入库）

**Interfaces:**
- Consumes: Task 1 的仓库路径
- Produces: `D:\Codex\venv-akshare\Scripts\python.exe`（后续用 `<pyB>` 代指）；`requirements-akshare.txt`

- [ ] **Step 1: 创建 venv**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
python -m venv D:\Codex\venv-akshare
& "D:\Codex\venv-akshare\Scripts\python.exe" -c "import sys; print(sys.version); print(sys.prefix)"
```

Expected: `3.14.8` 与 `D:\Codex\venv-akshare`。

- [ ] **Step 2: 只钉 akshare，pandas 交解析器（spec §4.4 环境B）**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
$pyB = "D:\Codex\venv-akshare\Scripts\python.exe"
& $pyB -m pip install --upgrade pip
& $pyB -m pip install "akshare==1.19.1" PyYAML jsonschema python-dotenv pytest ruff
& $pyB -c "import pandas, akshare; print('pandas', pandas.__version__); print('akshare', akshare.__version__)"
```

Expected: `akshare 1.19.1`，pandas 版本为 `3.x`（spec §16 实测解析到 3.0.6）。**不要**在此环境安装 `pandas<3`——用户明确要求。若解析出的 pandas 是 2.x，记录实际版本并继续，不要强行升级。

- [ ] **Step 3: 确认环境B 与环境A 的 pandas 大版本确实不同（隔离有效性检查）**

Run:

```powershell
$a = & "D:\Codex\venv-pandas2\Scripts\python.exe" -c "import pandas; print(pandas.__version__)"
$b = & "D:\Codex\venv-akshare\Scripts\python.exe" -c "import pandas; print(pandas.__version__)"
"envA pandas = $a"; "envB pandas = $b"
if ($a.Split('.')[0] -eq $b.Split('.')[0]) { "WARNING: 两环境 pandas 大版本相同，隔离失去意义" } else { "OK: 大版本不同，隔离有效" }
```

Expected: `envA pandas = 2.3.3`、`envB pandas = 3.0.6`、`OK: 大版本不同，隔离有效`。若出现 WARNING，**停止并报告**——那意味着 spec §4.5 的双环境设计前提不成立，需要回到用户裁决。

- [ ] **Step 4: 固化锁文件并去 BOM**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
& "D:\Codex\venv-akshare\Scripts\python.exe" -m pip freeze | Out-File -FilePath "D:\Codex\MacroDataETL\requirements-akshare.txt" -Encoding utf8
$p = "D:\Codex\MacroDataETL\requirements-akshare.txt"
$bytes = [System.IO.File]::ReadAllBytes($p)
if ($bytes.Length -ge 3 -and $bytes[0] -eq 0xEF -and $bytes[1] -eq 0xBB -and $bytes[2] -eq 0xBF) {
  [System.IO.File]::WriteAllBytes($p, $bytes[3..($bytes.Length-1)]); "BOM stripped"
} else { "no BOM" }
Select-String -Path $p -Pattern "^(akshare|pandas)="
```

Expected: `BOM stripped` 或 `no BOM`；两条匹配显示 `akshare==1.19.1` 与 `pandas==3.x`。

- [ ] **Step 5: 验证锁文件可用（D1 写后回读）**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
& "D:\Codex\venv-akshare\Scripts\python.exe" -m pip install --dry-run -r "D:\Codex\MacroDataETL\requirements-akshare.txt" 2>&1 | Select-Object -Last 5
```

Expected: 无 `ERROR`。

- [ ] **Step 6: 提交**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add requirements-akshare.txt
git diff --cached --name-only
$msg = @'
build(env): pin environment B to akshare 1.19.1 with resolver-chosen pandas

Freeze the full resolved set for the second environment. Only akshare is
pinned directly; pandas is left to the resolver as required, which yields
pandas 3.x on this interpreter.

Together with environment A this gives two isolated candidates for the M0
ETL runtime, so the pandas 2 versus pandas 3 question is answered by a
smoke test rather than by assumption.

Agent-Task: M0-T1
Agent-Decision: Leave pandas unpinned in this environment on explicit user instruction, accepting that a future resolver run may yield a different pandas 3 minor
Agent-Limitation: Because pandas is unpinned, this lock file is a snapshot; reproducing it later requires installing from the file rather than re-resolving
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `build(env): pin environment B to akshare 1.19.1 with resolver-chosen pandas`。

---

### Task 4: 冒烟判定脚本，决定 M0 用哪个环境

**Files:**
- Create: `D:\Codex\MacroDataETL\tools\smoke_env.py`
- Test: `D:\Codex\MacroDataETL\tests\test_smoke_env.py`
- Create: `D:\Codex\MacroDataETL\.env`（本机真实值，不入库）

**Interfaces:**
- Consumes: `<pyA>`、`<pyB>`（Task 2/3）
- Produces:
  - `smoke_env.match_names(names: Iterable[str], patterns: Sequence[str] = DISCOVERY_KEYWORDS) -> list[str]` —— 纯函数，按关键词过滤并排序候选名
  - `smoke_env.discover() -> list[str]` —— 导入 akshare 后返回可调用且命中关键词的函数名
  - `smoke_env.smoke() -> int` —— 退出码 `0` = 通过，`1` = 前三个候选全部失败，`3` = 未发现候选因而无法判定
  - `smoke_env.DISCOVERY_KEYWORDS: tuple[str, ...]` = `("consumer_goods_retail", "retail")`
  - `smoke_env.RATE_LIMIT_SECONDS: int` = `3`
  - `.env` 中的 `MCD_PYTHON`（Task 5–7 与后续阶段都依赖它）

- [ ] **Step 1: 写失败测试（只测纯函数，不触网）**

`D:\Codex\MacroDataETL\tests\test_smoke_env.py`:

```python
"""smoke_env 的发现逻辑单测。

只测纯函数 match_names——真实抓取属退出标准 #13，由人工在两个环境各跑一次，
不在单测里触网（触网的测试不可重复，违反 L1 的定位）。
"""

from tools.smoke_env import DISCOVERY_KEYWORDS, match_names


def test_matches_by_keyword_case_insensitively():
    names = ["macro_china_consumer_goods_retail", "stock_zh_a_hist", "macro_china_retail_price_index"]
    assert match_names(names, ("retail",)) == [
        "macro_china_consumer_goods_retail",
        "macro_china_retail_price_index",
    ]


def test_returns_sorted_and_deduplicated_order():
    names = ["b_retail", "a_retail", "c_other"]
    assert match_names(names, ("retail",)) == ["a_retail", "b_retail"]


def test_empty_input_gives_empty_list():
    assert match_names([], DISCOVERY_KEYWORDS) == []


def test_no_match_gives_empty_list_rather_than_everything():
    # D10：发现不到就是发现不到，不能退化成「返回全部函数」
    assert match_names(["stock_zh_a_hist", "fund_etf_hist"], DISCOVERY_KEYWORDS) == []


def test_multiple_patterns_are_unioned():
    names = ["consumer_goods_retail", "retail_total", "money_supply_m1"]
    assert match_names(names, ("consumer_goods_retail", "retail")) == [
        "consumer_goods_retail",
        "retail_total",
    ]
```

- [ ] **Step 2: 运行测试确认失败**

Run（需 `required_permissions='all'`）:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_smoke_env.py -v 2>&1 | Select-Object -Last 12
```

Expected: FAIL，`ModuleNotFoundError: No module named 'tools.smoke_env'`（或 `cannot import name 'match_names'`）。这是 D6 要求的「先有失败测试」。

- [ ] **Step 3: 写实现**

`D:\Codex\MacroDataETL\tools\smoke_env.py`:

```python
"""双环境运行期冒烟判定（G29，spec 退出标准 #13）。

要回答的问题只有一个：akshare 1.19.1 在这个 pandas 大版本上**运行期**能不能用。
依赖解析通过不代表代码跑通（spec §16 明确区分了这两件事），所以必须真装真跑。

刻意不硬编码任何 akshare 函数名（D10）：先按关键词发现候选，再逐个试调用。
退出码区分三种结局（D3：区分「操作失败」与「环境不支持」）：
    0 = 至少一个候选真实取数成功
    1 = 发现了候选但前三个全部失败（可能是风控、网络或接口变更）
    3 = 一个候选都没发现，无法判定（不是失败，是证据不足）
"""

from __future__ import annotations

import re
import sys
import time
from collections.abc import Iterable, Sequence

# spec §7.2 阶段 1 为 retail_total 组固定了这两个关键词
DISCOVERY_KEYWORDS: tuple[str, ...] = ("consumer_goods_retail", "retail")

# G23：请求间隔 3 秒
RATE_LIMIT_SECONDS = 3

# 最多试几个候选。冒烟只需要一个成功即可判定，不必穷举（穷举属 T1-2）
MAX_ATTEMPTS = 3


def match_names(names: Iterable[str], patterns: Sequence[str] = DISCOVERY_KEYWORDS) -> list[str]:
    """纯函数：按关键词过滤名字并排序。不导入 akshare，因此可单测。"""
    if not patterns:
        return []
    rx = re.compile("|".join(re.escape(p) for p in patterns), re.IGNORECASE)
    return sorted(n for n in names if rx.search(n))


def discover() -> list[str]:
    """枚举 akshare 中命中关键词且可调用的函数名。"""
    import akshare as ak

    callable_names = (n for n in dir(ak) if not n.startswith("_") and callable(getattr(ak, n, None)))
    return match_names(callable_names)


def smoke() -> int:
    sys.stdout.reconfigure(encoding="utf-8")  # spec §7.9：Windows cp1252 会崩

    import akshare as ak
    import pandas as pd

    print(f"python:  {sys.version.split()[0]}")
    print(f"prefix:  {sys.prefix}")
    print(f"akshare: {ak.__version__}")
    print(f"pandas:  {pd.__version__}")

    names = discover()
    print(f"discovered {len(names)} candidates: {names[:8]}")
    if not names:
        # 证据不足不等于失败，必须与失败区分开（D3）
        print("SMOKE INCONCLUSIVE: 未发现任何候选函数，无法判定运行期可用性", file=sys.stderr)
        return 3

    for name in names[:MAX_ATTEMPTS]:
        fn = getattr(ak, name)
        try:
            time.sleep(RATE_LIMIT_SECONDS)  # G23
            frame = fn()
        except Exception as exc:
            # D2/D5：如实记录原始异常类型与消息，不掩盖、不吞掉
            print(f"  {name}: FAILED {type(exc).__name__}: {exc}")
            continue
        rows = 0 if frame is None else len(frame)
        cols = list(getattr(frame, "columns", []))[:6]
        print(f"  {name}: OK rows={rows} cols={cols}")
        if rows > 0:
            print(f"SMOKE PASS via {name}")
            return 0

    print(f"SMOKE FAIL: 前 {MAX_ATTEMPTS} 个候选均失败", file=sys.stderr)
    return 1


if __name__ == "__main__":
    sys.exit(smoke())
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_smoke_env.py -v 2>&1 | Select-Object -Last 12
```

Expected: 5 passed。

- [ ] **Step 5: 在环境A 跑真实冒烟**

Run（需 `required_permissions='all'`；会真实访问网络）:

```powershell
$env:PYTHONUTF8="1"
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" tools\smoke_env.py 2>&1 | Tee-Object -FilePath "$env:TEMP\smoke-envA.txt"
"EXITCODE_A=$LASTEXITCODE"
```

Expected: 打印 python/prefix/akshare/pandas 四行（pandas 应为 2.3.3）、候选清单、至少一行 `OK rows=...`，最后 `SMOKE PASS via <name>`，`EXITCODE_A=0`。

**完整保留这段输出**——它是退出标准 #13 的证据，Task 4 Step 8 要写进 `.env` 注释、阶段 4 要写进运行环境文档。

- [ ] **Step 6: 在环境B 跑真实冒烟**

Run（需 `required_permissions='all'`）:

```powershell
$env:PYTHONUTF8="1"
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-akshare\Scripts\python.exe" tools\smoke_env.py 2>&1 | Tee-Object -FilePath "$env:TEMP\smoke-envB.txt"
"EXITCODE_B=$LASTEXITCODE"
```

Expected: 同上，pandas 应为 3.x，`EXITCODE_B=0`。

注意两次冒烟之间至少间隔数秒——G23 限速是针对同一数据源的，连续两次真实抓取有触发风控的风险。脚本内已有 `RATE_LIMIT_SECONDS` 睡眠，但若 Step 5 已经打过同一接口，Step 6 前再手工等待 10 秒更稳妥。

- [ ] **Step 7: 按 spec §4.5 的判定规则选定环境**

依据两个退出码判定，**不要凭偏好选**：

| `EXITCODE_A` | `EXITCODE_B` | 选定 | 附加动作 |
|---|---|---|---|
| 0 | 0 | **环境A** `D:\Codex\venv-pandas2` | pandas 2 生态更成熟，且是 AKShareWebapp 已运行的区间 |
| ≠0 | 0 | **环境B** `D:\Codex\venv-akshare` | 必须把环境A 的失败堆栈原文记入 spec §16 与阶段 4 的运行环境文档 |
| 0 | ≠0 | **环境A** | 记录环境B 的失败原因，供日后 pandas 3 迁移参考 |
| ≠0 | ≠0 | **M0 阻塞** | 不伪造（D5）。停止本计划，向用户报告两份输出，触发 spec §15 的 Python 降级缓解项 |
| 3（任一侧） | — | 视同该侧 ≠0 | `3` 是证据不足，不能当通过 |

- [ ] **Step 8: 写 `.env`（本机真实值，不入库）**

Run（需 `required_permissions='all'`；把 `<SELECTED>` 换成 Step 7 选定的解释器绝对路径。`VAULT_ROOT` / `DATA_ROOT` 已按本机 vault 写实为 `D:\Codex\MacroEcoData`，若你的 vault 不在此处则一并改）:

```powershell
$envText = @"
VAULT_ROOT=D:\Codex\MacroEcoData
DATA_ROOT=D:\Codex\MacroEcoData\MacroData
MCD_PYTHON=<SELECTED>
SCHEDULER_NAME=
BACKUP_TARGET=
"@
Set-Content -Path "D:\Codex\MacroDataETL\.env" -Value $envText -Encoding utf8 -NoNewline
Get-Content "D:\Codex\MacroDataETL\.env"
```

Expected: 回读打印出四行且 `MCD_PYTHON` 指向选定的 `python.exe`（D1：写后回读校验）。

确认 `.env` 不会被提交：

```powershell
cd D:\Codex\MacroDataETL
git status --porcelain
git check-ignore -v .env
```

Expected: `git status --porcelain` **不出现 `.env`**；`git check-ignore` 输出 `.gitignore:2:.env    .env` 之类的命中说明。若 `.env` 出现在 status 里，**停止并修 `.gitignore`**——机器路径入库会泄露本机目录结构。

- [ ] **Step 9: 提交（只提 smoke_env.py 与其测试）**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add tools/smoke_env.py tests/test_smoke_env.py
git diff --cached --name-only
```

Expected: 恰好 2 个文件。**确认没有 `.env`、没有 `requirements*.txt` 的意外改动。**

```powershell
$msg = @'
feat(env): add runtime smoke test to choose the M0 python environment

Add a discovery-based smoke test that proves whether akshare 1.19.1 actually
runs on a given pandas major version, and use it to pick between the two
isolated environments.

Dependency resolution succeeding does not prove the code runs, so this is
executed once per environment and the winner is recorded in .env as
MCD_PYTHON. Exit codes separate three outcomes: pass, fail, and
inconclusive because no candidate endpoint was discovered.

No akshare function name is hardcoded. Candidates are discovered by keyword
first, so the script does not smuggle in an unverified endpoint choice that
belongs to the later validation task.

Agent-Task: M0-T1
Agent-Decision: Return exit code 3 for "no candidates discovered" instead of 1, because missing evidence is not the same as a failed fetch and must not be reported as one
Agent-Limitation: Only the pure discovery function is unit tested; the network half is a one-shot manual run per environment and is not repeatable in CI
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `feat(env): add runtime smoke test to choose the M0 python environment`。

> **选定环境 → 后续解释器（务必先读）**：Task 5–7 的命令为便于复制，一律写成环境A 的 `D:\Codex\venv-pandas2\Scripts\python.exe`。**若 Step 7 判定选定环境B**，把 Task 5–7 中每一处该路径替换为 `.env` 里 `MCD_PYTHON` 的值（即 `D:\Codex\venv-akshare\Scripts\python.exe`）——spec §9 要求所有命令以 `MCD_PYTHON` 执行，阶段完成定义 #4 也要求「在选定环境下全绿」，两者都指向选定环境而非固定环境A。Task 4 自身的单测（Step 2/4）只测纯函数 `match_names`，用哪个环境都行，不必替换。

---

### Task 5: `etl/paths.py` —— 数据根目录的唯一解析点

**Files:**
- Create: `D:\Codex\MacroDataETL\etl\paths.py`
- Test: `D:\Codex\MacroDataETL\tests\test_paths.py`

**Interfaces:**
- Consumes: 环境变量 `DATA_ROOT`、`VAULT_ROOT`（由 `.env` 提供，Task 4）
- Produces（后续所有阶段都依赖这些名字，不得改）:
  - `paths.PathConfigError(RuntimeError)`
  - `paths.data_root() -> Path`
  - `paths.processed_dir() -> Path`
  - `paths.signals_dir() -> Path`
  - `paths.raw_dir() -> Path`
  - `paths.probe_dir() -> Path`
  - `paths.logs_dir() -> Path`
  - `paths.repo_root() -> Path`
  - `paths.dotenv_path() -> Path` —— `.env` 的位置；抽成函数以便测试替换（Task 7 的隔离 fixture 依赖它）
  - `paths.load_dotenv() -> None` —— 从仓库根的 `.env` 载入环境变量，幂等

- [ ] **Step 1: 写失败测试**

`D:\Codex\MacroDataETL\tests\test_paths.py`:

```python
"""etl.paths 的单测。

重点不只是「路径拼对了」，而是三件容易被跳过的事：
1. DATA_ROOT 优先于 VAULT_ROOT（G12 的优先级规则）；
2. 两个键都缺时报错，且错误消息**指名缺哪个键**（D10），不静默回退到仓内 data/；
3. raw/probe/logs 留在仓内、processed/signals 落 DATA_ROOT（G13，用户已确认）。
"""

import pathlib

import pytest

from etl import paths


@pytest.fixture(autouse=True)
def _clean_env(monkeypatch):
    """每个测试都从干净的环境变量开始，避免相互污染。"""
    monkeypatch.delenv("DATA_ROOT", raising=False)
    monkeypatch.delenv("VAULT_ROOT", raising=False)


def test_data_root_prefers_explicit_data_root(monkeypatch):
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/explicit")
    monkeypatch.setenv("VAULT_ROOT", "D:/tmp/vault")
    assert paths.data_root() == pathlib.Path("D:/tmp/explicit")


def test_data_root_derives_from_vault_root(monkeypatch):
    monkeypatch.setenv("VAULT_ROOT", "D:/tmp/vault")
    assert paths.data_root() == pathlib.Path("D:/tmp/vault") / "MacroData"


def test_blank_values_are_treated_as_missing(monkeypatch):
    # 空字符串不等于「设置了」，否则 .env 里的空占位会被当成有效路径
    monkeypatch.setenv("DATA_ROOT", "   ")
    monkeypatch.setenv("VAULT_ROOT", "")
    with pytest.raises(paths.PathConfigError):
        paths.data_root()


def test_missing_both_keys_names_them_in_the_error():
    with pytest.raises(paths.PathConfigError) as excinfo:
        paths.data_root()
    message = str(excinfo.value)
    # D10：错误必须说清缺哪个键，而不是只说「配置错误」
    assert "DATA_ROOT" in message
    assert "VAULT_ROOT" in message


def test_missing_config_does_not_fall_back_to_repo_data_dir():
    # G12 的核心：宁可报错也不静默回退，否则数据会悄悄写进仓库
    with pytest.raises(paths.PathConfigError):
        paths.processed_dir()


def test_processed_and_signals_live_under_data_root(monkeypatch):
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/explicit")
    assert paths.processed_dir() == pathlib.Path("D:/tmp/explicit/processed")
    assert paths.signals_dir() == pathlib.Path("D:/tmp/explicit/signals")


def test_raw_probe_logs_stay_inside_the_repo():
    # G13：这三者不进 vault
    for getter in (paths.raw_dir, paths.probe_dir, paths.logs_dir):
        resolved = getter()
        assert paths.repo_root() in resolved.parents, f"{getter.__name__} 逃出了仓库"


def test_repo_root_is_the_directory_containing_etl_package():
    assert paths.repo_root().name == "MacroDataETL"
    assert (paths.repo_root() / "pyproject.toml").is_file()


def test_load_dotenv_is_idempotent(monkeypatch, tmp_path):
    # D9：可重入。重复调用不得叠加或改变结果
    env_file = tmp_path / ".env"
    env_file.write_text("DATA_ROOT=D:/tmp/from_dotenv\n", encoding="utf-8")
    monkeypatch.setattr(paths, "dotenv_path", lambda: env_file)

    paths.load_dotenv()
    first = paths.data_root()
    paths.load_dotenv()
    second = paths.data_root()

    assert first == second == pathlib.Path("D:/tmp/from_dotenv")


def test_load_dotenv_does_not_override_an_existing_env_var(monkeypatch, tmp_path):
    # 已导出的环境变量优先于 .env，否则计划任务里的覆盖会失效
    env_file = tmp_path / ".env"
    env_file.write_text("DATA_ROOT=D:/tmp/from_dotenv\n", encoding="utf-8")
    monkeypatch.setattr(paths, "dotenv_path", lambda: env_file)
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/from_shell")

    paths.load_dotenv()
    assert paths.data_root() == pathlib.Path("D:/tmp/from_shell")
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_paths.py -v 2>&1 | Select-Object -Last 12
```

Expected: FAIL，`ModuleNotFoundError: No module named 'etl.paths'`。

- [ ] **Step 3: 写实现**

`D:\Codex\MacroDataETL\etl\paths.py`:

```python
"""数据根目录的唯一解析点（G12 / D8）。

v0.1 §7.3 与 §7.10 的骨架把路径写成 ROOT / "data" / "processed"，这与
G2（输出到 vault）和 §6.1（代码不猜机器、不写死路径）冲突。本模块是那个冲突的
消解点：所有目录一律从这里取，别处不再拼路径。

两条不可妥协的规则：
- 配置缺失时**明确报错并指出缺哪个键**（D10），绝不静默回退到仓内 data/——
  静默回退会让数据悄悄写进仓库，等到发现时已经污染了 Git 历史。
- raw/probe/logs 在仓内，processed/signals 在 DATA_ROOT（G13，用户已确认）。
"""

from __future__ import annotations

import os
from pathlib import Path

# vault 内数据子目录名。只在此处定义一次（D8），改名只改这一行
_VAULT_DATA_DIRNAME = "MacroData"

_REPO_ROOT = Path(__file__).resolve().parent.parent


class PathConfigError(RuntimeError):
    """机器相关配置缺失或不可用。消息必须指出缺哪个键（D10）。"""


def repo_root() -> Path:
    """ETL 仓根目录，由本文件位置推出，不依赖当前工作目录。"""
    return _REPO_ROOT


def dotenv_path() -> Path:
    """`.env` 的位置。抽成函数是为了让测试可以替换它。"""
    return _REPO_ROOT / ".env"


def load_dotenv() -> None:
    """从 `.env` 载入机器相关配置。幂等（D9），且不覆盖已导出的环境变量。

    不覆盖是刻意的：计划任务或 CI 里临时导出的值应当优先于文件，
    否则「用环境变量覆盖配置」这条常规手段会失效。
    """
    from dotenv import dotenv_values

    path = dotenv_path()
    if not path.is_file():
        return
    for key, value in dotenv_values(path).items():
        if key and value is not None and not os.environ.get(key, "").strip():
            os.environ[key] = value


def _first_present(*keys: str) -> tuple[str, str] | None:
    """返回第一个「已设置且非空白」的 (键名, 值)。"""
    for key in keys:
        value = os.environ.get(key, "").strip()
        if value:
            return key, value
    return None


def data_root() -> Path:
    """数据输出根目录。DATA_ROOT 优先；否则由 VAULT_ROOT 派生。

    Raises:
        PathConfigError: 两个键都缺失。消息同时点名两个键，因为补任一个都能解决。
    """
    found = _first_present("DATA_ROOT", "VAULT_ROOT")
    if found is None:
        raise PathConfigError(
            "DATA_ROOT 与 VAULT_ROOT 均未设置（或为空白）。至少提供其一："
            "设置 DATA_ROOT 直接指定输出根目录，或设置 VAULT_ROOT 由它派生出 "
            f"<VAULT_ROOT>/{_VAULT_DATA_DIRNAME}。"
            f"期望在 {dotenv_path()} 中找到这些键。"
            "本模块不会回退到仓内 data/（G12）。"
        )
    key, value = found
    if key == "DATA_ROOT":
        return Path(value)
    return Path(value) / _VAULT_DATA_DIRNAME


def processed_dir() -> Path:
    """插件唯一读取面（v0.1 §2.1 读写边界）。"""
    return data_root() / "processed"


def signals_dir() -> Path:
    """派生信号状态。MVP 不消费，但先落位以免日后改契约。"""
    return data_root() / "signals"


def raw_dir() -> Path:
    """只追加的原始快照。留仓内，不入 Git、不进 vault（G13）。"""
    return _REPO_ROOT / "data" / "raw"


def probe_dir() -> Path:
    """验证脚本的原始响应证据。留仓内，不入 Git、不进 vault（G13）。"""
    return _REPO_ROOT / "data" / "probe"


def logs_dir() -> Path:
    """运行日志。留仓内，不入 Git（G13）。产品简介 §7 规则 4 要求失败必写日志。"""
    return _REPO_ROOT / "logs"
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_paths.py -v 2>&1 | Select-Object -Last 16
```

Expected: 10 passed。若 `test_repo_root_is_the_directory_containing_etl_package` 失败，说明仓库目录名不是 `MacroDataETL`——**不要改测试迁就**，先确认路径是否写错（D6 的反面是「改测试让它通过」，禁止）。

- [ ] **Step 5: 跑 L0**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff check .
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff format --check .
```

Expected: `All checks passed!` 与 `1 file already formatted`（或列出需格式化的文件）。若 `format --check` 报 reformat 需求，运行 `... -m ruff format .` 后**重跑 Step 4 的测试**（手册 §2：修复后重跑该层及以上），再回到本步。

- [ ] **Step 6: 提交**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add etl/paths.py tests/test_paths.py
git diff --cached --name-only
$msg = @'
feat(paths): resolve every data directory from one place

Add the single resolution point for data roots, replacing the hardcoded
ROOT/"data"/... pattern in the v0.1 skeleton that conflicted with writing
output into the vault.

DATA_ROOT wins over VAULT_ROOT; when both are absent the error names both
keys instead of quietly falling back to an in-repo data directory, which
would let output leak into Git unnoticed. raw, probe and logs stay inside
the repository while processed and signals resolve under the data root.

Agent-Task: M0-T1
Agent-Decision: Raise on missing configuration rather than default to the repo data directory, because a silent fallback hides the mistake until it has already polluted history
Agent-Limitation: load_dotenv deliberately does not override already-exported variables; a caller needing file-wins semantics must clear the environment first
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `feat(paths): resolve every data directory from one place`。

---

### Task 6: `tools/assert_env.py` —— 激活门禁

**Files:**
- Create: `D:\Codex\MacroDataETL\tools\assert_env.py`
- Test: `D:\Codex\MacroDataETL\tests\test_assert_env.py`

**Interfaces:**
- Consumes: 无（只依赖标准库与 pandas）
- Produces:
  - `assert_env.describe() -> dict[str, str]` —— 键固定为 `executable` / `prefix` / `python` / `pandas` / `akshare`
  - `assert_env.check(expected_venv: str | Path) -> int` —— `0` = 当前就在期望环境；`1` = 不是。**不抛异常**，由调用方决定退出
  - `assert_env.main(argv: list[str]) -> int` —— 参数不足返回 `2`
  - 命令行：`python tools/assert_env.py <expected-venv-path>`

- [ ] **Step 1: 写失败测试**

`D:\Codex\MacroDataETL\tests\test_assert_env.py`:

```python
"""激活门禁的正反用例（spec 退出标准 #13 要求：对选定环境退 0、对另一个退 1）。

必须同时测「函数返回值」和「子进程退出码」：只测返回值会漏掉
`sys.exit` 用错导致门禁形同虚设的情况。
"""

import subprocess
import sys
from pathlib import Path

from tools import assert_env

TOOL = Path(__file__).resolve().parent.parent / "tools" / "assert_env.py"
BOGUS_VENV = Path(sys.prefix).parent / "definitely-not-this-venv"


def test_describe_reports_the_fixed_key_set():
    info = assert_env.describe()
    assert set(info) == {"executable", "prefix", "python", "pandas", "akshare"}
    assert info["prefix"] == sys.prefix


def test_describe_does_not_raise_when_akshare_is_absent(monkeypatch):
    # D3：环境不支持要与操作失败区分开——缺包是事实，不是崩溃
    import builtins

    real_import = builtins.__import__

    def fake_import(name, *args, **kwargs):
        if name == "akshare":
            raise ImportError("no akshare here")
        return real_import(name, *args, **kwargs)

    monkeypatch.setattr(builtins, "__import__", fake_import)
    info = assert_env.describe()
    assert info["akshare"].startswith("MISSING")


def test_check_passes_for_the_current_prefix(capsys):
    assert assert_env.check(sys.prefix) == 0
    out = capsys.readouterr().out
    assert "executable:" in out
    assert "pandas:" in out


def test_check_fails_for_a_different_prefix(capsys):
    assert assert_env.check(BOGUS_VENV) == 1
    err = capsys.readouterr().err
    assert "ENV MISMATCH" in err
    # D5：错误消息要给出可执行的下一步，而不是只说「不匹配」
    assert str(BOGUS_VENV) in err


def test_cli_exits_0_for_the_current_prefix():
    proc = subprocess.run(
        [sys.executable, str(TOOL), sys.prefix],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert proc.returncode == 0, proc.stderr


def test_cli_exits_1_on_mismatch():
    proc = subprocess.run(
        [sys.executable, str(TOOL), str(BOGUS_VENV)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert proc.returncode == 1
    assert "ENV MISMATCH" in proc.stderr


def test_cli_exits_2_without_exactly_one_argument():
    proc = subprocess.run(
        [sys.executable, str(TOOL)],
        capture_output=True,
        text=True,
        encoding="utf-8",
    )
    assert proc.returncode == 2
    assert "usage:" in proc.stderr
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_assert_env.py -v 2>&1 | Select-Object -Last 12
```

Expected: FAIL，`ModuleNotFoundError: No module named 'tools.assert_env'`。

- [ ] **Step 3: 写实现**

`D:\Codex\MacroDataETL\tools\assert_env.py`:

```python
"""激活门禁（G30）。

「记得先激活 venv」靠自觉迟早会漏，而漏了的后果是产出错数据而不是报错——
这是最难查的一类故障。本模块把它变成机器可检：入口第一行调用，
sys.prefix 不等于期望路径就 exit 1，任务根本不启动（D10）。

check() 返回退出码而不抛异常，是为了让调用方能决定退出方式，
也让单测可以直接断言返回值。
"""

from __future__ import annotations

import sys
from pathlib import Path


def _python_executable_of(venv: Path) -> Path:
    """给出该 venv 的解释器路径，用于错误消息里的可执行建议（D5）。"""
    if sys.platform == "win32":
        return venv / "Scripts" / "python.exe"
    return venv / "bin" / "python"


def describe() -> dict[str, str]:
    """当前解释器与关键包版本。

    akshare 缺失时记为 MISSING 而不是抛异常：那是「环境不支持」，
    与「操作失败」是两件事，必须区分（D3）。
    """
    import pandas

    info = {
        "executable": sys.executable,
        "prefix": sys.prefix,
        "python": sys.version.split()[0],
        "pandas": pandas.__version__,
    }
    try:
        import akshare

        info["akshare"] = akshare.__version__
    except ImportError as exc:
        info["akshare"] = f"MISSING ({exc})"
    return info


def check(expected_venv: str | Path) -> int:
    """校验当前是否就在期望的 venv 里。

    Returns:
        0：sys.prefix 与期望一致；1：不一致。
    """
    expected = Path(expected_venv).resolve()
    actual = Path(sys.prefix).resolve()

    for key, value in describe().items():
        print(f"{key}: {value}")

    if actual != expected:
        suggested = _python_executable_of(expected)
        print(
            f"ENV MISMATCH: expected prefix {expected}, got {actual}.\n"
            f"不要混用两个环境的包（G30）。改用这个解释器重跑：{suggested}",
            file=sys.stderr,
        )
        return 1
    return 0


def main(argv: list[str]) -> int:
    if len(argv) != 2:
        program = Path(argv[0]).name if argv else "assert_env.py"
        print(f"usage: {program} <expected-venv-path>", file=sys.stderr)
        return 2
    return check(argv[1])


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # spec §7.9：Windows cp1252 会崩
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_assert_env.py -v 2>&1 | Select-Object -Last 14
```

Expected: 7 passed。

- [ ] **Step 5: 手工验证门禁真的拦得住跨环境（退出标准 #13 的后半句）**

Run:

```powershell
cd D:\Codex\MacroDataETL
"--- A 环境自证（应退 0）"
& "D:\Codex\venv-pandas2\Scripts\python.exe" tools\assert_env.py "D:\Codex\venv-pandas2"; "exit=$LASTEXITCODE"
"--- A 环境被要求当 B（应退 1）"
& "D:\Codex\venv-pandas2\Scripts\python.exe" tools\assert_env.py "D:\Codex\venv-akshare" 2>&1 | Out-String; "exit=$LASTEXITCODE"
```

Expected: 第一段 `exit=0`；第二段输出含 `ENV MISMATCH` 且 `exit=1`。这两行输出就是退出标准 #13 要求的证据，保留下来。

- [ ] **Step 6: 跑 L0 与全量 L1**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff check .
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff format --check .
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest
```

Expected: ruff 全绿；pytest 报告 22 passed（smoke 5 + paths 10 + assert_env 7）。

- [ ] **Step 7: 提交**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add tools/assert_env.py tests/test_assert_env.py
git diff --cached --name-only
$msg = @'
feat(env): gate every entry point on the active virtual environment

Add the activation guard so that running against the wrong venv fails at
startup instead of silently producing data from the wrong pandas version.

check() returns an exit code rather than raising, so callers decide how to
exit and tests can assert the value directly. A missing akshare is reported
as MISSING instead of crashing, keeping "environment does not provide it"
distinguishable from "operation failed".

Both the return value and the subprocess exit code are tested: asserting
only the return value would miss a broken sys.exit leaving the guard inert.

Agent-Task: M0-T1
Agent-Decision: Resolve both paths before comparing so that a trailing separator or a relative form cannot defeat the check
Agent-Limitation: The guard trusts the path passed to it; it does not verify that the path is one of the two sanctioned venvs, so a typo in .env would still pass
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `feat(env): gate every entry point on the active virtual environment`。

---

### Task 7: 入口骨架，把门禁接到每个入口上

**Files:**
- Create: `D:\Codex\MacroDataETL\run_etl.py`
- Create: `D:\Codex\MacroDataETL\run_etl.bat`
- Create: `D:\Codex\MacroDataETL\run_etl.sh`
- Test: `D:\Codex\MacroDataETL\tests\test_run_etl.py`

**Interfaces:**
- Consumes: `paths.load_dotenv()`、`paths.processed_dir()`（Task 5）；`assert_env.check()`（Task 6）；`.env` 的 `MCD_PYTHON`（Task 4）
- Produces:
  - `run_etl.bootstrap() -> int` —— 载 `.env`、过门禁、校验配置齐备。返回 `0` 表示可以干活，非 `0` 表示应当退出
  - `run_etl.main(argv: list[str]) -> int`
  - `run_etl.bat` / `run_etl.sh` —— 从 `.env` 读 `MCD_PYTHON` 后直连该解释器，**不调用 `activate`**

- [ ] **Step 1: 写失败测试**

`D:\Codex\MacroDataETL\tests\test_run_etl.py`:

```python
"""入口骨架的测试。

M0 阶段 run_etl 还不做真实抓取（那是 T2-*），但它必须已经：
载 .env → 过门禁 → 校验配置。这三步的顺序本身就是被测对象：
门禁必须在任何数据操作之前，否则「用错环境」仍会先污染数据再报错。

每个用例都靠 _isolate_dotenv 把 dotenv_path 指向不存在的文件，使 bootstrap() 里的
load_dotenv() 成为空操作，再用 monkeypatch 精确设置本用例需要的变量。不这样做，测试
会读到 Task 4 创建的本机 .env——有的用例需要其中有 MCD_PYTHON、有的需要其中没有
DATA_ROOT，彼此矛盾，结果随机器而变；不可重复的测试违反 L1 定位。
"""

import pytest

import run_etl

# bootstrap() 用 MCD_PYTHON 推出期望 venv 根目录；给个占位绝对路径即可，
# check() 在各用例里都被 monkeypatch 掉，不会真去比对它。
FAKE_PYTHON = "D:/tmp/fake-venv/Scripts/python.exe"


@pytest.fixture(autouse=True)
def _isolate_dotenv(monkeypatch, tmp_path):
    """让 load_dotenv() 读不到任何文件，环境变量完全由用例掌控。"""
    monkeypatch.setattr(run_etl.paths, "dotenv_path", lambda: tmp_path / "absent.env")


def test_bootstrap_succeeds_in_the_current_environment(monkeypatch):
    monkeypatch.setenv("MCD_PYTHON", FAKE_PYTHON)
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/anywhere")
    monkeypatch.setattr(run_etl.assert_env, "check", lambda expected: 0)
    assert run_etl.bootstrap() == 0


def test_bootstrap_propagates_the_guard_failure(monkeypatch):
    # 门禁失败必须原样传出退出码，不能被吞成 0
    monkeypatch.setenv("MCD_PYTHON", FAKE_PYTHON)
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/anywhere")
    monkeypatch.setattr(run_etl.assert_env, "check", lambda expected: 1)
    assert run_etl.bootstrap() == 1


def test_bootstrap_reports_missing_configuration(monkeypatch, capsys):
    # MCD_PYTHON 必须在，否则先撞上「MCD_PYTHON 未设置」分支（其消息不含 DATA_ROOT）；
    # 本用例要测的是「门禁通过、但 DATA_ROOT/VAULT_ROOT 都缺」这条路径。
    monkeypatch.setenv("MCD_PYTHON", FAKE_PYTHON)
    monkeypatch.delenv("DATA_ROOT", raising=False)
    monkeypatch.delenv("VAULT_ROOT", raising=False)
    monkeypatch.setattr(run_etl.assert_env, "check", lambda expected: 0)
    code = run_etl.bootstrap()
    assert code == 4
    # D5：完整因果链，消息里要有缺哪个键
    assert "DATA_ROOT" in capsys.readouterr().err


def test_guard_runs_before_any_directory_is_touched(monkeypatch):
    calls: list[str] = []
    monkeypatch.setenv("MCD_PYTHON", FAKE_PYTHON)
    monkeypatch.setenv("DATA_ROOT", "D:/tmp/anywhere")
    monkeypatch.setattr(run_etl.assert_env, "check", lambda expected: calls.append("guard") or 1)
    # 绊线：门禁若没先拦住，processed_dir 就会被调用，calls 变成 ["guard","processed"]，
    # 下面断言即失败。返回 None 即可，无需真解析路径（也避免自引用递归）。
    monkeypatch.setattr(run_etl.paths, "processed_dir", lambda: calls.append("processed"))

    assert run_etl.bootstrap() == 1
    assert calls == ["guard"]  # 门禁失败时绝不触碰数据目录


def test_main_returns_bootstrap_code(monkeypatch):
    monkeypatch.setattr(run_etl, "bootstrap", lambda: 0)
    assert run_etl.main(["run_etl.py"]) == 0
```

- [ ] **Step 2: 运行测试确认失败**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_run_etl.py -v 2>&1 | Select-Object -Last 12
```

Expected: FAIL，`ModuleNotFoundError: No module named 'run_etl'`。

- [ ] **Step 3: 写 `run_etl.py`**

`D:\Codex\MacroDataETL\run_etl.py`:

```python
"""ETL 入口。

M0 阶段还不做真实抓取（属 T2-*，M1）。这里只把三件基础设施接好，
且**顺序不可调换**：载配置 → 过环境门禁 → 校验配置齐备。
门禁必须在任何数据目录被触碰之前跑，否则「用错环境」会先污染数据再报错。

退出码约定（与 tools/smoke_env.py 的风格一致，D3）：
    0 = 正常
    1 = 环境门禁未通过
    4 = 机器相关配置缺失
"""

from __future__ import annotations

import sys

from etl import paths
from tools import assert_env

EXIT_OK = 0
EXIT_ENV_MISMATCH = 1
EXIT_CONFIG_MISSING = 4


def bootstrap() -> int:
    """载 .env、过门禁、校验配置。返回退出码。"""
    paths.load_dotenv()

    import os

    expected_venv = os.environ.get("MCD_PYTHON", "").strip()
    if not expected_venv:
        # 没有 MCD_PYTHON 就无法知道「期望环境」是什么，门禁失去参照物。
        # 这属配置缺失而非环境不匹配，用不同退出码区分（D3）。
        print(
            "MCD_PYTHON 未设置：无法校验当前环境是否为选定环境（G30）。"
            f"请在 {paths.dotenv_path()} 中填写选定 venv 的 python 绝对路径。",
            file=sys.stderr,
        )
        return EXIT_CONFIG_MISSING

    # MCD_PYTHON 指向 python.exe，门禁要的是 venv 根目录，故取其上两级
    from pathlib import Path

    venv_root = Path(expected_venv).resolve().parent.parent
    if assert_env.check(venv_root) != 0:
        return EXIT_ENV_MISMATCH

    try:
        target = paths.processed_dir()
    except paths.PathConfigError as exc:
        # D2/D5：原始消息已含缺哪个键，原样透出，不改写不吞掉
        print(f"配置不完整：{exc}", file=sys.stderr)
        return EXIT_CONFIG_MISSING

    print(f"processed_dir: {target}")
    print("bootstrap OK（M0 阶段不执行抓取；真实抓取属 T2-*）")
    return EXIT_OK


def main(argv: list[str]) -> int:
    return bootstrap()


if __name__ == "__main__":
    sys.stdout.reconfigure(encoding="utf-8")  # spec §7.9
    sys.stderr.reconfigure(encoding="utf-8")
    sys.exit(main(sys.argv))
```

- [ ] **Step 4: 运行测试确认通过**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest tests/test_run_etl.py -v 2>&1 | Select-Object -Last 12
```

Expected: 5 passed。

这些用例靠 `_isolate_dotenv` fixture 把 `dotenv_path` 指向不存在的文件、再各自 `setenv`，因此与本机 `.env` 的真实内容无关，在任何机器上都应稳定 5 passed。若仍失败，先判断是实现错还是测试错（D6 的边界：测试错就改测试、实现错就改实现），不要靠改断言里的数字把它调绿。

- [ ] **Step 5: 写 `run_etl.bat`（CRLF，硬编码解释器路径，不依赖 activate）**

`D:\Codex\MacroDataETL\run_etl.bat`:

```bat
@echo off
REM Windows 入口。spec §7.9：必须设 PYTHONUTF8=1，否则含中文输出会在 cp1252 控制台崩溃，
REM 让定时任务静默失败（产品简介 §7 规则 4）。
set PYTHONUTF8=1
set PYTHONIOENCODING=utf-8

REM G30：不依赖 activate，直接从 .env 读 MCD_PYTHON 并用它跑。
REM 「忘了激活」这类错误由此从根上消失（D10）。
set "REPO=%~dp0"
set "MCD_PYTHON="
for /f "usebackq tokens=1,* delims==" %%A in ("%REPO%.env") do (
    if /I "%%A"=="MCD_PYTHON" set "MCD_PYTHON=%%B"
)

if not defined MCD_PYTHON (
    echo MCD_PYTHON not found in %REPO%.env ^(G30^) 1>&2
    exit /b 4
)
if not exist "%MCD_PYTHON%" (
    echo MCD_PYTHON points to a missing interpreter: %MCD_PYTHON% 1>&2
    exit /b 4
)

cd /d "%REPO%"
"%MCD_PYTHON%" run_etl.py %*
exit /b %ERRORLEVEL%
```

- [ ] **Step 6: 写 `run_etl.sh`（LF，M4 才真正使用）**

`D:\Codex\MacroDataETL\run_etl.sh`:

```bash
#!/usr/bin/env bash
# macOS/Linux 入口。M0 在 Windows 开发，此脚本 M4 配置 launchd 时才真正使用
# （v0.1 §6.1：用 launchd 调 run_etl.sh，不用 Windows 的 .bat）。
set -euo pipefail

REPO="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
cd "$REPO"

# G30：与 .bat 同理，不依赖 activate
MCD_PYTHON="$(grep -E '^MCD_PYTHON=' .env | cut -d= -f2- || true)"
if [ -z "$MCD_PYTHON" ]; then
  echo "MCD_PYTHON not found in $REPO/.env (G30)" >&2
  exit 4
fi

export PYTHONUTF8=1
export PYTHONIOENCODING=utf-8
exec "$MCD_PYTHON" run_etl.py "$@"
```

- [ ] **Step 7: 校验换行规则真的生效（`.gitattributes` 不是摆设）**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add --renormalize .
git add run_etl.py run_etl.bat run_etl.sh
git ls-files --eol run_etl.py run_etl.bat run_etl.sh .gitattributes pyproject.toml
```

Expected: `run_etl.bat` 显示 `w/crlf` 或 `i/crlf`；`run_etl.py` 与 `run_etl.sh` 显示 `i/lf`。若 `.bat` 不是 crlf 或 `.sh` 不是 lf，说明 `.gitattributes` 未生效——**停止并排查**，因为 `run_etl.sh` 带 CRLF 到 macOS 会直接 `bad interpreter` 失败（v0.1 §6.1 之所以钉死换行就是为了这个）。

- [ ] **Step 8: 端到端跑一次入口（用真实的 .env）**

Run:

```powershell
cd D:\Codex\MacroDataETL
cmd /c run_etl.bat
"exit=$LASTEXITCODE"
```

Expected: 打印 `executable` / `prefix` / `python` / `pandas` / `akshare` 五行（门禁输出）、`processed_dir: D:\Codex\MacroEcoData\MacroData\processed`、`bootstrap OK（M0 阶段不执行抓取；真实抓取属 T2-*）`，`exit=0`。

**注意**：此时 `processed` 目录还不存在，`bootstrap()` 只打印路径不创建它——创建目录属 T2-*。若看到 `FileNotFoundError` 说明实现越界了，删掉任何 `mkdir` 调用。

再做一次反向验证（门禁必须拦得住）：

```powershell
$env:MCD_PYTHON="D:\Codex\venv-akshare\Scripts\python.exe"
cmd /c run_etl.bat
"exit=$LASTEXITCODE"
Remove-Item Env:\MCD_PYTHON
```

Expected: 用环境A 的 `.bat`（`%~dp0.env` 里写的是选定环境）时，若 `.env` 的 `MCD_PYTHON` 指向环境A 而当前由环境B 的解释器执行，会输出 `ENV MISMATCH` 且 `exit=1`。**若上面这段因为 `.bat` 总是从 `.env` 读路径而无法制造不匹配**，改为直接验证：

```powershell
& "D:\Codex\venv-akshare\Scripts\python.exe" run_etl.py
"exit=$LASTEXITCODE"
```

Expected（当 `.env` 的 `MCD_PYTHON` 指向环境A 时）: `ENV MISMATCH` 且 `exit=1`。这就证明了即便有人手动用错解释器，入口也会拒绝启动。

- [ ] **Step 9: 跑完整 L0 + L1**

Run:

```powershell
cd D:\Codex\MacroDataETL
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff check .
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m ruff format --check .
& "D:\Codex\venv-pandas2\Scripts\python.exe" -m pytest
```

Expected: ruff 两项全绿；pytest **27 passed**（smoke 5 + paths 10 + assert_env 7 + run_etl 5）。

- [ ] **Step 10: 给 `run_etl.sh` 打上可执行位（v0.1 §6.1 明确要求）**

Run:

```powershell
cd D:\Codex\MacroDataETL
git update-index --chmod=+x run_etl.sh
git ls-files -s run_etl.sh
```

Expected: 模式为 `100755`（不是 `100644`）。漏了这步，macOS 上 `launchd` 调用会 permission denied。

- [ ] **Step 11: 提交**

Run:

```powershell
cd D:\Codex\MacroDataETL
git add run_etl.py run_etl.bat run_etl.sh tests/test_run_etl.py
git diff --cached --name-only
git status --porcelain
```

Expected: 4 个文件；`git status --porcelain` 里**没有 `.env`**。

```powershell
$msg = @'
feat(entry): wire the environment guard into every entry point

Add the ETL entry point and its Windows and macOS launchers. At M0 the
entry point performs no fetching; it loads machine config, passes the
environment guard, and verifies the configuration is complete.

That order is the point and is asserted by a test: the guard runs before
any data directory is resolved, so using the wrong interpreter fails
before it can write anything. The launchers read MCD_PYTHON from .env
instead of relying on activate, removing the forgot-to-activate failure
class entirely.

Agent-Task: M0-T1
Agent-Decision: Use distinct exit codes for guard failure and missing configuration so a scheduler log can tell them apart without parsing messages
Agent-Limitation: run_etl.sh is untested on macOS in M0 because development happens on Windows; it is exercised at M4 when launchd is configured
'@
git commit -q -m $msg
git log --oneline -6
```

Expected: 最新一行 `feat(entry): wire the environment guard into every entry point`，其下依次是 assert_env、paths、smoke_env、两个 requirements、scaffold 共 6 个提交。

---

### Task 8: 阶段收尾——把判定证据固化进 spec

**Files:**
- Modify: `d:\Codex\MacroEcoData\.obsidian\plugins\mcd\docs\superpowers\specs\2026-10-11-m0-contract-and-validation-gate-design.md`（§16 表格）

**Interfaces:**
- Consumes: Task 4 Step 5/6 的两份冒烟输出、Step 7 的判定结果、Task 6 Step 5 的门禁双向验证输出
- Produces: spec §16 中一条已实测事实，使退出标准 #13 有据可查；阶段 2 的执行者由此知道该用哪个解释器

- [ ] **Step 1: 确认退出标准 #13 的每一项证据都在手上**

逐项核对，缺任何一项就回到对应任务补跑，**不要用「应该没问题」代替证据**（verification-before-completion）：

| 证据 | 来源 | 是否已取得 |
|---|---|---|
| 环境A 的 `import akshare, pandas` 版本输出 | Task 4 Step 5 | ☐ |
| 环境A 的一次真实抓取结果（`OK rows=...`） | Task 4 Step 5 | ☐ |
| 环境B 的 `import akshare, pandas` 版本输出 | Task 4 Step 6 | ☐ |
| 环境B 的一次真实抓取结果 | Task 4 Step 6 | ☐ |
| `assert_env` 对选定环境退出 0 | Task 6 Step 5 | ☐ |
| `assert_env` 对另一个环境退出 1 | Task 6 Step 5 | ☐ |
| `.env` 中 `MCD_PYTHON` 已写入且 `.env` 未入库 | Task 4 Step 8 | ☐ |

- [ ] **Step 2: 把判定结果写进 spec §16**

在 spec `## 16. §M 已实测的环境事实` 表格末尾追加一行，`<...>` 处填 Task 4 的真实输出：

```markdown
| 双环境运行期冒烟（退出标准 #13） | 环境A `pandas <版本>` → `<SMOKE PASS via ... / SMOKE FAIL: ...>`（exit `<码>`）；环境B `pandas <版本>` → `<结果>`（exit `<码>`）。按 §4.5 判定规则选定 **环境< A/B >**，`MCD_PYTHON=<绝对路径>`。`assert_env` 对选定环境退 0、对另一个退 1（已验证） |
```

若某侧失败，**必须把失败堆栈的原文一并写入**（spec §4.5 第 4 步的要求），不要只写「失败」。

- [ ] **Step 3: 若判定为环境B，同步修正 spec §17 假设 3**

仅当 Task 4 Step 7 判定为环境B 时执行：把 §17 假设 3 中「已由 `pip install --dry-run` 证明可共存」之后补一句，说明共存成立但**运行期在 pandas 2.3.3 上失败**，失败原因摘要指向 §16 新增行。

若判定为环境A，则 §17 假设 3 无需改动——它已声明运行期由冒烟判定回答。

- [ ] **Step 4: 提交（插件仓，不是 ETL 仓）**

Run:

```powershell
cd "d:\Codex\MacroEcoData\.obsidian\plugins\mcd"
git add docs/superpowers/specs/2026-10-11-m0-contract-and-validation-gate-design.md
git diff --cached --name-status
git diff --cached --name-only | Select-String -Pattern "^main\.js$|^node_modules/"
```

Expected: 恰好 1 个 `M` 条目；泄漏检查为空。

```powershell
$msg = @'
docs(m0): record the measured dual-environment smoke verdict

Fill in exit criterion 13 with the actual smoke output from both
environments and the resulting MCD_PYTHON choice, replacing the
previously unverified runtime-compatibility assumption.

Agent-Task: M0-T1
Agent-Decision: Record the losing environment's failure verbatim rather than only the winner, so the pandas 3 migration question stays answerable later
Agent-Limitation: None beyond what the smoke run itself could observe; a single fetch does not prove every akshare endpoint works on the chosen pandas
'@
git commit -q -m $msg
git log --oneline -1
```

Expected: 一行 `docs(m0): record the measured dual-environment smoke verdict`。

- [ ] **Step 5: 核对阶段 1 的退出标准达成情况**

| spec §14 条目 | 状态 | 依据 |
|---|---|---|
| #13 双环境冒烟判定完成，`MCD_PYTHON` 已写入 `.env` | 应达成 | Task 4 Step 7/8 + Task 6 Step 5 + Task 8 Step 1 核对表 |
| #9 ETL 仓 L0/L1 全绿 | 部分达成 | Task 7 Step 9 已绿；#9 的完整达成还需阶段 2/3 的 schema 与 policy 测试 |

其余 11 条属阶段 2/3/4，本阶段**不应**声称达成。如实报告部分完成，不夸大（D5）。

---

## 阶段完成定义

以下全部为真才算阶段 1 完成：

1. `D:\Codex\MacroDataETL` 是 git 仓，含 7 个提交（scaffold、两个 requirements、smoke_env、paths、assert_env、entry）。
2. `D:\Codex\venv-pandas2` 与 `D:\Codex\venv-akshare` 均存在，pandas 大版本分别为 2 与 3，两者都装了 akshare 1.19.1。
3. `.env` 存在且含 `MCD_PYTHON`，`.env` **未被 git 跟踪**。
4. `ruff check .`、`ruff format --check .`、`pytest` 三项在选定环境下全绿，27 passed。
5. `run_etl.bat` 端到端退出 0；用错误解释器直跑 `run_etl.py` 退出 1。
6. `run_etl.sh` 的 git 模式是 `100755`。
7. spec §16 已追加双环境冒烟实测行，插件仓已提交该修订。
8. 退出标准 #13 的 7 项证据全部取得（Task 8 Step 1 核对表无空项）。

## 遗留问题（需在阶段 2 开始前裁决，不阻塞本阶段）

1. **`D:\Codex\MacroDataETL` 的 git 远端**：本阶段只做本地 `git init`，未配置 remote。阶段 3 的验证报告要作为关闭 U1/U3 的证据入 Git，本地提交已足够；但若需要备份或协作，须先决定托管位置。
2. **`AKShareWebapp` 是否改用环境A**：环境A 满足它声明的 `akshare>=1.12` + `pandas>=2.0`，但它还需要 `fastapi`/`uvicorn`/`aiofiles`，而 spec §4.4 明确不把这些装进环境A。是否要为它单独建第三个环境，或放宽环境A 的范围，属用户裁决。本阶段**不碰** `AKShareWebapp`。
3. **阶段 2 的执行者需要知道 `MCD_PYTHON`**：它写在 `.env` 里而非入库，因此阶段 2 计划的第一步必须是读 `.env` 取得解释器路径，不能沿用本计划里硬编码的 `venv-pandas2` 路径。
