""" Image/Video Reader Module """

import traceback
import time
import os
import logging
from typing import Dict, List, Optional, Union, Tuple, Any
import asyncio
from glob import glob
import cv2
from pathlib import Path
import threading

from m_utils.utils import dict_to_tuple
from backend.imvid_rendering.utils import is_supported_image, is_supported_video, is_supported_dicom, is_supported_zip, is_url, get_output_dir, TMP_IMG_PATH
from backend.progress_manager.progress_manager import global_progress_manager
from backend.imvid_rendering.image_reader import StandardImageReader
from backend.imvid_rendering.video_reader import SimpleVideoReader
from backend.imvid_rendering.dicom_reader import DICOMWADOReader
from backend.imvid_rendering.zip_reader import ZipReader
from backend.imvid_rendering.url_reader import URLReader
from backend.imvid_rendering.base_reader import DEFAULT_POLL_INTERVAL, MAX_POLL_TIMEOUT, ReaderStatus

# Configure logging
logger = logging.getLogger(__name__)

# Initialize readers
file_readers = [StandardImageReader(), SimpleVideoReader(), DICOMWADOReader(), ZipReader()]
url_readers = [URLReader()]

def convert_status_to_values(status_dict: Dict) -> Dict:
    """
    Convert status enum objects to their values for serialization.
    
    Args:
        status_dict: Dictionary with status enum values
        
    Returns:
        Dictionary with enum values converted to their string/int representation
    """
    if not status_dict:
        return {}
    converted = {}
    for key, val in status_dict.items():
        # If it's an enum, extract .value, otherwise use as is
        if hasattr(val, 'value'):
            try:
                converted[key] = val.value
            except Exception:
                converted[key] = val
        else:
            converted[key] = val
    return converted

