import { Component, ViewChild, AfterViewInit, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeyboardShortcutsComponent } from '../keyboard-shortcuts/keyboard-shortcuts.component';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, KeyboardShortcutsComponent],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss']
})
export class SideNavComponent implements AfterViewInit {
  @ViewChild(KeyboardShortcutsComponent) keyboardShortcuts!: KeyboardShortcutsComponent;
  @Output() gridViewToggle = new EventEmitter<void>();
  @Output() projectInfoClicked = new EventEmitter<void>();

  private scale = 1;
  private readonly minScale = 0.1;
  private readonly maxScale = 3;
  private readonly scaleStep = 0.1;

  // ✅ Emit zoom events to parent (AppComponent)
  @Output() zoomInClicked = new EventEmitter<void>();
  @Output() zoomOutClicked = new EventEmitter<void>();

  actions = [
    {
    iconClass: 'fas fa-th',
    label: 'Grid View',
    action: () => this.gridViewToggle.emit()
    },
    { iconClass: 'fas fa-edit', label: 'Toggle Annotation Editor', action: () => console.log('Toggle Editor') },
    { iconClass: 'fas fa-search-plus', label: 'Zoom In', action: () => this.zoomInClicked.emit() },
    { iconClass: 'fas fa-search-minus', label: 'Zoom Out', action: () => this.zoomOutClicked.emit() },
    { iconClass: 'fas fa-check-square', label: 'Select All Regions', action: () => console.log('Select All') },
    { iconClass: 'fas fa-copy', label: 'Copy Regions', action: () => console.log('Copy') },
    { iconClass: 'fas fa-paste', label: 'Paste Regions', action: () => console.log('Paste') },
    { iconClass: 'fas fa-layer-group', label: 'Paste to Multiple Images', action: () => console.log('Paste Multiple') },
    { iconClass: 'fas fa-undo', label: 'Undo Multiple Paste', action: () => console.log('Undo') },
    { iconClass: 'fas fa-trash-alt', label: 'Delete Region', action: () => console.log('Delete') },
    {
      iconClass: 'fas fa-keyboard',
      label: 'Keyboard Shortcuts',
      action: () => {
        if (this.keyboardShortcuts) {
          this.keyboardShortcuts.togglePopup();
        }
      }
    },
    { iconClass: "fa-solid fa-circle-info", label: 'Project Info', action: () => this.onProjectInfoClicked() }
  ];
  


  ngAfterViewInit() {
    // If needed for ViewChild hooks
  }

  private getCanvasElement(): HTMLElement | null {
    // Adjust selector as per your canvas inside app-image-canvas
    return document.querySelector('app-image-canvas canvas') ||
           document.querySelector('app-image-canvas .canvas-wrapper');
  }

  onProjectInfoClicked() {
  this.projectInfoClicked.emit();
}


}
