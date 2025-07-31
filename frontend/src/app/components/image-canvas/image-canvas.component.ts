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
  standalone: true,
  styleUrls: ['./image-canvas.component.scss'],
  imports: [CommonModule]
})
export class ImageCanvasComponent implements AfterViewInit, OnChanges {

  @Input() imageFiles: File[] = [];
  @ViewChild('cornerstoneElement', { static: true }) cornerstoneElement!: ElementRef<HTMLDivElement>;
  private loadedFiles: File[] = [];
  currentIndex = 0;
  private initialized = false;
  showGridView = false;
  gridPage = 0;
  private lastSingleIndex = 0;

  toggleGridView() {
    if (!this.showGridView) {
      this.lastSingleIndex = this.currentIndex;
      this.displayGridView();
    } else {
      this.currentIndex = this.lastSingleIndex;
      this.loadCurrentImage();
    }
    this.showGridView = !this.showGridView;
  }

  nextGridPage() {
    if (this.gridPage < this.totalGridPages() - 1) {
      this.gridPage++;
      if (this.showGridView) this.displayGridView();
    }
  }

  prevGridPage() {
    if (this.gridPage > 0) {
      this.gridPage--;
      if (this.showGridView) this.displayGridView();
    }
  }

  totalGridPages(): number {
    return Math.ceil(this.imageFiles.length / 16);
  }

  get pagedImages(): File[] {
    const start = this.gridPage * 16;
    return this.imageFiles.slice(start, start + 16);
  }

  async displayGridView() {
    const element = this.cornerstoneElement.nativeElement;
    const gridSize = 4;
    const gap = 16;
    const cellWidth = 200;
    const cellHeight = 200;
    const canvasWidth = cellWidth * gridSize + gap * (gridSize + 1);
    const canvasHeight = cellHeight * gridSize + gap * (gridSize + 1);

    // Create a temporary canvas
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    const ctx = gridCanvas.getContext('2d');

    /*if (ctx) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }*/

    // Load and draw each image into the grid
    for (let i = 0; i < this.pagedImages.length; i++) {
      const file = this.pagedImages[i];
      let imageId: string;

      if (file.type === 'application/dicom' || file.name.endsWith('.dcm')) {
        imageId = cornerstoneWADOImageLoader.wadouri.fileManager.add(file);
      } else if (file.type.startsWith('image/') || file.type.startsWith('video/')) {
        const dataUrl = await this.readFileAsDataURL(file);
        imageId = `browserImageLoader:${dataUrl}`;
      } else {
        continue;
      }

      try {
        const image = await cornerstone.loadAndCacheImage(imageId);
        // Draw image into a cell
        const tempCanvas = image.getCanvas ? image.getCanvas() : undefined;
        if (tempCanvas && ctx) {
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    // CHANGE HERE: add gap to x and y
    const x = gap + col * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);
    ctx.drawImage(
      tempCanvas,
      0, 0, tempCanvas.width, tempCanvas.height,
      x, y, cellWidth, cellHeight
    );
  }
      } catch (err) {
        // Ignore errors for individual images
      }
    }

    // Display the grid canvas as a single image in Cornerstone
    const gridDataUrl = gridCanvas.toDataURL();
    const gridImageId = `browserImageLoader:${gridDataUrl}`;
    try {
      const gridImage = await cornerstone.loadAndCacheImage(gridImageId);
      cornerstone.displayImage(element, gridImage);
    } catch (err) {
      console.error('Error displaying grid image:', err);
    }
  }

  getImageSrc(file: File): string {
    return URL.createObjectURL(file);
  }

  zoomScale = 1; // Added for zoom functionality

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

  // 🔍 Zoom Functions
  zoomIn() {
    this.zoomScale *= 1.2;
    this.applyZoom();
  }

  zoomOut() {
    this.zoomScale /= 1.2;
    this.applyZoom();
  }

  applyZoom() {
  const element = this.cornerstoneElement.nativeElement;
  const viewport = cornerstone.getViewport(element);

  if (!viewport) {
    console.warn('Viewport is not initialized yet.');
    return;
  }

  viewport.scale = this.zoomScale;
  cornerstone.setViewport(element, viewport);
}

}
