import os
import magic
import hashlib
import time
import logging
import traceback
from pathlib import Path
from typing import Dict, List, Optional, Union, Tuple, Any
from urllib.parse import urlparse
import requests
from threading import Lock, Thread
from concurrent.futures import ThreadPoolExecutor

from backend.imvid_rendering.base_reader import (
    ImageReader, ReaderStatus, FileNotFoundError, 
    FileReadError, FileFormatError
)
from backend.imvid_rendering.image_reader import StandardImageReader
from backend.imvid_rendering.video_reader import SimpleVideoReader
from backend.imvid_rendering.dicom_reader import DICOMWADOReader
from backend.imvid_rendering.zip_reader import ZipReader
from backend.progress_manager.progress_manager import global_progress_manager
from backend.imvid_rendering.utils import normalize_read_file_output, get_output_dir, TMP_IMG_PATH
from m_utils.utils import MIME_TYPE_TO_EXTENSION

# Configure logging
logger = logging.getLogger(__name__)

# Constants
CACHE_EXPIRY_TIME = 3600  # Cache expiry time in seconds (1 hour)
MAX_CACHE_SIZE = 100      # Maximum number of URLs to cache
DOWNLOAD_TIMEOUT = 30     # Timeout for download requests in seconds
CHUNK_SIZE = 8192         # Chunk size for streaming downloads


class URLCache:
    """
    Class for caching downloaded files from URLs.
    """
    def __init__(self, cache_dir: str, max_size: int = MAX_CACHE_SIZE, expiry_time: int = CACHE_EXPIRY_TIME):
        self.cache_dir = cache_dir
        self.max_size = max_size
        self.expiry_time = expiry_time
        self.cache_index: Dict[str, Dict[str, Any]] = {}  # URL -> {path, timestamp, mime_type}
        self.lock = Lock()
        
        # Create cache directory if it doesn't exist
        Path(self.cache_dir).mkdir(parents=True, exist_ok=True)
        
        # Initialize cache from existing files
        self._init_cache_from_disk()
    
    def _init_cache_from_disk(self) -> None:
        """Initialize cache index from existing files in cache directory."""
        try:
            # Look for cache index file
            index_path = os.path.join(self.cache_dir, 'cache_index.txt')
            if os.path.exists(index_path):
                with open(index_path, 'r') as f:
                    for line in f:
                        parts = line.strip().split('|')
                        if len(parts) >= 3:
                            url = parts[0]
                            file_path = parts[1]
                            timestamp = float(parts[2])
                            mime_type = parts[3] if len(parts) > 3 else None
                            
                            if os.path.exists(file_path):
                                self.cache_index[url] = {
                                    'path': file_path,
                                    'timestamp': timestamp,
                                    'mime_type': mime_type
                                }
        except Exception as e:
            logger.error(f"Error initializing URL cache: {e}")
            # Start with empty cache if there's an error
            self.cache_index = {}
    
    def _save_cache_index(self) -> None:
        """Save cache index to disk."""
        try:
            index_path = os.path.join(self.cache_dir, 'cache_index.txt')
            with open(index_path, 'w') as f:
                for url, info in self.cache_index.items():
                    f.write(f"{url}|{info['path']}|{info['timestamp']}|{info.get('mime_type', '')}\n")
        except Exception as e:
            logger.error(f"Error saving URL cache index: {e}")
    
    def _cleanup_old_entries(self) -> None:
        """Remove expired entries from cache."""
        current_time = time.time()
        expired_urls = []
        
        for url, info in self.cache_index.items():
            if current_time - info['timestamp'] > self.expiry_time:
                expired_urls.append(url)
                try:
                    if os.path.exists(info['path']):
                        os.remove(info['path'])
                except Exception as e:
                    logger.error(f"Error removing cached file {info['path']}: {e}")
        
        for url in expired_urls:
            del self.cache_index[url]
        
        # If still over max size, remove oldest entries
        if len(self.cache_index) > self.max_size:
            urls_by_age = sorted(
                self.cache_index.keys(),
                key=lambda u: self.cache_index[u]['timestamp']
            )
            
            for url in urls_by_age[:len(self.cache_index) - self.max_size]:
                try:
                    if os.path.exists(self.cache_index[url]['path']):
                        os.remove(self.cache_index[url]['path'])
                except Exception as e:
                    logger.error(f"Error removing cached file {self.cache_index[url]['path']}: {e}")
                del self.cache_index[url]
        
        self._save_cache_index()
    
    def get(self, url: str) -> Optional[Dict[str, Any]]:
        """
        Get cached file info for a URL.
        
        Args:
            url: URL to check in cache
            
        Returns:
            Dict with path and mime_type if cached, None otherwise
        """
        with self.lock:
            if url in self.cache_index:
                info = self.cache_index[url]
                current_time = time.time()
                
                # Check if entry is expired
                if current_time - info['timestamp'] > self.expiry_time:
                    try:
                        if os.path.exists(info['path']):
                            os.remove(info['path'])
                    except Exception as e:
                        logger.error(f"Error removing expired cached file {info['path']}: {e}")
                    
                    del self.cache_index[url]
                    self._save_cache_index()
                    return None
                
                # Check if file exists
                if not os.path.exists(info['path']):
                    del self.cache_index[url]
                    self._save_cache_index()
                    return None
                
                # Update timestamp to mark as recently used
                info['timestamp'] = current_time
                self._save_cache_index()
                
                return {
                    'path': info['path'],
                    'mime_type': info.get('mime_type')
                }
            
            return None
    
    def put(self, url: str, file_path: str, mime_type: Optional[str] = None) -> None:
        """
        Add a file to the cache.
        
        Args:
            url: URL associated with the file
            file_path: Path to the downloaded file
            mime_type: MIME type of the file
        """
        with self.lock:
            self.cache_index[url] = {
                'path': file_path,
                'timestamp': time.time(),
                'mime_type': mime_type
            }
            
            # Clean up old entries if needed
            if len(self.cache_index) > self.max_size:
                self._cleanup_old_entries()
            else:
                self._save_cache_index()


