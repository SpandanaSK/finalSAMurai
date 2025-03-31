//
// Data Importer
//
function import_files_url_from_file(event) {
  var selected_files = event.target.files;
  var i, file;
  for ( i = 0; i < selected_files.length; ++i ) {
    file = selected_files[i];
    load_text_file(file, import_files_url_from_csv);
  }
}

function import_annotations_from_file(event) {
  var selected_files = event.target.files;
  var i, file;
  for ( i = 0; i < selected_files.length; ++i ) {
    file = selected_files[i];
    switch ( file.type ) {
    case '': // Fall-through // Windows 10: Firefox and Chrome do not report filetype
      show_message('File type for ' + file.name + ' cannot be determined! Assuming text/plain.');
    case 'text/plain': // Fall-through
    case 'application/vnd.ms-excel': // Fall-through // @todo: filetype of VIA csv annotations in Windows 10 , fix this (reported by @Eli Walker)
    case 'text/csv':
      load_text_file(file, import_annotations_from_csv);
      break;

    case 'text/json': // Fall-through
    case 'application/json':
      load_text_file(file, import_annotations_from_json);
      break;

    default:
      show_message('Annotations cannot be imported from file of type ' + file.type);
      break;
    }
  }
}

function load_coco_annotations_json_file(event) {
  load_text_file(event.target.files[0], import_coco_annotations_from_json);
}

function import_annotations_from_csv(data) {
  return new Promise( function(ok_callback, err_callback) {
    if ( data === '' || typeof(data) === 'undefined') {
      err_callback();
    }

    var region_import_count = 0;
    var malformed_csv_lines_count = 0;
    var file_added_count = 0;

    var line_split_regex = new RegExp('\n|\r|\r\n', 'g');
    var csvdata = data.split(line_split_regex);

    var parsed_header = parse_csv_header_line(csvdata[0]);
    if ( ! parsed_header.is_header ) {
      show_message('Header line missing in the CSV file');
      err_callback();
      return;
    }

    var n = csvdata.length;
    var i;
    var first_img_id = '';
    for ( i = 1; i < n; ++i ) {
      // ignore blank lines
      if (csvdata[i].charAt(0) === '\n' || csvdata[i].charAt(0) === '') {
        continue;
      }

      var d = parse_csv_line(csvdata[i]);

      // check if csv line was malformed
      if ( d.length !== parsed_header.csv_column_count ) {
        malformed_csv_lines_count += 1;
        continue;
      }

      var filename = d[parsed_header.filename_index];
      var size     = d[parsed_header.size_index];
      var img_id   = _via_get_image_id(filename, size);

      // check if file is already present in this project
      if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
        img_id = project_add_new_file(filename, size);
        if ( _via_settings.core.default_filepath === '' ) {
          _via_img_src[img_id] = filename;
        } else {
          _via_file_resolve_file_to_default_filepath(img_id);
        }
        file_added_count += 1;

        if ( first_img_id === '' ) {
          first_img_id = img_id;
        }
      }

      // copy file attributes
      if ( d[parsed_header.file_attr_index] !== '"{}"') {
        var fattr = d[parsed_header.file_attr_index];
        fattr     = remove_prefix_suffix_quotes( fattr );
        fattr     = unescape_from_csv( fattr );

        var m = json_str_to_map( fattr );
        for( var key in m ) {
          _via_img_metadata[img_id].file_attributes[key] = m[key];

          // add this file attribute to _via_attributes
          if ( ! _via_attributes['file'].hasOwnProperty(key) ) {
            _via_attributes['file'][key] = { 'type':'text' };
          }
        }
      }

      var region_i = new file_region();
      if (pars)
      // copy regions shape attributes
      if ( d[parsed_header.region_shape_attr_index] !== '"{}"' ) {
        var sattr = d[parsed_header.region_shape_attr_index];
        sattr     = remove_prefix_suffix_quotes( sattr );
        sattr     = unescape_from_csv( sattr );

        var m = json_str_to_map( sattr );
        for ( var key in m ) {
          region_i.shape_attributes[key] = m[key];
        }
      }

      if ('frame_index' in parsed_header) {
        region_i.frame = d[parsed_header.frame_index]
      }

      // copy region attributes
      if ( d[parsed_header.region_attr_index] !== '"{}"' ) {
        var rattr = d[parsed_header.region_attr_index];
        rattr     = remove_prefix_suffix_quotes( rattr );
        rattr     = unescape_from_csv( rattr );

        var m = json_str_to_map( rattr );
        for ( var key in m ) {
          region_i.region_attributes[key] = m[key];

          // add this region attribute to _via_attributes
          if ( ! _via_attributes['region'].hasOwnProperty(key) ) {
            _via_attributes['region'][key] = { 'type':'text' };
          }
        }
      }

      // add regions only if they are present
      if (Object.keys(region_i.shape_attributes).length > 0 ||
          Object.keys(region_i.region_attributes).length > 0 ) {
        _via_img_metadata[img_id].regions.push(region_i);
        region_import_count += 1;
      }
    }
    show_message('Import Summary : [' + file_added_count + '] new files, ' +
                  '[' + region_import_count + '] regions, ' +
                  '[' + malformed_csv_lines_count  + '] malformed csv lines.');

    if ( file_added_count ) {
      update_img_fn_list();
    }

    if ( _via_current_image_loaded ) {
      if ( region_import_count ) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if ( file_added_count ) {
        var first_img_index = _via_image_id_list.indexOf(first_img_id);
        _via_show_img( first_img_index );
      }
    }
    ok_callback([file_added_count, region_import_count, malformed_csv_lines_count]);
  });
}

