import json
import hashlib
import time
import os
import logging
from threading import Lock
from typing import Dict, Any, Optional, List, Callable, Set

# Configure logging
logger = logging.getLogger(__name__)

def make_progress_key(file_name: str, extra_params: dict) -> str:
    """
    Convert file_name + extra_params into a stable string
    that can serve as a unique dictionary key.
    
    Args:
        file_name: Path to the file
        extra_params: Additional parameters
        
    Returns:
        A stable hash string to use as a key
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
    """
    Manager for tracking progress of tasks across the application.
    
    This class provides thread-safe tracking of task progress and status,
    with support for persistence, event notifications, and lifecycle management.
    """
    def __init__(self, persistence_file: Optional[str] = None, cleanup_interval: int = 3600):
        """
        Initialize the progress manager.
        
        Args:
            persistence_file: Optional path to save/load progress state
            cleanup_interval: Seconds between automatic cleanup of completed tasks
        """
        self._lock = Lock()
        self._tasks: Dict[str, Dict[str, Any]] = {}  # key: a string from make_progress_key
        self._persistence_file = persistence_file
        self._cleanup_interval = cleanup_interval
        self._last_cleanup = time.time()
        self._event_callbacks: Dict[str, Set[Callable]] = {
            'task_created': set(),
            'task_updated': set(),
            'task_completed': set(),
            'task_failed': set()
        }
        
        # Load persisted state if available
        if persistence_file and os.path.exists(persistence_file):
            self._load_state()

    def _load_state(self) -> None:
        """Load progress state from persistence file."""
        try:
            with open(self._persistence_file, 'r') as f:
                data = json.load(f)
                with self._lock:
                    self._tasks = data
                logger.info(f"Loaded {len(self._tasks)} tasks from {self._persistence_file}")
        except Exception as e:
            logger.error(f"Error loading progress state: {e}")

    def _save_state(self) -> None:
        """Save progress state to persistence file."""
        if not self._persistence_file:
            return
            
        try:
            with self._lock:
                with open(self._persistence_file, 'w') as f:
                    json.dump(self._tasks, f)
        except Exception as e:
            logger.error(f"Error saving progress state: {e}")

    def _check_cleanup(self) -> None:
        """Check if cleanup is needed and perform it if necessary."""
        current_time = time.time()
        if current_time - self._last_cleanup > self._cleanup_interval:
            self.cleanup_tasks()
            self._last_cleanup = current_time

    def cleanup_tasks(self, max_age: int = 86400, include_completed: bool = True, 
                     include_failed: bool = True) -> int:
        """
        Remove old or completed tasks to prevent memory leaks.
        
        Args:
            max_age: Maximum age in seconds for tasks to keep
            include_completed: Whether to remove completed tasks
            include_failed: Whether to remove failed tasks
            
        Returns:
            Number of tasks removed
        """
        current_time = time.time()
        tasks_to_remove = []
        
        with self._lock:
            for task_id, task_info in self._tasks.items():
                # Check if task is too old
                if task_info.get('timestamp', 0) < current_time - max_age:
                    tasks_to_remove.append(task_id)
                    continue
                    
                # Check if task is completed
                if include_completed and all(p == 100 for p in task_info.get('progress', {}).values()):
                    tasks_to_remove.append(task_id)
                    continue
                    
                # Check if task has failed
                if include_failed and any(p == -1 for p in task_info.get('progress', {}).values()):
                    tasks_to_remove.append(task_id)
                    continue
            
            # Remove the identified tasks
            for task_id in tasks_to_remove:
                del self._tasks[task_id]
                
            # Save state if persistence is enabled
            if self._persistence_file and tasks_to_remove:
                self._save_state()
                
            return len(tasks_to_remove)

    def create_task(self, file_name: str, extra_params: Dict[str, Any]) -> str:
        """
        Create a new task for tracking progress.
        
        Args:
            file_name: Path to the file being processed
            extra_params: Additional parameters for the task
            
        Returns:
            Task ID for future reference
        """
        # Build the key
        task_key = make_progress_key(file_name, extra_params)
        
        with self._lock:
            if task_key not in self._tasks:
                self._tasks[task_key] = {
                    "status": {},
                    "progress": {},
                    "timestamp": time.time(),
                    "file_name": file_name,
                    "extra_params": extra_params
                }
                
                # Save state if persistence is enabled
                if self._persistence_file:
                    self._save_state()
                    
                # Trigger event callbacks
                self._trigger_event('task_created', task_key)
                
            # Check if cleanup is needed
            self._check_cleanup()
                
        return task_key

    def set_status(self, task_key: str, status: Dict[str, Any], progress: Optional[Dict[str, int]] = None) -> None:
        """
        Update the status and progress of a task.
        
        Args:
            task_key: Task identifier
            status: Dictionary of component status values
            progress: Dictionary of component progress percentages
        """
        with self._lock:
            if task_key in self._tasks:
                task_info = self._tasks[task_key]
                task_info["status"].update(status)
                
                if progress is not None:
                    old_progress = task_info["progress"].copy()
                    task_info["progress"].update(progress)
                    
                    # Check if task is completed or failed
                    if all(p == 100 for p in task_info["progress"].values()):
                        self._trigger_event('task_completed', task_key)
                    elif any(p == -1 for p in progress.values()):
                        self._trigger_event('task_failed', task_key)
                    else:
                        self._trigger_event('task_updated', task_key)
                
                # Update timestamp
                task_info["timestamp"] = time.time()
                
                # Save state if persistence is enabled
                if self._persistence_file:
                    self._save_state()

    def update_task(self, task_id: str, reader_type: str, status: Any, percent: int) -> None:
        """
        Update a specific component of a task.
        
        This is a convenience method for readers to update their specific component.
        
        Args:
            task_id: Task identifier
            reader_type: Type of reader (e.g., 'image', 'video', 'dicom')
            status: Status value for the component
            percent: Progress percentage (0-100, or -1 for error)
        """
        self.set_status(
            task_id,
            status={reader_type: status},
            progress={reader_type: percent}
        )

    def get_task_info_by_id(self, task_key: str) -> Optional[Dict[str, Any]]:
        """
        Get information about a task by its ID.
        
        Args:
            task_key: Task identifier
            
        Returns:
            Task information dictionary or None if not found
        """
        with self._lock:
            return self._tasks.get(task_key)
    
    def get_task_info_by_file(self, file_name: str, extra_params: Dict[str, Any]) -> Optional[Dict[str, Any]]:
        """
        Get information about a task by its file and parameters.
        
        Args:
            file_name: Path to the file
            extra_params: Additional parameters
            
        Returns:
            Task information dictionary or None if not found
        """
        with self._lock:
            task_key = make_progress_key(file_name, extra_params)
            return self._tasks.get(task_key)
    
    def get_all_tasks(self) -> Dict[str, Dict[str, Any]]:
        """
        Get all tasks currently being tracked.
        
        Returns:
            Dictionary of all tasks
        """
        with self._lock:
            return self._tasks.copy()
    
    def register_callback(self, event_type: str, callback: Callable) -> None:
        """
        Register a callback for task events.
        
        Args:
            event_type: Type of event ('task_created', 'task_updated', 'task_completed', 'task_failed')
            callback: Function to call when event occurs
        """
        if event_type not in self._event_callbacks:
            raise ValueError(f"Unknown event type: {event_type}")
            
        with self._lock:
            self._event_callbacks[event_type].add(callback)
    
    def unregister_callback(self, event_type: str, callback: Callable) -> None:
        """
        Unregister a callback for task events.
        
        Args:
            event_type: Type of event
            callback: Function to remove
        """
        if event_type not in self._event_callbacks:
            raise ValueError(f"Unknown event type: {event_type}")
            
        with self._lock:
            if callback in self._event_callbacks[event_type]:
                self._event_callbacks[event_type].remove(callback)
    
    def _trigger_event(self, event_type: str, task_id: str) -> None:
        """
        Trigger callbacks for an event.
        
        Args:
            event_type: Type of event
            task_id: Task identifier
        """
        if event_type not in self._event_callbacks:
            return
            
        task_info = self._tasks.get(task_id)
        if not task_info:
            return
            
        # Call callbacks without holding the lock
        callbacks = list(self._event_callbacks[event_type])
        for callback in callbacks:
            try:
                callback(task_id, task_info)
            except Exception as e:
                logger.error(f"Error in {event_type} callback: {e}")


# Global instance for easy access
global_progress_manager = ProgressManager()