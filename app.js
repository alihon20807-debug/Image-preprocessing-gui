import { state, elements, createDefaultStep } from './state.js';
import {
    autoFitImage,
    updateCanvasesTransform,
    updateComparisonView,
    updatePixelInspector,
    clearPixelInspector
} from './viewer.js';
import {
    renderPipeline,
    updateCompareReferenceDropdown,
    generateStepId,
    exportPreset,
    importPreset
} from './ui.js';
import {
    setupNodeEditorTheme,
    registerCustomNodes,
    compileGraphToPipeline,
    loadDefaultGraph,
    rebuildGraphFromPipeline
} from './nodes.js';

let isGraphInitialized = false;
let graph = null;
let lCanvas = null;
let lastDrawnBaseline = null;

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

    rebuildGraphFromPipeline(state.pipeline, graph);
    
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
    }
    
    loadImage('testimg.png');
    setupEventListeners();
    state.onProcessTrigger = triggerDebouncedProcess;
}

window.addEventListener('DOMContentLoaded', () => {
    initApp();
});

function loadImage(src) {
    lastDrawnBaseline = null;
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
    // --- Comparison Controls Selectors ---
    elements.compModeSelect.addEventListener('change', (e) => {
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
        renderPipeline();
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
    
    // --- Keyboard Shortcuts for Comparison Modes ---
    let lastActiveBaseline = "original";
    window.addEventListener('keydown', (e) => {
        const activeTag = document.activeElement.tagName;
        if (activeTag === 'INPUT' || activeTag === 'TEXTAREA' || activeTag === 'SELECT') {
            return;
        }
        
        if (e.key === 'Tab') {
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
        } else if (e.key === '1') {
            triggerModeChange("Split Slider");
        } else if (e.key === '2') {
            triggerModeChange("Overlay Opacity");
        } else if (e.key === '3') {
            triggerModeChange("Pixel Difference");
        } else if (e.key === '4') {
            triggerModeChange("X-Ray Lens");
        }
    });

    function triggerModeChange(mode) {
        if (elements.compModeSelect) {
            elements.compModeSelect.value = mode;
            elements.compModeSelect.dispatchEvent(new Event('change'));
        }
    }
    
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
    
    // --- Dynamic flat step additions ---
    const addStepBtn = document.getElementById('add-step-btn');
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
            const hex = e.target.value;
            if (/^#[0-9A-Fa-f]{6}$/.test(hex)) {
                const wrapper = e.target.closest('.color-picker-wrapper');
                if (wrapper) {
                    const colorInput = wrapper.querySelector('.custom-color-picker');
                    if (colorInput) colorInput.value = hex;
                }
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
                renderPipeline();
            } else {
                step[param] = val; // select or color
                if (paramDef.type === 'select') {
                    renderPipeline();
                }
            }
            triggerDebouncedProcess();
        }
    });
    
    // Initial pipeline stack rendering on load
    renderPipeline();;
    
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
        importPreset(e.target.files[0], () => {
            if (state.currentMode === 'node' && isGraphInitialized && graph) {
                rebuildGraphFromPipeline(state.pipeline, graph);
            }
            triggerDebouncedProcess();
        });
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
            
            // Sync the node graph state to the pipeline before switching modes
            if (state.currentMode === 'node' && isGraphInitialized && graph) {
                try {
                    const compiled = compileGraphToPipeline(graph);
                    state.pipeline = compiled.pipeline;
                    state.comparisonBaseline = compiled.comparisonBaseline;
                } catch (compileErr) {
                    console.error("Failed to compile graph on mode switch:", compileErr);
                }
            }
            
            state.currentMode = 'studio';
            btnNode.classList.remove('active');
            btnStudio.classList.add('active');
            
            nodePanel.classList.add('hidden');
            sidebarPanel.classList.remove('hidden');
            appContainer.classList.remove('node-mode-active');
            
            renderPipeline();
            
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
            
            if (graph) {
                rebuildGraphFromPipeline(state.pipeline, graph);
            }
            
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

    // --- Layout Maximization Toggles ---
    const btnLayoutSplit = document.getElementById('btn-layout-split');
    const btnLayoutMaxEditor = document.getElementById('btn-layout-max-editor');
    const btnLayoutMaxViewer = document.getElementById('btn-layout-max-viewer');
    
    if (btnLayoutSplit) btnLayoutSplit.addEventListener('click', restoreSplit);
    if (btnLayoutMaxEditor) btnLayoutMaxEditor.addEventListener('click', maximizeEditor);
    if (btnLayoutMaxViewer) btnLayoutMaxViewer.addEventListener('click', maximizeViewer);
    
    // Initial pipeline stack rendering on load
    renderPipeline();
    
    // Initialize sidebar resizing behavior
    setupSidebarResizer();
}

