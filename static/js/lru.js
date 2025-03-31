
// Create an LRU cache for images with a limit of 40 frames
class DoublyLinkedListNode {
    constructor(key, value) {
      this.key = key;
      this.value = value;
      this.prev = null;
      this.next = null;
    }
  }
  
  class DoublyLinkedList {
    constructor() {
      this.head = null;
      // Move the accessed frame to the end to mark it as recently used
      // This step is necessary because the LRU (Least Recently Used) cache mechanism
      // evicts the least recently used items first. By moving the accessed frame to the end,
      // we ensure that it is marked as the most recently used, thus preventing it from being
      // evicted prematurely.
      this.tail = null;
    }
  
    addToHead(node) {
      if (!this.head) {
        this.head = this.tail = node;
      } else {
        node.next = this.head;
        this.head.prev = node;
        this.head = node;
      }
    }
  
    removeNode(node) {
      if (node.prev) {
        node.prev.next = node.next;
      } else {
        this.head = node.next;
      }
      if (node.next) {
        node.next.prev = node.prev;
      } else {
        this.tail = node.prev;
      }
    }
  
    moveToHead(node) {
      this.removeNode(node);
      this.addToHead(node);
    }
  
    removeTail() {
      if (!this.tail) return null; // Handle the case when the cache is empty
      const tail = this.tail;
      this.removeNode(tail);
      return tail;
    }
  }
  
  class LRUCache {
    constructor(limit) {
      this.cache = new Map();
      this.limit = limit;
      this.list = new DoublyLinkedList();
    }
  
    // Get an image from the cache
    get(key) {
      if (!this.cache.has(key)) return null;
  
      const node = this.cache.get(key);
      this.list.moveToHead(node);
      return node.value;
    }
  
    // Add an image to the cache
    set(key, value) {
      if (this.cache.has(key)) {
        const node = this.cache.get(key);
        node.value = value;
        this.list.moveToHead(node);
      } else {
        const newNode = new DoublyLinkedListNode(key, value);
        this.cache.set(key, newNode);
        this.list.addToHead(newNode);
  
        if (this.cache.size > this.limit) {
          const tail = this.list.removeTail();
          this.cache.delete(tail.key);
        }
      }
    }
  }
  
  