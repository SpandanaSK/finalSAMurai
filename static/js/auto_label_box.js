async function getGroundingDinoOutputs(clear_previous_prompts=true) {
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  if (m_current_image == undefined) return
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var text_prompt = document.getElementById('det-text-prompt').value
  if (text_prompt == "") return
  var text_thresh = parseFloat(document.getElementById('det-text-thresh').value)
  var box_thresh = parseFloat(document.getElementById('det-box-thresh').value)
  var nms_thresh = parseFloat(document.getElementById('det-nms-thresh').value)
  var get_sam_boxes = document.getElementById('get-sam-boxes').value
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
      extra_params: image_extra_params,
      frame_num: current_frame,
      _via_attributes: _via_attributes,
      label_id: label_id,
      image_id: _via_image_id,
      text_prompt: text_prompt,
      text_thresh: text_thresh,
      box_thresh: box_thresh,
      nms_thresh: nms_thresh
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
    }
    _via_attributes['region'] = {
      ..._via_attributes['region'],
      ... {
        'Auto Box Label': {
          'type': 'text'
        }
      }
    }
    select_region_shape('rect')
    show_message('Got Grounding DINO outputs');
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get Grounding Dino outputs:', error);
    return
  }
}

async function confirmGroundingDinoOutputs(){
  var get_sam_boxes = document.getElementById('get-sam-boxes').checked
  var current_gdino_box_ids = getCurrentImageGDinoBoxesIdx()
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var current_frame = document.getElementById('current-frame').value
  var label_id = null
  var save_label_de = document.getElementById('save-to-attribute-name')
  var save_label_options = save_label_de.options
  var save_label_current_option = save_label_de.selectedIndex
  label_id = save_label_options[save_label_current_option]
  label_id = label_id.innerHTML
  if (label_id == "Auto Box Label") {
    show_message('Cannot save the labels to Auto Box Label. Create or choose a different region attribute id', 1000)
    return;
  }
  var regions =  _via_img_metadata[_via_image_id].regions
  for (var idx in current_gdino_box_ids) {
    var region = regions[parseInt(current_gdino_box_ids[idx])]
    if (get_sam_boxes) region.shape_attributes.name = 'box_prompt'
    else region.shape_attributes.name = 'rect'
    if ('temp' in region) {
      delete region.temp
    }
    var reg_attr =  region.region_attributes['Auto Box Label'].trim()
    region.region_attributes[label_id] = reg_attr
    var new_options = {}
    new_options[reg_attr] = ""
    if ("options" in _via_attributes.region[label_id]) {
      _via_attributes.region[label_id]['options'] = {
        ..._via_attributes.region[label_id]['options'],
        ...new_options
      }
    } 
    else {
      _via_attributes.region[label_id]['options'] = new_options
    }
    delete region.region_attributes['Auto Box Label']
  }
  delete _via_attributes.region['Auto Box Label']
  _via_attributes.region[label_id]['default_value'] = ''
  _via_attributes.region[label_id]['default_options'] = {}
  if (get_sam_boxes) {
    show_message('Getting SAM outputs')
    processSAMPrompts()
  }
  update_attributes_update_panel()
  annotation_editor_update_content();
  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
}


async function getOwlVitOutputs(clear_previous_prompts=true) {
  const current_extra_params = get_current_extra_params();
  const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = await set_current_image(_via_image_filename_list[_via_image_index], current_extra_params)
  var frame_paths = m_current_image['frame_paths']
  var image_extra_params = m_current_image['extra_params']
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
      extra_params: image_extra_params,
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

function updateOptionsForAutoBoxLabelAttributes(reset_selected_option=true) {
  var attr;
  var p = document.getElementById('save-to-attribute-name')
  var current_options = p.options
  var selected_option = p.selectedIndex
  p.innerHTML = '';
  for ( attr in _via_attributes['region'] ) {
    var option = document.createElement('option');
    option.setAttribute('value', attr)
    option.addEventListener(onclick, function (ev){
      this.setAttribute('selected', 'selected')
    })
    option.innerHTML = attr;
    p.appendChild(option);
  }
  if (! reset_selected_option) {
    p.options = current_options;
    p.selectedIndex = selected_option;
  }
}

function saveAutoBoxLabelsToAttribute() {
  var p = document.getElementById('save-to-attribute-name')
  var current_options = p.options
  var selected_option = p.selectedIndex
  var label_id = current_options[selected_option]

}

function toggleModelSpecificUI () {
  const model = document.getElementById('detector-model').value;
  // if (model  != 'owlv2') {
  //   toggleImgCropDeselect()
  //   select_region_shape('rect')
  // }
  document.getElementById('row-use-regions').style.display =
      (model === 'owlv2') ? 'flex' : 'none';   // show only for OWL
  document.getElementById('row-text-thresh').style.display =
      (model === 'grounding-dino') ? 'flex' : 'none'; // hide for OWL
  
}

function toggleImgCropSelect () {
  const useEl = document
    .querySelector('#region_shape_img_crop_prompt use');

  // Modern browsers prefer plain "href"; add xlink:href for legacy support
  useEl.setAttribute('href',        `#shape_img_crop_prompt_selected`);   
  useEl.setAttribute('xlink:href',  `#shape_img_crop_prompt_selected`)
}

function toggleImgCropDeselect () {
  if (_via_current_shape == VIA_REGION_SHAPE.IMG_CROP_PROMPT) return 
  const useEl = document
    .querySelector('#region_shape_img_crop_prompt use');

  // Modern browsers prefer plain "href"; add xlink:href for legacy support
  useEl.setAttribute('href',        `#shape_img_crop_prompt`);   
  useEl.setAttribute('xlink:href',  `#shape_img_crop_prompt`)
}

async function getDetectionOutputs () {
  const model = document.getElementById('detector-model').value
  /* TODO: call your backend */
  var run_detect_btn = document.getElementById('auto_label_box_detect_btn')
  if (run_detect_btn.innerHTML == 'Prediction runnning...') {
    show_message('Prediction is running for this image....')
    return 
  }
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
  updateOptionsForAutoBoxLabelAttributes(true)
}

/* Initialise */
document.addEventListener('DOMContentLoaded', () => {
  updateSliderLabel('box');
  updateSliderLabel('text');
  updateSliderLabel('nms');
  toggleModelSpecificUI();
});