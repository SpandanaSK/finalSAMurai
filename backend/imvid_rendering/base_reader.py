"""
Base reader module defining the abstract interface for all media readers.

This module provides the foundation for all specialized readers in the system,
establishing a consistent interface and common functionality for reading
different types of media files (images, videos, DICOM, ZIP archives, etc.).
"""

from typing import Dict, List, Optional, Tuple, Any, Protocol, Callable
import logging
import time
import os
from enum import Enum
from abc import ABC, abstractmethod
from backend.progress_manager.progress_manager import global_progress_manager

logger = logging.getLogger(__name__)

# Configuration constants
DEFAULT_POLL_INTERVAL = 0.2  # Time between status checks in seconds
MAX_POLL_TIMEOUT = 60     # Maximum time to wait for operations in seconds
DEFAULT_FPS = 30             # Default frames per second for video-like content

class ReaderStatus(Enum):
    """
    Enum for standardized reader status codes across all reader implementations.
    
    These status codes are used to track the progress of file reading operations
    and communicate the current state to the client application.
    """
    # File access statuses
    FILE_NOT_FOUND = "File not found"
    FILE_READ_ERROR = "Error reading file"
    FILE_PERMISSION_DENIED = "Permission denied for file access"
    FILE_CORRUPTED = "File appears to be corrupted or invalid"
    
    # Image specific statuses
    IMAGE_READING_STARTED = "Started reading image"
    IMAGE_READING_COMPLETE = "Image reading complete"
    IMAGE_INVALID_FORMAT = "Invalid image format"
    
    # Video specific statuses
    VIDEO_EXTRACTION_STARTED = "Started video extraction"
    VIDEO_EXTRACTING_FRAMES = "Extracting video frames"
    VIDEO_EXTRACTING_COMPLETE = "Video extraction complete"
    VIDEO_INVALID_FORMAT = "Invalid video format"
    
    # DICOM specific statuses
    DICOM_EXTRACTION_STARTED = "Started DICOM extraction"
    DICOM_EXTRACTING_FRAMES = "Extracting DICOM frames"
    DICOM_EXTRACTING_COMPLETE = "DICOM extraction complete"
    DICOM_INVALID_FORMAT = "Invalid DICOM format"
    
    
    # ZIP specific statuses
    ZIP_EXTRACTION_STARTED = "Started ZIP extraction"
    ZIP_EXTRACTING_FRAMES = "Extracting ZIP contents"
    ZIP_EXTRACTING_COMPLETE = "ZIP extraction complete"
    ZIP_EXTRACTION_FAILED = "ZIP extraction failed"
    ZIP_INVALID_FORMAT = "Invalid ZIP format"
    
    # URL specific statuses
    URL_DOWNLOAD_STARTED = "Started downloading from URL"
    URL_DOWNLOAD_IN_PROGRESS = "Download in progress"
    URL_DOWNLOAD_COMPLETE = "Download complete"
    URL_DOWNLOAD_FAILED = "Download failed"
    URL_INVALID = "Invalid URL format"
    URL_INACCESSIBLE = "URL is inaccessible"
    
    # Generic operation statuses
    OPERATION_TIMEOUT = "Operation timed out"
    OPERATION_CANCELLED = "Operation was cancelled"
    OPERATION_COMPLETE = "Operation completed successfully"
    OPERATION_FAILED = "Operation failed"


class ReaderError(Exception):
    """
    Base exception class for all reader-related errors.
    
    Attributes:
        status (ReaderStatus): The status code associated with this error
        message (str): Detailed error message
        file_path (str): Path to the file that caused the error
    """
    def __init__(self, status: ReaderStatus, message: str, file_path: str = None):
        self.status = status
        self.file_path = file_path
        self.message = message
        super().__init__(f"{status.value}: {message}")


class FileNotFoundError(ReaderError):
    """Exception raised when a file cannot be found."""
    def __init__(self, file_path: str, message: str = "File could not be found"):
        super().__init__(ReaderStatus.FILE_NOT_FOUND, message, file_path)


