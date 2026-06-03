import { state, elements, createDefaultStep } from './state.js';
import {
    autoFitImage,
    updateCanvasesTransform,
    updateComparisonView,
    updatePixelInspector,
    clearPixelInspector,
    resetComparisonOverlays
} from './viewer.js';
import {
    renderPipeline,
    updateCompareSourceDropdowns,
    generateStepId,
    exportPreset,
    importPreset,
    updateStepCardParamVisibility
} from './ui.js';

let lastDrawnBaseline = null;
let lastPipelineResultUrl = null;

// ----------------- Initialization & Loading -----------------

async function initApp() {
    try {
        const res = await fetch('/schema');
        if (!res.ok) throw new Error("Failed to load schema");
        state.schema = await res.json();
        
        // Populate the select-add-step select element
        const selectAddStep = document.getElementById('select-add-step');
        if (selectAddStep) {
            selectAddStep.innerHTML = '';
            for (const [key, op] of Object.entries(state.schema)) {
                const opt = document.createElement('option');
                opt.value = key;
                opt.textContent = op.name;
                selectAddStep.appendChild(opt);
            }
        }
        
        // Setup initial default pipeline step if empty
        if (state.pipeline.length === 0) {
            state.pipeline = [ createDefaultStep('grayscale', state.schema) ];
        }
    } catch (err) {
        console.error("Initialization error:", err);
        showPipelineErrorOverlay(
            "InitializationError",
            "Failed to load the operations schema from the server. Please ensure the backend Python server is running and refresh the page.",
            err.stack || err.toString()
        );
    }
    
    loadImage('testimg.png');
    setupEventListeners();
}

