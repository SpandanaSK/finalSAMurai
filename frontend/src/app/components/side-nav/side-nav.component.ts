import { Component, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';
import { KeyboardShortcutsComponent } from '../keyboard-shortcuts/keyboard-shortcuts.component';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule, KeyboardShortcutsComponent],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss']
})
export class SideNavComponent {
  @ViewChild(KeyboardShortcutsComponent) keyboardShortcuts!: KeyboardShortcutsComponent;
  actions = [
    { iconClass: 'fas fa-th', label: 'Grid View', action: () => console.log('Grid View') },
    { iconClass: 'fas fa-edit', label: 'Toggle Annotation Editor', action: () => console.log('Toggle Editor') },
    { iconClass: 'fas fa-search-plus', label: 'Zoom In', action: () => console.log('Zoom In') },
    { iconClass: 'fas fa-search-minus', label: 'Zoom Out', action: () => console.log('Zoom Out') },
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
    }, // Use FontAwesome icon and call togglePopup
  ];
  ngAfterViewInit() {
    // ViewChild is now available
  }
}
