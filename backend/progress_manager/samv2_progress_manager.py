import json
import hashlib
from threading import Lock
import logging
from backend.imvid_rendering.utils import normalize_extra_params, make_progress_key

# Configure logger
logger = logging.getLogger(__name__)


class MultiImageProgressManager:
    def __init__(self):
        self._lock = Lock()
        self._tasks = {}  # key: local_dir -> task info

    def create_task(self, local_dir, file_name=None, extra_params=None):
        """Create a new task using local_dir as the key."""
        if not local_dir:
            logger.error("Cannot create task: local_dir is required")
            return None
            
        logger.debug(f"Creating task for local_dir: {local_dir}")
        
        with self._lock:
            # Create or update task
            if local_dir not in self._tasks:
                self._tasks[local_dir] = {
                    'status': {},
                    'progress': {},
                    'file_name': file_name,
                    'extra_params': extra_params,
                    'local_dir': local_dir
                }
            else:
                # Update existing task if new info provided
                if file_name is not None:
                    self._tasks[local_dir]['file_name'] = file_name
                if extra_params is not None:
                    self._tasks[local_dir]['extra_params'] = extra_params
                
        return local_dir

    def set_status(self, local_dir, status, progress=None):
        """Set status using local_dir as the key."""
        if not local_dir:
            logger.error("Cannot set status: local_dir is required")
            return
            
        logger.debug(f"Setting status for local_dir: {local_dir}, status: {status}")
        
        with self._lock:
            if local_dir not in self._tasks:
                logger.warning(f"No task found for local_dir: {local_dir}")
                return
                
            self._tasks[local_dir]["status"].update(status)
            if progress is not None:
                if "progress" not in self._tasks[local_dir]:
                    self._tasks[local_dir]["progress"] = {}
                self._tasks[local_dir]["progress"].update(progress)

    def get_task_info_by_filename(self, file_name, extra_params=None):
        """
        Find task info by file_name and optional extra_params.
        
        Args:
            file_name (str): The file name to search for
            extra_params (dict, optional): Extra parameters to match
            
        Returns:
            tuple: (local_dir, task_info) of the most recent matching task, or (None, None) if no match
        """
        with self._lock:
            matching_tasks = []
            for local_dir, task_info in self._tasks.items():
                if task_info.get('file_name') == file_name:
                    # If extra_params is provided, match that too
                    if extra_params and task_info.get('extra_params') == extra_params:
                        matching_tasks.append((local_dir, task_info))
                    elif not extra_params and not task_info.get('extra_params'):
                        matching_tasks.append((local_dir, task_info))
            
            # Return the most recent task if any found
            return matching_tasks[-1] if matching_tasks else (None, None)

    def get_task_info(self, local_dir):
        """Get task info by local_dir."""
        if not local_dir:
            logger.error("Cannot get task: local_dir is required")
            return None
            
        with self._lock:
            task_info = self._tasks.get(local_dir)
            logger.debug(f"Get task for local_dir: {local_dir}, found: {task_info is not None}")
            return task_info

# Create a global instance
multi_image_progress_manager = MultiImageProgressManager()