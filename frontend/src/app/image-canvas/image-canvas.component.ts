import { Component, Input, ViewChild, ElementRef, OnChanges, SimpleChanges, AfterViewInit } from '@angular/core';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneTools from 'cornerstone-tools';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';
import * as dicomParser from 'dicom-parser';
import * as cornerstoneMath from 'cornerstone-math';
import { CommonModule } from '@angular/common';
@Component({
  selector: 'app-image-canvas',
  templateUrl: './image-canvas.component.html',
  standalone:true,
  styleUrls: ['./image-canvas.component.scss'],
  imports: [CommonModule]
})
export class ImageCanvasComponent implements AfterViewInit, OnChanges {
  @Input() imageFiles: File[] = [];
  @ViewChild('cornerstoneElement', { static: true }) cornerstoneElement!: ElementRef<HTMLDivElement>;
  private loadedFiles: File[] = [];
  currentIndex = 0;
  private initialized = false;

  ngAfterViewInit() {
    this.initializeCornerstone();
    this.initialized = true;
    this.loadCurrentImage();
  }

  ngOnChanges(changes: SimpleChanges) {
  if (changes['imageFiles'] && this.initialized) {
    const incoming: File[] = changes['imageFiles'].currentValue || [];

    // Append new files to internal array
    this.loadedFiles = [...this.loadedFiles, ...incoming];

    // Update displayed list and show first of new batch
    this.imageFiles = this.loadedFiles;
    this.currentIndex = this.imageFiles.length - incoming.length;
    this.loadCurrentImage();
  }
}



  initializeCornerstone() {
    cornerstoneTools.external.cornerstone = cornerstone;
    cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
    cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
    cornerstoneWADOImageLoader.external.dicomParser = dicomParser;

    cornerstoneWADOImageLoader.webWorkerManager.initialize({
      webWorkerPath: 'assets/cornerstoneWADOImageLoaderWebWorker.js',
      taskConfiguration: {
        decodeTask: {
          codecsPath: 'assets/cornerstoneWADOImageLoaderCodecs.js'
        }
      }
    });

    // Register image loader for color image files
    cornerstone.registerImageLoader('browserImageLoader', (imageId: string) => {
  const promise = new Promise<cornerstone.Image>(async (resolve, reject) => {
    const imageUrl = imageId.replace('browserImageLoader:', '');
    const image = new Image();
    image.src = imageUrl;

    image.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        canvas.width = image.width;
        canvas.height = image.height;

        const context = canvas.getContext('2d')!;
        context.drawImage(image, 0, 0);
        const imageData = context.getImageData(0, 0, image.width, image.height);
        const pixelData = imageData.data;

        resolve({
          imageId,
          minPixelValue: 0,
          maxPixelValue: 255,
          slope: 1,
          intercept: 0,
          windowCenter: 127,
          windowWidth: 255,
          getPixelData: () => pixelData,
          rows: image.height,
          columns: image.width,
          height: image.height,
          width: image.width,
          color: true,
          columnPixelSpacing: 1,
          rowPixelSpacing: 1,
          sizeInBytes: pixelData.length,
          getCanvas: () => canvas
        } as unknown as cornerstone.Image);
      } catch (err) {
        reject(err);
      }
    };

    image.onerror = reject;
  });

  return { promise };
});

    const element = this.cornerstoneElement.nativeElement;
    cornerstone.enable(element);
  }

  async loadCurrentImage() {
    if (!this.imageFiles.length) return;

    const file = this.imageFiles[this.currentIndex];
    const element = this.cornerstoneElement.nativeElement;
    let imageId: string;

    if (file.type === 'application/dicom' || file.name.endsWith('.dcm')) {
      imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
    } else if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
      const dataUrl = await this.readFileAsDataURL(file);
      imageId = `browserImageLoader:${dataUrl}`;
    } else {
      console.error('Unsupported file type:', file.type);
      return;
    }

    try {
      const image = await cornerstone.loadAndCacheImage(imageId);
      cornerstone.displayImage(element, image);
    } catch (err) {
      console.error('Error displaying image:', err);
    }
  }

  private readFileAsDataURL(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result as string);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  previousImage() {
    if (this.currentIndex > 0) {
      this.currentIndex--;
      this.loadCurrentImage();
    }
  }

  nextImage() {
    if (this.currentIndex < this.imageFiles.length - 1) {
      this.currentIndex++;
      this.loadCurrentImage();
    }
  }

}
