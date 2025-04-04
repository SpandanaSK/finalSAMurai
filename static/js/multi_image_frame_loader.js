

async function set_num_frames(current_image) {
  // if (_via_current_image_filename == null) 
  //   return
  var num_frames = current_image['frame_paths'].length
  document.getElementById('video-slider').setAttribute('max', num_frames-1)
  document.getElementById('video-slider').value = current_image.last_viewed_frame
  document.getElementById('current-frame').value = current_image.last_viewed_frame
  if (num_frames-1 == 0) {
    document.getElementById('video-slider').disabled = true
    document.getElementById('current-frame').disabled = true
  }
  else {
    document.getElementById('video-slider').disabled = false
    document.getElementById('current-frame').disabled = false
  }
  return;
  
}


var is_preloading = false;
async function preload_images(current_image, current_frame, max_frame, n_frames) {
  if (is_preloading) {
    return; // Prevent re-entry if already preloading
  }
  is_preloading = true
  var max_frame_int = parseInt(max_frame);
  // Calculate how many frames to preload before and after the current frame
  var startFrame, endFrame;
  const tasks = [];
  if (current_frame === 0) {
    // If current frame is 0, preload the next n_frames
    startFrame = 0;
    endFrame = Math.min(n_frames, max_frame_int);
  } else if (current_frame === max_frame_int) {
    // If current frame is the last frame, preload the previous n_frames
    startFrame = Math.max(current_frame - n_frames, 0);
    endFrame = current_frame;
  } else {
    // For other frames, preload previous and next frames, maintaining n_frames total
    var frames_before = Math.min(current_frame, Math.floor(n_frames / 2)); // Preload half before
    var frames_after = Math.min(n_frames - frames_before, max_frame_int - current_frame); // Preload remaining after

    startFrame = Math.max(current_frame - frames_before, 0);
    endFrame = Math.min(current_frame + frames_after, max_frame_int);
  }

  var unique_id1 = current_image.unique_id;
  var filename = unique_id1.split('/')[unique_id1.split('/').length-1]
  var extension = filename.split('.')[filename.split('.').length-1]
  for (var frame = startFrame; frame < endFrame; frame++) {
    var frame_str = frame.toString().padStart(5, '0');
    var unique_id = unique_id1.replace(filename, `${frame_str}.${extension}`)
    var cachedImage = precached_bimg.get(unique_id);
    if (!cachedImage) { // Only cache if not already in cache
      const new_image =  await render(_via_image_filename_list[_via_image_index], frame, get_current_extra_params());
      const img = new Image();
      img.src = new_image;
      precached_bimg.set(unique_id, img);
    }
  }
  is_preloading = false;
}

var current_img_cache = new Map();

async function set_current_image(file_name, extra_params) {
  const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([file_name, sorted_extra_params]);
  if (current_img_cache.get(key)) {
    var m_current_image = current_img_cache.get(key)
    return m_current_image
  }
  const response = await fetch('/im-vid-rendering/async_render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: file_name,
      extra_params: extra_params,
    })
  }); 
  if (!response.ok) {
    throw new Error('Failed to fetch unique name');
  }
  const jsonResponse = await response.json();
  if (!jsonResponse.hasOwnProperty('result')) {
    throw new Error('Response does not contain result');
  }
  console.log(jsonResponse)
  var file_name, extra_params, unique_id, frame_paths;
  file_name = jsonResponse['result']['file_name']
  extra_params = jsonResponse['result']['extra_params']
  unique_id = jsonResponse['result']['paths'][0]
  frame_paths = jsonResponse['result']['paths']
  var m_current_image = new file_info(file_name, extra_params, unique_id, frame_paths, 0);
  current_img_cache.set(key, m_current_image)
  return m_current_image;
}

function get_current_extra_params() {
  // TODO get extra params from HTML elements
  return {};
}


async function get_current_image(element) {
  var img_id = _via_image_index
  var current_image = _via_image_filename_list[img_id]
  var video_slider_elem = document.getElementById('video-slider')
  var input_text_frame_elem = document.getElementById('current-frame')
  var active_element = document.activeElement
  
  if (parseInt(input_text_frame_elem.value) < 0 || parseInt(video_slider_elem.value) < 0) {
    video_slider_elem.value = "0"
    input_text_frame_elem.value = "0"
  }
  else if (parseInt(input_text_frame_elem.value) > video_slider_elem.max) {
    video_slider_elem.value = video_slider_elem.max
    input_text_frame_elem.value = video_slider_elem.max
  }
  if (document.activeElement == input_text_frame_elem)
    video_slider_elem.value = input_text_frame_elem.value
  else if (document.activeElement == video_slider_elem)
    input_text_frame_elem.value =  video_slider_elem.value

  // TODO add extra params here from html elements
  var extra_params = get_current_extra_params();
  
  async function get_image(preload) {
    var bim_idx = _via_img_buffer_get_html_id(_via_image_index);
    if (bim_idx == null) {
      return;
    }
    
    var bimg = document.getElementById(bim_idx)
    const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
    var key = JSON.stringify([current_image, sorted_extra_params])
    var m_current_image = current_img_cache.get(key)
    m_current_image.last_viewed_frame = parseInt(input_text_frame_elem.value)
    var current_frame = parseInt(element.value);
    var frame_paths = m_current_image.frame_paths
    var unique_id = frame_paths[current_frame]
    var cachedImage = precached_bimg.get(unique_id);

    // If the image is cached, load it from cache
    // _via_buffer_remove(_via_image_index)
    if (cachedImage) {
      bimg.src = cachedImage.src;
    } else {
      var new_image = await render_file(unique_id);
      const imgObj = new Image();
      imgObj.src = new_image;
      bimg.setAttribute("src", new_image);
      precached_bimg.set(unique_id, imgObj);
      if (preload && !is_preloading) {
        preload_images(m_current_image, current_frame, video_slider_elem.max, limit);
      }
    }  
    var img_index = _via_image_index
    // _via_img_buffer_add_image_frame(img_index).then( function(ok_img_index) {
    //   _via_is_loading_current_image = false;
    //   img_loading_spinbar(img_index, false);
    //   _via_show_img(img_index);
    // }, function(err_img_index) {
    //   _via_is_loading_current_image = false;
    //   img_loading_spinbar(img_index, false);
    //   show_page_404(img_index);
    //   console.log('_via_img_buffer_add_image_frame() failed for file: ' + _via_image_filename_list[err_img_index]);
    // });
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    annotation_editor_remove();
    annotation_editor_show();
    annotation_editor_hide();
    image_updated = true;
    return;
  }
  if (active_element !== element) {
    return
  }
  get_image(true)
}

