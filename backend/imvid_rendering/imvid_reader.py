""" Image/Video Reader Module """


import os
import shutil
import traceback
import cv2
import requests
import magic
import time
import numpy as np
import pydicom
import zipfile
import tempfile
from threading import Thread
from pathlib import Path
from glob import glob
from utils import SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, get_output_img_path, get_output_dir, dict_to_tuple, MIME_TYPE_TO_EXTENSION, TMP_IMG_PATH
from backend.progress_manager.progress_manager import global_progress_manager, make_progress_key
from functools import wraps
from enum import Enum

class ReaderStatus(Enum):
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

    # Add to ReaderStatus class
    ZIP_EXTRACTION_STARTED = "Starting extraction of ZIP contents"
    ZIP_EXTRACTING_FILES = "Extracting ZIP files"
    ZIP_EXTRACTING_COMPLETE = "ZIP extraction is complete"
    ZIP_EXTRACTION_FAILED = "ZIP extraction failed"

    # URL download statuses
    DOWNLOAD_STARTED = "Downloading started"
    DOWNLOAD_IN_PROGRESS = "Download in progress"
    DOWNLOAD_COMPLETED = "Downloading completed"
    DOWNLOAD_FAILED = "Download failed"

    # Generic
    NO_DATA = "No data"
    FILE_NOT_FOUND = "File not found"
    FILE_READ_ERROR = "File read error"
    TASK_NOT_FOUND = "Task not found"

    # URL specific
    URL_INACCESSIBLE = "URL is inaccessible"

    def __str__(self):
        return self.value


def normalize_read_file_output(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        raw = func(*args, **kwargs)

        # Determine task_id
        task_id = kwargs.get("task_id")
        file_name = kwargs.get('file_path') or (args[0] if args else None)
        extra_params = kwargs.get('extra_params') if 'extra_params' in kwargs else (args[3] if len(args) > 3 else None)
        if task_id is None:
            if isinstance(file_name, str) and isinstance(extra_params, tuple):
                task_id = make_progress_key(file_name, extra_params)
            elif isinstance(file_name, str) and isinstance(extra_params, dict):
                task_id = make_progress_key(file_name, extra_params)
        # Prepare default result structure
        result = {
            "file_path": file_name,
            "extra_params": extra_params,
            "images": [],
            "paths": [],
            "status": None,
            "progress": None,
        }

        # Fetch progress manager info if available
        pm = global_progress_manager.get_task_info_by_id(task_id) if task_id else None
        if pm:
            result["status"], result["progress"] = pm["status"], pm["progress"]
        else:
            result["status"], result["progress"] = "No data", 0

        # CASE A: final images
        if isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], list) and isinstance(raw[1], list):
            result["images"] = raw[0]
            result["paths"] = raw[1]

        # CASE B: in-progress (task_id, status)
        elif isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], str):
            # Override status/progress if returned explicitly
            result["status"] = raw[1]
            if pm:
                result["progress"] = pm.get("progress", 0)

        return {"task_id": task_id, "result": result}

    return wrapper


class ImageReader:
    """
    Base class for reading images and videos.
    Subclasses should implement the get_num_frames and read_file methods.
    """
    def __init__(self):
        self.reader_name = 'ImageReader'

    def get_image_path(self, file_path, frame_num, extra_params):
        raise NotImplementedError("Subclasses should implement this method")

    def get_num_frames(self, file_path):
        """
        Get the number of frames in a video file.

        Args:
            file_path (str): The path to the video file.

        Returns:
            int: The number of frames in the video file.

        Raises:
            NotImplementedError: If the method is not implemented by a subclass.
        """
        raise NotImplementedError("Subclasses should implement this method")

    def read_file(self, file_path, frame_num, store_images, extra_params=None, task_id=None, local_dir=None, async_read=True):
        """
        Reads the content of a file.

        This method should be implemented by subclasses to define how the file
        should be read and processed. Should return the content of the file as a numpy array and the temp file path

        Args:
            file_path (str): The path to the file to be read.
            *args: Additional positional arguments.
            **kwargs: Additional keyword arguments.

        Raises:
            NotImplementedError: If the method is not implemented by a subclass.
        """
        raise NotImplementedError("Subclasses should implement this method")


