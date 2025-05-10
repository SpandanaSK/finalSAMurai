# Description: Mobile version of SAM model for segmentation

import os
import cv2
import numpy as np
import traceback
import torch
import time
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
        Initialize video frames for tracking. This is a synchronous method that directly
        processes the frames while maintaining frame reuse/caching logic.
        """
        logger.info(f"Starting inference for {video_dir}")
        
        try:
            # Verify directory exists
            if not os.path.exists(video_dir):
                logger.error(f"Directory doesn't exist: {video_dir}")
                self._set_error_status(video_dir)
                return
            
            # Get all image files in the directory
            all_image_files = sorted(glob(os.path.join(video_dir, '*.png')))
            if not all_image_files:
                logger.error(f"No PNG files found in {video_dir}")
                self._set_error_status(video_dir)
                return
                
            # Process frame range parameters
            total_frames = len(all_image_files)
            end_frame = total_frames if end_frame < 0 else min(end_frame, total_frames)
            start_frame = 0 if start_frame >= total_frames else start_frame
            
            # Create target frame range
            target_frame_indices = list(range(start_frame, end_frame))
            if reverse_video:
                target_frame_indices = list(reversed(target_frame_indices))
            
            # Check for existing processed frames we can reuse
            existing_inference_state = self.inference_state_cache.get(video_dir)
            previously_processed_frames = []
            
            if existing_inference_state is not None and video_dir in self.processed_frames_cache:
                # We have existing inference state - check if we can reuse it
                existing_frame_indices = self.processed_frames_cache[video_dir].get('frame_range', [])
                existing_reverse = self.processed_frames_cache[video_dir].get('reverse_video', False)
                
                # Can only reuse if the direction matches
                if existing_reverse == reverse_video:
                    previously_processed_frames = existing_frame_indices
                    logger.info(f"Reusing {len(previously_processed_frames)} previously processed frames")
            
            # Determine which frames need to be processed
            frames_to_process = [idx for idx in target_frame_indices if idx not in previously_processed_frames]
            
            # If all frames are already processed, we're done
            if not frames_to_process:
                logger.info(f"All requested frames are already processed. Nothing to do.")
                multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
                return
            
            # Select files to process
            files_to_process = [all_image_files[idx] for idx in frames_to_process]
            logger.info(f"Processing {len(files_to_process)} new frames")
            
            # Create inference state
            inference_state = {}
            try:
                # Process all frames at once
                init_inference_state_for_dir(files_to_process, inference_state, image_size=self.predictor.image_size)
                
                # Update cache and status
                self.inference_state_cache.put(video_dir, inference_state)
                self.processed_frames_cache[video_dir] = {
                    'frame_range': frames_to_process if existing_inference_state is None else target_frame_indices,
                    'reverse_video': reverse_video
                }
                
                multi_image_progress_manager.set_status(video_dir, {
                    'init': MultiImagePredictorStatus.INIT_DONE,
                    'tracking': MultiImagePredictorStatus.NO_TASK
                })
                logger.info(f"Successfully initialized inference state for {video_dir}")
                
            except Exception as e:
                logger.error(f"Error initializing inference state: {str(e)}")
                logger.error(traceback.format_exc())
                self._set_error_status(video_dir)
                return
            
        except Exception as e:
            logger.error(f"Error in inference thread: {str(e)}")
            logger.error(traceback.format_exc())
            self._set_error_status(video_dir)
        finally:
            # Final safety check - make sure we don't leave the task in INIT_RUNNING state
            task_info = multi_image_progress_manager.get_task_info(video_dir)
            if task_info and 'status' in task_info and task_info['status'].get('init') == MultiImagePredictorStatus.INIT_RUNNING:
                logger.warning(f"Thread completed but status was still INIT_RUNNING. Setting to INIT_ERROR.")
                self._set_error_status(video_dir)
    
    def _set_error_status(self, video_dir):
        """Helper method to set error status"""
        multi_image_progress_manager.set_status(video_dir, {
            'init': MultiImagePredictorStatus.INIT_ERROR,
            'tracking': MultiImagePredictorStatus.NO_TASK
        })

    def init_video(self, video_dir, start_frame=0, end_frame=-1, reverse_video=False):
        """
        Initialize video frames for tracking. This is a synchronous method that directly
        processes the frames without threading or batching.
        """
        logger.info(f"Initializing video {video_dir} with start_frame={start_frame}, end_frame={end_frame}, reverse={reverse_video}")
        
        # Verify directory exists and has files
        if not os.path.exists(video_dir):
            logger.error(f"Directory doesn't exist: {video_dir}")
            self._set_error_status(video_dir)
            return
        
        # Check if directory has image files
        image_files = [f for f in os.listdir(video_dir) if f.endswith(('.png', '.jpg', '.jpeg'))]
        if len(image_files) == 0:
            logger.error(f"No image files found in directory: {video_dir}")
            self._set_error_status(video_dir)
            return
        
        # Get all PNG files in the directory
        all_image_files = sorted(glob(os.path.join(video_dir, '*.png')))
        if not all_image_files:
            logger.error(f"No PNG files found in {video_dir}")
            self._set_error_status(video_dir)
            return
        
        # Process frame range parameters
        total_frames = len(all_image_files)
        end_frame = total_frames if end_frame < 0 else min(end_frame, total_frames)
        start_frame = 0 if start_frame >= total_frames else start_frame
        
        # Create target frame range
        target_frame_indices = list(range(start_frame, end_frame))
        if reverse_video:
            target_frame_indices = list(reversed(target_frame_indices))
            
        # Select files to process
        files_to_process = [all_image_files[idx] for idx in target_frame_indices]
        logger.info(f"Processing {len(files_to_process)} frames")
                
        # Create inference state
        inference_state = {}
        try:
            # Process all frames at once
            init_inference_state_for_dir(files_to_process, inference_state, image_size=self.predictor.image_size)
                    
            # Success - update cache and status
            logger.info(f"Successfully processed all frames")
            self.inference_state_cache.put(video_dir, inference_state)
            self.processed_frames_cache[video_dir] = {
                'frame_range': target_frame_indices,
                'reverse_video': reverse_video
            }
            
            multi_image_progress_manager.set_status(video_dir, {
                'init': MultiImagePredictorStatus.INIT_DONE,
                'tracking': MultiImagePredictorStatus.NO_TASK
            })
            logger.info(f"Initialization completed successfully")
            
        except Exception as e:
            logger.error(f"Error during initialization: {str(e)}")
            logger.error(traceback.format_exc())
            self._set_error_status(video_dir)

    def get_video_status(self, video_dir):
        """
        A small helper to let you query the current status of the background job.
        """
        logger.debug(f"Getting video status for {video_dir}")
        try:
            # Get task info directly by local_dir
            task_info = multi_image_progress_manager.get_task_info(video_dir)
            
            # Check if task exists and has status
            if not task_info or 'status' not in task_info or not task_info['status']:
                logger.info(f"No valid task or status found for {video_dir}. Creating new task with NO_TASK status")
                multi_image_progress_manager.create_task(video_dir)
                multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK})
                status = {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK}
            else:
                status = task_info['status']
                
                # Ensure status has both init and tracking keys
                if 'init' not in status:
                    status['init'] = MultiImagePredictorStatus.NO_TASK
                if 'tracking' not in status:
                    status['tracking'] = MultiImagePredictorStatus.NO_TASK
                    
                # Check for stuck initialization
                if status['init'] == MultiImagePredictorStatus.INIT_RUNNING:
                    # Check if we have an init_start_time
                    init_start_time = task_info.get('init_start_time', 0)
                    if init_start_time == 0:
                        # No start time, set one now
                        task_info['init_start_time'] = time.time()
                    else:
                        # Check if it's been running too long
                        running_time = time.time() - init_start_time
                        if running_time > 120:  # 2 minutes timeout
                            logger.warning(f"Initialization for {video_dir} has been running for {running_time:.1f} seconds. Resetting to ERROR state.")
                            status['init'] = MultiImagePredictorStatus.INIT_ERROR
                            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_ERROR})
                
                # Check for inference state to validate status
                inference_state = self.inference_state_cache.get(video_dir)
                if inference_state is not None and status['init'] != MultiImagePredictorStatus.INIT_DONE:
                    logger.info(f"Found inference state but status is {status['init']}. Setting to INIT_DONE.")
                    # Update both flags together
                    multi_image_progress_manager.set_status(video_dir, {
                        'init': MultiImagePredictorStatus.INIT_DONE,
                        'tracking': MultiImagePredictorStatus.NO_TASK  # Reset tracking status
                    })
                    status['init'] = MultiImagePredictorStatus.INIT_DONE
                    status['tracking'] = MultiImagePredictorStatus.NO_TASK
                    
            logger.debug(f"Current status for {video_dir}: {status}")
            return status
            
        except Exception as e:
            logger.error(f"Error in get_video_status: {str(e)}")
            # Return a default status on error
            return {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK}

    def get_video_inference_state(self, video_dir):
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
        
        # First recreate the task to ensure it exists
        try:
            multi_image_progress_manager.create_task(video_dir, local_dir=video_dir)
            logger.debug(f"Created new task for {video_dir} during reset")
        except Exception as e:
            logger.debug(f"Task creation during reset: {str(e)}")
            # Continue even if creation fails (might already exist)
            
        # Use set_status with the correct keys for tracking status
        # The status uses 'init' and 'tracking' as keys - ALWAYS update both together
        multi_image_progress_manager.set_status(video_dir, {
            'init': MultiImagePredictorStatus.NO_TASK, 
            'tracking': MultiImagePredictorStatus.NO_TASK
        })
        
        # Remove from cache - fix the membership check
        # Instead of using 'in' operator, use the LRUCache's get method
        if self.inference_state_cache.get(video_dir) is not None:
            self.inference_state_cache.remove(video_dir)
        
        # Remove from processed frames cache
        if video_dir in self.processed_frames_cache:
            del self.processed_frames_cache[video_dir]
            
        logger.debug(f"Reset completed for {video_dir}")

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
        logger.info(f"[DEBUG] add_prompts_and_get_results called for {video_dir}")
        logger.info(f"[DEBUG] Point prompts: {point_prompts}")
        logger.info(f"[DEBUG] Box prompts: {box_prompts}")
        logger.info(f"[DEBUG] Mask prompts: {mask_prompts}")
        
        if self.get_video_status(video_dir)['init'] in [MultiImagePredictorStatus.INIT_ERROR, MultiImagePredictorStatus.NO_TASK] or self.get_video_inference_state(video_dir) is None:
            logger.info(f"[DEBUG] Initialization not done or error. Initializing video...")
            self.init_video(video_dir)
            # return self.get_video_status(video_dir)
            while self.get_video_status(video_dir)['init'] == MultiImagePredictorStatus.INIT_RUNNING:
                pass
        
        logger.info(f"[DEBUG] Converting prompt data...")
        label2prompts = convert_prompt_data({'box_prompts': box_prompts, 'point_prompts': point_prompts, 'mask_prompts': mask_prompts})
        logger.info(f"[DEBUG] Converted prompt data: {label2prompts}")
        
        inference_state = self.get_video_inference_state(video_dir)
        logger.info(f"[DEBUG] Got inference state: {type(inference_state)}")
        
        all_labels = []
        all_frame_ids = []
        all_masks = []
        
        prompts_added = False
        
        for prompt_frame_id, label2prompt in label2prompts.items():
            logger.info(f"[DEBUG] Processing prompts for frame {prompt_frame_id}")
            for label, prompts in label2prompt.items():
                logger.info(f"[DEBUG] Processing label {label}")
                if len(prompts['point_prompts']) == 0:
                    prompts['point_prompts'] = None
                    logger.info(f"[DEBUG] No point prompts for label {label}")
                else:
                    logger.info(f"[DEBUG] Point prompts for label {label}: {prompts['point_prompts']}")
                    
                if len(prompts['box_prompts']) == 0:
                    prompts['box_prompts'] = None
                    logger.info(f"[DEBUG] No box prompts for label {label}")
                else:
                    logger.info(f"[DEBUG] Box prompts for label {label}: {prompts['box_prompts']}")
                    
                if len(prompts['mask_prompts']) == 0:
                    prompts['mask_prompts'] = None
                    logger.info(f"[DEBUG] No mask prompts for label {label}")
                else:
                    logger.info(f"[DEBUG] Mask prompts for label {label}: {prompts['mask_prompts']}")
                    
                boxes = np.array(sorted(prompts['box_prompts'], reverse=True, key=lambda x: (x[3]-x[1])*(x[2]-x[0]))) if prompts['box_prompts'] is not None else None
                largest_box = boxes[0] if boxes is not None else None
                
                logger.info(f"[DEBUG] Largest box: {largest_box}")
                logger.info(f"[DEBUG] Points: {np.array(prompts['point_prompts'])[:, :2] if prompts['point_prompts'] is not None else None}")
                logger.info(f"[DEBUG] Labels: {np.array(prompts['point_prompts'])[:, 2] if prompts['point_prompts'] is not None else None}")
                
                try:
                    logger.info(f"[DEBUG] Adding prompts to predictor...")
                    out_frame_idx, out_obj_ids, out_masks = self.predictor.add_new_points_or_box(
                        inference_state=inference_state,
                        frame_idx=int(prompt_frame_id),
                        obj_id=label,
                        points=np.array(prompts['point_prompts'])[:, :2] if prompts['point_prompts'] is not None else None,
                        labels=np.array(prompts['point_prompts'])[:, 2] if prompts['point_prompts'] is not None else None,
                        box=largest_box
                    )
                    logger.info(f"[DEBUG] Prompts added successfully: frame_idx={out_frame_idx}, obj_ids={out_obj_ids}")
                    prompts_added = True
                except Exception as e:
                    logger.error(f"[DEBUG] Error adding prompts: {str(e)}")
                    logger.error(traceback.format_exc())
                    continue
                    
                all_labels.append(out_obj_ids)
                all_masks.append(out_masks)
                all_frame_ids.append(prompt_frame_id)
                            
        logger.info(f"[DEBUG] All prompts processed. Updating inference state cache.")
        self.set_video_inferece_state(video_dir, inference_state)
        
        logger.info(f"[DEBUG] Were any prompts added? {prompts_added}")
        logger.info(f"[DEBUG] Number of masks to return: {len(all_masks)}")
        
        # If out_masks is a nested list or tensor, iterate appropriately.
        for masks, labels, prompt_frame_id in zip(all_masks, all_labels, all_frame_ids):
            logger.info(f"[DEBUG] Processing mask result for frame {prompt_frame_id}, labels: {labels}")
            for mask, label in zip(masks, labels):
                logger.info(f"[DEBUG] Processing mask for label {label}")
                mask_np = mask.to('cpu').numpy()
                # Post-process each mask
                shapes = self.post_process(mask_np[0])
                logger.info(f"[DEBUG] Post-processed shapes: {len(shapes)}")
                yield shapes, label, prompt_frame_id
            
        logger.info(f"[DEBUG] Finished yielding all mask results")
        
    def predict_masks(self, video_dir, point_prompts, box_prompts, mask_prompts):
        """
        Predict masks for all frames in the video based on the provided prompts.
        """
        logger.info(f"Starting mask prediction for {video_dir}")
        logger.info(f"[DEBUG] predict_masks called with: point_prompts={point_prompts}, box_prompts={box_prompts}")
        
        # Get inference state
        inference_state = self.get_video_inference_state(video_dir)
        if inference_state is None:
            logger.error(f"No valid inference state for {video_dir}")
            logger.error(f"[DEBUG] Inference state is None!")
            multi_image_progress_manager.set_status(video_dir, {
                'init': MultiImagePredictorStatus.INIT_ERROR,
                'tracking': MultiImagePredictorStatus.TRACKING_ERROR
            })
            yield [], [], []
            return
        
        # Set tracking status to STARTED
        multi_image_progress_manager.set_status(video_dir, {
            'init': MultiImagePredictorStatus.INIT_DONE,
            'tracking': MultiImagePredictorStatus.TRACKING_STARTED
        })

        try:
            # Add prompts and get initial results
            logger.info(f"[DEBUG] Calling add_prompts_and_get_results to register prompts")
            result_count = 0
            initial_results = []
            
            for result in self.add_prompts_and_get_results(video_dir, point_prompts, box_prompts, mask_prompts):
                logger.info(f"[DEBUG] Got initial result: {result[1]} for frame {result[2]}")
                initial_results.append(result)
                result_count += 1
            
            logger.info(f"[DEBUG] Total initial results: {result_count}")
            
            # Yield initial results back to caller
            for shapes, label, frame_idx in initial_results:
                logger.info(f"[DEBUG] Yielding initial result: {label} for frame {frame_idx}")
                # yield shapes, label, frame_idx
            
            # Set tracking status to RUNNING
            multi_image_progress_manager.set_status(video_dir, {
                'init': MultiImagePredictorStatus.INIT_DONE,
                'tracking': MultiImagePredictorStatus.TRACKING_RUNNING
            })
            
            # Check inference state again
            logger.info(f"[DEBUG] Inference state before propagation: {type(inference_state)}")
            logger.info(f"[DEBUG] Starting mask propagation")
            
            # Propagate masks through the video
            propagation_count = 0
            try:
                for frame_idx, labels, masks in self.predictor.propagate_in_video(inference_state):
                    logger.info(f"[DEBUG] Got propagation result for frame {frame_idx}, labels: {labels}")
                    propagation_count += 1
                    for mask, label in zip(masks, labels):
                        mask_np = mask.to('cpu').numpy()
                        shapes = self.post_process(mask_np[0])
                        logger.info(f"[DEBUG] Yielding propagation result: {label} for frame {frame_idx}")
                        yield shapes, label, frame_idx
            
                logger.info(f"[DEBUG] Total propagation results: {propagation_count}")
            except Exception as e:
                logger.error(f"[DEBUG] Error during propagation: {str(e)}")
                logger.error(traceback.format_exc())
                raise
                
            # Set tracking status to DONE
            multi_image_progress_manager.set_status(video_dir, {
                'init': MultiImagePredictorStatus.INIT_DONE,
                'tracking': MultiImagePredictorStatus.TRACKING_DONE
            })
            logger.info(f"Tracking completed for {video_dir}")

        except Exception as e:
            logger.error(f"Error during tracking for {video_dir}: {str(e)}")
            logger.error(traceback.format_exc())
            multi_image_progress_manager.set_status(video_dir, {
                'init': MultiImagePredictorStatus.INIT_DONE,
                'tracking': MultiImagePredictorStatus.TRACKING_ERROR
            })

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

    def init_video_stream(self, video_dir, start_frame=0, end_frame=-1, reverse_video=False):
        """
        Initialize video frames for tracking and stream progress updates.
        This is a generator that yields status updates.
        """
        logger.info(f"Starting initialization for {video_dir}")
        
        try:
            # Verify directory exists
            if not os.path.exists(video_dir):
                logger.error(f"Directory doesn't exist: {video_dir}")
                self._set_error_status(video_dir)
                yield {"status": "ERROR", "message": "Directory doesn't exist"}
                return
            
            # Get all image files in the directory
            all_image_files = sorted(glob(os.path.join(video_dir, '*.png')))
            if not all_image_files:
                logger.error(f"No PNG files found in {video_dir}")
                self._set_error_status(video_dir)
                yield {"status": "ERROR", "message": "No PNG files found"}
                return
                
            # Process frame range parameters
            total_frames = len(all_image_files)
            end_frame = total_frames if end_frame < 0 else min(end_frame, total_frames)
            start_frame = 0 if start_frame >= total_frames else start_frame
            
            # Create target frame range
            target_frame_indices = list(range(start_frame, end_frame))
            if reverse_video:
                target_frame_indices = list(reversed(target_frame_indices))
            
            # Check for existing processed frames we can reuse
            existing_inference_state = self.inference_state_cache.get(video_dir)
            previously_processed_frames = []
            
            if existing_inference_state is not None and video_dir in self.processed_frames_cache:
                existing_frame_indices = self.processed_frames_cache[video_dir].get('frame_range', [])
                existing_reverse = self.processed_frames_cache[video_dir].get('reverse_video', False)
                
                if existing_reverse == reverse_video:
                    previously_processed_frames = existing_frame_indices
                    yield {"status": "PROGRESS", "message": f"Reusing {len(previously_processed_frames)} previously processed frames"}
            
            # Determine which frames need to be processed
            frames_to_process = [idx for idx in target_frame_indices if idx not in previously_processed_frames]
            
            if not frames_to_process:
                yield {"status": "PROGRESS", "message": "All frames already processed"}
                multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
                yield {"status": "DONE", "message": "Initialization completed"}
                return
            
            # Select files to process
            files_to_process = [all_image_files[idx] for idx in frames_to_process]
            yield {"status": "PROGRESS", "message": f"Processing {len(files_to_process)} new frames"}
            
            # Create inference state
            inference_state = {}
            try:
                # Process all frames at once
                init_inference_state_for_dir(files_to_process, inference_state, image_size=self.predictor.image_size)
                
                # Update cache and status
                self.inference_state_cache.put(video_dir, inference_state)
                self.processed_frames_cache[video_dir] = {
                    'frame_range': frames_to_process if existing_inference_state is None else target_frame_indices,
                    'reverse_video': reverse_video
                }
                
                multi_image_progress_manager.set_status(video_dir, {
                    'init': MultiImagePredictorStatus.INIT_DONE,
                    'tracking': MultiImagePredictorStatus.NO_TASK
                })
                
                yield {"status": "DONE", "message": "Initialization completed successfully"}
                
            except Exception as e:
                logger.error(f"Error initializing inference state: {str(e)}")
                logger.error(traceback.format_exc())
                self._set_error_status(video_dir)
                yield {"status": "ERROR", "message": f"Error during initialization: {str(e)}"}
                return
            
        except Exception as e:
            logger.error(f"Error in initialization: {str(e)}")
            logger.error(traceback.format_exc())
            self._set_error_status(video_dir)
            yield {"status": "ERROR", "message": f"Error during initialization: {str(e)}"}
        finally:
            # Final safety check
            task_info = multi_image_progress_manager.get_task_info(video_dir)
            if task_info and 'status' in task_info and task_info['status'].get('init') == MultiImagePredictorStatus.INIT_RUNNING:
                logger.warning(f"Thread completed but status was still INIT_RUNNING. Setting to INIT_ERROR.")
                self._set_error_status(video_dir)



