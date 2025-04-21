//
// Region collision routines
//
function is_inside_region(px, py, descending_order) {
  var N = _via_canvas_regions.length;
  if ( N === 0 ) {
    return -1;
  }
  var start, end, del;
  // traverse the canvas regions in alternating ascending
  // and descending order to solve the issue of nested regions
  if ( descending_order ) {
    start = N - 1;
    end   = -1;
    del   = -1;
  } else {
    start = 0;
    end   = N;
    del   = 1;
  }

  var i = start;
  while ( i !== end ) {
    var yes = is_inside_this_region(px, py, i);
    if (yes) {
      return i;
    }
    i = i + del;
  }
  return -1;
}

function is_inside_regions(px, py) {
  var N = _via_canvas_regions.length;
  if ( N === 0 ) {
    return -1;
  }
  var start, end, del;
  var regions = [];
  // traverse the canvas regions in alternating ascending
  // and descending order to solve the issue of nested regions
  
  start = 0;
  end   = N;
  del   = 1;

  var i = start;
  while ( i !== end ) {
    var yes = is_inside_this_region(px, py, i);
    if (yes) {
      regions = regions.concat(regions, i);
    }
    i = i + del;
  }
  return regions;
}

function is_inside_this_region(px, py, region_id) {
  if (region_id < 0) {
    return false
  }
  var attr   = _via_canvas_regions[region_id].shape_attributes;
  var reg_attr = _via_canvas_regions[region_id].region_attributes;
  var result = false;
  var current_frame = document.getElementById('current-frame').value
  if (_via_canvas_regions[region_id].frame != current_frame) {
    return false;
  }
  switch ( attr['name'] ) {
  case VIA_REGION_SHAPE.RECT:
    result = is_inside_rect(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            px, py);
    break;
  case VIA_REGION_SHAPE.BOX_PROMPT:
    result = is_inside_rect(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            px, py);
    break;

  case VIA_REGION_SHAPE.IMG_CROP_PROMPT:
    result = is_inside_rect(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            px, py);
    break;
  
  case VIA_REGION_SHAPE.CIRCLE:
    result = is_inside_circle(attr['cx'],
                              attr['cy'],
                              attr['r'],
                              px, py);
    break;

  case VIA_REGION_SHAPE.ELLIPSE:
    result = is_inside_ellipse(attr['cx'],
                                attr['cy'],
                                attr['rx'],
                                attr['ry'],
                                attr['theta'],
                                px, py);
    break;

  case VIA_REGION_SHAPE.POLYLINE: // handled by POLYGON
  case VIA_REGION_SHAPE.POLYGON:
    result = is_inside_polygon(attr['all_points_x'],
                                attr['all_points_y'],
                                px, py, reg_attr
                                );
    break;

  case VIA_REGION_SHAPE.POINT:
    result = is_inside_point(attr['cx'],
                              attr['cy'],
                              px, py);
    break;

  case VIA_REGION_SHAPE.POSITIVE_POINT:
    result = is_inside_point(attr['cx'],
                              attr['cy'],
                              px, py);
    break;
  
  case VIA_REGION_SHAPE.NEGATIVE_POINT:
    result = is_inside_point(attr['cx'],
                              attr['cy'],
                              px, py);
    break;
  }
  return result;
}

function is_inside_circle(cx, cy, r, px, py) {
  var dx = px - cx;
  var dy = py - cy;
  return (dx * dx + dy * dy) < r * r;
}

function is_inside_rect(x, y, w, h, px, py) {
  return px > x &&
    px < (x + w) &&
    py > y &&
    py < (y + h);
}

function is_inside_ellipse(cx, cy, rx, ry, rr, px, py) {
  // Inverse rotation of pixel coordinates
  var dx = Math.cos(-rr) * (cx - px) - Math.sin(-rr) * (cy - py)
  var dy = Math.sin(-rr) * (cx - px) + Math.cos(-rr) * (cy - py)

  return ((dx * dx) / (rx * rx)) + ((dy * dy) / (ry * ry)) < 1;
}

// returns 0 when (px,py) is outside the polygon
// source: http://geomalgorithms.com/a03-_inclusion.html
function is_inside_polygon(all_points_x, all_points_y, px, py, reg_attr){
  if ( all_points_x.length === 0 || all_points_y.length === 0 ) {
    return 0;
  }

  var wn = 0;    // the  winding number counter
  var n = all_points_x.length;
  var i;
  // loop through all edges of the polygon
  for ( i = 0; i < n-1; ++i ) {   // edge from V[i] to  V[i+1]
    var is_left_value = is_left( all_points_x[i], all_points_y[i],
                                  all_points_x[i+1], all_points_y[i+1],
                                  px, py);

    if (all_points_y[i] <= py) {
      if (all_points_y[i+1]  > py && is_left_value > 0) {
        ++wn;
      }
    }
    else {
      if (all_points_y[i+1]  <= py && is_left_value < 0) {
        --wn;
      }
    }
  }

  // also take into account the loop closing edge that connects last point with first point
  var is_left_value = is_left( all_points_x[n-1], all_points_y[n-1],
                                all_points_x[0], all_points_y[0],
                                px, py);

  if (all_points_y[n-1] <= py) {
    if (all_points_y[0]  > py && is_left_value > 0) {
      ++wn;
    }
  }
  else {
    if (all_points_y[0]  <= py && is_left_value < 0) {
      --wn;
    }
  }

  if ( wn === 0 ) {
    return 0;
  }
  else {
    return 1;
  }
}

