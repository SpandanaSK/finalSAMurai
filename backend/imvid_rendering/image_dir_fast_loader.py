import cv2
from collections import OrderedDict
import numpy as np
import torch
from tqdm import tqdm
import multiprocessing
from torch.utils.data import DataLoader, Dataset
import logging


logger = logging.getLogger(__name__)


class MultiImageLoader(Dataset):
    def __init__(self, files, sort=True, image_size=1024):
        self.files = files
        if sort:
            self.files = sorted(self.files)
        self.height, self.width = cv2.imread(self.files[0]).shape[:2]
        self.img_mean=(0.485, 0.456, 0.406)
        self.img_std=(0.229, 0.224, 0.225)
        self.img_mean = torch.tensor(self.img_mean, dtype=torch.float32)[:, None, None]
        self.img_std = torch.tensor(self.img_std, dtype=torch.float32)[:, None, None]
        self.image_size = image_size

    def __getitem__(self, index):
        image = cv2.imread(self.files[index])
        image = cv2.resize(image, (self.image_size, self.image_size))
        img_np = image / 255.0
        img = torch.from_numpy(img_np).permute(2, 0, 1)
        img -= self.img_mean
        img /= self.img_std
        return img
    
    def __len__(self):
        return len(self.files)
    
def collate_fn(inputs):
    return inputs
    

def read_images_fast(files, image_size=1024, batch_size=10, n_workers=multiprocessing.cpu_count()):
    multi_image_dataset = MultiImageLoader(files, sort=True, image_size=image_size) 
    multi_image_dataloader = DataLoader(multi_image_dataset, batch_size=batch_size, num_workers=n_workers)
    all_images = torch.zeros(len(multi_image_dataset), 3, image_size, image_size)
    count = 0
    for batch_images in tqdm(multi_image_dataloader):
        all_images[count: count+len(batch_images)] = batch_images
        count = count+len(batch_images)
    return all_images, multi_image_dataset.height, multi_image_dataset.width


def init_inference_state_for_dir(files, inference_state, image_size=1024):
    """
    Initialize the inference state for a directory containing video frames.
    
    Args:
        files: List of image files (already filtered for the desired frames by the caller)
        inference_state: Dictionary to store the inference state
        image_size: Size of images for processing
    """
    if len(files) == 0:
        raise ValueError("No image files found in directory")
        
    inference_state["files"] = files
    images, video_height, video_width = read_images_fast(files, image_size=image_size, batch_size=35)
    offload_video_to_cpu = False
    offload_state_to_cpu = False
    compute_device = torch.device('cuda')
    
    inference_state["images"] = images
    inference_state["num_frames"] = len(images)
    
    # whether to offload the video frames to CPU memory
    # turning on this option saves the GPU memory with only a very small overhead
    inference_state["offload_video_to_cpu"] = offload_video_to_cpu
    # whether to offload the inference state to CPU memory
    # turning on this option saves the GPU memory at the cost of a lower tracking fps
    # (e.g. in a test case of 768x768 model, fps dropped from 27 to 24 when tracking one object
    # and from 24 to 21 when tracking two objects)
    inference_state["offload_state_to_cpu"] = offload_state_to_cpu
    # the original video height and width, used for resizing final output scores
    inference_state["video_height"] = video_height
    inference_state["video_width"] = video_width
    inference_state["device"] = compute_device
    if offload_state_to_cpu:
        inference_state["storage_device"] = torch.device("cpu")
    else:
        inference_state["storage_device"] = compute_device
    # inputs on each frame
    inference_state["point_inputs_per_obj"] = {}
    inference_state["mask_inputs_per_obj"] = {}
    # visual features on a small number of recently visited frames for quick interactions
    inference_state["cached_features"] = {}
    # values that don't change across frames (so we only need to hold one copy of them)
    inference_state["constants"] = {}
    # mapping between client-side object id and model-side object index
    inference_state["obj_id_to_idx"] = OrderedDict()
    inference_state["obj_idx_to_id"] = OrderedDict()
    inference_state["obj_ids"] = []
    # Slice (view) of each object tracking results, sharing the same memory with "output_dict"
    inference_state["output_dict_per_obj"] = {}
    # A temporary storage to hold new outputs when user interact with a frame
    # to add clicks or mask (it's merged into "output_dict" before propagation starts)
    inference_state["temp_output_dict_per_obj"] = {}
    # Frames that already holds consolidated outputs from click or mask inputs
    # (we directly use their consolidated outputs during tracking)
    # metadata for each tracking frame (e.g. which direction it's tracked)
    inference_state["frames_tracked_per_obj"] = {}
    
    # Add total iterations for tracking progress
    inference_state["total_iterations"] = inference_state["num_frames"]
    
    logger.info(f"Initialized inference state with {len(files)} frames")



if __name__ == '__main__':
    from glob import glob
    import time
    from sam2.utils.misc import load_video_frames
    from threading import Thread

    t1 = time.time()
    inference_state1 = {}
    t = Thread(target=init_inference_state_for_dir, args=(glob('/tmp/images/175ad6ef044acb92a16818baead6f35d/*'), inference_state1, 1024))
    t.start()
    t.join()
    # images, height, width = read_images_fast(glob('/tmp/images/175ad6ef044acb92a16818baead6f35d/*'), batch_size=30)
    t2 = time.time()
    print(t2-t1)
    print(inference_state1['images'].shape)
    