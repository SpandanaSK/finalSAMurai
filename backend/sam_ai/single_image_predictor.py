# Description: Mobile version of SAM model for segmentation



import random
import cv2
import onnx
import numpy as np
import torch
import onnxruntime
from mobile_sam import sam_model_registry, SamPredictor
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor
from backend.sam_ai.utils import SAM_MODELS
from backend.sam_ai.filter_polygons import filter_polygons_by_overlap
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


sam_checkpoint = "sam_vit_h_4b8939.pth"
model_type = "vit_h"

device = "cuda"


class SingleImagePredictorSAMv1:
    def __init__(self, model_name):
        model_info = SAM_MODELS[model_name]
        sam = sam_model_registry[model_info['model_type']](checkpoint=model_info['checkpoint'])
        sam.to(device=device)
        self.predictor = SamPredictor(sam)
        self.embedding_cache = LRUCache(1000)

    def get_image_embedding(self, file_name, cv_image=None):
        embedding = self.embedding_cache.get(file_name)
        if embedding is not None:
            return embedding
        else:
            if cv_image is None:
                self.predictor.set_image(cv2.imread(file_name))
            else:
                self.predictor.set_image(cv_image)
            self.embedding_cache.put(file_name, self.predictor.features)
            print('embedding', self.predictor.features.shape)
            return self.predictor.features
        
    def predict_masks(self, file_name, point_prompts, box_prompts, mask_prompts, cv_image=None):
        if cv_image is None:
            h, w = cv2.imread(file_name).shape
        else:
            h, w = cv_image.shape[:2]
        embedding = self.get_image_embedding(file_name, cv_image)
        self.predictor.features = embedding
        _, label2prompts = convert_prompt_data({'box_prompts': box_prompts, 'point_prompts': point_prompts, 'mask_prompts': mask_prompts})
        
        # prompt checks 
        # 1. if label is None. do batched prediction only for boxes
        # 2. if label is not none, then check if there are multiple box_prompts. If so, then do batched prediction and return the one with highest score
        # 3. if label is not none, if there is single box_prompt, and multiple point_prompts, then do simple prediction 

        for label, prompts in label2prompts.items():
            print('file_name', file_name)
            print('label', label)
            print('prompts', prompts)
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
                print('predict_torch')
                transformed_boxes = self.predictor.transform.apply_boxes_torch(torch.from_numpy(box_prompts).to(device), (h, w))
                masks, masks_quality, _ = self.predictor.predict_torch(
                    point_coords=None,
                    point_labels=None,
                    boxes=transformed_boxes,
                    multimask_output=False,
                    return_logits=False
                )
                masks = masks.to('cpu').numpy()
                print(masks.shape, masks_quality)
                shapes1 = []
                for mask in masks:
                    for shape in self.post_process(mask[0]):
                        shapes1.append(shape)
                print(len(shapes1))
                #print(len(filtered_shapes))
                #shapes1 = filtered_shapes
                print('shapes1', len(shapes1))
                print(box_prompts)
                shapes2 = []
                if len(point_prompts) != 0:
                    masks, masks_quality, _ = self.predictor.predict(
                        point_coords=point_coord,
                        point_labels=point_labels,
                        box=None,
                        multimask_output=False
                    )
                    print(masks.shape, masks_quality)
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


class SingleImagePredictorSAMv2:
    def __init__(self, model_name):
        model_info = SAM_MODELS[model_name]
        #sam = sam_model_registry[model_info['model_type']](checkpoint=model_info['checkpoint'])
        # self.predictor = build_sam2_video_predictor(config_file=model_info['model_config'], checkpoint=model_info['checkpoint'], device=device)
        self.predictor = SAM2ImagePredictor(build_sam2(model_info['model_config'], model_info['checkpoint'], device=device))
        self.embedding_cache = LRUCache(1000)

    def get_image_embedding(self, file_name, cv_image=None):
        embedding = self.embedding_cache.get(file_name)
        if embedding is not None:
            return embedding
        else:
            if cv_image is None:
                self.predictor.set_image(cv2.imread(file_name))
            else:
                self.predictor.set_image(cv_image)
            self.embedding_cache.put(file_name, self.predictor._features["image_embed"])
            print('embedding', self.predictor._features["image_embed"].shape)
            return self.predictor._features["image_embed"]
        
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



