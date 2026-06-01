// State Management
let originalImage = new Image();
let originalWidth = 0;
let originalHeight = 0;

// Shared transform state (synchronized zooming & panning)
let transform = { x: 0, y: 0, scale: 1 };
let isDragging = false;
let startPan = { x: 0, y: 0 };

// Comparison state
let comparisonMode = "Split Slider";
let compPosition = 50; // 0 to 100
let isDraggingDivider = false;
let mouseWrapperX = 0; // Current mouse coords relative to wrapper
let mouseWrapperY = 0;

// Dynamic Pipeline builder state
let pipeline = []; // Holds dynamic ordered preprocessing steps
let comparisonBaseline = "original"; // ID of step for baseline comparison, or "original"

// Canvas references
const originalCanvas = document.getElementById('original-canvas');
const processedCanvas = document.getElementById('processed-canvas');
const offscreenCanvas = document.createElement('canvas'); // GPU filter buffer
const canvasWrapper = document.getElementById('canvas-wrapper');
const splitDivider = document.getElementById('split-divider');
const modeBadge = document.getElementById('mode-badge');

// UI Element references
const dropzone = document.getElementById('dropzone');
const fileInput = document.getElementById('file-input');

// Comparison controls
const compModeSelect = document.getElementById('comparison-mode');
const compareReferenceSelect = document.getElementById('compare-reference');
const compSlider = document.getElementById('comp-slider');
const compSliderLabel = document.getElementById('comp-slider-label');
const compSliderVal = document.getElementById('comp-slider-val');
const compSliderGroup = document.getElementById('comp-slider-group');

// Pipeline selector controls
const selectNewStep = document.getElementById('select-new-step');
const addStepBtn = document.getElementById('add-step-btn');
const pipelineListContainer = document.getElementById('pipeline-list');

// Actions
const downloadBtn = document.getElementById('download-btn');
const resetViewBtn = document.getElementById('reset-view-btn');

// Status indicators
const statusDim = document.getElementById('status-dim');
const statusCoords = document.getElementById('status-coords');
const statusRgb = document.getElementById('status-rgb');
const colorPreview = document.getElementById('color-preview');
const statusZoom = document.getElementById('status-zoom');

// ----------------- Initialization & Loading -----------------

window.addEventListener('DOMContentLoaded', () => {
    // Load default image testimg.png
    loadImage('testimg.png');
    setupEventListeners();
});

function loadImage(src) {
    originalImage = new Image();
    originalImage.crossOrigin = "anonymous";
    originalImage.onload = function () {
        originalWidth = originalImage.width;
        originalHeight = originalImage.height;
        
        // Initialize canvases sizes
        originalCanvas.width = originalWidth;
        originalCanvas.height = originalHeight;
        processedCanvas.width = originalWidth;
        processedCanvas.height = originalHeight;
        offscreenCanvas.width = originalWidth;
        offscreenCanvas.height = originalHeight;
        
        // Draw original once onto originalCanvas
        const ogCtx = originalCanvas.getContext('2d');
        ogCtx.drawImage(originalImage, 0, 0);
        
        // Setup status bar metadata
        statusDim.textContent = `${originalWidth} × ${originalHeight} px`;
        
        // Automatically calculate scale to fit canvases inside containers
        autoFitImage();
        
        // Process default state
        processImage();
    };
    originalImage.onerror = function() {
        console.error("Failed to load image: " + src);
    };
    originalImage.src = src;
}

// Automatically scales and centers the image inside container
function autoFitImage() {
    const container = document.getElementById('comparison-view-container');
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    
    // Choose the scale that fits both dimensions
    const scaleX = cWidth / originalWidth;
    const scaleY = cHeight / originalHeight;
    const optimalScale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% fit
    
    // Center alignment
    const x = (cWidth - originalWidth * optimalScale) / 2;
    const y = (cHeight - originalHeight * optimalScale) / 2;
    
    transform = { x, y, scale: optimalScale };
    updateCanvasesTransform();
}

function updateCanvasesTransform() {
    let upsampleScale = 1.0;
    if (originalCanvas.width > 0) {
        upsampleScale = processedCanvas.width / originalCanvas.width;
    }
    
    // Round translation to prevent sub-pixel snapping disparities on different GPU layers
    const x = Math.round(transform.x);
    const y = Math.round(transform.y);
    
    const ogTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${transform.scale})`;
    const procTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${transform.scale / upsampleScale})`;
    
    originalCanvas.style.transform = ogTransformStr;
    processedCanvas.style.transform = procTransformStr;
    
    statusZoom.textContent = `${Math.round(transform.scale * 100)}%`;
    
    // Changing position or zoom requires updating comparison view clip boundaries
    updateComparisonView();
}

// ----------------- Comparison View Controller -----------------

function updateComparisonView() {
    if (originalCanvas.width === 0) return;
    
    // Sync UI badge
    modeBadge.textContent = comparisonMode;
    
    const wrapperWidth = canvasWrapper.clientWidth;
    const canvasLeft = Math.round(transform.x);
    const canvasWidth = originalCanvas.width * transform.scale;
    
    // Reset properties to default first
    processedCanvas.style.mixBlendMode = "normal";
    processedCanvas.style.opacity = "1.0";
    processedCanvas.style.clipPath = "none";
    originalCanvas.style.visibility = "visible";
    splitDivider.classList.add("hidden");
    
    if (comparisonBaseline === "none") {
        modeBadge.textContent = "Single View";
        originalCanvas.style.visibility = "hidden";
        return;
    }
    
    if (comparisonMode === "Split Slider") {
        // Show divider
        splitDivider.classList.remove("hidden");
        splitDivider.style.left = `${compPosition}%`;
        
        // Calculate divider x in screen space relative to wrapper
        const dividerX = wrapperWidth * (compPosition / 100);
        
        // Convert screen divider x to canvas local percentage
        const localDividerX = (dividerX - canvasLeft) / canvasWidth;
        const localDividerPct = localDividerX * 100;
        
        // Apply vertical clipPath polygon to right-side processed canvas
        processedCanvas.style.clipPath = `polygon(${localDividerPct}% 0%, 100% 0%, 100% 100%, ${localDividerPct}% 100%)`;
        
    } else if (comparisonMode === "Overlay Opacity") {
        // Opacity control
        processedCanvas.style.opacity = `${compPosition / 100}`;
        
    } else if (comparisonMode === "Pixel Difference") {
        // Subtractive difference blend mode
        processedCanvas.style.mixBlendMode = "difference";
        
    } else if (comparisonMode === "X-Ray Lens") {
        // Circle spotlight following the cursor
        // Convert screen cursor wrapper coordinates to canvas local percentages
        const canvasRect = originalCanvas.getBoundingClientRect();
        
        const relativeX = (mouseWrapperX - canvasLeft) / transform.scale;
        const relativeY = (mouseWrapperY - transform.y) / transform.scale;
        
        const localXPct = (relativeX / originalCanvas.width) * 100;
        const localYPct = (relativeY / originalCanvas.height) * 100;
        
        // Keep the circle radius constant in screen pixels regardless of zoom
        const R = compPosition * 2.5 + 40; // slider range maps to 40px - 290px spotlight
        const localRadius = R / transform.scale;
        
        processedCanvas.style.clipPath = `circle(${localRadius}px at ${localXPct}% ${localYPct}%)`;
    }
}

// ----------------- Dynamic Pipeline DOM Factory & Event Delegation -----------------

function generateStepId() {
    return 'step_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5);
}

function getStepName(type) {
    switch (type) {
        case 'grayscale': return 'Convert to Grayscale';
        case 'contrast': return 'Contrast & Brightness';
        case 'blur': return 'Gaussian Blur';
        case 'threshold': return 'Thresholding';
        case 'above_to_white': return 'Above to White';
        case 'edges': return 'Edge Detection';
        case 'upsample': return 'Upsampling (Scale Up)';
        case 'crop': return 'Crop Region';
        case 'heal': return 'Stroke Healing';
        case 'fill': return 'Fill Region';
        default: return 'Transformation';
    }
}

function updateCompareReferenceDropdown() {
    if (!compareReferenceSelect) return;
    const selectedVal = comparisonBaseline;
    compareReferenceSelect.innerHTML = `
        <option value="none">None (Show Processed Only)</option>
        <option value="original">Original Image</option>
    `;
    
    pipeline.forEach((step, index) => {
        const option = document.createElement('option');
        option.value = step.id;
        option.textContent = `Step #${index + 1}: ${getStepName(step.type)}` + (step.disabled ? ' (Disabled)' : '');
        compareReferenceSelect.appendChild(option);
    });
    
    if (selectedVal !== "none" && selectedVal !== "original" && !pipeline.some(s => s.id === selectedVal)) {
        comparisonBaseline = "original";
        compareReferenceSelect.value = "original";
    } else {
        compareReferenceSelect.value = selectedVal;
    }
}

