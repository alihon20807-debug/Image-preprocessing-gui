// nodes.js - Node Graph editor configuration and DAG compiler
import { state } from './state.js';

// Setup beautiful dark theme styles for LiteGraph
export function setupNodeEditorTheme() {
    if (typeof LiteGraph === 'undefined') return;

    // Node Canvas Drawing Overrides
    LGraphCanvas.background_color = "#090a0d";
    LGraphCanvas.grid_color = "#16181f";
    
    // Customize slot and slot connection styles
    LGraphCanvas.link_type_colors = {
        "Image": "#3b82f6",
        "Mask": "#10b981"
    };

    // Global Node styling overrides
    LiteGraph.NODE_DEFAULT_BGCOLOR = "#12141a";
    LiteGraph.NODE_DEFAULT_BOXCOLOR = "rgba(255, 255, 255, 0.08)";
    LiteGraph.NODE_DEFAULT_TEXT_COLOR = "#f3f4f6";
    LiteGraph.NODE_TITLE_COLOR = "#9ca3af";
    LiteGraph.NODE_SELECTED_TITLE_COLOR = "#ff4b4b";
    
    // Connection wires
    LiteGraph.CONNECTING_LINE_COLOR = "#ff4b4b";
    
    // Set custom slot shapes
    LiteGraph.NODE_SLOT_HEIGHT = 16;
}

// ----------------- Custom Nodes Definitions -----------------

