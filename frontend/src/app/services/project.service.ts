import { Injectable } from '@angular/core';
import { HttpClient } from '@angular/common/http';
import { Observable } from 'rxjs';

export interface Project {
    'Project ID': string;
    'Project Name': string;
    'Project Description': string;
    'Created by': string;
    'Created on': string;
    'Last Edit by': string;
    '# Images': number;
    'File Path'?: string;
    'Last Commit Date'?: string;
    'Last Commit Id'?: string;
    'Last Commit Message'?: string;
}

@Injectable({
  providedIn: 'root'
})
export class ProjectService {
  constructor(private http: HttpClient) {}

  getAllProjects(): Observable<Project[]> {
    return this.http.post<Project[]>('/project-manager/filter_projects', {});
  }

  createNewProject(name: string, desc: string, createdBy: string, createdOn: string): Observable<any> {
    return this.http.post('/project-manager/create_new_project', {
      project_name: name,
      project_desc: desc,
      created_on: createdOn,
      created_by: createdBy
    });
  }

  loadProject(projectId: string): Observable<any> {
    return this.http.post('/project-manager/load_project', {
      project_id: projectId
    });
  }

  saveProject(projectId: string, jsonData: any, lastEditBy: string, commitMessage: string): Observable<any> {
    return this.http.post('/project-manager/save_project', {
      project_id: projectId,
      json_data: jsonData,
      last_edit_by: lastEditBy,
      commit_message: commitMessage
    });
  }
}
