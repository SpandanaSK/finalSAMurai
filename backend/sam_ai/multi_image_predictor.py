# Description: Mobile version of SAM model for segmentation


from asyncio import tasks
from copy import deepcopy
import os
import cv2
import onnx
import numpy as np
import traceback
import torch
import onnxruntime
from glob import glob
from threading import Thread
from sam2.build_sam import build_sam2_video_predictor
from sam2.sam2_video_predictor import SAM2VideoPredictor
from backend.sam_ai.utils import SAM_MODELS
from backend.imvid_rendering.image_dir_fast_loader import init_inference_state_for_dir
from m_utils.lru import LRUCache

def convert_prompt_data(data):
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
    box_prompts, box_labels = data["box_prompts"]
    point_prompts, point_labels = data["point_prompts"]
    mask_prompts, mask_labels = data["mask_prompts"]
    label2prompts = {}
    
    for label in box_labels+point_labels+mask_labels:
        label2prompts[label] = {'box_prompts': [], 'point_prompts': [], 'mask_prompts': []}


    for label, prompt in zip(box_labels, box_prompts):
        label2prompts[label]['box_prompts'].append(prompt)

    for label, prompt in zip(point_labels, point_prompts):
        label2prompts[label]['point_prompts'].append(prompt)

    for label, prompt in zip(mask_labels, mask_prompts):
        label2prompts[label]['mask_prompts'].append(prompt)


    print('label2prompts', label2prompts)
    prompts = []
    for box_prompt in box_prompts:
        prompt = {
            'data': box_prompt[:4],
            'label': 1,
            'type': 'rectangle'
        }
        prompts.append(prompt)
    for point_prompt in point_prompts:
        prompt = {
            'data': point_prompt[:2],
            'label': point_prompt[2],
            'type': 'point'
        }
        prompts.append(prompt)
    return prompts, label2prompts



device = "cuda"


