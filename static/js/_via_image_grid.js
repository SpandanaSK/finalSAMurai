function image_grid_init() {
    var p = document.getElementById('image_grid_content');
    p.focus();
    p.addEventListener('mousedown', image_grid_mousedown_handler, false);
    p.addEventListener('mouseup', image_grid_mouseup_handler, false);
    p.addEventListener('dblclick', image_grid_dblclick_handler, false);

    image_grid_set_content_panel_height_fixed();

    // select policy as defined in settings
    var i, option;
    var p = document.getElementById('image_grid_show_image_policy');
    var n = p.options.length;
    for ( i = 0; i < n; ++i ) {
        if ( p.options[i].value === _via_settings.ui.image_grid.show_image_policy ) {
        p.selectedIndex = i;
        break;
        }
    }
}
  
  function image_grid_update() {
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      image_grid_set_content( _via_image_grid_img_index_list );
    }
  }
  
  function image_grid_toggle() {
    var p = document.getElementById('toolbar_image_grid_toggle');
    for (var key in _via_img_metadata) {
      if (_via_img_metadata.hasOwnProperty(key)) {
          // _via_img_src[key] = _via_img_metadata[key].filename;
          continue
      }
    } 
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      image_grid_clear_all_groups();
      show_single_image_view();
    } else {
      show_image_grid_view();
    }
  }
  
  function image_grid_show_all_project_images() {
    var all_img_index_list = [];
    var i, n;
    //n = _via_image_id_list.length;
    n = _via_img_fn_list_img_index_list.length;
    for ( i = 0; i < n; ++i ) {
      all_img_index_list.push( _via_img_fn_list_img_index_list[i] );
    }
    image_grid_clear_all_groups();
  
    var p = document.getElementById('image_grid_toolbar_group_by_select');
    p.selectedIndex = 0;
  
    image_grid_set_content(all_img_index_list);
  }
  
  function image_grid_clear_all_groups() {
    var i, n;
    n = _via_image_grid_group_var.length;
    for ( i = 0; i < n; ++i ) {
      image_grid_remove_html_group_panel( _via_image_grid_group_var[i] );
      image_grid_group_by_select_set_disabled( _via_image_grid_group_var[i].type,
                                               _via_image_grid_group_var[i].name,
                                               false);
    }
    _via_image_grid_group = {};
    _via_image_grid_group_var = [];
  
  }
  
  function image_grid_set_content(img_index_list) {
    if ( img_index_list.length === 0 ) {
      return;
    }
    if ( _via_image_grid_load_ongoing ) {
      return;
    }
  
    _via_image_grid_img_index_list = img_index_list.slice(0);
    _via_image_grid_selected_img_index_list = img_index_list.slice(0);
  
    document.getElementById('image_grid_group_by_img_count').innerHTML = _via_image_grid_img_index_list.length;
  
    _via_image_grid_page_first_index    = 0;
    _via_image_grid_page_last_index     = null;
    _via_image_grid_stack_prev_page     = [];
    _via_image_grid_page_img_index_list = [];
  
    image_grid_clear_content();
    image_grid_set_content_panel_height_fixed();
    _via_image_grid_load_ongoing = true;
  
    var n = _via_image_grid_img_index_list.length;
    switch ( _via_settings.ui.image_grid.show_image_policy ) {
    case 'all':
      _via_image_grid_page_img_index_list = _via_image_grid_img_index_list.slice(0);
      console.log(_via_image_grid_page_img_index_list)
      break;
    case 'first_mid_last':
      if ( n < 3 ) {
        var i;
        for ( i = 0; i < n; ++i ) {
          _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[i] );
        }
      } else {
        _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[0] );
        _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[ Math.floor(n/2) ] );
        _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[n-1] );
      }
      break;
    case 'even_indexed':
      var i;
      for ( i = 0; i < n; ++i ) {
        if ( i % 2 !== 0 ) { // since the user views (i+1) based indexing
          _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[i] );
        }
      }
      break;
    case 'odd_indexed':
      var i;
      for ( i = 0; i < n; ++i ) {
        if ( i % 2 === 0 ) { // since the user views (i+1) based indexing
          _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[i] );
        }
      }
      break;
    case 'gap5':  // fallback
    case 'gap25': // fallback
    case 'gap50': // fallback
      var del = parseInt( _via_settings.ui.image_grid.show_image_policy.substr( 'gap'.length ) );
      var i;
      for ( i = 0; i < n; i = i + del ) {
        _via_image_grid_page_img_index_list.push( _via_image_grid_img_index_list[i] );
      }
      break;
    }
  
    _via_image_grid_visible_img_index_list = [];
  
    image_grid_update_sel_count_html();
    annotation_editor_update_content();
  
    image_grid_content_append_img( _via_image_grid_page_first_index );
  
    show_message('[Click] toggles selection, ' +
                 '[Shift + Click] selects everything a image, ' +
                 '[Click] or [Ctrl + Click] removes selection of all subsequent or preceeding images.');
  }
  
  function image_grid_clear_content() {
    var img_container = document.getElementById('image_grid_content_img');
    var img_rshape = document.getElementById('image_grid_content_rshape');
    img_container.innerHTML = '';
    img_rshape.innerHTML = '';
    _via_image_grid_visible_img_index_list = [];
  }
  
  function image_grid_set_content_panel_height_fixed() {
    var pc = document.getElementById('image_grid_content');
    var de = document.documentElement;
    pc.style.height = (de.clientHeight - 5.5*ui_top_panel.offsetHeight) + 'px';
  }
  
  // We do not know how many images will fit in the display area.
  // Therefore, we add images one-by-one until overflow of parent
  // container is detected.
  function image_grid_content_append_img( img_grid_index ) {
    var img_index   = _via_image_grid_page_img_index_list[img_grid_index];
    var html_img_id = image_grid_get_html_img_id(img_index);
    var img_id      = _via_image_id_list[img_index];
    var e = document.createElement('img');
    if ( _via_img_fileref[img_id] instanceof File ) {
      var img_reader = new FileReader();
      img_reader.addEventListener( "error", function() {
        //@todo
      }, false);
      img_reader.addEventListener( "load", function() {
        e.src = img_reader.result;
      }, false);
      console.log( _via_img_fileref[img_id])
      img_reader.readAsDataURL( _via_img_fileref[img_id] );
    } else {
      e.src = _via_img_src[img_id];
    }
    e.setAttribute('id', html_img_id);
    e.setAttribute('height', _via_settings.ui.image_grid.img_height + 'px');
    e.setAttribute('title', '[' + (img_index+1) + '] ' + _via_img_metadata[img_id].filename);
  
    e.addEventListener('load', image_grid_on_img_load, false);
    e.addEventListener('error', image_grid_on_img_error, false);
    document.getElementById('image_grid_content_img').appendChild(e);
  }
  
  function image_grid_on_img_load(e) {
    var img = e.target;
    var img_index = image_grid_parse_html_img_id(img.id);
    project_file_load_on_success(img_index);
  
    image_grid_add_img_if_possible(img);
  }
  
  function image_grid_on_img_error(e) {
    var img       = e.target;
    var img_index = image_grid_parse_html_img_id(img.id);
    project_file_load_on_fail(img_index);
    image_grid_add_img_if_possible(img);
  }
  
  function image_grid_add_img_if_possible(img) {
    var img_index = image_grid_parse_html_img_id(img.id);
  
    var p = document.getElementById('image_grid_content_img');
    var img_bottom_right_corner = parseInt(img.offsetTop) + parseInt(img.height);
    if ( p.clientHeight < img_bottom_right_corner ) {
      // stop as addition of this image caused overflow of parent container
      var img_container = document.getElementById('image_grid_content_img');
      img_container.removeChild(img);
  
      if ( _via_settings.ui.image_grid.show_region_shape ) {
        image_grid_page_show_all_regions();
      }
      _via_image_grid_load_ongoing = false;
  
      var index = _via_image_grid_page_img_index_list.indexOf(img_index);
      _via_image_grid_page_last_index = index;
  
      // setup prev, next navigation
      var info = document.getElementById('image_grid_nav');
      var html = [];
      var first_index = _via_image_grid_page_first_index;
      var last_index  = _via_image_grid_page_last_index - 1;
      html.push('<span>Showing&nbsp;' + (first_index + 1) +
                ' to ' + (last_index + 1) + '&nbsp;:</span>');
      if ( _via_image_grid_stack_prev_page.length ) {
        html.push('<span class="text_button" onclick="image_grid_page_prev()">Prev</span>');
      } else {
        html.push('<span>Prev</span>');
      }
      html.push('<span class="text_button" onclick="image_grid_page_next()">Next</span');
      info.innerHTML = html.join('');
    } else {
      // process this image and trigger addition of next image in sequence
      var img_fn_list_index = _via_image_grid_page_img_index_list.indexOf(img_index);
      var next_img_fn_list_index = img_fn_list_index + 1;
  
      _via_image_grid_visible_img_index_list.push( img_index );
      var is_selected = ( _via_image_grid_selected_img_index_list.indexOf(img_index) !== -1 );
      if ( ! is_selected ) {
        image_grid_update_img_select(img_index, 'unselect');
      }
  
      if ( next_img_fn_list_index !==  _via_image_grid_page_img_index_list.length ) {
        if ( _via_image_grid_load_ongoing ) {
          image_grid_content_append_img( img_fn_list_index + 1 );
        } else {
          // image grid load operation was cancelled
          _via_image_grid_page_last_index = _via_image_grid_page_first_index; // load this page again
  
          var info = document.getElementById('image_grid_nav');
          var html = [];
          html.push('<span>Cancelled&nbsp;:</span>');
          if ( _via_image_grid_stack_prev_page.length ) {
            html.push('<span class="text_button" onclick="image_grid_page_prev()">Prev</span>');
          } else {
            html.push('<span>Prev</span>');
          }
          html.push('<span class="text_button" onclick="image_grid_page_next()">Next</span');
          info.innerHTML = html.join('');
        }
      } else {
        // last page
        var index = _via_image_grid_page_img_index_list.indexOf(img_index);
        _via_image_grid_page_last_index = index;
  
        if ( _via_settings.ui.image_grid.show_region_shape ) {
          image_grid_page_show_all_regions();
        }
        _via_image_grid_load_ongoing = false;
  
        // setup prev, next navigation
        var info = document.getElementById('image_grid_nav');
        var html = [];
        var first_index = _via_image_grid_page_first_index;
        var last_index  = _via_image_grid_page_last_index;
        html.push('<span>Showing&nbsp;' + (first_index + 1) +
                  ' to ' + (last_index + 1) + ' (end)&nbsp;</span>');
        if ( _via_image_grid_stack_prev_page.length ) {
          html.push('<span class="text_button" onclick="image_grid_page_prev()">Prev</span>');
        } else {
          html.push('<span>Prev</span>');
        }
        html.push('<span>Next</span');
  
        info.innerHTML = html.join('');
      }
    }
  }
  
  function image_grid_onchange_show_image_policy(p) {
    _via_settings.ui.image_grid.show_image_policy = p.options[p.selectedIndex].value;
    image_grid_set_content(_via_image_grid_img_index_list);
  }
  
  function image_grid_page_show_all_regions() {
    var all_promises = [];
    if ( _via_settings.ui.image_grid.show_region_shape ) {
      var p = document.getElementById('image_grid_content_img');
      var n = p.childNodes.length;
      var i;
      for ( i = 0; i < n; ++i ) {
        // draw region shape into global canvas for image grid
        var img_index = image_grid_parse_html_img_id( p.childNodes[i].id );
        var img_param = []; // [width, height, originalWidth, originalHeight, x, y]
        img_param.push( parseInt(p.childNodes[i].width) );
        img_param.push( parseInt(p.childNodes[i].height) );
        img_param.push( parseInt(p.childNodes[i].naturalWidth) );
        img_param.push( parseInt(p.childNodes[i].naturalHeight) );
        img_param.push( parseInt(p.childNodes[i].offsetLeft) + parseInt(p.childNodes[i].clientLeft) );
        img_param.push( parseInt(p.childNodes[i].offsetTop) + parseInt(p.childNodes[i].clientTop) );
        var promise = image_grid_show_region_shape( img_index, img_param );
        all_promises.push( promise );
      }
      // @todo: ensure that all promises are fulfilled
    }
  }
  
  function image_grid_is_region_in_current_group(r) {
    var i, n;
    n = _via_image_grid_group_var.length;
    if ( n === 0 ) {
      return true;
    }
  
    for ( i = 0; i < n; ++i ) {
      if ( _via_image_grid_group_var[i].type === 'region' ) {
        var group_value = _via_image_grid_group_var[i].values[ _via_image_grid_group_var[i].current_value_index ];
        if ( r[_via_image_grid_group_var[i].name] != group_value ) {
          return false;
        }
      }
    }
    return true;
  }
  
  function image_grid_show_region_shape(img_index, img_param) {
    return new Promise( function(ok_callback, err_callback) {
      var i;
      var img_id = _via_image_id_list[img_index];
      var html_img_id = image_grid_get_html_img_id(img_index);
      var n = _via_img_metadata[img_id].regions.length;
      var is_in_group = false;
      for ( i = 0; i < n; ++i ) {
        if ( ! image_grid_is_region_in_current_group( _via_img_metadata[img_id].regions[i].region_attributes ) ) {
          // skip drawing this region which is not in current group
          continue;
        }
  
        var r = _via_img_metadata[img_id].regions[i].shape_attributes;
        var dimg; // region coordinates in original image space
        switch( r.name ) {
        case VIA_REGION_SHAPE.RECT:
          dimg = [ r['x'], r['y'], r['x']+r['width'], r['y']+r['height'] ];
          break;
        case VIA_REGION_SHAPE.BOX_PROMPT:
          dimg = [ r['x'], r['y'], r['x']+r['width'], r['y']+r['height'] ];
          break;
        case VIA_REGION_SHAPE.CIRCLE:
          dimg = [ r['cx'], r['cy'], r['cx']+r['r'], r['cy']+r['r'] ];
          break;
        case VIA_REGION_SHAPE.ELLIPSE:
          dimg = [ r['cx'], r['cy'], r['cx']+r['rx'], r['cy']+r['ry'] ];
          break;
        case VIA_REGION_SHAPE.POLYLINE: // handled by POLYGON
        case VIA_REGION_SHAPE.POLYGON:
          var j;
          dimg = [];
          for ( j = 0; j < r['all_points_x'].length; ++j ) {
            dimg.push( r['all_points_x'][j] );
            dimg.push( r['all_points_y'][j] );
          }
          break;
        case VIA_REGION_SHAPE.POINT:
          dimg = [ r['cx'], r['cy'] ];
          break;
        }
        var scale_factor = img_param[1] / img_param[3]; // new_height / original height
        var offset_x     = img_param[4];
        var offset_y     = img_param[5];
        var r2 = new _via_region( r.name, i, dimg, scale_factor, offset_x, offset_y);
        var r2_svg = r2.get_svg_element();
        r2_svg.setAttribute('id', image_grid_get_html_region_id(img_index, i));
        r2_svg.setAttribute('class', html_img_id);
        r2_svg.setAttribute('fill',         _via_settings.ui.image_grid.rshape_fill);
        //r2_svg.setAttribute('fill-opacity', _via_settings.ui.image_grid.rshape_fill_opacity);
        r2_svg.setAttribute('stroke',       _via_settings.ui.image_grid.rshape_stroke);
        r2_svg.setAttribute('stroke-width', _via_settings.ui.image_grid.rshape_stroke_width);
  
        document.getElementById('image_grid_content_rshape').appendChild(r2_svg);
      }
    });
  }
  
  function image_grid_image_size_increase() {
    var new_img_height = _via_settings.ui.image_grid.img_height + VIA_IMAGE_GRID_IMG_HEIGHT_CHANGE;
    _via_settings.ui.image_grid.img_height = new_img_height;
  
    _via_image_grid_page_last_index = null;
    image_grid_update();
  }
  
  function image_grid_image_size_decrease() {
    var new_img_height = _via_settings.ui.image_grid.img_height - VIA_IMAGE_GRID_IMG_HEIGHT_CHANGE;
    if ( new_img_height > 1 ) {
      _via_settings.ui.image_grid.img_height = new_img_height;
      _via_image_grid_page_last_index = null;
      image_grid_update();
    }
  }
  
  function image_grid_image_size_reset() {
    var new_img_height = _via_settings.ui.image_grid.img_height;
    if ( new_img_height > 1 ) {
      _via_settings.ui.image_grid.img_height = new_img_height;
      _via_image_grid_page_last_index = null;
      image_grid_update();
    }
  }
  
  function image_grid_mousedown_handler(e) {
    e.preventDefault();
    _via_image_grid_mousedown_img_index = image_grid_parse_html_img_id(e.target.id);
  }
  
  function image_grid_mouseup_handler(e) {
    e.preventDefault();
    var last_mouseup_img_index = _via_image_grid_mouseup_img_index;
    _via_image_grid_mouseup_img_index = image_grid_parse_html_img_id(e.target.id);
    if ( isNaN(_via_image_grid_mousedown_img_index) ||
         isNaN(_via_image_grid_mouseup_img_index)) {
      last_mouseup_img_index = _via_image_grid_img_index_list[0];
      image_grid_group_select_none();
      return;
    }
  
    var mousedown_img_arr_index = _via_image_grid_img_index_list.indexOf(_via_image_grid_mousedown_img_index);
    var mouseup_img_arr_index = _via_image_grid_img_index_list.indexOf(_via_image_grid_mouseup_img_index);
  
    var start = -1;
    var end   = -1;
    var operation = 'select'; // {'select', 'unselect', 'toggle'}
    if ( mousedown_img_arr_index === mouseup_img_arr_index ) {
      if ( e.shiftKey ) {
        // select all elements until this element
        start = _via_image_grid_img_index_list.indexOf(last_mouseup_img_index) + 1;
        end   = mouseup_img_arr_index + 1;
      } else {
        // toggle selection of single image
        start = mousedown_img_arr_index;
        end   = start + 1;
        operation = 'toggle';
      }
    } else {
      if ( mousedown_img_arr_index < mouseup_img_arr_index ) {
        start = mousedown_img_arr_index;
        end   = mouseup_img_arr_index + 1;
      } else {
        start = mouseup_img_arr_index + 1;
        end   = mousedown_img_arr_index;
      }
      operation = 'toggle';
    }
  
    if ( start > end ) {
      return;
    }
  
    var i, img_index;
    for ( i = start; i < end; ++i ) {
      img_index = _via_image_grid_img_index_list[i];
      image_grid_update_img_select(img_index, operation);
    }
    image_grid_update_sel_count_html();
    annotation_editor_update_content();
  }
  
  function image_grid_update_sel_count_html() {
    document.getElementById('image_grid_group_by_sel_img_count').innerHTML = _via_image_grid_selected_img_index_list.length;
  }
  
  // state \in {'select', 'unselect', 'toggle'}
  function image_grid_update_img_select(img_index, state) {
    var html_img_id = image_grid_get_html_img_id(img_index);
    var is_selected = ( _via_image_grid_selected_img_index_list.indexOf(img_index) !== -1 );
    if (state === 'toggle' ) {
      if ( is_selected ) {
        state = 'unselect';
      } else {
        state = 'select';
      }
    }
  
    switch(state) {
    case 'select':
      if ( ! is_selected ) {
        _via_image_grid_selected_img_index_list.push(img_index);
      }
      if ( _via_image_grid_visible_img_index_list.indexOf(img_index) !== -1 ) {
        document.getElementById(html_img_id).classList.remove('not_sel');
      }
      break;
    case 'unselect':
      if ( is_selected ) {
        var arr_index = _via_image_grid_selected_img_index_list.indexOf(img_index);
        _via_image_grid_selected_img_index_list.splice(arr_index, 1);
      }
      if ( _via_image_grid_visible_img_index_list.indexOf(img_index) !== -1 ) {
        document.getElementById(html_img_id).classList.add('not_sel');
      }
      break;
    }
  }
  
  function image_grid_group_select_all() {
    image_grid_group_set_all_selection_state('select');
    image_grid_update_sel_count_html();
    annotation_editor_update_content();
    show_message('Selected all images in the current group');
  }
  
  function image_grid_group_select_none() {
    image_grid_group_set_all_selection_state('unselect');
    image_grid_update_sel_count_html();
    annotation_editor_update_content();
    show_message('Removed selection of all images in the current group');
  }
  
  function image_grid_group_set_all_selection_state(state) {
    var i, img_index;
    for ( i = 0; i < _via_image_grid_img_index_list.length; ++i ) {
      img_index = _via_image_grid_img_index_list[i];
      image_grid_update_img_select(img_index, state);
    }
  }
  
  function image_grid_group_toggle_select_all() {
    if ( _via_image_grid_selected_img_index_list.length === _via_image_grid_img_index_list.length ) {
      image_grid_group_select_none();
    } else {
      image_grid_group_select_all();
    }
  }
  
  function image_grid_parse_html_img_id(html_img_id) {
    var img_index = html_img_id.substr(2);
    return parseInt(img_index);
  }
  
  function image_grid_get_html_img_id(img_index) {
    return 'im' + img_index;
  }
  
  function image_grid_parse_html_region_id(html_region_id) {
    var chunks = html_region_id.split('_');
    if ( chunks.length === 2 ) {
      var img_index = parseInt(chunks[0].substr(2));
      var region_id = parseInt(chunks[1].substr(2));
      return {'img_index':img_index, 'region_id':region_id};
    } else {
      console.log('image_grid_parse_html_region_id(): invalid html_region_id');
      return {};
    }
  }
  
  function image_grid_get_html_region_id(img_index, region_id) {
    return image_grid_get_html_img_id(img_index) + '_rs' + region_id;
  }
  
  function image_grid_dblclick_handler(e) {
    _via_image_index = image_grid_parse_html_img_id(e.target.id);
    show_single_image_view();
  }
  
  function image_grid_toolbar_update_group_by_select() {
    var p = document.getElementById('image_grid_toolbar_group_by_select');
    p.innerHTML = '';
  
    var o = document.createElement('option');
    o.setAttribute('value', '');
    o.setAttribute('selected', 'selected');
    o.innerHTML = 'All Images';
    p.appendChild(o);
  
    // add file attributes
    var fattr;
    for ( fattr in _via_attributes['file'] ) {
      var o = document.createElement('option');
      o.setAttribute('value', image_grid_toolbar_group_by_select_get_html_id('file', fattr));
      o.innerHTML = '[file] ' + fattr;
      p.appendChild(o);
    }
  
    // add region attributes
    var rattr;
    for ( rattr in _via_attributes['region'] ) {
      var o = document.createElement('option');
      o.setAttribute('value', image_grid_toolbar_group_by_select_get_html_id('region', rattr));
      o.innerHTML = '[region] ' + rattr;
      p.appendChild(o);
    }
  }
  
  function image_grid_toolbar_group_by_select_get_html_id(type, name) {
    if ( type === 'file' ) {
      return 'f_' + name;
    }
    if ( type === 'region' ) {
      return 'r_' + name;
    }
  }
  
  function image_grid_toolbar_group_by_select_parse_html_id(id) {
    if ( id.startsWith('f_') ) {
      return { 'attr_type':'file', 'attr_name':id.substr(2) };
    }
    if ( id.startsWith('r_') ) {
      return { 'attr_type':'region', 'attr_name':id.substr(2) };
    }
  }
  
  function image_grid_toolbar_onchange_group_by_select(p) {
    if ( p.options[p.selectedIndex].value === '' ) {
      image_grid_show_all_project_images();
      return;
    }
  
    var v = image_grid_toolbar_group_by_select_parse_html_id( p.options[p.selectedIndex].value );
    var attr_type = v.attr_type;
    var attr_name = v.attr_name;
    image_grid_group_by(attr_type, attr_name);
  
    image_grid_group_by_select_set_disabled(attr_type, attr_name, true);
    p.blur(); // to avoid adding new groups using keyboard keys as dropdown is still in focus
  }
  
  function image_grid_remove_html_group_panel(d) {
    var p = document.getElementById('group_toolbar_' + d.group_index);
    document.getElementById('image_grid_group_panel').removeChild(p);
  }
  
  function image_grid_add_html_group_panel(d) {
    var p = document.createElement('div');
    p.classList.add('image_grid_group_toolbar');
    p.setAttribute('id', 'group_toolbar_' + d.group_index);
  
    var del = document.createElement('span');
    del.classList.add('text_button');
    del.setAttribute('onclick', 'image_grid_remove_group_by(this)');
    del.innerHTML = '&times;';
    p.appendChild(del);
  
    var prev = document.createElement('button');
    prev.innerHTML = '<';
    prev.setAttribute('value', d.group_index);
    prev.setAttribute('onclick', 'image_grid_group_prev(this)');
    p.appendChild(prev);
  
    var sel = document.createElement('select');
    sel.setAttribute('id', image_grid_group_select_get_html_id(d.group_index));
    sel.setAttribute('onchange', 'image_grid_group_value_onchange(this)');
    var i, value;
    var n = d.values.length;
    var current_value = d.values[ d.current_value_index ];
    for ( i = 0; i < n; ++i ) {
      value = d.values[i];
      var o = document.createElement('option');
      o.setAttribute('value', value);
      o.innerHTML = (i+1) + '/' + n + ': ' + d.name + ' = ' + value;
      if ( value === current_value ) {
        o.setAttribute('selected', 'selected');
      }
  
      sel.appendChild(o);
    }
    p.appendChild(sel);
  
    var next = document.createElement('button');
    next.innerHTML = '>';
    next.setAttribute('value', d.group_index);
    next.setAttribute('onclick', 'image_grid_group_next(this)');
    p.appendChild(next);
  
    document.getElementById('image_grid_group_panel').appendChild(p);
  }
  
  function image_grid_group_panel_set_selected_value(group_index) {
    var sel = document.getElementById(image_grid_group_select_get_html_id(group_index));
    sel.selectedIndex = _via_image_grid_group_var[group_index].current_value_index;
  }
  
  function image_grid_group_panel_set_options(group_index) {
    var sel = document.getElementById(image_grid_group_select_get_html_id(group_index));
    sel.innerHTML = '';
  
    var i, value;
    var n = _via_image_grid_group_var[group_index].values.length;
    var name = _via_image_grid_group_var[group_index].name;
    var current_value = _via_image_grid_group_var[group_index].values[ _via_image_grid_group_var[group_index].current_value_index ]
    for ( i = 0; i < n; ++i ) {
      value = _via_image_grid_group_var[group_index].values[i];
      var o = document.createElement('option');
      o.setAttribute('value', value);
      o.innerHTML = (i+1) + '/' + n + ': ' + name + ' = ' + value;
      if ( value === current_value ) {
        o.setAttribute('selected', 'selected');
      }
      sel.appendChild(o);
    }
  }
  
  function image_grid_group_select_get_html_id(group_index) {
    return 'gi_' + group_index;
  }
  
  function image_grid_group_select_parse_html_id(id) {
    return parseInt(id.substr(3));
  }
  
  function image_grid_group_by_select_set_disabled(type, name, is_disabled) {
    var p = document.getElementById('image_grid_toolbar_group_by_select');
    var sel_option_value = image_grid_toolbar_group_by_select_get_html_id(type, name);
  
    var n = p.options.length;
    var option_value;
    var i;
    for ( i = 0; i < n; ++i ) {
      if ( sel_option_value === p.options[i].value ) {
        if ( is_disabled ) {
          p.options[i].setAttribute('disabled', 'disabled');
        } else {
          p.options[i].removeAttribute('disabled');
        }
        break;
      }
    }
  }
  
  function image_grid_remove_group_by(p) {
    var prefix = 'group_toolbar_';
    var group_index = parseInt( p.parentNode.id.substr( prefix.length ) );
  
    if ( group_index === 0 ) {
      image_grid_show_all_project_images();
    } else {
      // merge all groups that are child of group_index
      image_grid_group_by_merge(_via_image_grid_group, 0, group_index);
  
      var n = _via_image_grid_group_var.length;
      var p = document.getElementById('image_grid_group_panel');
      var group_panel_id;
      var i;
      for ( i = group_index; i < n; ++i ) {
        image_grid_remove_html_group_panel( _via_image_grid_group_var[i] );
        image_grid_group_by_select_set_disabled( _via_image_grid_group_var[i].type,
                                                 _via_image_grid_group_var[i].name,
                                                 false);
      }
      _via_image_grid_group_var.splice(group_index);
  
      image_grid_set_content_to_current_group();
    }
  }
  
  function image_grid_group_by(type, name) {
    if ( Object.keys(_via_image_grid_group).length === 0 ) {
      // first group
      var img_index_array = [];
      var n = _via_img_fn_list_img_index_list.length;
      var i;
      for ( i = 0; i < n; ++i ) {
        img_index_array.push( _via_img_fn_list_img_index_list[i] );
      }
  
      _via_image_grid_group = image_grid_split_array_to_group(img_index_array, type, name);
      var new_group_values = Object.keys(_via_image_grid_group);
      _via_image_grid_group_var = [];
      _via_image_grid_group_var.push( { 'type':type, 'name':name, 'current_value_index':0, 'values':new_group_values, 'group_index':0 } );
  
      image_grid_add_html_group_panel(_via_image_grid_group_var[0]);
    } else {
      image_grid_group_split_all_arrays( _via_image_grid_group, type, name );
  
      var i, n, value;
      var current_group_value = _via_image_grid_group;
      n = _via_image_grid_group_var.length;
  
      for ( i = 0; i < n; ++i ) {
        value = _via_image_grid_group_var[i].values[ _via_image_grid_group_var[i].current_value_index ];
        current_group_value = current_group_value[ value ];
      }
      var new_group_values = Object.keys(current_group_value);
      var group_var_index = _via_image_grid_group_var.length;
      _via_image_grid_group_var.push( { 'type':type, 'name':name, 'current_value_index':0, 'values':new_group_values, 'group_index':group_var_index } );
      image_grid_add_html_group_panel( _via_image_grid_group_var[group_var_index] );
    }
  
    image_grid_set_content_to_current_group();
  }
  
  function image_grid_group_by_merge(group, current_level, target_level) {
    var child_value;
    var group_data = [];
    if ( current_level === target_level ) {
      return image_grid_group_by_collapse(group);
    } else {
      for ( child_value in group ) {
        group[child_value] = image_grid_group_by_merge(group[child_value], current_level + 1, target_level);
      }
    }
  }
  
  function image_grid_group_by_collapse(group) {
    var child_value;
    var child_collapsed_value;
    var group_data = [];
    for ( child_value in group ) {
      if ( Array.isArray(group[child_value]) ) {
        group_data = group_data.concat(group[child_value]);
      } else {
        group_data = group_data.concat(image_grid_group_by_collapse(group[child_value]));
      }
    }
    return group_data;
  }
  
  // recursively collapse all arrays to list
  function image_grid_group_split_all_arrays(group, type, name) {
    if ( Array.isArray(group) ) {
      return image_grid_split_array_to_group(group, type, name);
    } else {
      var group_value;
      for ( group_value in group ) {
        if ( Array.isArray( group[group_value] ) ) {
          group[group_value] = image_grid_split_array_to_group(group[group_value], type, name);
        } else {
          image_grid_group_split_all_arrays(group[group_value], type, name);
        }
      }
    }
  }
  
  function image_grid_split_array_to_group(img_index_array, attr_type, attr_name) {
    var grp = {};
    var img_index, img_id, i;
    var n = img_index_array.length;
    var attr_value;
  
    switch(attr_type) {
    case 'file':
      for ( i = 0; i < n; ++i ) {
        img_index = img_index_array[i];
        img_id = _via_image_id_list[img_index];
        if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_name) ) {
          attr_value = _via_img_metadata[img_id].file_attributes[attr_name];
  
          if ( ! grp.hasOwnProperty(attr_value) ) {
            grp[attr_value] = [];
          }
          grp[attr_value].push(img_index);
        }
      }
      break;
    case 'region':
      var j;
      var region_count;
      for ( i = 0; i < n; ++i ) {
        img_index    = img_index_array[i];
        img_id       = _via_image_id_list[img_index];
        region_count = _via_img_metadata[img_id].regions.length;
        for ( j = 0; j < region_count; ++j ) {
          if ( _via_img_metadata[img_id].regions[j].region_attributes.hasOwnProperty(attr_name) ) {
            attr_value = _via_img_metadata[img_id].regions[j].region_attributes[attr_name];
  
            if ( ! grp.hasOwnProperty(attr_value) ) {
              grp[attr_value] = [];
            }
            if ( grp[attr_value].includes(img_index) ) {
              continue;
            } else {
              grp[attr_value].push(img_index);
            }
          }
        }
      }
      break;
    }
    return grp;
  }
  
  function image_grid_group_next(p) {
    var group_index = parseInt( p.value );
    var group_value_list = _via_image_grid_group_var[group_index].values;
    var n = group_value_list.length;
    var current_index = _via_image_grid_group_var[group_index].current_value_index;
    var next_index = current_index + 1;
    if ( next_index >= n ) {
      if ( group_index === 0 ) {
        next_index = next_index - n;
        image_grid_jump_to_group(group_index, next_index);
      } else {
        // next of parent group
        var parent_group_index = group_index - 1;
        var parent_current_val_index = _via_image_grid_group_var[parent_group_index].current_value_index;
        var parent_next_val_index = parent_current_val_index + 1;
        while ( parent_group_index !== 0 ) {
          if ( parent_next_val_index >= _via_image_grid_group_var[parent_group_index].values.length ) {
            parent_group_index = group_index - 1;
            parent_current_val_index = _via_image_grid_group_var[parent_group_index].current_value_index;
            parent_next_val_index = parent_current_val_index + 1;
          } else {
            break;
          }
        }
  
        if ( parent_next_val_index >= _via_image_grid_group_var[parent_group_index].values.length ) {
          parent_next_val_index = 0;
        }
        image_grid_jump_to_group(parent_group_index, parent_next_val_index);
      }
    } else {
      image_grid_jump_to_group(group_index, next_index);
    }
    image_grid_set_content_to_current_group();
  }
  
  function image_grid_group_prev(p) {
    var group_index = parseInt( p.value );
    var group_value_list = _via_image_grid_group_var[group_index].values;
    var n = group_value_list.length;
    var current_index = _via_image_grid_group_var[group_index].current_value_index;
    var prev_index = current_index - 1;
    if ( prev_index < 0 ) {
      if ( group_index === 0 ) {
        prev_index = n + prev_index;
        image_grid_jump_to_group(group_index, prev_index);
      } else {
        // prev of parent group
        var parent_group_index = group_index - 1;
        var parent_current_val_index = _via_image_grid_group_var[parent_group_index].current_value_index;
        var parent_prev_val_index = parent_current_val_index - 1;
        while ( parent_group_index !== 0 ) {
          if ( parent_prev_val_index < 0 ) {
            parent_group_index = group_index - 1;
            parent_current_val_index = _via_image_grid_group_var[parent_group_index].current_value_index;
            parent_prev_val_index = parent_current_val_index - 1;
          } else {
            break;
          }
        }
  
        if ( parent_prev_val_index < 0 ) {
          parent_prev_val_index = _via_image_grid_group_var[parent_group_index].values.length - 1;
        }
        image_grid_jump_to_group(parent_group_index, parent_prev_val_index);
      }
    } else {
      image_grid_jump_to_group(group_index, prev_index);
    }
    image_grid_set_content_to_current_group();
  }
  
  
  function image_grid_group_value_onchange(p) {
    var group_index = image_grid_group_select_parse_html_id(p.id);
    image_grid_jump_to_group(group_index, p.selectedIndex);
    image_grid_set_content_to_current_group();
  }
  
  function image_grid_jump_to_group(group_index, value_index) {
    var n = _via_image_grid_group_var[group_index].values.length;
    if ( value_index >=n || value_index < 0 ) {
      return;
    }
  
    _via_image_grid_group_var[group_index].current_value_index = value_index;
    image_grid_group_panel_set_selected_value( group_index );
  
    // reset the value of lower groups
    var i, value;
    if ( group_index + 1 < _via_image_grid_group_var.length ) {
      var e = _via_image_grid_group;
      for ( i = 0; i <= group_index; ++i ) {
        value = _via_image_grid_group_var[i].values[ _via_image_grid_group_var[i].current_value_index ];
        e = e[ value ];
      }
  
      for ( i = group_index + 1; i < _via_image_grid_group_var.length; ++i ) {
        _via_image_grid_group_var[i].values = Object.keys(e);
        if ( _via_image_grid_group_var[i].values.length === 0 ) {
          _via_image_grid_group_var[i].current_value_index = -1;
          _via_image_grid_group_var.splice(i);
          image_grid_group_panel_set_options(i);
          break;
        } else {
          _via_image_grid_group_var[i].current_value_index = 0;
          value = _via_image_grid_group_var[i].values[0]
          e = e[value];
          image_grid_group_panel_set_options(i);
        }
      }
    }
  }
  
  function image_grid_set_content_to_current_group() {
    var n = _via_image_grid_group_var.length;
  
    if ( n === 0 ) {
      image_grid_show_all_project_images();
    } else {
      var group_img_index_list = [];
      var img_index_list = _via_image_grid_group;
      var i, n, value, current_value_index;
      for ( i = 0; i < n; ++i ) {
        value = _via_image_grid_group_var[i].values[ _via_image_grid_group_var[i].current_value_index ];
        img_index_list = img_index_list[ value ];
      }
  
      if ( Array.isArray(img_index_list) ) {
        image_grid_set_content(img_index_list);
      } else {
        console.log('Error: image_grid_set_content_to_current_group(): expected array while got ' + typeof(img_index_list));
      }
    }
  }
  
  function image_grid_page_next() {
    _via_image_grid_stack_prev_page.push(_via_image_grid_page_first_index);
    _via_image_grid_page_first_index = _via_image_grid_page_last_index;
  
    image_grid_clear_content();
    _via_image_grid_load_ongoing = true;
    image_grid_page_nav_show_cancel();
    image_grid_content_append_img( _via_image_grid_page_first_index );
  }
  
  function image_grid_page_prev() {
    _via_image_grid_page_first_index = _via_image_grid_stack_prev_page.pop();
    _via_image_grid_page_last_index = -1;
  
    image_grid_clear_content();
    _via_image_grid_load_ongoing = true;
    image_grid_page_nav_show_cancel();
    image_grid_content_append_img( _via_image_grid_page_first_index );
  }
  
  function image_grid_page_nav_show_cancel() {
    var info = document.getElementById('image_grid_nav');
    var html = [];
    html.push('<span>Loading images ... </span>');
    html.push('<span class="text_button" onclick="image_grid_cancel_load_ongoing()">Cancel</span>');
    info.innerHTML = html.join('');
  }
  
  function image_grid_cancel_load_ongoing() {
    _via_image_grid_load_ongoing = false;
  }
  