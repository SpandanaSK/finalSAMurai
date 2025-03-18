

import os
from glob import glob
import magic
from flask import Flask,  Blueprint, jsonify, request
from backend.imvid_rendering.imvid_reader import get_unique_id, URLReader, StandardImageReader, VideoReader
from utils import dict_to_tuple, MIME_TYPE_TO_EXTENSION, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, TMP_IMG_PATH
from m_utils.lru import LRUCache

app = Flask(__name__)
current_img = Blueprint('current-img', __name__)


class CurrentImage:
    """
    A class to represent the current image being processed.
    Attributes:
    -----------
    file_name : str
        The path to the image file.
    extra_params : dict
        Additional parameters for processing the image.
    unique_id : str
        A unique identifier for the image output directory.
    frames : list
        The frames read from the image file.
    """
    def __init__(self, file_name: str, extra_params: dict[str, int|str]):
        self.file_name = file_name
        self.extra_params = extra_params
        if self.file_name.startswith('http'):
            reader = URLReader()
            imgs, img_paths = reader.read_file(file_name, None, store_images=True, extra_params=extra_params)
            # self.frames = imgs
            self.unique_id = img_paths[0]
            self.frame_paths = img_paths
        else:
            readers = [StandardImageReader(), VideoReader()]
            for reader in readers:
                try:
                    imgs, img_paths = reader.read_file(file_name, None, store_images=True, extra_params=extra_params)
                    # self.frames = imgs
                    self.unique_id = img_paths[0]
                    self.frame_paths = img_paths
                except Exception as e:
                    continue
                break

    def to_dict(self):
        return {
            'file_name': self.file_name,
            'extra_params': self.extra_params,
             'unique_id': self.unique_id,
            'frame_paths': self.frame_paths
        }

    def __repr__(self):
        return f"CurrentImage(file_name={self.file_name}, unique_id={self.unique_id}, extra_params={self.extra_params})"
    


class CurrentImages:
    def __init__(self):
        # pass
        self.current_images = LRUCache(max_size=50)
    
    def set_current_image(self, file_name, extra_params):
        mkey = (file_name, dict_to_tuple(extra_params))
        if self.current_images.get(mkey):
            current_image = self.current_images.get(mkey)
        else:
            current_image = CurrentImage(file_name, extra_params)
            self.current_images.put(mkey, current_image)
        return current_image


current_images = CurrentImages()

@current_img.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"

@current_img.route('/set_current_image', methods=['POST'])
def set_current_image():
    """
    Set the current image to be displayed.

    Returns:
        str: The unique ID of the current image.
    """
    data = request.json
    file_name = data.get('file_name')
    extra_params = data.get('extra_params', {})
    current_image = current_images.set_current_image(file_name, extra_params)
    return jsonify({"current_image": current_image.to_dict()})