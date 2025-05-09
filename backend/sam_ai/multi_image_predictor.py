# Description: Mobile version of SAM model for segmentation

import os
import cv2
import numpy as np
import traceback
import torch
import logging
from glob import glob
from tqdm import tqdm
from threading import Thread
from sam2.build_sam import build_sam2_video_predictor
from backend.progress_manager.samv2_progress_manager import multi_image_progress_manager
from backend.sam_ai.utils import SAM_MODELSv2
from backend.imvid_rendering.image_dir_fast_loader import init_inference_state_for_dir
from m_utils.lru import LRUCache

from enum import Enum

# Configure logger
logger = logging.getLogger(__name__)

class MultiImagePredictorStatus(Enum):
    INIT_RUNNING = "INIT_RUNNING"
    INIT_DONE = "INIT_DONE"
    INIT_ERROR = "INIT_ERROR"
    
    TRACKING_STARTED = "TRACKING_STARTED"
    TRACKING_RUNNING = "TRACKING_RUNNING"
    TRACKING_DONE = "TRACKING_DONE"
    TRACKING_ERROR = "TRACKING_ERROR"
    
    NO_TASK = "NO_TASK"


def convert_prompt_data(data, frame_id=None):
    """
     {
        "file_name": <Either a local file path or URL>,
        "frame_num": <int frame number. if None get all the frames>,
        "extra_params": <extra params for future>,
        "box_prompts": [[x1, y1, x2, y2, dummy_label], [_x1, _y1, _x2, _y2, dummy_label]....],
        "point_prompts": [(x1, y1, dummy_label, 0), [x2, y2, dummy_label, 1], ....],
    }

    Args:
        data (dict): A dictionary containing the annotated regions. The dictionary
                     should have a key 'regions' which is a list of region dictionaries.
                     Each region dictionary should have a 'shape_attributes' key containing
                     the shape details.

    Returns:
        list: A list of prompt dictionaries. Each prompt dictionary contains:
              - 'data': A list of coordinates for the point or rectangle.
              - 'label': An integer label (1 for 'add_point' and 'box_prompt', 0 for 'remove_point').
              - 'type': A string indicating the type of the prompt ('point' or 'rectangle').

    The function processes the regions in the input data and extracts the coordinates and labels
    for points and rectangles. It then creates prompt dictionaries for each region and shuffles
    the list of prompts before returning it.
    """
    
    prompts = []
    box_prompts, box_labels, box_prompt_frame_ids = data["box_prompts"]
    point_prompts, point_labels, point_prompt_frame_ids = data["point_prompts"]
    mask_prompts, mask_labels, mask_prompt_frame_ids = data["mask_prompts"]
    label2prompts = {}
    
    for label, prompt_frame_id in zip(box_labels+point_labels+mask_labels, box_prompt_frame_ids+point_prompt_frame_ids+mask_prompt_frame_ids):
        if prompt_frame_id in label2prompts:
            label2prompts[prompt_frame_id].update({label: {'box_prompts': [], 'point_prompts': [], 'mask_prompts': []}})
        else:
            label2prompts[prompt_frame_id] = {label: {'box_prompts': [], 'point_prompts': [], 'mask_prompts': []}}


    for label, prompt, prompt_frame_id in zip(box_labels, box_prompts, box_prompt_frame_ids):
        if frame_id is not None:
            if prompt_frame_id != frame_id:
                continue
        label2prompts[prompt_frame_id][label]['box_prompts'].append(prompt)

    for label, prompt, prompt_frame_id  in zip(point_labels, point_prompts, point_prompt_frame_ids):
        if frame_id is not None:
            if prompt_frame_id != frame_id:
                continue
        label2prompts[prompt_frame_id][label]['point_prompts'].append(prompt)

    for label, prompt, prompt_frame_id  in zip(mask_labels, mask_prompts, mask_prompt_frame_ids):
        if frame_id is not None:
            if prompt_frame_id != frame_id:
                continue
        label2prompts[prompt_frame_id][label]['mask_prompts'].append(prompt)
    return label2prompts



device = "cuda" if torch.cuda.is_available() else "cpu"
logger.info(f"Using device: {device} for SAMv2 models")