class StandardImageReader(ImageReader):
    """
    Class for reading standard image files.
    """
    def __init__(self):
        self.reader_name = 'StandardImageReader'

    def get_image_path(self, file_path, frame_num, extra_params):
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        if TMP_IMG_PATH in file_path:
            img_path = file_path
        else:
            img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        return img_path

    def get_num_frames(self, file_path):
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        if file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS):
            return 1
        return 0
    
    def get_image_dimensions(self, file_path):
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        img = cv2.imread(file_path)
        if img is None:
            raise ValueError("Unable to read image")
        height, width = img.shape[:2]
        return width, height
    
    def get_fps(self, file_path):
        return -1
    
    # @lru_cache(maxsize=128)
    @normalize_read_file_output
    def read_file(self, file_path, frame_num, store_images=True, extra_params=None, task_id=None, local_dir=None, async_read=True):
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        if not os.path.exists(file_path):
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status={'image': ReaderStatus.FILE_NOT_FOUND}, progress={'image': -1})
            return task_id, {'image': ReaderStatus.FILE_NOT_FOUND}
        if local_dir is None:
            img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        else:
            img_path = os.path.join(local_dir, os.path.basename(file_path))
        Path(os.path.dirname(img_path)).mkdir(parents=True, exist_ok=True)
        if not task_id:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            if task_info is None:
                task_id = global_progress_manager.create_task(file_path, extra_params)
                if not os.path.exists(img_path):
                    global_progress_manager.set_status(task_key=task_id, status={'image': ReaderStatus.IMAGE_READING_STARTED}, progress={'image': 0})
                    img = cv2.imread(file_path)
                    if store_images:
                        cv2.imwrite(img_path, img)
                global_progress_manager.set_status(task_key=task_id, status={'image': ReaderStatus.IMAGE_READING_COMPLETE}, progress={'image': 100})
                return [img_path,], [img_path,]
            else:
                if task_info['status']['image'] == ReaderStatus.IMAGE_READING_COMPLETE:
                    return [img_path,], [img_path,]
                else:
                    return task_id, task_info['status']
        else:
            task_info = global_progress_manager.get_task_info_by_id(task_id)
            if 'image' not in task_info['status']:
                img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
                if not os.path.exists(img_path):
                    global_progress_manager.set_status(task_key=task_id, status={'image': ReaderStatus.IMAGE_READING_STARTED}, progress={'image': 0})
                    img = cv2.imread(file_path)
                    if store_images:
                        cv2.imwrite(img_path, img)
                global_progress_manager.set_status(task_key=task_id, status={'image': ReaderStatus.IMAGE_READING_COMPLETE}, progress={'image': 100})
                return [img_path,], [img_path,]
            if task_info['status']['image'] == ReaderStatus.IMAGE_READING_STARTED:
                return [img_path,], [img_path,]
            else:
                return task_id, task_info['status']