window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function loadImage(src) {
    lastDrawnBaseline = null;
    state.originalImage = new Image();
    state.originalImage.crossOrigin = "anonymous";
    state.originalImage.onload = function () {
        state.sourceWidth = state.originalImage.width;
        state.sourceHeight = state.originalImage.height;
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
        ogCtx.imageSmoothingEnabled = false;
        ogCtx.drawImage(state.originalImage, 0, 0);
        
        // Setup status bar metadata
        elements.statusDim.textContent = `${state.originalWidth} × ${state.originalHeight} px`;
        
        // Update active dropzone state
        const activeState = document.getElementById('dropzone-active-state');
        const emptyState = document.getElementById('dropzone-empty-state');
        const thumbnail = document.getElementById('source-thumbnail');
        const filenameLabel = document.getElementById('source-filename');
        const dimensionsLabel = document.getElementById('source-dimensions');
        
        if (activeState && emptyState && thumbnail && filenameLabel && dimensionsLabel) {
            thumbnail.src = src;
            filenameLabel.textContent = state.sourceFileName || 'image.png';
            dimensionsLabel.textContent = `${state.originalWidth} × ${state.originalHeight} px`;
            
            emptyState.classList.add('hidden');
            activeState.classList.remove('hidden');
            
            const dropzone = document.getElementById('dropzone');
            if (dropzone) dropzone.classList.add('has-image');
        }
        
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
    if (container) {
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
        
        container.addEventListener('wheel', (e) => {
            e.preventDefault();
            
            const zoomIntensity = 0.1;
            const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0 };
            
            // Get mouse coordinates relative to the canvas-wrapper
            const mouseX = e.clientX - rect.left;
            const mouseY = e.clientY - rect.top;
            
            // Convert to canvas coordinates (before zoom is applied)
            const currentScale = Math.max(0.1, state.transform.scale || 1.0);
            const canvasX = (mouseX - state.transform.x) / currentScale;
            const canvasY = (mouseY - state.transform.y) / currentScale;
            
            // Calculate new scale smoothly for both mouse wheels and trackpads
            const zoomFactor = Math.exp(-e.deltaY * 0.003);
            let newScale = currentScale * zoomFactor;
            
            // Bound scale between 10% and 1500%
            newScale = Math.max(0.1, Math.min(newScale, 15.0));
            
            // Adjust translation coordinates to keep zoom centered on mouse cursor
            state.transform.x = mouseX - canvasX * newScale;
            state.transform.y = mouseY - canvasY * newScale;
            state.transform.scale = newScale;
            
            updateCanvasesTransform();
        }, { passive: false });
        
        container.addEventListener('mousemove', (e) => {
            if (state.isDraggingDivider) return;
            const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
            state.mouseWrapperX = e.clientX - rect.left;
            state.mouseWrapperY = e.clientY - rect.top;
            
            if (state.comparisonMode === "X-Ray Lens") {
                updateComparisonView();
            }
            
            if (state.originalWidth > 0) {
                const canvasLeft = Math.round(state.transform.x);
                const currentScale = Math.max(0.1, state.transform.scale || 1.0);
                
                const relativeX = (state.mouseWrapperX - canvasLeft) / currentScale;
                const relativeY = (state.mouseWrapperY - state.transform.y) / currentScale;
                
                // Check if within image boundary before updating inspector coords
                if (elements.originalCanvas && relativeX >= 0 && relativeX < elements.originalCanvas.width && relativeY >= 0 && relativeY < elements.originalCanvas.height) {
                    updatePixelInspector(Math.floor(relativeX), Math.floor(relativeY));
                } else {
                    clearPixelInspector();
                }
            }
        });
        
        container.addEventListener('mouseleave', () => {
            clearPixelInspector();
            if (state.comparisonMode === "X-Ray Lens") {
                resetComparisonOverlays();
            }
        });

        // Touch event handlers for mobile panning & pinch-zoom
        let touchLastDist = 0;
        let touchLastCenter = { x: 0, y: 0 };
        let isPinching = false;
        
        container.addEventListener('touchstart', (e) => {
            if (e.touches.length === 1) {
                if (e.target.closest('#split-divider')) {
                    state.isDraggingDivider = true;
                    return;
                }
                const touch = e.touches[0];
                const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
                state.mouseWrapperX = touch.clientX - rect.left;
                state.mouseWrapperY = touch.clientY - rect.top;
                
                state.isDragging = true;
                state.startPan = { x: touch.clientX - state.transform.x, y: touch.clientY - state.transform.y };
                isPinching = false;
            } else if (e.touches.length === 2) {
                state.isDragging = false;
                state.isDraggingDivider = false;
                isPinching = true;
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                touchLastDist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                
                const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0 };
                touchLastCenter = {
                    x: (t1.clientX + t2.clientX) / 2 - rect.left,
                    y: (t1.clientY + t2.clientY) / 2 - rect.top
                };
            }
        }, { passive: true });
        
        container.addEventListener('touchmove', (e) => {
            if (state.isDragging && e.touches.length === 1) {
                const touch = e.touches[0];
                const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
                state.mouseWrapperX = touch.clientX - rect.left;
                state.mouseWrapperY = touch.clientY - rect.top;
                
                state.transform.x = touch.clientX - state.startPan.x;
                state.transform.y = touch.clientY - state.startPan.y;
                updateCanvasesTransform();
                
                if (state.originalWidth > 0) {
                    const canvasLeft = Math.round(state.transform.x);
                    const currentScale = Math.max(0.1, state.transform.scale || 1.0);
                    const relativeX = (state.mouseWrapperX - canvasLeft) / currentScale;
                    const relativeY = (state.mouseWrapperY - state.transform.y) / currentScale;
                    if (elements.originalCanvas && relativeX >= 0 && relativeX < elements.originalCanvas.width && relativeY >= 0 && relativeY < elements.originalCanvas.height) {
                        updatePixelInspector(Math.floor(relativeX), Math.floor(relativeY));
                    } else {
                        clearPixelInspector();
                    }
                }
            } else if (isPinching && e.touches.length === 2) {
                e.preventDefault(); // prevent default zoom/scroll
                const t1 = e.touches[0];
                const t2 = e.touches[1];
                const dist = Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
                if (touchLastDist > 0) {
                    const factor = dist / touchLastDist;
                    const currentScale = Math.max(0.1, state.transform.scale || 1.0);
                    let newScale = currentScale * factor;
                    newScale = Math.max(0.1, Math.min(newScale, 15.0));
                    
                    const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0 };
                    const centerX = (t1.clientX + t2.clientX) / 2 - rect.left;
                    const centerY = (t1.clientY + t2.clientY) / 2 - rect.top;
                    
                    const canvasX = (centerX - state.transform.x) / currentScale;
                    const canvasY = (centerY - state.transform.y) / currentScale;
                    
                    state.transform.x = centerX - canvasX * newScale;
                    state.transform.y = centerY - canvasY * newScale;
                    state.transform.scale = newScale;
                    
                    touchLastDist = dist;
                    touchLastCenter = { x: centerX, y: centerY };
                    updateCanvasesTransform();
                }
            }
        }, { passive: false });
        
        container.addEventListener('touchend', () => {
            state.isDragging = false;
            isPinching = false;
        });
        container.addEventListener('touchcancel', () => {
            state.isDragging = false;
            isPinching = false;
        });
    }
    
    window.addEventListener('mousemove', (e) => {
        // Handle split divider dragging
        if (state.isDraggingDivider) {
            const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
            let x = e.clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            state.compPosition = (x / rect.width) * 100;
            
            if (elements.compSlider) elements.compSlider.value = Math.round(state.compPosition);
            if (elements.compSliderVal) elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
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
    
    window.addEventListener('touchmove', (e) => {
        if (state.isDraggingDivider && e.touches.length === 1) {
            const rect = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect() : { left: 0, top: 0, width: 1 };
            let x = e.touches[0].clientX - rect.left;
            x = Math.max(0, Math.min(x, rect.width));
            state.compPosition = (x / rect.width) * 100;
            
            if (elements.compSlider) elements.compSlider.value = Math.round(state.compPosition);
            if (elements.compSliderVal) elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
            updateComparisonView();
            if (e.cancelable) e.preventDefault();
        }
    }, { passive: false });
    
    window.addEventListener('mouseup', () => {
        state.isDragging = false;
        state.isDraggingDivider = false;
        if (container) container.style.cursor = 'grab';
    });
    
    // --- Comparison Controls Selectors ---
    // --- Comparison Controls Selectors ---
    if (elements.compModeSelect) elements.compModeSelect.addEventListener('change', (e) => {
        state.comparisonMode = e.target.value;
        
        // Synchronize active states on segmented buttons
        const modeSelector = document.getElementById('comparison-mode-selector');
        if (modeSelector) {
            const modeBtns = modeSelector.querySelectorAll('.mode-btn');
            modeBtns.forEach(btn => {
                btn.classList.toggle('active', btn.dataset.mode === state.comparisonMode);
            });
        }
        
        // Adjust split slider UI configs depending on active modes
        if (state.comparisonMode === "Split Slider") {
            elements.compSliderGroup.style.display = "flex";
            elements.compSliderLabel.textContent = "Split Position";
            elements.compSlider.min = "0";
            elements.compSlider.max = "100";
            elements.compSlider.step = "1";
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
        } else if (state.comparisonMode === "Overlay Opacity") {
            elements.compSliderGroup.style.display = "flex";
            elements.compSliderLabel.textContent = "Opacity Value";
            elements.compSlider.min = "0";
            elements.compSlider.max = "100";
            elements.compSlider.step = "5";
            elements.compSlider.value = Math.round(state.compPosition);
            elements.compSliderVal.textContent = `${Math.round(state.compPosition)}%`;
        } else if (state.comparisonMode === "X-Ray Lens") {
            elements.compSliderGroup.style.display = "flex";
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
    
    // Wire click events on comparison mode segmented tab switcher buttons
    const modeSelector = document.getElementById('comparison-mode-selector');
    if (modeSelector) {
        const modeBtns = modeSelector.querySelectorAll('.mode-btn');
        modeBtns.forEach(btn => {
            btn.addEventListener('click', () => {
                const mode = btn.dataset.mode;
                if (elements.compModeSelect) {
                    elements.compModeSelect.value = mode;
                    elements.compModeSelect.dispatchEvent(new Event('change'));
                }
            });
        });
    }
    
    elements.compareReferenceSelect.addEventListener('change', (e) => {
        state.comparisonBaseline = e.target.value;
        lastActiveBaseline = e.target.value;
        renderPipeline();
        triggerDebouncedProcess();
    });
    
    if (elements.comparisonProcessedSelect) {
        elements.comparisonProcessedSelect.addEventListener('change', (e) => {
            state.comparisonProcessed = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        });
    }
    
    if (elements.compSlider) elements.compSlider.addEventListener('input', (e) => {
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
    
    let dragActive = false;
    elements.dropzone.addEventListener('dragenter', (e) => {
        e.preventDefault();
        dragActive = true;
        elements.dropzone.classList.add('dragover');
    });
    
    elements.dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dragActive = true;
    });
    
    elements.dropzone.addEventListener('dragleave', (e) => {
        e.preventDefault();
        dragActive = false;
        setTimeout(() => {
            if (!dragActive) elements.dropzone.classList.remove('dragover');
        }, 50);
    });
    
    elements.dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dragActive = false;
        elements.dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });


    // --- Dynamic flat step additions ---
    const addStepBtn = elements.addLayerBtn;
    if (addStepBtn) {
        addStepBtn.addEventListener('click', () => {
            const select = document.getElementById('select-add-step');
            if (select) {
                const stepType = select.value;
                const newStep = createDefaultStep(stepType, state.schema);
                state.pipeline.push(newStep);
                renderPipeline();
                triggerDebouncedProcess();
            }
        });
    }
    
    // --- Event Delegation on Dynamic Pipeline Container ---
    
    // 1. Click Actions (Deletions, moves, toggles, baselines, accordion collapse)
    elements.layersListContainer.addEventListener('click', (e) => {
        const stepCard = e.target.closest('.pipeline-card');
        if (stepCard) {
            const stepId = stepCard.dataset.id;
            const stepIndex = parseInt(stepCard.dataset.index);
            
            if (e.target.closest('.btn-delete')) {
                state.pipeline = state.pipeline.filter(s => s.id !== stepId);
                if (state.comparisonBaseline === stepId) {
                    state.comparisonBaseline = "original";
                }
                if (state.comparisonProcessed === stepId) {
                    state.comparisonProcessed = "pipeline";
                }
                renderPipeline();
                triggerDebouncedProcess();
            } else if (e.target.closest('.btn-toggle-enable')) {
                const step = state.pipeline.find(s => s.id === stepId);
                if (step) {
                    step.disabled = !step.disabled;
                    renderPipeline();
                    triggerDebouncedProcess();
                }
            } else if (e.target.closest('.btn-set-baseline')) {
                state.comparisonBaseline = (state.comparisonBaseline === stepId) ? "none" : stepId;
                renderPipeline();
                triggerDebouncedProcess();
            } else if (e.target.closest('.btn-collapse')) {
                const step = state.pipeline.find(s => s.id === stepId);
                if (step) {
                    step.collapsed = !step.collapsed;
                    renderPipeline();
                }
            } else if (e.target.closest('.btn-up')) {
                if (stepIndex > 0) {
                    const temp = state.pipeline[stepIndex];
                    state.pipeline[stepIndex] = state.pipeline[stepIndex - 1];
                    state.pipeline[stepIndex - 1] = temp;
                    renderPipeline();
                    triggerDebouncedProcess();
                }
            } else if (e.target.closest('.btn-down')) {
                if (stepIndex < state.pipeline.length - 1) {
                    const temp = state.pipeline[stepIndex];
                    state.pipeline[stepIndex] = state.pipeline[stepIndex + 1];
                    state.pipeline[stepIndex + 1] = temp;
                    renderPipeline();
                    triggerDebouncedProcess();
                }
            }
        }
    });

    // Collapse All / Expand All toolbar button actions
    const btnCollapseAll = document.getElementById('btn-collapse-all');
    if (btnCollapseAll) {
        btnCollapseAll.addEventListener('click', () => {
            state.pipeline.forEach(step => { step.collapsed = true; });
            renderPipeline();
        });
    }
    const btnExpandAll = document.getElementById('btn-expand-all');
    if (btnExpandAll) {
        btnExpandAll.addEventListener('click', () => {
            state.pipeline.forEach(step => { step.collapsed = false; });
            renderPipeline();
        });
    }
        // 2. Input Actions (Dynamic parameter sliders & inputs)
    elements.layersListContainer.addEventListener('input', (e) => {
        const card = e.target.closest('.pipeline-card');
        if (!card) return;
        
        const id = card.dataset.id;
        const step = state.pipeline.find(s => s.id === id);
        if (!step) return;
        
        const param = e.target.dataset.param;
        if (!param) return;
        
        // Handle bidirectional color input <-> color text synchronization
        if (e.target.classList.contains('custom-color-picker')) {
            const wrapper = e.target.closest('.color-picker-wrapper');
            if (wrapper) {
                const textInput = wrapper.querySelector('.custom-color-text');
                if (textInput) textInput.value = e.target.value;
            }
        } else if (e.target.classList.contains('custom-color-text')) {
            let hex = e.target.value.trim();
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                hex = '#' + hex;
            }
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const wrapper = e.target.closest('.color-picker-wrapper');
                if (wrapper) {
                    const colorInput = wrapper.querySelector('.custom-color-picker');
                    if (colorInput) colorInput.value = hex;
                }
                step[param] = hex;
                triggerDebouncedProcess();
                return;
            } else {
                // Ignore invalid hex while typing
                return;
            }
        }
        
        const val = e.target.type === 'checkbox' ? e.target.checked : e.target.value;
        
        if (param === 'step_strength') {
            step.strength = parseInt(val);
            document.getElementById(`val-step-strength-${id}`).textContent = `${step.strength}%`;
            triggerDebouncedProcess();
            return;
        }
        
        if (param === 'input_source' || param === 'blend_source') {
            step[param] = val;
            renderPipeline(); // Re-render dropdown items / card dependency references
            triggerDebouncedProcess();
            return;
        }
        
        const opSchema = state.schema[step.type];
        if (opSchema && opSchema.params && opSchema.params[param]) {
            const paramDef = opSchema.params[param];
            
            if (paramDef.type === 'int') {
                step[param] = parseInt(val);
                const el = document.getElementById(`val-${param}-${id}`);
                if (el) el.textContent = step[param] >= 0 && param === 'brightness' ? `+${step[param]}` : step[param];
            } else if (paramDef.type === 'float') {
                step[param] = parseFloat(val);
                const el = document.getElementById(`val-${param}-${id}`);
                if (el) el.textContent = step[param].toFixed(1) + (param === 'scale' && step.type === 'upsample' ? 'x' : '');
            } else if (paramDef.type === 'bool') {
                step[param] = val === true || val === 'true';
                updateStepCardParamVisibility(card, step);
            } else {
                let finalVal = val;
                if (paramDef.type === 'select') {
                    const options = paramDef.options || [];
                    if (options.length > 0 && typeof options[0] === 'number') {
                        finalVal = Number(val);
                    }
                }
                step[param] = finalVal; // select or color
                if (paramDef.type === 'select') {
                    updateStepCardParamVisibility(card, step);
                }
            }
            triggerDebouncedProcess();
        }
    });
    
    elements.layersListContainer.addEventListener('change', (e) => {
        if (e.target.classList.contains('custom-color-text')) {
            const card = e.target.closest('.pipeline-card');
            if (!card) return;
            
            const id = card.dataset.id;
            const step = state.pipeline.find(s => s.id === id);
            if (!step) return;
            
            const param = e.target.dataset.param;
            if (!param) return;
            
            let hex = e.target.value.trim();
            if (/^[0-9A-Fa-f]{6}$/.test(hex)) {
                hex = '#' + hex;
            } else if (/^[0-9A-Fa-f]{3}$/.test(hex)) {
                hex = '#' + hex;
            }
            
            if (/^#[0-9A-Fa-f]{3}$/.test(hex)) {
                hex = '#' + hex[1] + hex[1] + hex[2] + hex[2] + hex[3] + hex[3];
            }
            
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                step[param] = hex;
                e.target.value = hex;
                const wrapper = e.target.closest('.color-picker-wrapper');
                if (wrapper) {
                    const colorInput = wrapper.querySelector('.custom-color-picker');
                    if (colorInput) colorInput.value = hex;
                }
                triggerDebouncedProcess();
            } else {
                e.target.value = step[param] || '#000000';
            }
        }
    });
    
    // Reset View & Download
    if (elements.resetViewBtn) elements.resetViewBtn.addEventListener('click', autoFitImage);
    if (elements.downloadBtn) elements.downloadBtn.addEventListener('click', downloadProcessedImage);
    
    // --- JSON Preset Import/Export ---
    const exportBtn = document.getElementById('export-preset-btn');
    const importBtn = document.getElementById('import-preset-btn');
    const importFile = document.getElementById('import-preset-file');
    
    if (exportBtn) exportBtn.addEventListener('click', exportPreset);
    if (importBtn) importBtn.addEventListener('click', () => importFile.click());
    
    importFile.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        importPreset(e.target.files[0], () => {
            triggerDebouncedProcess();
        });
        importFile.value = '';
    });

    const closeErrorBtn = document.getElementById('close-error-btn');
    if (closeErrorBtn) {
        closeErrorBtn.addEventListener('click', hidePipelineErrorOverlay);
    }
    
    // --- Keyboard Shortcuts for Comparison Modes ---
    let lastActiveBaseline = 'original';
    window.addEventListener('keydown', (e) => {
        // Global Alt-prefixed Navigation Shortcuts
        if (e.altKey) {
            const key = e.key.toLowerCase();
            if (key === 'e') {
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
        if (activeEl && (activeEl.tagName === 'INPUT' || activeEl.tagName === 'TEXTAREA' || activeEl.tagName === 'SELECT' || activeEl.isContentEditable)) {
            return;
        }
        
        if (e.key === '`') {
            e.preventDefault();
            if (state.comparisonBaseline !== 'none') {
                lastActiveBaseline = state.comparisonBaseline;
                state.comparisonBaseline = 'none';
            } else {
                state.comparisonBaseline = lastActiveBaseline || 'original';
            }
            if (elements.compareReferenceSelect) {
                elements.compareReferenceSelect.value = state.comparisonBaseline;
                elements.compareReferenceSelect.dispatchEvent(new Event('change'));
            }
        } else {
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
                if (state.isDraggingDivider) return;
                e.preventDefault();
                let targetPos = e.key === '[' ? 0 : 100;
                if (state.comparisonMode === "X-Ray Lens" && targetPos < 5) {
                    targetPos = 5;
                }
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
        }
    });



    
    // Initial pipeline stack rendering on load
    renderPipeline();
    
    // Initialize sidebar resizing behavior
    setupSidebarResizer();
    
    // Add window resize auto-fit to maintain responsive layout
    window.addEventListener('resize', () => {
        requestAnimationFrame(() => {
            autoFitImage();
        });
    });
}

function handleUploadedFile(file) {
    if (file.name.endsWith('.json') || file.type === 'application/json') {
        importPreset(file, () => {
            triggerDebouncedProcess();
        });
    } else {
        state.sourceFileName = file.name;
        const reader = new FileReader();
        reader.onload = function(e) {
            loadImage(e.target.result);
        };
        reader.onerror = function() {
            console.error("FileReader failed to read file:", file.name);
            showPipelineErrorOverlay("FileReadError", "Failed to read the selected file. The file may be corrupted, locked, or too large.");
        };
        reader.readAsDataURL(file);
    }
}

// ----------------- Image Processing API Pipeline -----------------

let isProcessing = false;
let pendingProcess = false;
let debounceTimer = null;
let currentAbortController = null;
let processRetryCount = 0;
const MAX_PROCESS_RETRIES = 3;

// Debouncing prevents spamming network calls to Flask during drag actions
function triggerDebouncedProcess() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
        processImage();
    }, 16); // 16ms debouncer to handle execution throttling natively
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
        if (currentAbortController) {
            currentAbortController.abort();
            currentAbortController = null;
        }
        pendingProcess = true;
        return;
    }
    
    isProcessing = true;
    
    // Export original canvas to base64 only if it has not been cached on backend yet
    let originalBase64 = "cached";
    if (!state.originalImageUploaded) {
        try {
            const offCtx = elements.offscreenCanvas.getContext('2d');
            offCtx.clearRect(0, 0, state.sourceWidth, state.sourceHeight);
            offCtx.drawImage(state.originalImage, 0, 0);
            originalBase64 = elements.offscreenCanvas.toDataURL('image/png');
        } catch (e) {
            console.error("SecurityError: Canvas is tainted. Cross-origin image drop/upload is blocked from export without CORS.", e);
            showPipelineErrorOverlay("SecurityError", "Unable to process this image because it is from a different website and doesn't permit cross-origin access (CORS). Please download the image to your computer first and upload it.", e.stack || e.toString());
            isProcessing = false;
            return;
        }
    }
    
    // We send a clone of the pipeline as-is. Caching and "previous" resolutions are handled by Flask backend.
    const clonedPipeline = JSON.parse(JSON.stringify(state.pipeline));

    const abortController = new AbortController();
    currentAbortController = abortController;
    const signal = abortController.signal;

    const params = {
        image: originalBase64,
        pipeline: clonedPipeline,
        comparison_baseline: state.comparisonBaseline,
        comparison_processed: state.comparisonProcessed
    };
    
    fetch('/process', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify(params),
        signal: signal
    })
    .then(async response => {
        if (currentAbortController === abortController) {
            currentAbortController = null;
        }
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
                if (processRetryCount >= MAX_PROCESS_RETRIES) {
                    showPipelineErrorOverlay("CacheMissError", "Failed to re-synchronize with the backend after multiple attempts. Please reload the page or clear the backend cache.");
                    throw new Error("Max retries exceeded for cache miss recovery.");
                }
                processRetryCount++;
                state.originalImageUploaded = false;
                isProcessing = false;
                processImage();
                return Promise.reject({ name: 'CacheMissRetry' });
            }
            
            showPipelineErrorOverlay(errType, errMsg, errTrace);
            throw new Error(`Pipeline aborted: ${errType} - ${errMsg}`);
        }
        return response.json();
    })
    .then(result => {
        if (currentAbortController === abortController) {
            currentAbortController = null;
        }
        
        // Hide error overlay on success
        hidePipelineErrorOverlay();
        processRetryCount = 0;
        
        if (result.processed_image && result.original_image) {
            if (result.pipeline_result) {
                lastPipelineResultUrl = result.pipeline_result;
            }
            // Mark original image as successfully cached on server
            state.originalImageUploaded = true;
            
            const loadProc = new Promise((resolve, reject) => {
                if (result.original_image === "original") {
                    resolve(state.originalImage);
                } else {
                    const img = new Image();
                    img.onload = () => resolve(img);
                    img.onerror = () => reject(new Error("Failed to load baseline image from server"));
                    img.src = result.original_image;
                }
            });
            const loadProcImg = new Promise((resolve, reject) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.onerror = () => reject(new Error("Failed to load processed image from server"));
                img.src = result.processed_image;
            });
            
            Promise.all([loadProcImg, loadProc]).then(([procImg, origImg]) => {
                // Show processed image dimensions in status bar
                if (elements.statusDim) {
                    elements.statusDim.textContent = `${procImg.width} × ${procImg.height} px`;
                }

                // Draw original (Source A) canvas — always redraw from response
                const ogCtx = elements.originalCanvas.getContext('2d');
                if (elements.originalCanvas.width !== origImg.width || elements.originalCanvas.height !== origImg.height) {
                    elements.originalCanvas.width = origImg.width;
                    elements.originalCanvas.height = origImg.height;
                }
                ogCtx.imageSmoothingEnabled = false;
                ogCtx.drawImage(origImg, 0, 0);
                
                // Draw processed (Source B) canvas — always redraw from response
                const procCtx = elements.processedCanvas.getContext('2d', { willReadFrequently: true });
                if (elements.processedCanvas.width !== procImg.width || elements.processedCanvas.height !== procImg.height) {
                    elements.processedCanvas.width = procImg.width;
                    elements.processedCanvas.height = procImg.height;
                }
                procCtx.imageSmoothingEnabled = false;
                procCtx.drawImage(procImg, 0, 0);
                
                isProcessing = false;
                if (pendingProcess) {
                    pendingProcess = false;
                    processImage();
                }
                
                // Refresh transform scales to keep layout stacked perfectly
                updateCanvasesTransform();
                autoFitImage();

            });
        } else {
            console.error("Missing image data in response from backend");
            isProcessing = false;
        }
    })
    .catch(err => {
        if (currentAbortController === abortController) {
            currentAbortController = null;
        }
        
        if (err && err.name === 'CacheMissRetry') {
            return;
        }

        hidePipelineErrorOverlay();
        
        if (err.name === 'AbortError') {
            isProcessing = false;
            if (pendingProcess) {
                pendingProcess = false;
                processImage();
            }
            return;
        }
        
        console.error("Failed to process image on server:", err);
        showPipelineErrorOverlay("NetworkError", "Failed to connect to the image preprocessing server. Please ensure the backend Python server is running and accessible.", err.stack || err.toString());
        isProcessing = false;
    });
}

