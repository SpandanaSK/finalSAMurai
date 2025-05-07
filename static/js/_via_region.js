
function _via_region( shape, id, data_img_space, view_scale_factor, view_offset_x, view_offset_y) {
    // Note the following terminology:
    //   view space  :
    //     - corresponds to the x-y plane on which the scaled version of original image is shown to the user
    //     - all the region query operations like is_inside(), is_on_edge(), etc are performed in view space
    //     - all svg draw operations like get_svg() are also in view space
    //
    //   image space :
    //     - corresponds to the x-y plane which corresponds to the spatial space of the original image
    //     - region save, export, git push operations are performed in image space
    //     - to avoid any rounding issues (caused by floating scale factor),
    //        * user drawn regions in view space is first converted to image space
    //        * this region in image space is now used to initialize region in view space
    //
    //   The two spaces are related by _via_model.now.tform.scale which is computed by the method
    //     _via_ctrl.compute_view_panel_to_nowfile_tform()
    //   and applied as follows:
    //     x coordinate in image space = scale_factor * x coordinate in view space
    //
    // shape : {rect, circle, ellipse, line, polyline, polygon, point}
    // id    : unique region-id
    // d[]   : (in view space) data whose meaning depend on region shape as follows:
    //        rect     : d[x1,y1,x2,y2] or d[corner1_x, corner1_y, corner2_x, corner2_y]
    //        circle   : d[x1,y1,x2,y2] or d[center_x, center_y, circumference_x, circumference_y]
    //        ellipse  : d[x1,y1,x2,y2,transform]
    //        line     : d[x1,y1,x2,y2]
    //        polyline : d[x1,y1,...,xn,yn]
    //        polygon  : d[x1,y1,...,xn,yn]
    //        point    : d[cx,cy]
    // scale_factor : for conversion from view space to image space
    //
    // Note: no svg data are stored with prefix "_". For example: _scale_factor, _x2
    this.shape  = shape;
    this.id     = id;
    this.scale_factor     = view_scale_factor;
    this.offset_x         = view_offset_x;
    this.offset_y         = view_offset_y;
    this.recompute_svg    = false;
    this.attributes  = {};
  
    var n = data_img_space.length;
    var i;
    this.dview  = new Array(n);
    this.dimg   = new Array(n);
  
    if ( n !== 0 ) {
      // IMPORTANT:
      // to avoid any rounding issues (caused by floating scale factor), we stick to
      // the principal that image space coordinates are the ground truth for every region.
      // Hence, we proceed as:
      //   * user drawn regions in view space is first converted to image space
      //   * this region in image space is now used to initialize region in view space
      for ( i = 0; i < n; i++ ) {
        this.dimg[i]  = data_img_space[i];
  
        var offset = this.offset_x;
        if ( i % 2 !== 0 ) {
          // y coordinate
          offset = this.offset_y;
        }
        this.dview[i] = Math.round( this.dimg[i] * this.scale_factor ) + offset;
      }
    }
  
    // set svg attributes for each shape
    switch( this.shape ) {
    case "rect":
      _via_region_rect.call( this );
      this.svg_attributes = ['x', 'y', 'width', 'height'];
      break;
    case "box_prompt":
      _via_region_rect.call( this );
      this.svg_attributes = ['x', 'y', 'width', 'height'];
      break;
    case "gdino_box":
      _via_region_rect.call( this );
      this.svg_attributes = ['x', 'y', 'width', 'height'];
      break;
    case "img_crop_prompt":
      _via_region_rect.call( this );
      this.svg_attributes = ['x', 'y', 'width', 'height'];
      break;
    case "circle":
      _via_region_circle.call( this );
      this.svg_attributes = ['cx', 'cy', 'r'];
      break;
    case "ellipse":
      _via_region_ellipse.call( this );
      this.svg_attributes = ['cx', 'cy', 'rx', 'ry','transform'];
      break;
    case "line":
      _via_region_line.call( this );
      this.svg_attributes = ['x1', 'y1', 'x2', 'y2'];
      break;
    case "polyline":
      _via_region_polyline.call( this );
      this.svg_attributes = ['points'];
      break;
    case "polygon":
      _via_region_polygon.call( this );
      this.svg_attributes = ['points'];
      break;
    case "point":
      _via_region_point.call( this );
      // point is a special circle with minimal radius required for visualization
      this.shape = 'circle';
      this.svg_attributes = ['cx', 'cy', 'r'];
      break;
    case "positive_point":
      _via_region_point.call( this );
      // point is a special circle with minimal radius required for visualization
      this.shape = 'circle';
      this.svg_attributes = ['cx', 'cy', 'r'];
      break;
    case "negative_point":
      _via_region_point.call( this );
      // point is a special circle with minimal radius required for visualization
      this.shape = 'circle';
      this.svg_attributes = ['cx', 'cy', 'r'];
      break;
    }
  
    this.initialize();
  }
  
  
  _via_region.prototype.prepare_svg_element = function() {
    var _VIA_SVG_NS = "http://www.w3.org/2000/svg";
    this.svg_element = document.createElementNS(_VIA_SVG_NS, this.shape);
    console.log('svg_element', this.shape)
    this.svg_string  = '<' + this.shape;
    this.svg_element.setAttributeNS(null, 'id', this.id);
  
    var n = this.svg_attributes.length;
    for ( var i = 0; i < n; i++ ) {
      this.svg_element.setAttributeNS(null, this.svg_attributes[i], this[this.svg_attributes[i]]);
      this.svg_string += ' ' + this.svg_attributes[i] + '="' + this[this.svg_attributes[i]] + '"';
    }
    this.svg_string  += '/>';
  }
  
  _via_region.prototype.get_svg_element = function() {
    if ( this.recompute_svg ) {
      this.prepare_svg_element();
      this.recompute_svg = false;
    }
    return this.svg_element;
  }
  
  _via_region.prototype.get_svg_string = function() {
    if ( this.recompute_svg ) {
      this.prepare_svg_element();
      this.recompute_svg = false;
    }
    return this.svg_string;
  }
  
  ///
  /// Region shape : rectangle
  ///
  function _via_region_rect() {
    this.is_inside  = _via_region_rect.prototype.is_inside;
    this.is_on_edge = _via_region_rect.prototype.is_on_edge;
    this.move  = _via_region_rect.prototype.move;
    this.resize  = _via_region_rect.prototype.resize;
    this.initialize = _via_region_rect.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_rect.prototype.dist_to_nearest_edge;
  }
  
  _via_region_rect.prototype.initialize = function() {
    // ensure that this.(x,y) corresponds to top-left corner of rectangle
    // Note: this.(x2,y2) is defined for convenience in calculations
    if ( this.dview[0] < this.dview[2] ) {
      this.x  = this.dview[0];
      this.x2 = this.dview[2];
    } else {
      this.x  = this.dview[2];
      this.x2 = this.dview[0];
    }
    if ( this.dview[1] < this.dview[3] ) {
      this.y  = this.dview[1];
      this.y2 = this.dview[3];
    } else {
      this.y  = this.dview[3];
      this.y2 = this.dview[1];
    }
    this.width  = this.x2 - this.x;
    this.height = this.y2 - this.y;
    this.recompute_svg = true;
  }
  
  ///
  /// Region shape : circle
  ///
  function _via_region_circle() {
    this.is_inside  = _via_region_circle.prototype.is_inside;
    this.is_on_edge = _via_region_circle.prototype.is_on_edge;
    this.move       = _via_region_circle.prototype.move;
    this.resize     = _via_region_circle.prototype.resize;
    this.initialize = _via_region_circle.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_circle.prototype.dist_to_nearest_edge;
  }
  
  _via_region_circle.prototype.initialize = function() {
    this.cx = this.dview[0];
    this.cy = this.dview[1];
    var dx = this.dview[2] - this.dview[0];
    var dy = this.dview[3] - this.dview[1];
    this.r  = Math.round( Math.sqrt(dx * dx + dy * dy) );
    this.r2 = this.r * this.r;
    this.recompute_svg = true;
  }
  
  
  ///
  /// Region shape : ellipse
  ///
  function _via_region_ellipse() {
    this.is_inside  = _via_region_ellipse.prototype.is_inside;
    this.is_on_edge = _via_region_ellipse.prototype.is_on_edge;
    this.move  = _via_region_ellipse.prototype.move;
    this.resize  = _via_region_ellipse.prototype.resize;
    this.initialize = _via_region_ellipse.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_ellipse.prototype.dist_to_nearest_edge;
  }
  
  _via_region_ellipse.prototype.initialize = function() {
    this.cx = this.dview[0];
    this.cy = this.dview[1];
    this.rx = Math.abs(this.dview[2] - this.dview[0]);
    this.ry = Math.abs(this.dview[3] - this.dview[1]);
  
    this.inv_rx2 = 1 / (this.rx * this.rx);
    this.inv_ry2 = 1 / (this.ry * this.ry);
  
    this.recompute_svg = true;
  }
  
  
  
  ///
  /// Region shape : line
  ///
  function _via_region_line() {
    this.is_inside  = _via_region_line.prototype.is_inside;
    this.is_on_edge = _via_region_line.prototype.is_on_edge;
    this.move  = _via_region_line.prototype.move;
    this.resize  = _via_region_line.prototype.resize;
    this.initialize = _via_region_line.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_line.prototype.dist_to_nearest_edge;
  }
  
  _via_region_line.prototype.initialize = function() {
    this.x1 = this.dview[0];
    this.y1 = this.dview[1];
    this.x2 = this.dview[2];
    this.y2 = this.dview[3];
    this.dx = this.x1 - this.x2;
    this.dy = this.y1 - this.y2;
    this.mconst = (this.x1 * this.y2) - (this.x2 * this.y1);
  
    this.recompute_svg = true;
  }
  
  
  ///
  /// Region shape : polyline
  ///
  function _via_region_polyline() {
    this.is_inside  = _via_region_polyline.prototype.is_inside;
    this.is_on_edge = _via_region_polyline.prototype.is_on_edge;
    this.move  = _via_region_polyline.prototype.move;
    this.resize  = _via_region_polyline.prototype.resize;
    this.initialize = _via_region_polyline.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_polyline.prototype.dist_to_nearest_edge;
  }
  
  _via_region_polyline.prototype.initialize = function() {
    var n = this.dview.length;
    var points = new Array(n/2);
    var points_index = 0;
    for ( var i = 0; i < n; i += 2 ) {
      points[points_index] = ( this.dview[i] + ' ' + this.dview[i+1] );
      points_index++;
    }
    this.points = points.join(',');
    this.recompute_svg = true;
  }
  
  
  ///
  /// Region shape : polygon
  ///
  function _via_region_polygon() {
    this.is_inside  = _via_region_polygon.prototype.is_inside;
    this.is_on_edge = _via_region_polygon.prototype.is_on_edge;
    this.move  = _via_region_polygon.prototype.move;
    this.resize  = _via_region_polygon.prototype.resize;
    this.initialize = _via_region_polygon.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_polygon.prototype.dist_to_nearest_edge;
  }
  
  _via_region_polygon.prototype.initialize = function() {
    var n = this.dview.length;
    var points = new Array(n/2);
    var points_index = 0;
    for ( var i = 0; i < n; i += 2 ) {
      points[points_index] = ( this.dview[i] + ' ' + this.dview[i+1] );
      points_index++;
    }
    this.points = points.join(',');
    this.recompute_svg = true;
  }
  
  
  ///
  /// Region shape : point
  ///
  function _via_region_point() {
    this.is_inside  = _via_region_point.prototype.is_inside;
    this.is_on_edge = _via_region_point.prototype.is_on_edge;
    this.move  = _via_region_point.prototype.move;
    this.resize  = _via_region_point.prototype.resize
    this.initialize  = _via_region_point.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_point.prototype.dist_to_nearest_edge;
  }
  
  _via_region_point.prototype.initialize = function() {
    this.cx = this.dview[0];
    this.cy = this.dview[1];
    this.r  = 2;
    this.r2 = this.r * this.r;
    this.recompute_svg = true;
  }
  
  
  ///
  /// Region shape : add point
  ///
  function _via_region_positive_point() {
    this.is_inside  = _via_region_positive_point.prototype.is_inside;
    this.is_on_edge = _via_region_positive_point.prototype.is_on_edge;
    this.move  = _via_region_positive_point.prototype.move;
    this.resize  = _via_region_positive_point.prototype.resize
    this.initialize  = _via_region_positive_point.prototype.initialize;
    this.dist_to_nearest_edge = _via_region_positive_point.prototype.dist_to_nearest_edge
  }
  
  _via_region_point.prototype.initialize = function() {
    this.cx = this.dview[0];
    this.cy = this.dview[1];
    this.r  = 2;
    this.r2 = this.r * this.r;
    this.recompute_svg = true;
  }
  