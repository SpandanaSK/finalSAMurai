
from email.policy import default
import json
import re
import cv2
from functools import lru_cache
from flask import Flask,  Blueprint, jsonify, request, Response
from backend.imvid_rendering.imvid_reader import async_read_file, get_task_info
from backend.sam_ai.utils import SAM_MODELSv1, SAM_MODELSv2
from backend.sam_ai.single_image_predictor import SingleImagePredictorSAMv1, SingleImagePredictorSAMv2
from backend.sam_ai.multi_image_predictor import MultiImagePredictorSAMv2, MultiImagePredictorStatus
from m_utils.lru import LRUCache
from backend.imvid_rendering.imvid_reader import get_task_info, ReaderStatus


mobile_sam_image_embedding_cache = LRUCache(max_size=30)
sam_v2_inference_state_cache = LRUCache(max_size=10)


app = Flask(__name__)
sam_predictor = Blueprint('sam-predictor', __name__)

models_loaded = {'image': {}, 'video': {}}

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
    return jsonify(list(SAM_MODELSv1.keys())+list(SAM_MODELSv2.keys()))


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
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    model_name = data.get('model_name')
    image_id = data.get('image_id')
    all_region_label_ids = _via_attributes['region'].keys()
    model = models_loaded['image'].get(model_name)
    if model is None:
        if 'sam2' in model_name.lower():
            model = SingleImagePredictorSAMv2(model_name)
        else:
            model = SingleImagePredictorSAMv1(model_name)
        models_loaded['image'][model_name] = model
    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
        
    #results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    #img_path = results['result']['images'][0]
    #print('results', results)
    print(data)
    print('default', default_label)
    result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv2.imread(file_name))
    
    polygons = []
    for contours, label in result_iterator:
        for contour in contours:
            new_polygon = {
                'region_attributes': {
                    'temp': True,
                },
                'shape_attributes': {
                    'all_points_x': contour[0],
                    'all_points_y': contour[1],
                    'name': 'polygon'
                },
                'frame_num': frame_num,
                'file_name': file_name,
                'extra_params': extra_params,
                'image_id': image_id
            }
            new_polygon['region_attributes'].update(default_label)
            if label_id is not None:
                new_polygon['region_attributes'][label_id] = label
            polygons.append(new_polygon)
    return jsonify(polygons)

@sam_predictor.route('/multi_image_sam2_status', methods=['POST'])
def multi_image_sam2_status():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    if len(extra_params) == 0:
        extra_params = {}
    model_name = data.get('model_name')
    model = models_loaded['video'].get(model_name)
    if model is None:
        model = MultiImagePredictorSAMv2(model_name)
        models_loaded['video'][model_name] = model
    if file_name is None:
        return jsonify({"results": {"status": "FILE_NOT_FOUND"}})
    # cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)
    # result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv_image[0])
    print('file_name status', file_name, extra_params)
    results = async_read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
    results = model.get_video_status(local_dir)
    results = {x: y.value for x, y in results.items()}
    print('results status', results)
    return jsonify({"results": results})