export function registerCustomNodes(onGraphChangeCallback) {
    if (typeof LiteGraph === 'undefined') return;

    // Clear all default, unneeded built-in LiteGraph node groups (basic, math, audio, midi, etc.)
    LiteGraph.clearRegisteredTypes();

    // Helper: Register change trigger on parameter widgets
    function bindWidgetTrigger(node, widget) {
        const oldCallback = widget.callback;
        widget.callback = function(value, canvas, nodeObj, pos, event) {
            if (oldCallback) oldCallback.apply(this, arguments);
            onGraphChangeCallback();
        };
    }

    // 1. Load Image Node
    class LoadImageNode {
        constructor() {
            this.title = "📁 Load Image";
            this.size = [240, 70];
            this.addOutput("Image", "Image");
            
            // Info text drawn on node
            this.properties = { info: "Workspace original image" };
        }
        
        onDrawBackground(ctx) {
            ctx.fillStyle = "#9ca3af";
            ctx.font = "10px sans-serif";
            ctx.fillText("Active: Original Image", 12, 38);
        }
    }
    LiteGraph.registerNodeType("image/load", LoadImageNode);

    // 2. Grayscale Node
    class GrayscaleNode {
        constructor() {
            this.title = "🎨 Convert to Grayscale";
            this.size = [240, 65];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");
        }
    }
    LiteGraph.registerNodeType("filter/grayscale", GrayscaleNode);

    // 3. Invert Colors Node
    class InvertNode {
        constructor() {
            this.title = "🚫 Invert Colors";
            this.size = [240, 90];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");
            
            this.properties = { channel_mode: "Color Channels" };
            this.widget = this.addWidget("combo", "Channel Mode", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Color Channels", "Grayscale"] });
            bindWidgetTrigger(this, this.widget);
        }
    }
    LiteGraph.registerNodeType("filter/invert", InvertNode);

    // 4. Contrast & Brightness Node
    class ContrastNode {
        constructor() {
            this.title = "🎛️ Contrast & Brightness";
            this.size = [240, 120];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");
            
            this.properties = { contrast: 1.0, brightness: 0 };
            
            this.wContrast = this.addWidget("slider", "Contrast", this.properties.contrast, (val) => {
                this.properties.contrast = parseFloat(val);
            }, { min: 0.5, max: 3.0, step: 0.1, precision: 1 });
            
            this.wBrightness = this.addWidget("slider", "Brightness", this.properties.brightness, (val) => {
                this.properties.brightness = parseInt(val);
            }, { min: -100, max: 100, step: 5 });

            bindWidgetTrigger(this, this.wContrast);
            bindWidgetTrigger(this, this.wBrightness);
        }
    }
    LiteGraph.registerNodeType("filter/contrast", ContrastNode);

    // 5. Gaussian / Box Blur Node
    class BlurNode {
        constructor() {
            this.title = "💧 Blur Filters";
            this.size = [240, 200];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");
            
            this.properties = {
                blur_type: "Gaussian Blur",
                kernel_x: 5,
                kernel_y: 5,
                kernel: 5,
                sigma_x: 0,
                sigma_y: 0,
                diameter: 9,
                sigma_color: 75,
                sigma_space: 75
            };

            this.wType = this.addWidget("combo", "Blur Type", this.properties.blur_type, (val) => {
                this.properties.blur_type = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: ["Gaussian Blur", "Median Blur", "Bilateral Filter", "Box Blur"] });
            
            this.wKernelX = this.addWidget("slider", "Kernel Width (X)", this.properties.kernel_x, (val) => {
                this.properties.kernel_x = parseInt(val);
            }, { min: 1, max: 25, step: 2 });

            this.wKernelY = this.addWidget("slider", "Kernel Height (Y)", this.properties.kernel_y, (val) => {
                this.properties.kernel_y = parseInt(val);
            }, { min: 1, max: 25, step: 2 });

            this.wKernel = this.addWidget("slider", "Kernel Size", this.properties.kernel, (val) => {
                this.properties.kernel = parseInt(val);
            }, { min: 3, max: 25, step: 2 });

            this.wSigmaX = this.addWidget("slider", "Sigma X", this.properties.sigma_x, (val) => {
                this.properties.sigma_x = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            this.wSigmaY = this.addWidget("slider", "Sigma Y", this.properties.sigma_y, (val) => {
                this.properties.sigma_y = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            this.wDiameter = this.addWidget("slider", "Diameter", this.properties.diameter, (val) => {
                this.properties.diameter = parseInt(val);
            }, { min: 1, max: 15, step: 1 });

            this.wSigmaColor = this.addWidget("slider", "Sigma Color", this.properties.sigma_color, (val) => {
                this.properties.sigma_color = parseInt(val);
            }, { min: 10, max: 150, step: 5 });

            this.wSigmaSpace = this.addWidget("slider", "Sigma Space", this.properties.sigma_space, (val) => {
                this.properties.sigma_space = parseInt(val);
            }, { min: 10, max: 150, step: 5 });

            bindWidgetTrigger(this, this.wType);
            bindWidgetTrigger(this, this.wKernelX);
            bindWidgetTrigger(this, this.wKernelY);
            bindWidgetTrigger(this, this.wKernel);
            bindWidgetTrigger(this, this.wSigmaX);
            bindWidgetTrigger(this, this.wSigmaY);
            bindWidgetTrigger(this, this.wDiameter);
            bindWidgetTrigger(this, this.wSigmaColor);
            bindWidgetTrigger(this, this.wSigmaSpace);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const type = this.properties.blur_type;
            
            // Reset node height dynamically
            if (type === "Gaussian Blur") {
                this.size = [240, 196];
                this.wKernelX.disabled = false; this.wKernelY.disabled = false;
                this.wSigmaX.disabled = false; this.wSigmaY.disabled = false;
                this.wKernel.disabled = true; this.wDiameter.disabled = true;
                this.wSigmaColor.disabled = true; this.wSigmaSpace.disabled = true;
            } else if (type === "Box Blur") {
                this.size = [240, 148];
                this.wKernelX.disabled = false; this.wKernelY.disabled = false;
                this.wSigmaX.disabled = true; this.wSigmaY.disabled = true;
                this.wKernel.disabled = true; this.wDiameter.disabled = true;
                this.wSigmaColor.disabled = true; this.wSigmaSpace.disabled = true;
            } else if (type === "Median Blur") {
                this.size = [240, 124];
                this.wKernelX.disabled = true; this.wKernelY.disabled = true;
                this.wSigmaX.disabled = true; this.wSigmaY.disabled = true;
                this.wKernel.disabled = false; this.wDiameter.disabled = true;
                this.wSigmaColor.disabled = true; this.wSigmaSpace.disabled = true;
            } else if (type === "Bilateral Filter") {
                this.size = [240, 172];
                this.wKernelX.disabled = true; this.wKernelY.disabled = true;
                this.wSigmaX.disabled = true; this.wSigmaY.disabled = true;
                this.wKernel.disabled = true; this.wDiameter.disabled = false;
                this.wSigmaColor.disabled = false; this.wSigmaSpace.disabled = false;
            }
        }
    }
    LiteGraph.registerNodeType("filter/blur", BlurNode);

    // 6. Thresholding Node
    class ThresholdNode {
        constructor() {
            this.title = "⚖️ Thresholding";
            this.size = [240, 200];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                mode: "Binary Thresholding",
                channel_mode: "Grayscale",
                fill_color: "#ffffff",
                value: 127,
                block_size: 11,
                constant_c: 2,
                sigma_x: 0,
                sigma_y: 0,
                target_color: "#000000",
                tolerance: 30
            };

            this.wMode = this.addWidget("combo", "Mode", this.properties.mode, (val) => {
                this.properties.mode = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: [
                "Binary Thresholding", "Binary Thresholding Inverted",
                "Truncate Thresholding", "Threshold to Zero", "Threshold to Zero Inverted",
                "Otsu's Thresholding", "Otsu's Thresholding Inverted",
                "Triangle Thresholding", "Triangle Thresholding Inverted",
                "Adaptive Mean", "Adaptive Mean Inverted",
                "Adaptive Gaussian", "Adaptive Gaussian Inverted",
                "Single Color Thresholding", "Single Color Thresholding Inverted"
            ]});

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Grayscale", "Color Channels"] });

            this.wFill = this.addWidget("text", "Fill Color (Hex)", this.properties.fill_color, (val) => {
                this.properties.fill_color = val;
            });

            this.wTarget = this.addWidget("text", "Target Color", this.properties.target_color, (val) => {
                this.properties.target_color = val;
            });

            this.wTolerance = this.addWidget("slider", "Tolerance", this.properties.tolerance, (val) => {
                this.properties.tolerance = parseInt(val);
            }, { min: 0, max: 255 });

            this.wValue = this.addWidget("slider", "Threshold Value", this.properties.value, (val) => {
                this.properties.value = parseInt(val);
            }, { min: 0, max: 255 });

            this.wBlock = this.addWidget("slider", "Block Size", this.properties.block_size, (val) => {
                this.properties.block_size = parseInt(val);
            }, { min: 3, max: 99, step: 2 });

            this.wConstant = this.addWidget("slider", "Constant C", this.properties.constant_c, (val) => {
                this.properties.constant_c = parseInt(val);
            }, { min: -100, max: 100 });

            this.wSigmaX = this.addWidget("slider", "Sigma X", this.properties.sigma_x, (val) => {
                this.properties.sigma_x = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            this.wSigmaY = this.addWidget("slider", "Sigma Y", this.properties.sigma_y, (val) => {
                this.properties.sigma_y = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            bindWidgetTrigger(this, this.wMode);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wFill);
            bindWidgetTrigger(this, this.wTarget);
            bindWidgetTrigger(this, this.wTolerance);
            bindWidgetTrigger(this, this.wValue);
            bindWidgetTrigger(this, this.wBlock);
            bindWidgetTrigger(this, this.wConstant);
            bindWidgetTrigger(this, this.wSigmaX);
            bindWidgetTrigger(this, this.wSigmaY);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const m = this.properties.mode;
            const isGlobal = ['Binary Thresholding', 'Binary Thresholding Inverted', 'Truncate Thresholding', 'Threshold to Zero', 'Threshold to Zero Inverted'].includes(m);
            const isAdaptive = ['Adaptive Mean', 'Adaptive Mean Inverted', 'Adaptive Gaussian', 'Adaptive Gaussian Inverted'].includes(m);
            const isAuto = ["Otsu's Thresholding", "Otsu's Thresholding Inverted", 'Triangle Thresholding', 'Triangle Thresholding Inverted'].includes(m);
            const isSingleColor = ['Single Color Thresholding', 'Single Color Thresholding Inverted'].includes(m);
            const hasConstantC = isAdaptive || isAuto;
            const hasSigmas = ['Adaptive Gaussian', 'Adaptive Gaussian Inverted'].includes(m);

            this.wTarget.disabled = !isSingleColor;
            this.wTolerance.disabled = !isSingleColor;
            this.wValue.disabled = !isGlobal;
            this.wBlock.disabled = !isAdaptive;
            this.wConstant.disabled = !hasConstantC;
            this.wSigmaX.disabled = !hasSigmas;
            this.wSigmaY.disabled = !hasSigmas;

            // Adjust height based on number of active widgets
            let visibleCount = 3; // mode, chan, fill
            if (isSingleColor) visibleCount += 2;
            if (isGlobal) visibleCount += 1;
            if (isAdaptive) visibleCount += 1;
            if (hasConstantC) visibleCount += 1;
            if (hasSigmas) visibleCount += 2;
            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/threshold", ThresholdNode);

    // 7. Above to White Node
    class AboveToWhiteNode {
        constructor() {
            this.title = "⬜ Above to White";
            this.size = [240, 220];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                algorithm: "Global",
                condition: "Above or Equal (>=)",
                channel_mode: "Grayscale",
                fill_color: "#ffffff",
                value: 127,
                value_max: 255,
                block_size_x: 11,
                block_size_y: 11,
                constant_c: 2,
                sigma_x: 0,
                sigma_y: 0
            };

            this.wAlgo = this.addWidget("combo", "Algorithm", this.properties.algorithm, (val) => {
                this.properties.algorithm = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: ["Global", "Otsu's", "Triangle", "Adaptive Mean", "Adaptive Gaussian"] });

            this.wCond = this.addWidget("combo", "Condition", this.properties.condition, (val) => {
                this.properties.condition = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: [
                "Above or Equal (>=)", "Above (>)", "Below (<)", "Below or Equal (<=)",
                "Inside Range [Min, Max]", "Outside Range"
            ]});

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Grayscale", "Color Channels"] });

            this.wFill = this.addWidget("text", "Fill Color", this.properties.fill_color, (val) => {
                this.properties.fill_color = val;
            });

            this.wValue = this.addWidget("slider", "Threshold Value", this.properties.value, (val) => {
                this.properties.value = parseInt(val);
            }, { min: 0, max: 255 });

            this.wMax = this.addWidget("slider", "Max Value", this.properties.value_max, (val) => {
                this.properties.value_max = parseInt(val);
            }, { min: 0, max: 255 });

            this.wBlockX = this.addWidget("slider", "Block Size X", this.properties.block_size_x, (val) => {
                this.properties.block_size_x = parseInt(val);
            }, { min: 3, max: 99, step: 2 });

            this.wBlockY = this.addWidget("slider", "Block Size Y", this.properties.block_size_y, (val) => {
                this.properties.block_size_y = parseInt(val);
            }, { min: 3, max: 99, step: 2 });

            this.wConstant = this.addWidget("slider", "Constant C", this.properties.constant_c, (val) => {
                this.properties.constant_c = parseInt(val);
            }, { min: -100, max: 100 });

            this.wSigmaX = this.addWidget("slider", "Sigma X", this.properties.sigma_x, (val) => {
                this.properties.sigma_x = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            this.wSigmaY = this.addWidget("slider", "Sigma Y", this.properties.sigma_y, (val) => {
                this.properties.sigma_y = parseFloat(val);
            }, { min: 0, max: 10, step: 0.5 });

            bindWidgetTrigger(this, this.wAlgo);
            bindWidgetTrigger(this, this.wCond);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wFill);
            bindWidgetTrigger(this, this.wValue);
            bindWidgetTrigger(this, this.wMax);
            bindWidgetTrigger(this, this.wBlockX);
            bindWidgetTrigger(this, this.wBlockY);
            bindWidgetTrigger(this, this.wConstant);
            bindWidgetTrigger(this, this.wSigmaX);
            bindWidgetTrigger(this, this.wSigmaY);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const algo = this.properties.algorithm;
            const cond = this.properties.condition;
            const isAdaptive = ['Adaptive Mean', 'Adaptive Gaussian'].includes(algo);
            const hasConstantC = ['Adaptive Mean', 'Adaptive Gaussian', "Otsu's", 'Triangle'].includes(algo);
            const hasSigmas = algo === 'Adaptive Gaussian';
            const hasMaxThresh = ['Inside Range [Min, Max]', 'Outside Range'].includes(cond);

            this.wValue.disabled = algo !== 'Global';
            this.wMax.disabled = !hasMaxThresh;
            this.wBlockX.disabled = !isAdaptive;
            this.wBlockY.disabled = !isAdaptive;
            this.wConstant.disabled = !hasConstantC;
            this.wSigmaX.disabled = !hasSigmas;
            this.wSigmaY.disabled = !hasSigmas;

            let visibleCount = 4; // algo, cond, chan, fill
            if (algo === 'Global') visibleCount += 1;
            if (hasMaxThresh) visibleCount += 1;
            if (isAdaptive) visibleCount += 2;
            if (hasConstantC) visibleCount += 1;
            if (hasSigmas) visibleCount += 2;
            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/above_to_white", AboveToWhiteNode);

    // 8. Edge Detection Node
    class EdgesNode {
        constructor() {
            this.title = "⚡ Edge Detection";
            this.size = [240, 180];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                algorithm: "Canny",
                channel_mode: "Grayscale",
                low: 50,
                high: 150,
                aperture: 3,
                l2_gradient: false,
                dx: 1,
                dy: 0,
                ksize: 3,
                scale: 1.0,
                delta: 0
            };

            this.wAlgo = this.addWidget("combo", "Algorithm", this.properties.algorithm, (val) => {
                this.properties.algorithm = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: ["Canny", "Sobel", "Scharr", "Laplacian"] });

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Grayscale", "Color Channels"] });

            this.wLow = this.addWidget("slider", "Low Threshold", this.properties.low, (val) => {
                this.properties.low = parseInt(val);
            }, { min: 0, max: 255 });

            this.wHigh = this.addWidget("slider", "High Threshold", this.properties.high, (val) => {
                this.properties.high = parseInt(val);
            }, { min: 0, max: 255 });

            this.wAperture = this.addWidget("combo", "Aperture Size", this.properties.aperture, (val) => {
                this.properties.aperture = parseInt(val);
            }, { values: [3, 5, 7] });

            this.wL2 = this.addWidget("toggle", "L2 Norm", this.properties.l2_gradient, (val) => {
                this.properties.l2_gradient = val;
            });

            this.wDx = this.addWidget("combo", "dx Order", this.properties.dx, (val) => {
                this.properties.dx = parseInt(val);
            }, { values: [0, 1, 2] });

            this.wDy = this.addWidget("combo", "dy Order", this.properties.dy, (val) => {
                this.properties.dy = parseInt(val);
            }, { values: [0, 1, 2] });

            this.wKsize = this.addWidget("combo", "Kernel Size", this.properties.ksize, (val) => {
                this.properties.ksize = parseInt(val);
            }, { values: [1, 3, 5, 7] });

            this.wScale = this.addWidget("slider", "Scale multiplier", this.properties.scale, (val) => {
                this.properties.scale = parseFloat(val);
            }, { min: 0.1, max: 5.0, step: 0.1 });

            this.wDelta = this.addWidget("slider", "Delta offset", this.properties.delta, (val) => {
                this.properties.delta = parseInt(val);
            }, { min: -100, max: 100 });

            bindWidgetTrigger(this, this.wAlgo);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wLow);
            bindWidgetTrigger(this, this.wHigh);
            bindWidgetTrigger(this, this.wAperture);
            bindWidgetTrigger(this, this.wL2);
            bindWidgetTrigger(this, this.wDx);
            bindWidgetTrigger(this, this.wDy);
            bindWidgetTrigger(this, this.wKsize);
            bindWidgetTrigger(this, this.wScale);
            bindWidgetTrigger(this, this.wDelta);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const algo = this.properties.algorithm;
            const isCanny = algo === "Canny";
            const isDeriv = algo === "Sobel" || algo === "Scharr";
            const isK = algo === "Sobel" || algo === "Laplacian";
            const hasScale = algo !== "Canny";

            this.wLow.disabled = !isCanny;
            this.wHigh.disabled = !isCanny;
            this.wAperture.disabled = !isCanny;
            this.wL2.disabled = !isCanny;

            this.wDx.disabled = !isDeriv;
            this.wDy.disabled = !isDeriv;
            this.wKsize.disabled = !isK;
            this.wScale.disabled = !hasScale;
            this.wDelta.disabled = !hasScale;

            let visibleCount = 2; // algo, chan
            if (isCanny) visibleCount += 4;
            if (isDeriv) visibleCount += 2;
            if (isK) visibleCount += 1;
            if (hasScale) visibleCount += 2;
            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/edges", EdgesNode);

    // 9. Blend Images Node
    class BlendNode {
        constructor() {
            this.title = "🎭 Blend Images";
            this.size = [240, 135];
            this.addInput("Image A", "Image");
            this.addInput("Image B", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                blend_mode: "normal",
                opacity: 100,
                blend_interpolation: "Bicubic (Sharp)"
            };

            this.wMode = this.addWidget("combo", "Blend Mode", this.properties.blend_mode, (val) => {
                this.properties.blend_mode = val;
            }, { values: ["normal", "add", "subtract", "multiply", "screen", "difference", "darken", "lighten"] });

            this.wOpacity = this.addWidget("slider", "Opacity", this.properties.opacity, (val) => {
                this.properties.opacity = parseInt(val);
            }, { min: 0, max: 100, step: 5 });

            this.wInterp = this.addWidget("combo", "Upscale Filter", this.properties.blend_interpolation, (val) => {
                this.properties.blend_interpolation = val;
            }, { values: ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"] });

            bindWidgetTrigger(this, this.wMode);
            bindWidgetTrigger(this, this.wOpacity);
            bindWidgetTrigger(this, this.wInterp);
        }
    }
    LiteGraph.registerNodeType("layer/blend", BlendNode);

    // 10. Preview Result Node
    class PreviewNode {
        constructor() {
            this.title = "👁️ Preview Result";
            this.size = [260, 240];
            this.addInput("Image", "Image");
            
            // Image object to cache for drawing
            this.img = null;
        }

        onDrawBackground(ctx) {
            if (this.img) {
                // Aspect fit image inside node boundary
                const w = this.size[0] - 24;
                const h = this.size[1] - 50;
                const scale = Math.min(w / this.img.width, h / this.img.height);
                const dw = this.img.width * scale;
                const dh = this.img.height * scale;
                const dx = 12 + (w - dw) / 2;
                const dy = 38 + (h - dh) / 2;
                
                ctx.fillStyle = "#050608";
                ctx.fillRect(12, 38, w, h);
                ctx.drawImage(this.img, dx, dy, dw, dh);
            } else {
                ctx.fillStyle = "#1e222d";
                ctx.fillRect(12, 38, this.size[0] - 24, this.size[1] - 50);
                ctx.fillStyle = "#4b5563";
                ctx.font = "12px sans-serif";
                ctx.textAlign = "center";
                ctx.fillText("No Image Loaded", this.size[0] / 2, this.size[1] / 2 + 10);
            }
        }

        updatePreview(base64Url) {
            if (!base64Url || base64Url === "original") return;
            const newImg = new Image();
            newImg.onload = () => {
                this.img = newImg;
                this.setDirtyCanvas(true, true);
            };
            newImg.src = base64Url;
        }
    }
    LiteGraph.registerNodeType("image/preview", PreviewNode);

    // 11. Set Comparison Baseline Node
    class BaselineNode {
        constructor() {
            this.title = "⚖️ Set Comparison Baseline";
            this.size = [240, 70];
            this.addInput("Image", "Image");
            
            this.properties = { info: "Sets baseline for Interactive Viewer" };
        }

        onDrawBackground(ctx) {
            ctx.fillStyle = "#60a5fa";
            ctx.font = "10px sans-serif";
            ctx.fillText("Linked to baseline reference", 12, 35);
        }
    }
    LiteGraph.registerNodeType("image/baseline", BaselineNode);

    // 12. Upsample Node
    class UpsampleNode {
        constructor() {
            this.title = "🔍 Upsample (Scale Up)";
            this.size = [240, 110];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = { scale: 2.0, interpolation: "Bicubic (Sharp)" };
            this.wScale = this.addWidget("slider", "Scale", this.properties.scale, (val) => {
                this.properties.scale = parseFloat(val);
            }, { min: 1.0, max: 4.0, step: 0.5 });
            this.wInterp = this.addWidget("combo", "Upscale Filter", this.properties.interpolation, (val) => {
                this.properties.interpolation = val;
            }, { values: ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"] });

            bindWidgetTrigger(this, this.wScale);
            bindWidgetTrigger(this, this.wInterp);
        }
    }
    LiteGraph.registerNodeType("filter/upsample", UpsampleNode);

    // 13. Downsample Node
    class DownsampleNode {
        constructor() {
            this.title = "🔎 Downsample (Scale Down)";
            this.size = [240, 110];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = { scale: 0.5, interpolation: "Bicubic (Sharp)" };
            this.wScale = this.addWidget("slider", "Scale", this.properties.scale, (val) => {
                this.properties.scale = parseFloat(val);
            }, { min: 0.05, max: 1.0, step: 0.05 });
            this.wInterp = this.addWidget("combo", "Downscale Filter", this.properties.interpolation, (val) => {
                this.properties.interpolation = val;
            }, { values: ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"] });

            bindWidgetTrigger(this, this.wScale);
            bindWidgetTrigger(this, this.wInterp);
        }
    }
    LiteGraph.registerNodeType("filter/downsample", DownsampleNode);

    // 14. Crop Node
    class CropNode {
        constructor() {
            this.title = "✂️ Crop Region";
            this.size = [240, 160];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = { left: 0, right: 0, top: 0, bottom: 0 };
            
            this.wLeft = this.addWidget("slider", "Left %", this.properties.left, (val) => this.properties.left = parseInt(val), { min: 0, max: 99 });
            this.wRight = this.addWidget("slider", "Right %", this.properties.right, (val) => this.properties.right = parseInt(val), { min: 0, max: 99 });
            this.wTop = this.addWidget("slider", "Top %", this.properties.top, (val) => this.properties.top = parseInt(val), { min: 0, max: 99 });
            this.wBottom = this.addWidget("slider", "Bottom %", this.properties.bottom, (val) => this.properties.bottom = parseInt(val), { min: 0, max: 99 });

            bindWidgetTrigger(this, this.wLeft);
            bindWidgetTrigger(this, this.wRight);
            bindWidgetTrigger(this, this.wTop);
            bindWidgetTrigger(this, this.wBottom);
        }
    }
    LiteGraph.registerNodeType("filter/crop", CropNode);

    // 15. Stroke Healing Node
    class HealNode {
        constructor() {
            this.title = "❤️ Stroke Healing / Morphology";
            this.size = [240, 260];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                operation: "Heal Gaps in White (Closing)",
                channel_mode: "Color Channels",
                use_target_color: false,
                target_color: "#000000",
                tolerance: 30,
                fill_color: "#ffffff",
                bg_color: "#ffffff",
                shape: "Rectangle",
                kernel_x: 5,
                kernel_y: 5,
                iterations: 1,
                skel_threshold: 127,
                foreground_mode: "White strokes (Dark background)"
            };

            this.wOp = this.addWidget("combo", "Operation", this.properties.operation, (val) => {
                this.properties.operation = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: [
                "Dilate (Thicken White)", "Erode (Thicken Black)",
                "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                "Extract Dark Details (Black Hat)", "Skeletonization (Thinning)"
            ]});

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Color Channels", "Grayscale"] });

            this.wTargetToggle = this.addWidget("toggle", "Target Color Matching", this.properties.use_target_color, (val) => {
                this.properties.use_target_color = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            });

            this.wTargetColor = this.addWidget("text", "Target Color", this.properties.target_color, (val) => {
                this.properties.target_color = val;
            });

            this.wTolerance = this.addWidget("slider", "Tolerance", this.properties.tolerance, (val) => {
                this.properties.tolerance = parseInt(val);
            }, { min: 0, max: 255 });

            this.wFillColor = this.addWidget("text", "Fill Color", this.properties.fill_color, (val) => {
                this.properties.fill_color = val;
            });

            this.wBgColor = this.addWidget("text", "Erase/BG Color", this.properties.bg_color, (val) => {
                this.properties.bg_color = val;
            });

            this.wShape = this.addWidget("combo", "Kernel Shape", this.properties.shape, (val) => {
                this.properties.shape = val;
            }, { values: ["Rectangle", "Ellipse", "Cross"] });

            this.wKernelX = this.addWidget("slider", "Kernel X", this.properties.kernel_x, (val) => {
                this.properties.kernel_x = parseInt(val);
            }, { min: 1, max: 99, step: 2 });

            this.wKernelY = this.addWidget("slider", "Kernel Y", this.properties.kernel_y, (val) => {
                this.properties.kernel_y = parseInt(val);
            }, { min: 1, max: 99, step: 2 });

            this.wIterations = this.addWidget("slider", "Iterations", this.properties.iterations, (val) => {
                this.properties.iterations = parseInt(val);
            }, { min: 1, max: 25 });

            this.wSkelThresh = this.addWidget("slider", "Skel Threshold", this.properties.skel_threshold, (val) => {
                this.properties.skel_threshold = parseInt(val);
            }, { min: 0, max: 255 });

            this.wSkelMode = this.addWidget("combo", "Foreground Mode", this.properties.foreground_mode, (val) => {
                this.properties.foreground_mode = val;
            }, { values: ["Black strokes (Light background)", "White strokes (Dark background)"] });

            bindWidgetTrigger(this, this.wOp);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wTargetToggle);
            bindWidgetTrigger(this, this.wTargetColor);
            bindWidgetTrigger(this, this.wTolerance);
            bindWidgetTrigger(this, this.wFillColor);
            bindWidgetTrigger(this, this.wBgColor);
            bindWidgetTrigger(this, this.wShape);
            bindWidgetTrigger(this, this.wKernelX);
            bindWidgetTrigger(this, this.wKernelY);
            bindWidgetTrigger(this, this.wIterations);
            bindWidgetTrigger(this, this.wSkelThresh);
            bindWidgetTrigger(this, this.wSkelMode);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const op = this.properties.operation;
            const useTarget = this.properties.use_target_color;
            const isSkel = op === "Skeletonization (Thinning)";

            this.wTargetColor.disabled = !useTarget;
            this.wTolerance.disabled = !useTarget;
            this.wFillColor.disabled = !useTarget;
            this.wBgColor.disabled = !useTarget;

            this.wShape.disabled = isSkel;
            this.wKernelX.disabled = isSkel;
            this.wKernelY.disabled = isSkel;
            this.wIterations.disabled = isSkel;

            this.wSkelThresh.disabled = !isSkel || useTarget;
            this.wSkelMode.disabled = !isSkel || useTarget;

            let visibleCount = 3; // op, chan, targetToggle
            if (useTarget) {
                visibleCount += 4; // targetColor, tolerance, fillColor, bgColor
            }
            if (!isSkel) {
                visibleCount += 4; // shape, kernelX, kernelY, iterations
            }
            if (isSkel && !useTarget) {
                visibleCount += 2; // skelThresh, skelMode
            }

            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/heal", HealNode);

    // 16. Fill Region Node
    class FillNode {
        constructor() {
            this.title = "🪣 Fill Region";
            this.size = [240, 200];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                fill_mode: "Hole Filling (Contours)",
                fill_color: "#ffffff",
                use_target_color: false,
                target_color: "#000000",
                tolerance: 30,
                lo_diff: 10,
                up_diff: 10,
                inpaint_radius: 3,
                seed_x: 0,
                seed_y: 0,
                min_area: 20,
                max_area: 10000,
                channel_mode: "Color Channels"
            };

            this.wMode = this.addWidget("combo", "Fill Mode", this.properties.fill_mode, (val) => {
                this.properties.fill_mode = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: [
                "Hole Filling (Contours)", "Color Replacement (Chroma Key)",
                "Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)",
                "Flood Fill", "Corner Background Fill"
            ]});

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Color Channels", "Grayscale"] });

            this.wFillColor = this.addWidget("text", "Fill Color (Hex)", this.properties.fill_color, (val) => {
                this.properties.fill_color = val;
            });

            this.wTargetToggle = this.addWidget("toggle", "Target Color Matching", this.properties.use_target_color, (val) => {
                this.properties.use_target_color = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            });

            this.wTargetColor = this.addWidget("text", "Target Color", this.properties.target_color, (val) => {
                this.properties.target_color = val;
            });

            this.wTolerance = this.addWidget("slider", "Tolerance", this.properties.tolerance, (val) => {
                this.properties.tolerance = parseInt(val);
            }, { min: 0, max: 255 });

            this.wLower = this.addWidget("slider", "Lower Tolerance", this.properties.lo_diff, (val) => {
                this.properties.lo_diff = parseInt(val);
            }, { min: 0, max: 255 });

            this.wUpper = this.addWidget("slider", "Upper Tolerance", this.properties.up_diff, (val) => {
                this.properties.up_diff = parseInt(val);
            }, { min: 0, max: 255 });

            this.wRadius = this.addWidget("slider", "Inpaint Radius", this.properties.inpaint_radius, (val) => {
                this.properties.inpaint_radius = parseInt(val);
            }, { min: 1, max: 50 });

            this.wSeedX = this.addWidget("slider", "Seed X %", this.properties.seed_x, (val) => {
                this.properties.seed_x = parseInt(val);
            }, { min: 0, max: 99 });

            this.wSeedY = this.addWidget("slider", "Seed Y %", this.properties.seed_y, (val) => {
                this.properties.seed_y = parseInt(val);
            }, { min: 0, max: 99 });

            this.wMinArea = this.addWidget("slider", "Min Area", this.properties.min_area, (val) => {
                this.properties.min_area = parseInt(val);
            }, { min: 0, max: 2000 });

            this.wMaxArea = this.addWidget("slider", "Max Area", this.properties.max_area, (val) => {
                this.properties.max_area = parseInt(val);
            }, { min: 0, max: 50000 });

            bindWidgetTrigger(this, this.wMode);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wFillColor);
            bindWidgetTrigger(this, this.wTargetToggle);
            bindWidgetTrigger(this, this.wTargetColor);
            bindWidgetTrigger(this, this.wTolerance);
            bindWidgetTrigger(this, this.wLower);
            bindWidgetTrigger(this, this.wUpper);
            bindWidgetTrigger(this, this.wRadius);
            bindWidgetTrigger(this, this.wSeedX);
            bindWidgetTrigger(this, this.wSeedY);
            bindWidgetTrigger(this, this.wMinArea);
            bindWidgetTrigger(this, this.wMaxArea);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const m = this.properties.fill_mode;
            const useTarget = this.properties.use_target_color;

            const isHole = m === "Hole Filling (Contours)";
            const isChroma = m === "Color Replacement (Chroma Key)";
            const isInpaint = m === "Content-Aware Inpainting (NS)" || m === "Content-Aware Inpainting (Telea)";
            const isFlood = m === "Flood Fill";
            const isCorner = m === "Corner Background Fill";

            const hasFillColor = !isInpaint;
            const hasTargetColor = isChroma || isInpaint || (isHole && useTarget);
            const hasInpaintRadius = isInpaint;
            const hasFloodTolerances = isFlood || isCorner;
            const hasSeed = isFlood;
            const hasArea = isHole;

            this.wFillColor.disabled = !hasFillColor;
            this.wTargetToggle.disabled = !isHole;
            this.wTargetColor.disabled = !hasTargetColor;
            this.wTolerance.disabled = !hasTargetColor;
            
            this.wLower.disabled = !hasFloodTolerances;
            this.wUpper.disabled = !hasFloodTolerances;
            this.wRadius.disabled = !hasInpaintRadius;
            this.wSeedX.disabled = !hasSeed;
            this.wSeedY.disabled = !hasSeed;

            this.wMinArea.disabled = !hasArea;
            this.wMaxArea.disabled = !hasArea;
            this.wChan.disabled = isHole && !useTarget;

            let visibleCount = 2; // mode, chan
            if (hasFillColor) visibleCount += 1;
            if (isHole) visibleCount += 1; // targetToggle
            if (hasTargetColor) visibleCount += 2; // targetColor, tolerance
            if (hasFloodTolerances) visibleCount += 2; // lower, upper
            if (hasInpaintRadius) visibleCount += 1; // radius
            if (hasSeed) visibleCount += 2; // seedX, seedY
            if (hasArea) visibleCount += 2; // min_area, max_area

            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/fill", FillNode);

    // 17. Edges + Contour Fill Node
    class EdgesFillNode {
        constructor() {
            this.title = "🎨 Edges + Contour Fill";
            this.size = [240, 320];
            this.addInput("Image", "Image");
            this.addOutput("Image", "Image");

            this.properties = {
                algorithm: "Canny",
                channel_mode: "Grayscale",
                low: 50,
                high: 150,
                aperture: 3,
                l2_gradient: false,
                dx: 1,
                dy: 0,
                ksize: 3,
                scale: 1.0,
                delta: 0,
                fill_target: "Binary Mask (Black background)",
                draw_style: "Filled Contours",
                thickness: 2,
                color: 255,
                min_area: 20,
                max_area: 10000
            };

            this.wAlgo = this.addWidget("combo", "Algorithm", this.properties.algorithm, (val) => {
                this.properties.algorithm = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: ["Canny", "Sobel", "Scharr", "Laplacian"] });

            this.wChan = this.addWidget("combo", "Channels", this.properties.channel_mode, (val) => {
                this.properties.channel_mode = val;
            }, { values: ["Grayscale", "Color Channels"] });

            this.wLow = this.addWidget("slider", "Low Threshold", this.properties.low, (val) => {
                this.properties.low = parseInt(val);
            }, { min: 0, max: 255 });

            this.wHigh = this.addWidget("slider", "High Threshold", this.properties.high, (val) => {
                this.properties.high = parseInt(val);
            }, { min: 0, max: 255 });

            this.wAperture = this.addWidget("combo", "Aperture Size", this.properties.aperture, (val) => {
                this.properties.aperture = parseInt(val);
            }, { values: [3, 5, 7] });

            this.wL2 = this.addWidget("toggle", "L2 Norm", this.properties.l2_gradient, (val) => {
                this.properties.l2_gradient = val;
            });

            this.wDx = this.addWidget("combo", "dx Order", this.properties.dx, (val) => {
                this.properties.dx = parseInt(val);
            }, { values: [0, 1, 2] });

            this.wDy = this.addWidget("combo", "dy Order", this.properties.dy, (val) => {
                this.properties.dy = parseInt(val);
            }, { values: [0, 1, 2] });

            this.wKsize = this.addWidget("combo", "Kernel Size", this.properties.ksize, (val) => {
                this.properties.ksize = parseInt(val);
            }, { values: [1, 3, 5, 7] });

            this.wScale = this.addWidget("slider", "Scale factor", this.properties.scale, (val) => {
                this.properties.scale = parseFloat(val);
            }, { min: 0.1, max: 5.0, step: 0.1 });

            this.wDelta = this.addWidget("slider", "Delta offset", this.properties.delta, (val) => {
                this.properties.delta = parseInt(val);
            }, { min: -100, max: 100 });

            this.wFillTarget = this.addWidget("combo", "Fill Target Canvas", this.properties.fill_target, (val) => {
                this.properties.fill_target = val;
            }, { values: ["Original Image", "Binary Mask (Black background)", "Binary Mask (White background)"] });

            this.wDrawStyle = this.addWidget("combo", "Draw Style", this.properties.draw_style, (val) => {
                this.properties.draw_style = val;
                this.updateWidgetsVisibility();
                onGraphChangeCallback();
            }, { values: ["Filled Contours", "Contour Outlines", "Filled Bounding Boxes", "Bounding Box Outlines"] });

            this.wThickness = this.addWidget("slider", "Line Thickness", this.properties.thickness, (val) => {
                this.properties.thickness = parseInt(val);
            }, { min: 1, max: 15 });

            this.wColor = this.addWidget("slider", "Grayscale Color", this.properties.color, (val) => {
                this.properties.color = parseInt(val);
            }, { min: 0, max: 255 });

            this.wMinArea = this.addWidget("slider", "Min Area", this.properties.min_area, (val) => {
                this.properties.min_area = parseInt(val);
            }, { min: 0, max: 2000 });

            this.wMaxArea = this.addWidget("slider", "Max Area", this.properties.max_area, (val) => {
                this.properties.max_area = parseInt(val);
            }, { min: 0, max: 50000 });

            bindWidgetTrigger(this, this.wAlgo);
            bindWidgetTrigger(this, this.wChan);
            bindWidgetTrigger(this, this.wLow);
            bindWidgetTrigger(this, this.wHigh);
            bindWidgetTrigger(this, this.wAperture);
            bindWidgetTrigger(this, this.wL2);
            bindWidgetTrigger(this, this.wDx);
            bindWidgetTrigger(this, this.wDy);
            bindWidgetTrigger(this, this.wKsize);
            bindWidgetTrigger(this, this.wScale);
            bindWidgetTrigger(this, this.wDelta);
            bindWidgetTrigger(this, this.wFillTarget);
            bindWidgetTrigger(this, this.wDrawStyle);
            bindWidgetTrigger(this, this.wThickness);
            bindWidgetTrigger(this, this.wColor);
            bindWidgetTrigger(this, this.wMinArea);
            bindWidgetTrigger(this, this.wMaxArea);

            this.updateWidgetsVisibility();
        }

        updateWidgetsVisibility() {
            const algo = this.properties.algorithm;
            const style = this.properties.draw_style;

            const isCanny = algo === "Canny";
            const isDeriv = algo === "Sobel" || algo === "Scharr";
            const isK = algo === "Sobel" || algo === "Laplacian";
            const hasScale = algo !== "Canny";
            const hasThickness = style === "Contour Outlines" || style === "Bounding Box Outlines";

            this.wLow.disabled = !isCanny;
            this.wHigh.disabled = !isCanny;
            this.wAperture.disabled = !isCanny;
            this.wL2.disabled = !isCanny;

            this.wDx.disabled = !isDeriv;
            this.wDy.disabled = !isDeriv;
            this.wKsize.disabled = !isK;
            this.wScale.disabled = !hasScale;
            this.wDelta.disabled = !hasScale;

            this.wThickness.disabled = !hasThickness;

            let visibleCount = 2; // algo, chan
            if (isCanny) visibleCount += 4;
            if (isDeriv) visibleCount += 2;
            if (isK) visibleCount += 1;
            if (hasScale) visibleCount += 2;
            
            visibleCount += 2; // fillTarget, drawStyle
            if (hasThickness) visibleCount += 1;
            visibleCount += 3; // color, minArea, maxArea

            this.size = [240, 76 + visibleCount * 24];
        }
    }
    LiteGraph.registerNodeType("filter/edges_fill", EdgesFillNode);
}

// ----------------- Graph-to-Layer Topological DAG Compiler -----------------

export function getTopologicalOrder(graph) {
    const sorted = [];
    const visited = new Set();
    const temp = new Set();
    
    function visit(node) {
        if (!node) return;
        if (temp.has(node.id)) {
            throw new Error(`Sneaky desync alert: Circular dependency detected at node: ${node.title}`);
        }
        if (!visited.has(node.id)) {
            temp.add(node.id);
            // Check all input links
            if (node.inputs) {
                for (let input of node.inputs) {
                    if (input.link !== null) {
                        const linkInfo = graph.links[input.link];
                        if (linkInfo) {
                            const parentNode = graph.getNodeById(linkInfo.origin_id);
                            if (parentNode) {
                                visit(parentNode);
                            }
                        }
                    }
                }
            }
            temp.delete(node.id);
            visited.add(node.id);
            sorted.push(node);
        }
    }
    
    // Visit all nodes
    for (let node of graph._nodes) {
        visit(node);
    }
    return sorted;
}

export function compileGraphToLayers(graph) {
    if (!graph || !graph._nodes || graph._nodes.length === 0) {
        return { layers: [], comparisonBaseline: "original" };
    }

    const sortedNodes = getTopologicalOrder(graph);
    const layers = [];
    let comparisonBaseline = "original";

    // Trace back link origin to determine output layer source
    function getOriginSource(node, inputIndex = 0) {
        if (!node.inputs || !node.inputs[inputIndex] || node.inputs[inputIndex].link === null) {
            return "original"; // fallback desync preventer
        }
        const linkId = node.inputs[inputIndex].link;
        const linkInfo = graph.links[linkId];
        if (!linkInfo) return "original";
        
        const parentNode = graph.getNodeById(linkInfo.origin_id);
        if (!parentNode) return "original";
        
        if (parentNode.type === "image/load") {
            return "original";
        }
        return `node_${parentNode.id}`;
    }

    sortedNodes.forEach(node => {
        // Skip loads, previews, and baselines as they do not generate separate layers
        if (node.type === "image/load" || node.type === "image/preview") {
            return;
        }

        // Handle Comparison Baseline mapping
        if (node.type === "image/baseline") {
            comparisonBaseline = getOriginSource(node, 0);
            return;
        }

        const layerId = `node_${node.id}`;
        const isBypassed = node.mode === LiteGraph.NEVER || node.properties.disabled === true;

        // Blending Node compiles to blend-mode layer
        if (node.type === "layer/blend") {
            layers.push({
                id: layerId,
                name: node.title || "Blend",
                disabled: isBypassed,
                input_source: getOriginSource(node, 1), // Image B (source)
                blend_target: getOriginSource(node, 0), // Image A (target)
                blend_mode: node.properties.blend_mode || "normal",
                opacity: parseFloat(node.properties.opacity !== undefined ? node.properties.opacity : 100),
                blend_interpolation: node.properties.blend_interpolation || "Bicubic (Sharp)",
                steps: []
            });
            return;
        }

        // Standard Filter Nodes map to a single-step layer
        let stepType = "";
        switch(node.type) {
            case "filter/grayscale": stepType = "grayscale"; break;
            case "filter/invert": stepType = "invert"; break;
            case "filter/contrast": stepType = "contrast"; break;
            case "filter/blur": stepType = "blur"; break;
            case "filter/threshold": stepType = "threshold"; break;
            case "filter/above_to_white": stepType = "above_to_white"; break;
            case "filter/edges": stepType = "edges"; break;
            case "filter/heal": stepType = "heal"; break;
            case "filter/fill": stepType = "fill"; break;
            case "filter/edges_fill": stepType = "edges_fill"; break;
            case "filter/upsample": stepType = "upsample"; break;
            case "filter/downsample": stepType = "downsample"; break;
            case "filter/crop": stepType = "crop"; break;
            default: return; // unknown nodes skipped cleanly
        }

        const step = {
            id: `${layerId}_step`,
            type: stepType,
            disabled: false,
            strength: 100
        };

        // Shallow copy all custom properties into the step parameter list
        Object.assign(step, node.properties);

        const inputSrc = getOriginSource(node, 0);

        layers.push({
            id: layerId,
            name: node.title || "Transformation",
            disabled: isBypassed,
            input_source: inputSrc,
            blend_target: inputSrc, // Same as input to bypass blending logic completely
            blend_mode: "normal",
            opacity: 100.0,
            blend_interpolation: "Bicubic (Sharp)",
            steps: [step]
        });
    });

    return { layers, comparisonBaseline };
}

// ----------------- Default Workflow Instantiator -----------------

export function loadDefaultGraph(graph) {
    graph.clear();

    const nLoad = LiteGraph.createNode("image/load");
    nLoad.pos = [80, 100];
    graph.add(nLoad);

    const nGray = LiteGraph.createNode("filter/grayscale");
    nGray.pos = [320, 100];
    graph.add(nGray);

    const nPreview = LiteGraph.createNode("image/preview");
    nPreview.pos = [560, 60];
    graph.add(nPreview);

    // Wire: Load Image (0) -> Grayscale (0)
    nLoad.connect(0, nGray, 0);
    // Wire: Grayscale (0) -> Preview (0)
    nGray.connect(0, nPreview, 0);

    // Initial canvas refresh
    graph.setDirtyCanvas(true, true);
}
