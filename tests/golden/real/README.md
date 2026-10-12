# real/ — intentionally empty at M0 (offline)

This directory holds fixtures derived from **real** probe data (G25), serving
T2-1 "full replay consistency":

- `raw/` — a real `raw_snapshot_v1` file with a genuine `payload_hash`.
- `processed/` — populated after M1 `normalize` completes.

Both require a live network fetch against EastMoney/NBS (T1-2). Freezing them
without real data would be fabrication (D5), so at M0 they are deliberately left
empty. The `contract/` set is the authoritative validation target until the live
probe runs. See spec §17 assumption 1 and §8.

This `.gitkeep`-style README keeps the directory tracked in Git while it is empty.
