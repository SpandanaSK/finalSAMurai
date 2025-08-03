# Import and setup shared event loop first
import threading
import logging
import asyncio

# Configure logging for app startup
logging.basicConfig(level=logging.DEBUG, 
                   format='%(asctime)s - %(name)s - %(levelname)s - %(message)s')
logger = logging.getLogger(__name__)

# Force import of the event loop manager before any other asyncio operations
logger.info("Initializing shared event loop")
import backend.imvid_rendering.event_loop

# Now import the rest of the application
#import debugpy
from flask import Flask, render_template
from apis.imvid_api import file_rendering as imvid_app
from apis.sam_predictor_api import sam_predictor as sam_predictor_app
from apis.upload_file import file_uploader as file_uploader_app
from apis.dataset_api import dataset as dataset_app
from apis.auto_label_box_api import auto_label_box as auto_label_box_app
from apis.project_api import project_manager_ as project_manager_app

# Initialize Flask app
app = Flask(__name__)

app.register_blueprint(imvid_app, url_prefix='/im-vid-rendering')
app.register_blueprint(sam_predictor_app, url_prefix='/sam-ai')
app.register_blueprint(file_uploader_app, url_prefix='/file-uploader')
app.register_blueprint(dataset_app, url_prefix='/dataset')
app.register_blueprint(auto_label_box_app, url_prefix='/auto-label-box')
app.register_blueprint(project_manager_app, url_prefix='/project-manager')


@app.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"

@app.route('/')
def home():
    return render_template('index.html') 

@app.route('/devel-version')
def home2():
    return render_template('index-bootstrap.html') 

@app.route('/test')
def test():
    return render_template('test.html') 

from flask import request, jsonify
import numpy as np # type: ignore
from backend.imvid_rendering.utils import apply_window_level

@app.route('/debug/cornerstone_data', methods=['POST'])
def debug_cornerstone_data():
    try:
        data = request.get_json()
        
        # Extract data from request
        metadata = data['metadata']
        pixel_data = np.array(data['pixelData'])
        window_width = float(data['windowWidth'])
        window_center = float(data['windowCenter'])
        
        # Reshape pixel data to match image dimensions
        pixel_data = pixel_data.reshape((metadata['height'], metadata['width']))
        
        # Apply slope and intercept if available
        if metadata.get('slope') and metadata.get('intercept'):
            pixel_data = pixel_data * float(metadata['slope']) + float(metadata['intercept'])
        
        # Apply our windowing function
        windowed_data = apply_window_level(pixel_data, window_width, window_center)
        
        # Calculate statistics for comparison
        stats = {
            'original': {
                'min': float(np.min(pixel_data)),
                'max': float(np.max(pixel_data)),
                'mean': float(np.mean(pixel_data)),
                'std': float(np.std(pixel_data)),
                'histogram': np.histogram(pixel_data, bins=10)[0].tolist()
            },
            'windowed': {
                'min': float(np.min(windowed_data)),
                'max': float(np.max(windowed_data)),
                'mean': float(np.mean(windowed_data)),
                'std': float(np.std(windowed_data)),
                'histogram': np.histogram(windowed_data, bins=10)[0].tolist()
            }
        }
        
        return jsonify({
            'success': True,
            'message': 'Data received and processed',
            'metadata': metadata,
            'statistics': stats
        })
        
    except Exception as e:
        app.logger.error(f"Error processing Cornerstone data: {str(e)}")
        return jsonify({
            'success': False,
            'error': str(e)
        }), 500 

# Enable remote debugging
#debugpy.listen(("0.0.0.0", 5678))
print("Waiting for debugger to attach...")
#debugpy.wait_for_client()

# Run the app if this script is executed directly
if __name__ == '__main__':
    logger.info("Starting Flask app in debug mode")
    app.run(host='0.0.0.0', port=8000)
