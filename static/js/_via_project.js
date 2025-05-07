
function project_parse_via_attributes_from_img_metadata() {
  // parse _via_img_metadata to populate _via_attributes
  var img_id, fa, ra;

  if ( ! _via_attributes.hasOwnProperty('file') ) {
    _via_attributes['file'] = {};
  }
  if ( ! _via_attributes.hasOwnProperty('region') ) {
    _via_attributes['region'] = {};
  }

  for ( img_id in _via_img_metadata ) {
    // file attributes
    for ( fa in _via_img_metadata[img_id].file_attributes ) {
      if ( ! _via_attributes['file'].hasOwnProperty(fa) ) {
        _via_attributes['file'][fa] = {};
        _via_attributes['file'][fa]['type'] = 'text';
      }
    }
    // region attributes
    var ri;
    for ( ri = 0; ri < _via_img_metadata[img_id].regions.length; ++ri ) {
      for ( ra in _via_img_metadata[img_id].regions[ri].region_attributes ) {
        if ( ! _via_attributes['region'].hasOwnProperty(ra) ) {
          _via_attributes['region'][ra] = {};
          _via_attributes['region'][ra]['type'] = 'text';
        }
      }
    }
  }
}

function project_import_settings(s) {
  // @todo find a generic way to import into _via_settings
  // only the components present in s (and not overwrite everything)
  var k1;
  for ( k1 in s ) {
    if ( typeof( s[k1] ) === 'object' ) {
      var k2;
      for ( k2 in s[k1] ) {
        if ( typeof( s[k1][k2] ) === 'object' ) {
          var k3;
          for ( k3 in s[k1][k2] ) {
            _via_settings[k1][k2][k3] = s[k1][k2][k3];
          }
        } else {
          _via_settings[k1][k2] = s[k1][k2];
        }
      }
    } else {
      _via_settings[k1] = s[k1];
    }
  }
}

function project_file_remove_with_confirm() {
  var img_id = _via_image_id_list[_via_image_index];
  var filename = _via_img_metadata[img_id].filename;
  var region_count = _via_img_metadata[img_id].regions.length;

  var config = {'title':'Remove File from Project' };
  var input = { 'img_index': { type:'text', name:'File Id', value:(_via_image_index+1), disabled:true, size:8 },
                'filename':{ type:'text', name:'Filename', value:filename, disabled:true, size:30},
                'region_count':{ type:'text', name:'Number of regions', disabled:true, value:region_count, size:8}
              };

  invoke_with_user_inputs(project_file_remove_confirmed, input, config);
}

function project_file_remove_confirmed(input) {
  var img_index = input.img_index.value - 1;
  project_remove_file(img_index);

  if ( img_index === _via_img_count ) {
    if ( _via_img_count === 0 ) {
      _via_current_image_loaded = false;
      show_home_panel();
    } else {
      _via_show_img(img_index - 1);
    }
  } else {
    _via_show_img(img_index);
  }
  _via_reload_img_fn_list_table = true;
  update_img_fn_list();
  show_message('Removed file [' + input.filename.value + '] from project');
  user_input_default_cancel_handler();
}


function project_remove_file(img_index) {
  if ( img_index < 0 || img_index >= _via_img_count ) {
    console.log('project_remove_file(): invalid img_index ' + img_index);
    return;
  }
  var img_id = _via_image_id_list[img_index];

  // remove img_index from all array
  // this invalidates all image_index > img_index
  _via_image_id_list.splice( img_index, 1 );
  _via_image_filename_list.splice( img_index, 1 );

  var img_fn_list_index = _via_img_fn_list_img_index_list.indexOf(img_index);
  if ( img_fn_list_index !== -1 ) {
    _via_img_fn_list_img_index_list.splice( img_fn_list_index, 1 );
  }

  // clear all buffer
  // @todo: it is wasteful to clear all the buffer instead of removing a single image
  _via_buffer_remove_all();
  img_fn_list_clear_css_classname('buffered');

  _via_clear_reg_canvas();
  delete _via_img_metadata[img_id];
  delete _via_img_src[img_id];
  delete _via_img_fileref[img_id];

  _via_img_count -= 1;
}