function parse_csv_header_line(line) {
  var header_via_10x = '#filename,file_size,file_attributes,region_count,region_id,region_shape_attributes,region_attributes'; // VIA versions 1.0.x
  var header_via_11x = 'filename,file_size,file_attributes,region_count,region_id,region_shape_attributes,region_attributes'; // VIA version 1.1.x
  var header_via_12x = 'filename,file_size,file_attributes,region_count,region_id,frame,region_shape_attributes,region_attributes';
  if ( line === header_via_10x || line === header_via_11x ) {
    return { 'is_header':true,
              'filename_index': 0,
              'size_index': 1,
              'file_attr_index': 2,
              'region_shape_attr_index': 5,
              'region_attr_index': 6,
              'csv_column_count': 7
            }
  }
  else if ( line === header_via_12x ) {
    return { 'is_header':true,
              'filename_index': 0,
              'size_index': 1,
              'file_attr_index': 2,
              'frame_index': 5,
              'region_shape_attr_index': 6,
              'region_attr_index': 7,
              'csv_column_count': 8
            }
  } 
  else {
    return { 'is_header':false };
  }
}

// see http://cocodataset.org/#format-data
function import_coco_annotations_from_json(data_str) {
  return new Promise( function(ok_callback, err_callback) {
    if (data_str === '' || typeof(data_str) === 'undefined') {
      show_message('Empty file');
      return;
    }
    var coco = JSON.parse(data_str);
    if( !coco.hasOwnProperty('info') ||
        !coco.hasOwnProperty('categories') ||
        !coco.hasOwnProperty('annotations') ||
        !coco.hasOwnProperty('images') ) {
      show_message('File does not contain valid annotations in COCO format.');
      return;
    }

    // create _via_attributes from coco['categories']
    var category_id_to_attribute_name = {};
    for( var i in coco['categories'] ) {
      var sc    = coco['categories'][i]['supercategory'];
      var cid   = coco['categories'][i]['id'];
      var cname = coco['categories'][i]['name'];
      if( !_via_attributes['region'].hasOwnProperty(sc)) {
        _via_attributes['region'][sc] = {'type':VIA_ATTRIBUTE_TYPE.RADIO,
                                          'description':'coco["categories"][' + i + ']=' + JSON.stringify(coco['categories'][i]),
                                          'options':{},
                                          'default_options':{}
                                        };
      }
      _via_attributes['region'][sc]['options'][cid] = cname;
      category_id_to_attribute_name[cid] = sc;
    }
    // if more than 5 options, convert the attribute type to DROPDOWN
    for( var attr_name in _via_attributes['region'] ) {
      if( Object.keys(_via_attributes['region'][attr_name]['options']).length > 5 ) {
        _via_attributes['region'][attr_name]['type'] = VIA_ATTRIBUTE_TYPE.DROPDOWN;
      }
    }

    // create an map of image_id and their annotations
    var image_id_to_annotation_index = {};
    for ( var annotation_index in coco['annotations'] ) {
      var coco_image_id = coco.annotations[annotation_index]['image_id'];
      if ( !image_id_to_annotation_index.hasOwnProperty(coco_image_id) ) {
        image_id_to_annotation_index[coco_image_id] = [];
      }
      image_id_to_annotation_index[coco_image_id].push( annotation_index );
    }

    // add all files and annotations
    _via_img_metadata = {};
    _via_image_id_list = [];
    _via_image_filename_list = [];
    _via_img_count = 0;
    var imported_file_count = 0;
    var imported_region_count = 0;
    for ( var coco_img_index in coco['images'] ) {
      var coco_img_id = coco['images'][coco_img_index]['id'];
      var filename;
      if ( coco.images[coco_img_index].hasOwnProperty('coco_url') &&
            coco.images[coco_img_index]['coco_url'] !== "") {
        filename = coco.images[coco_img_index]['coco_url'];
      } else {
        filename = coco.images[coco_img_index]['file_name'];
      }
      _via_img_metadata[coco_img_id] = { 'filename':filename,
                                          'size'    :-1,
                                          'regions' :[],
                                          'file_attributes': {
                                            'width' :coco.images[coco_img_index]['width'],
                                            'height':coco.images[coco_img_index]['height']
                                          },
                                        };
      _via_image_id_list.push(coco_img_id);
      _via_image_filename_list.push(filename);
      _via_img_count = _via_img_count + 1;

      // add all annotations associated with this file
      if ( image_id_to_annotation_index.hasOwnProperty(coco_img_id) ) {
        for ( var i in image_id_to_annotation_index[coco_img_id] ) {
          var annotation_i = coco['annotations'][ image_id_to_annotation_index[coco_img_id][i] ];
          var bbox_from_polygon = polygon_to_bbox(annotation_i['segmentation'][0]);

          // ensure rectangles get imported as rectangle (and not as polygon)
          var is_rectangle = true;
          for (var j = 0; j < annotation_i['bbox'].length; ++j) {
            if (annotation_i['bbox'][j] !== bbox_from_polygon[j]) {
              is_rectangle = false;
              break;
            }
          }

          var region_i = { 'shape_attributes': {}, 'region_attributes': {} };
          var attribute_name = category_id_to_attribute_name[ annotation_i['category_id'] ];
          var attribute_value = annotation_i['category_id'].toString();
          region_i['region_attributes'][attribute_name] = attribute_value;

          if ( annotation_i['segmentation'][0].length === 8 && is_rectangle ) {
            region_i['shape_attributes'] = { 'name':'rect',
                                              'x': annotation_i['bbox'][0],
                                              'y': annotation_i['bbox'][1],
                                              'width': annotation_i['bbox'][2],
                                              'height': annotation_i['bbox'][3]};
          } else {
            region_i['shape_attributes'] = { 'name':'polygon',
                                              'all_points_x':[],
                                              'all_points_y':[]};
            for ( var j = 0; j < annotation_i['segmentation'][0].length; j = j + 2 ) {
              region_i['shape_attributes']['all_points_x'].push( annotation_i['segmentation'][0][j] );
              region_i['shape_attributes']['all_points_y'].push( annotation_i['segmentation'][0][j+1] );
            }
          }
          _via_img_metadata[coco_img_id]['regions'].push(region_i);
          imported_region_count = imported_region_count + 1;
        }
      }
    }
    show_message('Import Summary : [' + _via_img_count + '] new files, ' +
                  '[' + imported_region_count + '] regions.');

    if(_via_img_count) {
      update_img_fn_list();
    }

    if(_via_current_image_loaded) {
      if(imported_region_count) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if(_via_img_count) {
        _via_show_img(0);
      }
    }
    ok_callback([_via_img_count, imported_region_count, 0]);
  });
}

