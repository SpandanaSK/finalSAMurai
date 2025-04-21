function annotation_editor_show() {
  // remove existing annotation editor (if any)
  annotation_editor_remove();

  // create new container of annotation editor
  var ae = document.createElement('div');
  ae.setAttribute('id', 'annotation_editor');
  var style = ae.getAttribute(style)
  style = style + '; width:min-content;'
  ae.setAttribute('style', style)

  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION ) {
    if ( _via_settings.ui.image.on_image_annotation_editor_placement === VIA_ANNOTATION_EDITOR_PLACEMENT.DISABLE ) {
      return;
    }

    // only display on-image annotation editor if
    // - region attribute are defined
    // - region is selected
    if ( _via_is_region_selected &&
         Object.keys(_via_attributes['region']).length &&
         _via_attributes['region'].constructor === Object ) {
      ae.classList.add('force_small_font');
      ae.classList.add('display_area_content'); // to enable automatic hiding of this content
      // add annotation editor to image_panel
      if ( _via_settings.ui.image.on_image_annotation_editor_placement === VIA_ANNOTATION_EDITOR_PLACEMENT.NEAR_REGION ) {
        var html_position = annotation_editor_get_placement(_via_user_sel_region_id);
        ae.style.top = html_position.top;
        ae.style.left = html_position.left;
      }
      _via_display_area.appendChild(ae);
      annotation_editor_update_content();
      update_vertical_space();
    }
  } else {
    // show annotation editor in a separate panel at the bottom
    _via_annotaion_editor_panel.appendChild(ae);
    annotation_editor_update_content();
    update_vertical_space();

    if ( _via_is_region_selected ) {
      // highlight entry for region_id in annotation editor panel
      annotation_editor_scroll_to_row(_via_user_sel_region_id);
      annotation_editor_highlight_row(_via_user_sel_region_id);
    }
  }
}

function annotation_editor_hide() {
  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION ) {
    // remove existing annotation editor (if any)
    annotation_editor_remove();
  } else {
    annotation_editor_clear_row_highlight();
  }
}

function annotation_editor_toggle_on_image_editor() {
  if ( _via_settings.ui.image.on_image_annotation_editor_placement === VIA_ANNOTATION_EDITOR_PLACEMENT.DISABLE ) {
    _via_annotation_editor_mode = VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION;
    _via_settings.ui.image.on_image_annotation_editor_placement = VIA_ANNOTATION_EDITOR_PLACEMENT.NEAR_REGION;
    annotation_editor_show();
    show_message('Enabled on image annotation editor');
  } else {
    _via_settings.ui.image.on_image_annotation_editor_placement = VIA_ANNOTATION_EDITOR_PLACEMENT.DISABLE;
    _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS;
    annotation_editor_hide();
    show_message('Disabled on image annotation editor');
  }
}

function annotation_editor_update_content() {
  return new Promise( function(ok_callback, err_callback) {
    var ae = document.getElementById('annotation_editor');
    if (ae ) {
      ae.innerHTML = '';
      annotation_editor_update_header_html();
      annotation_editor_update_metadata_html();
    }
    ok_callback();
  });
}

function annotation_editor_get_placement(region_id) {
  var html_position = {};
  var r = _via_canvas_regions[region_id]['shape_attributes'];
  var shape = r['name'];
  switch( shape ) {
  case 'rect':
    html_position.top = r['y'] + r['height'];
    html_position.left = r['x'] + r['width'];
    break;
  case 'circle':
    html_position.top = r['cy'] + r['r'];
    html_position.left = r['cx'];
    break;
  case 'ellipse':
    html_position.top = r['cy'] + r['ry'] * Math.cos(r['theta']);
    html_position.left = r['cx'] - r['ry'] * Math.sin(r['theta']);
    break;
  case 'polygon':
  case 'polyline':
    var most_left =
      Object.keys(r['all_points_x']).reduce(function(a, b){
        return r['all_points_x'][a] > r['all_points_x'][b] ? a : b });
    html_position.top  = Math.max( r['all_points_y'][most_left] );
    html_position.left = Math.max( r['all_points_x'][most_left] );
    break;
  case 'point':
    html_position.top = r['cy'];
    html_position.left = r['cx'];
    break;

  case 'positive_point':
    html_position.top = r['cy'];
    html_position.left = r['cx'];
    break;

  case 'negative_point':
    html_position.top = r['cy'];
    html_position.left = r['cx'];
    break;

  case 'box_prompt':
    html_position.top = r['y'] + r['height'];
    html_position.left = r['x'] + r['width'];
    break;

  case 'img_crop_prompt':
    html_position.top = r['y'] + r['height'];
    html_position.left = r['x'] + r['width'];
    break;
  }
  html_position.top  = html_position.top + _via_img_panel.offsetTop + VIA_REGION_EDGE_TOL + 'px';
  html_position.left = html_position.left + _via_img_panel.offsetLeft + VIA_REGION_EDGE_TOL + 'px';
  return html_position;
}

