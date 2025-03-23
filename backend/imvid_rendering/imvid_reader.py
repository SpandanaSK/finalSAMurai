""" Image/Video Reader Module """


import os
import shutil
import subprocess
import traceback
import cv2
import requests
import magic
from tqdm import tqdm
from threading import Thread
from pathlib import Path
from glob import glob
from functools import lru_cache
from utils import SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, get_output_img_path, get_output_dir, dict_to_tuple, MIME_TYPE_TO_EXTENSION, TMP_IMG_PATH
from backend.progress_manager.progress_manager import global_progress_manager, make_progress_key
import re
from multiprocessing import Process
from functools import wraps

def normalize_read_file_output(func):
    @wraps(func)
    def wrapper(*args, **kwargs):
        raw = func(*args, **kwargs)
        task_id = kwargs.get("task_id") or (raw[0] if isinstance(raw, tuple) and isinstance(raw[0], str) else None)
        if task_id is None:
            file_name = kwargs.get('file_path') or args[0]
            if len(args) > 3:
                extra_params = args[3]
            else:
                extra_params = kwargs.get('extra_params')
            task_id = make_progress_key(file_name, extra_params)
        # CASE A: final images
        if isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], list) and isinstance(raw[1], list):
            return {"task_id": task_id, "result": {"images": raw[0], "paths": raw[1]}}

        # CASE B: in‑progress (task_id, status)
        if isinstance(raw, tuple) and len(raw) == 2 and isinstance(raw[0], str):
            task_id = task_id or raw[0]
            pm = global_progress_manager.get_task_info_by_id(task_id)
            status, progress = (pm["status"], pm["progress"]) if pm else (raw[1], 0)
            return {"task_id": task_id, "result": {"status": status, "progress": progress}}

        # CASE C: None or unrecognized → fallback to progress manager or default
        pm = global_progress_manager.get_task_info_by_id(task_id) if task_id else None
        if pm:
            return {"task_id": task_id, "result": {"status": pm["status"], "progress": pm["progress"]}}
        return {"task_id": task_id, "result": {"status": "No data", "progress": 0}}

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

    def read_file(self, file_path, frame_num, extra_params=None, task_id=None):
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

    # @lru_cache(maxsize=128)
    def read_file(self, file_path, frame_num, store_images=True, extra_params=None, task_id=None):
        # print('StandardImageReader.read_file', file_path)
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        if not task_id or global_progress_manager.get_task_info_by_file(file_path, extra_params) is None:
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status="Single image reading started", progress=0)
        img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        if os.path.exists(img_path):
            global_progress_manager.set_status(task_key=task_id, status="Single image reading complete", progress=100)
            return [cv2.imread(img_path),], [img_path,]
        img = cv2.imread(file_path)
        if store_images:
            Path(os.path.dirname(img_path)).mkdir(parents=True, exist_ok=True)
            cv2.imwrite(img_path, img)
        global_progress_manager.set_status(task_key=task_id, status="Single image reading complete", progress=100)
        return [img,], [img_path,]