class SimpleVideoReader(ImageReader):
    """
    Class for reading video files.
    """
    def __init__(self):
        self.cache = {}
        self.reader_name = 'SimpleVideoReader'
    
    def get_num_frames(self, file_path):
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        cap = cv2.VideoCapture(file_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()
        return total_frames
    
    def get_fps(self, file_path):
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        cap = cv2.VideoCapture(file_path)
        fps = int(cap.get(cv2.CAP_PROP_FPS))
        cap.release()
        return fps
    
    def get_image_dimensions(self, file_path):
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        cap = cv2.VideoCapture(file_path)
        width = int(cap.get(cv2.CAP_PROP_FRAME_WIDTH))
        height = int(cap.get(cv2.CAP_PROP_FRAME_HEIGHT))
        cap.release()
        return width, height

    def get_existing_and_expected_frames(self, file_path, local_dir):
        total_frames = self.get_num_frames(file_path)
        expected_frame_files = [os.path.join(local_dir, '%05d.png'%i) for i in range(total_frames)]
        # cap.release()

        # Check if local directory exists and if it contains all expected frame files
        existing_frames = sorted(glob(os.path.join(local_dir, '*.png')))
        return existing_frames, expected_frame_files
    
    @normalize_read_file_output
    def read_file(self, file_path: str, frame_num=None, store_images=True, extra_params=None, task_id=None, local_dir=None, async_read=True):
        """
        Reads a video file and returns either a specific frame or all frames.

        Args:
            file_path (str): The path to the video file.
            frame (int, optional): The specific frame number to read. If None, all frames are read.
            *args: Variable length argument list.
            **kwargs: Arbitrary keyword arguments.

        Returns:
            numpy.ndarray or list of numpy.ndarray: If a specific frame is requested, returns the frame as a numpy array.
            If no specific frame is requested, returns a list of all frames as numpy arrays.
        """
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        if not os.path.exists(file_path):
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status={'video': ReaderStatus.FILE_NOT_FOUND}, progress={'video': -1})
            return task_id, {'video': ReaderStatus.FILE_NOT_FOUND}
        if local_dir is None:
            local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
        Path(local_dir).mkdir(parents=True, exist_ok=True)
        task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)

        
        if task_id is None:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            task_id = global_progress_manager.create_task(file_path, extra_params)
            if task_info is None:
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if len(existing) < len(expected):
                    global_progress_manager.set_status(task_id, status={'video': ReaderStatus.VIDEO_EXTRACTION_STARTED}, progress={'video': 0})
                    m_thread = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                    m_thread.start()
                    if not async_read:
                        m_thread.join()
                else:
                    global_progress_manager.set_status(task_id, status={'video': ReaderStatus.VIDEO_EXTRACTING_COMPLETE}, progress={'video': 100})
                # if 'complete' in task_info['status'] or 'Extracting frames' in task_info['status'] or 'Starting extraction' in task_info['status']:
                return existing, expected
            else:
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                task_id = global_progress_manager.create_task(file_path, extra_params)
                global_progress_manager.set_status(task_id, status=task_info['status'], progress=task_info['progress'])
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if task_info['status']['video'] in [ReaderStatus.VIDEO_EXTRACTION_STARTED, ReaderStatus.VIDEO_EXTRACTING_FRAMES, ReaderStatus.VIDEO_EXTRACTING_FRAMES]:
                    return existing, expected
                else:
                    if len(existing) < len(expected):
                        m_thread = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                        m_thread.start()
                        if not async_read:
                            m_thread.join()
                    else:
                        global_progress_manager.set_status(task_id, status={'video': ReaderStatus.VIDEO_EXTRACTING_COMPLETE}, progress={'video': 100})
                    return existing, expected
        else:
            task_info = global_progress_manager.get_task_info_by_id(task_id)
            if 'video' not in task_info['status']:
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if len(existing) not in range(len(expected)-3, len(expected)+3):
                    global_progress_manager.set_status(task_id, status={'video': ReaderStatus.VIDEO_EXTRACTION_STARTED}, progress={'video': 0})
                    t1 = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                    t1.start()
                    if not async_read:
                        t1.join()
                else:
                    global_progress_manager.set_status(task_id, status={'video': ReaderStatus.VIDEO_EXTRACTING_COMPLETE}, progress={'video': 100})
                # if 'complete' in task_info['status'] or 'Extracting frames' in task_info['status'] or 'Starting extraction' in task_info['status']:
                if frame_num is None:
                    return self.get_existing_and_expected_frames(file_path, local_dir)
                else:
                    return existing, expected
            if task_info['status']['video'] in [ReaderStatus.VIDEO_EXTRACTION_STARTED, ReaderStatus.VIDEO_EXTRACTING_FRAMES, ReaderStatus.VIDEO_EXTRACTING_FRAMES]:
                return existing, expected
            else:
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if len(existing) not in range(len(expected)-3, len(expected)+3):
                    t1 = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                    t1.start()
                    if not async_read:
                        t1.join()
                return existing, expected

    def store_all_frames(self, file_path, out_dir, task_id=None):
        """
        Extracts and stores all frames from a video file to a specified output directory.

        Args:
            file_path (str): Path to the input video file.
            out_dir (str): Directory where the extracted frames will be saved.

        Returns:
            None
        """
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")

        Path(out_dir).mkdir(parents=True, exist_ok=True)

        # We can discover the total frames once at the start (optional) to compute % done:
        cap = cv2.VideoCapture(file_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        # cap.release()

        global_progress_manager.set_status(
            task_id,
            status={'video': ReaderStatus.VIDEO_EXTRACTION_STARTED},
            progress={'video': 0}
        )

        # Read lines from ffmpeg until it finishes
        frame_idx = 0
        while True:
            ret, frame = cap.read()
            if not ret:
                break
            out_path = os.path.join(out_dir, f"{frame_idx:05d}.png")
            if not os.path.exists(out_path):
                cv2.imwrite(out_path, frame)

            frame_idx += 1
            if total_frames > 0:
                percent = int((frame_idx / total_frames) * 100)
                global_progress_manager.set_status(
                    task_id,
                    status={'video': ReaderStatus.VIDEO_EXTRACTING_FRAMES},
                    progress={'video': percent}
                )

        cap.release()

        num_extracted = len(glob(os.path.join(out_dir, '*.png')))
        print(f"Extracted {num_extracted} frames to {out_dir}")
        print(f"Expected {total_frames} frames")
        if num_extracted != total_frames:
            print(f"Warning: Extracted {num_extracted} frames, but expected {total_frames} frames.")

        global_progress_manager.set_status(
            task_id,
            status={'video': ReaderStatus.VIDEO_EXTRACTING_COMPLETE},
            progress={'video': 100}
        )

    
class DICOMReader(ImageReader):
    """
    Class for reading DICOM files.
    """
    def __init__(self):
        self.cache = {}
        self.reader_name = 'DICOMReader'

    def get_num_frames(self, file_path):
        """Get the number of frames in a DICOM file"""
        try:
            ds = pydicom.dcmread(file_path)
            if hasattr(ds, 'NumberOfFrames'):
                return int(ds.NumberOfFrames)
            return 1  # Single frame DICOM
        except Exception as e:
            print(f"Error reading DICOM file: {e}")
            return 0

    def get_fps(self, file_path):
        """Get frames per second if available in DICOM metadata"""
        try:
            ds = pydicom.dcmread(file_path)
            if hasattr(ds, 'CineRate'):
                return float(ds.CineRate)
            return -1  # No FPS information available
        except Exception:
            return -1
        
    def get_image_dimensions(self, file_path):
        """Get the dimensions of the DICOM image"""
        try:
            ds = pydicom.dcmread(file_path)
            if hasattr(ds, 'Rows') and hasattr(ds, 'Columns'):
                return int(ds.Columns), int(ds.Rows)
            return -1, -1  # Unknown dimensions
        except Exception:
            return -1, -1

    def get_image_path(self, file_path, frame_num, extra_params):
        """Get the path where a specific frame should be stored"""
        return get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)

    def get_existing_and_expected_frames(self, file_path, local_dir):
        """Get lists of existing and expected frame files"""
        total_frames = self.get_num_frames(file_path)
        expected_frame_files = [os.path.join(local_dir, f'{i:05d}.png') for i in range(total_frames)]
        existing_frames = sorted(glob(os.path.join(local_dir, '*.png')))
        return existing_frames, expected_frame_files

    @normalize_read_file_output
    def read_file(self, file_path, frame_num=None, store_images=True, extra_params=None, task_id=None, local_dir=None, async_read=True):
        """Read DICOM file and extract frames"""
        if not file_path.lower().endswith('.dcm'):
            raise ValueError("Not a DICOM file")
        
        if local_dir is None:
            local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
        Path(local_dir).mkdir(parents=True, exist_ok=True)

        m_thread = None
        
        if not os.path.exists(file_path):
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status={'dicom': ReaderStatus.FILE_NOT_FOUND}, progress={'dicom': -1})
            existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
            return existing, expected

        if task_id is None:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            task_id = global_progress_manager.create_task(file_path, extra_params)

            if task_info is None:
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if len(existing) < len(expected):
                    global_progress_manager.set_status(task_id, status={'dicom': ReaderStatus.DICOM_EXTRACTION_STARTED}, progress={'dicom': 0})
                    m_thread = Thread(target=self.store_all_frames, args=(file_path, extra_params, local_dir, task_id))
                    m_thread.start()
                else:
                    global_progress_manager.set_status(task_id, status={'dicom': ReaderStatus.DICOM_EXTRACTING_COMPLETE}, progress={'dicom': 100})
                
                if frame_num is None:
                    return existing, expected
                else:
                    return [os.path.join(local_dir, f'{frame_num:05d}.png')], [os.path.join(local_dir, f'{frame_num:05d}.png')]

        task_info = global_progress_manager.get_task_info_by_id(task_id)
        existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)

        if len(existing) < len(expected):
            if 'dicom' not in task_info['status'] or task_info['status'].get('dicom') not in [ReaderStatus.DICOM_EXTRACTION_STARTED, ReaderStatus.DICOM_EXTRACTING_FRAMES]:
                m_thread = Thread(target=self.store_all_frames, args=(file_path, extra_params, local_dir, task_id))
                m_thread.start()
        
        if not async_read:
            if m_thread is not None:
                m_thread.join()
        
        return existing, expected

    def store_all_frames(self, file_path, extra_params, out_dir, task_id=None):
        """Extract and store all frames from a DICOM file"""
        try:
            ds = pydicom.dcmread(file_path)
            total_frames = int(ds.NumberOfFrames) if hasattr(ds, 'NumberOfFrames') else 1

            global_progress_manager.set_status(
                task_id,
                status={'dicom': ReaderStatus.DICOM_EXTRACTION_STARTED},
                progress={'dicom': 0}
            )

            for frame_idx in range(total_frames):
                out_path = os.path.join(out_dir, f'{frame_idx:05d}.png')
                
                if not os.path.exists(out_path):
                    # Extract pixel array for the current frame
                    if total_frames > 1:
                        pixel_array = ds.pixel_array[frame_idx]
                    else:
                        pixel_array = ds.pixel_array

                    # Normalize pixel values if needed
                    if pixel_array.dtype != np.uint8:
                        pixel_array = ((pixel_array - pixel_array.min()) / 
                                     (pixel_array.max() - pixel_array.min()) * 255).astype(np.uint8)

                    # Save as PNG
                    cv2.imwrite(out_path, pixel_array)

                if total_frames > 0:
                    percent = int((frame_idx + 1) / total_frames * 100)
                    global_progress_manager.set_status(
                        task_id,
                        status={'dicom': ReaderStatus.DICOM_EXTRACTING_FRAMES},
                        progress={'dicom': percent}
                    )

            num_extracted = len(glob(os.path.join(out_dir, '*.png')))
            print(f"Extracted {num_extracted} frames to {out_dir}")
            print(f"Expected {total_frames} frames")

            if num_extracted != total_frames:
                print(f"Warning: Extracted {num_extracted} frames, but expected {total_frames} frames.")

            global_progress_manager.set_status(
                task_id,
                status={'dicom': ReaderStatus.DICOM_EXTRACTING_COMPLETE},
                progress={'dicom': 100}
            )

        except Exception as e:
            print(f"Error extracting DICOM frames: {e}")
            global_progress_manager.set_status(
                task_id,
                status={'dicom': ReaderStatus.FILE_READ_ERROR},
                progress={'dicom': -1}
            )


