
import numpy as np
from functools import lru_cache
from flask import Flask,  Blueprint, jsonify, request
from backend.imvid_rendering.imvid_reader import read_file
from backend.sam_ai.utils import SAM_MODELS
from backend.sam_ai.single_image_predictor import SingleImagePredictorSAMv1, SingleImagePredictorSAMv2
from m_utils.lru import LRUCache


mobile_sam_image_embedding_cache = LRUCache(max_size=30)
sam_v2_inference_state_cache = LRUCache(max_size=10)


app = Flask(__name__)
sam_predictor = Blueprint('sam-predictor', __name__)

models_loaded = {}

mobile_sam = SingleImagePredictorSAMv2('SAM2.1 (Tiny)')


@sam_predictor.route('/healthcheck')
def healthcheck():
    """
    Perform a health check.

    Returns:
        str: The status of the health check, always "OK".
    """
    return "OK"


@sam_predictor.route('/get_single_image_prediction_model_list', methods=['GET'])
def get_single_image_prediction_model_list():
    return jsonify(list(SAM_MODELS.keys()))


@lru_cache(maxsize=64)
@sam_predictor.route('/single_image_sam_predict', methods=['POST'])
def single_image_sam_predict():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>,
        "box_prompts": [[[x1, y1, x2, y2],[<another set of box points>], ...n boxes], [label1, label2, ...labeln]],
        "point_prompts": [(x1, y1, 0), [x2, y2, 1], ..n points],
        "model_name": "SAM MobileSAM|SAM ViT-B(Quant)|SAM ViT-H|SAM ViT-L(Quant)"
    }
    '''
    data = request.json
    print(data)
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    model_name = data.get('model_name')
    all_region_label_ids = _via_attributes['region'].keys()
    model = models_loaded.get(model_name)
    if model is None:
        if 'sam2' in model_name.lower():
            model = SingleImagePredictorSAMv2(model_name)
        else:
            model = SingleImagePredictorSAMv1(model_name)
        models_loaded[model_name] = model
    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
        
    cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)
    result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv_image[0])
    
    polygons = []
    for contours, label in result_iterator:
        #print(np.array(masks[0]).shape)
        #contours = mobile_sam.post_process(masks[0], 'polygon')
        for contour in contours:
            new_polygon = {
                'region_attributes': {
                    'temp': True,
                },
                'shape_attributes': {
                    'all_points_x': contour[0],
                    'all_points_y': contour[1],
                    'type': 'polygon'
                },
                'frame_num': frame_num,
                'file_name': file_name,
                'extra_params': extra_params
            }
            new_polygon['region_attributes'].update(default_label)
            if label_id is not None:
                new_polygon['region_attributes'][label_id] = label
            polygons.append(new_polygon)
    return jsonify(polygons)


@sam_predictor.route('/video_sam2_predict', methods=['POST'])
def video_sam2_predict():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>,
        "box_prompts": [[[x1, y1, x2, y2],[<another set of box points>], ...n boxes], [label1, label2, ...labeln]],
        "point_prompts": [(x1, y1, 0), [x2, y2, 1], ..n points],
        "model_name": "SAM MobileSAM|SAM ViT-B(Quant)|SAM ViT-H|SAM ViT-L(Quant)"
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    all_region_label_ids = _via_attributes['region'].keys()
    print(all_region_label_ids)
    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id]['default_options']
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
            
    print('label_id', label_id)
    print('def label', default_label)
    cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)