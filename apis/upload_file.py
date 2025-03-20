
import os
from pathlib import Path
from flask import Blueprint, jsonify, request
from utils import SUPPORTED_IMAGE_EXTENSIONS, SUPPORTED_VIDEO_EXTENSIONS, TMP_IMG_PATH
from apis.current_image_api import current_images
from werkzeug.utils import secure_filename


file_uploader = Blueprint('file-uploader', __name__)

def allowed_file(filename):
    return '.' in filename and '.'+filename.rsplit('.', 1)[1].lower() in SUPPORTED_VIDEO_EXTENSIONS+SUPPORTED_IMAGE_EXTENSIONS

@file_uploader.route('/upload', methods=['POST'])
def upload():
    if 'files' not in request.files:
        return jsonify({"error": "No files part in the request"}), 400
    files = request.files.getlist('files')
    uploaded_files = []
    current_imgs = []
    for file in files:
        print(file, file.filename)
        if file and allowed_file(file.filename):
            filename = secure_filename(file.filename)
            filepath = os.path.join(TMP_IMG_PATH, 'uploaded', filename)
            Path(os.path.dirname(filepath)).mkdir(parents=True, exist_ok=True)
            file.save(filepath)
            current_image = current_images.set_current_image(filepath, {})
            current_imgs.append(current_image.to_dict())
            uploaded_files.append(filename)
        else:
            return jsonify({"error": f"Invalid file type: {file.filename}"}), 400

    return jsonify({"message": "Files uploaded successfully!", "files": uploaded_files, "images": current_imgs})