class ZipReader(ImageReader):
    """
    Class for reading ZIP files containing images and single-frame DICOMs.
    """
    def __init__(self):
        self.cache = {}
        self.reader_name = 'ZipReader'
        self.image_reader = StandardImageReader()
        self.dicom_reader = DICOMReader()
        self.supported_extensions = SUPPORTED_IMAGE_EXTENSIONS + ('.dcm',)

    def get_num_frames(self, file_path):
        """Get the number of valid files in the ZIP"""
        if not file_path.lower().endswith('.zip'):
            raise ValueError("Not a ZIP file")
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                return len([f for f in zip_ref.namelist() 
                          if any(f.lower().endswith(ext) for ext in self.supported_extensions)])
        except Exception as e:
            print(f"Error reading ZIP file: {e}")
            return 0

    def get_fps(self, file_path):
        """ZIP files don't have FPS"""
        return -1
    
    def get_image_dimensions(self, file_path):
        """ Get dimensions of the first image in the ZIP (Use StandardImageReader or DICOMReader depending on the file) """
        if not file_path.lower().endswith('.zip'):
            raise ValueError("Not a ZIP file")
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                for zip_file in zip_ref.namelist():
                    if any(zip_file.lower().endswith(ext) for ext in self.supported_extensions):
                        with zip_ref.open(zip_file) as f:
                            if zip_file.lower().endswith('.dcm'):
                                return self.dicom_reader.get_image_dimensions(f)
                            else:
                                return self.image_reader.get_image_dimensions(f)
        except Exception as e:
            print(f"Error reading ZIP file: {e}")
            return -1, -1

    def get_image_path(self, file_path, frame_num, extra_params):
        """Get the path where extracted files should be stored"""
        return get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)

    def get_existing_and_expected_frames(self, file_path, local_dir):
        """Get lists of existing and expected frame files"""
        total_frames = self.get_num_frames(file_path)
        expected_frame_files = [os.path.join(local_dir, f'{i:05d}.png') for i in range(total_frames)]
        existing_frames = sorted(glob(os.path.join(local_dir, '*.png')))
        return existing_frames, expected_frame_files

    @normalize_read_file_output
    def read_file(self, file_path, frame_num=None, store_images=True, extra_params=None, task_id=None, local_dir=None, async_read=True):
        """Read ZIP file and extract supported files"""
        if not file_path.lower().endswith('.zip'):
            raise ValueError("Not a ZIP file")
        
        if not os.path.exists(file_path):
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status={'zip': ReaderStatus.FILE_NOT_FOUND}, progress={'zip': -1})
            return task_id, {'zip': ReaderStatus.FILE_NOT_FOUND}

        if local_dir is None:
            local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
        Path(local_dir).mkdir(parents=True, exist_ok=True)

        if task_id is None:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            task_id = global_progress_manager.create_task(file_path, extra_params)

            if task_info is None:
                existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)
                if len(existing) < len(expected):
                    global_progress_manager.set_status(task_id, status={'zip': ReaderStatus.ZIP_EXTRACTION_STARTED}, progress={'zip': 0})
                    t1 = Thread(target=self.store_all_frames, args=(file_path, extra_params, local_dir, task_id, async_read))
                    t1.start()
                    if not async_read:
                        t1.join()
                else:
                    global_progress_manager.set_status(task_id, status={'zip': ReaderStatus.ZIP_EXTRACTING_COMPLETE}, progress={'zip': 100})
                
                if frame_num is None:
                    return existing, expected
                else:
                    return [os.path.join(local_dir, f'{frame_num:05d}.png')], [os.path.join(local_dir, f'{frame_num:05d}.png')]

        task_info = global_progress_manager.get_task_info_by_id(task_id)
        existing, expected = self.get_existing_and_expected_frames(file_path, local_dir)

        if len(existing) < len(expected):
            if 'zip' not in task_info['status'] or task_info['status']['zip'] not in [ReaderStatus.ZIP_EXTRACTION_STARTED, ReaderStatus.ZIP_EXTRACTING_FILES]:
                t1 = Thread(target=self.store_all_frames, args=(file_path, extra_params, local_dir, task_id, async_read))
                t1.start()
                if not async_read:
                    t1.join()
        
        return existing, expected

    def store_all_frames(self, file_path, extra_params, out_dir, task_id=None, async_read=True):
        """Extract and process all supported files from ZIP"""
        try:
            with zipfile.ZipFile(file_path, 'r') as zip_ref:
                # Get list of supported files
                supported_files = sorted([f for f in zip_ref.namelist() if any(f.lower().endswith(ext) for ext in self.supported_extensions)])
                total_files = len(supported_files)

                global_progress_manager.set_status(
                    task_id,
                    status={'zip': ReaderStatus.ZIP_EXTRACTION_STARTED},
                    progress={'zip': 0}
                )

                # Create temporary directory for extraction
                
                for idx, zip_file in enumerate(supported_files):
                    # Extract file to temp directory
                    zip_ref.extract(zip_file, out_dir)
                    extracted_path = os.path.join(out_dir, zip_file)
                    Path(os.path.dirname(extracted_path)).mkdir(parents=True, exist_ok=True)
                    Path(out_dir+'-extracted').mkdir(parents=True, exist_ok=True)
                    try:
                        # Process based on file type
                        with tempfile.TemporaryDirectory() as temp_dir:
                            if zip_file.lower().endswith('.dcm'):
                                img = self.dicom_reader.read_file(file_path=extracted_path, frame_num=0, store_images=True, extra_params=extra_params, task_id=task_id, local_dir=temp_dir, async_read=False)
                            else:
                                img = self.image_reader.read_file(file_path=extracted_path, frame_num=0, store_images=True, extra_params=extra_params, task_id=task_id, local_dir=temp_dir, async_read=False)
                            
                            # print('img', img)
                            task_info = global_progress_manager.get_task_info_by_id(img['task_id'])
                            # Save processed image
                            out_path = os.path.join(out_dir, f'{idx:05d}.png')
                            shutil.move(img['result']['paths'][0], out_path)

                    except Exception as e:
                        print(f"Error processing {zip_file}: {e}")
                        global_progress_manager.set_status(
                            task_id,
                            status={'zip': ReaderStatus.ZIP_EXTRACTION_FAILED},
                            progress={'zip': -1}
                        )
                        continue

                    if total_files > 0:
                        percent = int((idx + 1) / total_files * 100)
                        global_progress_manager.set_status(
                            task_id,
                            status={'zip': ReaderStatus.ZIP_EXTRACTING_FILES},
                            progress={'zip': percent}
                        )

                num_extracted = len(glob(os.path.join(out_dir, '*.png')))
                print(f"Extracted {num_extracted} files to {out_dir}")
                print(f"Expected {total_files} files")

                if num_extracted != total_files:
                    print(f"Warning: Extracted {num_extracted} files, but expected {total_files} files")

                global_progress_manager.set_status(
                    task_id,
                    status={'zip': ReaderStatus.ZIP_EXTRACTING_COMPLETE},
                    progress={'zip': 100}
                )

        except Exception as e:
            print(f"Error extracting ZIP file: {e}")
            global_progress_manager.set_status(
                task_id,
                status={'zip': ReaderStatus.ZIP_EXTRACTION_FAILED},
                progress={'zip': -1}
            )


