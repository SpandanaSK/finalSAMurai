var use_sam_v2 = false

async function getMultiImageSAMv2Outputs(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
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
      extra_params: extra_params,
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
    btn.innerText = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
    return 
  }
  if (status['init'] === 'TRACKING_DONE') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerText = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = handleTrackWithSAMv2;
  } else if (status['init'] === 'TRACKING_RUNNING') {
    btn.innerText = 'Tracking in progress...';
    btn.disabled = true;
  } else if (status['init'] === 'TRACKING_STARTED') {
    btn.innerText = 'Tracking started...';
    btn.disabled = true;
  } else if (status['init'] === 'TRACKING_ERROR') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerText = 'Tracking failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("Tracking failed.");
  } else if (status['init'] === 'INIT_DONE') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerText = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = handleTrackWithSAMv2;
  } else if ( status['init'] === 'INIT_RUNNING') {
    btn.innerText = 'Video init in progress...';
    btn.disabled = true;
  } else if (status['init'] === 'INIT_ERROR') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.innerText = 'Init failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("SAM initialization failed.");
  } else if (status['init'] === 'NO_TASK') {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.disabled = false;
    btn.innerText = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
  } else {
    if (intervalId) {
      clearInterval(intervalId);
    }
    btn.disabled = false;
    btn.innerText = status + ' .Try again maybe??';
    btn.onclick = handleInitSAMv2;
    console.log('Status: ' + JSON.stringify(status));
  }
}

async function handleInitSAMv2() {
  const btn = document.getElementById('init_track_video_btn');
  btn.disabled = true;
  btn.innerText = 'Video init in progress...';

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
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      model_name: 'SAM2.1 (Tiny)'
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
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      model_name: 'SAM2.1 (Tiny)'
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
  btn.innerText = 'Tracking started...';

  await trackWithSAMV2(true);

  // Start polling for status
  const intervalId = setInterval(async () => {
    setInitTrackButtonLabel(intervalId);
    // For other statuses like RUNNING, NOT_STARTED, NO_TASK, keep polling.
  }, 1000); // check every 2 seconds
}

async function trackWithSAMV2(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
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
  if (clear_previous_prompts) clearCurrentImageSAMPolygons();
  const eventSource = new EventSource(`/sam-ai/multi_image_sam2_track_objects?file_name=${_via_image_filename_list[_via_image_index]}&extra_params=${JSON.stringify(extra_params)}`+
  `&frame_num=${current_frame}&_via_attributes=${JSON.stringify(_via_attributes)}`+
  `&box_prompts=${JSON.stringify(prompts['box_prompts'])}&point_prompts=${JSON.stringify(prompts['point_prompts'])}`+
  `&mask_prompts=${JSON.stringify(prompts['mask_prompts'])}&label_id=${label_id}&model_name=SAM2.1 (Tiny)&image_id=${_via_image_id}`);
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