function annotation_editor_remove() {
  var p = document.getElementById('annotation_editor');
  if ( p ) {
    p.remove();
  }
}

function is_annotation_editor_visible() {
  return document.getElementById('annotation_editor_panel').classList.contains('display_block');
}

function annotation_editor_toggle_all_regions_editor() {
  var p = document.getElementById('annotation_editor_panel');
  if ( p.classList.contains('display_block') ) {
    p.classList.remove('display_block');
    _via_annotation_editor_mode = VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION;
  } else {
    _via_annotation_editor_mode = VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS;
    p.classList.add('display_block');
    p.style.height = _via_settings.ui.annotation_editor_height + '%';
    p.style.fontSize = _via_settings.ui.annotation_editor_fontsize + 'rem';
    annotation_editor_show();
  }
}

function annotation_editor_set_active_button() {
  var attribute_type;
  for ( attribute_type in _via_attributes ) {
    var bid = 'button_edit_' + attribute_type + '_metadata';
    document.getElementById(bid).classList.remove('active');
  }
  var bid = 'button_edit_' + _via_metadata_being_updated + '_metadata';
  document.getElementById(bid).classList.add('active');
}

function edit_region_metadata_in_annotation_editor() {
  _via_metadata_being_updated = 'region';
  annotation_editor_set_active_button();
  annotation_editor_update_content();
}

function edit_file_metadata_in_annotation_editor() {
  _via_metadata_being_updated = 'file';
  annotation_editor_set_active_button();
  annotation_editor_update_content();
}

function annotation_editor_update_header_html() {
  var head = document.createElement('div');
  head.setAttribute('class', 'row');
  head.setAttribute('id', 'annotation_editor_header');

  if ( _via_metadata_being_updated === 'region' ) {
    var rid_col = document.createElement('span');
    rid_col.setAttribute('class', 'col');
    rid_col.innerHTML = '';
    head.appendChild(rid_col);
  }

  if ( _via_metadata_being_updated === 'file' ) {
    var rid_col = document.createElement('span');
    rid_col.setAttribute('class', 'col header');
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      rid_col.innerHTML = 'group';
    } else {
      rid_col.innerHTML = 'filename';
    }
    head.appendChild(rid_col);
  }

  var attr_id;
  for ( attr_id in _via_attributes[_via_metadata_being_updated] ) {
    var col = document.createElement('span');
    col.setAttribute('class', 'col header');
    col.innerHTML = attr_id;
    col.setAttribute('onclick', "update_selected_region_attribute(this)");
    head.appendChild(col);
  }

  var ae = document.getElementById('annotation_editor');
  if ( ae.childNodes.length === 0 ) {
    ae.appendChild(head);
  } else {
    if ( ae.firstChild.id === 'annotation_editor_header') {
      ae.replaceChild(head, ae.firstChild);
    } else {
      // header node is absent
      ae.insertBefore(head, ae.firstChild);
    }
  }
}

function annotation_editor_update_metadata_html() {
  
  if ( ! _via_img_count ) {
    return;
  }
  var current_frame = document.getElementById('current-frame').value
  var ae = document.getElementById('annotation_editor');
  switch ( _via_metadata_being_updated ) {
  case 'region':
    var rindex;
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      ae.appendChild( annotation_editor_get_metadata_row_html(0) );
    } else {
      if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE ) {
        if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION ) {
          ae.appendChild( annotation_editor_get_metadata_row_html(_via_user_sel_region_id) );
        } else {
          for ( rindex = 0; rindex < _via_img_metadata[_via_image_id].regions.length; ++rindex ) {
            if (_via_img_metadata[_via_image_id].regions[rindex].frame == current_frame) {
              ae.appendChild( annotation_editor_get_metadata_row_html(rindex) );
            }
          }
        }
      }
    }
    break;

  case 'file':
    ae.appendChild( annotation_editor_get_metadata_row_html(0) );
    break;
  }
}

function annotation_editor_update_row(row_id) {
  var ae = document.getElementById('annotation_editor');

  var new_row = annotation_editor_get_metadata_row_html(row_id);
  var old_row = document.getElementById(new_row.getAttribute('id'));
  ae.replaceChild(new_row, old_row);
}

function annotation_editor_add_row(row_id) {
  if ( is_annotation_editor_visible() ) {
    var ae = document.getElementById('annotation_editor');
    var new_row = annotation_editor_get_metadata_row_html(row_id);
    var penultimate_row_id = parseInt(row_id) - 1;
    if ( penultimate_row_id >= 0 ) {
      var penultimate_row_html_id = 'ae_' + _via_metadata_being_updated + '_' + penultimate_row_id;
      var penultimate_row = document.getElementById(penultimate_row_html_id);
      if (penultimate_row == null) {
        ae.appendChild(new_row);
      }
      else {
        ae.insertBefore(new_row, penultimate_row.nextSibling);
      }
    } else {
      ae.appendChild(new_row);
    }
  }
}

