import { Injectable } from '@angular/core';
import * as cornerstone from 'cornerstone-core';
import * as cornerstoneMath from 'cornerstone-math';
import * as cornerstoneTools from 'cornerstone-tools';
import * as dicomParser from 'dicom-parser';
import * as cornerstoneWADOImageLoader from 'cornerstone-wado-image-loader';

@Injectable({
  providedIn: 'root',
})
export class CornerstoneService {
  constructor() {
    this.initializeCornerstone();
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
          codecsPath: 'assets/cornerstoneWADOImageLoaderCodecs.js',
        },
      },
    });

    cornerstoneTools.init();
  }
}
