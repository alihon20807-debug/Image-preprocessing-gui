# schema.py
# Centralized schema definition and validation engine for Preprocessing Studio

OPERATIONS_SCHEMA = {
    "grayscale": {
        "name": "Convert to Grayscale",
        "description": "Converts BGR image channels to a single-channel grayscale matrix.",
        "params": {}
    },
    "invert": {
        "name": "Invert Colors",
        "description": "Inverts the color values of the active channels.",
        "params": {
            "channel_mode": {
                "label": "Inversion Mode",
                "type": "select",
                "default": "Color Channels",
                "options": ["Color Channels", "Grayscale"]
            }
        }
    },
    "contrast": {
        "name": "Contrast & Brightness",
        "description": "Adjusts image contrast scaling and brightness offsets.",
        "params": {
            "contrast": {
                "label": "Contrast",
                "type": "float",
                "default": 1.0,
                "min": 0.5,
                "max": 3.0,
                "step": 0.1
            },
            "brightness": {
                "label": "Brightness",
                "type": "int",
                "default": 0,
                "min": -100,
                "max": 100,
                "step": 5
            }
        }
    },
    "blur": {
        "name": "Blur Filters",
        "description": "Applies standard blurs (Gaussian, Median, Bilateral, Box).",
        "params": {
            "blur_type": {
                "label": "Blur Type",
                "type": "select",
                "default": "Gaussian Blur",
                "options": ["Gaussian Blur", "Median Blur", "Bilateral Filter", "Box Blur"]
            },
            "kernel_x": {
                "label": "Kernel Width (X, Odd)",
                "type": "int",
                "default": 5,
                "min": 1,
                "max": 25,
                "step": 2,
                "odd_only": True,
                "visible_if": {"blur_type": ["Gaussian Blur", "Box Blur"]}
            },
            "kernel_y": {
                "label": "Kernel Height (Y, Odd)",
                "type": "int",
                "default": 5,
                "min": 1,
                "max": 25,
                "step": 2,
                "odd_only": True,
                "visible_if": {"blur_type": ["Gaussian Blur", "Box Blur"]}
            },
            "sigma_x": {
                "label": "Sigma X (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"blur_type": ["Gaussian Blur"]}
            },
            "sigma_y": {
                "label": "Sigma Y (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"blur_type": ["Gaussian Blur"]}
            },
            "kernel": {
                "label": "Kernel Size (Odd)",
                "type": "int",
                "default": 5,
                "min": 3,
                "max": 25,
                "step": 2,
                "odd_only": True,
                "visible_if": {"blur_type": ["Median Blur"]}
            },
            "diameter": {
                "label": "Neighborhood Diameter",
                "type": "int",
                "default": 9,
                "min": 1,
                "max": 15,
                "step": 1,
                "visible_if": {"blur_type": ["Bilateral Filter"]}
            },
            "sigma_color": {
                "label": "Sigma Color",
                "type": "float",
                "default": 75.0,
                "min": 10.0,
                "max": 150.0,
                "step": 5.0,
                "visible_if": {"blur_type": ["Bilateral Filter"]}
            },
            "sigma_space": {
                "label": "Sigma Space",
                "type": "float",
                "default": 75.0,
                "min": 10.0,
                "max": 150.0,
                "step": 5.0,
                "visible_if": {"blur_type": ["Bilateral Filter"]}
            }
        }
    },
    "threshold": {
        "name": "Thresholding",
        "description": "Binarizes images using global, adaptive, or color-targeted thresholding.",
        "params": {
            "mode": {
                "label": "Threshold Mode",
                "type": "select",
                "default": "Binary Thresholding",
                "options": [
                    "Binary Thresholding", "Binary Thresholding Inverted",
                    "Truncate Thresholding", "Threshold to Zero", "Threshold to Zero Inverted",
                    "Otsu's Thresholding", "Otsu's Thresholding Inverted",
                    "Triangle Thresholding", "Triangle Thresholding Inverted",
                    "Adaptive Mean", "Adaptive Mean Inverted",
                    "Adaptive Gaussian", "Adaptive Gaussian Inverted",
                    "Single Color Thresholding", "Single Color Thresholding Inverted"
                ]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Grayscale",
                "options": ["Grayscale", "Color Channels"]
            },
            "fill_color": {
                "label": "Target Fill Color",
                "type": "color",
                "default": "#ffffff"
            },
            "value": {
                "label": "Threshold Value",
                "type": "int",
                "default": 127,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {
                    "mode": [
                        "Binary Thresholding", "Binary Thresholding Inverted",
                        "Truncate Thresholding", "Threshold to Zero", "Threshold to Zero Inverted"
                    ]
                }
            },
            "block_size": {
                "label": "Adaptive Block Size (Odd)",
                "type": "int",
                "default": 11,
                "min": 3,
                "max": 99,
                "step": 2,
                "odd_only": True,
                "visible_if": {
                    "mode": [
                        "Adaptive Mean", "Adaptive Mean Inverted",
                        "Adaptive Gaussian", "Adaptive Gaussian Inverted"
                    ]
                }
            },
            "constant_c": {
                "label": "Constant C Offset",
                "type": "int",
                "default": 2,
                "min": -100,
                "max": 100,
                "step": 1,
                "visible_if": {
                    "mode": [
                        "Otsu's Thresholding", "Otsu's Thresholding Inverted",
                        "Triangle Thresholding", "Triangle Thresholding Inverted",
                        "Adaptive Mean", "Adaptive Mean Inverted",
                        "Adaptive Gaussian", "Adaptive Gaussian Inverted"
                    ]
                }
            },
            "sigma_x": {
                "label": "Sigma X (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"mode": ["Adaptive Gaussian", "Adaptive Gaussian Inverted"]}
            },
            "sigma_y": {
                "label": "Sigma Y (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"mode": ["Adaptive Gaussian", "Adaptive Gaussian Inverted"]}
            },
            "target_color": {
                "label": "Match Target Color",
                "type": "color",
                "default": "#000000",
                "visible_if": {"mode": ["Single Color Thresholding", "Single Color Thresholding Inverted"]}
            },
            "tolerance": {
                "label": "Match Tolerance",
                "type": "int",
                "default": 30,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {"mode": ["Single Color Thresholding", "Single Color Thresholding Inverted"]}
            }
        }
    },
    "above_to_white": {
        "name": "Above to White (Threshold)",
        "description": "Thresholds images to white (or a target color) selectively based on mathematical conditions.",
        "params": {
            "algorithm": {
                "label": "Algorithm",
                "type": "select",
                "default": "Global",
                "options": ["Global", "Otsu's", "Triangle", "Adaptive Mean", "Adaptive Gaussian"]
            },
            "condition": {
                "label": "Condition",
                "type": "select",
                "default": "Above or Equal (>=)",
                "options": [
                    "Above or Equal (>=)", "Above (>)", "Below (<)", "Below or Equal (<=)",
                    "Inside Range [Min, Max]", "Outside Range"
                ]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Grayscale",
                "options": ["Grayscale", "Color Channels"]
            },
            "fill_color": {
                "label": "Target Fill Color",
                "type": "color",
                "default": "#ffffff"
            },
            "value": {
                "label": "Threshold Value",
                "type": "int",
                "default": 127,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {"algorithm": ["Global"]}
            },
            "value_max": {
                "label": "Threshold Max Value",
                "type": "int",
                "default": 255,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {"condition": ["Inside Range [Min, Max]", "Outside Range"]}
            },
            "block_size_x": {
                "label": "Kernel Width (X, Odd)",
                "type": "int",
                "default": 11,
                "min": 3,
                "max": 99,
                "step": 2,
                "odd_only": True,
                "visible_if": {"algorithm": ["Adaptive Mean", "Adaptive Gaussian"]}
            },
            "block_size_y": {
                "label": "Kernel Height (Y, Odd)",
                "type": "int",
                "default": 11,
                "min": 3,
                "max": 99,
                "step": 2,
                "odd_only": True,
                "visible_if": {"algorithm": ["Adaptive Mean", "Adaptive Gaussian"]}
            },
            "constant_c": {
                "label": "Constant C Offset",
                "type": "int",
                "default": 2,
                "min": -100,
                "max": 100,
                "step": 1,
                "visible_if": {"algorithm": ["Otsu's", "Triangle", "Adaptive Mean", "Adaptive Gaussian"]}
            },
            "sigma_x": {
                "label": "Sigma X (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"algorithm": ["Adaptive Gaussian"]}
            },
            "sigma_y": {
                "label": "Sigma Y (0 = auto)",
                "type": "float",
                "default": 0.0,
                "min": 0.0,
                "max": 10.0,
                "step": 0.5,
                "visible_if": {"algorithm": ["Adaptive Gaussian"]}
            }
        }
    },
    "edges": {
        "name": "Edge Detection",
        "description": "Applies Canny, Sobel, Scharr, or Laplacian edge detectors.",
        "params": {
            "algorithm": {
                "label": "Algorithm",
                "type": "select",
                "default": "Canny",
                "options": ["Canny", "Sobel", "Scharr", "Laplacian"]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Grayscale",
                "options": ["Grayscale", "Color Channels"]
            },
            "low": {
                "label": "Low Threshold",
                "type": "int",
                "default": 50,
                "min": 0,
                "max": 255,
                "step": 5,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "high": {
                "label": "High Threshold",
                "type": "int",
                "default": 150,
                "min": 0,
                "max": 255,
                "step": 5,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "aperture": {
                "label": "Aperture Size",
                "type": "select",
                "default": 3,
                "options": [3, 5, 7],
                "visible_if": {"algorithm": ["Canny"]}
            },
            "l2_gradient": {
                "label": "Gradient L2 Norm",
                "type": "bool",
                "default": False,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "dx": {
                "label": "Derivative X Order (dx)",
                "type": "select",
                "default": 1,
                "options": [0, 1, 2],
                "visible_if": {"algorithm": ["Sobel", "Scharr"]}
            },
            "dy": {
                "label": "Derivative Y Order (dy)",
                "type": "select",
                "default": 0,
                "options": [0, 1, 2],
                "visible_if": {"algorithm": ["Sobel", "Scharr"]}
            },
            "ksize": {
                "label": "Sobel/Laplacian Kernel Size",
                "type": "select",
                "default": 3,
                "options": [1, 3, 5, 7],
                "visible_if": {"algorithm": ["Sobel", "Laplacian"]}
            },
            "scale": {
                "label": "Scale Multiplier",
                "type": "float",
                "default": 1.0,
                "min": 0.1,
                "max": 5.0,
                "step": 0.1,
                "visible_if": {"algorithm": ["Sobel", "Scharr", "Laplacian"]}
            },
            "delta": {
                "label": "Delta Offset",
                "type": "int",
                "default": 0,
                "min": -100,
                "max": 100,
                "step": 1,
                "visible_if": {"algorithm": ["Sobel", "Scharr", "Laplacian"]}
            }
        }
    },
    "edges_fill": {
        "name": "Edge Detection + Fill",
        "description": "Runs edge detection and fills contours, boundaries, or bounding boxes.",
        "params": {
            # Inherited edges parameters
            "algorithm": {
                "label": "Algorithm",
                "type": "select",
                "default": "Canny",
                "options": ["Canny", "Sobel", "Scharr", "Laplacian"]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Grayscale",
                "options": ["Grayscale", "Color Channels"]
            },
            "low": {
                "label": "Low Threshold",
                "type": "int",
                "default": 50,
                "min": 0,
                "max": 255,
                "step": 5,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "high": {
                "label": "High Threshold",
                "type": "int",
                "default": 150,
                "min": 0,
                "max": 255,
                "step": 5,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "aperture": {
                "label": "Aperture Size",
                "type": "select",
                "default": 3,
                "options": [3, 5, 7],
                "visible_if": {"algorithm": ["Canny"]}
            },
            "l2_gradient": {
                "label": "Gradient L2 Norm",
                "type": "bool",
                "default": False,
                "visible_if": {"algorithm": ["Canny"]}
            },
            "dx": {
                "label": "Derivative X Order (dx)",
                "type": "select",
                "default": 1,
                "options": [0, 1, 2],
                "visible_if": {"algorithm": ["Sobel", "Scharr"]}
            },
            "dy": {
                "label": "Derivative Y Order (dy)",
                "type": "select",
                "default": 0,
                "options": [0, 1, 2],
                "visible_if": {"algorithm": ["Sobel", "Scharr"]}
            },
            "ksize": {
                "label": "Sobel/Laplacian Kernel Size",
                "type": "select",
                "default": 3,
                "options": [1, 3, 5, 7],
                "visible_if": {"algorithm": ["Sobel", "Laplacian"]}
            },
            "scale": {
                "label": "Scale Multiplier",
                "type": "float",
                "default": 1.0,
                "min": 0.1,
                "max": 5.0,
                "step": 0.1,
                "visible_if": {"algorithm": ["Sobel", "Scharr", "Laplacian"]}
            },
            "delta": {
                "label": "Delta Offset",
                "type": "int",
                "default": 0,
                "min": -100,
                "max": 100,
                "step": 1,
                "visible_if": {"algorithm": ["Sobel", "Scharr", "Laplacian"]}
            },
            # Edge Fill specific parameters
            "fill_target": {
                "label": "Fill Target Background",
                "type": "select",
                "default": "Original Image",
                "options": ["Original Image", "Binary Mask (Black background)", "Binary Mask (White background)"]
            },
            "color": {
                "label": "Fill Color (Grayscale 0-255)",
                "type": "int",
                "default": 255,
                "min": 0,
                "max": 255,
                "step": 5
            },
            "min_area": {
                "label": "Min Contour Area",
                "type": "float",
                "default": 100.0,
                "min": 0.0,
                "max": 100000.0,
                "step": 10.0
            },
            "max_area": {
                "label": "Max Contour Area",
                "type": "float",
                "default": 1000000.0,
                "min": 0.0,
                "max": 10000000.0,
                "step": 100.0
            },
            "draw_style": {
                "label": "Draw Style",
                "type": "select",
                "default": "Filled Contours",
                "options": ["Filled Contours", "Contour Outlines", "Filled Bounding Boxes", "Bounding Box Outlines"]
            },
            "thickness": {
                "label": "Outline Thickness",
                "type": "int",
                "default": 2,
                "min": 1,
                "max": 20,
                "step": 1
            }
        }
    },
    "upsample": {
        "name": "Upsampling (Scale Up)",
        "description": "Increases image spatial scale.",
        "params": {
            "scale": {
                "label": "Scale",
                "type": "float",
                "default": 2.0,
                "min": 1.0,
                "max": 4.0,
                "step": 0.5
            },
            "interpolation": {
                "label": "Upscale Filter",
                "type": "select",
                "default": "Bicubic (Sharp)",
                "options": ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"]
            }
        }
    },
    "downsample": {
        "name": "Downsampling (Scale Down)",
        "description": "Reduces image spatial scale.",
        "params": {
            "scale": {
                "label": "Scale",
                "type": "float",
                "default": 0.5,
                "min": 0.05,
                "max": 1.0,
                "step": 0.05
            },
            "interpolation": {
                "label": "Downscale Filter",
                "type": "select",
                "default": "Bicubic (Sharp)",
                "options": ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"]
            }
        }
    },
    "crop": {
        "name": "Crop Region",
        "description": "Crops boundary percentages from the outer edges.",
        "params": {
            "left": {
                "label": "Left %",
                "type": "int",
                "default": 0,
                "min": 0,
                "max": 99,
                "step": 1
            },
            "right": {
                "label": "Right %",
                "type": "int",
                "default": 0,
                "min": 0,
                "max": 99,
                "step": 1
            },
            "top": {
                "label": "Top %",
                "type": "int",
                "default": 0,
                "min": 0,
                "max": 99,
                "step": 1
            },
            "bottom": {
                "label": "Bottom %",
                "type": "int",
                "default": 0,
                "min": 0,
                "max": 99,
                "step": 1
            }
        }
    },
    "heal": {
        "name": "Stroke Healing",
        "description": "Applies mathematical morphology and skeletonization to repair strokes.",
        "params": {
            "operation": {
                "label": "Morphology Operation",
                "type": "select",
                "default": "Heal Gaps in White (Closing)",
                "options": [
                    "Dilate (Thicken White)", "Erode (Thicken Black)",
                    "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                    "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                    "Extract Dark Details (Black Hat)", "Skeletonization (Thinning)"
                ]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Color Channels",
                "options": ["Color Channels", "Grayscale"]
            },
            "use_target_color": {
                "label": "Target Color Matching",
                "type": "bool",
                "default": False
            },
            "target_color": {
                "label": "Target Color",
                "type": "color",
                "default": "#000000",
                "visible_if": {"use_target_color": [True]}
            },
            "tolerance": {
                "label": "Match Tolerance",
                "type": "int",
                "default": 30,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {"use_target_color": [True]}
            },
            "fill_color": {
                "label": "Fill Color",
                "type": "color",
                "default": "#ffffff",
                "visible_if": {"use_target_color": [True]}
            },
            "bg_color": {
                "label": "Erase/BG Color",
                "type": "color",
                "default": "#ffffff",
                "visible_if": {"use_target_color": [True]}
            },
            "shape": {
                "label": "Kernel Shape",
                "type": "select",
                "default": "Rectangle",
                "options": ["Rectangle", "Ellipse", "Cross"],
                "visible_if": {
                    "operation": [
                        "Dilate (Thicken White)", "Erode (Thicken Black)",
                        "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                        "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                        "Extract Dark Details (Black Hat)"
                    ]
                }
            },
            "kernel_x": {
                "label": "Kernel Width (X, Odd)",
                "type": "int",
                "default": 5,
                "min": 1,
                "max": 99,
                "step": 2,
                "odd_only": True,
                "visible_if": {
                    "operation": [
                        "Dilate (Thicken White)", "Erode (Thicken Black)",
                        "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                        "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                        "Extract Dark Details (Black Hat)"
                    ]
                }
            },
            "kernel_y": {
                "label": "Kernel Height (Y, Odd)",
                "type": "int",
                "default": 5,
                "min": 1,
                "max": 99,
                "step": 2,
                "odd_only": True,
                "visible_if": {
                    "operation": [
                        "Dilate (Thicken White)", "Erode (Thicken Black)",
                        "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                        "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                        "Extract Dark Details (Black Hat)"
                    ]
                }
            },
            "iterations": {
                "label": "Iterations",
                "type": "int",
                "default": 1,
                "min": 1,
                "max": 100,
                "step": 1,
                "visible_if": {
                    "operation": [
                        "Dilate (Thicken White)", "Erode (Thicken Black)",
                        "Heal Gaps in White (Closing)", "Heal Gaps in Black (Opening)",
                        "Stroke Outlines (Gradient)", "Extract Bright Details (Top Hat)",
                        "Extract Dark Details (Black Hat)"
                    ]
                }
            },
            "skel_threshold": {
                "label": "Skeletonization Threshold",
                "type": "int",
                "default": 128,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {
                    "operation": ["Skeletonization (Thinning)"]
                }
            },
            "foreground_mode": {
                "label": "Foreground Mode",
                "type": "select",
                "default": "White strokes (Dark background)",
                "options": [
                    "Black strokes (Light background)", 
                    "White strokes (Dark background)"
                ],
                "visible_if": {
                    "operation": ["Skeletonization (Thinning)"]
                }
            }
        }
    },
    "fill": {
        "name": "Fill Region",
        "description": "Fills regions or contours with flat colors or Content-Aware Inpainting.",
        "params": {
            "fill_mode": {
                "label": "Fill Mode",
                "type": "select",
                "default": "Hole Filling (Contours)",
                "options": [
                    "Hole Filling (Contours)", "Color Replacement (Chroma Key)",
                    "Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)",
                    "Flood Fill", "Corner Background Fill"
                ]
            },
            "channel_mode": {
                "label": "Channel Mode",
                "type": "select",
                "default": "Color Channels",
                "options": ["Color Channels", "Grayscale"],
                "visible_if": {
                    "fill_mode": [
                        "Hole Filling (Contours)", "Color Replacement (Chroma Key)",
                        "Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)"
                    ]
                }
            },
            "fill_color": {
                "label": "Target Fill Color",
                "type": "color",
                "default": "#ffffff",
                "visible_if": {
                    "fill_mode": ["Hole Filling (Contours)", "Color Replacement (Chroma Key)", "Flood Fill", "Corner Background Fill"]
                }
            },
            "use_target_color": {
                "label": "Target Color Matching",
                "type": "bool",
                "default": False,
                "visible_if": {
                    "fill_mode": ["Hole Filling (Contours)"]
                }
            },
            "target_color": {
                "label": "Match Target Color",
                "type": "color",
                "default": "#000000",
                "visible_if": {
                    "fill_mode": ["Color Replacement (Chroma Key)", "Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)"]
                }
            },
            "tolerance": {
                "label": "Match Tolerance",
                "type": "int",
                "default": 30,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {
                    "fill_mode": ["Color Replacement (Chroma Key)", "Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)"]
                }
            },
            "min_area": {
                "label": "Min Contour Area",
                "type": "float",
                "default": 100.0,
                "min": 0.0,
                "max": 1000000.0,
                "step": 100.0,
                "visible_if": {
                    "fill_mode": ["Hole Filling (Contours)"]
                }
            },
            "max_area": {
                "label": "Max Contour Area",
                "type": "float",
                "default": 1000000.0,
                "min": 0.0,
                "max": 100000000.0,
                "step": 1000.0,
                "visible_if": {
                    "fill_mode": ["Hole Filling (Contours)"]
                }
            },
            "inpaint_radius": {
                "label": "Inpaint Radius",
                "type": "int",
                "default": 3,
                "min": 1,
                "max": 100,
                "step": 1,
                "visible_if": {
                    "fill_mode": ["Content-Aware Inpainting (NS)", "Content-Aware Inpainting (Telea)"]
                }
            },
            "seed_x": {
                "label": "Seed X (%)",
                "type": "float",
                "default": 50.0,
                "min": 0.0,
                "max": 100.0,
                "step": 1.0,
                "visible_if": {
                    "fill_mode": ["Flood Fill"]
                }
            },
            "seed_y": {
                "label": "Seed Y (%)",
                "type": "float",
                "default": 50.0,
                "min": 0.0,
                "max": 100.0,
                "step": 1.0,
                "visible_if": {
                    "fill_mode": ["Flood Fill"]
                }
            },
            "lo_diff": {
                "label": "Flood Tolerance Low",
                "type": "int",
                "default": 20,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {
                    "fill_mode": ["Flood Fill", "Corner Background Fill"]
                }
            },
            "up_diff": {
                "label": "Flood Tolerance High",
                "type": "int",
                "default": 20,
                "min": 0,
                "max": 255,
                "step": 1,
                "visible_if": {
                    "fill_mode": ["Flood Fill", "Corner Background Fill"]
                }
            }
        }
    },
    "blend": {
        "name": "Blend Images",
        "description": "Blends two images together using a specified blending mode and opacity.",
        "params": {
            "blend_source": {
                "label": "Blend Source (Foreground)",
                "type": "step_id_reference",
                "default": "previous"
            },
            "blend_mode": {
                "label": "Blend Mode",
                "type": "select",
                "default": "normal",
                "options": ["normal", "add", "subtract", "multiply", "screen", "difference", "darken", "lighten"]
            },
            "opacity": {
                "label": "Blend Opacity",
                "type": "int",
                "default": 100,
                "min": 0,
                "max": 100,
                "step": 5
            },
            "blend_interpolation": {
                "label": "Blend Interpolation",
                "type": "select",
                "default": "Bicubic (Sharp)",
                "options": ["Bilinear (Fast)", "Bicubic (Sharp)", "Lanczos (Ultra Sharp)", "Nearest Neighbor"]
            }
        }
    }
}

def validate_step_params(step_type, params):
    """
    Validates parameter type, options, ranges, and constraints based on OPERATIONS_SCHEMA.
    """
    if step_type not in OPERATIONS_SCHEMA:
        raise KeyError(f"Registry Mapping Miss: Operation type '{step_type}' is unknown.")
        
    schema = OPERATIONS_SCHEMA[step_type]
    schema_params = schema.get("params", {})
    
    for param_name, param_def in schema_params.items():
        # Check visibility
        visible = True
        visible_if = param_def.get("visible_if")
        if visible_if:
            for dep_name, allowed_values in visible_if.items():
                dep_val = params.get(dep_name)
                if dep_name not in params and dep_name in schema_params:
                    dep_val = schema_params[dep_name].get("default")
                if dep_val not in allowed_values:
                    visible = False
                    break
        
        if not visible:
            # Overwrite hidden parameter with its schema-defined default value
            params[param_name] = param_def.get("default")
            continue
            
        # Check if parameter is missing (assign default if optional, or fail if missing)
        if param_name not in params:
            # We assign default value if not provided
            params[param_name] = param_def.get("default")
            continue
            
        val = params[param_name]
        p_type = param_def.get("type")
        label = param_def.get("label", param_name)
        
        # Strict exact type checking
        if p_type == "int":
            if type(val) is not int:
                # Flask JSON sometimes decodes numbers as floats. If it's a float that is mathematically an integer,
                # we fail it or verify it strictly. Let's do exact check as rules request:
                raise TypeError(f"Strict Type Violation: Parameter '{label}' must be exactly int. Got {type(val).__name__} ({val})")
        elif p_type == "float":
            if type(val) not in (int, float):
                raise TypeError(f"Strict Type Violation: Parameter '{label}' must be int or float. Got {type(val).__name__}")
        elif p_type == "bool":
            if type(val) is not bool:
                raise TypeError(f"Strict Type Violation: Parameter '{label}' must be exactly bool. Got {type(val).__name__}")
        elif p_type == "color":
            if type(val) is not str:
                raise TypeError(f"Strict Type Violation: Parameter '{label}' must be exactly string. Got {type(val).__name__}")
            if not val.startswith('#') or len(val) != 7:
                raise ValueError(f"Constraint Violation: Parameter '{label}' must be a Hex color string like '#ffffff'. Got '{val}'")
            try:
                int(val[1:], 16)
            except Exception:
                raise ValueError(f"Constraint Violation: Parameter '{label}' has invalid Hex formatting. Got '{val}'")
        elif p_type == "select":
            options = param_def.get("options", [])
            # Coerce value if options are numbers
            if options and all(isinstance(opt, int) for opt in options):
                try:
                    val = int(val)
                    params[param_name] = val
                except (ValueError, TypeError):
                    pass
            elif options and all(isinstance(opt, (int, float)) for opt in options):
                try:
                    val = float(val)
                    params[param_name] = val
                except (ValueError, TypeError):
                    pass
            if val not in options:
                raise ValueError(f"Value Violation: Parameter '{label}' must be one of {options}. Got '{val}'")
        elif p_type == "step_id_reference":
            if type(val) is not str:
                raise TypeError(f"Strict Type Violation: Parameter '{label}' must be exactly string. Got {type(val).__name__}")

        # Range verification
        if p_type in ("int", "float"):
            min_val = param_def.get("min")
            max_val = param_def.get("max")
            if min_val is not None and val < min_val:
                raise ValueError(f"Out of Bounds: Parameter '{label}' must be >= {min_val}. Got {val}")
            if max_val is not None and val > max_val:
                raise ValueError(f"Out of Bounds: Parameter '{label}' must be <= {max_val}. Got {val}")
                
        # Odd positive constraints
        if param_def.get("odd_only", False):
            if type(val) is not int or val < 1 or val % 2 == 0:
                raise ValueError(f"Constraint Violation: Parameter '{label}' must be a positive odd integer >= 1. Got {val}")

def verify_pipeline_dag(pipeline):
    """
    Validates topological step references and checks for cyclic or forward step input dependencies.
    """
    if type(pipeline) is not list:
        raise TypeError(f"Pipeline must be a list. Got {type(pipeline).__name__}")
        
    defined_ids = set()
    for idx, step in enumerate(pipeline):
        if type(step) is not dict:
            raise TypeError(f"Pipeline step must be a dict. Got {type(step).__name__}")
            
        step_id = step.get('id')
        if not step_id or not isinstance(step_id, str):
            raise ValueError(f"Step at index {idx} must have a valid string 'id'.")
        if step_id in defined_ids:
            raise ValueError(f"Duplicate step ID '{step_id}' found in pipeline.")
        if step_id == "original":
            raise ValueError("Step ID cannot be 'original' (reserved keyword).")
            
        step_type = step.get('type')
        if not step_type or not isinstance(step_type, str):
            raise ValueError(f"Step '{step_id}' must have a valid string 'type'.")
            
        # Verify input sources
        for input_key in ['input_source', 'blend_source']:
            if input_key in step:
                src = step[input_key]
                if src not in defined_ids and src != "original":
                    if src == "previous":
                        if idx == 0:
                            raise ValueError(f"Step '{step_id}' uses 'previous' input source but is the first step in the pipeline.")
                    else:
                        raise ValueError(f"Step '{step_id}' refers to input source '{src}' which does not exist or is a forward-reference/cycle.")
                        
        defined_ids.add(step_id)