class URLReader(ImageReader):
    """
    Class for reading images and videos from URLs.
    """
    def __init__(self):
        self.reader_name = 'URLReader'
        # Initialize all supported readers
        self.image_reader = StandardImageReader()
        self.video_reader = SimpleVideoReader()
        self.dicom_reader = DICOMReader()
        self.zip_reader = ZipReader()
        self.temp_download_dir = os.path.join(TMP_IMG_PATH, 'downloaded/')
        Path(self.temp_download_dir).mkdir(parents=True, exist_ok=True)

    def get_num_frames(self, file_path):
        if file_path.startswith('http'):
            local_path = download_copy_file(file_path)
            mime = magic.Magic(mime=True)
            file_type = mime.from_file(local_path)
            if file_type.startswith('image'):
                return self.image_reader.get_num_frames(local_path)
            elif file_type.startswith('video'):
                return self.video_reader.get_num_frames(local_path)
            elif file_type == 'application/dicom':
                return self.dicom_reader.get_num_frames(local_path)
            elif file_type == 'application/zip':
                return self.zip_reader.get_num_frames(local_path)
        return 0

    def get_fps(self, file_path):
        file_type, file_extension = self.get_filetype(file_path)
        if file_type.startswith('image'):
            return self.image_reader.get_fps(file_path)
        elif file_type.startswith('video'):
            return self.video_reader.get_fps(file_path)
        elif file_type == 'application/dicom':
            return self.dicom_reader.get_fps(file_path)
        elif file_type == 'application/zip':
            return self.zip_reader.get_fps(file_path)
        return -1
    
    def get_image_dimensions(self, file_path):
        file_type, file_extension = self.get_filetype(file_path)
        if file_type.startswith('image'):
            return self.image_reader.get_image_dimensions(file_path)
        elif file_type.startswith('video'):
            return self.video_reader.get_image_dimensions(file_path)
        elif file_type == 'application/dicom':
            return self.dicom_reader.get_image_dimensions(file_path)
        elif file_type == 'application/zip':
            return self.zip_reader.get_image_dimensions(file_path)
        return -1, -1

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
        