function project_add_new_file(filename, size, file_id) {
  var img_id = file_id;
  if ( typeof(img_id) === 'undefined' ) {
    if ( typeof(size) === 'undefined' ) {
      size = -1;
    }
    img_id = filename;
  }

  if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
    _via_img_metadata[img_id] = new file_metadata(filename, size);
    _via_image_id_list.push(img_id);
    _via_image_filename_list.push(filename);
    _via_img_count += 1;
  }
  return img_id;
}
  
function project_add_uploaded_file(current_image, image_name) {
  var img_id = current_image.file_name;
  
  if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
    _via_img_metadata[img_id] = new file_metadata(img_id, -1);
    _via_image_id_list.push(img_id);
    _via_image_filename_list.push(img_id);
    _via_img_count += 1;
  }
  return img_id;
}

function project_file_add_local(event) {
  var user_selected_images = event.target.files;
  var original_image_count = _via_img_count;

  var new_img_index_list = [];
  var discarded_file_count = 0;
  for ( var i = 0; i < user_selected_images.length; ++i ) {
    var filetype = user_selected_images[i].type.substr(0, 5);
    if ( filetype === 'image' ) {
      // check which filename in project matches the user selected file
      var img_index = _via_image_filename_list.indexOf(user_selected_images[i].name);
       if( img_index === -1) {
        // a new file was added to project
        var new_img_id = project_add_new_file(user_selected_images[i].name,
                                              user_selected_images[i].size);
        _via_img_fileref[new_img_id] = user_selected_images[i];
        set_file_annotations_to_default_value(new_img_id);
        new_img_index_list.push( _via_image_id_list.indexOf(new_img_id) );
      } else {
        // an existing file was resolved using browser's file selector
        var img_id = _via_image_id_list[img_index];
        _via_img_fileref[img_id] = user_selected_images[i];
        _via_img_metadata[img_id]['size'] = user_selected_images[i].size;
      }
    } else {
      discarded_file_count += 1;
    }
  }

  if ( _via_img_metadata ) {
    var status_msg = 'Loaded ' + new_img_index_list.length + ' images.';
    if ( discarded_file_count ) {
      status_msg += ' ( Discarded ' + discarded_file_count + ' non-image files! )';
    }
    show_message(status_msg);

    if ( new_img_index_list.length ) {
      // show first of newly added image
      _via_show_img( new_img_index_list[0] );
    } else {
      // show original image
      _via_show_img ( _via_image_index );
    }
    update_img_fn_list();
  } else {
    show_message("Please upload some image files!");
  }
}

function project_file_add_abs_path_with_input() {
  var config = {'title':'Add File using Absolute Path' };
  var input = { 'absolute_path': { type:'text', name:'add one absolute path', placeholder:'/home/abhishek/image1.jpg', disabled:false, size:50 },
		'absolute_path_list': { type:'textarea', name:'or, add multiple paths (one path per line)', placeholder:'/home/abhishek/image1.jpg\n/home/abhishek/image2.jpg\n/home/abhishek/image3.png', disabled:false, rows:5, cols:80 }
              };

  invoke_with_user_inputs(project_file_add_abs_path_input_done, input, config);
}

function project_file_add_abs_path_input_done(input) {
  if ( input.absolute_path.value !== '' ) {
    var abs_path  = input.absolute_path.value.trim();
    var img_id    = project_file_add_url(abs_path);
    var img_index = _via_image_id_list.indexOf(img_id);
    _via_show_img(img_index);
    show_message('Added file at absolute path [' + abs_path + ']');
    update_img_fn_list();
    user_input_default_cancel_handler();
  } else {
    if ( input.absolute_path_list.value !== '' ) {
      var absolute_path_list_str = input.absolute_path_list.value;
      import_files_url_from_csv(absolute_path_list_str);
    }
  }
}

