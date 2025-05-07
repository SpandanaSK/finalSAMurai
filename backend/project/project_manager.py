import hashlib
from m_utils.utils import DATASET_DIR, PROJECT_DIR
from backend.project.git_dataset import GitDataset
from pathlib import Path
import os
import json
import pandas as pd
from datetime import datetime

class Project:
    """
    Data holder for a single project metadata and last-commit details.
    """
    def __init__(self, name, description, created_by, created_on, num_images,
                 file_path, last_edit_by, commit_id, commit_date, commit_message):
        self.name = name
        self.description = description
        self.created_by = created_by
        self.created_on = created_on
        self.file_path = file_path
        self.last_edit_by = last_edit_by
        self.commit_id = commit_id
        self.commit_date = commit_date
        self.commit_message = commit_message
        self.num_images = num_images
        self.project_id = self._generate_project_id()
    
    def _generate_project_id(self):
        raw_string = f"{self.name}|{self.description}|{self.created_by}|{self.created_on}"
        return hashlib.sha256(raw_string.encode('utf-8')).hexdigest() 

    def to_dict(self):
        return {
            'Project ID': self.project_id,
            'Project Name': self.name,
            'Project Description': self.description,
            'Created by': self.created_by,
            'Created on': self.created_on,
            '# Images': self.num_images,
            'File Path': self.file_path,
            'Last Edit by': self.last_edit_by,
            'Last Commit Id': self.commit_id,
            'Last Commit Date': self.commit_date,
            'Last Commit Message': self.commit_message
        }



def validate_project_date(utc_string):
    try:
        # Parse the JavaScript UTC string
        dt = datetime.strptime(utc_string, "%a, %d %b %Y %H:%M:%S GMT")
        # Return ISO format or the datetime object itself
        return dt.isoformat()
    except ValueError as e:
        raise ValueError(f"Invalid 'created_on' format: {utc_string}") from e

class ProjectManager:
    """
    Orchestrates creation, lookup, and persistence of multiple projects.
    """
    def __init__(self):
        self.git_dataset = GitDataset()
        self.index_path = os.path.join(PROJECT_DIR, 'all_projects.csv')
        if os.path.exists(self.index_path):
            self.project_df = pd.read_csv(self.index_path)
        else:
            cols = ['Project Name','Project Description','Created by','Created on', '# Images',
                    'File Path','Last Edit by','Last Commit Id','Last Commit Date','Last Commit Message']
            self.project_df = pd.DataFrame(columns=cols)
            self._persist_index()

    def _persist_index(self):
        self.project_df.to_csv(self.index_path, index=False)

    def create_empty_project(self, project_name, project_desc,
                              project_created_on, created_by):
        """
        Initialize a new project JSON, save to git, and register in index.
        """
        # load template and fill fields
        current_dir = os.path.dirname(os.path.abspath(__file__))
        template = json.load(open(os.path.join(current_dir, 'empty_dataset.json')))
        settings = template.get('_via_settings', {}).get('project', {})
        validated_date = validate_project_date(project_created_on)
        settings.update({
            'name': project_name,
            'description': project_desc,
            'created_on': validated_date,
            'created_by': created_by
        })
        # write and commit
        filename = os.path.join(created_by, project_created_on, f"{project_name.lower().replace(' ', '_')}.json")
        rel_path = os.path.join(DATASET_DIR, filename)
        self.git_dataset.save(rel_path, template, 'Create project')
        # record
        latest = self.git_dataset.get_latest_commit(rel_path)
        proj = Project(project_name, project_desc, created_by,
                       project_created_on, 0, rel_path, created_by,
                       latest['hexsha'], latest['date'], latest['message'])
        self.project_df = pd.concat([self.project_df,
                                     pd.DataFrame([proj.to_dict()])],
                                     ignore_index=True)
        self._persist_index()
        return rel_path, proj.project_id

    def filter_projects(self, **filters):
        """
        Return a DataFrame subset where each column contains the given regex/value.
        Usage: filter_projects(Project_Name="^My.*", Created_by="Alice")
        """
        self.project_df = pd.read_csv(self.index_path)
        self.project_df.fillna("---", inplace=True)
        df = self.project_df.copy()
        for col, pat in filters.items():
            if col in df.columns:
                df = df[df[col].astype(str).str.contains(pat, regex=True, na=False, case=False)]
        return df.to_dict(orient='records')

    def load_project(self, project_id):
        """
        Return the JSON content for the specified project.
        """
        self.project_df = pd.read_csv(self.index_path)
        row = self.project_df[self.project_df['Project ID'] == project_id]
        if row.empty:
            raise KeyError(f"Unknown project: {project_id}")
        path = row.iloc[0]['File Path']
        return self.git_dataset.load(path)

    def save_project(self, project_id, json_data, last_edit_by, commit_message=''):
        """
        Overwrite the project file, commit changes, and update index with new commit info.
        """
        row = self.project_df[self.project_df['Project ID'] == project_id]
        if row.empty:
            raise KeyError(f"Unknown project: {project_id}")
        path = row.iloc[0]['File Path']
        # save and commit
        self.git_dataset.save(path, json_data, commit_message)
        latest = self.git_dataset.get_latest_commit(path)
        num_images = len(json_data['_via_image_id_list'])
        # update index
        idx = self.project_df.index[self.project_df['Project ID'] == project_id]
        self.project_df.loc[idx, ['# Images', 'Last Edit by','Last Commit Id','Last Commit Date','Last Commit Message']] = [
            num_images, last_edit_by, latest['hexsha'], latest['date'], latest['message']
        ]
        self._persist_index()
