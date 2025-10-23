import { Component, OnInit, ViewChild, HostListener } from '@angular/core';
import { CommonModule } from '@angular/common';
import { HttpClientModule } from '@angular/common/http';
import { UploadButtonComponent } from './components/upload-button/upload-button.component';
import { CreateProjectModalComponent } from './components/create-project-modal/create-project-modal.component';
import { SaveTempProjectModalComponent } from './components/save-temp-project-modal/save-temp-project-modal.component';
import { ImageCanvasComponent } from './components/image-canvas/image-canvas.component';
import { RibbonComponent } from './components/ribbon/ribbon.component';
import { SideNavComponent } from './components/side-nav/side-nav.component';
import { FileFilterPanelComponent } from './components/file-filter-panel/file-filter-panel.component';
import { ProjectComponent } from './components/project/project.component';
import { ProjectInfoModalComponent } from './components/project-info-modal/project-info-modal.component';
@Component({
  selector: 'app-root',
  templateUrl: './app.component.html',
  styleUrls: ['./app.component.scss'],
  standalone: true,
  imports: [
    CommonModule,
    HttpClientModule,
    CreateProjectModalComponent,
    SaveTempProjectModalComponent,
    UploadButtonComponent,
    ImageCanvasComponent,
    RibbonComponent,
    SideNavComponent,
    FileFilterPanelComponent,
    ProjectComponent,
    ProjectInfoModalComponent
],
})
export class AppComponent implements OnInit {
  @ViewChild('createProjectModal') createProjectModal!: CreateProjectModalComponent;
  @ViewChild('saveTempProjectModal') saveTempProjectModal!: SaveTempProjectModalComponent;
  @ViewChild('projectInfoModal') projectInfoModal!: ProjectInfoModalComponent;
  //@ViewChild('canvas') canvas!: ImageCanvasComponent;
  // ✅ Step 3: Access the image canvas for zooming
  @ViewChild(ImageCanvasComponent) imageCanvas!: ImageCanvasComponent;

  currentProject: any = null;
  imageFiles: File[] = [];
selectedFileName: string = '';
imageFileNames: string[] = [];

  ngOnInit(): void {
    setTimeout(() => {
      this.openCreateProjectModal();
    }, 0);
  }

  openCreateProjectModal(): void {
    this.createProjectModal.show();
  }
  onZoomIn() { this.imageCanvas?.zoomIn(); }
  onZoomOut() { this.imageCanvas?.zoomOut(); }

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
  }

onImageSelected(files: File[]) {
  const newFiles = files.filter(
    f => !this.imageFiles.some(
      existing => existing.name === f.name && existing.size === f.size
    )
  );
  // Append new files instead of replacing
  this.imageFiles = [...this.imageFiles, ...files]; // This creates a new array reference
    this.imageFileNames = this.imageFiles.map(f => f.name);

}
selectedFile: File | null = null;

onFileSelectedByName(fileName: string) {
  const selectedFile = this.imageFiles.find(file => file.name === fileName);
  if (selectedFile) {
    this.selectedFileName = fileName; // Highlight this file in list
    this.imageCanvas.displaySelectedFile(selectedFile);
  }
}

showProjectInfoModal() {
  this.projectInfoModal.show();
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
  }

  onProjectExported(event: any): void {
    console.log('Project exported:', event);
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

  // ✅ Ctrl + S keyboard shortcut
  @HostListener('document:keydown', ['$event'])
  handleKeyboardEvent(event: KeyboardEvent) {
    if ((event.ctrlKey || event.metaKey) && event.key === 's') {
      event.preventDefault();
      if (this.currentProject?.isTemporary) {
        this.openSaveTempProjectModal();
      } else if (this.currentProject?.id) {
        console.log('Saving project with ID:', this.currentProject.id);
      }
    }
  }

  onFilesUploaded(files: File[]): void {
    console.log('Files uploaded:', files);
  }

  // ✅ Step 3: Zoom control methods
  zoomIn() {
    if (this.imageCanvas?.zoomIn) {
      this.imageCanvas.zoomIn();
    }
  }

  zoomOut() {
    if (this.imageCanvas?.zoomOut) {
      this.imageCanvas.zoomOut();
    }
  }
  onShapeSelected(shape: string) {
  if (shape === 'rectangle' && this.imageCanvas) {
    this.imageCanvas.activateRectangleRoi();
  }
}


}
