"""
DICOM Reader Module

This module provides functionality for extracting frames from DICOM files with both
synchronous and asynchronous support.
"""

import cv2
import os
import logging
import asyncio
import threading
import pydicom
import numpy as np
from glob import glob
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor
import traceback
import time
import sys

from backend.imvid_rendering.base_reader import ImageReader, ReaderStatus
from backend.progress_manager.progress_manager import global_progress_manager
from backend.imvid_rendering.utils import (
    normalize_read_file_output,
    get_output_dir,
    TMP_IMG_PATH,
    apply_window_level
)

# Configure logging
logger = logging.getLogger(__name__)

# Constants
MAX_WORKERS = 4             # Maximum number of worker threads
FRAME_BATCH_SIZE = 50       # Number of frames to process in a batch
FRAME_FILENAME_FORMAT = "{:05d}.png"  # Format for frame filenames


def get_images(file_path: str, extra_params: Optional[Dict[str, Any]] = None) -> np.ndarray:
    """Get images from a DICOM file with window/level adjustments.
    
    Args:
        file_path: Path to the DICOM file
        extra_params: Optional parameters including window_width and window_center
        
    Returns:
        Numpy array of processed images
    """
    ds = pydicom.dcmread(file_path)
    images = ds.pixel_array
    if len(images.shape) == 2:
        images = np.expand_dims(images, axis=0)

    # Apply modality LUT (rescale)
    images = images * float(ds.get('RescaleSlope', 1)) + float(ds.get('RescaleIntercept', 0))

    # If window/level not provided in extra_params, try to get from DICOM
    if extra_params is None:
        extra_params = {}
    if 'window_width' not in extra_params or 'window_center' not in extra_params:
        if hasattr(ds, 'WindowWidth') and hasattr(ds, 'WindowCenter'):
            extra_params['window_width'] = float(ds.WindowWidth)
            extra_params['window_center'] = float(ds.WindowCenter)
        else:
            # If no window/level in DICOM, use image range
            extra_params['window_width'] = np.max(images) - np.min(images)
            extra_params['window_center'] = (np.max(images) + np.min(images)) / 2

    logger.debug(f"Images shape: {images.shape}, file_path: {file_path}, extra_params: {extra_params}")
    return images


