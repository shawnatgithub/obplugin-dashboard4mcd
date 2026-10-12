# Golden fixtures (M0)

Two permanent fixture sets (G25). They serve different purposes and never merge.

## `contract/`

Synthetic boundary samples, frozen at M0. Real fetches cannot produce these on
demand, so they are authored to exercise the full contract surface:

- all 7 `reason_code` values (`capabilities.json`)
- all 4 `freshness` values (`manifest.json`)
- `revision > 1` append semantics (`retail_sales_total_yoy.json`)
- consecutive missing months stored as `null`, never `0` (`retail_sales_total.json`)
- `frequency: quarterly` → `INCOMPATIBLE_FREQUENCY` (`disposable_income_yoy.json`)
- `region: SH` → `INCOMPATIBLE_REGION` referent (`retail_sales_sh_yoy.json`)
- source-unsupported stub, branch B (`capabilities.json` → `shanghai_finance_quarterly`)
- `support` / `conflict` / `insufficient` signal states (`signals/signal_state.json`)

These files contain **no** "synthetic" marker field — that would mutate the
A-class contract. Provenance is carried by this directory name, this README, and
`CHECKSUMS.sha256` (UI-UX §6: placeholders must be labelled, but not by polluting
the contract).

## `real/`

Derived from real probe data; serves T2-1 "full replay consistency".

- `real/raw/` — a real `raw_snapshot_v1` with `payload_hash`, frozen after the
  T1-2 live probe runs.
- `real/processed/` — populated after M1 `normalize` completes.

**Status at M0 (offline):** empty. Freezing `real/` requires a live network fetch
against EastMoney/NBS (T1-2). Until that runs, `real/` stays empty by design and
the contract set above is the authoritative validation target. See spec §17
assumption 1.

## Sync (G3)

This `tests/golden/` tree is the authoritative source. The plugin repo holds a
byte-identical copy plus the same `CHECKSUMS.sha256`. Any checksum mismatch fails
the plugin-side test, preventing dual-repo drift.
