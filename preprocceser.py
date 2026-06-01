from flask import Flask, request, jsonify
import webbrowser
import threading
import socket
import base64
import cv2
import numpy as np
import os
import sys
import logging

# Initialize Flask with current directory as the static file source
app = Flask(__name__, static_folder='.', static_url_path='')

# Silence standard Werkzeug console logs for a clean console output
log = logging.getLogger('werkzeug')
log.setLevel(logging.ERROR)

DIRECTORY = os.path.dirname(os.path.abspath(__file__))

# ----------------- OpenCV Modular Processing Functions (Registry Pattern) -----------------

# ----------------- OpenCV Modular Processing Functions (Registry Pattern) -----------------

from processor import (
    check_type,
    PROCESSING_REGISTRY,
    verify_layer_base,
    verify_step_base,
    blend_images
)

# ----------------- Flask Routes -----------------

@app.route('/')
def index():
    return app.send_static_file('index.html')

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

# Global memory cache for performance optimization and intermediate result memoization
_cached_original_img = None
_pipeline_cache = {}

def _get_signature(obj):
    import json
    return json.dumps(obj, sort_keys=True)

@app.route('/process', methods=['POST'])
def process():
    global _cached_original_img, _pipeline_cache
    # Let exceptions naturally crash the request thread and trigger the standard WSGI/Flask traceback.
    params = request.json
    if not params:
        raise KeyError("Invalid request format: Top-level payload must be JSON.")
        
    if 'image' not in params:
        raise KeyError("Invalid request format: Top-level payload must contain an 'image' key.")
        
    img_b64 = params['image']
    
    if img_b64 and img_b64 != "cached":
        # New image uploaded! Decode and cache it.
        img_data = img_b64.split(',')[-1]
        img_bytes = base64.b64decode(img_data)
        nparr = np.frombuffer(img_bytes, np.uint8)
        img = cv2.imdecode(nparr, cv2.IMREAD_COLOR)
        if img is None:
            raise ValueError("Failed to decode image data.")
        _cached_original_img = img.copy()
        # A new image invalidates all previous pipeline caches!
        _pipeline_cache.clear()
    else:
        # Use cached original image
        if _cached_original_img is None:
            # If server restarted or cache got cleared, return custom CacheMissError
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
    check_type(params['comparison_baseline'], str, 'comparison_baseline')
    comparison_baseline = params['comparison_baseline']
    
    # Support backward-compatible flat pipelines
    if 'layers' in params:
        if type(params['layers']) is not list:
            raise TypeError(f"Layers must be an array list. Got {type(params['layers']).__name__}")
        layers = params['layers']
    elif 'pipeline' in params:
        if type(params['pipeline']) is not list:
            raise TypeError(f"Pipeline must be an array list. Got {type(params['pipeline']).__name__}")
        layers = [{
            'id': 'layer_legacy',
            'name': 'Legacy Layer',
            'disabled': False,
            'input_source': 'original',
            'blend_mode': 'normal',
            'blend_target': 'previous',
            'opacity': 100.0,
            'steps': params['pipeline']
        }]
    else:
        raise KeyError("Missing structural parameter: 'layers' or 'pipeline'")
        
    accumulated = img.copy()
    layer_outputs = { "original": img.copy() }
    
    baseline_img = None
    baseline_captured = False
    
    # Track the cumulative cache keys to ensure step-level and layer-level caching matches step sequences perfectly
    layer_cache_keys = { "original": "original" }
    preceding_layer_key = "original"
    
    for layer in layers:
        verify_layer_base(layer)
        layer_id = layer['id']
        layer_disabled = layer.get('disabled', False)
        
        # Determine Layer Input
        input_src = layer['input_source']
        if input_src == 'original':
            layer_input = layer_outputs['original'].copy()
            layer_input_key = "original"
        elif input_src == 'previous':
            layer_input = accumulated.copy()
            layer_input_key = preceding_layer_key
        else:
            if input_src in layer_outputs:
                layer_input = layer_outputs[input_src].copy()
                layer_input_key = layer_cache_keys[input_src]
            else:
                raise KeyError(f"Registry Mapping Miss: Input source layer '{input_src}' is unknown or not processed yet.")
                
        if layer_disabled:
            # If disabled, its output is just its input
            layer_outputs[layer_id] = layer_input.copy()
            layer_cache_keys[layer_id] = layer_input_key
            
            # Check if this layer's output was the baseline
            if comparison_baseline == layer_id:
                baseline_img = accumulated.copy()
                baseline_captured = True
            continue
            
        # Process active layer's nested steps
        processed_layer = layer_input.copy()
        current_key = layer_input_key
        
        for step in layer['steps']:
            verify_step_base(step)
            step_id = step['id']
            step_type = step['type']
            step_disabled = step.get('disabled', False)
            
            # Compute cumulative step signature including complete preceding path
            step_sig = _get_signature(step)
            step_cache_key = (current_key, step_id, step_sig)
            
            if not step_disabled:
                if step_cache_key in _pipeline_cache:
                    # Cache hit! Bypasses OpenCV functions completely
                    processed_layer = _pipeline_cache[step_cache_key].copy()
                else:
                    if step_type not in PROCESSING_REGISTRY:
                        raise KeyError(f"Registry Mapping Miss: Operation type '{step_type}' is unknown.")
                    process_func = PROCESSING_REGISTRY[step_type]
                    
                    input_img = processed_layer.copy()
                    processed_layer = process_func(processed_layer, step)
                    
                    # Universal Dry/Wet strength blend logic
                    if 'strength' in step:
                        strength = float(step['strength']) / 100.0
                        if strength < 1.0:
                            if processed_layer.shape == input_img.shape:
                                processed_layer = cv2.addWeighted(processed_layer, strength, input_img, 1.0 - strength, 0)
                            elif processed_layer.shape[:2] == input_img.shape[:2]:
                                proc_temp = processed_layer.copy()
                                in_temp = input_img.copy()
                                if len(proc_temp.shape) == 2:
                                    proc_temp = cv2.cvtColor(proc_temp, cv2.COLOR_GRAY2BGR)
                                if len(in_temp.shape) == 2:
                                    in_temp = cv2.cvtColor(in_temp, cv2.COLOR_GRAY2BGR)
                                blended = cv2.addWeighted(proc_temp, strength, in_temp, 1.0 - strength, 0)
                                if len(processed_layer.shape) == 2:
                                    processed_layer = cv2.cvtColor(blended, cv2.COLOR_BGR2GRAY)
                                else:
                                    processed_layer = blended
                                    
                    # Store intermediate result in cache
                    _pipeline_cache[step_cache_key] = processed_layer.copy()
            
            # Chain the step key
            current_key = step_cache_key
            
            # Capture step baseline if matched
            if comparison_baseline == step_id:
                baseline_img = processed_layer.copy()
                baseline_captured = True
                
        # Apply layer-level inversion if enabled
        invert_enabled = layer.get('invert', False)
        if invert_enabled:
            invert_cache_key = (current_key, "invert", True)
            if invert_cache_key in _pipeline_cache:
                processed_layer = _pipeline_cache[invert_cache_key].copy()
            else:
                processed_layer = cv2.bitwise_not(processed_layer)
                _pipeline_cache[invert_cache_key] = processed_layer.copy()
            current_key = invert_cache_key
            
        # Resolve Layer Blending
        blend_target_src = layer['blend_target']
        if blend_target_src == 'previous':
            target_img = accumulated.copy()
            target_key = preceding_layer_key
        elif blend_target_src == 'original':
            target_img = layer_outputs['original'].copy()
            target_key = "original"
        else:
            if blend_target_src in layer_outputs:
                target_img = layer_outputs[blend_target_src].copy()
                target_key = layer_cache_keys[blend_target_src]
            else:
                raise KeyError(f"Registry Mapping Miss: Blend target layer '{blend_target_src}' is unknown or not processed yet.")
                
        # Perform Blend
        blend_mode = layer['blend_mode']
        opacity = layer['opacity']
        
        blend_cache_key = (target_key, current_key, blend_mode, opacity)
        if blend_cache_key in _pipeline_cache:
            blended_layer_result = _pipeline_cache[blend_cache_key].copy()
        else:
            blended_layer_result = blend_images(target_img, processed_layer, blend_mode, opacity)
            _pipeline_cache[blend_cache_key] = blended_layer_result.copy()
        
        # Update accumulated and layer output maps
        accumulated = blended_layer_result.copy()
        layer_outputs[layer_id] = blended_layer_result.copy()
        
        # Track layer keys
        layer_cache_keys[layer_id] = blend_cache_key
        preceding_layer_key = blend_cache_key
        
        # Capture layer baseline if matched
        if comparison_baseline == layer_id:
            baseline_img = accumulated.copy()
            baseline_captured = True
            
    # Final processed image is accumulated output
    processed = accumulated
    
    # Resolve comparison baseline fallback
    if not baseline_captured or baseline_img is None:
        baseline_img = layer_outputs['original'].copy()
        
    # Ensure baseline and processed have identical spatial dimensions for comparison view
    if baseline_img.shape[:2] != processed.shape[:2]:
        baseline_img = cv2.resize(baseline_img, (processed.shape[1], processed.shape[0]))
    if len(baseline_img.shape) == 2 and len(processed.shape) == 3:
        baseline_img = cv2.cvtColor(baseline_img, cv2.COLOR_GRAY2BGR)
    elif len(baseline_img.shape) == 3 and len(processed.shape) == 2:
        baseline_img = cv2.cvtColor(baseline_img, cv2.COLOR_BGR2GRAY)
        
    # Prevent cache memory leak/bloat by evicting older cache entries if they exceed 200 items
    if len(_pipeline_cache) > 200:
        keys_to_remove = list(_pipeline_cache.keys())[:100]
        for k in keys_to_remove:
            _pipeline_cache.pop(k, None)
            
    # Optimize baseline transmission if it exactly matches the cached original image in shape and values
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
    port = 5000
    
    print("\n[SUCCESS] Local Flask Preprocessing Server started successfully!")
    print(f" -> Local URL: http://localhost:{port}/index.html")
    print(f" -> Serving workspace: {DIRECTORY}")
    print(" -> Press Ctrl+C in this console to terminate the server.\n")
    
    try:
        app.run(host='127.0.0.1', port=port, debug=True)
    except Exception as e:
        print(f"\n[ERROR] Flask server startup failed: {e}")
        sys.exit(1)