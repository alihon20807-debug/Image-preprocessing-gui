# AGENTS.md — Preprocessing Studio

## Quick start
```bash
python3 preprocceser.py   # Flask dev server on http://localhost:5001
```
No npm/pip install needed — vanilla JS ES modules (`type="module"`), OpenCV assumed available.

## Architecture
- **Backend** (`preprocceser.py`): Flask app, port 5001, single `/process` POST endpoint. Divergence-index pipeline cache.
- **Processing** (`processor.py`): OpenCV functions registered in `PROCESSING_REGISTRY` dict. Validation helpers (`check_type`, `check_one_of`, `check_range`, `check_odd_positive`) are **stubs** — actual validation is inline.
- **Schema** (`schema.py`): `OPERATIONS_SCHEMA` dict drives the entire UI. Adding a new op requires: (1) schema entry, (2) processing function in registry.
- **Frontend** (vanilla JS): `state.js` → `ui.js` (schema-driven render) → `viewer.js` (comparison views) → `nodes.js` (LiteGraph DAG) → `app.js` (orchestration).

## Conventions
- **Fail-fast**: strict `type(val) is expected_type` checks, no coercion, no silent defaults.
- **Colors**: hex strings `#RRGGBB` throughout (both Python and JS). Fill colors use BGR order internally.
- **Kernel sizes**: always positive odd integers, validated with `check_odd_positive` (or inline equivalent).
- **Errors**: never caught at route level — propagate to `@app.errorhandler(Exception)` global handler.
- **Frontend**: `renderPipeline()` → `triggerDebouncedProcess()` (16 ms debounce) → `processImage()` (POST /process). AbortController cancels inflight requests.

## Key quirks
- No tests, no linter, no formatter, no CI — none configured.
- `processor.py` lines 7-20: four validation helpers exist as **stubs** (`pass`). Do not rely on them; validation is inline.
- Frontend uses LiteGraph (`litegraph.min.js`) for the node editor — only custom node types are registered (`image/load`, `image/preview`, `image/baseline`, `filter/*`, `layer/blend`).
- `comparison_baseline` sent as step ID string or `"original"`. Backend returns `"original"` literal string when baseline matches cached original (optimization).
- Image upload uses `"cached"` sentinel string to skip re-upload when image unchanged.
- `input_source: "previous"` is resolved to absolute step IDs before sending payload.