// ----------------- Actions -----------------

function downloadProcessedImage() {
    try {
        const dataUrl = lastPipelineResultUrl || elements.processedCanvas.toDataURL('image/png');
        const link = document.createElement('a');
        link.download = 'preprocessed_image.png';
        link.href = dataUrl;
        link.click();
    } catch (e) {
        console.error("SecurityError: Cannot download tainted canvas.", e);
        alert("Unable to download this image due to canvas cross-origin restrictions (CORS). Please ensure you run the app on a local server and load images locally.");
    }
}

// ----------------- Layout Maximizing Actions -----------------



function maximizeEditor() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-viewer-active');
    appContainer.classList.add('max-editor-active');
    
    // Resize views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            autoFitImage();
        });
    });
}

function maximizeViewer() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-editor-active');
    appContainer.classList.add('max-viewer-active');
    
    // Resize views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            autoFitImage();
        });
    });
}

function restoreSplit() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-editor-active');
    appContainer.classList.remove('max-viewer-active');
    
    // Resize views safely after layout reflow
    requestAnimationFrame(() => {
        requestAnimationFrame(() => {
            autoFitImage();
        });
    });
}

window.addEventListener('beforeunload', () => {
    if (navigator.sendBeacon) {
        navigator.sendBeacon('/clear-cache');
    } else {
        fetch('/clear-cache', { method: 'POST', keepalive: true });
    }
});

