// Centralized State Management

export const state = {
    originalImage: new Image(),
    originalWidth: 0,
    originalHeight: 0,

    // Shared transform state (synchronized zooming & panning)
    transform: { x: 0, y: 0, scale: 1 },
    isDragging: false,
    startPan: { x: 0, y: 0 },

    // Comparison state
    comparisonMode: "Split Slider",
    compPosition: 50, // 0 to 100
    isDraggingDivider: false,
    mouseWrapperX: 0, // Current mouse coords relative to wrapper
    mouseWrapperY: 0,

    // Dynamic Layers builder state
    layers: [], // Holds dynamic structured layers
    comparisonBaseline: "original", // ID of step/layer for baseline comparison, or "original"
    originalImageUploaded: false // Tracks if the original image has been cached on the backend
};

export function createDefaultLayer(name = "New Layer") {
    return {
        id: 'layer_' + Date.now() + '_' + Math.random().toString(36).substr(2, 5),
        name: name,
        disabled: false,
        input_source: 'previous', // 'previous', 'original', or layerId
        blend_mode: 'normal',
        blend_target: 'previous',
        blend_interpolation: 'Bicubic (Sharp)',
        opacity: 100,
        isExpanded: true,
        steps: []
    };
}

// Initialize with a default Base Layer
state.layers = [ createDefaultLayer("Base Layer") ];

// DOM elements cache/registry (resolved on module evaluation)
export const elements = {
    originalCanvas: document.getElementById('original-canvas'),
    processedCanvas: document.getElementById('processed-canvas'),
    offscreenCanvas: document.createElement('canvas'), // GPU filter buffer
    canvasWrapper: document.getElementById('canvas-wrapper'),
    splitDivider: document.getElementById('split-divider'),
    modeBadge: document.getElementById('mode-badge'),

    // Source Upload Section
    dropzone: document.getElementById('dropzone'),
    fileInput: document.getElementById('file-input'),

    // Comparison controls
    compModeSelect: document.getElementById('comparison-mode'),
    compareReferenceSelect: document.getElementById('compare-reference'),
    compSlider: document.getElementById('comp-slider'),
    compSliderLabel: document.getElementById('comp-slider-label'),
    compSliderVal: document.getElementById('comp-slider-val'),
    compSliderGroup: document.getElementById('comp-slider-group'),

    // Layers selector controls
    addLayerBtn: document.getElementById('add-layer-btn'),
    layersListContainer: document.getElementById('layers-list'),

    // Actions
    downloadBtn: document.getElementById('download-btn'),
    resetViewBtn: document.getElementById('reset-view-btn'),

    // Status indicators
    statusDim: document.getElementById('status-dim'),
    statusCoords: document.getElementById('status-coords'),
    statusRgb: document.getElementById('status-rgb'),
    colorPreview: document.getElementById('color-preview'),
    statusZoom: document.getElementById('status-zoom')
};
