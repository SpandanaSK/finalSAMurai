/**
 * Cornerstone utilities for VIA integration
 * Contains functions for managing Cornerstone DICOM viewers in VIA
 */

/**
 * Initialize Cornerstone
 * Ensures all dependencies are properly configured
 */
function initCornerstone() {
  if (!window.cornerstone) {
    return;
  }
  
  if (!window.cornerstoneWADOImageLoader) {
    return;
  }
  
  if (!window.dicomParser) {
    return;
  }
  
  if (!window.cornerstoneMath) {
    return;
  }
  
  if (!window.cornerstoneTools) {
    return;
  }
  
  // Configure the libraries
  cornerstoneWADOImageLoader.external.cornerstone = cornerstone;
  cornerstoneWADOImageLoader.external.dicomParser = dicomParser;
  cornerstoneTools.external.cornerstoneMath = cornerstoneMath;
  cornerstoneTools.external.cornerstone = cornerstone;
  cornerstoneTools.external.Hammer = Hammer;
  
  // Initialize Cornerstone Tools
  cornerstoneTools.init();
  
  // Register annotation tools
  registerAnnotationTools();
  
  // Register all the image loaders
  cornerstone.registerImageLoader('wadouri', cornerstoneWADOImageLoader.wadouri.loadImage);
  cornerstone.registerImageLoader('http', cornerstoneWADOImageLoader.wadouri.loadImage);
  cornerstone.registerImageLoader('https', cornerstoneWADOImageLoader.wadouri.loadImage);
  
  // Use non-webworker implementation by default since we don't have access to the worker files
  if (cornerstoneWADOImageLoader.configure) {
    cornerstoneWADOImageLoader.configure({
      useWebWorkers: false
    });
  }
}

/**
 * Register annotation tools required for annotations
 */
function registerAnnotationTools() {
  if (!cornerstoneTools) {
    return;
  }
  
  try {
    // Register the tools we need for annotations
    if (cornerstoneTools.addTool) {
      // Tools to add - using consistent naming without "Tool" suffix
      // The actual tool classes have the "Tool" suffix, but we'll use the base names for consistency
      const toolClasses = [
        { name: 'RectangleRoi', class: cornerstoneTools.RectangleRoiTool },
        { name: 'CircleRoi', class: cornerstoneTools.CircleRoiTool },
        { name: 'EllipticalRoi', class: cornerstoneTools.EllipticalRoiTool },
        { name: 'FreehandRoi', class: cornerstoneTools.FreehandRoiTool },
        { name: 'ArrowAnnotate', class: cornerstoneTools.ArrowAnnotateTool },
        { name: 'Pan', class: cornerstoneTools.PanTool },
        { name: 'Zoom', class: cornerstoneTools.ZoomTool },
        { name: 'Magnify', class: cornerstoneTools.MagnifyTool },
        { name: 'StackScroll', class: cornerstoneTools.StackScrollTool },
        { name: 'StackScrollMouseWheel', class: cornerstoneTools.StackScrollMouseWheelTool },
        { name: 'Wwwc', class: cornerstoneTools.WwwcTool }
      ];
      
      // Register each tool
      toolClasses.forEach(toolInfo => {
        if (toolInfo.class) {
          try {
            cornerstoneTools.addTool(toolInfo.class);
          } catch (error) {
            // Silently handle error
          }
        }
      });
    }
  } catch (error) {
    // Silently handle error
  }
}

// Check if all dependencies are loaded and initialize once they are
let cornerstoneCheckInterval = null;
let cornerstoneInitialized = false;

function ensureCornerstoneLoaded() {
  // If already initialized, don't start another interval
  if (cornerstoneInitialized) {
    return;
  }
  
  // If already checking, don't start another interval
  if (cornerstoneCheckInterval) {
    return;
  }
  
  cornerstoneCheckInterval = setInterval(function() {
    // Check for the actual global objects that are loaded
    if (window.cornerstone && 
        window.cornerstoneWADOImageLoader && 
        window.dicomParser && 
        window.cornerstoneMath && 
        window.cornerstoneTools && 
        window.Hammer) {
      
      clearInterval(cornerstoneCheckInterval);
      cornerstoneCheckInterval = null;
      
      try {
        initCornerstone();
        cornerstoneInitialized = true;
        
        // If scanCornerstoneTools function exists, call it to initialize global tool names
        if (typeof window.scanCornerstoneTools === 'function') {
          window.scanCornerstoneTools();
        }
      } catch (error) {
        // Reset so we can try again
        cornerstoneInitialized = false;
      }
    }
  }, 100);
  
  // Set a timeout to stop checking after 10 seconds to prevent infinite loop
  setTimeout(function() {
    if (cornerstoneCheckInterval) {
      clearInterval(cornerstoneCheckInterval);
      cornerstoneCheckInterval = null;
    }
  }, 10000);
}

// Function to manually reset Cornerstone initialization
// Can be called if an error was encountered and we need to reinitialize
function resetCornerstoneInitialization() {
  cornerstoneInitialized = false;
  if (cornerstoneCheckInterval) {
    clearInterval(cornerstoneCheckInterval);
    cornerstoneCheckInterval = null;
  }
  ensureCornerstoneLoaded();
}

// Start the dependency check when the script loads
ensureCornerstoneLoaded();

// Also check on window load in case script is loaded later
window.addEventListener('load', ensureCornestoneLoaded);

