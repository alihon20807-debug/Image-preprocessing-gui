from flask import Flask, request, jsonify
import base64
import cv2
import numpy as np
import os
import sys
import logging
import threading

# Initialize Flask with current directory as the static file source
app = Flask(__name__, static_folder='.', static_url_path='')

# Silence standard Werkzeug console logs for a clean console output
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# ----------------- OpenCV Modular Processing Functions (Registry Pattern) -----------------

# ----------------- OpenCV Modular Processing Functions (Registry Pattern) -----------------

from processor import PROCESSING_REGISTRY

# ----------------- Flask Routes -----------------

@app.route('/')
def index():
    return app.send_static_file('index.html')

@app.route('/schema', methods=['GET'])
def get_schema():
    from schema import OPERATIONS_SCHEMA
    return jsonify(OPERATIONS_SCHEMA)

@app.route('/clear-cache', methods=['POST'])
def clear_cache():
    global _cached_original_img, _pipeline_cache_matrices, _last_pipeline_state
    with _cache_lock:
        _cached_original_img = None
        _pipeline_cache_matrices.clear()
        _last_pipeline_state = []
    return jsonify({"status": "success", "message": "Backend matrix and original image cache cleared successfully."})

@app.errorhandler(Exception)
def handle_exception(e):
    import traceback
    tb = traceback.format_exc()
    # Print the traceback to the server console to ensure the server hard-logs/crashing feedback is fully visible
    sys.stderr.write(f"\n--- UNHANDLED PIPELINE CRASH ---\n{tb}--------------------------------\n")
    response = jsonify({
        "error_type": type(e).__name__,
        "message": str(e),
        "traceback": tb
    })
    response.status_code = 500
    return response

# Persistent memory caches for extreme responsiveness
_cached_original_img = None
_pipeline_cache_matrices = {}
_last_pipeline_state = []

_cache_lock = threading.Lock()

