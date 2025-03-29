function settings_panel_toggle() {
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.SETTINGS ) {
      if ( _via_display_area_content_name_prev !== '' ) {
        set_display_area_content(_via_display_area_content_name_prev);
      } else {
        show_single_image_view();
        _via_redraw_rleg_canvas();
      }
    }
    else {
      settings_init();
      set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.SETTINGS);
    }
  }
  
  function settings_init() {
    settings_region_visualisation_update_options();
    settings_filepath_update_html();
    settings_show_current_value();
  }
  
  function settings_save() {
    // check if default path was updated
    var default_path_updated = false;
    if ( document.getElementById('_via_settings.core.default_filepath').value !== _via_settings.core.default_filepath ) {
      default_path_updated = true;
    }
  
    var p = document.getElementById('settings_panel');
    var vl = p.getElementsByClassName('value');
    var n = vl.length;
    var i;
    for ( i = 0; i < n; ++i ) {
      var s = vl[i].childNodes[1];
      var sid_parts = s.id.split('.');
      if ( sid_parts[0] === '_via_settings' ) {
        var el = _via_settings;
        var found = true;
        var j;
        for ( j = 1; j < sid_parts.length - 1; ++j ) {
          if ( el.hasOwnProperty( sid_parts[j] ) ) {
            el = el[ sid_parts[j] ];
          } else {
            // unrecognized setting
            found = false;
            break;
          }
        }
        if ( found ) {
          var param = sid_parts[ sid_parts.length - 1 ];
          if ( s.value !== '' || typeof(s.value) !== 'undefined' ) {
            el[param] = s.value;
          }
        }
      }
    }
  
    // non-standard settings
    var p;
    p = document.getElementById('settings_input_new_filepath');
    if ( p.value !== '' ) {
      project_filepath_add(p.value.trim());
    }
    p = document.getElementById('project_name');
    if ( p.value !== _via_settings.project.name ) {
      p.value = _via_settings.project.name;
    }
  
    if ( default_path_updated ) {
      _via_file_resolve_all_to_default_filepath();
      _via_show_img(_via_image_index);
    }
  
    show_message('Settings saved.');
    settings_panel_toggle();
  }
  
  function settings_show_current_value() {
    var p = document.getElementById('settings_panel');
    var vl = p.getElementsByClassName('value');
    var n = vl.length;
    var i;
    for ( i = 0; i < n; ++i ) {
      var s = vl[i].childNodes[1];
      var sid_parts = s.id.split('.');
      if ( sid_parts[0] === '_via_settings' ) {
        var el = _via_settings;
        var found = true;
        var j;
        for ( j = 1; j < sid_parts.length; ++j ) {
          if ( el.hasOwnProperty( sid_parts[j] ) ) {
            el = el[ sid_parts[j] ];
          } else {
            // unrecognized setting
            found = false;
            break;
          }
        }
  
        if ( found ) {
          s.value = el;
        }
      }
    }
  }
  
  function settings_region_visualisation_update_options() {
    var region_setting_list = {'region_label': {
      'default_option':'__via_region_id__',
      'default_label':'Region id (1, 2, ...)',
      'label_prefix':'Show value of region attribute: ',
    }, 'region_color': {
      'default_option':'__via_default_region_color__',
      'default_label':'Default Region Colour',
      'label_prefix':'Based on value of region attribute: ',
    }};
  
    for ( var setting in region_setting_list ) {
      var select = document.getElementById('_via_settings.ui.image.' + setting);
      select.innerHTML = '';
      var default_option = document.createElement('option');
      default_option.setAttribute('value', region_setting_list[setting]['default_option']);
      if ( _via_settings.ui.image[setting] === region_setting_list[setting]['default_option'] ) {
        default_option.setAttribute('selected', 'selected');
      }
      default_option.innerHTML = region_setting_list[setting]['default_label'];
      select.appendChild(default_option);
  
      // options: add region attributes
      var rattr;
      for ( rattr in _via_attributes['region'] ) {
        var o = document.createElement('option');
        o.setAttribute('value', rattr);
        o.innerHTML = region_setting_list[setting]['label_prefix'] + rattr;
        if ( _via_settings.ui.image.region_label === rattr ) {
          o.setAttribute('selected', 'selected');
        }
        select.appendChild(o);
      }
    }
  }
  
  function settings_filepath_update_html() {
    var p = document.getElementById('_via_settings.core.filepath');
    p.innerHTML = '';
    var i, path, order;
    for ( path in _via_settings.core.filepath ) {
      order = _via_settings.core.filepath[path]
      if ( order !== 0 ) {
        var li = document.createElement('li');
        li.innerHTML = path + '<span class="text_button" title="Delete image path" onclick="project_filepath_del(\"' + path + '\"); settings_filepath_update_html();">&times;</span>';
        p.appendChild(li);
      }
    }
  }
  