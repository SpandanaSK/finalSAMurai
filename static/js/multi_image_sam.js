var use_sam_v2 = false

async function getMultiImageSAMv2Outputs(clear_previous_prompts=true) {
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var file_name = frame_paths[current_frame]
  var prompts = getCurrentImagePrompts()
  var prompt_validation = validateSAMv2Prompts(prompts)
  if (prompt_validation[0]) {
    var frame_ids = prompt_validation[1]
    var frame_id_str = frame_ids.join(', ')
    show_message('Warning: Multiple box prompts for the same label in frames: ' + frame_id_str + '. Only the largest box in that frame will be used for tracking.');

  }
  var label_id = null
  if (_via_last_selected_region_attribute == '') {
    if (_via_current_attribute_id != '') {
      label_id = _via_current_attribute_id
    }
  }
  else {
    label_id = _via_last_selected_region.innerHTML
  }
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: image_extra_params,
      frame_num: current_frame,
      box_prompts: prompts['box_prompts'],
      point_prompts: prompts['point_prompts'],
      mask_prompts: prompts['mask_prompts'],
      _via_attributes: _via_attributes,
      label_id: label_id,
      model_name: 'SAM2.1 (Tiny)',
      image_id: _via_image_id
    };
    const response = await fetch('/sam-ai/multi_image_sam2_predict_per_frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    if (clear_previous_prompts) clearCurrentImageSAMPolygons();
    var polygons = await response.json();
    for (var p in polygons) {
      var polygon = polygons[p]

      var point_region = new file_region();
      point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POLYGON;
      point_region.shape_attributes['all_points_x'] = polygon.shape_attributes.all_points_x;
      point_region.shape_attributes['all_points_y'] = polygon.shape_attributes.all_points_y;
      point_region.region_attributes = polygon.region_attributes;
      point_region.frame = polygon.frame_num;
      point_region.temp = polygon.temp
      _via_img_metadata[polygon.file_name].regions.push(point_region);
      
    }
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
    return
  }
}


async function setInitTrackButtonLabel(intervalId) {
  const btn = document.getElementById('init_track_video_btn');
  const statusResponse = await getSAMv2VideoStatus();
  const status = statusResponse['results'];
  use_sam_v2 = false
  if (Object.keys(status).length==0) {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-camera-video"></i>';
    btn.title = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
    disableSAM2FrameInputs(false);
    return 
  }
  if (status['tracking'] === 'TRACKING_DONE') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerHTML = '<i class="bi bi-play-circle"></i>';
    btn.title = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = handleTrackWithSAMv2;
    disableSAM2FrameInputs(false);
    show_message("Tracking completed. You can change frame settings now.");
  } else if (status['tracking'] === 'TRACKING_RUNNING') {
    btn.innerHTML = '<i class="bi bi-hourglass-split"></i>';
    btn.title = 'Tracking in progress...';
    btn.disabled = true;
    disableSAM2FrameInputs(true, "Frame settings cannot be changed while tracking is in progress");
  } else if (status['tracking'] === 'TRACKING_STARTED') {
    btn.innerHTML = '<i class="bi bi-hourglass-top"></i>';
    btn.title = 'Tracking started...';
    btn.disabled = true;
    disableSAM2FrameInputs(true, "Frame settings cannot be changed while tracking is starting");
  } else if (status['tracking'] === 'TRACKING_ERROR') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
    btn.title = 'Tracking failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("Tracking failed.");
    disableSAM2FrameInputs(false);
    show_message("Tracking failed. You can adjust frame settings and try again.");
  } else if (status['init'] === 'INIT_DONE') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerHTML = '<i class="bi bi-play-circle"></i>';
    btn.title = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = handleTrackWithSAMv2;
    disableSAM2FrameInputs(true, "Frame settings cannot be changed after initialization until tracking is complete");
  } else if (status['init'] === 'INIT_RUNNING') {
    btn.innerHTML = '<i class="bi bi-hourglass-top"></i>';
    btn.title = 'Video init in progress...';
    btn.disabled = true;
    disableSAM2FrameInputs(true, "Frame settings cannot be changed while initialization is in progress");
  } else if (status['init'] === 'INIT_ERROR') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerHTML = '<i class="bi bi-exclamation-triangle"></i>';
    btn.title = 'Init failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("SAM initialization failed.");
    disableSAM2FrameInputs(false);
    show_message("Initialization failed. You can adjust frame settings and try again.");
  } else if (status['init'] === 'NO_TASK') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-camera-video"></i>';
    btn.title = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
    disableSAM2FrameInputs(false);
  } else {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.disabled = false;
    btn.innerHTML = '<i class="bi bi-question-circle"></i>';
    btn.title = status + ' .Try again maybe??';
    btn.onclick = handleInitSAMv2;
    disableSAM2FrameInputs(false);
    console.log('Status: ' + JSON.stringify(status));
  }
}

