import { state, elements, createDefaultLayer } from './state.js';
import {
    autoFitImage,
    updateCanvasesTransform,
    updateComparisonView,
    updatePixelInspector,
    clearPixelInspector
} from './viewer.js';
import {
    renderLayers,
    updateCompareReferenceDropdown,
    generateStepId,
    exportPreset,
    importPreset
} from './ui.js';
import {
    setupNodeEditorTheme,
    registerCustomNodes,
    compileGraphToLayers,
    loadDefaultGraph
} from './nodes.js';

let isGraphInitialized = false;
let graph = null;
let lCanvas = null;

function initNodeGraph() {
    if (isGraphInitialized) {
        if (lCanvas) {
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (lCanvas) {
                        lCanvas.resize();
                        lCanvas.setDirty(true, true);
                    }
                });
            });
        }
        return;
    }
    
    setupNodeEditorTheme();
    
    graph = new LGraph();
    lCanvas = new LGraphCanvas(document.getElementById("node-canvas"), graph);
    
    // Register custom nodes with a callback that auto-queues on widget changes/link connects
    registerCustomNodes(() => {
        const autoQueue = document.getElementById("node-auto-queue");
        if (autoQueue && autoQueue.checked) {
            triggerDebouncedProcess();
        }
    });
    
    // Custom hook for link connect/disconnect to trigger auto-queue
    graph.onNodeConnectionChange = () => {
        const autoQueue = document.getElementById("node-auto-queue");
        if (autoQueue && autoQueue.checked) {
            triggerDebouncedProcess();
        }
    };

    loadDefaultGraph(graph);
    
    // Start execution loops
    graph.start();
    
    // Canvas resizing to prevent aspect scale snapping desyncs
    window.addEventListener("resize", () => {
        if (lCanvas) lCanvas.resize();
    });
    
    // Initial canvas dimensions sync (deferred to allow DOM reflow)
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (lCanvas) {
                lCanvas.resize();
                lCanvas.setDirty(true, true);
            }
        });
    });
    
    isGraphInitialized = true;
}

// ----------------- Initialization & Loading -----------------

window.addEventListener('DOMContentLoaded', () => {
    // Load default image testimg.png
    loadImage('testimg.png');
    setupEventListeners();
    
    // Bind UI triggers to State callbacks to bypass circular imports elegantly
    state.onProcessTrigger = triggerDebouncedProcess;
});

function loadImage(src) {
    state.originalImage = new Image();
    state.originalImage.crossOrigin = "anonymous";
    state.originalImage.onload = function () {
        state.originalWidth = state.originalImage.width;
        state.originalHeight = state.originalImage.height;
        state.originalImageUploaded = false; // Reset image upload state for backend cache synchronization
        
        // Initialize canvases sizes
        elements.originalCanvas.width = state.originalWidth;
        elements.originalCanvas.height = state.originalHeight;
        elements.processedCanvas.width = state.originalWidth;
        elements.processedCanvas.height = state.originalHeight;
        elements.offscreenCanvas.width = state.originalWidth;
        elements.offscreenCanvas.height = state.originalHeight;
        
        // Draw original once onto originalCanvas
        const ogCtx = elements.originalCanvas.getContext('2d');
        ogCtx.drawImage(state.originalImage, 0, 0);
        
        // Setup status bar metadata
        elements.statusDim.textContent = `${state.originalWidth} × ${state.originalHeight} px`;
        
        // Automatically calculate scale to fit canvases inside containers
        autoFitImage();
        
        // Process default state
        processImage();
    };
    state.originalImage.onerror = function() {
        console.error("Failed to load image: " + src);
    };
    state.originalImage.src = src;
}

// ----------------- Interactive Zoom, Pan, Drag & Event Listeners -----------------

