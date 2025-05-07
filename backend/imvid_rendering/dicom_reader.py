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
        except ImportError:
            # Fall back to standard asyncio behavior if our module is not available
            try:
                self._event_loop = asyncio.get_event_loop()
            except RuntimeError:
                self._event_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self._event_loop)
            logger.info(f"{self.reader_name}: Using standard event loop")
            
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

    def _process_frame_batch(self, file_path: str, out_dir: str, start_idx: int, 
                           end_idx: int, task_id: str, total_frames: int, extra_params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Process a batch of frames from the DICOM file."""
        extracted_frames = []
        try:
            # Read DICOM file
            logger.info(f"Reading DICOM file: {file_path}")
            ds = pydicom.dcmread(file_path)
            
            # Log DICOM metadata details to help diagnose issues
            try:
                sop_class = ds.SOPClassUID if hasattr(ds, 'SOPClassUID') else 'Unknown'
                transfer_syntax = ds.file_meta.TransferSyntaxUID if hasattr(ds, 'file_meta') and hasattr(ds.file_meta, 'TransferSyntaxUID') else 'Unknown'
                modality = ds.Modality if hasattr(ds, 'Modality') else 'Unknown'
                logger.info(f"DICOM info - SOPClass: {sop_class}, TransferSyntax: {transfer_syntax}, Modality: {modality}")
            except Exception as e:
                logger.warning(f"Unable to log DICOM metadata: {e}")
            
            # Check for window/level parameters in extra_params
            window_width = None
            window_center = None
            if extra_params:
                window_width = extra_params.get('window_width')
                window_center = extra_params.get('window_center')
                logger.info(f"Using window parameters: width={window_width}, center={window_center}")
            
            # Use DICOM window values if available in the file and not provided in extra_params
            if window_width is None and hasattr(ds, 'WindowWidth'):
                window_width = float(ds.WindowWidth)
            if window_center is None and hasattr(ds, 'WindowCenter'):
                window_center = float(ds.WindowCenter)
            
            # Access pixel array with error handling
            try:
                pixel_array = ds.pixel_array
                logger.info(f"Pixel array shape: {pixel_array.shape}, dtype: {pixel_array.dtype}")
            except Exception as e:
                logger.error(f"Error accessing pixel_array: {e}")
                # Try alternative approach to get pixel data
                try:
                    if hasattr(ds, 'PixelData'):
                        logger.info("Attempting to access raw PixelData attribute")
                        # Handle raw pixel data (implementation depends on DICOM specifics)
                        raise ValueError("Pixel array access failed, manual handling needed for this DICOM format")
                    else:
                        logger.error("No PixelData attribute found in DICOM file")
                        raise ValueError("DICOM file does not contain image data")
                except Exception as nested_e:
                    logger.error(f"Failed alternative pixel data extraction: {nested_e}")
                    raise
            
            # Process frames in batch
            for frame_idx in range(start_idx, end_idx):
                out_path = os.path.join(out_dir, FRAME_FILENAME_FORMAT.format(frame_idx))
                
                # Skip if frame already exists
                if os.path.exists(out_path):
                    logger.debug(f"Frame {frame_idx} already exists at {out_path}")
                    extracted_frames.append(out_path)
                    continue
                
                # Extract and save frame
                try:
                    # Get frame from pixel array
                    if len(pixel_array.shape) == 3:  # Multi-frame DICOM
                        logger.debug(f"Extracting frame {frame_idx} from multi-frame DICOM")
                        frame = pixel_array[frame_idx]
                    else:  # Single frame DICOM
                        logger.debug("Extracting single frame DICOM")
                        frame = pixel_array
                    
                    # Log frame properties
                    logger.debug(f"Frame shape: {frame.shape}, min: {frame.min()}, max: {frame.max()}")
                    
                    # Use shared window/level function
                    frame = apply_window_level(frame, window_width, window_center)
                    
                    # Save frame
                    success = cv2.imwrite(out_path, frame)
                    if not success:
                        logger.error(f"cv2.imwrite failed to save frame to {out_path}")
                        continue
                        
                    # Verify file was written correctly
                    if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                        logger.debug(f"Successfully saved frame {frame_idx} to {out_path}")
                        extracted_frames.append(out_path)
                    else:
                        logger.error(f"Frame {frame_idx} was not saved correctly to {out_path}")
                except Exception as e:
                    logger.error(f"Error processing frame {frame_idx}: {str(e)}")
                    logger.debug(traceback.format_exc())
                
                # Update progress
                if total_frames > 0 and task_id:
                    percent = min(int((frame_idx + 1) / total_frames * 100), 100)
                    self.update_task_status(
                        task_id,
                        'dicom',
                        ReaderStatus.DICOM_EXTRACTING_FRAMES,
                        percent
                    )
                    
        except Exception as e:
            logger.error(f"Error in _process_frame_batch: {str(e)}")
            logger.debug(traceback.format_exc())
            
        # Log summary before returning
        logger.info(f"Processed batch {start_idx}-{end_idx}: extracted {len(extracted_frames)} frames")
        return extracted_frames
    
    async def async_extract_frames(self, file_path: str, out_dir: str, task_id: str, extra_params: Optional[Dict[str, Any]] = None) -> List[str]:
        """Extract frames from a DICOM file asynchronously."""
        try:
            # Update task status
            self.update_task_status(
                task_id,
                'dicom',
                ReaderStatus.DICOM_EXTRACTION_STARTED,
                0
            )

            # Get total frames
            total_frames = self.get_num_frames(file_path)
            logger.info(f"Processing {total_frames} frames")
            
            # Process frames in batches
            all_extracted_frames = []
            batch_size = min(FRAME_BATCH_SIZE, max(10, total_frames // 20))
            
            for start_idx in range(0, total_frames, batch_size):
                end_idx = min(start_idx + batch_size, total_frames)
                
                # Process batch
                extracted_frames = await self._event_loop.run_in_executor(
                    self._executor,
                    self._process_frame_batch,
                    file_path, out_dir, start_idx, end_idx, task_id, total_frames, extra_params
                )
                
                all_extracted_frames.extend(extracted_frames)

                # Update progress
                progress = min(int(end_idx / total_frames * 100), 99)
                self.update_task_status(
                    task_id,
                    'dicom',
                    ReaderStatus.DICOM_EXTRACTING_FRAMES,
                    progress
                )
            
            # Mark as complete
            self.update_task_status(
                task_id,
                'dicom',
                ReaderStatus.DICOM_EXTRACTING_COMPLETE,
                100
            )

            return all_extracted_frames
        except Exception as e:
            logger.error(f"Error extracting frames: {e}")
            self.update_task_status(
                task_id,
                'dicom',
                ReaderStatus.OPERATION_FAILED,
                -1
            )
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
            # Validate input
            if not self.validate_format(file_path):
                raise ValueError(f"Invalid DICOM file: {file_path}")
            
            if not os.path.exists(file_path):
                task_id = global_progress_manager.create_task(file_path, extra_params)
                self.update_task_status(task_id, 'dicom', ReaderStatus.FILE_NOT_FOUND, -1)
                return task_id, {'dicom': ReaderStatus.FILE_NOT_FOUND}
        
            # Set up output directory
            if local_dir is None:
                local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
            Path(local_dir).mkdir(parents=True, exist_ok=True)

            # Get or create task
            if task_id is None:
                task_id = global_progress_manager.create_task(file_path, extra_params)

            # Get existing and expected frames
            existing_frames, expected_frames = self.get_existing_and_expected_frames(file_path, local_dir)
            
            if len(existing_frames) < len(expected_frames):
                # Start extraction
                self.update_task_status(task_id, 'dicom', ReaderStatus.DICOM_EXTRACTION_STARTED, 0)
                if async_read:
                    # Schedule frames extraction asynchronously
                    future = asyncio.run_coroutine_threadsafe(
                        self.async_extract_frames(file_path, local_dir, task_id, extra_params),
                        self._event_loop
                    )
                    self._tasks[task_id] = future
                    
                    # Create a simplified progress message for this async mode
                    status_msg = {'dicom': ReaderStatus.DICOM_EXTRACTION_STARTED}
                    
                    # Return a quick response with task ID and initial status only
                    return task_id, status_msg
                else:
                    try:
                        # Run async task to completion but avoid blocking with .result()
                        future = asyncio.run_coroutine_threadsafe(
                            self.async_extract_frames(file_path, local_dir, task_id, extra_params),
                            self._event_loop
                        )
                        
                        # Get the frames that exist now (even if partial)
                        existing_frames = glob(os.path.join(local_dir, '*.png'))
                        existing_frames.sort()
                        
                        # Return what we have so far with a background task running
                        return task_id, {'dicom': ReaderStatus.DICOM_EXTRACTING_FRAMES, 'frames': existing_frames}
                    except Exception as e:
                        logger.error(f"Error starting extraction: {e}")
                        logger.debug(traceback.format_exc())
                        self.update_task_status(task_id, 'dicom', ReaderStatus.OPERATION_FAILED, -1)
                        raise
            else:
                # All frames already extracted
                self.update_task_status(task_id, 'dicom', ReaderStatus.DICOM_EXTRACTING_COMPLETE, 100)
                
                if frame_num is not None and 0 <= frame_num < len(expected_frames):
                    # Return only requested frame
                    return task_id, {'dicom': ReaderStatus.DICOM_EXTRACTING_COMPLETE, 'frames': [expected_frames[frame_num]]}
                else:
                    # Return all frames
                    return task_id, {'dicom': ReaderStatus.DICOM_EXTRACTING_COMPLETE, 'frames': expected_frames}
                    
        except Exception as e:
            logger.error(f"Error in read_file: {e}")
            logger.debug(traceback.format_exc())
            if task_id:
                self.update_task_status(task_id, 'dicom', ReaderStatus.OPERATION_FAILED, -1)
            raise
