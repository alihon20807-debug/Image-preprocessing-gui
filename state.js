// state.js
// Centralized State Management for Schema-Driven Flat Pipeline

export const state = {
    originalImage: new Image(),
    originalWidth: 0,
    originalHeight: 0,
    sourceWidth: 0,
    sourceHeight: 0,

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

    // Flat Pipeline builder state
    pipeline: [], // Holds flat steps stack
    schema: {}, // Stores OPERATIONS_SCHEMA fetched from backend
    comparisonBaseline: "original", // ID of step for Compare Source A, or "original"
    comparisonProcessed: "pipeline", // ID of step for Compare Source B, or "original", or "pipeline"
    originalImageUploaded: false, // Tracks if the original image has been cached on the backend
    sourceFileName: 'testimg.png' // Filename of active image source
};

export function createDefaultStep(type, schema = null) {
    const step = {
        id: 'step_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7),
        type: type,
        disabled: false,
        strength: 100,
        input_source: 'previous'
    };

    // Populate schema defaults
    const activeSchema = schema || state.schema;
    if (activeSchema && activeSchema[type] && activeSchema[type].params) {
        for (const [paramName, paramDef] of Object.entries(activeSchema[type].params)) {
            step[paramName] = paramDef.default;
        }
    }

    return step;
}

// DOM elements cache/registry (resolved on module evaluation)
export const elements = {
    originalCanvas: document.getElementById('original-canvas'),
    processedCanvas: document.getElementById('processed-canvas'),
    processedWrapper: document.getElementById('processed-wrapper'),
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
    comparisonProcessedSelect: document.getElementById('comparison-processed'),
    compSlider: document.getElementById('comp-slider'),
    compSliderLabel: document.getElementById('comp-slider-label'),
    compSliderVal: document.getElementById('comp-slider-val'),
    compSliderGroup: document.getElementById('comp-slider-group'),

    // Pipeline controls
    addLayerBtn: document.getElementById('add-step-btn'), // Mapping button for adding steps
    layersListContainer: document.getElementById('layers-list'), // Mapping container for step cards

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
