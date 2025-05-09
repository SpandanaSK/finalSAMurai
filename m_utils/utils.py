""" This module provides utility functions for image annotation tasks. """

import os
import json
import hashlib
import itertools
import logging

# Configure logging
logger = logging.getLogger(__name__)

SUPPORTED_IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', 
                              '.pbm', '.pgm', '.ppm', '.sr', '.ras')
SUPPORTED_VIDEO_EXTENSIONS = ('.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm')
current_dir = os.path.dirname(os.path.abspath(__file__))
TMP_IMG_PATH = '/tmp/images/'
TMP_DCM_PATH = '/tmp/dcm/'
DATASET_DIR = '/tmp/samurai_datasets/'
PROJECT_DIR = current_dir

MIME_TYPE_TO_EXTENSION = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'image/x-portable-bitmap': 'pbm',
    'image/x-portable-graymap': 'pgm',
    'image/x-portable-pixmap': 'ppm',
    'image/x-sun-raster': 'ras',
    'video/mp4': 'mp4',
    'video/x-msvideo': 'avi',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/x-flv': 'flv',
    'video/x-ms-wmv': 'wmv',
    'video/webm': 'webm'
}

def normalize_extra_params(extra_params):
    """
    Normalize extra parameters to ensure consistent hashing.
    
    This handles various cases:
    - None, empty dict, empty list, empty tuple
    - Common "empty" patterns like {'window_width': None, 'window_center': None}
    - Sorts dictionary keys for consistent hashing
    
    Args:
        extra_params: The extra parameters to normalize
        
    Returns:
        Normalized extra parameters as a sorted dictionary
    """
    # Handle None case
    if extra_params is None:
        return {}
        
    # Handle empty containers
    if isinstance(extra_params, (dict, list, tuple)) and len(extra_params) == 0:
        return {}
    
    # Convert to dict if it's a list of pairs or tuple of pairs
    if isinstance(extra_params, (list, tuple)):
        try:
            # Try to convert to dict if it's a list of pairs
            extra_params = dict(extra_params)
        except (ValueError, TypeError):
            # If conversion fails, just stringify and return empty dict
            logger.debug(f"Could not convert extra_params to dict: {str(extra_params)}")
            return {}
    
    # If it's a dict, check if all values are None or empty
    if isinstance(extra_params, dict):
        # Check if all values are None or empty containers
        all_empty = True
        for value in extra_params.values():
            if value is not None and not (isinstance(value, (dict, list, tuple)) and len(value) == 0):
                all_empty = False
                break
                
        if all_empty:
            return {}
            
        # Sort the keys for consistent hashing
        return dict(sorted(extra_params.items()))
    
    # Default case - return empty dict
    return {}

def dict_to_tuple(d):
    """
    Converts a dictionary to a tuple.

    Args:
        d (dict): The dictionary to be converted.

    Returns:
        tuple: The tuple representation of the dictionary.
    """
    if type(d) == tuple:
        return d
    if d is None:
        d = {}
    # if d is list of [[a, b], [c, d], ....] then convert to dict
    if type(d) == list:
        d = {d[i][0]: d[i][1] for i in range(len(d))}
    return tuple(sorted(d.items()))

def make_progress_key(file_path, extra_params=None):
    """
    Create a consistent hash key for tracking progress.
    
    Args:
        file_path: Path to the file
        extra_params: Additional parameters (optional)
        
    Returns:
        MD5 hash string to use as a unique key
    """
    normalized_params = normalize_extra_params(extra_params)
    
    # Create a payload with the file_name and normalized extra_params
    payload = {
        "file_name": file_path,
        "extra_params": normalized_params
    }
    
    # Convert to JSON and hash
    as_json = json.dumps(payload, sort_keys=True)
    return hashlib.md5(as_json.encode("utf-8")).hexdigest()

def get_output_dir(f, extra_params={}, out_dir=TMP_IMG_PATH):
    # Use consistent hashing with normalize_extra_params
    key = make_progress_key(f, extra_params)
    out_dir1 = os.path.join(out_dir, key)
    # Ensure the directory exists
    os.makedirs(out_dir1, exist_ok=True)
    return out_dir1

def get_output_img_path(file_path, frame_num, extra_params={}, out_dir=TMP_IMG_PATH):
    """
    Generates the output image path based on the given directory, filename, and frame number.

    Args:
        out_dir (str): The base output directory.
        f (str): The filename or identifier used to generate the output directory.
        frame (str, optional): The frame number to be included in the output filename. Defaults to "0".

    Returns:
        str: The full path to the output image file.
    """
    # Use dict_to_tuple for backward compatibility but apply our normalization
    out_dir1 = get_output_dir(file_path, extra_params, out_dir)
    if frame_num is None:
        out_f = '%05d.jpg'%(0, )
    else:
        out_f = '%05d.jpg'%int(frame_num)
    out_ff = os.path.join(out_dir1, out_f)
    return out_ff

