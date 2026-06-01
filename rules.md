# Project Development Rules: Preprocessing Studio

This document defines the strict architectural standards, coding guidelines, UI/UX requirements, and styling rules established for the Premium Image Preprocessing Studio project.

---

## 1. Strict Fail-Fast Backend Architecture

The processing engine operates on a zero-tolerance, fail-fast model. Implicit type conversions, defensive parameter defaulting, and automatic range adjustments are strictly banned.

### A. Parameter Type & Range Checks
* **Strict Type Equality**: Parameters decoded from JSON must be validated via exact type checking (`type(val) is expected_type`). Implicit casting (such as treating `5.0` as an integer) must fail with a `TypeError`.
* **Zero Coercion**: Functions must not silently clamp, adjust, or approximate invalid inputs.
* **Positive Odd Constraints**: Kernel sizes for standard image filtering (like Gaussian, Median, Box blur) must be strictly validated as positive, odd integers. Even values must throw a `ValueError` immediately instead of being adjusted (e.g. by adding $+1$).

### B. Core Assertion Helpers
Always use the established validation helper suite in `preprocceser.py` for uniform error raising:
* `check_type(val, expected_type, name)`: Validates exact type.
* `check_one_of(val, allowed_set, name)`: Validates that strings belong to a supported configuration.
* `check_range(val, min_val, max_val, name)`: Enforces numerical bounds.
* `check_odd_positive(val, name, min_val)`: Validates mathematical odd constraints for kernels.

---

## 2. Unhandled Exception Propagation & Tracebacks

To preserve debugging integrity and prevent masked bugs in production, request-handling errors must not be caught locally.

* **No Route-Level `try...except` Blocks**: The standard `/process` route must execute pipeline steps directly. Local `try...except` wrappers that format errors as generic string responses are forbidden.
* **Global Interception**: bubbled backend exceptions must be intercepted globally at the Flask application level using `@app.errorhandler(Exception)`.
* **Traceback Serialization**: The global handler must capture the full traceback (`traceback.format_exc()`), log it clearly to the standard error (`sys.stderr`), and serialize it as a JSON payload:
  ```json
  {
    "error_type": "ValueError",
    "message": "Parameter 'kernel_x' must be a positive odd integer >= 1. Got 4.",
    "traceback": "..."
  }
  ```
  Serve this payload with a status code of `HTTP 500` (or `HTTP 400` where explicitly applicable).

---

## 3. Multi-Channel Color Processing Integrity

All thresholding, binarization, and modular filtering algorithms must support both BGR color channel and Grayscale single-channel matrices natively.

* **Color Channel Mode (`'Color Channels'`)**:
  * For multi-channel algorithms running on BGR inputs, split the image into separate B, G, and R channels using `cv2.split()`.
  * Execute the calculations on each channel independently, and merge them back together using `cv2.merge()`.
* **Grayscale Mode (`'Grayscale'`)**:
  * If a grayscale channel mode is requested on a multi-channel color matrix, convert the image mid-flight using `cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)` before executing the thresholding logic.
* **Array-Based Color Blending**:
  * When applying threshold fill actions or mask overlays on BGR matrices, ensure `fill_color` is cast to a NumPy array `numpy.ndarray([b, g, r], dtype=np.uint8)` to guarantee bulletproof channel broadcasting inside OpenCV operations and NumPy conditional logic.

---

## 4. UI/UX Layout & Usability Constraints

The user interface must look premium, modern, and remain responsive and functional under extreme states.

* **Flexbox & Grid Shrink Safety**:
  * Action panels, header titles, and sidebar wrappers must be protected from clipping.
  * Always use `flex-shrink: 0;` on interactive button bars (such as `.pipeline-card-actions`) to prevent them from shrinking or getting pushed off-screen.
  * Implement `white-space: nowrap; overflow: hidden; text-overflow: ellipsis; flex: 1; min-width: 0;` on titles and step names (such as `.step-name`) so they truncate gracefully instead of expanding and breaking header widths.
* **Visual States for Disabled Actions**:
  * Any element containing a `disabled` attribute (such as Move Up/Down arrows on first/last cards) must reflect that state visually.
  * Enforce `.action-btn:disabled { opacity: 0.35; cursor: not-allowed; pointer-events: none; }` to keep interface interactions predictable.
* **Rich Glassmorphic Aesthetics**:
  * Maintain the premium dark theme using harmonic CSS tokens, subtle micro-interactions, blur overlays (`backdrop-filter`), and clean slide-in animations for diagnostics.
