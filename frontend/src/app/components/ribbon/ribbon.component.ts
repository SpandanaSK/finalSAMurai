// ribbon.component.ts
import { Component, EventEmitter, HostListener, Output, ViewChild } from '@angular/core';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiDetectionComponent } from '../ai-detection/ai-detection.component';
import { AttributesComponent } from '../attributes/attributes.component';
import { AnnotationButtonComponent as AnnotationButtonComponent } from "../annotation-button/annotation-button.component";
import { CreateProjectModalComponent } from "../create-project-modal/create-project-modal.component";
import { UploadButtonComponent } from '../upload-button/upload-button.component';
import { SaveTempProjectModalComponent } from '../save-temp-project-modal/save-temp-project-modal.component';
import { ProjectComponent } from '../project/project.component';


@NgModule({
  declarations: [
    // your components here
  ],
  imports: [
    CommonModule,
    FormsModule,
  ]
})
export class RibbonModule { }

@Component({
  selector: 'app-ribbon',
  standalone: true,
  templateUrl: './ribbon.component.html',
  styleUrls: ['./ribbon.component.scss'],
  imports: [CommonModule, FormsModule, AiDetectionComponent, AttributesComponent, CreateProjectModalComponent, UploadButtonComponent, SaveTempProjectModalComponent, ProjectComponent, AnnotationButtonComponent]
})
export class RibbonComponent {
  @Output() imageSelected = new EventEmitter<File[]>();
  @ViewChild('createProjectModal') createProjectModal!: CreateProjectModalComponent;
  @ViewChild('saveTempProjectModal') saveTempProjectModal!: SaveTempProjectModalComponent;
  @ViewChild('uploadButton') uploadButton!: UploadButtonComponent;
  
  selectedSingleModel = 'MobileSAM';
  activePanel: string | null = null;
  currentProject: any = null;
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
     imageFiles: File[] = [];

  onImageSelected(files: File[]) {
  this.imageSelected.emit(files); // Pass up to AppComponent
}
  onFilesUploaded(files: File[]): void {
    console.log('Files uploaded:', files);
    // Handle the uploaded files here
  }
  
  
// Add this property to fix the error with showUpload in the template
  //showUpload: boolean = false;
  selectedMultiModel = 'SAM2.1 (Tiny)';
  startFrame = '';
  endFrame = '';
  reverseVideo = false;

  singleImageModels: string[] = [
    'MobileSAM',
    'SAM (VIT-Base)',
    'SAM (VIT-Large)',
    'SAM (VIT-Huge)'
  ];

  multiImageModels: string[] = [
    'SAM2.1 (Tiny)',
    'SAM2.1 (Base Plus)',
    'SAM2.1 (Large)'
  ];
  showProject: any;

  // Toggler functions
  toggleRegionShape(): void {
    this.activePanel = this.activePanel === 'regionShapes' ? null : 'regionShapes';
  }

  toggleAiPromptShapes(): void {
    this.activePanel = this.activePanel === 'aiPrompts' ? null : 'aiPrompts';
  }

  toggleAiDetection(): void {
    this.activePanel = this.activePanel === 'aiDetection' ? null : 'aiDetection';
  }

  toggleAttributes(): void {
    this.activePanel = this.activePanel === 'attributes' ? null : 'attributes';
  }

  togglePanel(panel: string): void {
  this.activePanel = this.activePanel === panel ? null : panel;
}
  // Getters used in *ngIf in the HTML
  get showRegionShapes(): boolean {
    return this.activePanel === 'regionShapes';
  }

  get showAiPrompts(): boolean {
    return this.activePanel === 'aiPrompts';
  }

  get showAiDetection(): boolean {
    return this.activePanel === 'aiDetection';
  }

  get showAttributes(): boolean {
    return this.activePanel === 'attributes';
  }

  toggleProject(): void {
    this.showProjectOptions = !this.showProjectOptions;
  }
}
