function _via_buffer_hide_current_image() {
    img_fn_list_ith_entry_selected(_via_image_index, false);
    _via_clear_reg_canvas(); // clear old region shapes
    if ( _via_current_image ) {
      _via_current_image.classList.remove('visible');
    }
  }
  
function _via_show_img_from_buffer(img_index) {
  return new Promise(function (ok_callback, err_callback) {
    _via_buffer_hide_current_image();

    var cimg_html_id = _via_img_buffer_get_html_id(img_index);
    _via_current_image = document.getElementById(cimg_html_id);
    if (!_via_current_image) {
      // the said image is not present in buffer, which could be because
      // the image got removed from the buffer
      err_callback(img_index);
      return;
    }
    _via_current_image.classList.add('visible'); // now show the new image

    _via_image_index = img_index;
    _via_image_id = _via_image_id_list[_via_image_index];
    _via_current_image_filename = _via_img_metadata[_via_image_id].filename;
    _via_current_image_loaded = true;

    var arr_index = _via_buffer_img_index_list.indexOf(img_index);
    _via_buffer_img_shown_timestamp[arr_index] = Date.now(); // update shown timestamp

    // update the current state of application
    _via_click_x0 = 0; _via_click_y0 = 0;
    _via_click_x1 = 0; _via_click_y1 = 0;
    _via_is_user_drawing_region = false;
    _via_is_window_resized = false;
    _via_is_user_resizing_region = false;
    _via_is_user_moving_region = false;
    _via_is_user_drawing_polygon = false;
    _via_is_region_selected = false;
    _via_user_sel_region_id = -1;
    _via_current_image_width = _via_current_image.naturalWidth;
    _via_current_image_height = _via_current_image.naturalHeight;

    if (_via_current_image_width === 0 || _via_current_image_height === 0) {
      // for error image icon
      _via_current_image_width = 640;
      _via_current_image_height = 480;
    }

    // set the size of canvas
    // based on the current dimension of browser window
    var de = document.documentElement;
    var image_panel_width = de.clientWidth - leftsidebar.clientWidth - 20;
    if (leftsidebar.style.display === 'none') {
      image_panel_width = de.clientWidth;
    }
    var image_panel_height = de.clientHeight - 2 * ui_top_panel.offsetHeight;

    var scale_width = image_panel_width / _via_current_image.naturalWidth;
    var scale_height = image_panel_height / _via_current_image.naturalHeight;
    var scale = Math.min(scale_width, scale_height);

    _via_canvas_width = Math.round(_via_current_image.naturalWidth * scale);
    _via_canvas_height = Math.round(_via_current_image.naturalHeight * scale);
    _via_canvas_scale = _via_current_image.naturalWidth / _via_canvas_width;
    _via_canvas_scale_without_zoom = _via_canvas_scale;
    set_all_canvas_size(_via_canvas_width, _via_canvas_height);

    // reset all regions to "not selected" state
    toggle_all_regions_selection(false);

    // ensure that all the canvas are visible
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE);

    // update img_fn_list
    img_fn_list_ith_entry_selected(_via_image_index, true);
    img_fn_list_scroll_to_current_file();

    // refresh the annotations panel
    annotation_editor_update_content();

    _via_load_canvas_regions(); // image to canvas space transform
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();

    // Preserve zoom level
    if (_via_is_canvas_zoomed) {
      set_zoom(_via_canvas_zoom_level_index);
    }
    ok_callback(img_index);
  });
}


var image_updated = false;

  
  