/**
 * Setup draggable toggle button for switching between DICOM tools and annotation
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 */
function addDicomToolsToggleButton(cornerstoneElement) {
  // Create toggle button
  // create this button only if it doesn't exist
  if (document.getElementById('dicom_tools_toggle')) {
    return;
  }
  const toggleButton = document.createElement('button');
  toggleButton.id = 'dicom_tools_toggle';
  toggleButton.className = 'btn btn-sm btn-primary';
  toggleButton.innerHTML = '🔍 DICOM Tools';
  toggleButton.title = 'Toggle between DICOM viewing tools and annotation';
  toggleButton.style.position = 'fixed'; // Change to fixed positioning
  toggleButton.style.right = 'auto';
  toggleButton.style.top = 'auto';
  toggleButton.style.transform = 'translateY(-50%)';
  toggleButton.style.zIndex = '1000';
  toggleButton.style.opacity = '0.7';
  toggleButton.style.transition = 'opacity 0.3s';
  toggleButton.style.padding = '8px 12px';
  toggleButton.style.borderRadius = '20px';
  toggleButton.style.cursor = 'move';  // Show move cursor
  
  // Add hover effect
  toggleButton.addEventListener('mouseover', () => {
    toggleButton.style.opacity = '1';
  });
  
  toggleButton.addEventListener('mouseout', () => {
    toggleButton.style.opacity = '0.7';
  });
  
  // Add draggable functionality
  let isDragging = false;
  let dragOffsetX = 0;
  let dragOffsetY = 0;
  
  // Handle drag start
  toggleButton.addEventListener('mousedown', (e) => {
    // Only handle primary button (left-click)
    if (e.button !== 0) return;
    
    // Don't start drag if user clicked on the button text (to toggle)
    const target = e.target;
    if (target !== toggleButton) return;
    
    isDragging = true;
    dragOffsetX = e.clientX - toggleButton.getBoundingClientRect().left;
    dragOffsetY = e.clientY - toggleButton.getBoundingClientRect().top;
    
    // Prevent text selection during drag
    e.preventDefault();
  });
  
  // Handle drag movement
  document.addEventListener('mousemove', (e) => {
    if (!isDragging) return;
    
    const x = e.clientX - dragOffsetX;
    const y = e.clientY - dragOffsetY;
    
    // Set position relative to the page
    toggleButton.style.left = x + 'px';
    toggleButton.style.top = y + 'px';
    toggleButton.style.right = 'auto';  // Clear right position
    toggleButton.style.transform = 'none';  // Clear transform
  });
  
  // Handle drag end
  document.addEventListener('mouseup', () => {
    isDragging = false;
  });
  
  // Create a separate click handler element to handle the toggle action
  const clickHandler = document.createElement('div');
  clickHandler.style.display = 'flex';
  clickHandler.style.alignItems = 'center';
  clickHandler.style.justifyContent = 'center';
  clickHandler.style.width = '100%';
  clickHandler.style.height = '100%';
  clickHandler.style.cursor = 'pointer';
  clickHandler.innerHTML = toggleButton.innerHTML;
  toggleButton.innerHTML = '';
  toggleButton.appendChild(clickHandler);
  
  // Add click behavior
  let isDicomToolsMode = false;
  const canvasOriginalSize = { width: 0, height: 0 };
  
  // Store current cornerstone annotations
  let cornerstoneAnnotations = [];
  
  clickHandler.addEventListener('click', (e) => {
    // Don't toggle if we're dragging
    if (isDragging) return;
    
    isDicomToolsMode = !isDicomToolsMode;
    
    if (isDicomToolsMode) {
      // Switch to DICOM tools mode - hide annotation canvas
      if (_via_reg_canvas) {
        // Store original size
        canvasOriginalSize.width = _via_reg_canvas.width;
        canvasOriginalSize.height = _via_reg_canvas.height;
        
        
        // Hide the canvas by setting size to 0
        _via_reg_canvas.width = 0;
        _via_reg_canvas.height = 0;
        _via_reg_canvas.style.pointerEvents = 'none';
        
        
        // Change button appearance
        clickHandler.innerHTML = '✏️ Annotate';
        toggleButton.classList.remove('btn-primary');
        toggleButton.classList.add('btn-success');
      }
    } else {
      // Switch to annotation mode - restore annotation canvas
      if (_via_reg_canvas) {
        // Save current cornerstone annotations if needed
        // saveCornerstoneAnnotations(cornerstoneElement);
        
        // Remove cornerstone annotations from display
        // removeCornerstoneAnnotations(cornerstoneElement);
        
        // Restore original size
        _via_reg_canvas.width = canvasOriginalSize.width;
        _via_reg_canvas.height = canvasOriginalSize.height;
        _via_reg_canvas.style.pointerEvents = 'auto';
        
        // Reset canvas size if it was 0
        if (canvasOriginalSize.width === 0 || canvasOriginalSize.height === 0) {
          set_all_canvas_size(_via_canvas_width, _via_canvas_height);
        }
        
        
        // Change button appearance
        clickHandler.innerHTML = '🔍 DICOM Tools';
        toggleButton.classList.remove('btn-success');
        toggleButton.classList.add('btn-primary');
        
        saveCurrentCornerstoneImageState(cornerstoneElement);
        set_current_image(_via_current_image_filename, _via_current_extra_params[_via_image_id]);
        // Redraw VIA annotations
        _via_load_canvas_regions();
        _via_redraw_reg_canvas();
      }
    }
    
    // Stop propagation to prevent drag
    e.stopPropagation();
  });
  
  // Add to document
  document.getElementById('image_panel').appendChild(toggleButton);
}

/**
 * Add a rectangle annotation to Cornerstone
 */
function addRectangleToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  if (!cornerstoneTools.RectangleRoiTool) {
    return;
  }
  
  try {
    // Convert canvas coordinates to world coordinates
    const { x, y, width, height } = shapeAttrs;
    
    // Create annotation data with complete handle properties
    const toolData = {
      visible: true,
      active: false,
      invalidated: true,
      handles: {
        start: {
          x: x,
          y: y,
          active: false,
          highlight: false,
          draggerFound: false
        },
        end: {
          x: x + width,
          y: y + height,
          active: false,
          highlight: false,
          draggerFound: false
        },
        textBox: {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true,
          x: x + width / 2,
          y: y - 10
        }
      },
      cachedStats: {}
    };
    
    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Add measurement data
    toolData.cachedStats.area = width * height;
    
    // Add tool state
    addToolState(cornerstoneElement, 'RectangleRoi', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add a circle annotation to Cornerstone
 */
function addCircleToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  if (!cornerstoneTools.CircleRoiTool) {
    return;
  }
  
  try {
    // Get circle attributes
    const { cx, cy, r } = shapeAttrs;
    
    // Create annotation data with complete handle properties
    const toolData = {
      visible: true,
      active: false,
      invalidated: true,
      handles: {
        start: {
          x: cx - r,
          y: cy,
          active: false,
          highlight: false,
          draggerFound: false
        },
        end: {
          x: cx + r,
          y: cy,
          active: false,
          highlight: false,
          draggerFound: false
        },
        textBox: {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true,
          x: cx,
          y: cy - r - 10
        }
      },
      cachedStats: {}
    };
    
    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Add measurement data
    toolData.cachedStats.area = Math.PI * r * r;
    
    // Add tool state
    addToolState(cornerstoneElement, 'CircleRoi', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add an ellipse annotation to Cornerstone
 */
function addEllipseToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  if (!cornerstoneTools.EllipticalRoiTool) {
    return;
  }
  
  try {
    // Get ellipse attributes
    const { cx, cy, rx, ry, theta } = shapeAttrs;
    
    // Create annotation data with correct handle properties
    // For an ellipse, we need to properly set start and end points
    // to form the major and minor axes of the ellipse
    const toolData = {
      visible: true,
      active: false,
      invalidated: true,
      handles: {
        start: {
          x: cx - rx,  // Left point
          y: cy,       // At the vertical center
          active: false,
          highlight: false,
          draggerFound: false
        },
        end: {
          x: cx + rx,  // Right point 
          y: cy,       // At the vertical center
          active: false,
          highlight: false,
          draggerFound: false
        },
        // To create proper height for the ellipse, we need to set additional handles
        // that define the top and bottom points
        topCenter: {
          x: cx,       // Horizontal center
          y: cy - ry,  // Top point
          draggerFound: false,
          active: false,
          highlight: false
        },
        bottomCenter: {
          x: cx,       // Horizontal center
          y: cy + ry,  // Bottom point
          draggerFound: false,
          active: false,
          highlight: false
        },
        textBox: {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true,
          x: cx,
          y: cy - ry - 10
        }
      },
      cachedStats: {}
    };
    
    // The EllipticalRoiTool in cornerstone expects handles with proper height
    // Workaround: Adjust the end handle's y coordinate to create an ellipse with height
    toolData.handles.end.y = cy + (ry * 0.5); // This creates an elliptical appearance

    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Add measurement data
    toolData.cachedStats.area = Math.PI * rx * ry;
    
    // Add tool state
    addToolState(cornerstoneElement, 'EllipticalRoi', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add a polygon annotation to Cornerstone
 */
function addPolygonToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  try {
    // Get polygon attributes
    const { all_points_x, all_points_y } = shapeAttrs;
    
    if (!all_points_x || !all_points_y || all_points_x.length !== all_points_y.length) {
      return;
    }
    
    // Calculate center point for textBox placement
    let sumX = 0, sumY = 0;
    for (let i = 0; i < all_points_x.length; i++) {
      sumX += all_points_x[i];
      sumY += all_points_y[i];
    }
    const centerX = sumX / all_points_x.length;
    const centerY = sumY / all_points_y.length;
    
    // Create points array with all required properties
    const points = all_points_x.map((x, i) => ({
      x: x,
      y: all_points_y[i],
      active: false,
      highlight: false,
      draggerFound: false,
      lines: []  // Required by FreehandRoiTool
    }));
    
    // Calculate bounding box - required for FreehandRoi
    let minX = Math.min(...all_points_x);
    let maxX = Math.max(...all_points_x);
    let minY = Math.min(...all_points_y);
    let maxY = Math.max(...all_points_y);
    
    // Connect the points with lines - required for FreehandRoi
    for (let i = 0; i < points.length; i++) {
      const nextIndex = (i + 1) % points.length; // Loop back to first point
      
      // Add line connection between this point and the next
      points[i].lines.push({
        start: points[i],
        end: points[nextIndex]
      });
    }
    
    // Create handles
    const handles = {
      points: points,
      textBox: {
        active: false,
        hasMoved: false,
        movesIndependently: false,
        drawnIndependently: true,
        allowedOutsideImage: true,
        hasBoundingBox: true,
        x: centerX,
        y: centerY - 10
      }
    };
    
    // Create annotation data with all properties required by FreehandRoi
    const toolData = {
      visible: true,
      active: false,
      invalidated: true,
      handles: handles,
      cachedStats: {
        area: calculatePolygonArea(all_points_x, all_points_y)
      },
      polyBoundingBox: {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      closed: true,  // Polygon is closed
      canComplete: true, // Already complete
      mouseUpCallback: undefined,
      count: points.length,
      initialRotation: 0,
      interpolated: false
    };
    
    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Add tool state
    addToolState(cornerstoneElement, 'FreehandRoi', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add a point annotation to Cornerstone
 */
function addPointToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  try {
    // Get point attributes
    const { cx, cy } = shapeAttrs;
    
    // Create annotation data with all required properties for ArrowAnnotateTool
    const toolData = {
      visible: true,
      active: false,
      color: undefined,
      invalidated: true,
      text: regionAttrs?.name || 'Point',
      handles: {
        start: {
          x: cx - 5,  // Start point slightly to the left of main point
          y: cy - 5,  // Start point slightly above main point
          active: false,
          highlight: false,
          draggerFound: false
        },
        end: {
          x: cx,
          y: cy,
          active: false,
          highlight: false,
          draggerFound: false
        },
        textBox: {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true,
          x: cx + 10,
          y: cy - 10
        }
      }
    };
    
    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Add tool state
    addToolState(cornerstoneElement, 'ArrowAnnotate', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add a polyline annotation to Cornerstone
 */
function addPolylineToCornerstone(cornerstoneElement, shapeAttrs, regionAttrs) {
  try {
    // Get polyline attributes
    const { all_points_x, all_points_y } = shapeAttrs;
    
    if (!all_points_x || !all_points_y || all_points_x.length !== all_points_y.length) {
      return;
    }
    
    // Calculate center point for textBox placement
    let sumX = 0, sumY = 0;
    for (let i = 0; i < all_points_x.length; i++) {
      sumX += all_points_x[i];
      sumY += all_points_y[i];
    }
    const centerX = sumX / all_points_x.length;
    const centerY = sumY / all_points_y.length;
    
    // Create points array with all required properties
    const points = all_points_x.map((x, i) => ({
      x: x,
      y: all_points_y[i],
      active: false,
      highlight: false,
      draggerFound: false,
      lines: []  // Required by FreehandRoiTool
    }));
    
    // Calculate bounding box - required for FreehandRoi
    let minX = Math.min(...all_points_x);
    let maxX = Math.max(...all_points_x);
    let minY = Math.min(...all_points_y);
    let maxY = Math.max(...all_points_y);
    
    // Connect the points with lines - for the polyline, don't close the shape
    for (let i = 0; i < points.length - 1; i++) {
      // Add line connection between this point and the next
      points[i].lines.push({
        start: points[i],
        end: points[i + 1]
      });
    }
    
    // Create handles
    const handles = {
      points: points,
      textBox: {
        active: false,
        hasMoved: false,
        movesIndependently: false,
        drawnIndependently: true,
        allowedOutsideImage: true,
        hasBoundingBox: true,
        x: centerX,
        y: centerY - 10
      }
    };
    
    // Create annotation data with all properties required by FreehandRoi
    const toolData = {
      visible: true,
      active: false,
      invalidated: true,
      color: undefined,
      handles: handles,
      cachedStats: {},
      polyBoundingBox: {
        left: minX,
        top: minY,
        width: maxX - minX,
        height: maxY - minY
      },
      closed: false,  // Polyline is not closed
      canComplete: false, // Already complete
      mouseUpCallback: undefined,
      count: points.length,
      initialRotation: 0,
      interpolated: false
    };
    
    // Add region attributes as metadata
    if (regionAttrs) {
      toolData.metadata = { ...regionAttrs };
    }
    
    // Instead of Polyline (which doesn't exist), use FreehandRoi
    addToolState(cornerstoneElement, 'FreehandRoi', toolData);
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Calculate the area of a polygon
 * @param {Array} x - Array of x-coordinates 
 * @param {Array} y - Array of y-coordinates
 * @returns {number} - Area of the polygon
 */
function calculatePolygonArea(x, y) {
  let area = 0;
  const n = x.length;
  
  // Use the Shoelace formula to calculate polygon area
  for (let i = 0; i < n; i++) {
    const j = (i + 1) % n;
    area += x[i] * y[j] - x[j] * y[i];
  }
  
  return Math.abs(area / 2);
}

/**
 * Get information about the Cornerstone environment
 * @returns {Object} Information about Cornerstone versions and availability
 */
function getCornerstoneEnvironment() {
  const env = {
    cornerstone: {
      available: typeof window.cornerstone !== 'undefined',
      version: window.cornerstone && window.cornerstone.version ? window.cornerstone.version : null,
    },
    cornerstoneTools: {
      available: typeof window.cornerstoneTools !== 'undefined',
      version: window.cornerstoneTools && window.cornerstoneTools.version ? window.cornerstoneTools.version : null
    }
  };
  
  return env;
}

/**
 * Helper function to add tool state
 */
function addToolState(element, toolName, measurementData) {
  if (!window.cornerstoneTools) {
    return;
  }
  
  try {
    // Ensure the toolData has all required properties to prevent errors
    if (measurementData.handles) {
      // Special handling for ArrowAnnotate which requires specific properties
      if (toolName === 'ArrowAnnotate') {
        // Make sure text property exists
        measurementData.text = measurementData.text || 'Annotation';
        
        // Ensure start point exists
        if (!measurementData.handles.start) {
          const endX = measurementData.handles.end?.x || 0;
          const endY = measurementData.handles.end?.y || 0;
          measurementData.handles.start = {
            x: endX - 5,
            y: endY - 5,
            active: false,
            highlight: false,
            draggerFound: false
          };
        }
        
        // Ensure end point exists
        if (!measurementData.handles.end) {
          const startX = measurementData.handles.start?.x || 0;
          const startY = measurementData.handles.start?.y || 0;
          measurementData.handles.end = {
            x: startX + 5,
            y: startY + 5,
            active: false,
            highlight: false,
            draggerFound: false
          };
        }
      }
      
      // Special handling for FreehandRoi
      if (toolName === 'FreehandRoi') {
        // Ensure points array exists and has at least 3 points for a valid shape
        if (!measurementData.handles.points || !Array.isArray(measurementData.handles.points) || measurementData.handles.points.length < 3) {
          console.warn(`Invalid FreehandRoi: needs at least 3 points`);
          
          // Create default points if none exist
          if (!measurementData.handles.points || !Array.isArray(measurementData.handles.points)) {
            measurementData.handles.points = [
              { x: 50, y: 50, active: false, highlight: false, draggerFound: false, lines: [] },
              { x: 150, y: 50, active: false, highlight: false, draggerFound: false, lines: [] },
              { x: 100, y: 100, active: false, highlight: false, draggerFound: false, lines: [] }
            ];
          }
        }
        
        // Ensure each point has all required properties including lines array
        measurementData.handles.points.forEach((point, index) => {
          point.active = point.active !== undefined ? point.active : false;
          point.highlight = point.highlight !== undefined ? point.highlight : false;
          point.draggerFound = point.draggerFound !== undefined ? point.draggerFound : false;
          
          // Ensure lines property exists
          if (!point.lines || !Array.isArray(point.lines)) {
            point.lines = [];
          }
        });
        
        // Ensure lines are properly connected between points
        if (measurementData.handles.points.length > 1) {
          for (let i = 0; i < measurementData.handles.points.length; i++) {
            const point = measurementData.handles.points[i];
            
            // Clear existing lines to avoid duplicates
            point.lines = [];
            
            // For closed polygons (or if specifically marked as closed)
            if (measurementData.closed !== false) {
              const nextIndex = (i + 1) % measurementData.handles.points.length;
              const nextPoint = measurementData.handles.points[nextIndex];
              
              // Add line to next point
              point.lines.push({
                start: point,
                end: nextPoint
              });
            } 
            // For polylines (not closed)
            else if (i < measurementData.handles.points.length - 1) {
              const nextPoint = measurementData.handles.points[i + 1];
              
              // Add line to next point (but not from last to first)
              point.lines.push({
                start: point,
                end: nextPoint
              });
            }
          }
        }
        
        // Ensure other required properties for FreehandRoi exist
        measurementData.closed = measurementData.closed !== undefined ? measurementData.closed : true;
        measurementData.canComplete = measurementData.canComplete !== undefined ? measurementData.canComplete : false;
        measurementData.count = measurementData.handles.points.length;
        
        // Calculate or ensure polyBoundingBox exists
        if (!measurementData.polyBoundingBox) {
          measurementData.polyBoundingBox = calculatePolyBoundingBox(measurementData.handles.points);
        }
        
        // Ensure other properties needed by FreehandRoiTool
        measurementData.initialRotation = measurementData.initialRotation || 0;
        measurementData.invalidated = true;
        
        // Calculate area for cachedStats if needed
        if (!measurementData.cachedStats || !measurementData.cachedStats.area) {
          if (!measurementData.cachedStats) {
            measurementData.cachedStats = {};
          }
          
          // Extract x and y coordinates for area calculation
          const x = measurementData.handles.points.map(p => p.x);
          const y = measurementData.handles.points.map(p => p.y);
          measurementData.cachedStats.area = calculatePolygonArea(x, y);
        }
      }
      
      // Ensure textBox exists and has all required properties
      if (!measurementData.handles.textBox) {
        // Create a default textBox if it doesn't exist
        measurementData.handles.textBox = {
          active: false,
          hasMoved: false,
          movesIndependently: false,
          drawnIndependently: true,
          allowedOutsideImage: true,
          hasBoundingBox: true
        };
        
        // Set default position if start or end points exist
        if (measurementData.handles.start && measurementData.handles.end) {
          const startX = measurementData.handles.start.x;
          const startY = measurementData.handles.start.y;
          const endX = measurementData.handles.end.x;
          const endY = measurementData.handles.end.y;
          
          measurementData.handles.textBox.x = (startX + endX) / 2;
          measurementData.handles.textBox.y = Math.min(startY, endY) - 10;
        } 
        // Set position based on points array if it exists
        else if (measurementData.handles.points && Array.isArray(measurementData.handles.points) && measurementData.handles.points.length > 0) {
          // Find center point of all vertices
          let sumX = 0, sumY = 0;
          measurementData.handles.points.forEach(point => {
            sumX += point.x;
            sumY += point.y;
          });
          
          measurementData.handles.textBox.x = sumX / measurementData.handles.points.length;
          measurementData.handles.textBox.y = sumY / measurementData.handles.points.length - 10;
        }
      }
      
      // Ensure all handle points have required properties
      const checkHandleProps = (handle) => {
        if (handle) {
          handle.active = handle.active !== undefined ? handle.active : false;
          handle.highlight = handle.highlight !== undefined ? handle.highlight : false;
          handle.draggerFound = handle.draggerFound !== undefined ? handle.draggerFound : false;
        }
      };
      
      // Check properties for standard handles
      checkHandleProps(measurementData.handles.start);
      checkHandleProps(measurementData.handles.end);
    }
    
    // Add tool state
    if (typeof window.cornerstoneTools.addToolState === 'function') {
      window.cornerstoneTools.addToolState(element, toolName, measurementData);
      
      // Force tool to be active to ensure annotations are displayed
      if (typeof window.cornerstoneTools.setToolActive === 'function') {
        // Save current active tool to restore later
        const activeTool = getActiveToolName();
        
        // Temporarily activate the tool to ensure annotations are rendered
        window.cornerstoneTools.setToolActive(toolName, { mouseButtonMask: 1 });
        
        // Restore previous active tool - do this after a slight delay
        // to ensure the annotations are properly rendered
        setTimeout(() => {
          if (activeTool) {
            window.cornerstoneTools.setToolActive(activeTool, { mouseButtonMask: 1 });
          } else {
            // Default to window level tool if no active tool was detected
            window.cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
          }
        }, 100); // Increase the delay to give more time for rendering
      }
      
      // Update image to ensure annotations are visible
      if (window.cornerstone && typeof window.cornerstone.updateImage === 'function') {
        window.cornerstone.updateImage(element);
      }
    }
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Calculate bounding box for polygon points
 * @param {Array} points - Array of points with x,y coordinates
 * @returns {Object} Bounding box with left, top, width, height
 */
function calculatePolyBoundingBox(points) {
  if (!points || !points.length) {
    return { left: 0, top: 0, width: 0, height: 0 };
  }
  
  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;
  
  points.forEach(point => {
    minX = Math.min(minX, point.x);
    minY = Math.min(minY, point.y);
    maxX = Math.max(maxX, point.x);
    maxY = Math.max(maxY, point.y);
  });
  
  return {
    left: minX,
    top: minY,
    width: maxX - minX,
    height: maxY - minY
  };
}

/**
 * Get the currently active tool name
 * @returns {string|null} Active tool name or null if not found
 */
function getActiveToolName() {
  if (!window.cornerstoneTools) return null;
  
  try {
    // Check if getActiveTools method exists
    if (typeof window.cornerstoneTools.getActiveTools === 'function') {
      const activeTools = window.cornerstoneTools.getActiveTools();
      if (activeTools && activeTools.length > 0) {
        // Ensure the tool name has the "Tool" suffix
        let name = activeTools[0].name;
        if (name && !name.endsWith('Tool')) {
          name = name + 'Tool';
        }
        return name;
      }
    } else {
      // Common tool names to check - all with "Tool" suffix
      const toolsToCheck = [
        'Wwwc', 'Pan', 'Zoom', 'StackScrollMouseWheel', 
        'RectangleRoi', 'CircleRoi', 'EllipticalRoi',
        'FreehandRoi', 'ArrowAnnotate', 'Polyline'
      ];
      
      for (const toolName of toolsToCheck) {
        // Check if tool exists and is active
        if (window.cornerstoneTools[toolName] && window.cornerstoneTools[toolName].active === true) {
          return toolName;
        }
      }
    }
    
    // Default active tool is usually window level (Wwwc)
    return 'Wwwc';
  } catch (error) {
    return 'Wwwc'; // Default to window level
  }
}

/**
 * Remove all Cornerstone annotations
 */
function removeCornerstoneAnnotations(cornerstoneElement) {
  // Check basic requirements first
  if (!window.cornerstoneTools) {
    return;
  }
  
  try {
    // Tool names to clear
    const toolNames = [
      'RectangleRoi', 
      'CircleRoi', 
      'EllipticalRoi', 
      'FreehandRoi',
      'ArrowAnnotate'
    ];
    
    // For Cornerstone tools - with safer execution
    if (typeof window.cornerstoneTools.clearToolState === 'function') {
      toolNames.forEach(toolName => {
        try {
          window.cornerstoneTools.clearToolState(cornerstoneElement, toolName);
        } catch (toolError) {
          // Silently handle error
        }
      });
    }
    
    // Update image to reflect annotation removal - with safer check
    if (window.cornerstone && 
        typeof window.cornerstone.getEnabledElement === 'function' && 
        window.cornerstone.getEnabledElement(cornerstoneElement) && 
        typeof window.cornerstone.updateImage === 'function') {
      window.cornerstone.updateImage(cornerstoneElement);
    }
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Save current Cornerstone annotations for potential future use
 * and convert them back to VIA format
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 */
function saveCornerstoneAnnotations(cornerstoneElement) {
  try {
    // Check if cornerstone is available
    if (!window.cornerstone || !window.cornerstoneTools) {
      return;
    }

    // Get current image ID
    const currentImageId = _via_current_image_filename;
    if (!currentImageId || !_via_img_metadata[currentImageId]) {
      return;
    }

    // Get current frame index
    const stackState = cornerstoneTools.getToolState(cornerstoneElement, 'stack');
    if (!stackState || !stackState.data || !stackState.data.length) {
      return;
    }
    
    const currentFrame = stackState.data[0].currentImageIdIndex.toString();
    
    // Get existing regions or create empty array
    let regions = _via_img_metadata[currentImageId].regions || [];
    
    // Filter out regions for current frame before adding new ones
    regions = regions.filter(region => {
      // Keep regions that are not for this frame
      return region.frame && region.frame !== currentFrame;
    });
    
    // Get all Cornerstone tool states that contain annotations - use correct tool names with "Tool" suffix
    const toolNames = [
      'RectangleRoi', 
      'CircleRoi', 
      'EllipticalRoi', 
      'FreehandRoi',
      'ArrowAnnotate',
      'Polyline'
    ];
    
    // Collect all annotations
    let cornerstoneAnnotations = [];
    
    toolNames.forEach(toolName => {
      try {
        const toolState = cornerstoneTools.getToolState(cornerstoneElement, toolName);
        if (toolState && toolState.data && toolState.data.length > 0) {
          toolState.data.forEach(data => {
            cornerstoneAnnotations.push({ 
              toolName: toolName, 
              data: data 
            });
          });
        }
      } catch (error) {
        // Silently handle error
      }
    });
    
    // Convert each Cornerstone annotation to VIA format
    cornerstoneAnnotations.forEach(annotation => {
      const viaRegion = cornerstoneToViaRegion(annotation.toolName, annotation.data, currentFrame);
      if (viaRegion) {
        regions.push(viaRegion);
      }
    });
    
    // Update image metadata with new regions
    _via_img_metadata[currentImageId].regions = regions;
    
    // Trigger region data update
    _via_is_region_info_visible = true;
    _via_is_region_id_visible = true;
    _via_reg_ctx.strokeStyle = _via_settings.ui.region_color;
    _via_reg_ctx.lineWidth = _via_settings.ui.region_border_width;
    _via_reg_ctx.font = _via_settings.ui.region_label_font;
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Convert Cornerstone annotation to VIA region format
 * @param {string} toolName - Cornerstone tool name
 * @param {Object} toolData - Cornerstone tool data
 * @param {string} frameId - Current frame ID
 * @returns {Object|null} VIA region or null if conversion failed
 */
function cornerstoneToViaRegion(toolName, toolData, frameId) {
  try {
    // Default structure for a VIA region
    const viaRegion = {
      shape_attributes: {},
      region_attributes: toolData.metadata || {},
      frame: frameId
    };
    
    switch (toolName) {
      case 'RectangleRoi':
        if (toolData.handles && toolData.handles.start && toolData.handles.end) {
          const x = Math.min(toolData.handles.start.x, toolData.handles.end.x);
          const y = Math.min(toolData.handles.start.y, toolData.handles.end.y);
          const width = Math.abs(toolData.handles.start.x - toolData.handles.end.x);
          const height = Math.abs(toolData.handles.start.y - toolData.handles.end.y);
          
          viaRegion.shape_attributes = {
            name: 'rect',
            x: x,
            y: y,
            width: width,
            height: height
          };
          return viaRegion;
        }
        break;
        
      case 'CircleRoi':
        if (toolData.handles && toolData.handles.start && toolData.handles.end) {
          const x1 = toolData.handles.start.x;
          const y1 = toolData.handles.start.y;
          const x2 = toolData.handles.end.x;
          const y2 = toolData.handles.end.y;
          
          // Calculate center and radius
          const cx = (x1 + x2) / 2;
          const cy = y1; // Assuming y coordinates are the same for start/end in CircleRoi
          const r = Math.abs(x2 - x1) / 2;
          
          viaRegion.shape_attributes = {
            name: 'circle',
            cx: cx,
            cy: cy,
            r: r
          };
          return viaRegion;
        }
        break;
        
      case 'EllipticalRoi':
        if (toolData.handles && toolData.handles.start && toolData.handles.end) {
          const x1 = toolData.handles.start.x;
          const y1 = toolData.handles.start.y;
          const x2 = toolData.handles.end.x;
          const y2 = toolData.handles.end.y;
          
          // Calculate center and radii
          const cx = (x1 + x2) / 2;
          
          // For ellipses, we need to account for both horizontal and vertical radii
          const rx = Math.abs(x2 - x1) / 2;
          
          // Calculate ry based on the available handles
          let ry;
          if (toolData.handles.topCenter && toolData.handles.bottomCenter) {
            // If we have top and bottom handles, use them for more accurate ry
            ry = Math.abs(toolData.handles.bottomCenter.y - toolData.handles.topCenter.y) / 2;
            // Calculate cy from top and bottom points for better accuracy
            const cy = (toolData.handles.topCenter.y + toolData.handles.bottomCenter.y) / 2;
            
            viaRegion.shape_attributes = {
              name: 'ellipse',
              cx: cx,
              cy: cy,
              rx: rx,
              ry: ry
            };
          } else {
            // Otherwise calculate from start and end points
            // For EllipticalRoi, the height is determined by y difference between start and end
            const cy = (y1 + y2) / 2;
            ry = Math.abs(y2 - y1) / 2;
            
            // If the ellipse appears flat (ry is very small), use a more reasonable height
            // which is often the case when the ellipse was created with a uniform appearance
            if (ry < rx * 0.1) {
              // Use rx as a reference for a reasonable ry if it appears too flat
              ry = rx * 0.75; // Create a more visually appealing ellipse
            }
            
            viaRegion.shape_attributes = {
              name: 'ellipse',
              cx: cx,
              cy: cy,
              rx: rx,
              ry: ry
            };
          }
          
          return viaRegion;
        }
        break;
        
      case 'FreehandRoi':
      case 'Polyline':
        if (toolData.handles && toolData.handles.points && toolData.handles.points.length > 2) {
          const all_points_x = [];
          const all_points_y = [];
          
          toolData.handles.points.forEach(point => {
            all_points_x.push(point.x);
            all_points_y.push(point.y);
          });
          
          viaRegion.shape_attributes = {
            name: toolName === 'FreehandRoi' ? 'polygon' : 'polyline',
            all_points_x: all_points_x,
            all_points_y: all_points_y
          };
          return viaRegion;
        }
        break;
        
      case 'ArrowAnnotate':
        if (toolData.handles && toolData.handles.end) {
          viaRegion.shape_attributes = {
            name: 'point',
            cx: toolData.handles.end.x,
            cy: toolData.handles.end.y
          };
          return viaRegion;
        }
        break;
        
      default:
        return null;
    }
    
    return null;
  } catch (error) {
    return null;
  }
}

/**
 * Setup synchronization between Cornerstone scroll events and VIA's slider
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 * @param {Object} stack - The Cornerstone stack state
 * @param {Array} imageIds - Array of Cornerstone image IDs
 */
function setupScrollSynchronization(cornerstoneElement, stack, imageIds) {
  const videoSlider = document.getElementById('video-slider');
  const currentFrame = document.getElementById('current-frame');
  
  if (!videoSlider && !currentFrame) {
    return;
  }
  
  // Set max value of slider to match total frames
  if (imageIds && imageIds.length > 0) {
    if (videoSlider) {
      videoSlider.max = imageIds.length - 1;
    }
    if (currentFrame) {
      currentFrame.max = imageIds.length - 1;
    }
  }
  
  // Add an event listener for stack scroll events
  cornerstoneElement.addEventListener('cornerstonestackscroll', function(event) {
    // Get the current stack state
    const stackState = cornerstoneTools.getToolState(cornerstoneElement, 'stack');
    if (stackState && stackState.data && stackState.data.length > 0) {
      const currentStackData = stackState.data[0];
      const currentIndex = currentStackData.currentImageIdIndex;
      
      // Update the slider position
      if (videoSlider && videoSlider.valueAsNumber !== currentIndex) {
        videoSlider.value = currentIndex;
        
        // Trigger change event to ensure any other listeners are notified
        const changeEvent = new Event('change', { bubbles: true });
        videoSlider.dispatchEvent(changeEvent);
      }
      
      // Update the current frame input
      if (currentFrame && currentFrame.valueAsNumber !== currentIndex) {
        currentFrame.value = currentIndex;
        
        // Trigger change event to ensure any other listeners are notified
        const changeEvent = new Event('change', { bubbles: true });
        currentFrame.dispatchEvent(changeEvent);
      }
      
      // Save the current frame index
      saveCurrentCornerstoneImageState(cornerstoneElement);
    }
  });
  
  // Also sync on image rendered event to capture window/level changes
  cornerstoneElement.addEventListener('cornerstoneimagerendered', function(event) {
    // Save window/level settings
    saveCurrentCornerstoneImageState(cornerstoneElement);
    
    // Update slider if needed
    const stackState = cornerstoneTools.getToolState(cornerstoneElement, 'stack');
    if (stackState && stackState.data && stackState.data.length > 0) {
      const currentStackData = stackState.data[0];
      const currentIndex = currentStackData.currentImageIdIndex;
      
      // Update the slider position
      if (videoSlider && videoSlider.valueAsNumber !== currentIndex) {
        videoSlider.value = currentIndex;
        
        // Save window/level settings
        saveCurrentCornerstoneImageState(cornerstoneElement);
      }
      
      // Update the current frame input
      if (currentFrame && currentFrame.valueAsNumber !== currentIndex) {
        currentFrame.value = currentIndex;
        
        // Save window/level settings
        saveCurrentCornerstoneImageState(cornerstoneElement);
      }
    }
  });
}

/**
 * Extract the current Cornerstone image state and save it in _via_current_extra_params
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 */
function saveCurrentCornerstoneImageState(cornerstoneElement) {
  try {
    // Get the cornerstone viewport
    const viewport = cornerstone.getViewport(cornerstoneElement);
    if (!viewport) return;
    
    // Get window width and center
    const windowWidth = viewport.voi.windowWidth;
    const windowCenter = viewport.voi.windowCenter;
    
    // Get current image index
    const stackState = cornerstoneTools.getToolState(cornerstoneElement, 'stack');
    if (!stackState || !stackState.data || !stackState.data.length) return;
    
    const currentIndex = stackState.data[0].currentImageIdIndex;
    
    // Store in _via_current_extra_params
    if (typeof _via_current_extra_params === 'undefined') {
      window._via_current_extra_params = {};
    }
    if (!_via_image_id in _via_current_extra_params) {
         _via_current_extra_params[_via_image_id] = {};
    }
    _via_current_extra_params[_via_image_id]['frame'] = currentIndex;
    _via_current_extra_params[_via_image_id]['window_width'] = windowWidth;
    _via_current_extra_params[_via_image_id]['window_center'] = windowCenter;
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Clean up Cornerstone tools and state when switching modes
 * @param {HTMLElement} element - The cornerstone-enabled element
 */
function cleanupCornerstoneTools(element) {
  if (!window.cornerstone || !window.cornerstoneTools) {
    return;
  }
  
  try {
    // Common tool names to clear state
    const toolNames = [
      'RectangleRoi', 
      'CircleRoi', 
      'EllipticalRoi', 
      'FreehandRoi',
      'ArrowAnnotate',
      'Polyline',
      'Pan',
      'Zoom',
      'StackScrollMouseWheel',
      'Wwwc'
    ];
    
    // Clear tool state for each tool
    toolNames.forEach(toolName => {
      if (typeof window.cornerstoneTools.clearToolState === 'function') {
        try {
          window.cornerstoneTools.clearToolState(element, toolName);
        } catch (error) {
          // Silently handle error
        }
      }
    });
    
    // Ensure default tool is active - use correct tool names with "Tool" suffix
    if (typeof window.cornerstoneTools.setToolActive === 'function') {
      window.cornerstoneTools.setToolActive('Wwwc', { mouseButtonMask: 1 });
      window.cornerstoneTools.setToolActive('StackScrollMouseWheel', {});
    }
    
    // Update the image to reflect changes
    if (typeof window.cornerstone.updateImage === 'function') {
      window.cornerstone.updateImage(element);
    }
  } catch (error) {
    // Silently handle error
  }
}

/**
 * When loading a new image, apply any saved window/level settings
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 * @param {Object} image - The cornerstone image object
 */
function applySavedCornerstoneState(cornerstoneElement, image) {
  try {
    // Check if we have saved Cornerstone settings in _via_current_extra_params
    if (!_via_image_id in _via_current_extra_params) {
        _via_current_extra_params[_via_image_id] = {};
    }
    if (typeof _via_current_extra_params !== 'undefined' && 
        'window_width' in _via_current_extra_params[_via_image_id] && 
        'window_center' in _via_current_extra_params[_via_image_id]) {
      
      const windowWidth = parseFloat(_via_current_extra_params[_via_image_id].window_width);
      const windowCenter = parseFloat(_via_current_extra_params[_via_image_id].window_center);
      
      // Apply the saved window/level
      const viewport = cornerstone.getViewport(cornerstoneElement);
      viewport.voi.windowWidth = windowWidth;
      viewport.voi.windowCenter = windowCenter;
      cornerstone.setViewport(cornerstoneElement, viewport);
    }
    
    // Apply saved frame if available
    if (typeof _via_current_extra_params !== 'undefined' && 
        'frame' in _via_current_extra_params[_via_image_id]) {
      
      const frameIndex = parseInt(_via_current_extra_params[_via_image_id].frame);
      const stackState = cornerstoneTools.getToolState(cornerstoneElement, 'stack');
      
      if (stackState && stackState.data && stackState.data.length > 0) {
        const stackData = stackState.data[0];
        if (frameIndex >= 0 && frameIndex < stackData.imageIds.length) {
          // Navigate to the saved frame
          cornerstone.loadAndCacheImage(stackData.imageIds[frameIndex]).then(img => {
            cornerstone.displayImage(cornerstoneElement, img);
          });
        }
      }
    }
  } catch (error) {
    // Silently handle error
  }
}

// Add this function to the end of _via_buffer.js
function initializeCornerstoneGlobals() {
// Create a global variable to store available tool names for different versions
window._cornerstoneToolNames = {
    initialized: false,
    availableTools: []
};

// Function to scan for available tools and store their names
window.scanCornerstoneTools = function() {
    if (!window.cornerstone || !window.cornerstoneTools) {
    // console.log("Cornerstone libraries not fully loaded yet, will try again later");
    return false;
    }
    
    // console.log("Scanning for available Cornerstone tools...");
    const toolSuffixes = ["", "Tool"];
    
    // Base tool names we're interested in
    const desiredTools = [
    "StackScrollMouseWheel",
    "Wwwc",
    "Pan",
    "Zoom",
    "RectangleRoi",
    "CircleRoi",
    "EllipticalRoi",
    "FreehandRoi",
    "ArrowAnnotate",
    "Polyline"
    ];
    
    window._cornerstoneToolNames.availableTools = [];
    
    for (const toolBase of desiredTools) {
    for (const suffix of toolSuffixes) {
        const fullName = toolBase + suffix;
        if (typeof cornerstoneTools[fullName] === 'function') {
        window._cornerstoneToolNames.availableTools.push({ 
            base: toolBase, 
            full: fullName 
        });
        // console.log(`Found Cornerstone tool: ${fullName}`);
        break; // Found a match for this tool, move to next
        }
    }
    }
    
    if (window._cornerstoneToolNames.availableTools.length > 0) {
    window._cornerstoneToolNames.initialized = true;
    return true;
    }
    
    return false;
};

// Try to scan cornerstone tools and schedule retries if needed
if (!window.scanCornerstoneTools()) {
    // Schedule attempts to scan every second for up to 10 seconds
    let attempts = 0;
    const maxAttempts = 10;
    const interval = setInterval(() => {
    attempts++;
    if (window.scanCornerstoneTools() || attempts >= maxAttempts) {
        clearInterval(interval);
        // console.log(`Cornerstone tools scan ${window._cornerstoneToolNames.initialized ? 'successful' : 'failed'} after ${attempts} attempts`);
    }
    }, 1000);
}
}

// Execute this function when the page loads
if (typeof window !== 'undefined') {
window.addEventListener('load', initializeCornerstoneGlobals);
}

/**
 * Safely initialize a FreehandRoi tool on a cornerstone element to prevent errors
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element
 */
function safelyInitializeFreehandRoi(cornerstoneElement) {
  if (!window.cornerstone || !window.cornerstoneTools) {
    return;
  }

  try {
    // Get all FreehandRoi annotations
    const toolState = cornerstoneTools.getToolState(cornerstoneElement, 'FreehandRoi');
    if (!toolState || !toolState.data || !toolState.data.length) {
      // No FreehandRoi annotations, nothing to fix
      return;
    }

    // For each FreehandRoi annotation, ensure its data structure is correct
    toolState.data.forEach(data => {
      // Fix any missing properties
      data.closed = data.closed !== undefined ? data.closed : true;
      data.count = data.handles.points.length;
      data.seriesInstanceUid = data.seriesInstanceUid || '';
      data.invalidated = true;
      
      // Fix points and lines connections
      if (data.handles && data.handles.points && data.handles.points.length > 0) {
        // Make sure each point has a lines array
        data.handles.points.forEach(point => {
          if (!point.lines) {
            point.lines = [];
          }
        });
        
        // Clear all existing lines and recreate them
        for (let i = 0; i < data.handles.points.length; i++) {
          data.handles.points[i].lines = [];
          
          // Connect points with lines
          if (data.closed) {
            // For closed shapes, connect each point to the next (and last to first)
            const nextIndex = (i + 1) % data.handles.points.length;
            
            // Add line to next point
            data.handles.points[i].lines.push({
              start: data.handles.points[i],
              end: data.handles.points[nextIndex]
            });
          } else if (i < data.handles.points.length - 1) {
            // For open shapes, connect each point to the next (except last point)
            data.handles.points[i].lines.push({
              start: data.handles.points[i],
              end: data.handles.points[i + 1]
            });
          }
        }
        
        // Ensure the polygon has a bounding box
        if (!data.polyBoundingBox) {
          data.polyBoundingBox = calculatePolyBoundingBox(data.handles.points);
        }
      }
    });
    
    // Force image update to apply changes
    cornerstone.updateImage(cornerstoneElement);
    
    // console.log('Successfully initialized FreehandRoi tool data structures');
  } catch (error) {
    // Silently handle error
  }
}

/**
 * Add event listeners to fix common FreehandRoi errors
 * @param {HTMLElement} cornerstoneElement - The cornerstone-enabled element 
 */
function addFreehandRoiErrorHandlers(cornerstoneElement) {
  try {
    // Add error handlers for freehand ROI tool
    cornerstoneElement.addEventListener('cornerstonetoolsmeasurementcomplete', function(evt) {
      if (evt.detail.toolName === 'FreehandRoi') {
        // Handle completion
      }
    });
  } catch (error) {
    // Silently handle error
  }
}

function sendCornerstonePixelData(cornerstoneElement) {
  try {
    // Get the cornerstone image object
    const enabledElement = cornerstone.getEnabledElement(cornerstoneElement);
    if (!enabledElement || !enabledElement.image) {
      return;
    }

    // Get the raw pixel data
    const image = enabledElement.image;
    const pixelData = image.getPixelData();
    const windowWidth = enabledElement.viewport.voi.windowWidth;
    const windowCenter = enabledElement.viewport.voi.windowCenter;

    // Get image metadata
    const metadata = {
      width: image.width,
      height: image.height,
      slope: image.slope,
      intercept: image.intercept,
      windowWidth: windowWidth,
      windowCenter: windowCenter,
      min: image.minPixelValue,
      max: image.maxPixelValue
    };

    // Send to backend
    fetch('/debug/cornerstone_data', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        metadata: metadata,
        pixelData: Array.from(pixelData),
        windowWidth: windowWidth,
        windowCenter: windowCenter
      })
    });
  } catch (error) {
    // Silently handle error
  }
}