function annotation_editor_get_metadata_row_html(row_id) {
  var row = document.createElement('div');
  row.setAttribute('class', 'row');
  row.setAttribute('id', 'ae_' + _via_metadata_being_updated + '_' + row_id);

  if ( _via_metadata_being_updated === 'region' ) {
    var rid = document.createElement('span');

    switch(_via_display_area_content_name) {
    case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID:
      rid.setAttribute('class', 'col');
      rid.innerHTML = 'Grouped regions in ' + _via_image_grid_selected_img_index_list.length + ' files';
      break;
    case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE:
      rid.setAttribute('class', 'col id');
      rid.innerHTML = (row_id + 1);
      break;
    }
    row.appendChild(rid);
  }

  if ( _via_metadata_being_updated === 'file' ) {
    var rid = document.createElement('span');
    rid.setAttribute('class', 'col');
    switch(_via_display_area_content_name) {
    case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID:
      rid.innerHTML = 'Group of ' + _via_image_grid_selected_img_index_list.length + ' files';
      break;
    case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE:
      rid.innerHTML = _via_image_filename_list[_via_image_index];
      break;
    }

    row.appendChild(rid);
  }

  var attr_id;
  for ( attr_id in _via_attributes[_via_metadata_being_updated] ) {
    var col = document.createElement('span');
    col.setAttribute('class', 'col');
    var attr_type    = _via_attributes[_via_metadata_being_updated][attr_id].type;
    var attr_desc    = _via_attributes[_via_metadata_being_updated][attr_id].desc;
    if ( typeof(attr_desc) === 'undefined' ) {
      attr_desc = '';
    }
    var attr_html_id = attr_id + '__' + row_id;

    var attr_value = '';
    var attr_placeholder = '';
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE ) {
      switch(_via_metadata_being_updated) {
      case 'region':
        if ( _via_img_metadata[_via_image_id].regions[row_id].region_attributes.hasOwnProperty(attr_id) ) {
          attr_value = _via_img_metadata[_via_image_id].regions[row_id].region_attributes[attr_id];
        } else {
          attr_placeholder = 'not defined yet!';
        }
      case 'file':
        if ( _via_img_metadata[_via_image_id].file_attributes.hasOwnProperty(attr_id) ) {
          attr_value = _via_img_metadata[_via_image_id].file_attributes[attr_id];
        } else {
          attr_placeholder = 'not defined yet!';
        }
      }
    }

    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      var attr_metadata_stat;
      switch(_via_metadata_being_updated) {
      case 'region':
        attr_metadata_stat = _via_get_region_metadata_stat(_via_image_grid_selected_img_index_list, attr_id);
        break;
      case 'file':
        attr_metadata_stat = _via_get_file_metadata_stat(_via_image_grid_selected_img_index_list, attr_id);
        break;
      }

      switch ( attr_type ) {
      case 'text':
        if ( attr_metadata_stat.hasOwnProperty(attr_id) ) {
          var attr_value_set = Object.keys(attr_metadata_stat[attr_id]);
          if ( attr_value_set.includes('undefined') ) {
            attr_value = '';
            attr_placeholder = 'includes ' + attr_metadata_stat[attr_id]['undefined'] + ' undefined values';
          } else {
            switch( attr_value_set.length ) {
            case 0:
              attr_value = '';
              attr_placeholder = 'not applicable';
              break;
            case 1:
              attr_value = attr_value_set[0];
              attr_placeholder = '';
              break;
            default:
              attr_value = '';
              attr_placeholder = attr_value_set.length + ' different values: ' + JSON.stringify(attr_value_set).replace(/"/g,'\'');
            }
          }
        } else {
          attr_value = '';
          attr_placeholder = 'not defined yet!';
        }
        break;

      case 'radio':    // fallback
      case 'dropdown': // fallback
      case 'image':    // fallback
        if ( attr_metadata_stat.hasOwnProperty(attr_id) ) {
          var attr_value_set = Object.keys(attr_metadata_stat[attr_id]);
          if ( attr_value_set.length === 1 ) {
            attr_value = attr_value_set[0];
          } else {
            attr_value = '';
          }
        } else {
          attr_value = '';
        }
        break;

      case 'checkbox':
        attr_value = {};
        if ( attr_metadata_stat.hasOwnProperty(attr_id) ) {
          var attr_value_set = Object.keys(attr_metadata_stat[attr_id]);
          var same_count = true;
          var i, n;
          var attr_value_curr, attr_value_next;
          n = attr_value_set.length;
          for ( i = 0; i < n - 1; ++i ) {
            attr_value_curr = attr_value_set[i];
            attr_value_next = attr_value_set[i+1];

            if ( attr_metadata_stat[attr_id][attr_value_curr] !== attr_metadata_stat[attr_id][attr_value_next] ) {
              same_count = false;
              break;
            }
          }
          if ( same_count ) {
            var attr_value_i;
            for ( attr_value_i in attr_metadata_stat[attr_id] ) {
              attr_value[attr_value_i] = true;
            }
          }
        }
        break;
      }
    }

    switch(attr_type) {
    case 'text':
      col.innerHTML = '<textarea ' +
        'onchange="annotation_editor_on_metadata_update(this)" ' +
        'onfocus="annotation_editor_on_metadata_focus(this)" ' +
        'title="' + attr_desc + '" ' +
        'placeholder="' + attr_placeholder + '" ' +
        'id="' + attr_html_id + '">' + attr_value + '</textarea>';
      break;
    case 'checkbox':
      var options = _via_attributes[_via_metadata_being_updated][attr_id].options;
      var option_id;
      for ( option_id in options ) {
        var option_html_id = attr_html_id + '__' + option_id;
        var option = document.createElement('input');
        option.setAttribute('type', 'checkbox');
        option.setAttribute('value', option_id);
        option.setAttribute('id', option_html_id);
        option.setAttribute('onfocus', 'annotation_editor_on_metadata_focus(this)');
        option.setAttribute('onchange', 'annotation_editor_on_metadata_update(this)');

        var option_desc  = _via_attributes[_via_metadata_being_updated][attr_id].options[option_id];
        if ( option_desc === '' || typeof(option_desc) === 'undefined' ) {
          // option description is optional, use option_id when description is not present
          option_desc = option_id;
        }

        // set the value of options based on the user annotations
        if ( typeof attr_value !== 'undefined') {
          if ( attr_value.hasOwnProperty(option_id) ) {
            option.checked = attr_value[option_id];
          }
        }

        var label  = document.createElement('label');
        label.setAttribute('for', option_html_id);
        label.innerHTML = option_desc;

        var container = document.createElement('span');
        container.style = "display: flex";
        container.appendChild(option);
        container.appendChild(label);
        col.appendChild(container);
      }
      break;
    case 'radio':
      var option_id;
      for ( option_id in _via_attributes[_via_metadata_being_updated][attr_id].options ) {
        var option_html_id = attr_html_id + '__' + option_id;
        var option = document.createElement('input');
        option.setAttribute('type', 'radio');
        option.setAttribute('name', attr_html_id);
        option.setAttribute('value', option_id);
        option.setAttribute('id', option_html_id);
        option.setAttribute('onfocus', 'annotation_editor_on_metadata_focus(this)');
        option.setAttribute('onchange', 'annotation_editor_on_metadata_update(this)');

        var option_desc  = _via_attributes[_via_metadata_being_updated][attr_id].options[option_id];
        if ( option_desc === '' || typeof(option_desc) === 'undefined' ) {
          // option description is optional, use option_id when description is not present
          option_desc = option_id;
        }

        if ( attr_value === option_id ) {
          option.checked = true;
        }

        var label  = document.createElement('label');
        label.setAttribute('for', option_html_id);
        label.innerHTML = option_desc;

        var container = document.createElement('span');
        container.style = "display: flex";
        container.appendChild(option);
        container.appendChild(label);
        col.appendChild(container);
      }
      break;
    case 'image':
      var option_id;
      var option_count = 0;
      for ( option_id in _via_attributes[_via_metadata_being_updated][attr_id].options ) {
        option_count = option_count + 1;
      }
      var img_options = document.createElement('div');
      img_options.setAttribute('class', 'img_options');
      col.appendChild(img_options);

      var option_index = 0;
      for ( option_id in _via_attributes[_via_metadata_being_updated][attr_id].options ) {
        var option_html_id = attr_html_id + '__' + option_id;
        var option = document.createElement('input');
        option.setAttribute('type', 'radio');
        option.setAttribute('name', attr_html_id);
        option.setAttribute('value', option_id);
        option.setAttribute('id', option_html_id);
        option.setAttribute('onfocus', 'annotation_editor_on_metadata_focus(this)');
        option.setAttribute('onchange', 'annotation_editor_on_metadata_update(this)');

        var option_desc  = _via_attributes[_via_metadata_being_updated][attr_id].options[option_id];
        if ( option_desc === '' || typeof(option_desc) === 'undefined' ) {
          // option description is optional, use option_id when description is not present
          option_desc = option_id;
        }

        if ( attr_value === option_id ) {
          option.checked = true;
        }

        var label  = document.createElement('label');
        label.setAttribute('for', option_html_id);
        label.innerHTML = '<img src="' + option_desc + '"><p>' + option_id + '</p>';

        var container = document.createElement('span');
        container.appendChild(option);
        container.appendChild(label);
        img_options.appendChild(container);
      }
      break;

    case 'dropdown':
      var sel = document.createElement('select');
      sel.setAttribute('id', attr_html_id);
      sel.setAttribute('onfocus', 'annotation_editor_on_metadata_focus(this)');
      sel.setAttribute('onchange', 'annotation_editor_on_metadata_update(this)');
      var option_id;
      var option_selected = false;
      for ( option_id in _via_attributes[_via_metadata_being_updated][attr_id].options ) {
        var option_html_id = attr_html_id + '__' + option_id;
        var option = document.createElement('option');
        option.setAttribute('value', option_id);

        var option_desc  = _via_attributes[_via_metadata_being_updated][attr_id].options[option_id];
        if ( option_desc === '' || typeof(option_desc) === 'undefined' ) {
          // option description is optional, use option_id when description is not present
          option_desc = option_id;
        }

        if ( option_id === attr_value ) {
          option.setAttribute('selected', 'selected');
          option_selected = true;
        }
        option.innerHTML = option_desc;
        sel.appendChild(option);
      }

      if ( ! option_selected ) {
        sel.selectedIndex = '-1';
      }
      col.appendChild(sel);
      break;
    }

    row.appendChild(col);
  }
  return row;
}

