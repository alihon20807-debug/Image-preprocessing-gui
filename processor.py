import cv2
import numpy as np
import sys

# ----------------- Core Assert Helpers & Validations -----------------

def check_type(val, expected_type, name):
    if type(val) is not expected_type:
        raise TypeError(f"Strict Type Violation: '{name}' must be exactly {expected_type.__name__}. Got {type(val).__name__}")

def check_one_of(val, allowed_set, name):
    if val not in allowed_set:
        raise ValueError(f"Value Violation: '{name}' must be one of {allowed_set}. Got '{val}'")

def check_range(val, min_val, max_val, name):
    if val < min_val or val > max_val:
        raise ValueError(f"Out of Bounds: '{name}' must be in range [{min_val}, {max_val}]. Got {val}")

def check_odd_positive(val, name, min_val=1):
    check_type(val, int, name)
    if val < min_val or val % 2 == 0:
        raise ValueError(f"Constraint Violation: '{name}' must be a positive odd integer >= {min_val}. Got {val}")

def verify_step_base(step):
    if type(step) is not dict:
        raise TypeError(f"Pipeline step must be a dict. Got {type(step).__name__}")
    
    # Check id
    if 'id' not in step:
        raise KeyError("Missing mandatory structural key: 'id'")
    check_type(step['id'], str, 'id')
    
    # Check type
    if 'type' not in step:
        raise KeyError("Missing mandatory structural key: 'type'")
    check_type(step['type'], str, 'type')
    
    # Check disabled (optional, but if present must be bool)
    if 'disabled' in step:
        check_type(step['disabled'], bool, 'disabled')
        
    # Check strength (optional, but if present must be float/int between 0 and 100)
    if 'strength' in step:
        if type(step['strength']) not in (int, float):
            raise TypeError(f"Strict Type Violation: step['strength'] must be exactly int or float. Got {type(step['strength']).__name__}")
        if not (0.0 <= float(step['strength']) <= 100.0):
            raise ValueError(f"Out of Bounds: 'strength' must be in range [0.0, 100.0]. Got {step['strength']}")

# ----------------- OpenCV Modular Processing Functions -----------------

