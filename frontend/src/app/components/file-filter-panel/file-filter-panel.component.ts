import { Component, Input, Output, EventEmitter } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-file-filter-panel',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './file-filter-panel.component.html',
  styleUrls: ['./file-filter-panel.component.scss']
})
export class FileFilterPanelComponent {
  @Output() fileSelected = new EventEmitter<string>();

selectFile(name: string) {
  this.fileSelected.emit(name);
}

  @Input() fileNames: string[] = [];

  collapsed = true;
  selectedFilter = 'All files';
  filterOptions = [
    'All files',
    'Show files without regions',
    'Show files missing region annotations',
    'Show files missing file annotations',
    'Files that could not be loaded',
    'Regular expressions',
    'Filter by region attribute'
  ];

  togglePanel() {
    this.collapsed = !this.collapsed;
  }
}
