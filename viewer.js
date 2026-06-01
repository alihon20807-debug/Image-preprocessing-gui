import { state, elements } from './state.js';

// Automatically scales and centers the image inside container
export function autoFitImage() {
    if (state.originalWidth === 0) return;
    
    const container = document.getElementById('comparison-view-container');
    const cWidth = container.clientWidth;
    const cHeight = container.clientHeight;
    
    // Choose the scale that fits both dimensions
    const scaleX = cWidth / state.originalWidth;
    const scaleY = cHeight / state.originalHeight;
    const optimalScale = Math.min(scaleX, scaleY, 1) * 0.9; // 90% fit
    
    // Center alignment
    const x = (cWidth - state.originalWidth * optimalScale) / 2;
    const y = (cHeight - state.originalHeight * optimalScale) / 2;
    
    state.transform = { x, y, scale: optimalScale };
    updateCanvasesTransform();
}

export function updateCanvasesTransform() {
    let upsampleScale = 1.0;
    if (elements.originalCanvas.width > 0) {
        upsampleScale = elements.processedCanvas.width / elements.originalCanvas.width;
    }
    
    // Round translation to prevent sub-pixel snapping disparities on different GPU layers
    const x = Math.round(state.transform.x);
    const y = Math.round(state.transform.y);
    
    const ogTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${state.transform.scale})`;
    const procTransformStr = `translate3d(${x}px, ${y}px, 0px) scale(${state.transform.scale / upsampleScale})`;
    
    elements.originalCanvas.style.transform = ogTransformStr;
    elements.processedCanvas.style.transform = procTransformStr;
    
    elements.statusZoom.textContent = `${Math.round(state.transform.scale * 100)}%`;
    
    // Changing position or zoom requires updating comparison view clip boundaries
    updateComparisonView();
}

// ----------------- Comparison View Controller -----------------

export function updateComparisonView() {
    if (elements.originalCanvas.width === 0) return;
    
    // Sync UI badge
    elements.modeBadge.textContent = state.comparisonMode;
    
    const wrapperWidth = elements.canvasWrapper.clientWidth;
    const canvasLeft = Math.round(state.transform.x);
    const canvasWidth = elements.originalCanvas.width * state.transform.scale;
    
    // Reset properties to default first
    elements.processedCanvas.style.mixBlendMode = "normal";
    elements.processedCanvas.style.opacity = "1.0";
    elements.processedCanvas.style.clipPath = "none";
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
        
        // Apply vertical clipPath polygon to right-side processed canvas
        elements.processedCanvas.style.clipPath = `polygon(${localDividerPct}% 0%, 100% 0%, 100% 100%, ${localDividerPct}% 100%)`;
        
    } else if (state.comparisonMode === "Overlay Opacity") {
        // Opacity control
        elements.processedCanvas.style.opacity = `${state.compPosition / 100}`;
        
    } else if (state.comparisonMode === "Pixel Difference") {
        // Subtractive difference blend mode
        elements.processedCanvas.style.mixBlendMode = "difference";
        
    } else if (state.comparisonMode === "X-Ray Lens") {
        // Circle spotlight following the cursor
        // Convert screen cursor wrapper coordinates to canvas local percentages
        const canvasLeftOffset = Math.round(state.transform.x);
        const relativeX = (state.mouseWrapperX - canvasLeftOffset) / state.transform.scale;
        const relativeY = (state.mouseWrapperY - state.transform.y) / state.transform.scale;
        
        const localXPct = (relativeX / elements.originalCanvas.width) * 100;
        const localYPct = (relativeY / elements.originalCanvas.height) * 100;
        
        // Keep the circle radius constant in screen pixels regardless of zoom
        const R = state.compPosition * 2.5 + 40; // slider range maps to 40px - 290px spotlight
        const localRadius = R / state.transform.scale;
        
        elements.processedCanvas.style.clipPath = `circle(${localRadius}px at ${localXPct}% ${localYPct}%)`;
    }
}

// ----------------- Pixel Coordinate and Color Inspector -----------------

export function updatePixelInspector(x, y) {
    elements.statusCoords.textContent = `X: ${x}, Y: ${y}`;
    
    const displayCtx = elements.processedCanvas.getContext('2d', { willReadFrequently: true });
    try {
        const upsampleScale = elements.originalCanvas.width > 0 ? elements.processedCanvas.width / elements.originalCanvas.width : 1.0;
        const px = Math.round(x * upsampleScale);
        const py = Math.round(y * upsampleScale);
        const pixel = displayCtx.getImageData(px, py, 1, 1).data;
        const r = pixel[0], g = pixel[1], b = pixel[2];
        elements.statusRgb.textContent = `RGB(${r}, ${g}, ${b})`;
        elements.colorPreview.style.backgroundColor = `rgb(${r},${g},${b})`;
    } catch (e) {
        // cross-origin protection block
    }
}

export function clearPixelInspector() {
    elements.statusCoords.textContent = `X: -, Y: -`;
    elements.statusRgb.textContent = `RGB(-, -, -)`;
    elements.colorPreview.style.backgroundColor = 'transparent';
}