function setupEventListeners() {
    const container = document.getElementById('comparison-view-container');
    
    // --- Canvas Panning & Divider Dragging ---
    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('#split-divider')) {
            state.isDraggingDivider = true;
            e.stopPropagation();
            return;
        }
        
        state.isDragging = true;
        container.style.cursor = 'grabbing';
        state.startPan = { x: e.clientX - state.transform.x, y: e.clientY - state.transform.y };
    });
    
    window.addEventListener('mousemove', (e) => {
        // Handle split divider dragging
        if (state.isDraggingDivider) {
            const rect = elements.canvasWrapper.getBoundingClientRect();
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            state.compPosition = (x / rect.width) * 100;
            
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
            updateComparisonView();
            return;
        }
        
        // Handle canvas dragging (panning)
        if (state.isDragging) {
            state.transform.x = e.clientX - state.startPan.x;
            state.transform.y = e.clientY - state.startPan.y;
            updateCanvasesTransform();
        }
    });
    
    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        state.isDraggingDivider = false;
        container.style.cursor = 'grab';
    });
    
    // --- Zooming (Centered on Cursor) ---
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        
        const zoomIntensity = 0.1;
        const rect = elements.canvasWrapper.getBoundingClientRect();
        
        // Get mouse coordinates relative to the canvas-wrapper
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        // Convert to canvas coordinates (before zoom is applied)
        const canvasX = (mouseX - state.transform.x) / state.transform.scale;
        const canvasY = (mouseY - state.transform.y) / state.transform.scale;
        
        // Calculate new scale
        let newScale;
        if (e.deltaY < 0) {
            newScale = state.transform.scale * (1 + zoomIntensity);
        } else {
            newScale = state.transform.scale / (1 + zoomIntensity);
        }
        
        // Bound scale between 10% and 1500%
        newScale = Math.max(0.1, Math.min(newScale, 15.0));
        
        // Adjust translation coordinates to keep zoom centered on mouse cursor
        state.transform.x = mouseX - canvasX * newScale;
        state.transform.y = mouseY - canvasY * newScale;
        state.transform.scale = newScale;
        
        updateCanvasesTransform();
    }, { passive: false });
    
    // --- Mouse Inspection Tracking ---
    container.addEventListener('mousemove', (e) => {
        const rect = elements.canvasWrapper.getBoundingClientRect();
        state.mouseWrapperX = e.clientX - rect.left;
        state.mouseWrapperY = e.clientY - rect.top;
        
        if (state.comparisonMode === "X-Ray Lens") {
            updateComparisonView();
        }
        
        if (state.originalWidth > 0) {
            const canvasLeft = Math.round(state.transform.x);
            const canvasWidth = elements.originalCanvas.width * state.transform.scale;
            const canvasHeight = elements.originalCanvas.height * state.transform.scale;
            
            const relativeX = (state.mouseWrapperX - canvasLeft) / state.transform.scale;
            const relativeY = (state.mouseWrapperY - state.transform.y) / state.transform.scale;
            
            // Check if within image boundary before updating inspector coords
            if (relativeX >= 0 && relativeX < elements.originalCanvas.width && relativeY >= 0 && relativeY < elements.originalCanvas.height) {
                updatePixelInspector(Math.floor(relativeX), Math.floor(relativeY));
            } else {
                clearPixelInspector();
            }
        }
    });
    
    container.addEventListener('mouseleave', () => {
        clearPixelInspector();
    });
    
    // --- Comparison Controls Selectors ---
    elements.compModeSelect.addEventListener('change', (e) => {
        state.comparisonMode = e.target.value;
        
        // Adjust split slider UI configs depending on active modes
        if (state.comparisonMode === "Split Slider") {
            elements.compSliderGroup.style.display = "block";
            elements.compSliderLabel.textContent = "Split Position";
            elements.compSlider.min = "0";
            elements.compSlider.max = "100";
            elements.compSlider.step = "1";
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
        } else if (state.comparisonMode === "Overlay Opacity") {
            elements.compSliderGroup.style.display = "block";
            elements.compSliderLabel.textContent = "Opacity Value";
            elements.compSlider.min = "0";
            elements.compSlider.max = "100";
            elements.compSlider.step = "5";
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
        } else if (state.comparisonMode === "X-Ray Lens") {
            elements.compSliderGroup.style.display = "block";
            elements.compSliderLabel.textContent = "Spotlight Diameter";
            elements.compSlider.min = "5";
            elements.compSlider.max = "100";
            elements.compSlider.step = "2";
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition * 2.5 + 40)}px`;
        } else {
            elements.compSliderGroup.style.display = "none";
        }
        
        updateComparisonView();
    });
    
    elements.compareReferenceSelect.addEventListener('change', (e) => {
        state.comparisonBaseline = e.target.value;
        renderLayers();
        triggerDebouncedProcess();
    });
    
    elements.compSlider.addEventListener('input', (e) => {
        state.compPosition = parseInt(e.target.value);
        if (state.comparisonMode === "X-Ray Lens") {
            elements.compSliderVal.textContent = `${Math.round(state.compPosition * 2.5 + 40)}px`;
        } else {
            elements.compSliderVal.textContent = `${state.compPosition}%`;
        }
        updateComparisonView();
    });
    
    // --- File Drag and Drop Triggers ---
    elements.dropzone.addEventListener('click', () => elements.fileInput.click());
    
    elements.fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
    
    elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        elements.dropzone.classList.add('dragover');
    });
    
    elements.dropzone.addEventListener('dragleave', () => {
        elements.dropzone.classList.remove('dragover');
    });
    
    elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        elements.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });

    // Also support dropping files directly onto the Node Workspace panel
    const nodeWorkspacePanel = document.getElementById('node-workspace-panel');
    if (nodeWorkspacePanel) {
        nodeWorkspacePanel.addEventListener('dragover', (e) => {
            e.preventDefault();
        });
        nodeWorkspacePanel.addEventListener('drop', (e) => {
            e.preventDefault();
            if (e.dataTransfer.files.length > 0) {
                handleUploadedFile(e.dataTransfer.files[0]);
            }
        });
    }
    
    // --- Dynamic Layers Stack Addition ---
    elements.addLayerBtn.addEventListener('click', () => {
        const newLayer = createDefaultLayer(`Layer ${state.layers.length + 1}`);
        state.layers.push(newLayer);
        renderLayers();
        triggerDebouncedProcess();
    });
    
    // --- Event Delegation on Dynamic Layers Stack Container ---
    
    // 1. Click Actions (Toggles, deletions, layer moves, mini-step additions)
    elements.layersListContainer.addEventListener('click', (e) => {
        const layerCard = e.target.closest('.layer-card');
        if (layerCard) {
            const layerId = layerCard.dataset.id;
            const layerIndex = parseInt(layerCard.dataset.index);
            const layer = state.layers.find(l => l.id === layerId);
            
            if (e.target.closest('.btn-toggle-layer')) {
                if (layer) {
                    layer.disabled = !layer.disabled;
                    renderLayers();
                    triggerDebouncedProcess();
                    return;
                }
            }
            if (e.target.closest('.btn-delete-layer')) {
                if (layer) {
                    state.layers = state.layers.filter(l => l.id !== layerId);
                    renderLayers();
                    triggerDebouncedProcess();
                    return;
                }
            }
            if (e.target.closest('.btn-layer-baseline')) {
                if (state.comparisonBaseline === layerId) {
                    state.comparisonBaseline = "none";
                } else {
                    state.comparisonBaseline = layerId;
                }
                renderLayers();
                triggerDebouncedProcess();
                return;
            }
            if (e.target.closest('.btn-layer-up')) {
                if (layerIndex > 0) {
                    const temp = state.layers[layerIndex];
                    state.layers[layerIndex] = state.layers[layerIndex - 1];
                    state.layers[layerIndex - 1] = temp;
                    renderLayers();
                    triggerDebouncedProcess();
                    return;
                }
            }
            if (e.target.closest('.btn-layer-down')) {
                if (layerIndex < state.layers.length - 1) {
                    const temp = state.layers[layerIndex];
                    state.layers[layerIndex] = state.layers[layerIndex + 1];
                    state.layers[layerIndex + 1] = temp;
                    renderLayers();
                    triggerDebouncedProcess();
                    return;
                }
            }
            if (e.target.closest('.layer-expand-btn')) {
                if (layer) {
                    layer.isExpanded = !layer.isExpanded;
                    renderLayers();
                    return;
                }
            }
            
            // Mini Add Step Button inside Layer card
            if (e.target.closest('.btn-add-step-mini')) {
                const select = layerCard.querySelector('.select-mini-add-step');
                const stepType = select.value;
                const stepId = generateStepId();
                
                const newStep = {
                    id: stepId,
                    type: stepType,
                    disabled: false,
                    strength: 100
                };
                
                // Append defaults
                if (stepType === 'contrast') {
                    newStep.contrast = 1.0;
                    newStep.brightness = 0;
                } else if (stepType === 'blur') {
                    newStep.blur_type = 'Gaussian Blur';
                    newStep.kernel_x = 5;
                    newStep.kernel_y = 5;
                    newStep.kernel = 5;
                    newStep.sigma_x = 0;
                    newStep.sigma_y = 0;
                    newStep.diameter = 9;
                    newStep.sigma_color = 75;
                    newStep.sigma_space = 75;
                } else if (stepType === 'threshold') {
                    newStep.mode = 'Binary Thresholding';
                    newStep.value = 127;
                    newStep.block_size = 11;
                    newStep.constant_c = 2;
                    newStep.fill_color = '#ffffff';
                    newStep.channel_mode = 'Grayscale';
                    newStep.sigma_x = 0;
                    newStep.sigma_y = 0;
                    newStep.target_color = '#000000';
                    newStep.tolerance = 30;
                } else if (stepType === 'above_to_white') {
                    newStep.algorithm = 'Global';
                    newStep.value = 127;
                    newStep.value_max = 255;
                    newStep.block_size_x = 11;
                    newStep.block_size_y = 11;
                    newStep.block_size = 11;
                    newStep.constant_c = 2;
                    newStep.sigma_x = 0;
                    newStep.sigma_y = 0;
                    newStep.fill_color = '#ffffff';
                    newStep.channel_mode = 'Grayscale';
                    newStep.condition = 'Above or Equal (>=)';
                } else if (stepType === 'edges') {
                    newStep.algorithm = 'Canny';
                    newStep.channel_mode = 'Grayscale';
                    newStep.low = 50;
                    newStep.high = 150;
                    newStep.aperture = 3;
                    newStep.l2_gradient = false;
                    newStep.dx = 1;
                    newStep.dy = 0;
                    newStep.ksize = 3;
                    newStep.scale = 1.0;
                    newStep.delta = 0;
                } else if (stepType === 'edges_fill') {
                    newStep.algorithm = 'Canny';
                    newStep.channel_mode = 'Grayscale';
                    newStep.low = 50;
                    newStep.high = 150;
                    newStep.aperture = 3;
                    newStep.l2_gradient = false;
                    newStep.dx = 1;
                    newStep.dy = 0;
                    newStep.ksize = 3;
                    newStep.scale = 1.0;
                    newStep.delta = 0;
                    newStep.fill_target = 'Original Image';
                    newStep.draw_style = 'Filled Contours';
                    newStep.thickness = 2;
                    newStep.color = 255;
                    newStep.min_area = 0;
                    newStep.max_area = 10000;
                } else if (stepType === 'fill') {
                    newStep.fill_mode = 'Hole Filling (Contours)';
                    newStep.color = 255;
                    newStep.fill_color = '#ffffff';
                    newStep.use_target_color = false;
                    newStep.target_color = '#000000';
                    newStep.tolerance = 30;
                    newStep.min_area = 0;
                    newStep.max_area = 10000;
                    newStep.seed_x = 50;
                    newStep.seed_y = 50;
                    newStep.lo_diff = 20;
                    newStep.up_diff = 20;
                    newStep.inpaint_radius = 3;
                    newStep.channel_mode = 'Color Channels';
                } else if (stepType === 'upsample') {
                    newStep.scale = 2.0;
                    newStep.interpolation = 'Bicubic (Sharp)';
                } else if (stepType === 'crop') {
                    newStep.left = 0;
                    newStep.right = 0;
                    newStep.top = 0;
                    newStep.bottom = 0;
                } else if (stepType === 'heal') {
                    newStep.operation = 'Heal Gaps in White (Closing)';
                    newStep.shape = 'Rectangle';
                    newStep.kernel_x = 3;
                    newStep.kernel_y = 3;
                    newStep.iterations = 1;
                    newStep.channel_mode = 'Color Channels';
                    newStep.skel_threshold = 127;
                    newStep.foreground_mode = 'Black strokes (Light background)';
                    newStep.use_target_color = false;
                    newStep.target_color = '#ff0000';
                    newStep.tolerance = 30;
                    newStep.fill_color = '#000000';
                    newStep.bg_color = '#ffffff';
                } else if (stepType === 'invert') {
                    newStep.channel_mode = 'Color Channels';
                } else if (stepType === 'downsample') {
                    newStep.scale = 0.5;
                    newStep.interpolation = 'Bicubic (Sharp)';
                }
                
                if (layer) {
                    layer.steps.push(newStep);
                    renderLayers();
                    triggerDebouncedProcess();
                    return;
                }
            }
        }
        
        // --- Step (Transformation) Card Actions ---
        const stepCard = e.target.closest('.pipeline-card');
        if (stepCard) {
            const layerId = stepCard.dataset.layerId;
            const stepId = stepCard.dataset.id;
            const stepIndex = parseInt(stepCard.dataset.index);
            const layer = state.layers.find(l => l.id === layerId);
            if (!layer) return;
            
            if (e.target.closest('.btn-delete')) {
                layer.steps = layer.steps.filter(s => s.id !== stepId);
                renderLayers();
                triggerDebouncedProcess();
            } else if (e.target.closest('.btn-toggle-enable')) {
                const step = layer.steps.find(s => s.id === stepId);
                if (step) {
                    step.disabled = !step.disabled;
                    renderLayers();
                    triggerDebouncedProcess();
                }
            } else if (e.target.closest('.btn-set-baseline')) {
                if (state.comparisonBaseline === stepId) {
                    state.comparisonBaseline = "none";
                } else {
                    state.comparisonBaseline = stepId;
                }
                renderLayers();
                triggerDebouncedProcess();
            } else if (e.target.closest('.btn-up')) {
                if (stepIndex > 0) {
                    const temp = layer.steps[stepIndex];
                    layer.steps[stepIndex] = layer.steps[stepIndex - 1];
                    layer.steps[stepIndex - 1] = temp;
                    renderLayers();
                    triggerDebouncedProcess();
                }
            } else if (e.target.closest('.btn-down')) {
                if (stepIndex < layer.steps.length - 1) {
                    const temp = layer.steps[stepIndex];
                    layer.steps[stepIndex] = layer.steps[stepIndex + 1];
                    layer.steps[stepIndex + 1] = temp;
                    renderLayers();
                    triggerDebouncedProcess();
                }
            }
        }
    });
    
    // 2. Input Actions (Slider parameter modifications)
    elements.layersListContainer.addEventListener('input', (e) => {
        // A. Layer card title renaming
        if (e.target.classList.contains('layer-title-input')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.name = e.target.value;
                    updateCompareReferenceDropdown(); // Refresh dropdown labels
                }
            }
            return;
        }
        
        // B. Layer Opacity Sliders
        if (e.target.classList.contains('slider-layer-opacity')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.opacity = parseInt(e.target.value);
                    layerCard.querySelector('.value-layer-opacity').textContent = `${layer.opacity}%`;
                    triggerDebouncedProcess();
                }
            }
            return;
        }
        
        // B3. Layer Select Dropdowns (Input, Blend, Target, Interpolation)
        if (e.target.classList.contains('select-layer-input')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.input_source = e.target.value;
                    renderLayers();
                    triggerDebouncedProcess();
                }
            }
            return;
        }
        if (e.target.classList.contains('select-layer-blend')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.blend_mode = e.target.value;
                    triggerDebouncedProcess();
                }
            }
            return;
        }
        if (e.target.classList.contains('select-layer-blend-target')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.blend_target = e.target.value;
                    renderLayers();
                    triggerDebouncedProcess();
                }
            }
            return;
        }
        if (e.target.classList.contains('select-layer-blend-interp')) {
            const layerCard = e.target.closest('.layer-card');
            if (layerCard) {
                const layerId = layerCard.dataset.id;
                const layer = state.layers.find(l => l.id === layerId);
                if (layer) {
                    layer.blend_interpolation = e.target.value;
                    triggerDebouncedProcess();
                }
            }
            return;
        }
        
        // C. Step parameter sliders/inputs
        const card = e.target.closest('.pipeline-card');
        if (!card) return;
        
        const layerId = card.dataset.layerId;
        const id = card.dataset.id;
        const layer = state.layers.find(l => l.id === layerId);
        if (!layer) return;
        const step = layer.steps.find(s => s.id === id);
        if (!step) return;
        
        const param = e.target.dataset.param;
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        
        if (param) {
            if (param === 'step_strength') {
                step.strength = parseInt(val);
                document.getElementById(`val-step-strength-${id}`).textContent = `${step.strength}%`;
                triggerDebouncedProcess();
                return;
            }
            
            // Universal Select Dropdowns & Toggles updater
            const genericParams = [
                'mode', 'blur_type', 'algorithm', 'condition', 'operation', 
                'fill_mode', 'use_target_color', 'foreground_mode', 'fill_target', 
                'draw_style', 'l2_gradient', 'dx', 'dy', 'ksize', 'aperture', 
                'interpolation', 'channel_mode', 'shape'
            ];
            if (genericParams.includes(param)) {
                // Parse boolean/number inputs where necessary
                let parsedVal = val;
                if (val === 'true') parsedVal = true;
                else if (val === 'false') parsedVal = false;
                else if (param === 'ksize' || param === 'aperture' || param === 'dx' || param === 'dy') parsedVal = parseInt(val);
                
                step[param] = parsedVal;
                
                // Triggers that require structural card visibility / re-render changes
                if (['mode', 'blur_type', 'algorithm', 'condition', 'operation', 'fill_mode', 'use_target_color', 'foreground_mode', 'fill_target', 'draw_style'].includes(param)) {
                    renderLayers();
                }
                triggerDebouncedProcess();
                return;
            }
            
            if (step.type === 'contrast') {
                if (param === 'contrast') {
                    step.contrast = parseFloat(val);
                    document.getElementById(`val-contrast-${id}`).textContent = `${step.contrast.toFixed(1)}x`;
                } else if (param === 'brightness') {
                    step.brightness = parseInt(val);
                    document.getElementById(`val-brightness-${id}`).textContent = step.brightness >= 0 ? `+${step.brightness}` : step.brightness;
                }
            } else if (step.type === 'blur') {
                if (param === 'kernel_x') {
                    step.kernel_x = parseInt(val);
                    document.getElementById(`val-blur-kernel-x-${id}`).textContent = `${step.kernel_x}px`;
                } else if (param === 'kernel_y') {
                    step.kernel_y = parseInt(val);
                    document.getElementById(`val-blur-kernel-y-${id}`).textContent = `${step.kernel_y}px`;
                } else if (param === 'sigma_x') {
                    step.sigma_x = parseFloat(val);
                    document.getElementById(`val-blur-sigma-x-${id}`).textContent = step.sigma_x.toFixed(1);
                } else if (param === 'sigma_y') {
                    step.sigma_y = parseFloat(val);
                    document.getElementById(`val-blur-sigma-y-${id}`).textContent = step.sigma_y.toFixed(1);
                } else if (param === 'kernel') {
                    step.kernel = parseInt(val);
                    document.getElementById(`val-blur-kernel-${id}`).textContent = `${step.kernel}px`;
                } else if (param === 'diameter') {
                    step.diameter = parseInt(val);
                    document.getElementById(`val-blur-diameter-${id}`).textContent = `${step.diameter}px`;
                } else if (param === 'sigma_color') {
                    step.sigma_color = parseInt(val);
                    document.getElementById(`val-blur-sigmacolor-${id}`).textContent = step.sigma_color;
                } else if (param === 'sigma_space') {
                    step.sigma_space = parseInt(val);
                    document.getElementById(`val-blur-sigmaspace-${id}`).textContent = step.sigma_space;
                }
            } else if (step.type === 'threshold') {
                if (param === 'value') {
                    step.value = parseInt(val);
                    document.getElementById(`val-thresh-${id}`).textContent = step.value;
                } else if (param === 'block_size') {
                    step.block_size = parseInt(val);
                    document.getElementById(`val-thresh-blocksize-${id}`).textContent = `${step.block_size}px`;
                } else if (param === 'constant_c') {
                    step.constant_c = parseInt(val);
                    document.getElementById(`val-thresh-c-${id}`).textContent = step.constant_c >= 0 ? `+${step.constant_c}` : step.constant_c;
                } else if (param === 'fill_color') {
                    step.fill_color = val;
                } else if (param === 'target_color') {
                    step.target_color = val;
                } else if (param === 'tolerance') {
                    step.tolerance = parseInt(val);
                    document.getElementById(`val-thresh-tolerance-${id}`).textContent = step.tolerance;
                } else if (param === 'sigma_x') {
                    step.sigma_x = parseFloat(val);
                    document.getElementById(`val-thresh-sigmax-${id}`).textContent = step.sigma_x.toFixed(1);
                } else if (param === 'sigma_y') {
                    step.sigma_y = parseFloat(val);
                    document.getElementById(`val-thresh-sigmay-${id}`).textContent = step.sigma_y.toFixed(1);
                }
            } else if (step.type === 'above_to_white') {
                if (param === 'value') {
                    step.value = parseInt(val);
                    document.getElementById(`val-above-to-white-val-${id}`).textContent = step.value;
                } else if (param === 'value_max') {
                    step.value_max = parseInt(val);
                    document.getElementById(`val-above-to-white-maxval-${id}`).textContent = step.value_max;
                } else if (param === 'block_size_x') {
                    step.block_size_x = parseInt(val);
                    document.getElementById(`val-above-to-white-blocksizex-${id}`).textContent = `${step.block_size_x}px`;
                } else if (param === 'block_size_y') {
                    step.block_size_y = parseInt(val);
                    document.getElementById(`val-above-to-white-blocksizey-${id}`).textContent = `${step.block_size_y}px`;
                } else if (param === 'constant_c') {
                    step.constant_c = parseInt(val);
                    document.getElementById(`val-above-to-white-c-${id}`).textContent = step.constant_c >= 0 ? `+${step.constant_c}` : step.constant_c;
                } else if (param === 'sigma_x') {
                    step.sigma_x = parseFloat(val);
                    document.getElementById(`val-above-to-white-sigmax-${id}`).textContent = step.sigma_x.toFixed(1);
                } else if (param === 'sigma_y') {
                    step.sigma_y = parseFloat(val);
                    document.getElementById(`val-above-to-white-sigmay-${id}`).textContent = step.sigma_y.toFixed(1);
                } else if (param === 'fill_color') {
                    step.fill_color = val;
                }
            } else if (step.type === 'edges' || step.type === 'edges_fill') {
                if (param === 'low') {
                    step.low = parseInt(val);
                    document.getElementById(`val-edges-low-${id}`).textContent = step.low;
                } else if (param === 'high') {
                    step.high = parseInt(val);
                    document.getElementById(`val-edges-high-${id}`).textContent = step.high;
                } else if (param === 'scale') {
                    step.scale = parseFloat(val);
                    document.getElementById(`val-edges-scale-${id}`).textContent = step.scale.toFixed(1);
                } else if (param === 'delta') {
                    step.delta = parseInt(val);
                    document.getElementById(`val-edges-delta-${id}`).textContent = step.delta >= 0 ? `+${step.delta}` : step.delta;
                } else if (param === 'thickness') {
                    step.thickness = parseInt(val);
                    const el = document.getElementById(`val-fill-thickness-${id}`);
                    if (el) el.textContent = `${step.thickness}px`;
                } else if (param === 'color') {
                    step.color = parseInt(val);
                    const el = document.getElementById(`val-fill-color-${id}`);
                    if (el) el.textContent = step.color;
                } else if (param === 'min_area') {
                    step.min_area = parseInt(val);
                    const el = document.getElementById(`val-fill-minarea-${id}`);
                    if (el) el.textContent = `${step.min_area}px`;
                } else if (param === 'max_area') {
                    step.max_area = parseInt(val);
                    const el = document.getElementById(`val-fill-maxarea-${id}`);
                    if (el) el.textContent = `${step.max_area}px`;
                }
            } else if (step.type === 'fill') {
                if (param === 'fill_color') {
                    step.fill_color = val;
                } else if (param === 'use_target_color') {
                    step.use_target_color = val;
                    renderLayers();
                } else if (param === 'target_color') {
                    step.target_color = val;
                } else if (param === 'tolerance') {
                    step.tolerance = parseInt(val);
                    const el = document.getElementById(`val-fill-tolerance-${id}`);
                    if (el) el.textContent = step.tolerance;
                } else if (param === 'min_area') {
                    step.min_area = parseInt(val);
                    const el = document.getElementById(`val-fill-minarea-${id}`);
                    if (el) el.textContent = `${step.min_area}px`;
                } else if (param === 'max_area') {
                    step.max_area = parseInt(val);
                    const el = document.getElementById(`val-fill-maxarea-${id}`);
                    if (el) el.textContent = `${step.max_area}px`;
                } else if (param === 'inpaint_radius') {
                    step.inpaint_radius = parseInt(val);
                    const el = document.getElementById(`val-fill-inpaint-radius-${id}`);
                    if (el) el.textContent = `${step.inpaint_radius}px`;
                } else if (param === 'seed_x') {
                    step.seed_x = parseInt(val);
                    const el = document.getElementById(`val-fill-seedx-${id}`);
                    if (el) el.textContent = `${step.seed_x}%`;
                } else if (param === 'seed_y') {
                    step.seed_y = parseInt(val);
                    const el = document.getElementById(`val-fill-seedy-${id}`);
                    if (el) el.textContent = `${step.seed_y}%`;
                } else if (param === 'lo_diff') {
                    step.lo_diff = parseInt(val);
                    const el = document.getElementById(`val-fill-lodiff-${id}`);
                    if (el) el.textContent = step.lo_diff;
                } else if (param === 'up_diff') {
                    step.up_diff = parseInt(val);
                    const el = document.getElementById(`val-fill-updiff-${id}`);
                    if (el) el.textContent = step.up_diff;
                }
            } else if (step.type === 'heal') {
                if (param === 'use_target_color') {
                    step.use_target_color = val;
                    renderLayers();
                } else if (param === 'target_color') {
                    step.target_color = val;
                } else if (param === 'tolerance') {
                    step.tolerance = parseInt(val);
                    const el = document.getElementById(`val-heal-tolerance-${id}`);
                    if (el) el.textContent = step.tolerance;
                } else if (param === 'fill_color') {
                    step.fill_color = val;
                } else if (param === 'bg_color') {
                    step.bg_color = val;
                } else if (param === 'skel_threshold') {
                    step.skel_threshold = parseInt(val);
                    const el = document.getElementById(`val-heal-threshold-${id}`);
                    if (el) el.textContent = step.skel_threshold;
                } else if (param === 'kernel_x') {
                    step.kernel_x = parseInt(val);
                    const el = document.getElementById(`val-heal-kernel-x-${id}`);
                    if (el) el.textContent = `${step.kernel_x}px`;
                } else if (param === 'kernel_y') {
                    step.kernel_y = parseInt(val);
                    const el = document.getElementById(`val-heal-kernel-y-${id}`);
                    if (el) el.textContent = `${step.kernel_y}px`;
                } else if (param === 'iterations') {
                    step.iterations = parseInt(val);
                    const el = document.getElementById(`val-heal-iterations-${id}`);
                    if (el) el.textContent = step.iterations;
                }
            } else if (step.type === 'upsample') {
                if (param === 'scale') {
                    step.scale = parseFloat(val);
                    const el = document.getElementById(`val-upsample-scale-${id}`);
                    if (el) el.textContent = `${step.scale.toFixed(1)}x`;
                }
            } else if (step.type === 'downsample') {
                if (param === 'scale') {
                    step.scale = parseFloat(val);
                    const el = document.getElementById(`val-downsample-scale-${id}`);
                    if (el) el.textContent = `${step.scale.toFixed(2)}x`;
                }
            } else if (step.type === 'crop') {
                if (param === 'left') {
                    step.left = parseInt(val);
                    const el = document.getElementById(`val-crop-left-${id}`);
                    if (el) el.textContent = `${step.left}%`;
                } else if (param === 'right') {
                    step.right = parseInt(val);
                    const el = document.getElementById(`val-crop-right-${id}`);
                    if (el) el.textContent = `${step.right}%`;
                } else if (param === 'top') {
                    step.top = parseInt(val);
                    const el = document.getElementById(`val-crop-top-${id}`);
                    if (el) el.textContent = `${step.top}%`;
                } else if (param === 'bottom') {
                    step.bottom = parseInt(val);
                    const el = document.getElementById(`val-crop-bottom-${id}`);
                    if (el) el.textContent = `${step.bottom}%`;
                }
            }
            triggerDebouncedProcess();
        }
    });
    
    // Reset View & Download
    elements.resetViewBtn.addEventListener('click', autoFitImage);
    elements.downloadBtn.addEventListener('click', downloadProcessedImage);
    
    // --- JSON Preset Import/Export ---
    const exportBtn = document.getElementById('export-preset-btn');
    const importBtn = document.getElementById('import-preset-btn');
    const importFile = document.getElementById('import-preset-file');
    
    exportBtn.addEventListener('click', exportPreset);
    importBtn.addEventListener('click', () => importFile.click());
    
    importFile.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        importPreset(e.target.files[0], triggerDebouncedProcess);
        importFile.value = '';
    });

    const closeErrorBtn = document.getElementById('close-error-btn');
    if (closeErrorBtn) {
        closeErrorBtn.addEventListener('click', hidePipelineErrorOverlay);
    }
    
    // --- Keyboard Shortcuts for Comparison Modes ---
    window.addEventListener('keydown', (e) => {
        // Global Alt-prefixed Navigation Shortcuts
        if (e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'm') {
                e.preventDefault();
                const btnStudio = document.getElementById('btn-studio-mode');
                const btnNode = document.getElementById('btn-node-mode');
                if (state.currentMode === 'studio') {
                    if (btnNode) btnNode.click();
                } else {
                    if (btnStudio) btnStudio.click();
                }
                return;
            } else if (key === 'e') {
                e.preventDefault();
                maximizeEditor();
                return;
            } else if (key === 'v') {
                e.preventDefault();
                maximizeViewer();
                return;
            } else if (key === 's') {
                e.preventDefault();
                restoreSplit();
                return;
            }
        }

        // Ignore standard single-key shortcuts if user is typing in inputs or editable elements
        const activeEl = document.activeElement;
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.isContentEditable)) {
            return;
        }
        
        const modeKeys = {
            '1': 'Split Slider',
            '2': 'Overlay Opacity',
            '3': 'Pixel Difference',
            '4': 'X-Ray Lens'
        };
        
        if (modeKeys[e.key]) {
            e.preventDefault();
            const chosenMode = modeKeys[e.key];
            if (elements.compModeSelect && elements.compModeSelect.value !== chosenMode) {
                elements.compModeSelect.value = chosenMode;
                elements.compModeSelect.dispatchEvent(new Event('change'));
            }
        } else if (e.key === '[' || e.key === ']') {
            e.preventDefault();
            const targetPos = e.key === '[' ? 0 : 100;
            state.compPosition = targetPos;
            if (elements.compSlider) {
                elements.compSlider.value = targetPos;
                if (state.comparisonMode === "X-Ray Lens") {
                    elements.compSliderVal.textContent = `${Math.round(targetPos * 2.5 + 40)}px`;
                } else {
                    elements.compSliderVal.textContent = `${targetPos}%`;
                }
            }
            updateComparisonView();
        }
    });

    // --- Mode Tab Switching (Layer Studio vs Node Flow) ---
    const btnStudio = document.getElementById('btn-studio-mode');
    const btnNode = document.getElementById('btn-node-mode');
    const sidebarPanel = document.getElementById('sidebar-panel') || document.querySelector('.sidebar');
    const nodePanel = document.getElementById('node-workspace-panel');
    const appContainer = document.querySelector('.app-container');

    state.currentMode = 'studio'; // default

    if (btnStudio && btnNode && sidebarPanel && nodePanel && appContainer) {
        btnStudio.addEventListener('click', () => {
            if (state.currentMode === 'studio') return;
            state.currentMode = 'studio';
            btnNode.classList.remove('active');
            btnStudio.classList.add('active');
            
            nodePanel.classList.add('hidden');
            sidebarPanel.classList.remove('hidden');
            appContainer.classList.remove('node-mode-active');
            
            // Defer auto-fitting image to let DOM reflow complete
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    autoFitImage();
                });
            });
            triggerDebouncedProcess();
        });

        btnNode.addEventListener('click', () => {
            if (state.currentMode === 'node') return;
            state.currentMode = 'node';
            btnStudio.classList.remove('active');
            btnNode.classList.add('active');
            
            sidebarPanel.classList.add('hidden');
            nodePanel.classList.remove('hidden');
            appContainer.classList.add('node-mode-active');
            
            initNodeGraph();
            
            // Defer auto-fitting and canvas resizing to let DOM reflow complete
            requestAnimationFrame(() => {
                requestAnimationFrame(() => {
                    if (isGraphInitialized && lCanvas) {
                        lCanvas.resize();
                        lCanvas.setDirty(true, true);
                    }
                    autoFitImage();
                });
            });
            triggerDebouncedProcess();
        });
    }

    // --- Manual Queue Graph Action ---
    const btnQueue = document.getElementById('btn-queue-graph');
    if (btnQueue) {
        btnQueue.addEventListener('click', () => {
            processImage();
        });
    }
    
    // Initial layers stack rendering on load
    renderLayers();
}

function handleUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

// ----------------- Image Processing API Pipeline -----------------

let isProcessing = false;
let pendingProcess = false;
let debounceTimer = null;

// Debouncing prevents spamming network calls to Flask during drag actions
function triggerDebouncedProcess() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processImage();
    }, 80); // 80ms is the optimal sweet spot for zero slider lag and zero server load
}

function showPipelineErrorOverlay(type, message, traceback) {
    const overlay = document.getElementById('error-overlay');
    const errType = document.getElementById('error-type');
    const errMsg = document.getElementById('error-message');
    const errTrace = document.getElementById('error-traceback');
    
    if (overlay && errType && errMsg && errTrace) {
        errType.textContent = type || 'Error';
        errMsg.textContent = message || 'An unhandled exception occurred during pipeline execution.';
        errTrace.textContent = traceback || 'No python traceback available.';
        overlay.classList.remove('hidden');
    }
}

function hidePipelineErrorOverlay() {
    const overlay = document.getElementById('error-overlay');
    if (overlay) {
        overlay.classList.add('hidden');
    }
}

function processImage() {
    if (state.originalWidth === 0) return;
    
    if (isProcessing) {
        pendingProcess = true;
        return;
    }
    
    isProcessing = true;
    
    // Export original canvas to base64 only if it has not been cached on backend yet
    let originalBase64 = "cached";
    if (!state.originalImageUploaded) {
        const offCtx = elements.offscreenCanvas.getContext('2d');
        offCtx.clearRect(0, 0, state.originalWidth, state.originalHeight);
        offCtx.drawImage(state.originalImage, 0, 0);
        originalBase64 = elements.offscreenCanvas.toDataURL('image/png');
    }
    
    // Pack the ordered layers stack to send to Flask OpenCV
    let layersToSend = state.layers;
    let baselineToSend = state.comparisonBaseline;
    
    if (state.currentMode === 'node' && isGraphInitialized && graph) {
        try {
            const compiled = compileGraphToLayers(graph);
            layersToSend = compiled.layers;
            baselineToSend = compiled.comparisonBaseline;
        } catch (compileErr) {
            console.error(compileErr);
            showPipelineErrorOverlay("GraphCompileError", compileErr.message, compileErr.stack);
            isProcessing = false;
            return;
        }
    }

    const params = {
        image: originalBase64,
        layers: layersToSend,
        comparison_baseline: baselineToSend
    };
    
    fetch('/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params)
    })
    .then(async response => {
        if (!response.ok) {
            let errType = 'Server Error';
            let errMsg = 'An unhandled exception occurred on the backend.';
            let errTrace = '';
            let requireReupload = false;
            
            try {
                const data = await response.json();
                if (data.error_type) errType = data.error_type;
                if (data.message) errMsg = data.message;
                if (data.traceback) errTrace = data.traceback;
                if (data.require_reupload) requireReupload = data.require_reupload;
            } catch (jsonErr) {
                try {
                    const text = await response.text();
                    errTrace = text;
                } catch (txtErr) {
                    errTrace = 'Could not read error response.';
                }
            }
            
            if (requireReupload) {
                // Backend cache missed (e.g. server restarted). Force re-upload.
                state.originalImageUploaded = false;
                isProcessing = false;
                processImage();
                throw new Error('Image cache miss. Retrying upload...');
            }
            
            showPipelineErrorOverlay(errType, errMsg, errTrace);
            throw new Error(`Pipeline aborted: ${errType} - ${errMsg}`);
        }
        return response.json();
    })
    .then(result => {
        // Hide error overlay on success
        hidePipelineErrorOverlay();
        
        if (result.processed_image && result.original_image) {
            // Mark original image as successfully cached on server
            state.originalImageUploaded = true;
            
            const loadProc = new Promise((resolve) => {
                if (result.original_image === "original") {
                    resolve(state.originalImage);
                } else {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.src = result.original_image;
                }
            });
            const loadProcImg = new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = result.processed_image;
            });
            
            Promise.all([loadProcImg, loadProc]).then(([procImg, origImg]) => {
                // Draw original canvas ONLY if size changes or we loaded a non-static baseline
                const ogCtx = elements.originalCanvas.getContext('2d');
                if (elements.originalCanvas.width !== origImg.width || elements.originalCanvas.height !== origImg.height) {
                    elements.originalCanvas.width = origImg.width;
                    elements.originalCanvas.height = origImg.height;
                    ogCtx.imageSmoothingEnabled = false;
                    ogCtx.clearRect(0, 0, origImg.width, origImg.height);
                    ogCtx.drawImage(origImg, 0, 0);
                } else if (result.original_image !== "original") {
                    ogCtx.imageSmoothingEnabled = false;
                    ogCtx.clearRect(0, 0, origImg.width, origImg.height);
                    ogCtx.drawImage(origImg, 0, 0);
                }
                
                // Draw processed canvas ONLY if size changes or draw updates
                const procCtx = elements.processedCanvas.getContext('2d', { willReadFrequently: true });
                if (elements.processedCanvas.width !== procImg.width || elements.processedCanvas.height !== procImg.height) {
                    elements.processedCanvas.width = procImg.width;
                    elements.processedCanvas.height = procImg.height;
                }
                procCtx.imageSmoothingEnabled = false;
                procCtx.clearRect(0, 0, procImg.width, procImg.height);
                procCtx.drawImage(procImg, 0, 0);
                
                isProcessing = false;
                if (pendingProcess) {
                    pendingProcess = false;
                    processImage();
                }
                
                // Refresh transform scales to keep layout stacked perfectly
                updateCanvasesTransform();

                // If in Node mode, update the LiteGraph preview nodes with the newly processed image
                if (state.currentMode === 'node' && isGraphInitialized && graph) {
                    const previews = graph.findNodesByType("image/preview");
                    previews.forEach(pNode => {
                        pNode.updatePreview(result.processed_image);
                    });
                }
            });
        } else {
            console.error("Error from backend:", result.error || "Missing image data in response");
            isProcessing = false;
        }
    })
    .catch(err => {
        console.error("Failed to process image on server:", err);
        showPipelineErrorOverlay("NetworkError", "Failed to connect to the image preprocessing server. Please ensure the backend Python server is running and accessible.", err.stack || err.toString());
        isProcessing = false;
    });
}

// ----------------- Actions -----------------

function downloadProcessedImage() {
    const dataUrl = elements.processedCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'preprocessed_image.png';
    link.href = dataUrl;
    link.click();
}

// ----------------- Layout Maximizing Actions -----------------

function maximizeEditor() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-viewer-active');
    appContainer.classList.add('max-editor-active');
    
    // Resize nodes and views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (isGraphInitialized && lCanvas) {
                lCanvas.resize();
                lCanvas.setDirty(true, true);
            }
            autoFitImage();
        });
    });
}

function maximizeViewer() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-editor-active');
    appContainer.classList.add('max-viewer-active');
    
    // Resize nodes and views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (isGraphInitialized && lCanvas) {
                lCanvas.resize();
                lCanvas.setDirty(true, true);
            }
            autoFitImage();
        });
    });
}

function restoreSplit() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-editor-active');
    appContainer.classList.remove('max-viewer-active');
    
    // Resize nodes and views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            if (isGraphInitialized && lCanvas) {
                lCanvas.resize();
                lCanvas.setDirty(true, true);
            }
            autoFitImage();
        });
    });
}