function project_file_add_url_with_input() {
  var config = {'title':'Add File using URL' };
  var input = { 'url': { type:'text', name:'add one URL', placeholder:'http://www.robots.ox.ac.uk/~vgg/software/via/images/swan.jpg', disabled:false, size:50 },
		'url_list': { type:'textarea', name:'or, add multiple URL (one url per line)', placeholder:'http://www.example.com/image1.jpg\nhttp://www.example.com/image2.jpg\nhttp://www.example.com/image3.png', disabled:false, rows:5, cols:80 }
              };

  invoke_with_user_inputs(project_file_add_url_input_done, input, config);
}

async function project_file_add_url_input_done(input) {
  if ( input.url.value !== '' ) {
    var url = input.url.value.trim();
    var img_id    = await project_file_add_url(url);
    var img_index = _via_image_id_list.indexOf(img_id);
    show_message('Added file at url [' + url + ']');
    update_img_fn_list();
    _via_show_img(img_index);
    user_input_default_cancel_handler();
  } else {
    if ( input.url_list.value !== '' ) {
      var url_list_str = input.url_list.value;
      import_files_url_from_csv(url_list_str);
    }
  }
}

async function project_file_add_url(url) {
  if ( url !== '' ) {
    var size = -1; // convention: files added using url have size = -1
    var img_id   = url;

    if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
      img_id = project_add_new_file(url);
      _via_img_src[img_id] = await render(_via_img_metadata[img_id].filename);
      set_file_annotations_to_default_value(img_id);
      return img_id;
    }
  }
}

function project_file_add_base64(filename, base64) {
  var size = -1; // convention: files added using url have size = -1
  var img_id   = _via_get_image_id(filename, size);

  if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
    img_id = project_add_new_file(filename, size);
    _via_img_src[img_id] = base64;
    set_file_annotations_to_default_value(img_id);
  }
}

function project_file_load_on_fail(img_index) {
  var img_id = _via_image_id_list[img_index];
  _via_img_src[img_id] = '';
  _via_image_load_error[img_index] = true;
  img_fn_list_ith_entry_error(img_index, true);
}

function project_file_load_on_success(img_index) {
  _via_image_load_error[img_index] = false;
  img_fn_list_ith_entry_error(img_index, false);
}

function project_settings_toggle() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.SETTINGS ) {
    show_single_image_view();
  } else {
    project_settings_show();
  }
}

function project_settings_show() {
  set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.SETTINGS);
}

function project_filepath_add_from_input(p, button) {
  var new_path = document.getElementById(p).value.trim();
  var img_index = parseInt(button.getAttribute('value'));
  project_filepath_add(new_path);
  _via_show_img(img_index);
}

function project_filepath_add(new_path) {
  if ( path === '' ) {
    return;
  }

  if ( _via_settings.core.filepath.hasOwnProperty(new_path) ) {
    return;
  } else {
    var largest_order = 0;
    var path;
    for ( path in _via_settings.core.filepath ) {
      if ( _via_settings.core.filepath[path] > largest_order ) {
        largest_order = _via_settings.core.filepath[path];
      }
    }
    _via_settings.core.filepath[new_path] = largest_order + 1;

  }
}

function project_filepath_del(path) {
  if ( _via_settings.core.filepath.hasOwnProperty(path) ) {
    delete _via_settings.core.filepath[path];
  }
}

function project_save_attributes() {
  var blob_attr = {type: 'application/json;charset=utf-8'};
  var all_region_data_blob = new Blob( [ JSON.stringify(_via_attributes) ], blob_attr);

  save_data_to_local_file(all_region_data_blob, _via_settings.project.name + '_attributes.json');
}

function project_import_attributes_from_file(event) {
  var selected_files = event.target.files;
  for ( var i = 0; i < selected_files.length; ++i ) {
    var file = selected_files[i];
    load_text_file(file, project_import_attributes_from_json);
  }
}

