from flask import Flask,  Blueprint, jsonify, request
from backend.dataset.git_dataset import GitDataset

app = Flask(__name__)
dataset = Blueprint('dataset', __name__)

git_dataset = GitDataset()

@dataset.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"

@dataset.route('/save_dataset', methods=['POST'])
def save_dataset():
    """
    Save the dataset to the specified path.

    Returns:
        str: The status of the save operation.
    """
    data = request.json
    file_path = data.get('file_path')
    json_data = data.get('json_data')
    commit_message = data.get('commit_message', 'Dataset update')
    git_dataset.save(file_path, json_data, commit_message)
    return jsonify({"status": "success", "message": "Dataset saved successfully"})


@dataset.route('/load_dataset', methods=['POST'])
def load_dataset():
    data = request.json
    file_path = data.get('file_path')
    return jsonify({
        "status": "success",
        "results": git_dataset.load(file_path)
    })