function renderPipeline() {
    // Save sidebar scroll position to prevent jumps during swaps or updates
    const scrollContainer = document.querySelector('.sidebar-scroll');
    const prevScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    
    pipelineListContainer.innerHTML = '';
    
    // Dynamically rebuild dropdown references
    updateCompareReferenceDropdown();
    
    if (pipeline.length === 0) {
        pipelineListContainer.innerHTML = `
            <div class="pipeline-card-desc" style="text-align: center; padding: 24px 0; border: 1.5px dashed rgba(255,255,255,0.06); border-radius: 8px;">
                No active transformations.<br>Select a step above to append.
            </div>
        `;
        return;
    }
    
    pipeline.forEach((step, index) => {
        const card = createPipelineCardElement(step, index);
        pipelineListContainer.appendChild(card);
    });
    
    // Restore sidebar scroll position
    if (scrollContainer) {
        scrollContainer.scrollTop = prevScrollTop;
    }
}

function createPipelineCardElement(step, index) {
    const card = document.createElement('div');
    card.className = 'pipeline-card';
    if (step.disabled) {
        card.classList.add('disabled-step');
    }
    if (comparisonBaseline === step.id) {
        card.classList.add('baseline-step');
    }
    card.dataset.index = index;
    card.dataset.id = step.id;
    
    let bodyHtml = '';
    
    if (step.type === 'grayscale') {
        bodyHtml = `<div class="pipeline-card-desc">Converts BGR image channels to a single-channel grayscale matrix.</div>`;
    } else if (step.type === 'contrast') {
        bodyHtml = `
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Contrast</span>
                    <span class="slider-value" id="val-contrast-${step.id}">${step.contrast.toFixed(1)}x</span>
                </div>
                <input type="range" class="custom-range" data-param="contrast" min="0.5" max="3.0" step="0.1" value="${step.contrast}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Brightness</span>
                    <span class="slider-value" id="val-brightness-${step.id}">${step.brightness >= 0 ? '+' + step.brightness : step.brightness}</span>
                </div>
                <input type="range" class="custom-range" data-param="brightness" min="-100" max="100" step="5" value="${step.brightness}">
            </div>
        `;
    } else if (step.type === 'blur') {
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Blur Type</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="blur_type">
                        <option value="Gaussian Blur" ${step.blur_type === 'Gaussian Blur' ? 'selected' : ''}>Gaussian Blur</option>
                        <option value="Median Blur" ${step.blur_type === 'Median Blur' ? 'selected' : ''}>Median Blur</option>
                        <option value="Bilateral Filter" ${step.blur_type === 'Bilateral Filter' ? 'selected' : ''}>Bilateral Filter</option>
                        <option value="Box Blur" ${step.blur_type === 'Box Blur' ? 'selected' : ''}>Box Blur</option>
                    </select>
                </div>
            </div>
            
            <!-- Gaussian / Box Blur Kernel Sliders -->
            <div class="control-group" id="grp-blur-ksize-${step.id}" style="display: ${step.blur_type === 'Gaussian Blur' || step.blur_type === 'Box Blur' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Kernel Width (X, Odd)</span>
                        <span class="slider-value" id="val-blur-kernel-x-${step.id}">${step.kernel_x}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="kernel_x" min="1" max="25" step="2" value="${step.kernel_x}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Kernel Height (Y, Odd)</span>
                        <span class="slider-value" id="val-blur-kernel-y-${step.id}">${step.kernel_y}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="kernel_y" min="1" max="25" step="2" value="${step.kernel_y}">
                </div>
            </div>
            
            <!-- Gaussian Blur Sigma Sliders -->
            <div class="control-group" id="grp-blur-sigma-${step.id}" style="display: ${step.blur_type === 'Gaussian Blur' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Sigma X (0 = auto)</span>
                        <span class="slider-value" id="val-blur-sigma-x-${step.id}">${step.sigma_x.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_x" min="0" max="10" step="0.5" value="${step.sigma_x}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Sigma Y (0 = auto)</span>
                        <span class="slider-value" id="val-blur-sigma-y-${step.id}">${step.sigma_y.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_y" min="0" max="10" step="0.5" value="${step.sigma_y}">
                </div>
            </div>
            
            <!-- Median Blur Kernel Slider -->
            <div class="control-group" id="grp-blur-median-${step.id}" style="display: ${step.blur_type === 'Median Blur' ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Kernel Size (Odd)</span>
                    <span class="slider-value" id="val-blur-kernel-${step.id}">${step.kernel}px</span>
                </div>
                <input type="range" class="custom-range" data-param="kernel" min="3" max="25" step="2" value="${step.kernel}">
            </div>
            
            <!-- Bilateral Filter controls -->
            <div class="control-group" id="grp-blur-bilateral-${step.id}" style="display: ${step.blur_type === 'Bilateral Filter' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Neighborhood Diameter</span>
                        <span class="slider-value" id="val-blur-diameter-${step.id}">${step.diameter}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="diameter" min="1" max="15" step="1" value="${step.diameter}">
                </div>
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Sigma Color</span>
                        <span class="slider-value" id="val-blur-sigmacolor-${step.id}">${step.sigma_color}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_color" min="10" max="150" step="5" value="${step.sigma_color}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Sigma Space</span>
                        <span class="slider-value" id="val-blur-sigmaspace-${step.id}">${step.sigma_space}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_space" min="10" max="150" step="5" value="${step.sigma_space}">
                </div>
            </div>
        `;
    } else if (step.type === 'threshold') {
        const isGlobal = ['Binary Thresholding', 'Binary Thresholding Inverted', 'Truncate Thresholding', 'Threshold to Zero', 'Threshold to Zero Inverted'].includes(step.mode);
        const isAdaptive = ['Adaptive Mean', 'Adaptive Mean Inverted', 'Adaptive Gaussian', 'Adaptive Gaussian Inverted'].includes(step.mode);
        const isAuto = ["Otsu's Thresholding", "Otsu's Thresholding Inverted", 'Triangle Thresholding', 'Triangle Thresholding Inverted'].includes(step.mode);
        const hasConstantC = isAdaptive || isAuto;
        const hasSigmas = ['Adaptive Gaussian', 'Adaptive Gaussian Inverted'].includes(step.mode);
        
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Threshold Mode</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="mode">
                        <option value="Binary Thresholding" ${step.mode === 'Binary Thresholding' ? 'selected' : ''}>Binary Thresholding</option>
                        <option value="Binary Thresholding Inverted" ${step.mode === 'Binary Thresholding Inverted' ? 'selected' : ''}>Binary Thresholding (Inverted)</option>
                        <option value="Truncate Thresholding" ${step.mode === 'Truncate Thresholding' ? 'selected' : ''}>Truncate Thresholding</option>
                        <option value="Threshold to Zero" ${step.mode === 'Threshold to Zero' ? 'selected' : ''}>Threshold to Zero</option>
                        <option value="Threshold to Zero Inverted" ${step.mode === 'Threshold to Zero Inverted' ? 'selected' : ''}>Threshold to Zero (Inverted)</option>
                        <option value="Otsu's Thresholding" ${step.mode === "Otsu's Thresholding" ? 'selected' : ''}>Otsu's Thresholding</option>
                        <option value="Otsu's Thresholding Inverted" ${step.mode === "Otsu's Thresholding Inverted" ? 'selected' : ''}>Otsu's (Inverted)</option>
                        <option value="Triangle Thresholding" ${step.mode === 'Triangle Thresholding' ? 'selected' : ''}>Triangle Thresholding</option>
                        <option value="Triangle Thresholding Inverted" ${step.mode === 'Triangle Thresholding Inverted' ? 'selected' : ''}>Triangle (Inverted)</option>
                        <option value="Adaptive Mean" ${step.mode === 'Adaptive Mean' ? 'selected' : ''}>Adaptive Mean</option>
                        <option value="Adaptive Mean Inverted" ${step.mode === 'Adaptive Mean Inverted' ? 'selected' : ''}>Adaptive Mean (Inverted)</option>
                        <option value="Adaptive Gaussian" ${step.mode === 'Adaptive Gaussian' ? 'selected' : ''}>Adaptive Gaussian</option>
                        <option value="Adaptive Gaussian Inverted" ${step.mode === 'Adaptive Gaussian Inverted' ? 'selected' : ''}>Adaptive Gaussian (Inverted)</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <span class="control-label">Channel Mode</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="channel_mode">
                        <option value="Grayscale" ${step.channel_mode === 'Grayscale' ? 'selected' : ''}>Grayscale Mode</option>
                        <option value="Color Channels" ${step.channel_mode === 'Color Channels' ? 'selected' : ''}>Color Channels</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <span class="control-label">Target Fill Color</span>
                <input type="color" class="custom-color-picker" data-param="fill_color" value="${step.fill_color}" style="width: 100%; height: 36px; border: none; border-radius: 6px; cursor: pointer; background: transparent; padding: 0;">
            </div>
            
            <!-- Global Threshold Value Slider -->
            <div class="control-group" id="grp-thresh-val-${step.id}" style="display: ${isGlobal ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Threshold Value</span>
                    <span class="slider-value" id="val-thresh-${step.id}">${step.value}</span>
                </div>
                <input type="range" class="custom-range" data-param="value" min="0" max="255" step="1" value="${step.value}">
            </div>
            
            <!-- Adaptive Block Size Slider -->
            <div class="control-group" id="grp-thresh-block-${step.id}" style="display: ${isAdaptive ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Adaptive Block Size (Odd)</span>
                    <span class="slider-value" id="val-thresh-blocksize-${step.id}">${step.block_size}px</span>
                </div>
                <input type="range" class="custom-range" data-param="block_size" min="3" max="99" step="2" value="${step.block_size}">
            </div>
            
            <!-- Constant C Offset Slider -->
            <div class="control-group" id="grp-thresh-c-${step.id}" style="display: ${hasConstantC ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Constant C Offset</span>
                    <span class="slider-value" id="val-thresh-c-${step.id}">${step.constant_c >= 0 ? '+' + step.constant_c : step.constant_c}</span>
                </div>
                <input type="range" class="custom-range" data-param="constant_c" min="-30" max="30" step="1" value="${step.constant_c}">
            </div>
            
            <!-- Gaussian Blur Sigmas -->
            <div class="control-group" id="grp-thresh-sigmas-${step.id}" style="display: ${hasSigmas ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Sigma X (0 = auto)</span>
                        <span class="slider-value" id="val-thresh-sigmax-${step.id}">${step.sigma_x.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_x" min="0" max="10" step="0.5" value="${step.sigma_x}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Sigma Y (0 = auto)</span>
                        <span class="slider-value" id="val-thresh-sigmay-${step.id}">${step.sigma_y.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_y" min="0" max="10" step="0.5" value="${step.sigma_y}">
                </div>
            </div>
        `;
    } else if (step.type === 'above_to_white') {
        const isAdaptive = ['Adaptive Mean', 'Adaptive Gaussian'].includes(step.algorithm);
        const hasConstantC = ['Adaptive Mean', 'Adaptive Gaussian', "Otsu's", 'Triangle'].includes(step.algorithm);
        const hasSigmas = step.algorithm === 'Adaptive Gaussian';
        const hasMaxThresh = ['Inside Range [Min, Max]', 'Outside Range'].includes(step.condition);
        
        const blockSizeX = step.block_size_x !== undefined ? step.block_size_x : (step.block_size || 11);
        const blockSizeY = step.block_size_y !== undefined ? step.block_size_y : (step.block_size || 11);
        
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Algorithm</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="algorithm">
                        <option value="Global" ${step.algorithm === 'Global' ? 'selected' : ''}>Global Thresholding</option>
                        <option value="Otsu's" ${step.algorithm === "Otsu's" ? 'selected' : ''}>Otsu's Thresholding</option>
                        <option value="Triangle" ${step.algorithm === 'Triangle' ? 'selected' : ''}>Triangle Thresholding</option>
                        <option value="Adaptive Mean" ${step.algorithm === 'Adaptive Mean' ? 'selected' : ''}>Adaptive Mean</option>
                        <option value="Adaptive Gaussian" ${step.algorithm === 'Adaptive Gaussian' ? 'selected' : ''}>Adaptive Gaussian</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <span class="control-label">Channel Mode</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="channel_mode">
                        <option value="Grayscale" ${step.channel_mode === 'Grayscale' ? 'selected' : ''}>Grayscale Mode</option>
                        <option value="Color Channels" ${step.channel_mode === 'Color Channels' ? 'selected' : ''}>Color Channels</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <span class="control-label">Condition</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="condition">
                        <option value="Above or Equal (>=)" ${step.condition === 'Above or Equal (>=)' ? 'selected' : ''}>Above or Equal (>=)</option>
                        <option value="Above (>)" ${step.condition === 'Above (>)' ? 'selected' : ''}>Above (&gt;)</option>
                        <option value="Below (<)" ${step.condition === 'Below (<)' ? 'selected' : ''}>Below (&lt;)</option>
                        <option value="Below or Equal (<=)" ${step.condition === 'Below or Equal (<=)' ? 'selected' : ''}>Below or Equal (&lt;=)</option>
                        <option value="Inside Range [Min, Max]" ${step.condition === 'Inside Range [Min, Max]' ? 'selected' : ''}>Inside Range [Min, Max]</option>
                        <option value="Outside Range" ${step.condition === 'Outside Range' ? 'selected' : ''}>Outside Range</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <span class="control-label">Target Fill Color</span>
                <input type="color" class="custom-color-picker" data-param="fill_color" value="${step.fill_color}" style="width: 100%; height: 36px; border: none; border-radius: 6px; cursor: pointer; background: transparent; padding: 0;">
            </div>
            
            <!-- Threshold Value / Min Value Slider -->
            <div class="control-group" id="grp-above-to-white-val-${step.id}" style="display: ${step.algorithm === 'Global' ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">${hasMaxThresh ? 'Threshold Min Value' : 'Threshold Value'}</span>
                    <span class="slider-value" id="val-above-to-white-val-${step.id}">${step.value}</span>
                </div>
                <input type="range" class="custom-range" data-param="value" min="0" max="255" step="1" value="${step.value}">
            </div>
            
            <!-- Threshold Max Value Slider -->
            <div class="control-group" id="grp-above-to-white-max-${step.id}" style="display: ${hasMaxThresh ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Threshold Max Value</span>
                    <span class="slider-value" id="val-above-to-white-maxval-${step.id}">${step.value_max}</span>
                </div>
                <input type="range" class="custom-range" data-param="value_max" min="0" max="255" step="1" value="${step.value_max}">
            </div>
            
            <!-- Adaptive Kernel Sliders -->
            <div class="control-group" id="grp-above-to-white-block-${step.id}" style="display: ${isAdaptive ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Kernel Width (X, Odd)</span>
                        <span class="slider-value" id="val-above-to-white-blocksizex-${step.id}">${blockSizeX}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="block_size_x" min="3" max="99" step="2" value="${blockSizeX}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Kernel Height (Y, Odd)</span>
                        <span class="slider-value" id="val-above-to-white-blocksizey-${step.id}">${blockSizeY}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="block_size_y" min="3" max="99" step="2" value="${blockSizeY}">
                </div>
            </div>
            
            <!-- Constant C Offset Slider -->
            <div class="control-group" id="grp-above-to-white-c-${step.id}" style="display: ${hasConstantC ? 'block' : 'none'}">
                <div class="slider-header">
                    <span class="control-label">Constant C Offset</span>
                    <span class="slider-value" id="val-above-to-white-c-${step.id}">${step.constant_c >= 0 ? '+' + step.constant_c : step.constant_c}</span>
                </div>
                <input type="range" class="custom-range" data-param="constant_c" min="-30" max="30" step="1" value="${step.constant_c}">
            </div>
            
            <!-- Gaussian Blur Sigmas -->
            <div class="control-group" id="grp-above-to-white-sigmas-${step.id}" style="display: ${hasSigmas ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Sigma X (0 = auto)</span>
                        <span class="slider-value" id="val-above-to-white-sigmax-${step.id}">${step.sigma_x.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_x" min="0" max="10" step="0.5" value="${step.sigma_x}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Sigma Y (0 = auto)</span>
                        <span class="slider-value" id="val-above-to-white-sigmay-${step.id}">${step.sigma_y.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="sigma_y" min="0" max="10" step="0.5" value="${step.sigma_y}">
                </div>
            </div>
        `;;
    } else if (step.type === 'edges') {
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Algorithm</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="algorithm">
                        <option value="Canny" ${step.algorithm === 'Canny' ? 'selected' : ''}>Canny Edge Detector</option>
                        <option value="Sobel" ${step.algorithm === 'Sobel' ? 'selected' : ''}>Sobel Filter</option>
                        <option value="Scharr" ${step.algorithm === 'Scharr' ? 'selected' : ''}>Scharr Filter</option>
                        <option value="Laplacian" ${step.algorithm === 'Laplacian' ? 'selected' : ''}>Laplacian Filter</option>
                    </select>
                </div>
            </div>
            
            <!-- Canny-Specific Thresholds -->
            <div class="control-group" id="grp-edges-canny-${step.id}" style="display: ${step.algorithm === 'Canny' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Low Threshold</span>
                        <span class="slider-value" id="val-edges-low-${step.id}">${step.low}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="low" min="0" max="255" step="5" value="${step.low}">
                </div>
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">High Threshold</span>
                        <span class="slider-value" id="val-edges-high-${step.id}">${step.high}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="high" min="0" max="255" step="5" value="${step.high}">
                </div>
                <div class="control-group" style="margin-bottom: 12px;">
                    <span class="control-label">Aperture Size</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="aperture">
                            <option value="3" ${step.aperture === 3 ? 'selected' : ''}>3 × 3</option>
                            <option value="5" ${step.aperture === 5 ? 'selected' : ''}>5 × 5</option>
                            <option value="7" ${step.aperture === 7 ? 'selected' : ''}>7 × 7</option>
                        </select>
                    </div>
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <span class="control-label">Gradient L2 Norm</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="l2_gradient">
                            <option value="false" ${step.l2_gradient === false ? 'selected' : ''}>L1 norm (Fast)</option>
                            <option value="true" ${step.l2_gradient === true ? 'selected' : ''}>L2 norm (Accurate)</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <!-- Sobel & Scharr Derivatives -->
            <div class="control-group" id="grp-edges-derivatives-${step.id}" style="display: ${step.algorithm === 'Sobel' || step.algorithm === 'Scharr' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <span class="control-label">Derivative X Order (dx)</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="dx">
                            <option value="0" ${step.dx === 0 ? 'selected' : ''}>0 (None)</option>
                            <option value="1" ${step.dx === 1 ? 'selected' : ''}>1st Derivative</option>
                            <option value="2" ${step.dx === 2 && step.algorithm === 'Sobel' ? 'selected' : ''} style="display: ${step.algorithm === 'Sobel' ? 'block' : 'none'}">2nd Derivative</option>
                        </select>
                    </div>
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <span class="control-label">Derivative Y Order (dy)</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="dy">
                            <option value="0" ${step.dy === 0 ? 'selected' : ''}>0 (None)</option>
                            <option value="1" ${step.dy === 1 ? 'selected' : ''}>1st Derivative</option>
                            <option value="2" ${step.dy === 2 && step.algorithm === 'Sobel' ? 'selected' : ''} style="display: ${step.algorithm === 'Sobel' ? 'block' : 'none'}">2nd Derivative</option>
                        </select>
                    </div>
                </div>
            </div>
            
            <!-- Sobel & Laplacian Kernel Sizes -->
            <div class="control-group" id="grp-edges-ksize-${step.id}" style="display: ${step.algorithm === 'Sobel' || step.algorithm === 'Laplacian' ? 'block' : 'none'}">
                <span class="control-label">Sobel/Laplacian Kernel Size</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="ksize">
                        <option value="1" ${step.ksize === 1 ? 'selected' : ''}>1 × 1</option>
                        <option value="3" ${step.ksize === 3 ? 'selected' : ''}>3 × 3</option>
                        <option value="5" ${step.ksize === 5 ? 'selected' : ''}>5 × 5</option>
                        <option value="7" ${step.ksize === 7 ? 'selected' : ''}>7 × 7</option>
                    </select>
                </div>
            </div>
            
            <!-- Scale and Delta (Sobel, Scharr, Laplacian) -->
            <div class="control-group" id="grp-edges-scale-${step.id}" style="display: ${step.algorithm !== 'Canny' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Scale Factor</span>
                        <span class="slider-value" id="val-edges-scale-${step.id}">${step.scale.toFixed(1)}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="scale" min="0.1" max="5.0" step="0.1" value="${step.scale}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Delta Offset</span>
                        <span class="slider-value" id="val-edges-delta-${step.id}">${step.delta >= 0 ? '+' + step.delta : step.delta}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="delta" min="-100" max="100" step="5" value="${step.delta}">
                </div>
            </div>
        `;
    } else if (step.type === 'edges_fill') {
        bodyHtml = `
            <div style="border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 12px; margin-bottom: 12px;">
                <span class="control-label" style="text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; opacity: 0.6; display: block; margin-bottom: 8px;">Step A: Edge Detection</span>
                
                <div class="control-group">
                    <span class="control-label">Algorithm</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="algorithm">
                            <option value="Canny" ${step.algorithm === 'Canny' ? 'selected' : ''}>Canny Edge Detector</option>
                            <option value="Sobel" ${step.algorithm === 'Sobel' ? 'selected' : ''}>Sobel Filter</option>
                            <option value="Scharr" ${step.algorithm === 'Scharr' ? 'selected' : ''}>Scharr Filter</option>
                            <option value="Laplacian" ${step.algorithm === 'Laplacian' ? 'selected' : ''}>Laplacian Filter</option>
                        </select>
                    </div>
                </div>
                
                <!-- Canny-Specific Thresholds -->
                <div class="control-group" id="grp-edges-canny-${step.id}" style="display: ${step.algorithm === 'Canny' ? 'block' : 'none'}">
                    <div class="control-group" style="margin-bottom: 12px;">
                        <div class="slider-header">
                            <span class="control-label">Low Threshold</span>
                            <span class="slider-value" id="val-edges-low-${step.id}">${step.low}</span>
                        </div>
                        <input type="range" class="custom-range" data-param="low" min="0" max="255" step="5" value="${step.low}">
                    </div>
                    <div class="control-group" style="margin-bottom: 12px;">
                        <div class="slider-header">
                            <span class="control-label">High Threshold</span>
                            <span class="slider-value" id="val-edges-high-${step.id}">${step.high}</span>
                        </div>
                        <input type="range" class="custom-range" data-param="high" min="0" max="255" step="5" value="${step.high}">
                    </div>
                    <div class="control-group" style="margin-bottom: 12px;">
                        <span class="control-label">Aperture Size</span>
                        <div class="select-wrapper">
                            <select class="custom-select" data-param="aperture">
                                <option value="3" ${step.aperture === 3 ? 'selected' : ''}>3 × 3</option>
                                <option value="5" ${step.aperture === 5 ? 'selected' : ''}>5 × 5</option>
                                <option value="7" ${step.aperture === 7 ? 'selected' : ''}>7 × 7</option>
                            </select>
                        </div>
                    </div>
                    <div class="control-group" style="margin-bottom: 0;">
                        <span class="control-label">Gradient L2 Norm</span>
                        <div class="select-wrapper">
                            <select class="custom-select" data-param="l2_gradient">
                                <option value="false" ${step.l2_gradient === false ? 'selected' : ''}>L1 norm (Fast)</option>
                                <option value="true" ${step.l2_gradient === true ? 'selected' : ''}>L2 norm (Accurate)</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Sobel & Scharr Derivatives -->
                <div class="control-group" id="grp-edges-derivatives-${step.id}" style="display: ${step.algorithm === 'Sobel' || step.algorithm === 'Scharr' ? 'block' : 'none'}">
                    <div class="control-group" style="margin-bottom: 12px;">
                        <span class="control-label">Derivative X Order (dx)</span>
                        <div class="select-wrapper">
                            <select class="custom-select" data-param="dx">
                                <option value="0" ${step.dx === 0 ? 'selected' : ''}>0 (None)</option>
                                <option value="1" ${step.dx === 1 ? 'selected' : ''}>1st Derivative</option>
                                <option value="2" ${step.dx === 2 && step.algorithm === 'Sobel' ? 'selected' : ''} style="display: ${step.algorithm === 'Sobel' ? 'block' : 'none'}">2nd Derivative</option>
                            </select>
                        </div>
                    </div>
                    <div class="control-group" style="margin-bottom: 0;">
                        <span class="control-label">Derivative Y Order (dy)</span>
                        <div class="select-wrapper">
                            <select class="custom-select" data-param="dy">
                                <option value="0" ${step.dy === 0 ? 'selected' : ''}>0 (None)</option>
                                <option value="1" ${step.dy === 1 ? 'selected' : ''}>1st Derivative</option>
                                <option value="2" ${step.dy === 2 && step.algorithm === 'Sobel' ? 'selected' : ''} style="display: ${step.algorithm === 'Sobel' ? 'block' : 'none'}">2nd Derivative</option>
                            </select>
                        </div>
                    </div>
                </div>
                
                <!-- Sobel & Laplacian Kernel Sizes -->
                <div class="control-group" id="grp-edges-ksize-${step.id}" style="display: ${step.algorithm === 'Sobel' || step.algorithm === 'Laplacian' ? 'block' : 'none'}">
                    <span class="control-label">Sobel/Laplacian Kernel Size</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="ksize">
                            <option value="1" ${step.ksize === 1 ? 'selected' : ''}>1 × 1</option>
                            <option value="3" ${step.ksize === 3 ? 'selected' : ''}>3 × 3</option>
                            <option value="5" ${step.ksize === 5 ? 'selected' : ''}>5 × 5</option>
                            <option value="7" ${step.ksize === 7 ? 'selected' : ''}>7 × 7</option>
                        </select>
                    </div>
                </div>
                
                <!-- Scale and Delta (Sobel, Scharr, Laplacian) -->
                <div class="control-group" id="grp-edges-scale-${step.id}" style="display: ${step.algorithm !== 'Canny' ? 'block' : 'none'}">
                    <div class="control-group" style="margin-bottom: 12px;">
                        <div class="slider-header">
                            <span class="control-label">Scale Factor</span>
                            <span class="slider-value" id="val-edges-scale-${step.id}">${step.scale.toFixed(1)}</span>
                        </div>
                        <input type="range" class="custom-range" data-param="scale" min="0.1" max="5.0" step="0.1" value="${step.scale}">
                    </div>
                    <div class="control-group" style="margin-bottom: 0;">
                        <div class="slider-header">
                            <span class="control-label">Delta Offset</span>
                            <span class="slider-value" id="val-edges-delta-${step.id}">${step.delta >= 0 ? '+' + step.delta : step.delta}</span>
                        </div>
                        <input type="range" class="custom-range" data-param="delta" min="-100" max="100" step="5" value="${step.delta}">
                    </div>
                </div>
            </div>
            
            <div>
                <span class="control-label" style="text-transform: uppercase; font-size: 10px; letter-spacing: 0.5px; opacity: 0.6; display: block; margin-bottom: 8px;">Step B: Area Contour Filling</span>
                
                <div class="control-group">
                    <span class="control-label">Fill Target Canvas</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="fill_target">
                            <option value="Original Image" ${step.fill_target === 'Original Image' ? 'selected' : ''}>Original Image</option>
                            <option value="Binary Mask (Black background)" ${step.fill_target === 'Binary Mask (Black background)' ? 'selected' : ''}>Binary Mask (Black background)</option>
                            <option value="Binary Mask (White background)" ${step.fill_target === 'Binary Mask (White background)' ? 'selected' : ''}>Binary Mask (White background)</option>
                        </select>
                    </div>
                </div>
                
                <div class="control-group">
                    <span class="control-label">Draw Style</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="draw_style">
                            <option value="Filled Contours" ${step.draw_style === 'Filled Contours' ? 'selected' : ''}>Filled Contours</option>
                            <option value="Contour Outlines" ${step.draw_style === 'Contour Outlines' ? 'selected' : ''}>Contour Outlines</option>
                            <option value="Filled Bounding Boxes" ${step.draw_style === 'Filled Bounding Boxes' ? 'selected' : ''}>Filled Bounding Boxes</option>
                            <option value="Bounding Box Outlines" ${step.draw_style === 'Bounding Box Outlines' ? 'selected' : ''}>Bounding Box Outlines</option>
                        </select>
                    </div>
                </div>
                
                <div class="control-group" id="grp-fill-thickness-${step.id}" style="display: ${step.draw_style === 'Contour Outlines' || step.draw_style === 'Bounding Box Outlines' ? 'block' : 'none'}">
                    <div class="slider-header">
                        <span class="control-label">Line Thickness</span>
                        <span class="slider-value" id="val-fill-thickness-${step.id}">${step.thickness}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="thickness" min="1" max="15" step="1" value="${step.thickness}">
                </div>
                
                <div class="control-group">
                    <div class="slider-header">
                        <span class="control-label">Fill Color Grayscale</span>
                        <span class="slider-value" id="val-fill-color-${step.id}">${step.color}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="color" min="0" max="255" step="1" value="${step.color}">
                </div>
                
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Min Area Size</span>
                        <span class="slider-value" id="val-fill-minarea-${step.id}">${step.min_area}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="min_area" min="0" max="2000" step="10" value="${step.min_area}">
                </div>
                
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Max Area Size</span>
                        <span class="slider-value" id="val-fill-maxarea-${step.id}">${step.max_area}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="max_area" min="100" max="50000" step="100" value="${step.max_area}">
                </div>
            </div>
        `;
    } else if (step.type === 'upsample') {
        bodyHtml = `
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Scale Multiplier</span>
                    <span class="slider-value" id="val-upsample-scale-${step.id}">${step.scale.toFixed(1)}x</span>
                </div>
                <input type="range" class="custom-range" data-param="scale" min="1.0" max="4.0" step="0.5" value="${step.scale}">
            </div>
            <div class="control-group">
                <span class="control-label">Interpolation</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="interpolation">
                        <option value="Bilinear (Fast)" ${step.interpolation === 'Bilinear (Fast)' ? 'selected' : ''}>Bilinear (Fast)</option>
                        <option value="Bicubic (Sharp)" ${step.interpolation === 'Bicubic (Sharp)' ? 'selected' : ''}>Bicubic (Sharp)</option>
                        <option value="Lanczos (Ultra Sharp)" ${step.interpolation === 'Lanczos (Ultra Sharp)' ? 'selected' : ''}>Lanczos (Ultra Sharp)</option>
                        <option value="Nearest Neighbor" ${step.interpolation === 'Nearest Neighbor' ? 'selected' : ''}>Nearest Neighbor</option>
                    </select>
                </div>
            </div>
        `;
    } else if (step.type === 'crop') {
        bodyHtml = `
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Left Crop</span>
                    <span class="slider-value" id="val-crop-left-${step.id}">${step.left}%</span>
                </div>
                <input type="range" class="custom-range" data-param="left" min="0" max="90" step="1" value="${step.left}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Right Crop</span>
                    <span class="slider-value" id="val-crop-right-${step.id}">${step.right}%</span>
                </div>
                <input type="range" class="custom-range" data-param="right" min="0" max="90" step="1" value="${step.right}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Top Crop</span>
                    <span class="slider-value" id="val-crop-top-${step.id}">${step.top}%</span>
                </div>
                <input type="range" class="custom-range" data-param="top" min="0" max="90" step="1" value="${step.top}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Bottom Crop</span>
                    <span class="slider-value" id="val-crop-bottom-${step.id}">${step.bottom}%</span>
                </div>
                <input type="range" class="custom-range" data-param="bottom" min="0" max="90" step="1" value="${step.bottom}">
            </div>
        `;
    } else if (step.type === 'heal') {
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Operation</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="operation">
                        <option value="Heal Gaps in White (Closing)" ${step.operation === 'Heal Gaps in White (Closing)' ? 'selected' : ''}>Heal Gaps in White (Closing)</option>
                        <option value="Heal Gaps in Black (Opening)" ${step.operation === 'Heal Gaps in Black (Opening)' ? 'selected' : ''}>Heal Gaps in Black (Opening)</option>
                        <option value="Dilate (Thicken White)" ${step.operation === 'Dilate (Thicken White)' ? 'selected' : ''}>Dilate (Thicken White)</option>
                        <option value="Erode (Thicken Black)" ${step.operation === 'Erode (Thicken Black)' ? 'selected' : ''}>Erode (Thicken Black)</option>
                    </select>
                </div>
            </div>
            <div class="control-group">
                <span class="control-label">Kernel Shape</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="shape">
                        <option value="Rectangle" ${step.shape === 'Rectangle' ? 'selected' : ''}>Rectangle</option>
                        <option value="Ellipse" ${step.shape === 'Ellipse' ? 'selected' : ''}>Ellipse</option>
                        <option value="Cross" ${step.shape === 'Cross' ? 'selected' : ''}>Cross</option>
                    </select>
                </div>
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Kernel Width (X)</span>
                    <span class="slider-value" id="val-heal-kernel-x-${step.id}">${step.kernel_x}px</span>
                </div>
                <input type="range" class="custom-range" data-param="kernel_x" min="1" max="21" step="1" value="${step.kernel_x}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Kernel Height (Y)</span>
                    <span class="slider-value" id="val-heal-kernel-y-${step.id}">${step.kernel_y}px</span>
                </div>
                <input type="range" class="custom-range" data-param="kernel_y" min="1" max="21" step="1" value="${step.kernel_y}">
            </div>
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Iterations</span>
                    <span class="slider-value" id="val-heal-iterations-${step.id}">${step.iterations}</span>
                </div>
                <input type="range" class="custom-range" data-param="iterations" min="1" max="5" step="1" value="${step.iterations}">
            </div>
        `;
    } else if (step.type === 'fill') {
        bodyHtml = `
            <div class="control-group">
                <span class="control-label">Fill Mode</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="fill_mode">
                        <option value="Hole Filling (Contours)" ${step.fill_mode === 'Hole Filling (Contours)' ? 'selected' : ''}>Hole Filling (Contours)</option>
                        <option value="Flood Fill" ${step.fill_mode === 'Flood Fill' ? 'selected' : ''}>Flood Fill</option>
                        <option value="Corner Background Fill" ${step.fill_mode === 'Corner Background Fill' ? 'selected' : ''}>Corner Background Fill</option>
                    </select>
                </div>
            </div>
            
            <div class="control-group">
                <div class="slider-header">
                    <span class="control-label">Fill Color Grayscale</span>
                    <span class="slider-value" id="val-fill-color-${step.id}">${step.color}</span>
                </div>
                <input type="range" class="custom-range" data-param="color" min="0" max="255" step="1" value="${step.color}">
            </div>
            
            <!-- Contour Hole Filling specific parameters -->
            <div class="control-group" id="grp-fill-contours-${step.id}" style="display: ${step.fill_mode === 'Hole Filling (Contours)' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Min Contour Area</span>
                        <span class="slider-value" id="val-fill-minarea-${step.id}">${step.min_area}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="min_area" min="0" max="2000" step="10" value="${step.min_area}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Max Contour Area</span>
                        <span class="slider-value" id="val-fill-maxarea-${step.id}">${step.max_area}px</span>
                    </div>
                    <input type="range" class="custom-range" data-param="max_area" min="100" max="50000" step="100" value="${step.max_area}">
                </div>
            </div>
            
            <!-- Flood Fill specific parameters -->
            <div class="control-group" id="grp-fill-flood-${step.id}" style="display: ${step.fill_mode === 'Flood Fill' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Seed X Coord (%)</span>
                        <span class="slider-value" id="val-fill-seedx-${step.id}">${step.seed_x}%</span>
                    </div>
                    <input type="range" class="custom-range" data-param="seed_x" min="0" max="100" step="1" value="${step.seed_x}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Seed Y Coord (%)</span>
                        <span class="slider-value" id="val-fill-seedy-${step.id}">${step.seed_y}%</span>
                    </div>
                    <input type="range" class="custom-range" data-param="seed_y" min="0" max="100" step="1" value="${step.seed_y}">
                </div>
            </div>
            
            <!-- Tolerances for Flood Fill & Corner Background Fill -->
            <div class="control-group" id="grp-fill-tolerances-${step.id}" style="display: ${step.fill_mode !== 'Hole Filling (Contours)' ? 'block' : 'none'}">
                <div class="control-group" style="margin-bottom: 12px;">
                    <div class="slider-header">
                        <span class="control-label">Lower Bound Tolerance</span>
                        <span class="slider-value" id="val-fill-lodiff-${step.id}">${step.lo_diff}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="lo_diff" min="0" max="100" step="1" value="${step.lo_diff}">
                </div>
                <div class="control-group" style="margin-bottom: 0;">
                    <div class="slider-header">
                        <span class="control-label">Upper Bound Tolerance</span>
                        <span class="slider-value" id="val-fill-updiff-${step.id}">${step.up_diff}</span>
                    </div>
                    <input type="range" class="custom-range" data-param="up_diff" min="0" max="100" step="1" value="${step.up_diff}">
                </div>
            </div>
        `;
    }
    
    const isDisabled = step.disabled === true;
    const isBaseline = comparisonBaseline === step.id;

    const strength = step.strength !== undefined ? step.strength : 100;

    card.innerHTML = `
        <div class="pipeline-card-header">
            <div class="pipeline-card-title">
                <span class="step-num">#${index + 1}</span>
                <span class="step-name">${getStepName(step.type)}</span>
                ${isBaseline ? '<span class="tag" style="background: rgba(59, 130, 246, 0.15); color: #60a5fa; border: 1px solid rgba(59, 130, 246, 0.3); font-size: 10px; margin-left: 8px; font-weight: bold; line-height: 1; padding: 2px 6px; border-radius: 4px;">Baseline</span>' : ''}
            </div>
            <div class="pipeline-card-actions">
                <button class="action-btn btn-toggle-enable" title="${isDisabled ? 'Enable Step' : 'Disable Step'}">${isDisabled ? '🚫' : '👁️'}</button>
                <button class="action-btn btn-set-baseline ${isBaseline ? 'active' : ''}" title="Set as Comparison Baseline">⚖️</button>
                <button class="action-btn btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>▲</button>
                <button class="action-btn btn-down" title="Move Down" ${index === pipeline.length - 1 ? 'disabled' : ''}>▼</button>
                <button class="action-btn btn-delete" title="Remove">✕</button>
            </div>
        </div>
        <div class="pipeline-card-body">
            ${bodyHtml}
            
            <!-- Universal Step Opacity Blend Slider -->
            <div class="control-group step-strength-wrapper" style="margin-top: 14px; border-top: 1px dashed rgba(255,255,255,0.06); padding-top: 12px;">
                <div class="slider-header">
                    <span class="control-label" style="opacity: 0.7; font-size: 11px;">Step Strength (Dry/Wet Blend)</span>
                    <span class="slider-value" id="val-step-strength-${step.id}" style="opacity: 0.7; font-size: 11px;">${strength}%</span>
                </div>
                <input type="range" class="custom-range" data-param="step_strength" min="0" max="100" step="5" value="${strength}" style="height: 4px;">
            </div>
        </div>
    `;
    
    return card;
}

// ----------------- Interactive Zoom, Pan, Drag & Event Listeners -----------------

function setupEventListeners() {
    const container = document.getElementById('comparison-view-container');
    
    // --- Canvas Panning & Divider Dragging ---
    container.addEventListener('mousedown', (e) => {
        if (e.target.closest('#split-divider')) {
            isDraggingDivider = true;
            e.stopPropagation();
            return;
        }
        
        isDragging = true;
        container.style.cursor = 'grabbing';
        startPan = { x: e.clientX - transform.x, y: e.clientY - transform.y };
    });
    
    container.addEventListener('mousemove', (e) => {
        const rect = container.getBoundingClientRect();
        mouseWrapperX = e.clientX - rect.left;
        mouseWrapperY = e.clientY - rect.top;
        
        if (isDraggingDivider) {
            let pct = (mouseWrapperX / rect.width) * 100;
            pct = Math.min(Math.max(pct, 0), 100);
            compPosition = pct;
            compSlider.value = pct;
            compSliderVal.textContent = `${Math.round(pct)}%`;
            updateComparisonView();
            return;
        }
        
        if (isDragging) {
            transform.x = e.clientX - startPan.x;
            transform.y = e.clientY - startPan.y;
            updateCanvasesTransform();
        }
        
        // Coordinate tracking
        const canvasRect = originalCanvas.getBoundingClientRect();
        const relativeX = (e.clientX - canvasRect.left) / transform.scale;
        const relativeY = (e.clientY - canvasRect.top) / transform.scale;
        
        const imgX = Math.round(relativeX);
        const imgY = Math.round(relativeY);
        
        if (imgX >= 0 && imgX < originalCanvas.width && imgY >= 0 && imgY < originalCanvas.height) {
            updatePixelInspector(imgX, imgY);
        } else {
            clearPixelInspector();
        }
        
        if (comparisonMode === "X-Ray Lens") {
            updateComparisonView();
        }
    });
    
    container.addEventListener('wheel', (e) => {
        e.preventDefault();
        const rect = container.getBoundingClientRect();
        const mouseX = e.clientX - rect.left;
        const mouseY = e.clientY - rect.top;
        
        const zoomFactor = 1.15;
        const wheel = e.deltaY < 0 ? 1 : -1;
        const factor = wheel > 0 ? zoomFactor : 1 / zoomFactor;
        
        const newScale = Math.min(Math.max(transform.scale * factor, 0.02), 80);
        
        transform.x = mouseX - (mouseX - transform.x) * (newScale / transform.scale);
        transform.y = mouseY - (mouseY - transform.y) * (newScale / transform.scale);
        transform.scale = newScale;
        
        updateCanvasesTransform();
    }, { passive: false });
    
    window.addEventListener('mouseup', () => {
        isDragging = false;
        isDraggingDivider = false;
        container.style.cursor = 'grab';
    });
    
    // --- Comparison Controls ---
    compSlider.addEventListener('input', (e) => {
        compPosition = parseInt(e.target.value);
        compSliderVal.textContent = `${compPosition}%`;
        updateComparisonView();
    });
    
    compareReferenceSelect.addEventListener('change', (e) => {
        comparisonBaseline = e.target.value;
        renderPipeline();
        triggerDebouncedProcess();
    });
    
    compModeSelect.addEventListener('change', (e) => {
        comparisonMode = e.target.value;
        compSliderGroup.classList.remove("disabled");
        compSlider.disabled = false;
        
        if (comparisonMode === "Split Slider" || comparisonMode === "Overlay Opacity") {
            compSliderLabel.textContent = comparisonMode === "Split Slider" ? "Split Position" : "Overlay Opacity";
            compSlider.min = 0;
            compSlider.max = 100;
            compSlider.value = compPosition;
            compSliderVal.textContent = `${compPosition}%`;
        } else if (comparisonMode === "Pixel Difference") {
            compSliderGroup.classList.add("disabled");
            compSlider.disabled = true;
            compSliderLabel.textContent = "Diff Mode Active";
            compSliderVal.textContent = "N/A";
        } else if (comparisonMode === "X-Ray Lens") {
            compSliderLabel.textContent = "Spotlight Radius";
            compSlider.min = 1;
            compSlider.max = 100;
            compSlider.value = compPosition;
            compSliderVal.textContent = `${compPosition}%`;
        }
        
        updateComparisonView();
    });
    
    // --- File Uploader ---
    fileInput.addEventListener('change', (e) => {
        if (e.target.files.length > 0) {
            handleUploadedFile(e.target.files[0]);
        }
    });
    
    dropzone.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropzone.classList.add('dragover');
    });
    
    dropzone.addEventListener('dragleave', () => {
        dropzone.classList.remove('dragover');
    });
    
    dropzone.addEventListener('drop', (e) => {
        e.preventDefault();
        dropzone.classList.remove('dragover');
        if (e.dataTransfer.files.length > 0) {
            handleUploadedFile(e.dataTransfer.files[0]);
        }
    });
    
    // --- Dynamic Pipeline Addition ---
    addStepBtn.addEventListener('click', () => {
        const type = selectNewStep.value;
        const id = generateStepId();
        let newStep = { id, type, strength: 100 };
        
        // Append default values depending on step type
        if (type === 'contrast') {
            newStep.contrast = 1.0;
            newStep.brightness = 0;
        } else if (type === 'blur') {
            newStep.blur_type = 'Gaussian Blur';
            newStep.kernel_x = 5;
            newStep.kernel_y = 5;
            newStep.kernel = 5;
            newStep.sigma_x = 0;
            newStep.sigma_y = 0;
            newStep.diameter = 9;
            newStep.sigma_color = 75;
            newStep.sigma_space = 75;
        } else if (type === 'threshold') {
            newStep.mode = 'Binary Thresholding';
            newStep.value = 127;
            newStep.block_size = 11;
            newStep.constant_c = 2;
            newStep.fill_color = '#ffffff';
            newStep.channel_mode = 'Grayscale';
            newStep.sigma_x = 0;
            newStep.sigma_y = 0;
        } else if (type === 'above_to_white') {
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
        } else if (type === 'edges') {
            newStep.algorithm = 'Canny';
            newStep.low = 50;
            newStep.high = 150;
            newStep.aperture = 3;
            newStep.l2_gradient = false;
            newStep.dx = 1;
            newStep.dy = 0;
            newStep.ksize = 3;
            newStep.scale = 1.0;
            newStep.delta = 0;
        } else if (type === 'edges_fill') {
            newStep.algorithm = 'Canny';
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
        } else if (type === 'fill') {
            newStep.fill_mode = 'Hole Filling (Contours)';
            newStep.color = 255;
            newStep.min_area = 0;
            newStep.max_area = 10000;
            newStep.seed_x = 50;
            newStep.seed_y = 50;
            newStep.lo_diff = 20;
            newStep.up_diff = 20;
        } else if (type === 'upsample') {
            newStep.scale = 2.0;
            newStep.interpolation = 'Bicubic (Sharp)';
        } else if (type === 'crop') {
            newStep.left = 0;
            newStep.right = 0;
            newStep.top = 0;
            newStep.bottom = 0;
        } else if (type === 'heal') {
            newStep.operation = 'Heal Gaps in White (Closing)';
            newStep.shape = 'Rectangle';
            newStep.kernel_x = 3;
            newStep.kernel_y = 3;
            newStep.iterations = 1;
        }
        
        pipeline.push(newStep);
        renderPipeline();
        triggerDebouncedProcess();
    });
    
    // --- Event Delegation on Dynamic Pipeline List Container ---
    
    // 1. Click Actions (Swap position / Delete step / Toggle enable / Set baseline)
    pipelineListContainer.addEventListener('click', (e) => {
        const card = e.target.closest('.pipeline-card');
        if (!card) return;
        
        const index = parseInt(card.dataset.index);
        const id = card.dataset.id;
        
        if (e.target.closest('.btn-delete')) {
            pipeline = pipeline.filter(step => step.id !== id);
            renderPipeline();
            triggerDebouncedProcess();
        } else if (e.target.closest('.btn-toggle-enable')) {
            const step = pipeline.find(s => s.id === id);
            if (step) {
                step.disabled = !step.disabled;
                renderPipeline();
                triggerDebouncedProcess();
            }
        } else if (e.target.closest('.btn-set-baseline')) {
            if (comparisonBaseline === id) {
                comparisonBaseline = "none";
            } else {
                comparisonBaseline = id;
            }
            renderPipeline();
            triggerDebouncedProcess();
        } else if (e.target.closest('.btn-up')) {
            if (index > 0) {
                const temp = pipeline[index];
                pipeline[index] = pipeline[index - 1];
                pipeline[index - 1] = temp;
                renderPipeline();
                triggerDebouncedProcess();
            }
        } else if (e.target.closest('.btn-down')) {
            if (index < pipeline.length - 1) {
                const temp = pipeline[index];
                pipeline[index] = pipeline[index + 1];
                pipeline[index + 1] = temp;
                renderPipeline();
                triggerDebouncedProcess();
            }
        }
    });
    
    // 2. Input Actions (Slider parameter modifications)
    pipelineListContainer.addEventListener('input', (e) => {
        const card = e.target.closest('.pipeline-card');
        if (!card) return;
        
        const id = card.dataset.id;
        const step = pipeline.find(s => s.id === id);
        if (!step) return;
        
        const param = e.target.dataset.param;
        const val = e.target.value;
        
        if (param) {
            if (param === 'step_strength') {
                step.strength = parseInt(val);
                document.getElementById(`val-step-strength-${id}`).textContent = `${step.strength}%`;
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
                }
            } else if (step.type === 'upsample') {
                if (param === 'scale') {
                    step.scale = parseFloat(val);
                    document.getElementById(`val-upsample-scale-${id}`).textContent = `${step.scale.toFixed(1)}x`;
                }
            } else if (step.type === 'crop') {
                let left = step.left;
                let right = step.right;
                let top = step.top;
                let bottom = step.bottom;
                
                if (param === 'left') {
                    left = parseInt(val);
                    if (left + right > 95) {
                        left = 95 - right;
                        e.target.value = left;
                    }
                    step.left = left;
                    document.getElementById(`val-crop-left-${id}`).textContent = `${left}%`;
                } else if (param === 'right') {
                    right = parseInt(val);
                    if (left + right > 95) {
                        right = 95 - left;
                        e.target.value = right;
                    }
                    step.right = right;
                    document.getElementById(`val-crop-right-${id}`).textContent = `${right}%`;
                } else if (param === 'top') {
                    top = parseInt(val);
                    if (top + bottom > 95) {
                        top = 95 - bottom;
                        e.target.value = top;
                    }
                    step.top = top;
                    document.getElementById(`val-crop-top-${id}`).textContent = `${top}%`;
                } else if (param === 'bottom') {
                    bottom = parseInt(val);
                    if (top + bottom > 95) {
                        bottom = 95 - top;
                        e.target.value = bottom;
                    }
                    step.bottom = bottom;
                    document.getElementById(`val-crop-bottom-${id}`).textContent = `${bottom}%`;
                }
            } else if (step.type === 'heal') {
                if (param === 'kernel_x') {
                    step.kernel_x = parseInt(val);
                    document.getElementById(`val-heal-kernel-x-${id}`).textContent = `${step.kernel_x}px`;
                } else if (param === 'kernel_y') {
                    step.kernel_y = parseInt(val);
                    document.getElementById(`val-heal-kernel-y-${id}`).textContent = `${step.kernel_y}px`;
                } else if (param === 'iterations') {
                    step.iterations = parseInt(val);
                    document.getElementById(`val-heal-iterations-${id}`).textContent = step.iterations;
                }
            } else if (step.type === 'fill' || step.type === 'edges_fill') {
                if (param === 'color') {
                    step.color = parseInt(val);
                    document.getElementById(`val-fill-color-${id}`).textContent = step.color;
                } else if (param === 'thickness') {
                    step.thickness = parseInt(val);
                    document.getElementById(`val-fill-thickness-${id}`).textContent = `${step.thickness}px`;
                } else if (param === 'min_area') {
                    step.min_area = parseInt(val);
                    document.getElementById(`val-fill-minarea-${id}`).textContent = `${step.min_area}px`;
                } else if (param === 'max_area') {
                    step.max_area = parseInt(val);
                    document.getElementById(`val-fill-maxarea-${id}`).textContent = `${step.max_area}px`;
                } else if (param === 'seed_x') {
                    step.seed_x = parseInt(val);
                    document.getElementById(`val-fill-seedx-${id}`).textContent = `${step.seed_x}%`;
                } else if (param === 'seed_y') {
                    step.seed_y = parseInt(val);
                    document.getElementById(`val-fill-seedy-${id}`).textContent = `${step.seed_y}%`;
                } else if (param === 'lo_diff') {
                    step.lo_diff = parseInt(val);
                    document.getElementById(`val-fill-lodiff-${id}`).textContent = step.lo_diff;
                } else if (param === 'up_diff') {
                    step.up_diff = parseInt(val);
                    document.getElementById(`val-fill-updiff-${id}`).textContent = step.up_diff;
                }
            }
            triggerDebouncedProcess();
        }
    });
    
    // 3. Selection Actions (Threshold mode dropdown selection)
    pipelineListContainer.addEventListener('change', (e) => {
        const card = e.target.closest('.pipeline-card');
        if (!card) return;
        
        const id = card.dataset.id;
        const step = pipeline.find(s => s.id === id);
        if (!step) return;
        
        const param = e.target.dataset.param;
        if (param === 'interpolation') {
            step.interpolation = e.target.value;
            triggerDebouncedProcess();
        } else if (param === 'blur_type') {
            step.blur_type = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        } else if (param === 'algorithm') {
            step.algorithm = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        } else if (param === 'aperture') {
            step.aperture = parseInt(e.target.value);
            triggerDebouncedProcess();
        } else if (param === 'l2_gradient') {
            step.l2_gradient = (e.target.value === 'true');
            triggerDebouncedProcess();
        } else if (param === 'dx') {
            step.dx = parseInt(e.target.value);
            triggerDebouncedProcess();
        } else if (param === 'dy') {
            step.dy = parseInt(e.target.value);
            triggerDebouncedProcess();
        } else if (param === 'ksize') {
            step.ksize = parseInt(e.target.value);
            triggerDebouncedProcess();
        } else if (param === 'fill_mode') {
            step.fill_mode = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        } else if (param === 'fill_target') {
            step.fill_target = e.target.value;
            triggerDebouncedProcess();
        } else if (param === 'draw_style') {
            step.draw_style = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        } else if (param === 'operation') {
            step.operation = e.target.value;
            triggerDebouncedProcess();
        } else if (param === 'shape') {
            step.shape = e.target.value;
            triggerDebouncedProcess();
        } else if (param === 'mode') {
            step.mode = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        } else if (param === 'channel_mode') {
            step.channel_mode = e.target.value;
            triggerDebouncedProcess();
        } else if (param === 'condition') {
            step.condition = e.target.value;
            renderPipeline();
            triggerDebouncedProcess();
        }
    });
    
    // Reset View & Download
    resetViewBtn.addEventListener('click', autoFitImage);
    downloadBtn.addEventListener('click', downloadProcessedImage);
    
    // --- JSON Preset Import/Export ---
    const exportBtn = document.getElementById('export-preset-btn');
    const importBtn = document.getElementById('import-preset-btn');
    const importFile = document.getElementById('import-preset-file');
    
    exportBtn.addEventListener('click', () => {
        if (pipeline.length === 0) {
            alert("Your pipeline is currently empty. Add some steps before exporting a preset!");
            return;
        }
        const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(pipeline, null, 2));
        const downloadAnchor = document.createElement('a');
        downloadAnchor.setAttribute("href", dataStr);
        downloadAnchor.setAttribute("download", "preprocessing_preset.json");
        document.body.appendChild(downloadAnchor);
        downloadAnchor.click();
        downloadAnchor.remove();
    });
    
    importBtn.addEventListener('click', () => {
        importFile.click();
    });
    
    importFile.addEventListener('change', (e) => {
        if (e.target.files.length === 0) return;
        const file = e.target.files[0];
        const reader = new FileReader();
        reader.onload = function(evt) {
            try {
                const imported = JSON.parse(evt.target.result);
                if (Array.isArray(imported)) {
                    const isValid = imported.every(step => step.id && step.type);
                    if (isValid) {
                        pipeline = imported;
                        renderPipeline();
                        triggerDebouncedProcess();
                    } else {
                        alert("Invalid preset file format. Each step must contain an 'id' and 'type'.");
                    }
                } else {
                    alert("Invalid preset file format. Preset must be a JSON array.");
                }
            } catch (err) {
                alert("Failed to parse JSON file: " + err.message);
            }
            importFile.value = '';
        };
        reader.readAsText(file);
    });

    const closeErrorBtn = document.getElementById('close-error-btn');
    if (closeErrorBtn) {
        closeErrorBtn.addEventListener('click', hidePipelineErrorOverlay);
    }
}

function handleUploadedFile(file) {
    const reader = new FileReader();
    reader.onload = function(e) {
        loadImage(e.target.result);
    };
    reader.readAsDataURL(file);
}

function updatePixelInspector(x, y) {
    statusCoords.textContent = `X: ${x}, Y: ${y}`;
    
    const displayCtx = processedCanvas.getContext('2d');
    try {
        const upsampleScale = originalCanvas.width > 0 ? processedCanvas.width / originalCanvas.width : 1.0;
        const px = Math.round(x * upsampleScale);
        const py = Math.round(y * upsampleScale);
        const pixel = displayCtx.getImageData(px, py, 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        statusRgb.textContent = `RGB(${r}, ${g}, ${b})`;
        colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
    } catch (e) {
        // cross-origin protection block
    }
}

function clearPixelInspector() {
    statusCoords.textContent = `X: -, Y: -`;
    statusRgb.textContent = `RGB(-, -, -)`;
    colorPreview.style.backgroundColor = 'transparent';
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
    if (originalWidth === 0) return;
    
    if (isProcessing) {
        pendingProcess = true;
        return;
    }
    
    isProcessing = true;
    
    // Export original canvas to base64
    const offCtx = offscreenCanvas.getContext('2d');
    offCtx.clearRect(0, 0, originalWidth, originalHeight);
    offCtx.drawImage(originalImage, 0, 0);
    const originalBase64 = offscreenCanvas.toDataURL('image/png');
    
    // Pack the ordered pipeline steps to send to Flask OpenCV
    const params = {
        image: originalBase64,
        pipeline: pipeline,
        comparison_baseline: comparisonBaseline
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
            
            try {
                const data = await response.json();
                if (data.error_type) errType = data.error_type;
                if (data.message) errMsg = data.message;
                if (data.traceback) errTrace = data.traceback;
            } catch (jsonErr) {
                try {
                    const text = await response.text();
                    errTrace = text;
                } catch (txtErr) {
                    errTrace = 'Could not read error response.';
                }
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
            const loadProc = new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = params.image === result.original_image ? originalImage.src : result.original_image; // optimized check
                if (img.src.startsWith('data:image')) {
                    // direct assign
                } else {
                    img.src = result.original_image;
                }
            });
            const loadProcImg = new Promise((resolve) => {
                const img = new Image();
                img.onload = () => resolve(img);
                img.src = result.processed_image;
            });
            
            Promise.all([loadProcImg, loadProc]).then(([procImg, origImg]) => {
                // Resize and draw original
                originalCanvas.width = origImg.width;
                originalCanvas.height = origImg.height;
                const ogCtx = originalCanvas.getContext('2d');
                ogCtx.clearRect(0, 0, origImg.width, origImg.height);
                ogCtx.drawImage(origImg, 0, 0);
                
                // Resize and draw processed
                processedCanvas.width = procImg.width;
                processedCanvas.height = procImg.height;
                const procCtx = processedCanvas.getContext('2d');
                procCtx.clearRect(0, 0, procImg.width, procImg.height);
                procCtx.drawImage(procImg, 0, 0);
                
                isProcessing = false;
                if (pendingProcess) {
                    pendingProcess = false;
                    processImage();
                }
                
                // Refresh transform scales to keep layout stacked perfectly
                updateCanvasesTransform();
            });
        } else {
            console.error("Error from backend:", result.error || "Missing image data in response");
            isProcessing = false;
        }
    })
    .catch(err => {
        console.error("Failed to process image on server:", err);
        isProcessing = false;
    });
}

// ----------------- Actions -----------------

function downloadProcessedImage() {
    const dataUrl = processedCanvas.toDataURL('image/png');
    const link = document.createElement('a');
    link.download = 'preprocessed_image.png';
    link.href = dataUrl;
    link.click();
}
