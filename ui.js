// ui.js
// Dynamic Schema-Driven UI Generator for Preprocessing Studio

import { state, elements } from './state.js';
import { updateComparisonView } from './viewer.js';

export function escapeHTML(str) {
    if (str === null || str === undefined) return '';
    return String(str).replace(/[&<>'"]/g, 
        tag => ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            "'": '&#39;',
            '"': '&quot;'
        }[tag] || tag)
    );
}

export function generateStepId() {
    return 'step_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
}

function computeVisibility(paramName, paramDef, step) {
    if (step.type === 'fill' && (paramName === 'target_color' || paramName === 'tolerance')) {
        const mode = step.fill_mode;
        const chromaModes = ['Color Replacement (Chroma Key)', 'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'];
        if (chromaModes.includes(mode)) return true;
        if (mode === 'Hole Filling (Contours)') return step.use_target_color === true;
        return false;
    }
    if (!paramDef.visible_if) return true;
    for (const [depName, allowedValues] of Object.entries(paramDef.visible_if)) {
        if (!allowedValues.includes(step[depName])) return false;
    }
    return true;
}

export function getStepName(type) {
    const schema = state.schema[type];
    return schema ? schema.name : 'Transformation';
}

export function getStepCategory(type) {
    switch (type) {
        case 'grayscale':
        case 'invert':
        case 'contrast':
            return 'cat-color';
        case 'blur':
        case 'heal':
            return 'cat-filter';
        case 'threshold':
        case 'above_to_white':
        case 'edges':
        case 'edges_fill':
            return 'cat-threshold';
        case 'upsample':
        case 'downsample':
        case 'crop':
            return 'cat-transform';
        case 'fill':
        case 'blend':
            return 'cat-blend';
        default:
            return '';
    }
}

function populateSourceDropdown(selectEl, selectedVal, includeNone, includePipeline) {
    if (!selectEl) return;
    selectEl.innerHTML = '';
    if (includeNone) {
        const opt = document.createElement('option');
        opt.value = 'none';
        opt.textContent = 'None (Show Processed Only)';
        selectEl.appendChild(opt);
    }
    if (includePipeline) {
        const opt = document.createElement('option');
        opt.value = 'pipeline';
        opt.textContent = 'Pipeline Result';
        selectEl.appendChild(opt);
    }
    const origOpt = document.createElement('option');
    origOpt.value = 'original';
    origOpt.textContent = 'Original Image';
    selectEl.appendChild(origOpt);

    state.pipeline.forEach((step, idx) => {
        const stepOpt = document.createElement('option');
        stepOpt.value = step.id;
        stepOpt.textContent = `Step #${idx + 1}: ${getStepName(step.type)}` + (step.disabled ? ' (Disabled)' : '');
        if (step.disabled) stepOpt.disabled = true;
        selectEl.appendChild(stepOpt);
    });

    let exists = [...(includeNone ? ['none'] : []), ...(includePipeline ? ['pipeline'] : []), 'original'].includes(selectedVal);
    if (!exists) {
        exists = state.pipeline.some(s => s.id === selectedVal && !s.disabled);
    }
    if (!exists) {
        selectEl.value = includePipeline ? 'pipeline' : 'original';
    } else {
        selectEl.value = selectedVal;
    }
}

export function updateCompareSourceDropdowns() {
    populateSourceDropdown(elements.compareReferenceSelect, state.comparisonBaseline, true, false);
    populateSourceDropdown(elements.comparisonProcessedSelect, state.comparisonProcessed, false, true);
}

export function renderPipeline() {
    const scrollContainer = document.querySelector('.sidebar-scroll');
    const prevScrollTop = scrollContainer ? scrollContainer.scrollTop : 0;
    
    elements.layersListContainer.innerHTML = '';
    
    updateCompareSourceDropdowns();
    
    if (state.pipeline.length === 0) {
        elements.layersListContainer.innerHTML = `
            <div class="empty-pipeline-banner">
                <div class="empty-pipeline-icon">🎛️</div>
                <div class="empty-pipeline-title">No Transformations Active</div>
                <div class="empty-pipeline-text">Select an operation from the options above and click "Add Step" to begin building your pipeline.</div>
            </div>
        `;
        return;
    }
    
    state.pipeline.forEach((step, index) => {
        const card = createPipelineCardElement(step, index);
        elements.layersListContainer.appendChild(card);
    });
    
    if (scrollContainer) {
        scrollContainer.scrollTop = prevScrollTop;
    }
}

