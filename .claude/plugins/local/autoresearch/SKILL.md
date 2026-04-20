---
name: autoresearch
description: Run a Karpathy-style autonomous ML experiment loop. Proposes atomic changes to train.py, runs training, keeps improvements, logs results. Use when you want to run overnight experiments on an ML training file.
---

# Autoresearch

## Overview

You are running an autonomous ML experiment loop. Each iteration you will:
1. Read `program.md` for research direction and constraints
2. Propose one atomic, hypothesis-driven change to `train.py`
3. Git commit the change
4. Run training and capture output
5. Extract the target metric
6. Keep the commit if the metric improved; revert if not
7. Log the result to SQLite and regenerate `results.md`
8. Check stopping conditions and repeat

**One change per iteration. Never make multiple changes at once.**

## Invocation

Parse arguments from the invocation line:
- `--experiments N` — stop after N experiments (integer)
- `--time Xh` or `--time Xm` — stop after X hours or minutes of wall clock time
- Both flags may be used together — stop at whichever hits first
- If neither flag is provided, loop until the user presses Ctrl+C

Store parsed values as:
```bash
MAX_EXPERIMENTS=<N or "">
MAX_SECONDS=<seconds or "">
```
## Bootstrap

Before starting the loop, check for required files.

### SQLite database

```bash
sqlite3 autoresearch.db "CREATE TABLE IF NOT EXISTS experiments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  timestamp TEXT NOT NULL,
  hypothesis TEXT NOT NULL,
  diff TEXT NOT NULL,
  metric_value REAL,
  delta REAL,
  kept INTEGER NOT NULL DEFAULT 0,
  error TEXT
);"
```

### program.md

Check if `program.md` exists:

```bash
test -f program.md && echo "exists" || echo "missing"
```

**If missing:** Read `train.py` and generate `program.md` using this template, filling in the blanks based on what you observe in the training file (metric names in print statements, model class names, optimizer type):

```markdown
# Research Direction
Improve <METRIC_NAME> on the <MODEL_NAME> training run.

# Metric Direction
<lower or higher>

# Constraints
- Do not change the optimizer type
- Changes must be single, atomic modifications

# Hypotheses to Explore
- [ ] <hypothesis inferred from train.py — e.g., "Try cosine LR schedule">
- [ ] <hypothesis inferred from train.py — e.g., "Add gradient clipping at 1.0">
- [ ] <hypothesis inferred from train.py — e.g., "Increase dropout by 0.05">

# Completed Experiments
```

Tell the user: "No `program.md` found. Generated a starter file — please review it and add your research direction before the loop begins. Press Enter to continue or Ctrl+C to edit first."

Wait for Enter.

### train.py baseline commit

Ensure `train.py` is committed so rollback is always clean:

```bash
git status --porcelain train.py
```

If `train.py` has uncommitted changes, commit them:

```bash
git add train.py
git commit -m "autoresearch: checkpoint train.py baseline"
```
## State Initialization
## The Loop
## Metric Extraction
## Keep or Discard
## SQLite Logging
## results.md Regeneration
## Error Handling
## Stopping Conditions
## Exit Summary
