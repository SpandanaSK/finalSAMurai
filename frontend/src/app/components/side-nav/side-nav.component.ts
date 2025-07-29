import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-side-nav',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './side-nav.component.html',
  styleUrls: ['./side-nav.component.scss']
})
export class SideNavComponent {
  actions = [
    { icon: '🗂️', label: 'Grid View', action: () => console.log('Grid View') },
    { icon: '📝', label: 'Toggle Annotation Editor', action: () => console.log('Toggle Editor') },
    { icon: '➕', label: 'Zoom In', action: () => console.log('Zoom In') },
    { icon: '➖', label: 'Zoom Out', action: () => console.log('Zoom Out') },
    { icon: '✔️', label: 'Select All Regions', action: () => console.log('Select All') },
    { icon: '📋', label: 'Copy Regions', action: () => console.log('Copy') },
    { icon: '📥', label: 'Paste Regions', action: () => console.log('Paste') },
    { icon: '📤', label: 'Paste in Multiple Images', action: () => console.log('Paste Multiple') },
    { icon: '↩️', label: 'Undo Pasted Multiple', action: () => console.log('Undo') },
    { icon: '🗑️', label: 'Delete Region', action: () => console.log('Delete') },
  ];
}
