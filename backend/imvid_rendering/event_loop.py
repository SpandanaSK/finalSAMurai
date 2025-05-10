"""
Event Loop Manager Module

This module provides a singleton event loop for the entire application
to prevent conflicts between multiple event loops.
"""

import asyncio
import threading
import logging
import traceback

# Configure logging
logger = logging.getLogger(__name__)

class EventLoopManager:
    """
    Singleton manager for asyncio event loops.
    
    This class ensures that only one event loop is created and used
    throughout the application, preventing conflicts between multiple loops.
    """
    _instance = None
    _lock = threading.Lock()
    
    def __new__(cls):
        with cls._lock:
            if cls._instance is None:
                cls._instance = super(EventLoopManager, cls).__new__(cls)
                cls._instance._initialize()
            return cls._instance
    
    def _initialize(self):
        """Initialize the event loop manager."""
        self._event_loop = None
        self._loop_thread = None
        self._start_event_loop()
        
    def _start_event_loop(self):
        """Start the event loop in a separate thread."""
        try:
            # Create a new event loop
            self._event_loop = asyncio.new_event_loop()
            
            # Create and start the loop thread
            def run_loop():
                try:
                    asyncio.set_event_loop(self._event_loop)
                    logger.info("Starting event loop")
                    
                    # Add a dummy task to keep the loop alive
                    async def keep_alive():
                        while True:
                            await asyncio.sleep(1)
                    
                    self._event_loop.create_task(keep_alive())
                    self._event_loop.run_forever()
                except Exception as e:
                    logger.error(f"Error in event loop thread: {e}")
                    logger.error(traceback.format_exc())
            
            self._loop_thread = threading.Thread(target=run_loop, daemon=True)
            self._loop_thread.start()
            
            # Wait briefly to ensure the loop starts
            import time
            time.sleep(0.1)
            
            if not self._event_loop.is_running():
                logger.error("Failed to start event loop")
                raise RuntimeError("Event loop failed to start")
            else:
                logger.info("Event loop started successfully")
                
        except Exception as e:
            logger.error(f"Error starting event loop: {e}")
            logger.error(traceback.format_exc())
            raise
    
    def get_event_loop(self):
        """
        Get the singleton event loop.
        
        Returns:
            asyncio.AbstractEventLoop: The shared event loop instance
        """
        # Ensure we have a running event loop
        if self._event_loop is None or not self._event_loop.is_running():
            logger.warning("Event loop not running, attempting restart")
            self._start_event_loop()
            
        return self._event_loop
    
    def __del__(self):
        """Clean up the event loop on deletion."""
        try:
            if self._event_loop and self._event_loop.is_running():
                logger.info("Stopping event loop")
                self._event_loop.call_soon_threadsafe(self._event_loop.stop)
        except Exception as e:
            logger.error(f"Error stopping event loop: {e}")

# Create the singleton instance
_event_loop_manager = EventLoopManager()

def get_event_loop():
    """Get the shared event loop instance."""
    return _event_loop_manager.get_event_loop()

def patch_asyncio():
    """
    Patch the asyncio module to use our singleton event loop.
    
    This function replaces the asyncio.get_event_loop function with our own
    implementation to ensure a single event loop is used throughout the application.
    """
    original_get_event_loop = asyncio.get_event_loop
    
    # Store the original for reference
    asyncio._original_get_event_loop = original_get_event_loop
    
    # Replace with our function
    asyncio.get_event_loop = get_event_loop
    logger.info("Patched asyncio.get_event_loop with singleton implementation")

def restore_asyncio():
    """Restore the original asyncio.get_event_loop function."""
    if hasattr(asyncio, '_original_get_event_loop'):
        asyncio.get_event_loop = asyncio._original_get_event_loop
        logger.info("Restored original asyncio.get_event_loop")

# Apply the patch automatically when this module is imported
patch_asyncio() 