function import_annotations_from_json(data_str) {
  return new Promise( function(ok_callback, err_callback) {
    if (data_str === '' || typeof(data_str) === 'undefined') {
      return;
    }

    var d = JSON.parse(data_str);
    var region_import_count = 0;
    var file_added_count    = 0;
    var malformed_entries_count    = 0;
    for (var img_id in d) {
      if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
        project_add_new_file(d[img_id].filename, d[img_id].size, img_id);
        if ( _via_settings.core.default_filepath === '' ) {
          _via_img_src[img_id] = d[img_id].filename;
        } else {
          _via_file_resolve_file_to_default_filepath(img_id);
        }
        file_added_count += 1;
      }

      // copy file attributes
      for ( var key in d[img_id].file_attributes ) {
        if ( key === '' ) {
          continue;
        }

        _via_img_metadata[img_id].file_attributes[key] = d[img_id].file_attributes[key];

        // add this file attribute to _via_attributes
        if ( ! _via_attributes['file'].hasOwnProperty(key) ) {
          _via_attributes['file'][key] = { 'type':'text' };
        }
      }

      // copy regions
      var regions = d[img_id].regions;
      for ( var i in regions ) {
        var region_i = new file_region();
        region_i.frame = regions[i].frame
        for ( var sid in regions[i].shape_attributes ) {
          region_i.shape_attributes[sid] = regions[i].shape_attributes[sid];
        }
        for ( var rid in regions[i].region_attributes ) {
          if ( rid === '' ) {
            continue;
          }

          region_i.region_attributes[rid] = regions[i].region_attributes[rid];

          // add this region attribute to _via_attributes
          if ( ! _via_attributes['region'].hasOwnProperty(rid) ) {
            _via_attributes['region'][rid] = { 'type':'text' };
          }
        }

        // add regions only if they are present
        if ( Object.keys(region_i.shape_attributes).length > 0 ||
              Object.keys(region_i.region_attributes).length > 0 ) {
          _via_img_metadata[img_id].regions.push(region_i);
          region_import_count += 1;
        }
      }
    }
    show_message('Import Summary : [' + file_added_count + '] new files, ' +
                  '[' + region_import_count + '] regions, ' +
                  '[' + malformed_entries_count + '] malformed entries.');

    if ( file_added_count ) {
      update_img_fn_list();
    }

    if ( _via_current_image_loaded ) {
      if ( region_import_count ) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if ( file_added_count ) {
        _via_show_img(0);
      }
    }

    ok_callback([file_added_count, region_import_count, malformed_entries_count]);
  });
}