export function updateStepCardParamVisibility(stepCard, step) {
    const schema = state.schema[step.type];
    if (!schema || !schema.params) return;
    
    for (const [paramName, paramDef] of Object.entries(schema.params)) {
        const isVisible = computeVisibility(paramName, paramDef, step);
        const paramEl = stepCard.querySelector(`.param-group[data-param-name="${paramName}"]`);
        if (paramEl) {
            paramEl.style.display = isVisible ? 'block' : 'none';
        }
    }
}

function renderStepParams(step, index) {
    const schema = state.schema[step.type];
    if (!schema || !schema.params) return '';

    // Validate input_source — reset to 'previous' if it references a deleted/invalid step
    const validInputSources = new Set(state.pipeline.slice(0, index).map(s => s.id));
    validInputSources.add('previous');
    validInputSources.add('original');
    if (step.input_source !== undefined && !validInputSources.has(step.input_source)) {
        step.input_source = 'previous';
    }
    // Validate blend_source similarly
    if (step.blend_source !== undefined && !validInputSources.has(step.blend_source)) {
        step.blend_source = 'previous';
    }
    
    let html = '';
    
    // 1. Input Source Dropdown (always rendered to allow arbitrary step connections)
    let inputOptions = `
        <option value="previous" ${step.input_source === 'previous' ? 'selected' : ''}>Previous Step</option>
        <option value="original" ${step.input_source === 'original' ? 'selected' : ''}>Original Image</option>
    `;
    for (let i = 0; i < index; i++) {
        const prevStep = state.pipeline[i];
        inputOptions += `<option value="${escapeHTML(prevStep.id)}" ${step.input_source === prevStep.id ? 'selected' : ''} ${prevStep.disabled ? 'disabled' : ''}>Step #${i + 1}: ${escapeHTML(getStepName(prevStep.type))}${prevStep.disabled ? ' (Disabled)' : ''}</option>`;
    }
    
    html += `
        <div class="control-group">
            <span class="control-label">Input Source</span>
            <div class="select-wrapper">
                <select class="custom-select" data-param="input_source">
                    ${inputOptions}
                </select>
            </div>
        </div>
    `;
    
    // 2. Render all schema parameter controls
    for (const [paramName, paramDef] of Object.entries(schema.params)) {
        if (paramName === 'blend_source') {
            // Blending Source select dropdown
            let blendOptions = `
                <option value="previous" ${step.blend_source === 'previous' ? 'selected' : ''}>Previous Step</option>
                <option value="original" ${step.blend_source === 'original' ? 'selected' : ''}>Original Image</option>
            `;
            for (let i = 0; i < index; i++) {
                const prevStep = state.pipeline[i];
                blendOptions += `<option value="${escapeHTML(prevStep.id)}" ${step.blend_source === prevStep.id ? 'selected' : ''} ${prevStep.disabled ? 'disabled' : ''}>Step #${i + 1}: ${escapeHTML(getStepName(prevStep.type))}${prevStep.disabled ? ' (Disabled)' : ''}</option>`;
            }
            html += `
                <div class="control-group">
                    <span class="control-label">${escapeHTML(paramDef.label)}</span>
                    <div class="select-wrapper">
                        <select class="custom-select" data-param="blend_source">
                            ${blendOptions}
                        </select>
                    </div>
                </div>
            `;
            continue;
        }
        
        const isVisible = computeVisibility(paramName, paramDef, step);
        const displayStyle = isVisible ? 'block' : 'none';
        
        html += `<div class="control-group param-group" data-param-name="${escapeHTML(paramName)}" style="display: ${displayStyle};">`;
        
        if (paramDef.type === 'int' || paramDef.type === 'float') {
            const rawVal = step[paramName] !== undefined && step[paramName] !== null ? step[paramName] : paramDef.default;
            const valDisplay = (paramDef.type === 'float') ? rawVal.toFixed(1) + (paramName === 'scale' && step.type === 'upsample' ? 'x' : '') : (rawVal >= 0 && paramName === 'brightness' ? '+' + rawVal : rawVal);
            html += `
                <div class="slider-header">
                    <span class="control-label">${escapeHTML(paramDef.label)}</span>
                    <span class="slider-value" id="val-${escapeHTML(paramName)}-${escapeHTML(step.id)}">${escapeHTML(valDisplay)}</span>
                </div>
                <input type="range" class="custom-range" data-param="${escapeHTML(paramName)}" min="${escapeHTML(paramDef.min)}" max="${escapeHTML(paramDef.max)}" step="${escapeHTML(paramDef.step)}" value="${escapeHTML(rawVal)}">
            `;
        } else if (paramDef.type === 'select') {
            const selectVal = step[paramName] !== undefined && step[paramName] !== null ? step[paramName] : paramDef.default;
            let selectOptions = '';
            paramDef.options.forEach(opt => {
                selectOptions += `<option value="${escapeHTML(opt)}" ${selectVal === opt ? 'selected' : ''}>${escapeHTML(opt)}</option>`;
            });
            html += `
                <span class="control-label">${escapeHTML(paramDef.label)}</span>
                <div class="select-wrapper">
                    <select class="custom-select" data-param="${escapeHTML(paramName)}">
                        ${selectOptions}
                    </select>
                </div>
            `;
        } else if (paramDef.type === 'color') {
            const colorVal = step[paramName] !== undefined && step[paramName] !== null ? step[paramName] : paramDef.default;
            html += `
                <span class="control-label">${escapeHTML(paramDef.label)}</span>
                <div class="color-picker-wrapper">
                    <input type="color" class="custom-color-picker" data-param="${escapeHTML(paramName)}" value="${escapeHTML(colorVal)}">
                    <input type="text" class="custom-color-text" data-param="${escapeHTML(paramName)}" value="${escapeHTML(colorVal)}">
                </div>
            `;
        } else if (paramDef.type === 'bool') {
            const boolVal = step[paramName] !== undefined && step[paramName] !== null ? step[paramName] : paramDef.default;
            html += `
                <div class="toggle-container">
                    <span class="control-label">${escapeHTML(paramDef.label)}</span>
                    <label class="switch">
                        <input type="checkbox" data-param="${escapeHTML(paramName)}" ${boolVal ? 'checked' : ''}>
                        <span class="slider-switch"></span>
                    </label>
                </div>
            `;
        }
        
        html += `</div>`;
    }
    
    return html;
}