function project_import_attributes_from_json(data) {
  try {
    var d = JSON.parse(data);
    var attr;
    var fattr_count = 0;
    var rattr_count = 0;
    // process file attributes
    for ( attr in d['file'] ) {
      _via_attributes['file'][attr] = JSON.parse( JSON.stringify( d['file'][attr] ) );
      fattr_count += 1;
    }

    // process region attributes
    for ( attr in d['region'] ) {
      _via_attributes['region'][attr] = JSON.parse( JSON.stringify( d['region'][attr] ) );
      rattr_count += 1;
    }

    if ( fattr_count > 0 || rattr_count > 0 ) {
      var fattr_id_list = Object.keys(_via_attributes['file']);
      var rattr_id_list = Object.keys(_via_attributes['region']);
      if ( rattr_id_list.length ) {
        _via_attribute_being_updated = 'region';
        _via_current_attribute_id = rattr_id_list[0];
      } else {
        if ( fattr_id_list.length ) {
          _via_attribute_being_updated = 'file';
          _via_current_attribute_id = fattr_id_list[0];
        }
      }
      attribute_update_panel_set_active_button();
      update_attributes_update_panel();
      annotation_editor_update_content();
    }
    show_message('Imported ' + fattr_count + ' file attributes and '
                 + rattr_count + ' region attributes');
  } catch (error) {
    show_message('Failed to import attributes: [' + error + ']');
  }
}


function project_set_name(name) {
  _via_settings.project.name = name;

  var p = document.getElementById('project_name');
  p.value = _via_settings.project.name;
}

function project_init_default_project() {
  if ( ! _via_settings.hasOwnProperty('project') ) {
    _via_settings.project = {};
  }

  project_set_name( project_get_default_project_name() );
}

function project_on_name_update(p) {
  project_set_name(p.value);
}

function project_get_default_project_name() {
  const now = new Date();
  var MONTH_SHORT_NAME = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  var ts = now.getDate() + MONTH_SHORT_NAME[now.getMonth()] + now.getFullYear() +
      '_' + now.getHours() + 'h' + now.getMinutes() + 'm';

  var project_name = 'via_project_' + ts;
  return project_name;
}

function project_save_with_confirm() {
  var config = {'title':'Save Project' };
  var input = { 'project_name': { type:'text', name:'Project Name', value:_via_settings.project.name, disabled:false, size:30 },
                'save_annotations':{ type:'checkbox', name:'Save region and file annotations (i.e. manual annotations)', checked:true, disabled:false},
                'save_attributes':{ type:'checkbox', name:'Save region and file attributes.', checked:true},
                'save_via_settings':{ type:'checkbox', name:'Save VIA application settings', checked:true},
                //                'save_base64_data':{ type:'checkbox', name:'Save base64 data of images (if present)', checked:false},
                //                'save_images':{type:'checkbox', 'name':'Save images <span class="warning">(WARNING: only recommended for projects containing small number of images)</span>', value:false},
              };

  invoke_with_user_inputs(project_save_confirmed, input, config);
}


function create_new_project_with_confirm() {
  var config = {'title':'Create New/Empty Project' };
  const timeElapsed = Date.now();
  const today = new Date(timeElapsed);
  _via_settings.project.created_on = today.toUTCString(); 
  var input = { 'new_project_name': { type:'text', name:'Project Name', value:_via_settings.project.name, disabled:false, size:30 },
                'project_description': { type:'text', name:'Project Description', value:_via_settings.project.description, disabled:false, size:30 },
                'project_created_on': { type:'text', name:'Creation Date', value: _via_settings.project.created_on, disabled:true, size:30 },
                'project_created_by': { type:'text', name:'Created by', value: _via_settings.project.created_by, disabled:false, size:30 }
              };

  invoke_with_user_inputs(new_project_confirmed, input, config);
}

function new_project_confirmed(input) {
  // via project
  var _via_project = { '_via_settings': _via_settings,
                       '_via_img_metadata': _via_img_metadata,
                       '_via_attributes': _via_attributes,
                       '_via_data_format_version': '2.0.10',
                       '_via_image_id_list': _via_image_id_list
                     };
  _via_project._via_settings.project.name = input.new_project_name.value
  _via_project._via_settings.project.description = input.project_description.value
  _via_project._via_settings.project.created_on = input.project_created_on.value
  _via_project._via_settings.project.created_by = input.project_created_by.value

  var filename = input.new_project_name.value + '.json';
  var data_blob = new Blob( [JSON.stringify(_via_project)],
                            {type: 'text/json;charset=utf-8'});

  // save_data_to_local_file(data_blob, filename);
  project_set_name(input.new_project_name.value);
  user_input_default_cancel_handler();
}



