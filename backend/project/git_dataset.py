from git import Repo
from m_utils.utils import DATASET_DIR, PROJECT_DIR
from pathlib import Path
import os
import json
import pandas as pd
from datetime import datetime


class GitDataset:
    """
    Manages a git-backed directory of JSON datasets.
    """
    def __init__(self, repo_path=DATASET_DIR):
        self.repo_path = repo_path
        if os.path.exists(repo_path):
            self.repo = Repo(repo_path)
        else:
            Path(repo_path).mkdir(parents=True, exist_ok=True)
            self.repo = Repo.init(repo_path)

    def save(self, file_path, json_data, commit_message=''):
        """
        Save `json_data` to `file_path` (relative to repo), commit with message + timestamp.
        """
        abs_path = os.path.join(self.repo_path, file_path)
        Path(os.path.dirname(abs_path)).mkdir(parents=True, exist_ok=True)
        with open(abs_path, 'w') as f:
            json.dump(json_data, f, indent=4)
        self.repo.index.add([abs_path])
        timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
        full_message = f"{commit_message.strip()} {timestamp}".strip()
        self.repo.index.commit(full_message)

    def load(self, file_path):
        """
        Load and return JSON from `file_path` in the repo.
        """
        abs_path = os.path.join(self.repo_path, file_path)
        if not os.path.exists(abs_path):
            raise FileNotFoundError(f"File not found: {abs_path}")
        with open(abs_path, 'r') as f:
            return json.load(f)

    def push(self, remote='origin', branch='main'):
        """
        Push commits to remote/branch (default 'origin'/'main').
        """
        self.repo.remote(remote).push(branch)

    def get_file_history(self, file_path, max_count=None):
        """
        Return list of commits touching `file_path` (reverse chronological).
        Each entry: dict(hexsha, author, date, message).
        """
        rel = os.path.join(self.repo_path, file_path)
        commits = list(self.repo.iter_commits(paths=rel, max_count=max_count))
        history = []
        for c in commits:
            history.append({
                'hexsha': c.hexsha,
                'author': c.author.name,
                'date': c.committed_datetime.isoformat(),
                'message': c.message.strip()
            })
        return history

    def print_file_history(self, file_path, max_count=None, short_sha=True):
        """
        Pretty-print the commit history of a file.
        """
        for entry in self.get_file_history(file_path, max_count):
            sha = entry['hexsha'][:7] if short_sha else entry['hexsha']
            print(f"{sha}  {entry['date']}  {entry['author']}\n    {entry['message']}\n")

    def get_latest_commit(self, file_path):
        """
        Return the most recent commit dict for `file_path`, or None.
        """
        hist = self.get_file_history(file_path, max_count=1)
        return hist[0] if hist else None

