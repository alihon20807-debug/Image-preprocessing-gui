// nodes.js - Node Graph editor configuration and DAG compiler
import { state } from './state.js';

// Setup beautiful dark theme styles for LiteGraph
export function setupNodeEditorTheme() {
    if (typeof LiteGraph === 'undefined') return;

    // Node Canvas Drawing Overrides
    LGraphCanvas.background_color = "#090a0d";
    LGraphCanvas.grid_color = "#16181f";
    
    // Customize slot and slot connection slots
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

    // Widget styling overrides for a premium, clean dark theme
    LiteGraph.WIDGET_BGCOLOR = "#0c0d12";
    LiteGraph.WIDGET_OUTLINE_COLOR = "rgba(255, 255, 255, 0.08)";
    LiteGraph.WIDGET_TEXT_COLOR = "#f3f4f6";
    LiteGraph.WIDGET_SECONDARY_TEXT_COLOR = "#9ca3af";
}

// ----------------- Custom Nodes Definitions -----------------

export function registerCustomNodes(onGraphChangeCallback) {
    if (typeof LiteGraph === 'undefined') return;

    // Selectively clear default, unneeded built-in LiteGraph node groups
    if (LiteGraph.registered_node_types) {
        const keepCategories = new Set(["image", "filter", "layer"]);
        for (const typeName of Object.keys(LiteGraph.registered_node_types)) {
            const category = typeName.split('/')[0];
            if (!keepCategories.has(category)) {
                delete LiteGraph.registered_node_types[typeName];
            }
        }
    }

    // Helper: Register change trigger on parameter widgets
    function bindWidgetTrigger(node, widget) {
        const oldCallback = widget.callback;
        widget.callback = function(value, canvas, nodeObj, pos, event) {
            if (oldCallback) oldCallback.apply(this, arguments);
            node.updateWidgetsVisibility();
            onGraphChangeCallback();
        };
    }

    // 1. Static Node: Load Image
    class LoadImageNode {
        constructor() {
            this.title = "📁 Load Image";
            this.size = [240, 70];
            this.addOutput("Image", "Image");
            this.properties = { info: "Workspace original image" };
        }
        
        onDrawBackground(ctx) {
            ctx.fillStyle = "#9ca3af";
            ctx.font = "10px sans-serif";
            ctx.fillText("Active: Original Image", 12, 38);
        }
    }
    LiteGraph.registerNodeType("image/load", LoadImageNode);

    // 2. Static Node: Preview Result
    class PreviewNode {
        constructor() {
            this.title = "👁️ Preview Result";
            this.size = [260, 240];
            this.addInput("Image", "Image");
            this.img = null;
        }

        onDrawBackground(ctx) {
            if (this.img) {
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

    // 3. Static Node: Set Comparison Baseline
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

    // 4. Dynamic Schema-Driven Node Builder
    if (state.schema) {
        for (const [opKey, opDef] of Object.entries(state.schema)) {
            const isBlend = opKey === "blend";
            const nodeTypeName = isBlend ? "layer/blend" : `filter/${opKey}`;

            class DynamicNode {
                constructor() {
                    this.title = opDef.name;
                    
                    if (isBlend) {
                        this.addInput("Image A", "Image");
                        this.addInput("Image B", "Image");
                    } else {
                        this.addInput("Image", "Image");
                    }
                    this.addOutput("Image", "Image");

                    this.properties = {
                        disabled: false,
                        strength: 100
                    };

                    if (opDef.params) {
                        for (const [paramName, paramDef] of Object.entries(opDef.params)) {
                            this.properties[paramName] = paramDef.default;
                        }
                    }

                    const wDisabled = this.addWidget("toggle", "Disabled", this.properties.disabled, (val) => {
                        this.properties.disabled = val;
                        this.mode = val ? LiteGraph.NEVER : LiteGraph.ALWAYS;
                    });
                    wDisabled.originalType = wDisabled.type;
                    bindWidgetTrigger(this, wDisabled);

                    const wStrength = this.addWidget("slider", "Step Strength", this.properties.strength, (val) => {
                        this.properties.strength = parseInt(val);
                    }, { min: 0, max: 100, step: 5 });
                    wStrength.originalType = wStrength.type;
                    bindWidgetTrigger(this, wStrength);

                    if (opDef.params) {
                        for (const [paramName, paramDef] of Object.entries(opDef.params)) {
                            if (paramDef.type === 'step_id_reference') continue;

                            let widget = null;
                            if (paramDef.type === 'int' || paramDef.type === 'float') {
                                const precision = paramDef.type === 'float' ? 2 : 0;
                                widget = this.addWidget("slider", paramDef.label, this.properties[paramName], (val) => {
                                    this.properties[paramName] = paramDef.type === 'float' ? parseFloat(val) : parseInt(val);
                                }, { min: paramDef.min, max: paramDef.max, step: paramDef.step, precision: precision });
                            } else if (paramDef.type === 'select') {
                                widget = this.addWidget("combo", paramDef.label, this.properties[paramName], (val) => {
                                    this.properties[paramName] = val;
                                }, { values: paramDef.options });
                            } else if (paramDef.type === 'bool') {
                                widget = this.addWidget("toggle", paramDef.label, this.properties[paramName], (val) => {
                                    this.properties[paramName] = val;
                                });
                            } else if (paramDef.type === 'color') {
                                widget = this.addWidget("text", paramDef.label, this.properties[paramName], (val) => {
                                    this.properties[paramName] = val;
                                });
                            }

                            if (widget) {
                                widget.originalType = widget.type;
                                widget.paramName = paramName;
                                bindWidgetTrigger(this, widget);
                            }
                        }
                    }

                    this.size = [240, 100];
                    this.updateWidgetsVisibility();
                }

                updateWidgetsVisibility() {
                    if (!this.widgets) return;
                    if (!this.allWidgets) {
                        this.allWidgets = [...this.widgets];
                    }

                    const visibleWidgets = [];
                    const wDisabled = this.allWidgets.find(w => w.name === "Disabled");
                    const wStrength = this.allWidgets.find(w => w.name === "Step Strength");
                    if (wDisabled) visibleWidgets.push(wDisabled);
                    if (wStrength) visibleWidgets.push(wStrength);

                    let visibleCount = visibleWidgets.length;

                    if (opDef.params) {
                        for (const [paramName, paramDef] of Object.entries(opDef.params)) {
                            if (paramDef.type === 'step_id_reference') continue;
                            const widget = this.allWidgets.find(w => w.paramName === paramName);
                            if (!widget) continue;

                            let isVisible = true;
                            
                            // Custom override for target_color / tolerance under fill step (Bug 14 / Bug 24)
                            if (opKey === 'fill' && (paramName === 'target_color' || paramName === 'tolerance')) {
                                const mode = this.properties.fill_mode;
                                const chromaModes = ['Color Replacement (Chroma Key)', 'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'];
                                if (chromaModes.includes(mode)) {
                                    isVisible = true;
                                } else if (mode === 'Hole Filling (Contours)') {
                                    isVisible = this.properties.use_target_color === true;
                                } else {
                                    isVisible = false;
                                }
                            } else if (paramDef.visible_if) {
                                for (const [depName, allowedValues] of Object.entries(paramDef.visible_if)) {
                                    const depVal = this.properties[depName];
                                    if (!allowedValues.includes(depVal)) {
                                        isVisible = false;
                                        break;
                                    }
                                }
                            }

                            widget.disabled = !isVisible;
                            if (isVisible) {
                                visibleWidgets.push(widget);
                                visibleCount++;
                            }
                        }
                    }

                    this.widgets = visibleWidgets;
                    this.size[1] = Math.max(60, 52 + (this.inputs ? this.inputs.length * 12 : 0) + visibleCount * 24);
                }
            }

            LiteGraph.registerNodeType(nodeTypeName, DynamicNode);
        }
    }
}

// ----------------- Topological Sort Helper (DAG Validation) -----------------

function getTopologicalOrder(graph) {
    const visited = new Set();
    const temp = new Set();
    const sorted = [];
    
    function visit(node) {
        if (!node) return;
        if (temp.has(node.id)) {
            throw new Error(`Circular dependency detected at node: ${node.title}`);
        }
        if (!visited.has(node.id)) {
            temp.add(node.id);
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
    
    // First sort output paths
    const outputNodes = (graph._nodes || []).filter(n => n.type === "image/preview" || n.type === "image/baseline");
    for (let node of outputNodes) {
        visit(node);
    }
    // Then append disconnected components so they are not deleted on mode switch
    const allNodes = graph._nodes || [];
    for (let node of allNodes) {
        visit(node);
    }
    return sorted;
}

export function compileGraphToPipeline(graph) {
    if (!graph || !graph._nodes || graph._nodes.length === 0) {
        return { pipeline: [], comparisonBaseline: "original" };
    }

    const sortedNodes = getTopologicalOrder(graph);
    const pipeline = [];
    let comparisonBaseline = "original";

    function getOriginSource(node, inputIndex = 0) {
        if (!node.inputs || !node.inputs[inputIndex] || node.inputs[inputIndex].link === null) {
            return "original";
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

    const loadNode = graph._nodes.find(n => n.type === "image/load");
    const previewNode = graph._nodes.find(n => n.type === "image/preview");
    const baselineNode = graph._nodes.find(n => n.type === "image/baseline");

    const filterNodes = sortedNodes.filter(node => node.type !== "image/load" && node.type !== "image/preview" && node.type !== "image/baseline");

    filterNodes.forEach((node, idx) => {
        const stepType = node.type.replace(/^filter\//, "").replace(/^layer\//, "");
        const stepId = `node_${node.id}`;
        
        const step = {
            id: stepId,
            type: stepType,
            disabled: node.mode === LiteGraph.NEVER || node.properties.disabled === true,
            collapsed: node.flags && node.flags.collapsed === true,
            strength: node.properties.strength !== undefined ? node.properties.strength : 100,
            input_source: getOriginSource(node, 0),
            position: [node.pos[0], node.pos[1]]
        };

        // Copy only valid parameters defined in the step's schema (Bug 22)
        const opDef = state.schema[stepType];
        if (opDef && opDef.params) {
            for (const paramName of Object.keys(opDef.params)) {
                if (node.properties[paramName] !== undefined) {
                    step[paramName] = node.properties[paramName];
                }
            }
        }

        if (stepType === 'blend') {
            step.blend_source = getOriginSource(node, 1);
        }

        // Save static node coordinates to preserve positions
        if (idx === 0 && loadNode) {
            step.load_position = [loadNode.pos[0], loadNode.pos[1]];
        }
        if (idx === filterNodes.length - 1 && previewNode) {
            step.preview_position = [previewNode.pos[0], previewNode.pos[1]];
        }
        if (baselineNode && getOriginSource(baselineNode, 0) === step.id) {
            step.baseline_position = [baselineNode.pos[0], baselineNode.pos[1]];
        }

        pipeline.push(step);
    });

    if (baselineNode) {
        comparisonBaseline = getOriginSource(baselineNode, 0);
    } else {
        comparisonBaseline = "original";
    }

    return { pipeline, comparisonBaseline };
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

    nLoad.connect(0, nGray, 0);
    nGray.connect(0, nPreview, 0);

    graph.setDirtyCanvas(true, true);
}

export function rebuildGraphFromPipeline(pipeline, graph) {
    if (!graph) return;
    
    // Temporarily disable callbacks to avoid infinite loops during graph rebuild
    const oldOnConnectionChange = graph.onNodeConnectionChange;
    graph.onNodeConnectionChange = null;
    
    graph.clear();

    const nodeMap = {}; // Map of step ID -> LiteGraph Node

    // 1. Create Load Image Node
    const nLoad = LiteGraph.createNode("image/load");
    const firstStep = pipeline[0];
    if (firstStep && firstStep.load_position) {
        nLoad.pos = [firstStep.load_position[0], firstStep.load_position[1]];
    } else {
        nLoad.pos = [80, 180];
    }
    graph.add(nLoad);
    nodeMap["original"] = nLoad;

    let currentX = 340;
    const yOffset = 180;

    // 2. Loop through pipeline and create nodes
    pipeline.forEach((step, idx) => {
        const isBlend = step.type === "blend";
        const nodeTypeName = isBlend ? "layer/blend" : `filter/${step.type}`;
        
        const node = LiteGraph.createNode(nodeTypeName);
        if (!node) return;
        
        // Strip node_ prefix to get clean integer id
        const cleanId = step.id.replace(/^node_/, "");
        node.id = parseInt(cleanId) || (200 + idx);
        
        // Assign properties
        node.properties = {
            disabled: step.disabled === true,
            strength: step.strength !== undefined ? step.strength : 100
        };
        node.mode = step.disabled === true ? LiteGraph.NEVER : LiteGraph.ALWAYS;
        
        // Populate parameters from schema
        const opDef = state.schema ? state.schema[step.type] : null;
        if (opDef && opDef.params) {
            for (const paramName of Object.keys(opDef.params)) {
                if (step[paramName] !== undefined) {
                    node.properties[paramName] = step[paramName];
                }
            }
        }
        
        // Position
        if (step.position && Array.isArray(step.position)) {
            node.pos = [step.position[0], step.position[1]];
        } else {
            node.pos = [currentX, yOffset];
            currentX += 280;
        }

        // Collapse state
        if (step.collapsed === true) {
            node.flags = node.flags || {};
            node.flags.collapsed = true;
        }
        
        // Set widget values matching properties
        if (node.widgets) {
            node.widgets.forEach(w => {
                if (w.paramName && node.properties[w.paramName] !== undefined) {
                    w.value = node.properties[w.paramName];
                } else if (w.name === "Step Strength") {
                    w.value = node.properties.strength;
                } else if (w.name === "Disabled") {
                    w.value = node.properties.disabled;
                }
            });
        }
        if (node.updateWidgetsVisibility) {
            node.updateWidgetsVisibility();
        }

        graph.add(node);
        nodeMap[step.id] = node;
    });

    // 3. Connect nodes
    pipeline.forEach((step, idx) => {
        const node = nodeMap[step.id];
        if (!node) return;

        const inputSrc = step.input_source || "previous";
        let resolvedInputKey = inputSrc;
        if (inputSrc === "previous") {
            resolvedInputKey = idx > 0 ? pipeline[idx - 1].id : "original";
        }

        const parentNode = nodeMap[resolvedInputKey];
        if (parentNode) {
            parentNode.connect(0, node, 0);
        }

        if (step.type === "blend" && step.blend_source) {
            let blendSrc = step.blend_source;
            if (blendSrc === "previous") {
                blendSrc = idx > 0 ? pipeline[idx - 1].id : "original";
            }
            const parentBlend = nodeMap[blendSrc];
            if (parentBlend) {
                parentBlend.connect(0, node, 1);
            }
        }
    });

    // 4. Create Preview Node
    const nPreview = LiteGraph.createNode("image/preview");
    const lastStep = pipeline[pipeline.length - 1];
    if (lastStep && lastStep.preview_position) {
        nPreview.pos = [lastStep.preview_position[0], lastStep.preview_position[1]];
    } else {
        nPreview.pos = [currentX, 100];
    }
    graph.add(nPreview);

    if (pipeline.length > 0) {
        const lastNode = nodeMap[lastStep.id];
        if (lastNode) {
            lastNode.connect(0, nPreview, 0);
        }
    } else {
        nLoad.connect(0, nPreview, 0);
    }

    // 5. Create Comparison Baseline Node if compare reference is set
    const compareBaseline = state.comparisonBaseline || "original";
    if (compareBaseline && compareBaseline !== "none") {
        const nBaseline = LiteGraph.createNode("image/baseline");
        const baselineStep = pipeline.find(s => s.baseline_position);
        if (baselineStep && baselineStep.baseline_position) {
            nBaseline.pos = [baselineStep.baseline_position[0], baselineStep.baseline_position[1]];
        } else {
            nBaseline.pos = [currentX, 380];
        }
        graph.add(nBaseline);
        const baselineParent = nodeMap[compareBaseline];
        if (baselineParent) {
            baselineParent.connect(0, nBaseline, 0);
        }
    }

    // Restore callbacks
    graph.onNodeConnectionChange = oldOnConnectionChange;
    graph.setDirtyCanvas(true, true);
}
