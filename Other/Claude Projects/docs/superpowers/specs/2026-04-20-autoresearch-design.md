# Autoresearch Skill — Design Spec
*Date: 2026-04-20*

## Overview

A Claude Code skill inspired by Karpathy's autoresearch project. Claude acts as the loop, autonomously proposing and testing atomic changes to an ML training file, evaluating a single metric, and keeping only improvements — repeating until a time limit, experiment count, or manual interrupt is reached.

---

## Invocation

```
/autoresearch [--experiments N] [--time Xh]
```

Both flags are optional and combinable (stop at whichever hits first). If neither is provided, the loop runs until Ctrl+C.

---

## Architecture

The skill is a single `SKILL.md` at `H:\.claude\plugins\local\autoresearch\SKILL.md`. Claude executes the loop using its built-in tools (Read, Edit, Bash). No generated scripts or external dependencies.

### Per-iteration loop

1. Read `program.md` for research direction, constraints, and hypothesis list
2. Propose one atomic, hypothesis-driven change to `train.py`
3. Git commit the change (enables clean rollback)
4. Run training, capture stdout/stderr
5. Extract metric: scan for common patterns (`val_loss`, `val_bpb`, `accuracy`, etc.); fall back to LLM judgment if none match. Claude also infers direction (lower-is-better for loss/bpb, higher-is-better for accuracy) from metric name; user can override in `program.md` with `# Metric Direction: lower` or `higher`
6. Compare metric to best result so far using inferred direction
7. Keep commit if improved; `git revert --no-edit HEAD` if not
8. Append result to SQLite + regenerate `results.md`
9. Check stopping conditions; repeat or exit

### First-run bootstrap

If `program.md` does not exist, Claude inspects `train.py` to infer the metric, model architecture, and a few seed hypotheses, then generates a starter `program.md` before beginning the loop.

---

## `program.md` Format

The human-AI interface for steering research direction. Claude reads this every iteration and writes findings back after each experiment.

```markdown
# Research Direction
Improve validation bits-per-byte (val_bpb) on the GPT training run.

# Constraints
- Do not change the optimizer type
- Keep batch size fixed at 64
- Changes must be single, atomic modifications

# Hypotheses to Explore
- [ ] Try cosine LR schedule instead of linear
- [ ] Increase dropout from 0.1 to 0.2
- [ ] Add gradient clipping at 1.0

# Completed Experiments
<!-- Claude appends one-line findings here after each run -->
```

**Behaviors:**
- Claude checks off hypotheses as tested
- Constraints are hard rules — never violated
- Human edits between runs to steer direction (primary control surface)
- Claude appends findings as: `- [kept/discarded] hypothesis — metric delta`

---

## Results Tracking

### SQLite (`autoresearch.db`) — source of truth

| column | type | notes |
|---|---|---|
| `id` | int | auto-increment |
| `timestamp` | text | ISO 8601 |
| `hypothesis` | text | what Claude tried |
| `diff` | text | the actual code change |
| `metric_value` | real | extracted metric |
| `delta` | real | change vs. best prior result |
| `kept` | bool | 1 = improvement kept |
| `error` | text | null if clean run |

### `results.md` — human-readable, regenerated each iteration

```markdown
# Autoresearch Results
Best val_bpb: 2.241 (experiment 14, cosine LR schedule)
Total experiments: 23 | Kept: 8 | Failed: 2

## History
| # | hypothesis | metric | delta | kept |
|---|---|---|---|---|
| 23 | increased weight decay to 0.1 | 2.289 | +0.048 | ✗ |
| 14 | cosine LR schedule | 2.241 | -0.031 | ✓ |
...
```

---

## Error Handling

On experiment failure (training errors, non-zero exit, metric parse failure):
1. Log error text to SQLite `error` column
2. `git revert --no-edit HEAD` to restore `train.py`
3. Append failure to `program.md` completed experiments
4. Continue loop — do not stop

---

## Stopping Conditions

Checked after each iteration, in order:
1. `--experiments N` count reached
2. `--time Xh` wall-clock elapsed
3. User interrupt (Ctrl+C)

On exit: print summary (total experiments, kept count, best metric, best hypothesis).

---

## File Layout

```
<repo>/
├── train.py          # agent edits this
├── program.md        # research direction (auto-generated if missing)
├── results.md        # auto-regenerated each iteration
└── autoresearch.db   # SQLite results log
```

Skill file:
```
H:\.claude\plugins\local\autoresearch\SKILL.md
```
