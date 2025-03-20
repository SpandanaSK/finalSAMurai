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
from utils import SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, get_output_img_path, get_output_dir, dict_to_tuple, MIME_TYPE_TO_EXTENSION


TMP_IMG_PATH = "/app/tmp/images"  # Define your temporary image path


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

    def read_file(self, file_path, frame_num, extra_params=None):
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
        print('StandardImageReader.get_image_path', file_path, frame_num, extra_params)
        if TMP_IMG_PATH in file_path:
            img_path = file_path
        else:
            img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        print('StandardImageReader.get_image_path', img_path)
        return img_path

    def get_num_frames(self, file_path):
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")
        if file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS):
            return 1
        return 0

    # @lru_cache(maxsize=128)
    def read_file(self, file_path, frame_num, store_images=True, extra_params=None):
        print('StandardImageReader.read_file', file_path)
        if not file_path.endswith(SUPPORTED_IMAGE_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported image format for StandardImageReader")

        img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        if os.path.exists(img_path):
            return [cv2.imread(img_path),], [img_path,]
        img = cv2.imread(file_path)
        if store_images:
            Path(os.path.dirname(img_path)).mkdir(parents=True, exist_ok=True)
            cv2.imwrite(img_path, img)
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

    def get_image_path(self, file_path, frame_num, extra_params):
        if not file_path.endswith(SUPPORTED_VIDEO_EXTENSIONS) or file_path.startswith('http'):
            raise ValueError("Unsupported video format for VideoReader")
        frame_num = int(frame_num)%self.get_num_frames(file_path)
        if file_path.startswith(TMP_IMG_PATH) and 'downloaded' in file_path:
            img_path = file_path
        else:
            img_path = get_output_img_path(file_path, frame_num, extra_params=extra_params, out_dir=TMP_IMG_PATH)
        return img_path
    
    def read_file(self, file_path: str, frame_num=None, store_images=True, extra_params=None):
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
        if frame_num is not None:
            img_path = os.path.join(local_dir, f"{frame_num:05d}.png")
            if os.path.exists(img_path):
                return [cv2.imread(img_path),] , [img_path, ]

            cap = cv2.VideoCapture(file_path)
            cap.set(cv2.CAP_PROP_POS_FRAMES, frame_num)
            ret, frame_img = cap.read()
            if ret:
                if store_images:
                    cv2.imwrite(img_path, frame_img)
                return [frame_img,], [img_path, ]
            cap.release()
            return None
        else:
            print(f"Reading all frames from {file_path}")
            # Get the total number of frames to handle progress properly
            cap = cv2.VideoCapture(file_path)
            total_frames = int(cap.get(cv2.CAP_PROP_FRAME_COUNT))
            expected_frame_files = [os.path.join(local_dir, '%05d.png'%i) for i in range(total_frames)]
            cap.release()

            # Check if local directory exists and if it contains all expected frame files
            existing_frames = glob(os.path.join(local_dir, '*.png'))
            num_existing = len(existing_frames)
            print(f"Found {num_existing} frames in {local_dir}")

            # If not all frames are present, store them
            if num_existing != total_frames:
                print("Starting to store all frames...")
                t = Thread(target=self.store_all_frames, args=(file_path, local_dir))
                t.start()
                # self.store_all_frames(file_path, out_dir=local_dir)
                print(f"Stored {total_frames} frames")


            # Return the list of frames and the path to the first frame
            return [0]*total_frames, expected_frame_files

    def store_all_frames(self, file_path, out_dir):
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
        print('store_all_frames')
        print('file_path', file_path)
        print('out_dir', out_dir)
        Path(out_dir).mkdir(parents=True, exist_ok=True)
    
        # Example command: ffmpeg -i input.mp4 out_dir/%05d.png
        command = [
            'ffmpeg',
            '-i', file_path, 
            '-start_number', '0',
            os.path.join(out_dir, '%05d.png')
        ]
        
        # Run FFmpeg; it will extract all frames in a single pass
        subprocess.run(command, check=True)
    
        print(f"Frames extracted to {out_dir}")
        

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

    # @lru_cache(maxsize=128)
    def read_file(self, file_path, frame_num=None, store_images=True, extra_params=None):
        f_path = 'default_download'
        if os.path.basename(file_path).strip() != '':
            f_path =  os.path.basename(file_path).strip()
        download_file_path = os.path.join(self.temp_download_dir, f_path)
        print('download_file_path', download_file_path, os.path.exists(download_file_path))
        extension = os.path.splitext(f_path)[1]
        if os.path.exists(download_file_path):
            pass
        else:
            # 1. Download the file to download_file_path
            # 2. Determine the downloaded file type
            # 3. Use the correct Reader class
            # 4. Store all frames for the download_file_path to TMP_IMG_PATH/<unique_id>/<all frames>
            print('downloading', file_path)
            resp = requests.get(file_path, timeout=10)
            with open(download_file_path, 'wb') as f:
                f.write(resp.content)

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
            return self.image_reader.read_file(download_file_path1, frame_num, store_images, extra_params)
        elif file_type.startswith('video'):
            return self.video_reader.read_file(download_file_path1, frame_num, store_images, extra_params)
        return None

def download_copy_file(file_path, frame_num=None, extra_params=None, out_dir=TMP_IMG_PATH):
    """
    Downloads a file from the given URL and saves it locally. If the file does not exist locally, it is downloaded.
    The function also checks the MIME type of the file and ensures the correct file extension is used.

    Args:
        file_path (str): The URL of the file to be downloaded.
        frame_num (int, optional): Frame number to be used in the output image path. Defaults to None.
        extra_params (dict, optional): Additional parameters to be used in the output image path. Defaults to None.
        out_dir (str, optional): The directory where the file should be saved. Defaults to TMP_IMG_PATH.

    Returns:
        str: The local path to the downloaded file, with the correct file extension if necessary.
    """
    if not file_path.startswith('http'):
        for reader in [StandardImageReader(), VideoReader()]:
            try:
                unique_id = get_unique_id(file_path, extra_params)
                copy_dir = os.path.join(out_dir, unique_id)
                copy_file = ''
                result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=False, extra_params=dict_to_tuple(extra_params))
                print('download_copy_file', reader, result, file_path)
                Path(os.path.dirname(result[1])).mkdir(parents=True, exist_ok=True)
                if not os.path.exists(result[1]):
                    copy_file = shutil.copyfile(file_path, result[1])
                print('copy_file', copy_file)
            except Exception as e:
                print(e)
                continue
        return result[1]
    url = file_path
    download_dir = os.path.join(get_output_dir(url, extra_params, out_dir), 'downloaded')
    if os.path.basename(url) == '':
        f_name = 'default'
    else:
        f_name = os.path.basename(url)
    download_f = os.path.join(download_dir, f_name)
    print('will be downloaded to', download_f)
    if not os.path.exists(download_dir) or not os.path.exists(download_f) or len(glob(os.path.join(download_dir, '*'))) == 0:
        Path(download_dir).mkdir(parents=True, exist_ok=True)
        print('downloading', url)
        resp = requests.get(url, timeout=10)
        with open(download_f, 'wb') as f:
            f.write(resp.content)
    else:
        print('file already exists')
        print(download_dir, glob(os.path.join(download_dir, '*')))
        download_f = glob(os.path.join(download_dir, '*'))[0]

    mime = magic.Magic(mime=True)
    file_type = mime.from_file(download_f)
    extension = MIME_TYPE_TO_EXTENSION[file_type]
    print('download', download_f, file_type, extension)
    # if there is no extension then append the extension based on the mime type. rename the existing file and return the new local path
    # else check if the extension is correct or not. if the extension is correct then return the local path
    if not os.path.basename(download_f).endswith(extension):
        new_local_path = download_f + '.' + file_type.split('/')[1]
        shutil.copyfile(download_f, new_local_path)
        return new_local_path
    else:
        return download_f


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


def read_file(file_path, frame_num, store_images=True, extra_params=None):
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
            result = reader.read_file(file_path=file_path, frame_num=frame_num, store_images=store_images, extra_params=dict_to_tuple(extra_params))
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