def apply_grayscale(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    if len(img.shape) > 2:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img

def apply_invert(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    channel_mode = step.get('channel_mode', 'Color Channels')
    check_one_of(channel_mode, {'Color Channels', 'Grayscale'}, 'channel_mode')
    
    if channel_mode == 'Grayscale' and len(img.shape) > 2:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    return cv2.bitwise_not(img)


def apply_contrast(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'contrast' not in step:
        raise KeyError("Missing required parameter 'contrast'")
    if type(step['contrast']) not in (int, float):
        raise TypeError(f"Strict Type Violation: 'contrast' must be int or float. Got {type(step['contrast']).__name__}")
    contrast = float(step['contrast'])
    
    if 'brightness' not in step:
        raise KeyError("Missing required parameter 'brightness'")
    check_type(step['brightness'], int, 'brightness')
    brightness = step['brightness']
    
    return cv2.convertScaleAbs(img, alpha=contrast, beta=brightness)

def apply_blur(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'blur_type' not in step:
        raise KeyError("Missing required parameter 'blur_type'")
    check_type(step['blur_type'], str, 'blur_type')
    blur_type = step['blur_type']
    check_one_of(blur_type, {'Gaussian Blur', 'Median Blur', 'Bilateral Filter', 'Box Blur'}, 'blur_type')
    
    if blur_type == 'Gaussian Blur':
        if 'kernel_x' not in step: raise KeyError("Missing 'kernel_x' for Gaussian Blur")
        if 'kernel_y' not in step: raise KeyError("Missing 'kernel_y' for Gaussian Blur")
        if 'sigma_x' not in step: raise KeyError("Missing 'sigma_x' for Gaussian Blur")
        if 'sigma_y' not in step: raise KeyError("Missing 'sigma_y' for Gaussian Blur")
        
        check_odd_positive(step['kernel_x'], 'kernel_x')
        check_odd_positive(step['kernel_y'], 'kernel_y')
        if type(step['sigma_x']) not in (int, float):
            raise TypeError(f"sigma_x must be int or float. Got {type(step['sigma_x']).__name__}")
        if type(step['sigma_y']) not in (int, float):
            raise TypeError(f"sigma_y must be int or float. Got {type(step['sigma_y']).__name__}")
            
        kx = step['kernel_x']
        ky = step['kernel_y']
        sx = float(step['sigma_x'])
        sy = float(step['sigma_y'])
        
        if sx < 0.0 or sy < 0.0:
            raise ValueError(f"sigma_x and sigma_y must be non-negative. Got sx={sx}, sy={sy}")
            
        return cv2.GaussianBlur(img, (kx, ky), sigmaX=sx, sigmaY=sy)
        
    elif blur_type == 'Median Blur':
        if 'kernel' not in step: raise KeyError("Missing 'kernel' for Median Blur")
        check_odd_positive(step['kernel'], 'kernel', min_val=3)
        kernel = step['kernel']
        
        return cv2.medianBlur(img, kernel)
        
    elif blur_type == 'Bilateral Filter':
        if 'diameter' not in step: raise KeyError("Missing 'diameter' for Bilateral Filter")
        if 'sigma_color' not in step: raise KeyError("Missing 'sigma_color' for Bilateral Filter")
        if 'sigma_space' not in step: raise KeyError("Missing 'sigma_space' for Bilateral Filter")
        
        check_type(step['diameter'], int, 'diameter')
        if step['diameter'] <= 0:
            raise ValueError(f"diameter must be a positive integer. Got {step['diameter']}")
            
        if type(step['sigma_color']) not in (int, float):
            raise TypeError(f"sigma_color must be int or float. Got {type(step['sigma_color']).__name__}")
        if type(step['sigma_space']) not in (int, float):
            raise TypeError(f"sigma_space must be int or float. Got {type(step['sigma_space']).__name__}")
            
        diameter = step['diameter']
        sigma_color = float(step['sigma_color'])
        sigma_space = float(step['sigma_space'])
        
        if sigma_color <= 0.0 or sigma_space <= 0.0:
            raise ValueError("sigma_color and sigma_space must be > 0")
            
        return cv2.bilateralFilter(img, diameter, sigma_color, sigma_space)
        
    elif blur_type == 'Box Blur':
        if 'kernel_x' not in step: raise KeyError("Missing 'kernel_x' for Box Blur")
        if 'kernel_y' not in step: raise KeyError("Missing 'kernel_y' for Box Blur")
        
        check_type(step['kernel_x'], int, 'kernel_x')
        check_type(step['kernel_y'], int, 'kernel_y')
        
        kx = step['kernel_x']
        ky = step['kernel_y']
        
        if kx <= 0 or ky <= 0:
            raise ValueError(f"Box Blur kernels must be positive integers. Got ({kx}, {ky})")
            
        return cv2.blur(img, (kx, ky))
        
    return img

def apply_threshold_single(img, mode, val, fill_color, block_size, constant_c, sigma_x, sigma_y):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    
    check_type(mode, str, 'mode')
    check_type(val, int, 'val')
    check_range(val, 0, 255, 'val')
    check_type(fill_color, int, 'fill_color')
    check_range(fill_color, 0, 255, 'fill_color')
    check_odd_positive(block_size, 'block_size', min_val=3)
    check_type(constant_c, int, 'constant_c')
    if type(sigma_x) not in (int, float):
        raise TypeError(f"sigma_x must be int or float. Got {type(sigma_x).__name__}")
    if type(sigma_y) not in (int, float):
        raise TypeError(f"sigma_y must be int or float. Got {type(sigma_y).__name__}")
        
    sx = float(sigma_x)
    sy = float(sigma_y)
    if sx < 0.0 or sy < 0.0:
        raise ValueError("sigma_x and sigma_y must be non-negative")

    supported_modes = {
        "Binary Thresholding", "Binary Thresholding Inverted",
        "Truncate Thresholding", "Threshold to Zero", "Threshold to Zero Inverted",
        "Otsu's Thresholding", "Otsu's Thresholding Inverted",
        "Triangle Thresholding", "Triangle Thresholding Inverted",
        "Adaptive Mean", "Adaptive Mean Inverted",
        "Adaptive Gaussian", "Adaptive Gaussian Inverted",
        "Single Color Thresholding", "Single Color Thresholding Inverted"
    }
    check_one_of(mode, supported_modes, 'mode')

    if mode == "Binary Thresholding":
        _, res = cv2.threshold(img, val, fill_color, cv2.THRESH_BINARY)
    elif mode == "Binary Thresholding Inverted":
        _, res = cv2.threshold(img, val, fill_color, cv2.THRESH_BINARY_INV)
    elif mode == "Truncate Thresholding":
        _, res = cv2.threshold(img, val, fill_color, cv2.THRESH_TRUNC)
    elif mode == "Threshold to Zero":
        _, res = cv2.threshold(img, val, fill_color, cv2.THRESH_TOZERO)
    elif mode == "Threshold to Zero Inverted":
        _, res = cv2.threshold(img, val, fill_color, cv2.THRESH_TOZERO_INV)
        
    elif mode == "Otsu's Thresholding":
        otsu_val, _ = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        adjusted_val = np.clip(int(otsu_val) - constant_c, 0, 255)
        _, res = cv2.threshold(img, adjusted_val, fill_color, cv2.THRESH_BINARY)
    elif mode == "Otsu's Thresholding Inverted":
        otsu_val, _ = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        adjusted_val = np.clip(int(otsu_val) - constant_c, 0, 255)
        _, res = cv2.threshold(img, adjusted_val, fill_color, cv2.THRESH_BINARY_INV)
        
    elif mode == "Triangle Thresholding":
        tri_val, _ = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_TRIANGLE)
        adjusted_val = np.clip(int(tri_val) - constant_c, 0, 255)
        _, res = cv2.threshold(img, adjusted_val, fill_color, cv2.THRESH_BINARY)
    elif mode == "Triangle Thresholding Inverted":
        tri_val, _ = cv2.threshold(img, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_TRIANGLE)
        adjusted_val = np.clip(int(tri_val) - constant_c, 0, 255)
        _, res = cv2.threshold(img, adjusted_val, fill_color, cv2.THRESH_BINARY_INV)
        
    elif mode == "Adaptive Mean":
        res = cv2.adaptiveThreshold(img, fill_color, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY, block_size, constant_c)
    elif mode == "Adaptive Mean Inverted":
        res = cv2.adaptiveThreshold(img, fill_color, cv2.ADAPTIVE_THRESH_MEAN_C, cv2.THRESH_BINARY_INV, block_size, constant_c)
        
    elif mode == "Adaptive Gaussian":
        if sx > 0.0 or sy > 0.0:
            local_gaussian = cv2.GaussianBlur(img, (block_size, block_size), sigmaX=sx, sigmaY=sy, borderType=cv2.BORDER_REPLICATE)
            threshold_matrix = np.clip(local_gaussian.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
            res = np.where(img > threshold_matrix, fill_color, 0).astype(np.uint8)
        else:
            res = cv2.adaptiveThreshold(img, fill_color, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY, block_size, constant_c)
    elif mode == "Adaptive Gaussian Inverted":
        if sx > 0.0 or sy > 0.0:
            local_gaussian = cv2.GaussianBlur(img, (block_size, block_size), sigmaX=sx, sigmaY=sy, borderType=cv2.BORDER_REPLICATE)
            threshold_matrix = np.clip(local_gaussian.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
            res = np.where(img <= threshold_matrix, fill_color, 0).astype(np.uint8)
        else:
            res = cv2.adaptiveThreshold(img, fill_color, cv2.ADAPTIVE_THRESH_GAUSSIAN_C, cv2.THRESH_BINARY_INV, block_size, constant_c)
    else:
        res = img
    return res

def apply_threshold(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    # Check all keys
    required_keys = {'mode', 'value', 'block_size', 'constant_c', 'channel_mode', 'sigma_x', 'sigma_y', 'fill_color'}
    for k in required_keys:
        if k not in step:
            raise KeyError(f"Missing required parameter '{k}' for Thresholding")
            
    check_type(step['mode'], str, 'mode')
    check_type(step['value'], int, 'value')
    check_type(step['block_size'], int, 'block_size')
    check_type(step['constant_c'], int, 'constant_c')
    check_type(step['channel_mode'], str, 'channel_mode')
    if type(step['sigma_x']) not in (int, float):
        raise TypeError(f"sigma_x must be int or float. Got {type(step['sigma_x']).__name__}")
    if type(step['sigma_y']) not in (int, float):
        raise TypeError(f"sigma_y must be int or float. Got {type(step['sigma_y']).__name__}")
    check_type(step['fill_color'], str, 'fill_color')
    
    mode = step['mode']
    val = step['value']
    block_size = step['block_size']
    constant_c = step['constant_c']
    channel_mode = step['channel_mode']
    sigma_x = float(step['sigma_x'])
    sigma_y = float(step['sigma_y'])
    fill_color_param = step['fill_color']
    
    check_one_of(channel_mode, {'Grayscale', 'Color Channels'}, 'channel_mode')
    
    # Hex validation for fill color
    if not fill_color_param.startswith('#') or len(fill_color_param) != 7:
        raise ValueError(f"fill_color must be a Hex string starting with '#' and length 7. Got '{fill_color_param}'")
        
    try:
        hex_clean = fill_color_param.lstrip('#')
        r = int(hex_clean[0:2], 16)
        g = int(hex_clean[2:4], 16)
        b = int(hex_clean[4:6], 16)
    except Exception as hex_err:
        raise ValueError(f"Invalid Hex format in fill_color: '{fill_color_param}'. Error: {hex_err}")

    # Single Color Thresholding custom logic
    if mode in {"Single Color Thresholding", "Single Color Thresholding Inverted"}:
        if 'target_color' not in step:
            raise KeyError("Missing required parameter 'target_color' for Single Color Thresholding")
        if 'tolerance' not in step:
            raise KeyError("Missing required parameter 'tolerance' for Single Color Thresholding")
            
        check_type(step['target_color'], str, 'target_color')
        check_type(step['tolerance'], int, 'tolerance')
        check_range(step['tolerance'], 0, 255, 'tolerance')
        
        target_color_param = step['target_color']
        if not target_color_param.startswith('#') or len(target_color_param) != 7:
            raise ValueError(f"target_color must be a Hex string starting with '#' and length 7. Got '{target_color_param}'")
            
        try:
            target_hex_clean = target_color_param.lstrip('#')
            tr = int(target_hex_clean[0:2], 16)
            tg = int(target_hex_clean[2:4], 16)
            tb = int(target_hex_clean[4:6], 16)
        except Exception as hex_err:
            raise ValueError(f"Invalid Hex format in target_color: '{target_color_param}'. Error: {hex_err}")
            
        tolerance = step['tolerance']
        
        if channel_mode == 'Grayscale':
            gray_target = int(0.299 * tr + 0.587 * tg + 0.114 * tb)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
            dist = cv2.absdiff(gray_img, gray_target)
            match_mask = dist <= tolerance
            
            gray_val = int(0.299 * r + 0.587 * g + 0.114 * b)
            if mode == "Single Color Thresholding":
                res = np.where(match_mask, gray_val, 0).astype(np.uint8)
            else:
                res = np.where(match_mask, 0, gray_val).astype(np.uint8)
            return res
        else:
            # Color Channels mode
            if len(img.shape) > 2:
                # Compute 3D Euclidean distance in BGR space
                diff = img.astype(np.float32) - np.array([tb, tg, tr], dtype=np.float32)
                dist = np.sqrt(np.sum(diff ** 2, axis=2))
                match_mask = dist <= tolerance
                
                res = np.zeros_like(img)
                if mode == "Single Color Thresholding":
                    res[match_mask] = [b, g, r]
                else:
                    res[~match_mask] = [b, g, r]
                return res
            else:
                # Single-channel grayscale input image (shape is 2D)
                gray_target = int(0.299 * tr + 0.587 * tg + 0.114 * tb)
                dist = cv2.absdiff(img, gray_target)
                match_mask = dist <= tolerance
                
                gray_val = int(0.299 * r + 0.587 * g + 0.114 * b)
                if mode == "Single Color Thresholding":
                    res = np.where(match_mask, gray_val, 0).astype(np.uint8)
                else:
                    res = np.where(match_mask, 0, gray_val).astype(np.uint8)
                return res
        
    if channel_mode == 'Grayscale' and len(img.shape) > 2:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    if len(img.shape) > 2:
        channels = cv2.split(img)
        res_channels = []
        fill_color_tuple = (b, g, r)
        for i, ch in enumerate(channels):
            res_ch = apply_threshold_single(ch, mode, val, fill_color_tuple[i], block_size, constant_c, sigma_x, sigma_y)
            res_channels.append(res_ch)
        return cv2.merge(res_channels)
    else:
        gray_val = int(0.299 * r + 0.587 * g + 0.114 * b)
        return apply_threshold_single(img, mode, val, gray_val, block_size, constant_c, sigma_x, sigma_y)

def _apply_edges_single_channel(gray, step, algo):
    if algo == 'Canny':
        required_canny = {'low', 'high', 'aperture', 'l2_gradient'}
        for k in required_canny:
            if k not in step: raise KeyError(f"Missing Canny parameter '{k}'")
            
        check_type(step['low'], int, 'low')
        check_type(step['high'], int, 'high')
        check_type(step['aperture'], int, 'aperture')
        check_type(step['l2_gradient'], bool, 'l2_gradient')
        
        low = step['low']
        high = step['high']
        aperture = step['aperture']
        l2 = step['l2_gradient']
        
        check_range(low, 0, 255, 'low')
        check_range(high, 0, 255, 'high')
        check_one_of(aperture, {3, 5, 7}, 'aperture')
        
        return cv2.Canny(gray, low, high, apertureSize=aperture, L2gradient=l2)
        
    elif algo == 'Sobel':
        required_sobel = {'dx', 'dy', 'ksize', 'scale', 'delta'}
        for k in required_sobel:
            if k not in step: raise KeyError(f"Missing Sobel parameter '{k}'")
            
        check_type(step['dx'], int, 'dx')
        check_type(step['dy'], int, 'dy')
        check_type(step['ksize'], int, 'ksize')
        if type(step['scale']) not in (int, float):
            raise TypeError(f"scale must be int or float. Got {type(step['scale']).__name__}")
        if type(step['delta']) not in (int, float):
            raise TypeError(f"delta must be int or float. Got {type(step['delta']).__name__}")
            
        dx = step['dx']
        dy = step['dy']
        ksize = step['ksize']
        scale = float(step['scale'])
        delta = float(step['delta'])
        
        check_one_of(ksize, {1, 3, 5, 7}, 'ksize')
        if dx < 0 or dy < 0:
            raise ValueError(f"dx and dy must be non-negative integers. Got dx={dx}, dy={dy}")
        if dx == 0 and dy == 0:
            raise ValueError("dx and dy cannot both be zero")
            
        if ksize == 1:
            if dx > 1 or dy > 1 or (dx == 1 and dy == 1):
                raise ValueError("For Sobel with ksize=1, dx and dy must be <= 1, and not both 1.")
        else:
            if dx >= ksize or dy >= ksize:
                raise ValueError(f"For Sobel with ksize={ksize}, dx and dy must be less than ksize. Got dx={dx}, dy={dy}")
                
        sobel = cv2.Sobel(gray, cv2.CV_16S, dx, dy, ksize=ksize, scale=scale, delta=delta)
        return cv2.convertScaleAbs(sobel)
        
    elif algo == 'Scharr':
        required_scharr = {'dx', 'dy', 'scale', 'delta'}
        for k in required_scharr:
            if k not in step: raise KeyError(f"Missing Scharr parameter '{k}'")
            
        check_type(step['dx'], int, 'dx')
        check_type(step['dy'], int, 'dy')
        if type(step['scale']) not in (int, float):
            raise TypeError(f"scale must be int or float. Got {type(step['scale']).__name__}")
        if type(step['delta']) not in (int, float):
            raise TypeError(f"delta must be int or float. Got {type(step['delta']).__name__}")
            
        dx = step['dx']
        dy = step['dy']
        scale = float(step['scale'])
        delta = float(step['delta'])
        
        if not ((dx == 1 and dy == 0) or (dx == 0 and dy == 1)):
            raise ValueError(f"Scharr filter only supports dx=1 dy=0 or dx=0 dy=1. Got dx={dx}, dy={dy}")
            
        scharr = cv2.Scharr(gray, cv2.CV_16S, dx, dy, scale=scale, delta=delta)
        return cv2.convertScaleAbs(scharr)
        
    elif algo == 'Laplacian':
        required_lap = {'ksize', 'scale', 'delta'}
        for k in required_lap:
            if k not in step: raise KeyError(f"Missing Laplacian parameter '{k}'")
            
        check_type(step['ksize'], int, 'ksize')
        if type(step['scale']) not in (int, float):
            raise TypeError(f"scale must be int or float. Got {type(step['scale']).__name__}")
        if type(step['delta']) not in (int, float):
            raise TypeError(f"delta must be int or float. Got {type(step['delta']).__name__}")
            
        ksize = step['ksize']
        scale = float(step['scale'])
        delta = float(step['delta'])
        
        check_one_of(ksize, {1, 3, 5, 7}, 'ksize')
        
        laplacian = cv2.Laplacian(gray, cv2.CV_16S, ksize=ksize, scale=scale, delta=delta)
        return cv2.convertScaleAbs(laplacian)
        
    return gray

def apply_edges(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'algorithm' not in step:
        raise KeyError("Missing required parameter 'algorithm' for Edge Detection")
    check_type(step['algorithm'], str, 'algorithm')
    algo = step['algorithm']
    check_one_of(algo, {'Canny', 'Sobel', 'Scharr', 'Laplacian'}, 'algorithm')
    
    # Channel mode: 'Grayscale' (default) or 'Color Channels'
    channel_mode = step.get('channel_mode', 'Grayscale')
    check_one_of(channel_mode, {'Grayscale', 'Color Channels'}, 'channel_mode')
    
    is_color = len(img.shape) > 2
    
    if channel_mode == 'Color Channels' and is_color:
        # Split into B, G, R channels, run edge detection on each, merge back
        channels = cv2.split(img)
        edge_channels = []
        for ch in channels:
            edge_channels.append(_apply_edges_single_channel(ch, step, algo))
        return cv2.merge(edge_channels)
    else:
        # Grayscale mode: convert to gray if needed, run edge detection
        if is_color:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        return _apply_edges_single_channel(gray, step, algo)

def apply_upsample(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'scale' not in step:
        raise KeyError("Missing required parameter 'scale' for Upsample")
    if 'interpolation' not in step:
        raise KeyError("Missing required parameter 'interpolation' for Upsample")
        
    if type(step['scale']) not in (int, float):
        raise TypeError(f"scale must be int or float. Got {type(step['scale']).__name__}")
    check_type(step['interpolation'], str, 'interpolation')
    
    scale = float(step['scale'])
    interp_name = step['interpolation']
    
    if scale <= 0.0:
        raise ValueError(f"scale must be a positive float/int. Got {scale}")
        
    interp_map = {
        'Bilinear (Fast)': cv2.INTER_LINEAR,
        'Bicubic (Sharp)': cv2.INTER_CUBIC,
        'Lanczos (Ultra Sharp)': cv2.INTER_LANCZOS4,
        'Nearest Neighbor': cv2.INTER_NEAREST
    }
    check_one_of(interp_name, set(interp_map.keys()), 'interpolation')
    
    if scale == 1.0:
        return img
        
    flags = interp_map[interp_name]
    
    h, w = img.shape[:2]
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=flags)

def apply_downsample(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'scale' not in step:
        raise KeyError("Missing required parameter 'scale' for Downsample")
    if 'interpolation' not in step:
        raise KeyError("Missing required parameter 'interpolation' for Downsample")
        
    if type(step['scale']) not in (int, float):
        raise TypeError(f"scale must be int or float. Got {type(step['scale']).__name__}")
    check_type(step['interpolation'], str, 'interpolation')
    
    scale = float(step['scale'])
    interp_name = step['interpolation']
    
    if scale <= 0.0 or scale > 1.0:
        raise ValueError(f"scale must be in range (0.0, 1.0]. Got {scale}")
        
    interp_map = {
        'Bilinear (Fast)': cv2.INTER_LINEAR,
        'Bicubic (Sharp)': cv2.INTER_CUBIC,
        'Lanczos (Ultra Sharp)': cv2.INTER_LANCZOS4,
        'Nearest Neighbor': cv2.INTER_NEAREST
    }
    check_one_of(interp_name, set(interp_map.keys()), 'interpolation')
    
    if scale == 1.0:
        return img
        
    flags = interp_map[interp_name]
    
    h, w = img.shape[:2]
    new_w = int(w * scale)
    new_h = int(h * scale)
    new_w = max(1, new_w)
    new_h = max(1, new_h)
    return cv2.resize(img, (new_w, new_h), interpolation=flags)

def apply_crop(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    required_crop = {'left', 'right', 'top', 'bottom'}
    for k in required_crop:
        if k not in step: raise KeyError(f"Missing Crop parameter '{k}'")
        if type(step[k]) not in (int, float):
            raise TypeError(f"Crop parameter '{k}' must be int or float. Got {type(step[k]).__name__}")
            
    left = float(step['left'])
    right = float(step['right'])
    top = float(step['top'])
    bottom = float(step['bottom'])
    
    if not (0.0 <= left <= 100.0) or not (0.0 <= right <= 100.0) or not (0.0 <= top <= 100.0) or not (0.0 <= bottom <= 100.0):
        raise ValueError("Crop boundary percentages must be in range [0, 100]")
        
    if left + right >= 100.0:
        raise ValueError(f"Sum of left and right crop percentages must be less than 100. Got left={left}, right={right}")
    if top + bottom >= 100.0:
        raise ValueError(f"Sum of top and bottom crop percentages must be less than 100. Got top={top}, bottom={bottom}")
        
    h, w = img.shape[:2]
    
    x1 = int(w * (left / 100.0))
    x2 = int(w * (1.0 - right / 100.0))
    y1 = int(h * (top / 100.0))
    y2 = int(h * (1.0 - bottom / 100.0))
    
    if x2 - x1 <= 0 or y2 - y1 <= 0:
        raise ValueError(f"Crop box dimensions must be positive. Calculated crop region: w={x2-x1}, h={y2-y1}")
        
    return img[y1:y2, x1:x2]

def apply_heal(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'operation' not in step: 
        raise KeyError("Missing Heal parameter 'operation'")
    check_type(step['operation'], str, 'operation')
    op_name = step['operation']
    
    supported_ops = {
        'Dilate (Thicken White)', 'Erode (Thicken Black)',
        'Heal Gaps in White (Closing)', 'Heal Gaps in Black (Opening)',
        'Stroke Outlines (Gradient)', 'Extract Bright Details (Top Hat)',
        'Extract Dark Details (Black Hat)', 'Skeletonization (Thinning)'
    }
    check_one_of(op_name, supported_ops, 'operation')
    
    is_color = len(img.shape) > 2
    
    # Optional channel mode (default varies depending on operation)
    default_channel_mode = 'Grayscale' if op_name == 'Skeletonization (Thinning)' else 'Color Channels'
    channel_mode = step.get('channel_mode', default_channel_mode)
    check_one_of(channel_mode, {'Color Channels', 'Grayscale'}, 'channel_mode')
    
    # Optional Color-Targeted Stroke Healing
    use_target_color = step.get('use_target_color', False)
    check_type(use_target_color, bool, 'use_target_color')
    
    if use_target_color:
        # Validate targeted color parameters
        required_color_keys = {'target_color', 'tolerance', 'fill_color'}
        for k in required_color_keys:
            if k not in step:
                raise KeyError(f"Missing required parameter '{k}' for Color-Targeted Stroke Healing")
                
        check_type(step['target_color'], str, 'target_color')
        check_type(step['tolerance'], int, 'tolerance')
        check_range(step['tolerance'], 0, 255, 'tolerance')
        check_type(step['fill_color'], str, 'fill_color')
        
        tolerance = step['tolerance']
        
        target_color_param = step['target_color']
        fill_color_param = step['fill_color']
        bg_color_param = step.get('bg_color', '#ffffff')
        check_type(bg_color_param, str, 'bg_color')
        
        # Validate hex color strings
        for color_str, name in [(target_color_param, 'target_color'), (fill_color_param, 'fill_color'), (bg_color_param, 'bg_color')]:
            if not color_str.startswith('#') or len(color_str) != 7:
                raise ValueError(f"'{name}' must be a Hex string starting with '#' and length 7. Got '{color_str}'")
                
        try:
            target_hex = target_color_param.lstrip('#')
            tr = int(target_hex[0:2], 16)
            tg = int(target_hex[2:4], 16)
            tb = int(target_hex[4:6], 16)
            
            fill_hex = fill_color_param.lstrip('#')
            fr = int(fill_hex[0:2], 16)
            fg = int(fill_hex[2:4], 16)
            fb = int(fill_hex[4:6], 16)
            
            bg_hex = bg_color_param.lstrip('#')
            br = int(bg_hex[0:2], 16)
            bg_val = int(bg_hex[2:4], 16)
            bb = int(bg_hex[4:6], 16)
        except Exception as hex_err:
            raise ValueError(f"Invalid Hex format in color parameters. Error: {hex_err}")
            
        # Target matching logic based on channel mode
        if channel_mode == 'Grayscale' or not is_color:
            gray_target = int(0.299 * tr + 0.587 * tg + 0.114 * tb)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img
            dist = cv2.absdiff(gray_img, gray_target)
            match_mask = dist <= tolerance
        else:
            # Color Channels
            diff = img.astype(np.float32) - np.array([tb, tg, tr], dtype=np.float32)
            dist = np.sqrt(np.sum(diff ** 2, axis=2))
            match_mask = dist <= tolerance
            
        # Prepare matching mask in uint8
        mask_u8 = (match_mask.astype(np.uint8)) * 255
        
        # Apply morphology/skeletonization on the binary mask
        if op_name == 'Skeletonization (Thinning)':
            # Standard iterative thinning on the binary mask
            size = np.size(mask_u8)
            skel = np.zeros(mask_u8.shape, np.uint8)
            element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
            binary_temp = mask_u8.copy()
            done = False
            
            while not done:
                eroded = cv2.erode(binary_temp, element)
                temp = cv2.dilate(eroded, element)
                temp = cv2.subtract(binary_temp, temp)
                skel = cv2.bitwise_or(skel, temp)
                binary_temp = eroded.copy()
                
                zeros = size - cv2.countNonZero(binary_temp)
                if zeros == size:
                    done = True
            modified_mask = skel
        else:
            # Standard morphology on binary mask
            required_heal = {'shape', 'kernel_x', 'kernel_y', 'iterations'}
            for k in required_heal:
                if k not in step: raise KeyError(f"Missing Heal parameter '{k}'")
                
            check_type(step['shape'], str, 'shape')
            check_odd_positive(step['kernel_x'], 'kernel_x')
            check_odd_positive(step['kernel_y'], 'kernel_y')
            check_type(step['iterations'], int, 'iterations')
            check_range(step['iterations'], 1, 100, 'iterations')
            
            shape_name = step['shape']
            kernel_x = step['kernel_x']
            kernel_y = step['kernel_y']
            iterations = step['iterations']
            
            check_one_of(shape_name, {'Rectangle', 'Ellipse', 'Cross'}, 'shape')
                
            shape_map = {
                'Rectangle': cv2.MORPH_RECT,
                'Ellipse': cv2.MORPH_ELLIPSE,
                'Cross': cv2.MORPH_CROSS
            }
            shape = shape_map[shape_name]
            element = cv2.getStructuringElement(shape, (kernel_x, kernel_y))
            
            if op_name == 'Dilate (Thicken White)':
                modified_mask = cv2.dilate(mask_u8, element, iterations=iterations)
            elif op_name == 'Erode (Thicken Black)':
                modified_mask = cv2.erode(mask_u8, element, iterations=iterations)
            elif op_name == 'Heal Gaps in White (Closing)':
                modified_mask = cv2.morphologyEx(mask_u8, cv2.MORPH_CLOSE, element, iterations=iterations)
            elif op_name == 'Heal Gaps in Black (Opening)':
                modified_mask = cv2.morphologyEx(mask_u8, cv2.MORPH_OPEN, element, iterations=iterations)
            elif op_name == 'Stroke Outlines (Gradient)':
                modified_mask = cv2.morphologyEx(mask_u8, cv2.MORPH_GRADIENT, element, iterations=iterations)
            elif op_name == 'Extract Bright Details (Top Hat)':
                modified_mask = cv2.morphologyEx(mask_u8, cv2.MORPH_TOPHAT, element, iterations=iterations)
            elif op_name == 'Extract Dark Details (Black Hat)':
                modified_mask = cv2.morphologyEx(mask_u8, cv2.MORPH_BLACKHAT, element, iterations=iterations)
            else:
                modified_mask = mask_u8
                
        # Remap output colors onto original image BGR space or grayscale space
        res = img.copy()
        if is_color:
            stroke_color = np.array([fb, fg, fr], dtype=np.uint8)
            erase_color = np.array([bb, bg_val, br], dtype=np.uint8)
        else:
            stroke_color = int(0.299 * fr + 0.587 * fg + 0.114 * fb)
            erase_color = int(0.299 * br + 0.587 * bg_val + 0.114 * bb)
        
        # Erase shrunk pixels
        erased_pixels = (mask_u8 == 255) & (modified_mask == 0)
        res[erased_pixels] = erase_color
        
        # Draw modified stroke pixels
        res[modified_mask == 255] = stroke_color
        
        return res

    # Otherwise, standard legacy non-color-targeted operations
    if channel_mode == 'Grayscale' and is_color:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        is_color = False

    if op_name == 'Skeletonization (Thinning)':
        if 'skel_threshold' not in step: raise KeyError("Missing Skeletonization parameter 'skel_threshold'")
        if 'foreground_mode' not in step: raise KeyError("Missing Skeletonization parameter 'foreground_mode'")
        
        check_type(step['skel_threshold'], int, 'skel_threshold')
        check_type(step['foreground_mode'], str, 'foreground_mode')
        
        skel_threshold = step['skel_threshold']
        foreground_mode = step['foreground_mode']
        
        check_range(skel_threshold, 0, 255, 'skel_threshold')
        check_one_of(foreground_mode, {
            'Black strokes (Light background)', 
            'White strokes (Dark background)'
        }, 'foreground_mode')
        
        if channel_mode == 'Color Channels' and len(img.shape) > 2:
            channels = cv2.split(img)
            skel_channels = []
            for ch in channels:
                _, binary = cv2.threshold(ch, skel_threshold, 255, cv2.THRESH_BINARY)
                if foreground_mode == 'Black strokes (Light background)':
                    binary = cv2.bitwise_not(binary)
                    
                size = np.size(binary)
                skel_ch = np.zeros(binary.shape, np.uint8)
                element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
                done = False
                
                while not done:
                    eroded = cv2.erode(binary, element)
                    temp = cv2.dilate(eroded, element)
                    temp = cv2.subtract(binary, temp)
                    skel_ch = cv2.bitwise_or(skel_ch, temp)
                    binary = eroded.copy()
                    
                    zeros = size - cv2.countNonZero(binary)
                    if zeros == size:
                        done = True
                        
                if foreground_mode == 'Black strokes (Light background)':
                    skel_ch = cv2.bitwise_not(skel_ch)
                skel_channels.append(skel_ch)
            return cv2.merge(skel_channels)
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img.copy()
            _, binary = cv2.threshold(gray, skel_threshold, 255, cv2.THRESH_BINARY)
            
            if foreground_mode == 'Black strokes (Light background)':
                binary = cv2.bitwise_not(binary)
                
            size = np.size(binary)
            skel = np.zeros(binary.shape, np.uint8)
            element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
            done = False
            
            while not done:
                eroded = cv2.erode(binary, element)
                temp = cv2.dilate(eroded, element)
                temp = cv2.subtract(binary, temp)
                skel = cv2.bitwise_or(skel, temp)
                binary = eroded.copy()
                
                zeros = size - cv2.countNonZero(binary)
                if zeros == size:
                    done = True
                    
            if foreground_mode == 'Black strokes (Light background)':
                skel = cv2.bitwise_not(skel)
                
            return skel
        
    else:
        required_heal = {'shape', 'kernel_x', 'kernel_y', 'iterations'}
        for k in required_heal:
            if k not in step: raise KeyError(f"Missing Heal parameter '{k}'")
            
        check_type(step['shape'], str, 'shape')
        check_odd_positive(step['kernel_x'], 'kernel_x')
        check_odd_positive(step['kernel_y'], 'kernel_y')
        check_type(step['iterations'], int, 'iterations')
        check_range(step['iterations'], 1, 100, 'iterations')
        
        shape_name = step['shape']
        kernel_x = step['kernel_x']
        kernel_y = step['kernel_y']
        iterations = step['iterations']
        
        check_one_of(shape_name, {'Rectangle', 'Ellipse', 'Cross'}, 'shape')
            
        shape_map = {
            'Rectangle': cv2.MORPH_RECT,
            'Ellipse': cv2.MORPH_ELLIPSE,
            'Cross': cv2.MORPH_CROSS
        }
        shape = shape_map[shape_name]
        element = cv2.getStructuringElement(shape, (kernel_x, kernel_y))
        
        if op_name == 'Dilate (Thicken White)':
            return cv2.dilate(img, element, iterations=iterations)
        elif op_name == 'Erode (Thicken Black)':
            return cv2.erode(img, element, iterations=iterations)
        elif op_name == 'Heal Gaps in White (Closing)':
            return cv2.morphologyEx(img, cv2.MORPH_CLOSE, element, iterations=iterations)
        elif op_name == 'Heal Gaps in Black (Opening)':
            return cv2.morphologyEx(img, cv2.MORPH_OPEN, element, iterations=iterations)
        elif op_name == 'Stroke Outlines (Gradient)':
            return cv2.morphologyEx(img, cv2.MORPH_GRADIENT, element, iterations=iterations)
        elif op_name == 'Extract Bright Details (Top Hat)':
            return cv2.morphologyEx(img, cv2.MORPH_TOPHAT, element, iterations=iterations)
        elif op_name == 'Extract Dark Details (Black Hat)':
            return cv2.morphologyEx(img, cv2.MORPH_BLACKHAT, element, iterations=iterations)
            
        return img

def apply_fill(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    if 'fill_mode' not in step: 
        raise KeyError("Missing required parameter 'fill_mode'")
    check_type(step['fill_mode'], str, 'fill_mode')
    mode = step['fill_mode']
    
    supported_modes = {
        'Hole Filling (Contours)', 
        'Color Replacement (Chroma Key)', 
        'Content-Aware Inpainting (NS)', 
        'Content-Aware Inpainting (Telea)', 
        'Flood Fill', 
        'Corner Background Fill'
    }
    check_one_of(mode, supported_modes, 'fill_mode')
    
    is_color = len(img.shape) > 2
    channels = img.shape[2] if is_color else 1
    
    # Backward compatibility: mapping old grayscale 'color' key to 'fill_color' Hex format
    requires_fill_color = mode not in {'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}
    if requires_fill_color:
        if 'fill_color' not in step and 'color' in step:
            check_type(step['color'], int, 'color')
            c = step['color']
            check_range(c, 0, 255, 'color')
            step['fill_color'] = f"#{c:02x}{c:02x}{c:02x}"
            
        if 'fill_color' not in step:
            raise KeyError(f"Missing required parameter 'fill_color' for {mode}")
            
        check_type(step['fill_color'], str, 'fill_color')
        fill_color_param = step['fill_color']
        
        # Hex validation for fill color
        if not fill_color_param.startswith('#') or len(fill_color_param) != 7:
            raise ValueError(f"fill_color must be a Hex string starting with '#' and length 7. Got '{fill_color_param}'")
            
        try:
            hex_clean = fill_color_param.lstrip('#')
            fr = int(hex_clean[0:2], 16)
            fg = int(hex_clean[2:4], 16)
            fb = int(hex_clean[4:6], 16)
        except Exception as hex_err:
            raise ValueError(f"Invalid Hex format in fill_color: '{fill_color_param}'. Error: {hex_err}")
            
        color_val = (fb, fg, fr) if is_color else int(0.299 * fr + 0.587 * fg + 0.114 * fb)
        
    # Check if target color matching should be performed
    use_target_color = False
    if mode in {'Color Replacement (Chroma Key)', 'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}:
        use_target_color = True
    elif mode == 'Hole Filling (Contours)' and step.get('use_target_color', False) is True:
        use_target_color = True
        
    if use_target_color:
        if 'target_color' not in step:
            raise KeyError(f"Missing required parameter 'target_color' for {mode}")
        if 'tolerance' not in step:
            raise KeyError(f"Missing required parameter 'tolerance' for {mode}")
            
        check_type(step['target_color'], str, 'target_color')
        check_type(step['tolerance'], int, 'tolerance')
        check_range(step['tolerance'], 0, 255, 'tolerance')
        
        target_color_param = step['target_color']
        if not target_color_param.startswith('#') or len(target_color_param) != 7:
            raise ValueError(f"target_color must be a Hex string starting with '#' and length 7. Got '{target_color_param}'")
            
        try:
            target_hex_clean = target_color_param.lstrip('#')
            tr = int(target_hex_clean[0:2], 16)
            tg = int(target_hex_clean[2:4], 16)
            tb = int(target_hex_clean[4:6], 16)
        except Exception as hex_err:
            raise ValueError(f"Invalid Hex format in target_color: '{target_color_param}'. Error: {hex_err}")
            
        tolerance = step['tolerance']
        
        channel_mode = step.get('channel_mode', 'Color Channels')
        check_one_of(channel_mode, {'Grayscale', 'Color Channels'}, 'channel_mode')
        
        # Compute matching mask
        if channel_mode == 'Grayscale' or not is_color:
            gray_target = int(0.299 * tr + 0.587 * tg + 0.114 * tb)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img
            dist = cv2.absdiff(gray_img, gray_target)
            match_mask = dist <= tolerance
        else:
            # Compute 3D Euclidean distance in BGR space
            diff = img.astype(np.float32) - np.array([tb, tg, tr], dtype=np.float32)
            dist = np.sqrt(np.sum(diff ** 2, axis=2))
            match_mask = dist <= tolerance

    # Apply specific algorithm
    if mode == 'Hole Filling (Contours)':
        if 'min_area' not in step: raise KeyError("Missing 'min_area' for Hole Filling")
        if 'max_area' not in step: raise KeyError("Missing 'max_area' for Hole Filling")
        
        if type(step['min_area']) not in (int, float):
            raise TypeError(f"min_area must be int or float. Got {type(step['min_area']).__name__}")
        if type(step['max_area']) not in (int, float):
            raise TypeError(f"max_area must be int or float. Got {type(step['max_area']).__name__}")
            
        min_area = float(step['min_area'])
        max_area = float(step['max_area'])
        
        if min_area < 0.0 or max_area < 0.0:
            raise ValueError(f"min_area and max_area must be non-negative. Got min={min_area}, max={max_area}")
        if min_area > max_area:
            raise ValueError(f"min_area must be <= max_area. Got min={min_area}, max={max_area}")
            
        if use_target_color:
            gray = match_mask.astype(np.uint8) * 255
        else:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img.copy()
            
        contours, _ = cv2.findContours(gray, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
        
        res = img.copy()
        for c in contours:
            area = cv2.contourArea(c)
            if min_area <= area <= max_area:
                cv2.drawContours(res, [c], -1, color_val, thickness=cv2.FILLED)
        return res
        
    elif mode == 'Color Replacement (Chroma Key)':
        res = img.copy()
        res[match_mask] = color_val
        return res
        
    elif mode in {'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}:
        if 'inpaint_radius' not in step:
            raise KeyError(f"Missing 'inpaint_radius' for {mode}")
        check_type(step['inpaint_radius'], int, 'inpaint_radius')
        inpaint_radius = step['inpaint_radius']
        if inpaint_radius <= 0:
            raise ValueError(f"inpaint_radius must be positive. Got {inpaint_radius}")
            
        flags = cv2.INPAINT_NS if mode == 'Content-Aware Inpainting (NS)' else cv2.INPAINT_TELEA
        mask_u8 = (match_mask.astype(np.uint8)) * 255
        
        return cv2.inpaint(img, mask_u8, inpaint_radius, flags)
        
    elif mode == 'Flood Fill':
        if 'seed_x' not in step: raise KeyError("Missing 'seed_x' for Flood Fill")
        if 'seed_y' not in step: raise KeyError("Missing 'seed_y' for Flood Fill")
        if 'lo_diff' not in step: raise KeyError("Missing 'lo_diff' for Flood Fill")
        if 'up_diff' not in step: raise KeyError("Missing 'up_diff' for Flood Fill")
        
        if type(step['seed_x']) not in (int, float):
            raise TypeError(f"seed_x must be int or float. Got {type(step['seed_x']).__name__}")
        if type(step['seed_y']) not in (int, float):
            raise TypeError(f"seed_y must be int or float. Got {type(step['seed_y']).__name__}")
        check_type(step['lo_diff'], int, 'lo_diff')
        check_type(step['up_diff'], int, 'up_diff')
        
        seed_x_pct = float(step['seed_x'])
        seed_y_pct = float(step['seed_y'])
        lo_diff = step['lo_diff']
        up_diff = step['up_diff']
        
        if not (0.0 <= seed_x_pct <= 100.0) or not (0.0 <= seed_y_pct <= 100.0):
            raise ValueError(f"Seed coordinates must be percentages in range [0, 100]. Got X={seed_x_pct}, Y={seed_y_pct}")
        if lo_diff < 0 or up_diff < 0:
            raise ValueError(f"Tolerances must be non-negative. Got lo={lo_diff}, up={up_diff}")
            
        h, w = img.shape[:2]
        seed_x = int(w * (seed_x_pct / 100.0))
        seed_y = int(h * (seed_y_pct / 100.0))
        
        if not (0 <= seed_x < w) or not (0 <= seed_y < h):
            raise ValueError(f"Calculated seed coordinates out of bounds. X={seed_x}/{w}, Y={seed_y}/{h}")
            
        res = img.copy()
        mask = np.zeros((h + 2, w + 2), np.uint8)
        
        diff_val = (lo_diff,) * channels
        up_val = (up_diff,) * channels
        
        cv2.floodFill(res, mask, (seed_x, seed_y), color_val, diff_val, up_val)
        return res
        
    elif mode == 'Corner Background Fill':
        if 'lo_diff' not in step: raise KeyError("Missing 'lo_diff' for Corner Background Fill")
        if 'up_diff' not in step: raise KeyError("Missing 'up_diff' for Corner Background Fill")
        
        check_type(step['lo_diff'], int, 'lo_diff')
        check_type(step['up_diff'], int, 'up_diff')
        
        lo_diff = step['lo_diff']
        up_diff = step['up_diff']
        
        if lo_diff < 0 or up_diff < 0:
            raise ValueError(f"Tolerances must be non-negative. Got lo={lo_diff}, up={up_diff}")
            
        h, w = img.shape[:2]
        res = img.copy()
        mask = np.zeros((h + 2, w + 2), np.uint8)
        
        corners = [(0, 0), (w - 1, 0), (0, h - 1), (w - 1, h - 1)]
        diff_tuple = (lo_diff,) * channels
        up_tuple = (up_diff,) * channels
        
        for pt in corners:
            cv2.floodFill(res, mask, pt, color_val, diff_tuple, up_tuple)
        return res
        
    return img

def apply_edges_fill(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    edges_map = apply_edges(img, step)
    
    # findContours requires single-channel input; if Color Channels mode produced a BGR edge map, convert it
    if len(edges_map.shape) > 2:
        edges_map = cv2.cvtColor(edges_map, cv2.COLOR_BGR2GRAY)
    
    required_edge_fill = {'fill_target', 'color', 'min_area', 'max_area', 'draw_style', 'thickness'}
    for k in required_edge_fill:
        if k not in step: raise KeyError(f"Missing parameter '{k}' for Edge Fill")
        
    check_type(step['fill_target'], str, 'fill_target')
    check_type(step['color'], int, 'color')
    if type(step['min_area']) not in (int, float):
        raise TypeError(f"min_area must be int or float. Got {type(step['min_area']).__name__}")
    if type(step['max_area']) not in (int, float):
        raise TypeError(f"max_area must be int or float. Got {type(step['max_area']).__name__}")
    check_type(step['draw_style'], str, 'draw_style')
    check_type(step['thickness'], int, 'thickness')
    
    fill_target = step['fill_target']
    fill_color = step['color']
    min_area = float(step['min_area'])
    max_area = float(step['max_area'])
    draw_style = step['draw_style']
    thickness = step['thickness']
    
    check_one_of(fill_target, {'Original Image', 'Binary Mask (Black background)', 'Binary Mask (White background)'}, 'fill_target')
    check_range(fill_color, 0, 255, 'color')
    if min_area < 0.0 or max_area < 0.0:
        raise ValueError(f"min_area and max_area must be non-negative. Got min={min_area}, max={max_area}")
    if min_area > max_area:
        raise ValueError(f"min_area must be <= max_area. Got min={min_area}, max={max_area}")
    check_one_of(draw_style, {'Filled Contours', 'Contour Outlines', 'Filled Bounding Boxes', 'Bounding Box Outlines'}, 'draw_style')
    if thickness <= 0:
        raise ValueError(f"thickness must be a positive integer. Got {thickness}")
        
    is_color = len(img.shape) > 2
    color_val = (fill_color, fill_color, fill_color) if is_color else fill_color
    
    if fill_target == 'Binary Mask (Black background)':
        res = np.zeros_like(img)
    elif fill_target == 'Binary Mask (White background)':
        res = np.ones_like(img) * 255
    else:
        res = img.copy()
        
    contours, _ = cv2.findContours(edges_map, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    for c in contours:
        area = cv2.contourArea(c)
        if min_area <= area <= max_area:
            if draw_style == 'Filled Contours':
                cv2.drawContours(res, [c], -1, color_val, thickness=cv2.FILLED)
            elif draw_style == 'Contour Outlines':
                cv2.drawContours(res, [c], -1, color_val, thickness=thickness)
            elif draw_style == 'Filled Bounding Boxes':
                x, y, w, h = cv2.boundingRect(c)
                cv2.rectangle(res, (x, y), (x + w, y + h), color_val, thickness=cv2.FILLED)
            elif draw_style == 'Bounding Box Outlines':
                x, y, w, h = cv2.boundingRect(c)
                cv2.rectangle(res, (x, y), (x + w, y + h), color_val, thickness=thickness)
            
    return res

def apply_above_to_white(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    
    required_above_keys = {'algorithm', 'value', 'block_size_x', 'block_size_y', 'constant_c', 'channel_mode', 'condition', 'value_max', 'sigma_x', 'sigma_y', 'fill_color'}
    for k in required_above_keys:
        if k not in step: raise KeyError(f"Missing required parameter '{k}' for Above to White")
        
    check_type(step['algorithm'], str, 'algorithm')
    check_type(step['value'], int, 'value')
    check_type(step['block_size_x'], int, 'block_size_x')
    check_type(step['block_size_y'], int, 'block_size_y')
    check_type(step['constant_c'], int, 'constant_c')
    check_type(step['channel_mode'], str, 'channel_mode')
    check_type(step['condition'], str, 'condition')
    check_type(step['value_max'], int, 'value_max')
    if type(step['sigma_x']) not in (int, float):
        raise TypeError(f"sigma_x must be int or float. Got {type(step['sigma_x']).__name__}")
    if type(step['sigma_y']) not in (int, float):
        raise TypeError(f"sigma_y must be int or float. Got {type(step['sigma_y']).__name__}")
    check_type(step['fill_color'], str, 'fill_color')
    
    algo = step['algorithm']
    val = step['value']
    block_size_x = step['block_size_x']
    block_size_y = step['block_size_y']
    constant_c = step['constant_c']
    channel_mode = step['channel_mode']
    condition = step['condition']
    val_max = step['value_max']
    sigma_x = float(step['sigma_x'])
    sigma_y = float(step['sigma_y'])
    fill_color_param = step['fill_color']
    
    check_one_of(algo, {'Global', "Otsu's", 'Triangle', 'Adaptive Mean', 'Adaptive Gaussian'}, 'algorithm')
    check_range(val, 0, 255, 'value')
    check_range(val_max, 0, 255, 'value_max')
    check_one_of(channel_mode, {'Grayscale', 'Color Channels'}, 'channel_mode')
    check_one_of(condition, {
        'Above or Equal (>=)', 'Above (>)', 'Below (<)', 'Below or Equal (<=)',
        'Inside Range [Min, Max]', 'Outside Range'
    }, 'condition')
    
    if not fill_color_param.startswith('#') or len(fill_color_param) != 7:
        raise ValueError(f"fill_color must be a Hex string starting with '#' and length 7. Got '{fill_color_param}'")
        
    try:
        hex_clean = fill_color_param.lstrip('#')
        r = int(hex_clean[0:2], 16)
        g = int(hex_clean[2:4], 16)
        b = int(hex_clean[4:6], 16)
    except Exception as hex_err:
        raise ValueError(f"Invalid Hex format in fill_color: '{fill_color_param}'. Error: {hex_err}")
        
    if channel_mode == 'Grayscale' and len(img.shape) > 2:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        
    if len(img.shape) == 2:
        fill_color = int(0.299 * r + 0.587 * g + 0.114 * b)
    else:
        fill_color = np.array([b, g, r], dtype=np.uint8)
        
    def apply_thresh_condition(source, threshold):
        if condition == 'Below (<)':
            return np.where(source < threshold, fill_color, source)
        elif condition == 'Below or Equal (<=)':
            return np.where(source <= threshold, fill_color, source)
        elif condition == 'Above (>)':
            return np.where(source > threshold, fill_color, source)
        elif condition == 'Inside Range [Min, Max]':
            if val > val_max:
                raise ValueError(f"Min value of range ({val}) cannot be greater than Max value ({val_max})")
            return np.where((source >= threshold) & (source <= val_max), fill_color, source)
        elif condition == 'Outside Range':
            if val > val_max:
                raise ValueError(f"Min value of range ({val}) cannot be greater than Max value ({val_max})")
            return np.where((source < threshold) | (source > val_max), fill_color, source)
        else:
            return np.where(source >= threshold, fill_color, source)
            
    if algo == 'Global':
        res = apply_thresh_condition(img, val)
        
    elif algo == "Otsu's":
        gray_temp = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
        otsu_val, _ = cv2.threshold(gray_temp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_OTSU)
        adjusted_val = np.clip(int(otsu_val) - constant_c, 0, 255)
        res = apply_thresh_condition(img, adjusted_val)
        
    elif algo == 'Triangle':
        gray_temp = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
        tri_val, _ = cv2.threshold(gray_temp, 0, 255, cv2.THRESH_BINARY + cv2.THRESH_TRIANGLE)
        adjusted_val = np.clip(int(tri_val) - constant_c, 0, 255)
        res = apply_thresh_condition(img, adjusted_val)
        
    elif algo == 'Adaptive Mean':
        check_odd_positive(block_size_x, 'block_size_x', min_val=3)
        check_odd_positive(block_size_y, 'block_size_y', min_val=3)
        local_mean = cv2.boxFilter(img, -1, (block_size_x, block_size_y), borderType=cv2.BORDER_REPLICATE)
        threshold_matrix = np.clip(local_mean.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
        res = apply_thresh_condition(img, threshold_matrix)
        
    elif algo == 'Adaptive Gaussian':
        check_odd_positive(block_size_x, 'block_size_x', min_val=3)
        check_odd_positive(block_size_y, 'block_size_y', min_val=3)
        if sigma_x < 0.0 or sigma_y < 0.0:
            raise ValueError("sigma_x and sigma_y must be non-negative")
        local_gaussian = cv2.GaussianBlur(img, (block_size_x, block_size_y), sigmaX=sigma_x, sigmaY=sigma_y, borderType=cv2.BORDER_REPLICATE)
        threshold_matrix = np.clip(local_gaussian.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
        res = apply_thresh_condition(img, threshold_matrix)
        
    else:
        res = img
        
    return res

# Registry Mapping
PROCESSING_REGISTRY = {
    'grayscale': apply_grayscale,
    'contrast': apply_contrast,
    'blur': apply_blur,
    'threshold': apply_threshold,
    'edges': apply_edges,
    'edges_fill': apply_edges_fill,
    'upsample': apply_upsample,
    'crop': apply_crop,
    'heal': apply_heal,
    'fill': apply_fill,
    'above_to_white': apply_above_to_white,
    'invert': apply_invert,
    'downsample': apply_downsample
}

# ----------------- Layer Validation & Blending Helpers -----------------

def verify_layer_base(layer):
    if type(layer) is not dict:
        raise TypeError(f"Layer must be a dict. Got {type(layer).__name__}")
    
    required_keys = {'id', 'name', 'input_source', 'blend_mode', 'blend_target', 'opacity', 'steps'}
    for k in required_keys:
        if k not in layer:
            raise KeyError(f"Missing mandatory layer structural key: '{k}'")
            
    check_type(layer['id'], str, 'layer.id')
    check_type(layer['name'], str, 'layer.name')
    check_type(layer['input_source'], str, 'layer.input_source')
    check_type(layer['blend_mode'], str, 'layer.blend_mode')
    check_type(layer['blend_target'], str, 'layer.blend_target')
    
    if type(layer['opacity']) not in (int, float):
        raise TypeError(f"Layer opacity must be int or float. Got {type(layer['opacity']).__name__}")
    check_range(float(layer['opacity']), 0.0, 100.0, 'layer.opacity')
    
    if 'disabled' in layer:
        check_type(layer['disabled'], bool, 'layer.disabled')
        
    if 'blend_interpolation' in layer:
        check_type(layer['blend_interpolation'], str, 'layer.blend_interpolation')
        
    if type(layer['steps']) is not list:
        raise TypeError(f"Layer steps must be a list. Got {type(layer['steps']).__name__}")
        
    supported_blend_modes = {'normal', 'add', 'subtract', 'multiply', 'screen', 'difference', 'darken', 'lighten'}
    check_one_of(layer['blend_mode'], supported_blend_modes, 'layer.blend_mode')

def blend_images(target_img, src_img, blend_mode, opacity, blend_interp='Bicubic (Sharp)'):
    if not isinstance(target_img, np.ndarray):
        raise TypeError(f"target_img must be a numpy.ndarray. Got {type(target_img).__name__}")
    if not isinstance(src_img, np.ndarray):
        raise TypeError(f"src_img must be a numpy.ndarray. Got {type(src_img).__name__}")
        
    supported_interps = {'Bilinear (Fast)', 'Bicubic (Sharp)', 'Lanczos (Ultra Sharp)', 'Nearest Neighbor'}
    check_one_of(blend_interp, supported_interps, 'blend_interpolation')
    
    interp_map = {
        'Bilinear (Fast)': cv2.INTER_LINEAR,
        'Bicubic (Sharp)': cv2.INTER_CUBIC,
        'Lanczos (Ultra Sharp)': cv2.INTER_LANCZOS4,
        'Nearest Neighbor': cv2.INTER_NEAREST
    }
    flags = interp_map[blend_interp]
    
    # 1. Unify spatial dimensions by scaling the smaller image to the larger image's size (preserving details)
    h_src, w_src = src_img.shape[:2]
    h_tgt, w_tgt = target_img.shape[:2]
    if (w_src, h_src) != (w_tgt, h_tgt):
        if w_src * h_src > w_tgt * h_tgt:
            target_img = cv2.resize(target_img, (w_src, h_src), interpolation=flags)
        else:
            src_img = cv2.resize(src_img, (w_tgt, h_tgt), interpolation=flags)
    
    # 2. Unify channel depths
    if len(src_img.shape) == 2 and len(target_img.shape) == 3:
        src_img = cv2.cvtColor(src_img, cv2.COLOR_GRAY2BGR)
    elif len(src_img.shape) == 3 and len(target_img.shape) == 2:
        src_img = cv2.cvtColor(src_img, cv2.COLOR_BGR2GRAY)
        
    # 3. Perform blend operation
    if blend_mode == 'normal':
        blended = src_img
    elif blend_mode == 'add':
        blended = cv2.add(target_img, src_img)
    elif blend_mode == 'subtract':
        blended = cv2.subtract(target_img, src_img)
    elif blend_mode == 'multiply':
        blended = cv2.multiply(target_img, src_img, scale=1.0/255.0)
    elif blend_mode == 'screen':
        blended = 255 - cv2.multiply(255 - target_img, 255 - src_img, scale=1.0/255.0)
    elif blend_mode == 'difference':
        blended = cv2.absdiff(target_img, src_img)
    elif blend_mode == 'darken':
        blended = cv2.min(target_img, src_img)
    elif blend_mode == 'lighten':
        blended = cv2.max(target_img, src_img)
    else:
        blended = src_img
        
    # 4. Apply opacity
    alpha = float(opacity) / 100.0
    if alpha < 1.0:
        return cv2.addWeighted(blended, alpha, target_img, 1.0 - alpha, 0)
    return blended
