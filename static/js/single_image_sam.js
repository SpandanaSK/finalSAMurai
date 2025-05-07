async function getSingleImageSAMOutputs(clear_previous_prompts=true) {
    const current_extra_params = get_current_extra_params();
    const sorted_extra_params = current_extra_params ? Object.entries(current_extra_params).sort((a, b) => a[0].localeCompare(b[0])) : [];
    var key = JSON.stringify([_via_image_id, sorted_extra_params])
    var m_current_image = await set_current_image(_via_current_image_filename, current_extra_params)
    var frame_paths = m_current_image['frame_paths']
    var image_extra_params = m_current_image['extra_params']
    var current_frame = document.getElementById('current-frame').value
    var file_name = frame_paths[current_frame]
    var prompts = getCurrentImagePrompts(current_frame)
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
    const modelSelect = document.getElementById('sam-model-options');
    const selectedModel = modelSelect ? modelSelect.value : 'MobileSAM';

    try {
        const payload = {
            file_name: file_name,
            extra_params: image_extra_params,
            frame_num: current_frame,
            box_prompts: prompts['box_prompts'],
            point_prompts: prompts['point_prompts'],
            mask_prompts: prompts['mask_prompts'],
            _via_attributes: _via_attributes,
            label_id: label_id,
            model_name: selectedModel,
            image_id: _via_image_id
        };
        const response = await fetch('/sam-ai/single_image_sam_predict', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify(payload),
        });

        if (!response.ok) {
            throw new Error(`Error: ${response.statusText}`);
        }
        if (clear_previous_prompts) clearCurrentImageSAMPolygons(current_frame);
        var polygons = await response.json();
        for (var p in polygons) {
            var polygon = polygons[p]

            var point_region = new file_region();
            point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POLYGON;
            point_region.shape_attributes['all_points_x'] = polygon.shape_attributes.all_points_x;
            point_region.shape_attributes['all_points_y'] = polygon.shape_attributes.all_points_y;
            point_region.region_attributes = polygon.region_attributes;
            point_region.frame = current_frame
            point_region.temp = polygon.temp
            _via_img_metadata[polygon.image_id].regions.push(point_region);
            
        }
        annotation_editor_update_content();
        _via_load_canvas_regions()
        _via_redraw_reg_canvas()
    } catch (error) {
        console.error('Failed to get SAM outputs:', error);
    }
}

// Function to fetch available single image models
async function fetchSingleImageModels() {
  try {
    const response = await fetch('/sam-ai/get_single_image_prediction_model_list');
    if (!response.ok) {
      throw new Error('Failed to fetch single image models');
    }
    const models = await response.json();
    console.log('Single Image Models API Response:', models);
    return models;
  } catch (error) {
    console.error('Error fetching single image models:', error);
    return ['---']; // Fallback to default model
  }
}

// Function to update single image model options
async function updateSingleImageModelOptions() {
  const modelSelect = document.getElementById('sam-model-options');
  if (!modelSelect) return;

  const models = await fetchSingleImageModels();
  
  // Clear existing options
  modelSelect.innerHTML = '';
  
  // Add new options
  models.forEach(model => {
    const option = document.createElement('option');
    option.value = model;
    option.text = model;
    if (model === 'MobileSAM') {
      option.selected = true;
    }
    modelSelect.appendChild(option);
  });
}

// Function to handle model change
function updateSingleImageModel() {
  const modelSelect = document.getElementById('sam-model-options');
  if (!modelSelect) return;
  
  const selectedModel = modelSelect.value;
  // Update any model-specific UI or settings here
  console.log('Selected single image model:', selectedModel);
}

// Initialize model options when the page loads
document.addEventListener('DOMContentLoaded', () => {
  updateSingleImageModelOptions();
});