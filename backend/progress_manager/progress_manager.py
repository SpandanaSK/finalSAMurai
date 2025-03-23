import json
import hashlib
from threading import Lock

def make_progress_key(file_name: str, extra_params: dict) -> str:
    """
    Convert file_name + extra_params into a stable string
    that can serve as a unique dictionary key.
    """
    # Sort extra_params by key so the representation is stable
    # Then create a JSON string of (file_name, extra_params).
    if type(extra_params) != dict:
        extra_params = {}
    payload = {
        "file_name": file_name,
        "extra_params": dict(sorted(extra_params.items()))
    }
    # Option A: Just return the JSON as the key if you're comfortable with the length:
    # return json.dumps(payload)

    # Option B: Return a hashed string (shorter) if you prefer:
    as_json = json.dumps(payload, sort_keys=True)
    return hashlib.md5(as_json.encode("utf-8")).hexdigest()


class ProgressManager:
    def __init__(self):
        self._lock = Lock()
        self._tasks = {}  # key: a string or tuple from make_progress_key

    def create_task(self, file_name, extra_params):
        # Build the key
        task_key = make_progress_key(file_name, extra_params)
        with self._lock:
            if task_key not in self._tasks:
                self._tasks[task_key] = {
                    "status": "starting",
                    "progress": 0
                }
        return task_key

    def set_status(self, task_key, status, progress=None):
        with self._lock:
            if task_key in self._tasks:
                self._tasks[task_key]["status"] = status
                if progress is not None:
                    self._tasks[task_key]["progress"] = progress

    def get_task_info_by_id(self, task_key):
        with self._lock:
            return self._tasks.get(task_key)
    
    def get_task_info_by_file(self, file_name, extra_params):
        with self._lock:
            task_key = make_progress_key(file_name, extra_params)
            return self._tasks.get(task_key)
        

global_progress_manager  = ProgressManager()