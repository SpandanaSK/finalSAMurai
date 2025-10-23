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

 displaySelectedFile(file: File) 
  {
  const index = this.imageFiles.findIndex(f => f.name === file.name);
  if (index >= 0) {
    this.currentIndex = index;
    this.loadCurrentImage();
  }
  }
  @Input() imageFiles: File[] = [];
  @ViewChild('cornerstoneElement', { static: true }) cornerstoneElement!: ElementRef<HTMLDivElement>;
  private loadedFiles: File[] = [];
  currentIndex = 0;
  private initialized = false;
  showGridView = false;
  gridPage = 0;
  private lastSingleIndex = 0;

  // Properties for drag/pan functionality
  isDragging = false;
  lastDragX = 0;
  lastDragY = 0;
  panX = 0;
  panY = 0;

  


  onGridCanvasClick(event: MouseEvent) {
  // Only handle clicks in grid view
  if (!this.showGridView) return;

  const element = this.cornerstoneElement.nativeElement;
  const rect = element.getBoundingClientRect();
  const x = event.clientX - rect.left;
  const y = event.clientY - rect.top;

  const gridSize = 4;
  const gap = 16;
  const canvasWidth = element.clientWidth || 800;
  const canvasHeight = element.clientHeight || 800;
  const cellWidth = (canvasWidth - gap * (gridSize + 1)) / gridSize;
  const cellHeight = (canvasHeight - gap * (gridSize + 1)) / gridSize;

  // Find which cell was clicked
  const col = Math.floor((x - gap) / (cellWidth + gap));
  const row = Math.floor((y - gap) / (cellHeight + gap));
  if (col >= 0 && col < gridSize && row >= 0 && row < gridSize) {
    const idx = row * gridSize + col;
    const globalIndex = this.gridPage * 16 + idx;
    if (globalIndex < this.imageFiles.length) {
      this.currentIndex = globalIndex;
      this.showGridView = false;
      this.loadCurrentImage();
    }
  }
}
  
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
    const canvasWidth = element.clientWidth || 800;
  const canvasHeight = element.clientHeight || 800;
  const cellWidth = (canvasWidth - gap * (gridSize + 1)) / gridSize;
  const cellHeight = (canvasHeight - gap * (gridSize + 1)) / gridSize;

    // Create a temporary canvas
    const gridCanvas = document.createElement('canvas');
    gridCanvas.width = canvasWidth;
    gridCanvas.height = canvasHeight;
    const ctx = gridCanvas.getContext('2d');

    if (ctx) {
      ctx.fillStyle = "#222";
      ctx.fillRect(0, 0, canvasWidth, canvasHeight);
    }

     // Draw each image in its cell, leaving empty cells blank
  for (let i = 0; i < gridSize * gridSize; i++) {
    const file = this.pagedImages[i];
    const row = Math.floor(i / gridSize);
    const col = i % gridSize;
    const x = gap + col * (cellWidth + gap);
    const y = gap + row * (cellHeight + gap);

    if (file) {
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
        let tempCanvas: HTMLCanvasElement | undefined;
        if (image.getCanvas) {
          tempCanvas = image.getCanvas();
        } else {
        // For DICOM images, render to a temporary canvas
          tempCanvas = document.createElement('canvas');
          tempCanvas.width = image.width;
          tempCanvas.height = image.height;
          cornerstone.renderToCanvas(tempCanvas, image);
        }
        if (tempCanvas && ctx) {
          ctx.drawImage(
            tempCanvas, 0, 0, tempCanvas.width, tempCanvas.height,x, y, cellWidth, cellHeight
          );
        }
      } catch (err) {
        // Ignore errors for individual images
      }
      } else {
      // Optionally, draw a blank cell or placeholder
        if (ctx) {
        ctx.fillStyle = "#444";
        ctx.fillRect(x, y, cellWidth, cellHeight);
      }
    }
  }

  // Display the grid canvas as a single image in Cornerstone
  const gridDataUrl = gridCanvas.toDataURL();
  const gridImageId = `browserImageLoader:${gridDataUrl}`;
  try {
    const gridImage = await cornerstone.loadAndCacheImage(gridImageId);
    cornerstone.displayImage(element, gridImage);

// --- Always reset viewport for grid view ---
    const viewport = cornerstone.getViewport(element);
    if (viewport) {
      viewport.scale = 1;
      viewport.translation = { x: 0, y: 0 };
      cornerstone.setViewport(element, viewport);
    }
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

    // Deduplicate: add only new files to loadedFiles
    const allFiles = [...this.loadedFiles];
    for (const f of incoming) {
      if (!allFiles.some(lf => lf.name === f.name && lf.size === f.size)) {
        allFiles.push(f);
      }
    }
    this.loadedFiles = allFiles;

    // Update displayed list
    this.imageFiles = this.loadedFiles;

    // If new files were uploaded, show the first of the new set
   const newFiles = incoming.filter(
      f => !changes['imageFiles'].previousValue?.some(
        (prev: File) => prev.name === f.name && prev.size === f.size
      )
    );
    // Only switch to the first new file if NOT in grid view
    if (!this.showGridView && newFiles.length > 0) {
      const firstNewFile = newFiles[0];
      const newIndex = this.imageFiles.findIndex(
        f => f.name === firstNewFile.name && f.size === firstNewFile.size
      );
      this.currentIndex = newIndex >= 0 ? newIndex : 0;
    }

    // If in grid view, just redraw the grid (stay in grid view)
    if (this.showGridView) {
      this.displayGridView();
    } else {
      this.loadCurrentImage();
    }
  }

  if (changes['selectedFile'] && this.initialized) {
    const file = changes['selectedFile'].currentValue;
    if (file) {
      this.displaySelectedFile(file);
    }
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
    const image = new window.Image();
    image.src = imageUrl;

    image.onload = () => {
      try {
        // Get the display size from the container
        const element = (this.cornerstoneElement?.nativeElement || document.querySelector('.cornerstone-canvas')) as HTMLElement;
        const displayWidth = element?.clientWidth || image.width;
        const displayHeight = element?.clientHeight || image.height;

        // Create a canvas at the display size
        const canvas = document.createElement('canvas');
        canvas.width = displayWidth;
        canvas.height = displayHeight;

        const context = canvas.getContext('2d')!;
        // Fill the entire canvas with #222
        //context.fillStyle = "#222";
        context.fillRect(0, 0, canvas.width, canvas.height);

        // Scale the image to fit inside the canvas, centered
        const scale = Math.min(displayWidth / image.width, displayHeight / image.height, 1);
        const drawWidth = image.width * scale;
        const drawHeight = image.height * scale;
        const dx = (displayWidth - drawWidth) / 2;
        const dy = (displayHeight - drawHeight) / 2;
        context.drawImage(image, dx, dy, drawWidth, drawHeight);

        const imageData = context.getImageData(0, 0, canvas.width, canvas.height);
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
          rows: canvas.height,
          columns: canvas.width,
          height: canvas.height,
          width: canvas.width,
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

    // ✅ Initialize tools
  cornerstoneTools.init();

  // ✅ Add Rectangle ROI tool
  cornerstoneTools.addTool(cornerstoneTools.RectangleRoiTool);
 // 🔑 Attach Rectangle ROI tool to this specific element
  cornerstoneTools.addToolForElement(element, cornerstoneTools.RectangleRoiTool);

  // Default tool states (optional)
  cornerstoneTools.setToolPassive('Pan', { mouseButtonMask: 4 });
  cornerstoneTools.setToolPassive('Zoom', { mouseButtonMask: 2 });
  cornerstoneTools.setToolEnabled('StackScrollMouseWheel');
  }

  async loadCurrentImage() {
    if (!this.imageFiles.length)
      {const element = this.cornerstoneElement.nativeElement;
    const context = element.querySelector('canvas')?.getContext('2d');
    if (context) {
      context.clearRect(0, 0, element.clientWidth, element.clientHeight);
      context.fillStyle = "#222";
      context.fillRect(0, 0, element.clientWidth, element.clientHeight);
    }
    return;
  }

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
      // --- Fit image to canvas at 1X ---
    this.zoomScale = this.getFitScale(image, element);
    this.panX = 0;
    this.panY = 0;
    this.applyViewport();
    } catch (err) {
      console.error('Error displaying image:', err);
    }
    //this.zoomScale = 1;
    //this.panX = 0; // <-- Reset pan
    //this.panY = 0; // <-- Reset pan
    //this.applyZoom();
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
  readonly minZoom = 0.25;
  readonly maxZoom = 10;
  // 🔍 Zoom Functions
 zoomIn() {
  if (this.showGridView) return; // Disable zoom in grid view
  if (this.zoomScale < this.maxZoom) {
    this.zoomScale = Math.min(this.zoomScale * 1.2, this.maxZoom);
    this.applyZoom();
  }
}

zoomOut() {
  if (this.showGridView) return; // Disable zoom in grid view
  if (this.zoomScale > this.minZoom) {
    this.zoomScale = Math.max(this.zoomScale / 1.2, this.minZoom);

    // If we've reached (or gone below) 1X, fit and center the image
    if (this.zoomScale <= 1) {
      const element = this.cornerstoneElement.nativeElement;
      const enabledElement = cornerstone.getEnabledElement(element);
      if (enabledElement && enabledElement.image) {
        this.zoomScale = this.getFitScale(enabledElement.image, element);
      } else {
        this.zoomScale = 1;
      }
      this.panX = 0;
      this.panY = 0;
      this.applyViewport(); // <-- This sets both scale and translation
      return; // Prevent further applyZoom()
    }
    this.applyZoom();
  }
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
  // No need to manually handle scrollbars; CSS handles it
}


// ✅ Helper: check if any Cornerstone tool is active
private isAnyToolActive(): boolean {
  const element = this.cornerstoneElement.nativeElement;
  const activeTool = cornerstoneTools.getActiveTool(element);
  return !!activeTool;
}




/*onCanvasMouseDown(event: MouseEvent) {
  if (this.showGridView || this.zoomScale <= 1) return; // don't block tools
  const activeTool = cornerstoneTools.getActiveTool(this.cornerstoneElement.nativeElement);
  if (!activeTool || activeTool.toolType !== 'Pan') {
    // allow CornerstoneTools to handle mouse for active tool
    return;
  }
  this.isDragging = true;
  this.lastDragX = event.clientX;
  this.lastDragY = event.clientY;
}


onCanvasMouseMove(event: MouseEvent) {
  if (!this.isDragging) return;
  this.pan(event.clientX - this.lastDragX, event.clientY - this.lastDragY);
  this.lastDragX = event.clientX;
  this.lastDragY = event.clientY;
}

onCanvasMouseUp() {
  this.isDragging = false;
}*/

private getFitScale(image: cornerstone.Image, element: HTMLElement): number {
  const canvasWidth = element.clientWidth;
  const canvasHeight = element.clientHeight;
  const scaleX = canvasWidth / image.width;
  const scaleY = canvasHeight / image.height;
  return Math.min(scaleX, scaleY, 1); // Never upscale above 1X
}

// Add pan method to handle panning
pan(dx: number, dy: number) {
  if (this.showGridView) return;
  this.panX += dx;
  this.panY += dy;
  this.applyViewport();
}

applyViewport() {
  const element = this.cornerstoneElement.nativeElement;
  const viewport = cornerstone.getViewport(element);
  if (!viewport) {
    console.warn('Viewport is not initialized yet.');
    return;
  }
  viewport.scale = this.zoomScale;
  viewport.translation = { x: this.panX, y: this.panY };
  cornerstone.setViewport(element, viewport);
}
activateRectangleRoi() {
  const element = this.cornerstoneElement.nativeElement;

  cornerstoneTools.setToolActive('RectangleRoi', {
    mouseButtonMask: 1 // left mouse button
  });

  element.style.cursor = 'crosshair';
  console.log('Rectangle ROI tool activated');
}


}