// assumes that csv line follows the RFC 4180 standard
// see: https://en.wikipedia.org/wiki/Comma-separated_values
function parse_csv_line(s, field_separator) {
  if (typeof(s) === 'undefined' || s.length === 0 ) {
    return [];
  }

  if (typeof(field_separator) === 'undefined') {
    field_separator = ',';
  }
  var double_quote_seen = false;
  var start = 0;
  var d = [];

  var i = 0;
  while ( i < s.length) {
    if (s.charAt(i) === field_separator) {
      if (double_quote_seen) {
        // field separator inside double quote is ignored
        i = i + 1;
      } else {
        //var part = s.substr(start, i - start);
        d.push( s.substr(start, i - start) );
        start = i + 1;
        i = i + 1;
      }
    } else {
      if (s.charAt(i) === '"') {
        if (double_quote_seen) {
          if (s.charAt(i+1) === '"') {
            // ignore escaped double quotes
            i = i + 2;
          } else {
            // closing of double quote
            double_quote_seen = false;
            i = i + 1;
          }
        } else {
          double_quote_seen = true;
          start = i;
          i = i + 1;
        }
      } else {
        i = i + 1;
      }
    }

  }
  // extract the last field (csv rows have no trailing comma)
  d.push( s.substr(start) );
  return d;
}

