# Developer Agent Guide (`AGENTS.md`)

Non-obvious constraints and architecture details an agent would likely miss without help.

---

## 🚨 Critical: Entrypoint Spelling

`preprocceser.py` — double **c**, single **s** (`pre-pro-c-c-e-s-e-r`). **Do NOT** run `preprocessor.py` (the algorithms library) or `preprocesser.py` (doesn't exist).

---

## Developer Commands

```bash
python preprocceser.py                 # Start on http://localhost:5001/index.html
```
Dependencies: `flask`, `numpy`, `opencv-python` (`cv2`).

No test/lint/typecheck framework — verify manually in browser. Default test image: `testimg.png`.

---

## Architecture

### Backend (`preprocceser.py`)
- **`/schema` GET** — returns `OPERATIONS_SCHEMA` from `schema.py` (drives all frontend UI generation).
- **`/process` POST** — validates pipeline DAG (`schema.verify_pipeline_dag`), validates params (`schema.validate_step_params`), executes via `PROCESSING_REGISTRY` (`processor.py`).
- **`/clear-cache` POST** — invalidates in-memory matrix cache (`_pipeline_cache_matrices`). **Must call this after modifying processing algorithms** or intermediate steps return stale results.
- Caching uses divergence-index scan: compares new pipeline to `_last_pipeline_state`, re-executes only dirty steps.

### Frontend (ES modules, no bundler)
- `state.js` — single state singleton + DOM element cache.
- `ui.js` — schema-driven DOM rendering (`renderPipeline`, `createPipelineCardElement`).
- `viewer.js` — canvas painting, zoom/pan, comparison modes (Split/Blend/Diff/X-Ray).
- `app.js` — orchestration: event binding, `processImage()`, preset import/export.

---

## Adding / Modifying an Operation

You **must** update all three layers:

1. **`schema.py`** — add entry to `OPERATIONS_SCHEMA`. Defines params with types, ranges, `visible_if` conditional visibility, and `odd_only` constraint for blurs.
2. **`processor.py`** — write `apply_*` function, register in `PROCESSING_REGISTRY` (dict at line 1391).
3. **Frontend** (`ui.js` handles schema-driven rendering automatically for new params; no manual UI wiring needed unless adding custom controls).

---

## Cache Gotchas

- Steps have a universal **Step Strength** (0–100% dry/wet blend) applied via `cv2.addWeighted` by the server. This is **not** part of the operation schema — it's added automatically by `preprocceser.py` for any step with a `strength` field.
- The `blend` operation receives the full `_pipeline_cache_matrices` to look up its blend source by step ID.
