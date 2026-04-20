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
## State Initialization
## The Loop
## Metric Extraction
## Keep or Discard
## SQLite Logging
## results.md Regeneration
## Error Handling
## Stopping Conditions
## Exit Summary
