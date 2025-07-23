// ribbon.component.ts
import { Component } from '@angular/core';
import { NgModule } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';


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
  imports: [CommonModule, FormsModule,]
})
export class RibbonComponent {
   showRegionShapes: boolean = false;
  showAiPrompts: boolean = false;

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


   toggleRegionShape(): void {
    this.showRegionShapes = !this.showRegionShapes;
    this.showAiPrompts = false;
    
  }

  toggleAiPromptShapes(): void {
    this.showAiPrompts = !this.showAiPrompts;
    this.showRegionShapes = false;
      
  }
showProjectOptions: boolean = false;

toggleProjectOptions(): void {
  this.showProjectOptions = !this.showProjectOptions;
  this.showRegionShapes = false;
  this.showAiPrompts = false;
}
}
