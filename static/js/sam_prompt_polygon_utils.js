function clearCurrentImageSAMPolygons(frame_id=null) {
  toggle_all_regions_selection(false)
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var new_regions = []
  var new_canvas_regions = []
  for (var r in regions) {
    var region = regions[r]
    if (frame_id) {
      if (region.frame != frame_id) {
        new_regions = new_regions.concat(region)
      }
      else {
        if ('temp' in region){
          if (region.temp   && region.shape_attributes.name == VIA_REGION_SHAPE.POLYGON)  continue
        }
        new_regions = new_regions.concat(region)
      }
    }
    else {
      if ('temp' in region){
        if (region.temp   && region.shape_attributes.name == VIA_REGION_SHAPE.POLYGON)  continue
      }
      new_regions = new_regions.concat(region)
    }
  }
  _via_img_metadata[_via_image_id]['regions'] = new_regions
  annotation_editor_update_content();
  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  toggle_all_regions_selection(false)
  _via_user_sel_region_id = -1
}


function clearCurrentImageGDinoBoxes(frame_id=null) {
  toggle_all_regions_selection(false)
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var new_regions = []
  var new_canvas_regions = []
  for (var r in regions) {
    var region = regions[r]
    if (frame_id) {
      if (region.frame != frame_id) {
        new_regions = new_regions.concat(region)
      }
      else {
        if ('temp' in region){
          if (region.temp && (region.shape_attributes.name == VIA_REGION_SHAPE.BOX_PROMPT || region.shape_attributes.name == VIA_REGION_SHAPE.RECT))  continue
        }
        new_regions = new_regions.concat(region)
      }
    }
    else {
      if ('temp' in region){
        if (region.temp && (region.shape_attributes.name == VIA_REGION_SHAPE.BOX_PROMPT || region.shape_attributes.name == VIA_REGION_SHAPE.RECT))  continue
      }
      new_regions = new_regions.concat(region)
    }
  }
  _via_img_metadata[_via_image_id]['regions'] = new_regions
  annotation_editor_update_content();
  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  toggle_all_regions_selection(false)
  _via_user_sel_region_id = -1
}



function clearCurrentImageSAMPrompts(frame_id) {
  toggle_all_regions_selection(false)
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var new_regions = []
  var new_canvas_regions = []
  for (var r in regions) {
    var region = regions[r]
    var region_name = region.shape_attributes.name
    if (frame_id) {
      if (region.frame != frame_id)  new_regions = new_regions.concat(region)
      else {
        if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT)  continue
        new_regions = new_regions.concat(region)
      }
    }
    else {
      if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT)  continue
      new_regions = new_regions.concat(region)
    }
  }
  _via_img_metadata[_via_image_id]['regions'] = new_regions

  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  toggle_all_regions_selection(false)
  _via_user_sel_region_id = -1
  annotation_editor_update_content();
}

function getCurrentSAMPrompts() {
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var prompts = []
  for (var r in regions) {
    var region = regions[r]
    var region_name = region.shape_attributes.name

    if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT){
      prompts = prompts.concat(region)
    }
  }
  return prompts
}

function getCurrentSAMPolygons() {
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var sam_masks = []
  for (var r in regions) {
    var region = regions[r]
    if ( "temp" in region ){
      if (region.temp)  sam_masks = sam_masks.concat(region)
    }
  }
  return sam_masks
}

function validateSAMv2Prompts(prompts) {
  // if for the same label there are multiple box prompts, then display warning that only the largest box will be used
  //   'box_prompts': [box_prompts, box_labels, box_prompt_frame_ids],
  //   'point_prompts': [point_prompts, point_labels, point_prompt_frame_ids],
  //   'mask_prompts': [mask_prompts, mask_labels, mask_prompt_frame_ids]
  var box_prompts = prompts['box_prompts']
  var mask_prompts = prompts['mask_prompts']
  var point_prompts = prompts['point_prompts']
  var box_groups = {}
  var flag = false
  var frame_ids = []
  for (var i = 0; i < box_prompts[2].length; i++) {
    var frame_id = box_prompts[2][i]
    var label = box_prompts[1][i]
    if (frame_id in box_groups) {
      if (label in box_groups[frame_id]) {
        box_groups[frame_id][label].push(box_prompts[0][i])
        flag = true
        frame_ids.push(frame_id)
      }
      else {
        box_groups[frame_id][label] = [box_prompts[0][i]]
      }
    }
    else {
      box_groups[frame_id] = {}
      box_groups[frame_id][label] = [box_prompts[0][i]]
    }
  }
  return {
    'flag': flag, 
    'frame_ids': frame_ids
  }
}