@app.route('/process', methods=['POST'])
def process():
    global _cached_original_img, _pipeline_cache_matrices, _last_pipeline_state
    
    with _cache_lock:
        params = request.json
        if not params:
            raise KeyError("Invalid request format: Top-level payload must be JSON.")
            
        if 'image' not in params:
            raise KeyError("Invalid request format: Top-level payload must contain an 'image' key.")
            
        img_b64 = params['image']
        
        image_changed = False
        if img_b64 and img_b64 != "cached":
            # New image uploaded! Decode and cache it.
            img_data = img_b64.split(',')[-1]
            img_bytes = base64.b64decode(img_data)
            nparr = np.frombuffer(img_bytes, np.uint8)
            img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
            if img is None:
                raise ValueError("Failed to decode image data.")
            _cached_original_img = img.copy()
            
            # Invalidate all cache entries completely on a new image
            _pipeline_cache_matrices.clear()
            _last_pipeline_state = []
            image_changed = True
        else:
            # Use cached original image
            if _cached_original_img is None:
                # If server restarted or cache got cleared, return CacheMissError
                response = jsonify({
                    "error_type": "CacheMissError",
                    "message": "Original image cache is empty. Please re-upload.",
                    "require_reupload": True
                })
                response.status_code = 400
                return response
            img = _cached_original_img.copy()
        
        if 'comparison_baseline' not in params:
            raise KeyError("Missing structural parameter: 'comparison_baseline'")
        comparison_baseline = params['comparison_baseline']
        
        if 'pipeline' not in params:
            raise KeyError("Missing structural parameter: 'pipeline'")
            
        pipeline = params['pipeline']
        if type(pipeline) is not list:
            raise TypeError(f"Pipeline must be an array list. Got {type(pipeline).__name__}")
            
        # Step 1 & 2: Validate DAG structure & parameters (returning 400 BadRequest on failure)
        from schema import verify_pipeline_dag, validate_step_params
        try:
            verify_pipeline_dag(pipeline)
            for step in pipeline:
                if not step.get('disabled', False):
                    validate_step_params(step['type'], step)
        except (ValueError, TypeError, KeyError) as val_err:
            response = jsonify({
                "error_type": "ValidationError",
                "message": str(val_err)
            })
            response.status_code = 400
            return response
            
        # Defensively evict obsolete cache keys that are not present in current pipeline
        active_ids = {step['id'] for step in pipeline}
        active_ids.add("original")
        
        cached_keys = list(_pipeline_cache_matrices.keys())
        for key in cached_keys:
            if key not in active_ids:
                _pipeline_cache_matrices.pop(key, None)
                
        # Always ensure original image is available in matrix cache
        _pipeline_cache_matrices["original"] = _cached_original_img.copy()
        
        # Step 3: Backend-Driven Cache Invalidation (Divergence Index Scan)
        divergence_idx = len(pipeline)
        
        if not image_changed:
            # Scan side-by-side to find the first point of divergence
            for idx in range(min(len(pipeline), len(_last_pipeline_state))):
                new_step = pipeline[idx]
                old_step = _last_pipeline_state[idx]
                
                if new_step != old_step:
                    divergence_idx = idx
                    break
            else:
                if len(pipeline) != len(_last_pipeline_state):
                    divergence_idx = min(len(pipeline), len(_last_pipeline_state))
        else:
            divergence_idx = 0
            
        # Eviction: Remove step cache entries from the divergence point to the end of the old pipeline
        for idx in range(divergence_idx, len(_last_pipeline_state)):
            old_step = _last_pipeline_state[idx]
            old_step_id = old_step['id']
            _pipeline_cache_matrices.pop(old_step_id, None)
            
        # Step 4: Pipeline Execution Loop
        for idx, step in enumerate(pipeline):
            step_id = step['id']
            step_type = step['type']
            disabled = step.get('disabled', False)
            
            if disabled:
                # If disabled, its output is its resolved input
                input_src = step.get('input_source', 'previous')
                if input_src == 'previous':
                    input_key = pipeline[idx - 1]['id'] if idx > 0 else "original"
                else:
                    input_key = input_src
                    
                out_img = _pipeline_cache_matrices.get(input_key, img).copy()
                _pipeline_cache_matrices[step_id] = out_img
                continue
                
            # Determine if this step can be skipped (clean step)
            if idx < divergence_idx and step_id in _pipeline_cache_matrices:
                # Clean cache hit, skip execution!
                continue
                
            # Execute dirty step
            # 1. Resolve input image
            input_src = step.get('input_source', 'previous')
            if input_src == 'previous':
                input_key = pipeline[idx - 1]['id'] if idx > 0 else "original"
            else:
                input_key = input_src
                
            if input_key not in _pipeline_cache_matrices:
                raise KeyError(f"Cache reference missing: '{input_key}' not found in cached step matrices.")
                
            input_img = _pipeline_cache_matrices[input_key]
            
            # 2. Get processing function from registry
            if step_type not in PROCESSING_REGISTRY:
                raise KeyError(f"Registry Mapping Miss: Operation type '{step_type}' is unknown.")
            process_func = PROCESSING_REGISTRY[step_type]
            
            # 3. Invoke function (only pass cache_matrices to 'blend')
            if step_type == 'blend':
                out_img = process_func(input_img, step, _pipeline_cache_matrices)
            else:
                out_img = process_func(input_img, step)
                
            # 4. Universal dry/wet strength logic
            if 'strength' in step:
                strength = float(step['strength']) / 100.0
                if strength < 1.0:
                    if out_img.shape == input_img.shape:
                        out_img = cv2.addWeighted(out_img, strength, input_img, 1.0 - strength, 0)
                    elif out_img.shape[:2] == input_img.shape[:2]:
                        proc_temp = out_img.copy()
                        in_temp = input_img.copy()
                        if len(proc_temp.shape) == 2:
                            proc_temp = cv2.cvtColor(proc_temp, cv2.COLOR_GRAY2BGR)
                        if len(in_temp.shape) == 2:
                            in_temp = cv2.cvtColor(in_temp, cv2.COLOR_GRAY2BGR)
                        blended = cv2.addWeighted(proc_temp, strength, in_temp, 1.0 - strength, 0)
                        if len(out_img.shape) == 2:
                            out_img = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY)
                        else:
                            out_img = blended
                            
            # Store computed result in persistent cache
            _pipeline_cache_matrices[step_id] = out_img
            
        # Save the executed pipeline configuration
        import copy
        _last_pipeline_state = copy.deepcopy(pipeline)
        
        # Resolve the final processed image
        if pipeline:
            last_step_id = pipeline[-1]['id']
            processed = _pipeline_cache_matrices.get(last_step_id, img)
        else:
            processed = img
            
        # Resolve comparison baseline fallback
        if comparison_baseline == "original":
            baseline_img = _cached_original_img.copy()
        elif comparison_baseline in _pipeline_cache_matrices:
            baseline_img = _pipeline_cache_matrices[comparison_baseline]
        else:
            baseline_img = _cached_original_img.copy()
            
        # Ensure baseline and processed have identical spatial dimensions for comparison view
        if baseline_img.shape[:2] != processed.shape[:2]:
            baseline_img = cv2.resize(baseline_img, (processed.shape[1], processed.shape[0]))
        if len(baseline_img.shape) == 2 and len(processed.shape) == 3:
            baseline_img = cv2.cvtColor(baseline_img, cv2.COLOR_GRAY2BGR)
        elif len(baseline_img.shape) == 3 and len(processed.shape) == 2:
            baseline_img = cv2.cvtColor(baseline_img, cv2.COLOR_BGR2GRAY)
            
        # Optimize baseline transmission if it exactly matches the original
        is_baseline_same_as_original = False
        if _cached_original_img is not None and baseline_img.shape == _cached_original_img.shape:
            if np.array_equal(baseline_img, _cached_original_img):
                is_baseline_same_as_original = True
                
        _, processed_buf = cv2.imencode('.png', processed)
        processed_b64 = base64.b64encode(processed_buf).decode('utf-8')
        processed_url = f"data:image/png;base64,{processed_b64}"
        
        if is_baseline_same_as_original:
            baseline_url = "original"
        else:
            _, baseline_buf = cv2.imencode('.png', baseline_img)
            baseline_b64 = base64.b64encode(baseline_buf).decode('utf-8')
            baseline_url = f"data:image/png;base64,{baseline_b64}"
            
        return jsonify({
            "processed_image": processed_url,
            "original_image": baseline_url
        })


# ----------------- Server Booting -----------------

if __name__ == "__main__":
    port = 5001
    
    print("\n[SUCCESS] Local Flask Preprocessing Server started successfully!")
    print(f" -> Local URL: http://localhost:{port}/index.html")
    print(f" -> Serving workspace: {DIRECTORY}")
    print(" -> Press Ctrl+C in this console to terminate the server.\n")
    
    try:
        app.run(host='127.0.0.1', port=port, debug=True, threaded=True)
    except Exception as e:
        print(f"\n[ERROR] Flask server startup failed: {e}")
        sys.exit(1)