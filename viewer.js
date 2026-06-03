import { state, elements } from './state.js';

// Automatically scales and centers the image inside container
export function autoFitImage() {
    const refWidth = elements.originalCanvas.width || state.originalWidth;
    const refHeight = elements.originalCanvas.height || state.originalHeight;
    if (refWidth === 0) return;
    
    const container = document.getElementById('comparison-view-container');
    if (!container || container.clientWidth === 0 || container.clientHeight === 0) return;
    
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    
    // Choose the scale that fits both dimensions
    const scaleX = cWidth / refWidth;
    const scaleY = cHeight / refHeight;
    const optimalScale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% fit
    
    // Center alignment
    const x = (cWidth - refWidth * optimalScale) / 2;
    const y = (cHeight - refHeight * optimalScale) / 2;
    
    state.transform = { x, y, scale: optimalScale };
    updateCanvasesTransform();
}

export function updateCanvasesTransform() {
    let upsampleScaleX = 1.0;
    let upsampleScaleY = 1.0;
    if (elements.originalCanvas.width > 0 && elements.originalCanvas.height > 0) {
        upsampleScaleX = elements.processedCanvas.width / elements.originalCanvas.width;
        upsampleScaleY = elements.processedCanvas.height / elements.originalCanvas.height;
    }
    
    // Round translation to prevent sub-pixel snapping disparities on different GPU layers
    const x = Math.round(state.transform.x);
    const y = Math.round(state.transform.y);
    
    const ogTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${state.transform.scale})`;
    const procTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${state.transform.scale / upsampleScaleX}, ${state.transform.scale / upsampleScaleY})`;
    
    elements.originalCanvas.style.transform = ogTransformStr;
    if (elements.processedWrapper) {
        elements.processedWrapper.style.width = `${elements.processedCanvas.width}px`;
        elements.processedWrapper.style.height = `${elements.processedCanvas.height}px`;
        elements.processedWrapper.style.transform = procTransformStr;
        elements.processedCanvas.style.transform = "none";
    } else {
        elements.processedCanvas.style.transform = procTransformStr;
    }
    
    elements.statusZoom.textContent = `${Math.round(state.transform.scale * 100)}%`;
    
    // Changing position or zoom requires updating comparison view clip boundaries
    updateComparisonView();
}

// ----------------- Comparison View Controller -----------------

export function updateComparisonView() {
    if (elements.originalCanvas.width === 0) return;
    
    // Sync UI badge
    elements.modeBadge.textContent = state.comparisonMode;
    
    const wrapperWidth = elements.canvasWrapper ? elements.canvasWrapper.getBoundingClientRect().width : 1;
    const canvasLeft = Math.round(state.transform.x);
    const canvasWidth = elements.originalCanvas.width * state.transform.scale;
    
    const procTarget = elements.processedWrapper || elements.processedCanvas;
    
    // Reset properties to default first
    procTarget.style.mixBlendMode = "normal";
    procTarget.style.opacity = "1.0";
    procTarget.style.clipPath = "none";
    if (elements.processedWrapper) {
        elements.processedCanvas.style.mixBlendMode = "normal";
        elements.processedCanvas.style.opacity = "1.0";
        elements.processedCanvas.style.clipPath = "none";
    }
    elements.originalCanvas.style.visibility = "visible";
    elements.splitDivider.classList.add("hidden");
    
    if (state.comparisonBaseline === "none") {
        elements.modeBadge.textContent = "Single View";
        elements.originalCanvas.style.visibility = "hidden";
        return;
    }
    
    if (state.comparisonMode === "Split Slider") {
        // Show divider
        elements.splitDivider.classList.remove("hidden");
        elements.splitDivider.style.left = `${state.compPosition}%`;
        
        // Calculate divider x in screen space relative to wrapper
        const dividerX = wrapperWidth * (state.compPosition / 100);
        
        // Convert screen divider x to canvas local percentage
        const localDividerX = (dividerX - canvasLeft) / canvasWidth;
        const localDividerPct = localDividerX * 100;
        const clampedPct = Math.max(0, Math.min(100, localDividerPct));
        
        // Apply vertical clipPath polygon to right-side processed canvas
        procTarget.style.clipPath = `polygon(${clampedPct}% 0%, 100% 0%, 100% 100%, ${clampedPct}% 100%)`;
        
    } else if (state.comparisonMode === "Overlay Opacity") {
        // Opacity control
        procTarget.style.opacity = `${state.compPosition / 100}`;
        
    } else if (state.comparisonMode === "Pixel Difference") {
        // Subtractive difference blend mode
        procTarget.style.mixBlendMode = "difference";
        
    } else if (state.comparisonMode === "X-Ray Lens") {
        // Circle spotlight following the cursor
        // Convert screen cursor wrapper coordinates to canvas local percentages
        const canvasLeftOffset = Math.round(state.transform.x);
        const scaleVal = Math.max(0.1, state.transform.scale || 1.0);
        let upX = 1.0, upY = 1.0;
        if (elements.originalCanvas.width > 0 && elements.originalCanvas.height > 0) {
            upX = elements.processedCanvas.width / elements.originalCanvas.width;
            upY = elements.processedCanvas.height / elements.originalCanvas.height;
        }
        const scaleValProcX = scaleVal / upX;
        const scaleValProcY = scaleVal / upY;
        const relativeXProc = (state.mouseWrapperX - canvasLeftOffset) / scaleValProcX;
        const relativeYProc = (state.mouseWrapperY - Math.round(state.transform.y)) / scaleValProcY;
        
        const localXPct = (relativeXProc / elements.processedCanvas.width) * 100;
        const localYPct = (relativeYProc / elements.processedCanvas.height) * 100;
        
        // Keep the circle radius constant in screen pixels regardless of zoom
        const R = state.compPosition * 2.5 + 40; // slider range maps to 40px - 290px spotlight
        const localRadius = R / scaleValProcX;
        
        procTarget.style.clipPath = `circle(${localRadius}px at ${localXPct}% ${localYPct}%)`;
    }
}

