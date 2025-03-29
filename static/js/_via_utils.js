
function is_url( s ) {
    // @todo: ensure that this is sufficient to capture all image url
    if ( s.startsWith('http://') || s.startsWith('https://') || s.startsWith('www.') ) {
      return true;
    } else {
      return false;
    }
  }
  
  function get_filename_from_url( url ) {
    return url.substring( url.lastIndexOf('/') + 1 );
  }
  
  function fixfloat(x) {
    return parseFloat( x.toFixed(VIA_FLOAT_PRECISION) );
  }
  
  function shape_attribute_fixfloat(sa) {
    for ( var attr in sa ) {
      switch(attr) {
      case 'x':
      case 'y':
      case 'width':
      case 'height':
      case 'r':
      case 'rx':
      case 'ry':
        sa[attr] = fixfloat( sa[attr] );
        break;
      case 'all_points_x':
      case 'all_points_y':
        for ( var i in sa[attr] ) {
          sa[attr][i] = fixfloat( sa[attr][i] );
        }
      }
    }
  }
  
  // start with the array having smallest number of elements
  // check the remaining arrays if they all contain the elements of this shortest array
  function array_intersect( array_list ) {
    if ( array_list.length === 0 ) {
      return [];
    }
    if ( array_list.length === 1 ) {
      return array_list[0];
    }
  
    var shortest_array = array_list[0];
    var shortest_array_index = 0;
    var i;
    for ( i = 1; i < array_list.length; ++i ) {
      if ( array_list[i].length < shortest_array.length ) {
        shortest_array = array_list[i];
        shortest_array_index = i;
      }
    }
  
    var intersect = [];
    var element_count = {};
  
    var array_index_i;
    for ( i = 0; i < array_list.length; ++i ) {
      if ( i === 0 ) {
        // in the first iteration, process the shortest element array
        array_index_i = shortest_array_index;
      } else {
        array_index_i = i;
      }
  
      var j;
      for ( j = 0; j < array_list[array_index_i].length; ++j ) {
        if ( element_count[ array_list[array_index_i][j] ] === (i-1) ) {
          if ( i === array_list.length - 1 ) {
            intersect.push( array_list[array_index_i][j] );
            element_count[ array_list[array_index_i][j] ] = 0;
          } else {
            element_count[ array_list[array_index_i][j] ] = i;
          }
        } else {
          element_count[ array_list[array_index_i][j] ] = 0;
        }
      }
    }
    return intersect;
  }
  
  function generate_img_index_list(input) {
    var all_img_index_list = [];
  
    // condition: count format a,b
    var count_format_img_index_list = [];
    if ( input.prev_next_count.value !== '' ) {
      var prev_next_split = input.prev_next_count.value.split(',');
      if ( prev_next_split.length === 2 ) {
        var prev = parseInt( prev_next_split[0] );
        var next = parseInt( prev_next_split[1] );
        var i;
        for ( i = (_via_image_index - prev); i <= (_via_image_index + next); i++ ) {
          count_format_img_index_list.push(i);
        }
      }
    }
    if ( count_format_img_index_list.length !== 0 ) {
      all_img_index_list.push(count_format_img_index_list);
    }
  
    //condition: image index list expression
    var expr_img_index_list = [];
    if ( input.img_index_list.value !== '' ) {
      var img_index_expr = input.img_index_list.value.split(',');
      if ( img_index_expr.length !== 0 ) {
        var i;
        for ( i = 0; i < img_index_expr.length; ++i ) {
          if ( img_index_expr[i].includes('-') ) {
            var ab = img_index_expr[i].split('-');
            var a = parseInt( ab[0] ) - 1; // 0 based indexing
            var b = parseInt( ab[1] ) - 1;
            var j;
            for ( j = a; j <= b; ++j ) {
              expr_img_index_list.push(j);
            }
          } else {
            expr_img_index_list.push( parseInt(img_index_expr[i]) - 1 );
          }
        }
      }
    }
    if ( expr_img_index_list.length !== 0 ) {
      all_img_index_list.push(expr_img_index_list);
    }
  
  
    // condition: regular expression
    var regex_img_index_list = [];
    if ( input.regex.value !== '' ) {
      var regex = input.regex.value;
      for ( var i=0; i < _via_image_filename_list.length; ++i ) {
        var filename = _via_image_filename_list[i];
        if ( filename.match(regex) !== null ) {
          regex_img_index_list.push(i);
        }
      }
    }
    if ( regex_img_index_list.length !== 0 ) {
      all_img_index_list.push(regex_img_index_list);
    }
  
    var intersect = array_intersect(all_img_index_list);
    return intersect;
  }
  
  //
  // keep a record of image statistics (e.g. width, height, ...)
  //
  function img_stat_set(img_index, stat) {
    if ( stat.length ) {
      _via_img_stat[img_index] = stat;
    } else {
      delete _via_img_stat[img_index];
    }
  }
  
  function img_stat_set_all() {
    return new Promise( function(ok_callback, err_callback) {
      var promise_list = [];
      var img_id;
      for ( var img_index in _via_image_id_list ) {
        if ( ! _via_img_stat.hasOwnProperty(img_index) ) {
          img_id = _via_image_id_list[img_index];
          if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty('width') &&
               _via_img_metadata[img_id].file_attributes.hasOwnProperty('height')
             ) {
            _via_img_stat[img_index] = [_via_img_metadata[img_id].file_attributes['width'],
                                        _via_img_metadata[img_id].file_attributes['height'],
                                       ];
          } else {
            promise_list.push( img_stat_get(img_index) );
          }
        }
      }
      if ( promise_list.length ) {
        Promise.all(promise_list).then( function(ok) {
          ok_callback();
        }.bind(this), function(err) {
          console.warn('Failed to read statistics of all images!');
          err_callback();
        });
      } else {
        ok_callback();
      }
    }.bind(this));
  }
  
  function img_stat_get(img_index) {
    return new Promise( function(ok_callback, err_callback) {
      var img_id = _via_image_id_list[img_index];
      var tmp_img = document.createElement('img');
      var tmp_file_object_url = null;
      tmp_img.addEventListener('load', function() {
        _via_img_stat[img_index] = [tmp_img.naturalWidth, tmp_img.naturalHeight];
        if ( tmp_file_object_url !== null ) {
          URL.revokeObjectURL(tmp_file_object_url);
        }
        ok_callback();
      }.bind(this));
      tmp_img.addEventListener('error', function() {
        _via_img_stat[img_index] = [-1, -1];
        if ( tmp_file_object_url !== null ) {
          URL.revokeObjectURL(tmp_file_object_url);
        }
        ok_callback();
      }.bind(this));
  
      if ( _via_img_fileref[img_id] instanceof File ) {
        tmp_file_object_url = URL.createObjectURL(_via_img_fileref[img_id]);
        tmp_img.src = tmp_file_object_url;
      } else {
        tmp_img.src = _via_img_src[img_id];
      }
    }.bind(this));
  }
  
  
  // pts = [x0,y0,x1,y1,....]
  function polygon_to_bbox(pts) {
    var xmin = +Infinity;
    var xmax = -Infinity;
    var ymin = +Infinity;
    var ymax = -Infinity;
    for ( var i = 0; i < pts.length; i = i + 2 ) {
      if ( pts[i] > xmax ) {
        xmax = pts[i];
      }
      if ( pts[i] < xmin ) {
        xmin = pts[i];
      }
      if ( pts[i+1] > ymax ) {
        ymax = pts[i+1];
      }
      if ( pts[i+1] < ymin ) {
        ymin = pts[i+1];
      }
    }
    return [xmin, ymin, xmax-xmin, ymax-ymin];
  }
  
  