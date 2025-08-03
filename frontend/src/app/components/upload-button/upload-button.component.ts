import { Component, Output, EventEmitter, ViewChild, ElementRef } from '@angular/core';

@Component({
  selector: 'app-upload-button',
  standalone:true,
  templateUrl: './upload-button.component.html',
  styleUrls: ['./upload-button.component.scss']
})
export class UploadButtonComponent {
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
}
