//
// image filename list shown in leftsidebar panel
//
function is_img_fn_list_visible() {
  return img_fn_list_panel.classList.contains('show');
}

function img_loading_spinbar(image_index, show) {
  var panel = document.getElementById('project_panel_title');
  if ( show ) {
    panel.innerHTML = 'Project <span style="margin-left:1rem;" class="loading_spinbox"></span>';
  } else {
    panel.innerHTML = 'Project';
  }
}

function update_img_fn_list() {
  var regex = document.getElementById('img_fn_list_regex').value;
  var p = document.getElementById('filelist_preset_filters_list');
  if ( regex === '' || regex === null ) {
    if ( p.selectedIndex === 0 ) {
      // show all files
      _via_img_fn_list_html = [];
      _via_img_fn_list_img_index_list = [];
      _via_img_fn_list_html.push('<ul>');
      for ( var i=0; i < _via_image_filename_list.length; ++i ) {
        _via_img_fn_list_html.push( img_fn_list_ith_entry_html(i) );
        _via_img_fn_list_img_index_list.push(i);
      }
      _via_img_fn_list_html.push('</ul>');
      img_fn_list.innerHTML = _via_img_fn_list_html.join('');
      img_fn_list_scroll_to_current_file();
    } else {
      // filter according to preset filters
      img_fn_list_onpresetfilter_select();
    }
  } else {
    if ( p.selectedIndex === 6 ) {
      // Filter By Region Attribute
      filter_selected_region_attribute(regex);
    } else {
      // RegExp
      img_fn_list_generate_html(regex);
      img_fn_list.innerHTML = _via_img_fn_list_html.join('');
      img_fn_list_scroll_to_current_file();
    }
  }
}

function img_fn_list_onregex() {
  var regex = document.getElementById('img_fn_list_regex').value;
  var p = document.getElementById('filelist_preset_filters_list');

  if ( p.selectedIndex === 6 ) {
    filter_selected_region_attribute(regex);
    return;
  }
  
  img_fn_list_generate_html( regex );
  img_fn_list.innerHTML = _via_img_fn_list_html.join('');
  img_fn_list_scroll_to_current_file();

  // select 'regex' in the predefined filter list ( Unless Filter By Attribute is Selected)
  if ( regex === '' ) {
    p.selectedIndex = 0;
  } else {
    if ( p.options[p.selectedIndex].value != 'files_region_attribute' && 
          p.options[p.selectedIndex].value != 'regex' ) {
      var i;
      for ( i=0; i<p.options.length; ++i) {
        if ( p.options[i].value === 'regex' ) {
          p.selectedIndex = i;
          break;
        }
      }
    }
  }
}

function img_fn_list_onpresetfilter_select() {
  var p = document.getElementById('filelist_preset_filters_list');
  var filter = p.options[p.selectedIndex].value;
  switch(filter) {
  case 'all':
    document.getElementById('img_fn_list_regex').value = '';
    img_fn_list_generate_html();
    img_fn_list.innerHTML = _via_img_fn_list_html.join('');
    img_fn_list_scroll_to_current_file();
    break;
  case 'regex':
    img_fn_list_onregex();
    document.getElementById('img_fn_list_regex').focus();
    break;
  case 'files_region_attribute':
    img_fn_list_onregex();
    document.getElementById('img_fn_list_regex').focus();
    break;
  default:
    _via_img_fn_list_html = [];
    _via_img_fn_list_img_index_list = [];
    _via_img_fn_list_html.push('<ul>');
    var i;
    for ( i=0; i < _via_image_filename_list.length; ++i ) {
      var img_id = _via_image_id_list[i];
      var add_to_list = false;
      switch(filter) {
      case 'files_without_region':
        if ( _via_img_metadata[img_id].regions.length === 0 ) {
          add_to_list = true;
        }
        break;
      case 'files_missing_region_annotations':
        if ( is_region_annotation_missing(img_id) ) {
          add_to_list = true;
        }
        break;
      case 'files_missing_file_annotations':
        if ( is_file_annotation_missing(img_id) ) {
          add_to_list = true;
        }
        break;
      case 'files_error_loading':
        if ( _via_image_load_error[i] === true ) {
          add_to_list = true;
        }
      }
      if ( add_to_list ) {
        _via_img_fn_list_html.push( img_fn_list_ith_entry_html(i) );
        _via_img_fn_list_img_index_list.push(i);
      }
    }
    _via_img_fn_list_html.push('</ul>');
    img_fn_list.innerHTML = _via_img_fn_list_html.join('');
    img_fn_list_scroll_to_current_file();
    break;
  }
}

