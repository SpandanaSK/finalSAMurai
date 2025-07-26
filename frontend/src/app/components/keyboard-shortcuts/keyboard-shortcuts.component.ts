import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-keyboard-shortcuts',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './keyboard-shortcuts.component.html',
  styleUrls: ['./keyboard-shortcuts.component.scss']
})
export class KeyboardShortcutsComponent {
  showPopup = false;

  togglePopup() {
    this.showPopup = !this.showPopup;
  }

  closePopup() {
    this.showPopup = false;
  }

  readonly imageFocusShortcuts = [
    ['←', '↑', '→', '↓', 'a', 'c', 'v', 'd', 'Ctrl + Wheel', 'l'],
    [
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Move selected region by 1 px (Shift to jump)',
      'Select all regions',
      'Copy selected regions',
      'Paste selected regions',
      'Delete selected regions',
      'Zoom in/out (mouse cursor is over image)',
      'Toggle region label'
    ]
  ];

  readonly alwaysAvailableShortcuts = [
    ['← →', '+ - =', '↑', '↓', 'Spacebar', 'Home / h', 'End / e', 'PgUp / u', 'PgDown / d', 'Esc'],
    [
      'Move to next/previous image',
      'Zoom in/out/reset',
      'Update region label',
      'Update region colour',
      'Toggle annotation editor (Ctrl to toggle image editor)',
      'Jump to first image',
      'Jump to last image',
      'Jump several images',
      'Jump several images',
      'Cancel ongoing task'
    ]
  ];
}