class VideoReader(ImageReader):
    """
    Class for reading video files.
    """
    def __init__(self):
        self.cache = {}
        self.reader_name = 'VideoReader'

    def get_num_frames(self, file_path):
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        if file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            cap = cv2.VideoCapture(file_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            cap.release()
            return total_frames
        return 0

    def get_exisiting_and_expected_frames(self, file_path, local_dir):
        cap = cv2.VideoCapture(file_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        expected_frame_files = [os.path.join(local_dir, '%05d.png'%i) for i in range(total_frames)]
        cap.release()

        # Check if local directory exists and if it contains all expected frame files
        existing_frames = glob(os.path.join(local_dir, '*.png'))
        return existing_frames, expected_frame_files
    
    def read_file(self, file_path: str, frame_num=None, store_images=True, extra_params=None, task_id=None):
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
        local_dir = get_output_dir(file_path, extra_params, out_dir=TMP_IMG_PATH)
        Path(local_dir).mkdir(parents=True, exist_ok=True)
        print('video reader', local_dir)
        task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
        print(task_info, 'task_info')
        
        def render_video_frame(file_path, frame_num, extra_params):
            if frame_num is not None:
                img_path = os.path.join(local_dir, f"{frame_num:05d}.png")
                if os.path.exists(img_path):
                    results = [cv2.imread(img_path),], [img_path,]
                    return [cv2.imread(img_path),] , [img_path, ]

                cap = cv2.VideoCapture(file_path)
                cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
                ret, frame_img = cap.read()
                if ret:
                    if store_images:
                        cv2.imwrite(img_path, frame_img)
                    results = [frame_img,], [img_path,]
                    return [frame_img,], [img_path, ]
            
        if task_id is None:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            task_id = global_progress_manager.create_task(file_path, extra_params)
            if task_info is None:
                global_progress_manager.set_status(task_id, status='Video reading started', progress=0)
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                existing, expected = self.get_exisiting_and_expected_frames(file_path, local_dir)
                if len(existing) != len(expected):
                    t1 = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                    t1.start()
                # if 'complete' in task_info['status'] or 'Extracting frames' in task_info['status'] or 'Starting extraction' in task_info['status']:
                if frame_num is None:
                    return self.get_exisiting_and_expected_frames(file_path, local_dir)
                else:
                    return render_video_frame(file_path, frame_num, extra_params)
            else:
                task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
                task_id = global_progress_manager.create_task(file_path, extra_params)
                global_progress_manager.set_status(task_id, status=task_info['status'], progress=task_info['progress'])
                existing, expected = self.get_exisiting_and_expected_frames(file_path, local_dir)
                if 'complete' in task_info['status'] or 'Extracting frames' in task_info['status'] or 'Starting extraction' in task_info['status']:
                    if frame_num is None:
                        return self.get_exisiting_and_expected_frames(file_path, local_dir)
                    else:
                        return render_video_frame(file_path, frame_num, extra_params)
                else:
                    if len(existing) != len(expected):
                        t1 = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                        t1.start()
                    if frame_num is None:
                        return self.get_exisiting_and_expected_frames(file_path, local_dir)
                    else:
                        return render_video_frame(file_path, frame_num, extra_params)
        else:
            task_info = global_progress_manager.get_task_info_by_file(file_path, extra_params)
            if 'complete' in task_info['status'] or 'Extracting frames' in task_info['status'] or 'Starting extraction' in task_info['status']:
                if frame_num is None:
                    return self.get_exisiting_and_expected_frames(file_path, local_dir)
                else:
                    return render_video_frame(file_path, frame_num, extra_params)
            else:
                existing, expected = self.get_exisiting_and_expected_frames(file_path, local_dir)
                if len(existing) != len(expected):
                    t1 = Thread(target=self.store_all_frames, args=(file_path, local_dir, task_id))
                    t1.start()
                if frame_num is None:
                    return self.get_exisiting_and_expected_frames(file_path, local_dir)
                else:
                    return render_video_frame(file_path, frame_num, extra_params)


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

        # We'll add the '-progress pipe:1' option so ffmpeg sends progress to stdout.
        # We also quiet normal console output with '-nostats' and '-loglevel warning'
        command = [
            'ffmpeg',
            '-i', file_path,
            '-start_number', '0',
            '-progress', 'pipe:1',
            '-nostats',
            '-loglevel', 'warning',
            os.path.join(out_dir, '%05d.png')
        ]

        # Start ffmpeg as a Popen process so we can read lines continuously
        process = subprocess.Popen(
            command,
            stdout=subprocess.PIPE,
            stderr=subprocess.STDOUT,
            text=True  # so we get decoded strings, not bytes
        )

        frame_regex = re.compile(r'^frame=(\d+)$')

        # We can discover the total frames once at the start (optional) to compute % done:
        cap = cv2.VideoCapture(file_path)
        total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
        cap.release()

        global_progress_manager.set_status(
            task_id,
            status=f"Starting extraction of {total_frames} frames",
            progress=0
        )

        # Read lines from ffmpeg until it finishes
        while True:
            line = process.stdout.readline()
            if not line:
                # No more output; either finished or died
                break
            
            line = line.strip()

            # ffmpeg progress lines come in the form "key=value"
            # e.g. "frame=17", "progress=continue", etc.
            # We’ll look specifically for "frame=..." lines:
            match = frame_regex.match(line)
            if match:
                current_frame = int(match.group(1))
                if total_frames > 0:
                    percent = int((current_frame / total_frames) * 100)
                else:
                    percent = 0
                global_progress_manager.set_status(
                    task_id,
                    status=f"Extracting frames (frame={current_frame}/{total_frames})",
                    progress=percent
                )

        # Wait for ffmpeg to actually exit (necessary if there's buffered output at the end)
        process.wait()

        # If the command failed, Popen's return code is nonzero
        if process.returncode != 0:
            error_msg = f"FFmpeg extraction failed with code {process.returncode}"
            print(error_msg)
            global_progress_manager.set_status(task_id, status=error_msg, progress=100)
            raise RuntimeError(error_msg)

        # If we get here, ffmpeg succeeded
        num_extracted = len(glob(os.path.join(out_dir, '*.png')))
        print(f"Extracted {num_extracted} frames to {out_dir}")

        global_progress_manager.set_status(
            task_id,
            status='Video frame rendering complete',
            progress=100
        )

class URLReader(ImageReader):
    """
    Class for reading images and videos from URLs.
    """
    def __init__(self):
        self.image_reader = StandardImageReader()
        self.video_reader = VideoReader()
        self.reader_name = 'URLReader'
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
        return 0

    def get_image_path(self, file_path, frame_num, extra_params):
        if file_path.startswith('http'):
            local_path = download_copy_file(file_path, frame_num, extra_params)
            mime = magic.Magic(mime=True)
            file_type = mime.from_file(local_path)
            if file_type.startswith('image'):
                return self.image_reader.get_image_path(local_path,  frame_num, extra_params)
            elif file_type.startswith('video'):
                return self.video_reader.get_image_path(local_path,  frame_num, extra_params)
        return None
    
    def download_with_progress(self, file_url, download_file_path, task_id=None):
        # If the user wants to track progress:
        global_progress_manager.set_status(task_id, status="Starting download", progress=0)

        # 1) Stream the GET request
        with requests.get(file_url, stream=True, timeout=10) as resp:
            resp.raise_for_status()  # Raise an exception for 4xx/5xx status
            total_size = resp.headers.get('content-length')
            if total_size is not None:
                total_size = int(total_size)

            downloaded = 0
            chunk_size = 8192

            # 2) Open the output file and write in chunks
            with open(download_file_path, 'wb') as f:
                for chunk in resp.iter_content(chunk_size=chunk_size):
                    if not chunk:
                        continue
                    f.write(chunk)
                    downloaded += len(chunk)
                    # 3) Update progress each time a chunk is written
                    if total_size:
                        percent = int(100 * downloaded / total_size)
                        global_progress_manager.set_status(
                            task_key=task_id,
                            status=f"Download in progress... {downloaded}/{total_size} bytes",
                            progress=percent
                        )

    # @lru_cache(maxsize=128)
    def read_file(self, file_path, frame_num=None, store_images=True, extra_params=None, task_id=None):
        if not file_path.startswith('http'):
            raise ValueError('Not a URL')
        f_path = 'default_download'
        if os.path.basename(file_path).strip() != '':
            f_path =  os.path.basename(file_path).strip()
        download_file_path = os.path.join(self.temp_download_dir, f_path)
        extension = os.path.splitext(f_path)[1]
        if not task_id or global_progress_manager.get_task_info_by_file(file_path, extra_params) is None:
            task_id = global_progress_manager.create_task(file_path, extra_params)
            global_progress_manager.set_status(task_key=task_id, status='Downloading started', progress=0)
        if os.path.exists(download_file_path):
            global_progress_manager.set_status(task_key=task_id, status='Downloading completed', progress=30)
        else:
            def download(file_path, download_file_path, task_id):
                global_progress_manager.set_status(task_key=task_id, status='File download started', progress=0)
                self.download_with_progress(file_path, download_file_path, task_id)
                global_progress_manager.set_status(task_key=task_id, status='Downloading completed', progress=30)

            status = global_progress_manager.get_task_info_by_file(file_path, extra_params)['status']
            if not status.startswith('Download in progress'):
                t = Thread(target=download, args=(file_path, download_file_path, task_id))
                t.start()
                # return task_id, status
            
        def render_downloaded_file(file_path, extra_params, download_file_path):
            while (global_progress_manager.get_task_info_by_file(file_path, extra_params)['status'] != 'Downloading completed') :
                pass
            mime = magic.Magic(mime=True)
            file_type = mime.from_file(download_file_path)
            file_extension = MIME_TYPE_TO_EXTENSION.get(file_type, 'unknown')
            print(file_type, file_extension)
            if extension == '':
                download_file_path1 = download_file_path+'.'+file_extension
                os.rename(download_file_path, download_file_path1)  
            else:
                download_file_path1 = download_file_path
                print('download', download_file_path1)
            if file_type.startswith('image'):
                return self.image_reader.read_file(download_file_path1, frame_num, store_images, extra_params, task_id)
            elif file_type.startswith('video'):
                return self.video_reader.read_file(download_file_path1, frame_num, store_images, extra_params, task_id)
        
        t1 = Thread(target=render_downloaded_file, args=(file_path, extra_params, download_file_path))
        t1.start()
        status = global_progress_manager.get_task_info_by_file(file_path, extra_params)['status']    
        return task_id, status


readers = [StandardImageReader(), VideoReader(), URLReader()]

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

@normalize_read_file_output
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
    for reader in readers:
        try:
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params), task_id=task_id)
            if result is not None:
                return result
        except Exception as e:
            print(e)
            print(traceback.format_exc())
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
    if not task_info:
        return "Task not found"
    else:
        return task_info['status']