function setupSidebarResizer() {
    const resizer = document.getElementById('sidebar-resizer');
    const appContainer = document.querySelector('.app-container');
    if (!resizer || !appContainer) return;
    
    let isResizing = false;
    
    resizer.addEventListener('mousedown', (e) => {
        isResizing = true;
        resizer.classList.add('active');
        document.body.style.cursor = 'ew-resize';
        document.body.style.userSelect = 'none';
        e.preventDefault();
    });
    
    resizer.addEventListener('touchstart', (e) => {
        if (e.touches.length === 1) {
            isResizing = true;
            resizer.classList.add('active');
            document.body.style.cursor = 'ew-resize';
            document.body.style.userSelect = 'none';
            e.preventDefault();
        }
    }, { passive: false });
    
    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        let newWidth = e.clientX;
        const maxWidth = Math.max(260, window.innerWidth - 100);
        newWidth = Math.max(260, Math.min(newWidth, maxWidth));
        
        appContainer.style.setProperty('--sidebar-width', `${newWidth}px`);
        
        // Defer reflows to animation frames to avoid visual lag
        requestAnimationFrame(() => {
            autoFitImage();
        });
    });
    
    window.addEventListener('touchmove', (e) => {
        if (!isResizing || e.touches.length !== 1) return;
        
        let newWidth = e.touches[0].clientX;
        const maxWidth = Math.max(260, window.innerWidth - 100);
        newWidth = Math.max(260, Math.min(newWidth, maxWidth));
        
        appContainer.style.setProperty('--sidebar-width', `${newWidth}px`);
        
        requestAnimationFrame(() => {
            autoFitImage();
        });
    }, { passive: false });
    
    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
    
    window.addEventListener('touchend', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
    
    window.addEventListener('touchcancel', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}
