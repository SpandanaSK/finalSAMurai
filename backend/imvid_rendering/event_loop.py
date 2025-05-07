"""
Event Loop Manager Module

This module provides a singleton event loop for the entire application
to prevent conflicts between multiple event loops.
"""

import asyncio
import threading
import logging

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
        # Try to get the existing event loop
        try:
            self._event_loop = asyncio.get_event_loop()
            logger.info("Using existing event loop")
        except RuntimeError:
            # No event loop exists in this thread, create a new one
            self._event_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._event_loop)
            logger.info("Created new event loop")
        
        # We don't start the event loop here, as it should be started and
        # managed by the application when needed
    
    def get_event_loop(self):
        """
        Get the singleton event loop.
        
        Returns:
            asyncio.AbstractEventLoop: The shared event loop instance
        """
        # Ensure we still have a valid event loop
        try:
            if self._event_loop.is_closed():
                logger.warning("Event loop was closed, creating a new one")
                self._event_loop = asyncio.new_event_loop()
                asyncio.set_event_loop(self._event_loop)
        except Exception as e:
            logger.error(f"Error checking event loop: {e}")
            # Try to create a new one
            self._event_loop = asyncio.new_event_loop()
            asyncio.set_event_loop(self._event_loop)
            
        return self._event_loop

# Create the singleton instance
_event_loop_manager = EventLoopManager()

def get_event_loop():
    """
    Get the application-wide event loop.
    
    This function replaces asyncio.get_event_loop() to ensure a single event loop
    is used throughout the application.
    
    Returns:
        asyncio.AbstractEventLoop: The shared event loop instance
    """
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