function handleUploadedFile(file) {
    state.sourceFileName = file.name;
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
let currentAbortController = null;

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
        const offCtx = elements.offscreenCanvas.getContext('2d');
        offCtx.clearRect(0, 0, state.originalWidth, state.originalHeight);
        offCtx.drawImage(state.originalImage, 0, 0);
        originalBase64 = elements.offscreenCanvas.toDataURL('image/png');
    }
    
    // Pack the ordered flat pipeline stack to send to Flask OpenCV
    let pipelineToSend = state.pipeline;
    let baselineToSend = state.comparisonBaseline;
    
    if (state.currentMode === 'node' && isGraphInitialized && graph) {
        try {
            const compiled = compileGraphToPipeline(graph);
            pipelineToSend = compiled.pipeline;
            baselineToSend = compiled.comparisonBaseline;
            
            // Sync compiled graph state back to the main pipeline state
            state.pipeline = compiled.pipeline;
            state.comparisonBaseline = compiled.comparisonBaseline;
        } catch (compileErr) {
            console.error(compileErr);
            showPipelineErrorOverlay("GraphCompileError", compileErr.message, compileErr.stack);
            isProcessing = false;
            return;
        }
    }

    // Resolve "previous" references to absolute step IDs before sending payload
    const clonedPipeline = JSON.parse(JSON.stringify(pipelineToSend));
    clonedPipeline.forEach((step, idx) => {
        if (step.input_source === "previous") {
            step.input_source = (idx === 0) ? "original" : clonedPipeline[idx - 1].id;
        }
        if (step.blend_source === "previous") {
            step.blend_source = (idx === 0) ? "original" : clonedPipeline[idx - 1].id;
        }
    });

    const abortController = new AbortController();
    currentAbortController = abortController;
    const signal = abortController.signal;

    const params = {
        image: originalBase64,
        pipeline: clonedPipeline,
        comparison_baseline: baselineToSend
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
        if (currentAbortController === abortController) {
            currentAbortController = null;
        }
        
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
                requestAnimationFrame(() => {
                    // Draw original canvas ONLY if size changes, we loaded a non-static baseline, or baseline changed to/from original
                    const ogCtx = elements.originalCanvas.getContext('2d');
                    const baselineId = result.original_image === "original" ? "original" : baselineToSend;
                    if (elements.originalCanvas.width !== origImg.width || 
                        elements.originalCanvas.height !== origImg.height || 
                        result.original_image !== "original" ||
                        lastDrawnBaseline !== baselineId) {
                        
                        elements.originalCanvas.width = origImg.width;
                        elements.originalCanvas.height = origImg.height;
                        ogCtx.imageSmoothingEnabled = false;
                        ogCtx.clearRect(0, 0, origImg.width, origImg.height);
                        ogCtx.drawImage(origImg, 0, 0);
                        lastDrawnBaseline = baselineId;
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
            });
        } else {
            console.error("Error from backend:", result.error || "Missing image data in response");
            isProcessing = false;
        }
    })
    .catch(err => {
        if (currentAbortController === abortController) {
            currentAbortController = null;
        }
        
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
    const dataUrl = elements.processedCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'preprocessed_image.png';
    link.href = dataUrl;
    link.click();
}

// ----------------- Layout Maximizing Actions -----------------

function updateLayoutButtons(activeId) {
    const toggles = document.getElementById('node-layout-toggles');
    if (!toggles) return;
    const buttons = toggles.querySelectorAll('.layout-tab');
    buttons.forEach(btn => {
        if (btn.id === activeId) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });
}

function maximizeEditor() {
    const appContainer = document.querySelector('.app-container');
    if (!appContainer) return;
    appContainer.classList.remove('max-viewer-active');
    appContainer.classList.add('max-editor-active');
    updateLayoutButtons('btn-layout-max-editor');
    
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
    updateLayoutButtons('btn-layout-max-viewer');
    
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
    updateLayoutButtons('btn-layout-split');
    
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
    
    window.addEventListener('mousemove', (e) => {
        if (!isResizing) return;
        
        let newWidth = e.clientX;
        // Limit width between 260px and 800px
        newWidth = Math.max(260, Math.min(newWidth, 800));
        
        appContainer.style.setProperty('--sidebar-width', `${newWidth}px`);
        
        // Defer reflows to animation frames to avoid visual lag
        requestAnimationFrame(() => {
            if (isGraphInitialized && lCanvas) {
                lCanvas.resize();
                lCanvas.setDirty(true, true);
            }
            autoFitImage();
        });
    });
    
    window.addEventListener('mouseup', () => {
        if (isResizing) {
            isResizing = false;
            resizer.classList.remove('active');
            document.body.style.cursor = '';
            document.body.style.userSelect = '';
        }
    });
}