function is_inside_point(cx, cy, px, py) {
  var dx = px - cx;
  var dy = py - cy;
  var r2 = VIA_POLYGON_VERTEX_MATCH_TOL * VIA_POLYGON_VERTEX_MATCH_TOL;
  return (dx * dx + dy * dy) < r2;
}

// returns
// >0 if (x2,y2) lies on the left side of line joining (x0,y0) and (x1,y1)
// =0 if (x2,y2) lies on the line joining (x0,y0) and (x1,y1)
// >0 if (x2,y2) lies on the right side of line joining (x0,y0) and (x1,y1)
// source: http://geomalgorithms.com/a03-_inclusion.html
function is_left(x0, y0, x1, y1, x2, y2) {
  return ( ((x1 - x0) * (y2 - y0))  - ((x2 -  x0) * (y1 - y0)) );
}

function is_on_region_corner(px, py) {
  var _via_region_edge = [-1, -1]; // region_id, corner_id [top-left=1,top-right=2,bottom-right=3,bottom-left=4]
  var current_frame = document.getElementById('current-frame').value
  for ( var i = 0; i < _via_canvas_regions.length; ++i ) {
    var attr = _via_canvas_regions[i].shape_attributes;
    if (_via_canvas_regions[i].frame != current_frame) {
      continue
    }
    var result = false;
    _via_region_edge[0] = i;

    switch ( attr['name'] ) {
    case VIA_REGION_SHAPE.RECT:
      result = is_on_rect_edge(attr['x'],
                                attr['y'],
                                attr['width'],
                                attr['height'],
                                px, py);
      break;
    
    case VIA_REGION_SHAPE.BOX_PROMPT:
      result = is_on_rect_edge(attr['x'],
                                attr['y'],
                                attr['width'],
                                attr['height'],
                                px, py);
      break;

    case VIA_REGION_SHAPE.IMG_CROP_PROMPT:
      result = is_on_rect_edge(attr['x'],
                                attr['y'],
                                attr['width'],
                                attr['height'],
                                px, py);
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      result = is_on_circle_edge(attr['cx'],
                                  attr['cy'],
                                  attr['r'],
                                  px, py);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      result = is_on_ellipse_edge(attr['cx'],
                                  attr['cy'],
                                  attr['rx'],
                                  attr['ry'],
                                  attr['theta'],
                                  px, py);
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      result = is_on_polygon_vertex(attr['all_points_x'],
                                    attr['all_points_y'],
                                    px, py);
      if ( result === 0 ) {
        result = is_on_polygon_edge(attr['all_points_x'],
                                    attr['all_points_y'],
                                    px, py);
      }
      break;

    case VIA_REGION_SHAPE.POINT:
      // since there are no edges of a point
      result = 0;
      break;
    
    case VIA_REGION_SHAPE.POSITIVE_POINT:
      // since there are no edges of a point
      result = 0;
      break;
      
    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      // since there are no edges of a point
      result = 0;
      break;
    }

    if (result > 0) {
      _via_region_edge[1] = result;
      return _via_region_edge;
    }
  }
  _via_region_edge[0] = -1;
  return _via_region_edge;
}

function is_on_rect_edge(x, y, w, h, px, py) {
  var dx0 = Math.abs(x - px);
  var dy0 = Math.abs(y - py);
  var dx1 = Math.abs(x + w - px);
  var dy1 = Math.abs(y + h - py);
  //[top-left=1,top-right=2,bottom-right=3,bottom-left=4]
  if ( dx0 < VIA_REGION_EDGE_TOL &&
        dy0 < VIA_REGION_EDGE_TOL ) {
    return 1;
  }
  if ( dx1 < VIA_REGION_EDGE_TOL &&
        dy0 < VIA_REGION_EDGE_TOL ) {
    return 2;
  }
  if ( dx1 < VIA_REGION_EDGE_TOL &&
        dy1 < VIA_REGION_EDGE_TOL ) {
    return 3;
  }

  if ( dx0 < VIA_REGION_EDGE_TOL &&
        dy1 < VIA_REGION_EDGE_TOL ) {
    return 4;
  }

  var mx0 = Math.abs(x + w/2 - px);
  var my0 = Math.abs(y + h/2 - py);
  //[top-middle=5,right-middle=6,bottom-middle=7,left-middle=8]
  if ( mx0 < VIA_REGION_EDGE_TOL &&
        dy0 < VIA_REGION_EDGE_TOL ) {
    return 5;
  }
  if ( dx1 < VIA_REGION_EDGE_TOL &&
        my0 < VIA_REGION_EDGE_TOL ) {
    return 6;
  }
  if ( mx0 < VIA_REGION_EDGE_TOL &&
        dy1 < VIA_REGION_EDGE_TOL ) {
    return 7;
  }
  if ( dx0 < VIA_REGION_EDGE_TOL &&
        my0 < VIA_REGION_EDGE_TOL ) {
    return 8;
  }

  return 0;
}