async function handleInitSAMv2() {
  const btn = document.getElementById('init_track_video_btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-top"></i>';
  btn.title = 'Video init in progress...';
  
  // Disable frame inputs
  disableSAM2FrameInputs(true, "Frame settings cannot be changed while initialization is in progress");

  use_sam_v2 = true

  // Call init API
  await initSAMv2ForVideo();

  // Start polling for status
  const intervalId = setInterval(async () => {
    setInitTrackButtonLabel(intervalId);
    // For other statuses like RUNNING, NOT_STARTED, NO_TASK, keep polling.
  }, 2000); // check every 2 seconds
}

async function initSAMv2ForVideo() {
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']
  var num_frames = frame_paths.length;

  // Get selected model from dropdown
  const modelSelect = document.getElementById('sam-multi-model-options');
  const selectedModel = modelSelect ? modelSelect.value : 'SAM2.1 (Tiny)';

  // Get start frame, end frame, and reverse video settings
  const startFrameElem = document.getElementById('sam2-start-frame');
  const endFrameElem = document.getElementById('sam2-end-frame');
  const reverseVideoElem = document.getElementById('sam2-reverse-video');
  
  // Convert values to appropriate types (number for frames, boolean for reverse)
  let startFrame = startFrameElem && startFrameElem.value !== '' ? parseInt(startFrameElem.value) : 0;
  let endFrame = endFrameElem && endFrameElem.value !== '' ? parseInt(endFrameElem.value) : -1;
  const reverseVideo = reverseVideoElem ? reverseVideoElem.checked : false;
  
  // Validate and correct frame ranges
  if (startFrame < 0) {
    startFrame = 0;
    if (startFrameElem) startFrameElem.value = 0;
  }
  
  if (endFrame >= num_frames) {
    endFrame = num_frames - 1;
    if (endFrameElem) endFrameElem.value = endFrame;
  } else if (endFrame < 0) {
    endFrame = num_frames - 1;
    if (endFrameElem) endFrameElem.value = endFrame;
  }
  
  // Make sure start frame is less than or equal to end frame
  if (startFrame > endFrame && endFrame !== -1) {
    startFrame = 0;
    if (startFrameElem) startFrameElem.value = 0;
  }

  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: image_extra_params,
      model_name: selectedModel,
      start_frame: startFrame,
      end_frame: endFrame,
      reverse_video: reverseVideo
    };
    const response = await fetch('/sam-ai/multi_image_sam2_init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    var result =  await response.json()
    return result
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
}

async function getSAMv2VideoStatus(){
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']

  // Get selected model from dropdown
  const modelSelect = document.getElementById('sam-multi-model-options');
  const selectedModel = modelSelect ? modelSelect.value : 'SAM2.1 (Tiny)';

  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: current_extra_params,
      model_name: selectedModel
    };
    const response = await fetch('/sam-ai/multi_image_sam2_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
}

async function handleTrackWithSAMv2() {
  const btn = document.getElementById('init_track_video_btn');
  btn.disabled = true;
  btn.innerHTML = '<i class="bi bi-hourglass-top"></i>';
  btn.title = 'Tracking started...';
  
  // Disable frame inputs
  disableSAM2FrameInputs(true, "Frame settings cannot be changed while tracking is in progress");

  await trackWithSAMV2(true);

  // Start polling for status
  const intervalId = setInterval(async () => {
    setInitTrackButtonLabel(intervalId);
    // For other statuses like RUNNING, NOT_STARTED, NO_TASK, keep polling.
  }, 2000); // check every 2 seconds
}

async function trackWithSAMV2(clear_previous_prompts=true) {
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var file_name = frame_paths[current_frame]
  var prompts = getCurrentImagePrompts()
  var label_id = null
  if (_via_last_selected_region_attribute == '') {
    if (_via_current_attribute_id != '') {
      label_id = _via_current_attribute_id
    }
  }
  else {
    label_id = _via_last_selected_region.innerHTML
  }

  // Get selected model from dropdown
  const modelSelect = document.getElementById('sam-multi-model-options');
  const selectedModel = modelSelect ? modelSelect.value : 'SAM2.1 (Tiny)';

  // Get start frame, end frame, and reverse video settings
  const startFrameElem = document.getElementById('sam2-start-frame');
  const endFrameElem = document.getElementById('sam2-end-frame');
  const reverseVideoElem = document.getElementById('sam2-reverse-video');
  
  // Convert values to appropriate types (number for frames, boolean for reverse)
  let startFrame = startFrameElem && startFrameElem.value !== '' ? parseInt(startFrameElem.value) : 0;
  let endFrame = endFrameElem && endFrameElem.value !== '' ? parseInt(endFrameElem.value) : -1;
  const reverseVideo = reverseVideoElem ? reverseVideoElem.checked : false;

  if (clear_previous_prompts) clearCurrentImageSAMPolygons();
  const eventSource = new EventSource(`/sam-ai/multi_image_sam2_track_objects?file_name=${_via_image_filename_list[_via_image_index]}&extra_params=${JSON.stringify(image_extra_params)}`+
  `&frame_num=${current_frame}&_via_attributes=${JSON.stringify(_via_attributes)}`+
  `&box_prompts=${JSON.stringify(prompts['box_prompts'])}&point_prompts=${JSON.stringify(prompts['point_prompts'])}`+
  `&mask_prompts=${JSON.stringify(prompts['mask_prompts'])}&label_id=${label_id}&model_name=${selectedModel}&image_id=${_via_image_id}`+
  `&start_frame=${startFrame}&end_frame=${endFrame}&reverse_video=${reverseVideo}`);
  eventSource.onmessage = function(event) {
    // Parse the JSON string to an object
    const data = JSON.parse(event.data);
    var status = data.status
    var polygons = data.polygons
    if (status === "DONE") {
      show_message('Finished fetching predictions. Add/edit/remove prompts for refinement or press F again to confirm the polygons')
      eventSource.close(); 
      _via_redraw_reg_canvas()
      return;
    }
    else if (status === "RUNNING") {
      for (var p in polygons) {
        var polygon = polygons[p]
        var polygon_file_region = new file_region()
        var image_id = polygon.image_id
        polygon_file_region.region_attributes = polygon.region_attributes
        polygon_file_region.shape_attributes = polygon.shape_attributes
        polygon_file_region.frame = polygon.frame_num.toString()
        polygon_file_region.temp = polygon.temp
        _via_img_metadata[image_id]['regions'] = _via_img_metadata[image_id]['regions'].concat(polygon_file_region)
        _via_add_canvas_region(polygon_file_region)
        // _via_load_canvas_regions()
        show_message('Fetched predictions for '+image_id+' image frame: '+ polygon.frame_num, 500)
        _via_redraw_reg_canvas()
      }
      return;
    }
    else {
      eventSource.close();  // Close the connection if there's an error
      show_message(status)
    }
  }
  eventSource.onerror = function(event) {
    console.error('Error occurred:', event);
    eventSource.close();  // Close the connection on error
  };
}

// Function to fetch available multi image models
async function fetchMultiImageModels() {
  try {
    const response = await fetch('/sam-ai/get_multi_image_prediction_model_list');
    if (!response.ok) {
      throw new Error('Failed to fetch multi image models');
    }
    const models = await response.json();
    console.log('Multi Image Models API Response:', models);
    return models;
  } catch (error) {
    console.error('Error fetching multi image models:', error);
    return ['---']; // Fallback to default model
  }
}

// Function to update multi image model options
async function updateMultiImageModelOptions() {
  const modelSelect = document.getElementById('sam-multi-model-options');
  if (!modelSelect) return;

  const models = await fetchMultiImageModels();
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  // Add new options
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.text = model;
    if (model === 'SAM2.1 (Tiny)') {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  });
}

