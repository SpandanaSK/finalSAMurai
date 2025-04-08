# Description: Mobile version of SAM model for segmentation

import os
import cv2
import numpy as np
import traceback
from glob import glob
from tqdm import tqdm
from threading import Thread
from sam2.build_sam import build_sam2_video_predictor
from backend.progress_manager.samv2_progress_manager import multi_image_progress_manager
from backend.sam_ai.utils import SAM_MODELSv2
from backend.imvid_rendering.image_dir_fast_loader import init_inference_state_for_dir
from m_utils.lru import LRUCache

from enum import Enum


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



device = "cuda"


class MultiImagePredictorSAMv2:
    def __init__(self, model_name):
        model_info = SAM_MODELSv2[model_name]
        #sam = sam_model_registry[model_info['model_type']](checkpoint=model_info['checkpoint'])
        # self.predictor = build_sam2_video_predictor(config_file=model_info['model_config'], checkpoint=model_info['checkpoint'], device=device)
        self.predictor = build_sam2_video_predictor(model_info['model_config'], model_info['checkpoint'], device=device)
        self.inference_state_cache = LRUCache(1000)

    def _run_inference_thread(self, video_dir):
        """
        This is the function actually called by the Thread. 
        It calls `init_inference_state_for_dir`, catches exceptions, 
        and updates self.tasks[video_dir] with the result or error.
        """
        if self.inference_state_cache.get(video_dir) is not None:
            # Already initialized
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
            return
        
        multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_RUNNING})
        try:
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_RUNNING})

            # Since we want to store the inference_state in the same dictionary:
            inference_state = {}
            image_files = sorted(glob(os.path.join(video_dir, '*.png')))
            init_inference_state_for_dir(image_files, inference_state, image_size=self.predictor.image_size)

            # If it finished without error:
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
            self.inference_state_cache.put(video_dir, inference_state)

        except Exception as e:
            print(traceback.format_exc())
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_ERROR})

    def init_video(self, video_dir):
        """
        Called by external code. If inference for this video_dir is
        not started or finished with error, start a new thread.
        Otherwise, return whatever we already have.
        """
        status = self.get_video_status(video_dir)
        if self.inference_state_cache.get(video_dir) is not None:
            # Already initialized
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.INIT_DONE})
            return
        status = self.get_video_status(video_dir)
        if status['init'] == MultiImagePredictorStatus.INIT_RUNNING:
            print(f"Init for {video_dir} is still running.")
        elif status['init'] == MultiImagePredictorStatus.INIT_ERROR:
            print(f"Init for {video_dir} previously errored out.")
            print(f"Starting initialization thread for {video_dir}.")
            t = Thread(target=self._run_inference_thread, args=(video_dir,))
            t.start()
        else:
            print(f"Starting initialization thread for {video_dir}.")
            t = Thread(target=self._run_inference_thread, args=(video_dir,))
            t.start()
        
    def get_video_status(self, video_dir):
        """
        A small helper to let you query the current status of the background job.
        """
        status = multi_image_progress_manager.get_task_info_by_file(video_dir)['status']
        if status is None or len(status) == 0:
            multi_image_progress_manager.create_task(video_dir)
            multi_image_progress_manager.set_status(video_dir, {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK})
            status = {'init': MultiImagePredictorStatus.NO_TASK, 'tracking': MultiImagePredictorStatus.NO_TASK}
        return status

    def get_video_inference_state(self, video_dir):
        """
        Get the final inference result if done, or None otherwise.
        """
        return self.inference_state_cache.get(video_dir)
        
    def set_video_inferece_state(self, video_dir, inference_state):
        """
        Get the final inference result if done, or None otherwise.
        """
        self.inference_state_cache.put(video_dir, inference_state)
    
    def reset_video_result(self, video_dir):
        """
        Reset the inference result for a video_dir.
        """
        inference_state = self.inference_state_cache.get(video_dir)
        if inference_state is None:
            return
        self.predictor.reset_state(inference_state)
        self.inference_state_cache.put(video_dir, inference_state)

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
        if self.get_video_status(video_dir)['tracking'] in [MultiImagePredictorStatus.TRACKING_ERROR, MultiImagePredictorStatus.NO_TASK] or self.get_video_inference_state(video_dir) is None:
            multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_STARTED})

        self.reset_video_result(video_dir)
        results = self.add_prompts_and_get_results(video_dir, point_prompts, box_prompts, mask_prompts)
        results = list(results)
        inference_state = self.get_video_inference_state(video_dir)

        status = self.get_video_status(video_dir)
        if 'tracking' not in status:
            multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_STARTED})
        if self.get_video_status(video_dir)['tracking'] == MultiImagePredictorStatus.TRACKING_RUNNING:
            yield [], [], []
        for frame_idx, labels, masks in tqdm(self.predictor.propagate_in_video(inference_state)):
            multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_RUNNING})
            for mask, label in zip(masks, labels):
                mask_np = mask.to('cpu').numpy()
                # Post-process each mask
                shapes = self.post_process(mask_np[0])
                yield shapes, label, frame_idx
        multi_image_progress_manager.set_status(video_dir, {'tracking': MultiImagePredictorStatus.TRACKING_DONE})
        self.reset_video_result(video_dir)

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



