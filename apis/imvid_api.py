"""Image and video rendering module"""

from flask import Flask,  Blueprint, jsonify, send_file, request
from backend.imvid_rendering.imvid_reader import read_file, get_num_frames, get_image_path, get_task_info, async_read_file
from utils import TMP_IMG_PATH, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS
import os

app = Flask(__name__)
file_rendering = Blueprint('im-vid-rendering', __name__)


@file_rendering.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"

@file_rendering.route('/get_supported_extensions')
def get_supported_extensions():
    return jsonify({"extensions": ','.join(SUPPORTED_IMAGE_EXTENSIONS+SUPPORTED_VIDEO_EXTENSIONS)})



@file_rendering.route('/render', methods=['POST'])
def render():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params', {})
    if not file_name:
        return jsonify({"error": "file_name is required"})
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    if results is None:
        return jsonify({"error": "file not found"})
    return send_file(results['result']['images'][0])

@file_rendering.route('/async_render', methods=['POST'])
def async_render():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params', {})
    if not file_name:
        return jsonify({"error": "file_name is required"})
    results = async_read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    return jsonify(results)

@file_rendering.route('/get_file_rendering_status', methods=['POST'])
def get_file_rendering_status():
    data = request.json
    file_name = data.get('file_name')
    extra_params = data.get('extra_params', {})
    return get_task_info(file_name, extra_params)
    

@file_rendering.route('/render_file', methods=['POST'])
def render_file():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    if file_name.startswith(TMP_IMG_PATH):
        if any([file_name.endswith(ext) for ext in SUPPORTED_IMAGE_EXTENSIONS+SUPPORTED_VIDEO_EXTENSIONS]):
            while not os.path.exists(file_name):
                pass
            return send_file(file_name, mimetype='image/jpeg')
    return "Unsupported file or file path"


@file_rendering.route('/unique_name', methods=['POST'])
def unique_name():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    get the unique name of the file to be rendered from the file_name, frame_num and extra_params
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num', 0)
    extra_params = data.get('extra_params', {})
    u_name = get_image_path(file_name, frame_num%get_num_frames(file_name), extra_params)
    return jsonify({"unique_name": u_name})

@file_rendering.route('/num_frames', methods=['POST'])
def num_frames():
    '''
    {
        "file_name": <Either a local file path or URL>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    if not file_name:
        return jsonify({"error": "file_name is required"})
    return jsonify({"num_frames": get_num_frames(file_name)})


