"""
Standard image reader module for handling common image formats.

This module provides functionality for reading and processing standard image files
(JPEG, PNG, BMP, etc.) with support for caching, content validation, and progress tracking.
"""

import cv2
import os
import logging
import traceback
import imghdr
import hashlib
from functools import lru_cache
from pathlib import Path
from typing import Dict, List, Optional, Union, Tuple, Any, Set
from concurrent.futures import ThreadPoolExecutor

from m_utils.utils import SUPPORTED_IMAGE_EXTENSIONS, get_output_img_path, TMP_IMG_PATH
from backend.imvid_rendering.base_reader import ImageReader, ReaderStatus, FileNotFoundError, FileReadError, FileFormatError
from backend.imvid_rendering.utils import normalize_read_file_output
from backend.progress_manager.progress_manager import global_progress_manager

# Configure logging
logger = logging.getLogger(__name__)

# Constants
MAX_CACHE_SIZE = 128  # Maximum number of images to cache
IMAGE_VALIDATION_BYTES = 16 * 1024  # Number of bytes to read for validation (16KB)

class ImageCache:
    """
    Cache for storing frequently accessed images.
    
    This cache stores image metadata and dimensions to avoid repeated disk reads.
    For the actual image data, it relies on OpenCV's own caching mechanism.
    """
    def __init__(self, max_size: int = MAX_CACHE_SIZE):
        """
        Initialize the image cache.
        
        Args:
            max_size: Maximum number of entries in the cache
        """
        self.max_size = max_size
        self._cache = {}
        self._access_order = []
    
    def get(self, key: str) -> Optional[Dict[str, Any]]:
        """
        Get an entry from the cache.
        
        Args:
            key: Cache key (typically file path or hash)
            
        Returns:
            Cached entry or None if not found
        """
        if key in self._cache:
            # Update access order
            if key in self._access_order:
                self._access_order.remove(key)
            self._access_order.append(key)
            return self._cache[key]
        return None
    
    def set(self, key: str, value: Dict[str, Any]) -> None:
        """
        Add or update an entry in the cache.
        
        Args:
            key: Cache key (typically file path or hash)
            value: Value to cache
        """
        # Evict oldest entry if cache is full
        if len(self._cache) >= self.max_size and key not in self._cache:
            oldest = self._access_order.pop(0)
            self._cache.pop(oldest, None)
        
        # Add new entry
        self._cache[key] = value
        
        # Update access order
        if key in self._access_order:
            self._access_order.remove(key)
        self._access_order.append(key)
    
    def clear(self) -> None:
        """Clear the entire cache."""
        self._cache.clear()
        self._access_order.clear()
    
    def remove(self, key: str) -> None:
        """
        Remove a specific entry from the cache.
        
        Args:
            key: Cache key to remove
        """
        if key in self._cache:
            self._cache.pop(key)
            if key in self._access_order:
                self._access_order.remove(key)