class MultiImagePredictorSAMv2:
    def __init__(self, model_name):
        logger.info(f"Initializing MultiImagePredictorSAMv2 with model: {model_name}")
        model_info = SAM_MODELSv2[model_name]
        logger.debug(f"Model info: config={model_info['model_config']}, checkpoint={model_info['checkpoint']}")
        self.predictor = build_sam2_video_predictor(model_info['model_config'], model_info['checkpoint'], device=device)
        self.inference_state_cache = LRUCache(1000)
        # Add a frame cache to track which frames have been processed for each video
        self.processed_frames_cache = {}
        logger.info(f"MultiImagePredictorSAMv2 initialized with model: {model_name}")

    def _run_inference_thread(self, video_dir, start_frame=0, end_frame=-1, reverse_video=False):
        """
        This is the function actually called by the Thread. 
        It intelligently loads only new frames that haven't been processed before.
        """
        logger.info(f"Starting inference thread for {video_dir}")
        logger.debug(f"Thread parameters: start_frame={start_frame}, end_frame={end_frame}, reverse_video={reverse_video}")
        
        try:
            # Get all image files in the directory
            all_image_files = sorted(glob(os.path.join(video_dir, '*.png')))
            total_frames = len(all_image_files)
            
            # Normalize end_frame if it's negative
            if end_frame < 0:
                end_frame = total_frames
            
            # Validate frame range
            if start_frame >= total_frames:
                start_frame = 0
            if end_frame > total_frames:
                end_frame = total_frames
            
            # Create target frame range
            target_frame_indices = list(range(start_frame, end_frame))
            if reverse_video:
                target_frame_indices = list(reversed(target_frame_indices))
            
            logger.info(f"Found {total_frames} total frames. Selected frames {start_frame} to {end_frame}. Processing {len(target_frame_indices)} frames.")
            
            # Get existing inference state if any
            existing_inference_state = self.inference_state_cache.get(video_dir)
            previously_processed_frames = []
            
            if existing_inference_state is not None and video_dir in self.processed_frames_cache:
                # We have existing inference state - check if we can reuse it
                existing_frame_indices = self.processed_frames_cache[video_dir].get('frame_range', [])
                existing_reverse = self.processed_frames_cache[video_dir].get('reverse_video', False)
                
                # Can only reuse if the direction matches
                if existing_reverse == reverse_video:
                    previously_processed_frames = existing_frame_indices
                    logger.info(f"Found {len(previously_processed_frames)} previously processed frames with matching direction.")
            
            # Determine which frames need to be processed
            frames_to_process = []
            for idx in target_frame_indices:
                if idx not in previously_processed_frames:
                    frames_to_process.append(idx)
            
            # If all frames are already processed, we're done
            if not frames_to_process:
                logger.info(f"All {len(target_frame_indices)} requested frames are already processed. Nothing to do.")
                multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
                return
            
            # We need to process some new frames
            logger.info(f"Need to process {len(frames_to_process)} new frames out of {len(target_frame_indices)} requested frames.")
            
            # Select files to process
            files_to_process = [all_image_files[idx] for idx in frames_to_process]
            
            # Create or update inference state
            if existing_inference_state is None:
                # Create new inference state
                inference_state = {}
                init_inference_state_for_dir(files_to_process, inference_state, image_size=self.predictor.image_size)
                
                # Update processed frames cache
                self.processed_frames_cache[video_dir] = {
                    'frame_range': frames_to_process,
                    'reverse_video': reverse_video
                }
            else:
                # Merge with existing inference state
                # For simplicity, we're processing all requested frames again in this version
                # A more advanced implementation would merge frame by frame
                inference_state = {}
                all_selected_files = [all_image_files[idx] for idx in target_frame_indices]
                init_inference_state_for_dir(all_selected_files, inference_state, image_size=self.predictor.image_size)
                
                # Update processed frames cache
                self.processed_frames_cache[video_dir] = {
                    'frame_range': target_frame_indices,
                    'reverse_video': reverse_video
                }
            
            # Update cache and status
            logger.info(f"Successfully initialized inference state for {video_dir}. Setting status to INIT_DONE")
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
            self.inference_state_cache.put(video_dir, inference_state)
            
            logger.debug(f"Cached inference state for {video_dir} with {len(inference_state['images'])} frames")
            
        except Exception as e:
            logger.error(f"Error initializing inference state for {video_dir}: {str(e)}")
            logger.error(traceback.format_exc())
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_ERROR})

    def init_video(self, video_dir, start_frame=0, end_frame=-1, reverse_video=False):
        """
        Called by external code. Initializes video frames for tracking.
        
        Implements intelligent incremental frame loading:
        1. Checks if we already have processed frames for this video
        2. If we have frames, determines which new frames need to be loaded
        3. Only loads the necessary frames, reusing cached frames when possible
        """
        logger.info(f"init_video called for {video_dir} with start_frame={start_frame}, end_frame={end_frame}, reverse={reverse_video}")
        
        # Get current status
        status = self.get_video_status(video_dir)
        logger.debug(f"Current status for {video_dir}: {status}")
        
        # If initialization is already running, don't start another thread
        if status['init'] == MultiImagePredictorStatus.INIT_RUNNING:
            logger.info(f"Init for {video_dir} is still running. Not starting a new thread.")
            return
        
        # Check if we need to initialize from scratch or can reuse frames
        if video_dir in self.processed_frames_cache:
            # We have existing processed frames - check if we can reuse them
            cache_info = self.processed_frames_cache[video_dir]
            existing_frame_range = cache_info.get('frame_range', [])
            existing_reverse = cache_info.get('reverse_video', False)
            
            if existing_reverse == reverse_video:
                # Same direction, might be able to reuse frames
                logger.info(f"Found existing frame cache with {len(existing_frame_range)} frames in same direction")
                
                # Get all files in directory to determine total frames
                all_files = sorted(glob(os.path.join(video_dir, '*.png')))
                total_frames = len(all_files)
                
                # Normalize end_frame if it's negative
                if end_frame < 0:
                    end_frame = total_frames
                    
                # Validate frame range
                if start_frame >= total_frames:
                    start_frame = 0
                if end_frame > total_frames:
                    end_frame = total_frames
                    
                # Create new frame range
                new_frame_range = list(range(start_frame, end_frame))
                if reverse_video:
                    new_frame_range = list(reversed(new_frame_range))
                    
                # If the current frames fully contain what we need, we can reuse
                if all(frame in existing_frame_range for frame in new_frame_range):
                    logger.info(f"All requested frames are already cached. Setting status to INIT_DONE")
                    multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
                    return
        
        # Set status to INIT_RUNNING before starting the thread
        logger.info(f"Setting status to INIT_RUNNING for {video_dir}")
        multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_RUNNING})
        
        # Start the thread for initialization
        logger.info(f"Starting initialization thread for {video_dir}")
        t = Thread(target=self._run_inference_thread, args=(video_dir, start_frame, end_frame, reverse_video))
        t.start()
        logger.debug(f"Thread started for {video_dir}")

    def get_video_status(self, video_dir):
        """
        A small helper to let you query the current status of the background job.
        """
        logger.debug(f"Getting video status for {video_dir}")
        status = multi_image_progress_manager.get_task_info_by_file(video_dir)['status']
        if status is None or len(status) == 0:
            logger.info(f"No task found for {video_dir}. Creating new task with NO_TASK status")
            multi_image_progress_manager.create_task(video_dir)
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK})
            status = {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK}
        logger.debug(f"Current status for {video_dir}: {status}")
        return status

    def get_video_inference_state(self, video_dir, start_frame=0, end_frame=-1, reverse_video=False):
        """
        Get the inference state for a video directory.
        """
        logger.debug(f"Getting inference state for {video_dir}")
        state = self.inference_state_cache.get(video_dir)
        if state is None:
            logger.debug(f"No inference state found in cache for {video_dir}")
        else:
            logger.debug(f"Found inference state in cache for {video_dir}")
        return state

    def set_video_inferece_state(self, video_dir, inference_state):
        """
        Get the final inference result if done, or None otherwise.
        """
        self.inference_state_cache.put(video_dir, inference_state)
    
    def reset_video_result(self, video_dir):
        """
        Reset the result for a video directory.
        """
        logger.info(f"Resetting result for {video_dir}")
        # Use set_status with the correct keys for tracking status
        # The status uses 'init' and 'tracking' as keys
        multi_image_progress_manager.set_status(video_dir, {
            'init': MultiImagePredictorStatus.NO_TASK, 
            'tracking': MultiImagePredictorStatus.NO_TASK
        })
        
        # Remove from cache
        if video_dir in self.inference_state_cache:
            self.inference_state_cache.remove(video_dir)
        
        # Remove from processed frames cache
        if video_dir in self.processed_frames_cache:
            del self.processed_frames_cache[video_dir] 

    def add_multi_box_prompts(self, video_dir, box_prompts):
        """
        Add multiple box prompts to the video.
        """
        if self.get_video_status(video_dir)['init'] in [MultiImagePredictorStatus.INIT_ERROR, MultiImagePredictorStatus.NO_TASK] or self.get_video_inference_state(video_dir) is None:
            self.init_video(video_dir)
            # return self.get_video_status(video_dir)
            while self.get_video_status(video_dir)['init'] == MultiImagePredictorStatus.INIT_RUNNING:
                pass
        inference_state = self.get_video_inference_state(video_dir)
        label2prompts = convert_prompt_data({'box_prompts': box_prompts, 'point_prompts': [[],[],[]], 'mask_prompts': [[],[],[]]})
        
        inference_state = self.get_video_inference_state(video_dir)
        all_labels = []
        all_frame_ids = []
        all_masks = []
        for prompt_frame_id, label2prompt in label2prompts.items():
            for label, prompts in label2prompt.items():
                boxes = np.array(sorted(prompts['box_prompts'], reverse=True, key=lambda x: (x[3]-x[1])*(x[2]-x[0]))) if prompts['box_prompts'] is not None else None
                if boxes is None:
                    continue
                for i, box in enumerate(boxes):
                    m_label = f"{label}_||_{i}"
                    out_frame_idx, out_obj_ids, out_masks = self.predictor.add_new_points_or_box(
                        inference_state=inference_state,
                        frame_idx=int(prompt_frame_id),
                        obj_id=m_label,
                        points=None,
                        labels=None,
                        box=box
                    )
                    all_labels.append(label)
                    all_masks.append(out_masks)
                    all_frame_ids.append(prompt_frame_id)

        for mask, label, prompt_frame_id in zip(all_masks, all_labels, all_frame_ids):
            mask_np = mask.to('cpu').numpy()
            # Post-process each mask
            shapes = self.post_process(mask_np[0])
            yield shapes, label, prompt_frame_id

    def add_prompts_and_get_results(self, video_dir, point_prompts, box_prompts, mask_prompts):
        if self.get_video_status(video_dir)['init'] in [MultiImagePredictorStatus.INIT_ERROR, MultiImagePredictorStatus.NO_TASK] or self.get_video_inference_state(video_dir) is None:
            self.init_video(video_dir)
            # return self.get_video_status(video_dir)
            while self.get_video_status(video_dir)['init'] == MultiImagePredictorStatus.INIT_RUNNING:
                pass
        label2prompts = convert_prompt_data({'box_prompts': box_prompts, 'point_prompts': point_prompts, 'mask_prompts': mask_prompts})
        
        inference_state = self.get_video_inference_state(video_dir)
        all_labels = []
        all_frame_ids = []
        all_masks = []
        for prompt_frame_id, label2prompt in label2prompts.items():
            for label, prompts in label2prompt.items():
                if len(prompts['point_prompts']) == 0:
                    prompts['point_prompts'] = None
                if len(prompts['box_prompts']) == 0:
                    prompts['box_prompts'] = None
                if len(prompts['mask_prompts']) == 0:
                    prompts['mask_prompts'] = None
                boxes = np.array(sorted(prompts['box_prompts'], reverse=True, key=lambda x: (x[3]-x[1])*(x[2]-x[0]))) if prompts['box_prompts'] is not None else None
                largest_box = boxes[0] if boxes is not None else None
                out_frame_idx, out_obj_ids, out_masks = self.predictor.add_new_points_or_box(
                    inference_state=inference_state,
                    frame_idx=int(prompt_frame_id),
                    obj_id=label,
                    points=np.array(prompts['point_prompts'])[:, :2] if prompts['point_prompts'] is not None else None,
                    labels=np.array(prompts['point_prompts'])[:, 2] if prompts['point_prompts'] is not None else None,
                    box=largest_box
                )
                    
            all_labels.append(out_obj_ids)
            all_masks.append(out_masks)
            all_frame_ids.append(prompt_frame_id)
                            
        self.set_video_inferece_state(video_dir, inference_state)
        # If out_masks is a nested list or tensor, iterate appropriately.
        for masks, labels, prompt_frame_id in zip(all_masks, all_labels, all_frame_ids):
            for mask, label in zip(masks, labels):
                mask_np = mask.to('cpu').numpy()
                # Post-process each mask
                shapes = self.post_process(mask_np[0])
                yield shapes, label, prompt_frame_id
            
        
    def predict_masks(self, video_dir, point_prompts, box_prompts, mask_prompts):
        """
        Predict masks for all frames in the video based on the provided prompts.
        
        This method:
        1. Initializes the video if needed
        2. Adds prompts and gets initial results
        3. Propagates tracking through all frames
        4. Yields the shapes, labels, and frame indices as they are processed
        """
        # Check if we need to initialize
        if self.get_video_status(video_dir)['init'] in [MultiImagePredictorStatus.INIT_ERROR, MultiImagePredictorStatus.NO_TASK] or self.get_video_inference_state(video_dir) is None:
            logger.info(f"Need to initialize video {video_dir} before prediction")
            self.init_video(video_dir)
            # Wait for initialization to complete
            while self.get_video_status(video_dir)['init'] == MultiImagePredictorStatus.INIT_RUNNING:
                pass
        
        # Set tracking status to STARTED
        multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_STARTED})
        
        # Add prompts and get initial results
        results = self.add_prompts_and_get_results(video_dir, point_prompts, box_prompts, mask_prompts)
        results = list(results)
        inference_state = self.get_video_inference_state(video_dir)
        
        # Check the current status
        status = self.get_video_status(video_dir)
        
        # Skip if tracking is already running
        if status.get('tracking') == MultiImagePredictorStatus.TRACKING_RUNNING:
            logger.warning(f"Tracking is already running for {video_dir}. Yielding empty results.")
            yield [], [], []
            return
        
        # Propagate masks through the video
        logger.info(f"Propagating masks through video {video_dir}")
        try:
            for frame_idx, labels, masks in tqdm(self.predictor.propagate_in_video(inference_state)):
                multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_RUNNING})
                for mask, label in zip(masks, labels):
                    mask_np = mask.to('cpu').numpy()
                    # Post-process each mask
                    shapes = self.post_process(mask_np[0])
                    yield shapes, label, frame_idx
                
            # Set status to DONE when finished
            logger.info(f"Tracking completed for {video_dir}")
            multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_DONE})
        except Exception as e:
            logger.error(f"Error during tracking for {video_dir}: {str(e)}")
            logger.error(traceback.format_exc())
            multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_ERROR})

    def post_process(self, masks, output_mode='polygon'):
        """
        Post process masks
        """
        # Find contours
        masks[masks > 0.0] = 255
        masks[masks <= 0.0] = 0
        masks = masks.astype(np.uint8)
        contours, _ = cv2.findContours(
            masks, cv2.RETR_TREE, cv2.CHAIN_APPROX_NONE
        )
        
        
        # Refine contours
        approx_contours = []
        for contour in contours:
            # Approximate contour
            epsilon = 1e-6*cv2.arcLength(contour, True)
            approx = cv2.approxPolyDP(contour, epsilon, True)
            approx_contours.append(approx)

        # Remove too big contours ( >90% of image size)
        if len(approx_contours) > 1:
            image_size = masks.shape[0] * masks.shape[1]
            areas = [cv2.contourArea(contour) for contour in approx_contours]
            filtered_approx_contours = [
                contour
                for contour, area in zip(approx_contours, areas)
                if area < image_size * 0.9
            ]

        # Remove small contours (area < 20% of average area)
        if len(approx_contours) > 1:
            areas = [cv2.contourArea(contour) for contour in approx_contours]
            avg_area = np.mean(areas)

            filtered_approx_contours = [
                contour
                for contour, area in zip(approx_contours, areas)
                if area > avg_area * 0.2
            ]
            approx_contours = filtered_approx_contours

        # Contours to shapes
        shapes = []
        if output_mode == "polygon":
            for approx in approx_contours:
                # Scale points
                points = approx.reshape(-1, 2)
                points[:, 0] = points[:, 0]
                points[:, 1] = points[:, 1]
                points = points.tolist()
                if len(points) < 3:
                    continue
                points.append(points[0])

                # Create shape
                all_x = []
                all_y = []
                for point in points:
                    point[0] = int(point[0])
                    point[1] = int(point[1])
                    all_x.append(point[0])
                    all_y.append(point[1])
                shapes.append((all_x, all_y))
        elif output_mode == "rectangle":
            x_min = 100000000
            y_min = 100000000
            x_max = 0
            y_max = 0
            for approx in approx_contours:
                # Scale points
                points = approx.reshape(-1, 2)
                points[:, 0] = points[:, 0]
                points[:, 1] = points[:, 1]
                points = points.tolist()
                if len(points) < 3:
                    continue

                # Get min/max
                for point in points:
                    x_min = min(x_min, point[0])
                    y_min = min(y_min, point[1])
                    x_max = max(x_max, point[0])
                    y_max = max(y_max, point[1])

            # Create shape
            shape = [x_min, y_min, x_max-x_min, y_max-y_min]
            shapes.append(shape)

        return shapes



