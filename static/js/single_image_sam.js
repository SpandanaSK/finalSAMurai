async function getSingleImageSAMOutputs(clear_previous_prompts=true) {
    const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
    var key = JSON.stringify([_via_image_id, sorted_extra_params])
    var m_current_image = current_img_cache.get(key)
    var frame_paths = m_current_image['frame_paths']
    var extra_params = m_current_image['extra_params']
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

    try {
        const payload = {
            file_name: file_name,
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