function filter_selected_region_attribute(property_entry) {
  const propArray = property_entry.split("=");
  if ( propArray.length != 2 || propArray[0] === "" || propArray[1] === "") return;
  var selected_attribute = propArray[0];
  var selected_value = propArray[1];
  if ( selected_value === "\"\"") selected_value = "";
  
  _via_img_fn_list_html = [];
  _via_img_fn_list_img_index_list = [];
  _via_img_fn_list_html.push('<ul>');

  if ( _via_attributes.region.hasOwnProperty(selected_attribute) ) {
    var i;

    for ( i=0; i < _via_image_filename_list.length; ++i ) {
      var img_id = _via_image_id_list[i];
      var add_to_list = false;
      var idx;

      for ( idx = 0; idx < _via_img_metadata[img_id].regions.length; ++idx ) {
        if ( _via_img_metadata[img_id].regions[idx].region_attributes.hasOwnProperty(selected_attribute) ) {
          if ( JSON.stringify(_via_img_metadata[img_id].regions[idx].region_attributes[selected_attribute]) === JSON.stringify(selected_value) ) {
            add_to_list = true;
            _via_img_fn_list_html.push( img_fn_list_ith_entry_html(i) );
            _via_img_fn_list_img_index_list.push(i);
            break;
          }
        }
      }
    }
  }
  _via_img_fn_list_html.push('</ul>');
  img_fn_list.innerHTML = _via_img_fn_list_html.join('');
  img_fn_list_scroll_to_current_file();
}

function is_region_annotation_missing(img_id) {
  var region_attribute;
  var i;
  for ( i = 0; i < _via_img_metadata[img_id].regions.length; ++i ) {
    for ( region_attribute in _via_attributes['region'] ) {
      if ( _via_img_metadata[img_id].regions[i].region_attributes.hasOwnProperty(region_attribute) ) {
        if ( _via_img_metadata[img_id].regions[i].region_attributes[region_attribute] === '' ) {
          return true;
        }
      } else {
        return true;
      }
    }
  }
  return false;
}

function is_file_annotation_missing(img_id) {
  var file_attribute;
  for ( file_attribute in _via_attributes['file'] ) {
    if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(file_attribute) ) {
      if ( _via_img_metadata[img_id].file_attributes[file_attribute] === '' ) {
        return true;
      }
    } else {
      return true;
    }
  }
  return false;
}

function img_fn_list_ith_entry_selected(img_index, is_selected) {
  if ( is_selected ) {
    img_fn_list_ith_entry_add_css_class(img_index, 'sel');
  } else {
    img_fn_list_ith_entry_remove_css_class(img_index, 'sel');
  }
}

function img_fn_list_ith_entry_error(img_index, is_error) {
  if ( is_error ) {
    img_fn_list_ith_entry_add_css_class(img_index, 'error');
  } else {
    img_fn_list_ith_entry_remove_css_class(img_index, 'error');
  }
}

function img_fn_list_ith_entry_add_css_class(img_index, classname) {
  var li = document.getElementById('fl' + img_index);
  if ( li && ! li.classList.contains(classname)  ) {
    li.classList.add(classname);
  }
}

