//
// Canvas update routines
//
function _via_redraw_reg_canvas() {
  if (_via_current_image_loaded) {
    _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    var ai_prompts = getCurrentImagePrompts()
    var box_prompts, point_prompts, mask_prompts;
    box_prompts = ai_prompts['box_prompts'][2]
    point_prompts = ai_prompts['point_prompts'][2]
    mask_prompts = ai_prompts['mask_prompts'][2]
    var total_prompts = box_prompts.length + point_prompts.length + mask_prompts.length
    var ai_masks = getCurrentSAMPolygons()
    var x = document.getElementById('prompt-toolbar')
    if (total_prompts+ai_masks.length > 0) {
      x.style = "height: 3.5 rem; margin-bottom: 10px; align-items: center; display: flex;"
    }
    else {
      x.style = "display: none"
    }
    
    if ( _via_canvas_regions.length > 0 ) {
      if (_via_is_region_boundary_visible) {
        draw_all_regions();
      }
      if (_via_is_region_id_visible) {
        draw_all_region_id();
      }
    }
  }
}

function _via_clear_reg_canvas() {
  _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
  var x = document.getElementById('prompt-toolbar')
  x.style = "display: none"
}


function draw_region(i) {
  var aid = _via_settings.ui.image.region_color;
  var attr, is_selected, aid, avalue;
  var current_frame = document.getElementById('current-frame').value

  if (_via_canvas_regions[i].frame != current_frame) {
    return
  }
  
  attr = _via_canvas_regions[i].shape_attributes;
  is_selected = _via_region_selected_flag[i];

  // region stroke style may depend on attribute value
  _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_FILL_COLOR;
  if ( ! _via_is_user_drawing_polygon &&
        aid !== '__via_default_region_color__' ) {
    avalue = _via_img_metadata[_via_image_id].regions[i].region_attributes[aid];
    if ( _via_canvas_regions_group_color.hasOwnProperty(avalue) ) {
      _via_reg_ctx.strokeStyle = _via_canvas_regions_group_color[avalue];
    }
  }

  switch( attr['name'] ) {
  case VIA_REGION_SHAPE.RECT:
    _via_draw_rect_region(attr['x'],
                          attr['y'],
                          attr['width'],
                          attr['height'],
                          is_selected);
    break;

  case VIA_REGION_SHAPE.BOX_PROMPT:
    _via_draw_box_prompt_region(attr['x'],
                          attr['y'],
                          attr['width'],
                          attr['height'],
                          is_selected);
    break;

  case VIA_REGION_SHAPE.CIRCLE:
    _via_draw_circle_region(attr['cx'],
                            attr['cy'],
                            attr['r'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.ELLIPSE:
    if (typeof(attr['theta']) === 'undefined') { attr['theta'] = 0; }
    _via_draw_ellipse_region(attr['cx'],
                              attr['cy'],
                              attr['rx'],
                              attr['ry'],
                              attr['theta'],
                              is_selected);
    break;

  case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
  case VIA_REGION_SHAPE.POLYGON:
    _via_draw_polygon_region(attr['all_points_x'],
                              attr['all_points_y'],
                              is_selected,
                              attr['name']);
    break;

  case VIA_REGION_SHAPE.POINT:
    _via_draw_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.POSITIVE_POINT:
    _via_draw_positive_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.NEGATIVE_POINT:
    _via_draw_negative_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;
  }
}

function draw_all_regions() {
  var aid = _via_settings.ui.image.region_color;
  var attr, is_selected, aid, avalue;
  var current_frame = document.getElementById('current-frame').value
  for (var i=0; i < _via_canvas_regions.length; ++i) {
    attr = _via_canvas_regions[i].shape_attributes;
    is_selected = _via_region_selected_flag[i];
    if (_via_canvas_regions[i].frame != current_frame) {
      continue
    }
    // region stroke style may depend on attribute value
    _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_FILL_COLOR;
    if ( ! _via_is_user_drawing_polygon &&
          aid !== '__via_default_region_color__' ) {
      avalue = _via_img_metadata[_via_image_id].regions[i].region_attributes[aid];
      if ( _via_canvas_regions_group_color.hasOwnProperty(avalue) ) {
        _via_reg_ctx.strokeStyle = _via_canvas_regions_group_color[avalue];
      }
    }

    switch( attr['name'] ) {
    case VIA_REGION_SHAPE.RECT:
      _via_draw_rect_region(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            is_selected);
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      _via_draw_box_prompt_region(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            is_selected);
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      _via_draw_circle_region(attr['cx'],
                              attr['cy'],
                              attr['r'],
                              is_selected);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      if (typeof(attr['theta']) === 'undefined') { attr['theta'] = 0; }
      _via_draw_ellipse_region(attr['cx'],
                                attr['cy'],
                                attr['rx'],
                                attr['ry'],
                                attr['theta'],
                                is_selected);
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      _via_draw_polygon_region(attr['all_points_x'],
                                attr['all_points_y'],
                                is_selected,
                                attr['name']);
      break;

    case VIA_REGION_SHAPE.POINT:
      _via_draw_point_region(attr['cx'],
                              attr['cy'],
                              is_selected);
      break;

    case VIA_REGION_SHAPE.POSITIVE_POINT:
      _via_draw_positive_point_region(attr['cx'],
                              attr['cy'],
                              is_selected);
      break;

    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      _via_draw_negative_point_region(attr['cx'],
                              attr['cy'],
                              is_selected);
      break;
    }
  }
}

// control point for resize of region boundaries
function _via_draw_control_point(cx, cy) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, VIA_REGION_SHAPES_POINTS_RADIUS, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();

  _via_reg_ctx.fillStyle = VIA_THEME_CONTROL_POINT_COLOR;
  _via_reg_ctx.globalAlpha = 1.0;
  _via_reg_ctx.fill();
}

function _via_draw_rect_region(x, y, w, h, is_selected) {
  if (is_selected) {
    _via_draw_rect(x, y, w, h);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(x  ,   y);
    _via_draw_control_point(x+w, y+h);
    _via_draw_control_point(x  , y+h);
    _via_draw_control_point(x+w,   y);
    _via_draw_control_point(x+w/2,   y);
    _via_draw_control_point(x+w/2, y+h);
    _via_draw_control_point(x    , y+h/2);
    _via_draw_control_point(x+w  , y+h/2);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_rect(x, y, w, h);
    _via_reg_ctx.stroke();

    if ( w > VIA_THEME_REGION_BOUNDARY_WIDTH &&
          h > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_rect(x - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      y - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      w + VIA_THEME_REGION_BOUNDARY_WIDTH,
                      h + VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();

      _via_draw_rect(x + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      y + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      w - VIA_THEME_REGION_BOUNDARY_WIDTH,
                      h - VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_box_prompt_region(x, y, w, h, is_selected) {
  _via_reg_ctx.strokeStyle = "green";
  if (is_selected) {
    _via_draw_rect(x, y, w, h);

    //_via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(x  ,   y);
    _via_draw_control_point(x+w, y+h);
    _via_draw_control_point(x  , y+h);
    _via_draw_control_point(x+w,   y);
    _via_draw_control_point(x+w/2,   y);
    _via_draw_control_point(x+w/2, y+h);
    _via_draw_control_point(x    , y+h/2);
    _via_draw_control_point(x+w  , y+h/2);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_rect(x, y, w, h);
    _via_reg_ctx.stroke();

    if ( w > VIA_THEME_REGION_BOUNDARY_WIDTH &&
          h > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_rect(x - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      y - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      w + VIA_THEME_REGION_BOUNDARY_WIDTH,
                      h + VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();

      _via_draw_rect(x + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      y + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                      w - VIA_THEME_REGION_BOUNDARY_WIDTH,
                      h - VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_rect(x, y, w, h) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.moveTo(x  , y);
  _via_reg_ctx.lineTo(x+w, y);
  _via_reg_ctx.lineTo(x+w, y+h);
  _via_reg_ctx.lineTo(x  , y+h);
  _via_reg_ctx.closePath();
}

function _via_draw_circle_region(cx, cy, r, is_selected) {
  if (is_selected) {
    _via_draw_circle(cx, cy, r);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(cx + r, cy);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_circle(cx, cy, r);
    _via_reg_ctx.stroke();

    if ( r > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_circle(cx, cy,
                        r - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
      _via_reg_ctx.stroke();
      _via_draw_circle(cx, cy,
                        r + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_circle(cx, cy, r) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, r, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();
}

function _via_draw_ellipse_region(cx, cy, rx, ry, rr, is_selected) {
  if (is_selected) {
    _via_draw_ellipse(cx, cy, rx, ry, rr);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(cx + rx * Math.cos(rr), cy + rx * Math.sin(rr));
    _via_draw_control_point(cx - rx * Math.cos(rr), cy - rx * Math.sin(rr));
    _via_draw_control_point(cx + ry * Math.sin(rr), cy - ry * Math.cos(rr));
    _via_draw_control_point(cx - ry * Math.sin(rr), cy + ry * Math.cos(rr));

  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_ellipse(cx, cy, rx, ry, rr);
    _via_reg_ctx.stroke();

    if ( rx > VIA_THEME_REGION_BOUNDARY_WIDTH &&
          ry > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_ellipse(cx, cy,
                        rx + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        ry + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        rr);
      _via_reg_ctx.stroke();
      _via_draw_ellipse(cx, cy,
                        rx - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        ry - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        rr);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_ellipse(cx, cy, rx, ry, rr) {
  _via_reg_ctx.save();

  _via_reg_ctx.beginPath();
  _via_reg_ctx.ellipse(cx, cy, rx, ry, rr, 0, 2 * Math.PI);

  _via_reg_ctx.restore(); // restore to original state
  _via_reg_ctx.closePath();
}

function _via_draw_polygon_region(all_points_x, all_points_y, is_selected, shape) {
  if ( is_selected ) {
    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.beginPath();
    _via_reg_ctx.moveTo(all_points_x[0], all_points_y[0]);
    for ( var i=1; i < all_points_x.length; ++i ) {
      _via_reg_ctx.lineTo(all_points_x[i], all_points_y[i]);
    }
    if ( shape === VIA_REGION_SHAPE.POLYGON ) {
      _via_reg_ctx.lineTo(all_points_x[0], all_points_y[0]); // close loop
    }
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
    for ( var i=0; i < all_points_x.length; ++i ) {
      _via_draw_control_point(all_points_x[i], all_points_y[i]);
    }
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.beginPath();
    _via_reg_ctx.moveTo(all_points_x[0], all_points_y[0]);
    for ( var i=0; i < all_points_x.length; ++i ) {
      _via_reg_ctx.lineTo(all_points_x[i], all_points_y[i]);
    }
    if ( shape === VIA_REGION_SHAPE.POLYGON ) {
      _via_reg_ctx.lineTo(all_points_x[0], all_points_y[0]); // close loop
    }
    _via_reg_ctx.stroke();
  }
}

function _via_draw_positive_point_region(cx, cy, is_selected) {
  _via_reg_ctx.strokeStyle = "green"; // Set the boundary color to green
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle   = "black";
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}

function _via_draw_negative_point_region(cx, cy, is_selected) {
  _via_reg_ctx.strokeStyle = "red"; // Set the boundary color to green
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle   = "black";
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}


function _via_draw_point_region(cx, cy, is_selected) {
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}

function _via_draw_point(cx, cy, r) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, r, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();
}


function reset_canvas() {
  // state of the application
  _via_is_user_drawing_region  = false;
  _via_is_user_resizing_region = false;
  _via_is_user_moving_region   = false;
  _via_is_user_drawing_polygon = false;
}


function draw_region_id(i) {
  _via_reg_ctx.shadowColor = "transparent";
  _via_reg_ctx.font = _via_settings.ui.image.region_label_font;
  var current_frame = document.getElementById('current-frame').value
  var canvas_reg = _via_canvas_regions[i];
  if (_via_canvas_regions[i].frame != current_frame) {
    return
  }
  var bbox = get_region_bounding_box(canvas_reg);
  var x = bbox[0];
  var y = bbox[1];
  var w = Math.abs(bbox[2] - bbox[0]);

  var char_width  = _via_reg_ctx.measureText('M').width;
  var char_height = 1.8 * char_width;

  var annotation_str  = (i+1).toString();
  var rattr = _via_img_metadata[_via_image_id].regions[i].region_attributes[_via_settings.ui.image.region_label];
  var rshape = _via_img_metadata[_via_image_id].regions[i].shape_attributes['name'];
  //var rattr = current_frame_metadata.regions[i].region_attributes[_via_settings.ui.image.region_label];
  //var rshape = current_frame_metadata.regions[i].shape_attributes['name'];
  if ( _via_settings.ui.image.region_label !== '__via_region_id__' ) {
    if ( typeof(rattr) !== 'undefined' ) {
      switch( typeof(rattr) ) {
      default:
      case 'string':
        annotation_str = rattr;
        break;
      case 'object':
        annotation_str = Object.keys(rattr).join(',');
        break;
      }
    } else {
      annotation_str = 'undefined';
    }
  }

  var bgnd_rect_width;
  var strw = _via_reg_ctx.measureText(annotation_str).width;
  if ( strw > w ) {
    if ( _via_settings.ui.image.region_label === '__via_region_id__' ) {
      // region-id is always visible in full
      bgnd_rect_width = strw + char_width;
    } else {

      // if text overflows, crop it
      var str_max     = Math.floor((w * annotation_str.length) / strw);
      if ( str_max > 1 ) {
        annotation_str  = annotation_str.substr(0, str_max-1) + '.';
        bgnd_rect_width = w;
      } else {
        annotation_str  = annotation_str.substr(0, 1) + '.';
        bgnd_rect_width = 2 * char_width;
      }
    }
  } else {
    bgnd_rect_width = strw + char_width;
  }

  if (canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYGON ||
      canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYLINE) {
    // put label near the first vertex
    x = canvas_reg.shape_attributes['all_points_x'][0];
    y = canvas_reg.shape_attributes['all_points_y'][0];
  } else {
    // center the label
    x = x - (bgnd_rect_width/2 - w/2);
  }

  // ensure that the text is within the image boundaries
  if ( y < char_height ) {
    y = char_height;
  }

  // first, draw a background rectangle first
  _via_reg_ctx.fillStyle = 'black';
  _via_reg_ctx.globalAlpha = 0.8;
  _via_reg_ctx.fillRect(Math.floor(x),
                        Math.floor(y - 1.1*char_height),
                        Math.floor(bgnd_rect_width),
                        Math.floor(char_height));

  // then, draw text over this background rectangle
  _via_reg_ctx.globalAlpha = 1.0;
  _via_reg_ctx.fillStyle = 'yellow';
  _via_reg_ctx.fillText(annotation_str,
                        Math.floor(x + 0.4*char_width),
                        Math.floor(y - 0.35*char_height));


}

function draw_all_region_id() {
  _via_reg_ctx.shadowColor = "transparent";
  _via_reg_ctx.font = _via_settings.ui.image.region_label_font;
  var current_frame = document.getElementById('current-frame').value
  for ( var i = 0; i < _via_img_metadata[_via_image_id].regions.length; ++i ) {
    var canvas_reg = _via_canvas_regions[i];
    if (_via_canvas_regions[i].frame != current_frame) {
      continue
    }
    var bbox = get_region_bounding_box(canvas_reg);
    var x = bbox[0];
    var y = bbox[1];
    var w = Math.abs(bbox[2] - bbox[0]);

    var char_width  = _via_reg_ctx.measureText('M').width;
    var char_height = 1.8 * char_width;

    var annotation_str  = (i+1).toString();
    var rattr = _via_img_metadata[_via_image_id].regions[i].region_attributes[_via_settings.ui.image.region_label];
    if ( _via_settings.ui.image.region_label !== '__via_region_id__' ) {
      if ( typeof(rattr) !== 'undefined' ) {
        switch( typeof(rattr) ) {
        default:
        case 'string':
          annotation_str = rattr;
          break;
        case 'object':
          annotation_str = Object.keys(rattr).join(',');
          break;
        }
      } else {
        annotation_str = 'undefined';
      }
    }

    var bgnd_rect_width;
    var strw = _via_reg_ctx.measureText(annotation_str).width;
    if ( strw > w ) {
      if ( _via_settings.ui.image.region_label === '__via_region_id__' ) {
        // region-id is always visible in full
        bgnd_rect_width = strw + char_width;
      } else {

        // if text overflows, crop it
        var str_max     = Math.floor((w * annotation_str.length) / strw);
        if ( str_max > 1 ) {
          annotation_str  = annotation_str.substr(0, str_max-1) + '.';
          bgnd_rect_width = w;
        } else {
          annotation_str  = annotation_str.substr(0, 1) + '.';
          bgnd_rect_width = 2 * char_width;
        }
      }
    } else {
      bgnd_rect_width = strw + char_width;
    }

    if (canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYGON ||
        canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYLINE) {
      // put label near the first vertex
      x = canvas_reg.shape_attributes['all_points_x'][0];
      y = canvas_reg.shape_attributes['all_points_y'][0];
    } else {
      // center the label
      x = x - (bgnd_rect_width/2 - w/2);
    }

    // ensure that the text is within the image boundaries
    if ( y < char_height ) {
      y = char_height;
    }

    // first, draw a background rectangle first
    _via_reg_ctx.fillStyle = 'black';
    _via_reg_ctx.globalAlpha = 0.8;
    _via_reg_ctx.fillRect(Math.floor(x),
                          Math.floor(y - 1.1*char_height),
                          Math.floor(bgnd_rect_width),
                          Math.floor(char_height));

    // then, draw text over this background rectangle
    _via_reg_ctx.globalAlpha = 1.0;
    _via_reg_ctx.fillStyle = 'yellow';
    _via_reg_ctx.fillText(annotation_str,
                          Math.floor(x + 0.4*char_width),
                          Math.floor(y - 0.35*char_height));

  }
}

function get_region_bounding_box(region) {
  var d = region.shape_attributes;
  var bbox = new Array(4);

  switch( d['name'] ) {
  case 'rect':
    bbox[0] = d['x'];
    bbox[1] = d['y'];
    bbox[2] = d['x'] + d['width'];
    bbox[3] = d['y'] + d['height'];
    break;

  case 'circle':
    bbox[0] = d['cx'] - d['r'];
    bbox[1] = d['cy'] - d['r'];
    bbox[2] = d['cx'] + d['r'];
    bbox[3] = d['cy'] + d['r'];
    break;

  case 'ellipse':
    let radians = d['theta'];
    let radians90 = radians + Math.PI / 2;
    let ux = d['rx'] * Math.cos(radians);
    let uy = d['rx'] * Math.sin(radians);
    let vx = d['ry'] * Math.cos(radians90);
    let vy = d['ry'] * Math.sin(radians90);

    let width = Math.sqrt(ux * ux + vx * vx) * 2;
    let height = Math.sqrt(uy * uy + vy * vy) * 2;

    bbox[0] = d['cx'] - (width / 2);
    bbox[1] = d['cy'] - (height / 2);
    bbox[2] = d['cx'] + (width / 2);
    bbox[3] = d['cy'] + (height / 2);
    break;

  case 'polyline': // handled by polygon
  case 'polygon':
    var all_points_x = d['all_points_x'];
    var all_points_y = d['all_points_y'];

    var minx = Number.MAX_SAFE_INTEGER;
    var miny = Number.MAX_SAFE_INTEGER;
    var maxx = 0;
    var maxy = 0;
    for ( var i=0; i < all_points_x.length; ++i ) {
      if ( all_points_x[i] < minx ) {
        minx = all_points_x[i];
      }
      if ( all_points_x[i] > maxx ) {
        maxx = all_points_x[i];
      }
      if ( all_points_y[i] < miny ) {
        miny = all_points_y[i];
      }
      if ( all_points_y[i] > maxy ) {
        maxy = all_points_y[i];
      }
    }
    bbox[0] = minx;
    bbox[1] = miny;
    bbox[2] = maxx;
    bbox[3] = maxy;
    break;

  case 'point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;
  
  case 'positive_point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;

  case 'negative_point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;
  }
  return bbox;
}

