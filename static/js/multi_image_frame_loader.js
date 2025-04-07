

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
      precached_bimg.set(unique_id, new_image);
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
  file_name = jsonResponse['result']['file_path']
  extra_params = jsonResponse['result']['extra_params']
  unique_id = jsonResponse['result']['paths'][0]
  frame_paths = jsonResponse['result']['paths']
  var m_current_image = new file_info(file_name, extra_params, unique_id, frame_paths, 0, jsonResponse['result']['fps']);
  current_img_cache.set(key, m_current_image)
  return m_current_image;
}

function get_current_extra_params() {
  // TODO get extra params from HTML elements
  return {};
}


function load_image_with_retry(bimg, src, max_retries = 3) {
  let attempts = 0;

  const try_load = () => {
    attempts++;
    console.log(`Attempt ${attempts}: loading frame from ${src}`);
    bimg.src = src;
  };

  bimg.addEventListener('error', () => {
    if (attempts < max_retries) {
      console.warn(`Retrying frame load (${attempts}/${max_retries})...`);
      setTimeout(try_load, 500); // slight delay between retries
    } else {
      bimg.setAttribute('alt', 'Image failed to load.');
      console.error(`Failed to load image after ${max_retries} attempts.`);
      project_file_load_on_fail(_via_image_index);
    }
  });

  bimg.addEventListener('load', () => {
    console.log(`Image loaded successfully after ${attempts} attempt(s).`);
    // success path already handled elsewhere
  });

  try_load(); // initial attempt
}


var is_getting = false;

async function get_current_video_frame(element) {
  element.focus();

  const img_id = _via_image_index;
  const current_image = _via_image_filename_list[img_id];

  const video_slider_elem = document.getElementById('video-slider');
  const input_text_frame_elem = document.getElementById('current-frame');
  const active_element = document.activeElement;

  if (element === input_text_frame_elem)
    video_slider_elem.value = input_text_frame_elem.value;
  else if (element === video_slider_elem)
    input_text_frame_elem.value = video_slider_elem.value;

  const max_frame = parseInt(video_slider_elem.max);
  let current_frame = parseInt(element.value.trim());

  const extra_params = get_current_extra_params();
  const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
  const key = JSON.stringify([current_image, sorted_extra_params]);
  const m_current_image = current_img_cache.get(key);
  const fps = m_current_image.fps;
  if (!m_current_image) {
    console.warn('Missing image metadata in cache for key:', key);
    return;
  }

  if (!m_current_image.frame_paths || !m_current_image.frame_paths[current_frame]) {
    console.warn(`Invalid frame ${current_frame}`);
    return;
  }

  m_current_image.last_viewed_frame = current_frame;
  const frame_paths = m_current_image.frame_paths;
  const unique_id = frame_paths[current_frame];
  const bim_idx = _via_img_buffer_get_html_id_frame(_via_image_index, "frame_viewer");

  if (active_element !== element) return;

  if (_via_current_image.tagName === 'VIDEO') {
    _via_current_image.currentTime = current_frame / fps;
  }
  try {
    // Set canvas and annotations
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    annotation_editor_remove();
    annotation_editor_show();
    annotation_editor_hide();
  } catch (error) {
    console.error('Error during canvas or annotation update:', error);
    is_getting = false;
    is_preloading = false;
  }
}

async function get_current_image1111(element) {
  // if (is_getting) return; // Prevent re-entry if already getting image
  is_getting = true;

  
  element.focus();

  const img_id = _via_image_index;
  const current_image = _via_image_filename_list[img_id];

  const video_slider_elem = document.getElementById('video-slider');
  const input_text_frame_elem = document.getElementById('current-frame');
  const active_element = document.activeElement;

  if (element === input_text_frame_elem)
    video_slider_elem.value = input_text_frame_elem.value;
  else if (element === video_slider_elem)
    input_text_frame_elem.value = video_slider_elem.value;

  const max_frame = parseInt(video_slider_elem.max);
  let current_frame = parseInt(element.value.trim());

  const extra_params = get_current_extra_params();
  const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
  const key = JSON.stringify([current_image, sorted_extra_params]);
  const m_current_image = current_img_cache.get(key);

  if (!m_current_image) {
    console.warn('Missing image metadata in cache for key:', key);
    return;
  }

  if (!m_current_image.frame_paths || !m_current_image.frame_paths[current_frame]) {
    console.warn(`Invalid frame ${current_frame}`);
    return;
  }

  m_current_image.last_viewed_frame = current_frame;
  const frame_paths = m_current_image.frame_paths;
  const unique_id = frame_paths[current_frame];
  const bim_idx = _via_img_buffer_get_html_id_frame(_via_image_index, "frame_viewer");

  if (active_element !== element) return;

  // Load from cache or render
  var cachedImage = precached_bimg.get(unique_id);
  if (!cachedImage)  {
    cachedImage = await render(current_image, current_frame, extra_params);
    precached_bimg.set(unique_id, cachedImage);
  }

  let bimg = document.getElementById(bim_idx);
  if (!bimg) {
    bimg = create_new_frame_viewer(img_id, bim_idx, cachedImage, null, null)
  } else {
    bimg.setAttribute("src", cachedImage);
  }

  try {
    // Set canvas and annotations
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    annotation_editor_remove();
    annotation_editor_show();
    annotation_editor_hide();
  } catch (error) {
    console.error('Error during canvas or annotation update:', error);
    is_getting = false;
    is_preloading = false;
  }

  

  image_updated = true;
  // Hide existing frame images
  // const all_buffered = _via_img_panel.querySelectorAll('img[id^="bim'+JSON.stringify(img_id)+'"]');
  // for (let bimg1 of all_buffered) {
  //   if (bimg1.id !== bim_idx) {
  //     bimg1.classList.remove('visible');
  //   }
  // }

  // Preload more frames
  await _via_img_frame_preload(_via_image_index, current_frame, 5, 5);
  is_getting = false;
}


