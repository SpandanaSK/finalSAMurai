async function getMultiImageSAMv2Outputs(clear_previous_prompts=true) {
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
    label_id = _via_last_selected_region
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
      model_name: 'SAM2.1 (Tiny)'
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
      _via_img_metadata[_via_image_id].regions.push(point_region);
      
    }
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
    return
  }
}


async function setInitTrackButtonLabel() {
  const btn = document.getElementById('init_track_video_btn');
  const statusResponse = await getSAMv2VideoStatus();
  const status = statusResponse['result'];
  if (status === 'DONE') {
    btn.innerText = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = trackPolygonsInVideo;
  } else if (status === 'ERROR') {
    btn.innerText = 'Init failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("SAM initialization failed.");
  } else if ( status === 'RUNNING') {
    btn.innerText = 'Video init in progress...';
    btn.disabled = true;
  } else if (status === 'NOT_STARTED' || status === 'NO_TASK') {
    btn.disabled = false;
    btn.innerText = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
  } else {
    show_message('Status: ' + status);
  }
}

async function handleInitSAMv2() {
  const btn = document.getElementById('init_track_video_btn');
  btn.disabled = true;
  btn.innerText = 'Video init in progress...';

  // Call init API
  await initSAMv2ForVideo();

  // Start polling for status
  const intervalId = setInterval(async () => {
    const statusResponse = await getSAMv2VideoStatus();
    const status = statusResponse['result'];

    if (status === 'DONE') {
      clearInterval(intervalId);
      btn.disabled = false;
      btn.innerText = 'Track polygons in video';
      btn.onclick = trackPolygonsInVideo;
    } else if (status === 'ERROR') {
      clearInterval(intervalId);
      btn.disabled = false;
      btn.innerText = 'Init failed. Retry';
      btn.onclick = handleInitSAMv2;
      console.error("SAM initialization failed.");
    }
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
    label_id = _via_last_selected_region
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
      model_name: 'SAM2.1 (Tiny)'
    };
    const response = await fetch('/sam-ai/multi_image_sam2_predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
}


