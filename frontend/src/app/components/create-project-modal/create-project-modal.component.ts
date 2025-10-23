import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, Project } from '../../services/project.service';
//import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-create-project-modal',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './create-project-modal.component.html',
  styleUrls: ['./create-project-modal.component.scss']
})
export class CreateProjectModalComponent implements OnInit {
  @Output() projectCreated = new EventEmitter<any>();
  @Output() projectLoaded = new EventEmitter<any>();
  @Output() tempProjectCreated = new EventEmitter<any>();
  @Output() modalClosed = new EventEmitter<void>();
  @Output() close = new EventEmitter<void>();

  closeModal() {
  this.close.emit();
}

  visible = false;
  projectTableData: Project[] = [];
  filteredProjects: Project[] = [];
  selectedProjectId: string | null = null;
  
  projectName = '';
  projectDescription = '';
  createdBy = '';
  createdOn = new Date().toUTCString();
  
  mode: 'create' | 'load' = 'create';

  constructor(private projectService: ProjectService) {}

  ngOnInit(): void {
    this.loadProjects();
  }

  loadProjects(): void {
    this.projectService.getAllProjects().subscribe({
      next: (data: Project[]) => {
        this.projectTableData = data || [];
        this.filterProjects();
      },
      error: (err) => console.error('Failed to load projects', err)
    });
  }

  show(): void {
    this.visible = true;
    this.resetForm();
    this.loadProjects();
  }

  hide(): void {
    this.visible = false;
    this.modalClosed.emit();
  }

  resetForm(): void {
    this.projectName = '';
    this.projectDescription = '';
    this.createdBy = '';
    this.createdOn = new Date().toUTCString();
    this.selectedProjectId = null;
    this.mode = 'create';
  }

  filterProjects(): void {
    const name = this.projectName.toLowerCase().trim();
    const desc = this.projectDescription.toLowerCase().trim();
    const created = this.createdBy.toLowerCase().trim();
    
    // Filter projects
    this.filteredProjects = this.projectTableData.filter(p => 
      p['Project Name'].toLowerCase().includes(name) &&
      p['Project Description'].toLowerCase().includes(desc) &&
      p['Created by'].toLowerCase().includes(created)
    );
    
    // Check for exact matches
    const exactMatches = this.projectTableData.filter(p => 
      p['Project Name'].toLowerCase() === name &&
      p['Project Description'].toLowerCase() === desc &&
      p['Created by'].toLowerCase() === created
    );
    
    if (name.length === 0) {
      this.mode = 'create';
      this.filteredProjects = this.projectTableData;
    } else if (exactMatches.length === 1) {
      this.mode = 'load';
      this.selectedProjectId = exactMatches[0]['Project ID'];
      this.filteredProjects = exactMatches;
    } else if (this.filteredProjects.length === 0) {
      this.mode = 'create';
    }
  }

  selectProject(project: Project): void {
    this.selectedProjectId = project['Project ID'];
    this.projectName = project['Project Name'];
    this.projectDescription = project['Project Description'];
    this.createdBy = project['Created by'];
    this.createdOn = project['Created on'];
    this.mode = 'load';
  }

  createNewProject(): void {
    if (!this.projectName) {
      return;
    }

    this.projectService.createNewProject(
      this.projectName, 
      this.projectDescription, 
      this.createdBy, 
      this.createdOn
    ).subscribe({
      next: (response) => {
        this.projectCreated.emit({
          projectId: response.results.project_id,
          jsonData: response.results.json_data,
          projectName: this.projectName,
          projectDescription: this.projectDescription,
          createdBy: this.createdBy,
          createdOn: this.createdOn
        });
        this.hide();
      },
      error: (err) => console.error('Failed to create project', err)
    });
  }

  loadExistingProject(): void {
    if (!this.selectedProjectId) {
      return;
    }

    this.projectService.loadProject(this.selectedProjectId).subscribe({
      next: (response) => {
        this.projectLoaded.emit({
          projectId: this.selectedProjectId,
          jsonData: response.results.json_data,
          projectName: this.projectName,
          projectDescription: this.projectDescription,
          createdBy: this.createdBy,
          createdOn: this.createdOn
        });
        this.hide();
      },
      error: (err) => console.error('Failed to load project', err)
    });
  }

  createTemporaryProject(): void {
    this.tempProjectCreated.emit({
      projectName: this.projectName || 'Untitled',
      projectDescription: this.projectDescription || '',
      createdBy: this.createdBy || 'SAMurai',
      createdOn: this.createdOn
    });
    this.hide();
  }

  submit(): void {
    if (this.mode === 'create') {
      this.createNewProject();
    } else {
      this.loadExistingProject();
    }
  }
}
