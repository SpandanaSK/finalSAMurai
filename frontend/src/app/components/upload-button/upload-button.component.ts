import { Component, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-upload-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './upload-button.component.html',
  styleUrls: ['./upload-button.component.scss']
})
export class UploadButtonComponent {
  @Output() filesUploaded = new EventEmitter<File[]>();

  onFileSelected(event: any): void {
    const files: File[] = Array.from(event.target.files);
    this.filesUploaded.emit(files);
  }
}