def download_file(url: str, output_path: str, timeout: int = DOWNLOAD_TIMEOUT) -> Tuple[str, Optional[str]]:
    """
    Download a file from a URL with progress tracking.
    
    Args:
        url: URL to download
        output_path: Path where to save the file
        timeout: Request timeout in seconds
        
    Returns:
        Tuple of (file_path, mime_type)
        
    Raises:
        Exception: If download fails
    """
    try:
        # Create directory if it doesn't exist
        os.makedirs(os.path.dirname(output_path), exist_ok=True)
        
        # Add headers to ensure we get binary content
        headers = {
            'Accept': '*/*',  # Accept any content type
            'User-Agent': 'SAMurai-Downloader/1.0'  # Identify the client
        }
        
        # Stream download to handle large files efficiently
        with requests.get(url, stream=True, timeout=timeout, headers=headers) as response:
            response.raise_for_status()
            
            # Get content type from headers
            content_type = response.headers.get('Content-Type')
            logger.info(f"Downloaded content type: {content_type} from {url}")
            
            # Check Content-Disposition header for the filename
            content_disposition = response.headers.get('Content-Disposition')
            if content_disposition and 'filename=' in content_disposition:
                import re
                filename_match = re.search(r'filename=["\'](.*)["\']', content_disposition)
                if filename_match:
                    suggested_filename = filename_match.group(1)
                    logger.info(f"Server suggested filename: {suggested_filename}")
            
            # Examine first bytes to detect binary content
            first_chunk = next(response.iter_content(chunk_size=8), None)
            if not first_chunk:  # Empty response
                logger.error("Empty response received")
                raise Exception("Empty response received from server")
            
            # Write first chunk and the rest to file
            with open(output_path, 'wb') as f:
                f.write(first_chunk)  # Write the first chunk we already read
                for chunk in response.iter_content(chunk_size=CHUNK_SIZE):
                    if chunk:
                        f.write(chunk)
            
            # Log file size
            file_size = os.path.getsize(output_path)
            logger.info(f"Downloaded {file_size} bytes to {output_path}")
            
            # For debugging, check file signature
            if file_size > 4:
                with open(output_path, 'rb') as f:
                    header_bytes = f.read(4)
                logger.info(f"File signature: {header_bytes!r}")
                
                # If it's a ZIP file, verify the signature
                if content_type == 'application/zip' or url.lower().endswith('.zip'):
                    if header_bytes != b'PK\x03\x04':
                        logger.error(f"File claims to be ZIP but signature is wrong: {header_bytes!r}")
            
            return output_path, content_type
    except Exception as e:
        logger.error(f"Error downloading {url}: {e}")
        if os.path.exists(output_path):
            try:
                os.remove(output_path)
            except:
                pass
        raise


