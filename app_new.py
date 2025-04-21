import debugpy
from flask import Flask, render_template
from apis.imvid_api import file_rendering as imvid_app
from apis.sam_predictor_api import sam_predictor as sam_predictor_app
from apis.upload_file import file_uploader as file_uploader_app
from apis.dataset_api import dataset as dataset_app
from apis.auto_label_box_api import auto_label_box as auto_label_box_app

app = Flask(__name__)

app.register_blueprint(imvid_app, url_prefix='/im-vid-rendering')
app.register_blueprint(sam_predictor_app, url_prefix='/sam-ai')
app.register_blueprint(file_uploader_app, url_prefix='/file-uploader')
app.register_blueprint(dataset_app, url_prefix='/dataset')
app.register_blueprint(auto_label_box_app, url_prefix='/auto-label-box')


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

# Enable remote debugging
debugpy.listen(("0.0.0.0", 5678))
print("Waiting for debugger to attach...")
debugpy.wait_for_client()

app.run(host='0.0.0.0', port=8000)
