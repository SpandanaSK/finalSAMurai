from flask import Flask,  Blueprint, jsonify, request
from backend.project.project_manager import ProjectManager

import json

app = Flask(__name__)
project_manager_ = Blueprint('project-manager', __name__)

project_manager = ProjectManager()

@project_manager_.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"

@project_manager_.route('/create_new_project', methods=['POST'])
def create_new_project():
    """
    Save the dataset to the specified path.

    Returns:
        str: The status of the save operation.
    """
    data = request.json
    project_name = data.get('project_name')
    project_desc = data.get('project_desc')
    created_on = data.get('created_on')
    created_by = data.get('created_by')
    json_file, project_id = project_manager.create_empty_project(project_name, project_desc, created_on, created_by)
    return jsonify({
        "status": "success", 
        "message": "Project created successfully", 
        "results": {
            "json_data": json.dumps(json.loads(open(json_file).read())),
            "project_id": project_id
        }
    })


@project_manager_.route('/load_project', methods=['POST'])
def load_project():
    data = request.json
    project_id = data.get('project_id')
    json_data = project_manager.load_project(project_id)
    return jsonify({
        "status": "success", 
        "message": "Project loaded successfully", 
        "results": {
            "json_data": json.dumps(json_data),
            "project_id": project_id
        }
    })


@project_manager_.route('/save_project', methods=['POST'])
def save_dataset():
    """
    Save the dataset to the specified path.

    Returns:
        str: The status of the save operation.
    """
    #project_id, json_data, last_edit_by, commit_message=
    data = request.json
    project_id = data.get('project_id')
    json_data = data.get('json_data')
    last_edit_by = data.get('last_edit_by')
    commit_message = data.get('commit_message', 'Dataset update')
    project_manager.save_project(project_id, json_data, last_edit_by, commit_message)
    return jsonify({"status": "success", "message": "Project saved successfully for "+project_id[:20]})


@project_manager_.route('/filter_projects', methods=['POST'])
def load_dataset():
    data = request.json
    file_path = data.get('file_path')
    return jsonify(project_manager.filter_projects())



