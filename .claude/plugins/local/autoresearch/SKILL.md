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

Before the first iteration, initialize loop state via Bash:

```bash
EXPERIMENT_COUNT=0
BEST_METRIC=""
BEST_HYPOTHESIS="(none)"
START_TIME=$(date +%s)
```

Query SQLite for any prior runs (supports resuming):

```bash
sqlite3 autoresearch.db "SELECT COUNT(*), MIN(CASE WHEN kept=1 THEN metric_value END) FROM experiments;" 2>/dev/null
```

If prior experiments exist and the user invoked with no `--reset` flag, load the previous best metric into `BEST_METRIC` and inform the user: "Resuming from N prior experiments. Best metric so far: <value>."

## The Loop

Begin the experiment loop. At the top of each iteration:

```bash
EXPERIMENT_COUNT=$((EXPERIMENT_COUNT + 1))
ITERATION_START=$(date +%s)
echo "=== Experiment $EXPERIMENT_COUNT ==="
```

### Step 1 — Read program.md

Read `program.md` in full. Note:
- The research direction (what to improve)
- All constraints (NEVER violate these)
- The first unchecked hypothesis (`- [ ]`). If all are checked, generate a new hypothesis based on completed experiment findings.
- The metric direction (`# Metric Direction: lower` or `higher`; default to lower if absent)

### Step 2 — Propose a change

Select the first unchecked hypothesis from `program.md`. State your proposed change explicitly before editing:

> "Experiment N: [hypothesis text] — I will [specific change description]"

Edit `train.py` with exactly one atomic change. Do not change anything outside the scope of the hypothesis.

### Step 3 — Commit the change

```bash
git add train.py
git commit -m "autoresearch exp $EXPERIMENT_COUNT: <hypothesis summary>"
EXPERIMENT_COMMIT=$(git rev-parse HEAD)
```

## Metric Extraction

### Step 4 — Run training

Run the training script and capture all output. The training command is `python train.py` unless `program.md` specifies otherwise under `# Training Command`.

```bash
TRAINING_OUTPUT=$(python train.py 2>&1)
TRAINING_EXIT=$?
echo "$TRAINING_OUTPUT"
```

If `TRAINING_EXIT` is non-zero, treat as a failed experiment — jump to **Error Handling**.

### Step 5 — Extract metric

Scan `TRAINING_OUTPUT` for known metric patterns in this order:

1. `val_bpb: <float>` — lower is better
2. `val_loss: <float>` — lower is better
3. `val_acc: <float>` or `val_accuracy: <float>` — higher is better
4. `accuracy: <float>` — higher is better
5. `loss: <float>` — lower is better (last occurrence in output)

Use the last occurrence of the matched pattern (final epoch value).

```bash
METRIC_VALUE=$(echo "$TRAINING_OUTPUT" | grep -oP 'val_bpb:\s*\K[0-9.]+' | tail -1)
# If empty, try val_loss, then val_acc, etc.
```

If no pattern matches, use LLM judgment: read the last 20 lines of `TRAINING_OUTPUT` and identify the primary validation metric value. State which metric you found.

If no metric can be extracted at all, treat as a failed experiment — jump to **Error Handling**.

Override direction with `# Metric Direction` from `program.md` if present.

## Keep or Discard

### Step 6 — Compare metric

Compute delta against `BEST_METRIC`. For lower-is-better metrics, improvement is negative delta. For higher-is-better, improvement is positive delta.

```bash
# Pseudocode — execute via python -c or bc
DELTA=$(python -c "print(round($METRIC_VALUE - ${BEST_METRIC:-$METRIC_VALUE}, 6))")
```

If `BEST_METRIC` is empty (first experiment), always keep.

**Improved** (delta is in the favorable direction): keep the commit, update `BEST_METRIC` and `BEST_HYPOTHESIS`:

```bash
BEST_METRIC=$METRIC_VALUE
BEST_HYPOTHESIS="exp $EXPERIMENT_COUNT: <hypothesis text>"
KEPT=1
echo "✓ Kept — new best: $METRIC_VALUE (delta: $DELTA)"
```

**Not improved**: revert:

```bash
git revert --no-edit HEAD
KEPT=0
echo "✗ Discarded — metric: $METRIC_VALUE (delta: $DELTA)"
```