class URLReader(ImageReader):
    """
    Class for reading images and videos from URLs with caching support.
    """
    def __init__(self):
        self.reader_name = 'URLReader'
        # Initialize all supported readers
        self.image_reader = StandardImageReader()
        self.video_reader = SimpleVideoReader()
        self.dicom_reader = DICOMWADOReader()
        self.zip_reader = ZipReader()
        self.temp_download_dir = os.path.join(TMP_IMG_PATH, 'downloaded/')
        Path(self.temp_download_dir).mkdir(parents=True, exist_ok=True)
        
        # Initialize URL cache
        self.cache = URLCache(os.path.join(self.temp_download_dir, 'cache'))
        
        # Thread pool for async operations
        self.executor = ThreadPoolExecutor(max_workers=4)
        
        # Track active downloads
        self.active_downloads = {}

    def __del__(self):
        """Clean up resources when the reader is destroyed."""
        try:
            self.executor.shutdown(wait=False)
        except Exception as e:
            logger.error(f"Error shutting down thread pool: {e}")

    def _get_url_hash(self, url: str) -> str:
        """
        Generate a hash for a URL to use as a filename.
        
        Args:
            url: URL to hash
            
        Returns:
            Hash string
        """
        return hashlib.md5(url.encode()).hexdigest()
    
    def _get_file_extension(self, url: str, mime_type: Optional[str] = None) -> str:
        """
        Get file extension from URL or MIME type.
        
        Args:
            url: URL to analyze
            mime_type: MIME type if known
            
        Returns:
            File extension with dot
        """
        if mime_type and mime_type in MIME_TYPE_TO_EXTENSION:
            return f".{MIME_TYPE_TO_EXTENSION[mime_type]}"
        
        # Try to get extension from URL
        parsed_url = urlparse(url)
        path = parsed_url.path
        ext = os.path.splitext(path)[1].lower()
        
        if ext:
            return ext
        
        return ""  # No extension determined
    
    def validate_format(self, file_path: str) -> bool:
        """
        Validate that the input is a URL.

        Args:
            file_path: Path or URL to validate

        Returns:
            True if file_path is a valid URL, otherwise raises.
        """
        # Only URLs are supported by URLReader
        if not (file_path.startswith("http://") or file_path.startswith("https://")):
            raise FileFormatError(file_path, 'url', 'Input is not a URL')
        return True
    
    def detect_mime(self, file_path: str) -> str:
        """
        Detect MIME type of a file.
        
        Args:
            file_path: Path to the file
            
        Returns:
            MIME type string
        """
        try:
            mime = magic.Magic(mime=True)
            return mime.from_file(file_path)
        except Exception as e:
            logger.error(f"Error detecting MIME type for {file_path}: {e}")
            return "application/octet-stream"  # Default MIME type
    
    def download_copy_file(self, url: str, task_id: Optional[str] = None) -> str:
        """
        Download a file from a URL with caching.
        
        Args:
            url: URL to download
            task_id: Task identifier for progress tracking
            
        Returns:
            Path to the downloaded file
            
        Raises:
            FileReadError: If download fails
        """
        self.validate_format(url)
        
        # ULTIMATE SOLUTION: Special handler for our own API
        if 'im-vid-rendering/render_file' in url and 'file_name=' in url:
            try:
                # Extract the actual file path from our own API to avoid the middleware
                import urllib.parse
                file_path_param = url.split('file_name=')[1].split('&')[0]
                actual_file_path = urllib.parse.unquote(file_path_param)
                
                # CRITICAL DEBUG LOGGING
                logger.info(f"*** DIRECT ACCESS: URL={url} → File path={actual_file_path}")
                
                # If this is our API and the file exists, use it directly!
                if os.path.exists(actual_file_path) and os.path.isfile(actual_file_path):
                    file_size = os.path.getsize(actual_file_path)
                    
                    # Validate it's actually a ZIP file
                    if actual_file_path.lower().endswith('.zip'):
                        with open(actual_file_path, 'rb') as f:
                            header = f.read(4)
                            if header == b'PK\x03\x04':  # ZIP magic number
                                logger.info(f"SUCCESS: Direct access to ZIP file ({file_size} bytes): {actual_file_path}")
                                return actual_file_path
                            else:
                                logger.warning(f"Direct file exists but is not a valid ZIP (wrong header): {actual_file_path}")
                    else:
                        logger.info(f"SUCCESS: Direct access to file ({file_size} bytes): {actual_file_path}")
                        return actual_file_path
            except Exception as e:
                logger.error(f"Error in direct file access: {e}")
                # Continue with normal download if direct access fails
        
        # DEBUGGING: Temporarily bypass cache for ZIP files
        if '.zip' in url.lower():
            logger.info(f"TROUBLESHOOTING: Bypassing cache for ZIP file: {url}")
        else:
            # Check cache first
            cached_info = self.cache.get(url)
            if cached_info:
                logger.debug(f"Using cached file for {url}: {cached_info['path']}")
                return cached_info['path']
        
        # Update status if task_id provided
        if task_id:
            self.update_task_status(
                task_id,
                'url',
                ReaderStatus.URL_DOWNLOAD_STARTED,
                0
            )
        
        # Generate a unique filename based on URL
        url_hash = self._get_url_hash(url)
        # Add timestamp to avoid cache conflicts during debugging
        import time
        temp_path = os.path.join(self.temp_download_dir, 'cache', f"{url_hash}_{int(time.time())}_temp")
        
        # Download the file
        try:
            file_path, mime_type = download_file(url, temp_path)
            
            # Check if the download was successful and contains valid data
            if not os.path.exists(file_path) or os.path.getsize(file_path) == 0:
                logger.error(f"Downloaded file is empty or does not exist: {file_path}")
                raise FileReadError(url, "Downloaded file is empty or does not exist")
            
            # If we're expecting a specific file type, validate the content
            expected_type = None
            if '.zip' in url.lower():
                expected_type = 'zip'
            elif '.dcm' in url.lower():
                expected_type = 'dicom'
                
            if expected_type:
                is_valid = self._validate_file_content(file_path, expected_type)
                if not is_valid:
                    raise FileReadError(url, f"Downloaded content is not a valid {expected_type} file")
            
            # Add appropriate extension based on MIME type
            ext = self._get_file_extension(url, mime_type)
            if ext:
                final_path = f"{file_path}{ext}"
                os.rename(file_path, final_path)
                file_path = final_path
            
            # If MIME type not provided by server, detect it
            if not mime_type:
                mime_type = self.detect_mime(file_path)
            
            # Add to cache
            self.cache.put(url, file_path, mime_type)
            
            # Update status if task_id provided
            if task_id:
                self.update_task_status(
                    task_id,
                    'url',
                    ReaderStatus.URL_DOWNLOAD_COMPLETE,
                    100
                )
            
            return file_path
        except Exception as e:
            error_msg = f"Error downloading {url}: {e}"
            logger.error(error_msg)
            logger.debug(traceback.format_exc())
            
            # Update status if task_id provided
            if task_id:
                self.update_task_status(
                    task_id,
                    'url',
                    ReaderStatus.URL_DOWNLOAD_FAILED,
                    -1
                )
            
            raise FileReadError(url, error_msg)
    
    def _validate_file_content(self, file_path: str, expected_type: str) -> bool:
        """
        Validate that a file contains the expected content type.
        
        Args:
            file_path: Path to the file to validate
            expected_type: Expected file type ('zip', 'dicom', etc.)
            
        Returns:
            True if valid, False otherwise
        """
        try:
            if expected_type.lower() == 'zip':
                # Check ZIP file signature (PK\x03\x04)
                with open(file_path, 'rb') as f:
                    header = f.read(4)
                    if header != b'PK\x03\x04':
                        # Log the first part of the content for debugging
                        with open(file_path, 'rb') as f:
                            content_preview = f.read(100)
                        logger.error(f"Expected ZIP file but got: {content_preview!r}")
                        return False
                return True
            elif expected_type.lower() == 'dicom':
                # Try to open with pydicom
                try:
                    import pydicom
                    pydicom.dcmread(file_path, stop_before_pixels=True)
                    return True
                except Exception as e:
                    logger.error(f"Invalid DICOM file: {e}")
                    return False
            else:
                # For other types, trust mime type detection
                return True
        except Exception as e:
            logger.error(f"Error validating file content: {e}")
            return False

    def get_filetype(self, file_path: str) -> Tuple[str, str]:
        """
        Get the MIME type and file extension of a file.
        
        Args:
            file_path: Path to the file or URL
            
        Returns:
            Tuple of (mime_type, file_extension)
        """
        if file_path.startswith('http'):
            # For URLs, download and check
            local_path = self.download_copy_file(file_path)
            mime_type = self.detect_mime(local_path)
            file_extension = MIME_TYPE_TO_EXTENSION.get(mime_type, 'unknown')
            return mime_type, file_extension
        else:
            # For local files
            mime_type = self.detect_mime(file_path)
            file_extension = MIME_TYPE_TO_EXTENSION.get(mime_type, 'unknown')
            return mime_type, file_extension

    def get_num_frames(self, file_path: str) -> int:
        """
        Get the number of frames in a file.
        
        Args:
            file_path: Path to the file or URL
            
        Returns:
            Number of frames
        """
        if file_path.startswith('http'):
            local_path = self.download_copy_file(file_path)
            mime_type = self.detect_mime(local_path)
            
            if mime_type.startswith('image'):
                return self.image_reader.get_num_frames(local_path)
            elif mime_type.startswith('video'):
                return self.video_reader.get_num_frames(local_path)
            elif mime_type == 'application/dicom':
                return self.dicom_reader.get_num_frames(local_path)
            elif mime_type == 'application/zip':
                return self.zip_reader.get_num_frames(local_path)
        return 0

    def get_fps(self, file_path: str) -> float:
        """
        Get frames per second for a file.
        
        Args:
            file_path: Path to the file or URL
            
        Returns:
            Frames per second
        """
        # Handle remote URLs by downloading first
        if file_path.startswith('http'):
            local_path = self.download_copy_file(file_path)
            mime_type = self.detect_mime(local_path)
            if mime_type.startswith('image'):
                return self.image_reader.get_fps(local_path)
            if mime_type.startswith('video'):
                return self.video_reader.get_fps(local_path)
            if mime_type == 'application/dicom':
                return self.dicom_reader.get_fps(local_path)
            if mime_type == 'application/zip':
                return self.zip_reader.get_fps(local_path)
            return -1
        # Local file path
        return self.video_reader.get_fps(file_path) if file_path.lower().endswith(('.mp4','.avi','.mov')) else \
               self.image_reader.get_fps(file_path) if file_path.lower().endswith(('.png','.jpg','.jpeg','.bmp')) else \
               self.dicom_reader.get_fps(file_path) if file_path.lower().endswith('.dcm') else \
               self.zip_reader.get_fps(file_path) if file_path.lower().endswith('.zip') else -1
    
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        file_type, file_extension = self.get_filetype(file_path)
        # Handle remote URLs by downloading first
        if file_path.startswith('http'):
            local_path = self.download_copy_file(file_path)
            mime_type = self.detect_mime(local_path)
            if mime_type.startswith('image'):
                return self.image_reader.get_image_dimensions(local_path)
            if mime_type.startswith('video'):
                return self.video_reader.get_image_dimensions(local_path)
            if mime_type == 'application/dicom':
                return self.dicom_reader.get_image_dimensions(local_path)
            if mime_type == 'application/zip':
                return self.zip_reader.get_image_dimensions(local_path)
            return -1, -1
        # Local file path
        return self.video_reader.get_image_dimensions(file_path) if file_path.lower().endswith(('.mp4','.avi','.mov')) else \
               self.image_reader.get_image_dimensions(file_path) if file_path.lower().endswith(('.png','.jpg','.jpeg','.bmp')) else \
               self.dicom_reader.get_image_dimensions(file_path) if file_path.lower().endswith('.dcm') else \
               self.zip_reader.get_image_dimensions(file_path) if file_path.lower().endswith('.zip') else (-1, -1)

    def get_image_path(self, file_path: str, frame_num: Optional[int], extra_params: Optional[Dict[str, Any]]) -> str:
        local_path = self.download_copy_file(file_path)
        mime_type = self.detect_mime(local_path)

        if mime_type.startswith("image"):
            return self.image_reader.get_image_path(local_path, frame_num, extra_params)
        elif mime_type.startswith("video"):
            return self.video_reader.get_image_path(local_path, frame_num, extra_params)
        elif mime_type == "application/dicom":
            return self.dicom_reader.get_image_path(local_path, frame_num, extra_params)
        elif mime_type == "application/zip":
            return self.zip_reader.get_image_path(local_path, frame_num, extra_params)
        else:
            raise FileFormatError(local_path, mime_type or "unknown")

    def read_file(self, file_path, frame_num=None, store_images=True, extra_params=None, task_id=None, local_dir=None, async_read=True):
        # Download the URL to local path
        local_path = self.download_copy_file(file_path, task_id=task_id)
        
        # Delegate processing to the main reader for local paths
        from backend.imvid_rendering.imvid_reader import read_file as dispatch_read_file
        result = dispatch_read_file(
            local_path,
            frame_num,
            store_images,
            extra_params,
            task_id,
            async_read
        )
        # Ensure the returned file_path reflects the original URL
        if result and 'result' in result and 'file_path' in result['result']:
            result['result']['file_path'] = file_path
        return result
    

    def render_downloaded_file(self, file_path, frame_num, extra_params, download_file_path, task_id, thread=None):
        if thread:
            thread.join()
        
        mime = magic.Magic(mime=True)
        file_type = mime.from_file(download_file_path)
        file_extension = MIME_TYPE_TO_EXTENSION.get(file_type, 'unknown')
        
        # Add extension if needed
        extension = os.path.splitext(download_file_path)[1]
        if not extension:
            download_file_path1 = download_file_path + '.' + file_extension
            os.rename(download_file_path, download_file_path1)
        else:
            download_file_path1 = download_file_path

        # Route to appropriate reader based on file type
        try:
            if file_type.startswith('image'):
                result = self.image_reader.read_file(
                    download_file_path1, frame_num, store_images=True, 
                    extra_params=extra_params, task_id=task_id
                )
            elif file_type.startswith('video'):
                result = self.video_reader.read_file(
                    download_file_path1, frame_num, store_images=True,
                    extra_params=extra_params, task_id=task_id
                )
            elif file_type == 'application/dicom':
                result = self.dicom_reader.read_file(
                    download_file_path1, frame_num, store_images=True,
                    extra_params=extra_params, task_id=task_id
                )
            elif file_type == 'application/zip':
                result = self.zip_reader.read_file(
                    download_file_path1, frame_num, store_images=True,
                    extra_params=extra_params, task_id=task_id
                )
            else:
                print(f"Unsupported file type: {file_type}")
                result = None
            return result
        except Exception as e:
            print(f"Error processing downloaded file: {e}")
            return None
        
