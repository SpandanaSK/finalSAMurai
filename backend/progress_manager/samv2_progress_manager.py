import json
import hashlib
from threading import Lock

class MultiImageProgressManager:
    def __init__(self):
        self._lock = Lock()
        self._tasks = {}  # key: a string or tuple from make_progress_key

    def create_task(self, file_name):
        # Build the key
        task_key = file_name
        with self._lock:
            if task_key not in self._tasks:
                self._tasks[task_key] = {'status': {}}
        return task_key

    def set_status(self, task_key, status, progress=None):
        with self._lock:
            if task_key in self._tasks:
                self._tasks[task_key]["status"].update(status)
                if progress is not None:
                    self._tasks[task_key]["progress"].update(progress)

    def get_task_info_by_id(self, task_key):
        with self._lock:
            return self._tasks.get(task_key)
    
    def get_task_info_by_file(self, file_name):
        with self._lock:
            task_key = file_name
            return self._tasks.get(task_key, {'status': {}})
        

multi_image_progress_manager  = MultiImageProgressManager()