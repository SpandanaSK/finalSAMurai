
class MultiImage {
  /**
   * @param {Array<string>} frame_paths - Array of frame file paths (e.g. generated from your video file).
   * @param {number} cacheSize - Maximum number of frames to cache (default is 50).
   */
  constructor(file_name, extra_params, cacheSize = 200) {
    this.file_name = file_name; // name of the video file
    this.frame_paths = frame_paths; // list of all frame paths
    this.extra_params = extra_params; // extra parameters for rendering
    this.current_frame = 0; // current frame index
    this.cached_images = new LRUCache(cacheSize); // LRU cache for rendered frames
  }

  /**
   * Renders all frames asynchronously using render_file API.
   * Each rendered frame's URL is stored in the LRU cache.
   * @returns {Promise<Array<{framePath: string, url: string}>>} - An array of objects with frame path and rendered URL.
   */
  async get_all_frame_images() {
    // Render all frames concurrently.
    const current_image = await set_current_image(this.file_name, this.extra_params);
    // Filter out any frames that failed to render.
    this.frame_paths = current_image.frame_paths;
  }

  /**
   * Renders a specific frame given its number.
   * First checks the cache; if not present, it calls render_file.
   * @param {number} frameNumber - The index of the frame to render.
   * @returns {Promise<string>} - A promise that resolves to the rendered frame URL.
   */
  async render_frame(frameNumber) {
    const framePath = this.frame_paths[frameNumber];
    // Check cache first.
    let cachedUrl = this.cached_images.get(framePath);
    if (cachedUrl) {
      return cachedUrl;
    }
    // Otherwise, render the frame and cache it.
    try {
      const url = await render_file(framePath);
      this.cached_images.set(framePath, url);
      return url;
    } catch (error) {
      console.error(`Error rendering frame ${frameNumber} (${framePath}):`, error);
      throw error;
    }
  }

  /**
   * Starts the asynchronous rendering process for all frames.
   * This is useful to initialize the cache with all frames.
   * @returns {Promise<Array<{framePath: string, url: string}>>} - The array of rendered frame objects.
   */
  async async_start_render() {
    return await this.get_all_frame_images();
  }

  /**
   * Preloads frames around the current frame.
   * Preloads a number of frames before and after the current frame for smoother navigation.
   * @param {number} currentFrame - The current frame index.
   * @param {number} numFrames - Total number of adjacent frames to preload (default is 5).
   * @returns {Promise<void>}
   */
  async preload_frames(currentFrame, prefetchCount = 10) {
    const totalFrames = this.frame_paths.length;
    // Compute half the window size.
    const halfWindow = Math.floor(prefetchCount / 2);
  
    // Determine if we need to update the prefetch window.
    // If no prefetch window exists or if the currentFrame is not well centered
    // inside the lastPrefetchRange, compute a new window.
    let newWindowStart, newWindowEnd;
    if (
      !this.lastPrefetchRange ||
      currentFrame < this.lastPrefetchRange.start + halfWindow ||
      currentFrame > this.lastPrefetchRange.end - halfWindow
    ) {
      // Center the window around currentFrame
      newWindowStart = Math.max(0, currentFrame - halfWindow);
      newWindowEnd = Math.min(totalFrames, newWindowStart + prefetchCount);
      // Adjust newWindowStart if we are near the end.
      if (newWindowEnd - newWindowStart < prefetchCount) {
        newWindowStart = Math.max(0, newWindowEnd - prefetchCount);
      }
      // Update the lastPrefetchRange.
      this.lastPrefetchRange = { start: newWindowStart, end: newWindowEnd };
    } else {
      // Current frame is within the safe bounds of the existing prefetch window.
      return;
    }
  
    // Preload each frame in the new window if not already cached.
    const preloadPromises = [];
    for (let i = newWindowStart; i < newWindowEnd; i++) {
      const framePath = this.frame_paths[i];
      if (!this.cached_images.has(framePath)) {
        preloadPromises.push(
          render_file(framePath)
            .then(url => {
              this.cached_images.set(framePath, url);
            })
            .catch(error => {
              console.error(`Error preloading frame ${i} (${framePath}):`, error);
            })
        );
      }
    }
    await Promise.all(preloadPromises);
  }
}