class StandardImageReader(ImageReader):
    """
    Class for reading standard image files with caching and validation.
    """
    def __init__(self):
        """Initialize the standard image reader with a cache."""
        self.reader_name = 'StandardImageReader'
        self.cache = ImageCache()
        self._valid_extensions = SUPPORTED_IMAGE_EXTENSIONS
        self._valid_image_types = {'jpeg', 'png', 'bmp', 'tiff', 'webp', 'gif'}

    def validate_format(self, file_path: str) -> bool:
        """
        Validate that the file is a supported image format by checking both
        extension and file content.
        
        Args:
            file_path: Path to the file to validate
            
        Returns:
            True if supported, False otherwise
            
        Raises:
            FileFormatError: If file format is not supported
            FileNotFoundError: If the file doesn't exist
        """
        # First check if file exists
        if not os.path.exists(file_path):
            raise FileNotFoundError(file_path)
        
        # Check extension
        if not any(file_path.lower().endswith(ext) for ext in self._valid_extensions):
            raise FileFormatError(file_path, "image", 
                                 f"Unsupported image format for {self.reader_name}. "
                                 f"Supported extensions: {', '.join(self._valid_extensions)}")
        
        # Check file content if it's not a URL
        if not file_path.startswith('http'):
            try:
                # Use imghdr to determine image type from content
                with open(file_path, 'rb') as f:
                    img_type = imghdr.what(None, f.read(IMAGE_VALIDATION_BYTES))
                
                if img_type is None or img_type not in self._valid_image_types:
                    raise FileFormatError(file_path, "image", 
                                         f"File has image extension but content is not a valid image. "
                                         f"Detected type: {img_type}")
            except IOError as e:
                raise FileReadError(file_path, f"Error reading file for validation: {str(e)}")
        
        return True

    def get_image_path(self, file_path: str, frame_num: Optional[int], 
                      extra_params: Optional[Dict[str, Any]]) -> str:
        """
        Get the path where an image should be stored.
        
        Args:
            file_path: Path to the source file
            frame_num: Frame number (not used for single images)
            extra_params: Additional parameters
            
        Returns:
            Path where the image should be stored
            
        Raises:
            FileFormatError: If file format is not supported
        """
        try:
            self.validate_format(file_path)
            
            if TMP_IMG_PATH in file_path:
                img_path = file_path
            else:
                img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
            return img_path
        except FileFormatError:
            raise
        except Exception as e:
            logger.error(f"Error getting image path for {file_path}: {str(e)}")
            logger.debug(traceback.format_exc())
            raise FileReadError(file_path, f"Error determining output path: {str(e)}")

    def get_num_frames(self, file_path: str) -> int:
        """
        Get the number of frames in an image file (always 1 for standard images).
        
        Args:
            file_path: Path to the image file
            
        Returns:
            Number of frames (1 for standard images)
            
        Raises:
            FileFormatError: If file format is not supported
        """
        self.validate_format(file_path)
        return 1
    
    def _get_cache_key(self, file_path: str, extra_params: Optional[Dict[str, Any]] = None) -> str:
        """
        Generate a cache key for the given file and parameters.
        
        Args:
            file_path: Path to the image file
            extra_params: Additional parameters
            
        Returns:
            Cache key string
        """
        if extra_params:
            # Include extra_params in the cache key
            params_str = str(sorted(extra_params.items()))
            return f"{file_path}:{hashlib.md5(params_str.encode()).hexdigest()}"
        return file_path
    
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        """
        Get the dimensions of an image with caching.
        
        Args:
            file_path: Path to the image file
            
        Returns:
            Tuple of (width, height)
            
        Raises:
            FileFormatError: If file format is not supported or image cannot be read
            FileNotFoundError: If the file doesn't exist
        """
        self.validate_format(file_path)
        
        # Check cache first
        cache_key = self._get_cache_key(file_path)
        cached_data = self.cache.get(cache_key)
        
        if cached_data and 'dimensions' in cached_data:
            return cached_data['dimensions']
        
        try:
            img = cv2.imread(file_path)
            if img is None:
                raise FileFormatError(file_path, "image", "Unable to read image content")
            
            height, width = img.shape[:2]
            dimensions = (width, height)
            
            # Cache the dimensions
            if cached_data:
                cached_data['dimensions'] = dimensions
                self.cache.set(cache_key, cached_data)
            else:
                self.cache.set(cache_key, {'dimensions': dimensions})
            
            return dimensions
        except Exception as e:
            logger.error(f"Error getting dimensions for {file_path}: {str(e)}")
            logger.debug(traceback.format_exc())
            raise FileReadError(file_path, f"Error reading image dimensions: {str(e)}")
    
    def get_fps(self, file_path: str) -> float:
        """
        Get frames per second (not applicable for standard images).
        
        Args:
            file_path: Path to the image file
            
        Returns:
            -1 (not applicable for standard images)
        """
        return -1.0
    
    @normalize_read_file_output
    def read_file(self, file_path: str, frame_num: Optional[int] = None, 
                 store_images: bool = True, extra_params: Optional[Dict[str, Any]] = None, 
                 task_id: Optional[str] = None, local_dir: Optional[str] = None, 
                 async_read: bool = True) -> Dict[str, Any]:
        """
        Read an image file with caching and validation.
        
        Args:
            file_path: Path to the image file
            frame_num: Not used for standard images
            store_images: Whether to store a copy of the image
            extra_params: Additional parameters for processing
            task_id: Task identifier for progress tracking
            local_dir: Directory to store the image
            async_read: Not used for standard images (always synchronous)
            
        Returns:
            Dictionary with task ID and results
            
        Raises:
            FileFormatError: If file format is not supported
            FileNotFoundError: If the file doesn't exist
            FileReadError: If there's an error reading the file
        """
        try:
            # Validate image format
            self.validate_format(file_path)
            
            # Check if file exists
            if not os.path.exists(file_path):
                task_id = global_progress_manager.create_task(file_path, extra_params)
                self.update_task_status(task_id, 'image', ReaderStatus.FILE_NOT_FOUND, -1)
                return task_id, {'image': ReaderStatus.FILE_NOT_FOUND}
            
            # Determine output path
            if local_dir is None:
                img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
            else:
                img_path = os.path.join(local_dir, os.path.basename(file_path))
            
            # Ensure directory exists
            Path(os.path.dirname(img_path)).mkdir(parents=True, exist_ok=True)
            
            # Generate cache key
            cache_key = self._get_cache_key(file_path, extra_params)
            
            # Handle task creation and status updates
            if not task_id:
                # Check if task already exists
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                
                if task_info is None:
                    # Create new task
                    task_id = global_progress_manager.create_task(file_path, extra_params)
                    
                    # Process image if needed
                    if not os.path.exists(img_path):
                        try:
                            self.update_task_status(task_id, 'image', ReaderStatus.IMAGE_READING_STARTED, 0)
                            
                            # Check cache first
                            cached_data = self.cache.get(cache_key)
                            if cached_data and 'image_path' in cached_data and os.path.exists(cached_data['image_path']):
                                # Use cached image path
                                if cached_data['image_path'] != img_path and store_images:
                                    # Copy from cache to requested location
                                    with open(cached_data['image_path'], 'rb') as src, open(img_path, 'wb') as dst:
                                        dst.write(src.read())
                            else:
                                # Read and store image
                                img = cv2.imread(file_path)
                                if img is None:
                                    logger.error(f"Unable to read image: {file_path}")
                                    self.update_task_status(task_id, 'image', ReaderStatus.FILE_READ_ERROR, -1)
                                    return task_id, {'image': ReaderStatus.FILE_READ_ERROR}
                                    
                                if store_images:
                                    cv2.imwrite(img_path, img)
                                    
                                    # Update cache
                                    height, width = img.shape[:2]
                                    self.cache.set(cache_key, {
                                        'image_path': img_path,
                                        'dimensions': (width, height)
                                    })
                        except Exception as e:
                            logger.error(f"Error reading image {file_path}: {str(e)}")
                            logger.debug(traceback.format_exc())
                            self.update_task_status(task_id, 'image', ReaderStatus.FILE_READ_ERROR, -1)
                            return task_id, {'image': ReaderStatus.FILE_READ_ERROR}
                    
                    # Update status to complete
                    self.update_task_status(task_id, 'image', ReaderStatus.IMAGE_READING_COMPLETE, 100)
                    return [img_path,], [img_path,]
                else:
                    # Task exists, check status
                    if task_info['status']['image'] == ReaderStatus.IMAGE_READING_COMPLETE:
                        return [img_path,], [img_path,]
                    else:
                        return task_id, task_info['status']
            else:
                # Task ID provided, check status
                task_info = global_progress_manager.get_task_info_by_id(task_id)
                
                # Handle case where image status not set
                if 'image' not in task_info['status']:
                    # Process image if needed
                    if not os.path.exists(img_path):
                        try:
                            self.update_task_status(task_id, 'image', ReaderStatus.IMAGE_READING_STARTED, 0)
                            
                            # Check cache first
                            cached_data = self.cache.get(cache_key)
                            if cached_data and 'image_path' in cached_data and os.path.exists(cached_data['image_path']):
                                # Use cached image path
                                if cached_data['image_path'] != img_path and store_images:
                                    # Copy from cache to requested location
                                    with open(cached_data['image_path'], 'rb') as src, open(img_path, 'wb') as dst:
                                        dst.write(src.read())
                            else:
                                # Read and store image
                                img = cv2.imread(file_path)
                                if img is None:
                                    logger.error(f"Unable to read image: {file_path}")
                                    self.update_task_status(task_id, 'image', ReaderStatus.FILE_READ_ERROR, -1)
                                    return task_id, {'image': ReaderStatus.FILE_READ_ERROR}
                                    
                                if store_images:
                                    cv2.imwrite(img_path, img)
                                    
                                    # Update cache
                                    height, width = img.shape[:2]
                                    self.cache.set(cache_key, {
                                        'image_path': img_path,
                                        'dimensions': (width, height)
                                    })
                        except Exception as e:
                            logger.error(f"Error reading image {file_path}: {str(e)}")
                            logger.debug(traceback.format_exc())
                            self.update_task_status(task_id, 'image', ReaderStatus.FILE_READ_ERROR, -1)
                            return task_id, {'image': ReaderStatus.FILE_READ_ERROR}
                    
                    # Update status to complete
                    self.update_task_status(task_id, 'image', ReaderStatus.IMAGE_READING_COMPLETE, 100)
                    return [img_path,], [img_path,]
                else:
                    # Return based on current status
                    if task_info['status']['image'] == ReaderStatus.IMAGE_READING_STARTED:
                        return [img_path,], [img_path,]
                    else:
                        return task_id, task_info['status']
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {str(e)}")
            logger.debug(traceback.format_exc())
            raise FileReadError(file_path, f"Error reading file: {str(e)}")