// ----------------- Pixel Coordinate and Color Inspector -----------------

export function updatePixelInspector(x, y) {
    elements.statusCoords.textContent = `X: ${x}, Y: ${y}`;
    
    let targetCanvas = elements.processedCanvas;
    
    // Check if we are in Split Slider mode and cursor is on the baseline (left) side
    if (state.comparisonBaseline !== "none" && state.comparisonMode === "Split Slider") {
        const wrapperWidth = elements.canvasWrapper ? elements.canvasWrapper.clientWidth : 0;
        const canvasLeft = Math.round(state.transform.x);
        const canvasWidth = elements.originalCanvas.width * state.transform.scale;
        
        const dividerX = wrapperWidth * (state.compPosition / 100);
        const localDividerX = canvasWidth > 0 ? (dividerX - canvasLeft) / canvasWidth : 0.5;
        
        if (x < localDividerX * elements.originalCanvas.width) {
            targetCanvas = elements.originalCanvas;
        }
    }
    
    const displayCtx = targetCanvas.getContext('2d', { willReadFrequently: true });
    try {
        let px = x;
        let py = y;
        
        // Scale coordinates if targetCanvas is processedCanvas
        if (targetCanvas === elements.processedCanvas) {
            const upsampleScaleX = elements.originalCanvas.width > 0 ? elements.processedCanvas.width / elements.originalCanvas.width : 1.0;
            const upsampleScaleY = elements.originalCanvas.height > 0 ? elements.processedCanvas.height / elements.originalCanvas.height : 1.0;
            px = Math.round(x * upsampleScaleX);
            py = Math.round(y * upsampleScaleY);
        }
        
        const pixel = displayCtx.getImageData(px, py, 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        elements.statusRgb.textContent = `RGB(${r}, ${g}, ${b})`;
        elements.colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
    } catch (e) {
        elements.statusRgb.textContent = `RGB(Blocked)`;
        elements.colorPreview.style.backgroundColor = 'transparent';
    }
}

export function resetComparisonOverlays() {
    const procTarget = elements.processedWrapper || elements.processedCanvas;
    if (!procTarget) return;
    procTarget.style.mixBlendMode = "normal";
    procTarget.style.opacity = "1.0";
    procTarget.style.clipPath = "none";
    if (elements.processedWrapper) {
        elements.processedCanvas.style.mixBlendMode = "normal";
        elements.processedCanvas.style.opacity = "1.0";
        elements.processedCanvas.style.clipPath = "none";
    }
    elements.originalCanvas.style.visibility = "visible";
    elements.splitDivider.classList.add("hidden");
}

export function clearPixelInspector() {
    elements.statusCoords.textContent = `X: -, Y: -`;
    elements.statusRgb.textContent = `RGB(-, -, -)`;
    elements.colorPreview.style.backgroundColor = 'transparent';
}