function project_save_confirmed(input) {
  if ( input.project_name.value !== _via_settings.project.name ) {
    project_set_name(input.project_name.value);
  }

  // via project
  var _via_project = { '_via_settings': _via_settings,
                       '_via_img_metadata': _via_img_metadata,
                       '_via_attributes': _via_attributes,
                       '_via_data_format_version': '2.0.10',
                       '_via_image_id_list': _via_image_id_list
                     };

  var filename = input.project_name.value + '.json';
  var data_blob = new Blob( [JSON.stringify(_via_project)],
                            {type: 'text/json;charset=utf-8'});

  save_data_to_local_file(data_blob, filename);

  user_input_default_cancel_handler();
}

function project_open_select_project_file() {
  if (invisible_file_input) {
    invisible_file_input.accept = '.json';
    invisible_file_input.onchange = project_open;
    invisible_file_input.removeAttribute('multiple');
    invisible_file_input.click();
  }
}

function project_open(event) {
  var selected_file = event.target.files[0];
  load_text_file(selected_file, project_open_parse_json_file);
}

function project_open_parse_json_file(project_file_data) {
  var d = JSON.parse(project_file_data);
  if ( d['_via_settings'] && d['_via_img_metadata'] && d['_via_attributes'] ) {
    // import settings
    project_import_settings(d['_via_settings']);

    // clear existing data (if any)
    _via_image_id_list = [];
    _via_image_filename_list = [];
    _via_img_count = 0;
    _via_img_metadata = {};
    _via_img_fileref = {};
    _via_img_src = {};
    _via_attributes = { 'region':{}, 'file':{} };
    _via_buffer_remove_all();

    // import image metadata
    _via_img_metadata = {};
    for ( var img_id in d['_via_img_metadata'] ) {
      if('filename' in d['_via_img_metadata'][img_id] &&
         'size' in d['_via_img_metadata'][img_id] &&
         'regions' in d['_via_img_metadata'][img_id] &&
         'file_attributes' in d['_via_img_metadata'][img_id]) {
        if( !d.hasOwnProperty('_via_image_id_list') ) {
          _via_image_id_list.push(img_id);
          _via_image_filename_list.push( d['_via_img_metadata'][img_id].filename );
        }

        set_file_annotations_to_default_value(img_id);
        _via_img_metadata[img_id] = d['_via_img_metadata'][img_id];
        _via_img_count += 1;
      } else {
        console.log('discarding malformed entry for ' + img_id +
                    ': ' + JSON.stringify(d['_via_img_metadata'][img_id]));
      }
    }


    // import image_id_list which records the order of images
    if( d.hasOwnProperty('_via_image_id_list') ) {
      _via_image_id_list = d['_via_image_id_list'];
      for(var img_id_index in d['_via_image_id_list']) {
        var img_id = d['_via_image_id_list'][img_id_index];
        _via_image_filename_list.push(_via_img_metadata[img_id]['filename']);
      }
    }

    // import attributes
    _via_attributes = d['_via_attributes'];
    project_parse_via_attributes_from_img_metadata();
    var fattr_id_list = Object.keys(_via_attributes['file']);
    var rattr_id_list = Object.keys(_via_attributes['region']);
    if ( rattr_id_list.length ) {
      _via_attribute_being_updated = 'region';
      _via_current_attribute_id = rattr_id_list[0];
    } else {
      if ( fattr_id_list.length ) {
        _via_attribute_being_updated = 'file';
        _via_current_attribute_id = fattr_id_list[0];
      }
    }

    if ( _via_settings.core.default_filepath !== '' ) {
      _via_file_resolve_all_to_default_filepath();
    }

    show_message('Imported project [' + _via_settings['project'].name + '] with ' + _via_img_count + ' files.');

    if ( _via_img_count > 0 ) {
      _via_show_img(0);
      update_img_fn_list();
      _via_reload_img_fn_list_table = true;
    }
  } else {
    show_message('Cannot import project from a corrupt file!');
  }
}
