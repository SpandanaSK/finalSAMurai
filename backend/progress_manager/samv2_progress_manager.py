import json
import hashlib
from threading import Lock
import logging
from backend.imvid_rendering.utils import normalize_extra_params

# Configure logger
logger = logging.getLogger(__name__)

def make_progress_key(file_name, extra_params=None):
    """
    Create a consistent hash key for tracking progress.
    
    Args:
        file_name: Path to the file
        extra_params: Additional parameters (optional)
        
    Returns:
        MD5 hash string to use as a unique key
    """
    normalized_params = normalize_extra_params(extra_params)
    
    # Create a payload with the file_name and normalized extra_params
    payload = {
        "file_name": file_name,
        "extra_params": normalized_params
    }
    
    # Convert to JSON and hash
    as_json = json.dumps(payload, sort_keys=True)
    return hashlib.md5(as_json.encode("utf-8")).hexdigest()

class MultiImageProgressManager:
    def __init__(self):
        self._lock = Lock()
        self._tasks = {}  # key: a string or tuple from make_progress_key

    def create_task(self, file_name, extra_params=None):
        # Build the key
        task_key = make_progress_key(file_name, extra_params)
        logger.debug(f"Creating task with key: {task_key} for file: {file_name}")
        
        with self._lock:
            if task_key not in self._tasks:
                self._tasks[task_key] = {
                    'status': {},
                    'progress': {},
                    'file_name': file_name,
                    'extra_params': extra_params
                }
        return task_key

    def set_status(self, file_name, status, progress=None, extra_params=None):
        task_key = make_progress_key(file_name, extra_params)
        logger.debug(f"Setting status for key: {task_key}, status: {status}")
        
        with self._lock:
            if task_key not in self._tasks:
                self.create_task(file_name, extra_params)
                
            self._tasks[task_key]["status"].update(status)
            if progress is not None:
                if "progress" not in self._tasks[task_key]:
                    self._tasks[task_key]["progress"] = {}
                self._tasks[task_key]["progress"].update(progress)

    def get_task_info_by_id(self, task_key):
        with self._lock:
            result = self._tasks.get(task_key)
            logger.debug(f"Get task by ID: {task_key}, found: {result is not None}")
            return result
    
    def get_task_info_by_file(self, file_name, extra_params=None):
        task_key = make_progress_key(file_name, extra_params)
        logger.debug(f"Get task by file: {file_name}, key: {task_key}")
        
        with self._lock:
            result = self._tasks.get(task_key, {'status': {}, 'progress': {}})
            logger.debug(f"Found task: {result != {'status': {}, 'progress': {}}}")
            return result

# Create a global instance
multi_image_progress_manager = MultiImageProgressManager()