// s = '{"name":"rect","x":188,"y":90,"width":243,"height":233}'
function json_str_to_map(s) {
  if (typeof(s) === 'undefined' || s.length === 0 ) {
    return {};
  }

  return JSON.parse(s);
}

// ensure the exported json string conforms to RFC 4180
// see: https://en.wikipedia.org/wiki/Comma-separated_values
function map_to_json(m) {
  var s = [];
  for ( var key in m ) {
    var v   = m[key];
    var si  = JSON.stringify(key);
    si += VIA_CSV_KEYVAL_SEP;
    si += JSON.stringify(v);
    s.push( si );
  }
  return '{' + s.join(VIA_CSV_SEP) + '}';
}

function escape_for_csv(s) {
  return s.replace(/["]/g, '""');
}

function unescape_from_csv(s) {
  return s.replace(/""/g, '"');
}

function remove_prefix_suffix_quotes(s) {
  if ( s.charAt(0) === '"' && s.charAt(s.length-1) === '"' ) {
    return s.substr(1, s.length-2);
  } else {
    return s;
  }
}

function clone_image_region(r0) {
  var r1 = new file_region();

  // copy shape attributes
  for ( var key in r0.shape_attributes ) {
    r1.shape_attributes[key] = clone_value(r0.shape_attributes[key]);
  }

  // copy region attributes
  for ( var key in r0.region_attributes ) {
    r1.region_attributes[key] = clone_value(r0.region_attributes[key]);
  }
  r1.frame = clone_value(r0.frame)
  return r1;
}

function clone_value(value) {
  if ( typeof(value) === 'object' ) {
    if ( Array.isArray(value) ) {
      return value.slice(0);
    } else {
      var copy = {};
      for ( var p in value ) {
        if ( value.hasOwnProperty(p) ) {
          copy[p] = clone_value(value[p]);
        }
      }
      return copy;
    }
  }
  return value;
}

function _via_get_image_id(filename, size) {
  if ( typeof(size) === 'undefined' ) {
    return filename;
  } else {
    return filename + size;
  }
}

function load_text_file(text_file, callback_function) {
  if (text_file) {
    var text_reader = new FileReader();
    text_reader.addEventListener( 'progress', function(e) {
      show_message('Loading data from file : ' + text_file.name + ' ... ');
    }, false);

    text_reader.addEventListener( 'error', function() {
      show_message('Error loading data text file :  ' + text_file.name + ' !');
      callback_function('');
    }, false);

    text_reader.addEventListener( 'load', function() {
      callback_function(text_reader.result);
    }, false);
    text_reader.readAsText(text_file, 'utf-8');
  }
}

function import_files_url_from_csv(data) {
  return new Promise( function(ok_callback, err_callback) {
    if ( data === '' || typeof(data) === 'undefined') {
      err_callback();
    }

    var malformed_url_count = 0;
    var url_added_count = 0;

    var line_split_regex = new RegExp('\n|\r|\r\n', 'g');
    var csvdata = data.split(line_split_regex);

    var percent_completed = 0;
    var n = csvdata.length;
    var i;
    var img_id;
    var first_img_id = '';
    for ( i=0; i < n; ++i ) {
      // ignore blank lines
      if (csvdata[i].charAt(0) === '\n' || csvdata[i].charAt(0) === '') {
        malformed_url_count += 1;
        continue;
      } else {
        img_id = project_file_add_url(csvdata[i]);
        if ( first_img_id === '' ) {
          first_img_id = img_id;
        }
        url_added_count += 1;
      }
    }
    show_message('Added ' + url_added_count + ' files to project');
    if ( url_added_count ) {
      var first_img_index = _via_image_id_list.indexOf(first_img_id);
      _via_show_img(first_img_index);
      update_img_fn_list();
    }
  });
}
