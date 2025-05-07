
from flask import Flask,  Blueprint, jsonify, request
from backend.sam_ai.grounding_dino_predictor import GroundingDinoPredictor
from backend.sam_ai.owl_vit_predictor import OwlVitPredictor


app = Flask(__name__)
auto_label_box = Blueprint('auto-label-box', __name__)

models_loaded = {'gdino': None, 'owlvit': None}


@auto_label_box.route('/grounding_dino_box_predict', methods=['POST'])
def grounding_dino_boxes_predict():
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    image_id = data.get('image_id')
    text_thresh = data.get('text_thresh', 0.3)
    box_thresh = data.get('box_thresh', 0.3)
    nms_thresh = data.get('nms_thresh', 0.3)
    model = models_loaded.get('gdino')
    if model is None:
        model = GroundingDinoPredictor()
        models_loaded['gdino'] = model

            
    boxes, labels = model.predict(file_name, data['text_prompt'], box_thresh, text_thresh, nms_thresh)
    new_boxes = []
    for box, label in zip(boxes, labels):
        x1, y1, x2, y2 = box
        if label.strip() == '':
            continue
        new_box = {
            'region_attributes': {
            },
            'shape_attributes': {
                'height': int(y2-y1),
                'width': int(x2-x1),
                'x': int(x1),    
                'y': int(y1),
                'name': "gdino_box"
            },
            'frame_num': frame_num,
            'file_name': file_name,
            'extra_params': extra_params,
            'image_id': image_id,
            'temp': True
        }
        new_box['region_attributes']['Auto Box Label'] = label
        new_boxes.append(new_box)
    return jsonify(new_boxes)


@auto_label_box.route('/owl_vit_box_predict', methods=['POST'])
def owl_vit_boxes_predict():
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    image_id = data.get('image_id')
    get_sam_boxes = data.get('get_sam_boxes', False)
    all_region_label_ids = _via_attributes['region'].keys()
    text_prompt = data.get('text_prompt')
    img_crop_prompts = data.get('img_crop_prompts')
    nms_thresh = data.get('nms_thresh', 0.3)
    box_thresh = data.get('box_thresh', 0.3)
    model = models_loaded.get('owlvit')
    if model is None:
        model = OwlVitPredictor()
        models_loaded['owlvit'] = model

    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
            
    print(img_crop_prompts)
    
    boxes, labels = list(model.image_conditioned_predict(file_name, img_crop_prompts, box_thresh, nms_thresh))[0]
    new_boxes = []
    for box, label in zip(boxes, labels):
        x1, y1, x2, y2 = box
        name = 'box_prompt' if get_sam_boxes else 'rect' 
        new_box = {
            'region_attributes': {
            },
            'shape_attributes': {
                'height': int(y2-y1),
                'width': int(x2-x1),
                'x': int(x1),    
                'y': int(y1),
                'name': name
            },
            'frame_num': frame_num,
            'file_name': file_name,
            'extra_params': extra_params,
            'image_id': image_id,
            'temp': True
        }
        new_box['region_attributes'].update(default_label)
        if label_id is not None:
            new_box['region_attributes'][label_id] = label
        else:
            new_box['region_attributes']['Auto Box Label'] = label
        new_boxes.append(new_box)
    boxes, labels = model.predict(file_name, text_prompt, BOX_THRESHOLD=box_thresh)
    for box, label in zip(boxes, labels):
        x1, y1, x2, y2 = box
        if label.strip() == '':
            continue
        name = 'box_prompt' if get_sam_boxes else 'rect' 
        new_box = {
            'region_attributes': {
            },
            'shape_attributes': {
                'height': int(y2-y1),
                'width': int(x2-x1),
                'x': int(x1),    
                'y': int(y1),
                'name': name
            },
            'frame_num': frame_num,
            'file_name': file_name,
            'extra_params': extra_params,
            'image_id': image_id,
            'temp': True
        }
        new_box['region_attributes'].update(default_label)
        if label_id is not None:
            new_box['region_attributes'][label_id] = label
        else:
            new_box['region_attributes']['Auto Box Label'] = label
        new_boxes.append(new_box)
    return jsonify(new_boxes)


@auto_label_box.route('/auto_label_box_predict', methods=['POST'])
def auto_box_label_predict():
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    image_id = data.get('image_id')
    get_sam_boxes = data.get('get_sam_boxes', False)
    all_region_label_ids = _via_attributes['region'].keys()
    text_thresh = data.get('text_thresh', 0.3)
    box_thresh = data.get('box_thresh', 0.3)
    text_prompt = data.get('text_prompt', '')
    if ',' in text_prompt:
        text_prompt = text_prompt.split(',')
        model = models_loaded.get('owlvit')
        if model is None:
            model = OwlVitPredictor()
            models_loaded['owlvit'] = model
    else:
        model = models_loaded.get('gdino')
        if model is None:
            model = GroundingDinoPredictor()
            models_loaded['gdino'] = model

    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
    print(model)
    boxes, labels = model.predict(file_name, text_prompt, box_thresh, text_thresh)
    new_boxes = []
    for box, label in zip(boxes, labels):
        x1, y1, x2, y2 = box
        if label.strip() == '':
            continue
        name = 'box_prompt' if get_sam_boxes else 'rect' 
        new_box = {
            'region_attributes': {
            },
            'shape_attributes': {
                'height': int(y2-y1),
                'width': int(x2-x1),
                'x': int(x1),    
                'y': int(y1),
                'name': name
            },
            'frame_num': frame_num,
            'file_name': file_name,
            'extra_params': extra_params,
            'image_id': image_id,
            'temp': True
        }
        new_box['region_attributes'].update(default_label)
        if label_id is not None:
            new_box['region_attributes'][label_id] = label
        else:
            new_box['region_attributes']['Auto Box Label'] = label
        new_boxes.append(new_box)
    return jsonify(new_boxes)

