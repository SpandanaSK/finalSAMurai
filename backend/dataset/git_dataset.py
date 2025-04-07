from git import Repo
from utils import DATASET_DIR
from pathlib import Path
import os
import datetime
import json


class GitDataset:
    def __init__(self, repo_path=DATASET_DIR):
        self.repo_path = repo_path
        if os.path.exists(repo_path):
            self.repo = Repo(repo_path)
        else:
            self.dataset_dir = Path(repo_path)
            self.dataset_dir.mkdir(parents=True, exist_ok=True)
            self.repo = Repo.init(repo_path)
            
    def save(self, file_path, json_data, commit_message=''):
        new_file_path = os.path.join(self.repo_path, file_path)
        Path(os.path.dirname(new_file_path)).mkdir(parents=True, exist_ok=True)
        with open(new_file_path, 'w') as f:
            f.write(json.dumps(json_data, indent=4))
        self.repo.index.add([new_file_path])
        self.repo.index.commit(commit_message + ' ' + datetime.datetime.now().strftime("%Y-%m-%d %H:%M:%S"))
        
    def load(self, file_path):
        file_path = os.path.join(self.repo_path, file_path)
        if os.path.exists(file_path):
            with open(file_path, 'r') as f:
                return json.loads(f.read())
        else:
            raise FileNotFoundError(f"File {file_path} not found in the dataset.")
            
    def push(self):
        origin = self.repo.remote(name='origin')
        origin.push()