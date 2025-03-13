
from flask import Flask, render_template
from apis.imvid_api import file_rendering as imvid_app
from apis.current_image_api import current_img as current_img_app
from apis.sam_predictor_api import sam_predictor as sam_predictor_app
from apis.upload_file import file_uploader as file_uploader_app

app = Flask(__name__)

app.register_blueprint(imvid_app, url_prefix='/im-vid-rendering')
app.register_blueprint(sam_predictor_app, url_prefix='/sam-ai')
app.register_blueprint(current_img_app, url_prefix='/current-img')
app.register_blueprint(file_uploader_app, url_prefix='/file-uploader')


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

app.run(host='0.0.0.0', port=5000)