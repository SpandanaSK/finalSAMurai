import { Component, Input, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-project-info-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './project-info-modal.component.html',
  styleUrls: ['./project-info-modal.component.scss']
})
export class ProjectInfoModalComponent {
  @Input() project: any;
  visible = false;

  show() {
    this.visible = true;
  }

  hide() {
    this.visible = false;
  }
}
