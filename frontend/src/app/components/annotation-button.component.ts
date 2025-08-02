import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-annotation-button',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './annotation-button.component.html',
  styleUrls: ['./annotation-button.component.scss']
})
export class AnnotationButtonComponent {
  showDropdown = false;

  toggleDropdown(): void {
    this.showDropdown = !this.showDropdown;
  }

  selectAction(action: string): void {
    console.log(`Selected: ${action}`);
    this.showDropdown = false;
  }
}