function annotation_editor_scroll_to_row(row_id) {
  if ( is_annotation_editor_visible() ) {
    var row_html_id = 'ae_' + _via_metadata_being_updated + '_' + row_id;
    var row = document.getElementById(row_html_id);
    row.scrollIntoView(false);
  }
}

function annotation_editor_highlight_row(row_id) {
  if ( is_annotation_editor_visible() ) {
    var row_html_id = 'ae_' + _via_metadata_being_updated + '_' + row_id;
    var row = document.getElementById(row_html_id);
    row.classList.add('highlight');
  }
}

function annotation_editor_clear_row_highlight() {
  if ( is_annotation_editor_visible() ) {
    var ae = document.getElementById('annotation_editor');
    var i;
    for ( i=0; i<ae.childNodes.length; ++i ) {
      ae.childNodes[i].classList.remove('highlight');
    }
  }
}

function annotation_editor_extract_html_id_components(html_id) {
  // html_id : attribute_name__row-id__option_id
  var parts = html_id.split('__');
  var parsed_id = {};
  switch( parts.length ) {
  case 3:
    // html_id : attribute-id__row-id__option_id
    parsed_id.attr_id = parts[0];
    parsed_id.row_id  = parts[1];
    parsed_id.option_id = parts[2];
    break;
  case 2:
    // html_id : attribute-id__row-id
    parsed_id.attr_id = parts[0];
    parsed_id.row_id  = parts[1];
    break;
  default:
  }
  return parsed_id;
}



