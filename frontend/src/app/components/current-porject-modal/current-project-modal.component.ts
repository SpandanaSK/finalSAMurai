import { Component, Input } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-current-project-modal',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './current-project-modal.component.html',
  styleUrls: ['./current-project-modal.component.scss']
})
export class CurrentProjectModalComponent {
  @Input() project: any = null;
  visible: boolean = false;

  show(project: any) {
    this.project = project;
    this.visible = true;
  }

  close() {
    this.visible = false;
  }
}