def read_file(file_path: str, frame_num: int, store_images: bool = True, 
              extra_params: Optional[Dict[str, Any]] = None, 
              task_id: Optional[str] = None, 
              async_read: bool = False) -> Optional[Dict[str, Any]]:
    """
    Reads a file using the appropriate reader based on file type.

    This function determines the appropriate reader for a file based on its path
    or content type and uses that reader to process the file.

    Args:
        file_path: The path to the file to be read
        frame_num: The specific frame number to read
        store_images: Whether to store images to disk
        extra_params: Additional parameters for the reader
        task_id: Task identifier for progress tracking
        async_read: Whether to perform reading asynchronously

    Returns:
        The result from the reader that successfully reads the file, or None if no reader can read the file
    """
    # Validate inputs
    if not file_path or not isinstance(file_path, str):
        logger.error("Invalid file path provided")
        return None
        
    # Convert extra_params to tuple if needed
    # extra_params_tuple = dict_to_tuple(extra_params) if extra_params else None
    
    # Determine the appropriate reader based on file path or URL
    if file_path.startswith('http'):
        # For URLs, use URLReader
        reader = url_readers[0]  # Assuming there's only one URLReader
    else:
        # For local files, determine reader based on file extension or content
        file_ext = os.path.splitext(file_path)[1].lower()
        
        if is_supported_image(file_path):
            reader = StandardImageReader()
        elif is_supported_video(file_path):
            reader = SimpleVideoReader()
        elif is_supported_dicom(file_path):
            reader = DICOMWADOReader()
        elif is_supported_zip(file_path):
            reader = ZipReader()
        else:
            # If extension doesn't match, try to determine by content
            try:
                import magic
                mime = magic.Magic(mime=True)
                file_type = mime.from_file(file_path)
                
                if file_type.startswith('image/'):
                    reader = StandardImageReader()
                elif file_type.startswith('video/'):
                    reader = SimpleVideoReader()
                elif file_type == 'application/dicom':
                    reader = DICOMWADOReader()
                elif file_type == 'application/zip':
                    reader = ZipReader()
                else:
                    logger.error(f"Unsupported file type: {file_type} for {file_path}")
                    return None
            except ImportError:
                logger.warning("python-magic not available, falling back to extension-based detection")
                # If magic module is not available, try each reader
                for reader in file_readers:
                    try:
                        # For videos with async_read, use special handling
                        if async_read and isinstance(reader, file_readers[1].__class__):  # SimpleVideoReader
                            result = reader.read_file(
                                file_path=file_path, 
                                frame_num=frame_num, 
                                store_images=store_images, 
                                extra_params=extra_params, 
                                task_id=task_id, 
                                async_read=async_read
                            )
                            return result
                            
                        result = reader.read_file(
                            file_path=file_path, 
                            frame_num=frame_num, 
                            store_images=store_images, 
                            extra_params=extra_params, 
                            task_id=task_id, 
                            async_read=False  # Force sync for non-video readers
                        )
                        if result:
                            return process_reader_result(reader, result, file_path)
                    except Exception:
                        continue
                
                logger.error(f"No reader could process file: {file_path}")
                return None
    
    # Try to read with the selected reader
    try:
        # Special handling for direct video files
        if is_supported_video(file_path) and not file_path.endswith('.zip') and not is_url(file_path):
            logger.info(f"Direct video file detected: {file_path} - ensuring frames are extracted")
            
            # Get or create task ID
            if task_id is None:
                task_id = global_progress_manager.create_task(file_path, extra_params)
            
            # Set up output directory
            output_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
            Path(output_dir).mkdir(parents=True, exist_ok=True)
            
            # Extract frames with OpenCV
            try:
                cap = cv2.VideoCapture(file_path)
                if cap.isOpened():
                    # Get video properties
                    total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
                    fps = float(cap.get(cv2.CAP_PROP_FPS))
                    width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
                    height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
                    
                    # Generate expected paths
                    paths = [os.path.join(output_dir, f"{i:05d}.png") for i in range(total_frames)]
                    
                    # Check for existing frames - this will get ALL frames that have been extracted
                    extracted_frames = []
                    for path in paths:
                        if os.path.exists(path) and os.path.getsize(path) > 0:
                            extracted_frames.append(path)
                    
                    # Only extract frames if needed
                    if len(extracted_frames) < total_frames:
                        logger.info(f"Found {len(extracted_frames)} existing frames out of {total_frames}")
                        
                        # Extract more frames if needed (up to 20 in this call)
                        next_frame = len(extracted_frames)
                        frames_to_extract = min(20, total_frames - next_frame)
                        
                        if frames_to_extract > 0:
                            logger.info(f"Extracting frames {next_frame} to {next_frame + frames_to_extract - 1}")
                            
                            # Position the capture at the next frame
                            cap.set(cv2.CAP_PROP_POS_FRAMES, next_frame)
                            
                            # Extract additional frames
                            for i in range(frames_to_extract):
                                ret, frame = cap.read()
                                if ret:
                                    out_path = paths[next_frame + i]
                                    cv2.imwrite(out_path, frame)
                                    if os.path.exists(out_path):
                                        extracted_frames.append(out_path)
                        
                        # Start a background thread to extract remaining frames
                        if len(extracted_frames) < total_frames:
                            def extract_remaining_frames():
                                paths = [os.path.join(output_dir, f"{i:05d}.png") for i in range(total_frames)]
                                try:
                                    local_cap = cv2.VideoCapture(file_path)
                                    if local_cap.isOpened():
                                        # Start from the next frame
                                        next_frame = len(extracted_frames)
                                        local_cap.set(cv2.CAP_PROP_POS_FRAMES, next_frame)
                                        
                                        # Extract remaining frames in batches
                                        for i in range(next_frame, total_frames):
                                            ret, frame = local_cap.read()
                                            if ret:
                                                out_path = paths[i]
                                                cv2.imwrite(out_path, frame)
                                        
                                        local_cap.release()
                                except Exception as e:
                                    logger.error(f"Error in background extraction: {e}")
                            
                            # Start background thread
                            background_thread = threading.Thread(target=extract_remaining_frames)
                            background_thread.daemon = True
                            background_thread.start()
                    
                    # Return the current result with all extracted frames
                    progress = int(len(extracted_frames) / total_frames * 100)
                    status = ReaderStatus.VIDEO_EXTRACTING_COMPLETE if progress >= 100 else ReaderStatus.VIDEO_EXTRACTING_FRAMES
                    
                    cap.release()
                    # Return a structured result with all extracted frames
                    return {
                        'task_id': task_id,
                        'result': {
                            'file_path': file_path,
                            'images': extracted_frames,  # All frames that exist
                            'paths': paths,              # All expected paths
                            'status': {"video": status.value},
                            'progress': {"video": progress},
                            'fps': fps,
                            'width': width,
                            'height': height
                        }
                    }
                
                # If extraction failed, continue with normal processing
                logger.warning("Direct frame extraction failed, falling back to standard processing")
            except Exception as e:
                logger.error(f"Error extracting frames directly: {e}")
            
            # Continue with normal processing if direct extraction failed
            
        elif async_read:  # For other files using async mode
            # Get the shared event loop
            try:
                from backend.imvid_rendering.event_loop import get_event_loop
                loop = get_event_loop()
            except ImportError:
                # Fall back to standard approach
                try:
                    loop = asyncio.get_event_loop()
                except RuntimeError:
                    loop = asyncio.new_event_loop()
                    asyncio.set_event_loop(loop)
            
            # For asynchronous reading, return task information immediately
            result = reader.read_file(
                file_path=file_path, 
                frame_num=frame_num, 
                store_images=store_images, 
                extra_params=extra_params, 
                task_id=task_id, 
                async_read=True
            )
            
            # Create a structured response for async operations
            return process_reader_result(reader, result, file_path)
        else:
            # For synchronous reading or non-video files
            result = reader.read_file(
                file_path=file_path, 
                frame_num=frame_num, 
                store_images=store_images, 
                extra_params=extra_params, 
                task_id=task_id, 
                async_read=False  # Force sync for non-video readers
            )
            
            return process_reader_result(reader, result, file_path)
    except Exception as e:
        logger.error(f"Error reading file {file_path} with {reader.reader_name}: {str(e)}")
        logger.debug(traceback.format_exc())
        return None