export function createPipelineCardElement(step, index) {
    const card = document.createElement('div');
    const categoryClass = getStepCategory(step.type);
    card.className = `pipeline-card ${categoryClass}`;
    if (step.disabled) {
        card.classList.add('disabled-step');
    }
    if (state.comparisonBaseline === step.id) {
        card.classList.add('baseline-step');
    }
    if (step.collapsed) {
        card.classList.add('collapsed');
    }
    
    card.dataset.index = index;
    card.dataset.id = step.id;
    
    const isDisabled = step.disabled === true;
    const isBaseline = state.comparisonBaseline === step.id;
    const strength = step.strength !== undefined ? step.strength : 100;
    
    const bodyHtml = renderStepParams(step, index);
    
    card.innerHTML = `
        <div class="pipeline-card-header">
            <div class="pipeline-card-title">
                <button class="action-btn btn-collapse" title="${step.collapsed ? 'Expand Step' : 'Collapse Step'}">
                    ${step.collapsed ? 
                      `<svg class="icon collapse-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="9 18 15 12 9 6"></polyline></svg>` : 
                      `<svg class="icon collapse-icon" viewBox="0 0 24 24" width="12" height="12" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>`
                    }
                </button>
                <span class="step-num">#${index + 1}</span>
                <span class="step-name">${escapeHTML(getStepName(step.type))}</span>
                ${isBaseline ? '<span class="baseline-badge">Baseline</span>' : ''}
            </div>
            <div class="pipeline-card-actions">
                <button class="action-btn btn-toggle-enable" title="${isDisabled ? 'Enable Step' : 'Disable Step'}">
                    ${isDisabled ? 
                      `<svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"></svg>` : 
                      `<svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"></path><circle cx="12" cy="12" r="3"></circle></svg>`
                    }
                </button>
                <button class="action-btn btn-set-baseline ${isBaseline ? 'active' : ''}" title="${isBaseline ? 'Remove Baseline' : 'Set as Comparison Baseline'}">
                    <svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="20" x2="18" y2="10"></line><line x1="12" y1="20" x2="12" y2="4"></line><line x1="6" y1="20" x2="6" y2="14"></line></svg>
                </button>
                <button class="action-btn btn-up" title="Move Up" ${index === 0 ? 'disabled' : ''}>
                    <svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="18 15 12 9 6 15"></polyline></svg>
                </button>
                <button class="action-btn btn-down" title="Move Down" ${index === state.pipeline.length - 1 ? 'disabled' : ''}>
                    <svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><polyline points="6 9 12 15 18 9"></polyline></svg>
                </button>
                <button class="action-btn btn-delete" title="Remove">
                    <svg class="icon" viewBox="0 0 24 24" width="14" height="14" stroke="currentColor" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
        <div class="pipeline-card-body">
            ${bodyHtml}
            
            <!-- Universal Step Opacity Blend Slider -->
            <div class="control-group step-strength-wrapper">
                <div class="slider-header">
                    <span class="control-label">Step Strength (Dry/Wet Blend)</span>
                    <span class="slider-value" id="val-step-strength-${escapeHTML(step.id)}">${strength}%</span>
                </div>
                <input type="range" class="custom-range strength-range" data-param="step_strength" min="0" max="100" step="5" value="${strength}">
            </div>
        </div>
    `;
    
    return card;
}

export function exportPreset() {
    if (state.pipeline.length === 0) {
        alert("Your pipeline is currently empty. Add some steps before exporting a preset!");
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(state.pipeline, null, 2));
    const downloadAnchor = document.createElement('a');
    downloadAnchor.setAttribute("href", dataStr);
    downloadAnchor.setAttribute("download", "preprocessing_preset.json");
    document.body.appendChild(downloadAnchor);
    downloadAnchor.click();
    downloadAnchor.remove();
}

export function importPreset(file, onLoadCallback) {
    const reader = new FileReader();
    reader.onload = function(evt) {
        try {
            const imported = JSON.parse(evt.target.result);
            if (Array.isArray(imported)) {
                const isLayersPreset = imported.every(l => l.id && l.name && Array.isArray(l.steps));
                const isLegacyStepsPreset = imported.every(step => step.id && step.type);
                const isFlatPipelinePreset = imported.every(step => step.id && step.type && step.input_source);
                
                if (isFlatPipelinePreset || isLegacyStepsPreset) {
                    // Import directly, map legacy type variables if needed
                    if (isLegacyStepsPreset) {
                        imported.forEach(step => {
                            if (step.input_source === undefined) step.input_source = 'previous';
                        });
                    }
                    state.pipeline = imported;
                    renderPipeline();
                    if (onLoadCallback) onLoadCallback();
                } else if (isLayersPreset) {
                    // Convert old nested layers preset to the new flat pipeline format
                    const flatPipeline = [];
                    let precedingOutputId = "original";
                    
                    imported.forEach((layer, layerIdx) => {
                        // Skip completely if layer is empty but has blending settings (Empty Layer Trap)
                        if (!layer.steps || layer.steps.length === 0) return;
                        
                        let lastStepId = precedingOutputId;
                        
                        layer.steps.forEach((step, stepIdx) => {
                            // Ensure step has unique ID mapping
                            const stepId = step.id;
                            const inputSource = (stepIdx === 0) ? precedingOutputId : layer.steps[stepIdx - 1].id;
                            
                            // Map step
                            const newStep = {
                                ...step,
                                input_source: inputSource
                            };
                            flatPipeline.push(newStep);
                            lastStepId = stepId;
                        });
                        
                        // Check if layer requires blending settings (i.e. not normal, or has opacity < 100)
                        const requiresBlending = layer.blend_mode !== "normal" || layer.opacity < 100 || layer.blend_interpolation !== "Bicubic (Sharp)";
                        if (requiresBlending) {
                            const blendStepId = 'step_blend_' + Date.now() + '_' + Math.random().toString(36).slice(2, 7);
                            const blendStep = {
                                id: blendStepId,
                                type: "blend",
                                disabled: layer.disabled,
                                strength: 100,
                                input_source: precedingOutputId, // target background
                                blend_source: lastStepId,        // source foreground
                                blend_mode: layer.blend_mode,
                                opacity: layer.opacity,
                                blend_interpolation: layer.blend_interpolation
                            };
                            flatPipeline.push(blendStep);
                            precedingOutputId = blendStepId;
                        } else {
                            precedingOutputId = lastStepId;
                        }
                    });
                    
                    state.pipeline = flatPipeline;
                    renderPipeline();
                    if (onLoadCallback) onLoadCallback();
                } else {
                    alert("Invalid preset file format. Must be a valid pipeline preset or legacy layers JSON.");
                }
            } else {
                alert("Invalid preset file format. Preset must be a JSON array.");
            }
        } catch (err) {
            alert("Failed to parse JSON preset file: " + err.message);
        }
    };
    reader.readAsText(file);
}
