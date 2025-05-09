from collections import OrderedDict

class LRUCache:
    def __init__(self, max_size=20):
        """
        Initialize the LRUCache with a maximum size.
        
        Parameters:
        max_size (int): The maximum number of items the cache can hold.
        """
        self.max_size = max_size
        self.cache = OrderedDict()

    def get(self, filename):
        """
        Retrieve the value (pixel data) associated with the filename.
        If the filename is in the cache, move it to the end to mark it as recently used.
        """
        if filename not in self.cache:
            return None
        else:
            # Move the accessed item to the end to mark it as recently used
            self.cache.move_to_end(filename)
            return self.cache[filename]

    def put(self, filename, pixel_data):
        """
        Add or update the cache with the given filename and pixel data.
        If the cache exceeds the max size, remove the least recently used item.
        """
        if filename in self.cache:
            # Update the value and move it to the end if it's not already at the end
            if list(self.cache.keys())[-1] != filename:
                self.cache.move_to_end(filename)
        self.cache[filename] = pixel_data
        
        # If the cache exceeds the max size, remove the first item (the least recently used one)
        if len(self.cache) > self.max_size:
            self.cache.popitem(last=False)

    def remove(self, key):
        """
        Remove an item from the cache if it exists.
        
        Parameters:
        key: The key to remove from the cache.
        
        Returns:
        bool: True if the key was removed, False if it wasn't in the cache.
        """
        if key in self.cache:
            del self.cache[key]
            return True
        return False

    def __repr__(self):
        """
        String representation of the cache contents (for debugging).
        """
        return f"LRUCache({list(self.cache.keys())})"
