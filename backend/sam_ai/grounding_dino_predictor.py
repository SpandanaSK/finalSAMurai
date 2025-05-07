import torch
from PIL import Image
from transformers import AutoProcessor, AutoModelForZeroShotObjectDetection
from functools import lru_cache
import torchvision.ops as ops


class GroundingDinoPredictor:
    def __init__(self, model_id="IDEA-Research/grounding-dino-base"):
        self.processor = AutoProcessor.from_pretrained(model_id)
        self.device = torch.device("cuda" if torch.cuda.is_available() else "cpu")
        self.model = AutoModelForZeroShotObjectDetection.from_pretrained(model_id)
        self.model.to(self.device)

    @lru_cache(maxsize=128)
    def _predict(self, image_path, text_prompt):
        image = Image.open(image_path).convert("RGB")
        # Preprocess image and text
        inputs = self.processor(images=image, text=text_prompt, return_tensors="pt").to(self.device)
        # Forward pass
        with torch.no_grad():
            outputs = self.model(**inputs)

        return {
            'inputs': inputs,
            'outputs': outputs,
            'image': image
        }

    def predict(self, image_path, text_prompt, BOX_THRESHOLD, TEXT_THRESHOLD, NMS_THRESHOLD):
        results = self._predict(image_path, text_prompt)
        outputs = results['outputs']
        inputs = results['inputs']
        image = results['image']

         # Post-process predictions to get boxes and labels
        results = self.processor.post_process_grounded_object_detection(
            outputs,
            inputs.input_ids,
            box_threshold=BOX_THRESHOLD,
            text_threshold=TEXT_THRESHOLD,
            target_sizes=[image.size[::-1]]
        )[0]

        keep = ops.nms(results['boxes'], results['scores'], NMS_THRESHOLD)
        boxes = results['boxes'][keep]
        labels = results.get('labels', [text_prompt.replace('.', '')] * len(boxes))
        labels = [labels[i].strip() for i in keep.tolist()]
        return boxes, labels
