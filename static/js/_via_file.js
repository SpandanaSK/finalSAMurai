function _via_file_resolve_all_to_default_filepath() {
    var img_id;
    for ( img_id in _via_img_metadata ) {
      if ( _via_img_metadata.hasOwnProperty(img_id) ) {
        _via_file_resolve_file_to_default_filepath(img_id);
      }
    }
  }
  
  function _via_file_resolve_file_to_default_filepath(img_id) {
    if ( _via_img_metadata.hasOwnProperty(img_id) ) {
      if ( typeof(_via_img_fileref[img_id]) === 'undefined' || ! _via_img_fileref[img_id] instanceof File ) {
        if ( is_url( _via_img_metadata[img_id].filename ) ) {
          _via_img_src[img_id] = _via_img_metadata[img_id].filename;
        } else {
          _via_img_src[img_id] = _via_settings.core.default_filepath + _via_img_metadata[img_id].filename;
        }
      }
    }
  }
  
  function _via_file_resolve_all() {
    return new Promise( function(ok_callback, err_callback) {
      var all_promises = [];
  
      var search_path_list = _via_file_get_search_path_list();
      var i, img_id;
      for ( i = 0; i < _via_img_count; ++i ) {
        img_id = _via_image_id_list[i];
        if ( typeof(_via_img_src[img_id]) === 'undefined' || _via_img_src[img_id] === '' ) {
          var p = _via_file_resolve(i, search_path_list);
          all_promises.push(p);
        }
      }
  
      Promise.all( all_promises ).then( function(ok_file_index_list) {
        ok_callback();
        //project_file_load_on_success(ok_file_index);
      }, function(err_file_index_list) {
        err_callback();
        //project_file_load_on_fail(err_file_index);
      });
  
    });
  }
  
  function _via_file_get_search_path_list() {
    var search_path_list = [];
    var path;
    for ( path in _via_settings.core.filepath ) {
      if ( _via_settings.core.filepath[path] !== 0 ) {
        search_path_list.push(path);
      }
    }
    return search_path_list;
  }
  
  function _via_file_resolve(file_index, search_path_list) {
    return new Promise( function(ok_callback, err_callback) {
      var path_index = 0;
      var p = _via_file_resolve_check_path(file_index, path_index, search_path_list).then(function(ok) {
        ok_callback(ok);
      }, function(err) {
        err_callback(err);
      });
    }, false);
  }
  
  function _via_file_resolve_check_path(file_index, path_index, search_path_list) {
    return new Promise( function(ok_callback, err_callback) {
      var img_id = _via_image_id_list[file_index];
      var img = new Image(0,0);
  
      var img_path = search_path_list[path_index] + _via_img_metadata[img_id].filename;
      if ( is_url( _via_img_metadata[img_id].filename ) ) {
        if ( search_path_list[path_index] !== '' ) {
          // we search for the the image filename pointed by URL in local search paths
          img_path = search_path_list[path_index] + get_filename_from_url( _via_img_metadata[img_id].filename );
        }
      }
  
      img.setAttribute('src', img_path);
  
      img.addEventListener('load', function() {
        _via_img_src[img_id] = img_path;
        ok_callback(file_index);
      }, false);
      img.addEventListener('abort', function() {
        err_callback(file_index);
      });
      img.addEventListener('error', function() {
        var new_path_index = path_index + 1;
        if ( new_path_index < search_path_list.length ) {
          _via_file_resolve_check_path(file_index, new_path_index, search_path_list).then( function(ok) {
            ok_callback(file_index);
          }, function(err) {
            err_callback(file_index);
          });
        } else {
          err_callback(file_index);
        }
      }, false);
    }, false);
  }
  