"""
ZIP Reader Module

This module provides functionality for extracting files from ZIP archives.
"""

import cv2
import os
import logging
import zipfile
import numpy as np
import pydicom
import threading
import concurrent.futures
from glob import glob
from pathlib import Path
from typing import Dict, List, Optional, Tuple, Any
from concurrent.futures import ThreadPoolExecutor
from io import BytesIO
from PIL import Image
import traceback

from backend.imvid_rendering.image_reader import ImageReader, ReaderStatus
from backend.progress_manager.progress_manager import global_progress_manager
from backend.imvid_rendering.dicom_reader import DICOMWADOReader
from backend.imvid_rendering.video_reader import SimpleVideoReader
from backend.imvid_rendering.utils import (
    get_output_dir, 
    TMP_IMG_PATH, 
    SUPPORTED_IMAGE_EXTENSIONS,
    apply_window_level
)

# Configure logging
logger = logging.getLogger(__name__)

# Constants
MAX_WORKERS = 4
DEFAULT_FPS = -1
BATCH_SIZE = 10  # Number of files to process in parallel
MIN_FILES_FOR_PARALLEL = 20  # Minimum number of files to trigger parallel processing

class ZipReader(ImageReader):
    """
    Reader for extracting and processing files from ZIP archives.
    """
    def __init__(self):
        """Initialize the ZIP reader."""
        self.reader_name = 'ZipReader'
        self.cache = {}
        
        # Use lazy initialization for readers to avoid event loop conflicts
        self._video_reader = None
        self._dicom_reader = None
        
        self.is_dicom_series = False
        self.supported_extensions = SUPPORTED_IMAGE_EXTENSIONS + ('.dcm',)
        self._executor = ThreadPoolExecutor(max_workers=MAX_WORKERS)
        self._tasks = {}  # Track active tasks
        
        # Avoid using async/event loop architecture
        # Instead, we'll use the executor directly for all processing
        logger.info("ZipReader initialized (without event loop)")

    @property
    def video_reader(self):
        """Lazy initialization of video reader."""
        if self._video_reader is None:
            self._video_reader = SimpleVideoReader()
        return self._video_reader
        
    @property
    def dicom_reader(self):
        """Lazy initialization of DICOM reader."""
        if self._dicom_reader is None:
            self._dicom_reader = DICOMWADOReader()
        return self._dicom_reader

    def validate_format(self, file_path: str) -> bool:
        """Validate that the file is a ZIP file."""
        if not file_path.lower().endswith('.zip'):
            raise ValueError(f"Not a ZIP file: {file_path}")
        return True

    def get_num_frames(self, file_path: str) -> int:
        """Get the number of valid files in the ZIP."""
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                return len([f for f in zip_ref.namelist() 
                          if any(f.lower().endswith(ext) for ext in self.supported_extensions)])
        except Exception as e:
            logger.error(f"Error reading ZIP file {file_path}: {e}")
            return 0

    def get_fps(self, file_path: str) -> float:
        """Get frames per second for ZIP files."""
        return DEFAULT_FPS
    
    def get_image_dimensions(self, file_path: str) -> Tuple[int, int]:
        """Get dimensions of the first image in the ZIP."""
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                for zip_file in zip_ref.namelist():
                    if any(zip_file.lower().endswith(ext) for ext in self.supported_extensions):
                        with zip_ref.open(zip_file) as f:
                            if zip_file.lower().endswith('.dcm'):
                                self.is_dicom_series = True
                                dicom_data = BytesIO(f.read())
                                ds = pydicom.dcmread(dicom_data)
                                if hasattr(ds, 'Rows') and hasattr(ds, 'Columns'):
                                    return int(ds.Columns), int(ds.Rows)
                            else:
                                self.is_dicom_series = False
                                img_data = BytesIO(f.read())
                                try:
                                    img = Image.open(img_data)
                                    return img.width, img.height
                                except Exception:
                                    pass
        except Exception as e:
            logger.error(f"Error getting dimensions: {e}")
        
        return (0, 0)

    def get_image_path(self, file_path: str, frame_num: Optional[int], 
                      extra_params: Optional[Dict[str, Any]]) -> str:
        """Get the path where extracted files should be stored."""
        return get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)

    def _update_progress(self, task_id: str, status: ReaderStatus, percent: int):
        """Update task progress."""
        if task_id:
            global_progress_manager.update_task(
                task_id=task_id,
                reader_type='zip',
                status=status,
                percent=percent
            )

    def __del__(self):
        """Clean up resources when the reader is destroyed."""
        try:
            # Cancel any pending tasks
            tasks_to_cancel = list(self._tasks.items())
            for task_id, future in tasks_to_cancel:
                try:
                    if not future.done():
                        logger.info(f"Cancelling pending task {task_id}")
                        future.cancel()
                    # Remove from tasks dict
                    if task_id in self._tasks:
                        del self._tasks[task_id]
                except Exception as e:
                    logger.error(f"Error cancelling task {task_id}: {e}")
            
            # Shutdown the executor
            if hasattr(self, '_executor'):
                logger.info("Shutting down executor")
                self._executor.shutdown(wait=False)
                
            # Clean up any initialized readers
            if hasattr(self, '_video_reader') and self._video_reader is not None:
                logger.info("Cleaning up video reader")
                del self._video_reader
                
            if hasattr(self, '_dicom_reader') and self._dicom_reader is not None:
                logger.info("Cleaning up DICOM reader")
                del self._dicom_reader
                
            logger.info("ZipReader resources cleaned up")
        except Exception as e:
            logger.error(f"Error during cleanup: {e}")

    def _extract_files(self, file_path: str, out_dir: str, task_id: str) -> List[str]:
        """Extract files from a ZIP archive with parallel processing for large files."""
        extracted_files = []
        
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # Get supported files
                files_to_extract = [
                    f for f in zip_ref.namelist() 
                    if any(f.lower().endswith(ext) for ext in self.supported_extensions)
                ]
                
                total_files = len(files_to_extract)
                if total_files == 0:
                    logger.warning(f"No supported files found in ZIP: {file_path}")
                    return []
                
                # Check file type and sort files
                self.is_dicom_series = files_to_extract[0].lower().endswith('.dcm')
                
                # Sort files naturally for consistent extraction order
                try:
                    import re
                    def natural_key(s):
                        return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', s)]
                    files_to_extract.sort(key=natural_key)
                except Exception as e:
                    logger.warning(f"Error sorting files, using default sort: {e}")
                    files_to_extract.sort()
                
                # Create extraction directory if it doesn't exist
                if not os.path.exists(out_dir):
                    os.makedirs(out_dir, exist_ok=True)
                
                def extract_single_file(args) -> Optional[str]:
                    """Extract a single file from the ZIP archive."""
                    idx, zip_file = args
                    base_name = os.path.basename(zip_file)
                    out_file = os.path.join(out_dir, f"{idx:05d}_{base_name}")
                    
                    # Skip if already extracted and valid
                    if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                        return out_file
                    
                    try:
                        # Extract file
                        with zip_ref.open(zip_file) as f_in:
                            with open(out_file, 'wb') as f_out:
                                f_out.write(f_in.read())
                                
                        # Verify the file was extracted correctly
                        if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                            return out_file
                        else:
                            logger.error(f"Failed to extract {zip_file}, file is empty or missing")
                            return None
                    except Exception as e:
                        logger.error(f"Error extracting {zip_file}: {e}")
                        # Try to remove the file if it exists but is corrupted
                        if os.path.exists(out_file):
                            try:
                                os.remove(out_file)
                            except Exception:
                                pass
                        return None
                
                # Use parallel processing for large files
                if total_files >= MIN_FILES_FOR_PARALLEL:
                    logger.info(f"Using parallel extraction for {total_files} files")
                    files_with_indices = list(enumerate(files_to_extract))
                    
                    # Process files in batches to avoid memory issues
                    for batch_start in range(0, len(files_with_indices), BATCH_SIZE):
                        batch = files_with_indices[batch_start:batch_start + BATCH_SIZE]
                        
                        # Extract batch in parallel
                        with ThreadPoolExecutor(max_workers=MAX_WORKERS) as executor:
                            results = list(executor.map(extract_single_file, batch))
                            
                            # Filter out None results and add to extracted files
                            successful_extractions = [r for r in results if r is not None]
                            extracted_files.extend(successful_extractions)
            
            # Update progress
                        progress = min(int((batch_start + len(batch)) / total_files * 40) + 10, 50)
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                        
                        # Log batch progress
                        logger.info(f"Extracted batch {batch_start//BATCH_SIZE + 1}/{(total_files + BATCH_SIZE - 1)//BATCH_SIZE}")
                else:
                    # For small files, use sequential processing
                    logger.info(f"Using sequential extraction for {total_files} files")
                    for idx, zip_file in enumerate(files_to_extract):
                        result = extract_single_file((idx, zip_file))
                        if result:
                            extracted_files.append(result)
                        
                        # Update progress
                        progress = min(int((idx + 1) / total_files * 40) + 10, 50)
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                
                # Final verification
                logger.info(f"Extracted {len(extracted_files)} files out of {total_files}")
                if len(extracted_files) < total_files:
                    logger.warning(f"Failed to extract {total_files - len(extracted_files)} files")
                
                return extracted_files
            
        except Exception as e:
            logger.error(f"Error extracting files: {e}")
            logger.error(traceback.format_exc())
            return extracted_files  # Return whatever we could extract successfully

    def _clear_stale_tasks(self):
        """Clear any stale or completed tasks to prevent memory leaks."""
        tasks_to_remove = []
        for task_id, future in self._tasks.items():
            if future.done():
                tasks_to_remove.append(task_id)
                
        for task_id in tasks_to_remove:
            logger.info(f"Removing completed task {task_id}")
            del self._tasks[task_id]

    def read_file(self, file_path: str, frame_num: Optional[int] = None, 
                 store_images: bool = True, extra_params: Optional[Dict[str, Any]] = None, 
                 task_id: Optional[str] = None, local_dir: Optional[str] = None, 
                 async_read: bool = False) -> Dict[str, Any]:
        """Read ZIP file and extract supported files."""
        # Clean up any stale tasks
        self._clear_stale_tasks()
        
        try:
            # Basic validation
            self.validate_format(file_path)
            
            if not os.path.exists(file_path):
                task_id = global_progress_manager.create_task(file_path, extra_params)
                self._update_progress(task_id, ReaderStatus.FILE_NOT_FOUND, -1)
                return {
                    "task_id": task_id,
                    "result": {
                        "file_path": file_path, "extra_params": extra_params,
                        "series_file": None, "images": [], "paths": [],
                        "status": {"zip": ReaderStatus.FILE_NOT_FOUND},
                        "progress": {"zip": -1}
                    }
                }

            # Setup output directories
            local_dir = local_dir or get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
            extracted_dir = os.path.join(local_dir, 'extracted')
            Path(local_dir).mkdir(parents=True, exist_ok=True)
            Path(extracted_dir).mkdir(parents=True, exist_ok=True)
            
            # Get or create task ID
            if task_id is None:
                task_id = global_progress_manager.create_task(file_path, extra_params)
            
            # Check for existing multiframe files
            multiframe_files = glob(os.path.join(extracted_dir, 'series_multiframe.*'))
            
            # Case 1: Multiframe files exist - process them
            if multiframe_files:
                main_file = multiframe_files[0]
                logger.info(f"Using existing multiframe file: {main_file}")
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                
                # Process multiframe file and ensure ALL frames are extracted
                if main_file.lower().endswith('.dcm'):
                    results = self.dicom_reader.read_file(main_file, extra_params=extra_params, task_id=task_id, local_dir=extracted_dir, async_read=False)
                    results['result']['file_path'] = file_path
                    results['result']['series_file'] = main_file
                    results['result']['status']['zip'] = ReaderStatus.ZIP_EXTRACTING_COMPLETE
                    results['result']['progress']['zip'] = 100
                    results['result']['status']['dicom'] = ReaderStatus.DICOM_EXTRACTING_COMPLETE
                    results['result']['progress']['dicom'] = 100
                    self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                    self.update_task_status(task_id, 'dicom', ReaderStatus.DICOM_EXTRACTING_COMPLETE, 100)
                    return results
                elif main_file.lower().endswith(('.mp4', '.avi', '.mov')):
                    result = self.video_reader.read_file(main_file, extra_params=extra_params, task_id=task_id, local_dir=extracted_dir, async_read=False)
                    result['result']['file_path'] = file_path
                    result['result']['series_file'] = main_file
                    result['result']['status']['zip'] = ReaderStatus.ZIP_EXTRACTING_COMPLETE
                    result['result']['progress']['zip'] = 100
                    result['result']['status']['video'] = ReaderStatus.VIDEO_EXTRACTING_COMPLETE
                    result['result']['progress']['video'] = 100
                    self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                    self.update_task_status(task_id, 'video', ReaderStatus.VIDEO_EXTRACTING_COMPLETE, 100)
                    return result
                else:
                    self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                    self.update_task_status(task_id, 'task', ReaderStatus.IMAGE_INVALID_FORMAT, -1)
                    logger.warning(f"Unsupported multiframe file type: {main_file}")
            
            # Case 2: No multiframe files - extract and process
            else:
                logger.info("No multiframe files found, starting extraction process")
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_STARTED, 0)
                
                # Extract files from ZIP
                extracted_files = self._extract_files(file_path, extracted_dir, task_id)
                if not extracted_files:
                    logger.error("No files could be extracted")
                    return {
                        "task_id": task_id,
                        "result": {
                            "file_path": file_path,
                            "extra_params": extra_params,
                            "series_file": None,
                            "images": [],
                            "paths": [],
                            "status": {"zip": ReaderStatus.ZIP_EXTRACTION_FAILED},
                            "progress": {"zip": -1}
                        }
                    }
            
                # Process extracted files based on type
                if self.is_dicom_series:
                    # Create and process DICOM series
                    try:
                        output_file = os.path.join(extracted_dir, 'series_multiframe.dcm')
                        if not os.path.exists(output_file):
                            logger.info("Creating multiframe DICOM from extracted files")
                            output_file = self._process_files(extracted_files, extracted_dir, task_id, extra_params)
                        
                        if output_file and os.path.exists(output_file):
                            logger.info(f"Processing multiframe DICOM: {output_file}")
                            results = self.dicom_reader.read_file(output_file, extra_params=extra_params, task_id=task_id, local_dir=extracted_dir, async_read=False)
                            results['result']['file_path'] = file_path
                            results['result']['series_file'] = output_file
                            results['result']['status']['zip'] = ReaderStatus.ZIP_EXTRACTING_COMPLETE
                            results['result']['progress']['zip'] = 100
                            results['result']['status']['dicom'] = ReaderStatus.DICOM_EXTRACTING_COMPLETE
                            results['result']['progress']['dicom'] = 100
                            self.update_task_status(task_id, 'dicom', ReaderStatus.DICOM_EXTRACTING_COMPLETE, 100)
                            self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                            return results
                    except Exception as e:
                        logger.error(f"Failed to create/process DICOM series: {e}")
                        self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                        self.update_task_status(task_id, 'task', ReaderStatus.IMAGE_INVALID_FORMAT, -1)
                else:
                    # Handle as regular image series
                    try:
                        output_file = os.path.join(extracted_dir, 'series_multiframe.mp4')
                        if not os.path.exists(output_file):
                            logger.info("Creating video from extracted files")
                            output_file = self._process_files(extracted_files, extracted_dir, task_id, extra_params)
                        
                        if output_file and os.path.exists(output_file):
                            logger.info(f"Processing video file: {output_file}")
                            result = self.video_reader.read_file(output_file, extra_params=extra_params, task_id=task_id, local_dir=extracted_dir, async_read=False)
                            result['result']['file_path'] = file_path
                            result['result']['series_file'] = output_file
                            result['result']['status']['zip'] = ReaderStatus.ZIP_EXTRACTING_COMPLETE
                            result['result']['progress']['zip'] = 100
                            result['result']['status']['video'] = ReaderStatus.VIDEO_EXTRACTING_COMPLETE
                            result['result']['progress']['video'] = 100
                            self.update_task_status(task_id, 'video', ReaderStatus.VIDEO_EXTRACTING_COMPLETE, 100)
                            self.update_task_status(task_id, 'zip', ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                            return result
                    except Exception as e:
                        logger.error(f"Failed to create/process video: {e}")
                
            # If we get here, return the extracted files as individual frames
            logger.info(f"Returning {len(extracted_files)} individual files")
            return {
                "task_id": task_id,
                "result": {
                    "file_path": file_path,
                    "extra_params": extra_params,
                    "series_file": None,
                    "images": extracted_files,
                    "paths": extracted_files,
                    "status": {"zip": ReaderStatus.ZIP_EXTRACTING_COMPLETE},
                    "progress": {"zip": 100}
                }
            }
                
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            logger.error(traceback.format_exc())
            return {
                "task_id": task_id,
                "result": {
                    "file_path": file_path,
                    "extra_params": extra_params,
                    "series_file": None,
                    "images": [],
                    "paths": [],
                    "status": {"zip": ReaderStatus.ZIP_EXTRACTION_FAILED},
                    "progress": {"zip": -1}
                }
            }

    def _process_files(self, files: List[str], out_dir: str, task_id: str, extra_params: Optional[Dict[str, Any]] = None) -> Optional[str]:
        """Process extracted files into a multiframe file.
        
        Args:
            files: List of extracted file paths
            out_dir: Directory to store the output file
            task_id: Task ID for progress tracking
            extra_params: Additional parameters including window/level values
            
        Returns:
            Path to the created multiframe file, or None if creation fails
        """
        if not files:
            logger.warning("No files to process")
            return None
            
        try:
            if self.is_dicom_series:
                # Create a multi-frame DICOM
                output_file = os.path.join(out_dir, 'series_multiframe.dcm')
                
                # Skip if already exists and valid
                if os.path.exists(output_file):
                    try:
                        ds = pydicom.dcmread(output_file)
                        if hasattr(ds, 'NumberOfFrames') and ds.NumberOfFrames > 0:
                            logger.info(f"Using existing valid multiframe DICOM: {output_file}")
                            return output_file
                    except Exception:
                        logger.warning("Existing multiframe DICOM is invalid, recreating")
                        try:
                            os.remove(output_file)
                        except Exception:
                            pass
                    
                # Load DICOM files
                dicom_slices = []
                failed_files = []
                total_files = len(files)
                
                # First ensure all files can be read
                for idx, file in enumerate(files):
                    try:
                        ds = pydicom.dcmread(file)
                        dicom_slices.append(ds)
                        
                        # Update progress during loading
                        progress = min(int((idx + 1) / total_files * 20) + 50, 70)  # 50% to 70%
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                    except Exception as e:
                        logger.error(f"Failed to read DICOM file {file}: {e}")
                        failed_files.append(file)
                
                if not dicom_slices:
                    logger.error("No valid DICOM files found")
                    return None
                    
                try:
                    # Sort slices by InstanceNumber if available
                    try:
                        dicom_slices.sort(key=lambda x: getattr(x, 'InstanceNumber', 0))
                    except Exception as e:
                        logger.warning(f"Couldn't sort DICOM slices: {e}")
                    
                    # Stack pixel arrays
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 75)
                    pixel_stack = np.stack([s.pixel_array for s in dicom_slices], axis=0)
                        
                    # Use first slice as template
                    first = dicom_slices[0]
                    first.NumberOfFrames = pixel_stack.shape[0]
                    first.PixelData = pixel_stack.tobytes()
                    first.file_meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian
                    
                    # Set window/level information from extra_params if available
                    if extra_params and 'window_center' in extra_params and 'window_width' in extra_params:
                        first.WindowCenter = float(extra_params['window_center'])
                        first.WindowWidth = float(extra_params['window_width'])
                        logger.info(f"Setting window/level from params: center={first.WindowCenter}, width={first.WindowWidth}")
                    elif hasattr(first, 'WindowCenter') and hasattr(first, 'WindowWidth'):
                        # If these are already present in the first slice, keep them
                        logger.info(f"Preserving window/level from DICOM: center={first.WindowCenter}, width={first.WindowWidth}")
                    else:
                        # Try to compute reasonable defaults based on the pixel data
                        try:
                            # Calculate window width and center based on the full range of pixel values
                            min_val = np.min(pixel_stack)
                            max_val = np.max(pixel_stack)
                            window_width = max_val - min_val
                            window_center = (max_val + min_val) / 2
                            
                            # Add window/level information
                            first.WindowCenter = window_center
                            first.WindowWidth = window_width
                            logger.info(f"Added computed window/level: center={window_center}, width={window_width}")
                        except Exception as e:
                            logger.warning(f"Failed to compute window/level: {e}")
                    
                    # Write multi-frame DICOM
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 90)
                    pydicom.dcmwrite(output_file, first)
                    
                    # Verify the output file
                    if os.path.exists(output_file):
                        try:
                            verification = pydicom.dcmread(output_file)
                            frames = getattr(verification, 'NumberOfFrames', 0)
                            logger.info(f"Created and verified multiframe DICOM with {frames} frames")
                            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                            return output_file
                        except Exception as e:
                            logger.error(f"Failed to verify output DICOM: {e}")
                            if os.path.exists(output_file):
                                os.remove(output_file)
                            return None
                except Exception as e:
                    logger.error(f"Error creating multi-frame DICOM: {e}")
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    return None
            else:
                # Create a video from images
                output_file = os.path.join(out_dir, 'series_multiframe.mp4')
                
                # Skip if already exists and valid
                if os.path.exists(output_file):
                    try:
                        cap = cv2.VideoCapture(output_file)
                        if cap.isOpened():
                            frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                            cap.release()
                            if frame_count > 0:
                                logger.info(f"Using existing valid video: {output_file}")
                                return output_file
                    except Exception:
                        logger.warning("Existing video is invalid, recreating")
                        try:
                            os.remove(output_file)
                        except Exception:
                            pass
                
                try:
                    # Sort files to ensure correct order
                    files.sort()
                    
                    # Read first image to get dimensions
                    first_img = cv2.imread(files[0])
                    if first_img is None:
                        logger.error("Failed to read first image")
                        return None
                    
                    height, width = first_img.shape[:2]
                    fps = 30  # Default FPS for image series
                    
                    # Create video writer
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    out = cv2.VideoWriter(output_file, fourcc, fps, (width, height))
                    
                    # Write frames
                    total_files = len(files)
                    for idx, file in enumerate(files):
                        try:
                            img = cv2.imread(file)
                            if img is not None:
                                out.write(img)
                            
                            # Update progress
                            progress = min(int((idx + 1) / total_files * 20) + 70, 90)  # 70% to 90%
                            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                        except Exception as e:
                            logger.error(f"Error processing image {file}: {e}")

                    # Release video writer
                    out.release()
                    
                    # Verify the output file
                    if os.path.exists(output_file) and os.path.getsize(output_file) > 0:
                        try:
                            cap = cv2.VideoCapture(output_file)
                            if cap.isOpened():
                                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                                cap.release()
                                if frame_count > 0:
                                    logger.info(f"Created and verified video with {frame_count} frames")
                                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                                    return output_file
                        except Exception as e:
                            logger.error(f"Failed to verify output video: {e}")
                    
                    logger.error("Failed to create valid video file")
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    return None
                except Exception as e:
                    logger.error(f"Error creating video: {e}")
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    return None
        except Exception as e:
            logger.error(f"Error in _process_files: {e}")
            logger.error(traceback.format_exc())
            return None