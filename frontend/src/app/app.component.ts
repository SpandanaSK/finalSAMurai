
import { UploadButtonComponent } from './components/upload-button/upload-button.component';


import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { CreateProjectModalComponent } from './components/create-project-modal/create-project-modal.component';
import { SaveTempProjectModalComponent } from './components/save-temp-project-modal/save-temp-project-modal.component';
import { ImageCanvasComponent } from './image-canvas/image-canvas.component';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { RibbonComponent } from './components/ribbon/ribbon.component';

@Component({
  selector: 'app-root',
  /*template: `
    <app-upload-button (imageSelected)="onImagesSelected($event)"></app-upload-button>
    <app-image-canvas [imageFiles]="imageFiles"></app-image-canvas>
  `,*/
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone:true,
  imports: [CommonModule, HttpClientModule, CreateProjectModalComponent, SaveTempProjectModalComponent, UploadButtonComponent,ImageCanvasComponent,RibbonComponent],

})
export class AppComponent implements OnInit {
  @ViewChild('createProjectModal') createProjectModal!: CreateProjectModalComponent;
  @ViewChild('saveTempProjectModal') saveTempProjectModal!: SaveTempProjectModalComponent;
  
  currentProject: any = null;

  ngOnInit(): void {
    // Open the create project modal when the app starts
    setTimeout(() => {
      this.openCreateProjectModal();
    }, 0);
  }
  
  openCreateProjectModal(): void {
    this.createProjectModal.show();
  }
  

  openSaveTempProjectModal(): void {
    this.saveTempProjectModal.show(this.currentProject);
  }
  
  onProjectCreated(event: any): void {
    console.log('Project created:', event);
    this.currentProject = {
      id: event.projectId,
      name: event.projectName,
      description: event.projectDescription,
      createdBy: event.createdBy,
      createdOn: event.createdOn,
      isTemporary: false
    };
    // Initialize your app with the project data
  }
  
  onProjectLoaded(event: any): void {
    console.log('Project loaded:', event);
    this.currentProject = {
      id: event.projectId,
      name: event.projectName,
      description: event.projectDescription,
      createdBy: event.createdBy,
      createdOn: event.createdOn,
      isTemporary: false
    };
    // Initialize your app with the project data
  }
   imageFiles: File[] = [];

  onImageSelected(files: File[]) {
    this.imageFiles = files;
  }
  
  onTempProjectCreated(event: any): void {
    console.log('Temp project created:', event);
    this.currentProject = {
      id: null,
      name: event.projectName,
      description: event.projectDescription,
      createdBy: event.createdBy,
      createdOn: event.createdOn,
      isTemporary: true
    };
    // Initialize your app with a temporary project
  }
  
  onProjectSaved(event: any): void {
    console.log('Project saved:', event);
    this.currentProject = {
      id: event.projectId,
      name: event.projectName,
      description: event.projectDescription,
      createdBy: event.createdBy,
      createdOn: event.createdOn,
      isTemporary: false
    };
    // Update your app with the saved project data
  }
  
  onProjectExported(event: any): void {
    console.log('Project exported:', event);
    // Handle the export (could use a service to create and download a JSON file)
    const projectData = {
      _via_settings: {
        project: {
          name: event.projectName,
          description: event.projectDescription,
          created_on: event.createdOn,
          created_by: event.createdBy,
          temp_project: true
        }
      },
      // Add other project data here
    };
    
    const jsonString = JSON.stringify(projectData, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${event.projectName || 'project'}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  // Add keyboard event handling for Ctrl+S
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (this.currentProject?.isTemporary) {
        this.openSaveTempProjectModal();
      } else if (this.currentProject?.id) {
        // Save existing project logic here
        console.log('Saving project with ID:', this.currentProject.id);
      }
    }
  }

  onFilesUploaded(files: File[]): void {
    console.log('Files uploaded:', files);
    // Handle the uploaded files here
  }
}