file_readers = [StandardImageReader(), SimpleVideoReader(), DICOMReader(), ZipReader()]
url_readers = [URLReader()]

def get_num_frames(file_path):
    """
    Get the number of frames in a given file.

    This function attempts to read the number of frames from the provided file path
    using different reader classes. It returns the number of frames if successful,
    otherwise returns 0.

    Args:
        file_path (str): The path to the file for which the number of frames is to be determined.

    Returns:
        int: The number of frames in the file, or 0 if the file could not be read.
    """
    for reader in readers:
        num_frames = reader.get_num_frames(file_path)
        if num_frames > 0:
            return num_frames
    return 0


def read_file(file_path, frame_num, store_images=True, extra_params=None, task_id=None):
    """
    Reads a file using available readers.

    This function attempts to read a file using a list of predefined readers.
    It iterates through each reader and returns the result from the first reader
    that successfully reads the file.

    Args:
        file_path (str): The path to the file to be read.
        *args: Additional positional arguments to pass to the reader's read_file method.
        **kwargs: Additional keyword arguments to pass to the reader's read_file method.

    Returns:
        The result from the reader that successfully reads the file, or None if no reader can read the file.
    """
    for reader in file_readers:
        if file_path.startswith('http'):
            continue
        try:
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=False)
            while len(result['result']['images']) == 0:
                time.sleep(0.2)
                result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id)
            fps = reader.get_fps(file_path)
            width, height = reader.get_image_dimensions(file_path)
            result['result']['fps'] = fps
            result['result']['width'] = width
            result['result']['height'] = height
            result['result']['status'] = {x: y.value for x, y in result['result']['status'].items()}
            return result
        except Exception as e:
            print(e)
            print(traceback.print_exception(e))
            continue
    
    for reader in url_readers:
        try:
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=False)
            # result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=False)
            fps = reader.get_fps(file_path)
            width, height = reader.get_image_dimensions(file_path)
            result['result']['fps'] = fps
            result['result']['width'] = width
            result['result']['height'] = height
            while len(result['result']['images']) == 0:
                time.sleep(0.2)
                result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id)
            result['result']['status'] = {x: y.value for x, y in result['result']['status'].items()}
            return result
        except Exception as e:
            print(e)
            continue

    return None