### Step 7 — Update program.md

Mark the tested hypothesis as checked in `program.md`:

Change `- [ ] <hypothesis>` → `- [x] <hypothesis>`

Append to `# Completed Experiments`:

```
- [kept/discarded] <hypothesis> — metric: <value>, delta: <delta>
```

## SQLite Logging

### Step 8 — Log to SQLite

Capture the diff of the experiment (before revert if discarded):

```bash
DIFF=$(git show $EXPERIMENT_COMMIT --stat --unified=3)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")
HYPOTHESIS_TEXT="<hypothesis text from program.md>"

sqlite3 autoresearch.db "INSERT INTO experiments
  (timestamp, hypothesis, diff, metric_value, delta, kept)
  VALUES ('$TIMESTAMP', '$HYPOTHESIS_TEXT', '$DIFF', $METRIC_VALUE, $DELTA, $KEPT);"
```

## results.md Regeneration

### Step 9 — Regenerate results.md

After every iteration, regenerate `results.md` from SQLite:

```bash
TOTAL=$(sqlite3 autoresearch.db "SELECT COUNT(*) FROM experiments;")
KEPT_COUNT=$(sqlite3 autoresearch.db "SELECT COUNT(*) FROM experiments WHERE kept=1;")
FAILED_COUNT=$(sqlite3 autoresearch.db "SELECT COUNT(*) FROM experiments WHERE error IS NOT NULL;")
ROWS=$(sqlite3 autoresearch.db -separator '|' \
  "SELECT id, hypothesis, metric_value, delta, kept FROM experiments ORDER BY id DESC;")
```

Write `results.md` with this structure:

```markdown
# Autoresearch Results
Best: <BEST_METRIC> (<BEST_HYPOTHESIS>)
Total experiments: <TOTAL> | Kept: <KEPT_COUNT> | Failed: <FAILED_COUNT>

## History
| # | hypothesis | metric | delta | kept |
|---|---|---|---|---|
<one row per experiment, newest first>
```

For each row: delta shown as `+X.XXX` or `-X.XXX`; kept shown as `✓` or `✗`; failed shown as `✗ (error)`.

```bash
git add results.md
git commit -m "autoresearch: update results after exp $EXPERIMENT_COUNT"
```

## Error Handling

If training exits non-zero, or metric extraction fails:

```bash
ERROR_TEXT=$(echo "$TRAINING_OUTPUT" | tail -20)
TIMESTAMP=$(date -u +"%Y-%m-%dT%H:%M:%SZ")

sqlite3 autoresearch.db "INSERT INTO experiments
  (timestamp, hypothesis, diff, metric_value, delta, kept, error)
  VALUES ('$TIMESTAMP', '$HYPOTHESIS_TEXT', '$DIFF', NULL, NULL, 0, '$ERROR_TEXT');"
```

Revert `train.py`:

```bash
git revert --no-edit HEAD 2>/dev/null || git checkout HEAD -- train.py
```

Append to `program.md` completed experiments:

```
- [error] <hypothesis> — training failed: <first line of error>
```

Print: `✗ Experiment $EXPERIMENT_COUNT failed — reverted. Continuing.`

Regenerate `results.md` (failed count will increment). Then continue to the next iteration — do NOT stop.

## Stopping Conditions

At the end of each iteration, check in order:

```bash
NOW=$(date +%s)
ELAPSED=$((NOW - START_TIME))
```

1. If `MAX_EXPERIMENTS` is set and `EXPERIMENT_COUNT >= MAX_EXPERIMENTS`: stop.
2. If `MAX_SECONDS` is set and `ELAPSED >= MAX_SECONDS`: stop.
3. Otherwise: continue to next iteration.

## Exit Summary

When the loop ends (any stopping condition or Ctrl+C), print:

```
=== Autoresearch Complete ===
Experiments run:  <EXPERIMENT_COUNT>
Kept:             <KEPT_COUNT>
Failed:           <FAILED_COUNT>
Best metric:      <BEST_METRIC>
Best change:      <BEST_HYPOTHESIS>
Results saved to: results.md and autoresearch.db
```

Then stop. Do not make any further changes to `train.py`.
