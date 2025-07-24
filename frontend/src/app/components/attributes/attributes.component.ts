// attributes.component.ts
import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-attributes',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './attributes.component.html',
  styleUrls: ['./attributes.component.scss']
})
export class AttributesComponent {
  selectedAttributeType = 'text';
  attributeNameInput = '';
  attributes: string[] = [];
  currentAttribute = '';
  attributeDetails: { [key: string]: { desc: string; def: string; type: string; } } = {};

  isRegion = true;

  toggleType(type: 'region' | 'file') {
    this.isRegion = (type === 'region');
  }

  addAttribute() {
    if (!this.attributeNameInput.trim() || this.attributes.includes(this.attributeNameInput)) return;
    this.attributes.push(this.attributeNameInput);
    this.attributeDetails[this.attributeNameInput] = { desc: '', def: '', type: 'text' };
    this.currentAttribute = this.attributeNameInput;
    this.attributeNameInput = '';
  }

  confirmAndRemove() {
    if (!this.currentAttribute) return;
    if (confirm(`Are you sure you want to delete "${this.currentAttribute}"?`)) {
      this.attributes = this.attributes.filter(attr => attr !== this.currentAttribute);
      delete this.attributeDetails[this.currentAttribute];
      this.currentAttribute = '';
    }
  }
}