class MultiImagePredictorSAMv2:
    def __init__(self, model_name):
        model_info = SAM_MODELS[model_name]
        #sam = sam_model_registry[model_info['model_type']](checkpoint=model_info['checkpoint'])
        # self.predictor = build_sam2_video_predictor(config_file=model_info['model_config'], checkpoint=model_info['checkpoint'], device=device)
        self.predictor = build_sam2_video_predictor(model_info['model_config'], model_info['checkpoint'], device=device)
        self.inference_state_cache = LRUCache(1000)
        self.tasks = {}

    def _run_inference_thread(self, video_dir):
        """
        This is the function actually called by the Thread. 
        It calls `init_inference_state_for_dir`, catches exceptions, 
        and updates self.tasks[video_dir] with the result or error.
        """
        try:
            self.tasks[video_dir]['status'] = 'RUNNING'

            # Since we want to store the inference_state in the same dictionary:
            inference_state = {}
            image_files = sorted(glob(os.path.join(video_dir, '*.png')))
            init_inference_state_for_dir(image_files, inference_state, image_size=self.predictor.image_size)

            # If it finished without error:
            self.tasks[video_dir]['status'] = 'DONE'
            self.tasks[video_dir]['result'] = inference_state

        except Exception as e:
            # Capture the error for debugging
            self.tasks[video_dir]['status'] = 'ERROR'
            # Store either the exception or its traceback
            self.tasks[video_dir]['error'] = traceback.format_exc()

    def init_video(self, video_dir):
        """
        Called by external code. If inference for this video_dir is
        not started or finished with error, start a new thread.
        Otherwise, return whatever we already have.
        """
        # First, see if we already have a task for this video_dir
        if video_dir in self.tasks:
            status = self.tasks[video_dir]['status']
            if status == 'RUNNING':
                print(f"Inference for {video_dir} is still running.")
                return None
            elif status == 'DONE':
                print(f"Inference for {video_dir} is done. Returning cached result.")
                return self.tasks[video_dir]['result']
            elif status == 'ERROR':
                print(f"Inference for {video_dir} previously errored out.")
                print(f"Starting inference thread for {video_dir}.")
                t = Thread(target=self._run_inference_thread, args=(video_dir,))
                self.tasks[video_dir]['thread'] = t
                t.start()
                # Maybe you want to retry or just return None
                return None
            else:
                print(f"Unknown status {status}.")
                return None
        else:
            # No existing task. Let's create one and start the thread.
            self.tasks[video_dir] = {
                'thread': None,
                'status': 'NOT_STARTED',
                'result': None,
                'error': None,
            }
            print(f"Starting inference thread for {video_dir}.")

            t = Thread(target=self._run_inference_thread, args=(video_dir,))
            self.tasks[video_dir]['thread'] = t
            t.start()

            # Optionally return immediately or return something to indicate it’s started
            return None
        
    def get_video_status(self, video_dir):
        """
        A small helper to let you query the current status of the background job.
        """
        if video_dir not in self.tasks:
            return "NO_TASK"
        return self.tasks[video_dir]['status']

    def get_video_result(self, video_dir):
        """
        Get the final inference result if done, or None otherwise.
        """
        if (video_dir in self.tasks and self.tasks[video_dir]['status'] == 'DONE'):
            return self.tasks[video_dir]['result']
        return None

    def refine_prompts_from_previous_frame(self, video_dir, frame_num, point_prompts, box_prompts, mask_prompts):
        if self.get_video_status(video_dir) != "DONE":
            return None
        '''
        "box_prompts": [[[x1, y1, x2, y2],[<another set of box points>], ...n boxes], [label1, label2, ...labeln]],
        "point_prompts": [(x1, y1, 0), [x2, y2, 1], ..n points],
        '''
        inference_state = self.get_video_result(video_dir)
        self.predictor.add_new_points_or_box(
            inference_state=inference_state,
            frame_idx=int(frame_num),
            obj_id=obj_idx,
            points=points,
            labels=labels,
            box = boxes
        )

        
        
    def predict_masks(self, file_name, point_prompts, box_prompts, mask_prompts, cv_image=None):
        if cv_image is None:
            h, w = cv2.imread(file_name).shape
        else:
            h, w = cv_image.shape[:2]
        embedding = self.get_image_embedding(file_name, cv_image)
        self.predictor._is_image_set = True
        self.predictor._features["image_embed"] = embedding
        _, label2prompts = convert_prompt_data({'box_prompts': box_prompts, 'point_prompts': point_prompts, 'mask_prompts': mask_prompts})
        
        # prompt checks 
        # 1. if label is None. do batched prediction only for boxes
        # 2. if label is not none, then check if there are multiple box_prompts. If so, then do batched prediction and return the one with highest score
        # 3. if label is not none, if there is single box_prompt, and multiple point_prompts, then do simple prediction 

        for label, prompts in label2prompts.items():
            box_prompts = np.array(prompts['box_prompts'])
            point_prompts = prompts['point_prompts']
            point_prompts = np.array(point_prompts)
            if len(point_prompts) == 0:
                point_coord = None
                point_labels = None
            else:
                point_coord, point_labels = point_prompts[:, :2], point_prompts[:, 2]

            mask_prompts = prompts['mask_prompts']
            if len(box_prompts) > 1:
                # box_prompts = sorted(box_prompts, reverse=True, key=lambda x: (x[3]-x[1])*(x[2]-x[0]))
                # transformed_boxes = self.predictor.transform.apply_boxes_torch(torch.from_numpy(box_prompts).to(device), (h, w))
                masks, _, _ = self.predictor.predict(
                    point_coords=None,
                    point_labels=None,
                    box=box_prompts,
                    multimask_output=False
                )
                # masks = masks.to('cpu').numpy()
                shapes1 = []
                for mask in masks:
                    shapes1 += self.post_process(mask[0])   
                masks, _, _ = self.predictor.predict(
                    point_coords=point_coord,
                    point_labels=point_labels,
                    box=None,
                    multimask_output=False
                )
                shapes2 = self.post_process(masks[0])
                yield shapes1+shapes2, label
                    
            else:
                if len(box_prompts) == 0:
                    box_prompts = None
                masks, _, _ = self.predictor.predict(
                    point_coords=point_coord,
                    point_labels=point_labels,
                    box=box_prompts,
                    multimask_output=False
                )
                shapes = self.post_process(masks[0])
                yield shapes, label


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