def async_read_file(file_path, frame_num, store_images=True, extra_params=None, task_id=None):
    """
    Reads a file using available readers.

    This function attempts to read a file using a list of predefined readers.
    It iterates through each reader and returns the result from the first reader
    that successfully reads the file.

    Args:
        file_path (str): The path to the file to be read.
        *args: Additional positional arguments to pass to the reader's read_file method.
        **kwargs: Additional keyword arguments to pass to the reader's read_file method.

    Returns:
        The result from the reader that successfully reads the file, or None if no reader can read the file.
    """
    for reader in file_readers:
        if file_path.startswith('http'):
            continue
        try:
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=True)
            fps = reader.get_fps(file_path)
            width, height = reader.get_image_dimensions(file_path)
            result['result']['fps'] = fps
            result['result']['width'] = width
            result['result']['height'] = height
            while len(result['result']['paths']) == 0:
                time.sleep(0.05)
                result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=True)
            result['result']['status'] = {x: y.value for x, y in result['result']['status'].items()}
            return result
        except Exception as e:
            print(e)
            print(traceback.print_exception(e))
            continue
    
    for reader in url_readers:
        try:
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=True)
            fps = reader.get_fps(file_path)
            width, height = reader.get_image_dimensions(file_path)
            result['result']['fps'] = fps
            result['result']['width'] = width
            result['result']['height'] = height
            while len(result['result']['paths']) == 0:
                time.sleep(0.2)
                result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id, async_read=True)
            result['result']['status'] = {x: y.value for x, y in result['result']['status'].items()}
            return result
        except Exception as e:
            print(e)
            print(traceback.print_exception(e))
            continue
    return None


