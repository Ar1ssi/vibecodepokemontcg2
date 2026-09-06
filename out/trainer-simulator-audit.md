# Standard 2026-2027 Trainer, Tool, Supporter & Stadium Simulator Audit

Audited **467** prints (**243** unique cards) across all Standard sets.

| Metric | Prints | Unique Cards | % of Format |
|---|---:|---:|---:|
| **Works (Automated / Guided / Passive)** | 467 | 243 | 100% |
| **Partial (Announce-Only Guidance)** | 0 | 0 | 0% |
| **Broken / Unrecognizable / Failed** | 0 | 0 | 0% |

### Breakdown by Card Type

| Type | Total Unique | Works | Partial | Broken |
|---|---:|---:|---:|---:|
| **Item** | 87 | 87 | 0 | 0 |
| **Supporter** | 88 | 88 | 0 | 0 |
| **Tool** | 38 | 38 | 0 | 0 |
| **Stadium** | 30 | 30 | 0 | 0 |

### Breakdown by Execution Engine Mode

| Execution Mode | Prints | Unique | Description |
|---|---:|---:|---|
| **Automated (`automated`)** | 99 | 48 | Engine directly alters game state (draws, discards, shuffles) |
| **Guided Picker (`guided-picker`)** | 233 | 117 | Opens interactive modal (deck search, recursion, choice picker) |
| **Attached Tool (`attached-tool`)** | 53 | 38 | Applies attached stat/rule modifiers (HP bonus, retreat) |
| **Active Stadium (`active-action`)** | 48 | 30 | Triggerable once-per-turn or setup stadium actions |
| **Passive Stadium (`passive-continuous`)** | 0 | 0 | Continuous board modifier (bench expansion, damage shield) |
| **Announce-Only (`announce-only`)** | 0 | 0 | Announces instructions in chat log for manual board move |
| **Broken / Failed (`broken`)** | 0 | 0 | Unrecognized effect or runtime exception |

## Announce-Only Cards (Partial Guidance)

