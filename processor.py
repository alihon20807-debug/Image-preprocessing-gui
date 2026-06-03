import cv2
import numpy as np
import sys

# ----------------- Helper -----------------

def verify_step_base(step):
    if not isinstance(step, dict):
        raise TypeError(f"step must be a dict. Got {type(step).__name__}")
    if 'id' not in step:
        raise KeyError("step missing required key 'id'")
    if 'type' not in step:
        raise KeyError("step missing required key 'type'")

INTERPOLATION_MAP = {
    'Bilinear (Fast)': cv2.INTER_LINEAR,
    'Bicubic (Sharp)': cv2.INTER_CUBIC,
    'Lanczos (Ultra Sharp)': cv2.INTER_LANCZOS4,
    'Nearest Neighbor': cv2.INTER_NEAREST
}

def parse_hex_color(color_str):
    hex_clean = color_str.lstrip('#')
    r = int(hex_clean[0:2], 16)
    g = int(hex_clean[2:4], 16)
    b = int(hex_clean[4:6], 16)
    return r, g, b

def luminance(r, g, b):
    return int(0.299 * r + 0.587 * g + 0.114 * b)

def clamp_adaptive_block_size(val, max_val):
    if val > max_val:
        val = max_val
        if val % 2 == 0:
            val -= 1
        if val < 3:
            val = 3
    return val


# ----------------- OpenCV Modular Processing Functions -----------------