function _via_get_file_metadata_stat(img_index_list, attr_id) {
  var stat = {};
  stat[attr_id] = {};
  var i, n, img_id, img_index, value;
  n = img_index_list.length;
  for ( i = 0; i < n; ++i ) {
    img_index = img_index_list[i];
    img_id = _via_image_id_list[img_index];
    if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
      value = _via_img_metadata[img_id].file_attributes[attr_id];
      if ( typeof(value) === 'object' ) {
        // checkbox has multiple values and hence is object
        var key;
        for ( key in value ) {
          if ( stat[attr_id].hasOwnProperty(key) ) {
            stat[attr_id][key] += 1;
          } else {
            stat[attr_id][key] = 1;
          }
        }
      } else {
        if ( stat[attr_id].hasOwnProperty(value) ) {
          stat[attr_id][value] += 1;
        } else {
          stat[attr_id][value] = 1;
        }
      }
    }

  }
  return stat;
}

function _via_get_region_metadata_stat(img_index_list, attr_id) {
  var stat = {};
  stat[attr_id] = {};
  var i, n, img_id, img_index, value;
  var j, m;
  n = img_index_list.length;
  for ( i = 0; i < n; ++i ) {
    img_index = img_index_list[i];
    img_id = _via_image_id_list[img_index];
    m = _via_img_metadata[img_id].regions.length;
    for ( j = 0; j < m; ++j ) {
      if ( ! image_grid_is_region_in_current_group( _via_img_metadata[img_id].regions[j].region_attributes ) ) {
        // skip region not in current group
        continue;
      }

      value = _via_img_metadata[img_id].regions[j].region_attributes[attr_id];
      if ( typeof(value) === 'object' ) {
        // checkbox has multiple values and hence is object
        var key;
        for ( key in value ) {
          if ( stat[attr_id].hasOwnProperty(key) ) {
            stat[attr_id][key] += 1;
          } else {
            stat[attr_id][key] = 1;
          }
        }
      } else {
        if ( stat[attr_id].hasOwnProperty(value) ) {
          stat[attr_id][value] += 1;
        } else {
          stat[attr_id][value] = 1;
        }
      }
    }
  }
  return stat;
}