class FileReadError(ReaderError):
    """Exception raised when a file cannot be read."""
    def __init__(self, file_path: str, message: str = "Error reading file"):
        super().__init__(ReaderStatus.FILE_READ_ERROR, message, file_path)


class FileFormatError(ReaderError):
    """Exception raised when a file has an invalid format."""
    def __init__(self, file_path: str, format_type: str, message: str = None):
        if message is None:
            message = f"Invalid {format_type} format"
        
        if format_type.lower() == "image":
            status = ReaderStatus.IMAGE_INVALID_FORMAT
        elif format_type.lower() == "video":
            status = ReaderStatus.VIDEO_INVALID_FORMAT
        elif format_type.lower() == "dicom":
            status = ReaderStatus.DICOM_INVALID_FORMAT
        elif format_type.lower() == "zip":
            status = ReaderStatus.ZIP_INVALID_FORMAT
        else:
            status = ReaderStatus.FILE_CORRUPTED
            
        super().__init__(status, message, file_path)


class ImageReader(ABC):
    """
    Abstract base class for all media readers.
    
    This class defines the interface that all specialized readers must implement,
    providing a consistent way to read different types of media files and track
    their processing status.
    
    Attributes:
        reader_name (str): Name identifier for the reader implementation
    """
    def __init__(self):
        """
        Initialize the reader with a default name.
        
        Subclasses should override this to set their specific reader name.
        """
        self.reader_name = 'ImageReader'

    @abstractmethod
    def validate_format(self, file_path: str) -> bool:
        """
        Validate if a file can be read by this reader.

        Args:
            file_path: Path to the file to validate

        Returns:
            True if the file can be read, False otherwise
        """
        pass

    @abstractmethod
    def get_image_path(self, file_path: str, frame_num: Optional[int], 
                      extra_params: Optional[Dict[str, Any]]) -> str:
        """
        Get the path where an image should be stored.
        
        Args:
            file_path: Path to the source file
            frame_num: Frame number to extract (for multi-frame sources)
            extra_params: Additional parameters for customizing the extraction
            
        Returns:
            Path where the image should be stored
            
        Raises:
            FileNotFoundError: If the source file doesn't exist
            FileReadError: If there's an error reading the file
            FileFormatError: If the file format is invalid or unsupported
        """
        raise NotImplementedError("Subclasses must implement this method")

    @abstractmethod
    def get_num_frames(self, file_path: str) -> int:
        """
        Get the number of frames in a file.

        Args:
            file_path: The path to the file
            
        Returns:
            The number of frames in the file (1 for single images)
            
        Raises:
            FileNotFoundError: If the file doesn't exist
            FileReadError: If there's an error reading the file
            FileFormatError: If the file format is invalid or unsupported
        """
        raise NotImplementedError("Subclasses must implement this method")
    
    def get_fps(self, file_path: str) -> float:
        """
        Get the frames per second of a video file.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Frames per second or -1 if not applicable (e.g., for single images)
            
        Raises:
            FileNotFoundError: If the file doesn't exist
            FileReadError: If there's an error reading the file
            FileFormatError: If the file format is invalid or unsupported
        """
        return -1.0
    
    @abstractmethod
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        """
        Get the dimensions of an image or video frame.
        
        Args:
            file_path: Path to the file
            
        Returns:
            Tuple of (width, height) in pixels
            
        Raises:
            FileNotFoundError: If the file doesn't exist
            FileReadError: If there's an error reading the file
            FileFormatError: If the file format is invalid or unsupported
        """
        raise NotImplementedError("Subclasses must implement this method")

    @abstractmethod
    def read_file(self, file_path: str, frame_num: Optional[int] = None, 
                  store_images: bool = True, extra_params: Optional[Dict[str, Any]] = None, 
                  task_id: Optional[str] = None, local_dir: Optional[str] = None, 
                  async_read: bool = True) -> Dict[str, Any]:
        """
        Read the content of a file and extract frames as needed.

        This is the main method for accessing file content. It handles extraction
        of frames, progress tracking, and status updates.

        Args:
            file_path: The path to the file to be read
            frame_num: Specific frame to extract (None for all frames)
            store_images: Whether to store extracted images to disk
            extra_params: Additional parameters for customizing the extraction
            task_id: Task identifier for progress tracking
            local_dir: Directory to store extracted frames
            async_read: Whether to perform extraction asynchronously
            
        Returns:
            Dictionary containing task ID and results with the following structure:
            {
                'task_id': str,
                'result': {
                    'file_path': str,
                    'extra_params': dict,
                    'series_file': str or None,
                    'images': list of image paths,
                    'paths': list of expected image paths,
                    'status': dict mapping component to ReaderStatus,
                    'progress': dict mapping component to progress percentage
                }
            }
            
        Raises:
            FileNotFoundError: If the file doesn't exist
            FileReadError: If there's an error reading the file
            FileFormatError: If the file format is invalid or unsupported
        """
        raise NotImplementedError("Subclasses must implement this method")
    
    def update_task_status(self, task_id: str, status_key: str, status: ReaderStatus, progress: int) -> None:
        """
        Update task status and progress in a consistent way.
        
        This helper method provides a standard way to update the progress manager
        with the current status and progress of a task.
        
        Args:
            task_id: Task identifier
            status_key: Key for the status (e.g., 'video', 'image')
            status: Status enum value
            progress: Progress percentage (0-100, or -1 for error)
        """
        try:
            global_progress_manager.set_status(
                task_id,
                status={status_key: status},
                progress={status_key: progress}
            )
        except Exception as e:
            logger.error(f"Error updating task status: {e}")
    
    def wait_for_condition(self, condition_func: Callable[[], bool], 
                          timeout: float = MAX_POLL_TIMEOUT, 
                          interval: float = DEFAULT_POLL_INTERVAL) -> bool:
        """
        Wait for a condition to be true with timeout.
        
        This helper method provides a standard way to wait for asynchronous
        operations to complete, with a timeout to prevent indefinite waiting.
        
        Args:
            condition_func: Function that returns True when condition is met
            timeout: Maximum time to wait in seconds
            interval: Sleep interval between checks in seconds
            
        Returns:
            True if condition was met, False if timed out
            
        Raises:
            Exception: If the condition_func raises an exception
        """
        start_time = time.time()
        while time.time() - start_time < timeout:
            try:
                if condition_func():
                    return True
            except Exception as e:
                logger.error(f"Error in wait condition: {e}")
                raise
            time.sleep(interval)
        return False
    
    def validate_file_exists(self, file_path: str, task_id: Optional[str] = None, 
                            status_key: str = "file") -> bool:
        """
        Validate that a file exists and update status if not.
        
        Args:
            file_path: Path to check
            task_id: Task identifier for updating status
            status_key: Key for the status update
            
        Returns:
            True if file exists, False otherwise
            
        Raises:
            FileNotFoundError: If the file doesn't exist and task_id is None
        """
        if not os.path.exists(file_path):
            if task_id:
                self.update_task_status(task_id, status_key, ReaderStatus.FILE_NOT_FOUND, -1)
                return False
            else:
                raise FileNotFoundError(file_path)
        return True
    
    def handle_reader_error(self, e: Exception, file_path: str, task_id: Optional[str] = None,
                           status_key: str = "file") -> None:
        """
        Handle reader errors in a consistent way.
        
        This helper method provides a standard way to handle exceptions that occur
        during file reading operations, updating the task status as appropriate.
        
        Args:
            e: The exception that occurred
            file_path: Path to the file being processed
            task_id: Task identifier for updating status
            status_key: Key for the status update
            
        Raises:
            ReaderError: If task_id is None, re-raises the exception as a ReaderError
        """
        if isinstance(e, ReaderError):
            status = e.status
            message = e.message
        else:
            status = ReaderStatus.FILE_READ_ERROR
            message = str(e)
            
        logger.error(f"Error reading {file_path}: {message}")
        
        if task_id:
            self.update_task_status(task_id, status_key, status, -1)
        else:
            if isinstance(e, ReaderError):
                raise e
            else:
                raise FileReadError(file_path, message)
