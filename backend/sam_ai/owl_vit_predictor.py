import torch
from PIL import Image
from transformers import AutoProcessor, Owlv2ForObjectDetection


def convert_prompt_data(img_crop_prompts_data):
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
    img_crop_prompts, img_crop_labels, img_crop_frame_ids = img_crop_prompts_data

    label2prompts = {}
    
    for label, frame in zip(img_crop_labels, img_crop_frame_ids):
        label2prompts[(label, frame)] = []


    for label, prompt, prompt_frame_id in zip(img_crop_labels, img_crop_prompts, img_crop_frame_ids):
        label2prompts[(label, prompt_frame_id)].append(prompt)
    return label2prompts




class OwlVitPredictor:
    def __init__(self):
        self.processor = AutoProcessor.from_pretrained("google/owlv2-base-patch16-ensemble")
        self.model = Owlv2ForObjectDetection.from_pretrained("google/owlv2-base-patch16-ensemble")

    def get_label2crops(self, image, img_crop_prompts):
        label2crops = {}
        label2prompts = convert_prompt_data(img_crop_prompts)
        for label, frame_idx in label2prompts:
            prompts = label2prompts[(label, frame_idx)]
            for i, (x1, y1, x2, y2) in enumerate(prompts):
                crop = image.crop((x1, y1, x2, y2))
                crop.save(f"abc{i}.png")
                if (label, frame_idx) not in label2crops:
                    label2crops[(label, frame_idx)] = [crop]
                else:
                    label2crops[(label, frame_idx)].append(crop)
        return label2crops

    def predict(self, image_path, text_prompts, BOX_THRESHOLD=0.3):
        text_labels = [t.strip() for t in text_prompts]  # Use the first label for prediction
        print(text_labels)
        if len(text_labels) == 0:
            return [], []
        image = Image.open(image_path)
        inputs = self.processor(text=[text_labels], images=[image], return_tensors="pt")
        with torch.no_grad():
            outputs = self.model(**inputs)
            target_sizes = torch.tensor([(image.height, image.width)])
            # Convert outputs (bounding boxes and class logits) to Pascal VOC format (xmin, ymin, xmax, ymax)
            results = self.processor.post_process_grounded_object_detection(outputs=outputs, target_sizes=target_sizes, threshold=BOX_THRESHOLD, text_labels=[text_labels])
            result = results[0]
            boxes, scores, text_labels = result["boxes"], result["scores"], result["text_labels"]
        print(boxes, text_labels)
        return boxes, text_labels
    
    def image_conditioned_predict(self, image_path, img_crop_prompts, BOX_THRESHOLD=0.3, NMS_THRESHOLD=0.3):
        # Load target image
        image = Image.open(image_path).convert("RGB")
        # Load visual prompt images (patches)

        label2crops = self.get_label2crops(image, img_crop_prompts)
        for label, frame_idx in label2crops:
            query_images = label2crops[(label, frame_idx)]
            if len(query_images) == 0:
                continue

            # Prepare inputs for visual-conditioned detection
            inputs = self.processor(query_images=query_images, images=[image], return_tensors="pt")

            with torch.no_grad():
                outputs = self.model.image_guided_detection(**inputs)
                target_sizes = torch.tensor([(image.height, image.width)])
                results = self.processor.post_process_image_guided_detection(
                    outputs=outputs,
                    target_sizes=target_sizes,
                    threshold=BOX_THRESHOLD,
                    nms_threshold=NMS_THRESHOLD
                )
                result = results[0]
                boxes, scores = result["boxes"], result["scores"]

            yield boxes, [label]*len(boxes)
    
