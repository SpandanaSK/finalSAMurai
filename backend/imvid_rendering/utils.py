"""
Utility functions and constants for image/video rendering.
"""

import os
import json
import hashlib
import logging
from enum import Enum
from functools import wraps
from typing import Dict, Any, Callable, Optional, List, Tuple, Union

from backend.progress_manager.progress_manager import global_progress_manager

# Configure logging
logger = logging.getLogger(__name__)

# Constants
TMP_IMG_PATH = os.environ.get('TMP_IMG_PATH', '/tmp/samurai_images')
SUPPORTED_IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp')
SUPPORTED_VIDEO_EXTENSIONS = ('.mp4', '.avi', '.mov', '.mkv', '.webm', '.flv', '.wmv')
SUPPORTED_DICOM_EXTENSIONS = ('.dcm',)
SUPPORTED_ZIP_EXTENSIONS = ('.zip',)

# Mapping of MIME types to file extensions
MIME_TYPE_TO_EXTENSION = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'video/x-msvideo': 'avi',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/webm': 'webm',
    'video/x-flv': 'flv',
    'video/x-ms-wmv': 'wmv',
    'application/dicom': 'dcm',
    'application/zip': 'zip',
}

class ReaderStatus(Enum):
    """
    Enum for reader status codes.
    """
    # Image reading statuses
    IMAGE_READING_STARTED = "Single image reading started"
    IMAGE_READING_COMPLETE = "Single image reading complete"

    # Video reading statuses
    VIDEO_READING_STARTED = "Video reading started"
    VIDEO_EXTRACTION_STARTED = "Starting extraction of frames"
    VIDEO_EXTRACTING_FRAMES = "Extracting frames"
    VIDEO_EXTRACTING_COMPLETE = "Video rendering is complete"
    VIDEO_EXTRACTION_FAILED = "FFmpeg extraction failed"

    # Dicom reading statuses
    DICOM_READING_STARTED = "Dicom reading started"
    DICOM_EXTRACTION_STARTED = "Starting extraction of DICOM frames"
    DICOM_EXTRACTING_FRAMES = "Extracting DICOM frames"
    DICOM_EXTRACTING_COMPLETE = "Dicom extraction is complete"
    DICOM_EXTRACTION_FAILED = "Dicom extraction failed"

    # ZIP reading statuses
    ZIP_EXTRACTION_STARTED = "Starting extraction of ZIP contents"
    ZIP_EXTRACTING_FILES = "Extracting ZIP files"
    ZIP_EXTRACTING_COMPLETE = "ZIP extraction is complete"
    ZIP_EXTRACTION_FAILED = "ZIP extraction failed"

    # URL download statuses
    DOWNLOAD_STARTED = "Downloading started"
    DOWNLOAD_IN_PROGRESS = "Download in progress"
    DOWNLOAD_COMPLETED = "Downloading completed"
    DOWNLOAD_FAILED = "Download failed"

    # Generic statuses
    NO_DATA = "No data"
    FILE_NOT_FOUND = "File not found"
    FILE_READ_ERROR = "File read error"
    TASK_NOT_FOUND = "Task not found"

    # URL specific statuses
    URL_INACCESSIBLE = "URL is inaccessible"

    def __str__(self) -> str:
        """
        Return the string representation of the status.
        
        Returns:
            String value of the status
        """
        return self.value


def normalize_extra_params(extra_params: Any) -> Dict[str, Any]:
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


