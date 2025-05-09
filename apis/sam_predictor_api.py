import json
import cv2
import logging
from functools import lru_cache
from flask import Flask, Blueprint, jsonify, request, Response
from backend.imvid_rendering.imvid_reader import read_file, get_task_info
from backend.sam_ai.utils import SAM_MODELSv1, SAM_MODELSv2
from backend.sam_ai.single_image_predictor import SingleImagePredictorSAMv1, SingleImagePredictorSAMv2
from backend.sam_ai.multi_image_predictor import MultiImagePredictorSAMv2, MultiImagePredictorStatus
from m_utils.lru import LRUCache
from backend.imvid_rendering.utils import ReaderStatus, normalize_extra_params
import traceback

# Configure logger
logger = logging.getLogger(__name__)

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
    return jsonify(list(SAM_MODELSv1.keys()))

@sam_predictor.route('/get_multi_image_prediction_model_list', methods=['GET'])
def get_multi_image_prediction_model_list():
    return jsonify(list(SAM_MODELSv2.keys()))

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
                },
                'shape_attributes': {
                    'all_points_x': contour[0],
                    'all_points_y': contour[1],
                    'name': 'polygon'
                },
                'frame_num': frame_num,
                'file_name': file_name,
                'extra_params': extra_params,
                'image_id': image_id,
                'temp': True
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
    if extra_params is None:
        extra_params = {}
    if len(extra_params) == 0:
        extra_params = {}
    model_name = data.get('model_name')
    
    logger.info(f"multi_image_sam2_status called for file: {file_name}, model: {model_name}")
    
    model = models_loaded['video'].get(model_name)
    if model is None:
        logger.info(f"Creating new MultiImagePredictorSAMv2 model instance for {model_name}")
        model = MultiImagePredictorSAMv2(model_name)
        models_loaded['video'][model_name] = model
    if file_name is None:
        logger.warning("multi_image_sam2_status: file_name is None")
        return jsonify({"results": {"status": "FILE_NOT_FOUND"}})
    
    logger.debug(f"Reading file: {file_name} with extra_params: {extra_params}")
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True, async_read=True)
    
    if results is None:
        logger.error(f"File read failed for {file_name}, read_file returned None")
        return jsonify({"results": {"init": "FILE_READ_ERROR", "tracking": "NO_TASK"}})
        
    if 'result' not in results or 'images' not in results['result'] or len(results['result']['images']) == 0:
        logger.error(f"Failed to read file or no images found: {file_name}")
        return jsonify({"results": {"init": "FILE_READ_ERROR", "tracking": "NO_TASK"}})
    
    try:
        local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
        logger.debug(f"Local directory for video frames: {local_dir}")
        
        video_status = model.get_video_status(local_dir)
        results = {x: y.value for x, y in video_status.items()}
        
        logger.info(f"Video status for {file_name}: {results}")
        return jsonify({"results": results})
    except Exception as e:
        logger.error(f"Error processing video status: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"results": {"init": "PROCESSING_ERROR", "tracking": "NO_TASK"}})


@sam_predictor.route('/multi_image_sam2_init', methods=['POST'])
def multi_image_sam2_predict_init():
    '''
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>,
        "start_frame": <int start frame number, default 0>,
        "end_frame": <int end frame number, default -1 (all frames)>,
        "reverse_video": <boolean to reverse video frame order, default False>
    }
    '''
    try:
        data = request.json
        file_name = data.get('file_name')
        frame_num = data.get('frame_num')
        start_frame = data.get('start_frame', 0)
        end_frame = data.get('end_frame', -1)
        reverse_video = data.get('reverse_video', False)
        extra_params = data.get('extra_params')
        if extra_params is None:
            extra_params = {}
        if len(extra_params) == 0:
            extra_params = {}
        model_name = data.get('model_name')
        
        logger.info(f"multi_image_sam2_init called for file: {file_name}, model: {model_name}")
        logger.debug(f"Init parameters: start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
        
        model = models_loaded['video'].get(model_name)
        if model is None:
            logger.info(f"Creating new MultiImagePredictorSAMv2 model instance for {model_name}")
            model = MultiImagePredictorSAMv2(model_name)
            models_loaded['video'][model_name] = model
        
        logger.debug(f"Reading file: {file_name} with extra_params: {extra_params}")
        results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True, async_read=True)
        
        if results is None:
            logger.error(f"File read failed for {file_name}, read_file returned None")
            return jsonify({"error": "file not found or could not be read", "result": "FILE_READ_ERROR"})
            
        logger.debug(f"File read results status: {results['result']['status']}")
        
        task_info = get_task_info(file_name, extra_params)
        logger.debug(f"Task info for {file_name}: {task_info}")
        
        # Check both task_info and results status to determine if extraction is complete
        video_extraction_complete = (
            task_info.get('video') == ReaderStatus.VIDEO_EXTRACTING_COMPLETE.value or 
            task_info.get('zip') == ReaderStatus.ZIP_EXTRACTING_COMPLETE.value or 
            task_info.get('dicom') == ReaderStatus.DICOM_EXTRACTING_COMPLETE.value or
            (results['result']['status'].get('video') == 'Video extraction complete')
        )
        
        
        if video_extraction_complete:
            if 'images' not in results['result'] or len(results['result']['images']) == 0:
                logger.error(f"No frames extracted for {file_name} despite extraction being marked as complete")
                return jsonify({"error": "frame extraction failed", "result": "FRAME_EXTRACTION_ERROR"})
                
            local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
            logger.info(f"Extraction complete. Local directory for video frames: {local_dir}")
            
            vid_status = model.get_video_status(local_dir).get('init', MultiImagePredictorStatus.NO_TASK)
            logger.info(f"Current video init status: {vid_status}")
            
            if vid_status in [MultiImagePredictorStatus.NO_TASK, MultiImagePredictorStatus.INIT_ERROR]:
                logger.info(f"Initializing video for directory: {local_dir} with start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
                model.init_video(local_dir, start_frame=start_frame, end_frame=end_frame, reverse_video=reverse_video)
            else:
                logger.info(f"Video already being initialized with status: {vid_status}")
                
            status = model.get_video_status(local_dir)
            status_dict = {x: y.value for x, y in status.items()}
            logger.info(f"Final status for response: {status_dict}")
            return jsonify({"result": status_dict})
        else:
            logger.warning(f"Video extraction not complete or status check failed. Details:")
            logger.warning(f"- Task info video status: {task_info.get('video')}")
            logger.warning(f"- Task info zip status: {task_info.get('zip')}")
            logger.warning(f"- Task info dicom status: {task_info.get('dicom')}")
            logger.warning(f"- Results status: {results['result']['status']}")
            logger.info(f"Returning without initializing. Current status: {results['result']['status'].get('video')}")
            return jsonify({"result": results['result']['status'].get('video')})
    except Exception as e:
        logger.error(f"Unexpected error in multi_image_sam2_predict_init: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e), "result": "INTERNAL_ERROR"})

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
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True, async_read=True)
    local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
    result_iterator = model.add_prompts_and_get_results(local_dir, data['point_prompts'], data['box_prompts'], data['mask_prompts'])
    polygons = []
    for contours, label, frame_num in result_iterator:
        #print(np.array(masks[0]).shape)
        #contours = mobile_sam.post_process(masks[0], 'polygon')
        for contour in contours:
            new_polygon = {
                'region_attributes': {
                },
                'shape_attributes': {
                    'all_points_x': contour[0],
                    'all_points_y': contour[1],
                    'name': 'polygon'
                },
                'frame_num': frame_num,
                'file_name': file_name,
                'extra_params': extra_params,
                'image_id': image_id,
                'temp': True
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
        "model_name": "SAM MobileSAM|SAM ViT-B(Quant)|SAM ViT-H|SAM ViT-L(Quant)",
        "start_frame": <int start frame number, default 0>,
        "end_frame": <int end frame number, default -1 (all frames)>,
        "reverse_video": <boolean to reverse video frame order, default False>
    }
    '''
    data = request.args
    print(data)
    file_name = data.get('file_name')
    frame_num = data.get('frame_num')
    extra_params = data.get('extra_params')
    extra_params = normalize_extra_params(extra_params)
    image_id = data.get('image_id')
    point_prompts = json.loads(data.get('point_prompts'))
    box_prompts = json.loads(data.get('box_prompts'))
    mask_prompts = json.loads(data.get('mask_prompts'))
    label_id = data.get('label_id')
    _via_attributes = json.loads(data.get('_via_attributes'))
    model_name = data.get('model_name')
    
    # Extract frame range parameters
    start_frame = int(data.get('start_frame', 0)) if data.get('start_frame') is not None else 0
    end_frame = int(data.get('end_frame', -1)) if data.get('end_frame') is not None else -1
    # Convert string 'true'/'false' to boolean for reverse_video
    reverse_video_str = data.get('reverse_video', 'false').lower()
    reverse_video = reverse_video_str == 'true'
    
    logger.info(f"Track objects parameters: start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
    
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
    
    print(file_name, extra_params)
    results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, store_images=True, async_read=True)
    local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
    
    if model.get_video_status(local_dir)['init'] == MultiImagePredictorStatus.INIT_DONE:
        # If initialization is done, frames are already loaded according to the settings
        # provided during initialization, so we can directly use predict_masks
        result_iterator = model.predict_masks(local_dir, point_prompts, box_prompts, mask_prompts)
    else:
        # If not initialized, we need to initialize with the provided frame parameters
        logger.info(f"Initializing video for tracking with start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
        model.init_video(local_dir, start_frame=start_frame, end_frame=end_frame, reverse_video=reverse_video)
        while model.get_video_status(local_dir)['init'] != MultiImagePredictorStatus.INIT_DONE:
            pass
        result_iterator = model.predict_masks(local_dir, point_prompts, box_prompts, mask_prompts)
    
    def generate(): 
        try:
            for contours, label, frame_num in result_iterator:
                polygons = []
                for contour in contours:
                    new_polygon = {
                        'region_attributes': {
                        },
                        'shape_attributes': {
                            'all_points_x': contour[0],
                            'all_points_y': contour[1],
                            'name': 'polygon'
                        },
                        'frame_num': frame_num,
                        'file_name': file_name,
                        'extra_params': extra_params,
                        'image_id': image_id,
                        'temp': True
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