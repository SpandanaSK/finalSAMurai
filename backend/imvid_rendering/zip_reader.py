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

    def _extract_and_process_sync(self, file_path: str, out_dir: str, task_id: str) -> List[str]:
        """Extract and process files from ZIP synchronously."""
        try:
            # Create extraction directory
            extracted_path = os.path.join(out_dir, 'extracted')
            Path(extracted_path).mkdir(parents=True, exist_ok=True)
            
            # Update progress
            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_STARTED, 0)
            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 10)
            
            # Extract files from ZIP
            extracted_files = self._extract_files(file_path, extracted_path, task_id)
            if not extracted_files:
                logger.warning(f"No files extracted from {file_path}")
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_FAILED, -1)
                return []
            
            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 50)
            
            # Create multiframe file from extracted files
            output_file = self._process_files(extracted_files, extracted_path, task_id)
            
            if output_file and os.path.exists(output_file):
                logger.info(f"Successfully created series file: {output_file}")
                return [output_file]
            else:
                logger.warning(f"Could not create series file, returning {len(extracted_files)} individual files")
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                return extracted_files
            
        except Exception as e:
            logger.error(f"Error in extraction/processing: {e}")
            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_FAILED, -1)
            return []

    def _clear_stale_tasks(self):
        """Clear any stale or completed tasks to prevent memory leaks."""
        tasks_to_remove = []
        for task_id, future in self._tasks.items():
            if future.done():
                tasks_to_remove.append(task_id)
                
        for task_id in tasks_to_remove:
            logger.info(f"Removing completed task {task_id}")
            del self._tasks[task_id]

    def _process_result_files(self, files: List[str], task_id: str, extra_params: Optional[Dict[str, Any]]) -> Dict[str, Any]:
        """Process extracted files with appropriate reader.
        
        Args:
            files: List of extracted files
            task_id: Task ID for progress tracking
            extra_params: Additional parameters
            
        Returns:
            Dict containing processed result data including series_file, images, and paths
        """
        if not files:
            logger.warning("No files to process")
            return {"series_file": None, "images": [], "paths": []}
            
        # Find the main output file (multiframe or first file)
        main_file = next((f for f in files if 'series_multiframe' in f), files[0] if files else None)
        if not main_file:
            return {"series_file": None, "images": [], "paths": files}
            
        logger.info(f"Using file: {main_file}")
        extraction_dir = os.path.dirname(main_file)
        
        # Prepare result structure
        result = {"series_file": main_file, "images": [], "paths": []}
        
        # Process based on file type
        if main_file.lower().endswith('.dcm'):
            try:
                # Force refresh of all frames in the directory
                frame_pattern = os.path.join(extraction_dir, "*.png")
                existing_frames = sorted(glob(frame_pattern))
                
                # Get total expected frames
                ds = pydicom.dcmread(main_file)
                total_frames = getattr(ds, 'NumberOfFrames', 1)
                expected_frames = [os.path.join(extraction_dir, f"{i:05d}.png") for i in range(total_frames)]
                
                # Important: Extract ALL frames immediately to fix the mismatch
                if len(existing_frames) < total_frames:
                    # Get pixel array once
                    pixel_array = ds.pixel_array
                    
                    # Process in batches of 50 to avoid memory issues
                    batch_size = 50
                    for batch_start in range(0, total_frames, batch_size):
                        batch_end = min(batch_start + batch_size, total_frames)
                        logger.info(f"Extracting frames {batch_start} to {batch_end-1}")
                        
                        for i in range(batch_start, batch_end):
                            out_path = expected_frames[i]
                            # Skip if already exists
                            if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                                continue
                                
                            try:
                                frame = pixel_array[i] if len(pixel_array.shape) > 2 else pixel_array
                                
                                # Apply windowing if parameters are available in extra_params
                                window_width = None
                                window_center = None
                                if extra_params:
                                    window_width = extra_params.get('window_width')
                                    window_center = extra_params.get('window_center')
                                
                                # Use DICOM window values if available in the file and not provided in extra_params
                                if window_width is None and hasattr(ds, 'WindowWidth'):
                                    window_width = float(ds.WindowWidth)
                                if window_center is None and hasattr(ds, 'WindowCenter'):
                                    window_center = float(ds.WindowCenter)
                                    
                                # Use shared window/level function
                                frame = apply_window_level(frame, window_width, window_center)
                                
                                cv2.imwrite(out_path, frame)
                            except Exception as e:
                                logger.error(f"Error extracting frame {i}: {e}")
                
                # Get final list of all extracted frames that exist
                all_frames = []
                for frame_path in expected_frames:
                    if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                        all_frames.append(frame_path)
                
                # Set result data with ALL extracted frames
                result["images"] = all_frames
                result["paths"] = expected_frames
                
                # Start DICOM reader in background to ensure proper indexing
                task_info = global_progress_manager.get_task_info_by_id(task_id)
                if not task_info or 'dicom' not in task_info.get('status', {}):
                    logger.info(f"Starting DICOM reader for {main_file}")
                    extra_params = dict(extra_params) or {'series_file': main_file}
                    extra_params['series_file'] = main_file
                    self.dicom_reader.read_file(
                        main_file,
                        extra_params=extra_params,
                        task_id=task_id,
                        local_dir=extraction_dir,
                        async_read=True
                    )
            except Exception as e:
                logger.error(f"Error processing DICOM file {main_file}: {e}")
            
        elif main_file.lower().endswith(('.mp4', '.avi', '.mov')):
            try:
                # Keep a copy of the original PNG files for fallback
                frame_pattern = os.path.join(extraction_dir, "*.png")
                original_png_files = sorted(glob(frame_pattern))
                logger.info(f"Found {len(original_png_files)} original PNG files before video processing")
                
                # Process with video reader
                extra_params_with_zip = {}
                if extra_params:
                    extra_params_with_zip.update(extra_params)
                extra_params_with_zip['from_zip'] = True
                
                video_result = self.video_reader.read_file(
                    main_file,
                    extra_params=extra_params_with_zip,
                    task_id=task_id,
                    async_read=False
                )
                
                # Handle different return formats
                if isinstance(video_result, tuple) and len(video_result) == 2:
                    # Check each path to see if it exists
                    images = []
                    for frame_path in video_result[1]:
                        if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                            images.append(frame_path)
                    
                    # Fall back to original PNGs if no frames were extracted
                    if not images and original_png_files:
                        logger.info(f"No frames extracted by video reader, falling back to {len(original_png_files)} original PNG files")
                        result["images"] = original_png_files
                        result["paths"] = original_png_files
                    else:
                        result["images"] = images
                        result["paths"] = video_result[1]
                elif isinstance(video_result, dict) and 'result' in video_result:
                    # Check each path to see if it exists
                    paths = video_result['result'].get('paths', [])
                    images = []
                    for frame_path in paths:
                        if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                            images.append(frame_path)
                    
                    # Fall back to original PNGs if no frames were extracted
                    if not images and original_png_files:
                        logger.info(f"No frames extracted by video reader, falling back to {len(original_png_files)} original PNG files")
                        result["images"] = original_png_files
                        result["paths"] = original_png_files
                    else:
                        result["images"] = images
                        result["paths"] = paths
            except Exception as e:
                logger.error(f"Error processing video file {main_file}: {e}")
        
        return result

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
                    try:
                        # Force extraction of all frames
                        ds = pydicom.dcmread(main_file)
                        total_frames = getattr(ds, 'NumberOfFrames', 1)
                        expected_frames = [os.path.join(extracted_dir, f"{i:05d}.png") for i in range(total_frames)]
                        
                        # Check how many frames already exist
                        existing_frames = []
                        for frame_path in expected_frames:
                            if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                                existing_frames.append(frame_path)
                        
                        logger.info(f"Found {len(existing_frames)} frames before processing")
                        
                        # Extract any missing frames directly
                        if len(existing_frames) < total_frames:
                            # Get pixel array once
                            pixel_array = ds.pixel_array
                            
                            # Process all frames
                            for i in range(total_frames):
                                out_path = expected_frames[i]
                                # Skip if already exists
                                if os.path.exists(out_path) and os.path.getsize(out_path) > 0:
                                    continue
                                    
                                try:
                                    frame = pixel_array[i] if len(pixel_array.shape) > 2 else pixel_array
                                    
                                    # Apply windowing if parameters are available in extra_params
                                    window_width = None
                                    window_center = None
                                    if extra_params:
                                        window_width = extra_params.get('window_width')
                                        window_center = extra_params.get('window_center')
                                    
                                    # Use DICOM window values if available in the file and not provided in extra_params
                                    if window_width is None and hasattr(ds, 'WindowWidth'):
                                        window_width = float(ds.WindowWidth)
                                    if window_center is None and hasattr(ds, 'WindowCenter'):
                                        window_center = float(ds.WindowCenter)
                                        
                                    # Use shared window/level function
                                    frame = apply_window_level(frame, window_width, window_center)
                                    
                                    cv2.imwrite(out_path, frame)
                                except Exception as e:
                                    logger.error(f"Error extracting frame {i}: {e}")
                    except Exception as e:
                        logger.error(f"Error pre-processing DICOM frames: {e}")
                
                # Process the multiframe file normally after pre-extraction
                processed_result = self._process_result_files(multiframe_files, task_id, extra_params)
                
                # Make sure all frames are checked again after processing
                if processed_result["series_file"] and processed_result["series_file"].lower().endswith('.dcm'):
                    try:
                        # Re-check for all frames that have been extracted
                        all_frames = []
                        for frame_path in processed_result["paths"]:
                            if os.path.exists(frame_path) and os.path.getsize(frame_path) > 0:
                                all_frames.append(frame_path)
                        
                        # Update results with all available frames
                        processed_result["images"] = all_frames
                        logger.info(f"Final check found {len(all_frames)} frames out of {len(processed_result['paths'])} expected")
                    except Exception as e:
                        logger.error(f"Error in final frame check: {e}")
                
                return {
                    "task_id": task_id,
                    "result": {
                        "file_path": file_path, "extra_params": extra_params,
                        "series_file": processed_result["series_file"],
                        "images": processed_result["images"],
                        "paths": processed_result["paths"],
                        "status": {"zip": ReaderStatus.ZIP_EXTRACTING_COMPLETE},
                        "progress": {"zip": 100}
                    }
                }
            
            # Case 2: Check for existing extracted files
            extracted_files = sorted(glob(os.path.join(extracted_dir, '*.*')))
            extracted_files = [f for f in extracted_files if any(f.lower().endswith(ext) for ext in self.supported_extensions)]
            
            # Get expected files count from ZIP
            expected_count = 0
            try:
                with zipfile.ZipFile(file_path, 'r') as zip_ref:
                    expected_count = len([f for f in zip_ref.namelist() 
                                        if any(f.lower().endswith(ext) for ext in self.supported_extensions)])
            except Exception as e:
                logger.error(f"Error reading ZIP contents: {e}")
            
            # Case 3: Need to extract files (missing files or first run)
            if len(extracted_files) < expected_count or not extracted_files:
                logger.info(f"Starting extraction for {file_path}")
                
                # Extract and process files
                try:
                    extracted_files = self._extract_and_process_sync(file_path, local_dir, task_id)
                    if not extracted_files:
                        logger.error(f"No files extracted from {file_path}")
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_FAILED, -1)
                        return {
                            "task_id": task_id,
                            "result": {
                                "file_path": file_path, "extra_params": extra_params,
                                "series_file": None, "images": [], "paths": [],
                                "status": {"zip": ReaderStatus.ZIP_EXTRACTION_FAILED},
                                "progress": {"zip": -1}
                            }
                        }
                    
                    # Process the extracted files
                    processed_result = self._process_result_files(extracted_files, task_id, extra_params)
                    return {
                        "task_id": task_id,
                        "result": {
                            "file_path": file_path, "extra_params": extra_params,
                            "series_file": processed_result["series_file"],
                            "images": processed_result["images"],
                            "paths": processed_result["paths"],
                            "status": {"zip": ReaderStatus.ZIP_EXTRACTING_COMPLETE},
                            "progress": {"zip": 100}
                        }
                    }
                except Exception as e:
                    logger.error(f"Error in synchronous extraction: {e}")
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_FAILED, -1)
                    return {
                        "task_id": task_id,
                        "result": {
                            "file_path": file_path, "extra_params": extra_params,
                            "series_file": None, "images": [], "paths": [],
                            "status": {"zip": ReaderStatus.ZIP_EXTRACTION_FAILED},
                            "progress": {"zip": -1}
                        }
                    }
            
            # Case 4: Use existing extracted files
            else:
                logger.info(f"Using existing extracted files for {file_path}")
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                
                processed_result = self._process_result_files(extracted_files, task_id, extra_params)
                return {
                    "task_id": task_id,
                    "result": {
                        "file_path": file_path, "extra_params": extra_params,
                        "series_file": processed_result["series_file"],
                        "images": processed_result["images"],
                        "paths": processed_result["paths"],
                        "status": {"zip": ReaderStatus.ZIP_EXTRACTING_COMPLETE},
                        "progress": {"zip": 100}
                    }
                }
                
        except Exception as e:
            logger.error(f"Error reading file {file_path}: {e}")
            if task_id:
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTION_FAILED, -1)
            
            return {
                "task_id": task_id or "error",
                "result": {
                    "file_path": file_path, "extra_params": extra_params,
                    "series_file": None, "images": [], "paths": [],
                    "status": {"zip": ReaderStatus.ZIP_EXTRACTION_FAILED},
                    "progress": {"zip": -1}
                }
            }

    def _extract_files(self, file_path: str, out_dir: str, task_id: str) -> List[str]:
        """Extract files from a ZIP archive."""
        extracted_files = []
        
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # Get files with supported extensions
                files_to_extract = [f for f in zip_ref.namelist() 
                                   if any(f.lower().endswith(ext) for ext in self.supported_extensions)]
                
                # Check if we have files to extract
                total_files = len(files_to_extract)
                if total_files == 0:
                    logger.warning(f"No supported files found in ZIP: {file_path}")
                    return []
                
                # Determine file type and sort files
                self.is_dicom_series = files_to_extract[0].lower().endswith('.dcm')
                
                # Sort files naturally
                try:
                    import re
                    def natural_key(s):
                        return [int(c) if c.isdigit() else c.lower() for c in re.split(r'(\d+)', s)]
                    files_to_extract.sort(key=natural_key)
                except Exception:
                    files_to_extract.sort()
                
                # Extract files
                for idx, zip_file in enumerate(files_to_extract):
                    # Create output filename
                    base_name = os.path.basename(zip_file)
                    out_file = os.path.join(out_dir, f"{idx:05d}_{base_name}")
                    
                    # Skip if already extracted
                    if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                        extracted_files.append(out_file)
                        continue
                    
                    # Extract file
                    try:
                        with zip_ref.open(zip_file) as f_in, open(out_file, 'wb') as f_out:
                            f_out.write(f_in.read())
                            
                        # Verify extraction
                        if os.path.exists(out_file) and os.path.getsize(out_file) > 0:
                            extracted_files.append(out_file)
                        else:
                            logger.error(f"Failed to extract {zip_file}")
                    except Exception as e:
                        logger.error(f"Error extracting {zip_file}: {e}")
                        # Clean up corrupted file
                        if os.path.exists(out_file):
                            try:
                                os.remove(out_file)
                            except Exception:
                                pass
                    
                    # Update progress (10% to 50%)
                    progress = min(int((idx + 1) / total_files * 40) + 10, 50)
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                
                # Final verification
                logger.info(f"Extracted {len(extracted_files)} files out of {total_files}")
                return extracted_files
                
        except Exception as e:
            logger.error(f"Error extracting files: {e}")
            return extracted_files

    def _process_files(self, files: List[str], out_dir: str, task_id: str) -> Optional[str]:
        """Process extracted files."""
        if not files:
            logger.warning("No files to process for task_id: %s", task_id)
            return None
            
        try:
            if self.is_dicom_series:
                # Create a multi-frame DICOM
                output_file = os.path.join(out_dir, 'series_multiframe.dcm')
                
                # Skip if already exists
                if os.path.exists(output_file):
                    logger.info(f"Using existing multiframe DICOM: {output_file}")
                    return output_file
                    
                # Load DICOM files
                dicom_slices = []
                failed_files = []
                
                # Track progress
                total_files = len(files)
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 0)
                
                # First ensure all files can be read
                for idx, file in enumerate(files):
                    if file.lower().endswith('.dcm'):
                        try:
                            ds = pydicom.dcmread(file)
                            dicom_slices.append(ds)
                        
                            # Update progress during loading
                            progress = min(int((idx + 1) / total_files * 50), 50)  # Up to 50% for loading
                            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                        except Exception as e:
                            logger.error(f"Error reading DICOM file {file}: {e}")
                            failed_files.append(file)
                
                # Check if we successfully loaded all files
                if failed_files:
                    logger.error(f"Failed to load {len(failed_files)} DICOM files out of {total_files}")
                    if len(dicom_slices) == 0:
                        return None
                
                if not dicom_slices:
                    logger.error("No valid DICOM slices found")
                    return None
                    
                # Stack slices
                try:
                    logger.info(f"Creating multiframe DICOM from {len(dicom_slices)} slices")
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 60)
                    
                    # Sort slices by InstanceNumber if available
                    try:
                        dicom_slices.sort(key=lambda x: getattr(x, 'InstanceNumber', 0))
                    except Exception as e:
                        logger.warning(f"Couldn't sort DICOM slices: {e}")
                    
                    # Stack pixel arrays
                    pixel_stack = np.stack([s.pixel_array for s in dicom_slices], axis=0)
                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 70)
                        
                    # Use first slice as template
                    first = dicom_slices[0]
                    first.NumberOfFrames = pixel_stack.shape[0]
                    first.PixelData = pixel_stack.tobytes()
                    first.file_meta.TransferSyntaxUID = pydicom.uid.ExplicitVRLittleEndian

                    self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 80)
                    
                    # Write multi-frame DICOM
                    pydicom.dcmwrite(output_file, first)
                    logger.info(f"Created multiframe DICOM: {output_file}")
                    
                    # Verify the output file
                    if os.path.exists(output_file):
                        try:
                            # Verify the file can be read
                            verification = pydicom.dcmread(output_file)
                            frames = getattr(verification, 'NumberOfFrames', 0)
                            logger.info(f"Verified multiframe DICOM with {frames} frames")
                            self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                            return output_file
                        except Exception as e:
                            logger.error(f"Failed to verify output DICOM: {e}")
                            # If verification fails, delete and report error
                            if os.path.exists(output_file):
                                os.remove(output_file)
                            return None
                    else:
                        logger.error("Output file was not created")
                        return None
                except Exception as e:
                    logger.error(f"Error creating multi-frame DICOM: {e}")
                    # Clean up any partial output
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    return None
            else:
                # Create a video from images
                output_file = os.path.join(out_dir, 'series_multiframe.mp4')
                
                # Skip if already exists
                if os.path.exists(output_file):
                    logger.info(f"Using existing multiframe video: {output_file}")
                    return output_file
                    
                # Filter image files
                image_files = [f for f in files if any(f.lower().endswith(ext) for ext in SUPPORTED_IMAGE_EXTENSIONS)]
                
                if not image_files:
                    logger.error("No valid image files found")
                    return None
                
                # Sort image files naturally by name
                image_files.sort()
                
                # Track progress
                total_files = len(image_files)
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 0)
                
                # First validate all images can be read
                valid_images = []
                failed_images = []
                
                for idx, img_path in enumerate(image_files):
                    try:
                        frame = cv2.imread(img_path)
                        if frame is not None:
                            valid_images.append((img_path, frame.shape[:2]))
                        else:
                            failed_images.append(img_path)
                        
                        # Update progress during validation
                        progress = min(int((idx + 1) / total_files * 50), 50)  # Up to 50% for validation
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)
                    except Exception as e:
                        logger.error(f"Error reading image {img_path}: {e}")
                        failed_images.append(img_path)
                
                # Check if we have valid images
                if not valid_images:
                    logger.error("No valid images could be read")
                    return None
                
                if failed_images:
                    logger.warning(f"Failed to load {len(failed_images)} images out of {total_files}")
                
                # Get dimensions from first valid image
                height, width = valid_images[0][1]
                
                # Create video
                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, 60)
                try:
                    fourcc = cv2.VideoWriter_fourcc(*'mp4v')
                    writer = cv2.VideoWriter(output_file, fourcc, 30, (width, height))
                    
                    # Add frames to video
                    logger.info(f"Creating multiframe video from {len(valid_images)} images")

                    for idx, (img_path, _) in enumerate(valid_images):
                        frame = cv2.imread(img_path)
                        if frame is not None:
                            # Ensure correct dimensions
                            if frame.shape[:2] != (height, width):
                                frame = cv2.resize(frame, (width, height))
                            writer.write(frame)
                        
                        # Update progress during writing
                        progress = min(60 + int((idx + 1) / len(valid_images) * 35), 95)
                        self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_FRAMES, progress)

                    writer.release()
                    logger.info(f"Created multiframe video: {output_file}")
                    
                    # Verify the output file
                    if os.path.exists(output_file):
                        try:
                            # Verify the video can be opened
                            cap = cv2.VideoCapture(output_file)
                            if cap.isOpened():
                                frame_count = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                                logger.info(f"Verified video with {frame_count} frames")
                                cap.release()
                                self._update_progress(task_id, ReaderStatus.ZIP_EXTRACTING_COMPLETE, 100)
                                return output_file
                            else:
                                logger.error("Failed to open created video for verification")
                                cap.release()
                                if os.path.exists(output_file):
                                    os.remove(output_file)
                                return None
                        except Exception as e:
                            logger.error(f"Failed to verify output video: {e}")
                            # If verification fails, delete and report error
                            if os.path.exists(output_file):
                                os.remove(output_file)
                            return None
                    else:
                        logger.error("Output file was not created")
                        return None
                except Exception as e:
                    logger.error(f"Error creating video: {e}")
                    # Clean up any partial output
                    if os.path.exists(output_file):
                        os.remove(output_file)
                    return None
                
        except Exception as e:
            logger.error(f"Error processing files: {e}")
            return None