def make_progress_key(file_path: str, extra_params: Any) -> str:
    """
    Create a unique key for tracking progress.
    
    Args:
        file_path: Path to the file
        extra_params: Additional parameters
        
    Returns:
        Unique key for progress tracking
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


def get_output_dir(file_path: str, extra_params: Any, out_dir: str = TMP_IMG_PATH) -> str:
    """
    Get the output directory for extracted files.
    
    Args:
        file_path: Path to the source file
        extra_params: Additional parameters
        out_dir: Base output directory
        
    Returns:
        Path to the output directory
    """
    # Use make_progress_key for consistent hashing
    key = make_progress_key(file_path, extra_params)
    
    # Construct the output directory path
    output_dir = os.path.join(out_dir, key)
    
    # Ensure the directory exists
    os.makedirs(output_dir, exist_ok=True)
    
    return output_dir


def normalize_read_file_output(func: Callable) -> Callable:
    """
    Decorator to normalize the output of read_file methods.
    
    This decorator ensures that all read_file methods return a consistent
    structure regardless of the specific reader implementation.
    
    Args:
        func: The function to decorate
        
    Returns:
        Decorated function
    """
    @wraps(func)
    def wrapper(*args, **kwargs) -> Dict[str, Any]:
        """
        Wrapper function that normalizes the output.
        
        Args:
            *args: Positional arguments to pass to the wrapped function
            **kwargs: Keyword arguments to pass to the wrapped function
            
        Returns:
            Normalized result dictionary
        """
        try:
            # Call the original function
            raw = func(*args, **kwargs)

            # Determine task_id
            task_id = kwargs.get("task_id")
            file_name = kwargs.get('file_path') or (args[0] if args else None)
            extra_params = kwargs.get('extra_params') if 'extra_params' in kwargs else (
                args[3] if len(args) > 3 else None
            )
            frame_num = kwargs.get('frame_num') if 'frame_num' in kwargs else (
                args[1] if len(args) > 1 else None
            )
                
            # Prepare default result structure
            result = {
                "file_path": file_name,
                "extra_params": extra_params,
                "series_file": None,
                "images": [],
                "paths": [],
                "status": None,
                "progress": None,
            }

            # Fetch progress manager info if available
            if task_id is None:
                pm = global_progress_manager.get_task_info_by_file(file_name, extra_params)
                task_id = make_progress_key(file_name, extra_params)
                if pm is None:
                    result["status"], result["progress"] = {'task': ReaderStatus.NO_DATA}, {'task': -1}
                else:
                    result["status"], result["progress"] = pm["status"], pm["progress"]
            else:
                pm = global_progress_manager.get_task_info_by_id(task_id)
                if pm:
                    result["status"], result["progress"] = pm["status"], pm["progress"]
                else:
                    result["status"], result["progress"] = {'task': ReaderStatus.NO_DATA}, {'task': -1}
            
            # Add the raw results
            if raw and isinstance(raw, tuple) and len(raw) >= 2:
                result["images"] = raw[0]
                result["paths"] = raw[1]
            
            return {"task_id": task_id, "result": result}
        except Exception as e:
            logger.error(f"Error in normalize_read_file_output: {str(e)}")
            logger.debug(f"Args: {args}, Kwargs: {kwargs}")
            # Return a minimal valid response on error
            return {
                "task_id": kwargs.get("task_id", "error"),
                "result": {
                    "file_path": kwargs.get('file_path', "unknown"),
                    "extra_params": kwargs.get('extra_params', None),
                    "series_file": None,
                    "images": [],
                    "paths": [],
                    "status": {"error": ReaderStatus.FILE_READ_ERROR},
                    "progress": -1,
                }
            }

    return wrapper


def is_supported_image(file_path: str) -> bool:
    """
    Check if a file is a supported image format.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if supported image format, False otherwise
    """
    return any(file_path.lower().endswith(ext) for ext in SUPPORTED_IMAGE_EXTENSIONS)


def is_supported_video(file_path: str) -> bool:
    """
    Check if a file is a supported video format.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if supported video format, False otherwise
    """
    return any(file_path.lower().endswith(ext) for ext in SUPPORTED_VIDEO_EXTENSIONS)


def is_supported_dicom(file_path: str) -> bool:
    """
    Check if a file is a supported DICOM format.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if supported DICOM format, False otherwise
    """
    return any(file_path.lower().endswith(ext) for ext in SUPPORTED_DICOM_EXTENSIONS)


def is_supported_zip(file_path: str) -> bool:
    """
    Check if a file is a supported ZIP format.
    
    Args:
        file_path: Path to the file
        
    Returns:
        True if supported ZIP format, False otherwise
    """
    return any(file_path.lower().endswith(ext) for ext in SUPPORTED_ZIP_EXTENSIONS)


def is_url(file_path: str) -> bool:
    """
    Check if a path is a URL.
    
    Args:
        file_path: Path to check
        
    Returns:
        True if URL, False otherwise
    """
    return file_path.startswith(('http://', 'https://'))


def apply_window_level(frame, window_width=None, window_center=None):
    """
    Apply window/level adjustment to DICOM pixel data.
    Simple linear transformation that maps the input range to display values.
    
    Args:
        frame: NumPy array of pixel data
        window_width: Width of the window (contrast)
        window_center: Center of the window (brightness)
        
    Returns:
        Processed frame as uint8 image (0-255)
    """
    import numpy as np
    import cv2
    
    if window_width is not None and window_center is not None:
        try:
            frame = frame.astype(np.float32)
            # Standard DICOM windowing formula
            result = 255.0 * (frame - (window_center - 0.5 * window_width)) / window_width
            result = np.clip(result, 0, 255)
            return result.astype(np.uint8)
        except Exception:
            return cv2.normalize(frame, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    else:
        return cv2.normalize(frame, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
