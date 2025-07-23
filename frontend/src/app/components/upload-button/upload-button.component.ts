import { Component, Output, EventEmitter } from '@angular/core';

@Component({
  selector: 'app-upload-button',
  standalone:true,
  templateUrl: './upload-button.component.html',
  styleUrls: ['./upload-button.component.scss']
})
export class UploadButtonComponent {
  @Output() imageSelected = new EventEmitter<File[]>();

  onFileSelected(event: Event) {
    const input = event.target as HTMLInputElement;
    if (input?.files?.length) {
      this.imageSelected.emit(Array.from(input.files));
    }
  }
}