// invoked when the input entry in annotation editor receives focus
function annotation_editor_on_metadata_focus(p) {
  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS ) {
    var pid       = annotation_editor_extract_html_id_components(p.id);
    var region_id = pid.row_id;
    // clear existing highlights (if any)
    toggle_all_regions_selection(false);
    annotation_editor_clear_row_highlight();
    // set new selection highlights
    set_region_select_state(region_id, true);
    //annotation_editor_scroll_to_row(region_id);
    annotation_editor_highlight_row(region_id);

    _via_redraw_reg_canvas();
  }
}

// invoked when the user updates annotations using the annotation editor
function annotation_editor_on_metadata_update(p) {
  var pid       = annotation_editor_extract_html_id_components(p.id);
  var img_id    = _via_image_id;

  var img_index_list = [ _via_image_index ];
  var region_id = pid.row_id;
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    img_index_list = _via_image_grid_selected_img_index_list.slice(0);
    region_id = -1; // this flag denotes that we want to update all regions
  }

  if ( _via_metadata_being_updated === 'file' ) {
    annotation_editor_update_file_metadata(img_index_list, pid.attr_id, p.value, p.checked).then( function(update_count) {
      annotation_editor_on_metadata_update_done('file', pid.attr_id, update_count);
    }, function(err) {
      console.log(err)
      show_message('Failed to update file attributes! ' + err);
    });
    return;
  }

  if ( _via_metadata_being_updated === 'region' ) {
    annotation_editor_update_region_metadata(img_index_list, region_id, pid.attr_id, p.value, p.checked).then( function(update_count) {
      annotation_editor_on_metadata_update_done('region', pid.attr_id, update_count);
    }, function(err) {
      show_message('Failed to update region attributes! ');
    });
    return;
  }
}

function annotation_editor_on_metadata_update_done(type, attr_id, update_count) {
  show_message('Updated ' + type + ' attributes of ' + update_count + ' ' + type + 's');
  // check if the updated attribute is one of the group variables
  var i, n, type, attr_id;
  n = _via_image_grid_group_var.length;
  var clear_all_group = false;
  for ( i = 0; i < n; ++i ) {
    if ( _via_image_grid_group_var[i].type === type &&
         _via_image_grid_group_var[i].name === attr_id ) {
      clear_all_group = true;
      break;
    }
  }
  _via_regions_group_color_init();
  _via_redraw_reg_canvas();

  // @todo: it is wasteful to cancel the full set of groups.
  // we should only cancel the groups that are affected by this update.
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( clear_all_group ) {
      image_grid_show_all_project_images();
    }
  }
}

function annotation_editor_update_file_metadata(img_index_list, attr_id, new_value, new_checked) {
  return new Promise( function(ok_callback, err_callback) {
    var i, n, img_id, img_index;
    n = img_index_list.length;
    var update_count = 0;
    for ( i = 0; i < n; ++i ) {
      img_index = img_index_list[i];
      img_id = _via_image_id_list[img_index];

      switch( _via_attributes['file'][attr_id].type ) {
      case 'text':  // fallback
      case 'radio': // fallback
      case 'dropdown': // fallback
      case 'image':
        _via_img_metadata[img_id].file_attributes[attr_id] = new_value;
        update_count += 1;
        break;

      case 'checkbox':
        var option_id = new_value;
        if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
          if ( typeof(_via_img_metadata[img_id].file_attributes[attr_id]) !== 'object' ) {
            var old_value = _via_img_metadata[img_id].file_attributes[attr_id];
            _via_img_metadata[img_id].file_attributes[attr_id] = {};
            if ( Object.keys(_via_attributes['file'][attr_id]['options']).includes(old_value) ) {
              // transform existing value as checkbox option
              _via_img_metadata[img_id].file_attributes[attr_id] = {};
              _via_img_metadata[img_id].file_attributes[attr_id][old_value] = true;
            }
          }
        } else {
          _via_img_metadata[img_id].file_attributes[attr_id] = {};
        }
        if ( new_checked ) {
          _via_img_metadata[img_id].file_attributes[attr_id][option_id] = true;
        } else {
          // false option values are not stored
          delete _via_img_metadata[img_id].file_attributes[attr_id][option_id];
        }
        update_count += 1;
        break;
      }
    }
    ok_callback(update_count);
  });
}