function _via_img_buffer_add_image(img_index) {
  return new Promise(async function(ok_callback, err_callback) {
    if (_via_buffer_img_index_list.includes(img_index)) {
      //console.log('_via_img_buffer_add_image(): image ' + img_index + ' already exists in buffer!')
      ok_callback(img_index);
      return;
    }

    var img_id = _via_image_id_list[img_index];
    var img_filename = _via_img_metadata[img_id].filename;
    if (!_via_img_metadata.hasOwnProperty(img_id)) {
      err_callback(img_index);
      return;
    }


    // check if user has given access to local file using
    // browser's file selector
    
    if (_via_img_fileref[img_id] instanceof File) {
      var tmp_file_object_url = await render(img_filename, 0, {});
      var img_id = _via_image_id_list[img_index];
      var bimg = document.createElement('img');
      bimg.setAttribute('id', _via_img_buffer_get_html_id(img_index));
      bimg.setAttribute('src', tmp_file_object_url);
      bimg.setAttribute('alt', 'Image loaded from base64 data of a local file selected by user.');
      bimg.addEventListener('error', function() {
        URL.revokeObjectURL(tmp_file_object_url);
        project_file_load_on_fail(img_index);
        err_callback(img_index);
      });
      bimg.addEventListener('load', function() {
        URL.revokeObjectURL(tmp_file_object_url);
        img_stat_set(img_index, [bimg.naturalWidth, bimg.naturalHeight]);
        _via_img_panel.insertBefore(bimg, _via_reg_canvas);
        project_file_load_on_success(img_index);
        img_fn_list_ith_entry_add_css_class(img_index, 'buffered')
        // add timestamp so that we can apply Least Recently Used (LRU)
        // scheme to remove elements when buffer is full
        var arr_index = _via_buffer_img_index_list.length;
        _via_buffer_img_index_list.push(img_index);
        _via_buffer_img_shown_timestamp[arr_index] = Date.now(); // though, not seen yet
        ok_callback(img_index);
      });
      return;
    }

    if (typeof(_via_img_src[img_id]) === 'undefined' || _via_img_src[img_id] === '') {
      err_callback(img_index);
    } else {
      var img_id = _via_image_id_list[img_index];

      var bimg = document.createElement('img');
      bimg.setAttribute('id', _via_img_buffer_get_html_id(img_index));
      _via_img_src[img_id] = _via_img_src[img_id].replace('#', '%23');
      try {
        // _via_img_src[img_id] = await render(_via_img_src[img_id])
        bimg.setAttribute('src', _via_img_src[img_id])
      } catch (error) {
        project_file_load_on_fail(img_index);
        err_callback(img_index);
        return;
      }
      if (_via_img_src[img_id].startsWith('data:image')) {
        bimg.setAttribute('alt', 'Source: image data in base64 format');
      } else {
        bimg.setAttribute('alt', 'Source: ' + _via_img_src[img_id]);
      }

      bimg.addEventListener('abort', function() {
        project_file_load_on_fail(img_index);
        err_callback(img_index);
      });
      bimg.addEventListener('error', function() {
        project_file_load_on_fail(img_index);
        err_callback(img_index);
      });

      // Note: _via_current_image.{naturalWidth,naturalHeight} is only accessible after
      // the "load" event. Therefore, all processing must happen inside this event handler.
      bimg.addEventListener('load', function() {
        img_stat_set(img_index, [bimg.naturalWidth, bimg.naturalHeight]);
        _via_img_panel.insertBefore(bimg, _via_reg_canvas);   
        project_file_load_on_success(img_index);
        img_fn_list_ith_entry_add_css_class(img_index, 'buffered')
        // add timestamp so that we can apply Least Recently Used (LRU)
        // scheme to remove elements when buffer is full
        var arr_index = _via_buffer_img_index_list.length;
        _via_buffer_img_index_list.push(img_index);
        _via_buffer_img_shown_timestamp[arr_index] = Date.now(); // though, not seen yet
        ok_callback(img_index);
      }, false);
    }
  }, false);
}


