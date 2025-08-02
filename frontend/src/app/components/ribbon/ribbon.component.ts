// ribbon.component.ts
import { Component } from '@angular/core';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { AiDetectionComponent } from '../ai-detection/ai-detection.component';
import { AttributesComponent } from '../attributes/attributes.component';
import { AnnotationButtonComponent as AnnotationButtonComponent } from "../annotation-button.component";


@NgModule({
  declarations: [
    // your components here
  ],
  imports: [
    CommonModule,
    FormsModule,
  ]
})
export class RibbonModule { }

@Component({
  selector: 'app-ribbon',
  standalone: true,
  templateUrl: './ribbon.component.html',
  styleUrls: ['./ribbon.component.scss'],
  imports: [CommonModule, FormsModule, AiDetectionComponent, AttributesComponent, AnnotationButtonComponent ]})
export class RibbonComponent {

  activePanel: string | null = null;

  selectedSingleModel = 'MobileSAM';
  selectedMultiModel = 'SAM2.1 (Tiny)';
  startFrame = '';
  endFrame = '';
  reverseVideo = false;

  singleImageModels: string[] = [
    'MobileSAM',
    'SAM (VIT-Base)',
    'SAM (VIT-Large)',
    'SAM (VIT-Huge)'
  ];

  multiImageModels: string[] = [
    'SAM2.1 (Tiny)',
    'SAM2.1 (Base Plus)',
    'SAM2.1 (Large)'
  ];

  // Toggler functions
  toggleRegionShape(): void {
    this.activePanel = this.activePanel === 'regionShapes' ? null : 'regionShapes';
  }

  toggleAiPromptShapes(): void {
    this.activePanel = this.activePanel === 'aiPrompts' ? null : 'aiPrompts';
  }

  toggleAiDetection(): void {
    this.activePanel = this.activePanel === 'aiDetection' ? null : 'aiDetection';
  }

  toggleAttributes(): void {
    this.activePanel = this.activePanel === 'attributes' ? null : 'attributes';
  }

  // Getters used in *ngIf in the HTML
  get showRegionShapes(): boolean {
    return this.activePanel === 'regionShapes';
  }

  get showAiPrompts(): boolean {
    return this.activePanel === 'aiPrompts';
  }

  get showAiDetection(): boolean {
    return this.activePanel === 'aiDetection';
  }

  get showAttributes(): boolean {
    return this.activePanel === 'attributes';
  }
}
