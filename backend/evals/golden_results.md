# Golden set results

Run 2026-11-20 20:10 UTC · 32 hand-labelled leads × 2 runs = 64 analyses · failed runs: 0

| Metric | Result |
|---|---|
| Exact tier matches the human label | **64/64 (100%)** |
| Within one tier | 64/64 (100%) |
| Same tier on every run | 32/32 leads |
| Median time per analysis | 2.1 s |
| Model that answered | gemini-3.5-flash-lite: 64 |

## Confusion table (rows = human label, columns = predicted)

| label \ predicted | hot | warm | cold | junk | total |
|---|---|---|---|---|---|
| **hot** | 16 | 0 | 0 | 0 | 16 |
| **warm** | 0 | 18 | 0 | 0 | 18 |
| **cold** | 0 | 0 | 16 | 0 | 16 |
| **junk** | 0 | 0 | 0 | 14 | 14 |

## Misses (0 leads)

None.
