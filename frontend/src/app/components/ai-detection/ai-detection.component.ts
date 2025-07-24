import { Component } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';

@Component({
  selector: 'app-ai-detection',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './ai-detection.component.html',
  styleUrls: ['./ai-detection.component.scss']
})
export class AiDetectionComponent {
  selectedModel = 'Grounding DINO';
  textPrompt = '';
  boxThreshold = 0.5;
  textThreshold = 0.5;
  nmsThreshold = 0.5;
  getSamMasks = false;

  runDetection() {
    console.log('Running detection with:', {
      model: this.selectedModel,
      prompt: this.textPrompt,
      box: this.boxThreshold,
      text: this.textThreshold,
      nms: this.nmsThreshold,
      sam: this.getSamMasks
    });
  }

  saveBoxes() {
    console.log('Saving boxes');
  }
}
