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
  attributeNameInput = '';
  currentAttribute = '';
  isRegion = true;

  // ✅ Place these right here:
  regionAttributes: string[] = [];
  regionAttributeDetails: { [key: string]: { desc: string; def: string; type: string } } = {};

  fileAttributes: string[] = [];
  fileAttributeDetails: { [key: string]: { desc: string; def: string; type: string } } = {};

  // 👇 The rest of your methods follow:
  toggleType(type: 'region' | 'file') {
    this.isRegion = (type === 'region');
    this.currentAttribute = '';
  }

  get attributes(): string[] {
    return this.isRegion ? this.regionAttributes : this.fileAttributes;
  }

  get attributeDetails() {
    return this.isRegion ? this.regionAttributeDetails : this.fileAttributeDetails;
  }

  addAttribute() {
    const attr = this.attributeNameInput.trim();
    if (!attr || this.attributes.includes(attr)) return;

    this.attributes.push(attr);
    this.attributeDetails[attr] = { desc: '', def: '', type: 'text' };
    this.currentAttribute = attr;
    this.attributeNameInput = '';
  }

  confirmAndRemove() {
    if (!this.currentAttribute) return;

    if (confirm(`Are you sure you want to delete "${this.currentAttribute}"?`)) {
      const index = this.attributes.indexOf(this.currentAttribute);
      if (index !== -1) this.attributes.splice(index, 1);
      delete this.attributeDetails[this.currentAttribute];
      this.currentAttribute = '';
    }
  }
}