class DICOMWADOReader(ImageReader):
    """
    Reader for extracting frames from DICOM files.
    """
    
    def __init__(self):
        """Initialize the DICOM reader."""
        self.reader_name = 'DICOMReader'
        self.cache = {}  # Cache for DICOM metadata
        self._executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self._tasks = {}  # Track active extraction tasks
        
        # Get the shared event loop
        try:
            from backend.imvid_rendering.event_loop import get_event_loop
            self._event_loop = get_event_loop()
            logger.info(f"{self.reader_name}: Using shared event loop")
            
            # Verify event loop is running
            if not self._event_loop.is_running():
                logger.warning("Event loop is not running, attempting to start it")
                try:
                    asyncio.ensure_future(self._dummy_coro(), loop=self._event_loop)
                    if not self._event_loop.is_running():
                        threading.Thread(target=self._run_event_loop, daemon=True).start()
                        logger.info("Started event loop in background thread")
                except Exception as e:
                    logger.error(f"Failed to start event loop: {e}")
        except ImportError:
            # Fall back to standard asyncio behavior if our module is not available
            try:
                self._event_loop = asyncio.get_event_loop()
            except RuntimeError:
                self._event_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self._event_loop)
            logger.info(f"{self.reader_name}: Using standard event loop")
            
            # Verify event loop is running
            if not self._event_loop.is_running():
                logger.warning("Standard event loop is not running, attempting to start it")
                try:
                    threading.Thread(target=self._run_event_loop, daemon=True).start()
                    logger.info("Started standard event loop in background thread")
                except Exception as e:
                    logger.error(f"Failed to start standard event loop: {e}")

    async def _dummy_coro(self):
        """Dummy coroutine to keep event loop alive."""
        while True:
            await asyncio.sleep(1)

    def _run_event_loop(self):
        """Run the event loop in a separate thread."""
        try:
            asyncio.set_event_loop(self._event_loop)
            self._event_loop.run_forever()
        except Exception as e:
            logger.error(f"Error in event loop thread: {e}")
    
    def __del__(self):
        """Clean up resources when the reader is destroyed."""
        try:
            # Cancel any running tasks
            for task_id, task in self._tasks.items():
                if not task.done():
                    task.cancel()
            
            # Don't stop the event loop as it's now shared
            
            # Shutdown the executor
            self._executor.shutdown(wait=False)
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")
    
    def validate_format(self, file_path: str) -> bool:
        """Validate that the file is a DICOM file."""
        try:
            pydicom.dcmread(file_path, stop_before_pixels=True)
            return True
        except Exception as e:
            logger.error(f"Invalid DICOM file: {e}")
            return False

    def get_num_frames(self, file_path: str) -> int:
        """Get the number of frames in a DICOM file."""
        try:
            ds = pydicom.dcmread(file_path, stop_before_pixels=True)
            return int(ds.NumberOfFrames) if hasattr(ds, 'NumberOfFrames') else 1
        except Exception as e:
            logger.error(f"Error getting frame count: {e}")
            return 0

    def get_fps(self, file_path: str) -> float:
        """Get the frames per second of a DICOM file."""
        try:
            ds = pydicom.dcmread(file_path, stop_before_pixels=True)
            if hasattr(ds, 'CineRate'):
                return float(ds.CineRate)
            return -1  # Default FPS if not specified
        except Exception as e:
            logger.error(f"Error getting FPS: {e}")
            return -1
        
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        """Get the dimensions of DICOM frames."""
        try:
            ds = pydicom.dcmread(file_path, stop_before_pixels=True)
            return (int(ds.Columns), int(ds.Rows))
        except Exception as e:
            logger.error(f"Error getting dimensions: {e}")
            return (0, 0)
    
    def get_existing_and_expected_frames(self, file_path: str, out_dir: str) -> Tuple[List[str], List[str]]:
        """Get lists of existing and expected frame files.
        
        Args:
            file_path: Path to the DICOM file
            out_dir: Directory where frames are stored
            
        Returns:
            Tuple containing (existing_frames, expected_frames)
        """
        try:
            # Get total frames in DICOM
            total_frames = self.get_num_frames(file_path)
            
            # Get list of expected frames
            expected_frames = [
                os.path.join(out_dir, FRAME_FILENAME_FORMAT.format(i))
                for i in range(total_frames)
            ]
            
            # Get list of existing frames - use recursive glob to ensure we find all PNGs
            frame_patterns = [
                os.path.join(out_dir, "*.png"),
                os.path.join(out_dir, "*", "*.png")  # Also check subdirectories
            ]
            
            existing_frames = []
            for pattern in frame_patterns:
                existing_frames.extend(glob(pattern))
            
            # Sort by frame number
            existing_frames = sorted(existing_frames)
            
            # Extra check: Verify all expected files that actually exist are included
            for frame_path in expected_frames:
                if os.path.exists(frame_path) and frame_path not in existing_frames:
                    existing_frames.append(frame_path)
            
            # Re-sort after additions
            existing_frames = sorted(existing_frames)
            
            logger.info(f"DICOM Reader: Found {len(existing_frames)} existing frames out of {len(expected_frames)} expected frames")
            return existing_frames, expected_frames
        except Exception as e:
            logger.error(f"Error in get_existing_and_expected_frames: {e}")
            # Return empty lists on error
            return [], []
    
    def get_image_path(self, file_path: str, frame_num: Optional[int] = None, 
                      extra_params: Optional[Dict[str, Any]] = None) -> str:
        """Get the path where a specific frame should be stored.
        
        Args:
            file_path: Path to the DICOM file
            frame_num: Frame number to extract (optional)
            extra_params: Additional parameters (optional)
            
        Returns:
            Path where the image should be stored
        """
        return get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
    

    async def async_extract_frames(self, file_path: str, out_dir: str, task_id: str, extra_params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Extract frames from a DICOM file asynchronously."""
        try:
            
            if not os.path.exists(file_path):
                logger.error(f"DICOM file does not exist: {file_path}")
                return []
                
            if not os.path.exists(out_dir):
                logger.debug(f"Creating output directory: {out_dir}")
                os.makedirs(out_dir, exist_ok=True)

            # Update task status
            try:
                self.update_task_status(
                    task_id,
                    'dicom',
                    ReaderStatus.DICOM_EXTRACTION_STARTED,
                    0
                )
                logger.info('DICOM extraction status updated to STARTED')
            except Exception as e:
                logger.error(f"Failed to update task status: {e}")

            print('DICOM extraction started')
            sys.stdout.flush()  # Force flush stdout
            
            # Get total frames
            try:
                total_frames = self.get_num_frames(file_path)
                logger.info(f"Processing {total_frames} frames")
            except Exception as e:
                logger.error(f"Failed to get number of frames: {e}")
                return []
            
            # check if expected frames are present
            existing_frames, expected_frames = self.get_existing_and_expected_frames(file_path, out_dir)
            if len(existing_frames) == len(expected_frames):
                logger.info(f"All frames already exist, skipping extraction")
                return existing_frames

            # Process frames in batches
            all_extracted_frames = []
            batch_size = min(FRAME_BATCH_SIZE, max(10, total_frames // 20))
            
            try:
                images = get_images(file_path, extra_params)
                for i in range(total_frames):
                    frame_path = os.path.join(out_dir, FRAME_FILENAME_FORMAT.format(i))
                    if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                        all_extracted_frames.append(frame_path)
                        continue
                    try:
                        cv2.imwrite(frame_path, images[i])
                        if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                            if i % 50 == 0:
                                logger.debug(f"Successfully wrote frame {i} to {frame_path}")
                            all_extracted_frames.append(frame_path)
                        else:
                            logger.error(f"Failed to write frame {i} - file does not exist or is empty")
                    except Exception as e:
                        logger.error(f"Error writing frame {i}: {e}")
                    
                    self.update_task_status(
                        task_id,
                        'dicom',
                        ReaderStatus.DICOM_EXTRACTING_FRAMES,
                        int(i/total_frames*100)
                    )
                
                logger.info(f"Extracted {len(all_extracted_frames)} frames out of {total_frames} expected")
            except Exception as e:
                logger.error(f"Error during frame extraction: {e}")
                logger.error(traceback.format_exc())
                return []

            # Mark as complete
            try:
                self.update_task_status(
                    task_id,
                    'dicom',
                    ReaderStatus.DICOM_EXTRACTING_COMPLETE,
                    100
                )
                logger.info("DICOM extraction completed successfully")
            except Exception as e:
                logger.error(f"Failed to update completion status: {e}")

            return all_extracted_frames
        except Exception as e:
            logger.error(f"Error in async_extract_frames: {e}")
            logger.error(traceback.format_exc())
            try:
                self.update_task_status(
                    task_id,
                    'dicom',
                    ReaderStatus.OPERATION_FAILED,
                    -1
                )
            except Exception as status_e:
                logger.error(f"Failed to update error status: {status_e}")
            return []

    def sync_extract_frames(self, file_path: str, out_dir: str, task_id: str, extra_params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Synchronous version of frame extraction."""
        try:
            logger.info("Starting sync extraction")
            loop = asyncio.new_event_loop()
            asyncio.set_event_loop(loop)
            result = loop.run_until_complete(self.async_extract_frames(file_path, out_dir, task_id, extra_params))
            loop.close()
            return result
        except Exception as e:
            logger.error(f"Error in sync extraction: {e}")
            logger.error(traceback.format_exc())
            return []

    @normalize_read_file_output
    def read_file(self, file_path: str, frame_num: Optional[int] = None, 
                 store_images: bool = True, extra_params: Optional[Dict[str, Any]] = None, 
                 task_id: Optional[str] = None, local_dir: Optional[str] = None, 
                 async_read: bool = True) -> Dict[str, Any]:
        """Read a DICOM file and extract frames.
        
        This method supports both asynchronous and non-blocking synchronous modes.
        Even when async_read is False, the implementation uses non-blocking callbacks
        to avoid freezing the main thread or causing debugger issues.
        
        Args:
            file_path: Path to the DICOM file
            frame_num: Optional frame number to extract specifically
            store_images: Whether to store extracted images
            extra_params: Additional parameters
            task_id: Task ID for progress tracking
            local_dir: Directory to store extracted frames
            async_read: If True, runs fully asynchronously; if False, still uses non-blocking approach
            
        Returns:
            Dictionary with task ID and status, or the extracted frames
            
        Raises:
            ValueError: If file is invalid or cannot be read
        """
        try:
            logger.info(f"Starting read_file for {file_path}")
            logger.info(f"Parameters: frame_num={frame_num}, async_read={async_read}, task_id={task_id}, extra_params={extra_params}")
            
            # Validate input
            if not self.validate_format(file_path):
                logger.error(f"File validation failed for {file_path}")
                raise ValueError(f"Invalid DICOM file: {file_path}")
            
            if not os.path.exists(file_path):
                logger.error(f"File not found: {file_path}")
                task_id = global_progress_manager.create_task(file_path, extra_params)
                self.update_task_status(task_id, 'dicom', ReaderStatus.FILE_NOT_FOUND, -1)
                return [], []
        
            # Set up output directory
            if local_dir is None:
                local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
            Path(local_dir).mkdir(parents=True, exist_ok=True)
            logger.info(f"Using output directory: {local_dir}")

            # Get or create task
            if task_id is None:
                task_id = global_progress_manager.create_task(file_path, extra_params)
                logger.info(f"Created new task with ID: {task_id}")
            else:
                logger.info(f"Using existing task ID: {task_id}")

            # Get existing and expected frames
            existing_frames, expected_frames = self.get_existing_and_expected_frames(file_path, local_dir)
            logger.info(f"Found {len(existing_frames)} existing frames out of {len(expected_frames)} expected")
             
            if len(existing_frames) < len(expected_frames):
                logger.info("Need to extract missing frames")
                # 1. do the extraction asynchronously with extra params for windowing 
                # 2. extract the frame required immediately using frame_num and return the frame after storing it
                if async_read:
                    logger.info("Starting async extraction")
                    try:
                        future = asyncio.run_coroutine_threadsafe(
                            self.async_extract_frames(file_path, local_dir, task_id, extra_params),
                            self._event_loop
                        )
                        self._tasks[task_id] = future
                        logger.info(f"Async task created and stored with ID: {task_id}")
                        
                        # Add a quick check if the task started
                        if task_id in self._tasks:
                            logger.info(f"Task {task_id} is in tasks dictionary")
                            if self._tasks[task_id].done():
                                logger.info(f"Task {task_id} completed immediately")
                                if self._tasks[task_id].exception():
                                    logger.error(f"Task failed with error: {self._tasks[task_id].exception()}")
                            else:
                                logger.info(f"Task {task_id} is running")
                    except Exception as e:
                        logger.error(f"Failed to start async extraction: {e}")
                        logger.error(traceback.format_exc())
                else:
                    logger.info("Starting sync extraction")
                    existing_frames = self.sync_extract_frames(file_path, local_dir, task_id, extra_params)
                    return existing_frames, existing_frames
            else:
                logger.info("All frames already exist, skipping extraction")
            
            if frame_num is not None:
                logger.info(f"Processing specific frame: {frame_num}")
                expected_frame = expected_frames[frame_num]
                existing_frame = existing_frames[frame_num] if frame_num < len(existing_frames) else None
                
                if existing_frame and os.path.exists(existing_frame):
                    logger.info(f"Using existing frame: {existing_frame}")
                    return [existing_frame], [expected_frame]
                else:
                    logger.info(f"Extracting single frame {frame_num}")
                    # read file with pydicom, window and store the frame
                    images = get_images(file_path, extra_params)
                    cv2.imwrite(expected_frame, images[frame_num])
                    logger.info(f"Wrote frame to: {expected_frame}")
                    return [expected_frame], [expected_frame]
            else:
                # extract at least first 10 frames and extract rest asynchronously
                logger.info("Returning at least first 10 frames after extracting")
                images = get_images(file_path, extra_params)[:10]
                existing_frames = []
                for i, image in enumerate(images):
                    frame_path = os.path.join(local_dir, FRAME_FILENAME_FORMAT.format(i))
                    cv2.imwrite(frame_path, image)
                    logger.debug(f"Wrote frame {i} to {frame_path}")
                    existing_frames.append(frame_path)
                return existing_frames, expected_frames
            
        except Exception as e:
            logger.error(f"Error in read_file: {e}")
            logger.error(traceback.format_exc())
            if task_id:
                self.update_task_status(task_id, 'dicom', ReaderStatus.OPERATION_FAILED, -1)
            raise