function getCurrentImagePrompts(frame_num = null) {
  var current_frame = document.getElementById('current-frame').value;
  var regions = _via_img_metadata[_via_image_id].regions;
  var box_prompts = [];
  var box_labels = [];
  var point_prompts = [];
  var point_labels = [];
  var mask_prompts = [];
  var mask_labels = [];
  var point_prompt_frame_ids = [];
  var box_prompt_frame_ids = [];
  var mask_prompt_frame_ids = [];
  var img_crop_prompts = [];
  var img_crop_labels = []
  var img_crop_prompt_frame_ids = []
  var label_id = null;

  if (_via_last_selected_region_attribute === '') {
    if (_via_current_attribute_id !== '') {
      label_id = _via_current_attribute_id;
    }
  } else {
    label_id = _via_last_selected_region.innerHTML;
  }
  // Iterate through the regions array using a traditional for loop
  for (var i = 0; i < regions.length; i++) {
    var region = regions[i];
    var region_name = region.shape_attributes.name;

    if (frame_num !== null) {
      if (frame_num != region.frame) {
        continue;
      }
    }

    if (region_name === VIA_REGION_SHAPE.POSITIVE_POINT) {
      point_prompts.push([region.shape_attributes.cx, region.shape_attributes.cy, 1]);
      point_labels.push(region.region_attributes[label_id]);
      point_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.NEGATIVE_POINT) {
      point_prompts.push([region.shape_attributes.cx, region.shape_attributes.cy, 0]);
      point_labels.push(region.region_attributes[label_id]);
      point_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.BOX_PROMPT) {
      var x1 = region.shape_attributes.x;
      var y1 = region.shape_attributes.y;
      var x2 = x1 + region.shape_attributes.width;
      var y2 = y1 + region.shape_attributes.height;
      box_prompts.push([x1, y1, x2, y2]);
      box_labels.push(region.region_attributes[label_id]);
      box_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.IMG_CROP_PROMPT) {
      var x1 = region.shape_attributes.x;
      var y1 = region.shape_attributes.y;
      var x2 = x1 + region.shape_attributes.width;
      var y2 = y1 + region.shape_attributes.height;
      img_crop_prompts.push([x1, y1, x2, y2]);
      img_crop_labels.push(region.region_attributes[label_id]);
      img_crop_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.MASK_PROMPT) {
      // Process mask prompts as needed.
      // For now, we simply push an empty array for the mask prompt and mask label.
      mask_prompts.push([]); 
      mask_labels.push([]);
      mask_prompt_frame_ids.push(region.frame);
    }
  }

  return {
    'box_prompts': [box_prompts, box_labels, box_prompt_frame_ids],
    'point_prompts': [point_prompts, point_labels, point_prompt_frame_ids],
    'mask_prompts': [mask_prompts, mask_labels, mask_prompt_frame_ids],
    'img_crop_prompts': [img_crop_prompts, img_crop_labels, img_crop_prompt_frame_ids]
  };
}


function makeTempSAMPolygonPermanent(frame_id=null) {
  // make the polygons permanent only in current frame and assign default values
  var regions = _via_img_metadata[_via_image_id].regions
  for (var r in regions) {
    var region = regions[r]
    var temp = null
    if (frame_id) {
      if (region.frame == frame_id) {
        if ("temp" in region) {
          if (region.temp) {
            region.temp = false
          }
        }
      }
    }
    else {
      if ("temp" in region){
        if (region.temp) {
          region.temp = false
        }
      }
    }
    _via_img_metadata[_via_image_id].regions[r] = region
  }
}

async function processSAMPrompts(clear_previous_prompts=true) {
  //var num_frames = m_current_image['frame_paths'].length
  
  if (use_sam_v2) {
    var prompt_validation = validateSAMv2Prompts(getCurrentImagePrompts())
    if (prompt_validation['flag']) {
      var frame_ids = prompt_validation['frame_ids']
      var frame_id_str = frame_ids.join(', ')
      show_message('Warning: Multiple box prompts for the same label in frames: ' + frame_id_str + '. Only the largest box will be used for tracking.');
    }
    getMultiImageSAMv2Outputs(clear_previous_prompts);
  }
  else {
    getSingleImageSAMOutputs(clear_previous_prompts);
  }
  // if (num_frames == 1) {
  //   getMobileSAMOutputs() 
  // }
  // else {
  //   show_message('Wait while video is getting initialized')
  //   var r = await addSAMv2Prompts()
  //   sam_v2_out_dir = await r.text()
  //   show_message('Added new prompts. Add/remove prompts or press F to start prediction');
  // }
}

function processImageCropPrompts(clear_previous_prompts=true){
  return 
}