async function getGroundingDinoOutputs(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var text_prompt = document.getElementById('det-text-prompt').value
  var text_thresh = parseFloat(document.getElementById('det-text-thresh').value)
  var box_thresh = parseFloat(document.getElementById('det-box-thresh').value)
  var nms_thresh = parseFloat(document.getElementById('det-nms-thresh').value)
  var get_sam_boxes = document.getElementById('get-sam-boxes').checked
  var file_name = frame_paths[current_frame]
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
      file_name: file_name,
      extra_params: extra_params,
      frame_num: current_frame,
      _via_attributes: _via_attributes,
      label_id: label_id,
      image_id: _via_image_id,
      text_prompt: text_prompt,
      text_thresh: text_thresh,
      box_thresh: box_thresh,
      nms_thresh: nms_thresh,
      get_sam_boxes: get_sam_boxes
    };
    show_message('Getting Auto Label Box (Grounding DINO) outputs...');
    const response = await fetch('/auto-label-box/grounding_dino_box_predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    var options = null
    if (_via_attributes['region'] != undefined && _via_attributes['region']['Auto Box Label'] != undefined) {
      options = _via_attributes['region']['Auto Box Label']['options']
    }
    if (_via_current_attribute_id == '') {
      _via_current_attribute_id = 'Auto Box Label'
    }
    if (clear_previous_prompts) clearCurrentImageGDinoBoxes(current_frame);
    var boxes = await response.json();
    for (var b in boxes) {
      var box = boxes[b]

      var box_region = new file_region();
      box_region.shape_attributes['name'] = box.shape_attributes.name;
      box_region.shape_attributes['width'] = box.shape_attributes.width;
      box_region.shape_attributes['height'] = box.shape_attributes.height;
      box_region.shape_attributes['x'] = box.shape_attributes.x;
      box_region.shape_attributes['y'] = box.shape_attributes.y;
      box_region.region_attributes = box.region_attributes;
      box_region.frame = box.frame_num;
      box_region.temp = true
      _via_img_metadata[_via_image_id].regions.push(box_region);
      new_option = {
        [box_region.region_attributes[Object.keys(box_region.region_attributes)[0]]]: "",
      }
      options = {
        ...options,
        ...new_option
      }
    }
    _via_attributes['region'] = {
      ..._via_attributes['region'],
      ... {
        'Auto Box Label': {
          'type': 'radio',
          'default_options': {},
          'options': options,
          'description': 'Grounding DINO box'
        }
      }
    }
    select_region_shape('box_prompt')
    show_message('Got Grounding DINO outputs');
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get Grounding Dino outputs:', error);
    return
  }
}


async function getOwlVitOutputs(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var text_prompt = document.getElementById('det-text-prompt').value
  var nms_thresh = parseFloat(document.getElementById('det-nms-thresh').value)
  var box_thresh = parseFloat(document.getElementById('det-box-thresh').value)
  var get_sam_boxes = document.getElementById('get-sam-boxes').checked
  var file_name = frame_paths[current_frame]
  var current_prompts = getCurrentImagePrompts(current_frame)
  var img_crop_prompts = current_prompts['img_crop_prompts']
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
      file_name: file_name,
      extra_params: extra_params,
      frame_num: current_frame,
      _via_attributes: _via_attributes,
      label_id: label_id,
      image_id: _via_image_id,
      text_prompt: text_prompt,
      img_crop_prompts: img_crop_prompts,
      nms_thresh: nms_thresh,
      box_thresh: box_thresh,
      get_sam_boxes: get_sam_boxes
    };
    show_message('Getting Auto Label Box (Owl ViT) outputs...');
    const response = await fetch('/auto-label-box/owl_vit_box_predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    var options = null
    if (_via_attributes['region'] != undefined && _via_attributes['region']['Auto Box Label'] != undefined) {
      options = _via_attributes['region']['Auto Box Label']['options']
    }
    if (_via_current_attribute_id == '') {
      _via_current_attribute_id = 'Auto Box Label'
    }
    if (clear_previous_prompts) clearCurrentImageGDinoBoxes(current_frame);
    var boxes = await response.json();
    for (var b in boxes) {
      var box = boxes[b]

      var box_region = new file_region();
      box_region.shape_attributes['name'] = box.shape_attributes.name;
      box_region.shape_attributes['width'] = box.shape_attributes.width;
      box_region.shape_attributes['height'] = box.shape_attributes.height;
      box_region.shape_attributes['x'] = box.shape_attributes.x;
      box_region.shape_attributes['y'] = box.shape_attributes.y;
      box_region.region_attributes = box.region_attributes;
      box_region.frame = box.frame_num;
      box_region.temp = true
      _via_img_metadata[_via_image_id].regions.push(box_region);
      new_option = {
        [box_region.region_attributes[Object.keys(box_region.region_attributes)[0]]]: "",
      }
      options = {
        ...options,
        ...new_option
      }
    }
    _via_attributes['region'] = {
      ..._via_attributes['region'],
      ... {
        'Auto Box Label': {
          'type': 'radio',
          'default_options': {},
          'options': options,
          'description': 'Grounding Owl ViT box'
        }
      }
    }
    select_region_shape('box_prompt')
    show_message('Got Owl ViT outputs');
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get Owl ViT outputs:', error);
    return
  }
}

function updateSliderLabel(which) {
  const slider = document.getElementById(`det-${which}-thresh`);
  const label  = document.getElementById(`${which}-label`);
  label.textContent = parseFloat(slider.value).toFixed(2);
}

function toggleModelSpecificUI () {
  const model = document.getElementById('detector-model').value;
  if (model  != 'owlv2') {
    toggleImgCropDeselect()
    select_region_shape('rect')
  }
  document.getElementById('row-use-regions').style.display =
      (model === 'owlv2') ? 'flex' : 'none';   // show only for OWL
  document.getElementById('row-text-thresh').style.display =
      (model === 'grounding-dino') ? 'flex' : 'none'; // hide for OWL
}

function toggleImgCropSelect () {
  const useEl = document
    .querySelector('#region_shape_img_crop_prompt use');

  // Modern browsers prefer plain “href”; add xlink:href for legacy support
  useEl.setAttribute('href',        `#shape_img_crop_prompt_selected`);   
  useEl.setAttribute('xlink:href',  `#shape_img_crop_prompt_selected`)
}

function toggleImgCropDeselect () {
  if (_via_current_shape == VIA_REGION_SHAPE.IMG_CROP_PROMPT) return 
  const useEl = document
    .querySelector('#region_shape_img_crop_prompt use');

  // Modern browsers prefer plain “href”; add xlink:href for legacy support
  useEl.setAttribute('href',        `#shape_img_crop_prompt`);   
  useEl.setAttribute('xlink:href',  `#shape_img_crop_prompt`)
}

async function getDetectionOutputs () {
  const model = document.getElementById('detector-model').value
  /* TODO: call your backend */
  var run_detect_btn = document.getElementById('auto_label_box_detect_btn')
  run_detect_btn.innerHTML = 'Prediction runnning...'
  run_detect_btn.disabled = true
  if (model == 'grounding-dino') {
    await getGroundingDinoOutputs()
  }
  if (model == 'owlv2') {
    getOwlVitOutputs()
  }
  run_detect_btn.disabled = false
  run_detect_btn.innerHTML = 'Run Detection'
}

/* Initialise */
document.addEventListener('DOMContentLoaded', () => {
  updateSliderLabel('box');
  updateSliderLabel('text');
  updateSliderLabel('nms');
  toggleModelSpecificUI();
});