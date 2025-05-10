import json
import cv2
import logging
import time
from functools import lru_cache
from flask import Flask, Blueprint, jsonify, request, Response
from backend.imvid_rendering.imvid_reader import read_file, get_task_info
from backend.sam_ai.utils import SAM_MODELSv1, SAM_MODELSv2
from backend.sam_ai.single_image_predictor import SingleImagePredictorSAMv1, SingleImagePredictorSAMv2
from backend.sam_ai.multi_image_predictor import MultiImagePredictorSAMv2, MultiImagePredictorStatus
from backend.progress_manager.samv2_progress_manager import multi_image_progress_manager
from m_utils.lru import LRUCache
from backend.imvid_rendering.utils import ReaderStatus, normalize_extra_params
import traceback
import os
import glob
import base64
import numpy as np
from threading import Thread

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
    try:
        data = request.json
        file_name = data.get('file_name')
        extra_params = data.get('extra_params', {})
        model_name = data.get('model_name')
        
        logger.info(f"multi_image_sam2_status called for file: {file_name}, model: {model_name}")
        
        # Get model instance
        model = models_loaded['video'].get(model_name)
        if model is None:
            logger.warning(f"Model {model_name} not found, creating new instance")
            model = MultiImagePredictorSAMv2(model_name)
            models_loaded['video'][model_name] = model
        
        # Get task info using file_name
        local_dir, task_info = multi_image_progress_manager.get_task_info_by_filename(file_name, extra_params)
        if local_dir is None:
            logger.info(f"No task found for file: {file_name}")
            return jsonify({"result": {"init": "NO_TASK", "tracking": "NO_TASK"}})
        
        # Check if initialization is stuck
        if task_info and 'status' in task_info and task_info['status'].get('init') == 'INIT_RUNNING':
            init_start_time = task_info.get('init_start_time', time.time())
            current_time = time.time()
            # If it's been over 5 minutes, consider it stuck
            if current_time - init_start_time > 300:  # 5 minutes
                logger.warning(f"Initialization for {local_dir} seems stuck (running > 5 minutes). Resetting.")
                model.reset_video_result(local_dir)
                return jsonify({"result": {"init": "INIT_ERROR", "tracking": "NO_TASK", "error": "Initialization timed out"}})
        
        # Get status from model using local_dir
        try:
            video_status = model.get_video_status(local_dir)
            status_dict = {x: y.value for x, y in video_status.items()}
            logger.info(f"Video status for {local_dir}: {status_dict}")
            return jsonify({"result": status_dict})
        except Exception as e:
            logger.error(f"Error getting video status: {str(e)}")
            logger.error(traceback.format_exc())
            return jsonify({"result": {"init": "STATUS_ERROR", "tracking": "NO_TASK"}})
            
    except Exception as e:
        logger.error(f"Error processing video status: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"result": {"init": "PROCESSING_ERROR", "tracking": "NO_TASK"}})


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
        extra_params = data.get('extra_params', {})
        model_name = data.get('model_name')
        
        logger.info(f"multi_image_sam2_init called for file: {file_name}, model: {model_name}")
        
        # Get or create model instance
        model = models_loaded['video'].get(model_name)
        if model is None:
            logger.info(f"Creating new MultiImagePredictorSAMv2 model instance for {model_name}")
            model = MultiImagePredictorSAMv2(model_name)
            models_loaded['video'][model_name] = model
        
        # Start file reading asynchronously
        results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, 
                          store_images=True, async_read=True)
        
        if results is None:
            logger.error(f"File read failed for {file_name}")
            return jsonify({"result": {"init": "FILE_READ_ERROR", "tracking": "NO_TASK"}})
        
        if 'result' not in results or 'images' not in results['result'] or len(results['result']['images']) == 0:
            logger.error(f"No frames found for {file_name}")
            return jsonify({"result": {"init": "FRAME_EXTRACTION_ERROR", "tracking": "NO_TASK"}})
        
        # Get local directory path
        local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
        logger.info(f"Local directory for frames: {local_dir}")
        
        # Verify directory exists
        if not os.path.exists(local_dir):
            logger.error(f"Directory does not exist: {local_dir}")
            return jsonify({"result": {"init": "DIRECTORY_NOT_FOUND", "tracking": "NO_TASK"}})
        
        # Check for image files
        image_files = [f for f in os.listdir(local_dir) if f.endswith(('.png', '.jpg', '.jpeg'))]
        if len(image_files) == 0:
            logger.error(f"No image files found in directory: {local_dir}")
            return jsonify({"result": {"init": "NO_IMAGES_IN_DIRECTORY", "tracking": "NO_TASK"}})
        
        # Reset any previous initialization
        try:
            model.reset_video_result(local_dir)
            logger.info(f"Successfully reset previous SAM initialization for {local_dir}")
        except Exception as e:
            logger.debug(f"Error resetting previous initialization (might be first run): {str(e)}")
        
        # Create task in progress manager with local_dir as key
        multi_image_progress_manager.create_task(local_dir, file_name=file_name, extra_params=extra_params)
        
        # Set status to INIT_RUNNING
        multi_image_progress_manager.set_status(local_dir, {
            'init': MultiImagePredictorStatus.INIT_RUNNING,
            'tracking': MultiImagePredictorStatus.NO_TASK
        })
        
        # DIRECT APPROACH - No threading, do initialization directly
        try:
            logger.info(f"Starting direct initialization for {local_dir}")
            
            # Get all image files and sort them
            all_files = sorted(glob.glob(os.path.join(local_dir, '*.png')))
            total_frames = len(all_files)
            
            # Normalize frame range
            end_frame_actual = total_frames if end_frame < 0 else min(end_frame, total_frames)
            start_frame_actual = 0 if start_frame >= total_frames else start_frame
            
            # Select frames to process
            if reverse_video:
                files_to_process = list(reversed(all_files[start_frame_actual:end_frame_actual]))
            else:
                files_to_process = all_files[start_frame_actual:end_frame_actual]
            
            logger.info(f"Processing {len(files_to_process)} frames directly")
            
            # Create inference state
            inference_state = {}
            
            # Process frames directly
            from backend.imvid_rendering.image_dir_fast_loader import init_inference_state_for_dir
            
            # Process in smaller batches to avoid timeout
            batch_size = min(10, len(files_to_process))
            for i in range(0, len(files_to_process), batch_size):
                batch = files_to_process[i:i+batch_size]
                logger.info(f"Processing batch {i//batch_size + 1}/{(len(files_to_process)-1)//batch_size + 1} ({len(batch)} files)")
                init_inference_state_for_dir(batch, inference_state, image_size=model.predictor.image_size)
                logger.info(f"Completed batch {i//batch_size + 1}")
            
            # Update cache and status
            model.inference_state_cache.put(local_dir, inference_state)
            model.processed_frames_cache[local_dir] = {
                'frame_range': list(range(start_frame_actual, end_frame_actual)),
                'reverse_video': reverse_video
            }
            
            # Set status to INIT_DONE
            multi_image_progress_manager.set_status(local_dir, {
                'init': MultiImagePredictorStatus.INIT_DONE,
                'tracking': MultiImagePredictorStatus.NO_TASK
            })
            
            logger.info(f"Initialization completed successfully for {local_dir}")
            return jsonify({"result": {"init": "INIT_DONE", "tracking": "NO_TASK"}})
            
        except Exception as e:
            logger.error(f"Error during direct initialization: {str(e)}")
            logger.error(traceback.format_exc())
            multi_image_progress_manager.set_status(local_dir, {
                'init': MultiImagePredictorStatus.INIT_ERROR,
                'tracking': MultiImagePredictorStatus.NO_TASK
            })
            return jsonify({"result": {"init": "INIT_ERROR", "tracking": "NO_TASK", "error": str(e)}})
        
    except Exception as e:
        logger.error(f"Unexpected error in multi_image_sam2_predict_init: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"result": {"init": "INTERNAL_ERROR", "tracking": "NO_TASK"}})

@sam_predictor.route('/multi_image_sam2_init_stream')
def multi_image_sam2_predict_init_stream():
    '''
    Initialize video frames for tracking with progress streaming.
    
    Request body:
    {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>,
        "start_frame": <int start frame number, default 0>,
        "end_frame": <int end frame number, default -1 (all frames)>,
        "reverse_video": <boolean to reverse video frame order, default False>,
        "model_name": <name of the SAM model to use>
    }
    
    Response:
    Server-Sent Events (SSE) stream with status updates:
    - PROGRESS: Initialization in progress with message
    - DONE: Initialization completed successfully
    - ERROR: Error occurred during initialization
    '''
    try:
        data = request.args
        file_name = data.get('file_name')
        frame_num = int(data.get('frame_num', 0)) if data.get('frame_num') else None
        start_frame = int(data.get('start_frame', 0))
        end_frame = int(data.get('end_frame', -1))
        reverse_video = data.get('reverse_video', 'false').lower() == 'true'
        extra_params = json.loads(data.get('extra_params', '{}'))
        model_name = data.get('model_name')
        
        logger.info(f"multi_image_sam2_init_stream called for file: {file_name}, model: {model_name}")
        
        # Get or create model instance
        model = models_loaded['video'].get(model_name)
        if model is None:
            logger.info(f"Creating new MultiImagePredictorSAMv2 model instance for {model_name}")
            model = MultiImagePredictorSAMv2(model_name)
            models_loaded['video'][model_name] = model
        
        # Start file reading asynchronously
        results = read_file(file_path=file_name, frame_num=frame_num, extra_params=extra_params, 
                          store_images=True, async_read=True)
        
        if results is None:
            logger.error(f"File read failed for {file_name}")
            return jsonify({"error": "File read failed"}), 400
        
        if 'result' not in results or 'images' not in results['result'] or len(results['result']['images']) == 0:
            logger.error(f"No frames found for {file_name}")
            return jsonify({"error": "No frames found"}), 400
        
        # Get local directory path
        local_dir = '/'.join(results['result']['images'][0].split('/')[:-1])
        logger.info(f"Local directory for frames: {local_dir}")
        
        # Create task in progress manager
        multi_image_progress_manager.create_task(local_dir, file_name=file_name, extra_params=extra_params)
        
        # Set initial status
        multi_image_progress_manager.set_status(local_dir, {
            'init': MultiImagePredictorStatus.INIT_RUNNING,
            'tracking': MultiImagePredictorStatus.NO_TASK
        })
        
        def generate():
            try:
                # Stream initialization progress
                for status in model.init_video_stream(local_dir, start_frame, end_frame, reverse_video):
                    yield f"data: {json.dumps(status)}\n\n"
            except Exception as e:
                logger.error(f"Error in initialization stream: {str(e)}")
                logger.error(traceback.format_exc())
                yield f"data: {json.dumps({'status': 'ERROR', 'message': str(e)})}\n\n"
        
        return Response(generate(), mimetype='text/event-stream')
        
    except Exception as e:
        logger.error(f"Unexpected error in multi_image_sam2_init_stream: {str(e)}")
        logger.error(traceback.format_exc())
        return jsonify({"error": str(e)}), 500

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
    
    # Get current status and log for debugging
    current_status = model.get_video_status(local_dir)
    logger.info(f"Current status before tracking: {current_status}")
    
    # Check inference state directly as a more reliable indicator
    inference_state = model.get_video_inference_state(local_dir)
    inference_state_exists = inference_state is not None
    logger.info(f"Inference state exists: {inference_state_exists}")
    
    # If status is inconsistent, fix it
    if inference_state_exists and current_status['init'] != MultiImagePredictorStatus.INIT_DONE:
        logger.info(f"Fixing inconsistent status: inference state exists but status is {current_status['init']}")
        # Update status to reflect that initialization is actually done
        model.get_video_status(local_dir)  # This will update the status automatically
        current_status = model.get_video_status(local_dir)
        logger.info(f"Updated status: {current_status}")
    
    # Try to use tracking if either status shows INIT_DONE or inference state exists
    if current_status['init'] == MultiImagePredictorStatus.INIT_DONE or inference_state_exists:
        logger.info(f"Using existing initialization for tracking (status: {current_status['init']}, inference state: {inference_state_exists})")
        result_iterator = model.predict_masks(local_dir, point_prompts, box_prompts, mask_prompts)
    else:
        # If not initialized, we need to initialize with the provided frame parameters
        logger.info(f"Initializing video for tracking with start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
        model.init_video(local_dir, start_frame=start_frame, end_frame=end_frame, reverse_video=reverse_video)
        
        # Wait with timeout for initialization to complete
        wait_time = 0
        max_wait = 30  # seconds
        while wait_time < max_wait:
            current_status = model.get_video_status(local_dir)
            if current_status['init'] == MultiImagePredictorStatus.INIT_DONE:
                logger.info(f"Initialization completed successfully")
                break
            elif current_status['init'] == MultiImagePredictorStatus.INIT_ERROR:
                logger.error(f"Initialization failed with error")
                break
            logger.info(f"Waiting for initialization, current status: {current_status}")
            time.sleep(1)
            wait_time += 1
            
        # Try to track regardless of initialization status
        logger.info(f"Starting tracking after initialization attempt, final status: {model.get_video_status(local_dir)}")
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