function is_on_circle_edge(cx, cy, r, px, py) {
  var dx = cx - px;
  var dy = cy - py;
  if ( Math.abs(Math.sqrt( dx*dx + dy*dy ) - r) < VIA_REGION_EDGE_TOL ) {
    var theta = Math.atan2( py - cy, px - cx );
    if ( Math.abs(theta - (Math.PI/2)) < VIA_THETA_TOL ||
          Math.abs(theta + (Math.PI/2)) < VIA_THETA_TOL) {
      return 5;
    }
    if ( Math.abs(theta) < VIA_THETA_TOL ||
          Math.abs(Math.abs(theta) - Math.PI) < VIA_THETA_TOL) {
      return 6;
    }

    if ( theta > 0 && theta < (Math.PI/2) ) {
      return 1;
    }
    if ( theta > (Math.PI/2) && theta < (Math.PI) ) {
      return 4;
    }
    if ( theta < 0 && theta > -(Math.PI/2) ) {
      return 2;
    }
    if ( theta < -(Math.PI/2) && theta > -Math.PI ) {
      return 3;
    }
  } else {
    return 0;
  }
}

function is_on_ellipse_edge(cx, cy, rx, ry, rr, px, py) {
  // Inverse rotation of pixel coordinates
  px = px - cx;
  py = py - cy;
  var px_ = Math.cos(-rr) * px - Math.sin(-rr) * py;
  var py_ = Math.sin(-rr) * px + Math.cos(-rr) * py;
  px = px_ + cx;
  py = py_ + cy;

  var dx = (cx - px)/rx;
  var dy = (cy - py)/ry;

  if ( Math.abs(Math.sqrt( dx*dx + dy*dy ) - 1) < VIA_ELLIPSE_EDGE_TOL ) {
    var theta = Math.atan2( py - cy, px - cx );
    if ( Math.abs(theta - (Math.PI/2)) < VIA_THETA_TOL ||
          Math.abs(theta + (Math.PI/2)) < VIA_THETA_TOL) {
      return 5;
    }
    if ( Math.abs(theta) < VIA_THETA_TOL ||
          Math.abs(Math.abs(theta) - Math.PI) < VIA_THETA_TOL) {
      return 6;
    }
  } else {
    return 0;
  }
}

function is_on_polygon_vertex(all_points_x, all_points_y, px, py) {
  var i, n;
  n = all_points_x.length;

  for ( i = 0; i < n; ++i ) {
    if ( Math.abs(all_points_x[i] - px) < VIA_POLYGON_VERTEX_MATCH_TOL &&
          Math.abs(all_points_y[i] - py) < VIA_POLYGON_VERTEX_MATCH_TOL ) {
      return (VIA_POLYGON_RESIZE_VERTEX_OFFSET+i);
    }
  }
  return 0;
}

function is_on_polygon_edge(all_points_x, all_points_y, px, py) {
  var i, n, di, d;
  n = all_points_x.length;
  d = [];
  for ( i = 0; i < n - 1; ++i )  {
    di = dist_to_line(px, py, all_points_x[i], all_points_y[i], all_points_x[i+1], all_points_y[i+1]);
    d.push(di);
  }
  // closing edge
  di = dist_to_line(px, py, all_points_x[n-1], all_points_y[n-1], all_points_x[0], all_points_y[0]);
  d.push(di);

  var smallest_value = d[0];
  var smallest_index = 0;
  n = d.length;
  for ( i = 1; i < n; ++i ) {
    if ( d[i] < smallest_value ) {
      smallest_value = d[i];
      smallest_index = i;
    }
  }
  if ( smallest_value < VIA_POLYGON_VERTEX_MATCH_TOL ) {
    return (VIA_POLYGON_RESIZE_VERTEX_OFFSET + smallest_index);
  } else {
    return 0;
  }
}

function is_point_inside_bounding_box(x, y, x1, y1, x2, y2) {
  // ensure that (x1,y1) is top left and (x2,y2) is bottom right corner of rectangle
  var rect = {};
  if( x1 < x2 ) {
    rect.x1 = x1;
    rect.x2 = x2;
  } else {
    rect.x1 = x2;
    rect.x2 = x1;
  }
  if ( y1 < y2 ) {
    rect.y1 = y1;
    rect.y2 = y2;
  } else {
    rect.y1 = y2;
    rect.y2 = y1;
  }

  if ( x >= rect.x1 && x <= rect.x2 && y >= rect.y1 && y <= rect.y2 ) {
    return true;
  } else {
    return false;
  }
}