function _via_img_buffer_add_image_frame(img_index) {
  return new Promise(async function(ok_callback, err_callback) {
    if (_via_buffer_img_index_list.includes(img_index)) {
      //console.log('_via_img_buffer_add_image(): image ' + img_index + ' already exists in buffer!')
      ok_callback(img_index);
      return;
    }

    var img_id = _via_image_id_list[img_index];
    var img_filename = _via_img_metadata[img_id].filename;
    if (!_via_img_metadata.hasOwnProperty(img_id)) {
      err_callback(img_index);
      return;
    }

    var current_image = await set_current_image(img_filename, get_current_extra_params())
    var current_frame = current_image.last_viewed_frame
    var newImg = precached_bimg.get(current_image.frame_paths[current_frame]);
    if (newImg == null) {
      newImg = await render(img_filename, current_frame, get_current_extra_params());
      precached_bimg.set(current_image.frame_paths[current_frame], newImg);
    }

    var retry = 5
    var count = 0
    var bimg = document.createElement('img');
    bimg.setAttribute('id', _via_img_buffer_get_html_id(img_index));
    bimg.setAttribute('alt', 'Image is loaded from base64 data of a local file selected by user.');
    bimg.addEventListener('error', function() {
      bimg.setAttribute('alt', 'Image is loading in backend..... ');
      // retry thrice to load the image
      // bimg.setAttribute('src', newImg)
      // precached_bimg.set(current_image.frame_paths[current_frame], newImg);
      project_file_load_on_fail(img_index);
      err_callback(img_index);
    });
    bimg.addEventListener('load', function() {
      img_stat_set(img_index, [bimg.naturalWidth, bimg.naturalHeight]);
      _via_img_panel.insertBefore(bimg, _via_reg_canvas);
      project_file_load_on_success(img_index);
      img_fn_list_ith_entry_add_css_class(img_index, 'buffered')
      // add timestamp so that we can apply Least Recently Used (LRU)
      // scheme to remove elements when buffer is full
      var arr_index = _via_buffer_img_index_list.length;
      _via_buffer_img_index_list.push(img_index);
      _via_buffer_img_shown_timestamp[arr_index] = Date.now(); // though, not seen yet
      ok_callback(img_index);
    }, false);
    bimg.setAttribute('src', newImg)
    // check if user has given access to local file using
    // browser's file selector
  });
}


function _via_img_buffer_get_html_id(img_index) {
  return 'bim' + img_index;
}

function _via_img_buffer_get_html_id_frame(img_index, frame_num) {
  return 'bim' + img_index +'_' + frame_num;
}


function _via_img_buffer_parse_html_id(html_id) {
  return parseInt( html_id.substr(3) );
}

function _via_img_buffer_start_preload(img_index, preload_index) {
  return new Promise( function(ok_callback, err_callback) {
    _via_buffer_preload_img_index = img_index;
    _via_img_buffer_preload_img(_via_buffer_preload_img_index, 0).then( function(ok_img_index_list) {
      ok_callback(ok_img_index_list);
    });
  });
}

function _via_img_buffer_preload_img(img_index, preload_index) {
  return new Promise( function(ok_callback, err_callback) {
    var preload_img_index = _via_img_buffer_get_preload_img_index(img_index, preload_index);

    if ( _via_buffer_preload_img_index !== _via_image_index ) {
      ok_callback([]);
      return;
    }

    // ensure that there is sufficient buffer space left for preloading image
    if ( _via_buffer_img_index_list.length > _via_settings.core.buffer_size ) {
      while( _via_buffer_img_index_list.length > _via_settings.core.buffer_size ) {
        _via_img_buffer_remove_least_useful_img();
        if ( _via_image_index !== _via_buffer_preload_img_index ) {
          // current image has changed therefore, we need to cancel this preload operation
          ok_callback([]);
          return;
        }
      }
    }

    _via_img_buffer_add_image(preload_img_index).then( function(ok_img_index) {
      if ( _via_image_index !== _via_buffer_preload_img_index ) {
        ok_callback( [ok_img_index] );
        return;
      }

      var next_preload_index = preload_index + 1;
      if ( next_preload_index !== VIA_IMG_PRELOAD_COUNT ) {
        _via_img_buffer_preload_img(img_index, next_preload_index).then( function(ok_img_index_list) {
          ok_img_index_list.push( ok_img_index )
          ok_callback( ok_img_index_list );
        });
      } else {
        ok_callback( [ok_img_index] );
      }
    }, function(err_img_index) {
      // continue with preload of other images in sequence
      var next_preload_index = preload_index + 1;
      if ( next_preload_index !== VIA_IMG_PRELOAD_COUNT ) {
        _via_img_buffer_preload_img(img_index, next_preload_index).then( function(ok_img_index_list) {
          ok_callback( ok_img_index_list );
        });
      } else {
        ok_callback([]);
      }
    });
  });
}

function _via_img_buffer_get_preload_img_index(img_index, preload_index) {
  var preload_img_index = img_index + VIA_IMG_PRELOAD_INDICES[preload_index];
  if ( (preload_img_index < 0) || (preload_img_index >= _via_img_count) ) {
    if ( preload_img_index < 0 ) {
      preload_img_index = _via_img_count + preload_img_index;
    } else {
      preload_img_index = preload_img_index - _via_img_count;
    }
  }
  return preload_img_index;
}