function annotation_editor_update_region_metadata(img_index_list, region_id, attr_id, new_value, new_checked) {
  return new Promise( function(ok_callback, err_callback) {
    var i, n, img_id, img_index;
    n = img_index_list.length;
    var update_count = 0;
    var region_list = [];
    var j, m;

    if ( region_id === -1 ) {
      // update all regions on a file (for image grid view)
      for ( i = 0; i < n; ++i ) {
        img_index = img_index_list[i];
        img_id = _via_image_id_list[img_index];

        m = _via_img_metadata[img_id].regions.length;
        for ( j = 0; j < m; ++j ) {
          if ( ! image_grid_is_region_in_current_group( _via_img_metadata[img_id].regions[j].region_attributes ) ) {
            continue;
          }

          switch( _via_attributes['region'][attr_id].type ) {
          case 'text':  // fallback
          case 'dropdown': // fallback
          case 'radio': // fallback
          case 'image':
            _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = new_value;
            update_count += 1;
            break;
          case 'checkbox':
            var option_id = new_value;
            if ( _via_img_metadata[img_id].regions[j].region_attributes.hasOwnProperty(attr_id) ) {
              if ( typeof(_via_img_metadata[img_id].regions[j].region_attributes[attr_id]) !== 'object' ) {
                var old_value = _via_img_metadata[img_id].regions[j].region_attributes[attr_id];
                _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = {}
                if ( Object.keys(_via_attributes['region'][attr_id]['options']).includes(old_value) ) {
                  // transform existing value as checkbox option
                  _via_img_metadata[img_id].regions[j].region_attributes[attr_id][old_value] = true;
                }
              }
            } else {
              _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = {};
            }

            if ( new_checked ) {
              _via_img_metadata[img_id].regions[j].region_attributes[attr_id][option_id] = true;
            } else {
              // false option values are not stored
              delete _via_img_metadata[img_id].regions[j].region_attributes[attr_id][option_id];
            }
            update_count += 1;
            break;
          }
        }
      }
    } else {
      // update a single region in a file (for single image view)
      // update all regions on a file (for image grid view)
      for ( i = 0; i < n; ++i ) {
        img_index = img_index_list[i];
        img_id = _via_image_id_list[img_index];

        switch( _via_attributes['region'][attr_id].type ) {
        case 'text':  // fallback
        case 'dropdown': // fallback
        case 'radio': // fallback
        case 'image':
          _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = new_value;
          update_count += 1;
          break;
        case 'checkbox':
          var option_id = new_value;

          if ( _via_img_metadata[img_id].regions[region_id].region_attributes.hasOwnProperty(attr_id) ) {
            if ( typeof(_via_img_metadata[img_id].regions[region_id].region_attributes[attr_id]) !== 'object' ) {
              var old_value = _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id];
              _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = {};
              if ( Object.keys(_via_attributes['region'][attr_id]['options']).includes(old_value) ) {
                // transform existing value as checkbox option
                _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][old_value] = true;
              }
            }
          } else {
            _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = {};
          }

          if ( new_checked ) {
            _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][option_id] = true;
          } else {
            // false option values are not stored
            delete _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][option_id];
          }
          update_count += 1;
          break;
        }
      }
      if (_via_current_shape == VIA_REGION_SHAPE.POSITIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.NEGATIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.BOX_PROMPT) {
        processSAMPrompts()
      }
      if (_via_current_shape == VIA_REGION_SHAPE.IMG_CROP_PROMPT) {
        processImageCropPrompts()
      }
    }
    ok_callback(update_count);
  });
}

function set_region_annotations_to_default_value(rid) {
  var attr_id;
  for ( attr_id in _via_attributes['region'] ) {
    var attr_type = _via_attributes['region'][attr_id].type;
    switch( attr_type ) {
    case 'text':
      var default_value = _via_attributes['region'][attr_id].default_value;
      if ( typeof(default_value) !== 'undefined' ) {
        _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = default_value;
      }
      break;
    case 'image':    // fallback
    case 'dropdown': // fallback
    case 'radio':
      _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = '';
      var default_options = _via_attributes['region'][attr_id].default_options;
      if ( typeof(default_options) !== 'undefined' ) {
        _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = Object.keys(default_options)[0];
      }
      break;

    case 'checkbox':
      _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = {};
      var default_options = _via_attributes['region'][attr_id].default_options;
      if ( typeof(default_options) !== 'underfined' ) {
        var option_id;
        for ( option_id in default_options ) {
          var default_value = default_options[option_id];
          if ( typeof(default_value) !== 'underfined' ) {
            _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id][option_id] = default_value;
          }
        }
      }
      break;
    }
  }
}

function set_file_annotations_to_default_value(image_id) {
  var attr_id;
  for ( attr_id in _via_attributes['file'] ) {
    var attr_type = _via_attributes['file'][attr_id].type;
    switch( attr_type ) {
    case 'text':
      var default_value = _via_attributes['file'][attr_id].default_value;
      _via_img_metadata[image_id].file_attributes[attr_id] = default_value;
      break;
    case 'image':    // fallback
    case 'dropdown': // fallback
    case 'radio':
      _via_img_metadata[image_id].file_attributes[attr_id] = '';
      var default_options = _via_attributes['file'][attr_id].default_options;
      _via_img_metadata[image_id].file_attributes[attr_id] = Object.keys(default_options)[0];
      break;
    case 'checkbox':
      _via_img_metadata[image_id].file_attributes[attr_id] = {};
      var default_options = _via_attributes['file'][attr_id].default_options;
      var option_id;
      for ( option_id in default_options ) {
        var default_value = default_options[option_id];
        _via_img_metadata[image_id].file_attributes[attr_id][option_id] = default_value;
      }
      break;
    }
  }
}