def process_reader_result(reader, result, file_path):
    """Helper function to process reader results and add metadata"""
    if result is None:
        logger.error(f"Reader returned None result for {file_path}")
        return None
        
    # For asynchronous operations where extraction is still in progress
    if 'task_id' in result and 'result' not in result:
        # Return a structured response with task ID for polling
        task_id = result[0] if isinstance(result, tuple) and len(result) > 0 else result
        status = result[1] if isinstance(result, tuple) and len(result) > 1 else {}
        
        return {
            'task_id': task_id,
            'result': {
                'file_path': file_path,
                'images': [],
                'paths': [],
                'status': status,
                'fps': 0,
                'width': 0,
                'height': 0
            }
        }
    
    # For results that already have images
    if 'result' in result and 'images' in result['result']:
        # Get additional metadata
        try:
            fps = reader.get_fps(file_path)
            width, height = reader.get_image_dimensions(file_path)
        except Exception as e:
            logger.error(f"Error getting metadata for {file_path}: {e}")
            fps = 30.0
            width, height = (0, 0)
        
        # Ensure images array matches paths for existing files
        paths = result['result'].get('paths', [])
        images = result['result'].get('images', [])
        
        # Special handling for direct video files (not ZIP files)
        if is_supported_video(file_path) and not file_path.endswith('.zip') and len(images) < len(paths):
            logger.info(f"Direct video file detected: {file_path}, checking for PNG files")
            
            # First try to find PNGs in the output directory
            if paths:
                output_dir = os.path.dirname(paths[0])
                # Use a pattern that matches numeric PNG files (frame files)
                png_files = sorted(glob(os.path.join(output_dir, "[0-9]*.png")))
                if png_files:
                    logger.info(f"Found {len(png_files)} PNG files for direct video in {output_dir}")
                    result['result']['images'] = png_files
                    
                    # Update metadata with complete status
                    result['result']['status'] = {"video": "VIDEO_EXTRACTING_COMPLETE"}
                    result['result']['progress'] = {"video": 100}
        
        # If images array is empty or doesn't match paths, check file existence
        if len(result['result'].get('images', [])) < len(paths):
            logger.info(f"Fixing images array: found {len(result['result'].get('images', []))} images but {len(paths)} paths")
            # Check each path to see if the file exists
            updated_images = []
            for path in paths:
                if os.path.exists(path) and os.path.getsize(path) > 0:
                    updated_images.append(path)
            
            if len(updated_images) > 0:
                logger.info(f"Updated images array with {len(updated_images)} existing files")
                result['result']['images'] = updated_images
            elif is_supported_video(file_path) and not file_path.endswith('.zip'):
                # As a last resort for videos, include the first few paths even if they don't exist yet
                # The frontend will handle these as "loading" images
                logger.info(f"No existing files found, including first 10 paths as placeholders")
                result['result']['images'] = paths[:min(10, len(paths))]
        
        # Handle the specific case of video files created from ZIP files
        if file_path.endswith('.zip') and 'series_file' in result['result'] and result['result']['series_file']:
            series_file = result['result']['series_file']
            if series_file.endswith('.mp4') and len(result['result']['images']) < len(result['result']['paths']):
                logger.info(f"Special case: ZIP with video file {series_file}")
                
                # Get the extraction directory
                extract_dir = os.path.dirname(series_file)
                
                # Check if any frame PNGs exist in the directory
                png_files = sorted(glob(os.path.join(extract_dir, '*.png')))
                if png_files:
                    logger.info(f"Found {len(png_files)} PNG files in extraction directory")
                    # Use these files directly
                    result['result']['images'] = png_files
                    result['result']['paths'] = png_files
                    
                    # Set status to complete to skip further processing
                    result['result']['status'] = {'zip': 'EXTRACTING_COMPLETE'}
        
        # Update result with metadata
        result['result']['fps'] = fps
        result['result']['width'] = width
        result['result']['height'] = height
        result['result']['status'] = convert_status_to_values(result['result']['status'])
        return result
        
    # Wait for images to be available if needed
    def check_images():
        try:
            # If paths information is not available, we can't check
            if 'result' not in result or 'paths' not in result['result']:
                return False
                
            expected = result['result']['paths']
            if not expected or len(expected) == 0:
                return False
                
            # Check if at least one image exists
            images = []
            for path in expected:
                if os.path.exists(path):
                    images.append(path)
            result['result']['images'] = images
            
            # Return True if we have at least some images
            return len(result['result']['images']) > 0
        except Exception as e:
            logger.error(f"Error checking images: {e}")
            return False
        
    if not check_images():
        success = wait_for_condition(
            check_images,
            timeout=MAX_POLL_TIMEOUT,
            interval=DEFAULT_POLL_INTERVAL
        )
        if not success:
            logger.warning(f"Timed out waiting for images from {reader.reader_name}")
            # Return partial results instead of None
            if 'result' in result:
                # Get additional metadata
                fps = reader.get_fps(file_path)
                width, height = reader.get_image_dimensions(file_path)
                
                # Update result with metadata
                result['result']['fps'] = fps
                result['result']['width'] = width
                result['result']['height'] = height
                result['result']['status'] = convert_status_to_values(result['result']['status'])
                return result
            return None
    
    # Get additional metadata
    fps = reader.get_fps(file_path)
    width, height = reader.get_image_dimensions(file_path)
    
    # Update result with metadata
    result['result']['fps'] = fps
    result['result']['width'] = width
    result['result']['height'] = height
    result['result']['status'] = convert_status_to_values(result['result']['status'])
    
    return result

def wait_for_condition(condition_func, timeout: float = MAX_POLL_TIMEOUT, 
                      interval: float = DEFAULT_POLL_INTERVAL) -> bool:
    """
    Wait for a condition to be true with timeout.
    
    Args:
        condition_func: Function that returns True when condition is met
        timeout: Maximum time to wait in seconds
        interval: Sleep interval between checks
        
    Returns:
        True if condition was met, False if timed out
    """
    start_time = time.time()
    while time.time() - start_time < timeout:
        if condition_func():
            return True
        time.sleep(interval)
    return False

def get_task_info(file_path: str, extra_params: Dict[str, Any]) -> Union[str, Dict[str, Any]]:
    """
    Get information about a task by file path.
    
    Args:
        file_path: Path to the file
        extra_params: Additional parameters
        
    Returns:
        Task information or error message
    """
    task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
    logger.debug(f'task_info: {task_info}')
    
    if not task_info:
        return "Task not found"
    else:
        return convert_status_to_values(task_info['status'])
