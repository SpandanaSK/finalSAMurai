""" This module provides utility functions for image annotation tasks. """

import os
import hashlib
import itertools

SUPPORTED_IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', 
                              '.pbm', '.pgm', '.ppm', '.sr', '.ras')
SUPPORTED_VIDEO_EXTENSIONS = ('.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm')
current_dir = os.path.dirname(os.path.abspath(__file__))
TMP_IMG_PATH = '/tmp/images/'
TMP_DCM_PATH = '/tmp/dcm/'
DATASET_DIR = '/tmp/samurai_datasets/'
PROJECT_DIR = current_dir

MIME_TYPE_TO_EXTENSION = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/bmp': 'bmp',
    'image/tiff': 'tiff',
    'image/webp': 'webp',
    'image/x-portable-bitmap': 'pbm',
    'image/x-portable-graymap': 'pgm',
    'image/x-portable-pixmap': 'ppm',
    'image/x-sun-raster': 'ras',
    'video/mp4': 'mp4',
    'video/x-msvideo': 'avi',
    'video/quicktime': 'mov',
    'video/x-matroska': 'mkv',
    'video/x-flv': 'flv',
    'video/x-ms-wmv': 'wmv',
    'video/webm': 'webm'
}

def dict_to_tuple(d):
    """
    Converts a dictionary to a tuple.

    Args:
        d (dict): The dictionary to be converted.

    Returns:
        tuple: The tuple representation of the dictionary.
    """
    if type(d) == tuple:
        return d
    if d is None:
        d = {}
    # if d is list of [[a, b], [c, d], ....] then convert to dict
    if type(d) == list:
        d = {d[i][0]: d[i][1] for i in range(len(d))}
    return tuple(sorted(d.items()))

def get_output_dir(f, extra_params={}, out_dir=TMP_IMG_PATH):
    out_dir1 = os.path.join(out_dir, hashlib.md5((f+str(extra_params)).encode()).hexdigest())
    return out_dir1

def get_output_img_path(file_path, frame_num, extra_params={}, out_dir=TMP_IMG_PATH):
    """
    Generates the output image path based on the given directory, filename, and frame number.

    Args:
        out_dir (str): The base output directory.
        f (str): The filename or identifier used to generate the output directory.
        frame (str, optional): The frame number to be included in the output filename. Defaults to "0".

    Returns:
        str: The full path to the output image file.
    """
    out_dir1 = get_output_dir(file_path, dict_to_tuple(extra_params), out_dir)
    if frame_num is None:
        out_f = '%05d.jpg'%(0, )
    else:
        out_f = '%05d.jpg'%int(frame_num)
    out_ff = os.path.join(out_dir1, out_f)
    return out_ff

