import { Component, ElementRef, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { CreateProjectModalComponent } from '../create-project-modal/create-project-modal.component';
import { SaveTempProjectModalComponent } from '../save-temp-project-modal/save-temp-project-modal.component';
import { UploadButtonComponent } from '../upload-button/upload-button.component';
import { ImageCanvasComponent } from '../image-canvas/image-canvas.component';

@Component({
  selector: 'app-project',
  standalone: true,
  imports: [CommonModule, ],
  templateUrl: './project.component.html',
  styleUrls: ['./project.component.scss']
})
export class ProjectComponent {
  @ViewChild('createProjectModal') createProjectModal!: CreateProjectModalComponent;
  @ViewChild('saveTempProjectModal') saveTempProjectModal!: SaveTempProjectModalComponent;
   @Output() imageSelected = new EventEmitter<File[]>();
    @ViewChild('fileInput') fileInput!: ElementRef<HTMLInputElement>;
  
    onFileSelected(event: Event) {
      const input = event.target as HTMLInputElement;
      if (input?.files?.length) {
        this.imageSelected.emit(Array.from(input.files));
      }
    }
    triggerFileInput() {
      this.fileInput.nativeElement.click();
    }

     imageFiles: File[] = [];
  currentProject: any = null;

  onImageSelected(files: File[]) {
    this.imageSelected.emit(files); // Pass up to RibbonComponent

  }

  showProjectOptions: boolean = false;
  showCreateModal: boolean = false;
  showUpload: boolean = false;
  showSaveModal: boolean = false;
   /*showDropdown = false;
  showModal = false;*/
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
   
  
  toggleProject(): void {
  this.showProjectOptions = !this.showProjectOptions;
  // Optionally close others when opening project
  this.showCreateModal = false;
  this.showUpload = false;
  this.showSaveModal = false;
}
 /* toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  openModal(): void {
    this.showModal = true;
    this.showDropdown = false;
  }

  closeModal(): void {
    this.showModal = false;
  }
}*/
}