// the least useful image is, one with the following properties:
// - preload list for current image will always get loaded, so there is no point in removing them from buffer
// - all the other images in buffer were seen more recently by the image
// - all the other images are closer (in terms of their image index) to the image currently being shown
function _via_img_buffer_remove_least_useful_img() {
  var not_in_preload_list = _via_buffer_img_not_in_preload_list();
  var oldest_buffer_index = _via_buffer_get_oldest_in_list(not_in_preload_list);

  if ( _via_buffer_img_index_list[oldest_buffer_index] !== _via_image_index ) {
    _via_buffer_remove(oldest_buffer_index);
  } else {
    var furthest_buffer_index = _via_buffer_get_buffer_furthest_from_current_img();
    _via_buffer_remove(furthest_buffer_index);
  }
}

function _via_buffer_remove( buffer_index ) {
  var img_index = _via_buffer_img_index_list[buffer_index];
  var bimg_html_id = _via_img_buffer_get_html_id(img_index);
  var bimg = document.getElementById(bimg_html_id);
  if ( bimg ) {
    _via_buffer_img_index_list.splice(buffer_index, 1);
    _via_buffer_img_shown_timestamp.splice(buffer_index, 1);
    _via_img_panel.removeChild(bimg);

    img_fn_list_ith_entry_remove_css_class(img_index, 'buffered')
  }
}

function _via_buffer_remove_all() {
  var i, n;
  n = _via_buffer_img_index_list.length;
  for ( i = 0 ; i < n; ++i ) {
    var img_index = _via_buffer_img_index_list[i];
    var bimg_html_id = _via_img_buffer_get_html_id(img_index);
    var bimg = document.getElementById(bimg_html_id);
    if ( bimg ) {
      _via_img_panel.removeChild(bimg);
    }
  }
  _via_buffer_img_index_list = [];
  _via_buffer_img_shown_timestamp = [];
}

function _via_buffer_get_oldest_in_list(not_in_preload_list) {
  var i;
  var n = not_in_preload_list.length;
  var oldest_buffer_index = -1;
  var oldest_buffer_timestamp = Date.now();

  for ( i = 0; i < n; ++i ) {
    var _via_buffer_index = not_in_preload_list[i];
    if ( _via_buffer_img_shown_timestamp[_via_buffer_index] < oldest_buffer_timestamp ) {
      oldest_buffer_timestamp = _via_buffer_img_shown_timestamp[i];
      oldest_buffer_index = i;
    }
  }
  return oldest_buffer_index;
}

function _via_buffer_get_buffer_furthest_from_current_img() {
  var now_img_index = _via_image_index;
  var i, dist1, dist2, dist;
  var n = _via_buffer_img_index_list.length;
  var furthest_buffer_index = 0;
  dist1 = Math.abs( _via_buffer_img_index_list[0] - now_img_index );
  dist2 = _via_img_count - dist1; // assuming the list is circular
  var furthest_buffer_dist = Math.min(dist1, dist2);

  for ( i = 1; i < n; ++i ) {
    dist1 = Math.abs( _via_buffer_img_index_list[i] - now_img_index );
    dist2 = _via_img_count - dist1; // assuming the list is circular
    dist = Math.min(dist1, dist2);
    // image has been seen by user at least once
    if ( dist > furthest_buffer_dist ) {
      furthest_buffer_dist = dist;
      furthest_buffer_index = i;
    }
  }
  return furthest_buffer_index;
}

function _via_buffer_img_not_in_preload_list() {
  var preload_list = _via_buffer_get_current_preload_list();
  var i;
  var not_in_preload_list = [];
  for ( i = 0; i < _via_buffer_img_index_list.length; ++i ) {
    if ( ! preload_list.includes( _via_buffer_img_index_list[i] ) ) {
      not_in_preload_list.push( i );
    }
  }
  return not_in_preload_list;
}

function _via_buffer_get_current_preload_list() {
  var i;
  var preload_list = [_via_image_index];
  var img_index = _via_image_index;
  for ( i = 0; i < VIA_IMG_PRELOAD_COUNT; ++i ) {
    var preload_index = img_index + VIA_IMG_PRELOAD_INDICES[i];
    if ( preload_index < 0 ) {
      preload_index = _via_img_count + preload_index;
    }
    if ( preload_index >= _via_img_count ) {
      preload_index = preload_index - _via_img_count;
    }
    preload_list.push(preload_index);
  }
  return preload_list;
}