def get_image_path(file_path, frame_num, extra_params=None):
    """
    Reads a file using available readers.

    This function attempts to read a file using a list of predefined readers.
    It iterates through each reader and returns the result from the first reader
    that successfully reads the file.

    Args:
        file_path (str): The path to the file to be read.
        *args: Additional positional arguments to pass to the reader's read_file method.
        **kwargs: Additional keyword arguments to pass to the reader's read_file method.

    Returns:
        The result from the reader that successfully reads the file, or None if no reader can read the file.
    """
    for reader in readers:
        try:
            result = reader.get_image_path(file_path=file_path, frame_num=frame_num, extra_params=dict_to_tuple(extra_params))
            if result is not None:
                return result
        except Exception as e:
            print(e)
            continue

    return None


def get_unique_id(file_path, extra_params=None):
    """
    Reads a file using available readers.

    This function attempts to read a file using a list of predefined readers.
    It iterates through each reader and returns the result from the first reader
    that successfully reads the file.

    Args:
        file_path (str): The path to the file to be read.
        *args: Additional positional arguments to pass to the reader's read_file method.
        **kwargs: Additional keyword arguments to pass to the reader's read_file method.

    Returns:
        The result from the reader that successfully reads the file, or None if no reader can read the file.
    """
    for reader in readers:
        try:
            result = reader.get_image_path(file_path=file_path, frame_num=0, extra_params=dict_to_tuple(extra_params)).replace(TMP_IMG_PATH, '').split('/')
            if result[0] == '':
                result = result[1]
            else:
                result = result[0]
            if result is not None:
                return result
        except Exception as e:
            print(e)
            continue

    return None


def get_task_info(file_path, extra_params):
    task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
    print('task_info', task_info)
    if not task_info:
        return "Task not found"
    else:
        return {x: y.value for x, y in task_info['status'].items()}