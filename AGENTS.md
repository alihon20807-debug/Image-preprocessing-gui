# Developer Agent Guide (`AGENTS.md`)

This guide outlines non-obvious constraints, architecture details, and commands necessary to work effectively on this repository.

---

## 🚨 Critical Filename Spelling Quirk
* **Backend Entrypoint:** `preprocceser.py` (spelled with double **"c"** and **"s"** -> `pre-pro-c-c-e-s-e-r.py`).
  * **Do NOT** attempt to run `preprocessor.py` (which is the algorithms library) or `preprocesser.py` (which does not exist) as the entrypoint.

---

## 🛠️ Developer Commands & Environment

### Running the App
* **Start local backend server:**
  ```bash
  python preprocceser.py
  ```
  * Serves on: `http://localhost:5001/index.html` (acts as static server for the frontend in `.`).
  * Main dependencies: `flask`, `numpy`, `opencv-python` (`cv2`).

### Linting & Testing
* **No local verification runners:** There are no configured test framework (e.g., pytest, Jest), linter, or compiler scripts in this project.
* **Verification strategy:** Manual verification by running the server on port 5001 and testing functionality inside the browser.

---

## 🧩 Architectural Flow & Synchronization

The application is an interactive OpenCV image processing builder powered by the **Layer Studio** pipeline.

### How Requests Flow
1. Frontend makes API requests to `/schema` and `/process`.
2. `preprocceser.py` validates the uploaded step DAG topological sorting (`schema.verify_pipeline_dag`) and checks parameters (`schema.validate_step_params`).
3. Core processing calls mapped functions in `PROCESSING_REGISTRY` (`processor.py`).

### Backend Matrix Caching (Gotcha!)
* `preprocceser.py` maintains an in-memory cache of intermediate matrices (`_pipeline_cache_matrices`).
* If you modify any processing algorithm, previous steps may still return cached results. 
* To fully invalidate the cache, call `POST /clear-cache` (using the UI's reload features) or re-upload the target image.

### Adding / Modifying Operations
When adding a new processing operation, you **must** update:
1. `schema.py`: Define properties in `OPERATIONS_SCHEMA` (handles parameter validation, constraints like `odd_only` for blurs, and visibility).
2. `processor.py`: Write the `apply_*` processing function and register it in `PROCESSING_REGISTRY`.
3. Frontend (`ui.js` / `app.js`): Register UI elements to match the new schema properties.