function img_fn_list_ith_entry_remove_css_class(img_index, classname) {
  var li = document.getElementById('fl' + img_index);
  if ( li && li.classList.contains(classname) ) {
    li.classList.remove(classname);
  }
}

function img_fn_list_clear_all_style() {
  var cn = document.getElementById('img_fn_list').childNodes[0].childNodes;
  var i, j;
  var n = cn.length;
  var nclass;
  for ( i = 0; i < n; ++i ) {
    //cn[i].classList = []; // throws error in Edge browser
    nclass = cn[i].classList.length;
    if ( nclass ) {
      for ( j = 0; j < nclass; ++j ) {
        cn[i].classList.remove( cn[i].classList.item(j) );
      }
    }
  }
}

function img_fn_list_clear_css_classname(classname) {
  var cn = document.getElementById('img_fn_list').childNodes[0].childNodes;
  var i;
  var n = cn.length;
  for ( i = 0; i < n; ++i ) {
    if ( cn[i].classList.contains(classname) ) {
      cn[i].classList.remove(classname);
    }
  }
}

function img_fn_list_ith_entry_html(i) {
  var htmli = '';
  var filename = _via_image_filename_list[i];
  if ( is_url(filename) ) {
    filename = '...'+filename.slice(-20) ;//+ get_filename_from_url(filename);
  }

  htmli += '<li id="fl' + i + '"';
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_image_grid_page_img_index_list.includes(i) ) {
      // highlight images being shown in image grid
      htmli += ' class="sel"';
    }

  } else {
    if ( i === _via_image_index ) {
      // highlight the current entry
      htmli += ' class="sel"';
    }
  }
  htmli += ' onclick="jump_to_image(' + (i) + ')" title="' + _via_image_filename_list[i] + '">[' + (i+1) + '] ' + decodeURIComponent(filename) + '</li>';
  return htmli;
}

function img_fn_list_generate_html(regex) {
  _via_img_fn_list_html = [];
  _via_img_fn_list_img_index_list = [];
  _via_img_fn_list_html.push('<ul>');
  for ( var i=0; i < _via_image_filename_list.length; ++i ) {
    var filename = _via_image_filename_list[i];
    if ( filename.match(regex) !== null ) {
      _via_img_fn_list_html.push( img_fn_list_ith_entry_html(i) );
      _via_img_fn_list_img_index_list.push(i);
    }
  }
  _via_img_fn_list_html.push('</ul>');
}

function img_fn_list_scroll_to_current_file() {
  img_fn_list_scroll_to_file( _via_image_index );
}

function img_fn_list_scroll_to_file(file_index) {
  if( _via_img_fn_list_img_index_list.includes(file_index) ) {
    var sel_file     = document.getElementById( 'fl' + file_index );
    var panel_height = img_fn_list.clientHeight - 20;
    var window_top    = img_fn_list.scrollTop;
    var window_bottom = img_fn_list.scrollTop + panel_height
    if ( sel_file.offsetTop > window_top ) {
      if ( sel_file.offsetTop > window_bottom ) {
        img_fn_list.scrollTop = sel_file.offsetTop;
      }
    } else {
      img_fn_list.scrollTop = sel_file.offsetTop - panel_height;
    }
  }
}

function toggle_img_fn_list_visibility() {
  leftsidebar_show();
  document.getElementById('img_fn_list_panel').classList.toggle('show');
  document.getElementById('project_panel_title').classList.toggle('active');
}

function toggle_attributes_editor() {
  leftsidebar_show();
  document.getElementById('attributes_editor_panel').classList.toggle('show');
  document.getElementById('attributes_editor_panel_title').classList.toggle('active');
}

// this vertical spacer is needed to allow scrollbar to show
// items like Keyboard Shortcut hidden under the attributes panel
function update_vertical_space() {
  var panel = document.getElementById('vertical_space');
  var aepanel = document.getElementById('annotation_editor_panel');
  panel.style.height = (aepanel.offsetHeight + 0) + 'px';
}