def apply_grayscale(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    if len(img.shape) > 2:
        return cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return img.copy()

def apply_invert(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    channel_mode = step.get('channel_mode', 'Color Channels')
    if channel_mode == 'Grayscale' and len(img.shape) > 2:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
    return cv2.bitwise_not(img)


def apply_contrast(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    contrast = float(step['contrast'])
    brightness = step['brightness']
    return cv2.convertScaleAbs(img, alpha=contrast, beta=brightness)

def apply_blur(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)
    blur_type = step['blur_type']

    if blur_type == 'Gaussian Blur':
        kx = step['kernel_x']
        ky = step['kernel_y']
        sx = float(step['sigma_x'])
        sy = float(step['sigma_y'])
        return cv2.GaussianBlur(img, (kx, ky), sigmaX=sx, sigmaY=sy)

    elif blur_type == 'Median Blur':
        kernel = step['kernel']
        return cv2.medianBlur(img, kernel)

    elif blur_type == 'Bilateral Filter':
        diameter = step['diameter']
        sigma_color = float(step['sigma_color'])
        sigma_space = float(step['sigma_space'])
        return cv2.bilateralFilter(img, diameter, sigma_color, sigma_space)

    elif blur_type == 'Box Blur':
        kx = step['kernel_x']
        ky = step['kernel_y']
        return cv2.blur(img, (kx, ky))

    return img

def apply_threshold_single(img, mode, val, fill_color, block_size, constant_c, sigma_x, sigma_y):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")

    h, w = img.shape[:2]
    max_block = min(h, w)
    block_size = clamp_adaptive_block_size(block_size, max_block)

    sx = float(sigma_x)
    sy = float(sigma_y)

    supported_modes = {
        "Binary Thresholding", "Binary Thresholding Inverted",
        "Truncate Thresholding", "Threshold to Zero", "Threshold to Zero Inverted",
        "Otsu's Thresholding", "Otsu's Thresholding Inverted",
        "Triangle Thresholding", "Triangle Thresholding Inverted",
        "Adaptive Mean", "Adaptive Mean Inverted",
        "Adaptive Gaussian", "Adaptive Gaussian Inverted",
        "Single Color Thresholding", "Single Color Thresholding Inverted"
    }

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

    mode = step['mode']
    val = step['value']
    block_size = step['block_size']
    constant_c = step['constant_c']
    channel_mode = step['channel_mode']
    sigma_x = float(step['sigma_x'])
    sigma_y = float(step['sigma_y'])
    fill_color_param = step['fill_color']

    r, g, b = parse_hex_color(fill_color_param)

    # Single Color Thresholding custom logic
    if mode in {"Single Color Thresholding", "Single Color Thresholding Inverted"}:
        target_color_param = step['target_color']
        tolerance = step['tolerance']
        tr, tg, tb = parse_hex_color(target_color_param)

        if channel_mode == 'Grayscale':
            gray_target = luminance(tr, tg, tb)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if len(img.shape) > 2 else img
            dist = cv2.absdiff(gray_img, gray_target)
            match_mask = dist <= tolerance

            gray_val = luminance(r, g, b)
            if mode == "Single Color Thresholding":
                res = np.where(match_mask, gray_val, 0).astype(np.uint8)
            else:
                res = np.where(match_mask, 0, gray_val).astype(np.uint8)
            return res
        else:
            # Color Channels mode
            if len(img.shape) > 2:
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
                gray_target = luminance(tr, tg, tb)
                dist = cv2.absdiff(img, gray_target)
                match_mask = dist <= tolerance

                gray_val = luminance(r, g, b)
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
        gray_val = luminance(r, g, b)
        return apply_threshold_single(img, mode, val, gray_val, block_size, constant_c, sigma_x, sigma_y)

def _apply_edges_single_channel(gray, step, algo):
    if algo == 'Canny':
        low = step['low']
        high = step['high']
        aperture = step['aperture']
        l2 = step['l2_gradient']
        return cv2.Canny(gray, low, high, apertureSize=aperture, L2gradient=l2)

    elif algo == 'Sobel':
        dx = step['dx']
        dy = step['dy']
        ksize = step['ksize']
        scale = float(step['scale'])
        delta = float(step['delta'])
        sobel = cv2.Sobel(gray, cv2.CV_16S, dx, dy, ksize=ksize, scale=scale, delta=delta)
        return cv2.convertScaleAbs(sobel)

    elif algo == 'Scharr':
        dx = step['dx']
        dy = step['dy']
        scale = float(step['scale'])
        delta = float(step['delta'])
        scharr = cv2.Scharr(gray, cv2.CV_16S, dx, dy, scale=scale, delta=delta)
        return cv2.convertScaleAbs(scharr)

    elif algo == 'Laplacian':
        ksize = step['ksize']
        scale = float(step['scale'])
        delta = float(step['delta'])
        laplacian = cv2.Laplacian(gray, cv2.CV_16S, ksize=ksize, scale=scale, delta=delta)
        return cv2.convertScaleAbs(laplacian)

    return gray

def apply_edges(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    algo = step['algorithm']
    channel_mode = step.get('channel_mode', 'Grayscale')
    is_color = len(img.shape) > 2

    if channel_mode == 'Color Channels' and is_color:
        channels = cv2.split(img)
        edge_channels = []
        for ch in channels:
            edge_channels.append(_apply_edges_single_channel(ch, step, algo))
        return cv2.merge(edge_channels)
    else:
        if is_color:
            gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        else:
            gray = img
        return _apply_edges_single_channel(gray, step, algo)

def apply_upsample(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    scale = float(step['scale'])
    interp_name = step['interpolation']
    flags = INTERPOLATION_MAP[interp_name]

    if scale == 1.0:
        return img.copy()

    h, w = img.shape[:2]
    new_w = int(w * scale)
    new_h = int(h * scale)
    return cv2.resize(img, (new_w, new_h), interpolation=flags)

def apply_downsample(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    scale = float(step['scale'])
    interp_name = step['interpolation']
    flags = INTERPOLATION_MAP[interp_name]

    if scale == 1.0:
        return img.copy()

    h, w = img.shape[:2]
    new_w = max(1, int(w * scale))
    new_h = max(1, int(h * scale))
    return cv2.resize(img, (new_w, new_h), interpolation=flags)

def apply_crop(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    left = float(step['left'])
    right = float(step['right'])
    top = float(step['top'])
    bottom = float(step['bottom'])

    h, w = img.shape[:2]
    x1 = int(w * (left / 100.0))
    x2 = int(w * (1.0 - right / 100.0))
    y1 = int(h * (top / 100.0))
    y2 = int(h * (1.0 - bottom / 100.0))

    return img[y1:y2, x1:x2].copy()

def apply_heal(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    op_name = step['operation']
    is_color = len(img.shape) > 2

    default_channel_mode = 'Grayscale' if op_name == 'Skeletonization (Thinning)' else 'Color Channels'
    channel_mode = step.get('channel_mode', default_channel_mode)

    use_target_color = step.get('use_target_color', False)

    if use_target_color:
        tolerance = step['tolerance']
        tr, tg, tb = parse_hex_color(step['target_color'])
        fr, fg, fb = parse_hex_color(step['fill_color'])
        br, bg, bb = parse_hex_color(step.get('bg_color', '#ffffff'))

        # Target matching logic based on channel mode
        if channel_mode == 'Grayscale' or not is_color:
            gray_target = luminance(tr, tg, tb)
            gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img
            dist = cv2.absdiff(gray_img, gray_target)
            match_mask = dist <= tolerance
        else:
            diff = img.astype(np.float32) - np.array([tb, tg, tr], dtype=np.float32)
            dist = np.sqrt(np.sum(diff ** 2, axis=2))
            match_mask = dist <= tolerance

        mask_u8 = (match_mask.astype(np.uint8)) * 255

        if op_name == 'Skeletonization (Thinning)':
            size = np.size(mask_u8)
            skel = np.zeros(mask_u8.shape, np.uint8)
            element = cv2.getStructuringElement(cv2.MORPH_CROSS, (3, 3))
            binary_temp = mask_u8.copy()
            done = False
            iters = 0
            while not done and iters < 1000:
                iters += 1
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
            shape_name = step['shape']
            kernel_x = step['kernel_x']
            kernel_y = step['kernel_y']
            iterations = step['iterations']

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

        res = img.copy()
        if is_color:
            stroke_color = np.array([fb, fg, fr], dtype=np.uint8)
            erase_color = np.array([bb, bg, br], dtype=np.uint8)
        else:
            stroke_color = luminance(fr, fg, fb)
            erase_color = luminance(br, bg, bb)

        erased_pixels = (mask_u8 == 255) & (modified_mask == 0)
        res[erased_pixels] = erase_color
        res[modified_mask == 255] = stroke_color
        return res

    # Non-color-targeted operations
    if channel_mode == 'Grayscale' and is_color:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)
        is_color = False

    if op_name == 'Skeletonization (Thinning)':
        skel_threshold = step['skel_threshold']
        foreground_mode = step['foreground_mode']

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
                iters = 0
                while not done and iters < 1000:
                    iters += 1
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
            iters = 0
            while not done and iters < 1000:
                iters += 1
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
        shape_name = step['shape']
        kernel_x = step['kernel_x']
        kernel_y = step['kernel_y']
        iterations = step['iterations']

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

def _hole_fill_contours(img, step, is_color, use_target_color, match_mask, color_val):
    min_area = float(step['min_area'])
    max_area = float(step['max_area'])

    if use_target_color:
        gray = match_mask.astype(np.uint8) * 255
    else:
        gray = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img.copy()

    try:
        contours, _ = cv2.findContours(gray, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    except Exception as e:
        sys.stderr.write(f"[WARNING] cv2.findContours failed: {e}\n")
        contours = []

    res = img.copy()
    for c in contours:
        area = cv2.contourArea(c)
        if min_area <= area <= max_area:
            cv2.drawContours(res, [c], -1, color_val, thickness=cv2.FILLED)
    return res

def _extract_color_match_mask(img, step, is_color):
    channel_mode = step.get('channel_mode', 'Color Channels')
    tr, tg, tb = parse_hex_color(step['target_color'])
    tolerance = step['tolerance']

    if channel_mode == 'Grayscale' or not is_color:
        gray_target = luminance(tr, tg, tb)
        gray_img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY) if is_color else img
        dist = cv2.absdiff(gray_img, gray_target)
        match_mask = dist <= tolerance
    else:
        diff = img.astype(np.float32) - np.array([tb, tg, tr], dtype=np.float32)
        dist = np.sqrt(np.sum(diff ** 2, axis=2))
        match_mask = dist <= tolerance
    return match_mask

def apply_fill(img, step):
    if not isinstance(img, np.ndarray):
        raise TypeError(f"img must be a numpy.ndarray. Got {type(img).__name__}")
    verify_step_base(step)

    mode = step['fill_mode']
    is_color = len(img.shape) > 2
    channels = img.shape[2] if is_color else 1

    # Backward compatibility: mapping old grayscale 'color' key to 'fill_color' Hex format
    requires_fill_color = mode not in {'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}
    if requires_fill_color:
        if 'fill_color' not in step and 'color' in step:
            c = step['color']
            step['fill_color'] = f"#{c:02x}{c:02x}{c:02x}"

        fill_color_param = step['fill_color']
        fr, fg, fb = parse_hex_color(fill_color_param)
        color_val = (fb, fg, fr) if is_color else luminance(fr, fg, fb)

    # Check if target color matching should be performed
    use_target_color = False
    if mode in {'Color Replacement (Chroma Key)', 'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}:
        use_target_color = True
    elif mode == 'Hole Filling (Contours)' and step.get('use_target_color', False) is True:
        use_target_color = True

    if use_target_color:
        match_mask = _extract_color_match_mask(img, step, is_color)

    if mode == 'Hole Filling (Contours)':
        return _hole_fill_contours(img, step, is_color, use_target_color, match_mask if use_target_color else None, color_val)

    elif mode == 'Color Replacement (Chroma Key)':
        res = img.copy()
        res[match_mask] = color_val
        return res

    elif mode in {'Content-Aware Inpainting (NS)', 'Content-Aware Inpainting (Telea)'}:
        inpaint_radius = step['inpaint_radius']
        flags = cv2.INPAINT_NS if mode == 'Content-Aware Inpainting (NS)' else cv2.INPAINT_TELEA
        mask_u8 = (match_mask.astype(np.uint8)) * 255
        return cv2.inpaint(img, mask_u8, inpaint_radius, flags)

    elif mode == 'Flood Fill':
        seed_x_pct = float(step['seed_x'])
        seed_y_pct = float(step['seed_y'])
        lo_diff = step['lo_diff']
        up_diff = step['up_diff']

        h, w = img.shape[:2]
        seed_x = int(w * (seed_x_pct / 100.0))
        seed_y = int(h * (seed_y_pct / 100.0))

        res = img.copy()
        mask = np.zeros((h + 2, w + 2), np.uint8)
        diff_val = (lo_diff,) * channels
        up_val = (up_diff,) * channels
        cv2.floodFill(res, mask, (seed_x, seed_y), color_val, diff_val, up_val)
        return res

    elif mode == 'Corner Background Fill':
        lo_diff = step['lo_diff']
        up_diff = step['up_diff']

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

    algo = step['algorithm']
    fill_target = step['fill_target']
    fill_color = step['color']
    min_area = float(step['min_area'])
    max_area = float(step['max_area'])
    draw_style = step['draw_style']
    thickness = step['thickness']

    edges_map = apply_edges(img, step)

    if len(edges_map.shape) > 2:
        edges_map = np.max(edges_map, axis=2)

    is_color = len(img.shape) > 2
    color_val = (fill_color, fill_color, fill_color) if is_color else fill_color

    if fill_target == 'Binary Mask (Black background)':
        res = np.zeros_like(img)
    elif fill_target == 'Binary Mask (White background)':
        res = np.ones_like(img) * 255
    else:
        res = img.copy()

    try:
        contours, _ = cv2.findContours(edges_map, cv2.RETR_CCOMP, cv2.CHAIN_APPROX_SIMPLE)
    except Exception as e:
        sys.stderr.write(f"[WARNING] cv2.findContours failed in edges_fill: {e}\n")
        contours = []

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

    algo = step['algorithm']
    val = step['value']
    channel_mode = step['channel_mode']
    condition = step['condition']
    fill_color_param = step['fill_color']

    constant_c = step.get('constant_c', 0) if algo in {"Otsu's", 'Triangle', 'Adaptive Mean', 'Adaptive Gaussian'} else 0
    block_size_x = step.get('block_size_x', 3) if algo in {'Adaptive Mean', 'Adaptive Gaussian'} else 3
    block_size_y = step.get('block_size_y', 3) if algo in {'Adaptive Mean', 'Adaptive Gaussian'} else 3
    sigma_x = float(step.get('sigma_x', 0.0))
    sigma_y = float(step.get('sigma_y', 0.0))
    val_max = step.get('value_max', 255)

    r, g, b = parse_hex_color(fill_color_param)

    if channel_mode == 'Grayscale' and len(img.shape) > 2:
        img = cv2.cvtColor(img, cv2.COLOR_BGR2GRAY)

    if len(img.shape) == 2:
        fill_color = luminance(r, g, b)
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
            return np.where((source >= threshold) & (source <= val_max), fill_color, source)
        elif condition == 'Outside Range':
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
        h, w = img.shape[:2]
        block_size_x = clamp_adaptive_block_size(block_size_x, w)
        block_size_y = clamp_adaptive_block_size(block_size_y, h)
        local_mean = cv2.boxFilter(img, -1, (block_size_x, block_size_y), borderType=cv2.BORDER_REPLICATE)
        threshold_matrix = np.clip(local_mean.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
        res = apply_thresh_condition(img, threshold_matrix)

    elif algo == 'Adaptive Gaussian':
        h, w = img.shape[:2]
        block_size_x = clamp_adaptive_block_size(block_size_x, w)
        block_size_y = clamp_adaptive_block_size(block_size_y, h)
        local_gaussian = cv2.GaussianBlur(img, (block_size_x, block_size_y), sigmaX=sigma_x, sigmaY=sigma_y, borderType=cv2.BORDER_REPLICATE)
        threshold_matrix = np.clip(local_gaussian.astype(np.int16) - constant_c, 0, 255).astype(np.uint8)
        res = apply_thresh_condition(img, threshold_matrix)

    else:
        res = img

    return res

def apply_blend(img, step, cache_matrices=None):
    blend_src_id = step.get('blend_source', 'previous')

    if cache_matrices and blend_src_id in cache_matrices:
        blend_src_img = cache_matrices[blend_src_id]
    else:
        raise KeyError(f"Blend source ID '{blend_src_id}' not found in cached step matrices.")

    blend_mode = step.get('blend_mode', 'normal')
    opacity = step.get('opacity', 100.0)
    blend_interp = step.get('blend_interpolation', 'Bicubic (Sharp)')

    return blend_images(img, blend_src_img, blend_mode, opacity, blend_interp)

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
    'downsample': apply_downsample,
    'blend': apply_blend
}

# ----------------- Blending Helpers -----------------

def blend_images(target_img, src_img, blend_mode, opacity, blend_interp='Bicubic (Sharp)'):
    if not isinstance(target_img, np.ndarray):
        raise TypeError(f"target_img must be a numpy.ndarray. Got {type(target_img).__name__}")
    if not isinstance(src_img, np.ndarray):
        raise TypeError(f"src_img must be a numpy.ndarray. Got {type(src_img).__name__}")

    flags = INTERPOLATION_MAP.get(blend_interp, cv2.INTER_CUBIC)

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
