"""
Utility functions and constants for image/video rendering.
"""

import os
import logging
from enum import Enum
from functools import wraps
from typing import Dict, Any, Callable

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


def make_progress_key(file_path: str, extra_params: Any) -> str:
    """
    Create a unique key for tracking progress.
    
    Args:
        file_path: Path to the file
        extra_params: Additional parameters
        
    Returns:
        Unique key for progress tracking
    """
    if extra_params:
        return f"{file_path}_{hash(str(extra_params))}"
    return file_path


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
    # Create a unique directory based on file path and extra params
    file_name = os.path.basename(file_path)
    base_name = os.path.splitext(file_name)[0]
    
    # Create a hash of extra_params if provided
    params_hash = ""
    if extra_params:
        params_hash = f"_{hash(str(extra_params))}"
    
    # Construct the output directory path
    output_dir = os.path.join(out_dir, f"{hash(file_name+base_name)}{params_hash}")
    
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
                    result["status"], result["progress"] = "No data", 0
                else:
                    result["status"], result["progress"] = pm["status"], pm["progress"]
            else:
                pm = global_progress_manager.get_task_info_by_id(task_id)
                if pm:
                    result["status"], result["progress"] = pm["status"], pm["progress"]
                else:
                    result["status"], result["progress"] = "No data", 0
            
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
                    "status": {"error": ReaderStatus.FILE_READ_ERROR.value},
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
    
    This function implements the DICOM windowing technique used to adjust contrast and brightness.
    The function takes the original pixel data and applies a linear transformation based on:
    
    1. Window Width (WW): Controls the contrast - a narrower window increases contrast
    2. Window Center (WC): Controls the brightness - pixels at this value will be in the middle of the range
    
    How it works:
    
    1. Values below (WC - WW/2) are set to 0 (black)
    2. Values above (WC + WW/2) are set to 255 (white)
    3. Values in between are linearly mapped to 0-255
    
    Example:
        - WW=2000, WC=1000:
          - Values below 0 become black
          - Values above 2000 become white
          - Value 1000 becomes 127/128 (middle gray)
    
    Args:
        frame: NumPy array of pixel data
        window_width: Width of the window (contrast)
        window_center: Center of the window (brightness)
        
    Returns:
        Processed frame as uint8 image (0-255)
    """
    import numpy as np
    import cv2
    
    # Make a copy to avoid modifying the original
    frame_copy = frame.copy()
    
    # Apply windowing if parameters are available
    if window_width is not None and window_center is not None:
        try:
            # Make sure parameters are numeric
            window_width = float(window_width)
            window_center = float(window_center)
            
            # Handle negative window width
            if window_width < 0:
                logger.warning(f"Negative window width detected ({window_width}), using absolute value")
                window_width = abs(window_width)
            
            # Skip window/level if width is too small
            if window_width < 1:
                logger.warning(f"Window width too small ({window_width}), using default normalization")
                return cv2.normalize(frame_copy, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
            
            # Calculate window bounds
            window_min = window_center - window_width / 2
            window_max = window_center + window_width / 2
            
            # Clip pixel values to window range
            np.clip(frame_copy, window_min, window_max, out=frame_copy)
            
            # Normalize to 0-255 range based on window
            if window_max > window_min:
                frame_copy = ((frame_copy - window_min) / (window_max - window_min) * 255)
            
            # Convert to uint8
            return frame_copy.astype(np.uint8)
        except Exception as e:
            logger.error(f"Error applying window/level: {e}")
            # Fall back to default normalization
            return cv2.normalize(frame_copy, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
    else:
        # Default normalization if no windowing parameters
        return cv2.normalize(frame_copy, None, 0, 255, cv2.NORM_MINMAX).astype(np.uint8)
