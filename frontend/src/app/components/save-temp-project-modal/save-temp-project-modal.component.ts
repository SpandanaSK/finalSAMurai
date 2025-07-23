import { Component, OnInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ProjectService, Project } from '../../services/project.service';
import { HttpClientModule } from '@angular/common/http';

@Component({
  selector: 'app-save-temp-project-modal',
  standalone: true,
  imports: [CommonModule, FormsModule,HttpClientModule],
  templateUrl: './save-temp-project-modal.component.html',
  styleUrls: ['./save-temp-project-modal.component.scss']
})
export class SaveTempProjectModalComponent implements OnInit {
  @Output() projectSaved = new EventEmitter<any>();
  @Output() projectExported = new EventEmitter<any>();
  @Output() modalClosed = new EventEmitter<void>();

  visible = false;
  projectTableData: Project[] = [];
  filteredProjects: Project[] = [];
  
  projectName = '';
  projectDescription = '';
  createdBy = '';
  createdOn = new Date().toUTCString();
  
  saveButtonDisabled = true;

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

  show(projectData: any = null): void {
    this.visible = true;
    
    if (projectData) {
      this.projectName = projectData.name || '';
      this.projectDescription = projectData.description || '';
      this.createdBy = projectData.createdBy || '';
      this.createdOn = projectData.createdOn || new Date().toUTCString();
    } else {
      this.resetForm();
    }
    
    this.loadProjects();
    this.filterProjects();
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
    
    this.saveButtonDisabled = name.length === 0 || exactMatches.length > 0;
    
    if (exactMatches.length > 0) {
      // Only show exact matches in the table
      this.filteredProjects = exactMatches;
    }
  }

  saveTemporaryProject(): void {
    if (!this.projectName || !this.projectDescription || !this.createdBy) {
      console.error("Project name, description or created by is empty");
      return;
    }

    this.projectService.createNewProject(
      this.projectName, 
      this.projectDescription, 
      this.createdBy, 
      this.createdOn
    ).subscribe({
      next: (response) => {
        const projectId = response.results.project_id;
        
        this.projectSaved.emit({
          projectId: projectId,
          projectName: this.projectName,
          projectDescription: this.projectDescription,
          createdBy: this.createdBy,
          createdOn: this.createdOn
        });
        
        this.hide();
      },
      error: (err) => console.error('Failed to save project', err)
    });
  }

  exportProjectAsJSON(): void {
    this.projectExported.emit({
      projectName: this.projectName,
      projectDescription: this.projectDescription,
      createdBy: this.createdBy,
      createdOn: this.createdOn
    });
  }
}