// Function to handle model change
function updateMultiImageModel() {
  const modelSelect = document.getElementById('sam-multi-model-options');
  if (!modelSelect) return;
  
  const selectedModel = modelSelect.value;
  // Update any model-specific UI or settings here
  console.log('Selected multi image model:', selectedModel);
}

// Initialize model options when the page loads
document.addEventListener('DOMContentLoaded', () => {
  updateMultiImageModelOptions();
});

// Function to validate SAM2 frame inputs
async function validateSAM2FrameInputs() {
  // Get the current image information
  const current_extra_params = get_current_extra_params();
  const m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params);
  const num_frames = m_current_image['frame_paths'].length;
  
  // Get the current video status
  const statusResponse = await getSAMv2VideoStatus();
  const status = statusResponse['results'];
  
  // Check if initialization or tracking is in progress - if so, disable inputs
  if (status['init'] === 'INIT_RUNNING' || 
      status['tracking'] === 'TRACKING_STARTED' || 
      status['tracking'] === 'TRACKING_RUNNING') {
    disableSAM2FrameInputs(true, "Frame settings cannot be changed during initialization or tracking");
    return;
  }
  
  // If init is INIT_DONE but tracking hasn't completed, still disable
  if (status['init'] === 'INIT_DONE' && status['tracking'] !== 'TRACKING_DONE') {
    disableSAM2FrameInputs(true, "Frame settings can only be changed after tracking is completed");
    return;
  }
  
  // Enable inputs and validate their values
  disableSAM2FrameInputs(false);
  
  // Get the input elements
  const startFrameElem = document.getElementById('sam2-start-frame');
  const endFrameElem = document.getElementById('sam2-end-frame');
  const reverseVideoElem = document.getElementById('sam2-reverse-video');
  
  if (!startFrameElem || !endFrameElem) return;
  
  // Get current values
  let startFrame = startFrameElem.value !== '' ? parseInt(startFrameElem.value) : 0;
  let endFrame = endFrameElem.value !== '' ? parseInt(endFrameElem.value) : num_frames - 1;
  
  // Apply validation rules
  // 1. Start frame must be >= 0
  if (startFrame < 0) {
    startFrame = 0;
    startFrameElem.value = 0;
    show_message("Start frame must be greater than or equal to 0");
  }
  
  // 2. End frame must be < num_frames
  if (endFrame >= num_frames) {
    endFrame = num_frames - 1;
    endFrameElem.value = endFrame;
    show_message(`End frame must be less than ${num_frames}`);
  }
  
  // 3. If end frame is -1, treat it as the last frame
  if (endFrame < 0) {
    endFrame = num_frames - 1;
    endFrameElem.value = endFrame;
  }
  
  // 4. Start frame must be <= end frame
  if (startFrame > endFrame && endFrame !== -1) {
    startFrame = 0;
    startFrameElem.value = 0;
    show_message("Start frame must be less than or equal to end frame");
  }
}

// Function to enable/disable SAM2 frame inputs
function disableSAM2FrameInputs(disable, message) {
  const startFrameElem = document.getElementById('sam2-start-frame');
  const endFrameElem = document.getElementById('sam2-end-frame');
  const reverseVideoElem = document.getElementById('sam2-reverse-video');
  
  if (startFrameElem) startFrameElem.disabled = disable;
  if (endFrameElem) endFrameElem.disabled = disable;
  if (reverseVideoElem) reverseVideoElem.disabled = disable;
  
  if (disable && message) {
    show_message(message);
  }
}