function annotation_editor_increase_panel_height() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_height < 95 ) {
    _via_settings.ui.annotation_editor_height += VIA_ANNOTATION_EDITOR_HEIGHT_CHANGE;
    p.style.height = _via_settings.ui.annotation_editor_height + '%';
  }
}

function annotation_editor_decrease_panel_height() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_height > 10 ) {
    _via_settings.ui.annotation_editor_height -= VIA_ANNOTATION_EDITOR_HEIGHT_CHANGE;
    p.style.height = _via_settings.ui.annotation_editor_height + '%';
  }
}

function annotation_editor_increase_content_size() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_fontsize < 1.6 ) {
    _via_settings.ui.annotation_editor_fontsize += VIA_ANNOTATION_EDITOR_FONTSIZE_CHANGE;
    p.style.fontSize = _via_settings.ui.annotation_editor_fontsize + 'rem';
  }
}

function annotation_editor_decrease_content_size() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_fontsize > 0.4 ) {
    _via_settings.ui.annotation_editor_fontsize -= VIA_ANNOTATION_EDITOR_FONTSIZE_CHANGE;
    p.style.fontSize = _via_settings.ui.annotation_editor_fontsize + 'rem';
  }
}


var _via_last_selected_region_attribute = ''
var _via_last_selected_region = ''
function update_selected_region_attribute(e) {
  if (_via_last_selected_region == '') {
    _via_last_selected_region = e;
  }
  else {
    _via_last_selected_region.setAttribute('style', "background-color: linear-gradient(to right, #248af7dc, #0056b3);");
  }
  _via_last_selected_region_attribute = e.innerHTML;
  e.setAttribute('style' , "background-color: black");
  _via_last_selected_region = e;
  if (_via_current_shape == VIA_REGION_SHAPE.POSITIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.NEGATIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.BOX_PROMPT) {
    processSAMPrompts()
  }
}

var currentAttributeIndex = 0
function cycleRegionAttributes(attr_name1) {
  var attr_name = _via_current_attribute_id;
  var allRegionAttributes = Object.keys(_via_attributes.region)
  var regionAttributes = Object.keys(_via_attributes.region[attr_name].options);
  var numAttributes = regionAttributes.length;
  var regionType = _via_attributes.region[attr_name]['type']

  // Get the new attribute index
  currentAttributeIndex = (currentAttributeIndex + 1) % numAttributes;
  var newAttribute = regionAttributes[currentAttributeIndex];

  // Update the attribute for all selected regions
  _via_img_metadata[_via_image_id].regions.forEach((region, index) => {
    if (_via_region_selected_flag[index]) {
      if (regionType == 'radio'){
        region.region_attributes[attr_name] = newAttribute;
      }
    }
  });

  // Update the display or any necessary UI refresh
  var selectedCount = _via_img_metadata[_via_image_id].regions.filter(function(region, index) {
    return _via_region_selected_flag[index];
  }).length;
  return [selectedCount, _via_region_selected_flag];
}

var currentAttributeIndex = 0
function cycleFileAttributes(attr_name) {
  var allFileAttributes = Object.keys(_via_attributes.file)
  var fileAttributes = Object.keys(_via_attributes.file[attr_name].options);
  var numAttributes = fileAttributes.length;
  var fileType = _via_attributes.file[attr_name]['type']

  // Get the new attribute index
  currentAttributeIndex = (currentAttributeIndex + 1) % numAttributes;
  var newAttribute = fileAttributes[currentAttributeIndex];

  // Update the attribute for all selected regions
  if (fileType == 'radio') {
    _via_img_metadata[_via_image_id].file_attributes[attr_name] = newAttribute
  }

  // Update the display or any necessary UI refresh
}


var m_via_region_selected_flag = _via_region_selected_flag;
document.addEventListener('keydown', function(event) {
  if (event.key === '.') {
    if (is_annotation_editor_visible()) {
      var label_id = null
      if (_via_last_selected_region_attribute == '') {
        if (_via_current_attribute_id != '') {
          label_id = _via_current_attribute_id
        }
      }
      const [sel_count, m_via_region_selected_flag] = cycleRegionAttributes(label_id);
      show_message("Selected bounding boxes: " + sel_count);
      _via_region_selected_flag = m_via_region_selected_flag
      annotation_editor_update_content()

    }
  }
});

document.addEventListener('keydown', function(event) {
  if (event.key === '/') {
    if (is_annotation_editor_visible()) {
      cycleFileAttributes(_via_last_selected_region_attribute);
      annotation_editor_update_content()
    }
  }

});