@sam_predictor.route('/multi_image_sam2_init', methods=['POST'])
def multi_image_sam2_predict_init():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>
    }
    '''
    data = request.json
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    if len(extra_params) == 0:
        extra_params = {}
    model_name = data.get('model_name')
    model = models_loaded['video'].get(model_name)
    if model is None:
        model = MultiImagePredictorSAMv2(model_name)
        models_loaded['video'][model_name] = model
        
    # cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)
    # result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv_image[0])
    print('file name init', file_name, extra_params)
    results = async_read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    print('results init', results['result']['status'])
    if results is None:
        return jsonify({"error": "file not found"})
    task_info = get_task_info(file_name, extra_params)
    if task_info.get('video') == ReaderStatus.VIDEO_EXTRACTING_COMPLETE.value or task_info.get('zip') == ReaderStatus.ZIP_EXTRACTING_COMPLETE.value or task_info.get('dicom') == ReaderStatus.DICOM_EXTRACTING_COMPLETE.value:
        local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
        vid_status = model.get_video_status(local_dir).get('init', MultiImagePredictorStatus.NO_TASK)
        if vid_status in [MultiImagePredictorStatus.NO_TASK, MultiImagePredictorStatus.INIT_ERROR]:
            model.init_video(local_dir)
        status = model.get_video_status(local_dir)
        status = {x: y.value for x, y in status.items()}
        return jsonify({"result": status})
    else:
        return jsonify({"result": results['result']['status']['video']})

@sam_predictor.route('/multi_image_sam2_predict_per_frame', methods=['POST'])
def multi_image_sam2_predict_per_frame():
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
    if len(extra_params) == 0:
        extra_params = {}
    image_id = data.get('image_id')
    label_id = data.get('label_id')
    _via_attributes = data.get('_via_attributes')
    model_name = data.get('model_name')
    all_region_label_ids = _via_attributes['region'].keys()
    model = models_loaded['video'].get(model_name)
    if model is None:
        model = MultiImagePredictorSAMv2(model_name)
        models_loaded['video'][model_name] = model
    
    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
    
    # cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)
    # result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv_image[0])
    print('file ppf', file_name, extra_params)
    results = async_read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
    result_iterator = model.add_prompts_and_get_results(local_dir, data['point_prompts'], data['box_prompts'], data['mask_prompts'])
    polygons = []
    for contours, label, frame_num in result_iterator:
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
                    'name': 'polygon'
                },
                'frame_num': frame_num,
                'file_name': file_name,
                'extra_params': extra_params,
                'image_id': image_id
            }
            new_polygon['region_attributes'].update(default_label)
            if label_id is not None:
                new_polygon['region_attributes'][label_id] = label
            polygons.append(new_polygon)
    print('polygons', polygons)
    return jsonify(polygons)


@sam_predictor.route('/multi_image_sam2_track_objects')
def multi_image_sam2_track_objects():
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
    data = request.args
    print(data)
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = json.loads(data.get('extra_params'))
    if len(extra_params) == 0:
        extra_params = {}
    image_id = data.get('image_id')
    point_prompts = json.loads(data.get('point_prompts'))
    box_prompts = json.loads(data.get('box_prompts'))
    mask_prompts = json.loads(data.get('mask_prompts'))
    label_id = data.get('label_id')
    _via_attributes = json.loads(data.get('_via_attributes'))
    model_name = data.get('model_name')
    all_region_label_ids = _via_attributes['region'].keys()
    model = models_loaded['video'].get(model_name)
    if model is None:
        model = MultiImagePredictorSAMv2(model_name)
        models_loaded['video'][model_name] = model
    
    default_label = {}
    for l_id in all_region_label_ids:
        if l_id is None:
            continue
        default_options = _via_attributes['region'][l_id].get('default_options', {})
        for option in default_options:
            if (default_options[option]):
                default_label[l_id] = option
    
    # cv_image, _ = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=False)
    # result_iterator = model.predict_masks(file_name, data['point_prompts'], data['box_prompts'], data['mask_prompts'], cv_image[0])
    print(file_name, extra_params)
    results = async_read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True)
    local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
    
    if model.get_video_status(local_dir)['init'] == MultiImagePredictorStatus.INIT_DONE:
        result_iterator = model.predict_masks(local_dir, point_prompts, box_prompts, mask_prompts)
    else:# model.get_video_status(local_dir) in ["NO_TASK", "ERROR", "NOT_STARTED"]:
        model.init_video(local_dir)
        while model.get_video_status(local_dir)['init'] != MultiImagePredictorStatus.INIT_DONE:
            pass
        result_iterator = model.predict_masks(local_dir, point_prompts, box_prompts, mask_prompts)
    def generate(): 
        try:
            for contours, label, frame_num in result_iterator:
                #contours = mobile_sam.post_process(masks[0], 'polygon')
                polygons = []
                for contour in contours:
                    new_polygon = {
                        'region_attributes': {
                            'temp': True,
                        },
                        'shape_attributes': {
                            'all_points_x': contour[0],
                            'all_points_y': contour[1],
                            'name': 'polygon'
                        },
                        'frame_num': frame_num,
                        'file_name': file_name,
                        'extra_params': extra_params,
                        'image_id': image_id
                    }
                    new_polygon['region_attributes'].update(default_label)
                    if label_id is not None:
                        new_polygon['region_attributes'][label_id] = label
                    polygons.append(new_polygon)
                data = {
                    'polygons': polygons,
                    "status": "RUNNING"
                }
                yield f"data: {json.dumps(data)}\n\n"
            data = {
                "polygons": [],
                "status": "DONE"
            }
            yield f"data: {json.dumps(data)}\n\n"
        except Exception as e:
            print(e)
            data = {
                "polygons": [],
                "status": "ERROR: " + str(e)
            }
            yield f"data: {json.dumps(data)}\n\n"
    return Response(generate(), mimetype='text/event-stream')