""" This module provides utility functions for image annotation tasks. """

import os
import hashlib
import itertools

SUPPORTED_IMAGE_EXTENSIONS = ('.jpg', '.jpeg', '.png', '.bmp', '.tiff', '.tif', '.webp', 
                              '.pbm', '.pgm', '.ppm', '.sr', '.ras')
SUPPORTED_VIDEO_EXTENSIONS = ('.mp4', '.avi', '.mov', '.mkv', '.flv', '.wmv', '.webm')

TMP_IMG_PATH = '/tmp/images/'

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


def extract_file_path_and_frame(url):
    regex = r'path=([^?]*?\.[a-zA-Z0-9]+)(?:\?|&|$).*?(?:frame=(\d+))?' 
    match = re.search(regex, url)
    
    if match:
        file_path = match.group(1)
        frame = match.group(2) if match.group(2) else None
        return file_path, frame
    else:
        if os.path.exists(url):
            return url , None
        return None, None


def check_if_all_files_are_rendered(out_dir, num_frame):
    """
    Checks if all expected image files are rendered in the specified output directory.

    Args:
        out_dir (str): The directory where the image files are expected to be located.
        num_frame (int): The number of image files expected.

    Returns:
        bool: True if all expected image files are found, False otherwise.
    """
    for i in range(num_frame):
        if not os.path.exists(os.path.join(out_dir, '%05d.jpg'%i)):
            print(os.path.join(out_dir, '%05d.jpg'%i), os.path.exists(os.path.join(out_dir, '%05d.jpg'%i)))
            return False
    return True


def convert_via_label_to_idx(_via_attributes, _via_last_selected_region_attribute, object_name):
    region_options = _via_attributes['region'][_via_last_selected_region_attribute]['options'].keys()
    region_options = sorted(region_options)
    return region_options.index(object_name)
    
def convert_idx_to_via_label(_via_attributes, _via_last_selected_region_attribute, idx):
    region_options = _via_attributes['region'][_via_last_selected_region_attribute]['options'].keys()
    region_options = sorted(region_options)
    return region_options[idx]

def get_image_shape_from_image(img):
    if len(img.shape) == 3:
        nf, h, w = img.shape
        c = 1
    elif len(img.shape) == 4:
        nf, c, h, w = img.shape
        img = img.reshape(nf, h, w, c)
    else:
        h, w = img.shape
        nf = 1
        c = 1
    return (nf, h,w, c)


def get_valid_orientation_codes():
    # Define the possible values for x, y, and z
    x_values = ['L', 'R']
    y_values = ['A', 'P']
    z_values = ['I', 'S']

    # Use itertools.product to get all combinations of x, y, z
    combinations = list(itertools.product(x_values, y_values, z_values))

    # Join each tuple to form the string x+y+z
    combinations_str = [''.join(combo) for combo in combinations]

    # Print the result
    return combinations_str

VALID_ORIENTATION_CODES = get_valid_orientation_codes()