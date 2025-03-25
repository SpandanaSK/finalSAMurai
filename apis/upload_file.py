
import os
from pathlib import Path
from flask import Blueprint, jsonify, request
from utils import SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, TMP_IMG_PATH
from backend.imvid_rendering.imvid_reader import read_file, async_read_file
from werkzeug.utils import secure_filename
from backend.progress_manager.progress_manager import global_progress_manager


file_uploader = Blueprint('file-uploader', __name__)

def allowed_file(filename):
    return '.' in filename and '.'+filename.rsplit('.', 1)[1].lower() in SUPPORTED_VIDEO_EXTENSIONS+SUPPORTED_IMAGE_EXTENSIONS

@file_uploader.route('/upload', methods=['POST'])
def upload():
    if 'files' not in request.files:
        return jsonify({"error": "No files part in the request"}), 400
    files = request.files.getlist('files')
    uploaded_files = []
    uploaded_imgs = []
    for file in files:
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(TMP_IMG_PATH, 'uploaded', filename)
            Path(os.path.dirname(filepath)).mkdir(parents=True, exist_ok=True)
            file.save(filepath)
            results = async_read_file(file_path=filepath, frame_num=None, extra_params={}, store_images=True)
            uploaded_image = {
                'file_name': filepath,
                'extra_params': {},
                'unique_id': results['result']['paths'][0],
                'frame_paths': results['result']['paths']
            }
            uploaded_imgs.append(uploaded_image)
            uploaded_files.append(filename)
        else:
            return jsonify({"error": f"Invalid file type: {file.filename}"}), 400

    return jsonify({"message": "Files uploaded successfully!", "files": uploaded_files, "images": uploaded_imgs})