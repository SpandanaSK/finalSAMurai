"""Image and video rendering module"""

from flask import Flask,  Blueprint, jsonify, send_file, request, Response
from backend.imvid_rendering.imvid_reader import read_file, get_task_info
from m_utils.utils import TMP_IMG_PATH, SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS
import os
from PIL import Image
import io
import re

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
    return jsonify({"extensions": ','.join(SUPPORTED_IMAGE_EXTENSIONS+SUPPORTED_VIDEO_EXTENSIONS+('.zip', '.dcm'))})


@file_rendering.route('/get_fps', methods=['POST'])
def get_fps():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": {
            "quality": <int between 1-100, default 85>
            ...
        }
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    results = read_file(file_path=file_name, frame_num=None, extra_params=None, store_images=True)
    print("results fps", results)
    return jsonify(results)


def stream_file_response(file_path, frame_num, extra_params):
    path = file_path
    if not os.path.exists(path):
        return jsonify({"error": "file not found"})
    file_size = os.stat(path).st_size
    range_header = request.headers.get('Range', None)
    if not range_header:
        return send_file(path)
    
    byte1, byte2 = 0, None
    m = re.search(r'bytes=(\d+)-(\d*)', range_header)
    if m:
        g = m.groups()
        byte1 = int(g[0])
        if g[1]:
            byte2 = int(g[1])
    
    if byte2 is None or byte2 >= file_size:
        byte2 = file_size - 1
    
    length = byte2 - byte1 + 1
    with open(path, 'rb') as f:
        f.seek(byte1)
        data = f.read(length)
    
    resp = Response(data, 206, mimetype='video/mp4', direct_passthrough=True)
    resp.headers.add('Content-Range', f'bytes {byte1}-{byte2}/{file_size}')
    resp.headers.add('Accept-Ranges', 'bytes')
    resp.headers.add('Content-Length', str(length))
    return resp

@file_rendering.route('/render', methods=['POST'])
def render():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": {
            ...
        }
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params', {}) # default quality is 85
    
    if not file_name:
        return jsonify({"error": "file_name is required"})
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    
    if results is None:
        return jsonify({"error": "file not found"})
    if len(results['result']['images']) == 0:
        return jsonify({"error": "no images found"})
    if results['result']['fps'] > 0:
        return stream_file_response(results['result']['file_path'], None, None)
    else:
        if frame_num is None:
            frame_num = 0
        frame_num = int(frame_num)
        if frame_num >= len(results['result']['images']):
            frame_num = frame_num%len(results['result']['images'])
        return stream_file_response(results['result']['images'][int(frame_num)], None, None)
    

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
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True, async_read=True)
    
    if results is None:
        return jsonify({
            "error": "Failed to process file",
            "file_name": file_name,
            "status": "failed"
        })
        
    # Even if we don't have images yet, return task_id for polling
    return jsonify(results)

@file_rendering.route('/get_file_rendering_status', methods=['POST'])
def get_file_rendering_status():
    data = request.json
    file_name = data.get('file_name')
    extra_params = data.get('extra_params', {})
    return get_task_info(file_name, extra_params)
    

@file_rendering.route('/render_file')
def render_file():
    '''
    GET endpoint to serve raw files from the server filesystem.
    
    Query parameters:
        file_name: Path to the file to be served
        
    Returns:
        The raw file content if the file exists and has a supported extension,
        otherwise a JSON error response.
    '''
    data = request.args
    file_name = data.get('file_name')
    
    if not file_name:
        return jsonify({"error": "Missing file_name parameter"}), 400
        
    # Check if path is within allowed directories and has supported extension
    allowed_path = file_name.startswith('/tmp')
    supported_ext = any([file_name.lower().endswith(ext) for ext in 
                         SUPPORTED_IMAGE_EXTENSIONS + 
                         SUPPORTED_VIDEO_EXTENSIONS + 
                         ('.dcm', '.zip')])
    
    if allowed_path and supported_ext:
        if os.path.exists(file_name):
            try:
                # Set proper content type based on file extension
                content_type = None
                if file_name.lower().endswith('.zip'):
                    content_type = 'application/zip'
                elif file_name.lower().endswith('.dcm'):
                    content_type = 'application/dicom'
                
                # Send the file with proper content type
                return send_file(
                    file_name,
                    mimetype=content_type,
                    as_attachment=True,
                    download_name=os.path.basename(file_name)
                )
            except Exception as e:
                return jsonify({"error": f"Error serving file: {str(e)}"}), 500
        else:
            return jsonify({"error": "File not found"}), 404
    
    return jsonify({"error": "Unsupported file or file path"}), 400


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


