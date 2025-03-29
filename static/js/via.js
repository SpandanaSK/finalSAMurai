

/*
  VGG Image Annotator (via)
  www.robots.ox.ac.uk/~vgg/software/via/

  Copyright (c) 2016-2019, Abhishek Dutta, Visual Geometry Group, Oxford University and VIA Contributors.
  All rights reserved.

  Redistribution and use in source and binary forms, with or without
  modification, are permitted provided that the following conditions are met:

  Redistributions of source code must retain the above copyright notice, this
  list of conditions and the following disclaimer.
  Redistributions in binary form must reproduce the above copyright notice,
  this list of conditions and the following disclaimer in the documentation
  and/or other materials provided with the distribution.
  THIS SOFTWARE IS PROVIDED BY THE COPYRIGHT HOLDERS AND CONTRIBUTORS "AS IS"
  AND ANY EXPRESS OR IMPLIED WARRANTIES, INCLUDING, BUT NOT LIMITED TO, THE
  IMPLIED WARRANTIES OF MERCHANTABILITY AND FITNESS FOR A PARTICULAR PURPOSE
  ARE DISCLAIMED. IN NO EVENT SHALL THE COPYRIGHT HOLDER OR CONTRIBUTORS BE
  LIABLE FOR ANY DIRECT, INDIRECT, INCIDENTAL, SPECIAL, EXEMPLARY, OR
  CONSEQUENTIAL DAMAGES (INCLUDING, BUT NOT LIMITED TO, PROCUREMENT OF
  SUBSTITUTE GOODS OR SERVICES; LOSS OF USE, DATA, OR PROFITS; OR BUSINESS
  INTERRUPTION) HOWEVER CAUSED AND ON ANY THEORY OF LIABILITY, WHETHER IN
  CONTRACT, STRICT LIABILITY, OR TORT (INCLUDING NEGLIGENCE OR OTHERWISE)
  ARISING IN ANY WAY OUT OF THE USE OF THIS SOFTWARE, EVEN IF ADVISED OF THE
  POSSIBILITY OF SUCH DAMAGE.
*/

/*
  Links:
  - https://gitlab.com/vgg/via/blob/master/Contributors.md : list of developers who have contributed code to the VIA project.
  - https://gitlab.com/vgg/via/blob/master/CodeDoc.md : source code documentation
  - https://gitlab.com/vgg/via/blob/master/CONTRIBUTING.md : guide for contributors

  This source code can be grouped into the following categories:
  - Data structure for annotations
  - Initialization routine
  - Handlers for top navigation bar
  - Local file uploaders
  - Data Importer
  - Data Exporter
  - Maintainers of user interface
  - Image click handlers
  - Canvas update routines
  - Region collision routines
  - Shortcut key handlers
  - Persistence of annotation data in browser cache (i.e. localStorage)
  - Handlers for attributes input panel (spreadsheet like user input panel)
*/

"use strict"; 

var AUTO_TRACK       = false;
var VIA_VERSION      = '2.0.12';
var VIA_NAME         = 'VGG Image Annotator';
var VIA_SHORT_NAME   = 'VIA';
var VIA_REGION_SHAPE = {
  RECT: 'rect',
  CIRCLE: 'circle',
  ELLIPSE: 'ellipse',
  POLYLINE: 'polyline',
  POLYGON: 'polygon',
  POINT: 'point',
  POSITIVE_POINT: 'positive_point', // New sub-variable for adding points
  NEGATIVE_POINT: 'negative_point', // New sub-variable for removing points
  BOX_PROMPT: 'box_prompt',
  MASK_PROMPT: 'mask_prompt',
  CONFIRM_POLYGON: 'confirm_polygon'
};

var VIA_ATTRIBUTE_TYPE = { TEXT:'text',
                           CHECKBOX:'checkbox',
                           RADIO:'radio',
                           IMAGE:'image',
                           DROPDOWN:'dropdown'
                         };

var VIA_DISPLAY_AREA_CONTENT_NAME = {IMAGE:'image_panel',
                                     IMAGE_GRID:'image_grid_panel',
                                     SETTINGS:'settings_panel',
                                     PAGE_404:'page_404',
                                     PAGE_GETTING_STARTED:'page_getting_started',
                                     PAGE_ABOUT:'page_about',
                                     PAGE_START_INFO:'page_start_info',
                                     PAGE_LICENSE:'page_license'
                                    };

var VIA_ANNOTATION_EDITOR_MODE    = {SINGLE_REGION:'single_region',
                                     ALL_REGIONS:'all_regions'};
var VIA_ANNOTATION_EDITOR_PLACEMENT = {NEAR_REGION:'NEAR_REGION',
                                       IMAGE_BOTTOM:'IMAGE_BOTTOM',
                                       DISABLE:'DISABLE'};

var VIA_REGION_EDGE_TOL           = 5;   // pixel
var VIA_REGION_CONTROL_POINT_SIZE = 2;
var VIA_POLYGON_VERTEX_MATCH_TOL  = 10;
var VIA_REGION_MIN_DIM            = 3;
var VIA_MOUSE_CLICK_TOL           = 2;
var VIA_ELLIPSE_EDGE_TOL          = 0.2; // euclidean distance
var VIA_THETA_TOL                 = Math.PI/18; // 10 degrees
var VIA_POLYGON_RESIZE_VERTEX_OFFSET  = 100;
var VIA_CANVAS_DEFAULT_ZOOM_LEVEL_INDEX = 3;
var VIA_CANVAS_ZOOM_LEVELS = [0.25, 0.5, 0.75, 1.0, 1.5, 2.0, 2.5, 3.0, 4, 5, 6, 7, 8, 9, 10];
var VIA_REGION_COLOR_LIST = ["#FF0000", "#00FF00", "#FF00FF","#FF6C00", "#FF7FDA", "#F0E442", "#00FFFF", "#C7D670", "#A1243E", "#0C4D95", "#4184E5", "#76DD12", "#E6FC04", "#2BE5ED", "#8B955B", "#56EF1D", "#C2693A", 
          "#48F51D", "#C3967D", "#291191", "#0A7186", "#026E41", "#14B0EB", "#2FF50C", "#A6169C", "#6FCF2F", "#EC1A55"];
// radius of control points in all shapes
var VIA_REGION_SHAPES_POINTS_RADIUS = 3;
// radius of control points in a point
var VIA_REGION_POINT_RADIUS         = 3;
var VIA_REGION_POINT_RADIUS_DEFAULT = 3;

var VIA_THEME_REGION_BOUNDARY_WIDTH = 3;
var VIA_THEME_BOUNDARY_LINE_COLOR   = "black";
var VIA_THEME_BOUNDARY_FILL_COLOR   = "red";
var VIA_THEME_SEL_REGION_FILL_COLOR = "#808080";
var VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR = "red";
var VIA_THEME_SEL_REGION_OPACITY    = 0.5;
var VIA_THEME_MESSAGE_TIMEOUT_MS    = 6000;
var VIA_THEME_CONTROL_POINT_COLOR   = '#ff0000';

var VIA_CSV_SEP        = ',';
var VIA_CSV_QUOTE_CHAR = '"';
var VIA_CSV_KEYVAL_SEP = ':';

var _via_img_metadata = {};   // data structure to store loaded images metadata
var _via_img_frame_metadata = {};   // data structure to store loaded image with frame metadata. intuition being, for a given image and frame get the values from here to _via_img_metadata and then redraw the canvas.
var _via_img_src      = {};   // image content {abs. path, url, base64 data, etc}
var _via_img_fileref  = {};   // reference to local images selected by using browser file selector
var _via_img_count    = 0;    // count of the loaded images
var _via_canvas_regions = []; // image regions spec. in canvas space
var _via_canvas_scale   = 1.0;// current scale of canvas image
var _via_filename2fileid = {}
var _via_fileid2filename = {}

var _via_image_id       = ''; // id={filename+length} of current image
var _via_image_index    = -1; // index

var _via_current_image_filename;
var _via_current_image;
var _via_current_image_width;
var _via_current_image_height;

// a record of image statistics (e.g. width, height)
var _via_img_stat     = {};
var _via_is_all_img_stat_read_ongoing = false;
var _via_img_stat_current_img_index = false;

// image canvas
var _via_display_area = document.getElementById('display_area');
var _via_img_panel    = document.getElementById('image_panel');
var _via_reg_canvas   = document.getElementById('region_canvas');
var _via_reg_ctx; // initialized in _via_init()
var _via_canvas_width, _via_canvas_height;

// canvas zoom
var _via_canvas_zoom_level_index   = VIA_CANVAS_DEFAULT_ZOOM_LEVEL_INDEX; // 1.0
var _via_canvas_scale_without_zoom = 1.0;

// state of the application
var _via_is_user_drawing_region  = false;
var _via_current_image_loaded    = false;
var _via_is_window_resized       = false;
var _via_is_user_resizing_region = false;
var _via_is_user_moving_region   = false;
var _via_is_user_drawing_polygon = false;
var _via_is_region_selected      = false;
var _via_is_all_region_selected  = false;
var _via_is_loaded_img_list_visible  = false;
var _via_is_attributes_panel_visible = false;
var _via_is_reg_attr_panel_visible   = false;
var _via_is_file_attr_panel_visible  = false;
var _via_is_canvas_zoomed            = false;
var _via_is_loading_current_image    = false;
var _via_is_region_id_visible        = true;
var _via_is_region_boundary_visible  = true;
var _via_is_region_info_visible      = false;
var _via_is_ctrl_pressed             = false;
var _via_is_debug_mode               = false;
var _via_is_message_visible          = true;

// region
var _via_current_shape             = VIA_REGION_SHAPE.RECT;
var _via_current_polygon_region_id = -1;
var _via_user_sel_region_id        = -1;
var _via_click_x0 = 0; var _via_click_y0 = 0;
var _via_click_x1 = 0; var _via_click_y1 = 0;
var _via_region_click_x, _via_region_click_y;
var _via_region_edge          = [-1, -1];
var _via_current_x = 0; var _via_current_y = 0;

// region copy/paste
var _via_region_selected_flag = []; // region select flag for current image
var _via_copied_image_regions = [];
var _via_paste_to_multiple_images_input;

// message
var _via_message_clear_timer;

// attributes
var _via_attribute_being_updated       = 'region'; // {region, file}
var _via_attributes                    = { 'region':{}, 'file':{} };
var _via_current_attribute_id          = '';

// region group color
var _via_canvas_regions_group_color = {}; // color of each region

// invoke a method after receiving user input
var _via_user_input_ok_handler     = null;
var _via_user_input_cancel_handler = null;
var _via_user_input_data           = {};

// annotation editor
var _via_annotaion_editor_panel     = document.getElementById('annotation_editor_panel');
var _via_metadata_being_updated     = 'region'; // {region, file}
var _via_annotation_editor_mode     = VIA_ANNOTATION_EDITOR_MODE.SINGLE_REGION;

// persistence to local storage
var _via_is_local_storage_available = false;
var _via_is_save_ongoing            = false;

// all the image_id and image_filename of images added by the user is
// stored in _via_image_id_list and _via_image_filename_list
//
// Image filename list (img_fn_list) contains a filtered list of images
// currently accessible by the user. The img_fn_list is visible in the
// left side toolbar. image_grid, next/prev, etc operations depend on
// the contents of _via_img_fn_list_img_index_list.
var _via_image_id_list                 = []; // array of all image id (in order they were added by user)
var _via_image_filename_list           = []; // array of all image filename
var _via_uploaded_file_id_list         = new Set(); // array of all file id (in order they were added by user)
var _via_image_load_error              = []; // {true, false}
var _via_image_filepath_resolved       = []; // {true, false}
var _via_image_filepath_id_list        = []; // path for each file

var _via_reload_img_fn_list_table      = true;
var _via_img_fn_list_img_index_list    = []; // image index list of images show in img_fn_list
var _via_img_fn_list_html              = []; // html representation of image filename list

// image grid
var image_grid_panel                        = document.getElementById('image_grid_panel');
var _via_display_area_content_name          = ''; // describes what is currently shown in display area
var _via_display_area_content_name_prev     = '';
var _via_image_grid_requires_update         = false;
var _via_image_grid_content_overflow        = false;
var _via_image_grid_load_ongoing            = false;
var _via_image_grid_page_first_index        = 0; // array index in _via_img_fn_list_img_index_list[]
var _via_image_grid_page_last_index         = -1;
var _via_image_grid_selected_img_index_list = [];
var _via_image_grid_page_img_index_list     = []; // list of all image index in current page of image grid
var _via_image_grid_visible_img_index_list  = []; // list of images currently visible in grid
var _via_image_grid_mousedown_img_index     = -1;
var _via_image_grid_mouseup_img_index       = -1;
var _via_image_grid_img_index_list          = []; // list of all image index in the image grid
var _via_image_grid_region_index_list       = []; // list of all image index in the image grid
var _via_image_grid_group                   = {}; // {'value':[image_index_list]}
var _via_image_grid_group_var               = []; // {type, name, value}
var _via_image_grid_group_show_all          = false;
var _via_image_grid_stack_prev_page         = []; // stack of first img index of every page navigated so far

// image buffer
var VIA_IMG_PRELOAD_INDICES         = [-2, -1, 1, 2, 3, 4]; // for any image, preload previous 2 and next 4 images
var VIA_IMG_PRELOAD_COUNT           = 6;
var _via_buffer_preload_img_index   = -1;
var _via_buffer_img_index_list      = [];
var _via_buffer_img_shown_timestamp = [];
var _via_preload_img_promise_list   = [];

// via settings
var _via_settings = {};
_via_settings.ui  = {};
_via_settings.ui.annotation_editor_height   = 25; // in percent of the height of browser window
_via_settings.ui.annotation_editor_fontsize = 0.8;// in rem
_via_settings.ui.leftsidebar_width          = 18;  // in rem

_via_settings.ui.image_grid = {};
_via_settings.ui.image_grid.img_height          = 80;  // in pixel
_via_settings.ui.image_grid.rshape_fill         = 'none';
_via_settings.ui.image_grid.rshape_fill_opacity = 0.3;
_via_settings.ui.image_grid.rshape_stroke       = 'yellow';
_via_settings.ui.image_grid.rshape_stroke_width = 2;
_via_settings.ui.image_grid.show_region_shape   = true;
_via_settings.ui.image_grid.show_image_policy   = 'all';

_via_settings.ui.image = {};
_via_settings.ui.image.region_label      = '__via_region_id__'; // default: region_id
_via_settings.ui.image.region_color      = '__via_default_region_color__'; // default color: yellow
_via_settings.ui.image.region_label_font = '10px Sans';
_via_settings.ui.image.on_image_annotation_editor_placement = VIA_ANNOTATION_EDITOR_PLACEMENT.NEAR_REGION;

_via_settings.core                  = {};
_via_settings.core.buffer_size      = 4*VIA_IMG_PRELOAD_COUNT + 2;
_via_settings.core.filepath         = {};
_via_settings.core.default_filepath = '';

var sam_v2_out_dir = null;

// UI html elements
var invisible_file_input = document.getElementById("invisible_file_input");
var display_area    = document.getElementById("display_area");
var ui_top_panel    = document.getElementById("ui_top_panel");
var image_panel     = document.getElementById("image_panel");
var img_buffer_now  = document.getElementById("img_buffer_now");

var annotation_list_snippet = document.getElementById("annotation_list_snippet");
var annotation_textarea     = document.getElementById("annotation_textarea");

var img_fn_list_panel     = document.getElementById('img_fn_list_panel');
var img_fn_list           = document.getElementById('img_fn_list');
var attributes_panel      = document.getElementById('attributes_panel');
var leftsidebar           = document.getElementById('leftsidebar');

var BBOX_LINE_WIDTH       = 4;
var BBOX_SELECTED_OPACITY = 0.3;
var BBOX_BOUNDARY_FILL_COLOR_ANNOTATED = "#f2f2f2";
var BBOX_BOUNDARY_FILL_COLOR_NEW       = "#aaeeff";
var BBOX_BOUNDARY_LINE_COLOR           = "#1a1a1a";
var BBOX_SELECTED_FILL_COLOR           = "#ffffff";

var VIA_ANNOTATION_EDITOR_HEIGHT_CHANGE   = 5;   // in percent
var VIA_ANNOTATION_EDITOR_FONTSIZE_CHANGE = 0.1; // in rem
var VIA_IMAGE_GRID_IMG_HEIGHT_CHANGE      = 20;  // in percent
var VIA_LEFTSIDEBAR_WIDTH_CHANGE          = 1;   // in rem
var VIA_POLYGON_SEGMENT_SUBTENDED_ANGLE   = 5;   // in degree (used to approximate shapes using polygon)
var VIA_FLOAT_PRECISION = 3; // number of decimal places to include in float values

// COCO Export
var VIA_COCO_EXPORT_RSHAPE = ['rect', 'circle', 'ellipse', 'polygon', 'point'];
var VIA_COCO_EXPORT_ATTRIBUTE_TYPE = [VIA_ATTRIBUTE_TYPE.DROPDOWN,
                                      VIA_ATTRIBUTE_TYPE.RADIO];


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


var precached_bimg = new LRUCache(200);
var limit = parseInt(precached_bimg.limit);
var m_current_image = null;


//
// Data structure to store metadata about file and regions
//
function file_metadata(filename, size) {
  this.filename = filename;
  this.size     = size;         // file size in bytes
  this.regions  = [];           // array of file_region()
  this.file_attributes = {};    // image attributes
}

function file_region() {
  this.shape_attributes  = {}; // region shape attributes
  this.region_attributes = {}; // region attributes
  this.frame = '0';
}

function file_info(file_name, extra_params, unique_id, frame_paths, last_viewed_frame) {
  this.file_name=file_name;
  this.extra_params=extra_params;
  this.unique_id=unique_id;
  this.frame_paths=frame_paths;
  this.last_viewed_frame = last_viewed_frame;
}

function displaySaveWarning(event) {
  event.preventDefault();
  event.returnValue = 'Good Bye'; // Required for most browsers to display the default dialog

  // Show the custom dialog
  // document.getElementById('overlay').style.display = 'block';
  document.getElementById('myConfirmDialog').style.display = 'block';

  // Prevent the default behavior
  return 'Good Bye';
}
      
function confirmReload(choice) {
  if (choice === 'yes') {
    window.location.reload();
  } else {
    document.getElementById('overlay').style.display = 'none';
    document.getElementById('myConfirmDialog').style.display = 'none';
  }
}


//
// Initialization routine
//
function _via_init() {
  console.log(VIA_NAME);
  show_message(VIA_NAME + ' (' + VIA_SHORT_NAME + ') version ' + VIA_VERSION +
               '. Ready !', 2*VIA_THEME_MESSAGE_TIMEOUT_MS);

  if ( _via_is_debug_mode ) {
    document.getElementById('ui_top_panel').innerHTML += '<span>DEBUG MODE</span>';
  }

  document.getElementById('img_fn_list').style.display = 'block';
  document.getElementById('leftsidebar').style.display = 'table-cell';

  // initialize default project
  project_init_default_project();

  // initialize region canvas 2D context
  _via_init_reg_canvas_context();

  // initialize user input handlers (for both window and via_reg_canvas)
  // handles drawing of regions by user over the image
  _via_init_keyboard_handlers();
  _via_init_mouse_handlers();

  // initialize image grid
  image_grid_init();

  show_single_image_view();
  init_leftsidebar_accordion();
  attribute_update_panel_set_active_button();
  annotation_editor_set_active_button();
  init_message_panel();

  // run attached sub-modules (if any)
  // e.g. demo modules
  if (typeof _via_load_submodules === 'function') {
    console.log('Loading VIA submodule');
    setTimeout( async function() {
      await _via_load_submodules();
    }, 100);
  }

}

function _via_init_reg_canvas_context() {
  _via_reg_ctx  = _via_reg_canvas.getContext('2d');
}

function _via_init_keyboard_handlers() {
  window.addEventListener('keydown', _via_window_keydown_handler, false);
  _via_reg_canvas.addEventListener('keydown', _via_reg_canvas_keydown_handler, false);
  _via_reg_canvas.addEventListener('keyup', _via_reg_canvas_keyup_handler, false);
}

// handles drawing of regions over image by the user
function _via_init_mouse_handlers() {
  _via_reg_canvas.addEventListener('dblclick', _via_reg_canvas_dblclick_handler, false);
  _via_reg_canvas.addEventListener('mousedown', _via_reg_canvas_mousedown_handler, false);
  _via_reg_canvas.addEventListener('mouseup', _via_reg_canvas_mouseup_handler, false);
  _via_reg_canvas.addEventListener('mouseover', _via_reg_canvas_mouseover_handler, false);
  _via_reg_canvas.addEventListener('mousemove', _via_reg_canvas_mousemove_handler, false);
  _via_reg_canvas.addEventListener('wheel', _via_reg_canvas_mouse_wheel_listener, false);
  _via_reg_canvas.addEventListener('contextmenu',  _via_reg_canvas_contextmenu_handler, false);
  // touch screen event handlers
  // @todo: adapt for mobile users
  _via_reg_canvas.addEventListener('touchstart', _via_reg_canvas_mousedown_handler, false);
  _via_reg_canvas.addEventListener('touchend', _via_reg_canvas_mouseup_handler, false);
  _via_reg_canvas.addEventListener('touchmove', _via_reg_canvas_mousemove_handler, false);
}

//
// Download image with annotations
//

function download_as_image() {
  if ( _via_display_area_content_name !== VIA_DISPLAY_AREA_CONTENT_NAME['IMAGE'] ) {
    show_message('This functionality is only available in single image view mode');
    return;
  } else {
    var c = document.createElement('canvas');

    // ensures that downloaded image is scaled at current zoom level
    c.width  = _via_reg_canvas.width;
    c.height = _via_reg_canvas.height;

    var ct = c.getContext('2d');
    // draw current image
    ct.drawImage(_via_current_image, 0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    // draw current regions
    ct.drawImage(_via_reg_canvas, 0, 0);

    var cur_img_mime = 'image/jpeg';
    if ( _via_current_image.src.startsWith('data:') )  {
      var c1 = _via_current_image.src.indexOf(':', 0);
      var c2 = _via_current_image.src.indexOf(';', c1);
      cur_img_mime = _via_current_image.src.substring(c1 + 1, c2);
    }

    // extract image data from canvas
    var saved_img = c.toDataURL(cur_img_mime);
    saved_img.replace(cur_img_mime, "image/octet-stream");

    // simulate user click to trigger download of image
    var a      = document.createElement('a');
    a.href     = saved_img;
    a.target   = '_blank';
    a.download = _via_current_image_filename;

    // simulate a mouse click event
    var event = new MouseEvent('click', {
      view: window,
      bubbles: true,
      cancelable: true
    });

    a.dispatchEvent(event);
  }
}

//
// Display area content
//
function clear_display_area() {
  var panels = document.getElementsByClassName('display_area_content');
  var i;
  for ( i = 0; i < panels.length; ++i ) {
    panels[i].classList.add('display_none');
  }
}

function is_content_name_valid(content_name) {
  var e;
  for ( e in VIA_DISPLAY_AREA_CONTENT_NAME ) {
    if ( VIA_DISPLAY_AREA_CONTENT_NAME[e] === content_name ) {
      return true;
    }
  }
  return false;
}

function show_home_panel() {
  show_single_image_view();
}

function set_display_area_content(content_name) {
  if ( is_content_name_valid(content_name) ) {
    _via_display_area_content_name_prev = _via_display_area_content_name;
    clear_display_area();
    var p = document.getElementById(content_name);
    p.classList.remove('display_none');
    _via_display_area_content_name = content_name;
  }
}

function show_single_image_view() {
  if (_via_current_image_loaded) {
    img_fn_list_clear_all_style();
    _via_show_img(_via_image_index);
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE);
    annotation_editor_update_content();

    var p = document.getElementById('toolbar_image_grid_toggle');
    p.firstChild.setAttribute('xlink:href', '#icon_gridon');
    p.childNodes[1].innerHTML = 'Switch to Image Grid View';
  } else {
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.PAGE_START_INFO);
  }
}

function show_image_grid_view() {
  if (_via_current_image_loaded) {
    img_fn_list_clear_all_style();
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID);
    image_grid_toolbar_update_group_by_select();

    if ( _via_image_grid_group_var.length === 0 ) {
      image_grid_show_all_project_images();
    }
    annotation_editor_update_content();

    var p = document.getElementById('toolbar_image_grid_toggle');
    p.firstChild.setAttribute('xlink:href', '#icon_gridoff');
    p.childNodes[1].innerHTML = 'Switch to Single Image View';

    //edit_file_metadata_in_annotation_editor();
  } else {
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.PAGE_START_INFO);
  }
}




//
// Handlers for top navigation bar
//
function sel_local_images() {
  // source: https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications
  if (invisible_file_input) {
    invisible_file_input.setAttribute('multiple', 'multiple');
    invisible_file_input.accept   = '.jpg,.jpeg,.png,.bmp';
    invisible_file_input.onchange = project_file_add_local;
    invisible_file_input.click();
  }
}

async function upload_images(event) {
  // source: https://developer.mozilla.org/en-US/docs/Using_files_from_web_applications
  var SUPPORTED_FORMATS = await fetch('/im-vid-rendering/get_supported_extensions', {
    method: 'GET'
  });   
  SUPPORTED_FORMATS = await SUPPORTED_FORMATS.json();
  SUPPORTED_FORMATS = SUPPORTED_FORMATS["extensions"];
  if (invisible_file_input) {
    invisible_file_input.setAttribute('multiple', 'multiple');
    invisible_file_input.accept   = SUPPORTED_FORMATS;
    invisible_file_input.onchange = callUploadAPI;
    invisible_file_input.click();
  }
}

// invoked by menu-item buttons in HTML UI
function download_all_region_data(type, file_extension) {
  if ( typeof(file_extension) === 'undefined' ) {
    file_extension = type;
  }
  // Javascript strings (DOMString) is automatically converted to utf-8
  // see: https://developer.mozilla.org/en-US/docs/Web/API/Blob/Blob
  pack_via_metadata(type).then( function(data) {
    var blob_attr = {type: 'text/'+file_extension+';charset=utf-8'};
    var all_region_data_blob = new Blob(data, blob_attr);

    var filename = 'via_export';
    if(typeof(_via_settings) !== 'undefined' &&
       _via_settings.hasOwnProperty('project') &&
       _via_settings['project']['name'] !== '') {
      filename = _via_settings['project']['name'];
    }
    if ( file_extension !== 'csv' || file_extension !== 'json' ) {
      filename += '_' + type + '.' + file_extension;
    }
    save_data_to_local_file(all_region_data_blob, filename);
  }.bind(this), function(err) {
    show_message('Failed to download data: [' + err + ']');
  }.bind(this));
}

function sel_local_data_file(type) {
  if (invisible_file_input) {
    switch(type) {
    case 'annotations':
      invisible_file_input.accept='.csv,.json';
      invisible_file_input.onchange = import_annotations_from_file;
      break;

    case 'annotations_coco':
      invisible_file_input.accept='.json';
      invisible_file_input.onchange = load_coco_annotations_json_file;
      break;

    case 'files_url':
      invisible_file_input.accept='';
      invisible_file_input.onchange = import_files_url_from_file;
      break;

    case 'attributes':
      invisible_file_input.accept='json';
      invisible_file_input.onchange = project_import_attributes_from_file;
      break;

    default:
      console.log('sel_local_data_file() : unknown type ' + type);
      return;
    }
    invisible_file_input.removeAttribute('multiple');
    invisible_file_input.click();
  }
}

//
// Data Importer
//
function import_files_url_from_file(event) {
  var selected_files = event.target.files;
  var i, file;
  for ( i = 0; i < selected_files.length; ++i ) {
    file = selected_files[i];
    load_text_file(file, import_files_url_from_csv);
  }
}

function import_annotations_from_file(event) {
  var selected_files = event.target.files;
  var i, file;
  for ( i = 0; i < selected_files.length; ++i ) {
    file = selected_files[i];
    switch ( file.type ) {
    case '': // Fall-through // Windows 10: Firefox and Chrome do not report filetype
      show_message('File type for ' + file.name + ' cannot be determined! Assuming text/plain.');
    case 'text/plain': // Fall-through
    case 'application/vnd.ms-excel': // Fall-through // @todo: filetype of VIA csv annotations in Windows 10 , fix this (reported by @Eli Walker)
    case 'text/csv':
      load_text_file(file, import_annotations_from_csv);
      break;

    case 'text/json': // Fall-through
    case 'application/json':
      load_text_file(file, import_annotations_from_json);
      break;

    default:
      show_message('Annotations cannot be imported from file of type ' + file.type);
      break;
    }
  }
}

function load_coco_annotations_json_file(event) {
  load_text_file(event.target.files[0], import_coco_annotations_from_json);
}

function import_annotations_from_csv(data) {
  return new Promise( function(ok_callback, err_callback) {
    if ( data === '' || typeof(data) === 'undefined') {
      err_callback();
    }

    var region_import_count = 0;
    var malformed_csv_lines_count = 0;
    var file_added_count = 0;

    var line_split_regex = new RegExp('\n|\r|\r\n', 'g');
    var csvdata = data.split(line_split_regex);

    var parsed_header = parse_csv_header_line(csvdata[0]);
    if ( ! parsed_header.is_header ) {
      show_message('Header line missing in the CSV file');
      err_callback();
      return;
    }

    var n = csvdata.length;
    var i;
    var first_img_id = '';
    for ( i = 1; i < n; ++i ) {
      // ignore blank lines
      if (csvdata[i].charAt(0) === '\n' || csvdata[i].charAt(0) === '') {
        continue;
      }

      var d = parse_csv_line(csvdata[i]);

      // check if csv line was malformed
      if ( d.length !== parsed_header.csv_column_count ) {
        malformed_csv_lines_count += 1;
        continue;
      }

      var filename = d[parsed_header.filename_index];
      var size     = d[parsed_header.size_index];
      var img_id   = _via_get_image_id(filename, size);

      // check if file is already present in this project
      if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
        img_id = project_add_new_file(filename, size);
        if ( _via_settings.core.default_filepath === '' ) {
          _via_img_src[img_id] = filename;
        } else {
          _via_file_resolve_file_to_default_filepath(img_id);
        }
        file_added_count += 1;

        if ( first_img_id === '' ) {
          first_img_id = img_id;
        }
      }

      // copy file attributes
      if ( d[parsed_header.file_attr_index] !== '"{}"') {
        var fattr = d[parsed_header.file_attr_index];
        fattr     = remove_prefix_suffix_quotes( fattr );
        fattr     = unescape_from_csv( fattr );

        var m = json_str_to_map( fattr );
        for( var key in m ) {
          _via_img_metadata[img_id].file_attributes[key] = m[key];

          // add this file attribute to _via_attributes
          if ( ! _via_attributes['file'].hasOwnProperty(key) ) {
            _via_attributes['file'][key] = { 'type':'text' };
          }
        }
      }

      var region_i = new file_region();
      if (pars)
      // copy regions shape attributes
      if ( d[parsed_header.region_shape_attr_index] !== '"{}"' ) {
        var sattr = d[parsed_header.region_shape_attr_index];
        sattr     = remove_prefix_suffix_quotes( sattr );
        sattr     = unescape_from_csv( sattr );

        var m = json_str_to_map( sattr );
        for ( var key in m ) {
          region_i.shape_attributes[key] = m[key];
        }
      }

      if ('frame_index' in parsed_header) {
        region_i.frame = d[parsed_header.frame_index]
      }

      // copy region attributes
      if ( d[parsed_header.region_attr_index] !== '"{}"' ) {
        var rattr = d[parsed_header.region_attr_index];
        rattr     = remove_prefix_suffix_quotes( rattr );
        rattr     = unescape_from_csv( rattr );

        var m = json_str_to_map( rattr );
        for ( var key in m ) {
          region_i.region_attributes[key] = m[key];

          // add this region attribute to _via_attributes
          if ( ! _via_attributes['region'].hasOwnProperty(key) ) {
            _via_attributes['region'][key] = { 'type':'text' };
          }
        }
      }

      // add regions only if they are present
      if (Object.keys(region_i.shape_attributes).length > 0 ||
          Object.keys(region_i.region_attributes).length > 0 ) {
        _via_img_metadata[img_id].regions.push(region_i);
        region_import_count += 1;
      }
    }
    show_message('Import Summary : [' + file_added_count + '] new files, ' +
                 '[' + region_import_count + '] regions, ' +
                 '[' + malformed_csv_lines_count  + '] malformed csv lines.');

    if ( file_added_count ) {
      update_img_fn_list();
    }

    if ( _via_current_image_loaded ) {
      if ( region_import_count ) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if ( file_added_count ) {
        var first_img_index = _via_image_id_list.indexOf(first_img_id);
        _via_show_img( first_img_index );
      }
    }
    ok_callback([file_added_count, region_import_count, malformed_csv_lines_count]);
  });
}

function parse_csv_header_line(line) {
  var header_via_10x = '#filename,file_size,file_attributes,region_count,region_id,region_shape_attributes,region_attributes'; // VIA versions 1.0.x
  var header_via_11x = 'filename,file_size,file_attributes,region_count,region_id,region_shape_attributes,region_attributes'; // VIA version 1.1.x
  var header_via_12x = 'filename,file_size,file_attributes,region_count,region_id,frame,region_shape_attributes,region_attributes';
  if ( line === header_via_10x || line === header_via_11x ) {
    return { 'is_header':true,
             'filename_index': 0,
             'size_index': 1,
             'file_attr_index': 2,
             'region_shape_attr_index': 5,
             'region_attr_index': 6,
             'csv_column_count': 7
           }
  }
  else if ( line === header_via_12x ) {
    return { 'is_header':true,
             'filename_index': 0,
             'size_index': 1,
             'file_attr_index': 2,
             'frame_index': 5,
             'region_shape_attr_index': 6,
             'region_attr_index': 7,
             'csv_column_count': 8
           }
  } 
  else {
    return { 'is_header':false };
  }
}

// see http://cocodataset.org/#format-data
function import_coco_annotations_from_json(data_str) {
  return new Promise( function(ok_callback, err_callback) {
    if (data_str === '' || typeof(data_str) === 'undefined') {
      show_message('Empty file');
      return;
    }
    var coco = JSON.parse(data_str);
    if( !coco.hasOwnProperty('info') ||
        !coco.hasOwnProperty('categories') ||
        !coco.hasOwnProperty('annotations') ||
        !coco.hasOwnProperty('images') ) {
      show_message('File does not contain valid annotations in COCO format.');
      return;
    }

    // create _via_attributes from coco['categories']
    var category_id_to_attribute_name = {};
    for( var i in coco['categories'] ) {
      var sc    = coco['categories'][i]['supercategory'];
      var cid   = coco['categories'][i]['id'];
      var cname = coco['categories'][i]['name'];
      if( !_via_attributes['region'].hasOwnProperty(sc)) {
        _via_attributes['region'][sc] = {'type':VIA_ATTRIBUTE_TYPE.RADIO,
                                         'description':'coco["categories"][' + i + ']=' + JSON.stringify(coco['categories'][i]),
                                         'options':{},
                                         'default_options':{}
                                        };
      }
      _via_attributes['region'][sc]['options'][cid] = cname;
      category_id_to_attribute_name[cid] = sc;
    }
    // if more than 5 options, convert the attribute type to DROPDOWN
    for( var attr_name in _via_attributes['region'] ) {
      if( Object.keys(_via_attributes['region'][attr_name]['options']).length > 5 ) {
        _via_attributes['region'][attr_name]['type'] = VIA_ATTRIBUTE_TYPE.DROPDOWN;
      }
    }

    // create an map of image_id and their annotations
    var image_id_to_annotation_index = {};
    for ( var annotation_index in coco['annotations'] ) {
      var coco_image_id = coco.annotations[annotation_index]['image_id'];
      if ( !image_id_to_annotation_index.hasOwnProperty(coco_image_id) ) {
        image_id_to_annotation_index[coco_image_id] = [];
      }
      image_id_to_annotation_index[coco_image_id].push( annotation_index );
    }

    // add all files and annotations
    _via_img_metadata = {};
    _via_image_id_list = [];
    _via_image_filename_list = [];
    _via_img_count = 0;
    var imported_file_count = 0;
    var imported_region_count = 0;
    for ( var coco_img_index in coco['images'] ) {
      var coco_img_id = coco['images'][coco_img_index]['id'];
      var filename;
      if ( coco.images[coco_img_index].hasOwnProperty('coco_url') &&
           coco.images[coco_img_index]['coco_url'] !== "") {
        filename = coco.images[coco_img_index]['coco_url'];
      } else {
        filename = coco.images[coco_img_index]['file_name'];
      }
      _via_img_metadata[coco_img_id] = { 'filename':filename,
                                         'size'    :-1,
                                         'regions' :[],
                                         'file_attributes': {
                                           'width' :coco.images[coco_img_index]['width'],
                                           'height':coco.images[coco_img_index]['height']
                                         },
                                       };
      _via_image_id_list.push(coco_img_id);
      _via_image_filename_list.push(filename);
      _via_img_count = _via_img_count + 1;

      // add all annotations associated with this file
      if ( image_id_to_annotation_index.hasOwnProperty(coco_img_id) ) {
        for ( var i in image_id_to_annotation_index[coco_img_id] ) {
          var annotation_i = coco['annotations'][ image_id_to_annotation_index[coco_img_id][i] ];
          var bbox_from_polygon = polygon_to_bbox(annotation_i['segmentation'][0]);

          // ensure rectangles get imported as rectangle (and not as polygon)
          var is_rectangle = true;
          for (var j = 0; j < annotation_i['bbox'].length; ++j) {
            if (annotation_i['bbox'][j] !== bbox_from_polygon[j]) {
              is_rectangle = false;
              break;
            }
          }

          var region_i = { 'shape_attributes': {}, 'region_attributes': {} };
          var attribute_name = category_id_to_attribute_name[ annotation_i['category_id'] ];
          var attribute_value = annotation_i['category_id'].toString();
          region_i['region_attributes'][attribute_name] = attribute_value;

          if ( annotation_i['segmentation'][0].length === 8 && is_rectangle ) {
            region_i['shape_attributes'] = { 'name':'rect',
                                             'x': annotation_i['bbox'][0],
                                             'y': annotation_i['bbox'][1],
                                             'width': annotation_i['bbox'][2],
                                             'height': annotation_i['bbox'][3]};
          } else {
            region_i['shape_attributes'] = { 'name':'polygon',
                                             'all_points_x':[],
                                             'all_points_y':[]};
            for ( var j = 0; j < annotation_i['segmentation'][0].length; j = j + 2 ) {
              region_i['shape_attributes']['all_points_x'].push( annotation_i['segmentation'][0][j] );
              region_i['shape_attributes']['all_points_y'].push( annotation_i['segmentation'][0][j+1] );
            }
          }
          _via_img_metadata[coco_img_id]['regions'].push(region_i);
          imported_region_count = imported_region_count + 1;
        }
      }
    }
    show_message('Import Summary : [' + _via_img_count + '] new files, ' +
                 '[' + imported_region_count + '] regions.');

    if(_via_img_count) {
      update_img_fn_list();
    }

    if(_via_current_image_loaded) {
      if(imported_region_count) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if(_via_img_count) {
        _via_show_img(0);
      }
    }
    ok_callback([_via_img_count, imported_region_count, 0]);
  });
}

function import_annotations_from_json(data_str) {
  return new Promise( function(ok_callback, err_callback) {
    if (data_str === '' || typeof(data_str) === 'undefined') {
      return;
    }

    var d = JSON.parse(data_str);
    var region_import_count = 0;
    var file_added_count    = 0;
    var malformed_entries_count    = 0;
    for (var img_id in d) {
      if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
        project_add_new_file(d[img_id].filename, d[img_id].size, img_id);
        if ( _via_settings.core.default_filepath === '' ) {
          _via_img_src[img_id] = d[img_id].filename;
        } else {
          _via_file_resolve_file_to_default_filepath(img_id);
        }
        file_added_count += 1;
      }

      // copy file attributes
      for ( var key in d[img_id].file_attributes ) {
        if ( key === '' ) {
          continue;
        }

        _via_img_metadata[img_id].file_attributes[key] = d[img_id].file_attributes[key];

        // add this file attribute to _via_attributes
        if ( ! _via_attributes['file'].hasOwnProperty(key) ) {
          _via_attributes['file'][key] = { 'type':'text' };
        }
      }

      // copy regions
      var regions = d[img_id].regions;
      for ( var i in regions ) {
        var region_i = new file_region();
        region_i.frame = regions[i].frame
        for ( var sid in regions[i].shape_attributes ) {
          region_i.shape_attributes[sid] = regions[i].shape_attributes[sid];
        }
        for ( var rid in regions[i].region_attributes ) {
          if ( rid === '' ) {
            continue;
          }

          region_i.region_attributes[rid] = regions[i].region_attributes[rid];

          // add this region attribute to _via_attributes
          if ( ! _via_attributes['region'].hasOwnProperty(rid) ) {
            _via_attributes['region'][rid] = { 'type':'text' };
          }
        }

        // add regions only if they are present
        if ( Object.keys(region_i.shape_attributes).length > 0 ||
             Object.keys(region_i.region_attributes).length > 0 ) {
          _via_img_metadata[img_id].regions.push(region_i);
          region_import_count += 1;
        }
      }
    }
    show_message('Import Summary : [' + file_added_count + '] new files, ' +
                 '[' + region_import_count + '] regions, ' +
                 '[' + malformed_entries_count + '] malformed entries.');

    if ( file_added_count ) {
      update_img_fn_list();
    }

    if ( _via_current_image_loaded ) {
      if ( region_import_count ) {
        update_attributes_update_panel();
        annotation_editor_update_content();
        _via_load_canvas_regions(); // image to canvas space transform
        _via_redraw_reg_canvas();
        _via_reg_canvas.focus();
      }
    } else {
      if ( file_added_count ) {
        _via_show_img(0);
      }
    }

    ok_callback([file_added_count, region_import_count, malformed_entries_count]);
  });
}

// assumes that csv line follows the RFC 4180 standard
// see: https://en.wikipedia.org/wiki/Comma-separated_values
function parse_csv_line(s, field_separator) {
  if (typeof(s) === 'undefined' || s.length === 0 ) {
    return [];
  }

  if (typeof(field_separator) === 'undefined') {
    field_separator = ',';
  }
  var double_quote_seen = false;
  var start = 0;
  var d = [];

  var i = 0;
  while ( i < s.length) {
    if (s.charAt(i) === field_separator) {
      if (double_quote_seen) {
        // field separator inside double quote is ignored
        i = i + 1;
      } else {
        //var part = s.substr(start, i - start);
        d.push( s.substr(start, i - start) );
        start = i + 1;
        i = i + 1;
      }
    } else {
      if (s.charAt(i) === '"') {
        if (double_quote_seen) {
          if (s.charAt(i+1) === '"') {
            // ignore escaped double quotes
            i = i + 2;
          } else {
            // closing of double quote
            double_quote_seen = false;
            i = i + 1;
          }
        } else {
          double_quote_seen = true;
          start = i;
          i = i + 1;
        }
      } else {
        i = i + 1;
      }
    }

  }
  // extract the last field (csv rows have no trailing comma)
  d.push( s.substr(start) );
  return d;
}

// s = '{"name":"rect","x":188,"y":90,"width":243,"height":233}'
function json_str_to_map(s) {
  if (typeof(s) === 'undefined' || s.length === 0 ) {
    return {};
  }

  return JSON.parse(s);
}

// ensure the exported json string conforms to RFC 4180
// see: https://en.wikipedia.org/wiki/Comma-separated_values
function map_to_json(m) {
  var s = [];
  for ( var key in m ) {
    var v   = m[key];
    var si  = JSON.stringify(key);
    si += VIA_CSV_KEYVAL_SEP;
    si += JSON.stringify(v);
    s.push( si );
  }
  return '{' + s.join(VIA_CSV_SEP) + '}';
}

function escape_for_csv(s) {
  return s.replace(/["]/g, '""');
}

function unescape_from_csv(s) {
  return s.replace(/""/g, '"');
}

function remove_prefix_suffix_quotes(s) {
  if ( s.charAt(0) === '"' && s.charAt(s.length-1) === '"' ) {
    return s.substr(1, s.length-2);
  } else {
    return s;
  }
}

function clone_image_region(r0) {
  var r1 = new file_region();

  // copy shape attributes
  for ( var key in r0.shape_attributes ) {
    r1.shape_attributes[key] = clone_value(r0.shape_attributes[key]);
  }

  // copy region attributes
  for ( var key in r0.region_attributes ) {
    r1.region_attributes[key] = clone_value(r0.region_attributes[key]);
  }
  r1.frame = clone_value(r0.frame)
  return r1;
}

function clone_value(value) {
  if ( typeof(value) === 'object' ) {
    if ( Array.isArray(value) ) {
      return value.slice(0);
    } else {
      var copy = {};
      for ( var p in value ) {
        if ( value.hasOwnProperty(p) ) {
          copy[p] = clone_value(value[p]);
        }
      }
      return copy;
    }
  }
  return value;
}

function _via_get_image_id(filename, size) {
  if ( typeof(size) === 'undefined' ) {
    return filename;
  } else {
    return filename + size;
  }
}

function load_text_file(text_file, callback_function) {
  if (text_file) {
    var text_reader = new FileReader();
    text_reader.addEventListener( 'progress', function(e) {
      show_message('Loading data from file : ' + text_file.name + ' ... ');
    }, false);

    text_reader.addEventListener( 'error', function() {
      show_message('Error loading data text file :  ' + text_file.name + ' !');
      callback_function('');
    }, false);

    text_reader.addEventListener( 'load', function() {
      callback_function(text_reader.result);
    }, false);
    text_reader.readAsText(text_file, 'utf-8');
  }
}

function import_files_url_from_csv(data) {
  return new Promise( function(ok_callback, err_callback) {
    if ( data === '' || typeof(data) === 'undefined') {
      err_callback();
    }

    var malformed_url_count = 0;
    var url_added_count = 0;

    var line_split_regex = new RegExp('\n|\r|\r\n', 'g');
    var csvdata = data.split(line_split_regex);

    var percent_completed = 0;
    var n = csvdata.length;
    var i;
    var img_id;
    var first_img_id = '';
    for ( i=0; i < n; ++i ) {
      // ignore blank lines
      if (csvdata[i].charAt(0) === '\n' || csvdata[i].charAt(0) === '') {
        malformed_url_count += 1;
        continue;
      } else {
        img_id = project_file_add_url(csvdata[i]);
        if ( first_img_id === '' ) {
          first_img_id = img_id;
        }
        url_added_count += 1;
      }
    }
    show_message('Added ' + url_added_count + ' files to project');
    if ( url_added_count ) {
      var first_img_index = _via_image_id_list.indexOf(first_img_id);
      _via_show_img(first_img_index);
      update_img_fn_list();
    }
  });
}

//
// Data Exporter
//
function pack_via_metadata(return_type) {
  return new Promise( function(ok_callback, err_callback) {
    if( return_type === 'csv' ) {
      var csvdata = [];
      var csvheader = 'filename,file_size,file_attributes,region_count,region_id,frame,region_shape_attributes,region_attributes';
      csvdata.push(csvheader);

      for ( var image_id in _via_img_metadata ) {
        var fattr = map_to_json( _via_img_metadata[image_id].file_attributes );
        fattr = escape_for_csv( fattr );

        var prefix = '\n' + _via_img_metadata[image_id].filename;
        prefix += ',' + _via_img_metadata[image_id].size;
        prefix += ',"' + fattr + '"';

        var r = _via_img_metadata[image_id].regions;

        if ( r.length !==0 ) {
          for ( var i = 0; i < r.length; ++i ) {
            var csvline = [];
            csvline.push(prefix);
            csvline.push(r.length);
            csvline.push(i);
            csvline.push(r[i].frame);
            var sattr = map_to_json( r[i].shape_attributes );
            sattr = '"' +  escape_for_csv( sattr ) + '"';
            csvline.push(sattr);

            var rattr = map_to_json( r[i].region_attributes );
            rattr = '"' +  escape_for_csv( rattr ) + '"';
            csvline.push(rattr);
            csvdata.push( csvline.join(VIA_CSV_SEP) );
          }
        } else {
          // @todo: reconsider this practice of adding an empty entry
          csvdata.push(prefix + ',0,0,"{}","{}"');
        }
      }
      ok_callback(csvdata);
    }

    // see http://cocodataset.org/#format-data
    if( return_type === 'coco' ) {
      img_stat_set_all().then( function(ok) {
        var coco = export_project_to_coco_format();
        ok_callback( [ coco ] );
      }.bind(this), function(err) {
        err_callback(err);
      }.bind(this));
    } else {
      // default format is JSON
      ok_callback( [ JSON.stringify(_via_img_metadata) ] );
    }
  }.bind(this));
}

function export_project_to_coco_format() {
  var coco = { 'info':{}, 'images':[], 'annotations':[], 'licenses':[], 'categories':[] };
  coco['info'] = { 'year': new Date().getFullYear(),
                   'version': '1.0',
                   'description': 'VIA project exported to COCO format using VGG Image Annotator (http://www.robots.ox.ac.uk/~vgg/software/via/)',
                   'contributor': '',
                   'url': 'http://www.robots.ox.ac.uk/~vgg/software/via/',
                   'date_created': new Date().toString(),
                 };
  coco['licenses'] = [ {'id':0, 'name':'Unknown License', 'url':''} ]; // indicates that license is unknown

  var skipped_annotation_count = 0;
  // We want to ensure that a COCO project imported in VIA and then exported again back to
  // COCO format using VIA retains the image_id and category_id present in the original COCO project.
  // A VIA project that has been created by importing annotations from a COCO project contains
  // unique image_id of type integer and contains all unique option id. If we detect this, we reuse
  // the existing image_id and category_id, otherwise we assign a new unique id sequentially.
  // Currently, it is not possible to preserve the annotation_id
  var assign_unique_id = false;
  for(var img_id in _via_img_metadata) {
    if(Number.isNaN(parseInt(img_id))) {
      assign_unique_id = true; // since COCO only supports image_id of type integer, we cannot reuse the VIA's image-id
      break;
    }
  }
  if(assign_unique_id) {
    // check if all the options have unique id
    var attribute_option_id_list = [];
    for(var attr_name in _via_attributes) {
      if( !VIA_COCO_EXPORT_ATTRIBUTE_TYPE.includes(_via_attributes[attr_name]['type']) ) {
        continue; // skip this attribute as it will not be included in COCO export
      }

      for(var attr_option_id in _via_attributes[attr_name]['options']) {
        if(attribute_option_id_list.includes(attr_option_id) ||
           Number.isNaN(parseInt(attr_option_id)) ) {
          assign_unique_id = true;
          break;
        } else {
          attribute_option_id_list.push(assign_unique_id);
        }
      }
    }
  }

  // add categories
  var attr_option_id_to_category_id = {};
  var unique_category_id = 1;
  for(var attr_name in _via_attributes['region']) {
    if( VIA_COCO_EXPORT_ATTRIBUTE_TYPE.includes(_via_attributes['region'][attr_name]['type']) ) {
      for(var attr_option_id in _via_attributes['region'][attr_name]['options']) {
        var category_id;
        if(assign_unique_id) {
          category_id = unique_category_id;
          unique_category_id = unique_category_id + 1;
        } else {
          category_id = parseInt(attr_option_id);
        }
        coco['categories'].push({
          'supercategory':attr_name,
          'id':category_id,
          'name':_via_attributes['region'][attr_name]['options'][attr_option_id]
        });
        attr_option_id_to_category_id[attr_option_id] = category_id;
      }
    }
  }

  // add files and all their associated annotations
  var annotation_id = 1;
  var unique_img_id = 1;
  for( var img_index in _via_image_id_list ) {
    var img_id = _via_image_id_list[img_index];
    var file_src = _via_settings['core']['default_filepath'] + _via_img_metadata[img_id].filename;
    if ( _via_img_fileref[img_id] instanceof File ) {
      file_src = _via_img_fileref[img_id].filename;
    }

    var coco_img_id;
    if(assign_unique_id) {
      coco_img_id = unique_img_id;
      unique_img_id = unique_img_id + 1;
    } else {
      coco_img_id = parseInt(img_id);
    }

    coco['images'].push( {
      'id':coco_img_id,
      'width':_via_img_stat[img_index][0],
      'height':_via_img_stat[img_index][1],
      'file_name':_via_img_metadata[img_id].filename,
      'license':0,
      'flickr_url':file_src,
      'coco_url':file_src,
      'date_captured':'',
    } );

    // add all annotations associated with this file
    for( var rindex in _via_img_metadata[img_id].regions ) {
      var region = _via_img_metadata[img_id].regions[rindex];
      if( !VIA_COCO_EXPORT_RSHAPE.includes(region.shape_attributes['name']) ) {
        skipped_annotation_count = skipped_annotation_count + 1;
        continue; // skip this region as COCO does not allow it
      }

      var coco_annotation = via_region_shape_to_coco_annotation(region.shape_attributes);
      coco_annotation['id'] = annotation_id;
      coco_annotation['image_id'] = coco_img_id;

      var region_aid_list = Object.keys(region['region_attributes']);
      for(var region_attribute_id in region['region_attributes']) {
        var region_attribute_value = region['region_attributes'][region_attribute_id];
        if(attr_option_id_to_category_id.hasOwnProperty(region_attribute_value)) {
          coco_annotation['category_id'] = attr_option_id_to_category_id[region_attribute_value];
          coco['annotations'].push(coco_annotation);
          annotation_id = annotation_id + 1;
        } else {
          skipped_annotation_count = skipped_annotation_count + 1;
          continue; // skip attribute value not supported by COCO format
        }
      }
    }
  }

  show_message('Skipped ' + skipped_annotation_count + ' annotations. COCO format only supports the following attribute types: ' + JSON.stringify(VIA_COCO_EXPORT_ATTRIBUTE_TYPE) + ' and region shapes: ' + JSON.stringify(VIA_COCO_EXPORT_RSHAPE));
  return [ JSON.stringify(coco) ];
}

function via_region_shape_to_coco_annotation(shape_attributes) {
  var annotation = { 'segmentation':[[]], 'area':[], 'bbox':[], 'iscrowd':0 };

  switch(shape_attributes['name']) {
  case 'rect':
    var x0 = shape_attributes['x'];
    var y0 = shape_attributes['y'];
    var w  = parseInt(shape_attributes['width']);
    var h  = parseInt(shape_attributes['height']);
    var x1 = x0 + w;
    var y1 = y0 + h;
    annotation['segmentation'][0] = [x0, y0, x1, y0, x1, y1, x0, y1];
    annotation['area'] =  w * h ;

    annotation['bbox'] = [x0, y0, w, h];
    break;

  case 'point':
    var cx = shape_attributes['cx'];
    var cy = shape_attributes['cy'];
    // 2 is for visibility - currently set to always inside segmentation.
    // see Keypoint Detection: http://cocodataset.org/#format-data
    annotation['keypoints'] = [cx, cy, 2];
    annotation['num_keypoints'] = 1;
    break;

  case 'circle':
    var a,b;
    a = shape_attributes['r'];
    b = shape_attributes['r'];
    var theta_to_radian = Math.PI/180;

    for ( var theta = 0; theta < 360; theta = theta + VIA_POLYGON_SEGMENT_SUBTENDED_ANGLE ) {
      var theta_radian = theta * theta_to_radian;
      var x = shape_attributes['cx'] + a * Math.cos(theta_radian);
      var y = shape_attributes['cy'] + b * Math.sin(theta_radian);
      annotation['segmentation'][0].push( fixfloat(x), fixfloat(y) );
    }
    annotation['bbox'] = polygon_to_bbox(annotation['segmentation'][0]);
    annotation['area'] = annotation['bbox'][2] * annotation['bbox'][3];
    break;

  case 'ellipse':
    var a,b;
    a = shape_attributes['rx'];
    b = shape_attributes['ry'];
    var rotation = 0;
    // older version of VIA2 did not support rotated ellipse and hence 'theta' attribute may not be available
    if( shape_attributes.hasOwnProperty('theta') ) {
      rotation = shape_attributes['theta'];
    }

    var theta_to_radian = Math.PI/180;

    for ( var theta = 0; theta < 360; theta = theta + VIA_POLYGON_SEGMENT_SUBTENDED_ANGLE ) {
      var theta_radian = theta * theta_to_radian;
      var x = shape_attributes['cx'] +
              ( a * Math.cos(theta_radian) * Math.cos(rotation) ) -
              ( b * Math.sin(theta_radian) * Math.sin(rotation) );
      var y = shape_attributes['cy'] +
              ( a * Math.cos(theta_radian) * Math.sin(rotation) ) +
              ( b * Math.sin(theta_radian) * Math.cos(rotation) );
      annotation['segmentation'][0].push( fixfloat(x), fixfloat(y) );
    }
    annotation['bbox'] = polygon_to_bbox(annotation['segmentation'][0]);
    annotation['area'] = annotation['bbox'][2] * annotation['bbox'][3];
    break;

  case 'polygon':
    annotation['segmentation'][0] = [];
    var x0 = +Infinity;
    var y0 = +Infinity;
    var x1 = -Infinity;
    var y1 = -Infinity;
    for ( var i in shape_attributes['all_points_x'] ) {
      annotation['segmentation'][0].push( shape_attributes['all_points_x'][i] );
      annotation['segmentation'][0].push( shape_attributes['all_points_y'][i] );
      if ( shape_attributes['all_points_x'][i] < x0 ) {
        x0 = shape_attributes['all_points_x'][i];
      }
      if ( shape_attributes['all_points_y'][i] < y0 ) {
        y0 = shape_attributes['all_points_y'][i];
      }
      if ( shape_attributes['all_points_x'][i] > x1 ) {
        x1 = shape_attributes['all_points_x'][i];
      }
      if ( shape_attributes['all_points_y'][i] > y1 ) {
        y1 = shape_attributes['all_points_y'][i];
      }
    }
    var w = x1 - x0;
    var h = y1 - y0;
    annotation['bbox'] = [x0, y0, w, h];
    annotation['area'] = w * h; // approximate area
  }
  return annotation;
}

//
// Maintainers of user interface
//

function init_message_panel() {
  var p = document.getElementById('message_panel');
  p.addEventListener('mousedown', function() {
    this.style.display = 'none';
  }, false);
  p.addEventListener('mouseover', function() {
    clearTimeout(_via_message_clear_timer); // stop any previous timeouts
  }, false);
}

function toggle_message_visibility() {
  if(_via_is_message_visible) {
    show_message('Disabled status messages');
    _via_is_message_visible = false;
  } else {
    _via_is_message_visible = true;
    show_message('Status messages are now visible');
  }
}

function show_message(msg, t) {
  if ( _via_message_clear_timer ) {
    clearTimeout(_via_message_clear_timer); // stop any previous timeouts
  }
  if ( !_via_is_message_visible ) {
    return;
  }

  var timeout = t;
  if ( typeof t === 'undefined' ) {
    timeout = VIA_THEME_MESSAGE_TIMEOUT_MS;
  }
  document.getElementById('message_panel_content').innerHTML = msg;
  document.getElementById('message_panel').style.display = 'block';

  _via_message_clear_timer = setTimeout( function() {
    document.getElementById('message_panel').style.display = 'none';
  }, timeout);
}

function _via_regions_group_color_init() {
  _via_canvas_regions_group_color = {};
  var aid = _via_settings.ui.image.region_color;
  if ( aid !== '__via_default_region_color__' ) {
    var avalue;
    for ( var i = 0; i < _via_img_metadata[_via_image_id].regions.length; ++i ) {
      avalue = _via_img_metadata[_via_image_id].regions[i].region_attributes[aid];
      _via_canvas_regions_group_color[avalue] = 1;
    }
    var color_index = 0;
    for ( avalue in _via_canvas_regions_group_color ) {
      _via_canvas_regions_group_color[avalue] = VIA_REGION_COLOR_LIST[ color_index % VIA_REGION_COLOR_LIST.length ];
      color_index = color_index + 1;
    }
  }
}


// transform regions in image space to canvas space
function _via_add_canvas_region(region) {
  _via_regions_group_color_init();
  var i = _via_canvas_regions.push(region_i);

  switch(_via_canvas_regions[i].shape_attributes['name']) {
  case VIA_REGION_SHAPE.RECT:
    var x      = regions[i].shape_attributes['x'] / _via_canvas_scale;
    var y      = regions[i].shape_attributes['y'] / _via_canvas_scale;
    var width  = regions[i].shape_attributes['width']  / _via_canvas_scale;
    var height = regions[i].shape_attributes['height'] / _via_canvas_scale;

    _via_canvas_regions[i].shape_attributes['x'] = Math.round(x);
    _via_canvas_regions[i].shape_attributes['y'] = Math.round(y);
    _via_canvas_regions[i].shape_attributes['width'] = Math.round(width);
    _via_canvas_regions[i].shape_attributes['height'] = Math.round(height);
    break;

  case VIA_REGION_SHAPE.BOX_PROMPT:
    var x      = regions[i].shape_attributes['x'] / _via_canvas_scale;
    var y      = regions[i].shape_attributes['y'] / _via_canvas_scale;
    var width  = regions[i].shape_attributes['width']  / _via_canvas_scale;
    var height = regions[i].shape_attributes['height'] / _via_canvas_scale;

    _via_canvas_regions[i].shape_attributes['x'] = Math.round(x);
    _via_canvas_regions[i].shape_attributes['y'] = Math.round(y);
    _via_canvas_regions[i].shape_attributes['width'] = Math.round(width);
    _via_canvas_regions[i].shape_attributes['height'] = Math.round(height);
    break;

  case VIA_REGION_SHAPE.CIRCLE:
    var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
    var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;
    var r  = regions[i].shape_attributes['r']  / _via_canvas_scale;
    _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
    _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
    _via_canvas_regions[i].shape_attributes['r'] = Math.round(r);
    break;

  case VIA_REGION_SHAPE.ELLIPSE:
    var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
    var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;
    var rx = regions[i].shape_attributes['rx'] / _via_canvas_scale;
    var ry = regions[i].shape_attributes['ry'] / _via_canvas_scale;
    // rotation in radians
    var theta = regions[i].shape_attributes['theta'];
    _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
    _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
    _via_canvas_regions[i].shape_attributes['rx'] = Math.round(rx);
    _via_canvas_regions[i].shape_attributes['ry'] = Math.round(ry);
    _via_canvas_regions[i].shape_attributes['theta'] = theta;
    break;

  case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
  case VIA_REGION_SHAPE.POLYGON:
    var all_points_x = regions[i].shape_attributes['all_points_x'].slice(0);
    var all_points_y = regions[i].shape_attributes['all_points_y'].slice(0);
    for (var j=0; j<all_points_x.length; ++j) {
      all_points_x[j] = Math.round(all_points_x[j] / _via_canvas_scale);
      all_points_y[j] = Math.round(all_points_y[j] / _via_canvas_scale);
    }
    _via_canvas_regions[i].shape_attributes['all_points_x'] = all_points_x;
    _via_canvas_regions[i].shape_attributes['all_points_y'] = all_points_y;
    break;

  case VIA_REGION_SHAPE.POINT:
    var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
    var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

    _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
    _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
    break;
  
  case VIA_REGION_SHAPE.POSITIVE_POINT:
    var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
    var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

    _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
    _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
    _via_canvas_regions[i].shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
    break;

  case VIA_REGION_SHAPE.NEGATIVE_POINT:
    var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
    var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

    _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
    _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
    _via_canvas_regions[i].shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
  }
}


// transform regions in image space to canvas space
function _via_load_canvas_regions() {
  _via_regions_group_color_init();
  // load all existing annotations into _via_canvas_regions
  var regions = _via_img_metadata[_via_image_id].regions;
  _via_canvas_regions  = [];
  var has_ai_prompts = false;
  for ( var i = 0; i < regions.length; ++i ) {
    var region_i = new file_region();
    region_i.frame = regions[i].frame;
    for ( var key in regions[i].shape_attributes ) {
      region_i.shape_attributes[key] = regions[i].shape_attributes[key];

    }
    _via_canvas_regions.push(region_i);

    switch(_via_canvas_regions[i].shape_attributes['name']) {
    case VIA_REGION_SHAPE.RECT:
      var x      = regions[i].shape_attributes['x'] / _via_canvas_scale;
      var y      = regions[i].shape_attributes['y'] / _via_canvas_scale;
      var width  = regions[i].shape_attributes['width']  / _via_canvas_scale;
      var height = regions[i].shape_attributes['height'] / _via_canvas_scale;

      _via_canvas_regions[i].shape_attributes['x'] = Math.round(x);
      _via_canvas_regions[i].shape_attributes['y'] = Math.round(y);
      _via_canvas_regions[i].shape_attributes['width'] = Math.round(width);
      _via_canvas_regions[i].shape_attributes['height'] = Math.round(height);
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      var x      = regions[i].shape_attributes['x'] / _via_canvas_scale;
      var y      = regions[i].shape_attributes['y'] / _via_canvas_scale;
      var width  = regions[i].shape_attributes['width']  / _via_canvas_scale;
      var height = regions[i].shape_attributes['height'] / _via_canvas_scale;

      _via_canvas_regions[i].shape_attributes['x'] = Math.round(x);
      _via_canvas_regions[i].shape_attributes['y'] = Math.round(y);
      _via_canvas_regions[i].shape_attributes['width'] = Math.round(width);
      _via_canvas_regions[i].shape_attributes['height'] = Math.round(height);
      has_ai_prompts = true;
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
      var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;
      var r  = regions[i].shape_attributes['r']  / _via_canvas_scale;
      _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
      _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
      _via_canvas_regions[i].shape_attributes['r'] = Math.round(r);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
      var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;
      var rx = regions[i].shape_attributes['rx'] / _via_canvas_scale;
      var ry = regions[i].shape_attributes['ry'] / _via_canvas_scale;
      // rotation in radians
      var theta = regions[i].shape_attributes['theta'];
      _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
      _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
      _via_canvas_regions[i].shape_attributes['rx'] = Math.round(rx);
      _via_canvas_regions[i].shape_attributes['ry'] = Math.round(ry);
      _via_canvas_regions[i].shape_attributes['theta'] = theta;
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      var all_points_x = regions[i].shape_attributes['all_points_x'].slice(0);
      var all_points_y = regions[i].shape_attributes['all_points_y'].slice(0);
      for (var j=0; j<all_points_x.length; ++j) {
        all_points_x[j] = Math.round(all_points_x[j] / _via_canvas_scale);
        all_points_y[j] = Math.round(all_points_y[j] / _via_canvas_scale);
      }
      _via_canvas_regions[i].shape_attributes['all_points_x'] = all_points_x;
      _via_canvas_regions[i].shape_attributes['all_points_y'] = all_points_y;
      break;

    case VIA_REGION_SHAPE.POINT:
      var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
      var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

      _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
      _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
      break;
    
    case VIA_REGION_SHAPE.POSITIVE_POINT:
      var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
      var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

      _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
      _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
      _via_canvas_regions[i].shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
      has_ai_prompts = true;
      break;

    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      var cx = regions[i].shape_attributes['cx'] / _via_canvas_scale;
      var cy = regions[i].shape_attributes['cy'] / _via_canvas_scale;

      _via_canvas_regions[i].shape_attributes['cx'] = Math.round(cx);
      _via_canvas_regions[i].shape_attributes['cy'] = Math.round(cy);
      _via_canvas_regions[i].shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
      has_ai_prompts = true;
    }
  }
  window.onbeforeunload = displaySaveWarning
  var x = document.getElementById('prompt-toolbar')
  if (has_ai_prompts) {  
    x.style = "height: 3.5 rem; margin-bottom: 10px; align-items: center; display: flex;"
  }
  else {
    x.style = "display: none"
  }
  //window.addEventListener('beforeunload', displaySaveWarning, false);
}

// updates currently selected region shape
// updates currently selected region shape
function select_region_shape(sel_shape_name) {
  // Deselect all region shape buttons
  for (var shape_name in VIA_REGION_SHAPE) {
    var ui_element = document.getElementById('region_shape_' + VIA_REGION_SHAPE[shape_name]);
    if (ui_element) {
      ui_element.classList.remove('selected');
    }
  }

  // Set the currently selected shape
  _via_current_shape = sel_shape_name;
  var ui_element = document.getElementById('region_shape_' + _via_current_shape);
  if (ui_element) {
    ui_element.classList.add('selected');
  }

  // Provide user instructions based on the selected shape
  switch (_via_current_shape) {
    case VIA_REGION_SHAPE.RECT: // Fall-through
    case VIA_REGION_SHAPE.CIRCLE: // Fall-through
    case VIA_REGION_SHAPE.ELLIPSE:
      show_message('Press single click and drag mouse to draw ' +
                   _via_current_shape + ' region');
      break;

    case VIA_REGION_SHAPE.POLYLINE:
    case VIA_REGION_SHAPE.POLYGON:
      _via_is_user_drawing_polygon = false;
      _via_current_polygon_region_id = -1;
      show_message('[Single Click] to define polygon/polyline vertices, ' +
                   '[Backspace] to delete last vertex, [Enter] to finish, [Esc] to cancel drawing.');
      break;

    case VIA_REGION_SHAPE.POINT:
      show_message('Press single click to define points (or landmarks)');
      break;

    case VIA_REGION_SHAPE.POSITIVE_POINT:
      show_message('Press single click to add a positive point to the selected shape');
      break;

    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      show_message('Press single click to add a negative point to the selected shape');
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      show_message('Select a box region for auto segmentation');
      break;

    default:
      show_message('Unknown shape selected!');
      break;
  }
}

function set_all_canvas_size(w, h) {
  _via_reg_canvas.height = h;
  _via_reg_canvas.width = w;

  image_panel.style.height = h + 'px';
  image_panel.style.width  = w + 'px';

  var video_seeker_toolbar = document.getElementById("video-seeker-toolbar");
  video_seeker_toolbar.style.paddingTop = h+10 + 'px';

}

function set_all_canvas_scale(s) {
  _via_reg_ctx.scale(s, s);
}

function show_all_canvas() {
  image_panel.style.display = 'inline-block';
}

function hide_all_canvas() {
  image_panel.style.display = 'none';
}

function jump_to_image(image_index) {
  if ( _via_img_count <= 0 ) {
    return;
  }

  switch(_via_display_area_content_name) {
  case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID:
    if ( image_index >= 0 && image_index < _via_img_count) {
      // @todo: jump to image grid page view with the given first image index
      show_single_image_view();
      _via_show_img(image_index);
    }
    break;
  default:
    if ( image_index >= 0 && image_index < _via_img_count) {
      _via_show_img(image_index);
    }
    break;
  }
}

function count_missing_region_attr(img_id) {
  var miss_region_attr_count = 0;
  var attr_count = Object.keys(_via_region_attributes).length;
  for( var i=0; i < _via_img_metadata[img_id].regions.length; ++i ) {
    var set_attr_count = Object.keys(_via_img_metadata[img_id].regions[i].region_attributes).length;
    miss_region_attr_count += ( attr_count - set_attr_count );
  }
  return miss_region_attr_count;
}

function count_missing_file_attr(img_id) {
  return Object.keys(_via_file_attributes).length - Object.keys(_via_img_metadata[img_id].file_attributes).length;
}

function toggle_all_regions_selection(is_selected) {
  var n = _via_img_metadata[_via_image_id].regions.length;
  var current_frame = document.getElementById('current-frame').value
  var i;
  _via_region_selected_flag = [];
  for ( i = 0; i < n; ++i) {
    _via_region_selected_flag[i] = is_selected;
  }
  _via_is_all_region_selected = is_selected;
  annotation_editor_hide();
  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS ) {
    annotation_editor_clear_row_highlight();
  }
}

function toggle_all_regions_within_frame_selection(is_selected) {
  var n = _via_img_metadata[_via_image_id].regions.length;
  var current_frame = document.getElementById('current-frame').value
  var i;
  _via_region_selected_flag = [];
  for ( i = 0; i < n; ++i) {
    if (_via_img_metadata[_via_image_id].regions[i].frame != current_frame)
      continue
    _via_region_selected_flag[i] = is_selected;
  }
  
  annotation_editor_hide();
  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS ) {
    annotation_editor_clear_row_highlight();
  }
  _via_is_all_region_selected = false;
  _via_is_region_selected = true;
}

function select_only_region(region_id) {
  var current_frame = document.getElementById('current-frame').value
  toggle_all_regions_selection(false);
  if (! _via_img_metadata[_via_image_id]['regions'][region_id] instanceof file_region) {
    return;
  }
  if (_via_img_metadata[_via_image_id]['regions'][region_id].frame != current_frame) {
    return
  }
  set_region_select_state(region_id, true);
  _via_is_region_selected = true;
  _via_is_all_region_selected = false;
  _via_user_sel_region_id = region_id;
}

function set_region_select_state(region_id, is_selected) {
  //if _via_img_metadata[_via_image_id].
  _via_region_selected_flag[region_id] = is_selected;
}


function getCurrentImagePrompts(frame_num = null) {
  var current_frame = document.getElementById('current-frame').value;
  var regions = _via_img_metadata[_via_image_id].regions;
  var box_prompts = [];
  var box_labels = [];
  var point_prompts = [];
  var point_labels = [];
  var mask_prompts = [];
  var mask_labels = [];
  var point_prompt_frame_ids = [];
  var box_prompt_frame_ids = [];
  var mask_prompt_frame_ids = [];
  var label_id = null;

  if (_via_last_selected_region_attribute === '') {
    if (_via_current_attribute_id !== '') {
      label_id = _via_current_attribute_id;
    }
  }

  // Iterate through the regions array using a traditional for loop
  for (var i = 0; i < regions.length; i++) {
    var region = regions[i];
    var region_name = region.shape_attributes.name;

    if (frame_num !== null) {
      if (frame_num != region.frame) {
        continue;
      }
    }

    if (region_name === VIA_REGION_SHAPE.POSITIVE_POINT) {
      point_prompts.push([region.shape_attributes.cx, region.shape_attributes.cy, 1]);
      point_labels.push(region.region_attributes[label_id]);
      point_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.NEGATIVE_POINT) {
      point_prompts.push([region.shape_attributes.cx, region.shape_attributes.cy, 0]);
      point_labels.push(region.region_attributes[label_id]);
      point_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.BOX_PROMPT) {
      var x1 = region.shape_attributes.x;
      var y1 = region.shape_attributes.y;
      var x2 = x1 + region.shape_attributes.width;
      var y2 = y1 + region.shape_attributes.height;
      box_prompts.push([x1, y1, x2, y2]);
      box_labels.push(region.region_attributes[label_id]);
      box_prompt_frame_ids.push(region.frame);
    } else if (region_name === VIA_REGION_SHAPE.MASK_PROMPT) {
      // Process mask prompts as needed.
      // For now, we simply push an empty array for the mask prompt and mask label.
      mask_prompts.push([]); 
      mask_labels.push([]);
      mask_prompt_frame_ids.push(region.frame);
    }
  }

  return {
    'box_prompts': [box_prompts, box_labels, box_prompt_frame_ids],
    'point_prompts': [point_prompts, point_labels, point_prompt_frame_ids],
    'mask_prompts': [mask_prompts, mask_labels, mask_prompt_frame_ids]
  };
}


function makeTempSAMPolygonPermanent(frame_id=null) {
  // make the polygons permanent only in current frame and assign default values
  var regions = _via_img_metadata[_via_image_id].regions
  for (var r in regions) {
    var region = regions[r]
    var temp = null
    if (frame_id) {
      if (region.frame == frame_id) {
        if ("temp" in region.region_attributes) {
          delete region.region_attributes.temp
        }
      }
    }
    else {
      if ("temp" in region.region_attributes) delete region.region_attributes.temp
    }
    _via_img_metadata[_via_image_id].regions[r] = region
  }
}

async function confirmSAMPolygons(frame_id=null) {
  // clear SAM prompts
  clearCurrentImageSAMPrompts(frame_id)
  makeTempSAMPolygonPermanent(frame_id)
  annotation_editor_update_content();
  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  if (frame_id) show_message('Saved SAM Polygons in current frame')
  else show_message('Saved SAM Polygons in every frame')
}


function show_annotation_data() {
  pack_via_metadata('csv').then( function(data) {
    var hstr = '<pre>' + data.join('') + '</pre>';
    var window_features = 'toolbar=no,menubar=no,location=no,resizable=yes,scrollbars=yes,status=no';
    window_features += ',width=800,height=600';
    var annotation_data_window = window.open('', 'Annotations (preview) ', window_features);
    annotation_data_window.document.body.innerHTML = hstr;
  }.bind(this), function(err) {
    show_message('Failed to collect annotation data!');
  }.bind(this));
}

//
// Image click handlers
//

// enter annotation mode on double click
function _via_reg_canvas_dblclick_handler(e) {
  e.stopPropagation();
  return;
}

function clearCurrentImageSAMPolygons(frame_id=null) {
  toggle_all_regions_selection(false)
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var new_regions = []
  var new_canvas_regions = []
  for (var r in regions) {
    var region = regions[r]
    if (frame_id) {
      if (region.frame != frame_id) {
        new_regions = new_regions.concat(region)
      }
      else {
        if ('temp' in region.region_attributes) continue
        new_regions = new_regions.concat(region)
      }
    }
    else {
      if ('temp' in region.region_attributes) continue
      new_regions = new_regions.concat(region)
    }
  }
  _via_img_metadata[_via_image_id]['regions'] = new_regions
  annotation_editor_update_content();
  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  toggle_all_regions_selection(false)
  _via_user_sel_region_id = -1
}

function clearCurrentImageSAMPrompts(frame_id) {
  toggle_all_regions_selection(false)
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var new_regions = []
  var new_canvas_regions = []
  for (var r in regions) {
    var region = regions[r]
    var region_name = region.shape_attributes.name
    if (frame_id) {
      if (region.frame != frame_id)  new_regions = new_regions.concat(region)
      else {
        if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT)  continue
        new_regions = new_regions.concat(region)
      }
    }
    else {
      if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT)  continue
      new_regions = new_regions.concat(region)
    }
  }
  _via_img_metadata[_via_image_id]['regions'] = new_regions

  _via_load_canvas_regions()
  _via_redraw_reg_canvas()
  toggle_all_regions_selection(false)
  _via_user_sel_region_id = -1
  annotation_editor_update_content();
}

function getCurrentSAMPrompts() {
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var prompts = []
  for (var r in regions) {
    var region = regions[r]
    var region_name = region.shape_attributes.name

    if ( region_name == VIA_REGION_SHAPE.POSITIVE_POINT || region_name == VIA_REGION_SHAPE.NEGATIVE_POINT || region_name == VIA_REGION_SHAPE.BOX_PROMPT){
      prompts = prompts.concat(region)
    }
  }
  return prompts
}

function getCurrentSAMPolygons() {
  var regions =  _via_img_metadata[_via_image_id]['regions']
  var sam_masks = []
  for (var r in regions) {
    var region = regions[r]
    if ( "temp" in region.region_attributes ){
      sam_masks = sam_masks.concat(region)
    }
  }
  return sam_masks
}

var _via_right_click_down = false;
// user clicks on the canvas
function _via_reg_canvas_mousedown_handler(e) {
  if (e.button === 2) _via_right_click_down = true;
  e.stopPropagation();
  _via_click_x0 = e.offsetX; _via_click_y0 = e.offsetY;
  _via_region_edge = is_on_region_corner(_via_click_x0, _via_click_y0);
  var region_id = is_inside_region(_via_click_x0, _via_click_y0);
  if ( _via_is_region_selected ) {
    // check if user clicked on the region boundary
    if ( _via_region_edge[1] > 0 ) {
      if ( !_via_is_user_resizing_region ) {
        if ( _via_region_edge[0] !== _via_user_sel_region_id ) {
          _via_user_sel_region_id = _via_region_edge[0];
        }
        // resize region
        _via_is_user_resizing_region = true;
      }
    } else {
      var yes = is_inside_this_region(_via_click_x0,
                                      _via_click_y0,
                                      _via_user_sel_region_id);
      if (yes) {
        if( !_via_is_user_moving_region ) {
          _via_is_user_moving_region = true;
          _via_region_click_x = _via_click_x0;
          _via_region_click_y = _via_click_y0;
        }
      }
      if ( region_id === -1 ) {
        // mousedown on outside any region
        _via_is_user_drawing_region = true;
        // unselect all regions
        _via_is_region_selected = false;
        _via_user_sel_region_id = -1;
        
      }
    }
  } else {
    if ( region_id === -1 ) {
      
      // mousedown outside a region
      if (_via_current_shape !== VIA_REGION_SHAPE.POLYGON &&
          _via_current_shape !== VIA_REGION_SHAPE.POLYLINE &&
          _via_current_shape !== VIA_REGION_SHAPE.POINT &&
          _via_current_shape !== VIA_REGION_SHAPE.POSITIVE_POINT &&
          _via_current_shape !== VIA_REGION_SHAPE.NEGATIVE_POINT) {
        // this is a bounding box drawing event
        _via_is_user_drawing_region = true;
      }
    } else {
      // mousedown inside a region
      // this could lead to (1) region selection or (2) region drawing
      _via_is_user_drawing_region = true;
    }
  }
}

// implements the following functionalities:
//  - new region drawing (including polygon)
//  - moving/resizing/select/unselect existing region
function _via_reg_canvas_mouseup_handler(e) {
  
  e.stopPropagation();
  _via_click_x1 = e.offsetX; _via_click_y1 = e.offsetY;

  var click_dx = Math.abs(_via_click_x1 - _via_click_x0);
  var click_dy = Math.abs(_via_click_y1 - _via_click_y0);

  var current_frame = document.getElementById('current-frame').value

  // indicates that user has finished moving a region
  if ( _via_is_user_moving_region ) {
    _via_is_user_moving_region = false;
    _via_reg_canvas.style.cursor = "default";

    var move_x = Math.round(_via_click_x1 - _via_region_click_x);
    var move_y = Math.round(_via_click_y1 - _via_region_click_y);

    if (Math.abs(move_x) > VIA_MOUSE_CLICK_TOL ||
        Math.abs(move_y) > VIA_MOUSE_CLICK_TOL) {
      // move all selected regions
      _via_move_selected_regions(move_x, move_y);
    } else {
      // indicates a user click on an already selected region
      // this could indicate the user's intention to select another
      // nested region within this region
      // OR
      // draw a nested region (i.e. region inside a region)

      // traverse the canvas regions in alternating ascending
      // and descending order to solve the issue of nested regions
      var nested_region_id = is_inside_region(_via_click_x0, _via_click_y0, true);
      if (nested_region_id >= 0 &&
          nested_region_id !== _via_user_sel_region_id) {
        _via_user_sel_region_id = nested_region_id;
        _via_is_region_selected = true;
        _via_is_user_moving_region = false;

        // de-select all other regions if the user has not pressed Shift
        if ( !e.shiftKey ) {
          toggle_all_regions_selection(false);
        }
        set_region_select_state(nested_region_id, true);
        annotation_editor_show();
      } else {
        // user clicking inside an already selected region
        // indicates that the user intends to draw a nested region
        toggle_all_regions_selection(false);
        _via_is_region_selected = false;

        switch (_via_current_shape) {
        case VIA_REGION_SHAPE.POLYLINE: // handled by case for POLYGON
        case VIA_REGION_SHAPE.POLYGON:
          // user has clicked on the first point in a new polygon
          // see also event 'mouseup' for _via_is_user_drawing_polygon=true
          _via_is_user_drawing_polygon = true;

          var canvas_polygon_region = new file_region();
          canvas_polygon_region.shape_attributes['name'] = _via_current_shape;
          canvas_polygon_region.shape_attributes['all_points_x'] = [Math.round(_via_click_x0)];
          canvas_polygon_region.shape_attributes['all_points_y'] = [Math.round(_via_click_y0)];
          canvas_polygon_region.frame = current_frame
          var new_length = _via_canvas_regions.push(canvas_polygon_region);
          _via_current_polygon_region_id = new_length - 1;
          break;

        case VIA_REGION_SHAPE.POINT:
          // user has marked a landmark point
          var point_region = new file_region();
          point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POINT;
          point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
          point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
          point_region.frame = current_frame;
          _via_img_metadata[_via_image_id].regions.push(point_region);

          var canvas_point_region = new file_region();
          canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POINT;
          canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
          canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
          canvas_point_region.frame = current_frame;
          _via_canvas_regions.push(canvas_point_region);
          break;

        case VIA_REGION_SHAPE.POSITIVE_POINT:
          // user has marked 'add' landmark point
          var point_region = new file_region();
          point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
          point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
          point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
          point_region.frame = current_frame;
          var region_count = _via_img_metadata[_via_image_id].regions.push(point_region);
          var new_region_id = region_count - 1;
          set_region_annotations_to_default_value( new_region_id );

          var canvas_point_region = new file_region();
          canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
          canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
          canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
          canvas_point_region.frame = current_frame;
          _via_canvas_regions.push(canvas_point_region);
          toggle_all_regions_selection(false);
          processSAMPrompts();
          break;

        case VIA_REGION_SHAPE.NEGATIVE_POINT:
          // user has marked a 'remove' landmark point
          var point_region = new file_region();
          point_region.shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
          point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
          point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
          point_region.frame = current_frame;
          var region_count = _via_img_metadata[_via_image_id].regions.push(point_region);
          var new_region_id = region_count - 1;
          set_region_annotations_to_default_value( new_region_id );

          var canvas_point_region = new file_region();
          canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
          canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
          canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
          canvas_point_region.frame = current_frame;
          _via_canvas_regions.push(canvas_point_region);
          toggle_all_regions_selection(false);
          processSAMPrompts();
          break;
        }
        annotation_editor_update_content();
      }
    }
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
    return;
  }

  // indicates that user has finished resizing a region
  if ( _via_is_user_resizing_region ) {
    // _via_click(x0,y0) to _via_click(x1,y1)
    _via_is_user_resizing_region = false;
    _via_reg_canvas.style.cursor = "default";

    // update the region
    var region_id = _via_region_edge[0];
    var image_attr = _via_img_metadata[_via_image_id].regions[region_id].shape_attributes;
    var canvas_attr = _via_canvas_regions[region_id].shape_attributes;
    if (_via_canvas_regions[region_id].frame != current_frame) {
      return
    }

    switch (canvas_attr['name']) {
    case VIA_REGION_SHAPE.RECT:
      var d = [canvas_attr['x'], canvas_attr['y'], 0, 0];
      d[2] = d[0] + canvas_attr['width'];
      d[3] = d[1] + canvas_attr['height'];

      var mx = _via_current_x;
      var my = _via_current_y;
      var preserve_aspect_ratio = false;

      // constrain (mx,my) to lie on a line connecting a diagonal of rectangle
      if ( _via_is_ctrl_pressed ) {
        preserve_aspect_ratio = true;
      }

      rect_update_corner(_via_region_edge[1], d, mx, my, preserve_aspect_ratio);
      rect_standardize_coordinates(d);

      var w = Math.abs(d[2] - d[0]);
      var h = Math.abs(d[3] - d[1]);

      image_attr['x'] = Math.round(d[0] * _via_canvas_scale);
      image_attr['y'] = Math.round(d[1] * _via_canvas_scale);
      image_attr['width'] = Math.round(w * _via_canvas_scale);
      image_attr['height'] = Math.round(h * _via_canvas_scale);

      canvas_attr['x'] = Math.round( image_attr['x'] / _via_canvas_scale);
      canvas_attr['y'] = Math.round( image_attr['y'] / _via_canvas_scale);
      canvas_attr['width'] = Math.round( image_attr['width'] / _via_canvas_scale);
      canvas_attr['height'] = Math.round( image_attr['height'] / _via_canvas_scale);
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      var d = [canvas_attr['x'], canvas_attr['y'], 0, 0];
      d[2] = d[0] + canvas_attr['width'];
      d[3] = d[1] + canvas_attr['height'];

      var mx = _via_current_x;
      var my = _via_current_y;
      var preserve_aspect_ratio = false;

      // constrain (mx,my) to lie on a line connecting a diagonal of rectangle
      if ( _via_is_ctrl_pressed ) {
        preserve_aspect_ratio = true;
      }

      rect_update_corner(_via_region_edge[1], d, mx, my, preserve_aspect_ratio);
      rect_standardize_coordinates(d);

      var w = Math.abs(d[2] - d[0]);
      var h = Math.abs(d[3] - d[1]);

      image_attr['x'] = Math.round(d[0] * _via_canvas_scale);
      image_attr['y'] = Math.round(d[1] * _via_canvas_scale);
      image_attr['width'] = Math.round(w * _via_canvas_scale);
      image_attr['height'] = Math.round(h * _via_canvas_scale);

      canvas_attr['x'] = Math.round( image_attr['x'] / _via_canvas_scale);
      canvas_attr['y'] = Math.round( image_attr['y'] / _via_canvas_scale);
      canvas_attr['width'] = Math.round( image_attr['width'] / _via_canvas_scale);
      canvas_attr['height'] = Math.round( image_attr['height'] / _via_canvas_scale);
      _via_img_metadata[_via_image_id].regions[region_id].shape_attributes = image_attr;
      _via_img_metadata[_via_image_id].regions[region_id].frame = current_frame;
      if (_via_right_click_down) {
        processSAMPrompts(false)
        makeTempSAMPolygonPermanent(current_frame);
      }
      else {
        processSAMPrompts();
      }
      _via_right_click_down = false
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      var dx = Math.abs(canvas_attr['cx'] - _via_current_x);
      var dy = Math.abs(canvas_attr['cy'] - _via_current_y);
      var new_r = Math.sqrt( dx*dx + dy*dy );

      image_attr['r'] = fixfloat(new_r * _via_canvas_scale);
      canvas_attr['r'] = Math.round( image_attr['r'] / _via_canvas_scale);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      var new_rx = canvas_attr['rx'];
      var new_ry = canvas_attr['ry'];
      var new_theta = canvas_attr['theta'];
      var dx = Math.abs(canvas_attr['cx'] - _via_current_x);
      var dy = Math.abs(canvas_attr['cy'] - _via_current_y);

      switch(_via_region_edge[1]) {
      case 5:
        new_ry = Math.sqrt(dx*dx + dy*dy);
        new_theta = Math.atan2(- (_via_current_x - canvas_attr['cx']), (_via_current_y - canvas_attr['cy']));
        break;

      case 6:
        new_rx = Math.sqrt(dx*dx + dy*dy);
        new_theta = Math.atan2((_via_current_y - canvas_attr['cy']), (_via_current_x - canvas_attr['cx']));
        break;

      default:
        new_rx = dx;
        new_ry = dy;
        new_theta = 0;
        break;
      }

      image_attr['rx'] = fixfloat(new_rx * _via_canvas_scale);
      image_attr['ry'] = fixfloat(new_ry * _via_canvas_scale);
      image_attr['theta'] = fixfloat(new_theta);

      canvas_attr['rx'] = Math.round(image_attr['rx'] / _via_canvas_scale);
      canvas_attr['ry'] = Math.round(image_attr['ry'] / _via_canvas_scale);
      canvas_attr['theta'] = fixfloat(new_theta);
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      var moved_vertex_id = _via_region_edge[1] - VIA_POLYGON_RESIZE_VERTEX_OFFSET;

      if ( e.ctrlKey || e.metaKey ) {
        // if on vertex, delete it
        // if on edge, add a new vertex
        var r = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;    
        var shape = r.name;
        var is_on_vertex = is_on_polygon_vertex(r['all_points_x'], r['all_points_y'], _via_current_x, _via_current_y);
        if ( is_on_vertex === _via_region_edge[1] ) {
          // click on vertex, hence delete vertex
          if ( _via_polygon_del_vertex(region_id, moved_vertex_id) ) {
            show_message('Deleted vertex ' + moved_vertex_id + ' from region');
          }
        } else {
          var is_on_edge = is_on_polygon_edge(r['all_points_x'], r['all_points_y'], _via_current_x, _via_current_y);
          if ( is_on_edge === _via_region_edge[1] ) {
            // click on edge, hence add new vertex
            var vertex_index = is_on_edge - VIA_POLYGON_RESIZE_VERTEX_OFFSET;
            var canvas_x0 = Math.round(_via_click_x1);
            var canvas_y0 = Math.round(_via_click_y1);
            var img_x0 = Math.round( canvas_x0 * _via_canvas_scale );
            var img_y0 = Math.round( canvas_y0 * _via_canvas_scale );
            canvas_x0 = Math.round( img_x0 / _via_canvas_scale );
            canvas_y0 = Math.round( img_y0 / _via_canvas_scale );

            _via_canvas_regions[region_id].shape_attributes['all_points_x'].splice(vertex_index+1, 0, canvas_x0);
            _via_canvas_regions[region_id].shape_attributes['all_points_y'].splice(vertex_index+1, 0, canvas_y0);
            _via_canvas_regions[region_id].frame = current_frame
            _via_img_metadata[_via_image_id].regions[region_id].shape_attributes['all_points_x'].splice(vertex_index+1, 0, img_x0);
            _via_img_metadata[_via_image_id].regions[region_id].shape_attributes['all_points_y'].splice(vertex_index+1, 0, img_y0);
            _via_img_metadata[_via_image_id].regions[region_id].frame = current_frame
            show_message('Added 1 new vertex to ' + shape + ' region');
          }
        }
      } else {
        // update coordinate of vertex
        var imx = Math.round(_via_current_x * _via_canvas_scale);
        var imy = Math.round(_via_current_y * _via_canvas_scale);
        image_attr['all_points_x'][moved_vertex_id] = imx;
        image_attr['all_points_y'][moved_vertex_id] = imy;
        canvas_attr['all_points_x'][moved_vertex_id] = Math.round( imx / _via_canvas_scale );
        canvas_attr['all_points_y'][moved_vertex_id] = Math.round( imy / _via_canvas_scale );
      }
      break;
    } // end of switch()
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
    return;
  }

  // denotes a single click (= mouse down + mouse up)
  if ( click_dx < VIA_MOUSE_CLICK_TOL ||
       click_dy < VIA_MOUSE_CLICK_TOL ) {
    // if user is already drawing polygon, then each click adds a new point
    if ( _via_is_user_drawing_polygon ) {
      var canvas_x0 = Math.round(_via_click_x1);
      var canvas_y0 = Math.round(_via_click_y1);
      var n = _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_x'].length;
      var last_x0 = _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_x'][n-1];
      var last_y0 = _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_y'][n-1];
      // discard if the click was on the last vertex
      if ( canvas_x0 !== last_x0 || canvas_y0 !== last_y0 ) {
        // user clicked on a new polygon point
        _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_x'].push(canvas_x0);
        _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_y'].push(canvas_y0);
        _via_canvas_regions[_via_current_polygon_region_id].frame = current_frame;
      }
    } else {
      var region_id = is_inside_region(_via_click_x0, _via_click_y0);
      if (region_id >= 0) {
        if (_via_img_metadata[_via_image_id].regions[region_id].frame != current_frame) {
          region_id = -1
        }
      }
      if ( region_id >= 0 ) {
        // first click selects region
        _via_user_sel_region_id     = region_id;
        _via_is_region_selected     = true;
        _via_is_user_moving_region  = false;
        _via_is_user_drawing_region = false;

        // de-select all other regions if the user has not pressed Shift
        if ( !e.shiftKey ) {
          annotation_editor_clear_row_highlight();
          toggle_all_regions_selection(false);
        }
        set_region_select_state(region_id, true);

        // show annotation editor only when a single region is selected
        if ( !e.shiftKey ) {
          annotation_editor_show();
        } else {
          annotation_editor_hide();
        }

        // show the region info
        if (_via_is_region_info_visible) {
          var canvas_attr = _via_canvas_regions[region_id].shape_attributes;

          switch (canvas_attr['name']) {
          case VIA_REGION_SHAPE.RECT:
            break;

          case VIA_REGION_SHAPE.BOX_PROMPT:
            break;

          case VIA_REGION_SHAPE.CIRCLE:
            var rf = document.getElementById('region_info');
            var attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;
            rf.innerHTML +=  ',' + ' Radius:' + attr['r'];
            break;

          case VIA_REGION_SHAPE.ELLIPSE:
            var rf = document.getElementById('region_info');
            var attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;
            rf.innerHTML +=  ',' + ' X-radius:' + attr['rx'] + ',' + ' Y-radius:' + attr['ry'];
            break;

          case VIA_REGION_SHAPE.POLYLINE:
          case VIA_REGION_SHAPE.POLYGON:
            break;
          }
        }

        //show_message('Region selected. If you intended to draw a region, click again inside the selected region to start drawing a region.')
      } else {
        if ( _via_is_user_drawing_region ) {
          // clear all region selection
          _via_is_user_drawing_region = false;
          _via_is_region_selected     = false;
          toggle_all_regions_selection(false);
          annotation_editor_hide();
        } else {
          switch (_via_current_shape) {
          case VIA_REGION_SHAPE.POLYLINE: // handled by case for POLYGON
          case VIA_REGION_SHAPE.POLYGON:
            // user has clicked on the first point in a new polygon
            // see also event 'mouseup' for _via_is_user_moving_region=true
            _via_is_user_drawing_polygon = true;

            var canvas_polygon_region = new file_region();
            canvas_polygon_region.shape_attributes['name'] = _via_current_shape;
            canvas_polygon_region.shape_attributes['all_points_x'] = [ Math.round(_via_click_x0) ];
            canvas_polygon_region.shape_attributes['all_points_y'] = [ Math.round(_via_click_y0)] ;
            canvas_polygon_region.frame = current_frame;
            var new_length = _via_canvas_regions.push(canvas_polygon_region);
            _via_current_polygon_region_id = new_length - 1;
            break;

          case VIA_REGION_SHAPE.POINT:
            // user has marked a landmark point
            var point_region = new file_region();
            point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POINT;
            point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
            point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
            point_region.frame = current_frame;
            var region_count = _via_img_metadata[_via_image_id].regions.push(point_region);
            var new_region_id = region_count - 1;
            set_region_annotations_to_default_value( new_region_id );

            var canvas_point_region = new file_region();
            canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POINT;
            canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
            canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
            canvas_point_region.frame = current_frame;
            _via_canvas_regions.push(canvas_point_region);

            annotation_editor_update_content();
            break;

          case VIA_REGION_SHAPE.POSITIVE_POINT:
            // user has marked a landmark point
            var point_region = new file_region();
            point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
            point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
            point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
            point_region.frame = current_frame
            var region_count = _via_img_metadata[_via_image_id].regions.push(point_region);
            var new_region_id = region_count - 1;
            set_region_annotations_to_default_value( new_region_id );

            var canvas_point_region = new file_region();
            canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POSITIVE_POINT;
            canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
            canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
            canvas_point_region.frame = current_frame;
            _via_canvas_regions.push(canvas_point_region);
            processSAMPrompts()
            annotation_editor_update_content();
            break;
          
          case VIA_REGION_SHAPE.NEGATIVE_POINT:
            // user has marked a landmark point
            var point_region = new file_region();
            point_region.shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
            point_region.shape_attributes['cx'] = Math.round(_via_click_x0 * _via_canvas_scale);
            point_region.shape_attributes['cy'] = Math.round(_via_click_y0 * _via_canvas_scale);
            point_region.frame = current_frame
            var region_count = _via_img_metadata[_via_image_id].regions.push(point_region);
            var new_region_id = region_count - 1;
            set_region_annotations_to_default_value( new_region_id );

            var canvas_point_region = new file_region();
            canvas_point_region.shape_attributes['name'] = VIA_REGION_SHAPE.NEGATIVE_POINT;
            canvas_point_region.shape_attributes['cx'] = Math.round(_via_click_x0);
            canvas_point_region.shape_attributes['cy'] = Math.round(_via_click_y0);
            canvas_point_region.frame = current_frame
            _via_canvas_regions.push(canvas_point_region);
            processSAMPrompts();
            annotation_editor_update_content();
            break;
          }
        }
      }
    }
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
    return;
  }

  // indicates that user has finished drawing a new region
  if ( _via_is_user_drawing_region ) {
    _via_is_user_drawing_region = false;
    var region_x0 = _via_click_x0;
    var region_y0 = _via_click_y0;
    var region_x1 = _via_click_x1;
    var region_y1 = _via_click_y1;

    var original_img_region = new file_region();
    var canvas_img_region = new file_region();
    var region_dx = Math.abs(region_x1 - region_x0);
    var region_dy = Math.abs(region_y1 - region_y0);
    var new_region_added = false;

    if ( region_dx > VIA_REGION_MIN_DIM && region_dy > VIA_REGION_MIN_DIM ) { // avoid regions with 0 dim
      switch(_via_current_shape) {
      case VIA_REGION_SHAPE.RECT:
        // ensure that (x0,y0) is top-left and (x1,y1) is bottom-right
        if ( _via_click_x0 < _via_click_x1 ) {
          region_x0 = _via_click_x0;
          region_x1 = _via_click_x1;
        } else {
          region_x0 = _via_click_x1;
          region_x1 = _via_click_x0;
        }

        if ( _via_click_y0 < _via_click_y1 ) {
          region_y0 = _via_click_y0;
          region_y1 = _via_click_y1;
        } else {
          region_y0 = _via_click_y1;
          region_y1 = _via_click_y0;
        }

        var x = Math.round(region_x0 * _via_canvas_scale);
        var y = Math.round(region_y0 * _via_canvas_scale);
        var width  = Math.round(region_dx * _via_canvas_scale);
        var height = Math.round(region_dy * _via_canvas_scale);
        original_img_region.shape_attributes['name'] = 'rect';
        original_img_region.shape_attributes['x'] = x;
        original_img_region.shape_attributes['y'] = y;
        original_img_region.shape_attributes['width'] = width;
        original_img_region.shape_attributes['height'] = height;
        original_img_region.frame = current_frame;

        canvas_img_region.shape_attributes['name'] = 'rect';
        canvas_img_region.shape_attributes['x'] = Math.round( x / _via_canvas_scale );
        canvas_img_region.shape_attributes['y'] = Math.round( y / _via_canvas_scale );
        canvas_img_region.shape_attributes['width'] = Math.round( width / _via_canvas_scale );
        canvas_img_region.shape_attributes['height'] = Math.round( height / _via_canvas_scale );
        canvas_img_region.frame = current_frame;

        new_region_added = true;
        break;
      
      case VIA_REGION_SHAPE.BOX_PROMPT:
        // ensure that (x0,y0) is top-left and (x1,y1) is bottom-right
        if ( _via_click_x0 < _via_click_x1 ) {
          region_x0 = _via_click_x0;
          region_x1 = _via_click_x1;
        } else {
          region_x0 = _via_click_x1;
          region_x1 = _via_click_x0;
        }

        if ( _via_click_y0 < _via_click_y1 ) {
          region_y0 = _via_click_y0;
          region_y1 = _via_click_y1;
        } else {
          region_y0 = _via_click_y1;
          region_y1 = _via_click_y0;
        }

        var x = Math.round(region_x0 * _via_canvas_scale);
        var y = Math.round(region_y0 * _via_canvas_scale);
        var width  = Math.round(region_dx * _via_canvas_scale);
        var height = Math.round(region_dy * _via_canvas_scale);
        original_img_region.shape_attributes['name'] = 'box_prompt';
        original_img_region.shape_attributes['x'] = x;
        original_img_region.shape_attributes['y'] = y;
        original_img_region.shape_attributes['width'] = width;
        original_img_region.shape_attributes['height'] = height;
        original_img_region.frame = current_frame

        canvas_img_region.shape_attributes['name'] = 'box_prompt';
        canvas_img_region.shape_attributes['x'] = Math.round( x / _via_canvas_scale );
        canvas_img_region.shape_attributes['y'] = Math.round( y / _via_canvas_scale );
        canvas_img_region.shape_attributes['width'] = Math.round( width / _via_canvas_scale );
        canvas_img_region.shape_attributes['height'] = Math.round( height / _via_canvas_scale );
        canvas_img_region.frame = current_frame

        new_region_added = true;
        break;
  
      case VIA_REGION_SHAPE.CIRCLE:
        var cx = Math.round(region_x0 * _via_canvas_scale);
        var cy = Math.round(region_y0 * _via_canvas_scale);
        var r  = Math.round( Math.sqrt(region_dx*region_dx + region_dy*region_dy) * _via_canvas_scale );

        original_img_region.shape_attributes['name'] = 'circle';
        original_img_region.shape_attributes['cx'] = cx;
        original_img_region.shape_attributes['cy'] = cy;
        original_img_region.shape_attributes['r'] = r;
        original_img_region.frame = current_frame;

        canvas_img_region.shape_attributes['name'] = 'circle';
        canvas_img_region.shape_attributes['cx'] = Math.round( cx / _via_canvas_scale );
        canvas_img_region.shape_attributes['cy'] = Math.round( cy / _via_canvas_scale );
        canvas_img_region.shape_attributes['r'] = Math.round( r / _via_canvas_scale );
        canvas_img_region.frame = current_frame;

        new_region_added = true;
        break;

      case VIA_REGION_SHAPE.ELLIPSE:
        var cx = Math.round(region_x0 * _via_canvas_scale);
        var cy = Math.round(region_y0 * _via_canvas_scale);
        var rx = Math.round(region_dx * _via_canvas_scale);
        var ry = Math.round(region_dy * _via_canvas_scale);
        var theta = 0;

        original_img_region.shape_attributes['name'] = 'ellipse';
        original_img_region.shape_attributes['cx'] = cx;
        original_img_region.shape_attributes['cy'] = cy;
        original_img_region.shape_attributes['rx'] = rx;
        original_img_region.shape_attributes['ry'] = ry;
        original_img_region.shape_attributes['theta'] = theta;
        original_img_region.frame = current_frame

        canvas_img_region.shape_attributes['name'] = 'ellipse';
        canvas_img_region.shape_attributes['cx'] = Math.round( cx / _via_canvas_scale );
        canvas_img_region.shape_attributes['cy'] = Math.round( cy / _via_canvas_scale );
        canvas_img_region.shape_attributes['rx'] = Math.round( rx / _via_canvas_scale );
        canvas_img_region.shape_attributes['ry'] = Math.round( ry / _via_canvas_scale );
        canvas_img_region.shape_attributes['theta'] = theta;
        canvas_img_region.frame = current_frame;

        new_region_added = true;
        break;

      case VIA_REGION_SHAPE.POINT:    // handled by case VIA_REGION_SHAPE.POLYGON
      case VIA_REGION_SHAPE.POSITIVE_POINT: 
      case VIA_REGION_SHAPE.NEGATIVE_POINT: 
      case VIA_REGION_SHAPE.POLYLINE: // handled by case VIA_REGION_SHAPE.POLYGON
      case VIA_REGION_SHAPE.POLYGON:
        // handled by _via_is_user_drawing_polygon
        break;
      } // end of switch

      if ( new_region_added ) {
        var n1 = _via_img_metadata[_via_image_id].regions.push(original_img_region);
        var n2 = _via_canvas_regions.push(canvas_img_region)

        if ( n1 !== n2 ) {
          console.log('_via_img_metadata.regions[' + n1 + '] and _via_canvas_regions[' + n2 + '] count mismatch');
        }
        var new_region_id = n1 - 1;
        set_region_annotations_to_default_value( new_region_id );
        
        select_only_region(new_region_id);
        if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS &&
             _via_metadata_being_updated === 'region' ) {
          annotation_editor_add_row( new_region_id );
          annotation_editor_scroll_to_row( new_region_id );
          annotation_editor_clear_row_highlight();
          annotation_editor_highlight_row( new_region_id );
        }
        annotation_editor_show();
      }
      _via_redraw_reg_canvas();
      _via_reg_canvas.focus();
      if (_via_current_shape == VIA_REGION_SHAPE.POSITIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.NEGATIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.BOX_PROMPT) {
        processSAMPrompts();
      }
    } else {
      show_message('Prevented accidental addition of a very small region.');
    }
    return;
  }

}

function _via_reg_canvas_mouseover_handler(e) {
  e.stopPropagation();
  // change the mouse cursor icon
  _via_load_canvas_regions();
  _via_redraw_reg_canvas();
  //_via_reg_canvas.focus();
}


function _via_reg_canvas_contextmenu_handler(e) {
  _via_right_click_down = false;
  e.stopPropagation();
  e.preventDefault();
  return null;
}

function _via_reg_canvas_mousemove_handler(e) {
  if ( !_via_current_image_loaded ) {
    return;
  }
  var x1 = e.offsetX;
  var y1 = e.offsetY;
  if (e.shiftKey) {
    var nested_region_ids = is_inside_regions(x1, y1);
    for (var r in nested_region_ids) {
      var nested_region_id = nested_region_ids[r]
      if (nested_region_id >= 0) {
        _via_user_sel_region_id = nested_region_id;
        _via_is_region_selected = true;
        _via_is_user_moving_region = false;
        set_region_select_state(nested_region_id, true);
        if (is_annotation_editor_visible()) {
          annotation_editor_highlight_row(nested_region_id)
        }
        _via_redraw_reg_canvas()
        _via_reg_canvas.focus()
        
      }
    }
    return;
  }
  _via_current_x = e.offsetX; _via_current_y = e.offsetY;

  // display the cursor coordinates
  var rf = document.getElementById('region_info');
  if ( rf != null && _via_is_region_info_visible ) {
    var img_x = Math.round( _via_current_x * _via_canvas_scale );
    var img_y = Math.round( _via_current_y * _via_canvas_scale );
    rf.innerHTML = 'X:' + img_x + ',' + ' Y:' + img_y;
  }

  if ( _via_is_region_selected ) {
    // display the region's info if a region is selected
    if ( rf != null && _via_is_region_info_visible && _via_user_sel_region_id !== -1) {
      var canvas_attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;
      switch (canvas_attr['name']) {
      case VIA_REGION_SHAPE.RECT:
        break;

      case VIA_REGION_SHAPE.BOX_PROMPT:
        // TODO add box prompt fucntionality here
        break;

      case VIA_REGION_SHAPE.CIRCLE:
        var rf = document.getElementById('region_info');
        var attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;
        rf.innerHTML +=  ',' + ' Radius:' + attr['r'];
        break;

      case VIA_REGION_SHAPE.ELLIPSE:
        var rf = document.getElementById('region_info');
        var attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;
        rf.innerHTML +=  ',' + ' X-radius:' + attr['rx'] + ',' + ' Y-radius:' + attr['ry'];
        break;

      case VIA_REGION_SHAPE.POLYLINE:
      case VIA_REGION_SHAPE.POLYGON:
        break;
      }
    }

    if ( !_via_is_user_resizing_region ) {
      // check if user moved mouse cursor to region boundary
      // which indicates an intention to resize the region
      _via_region_edge = is_on_region_corner(_via_current_x, _via_current_y);

      if ( _via_region_edge[0] === _via_user_sel_region_id ) {
        switch(_via_region_edge[1]) {
          // rect
        case 1: // Fall-through // top-left corner of rect
        case 3: // bottom-right corner of rect
          _via_reg_canvas.style.cursor = "nwse-resize";
          break;
        case 2: // Fall-through // top-right corner of rect
        case 4: // bottom-left corner of rect
          _via_reg_canvas.style.cursor = "nesw-resize";
          break;

        case 5: // Fall-through // top-middle point of rect
        case 7: // bottom-middle point of rect
          _via_reg_canvas.style.cursor = "ns-resize";
          break;
        case 6: // Fall-through // top-middle point of rect
        case 8: // bottom-middle point of rect
          _via_reg_canvas.style.cursor = "ew-resize";
          break;

          // circle and ellipse
        case 5:
          _via_reg_canvas.style.cursor = "n-resize";
          break;
        case 6:
          _via_reg_canvas.style.cursor = "e-resize";
          break;

        default:
          _via_reg_canvas.style.cursor = "default";
          break;
        }

        if (_via_region_edge[1] >= VIA_POLYGON_RESIZE_VERTEX_OFFSET) {
          // indicates mouse over polygon vertex
          _via_reg_canvas.style.cursor = "crosshair";
          show_message('To move vertex, simply drag the vertex. To add vertex, press [Ctrl] key and click on the edge. To delete vertex, press [Ctrl] (or [Command]) key and click on vertex.');
        }
      } else {
        var yes = is_inside_this_region(_via_current_x,
                                        _via_current_y,
                                        _via_user_sel_region_id);
        if (yes) {
          _via_reg_canvas.style.cursor = "move";
        } else {
          _via_reg_canvas.style.cursor = "default";
        }

      }
    } else {
      annotation_editor_hide() // resizing
    }
  }

  if(_via_is_user_drawing_region) {
    // draw region as the user drags the mouse cursor
    if (_via_canvas_regions.length) {
      _via_redraw_reg_canvas(); // clear old intermediate rectangle
    } else {
      // first region being drawn, just clear the full region canvas
      _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    }

    var region_x0 = _via_click_x0;
    var region_y0 = _via_click_y0;

    var dx = Math.round(Math.abs(_via_current_x - _via_click_x0));
    var dy = Math.round(Math.abs(_via_current_y - _via_click_y0));
    _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_FILL_COLOR;

    switch (_via_current_shape ) {
    case VIA_REGION_SHAPE.RECT:
      if ( _via_click_x0 < _via_current_x ) {
        if ( _via_click_y0 < _via_current_y ) {
          region_x0 = _via_click_x0;
          region_y0 = _via_click_y0;
        } else {
          region_x0 = _via_click_x0;
          region_y0 = _via_current_y;
        }
      } else {
        if ( _via_click_y0 < _via_current_y ) {
          region_x0 = _via_current_x;
          region_y0 = _via_click_y0;
        } else {
          region_x0 = _via_current_x;
          region_y0 = _via_current_y;
        }
      }

      _via_draw_rect_region(region_x0, region_y0, dx, dy, false);

      // display the current region info
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' W:' + dx + ',' + ' H:' + dy;
      }
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      if ( _via_click_x0 < _via_current_x ) {
        if ( _via_click_y0 < _via_current_y ) {
          region_x0 = _via_click_x0;
          region_y0 = _via_click_y0;
        } else {
          region_x0 = _via_click_x0;
          region_y0 = _via_current_y;
        }
      } else {
        if ( _via_click_y0 < _via_current_y ) {
          region_x0 = _via_current_x;
          region_y0 = _via_click_y0;
        } else {
          region_x0 = _via_current_x;
          region_y0 = _via_current_y;
        }
      }

      _via_draw_box_prompt_region(region_x0, region_y0, dx, dy, false);

      // display the current region info
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' W:' + dx + ',' + ' H:' + dy;
      }
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      var circle_radius = Math.round(Math.sqrt( dx*dx + dy*dy ));
      _via_draw_circle_region(region_x0, region_y0, circle_radius, false);

      // display the current region info
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' Radius:' + circle_radius;
      }
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      _via_draw_ellipse_region(region_x0, region_y0, dx, dy, 0, false);

      // display the current region info
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' X-radius:' + fixfloat(dx) + ',' + ' Y-radius:' + fixfloat(dy);
      }
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      // this is handled by the if ( _via_is_user_drawing_polygon ) { ... }
      // see below
      break;
    }
    _via_reg_canvas.focus();
  }

  if ( _via_is_user_resizing_region ) {
    // user has clicked mouse on bounding box edge and is now moving it
    // draw region as the user drags the mouse coursor
    if (_via_canvas_regions.length) {
      _via_redraw_reg_canvas(); // clear old intermediate rectangle
    } else {
      // first region being drawn, just clear the full region canvas
      _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    }

    var region_id = _via_region_edge[0];
    var attr = _via_canvas_regions[region_id].shape_attributes;
    switch (attr['name']) {
    case VIA_REGION_SHAPE.RECT:
      // original rectangle
      var d = [attr['x'], attr['y'], 0, 0];
      d[2] = d[0] + attr['width'];
      d[3] = d[1] + attr['height'];

      var mx = _via_current_x;
      var my = _via_current_y;
      var preserve_aspect_ratio = false;
      // constrain (mx,my) to lie on a line connecting a diagonal of rectangle
      if ( _via_is_ctrl_pressed ) {
        preserve_aspect_ratio = true;
      }

      rect_update_corner(_via_region_edge[1], d, mx, my, preserve_aspect_ratio);
      rect_standardize_coordinates(d);

      var w = Math.abs(d[2] - d[0]);
      var h = Math.abs(d[3] - d[1]);
      _via_draw_rect_region(d[0], d[1], w, h, true);

      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' W:' + w + ',' + ' H:' + h;
      }
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      // original rectangle
      var d = [attr['x'], attr['y'], 0, 0];
      d[2] = d[0] + attr['width'];
      d[3] = d[1] + attr['height'];

      var mx = _via_current_x;
      var my = _via_current_y;
      var preserve_aspect_ratio = false;
      // constrain (mx,my) to lie on a line connecting a diagonal of rectangle
      if ( _via_is_ctrl_pressed ) {
        preserve_aspect_ratio = true;
      }

      rect_update_corner(_via_region_edge[1], d, mx, my, preserve_aspect_ratio);
      rect_standardize_coordinates(d);

      var w = Math.abs(d[2] - d[0]);
      var h = Math.abs(d[3] - d[1]);
      _via_draw_box_prompt_region(d[0], d[1], w, h, true);

      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' W:' + w + ',' + ' H:' + h;
      }
      break;
  
    case VIA_REGION_SHAPE.CIRCLE:
      var dx = Math.abs(attr['cx'] - _via_current_x);
      var dy = Math.abs(attr['cy'] - _via_current_y);
      var new_r = Math.sqrt( dx*dx + dy*dy );
      _via_draw_circle_region(attr['cx'],
                              attr['cy'],
                              new_r,
                              true);
      if ( rf != null && _via_is_region_info_visible ) {
        var curr_texts = rf.innerHTML.split(",");
        rf.innerHTML = "";
        rf.innerHTML +=  curr_texts[0] + ',' + curr_texts[1] + ',' + ' Radius:' + Math.round(new_r);
      }
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      var new_rx = attr['rx'];
      var new_ry = attr['ry'];
      var new_theta = attr['theta'];
      var dx = Math.abs(attr['cx'] - _via_current_x);
      var dy = Math.abs(attr['cy'] - _via_current_y);
      switch(_via_region_edge[1]) {
      case 5:
        new_ry = Math.sqrt(dx*dx + dy*dy);
        new_theta = Math.atan2(- (_via_current_x - attr['cx']), (_via_current_y - attr['cy']));
        break;

      case 6:
        new_rx = Math.sqrt(dx*dx + dy*dy);
        new_theta = Math.atan2((_via_current_y - attr['cy']), (_via_current_x - attr['cx']));
        break;

      default:
        new_rx = dx;
        new_ry = dy;
        new_theta = 0;
        break;
      }

      _via_draw_ellipse_region(attr['cx'],
                               attr['cy'],
                               new_rx,
                               new_ry,
                               new_theta,
                               true);
      if ( rf != null && _via_is_region_info_visible ) {
        var curr_texts = rf.innerHTML.split(",");
        rf.innerHTML = "";
        rf.innerHTML = curr_texts[0] + ',' + curr_texts[1] + ',' + ' X-radius:' + fixfloat(new_rx) + ',' + ' Y-radius:' + fixfloat(new_ry);
      }
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      var moved_all_points_x = attr['all_points_x'].slice(0);
      var moved_all_points_y = attr['all_points_y'].slice(0);
      var moved_vertex_id = _via_region_edge[1] - VIA_POLYGON_RESIZE_VERTEX_OFFSET;

      moved_all_points_x[moved_vertex_id] = _via_current_x;
      moved_all_points_y[moved_vertex_id] = _via_current_y;

      _via_draw_polygon_region(moved_all_points_x,
                               moved_all_points_y,
                               true,
                               attr['name']);
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' Vertices:' + attr['all_points_x'].length;
      }
      break;
    }
    _via_reg_canvas.focus();
  }

  if ( _via_is_user_moving_region ) {
    // draw region as the user drags the mouse coursor
    if (_via_canvas_regions.length) {
      _via_redraw_reg_canvas(); // clear old intermediate rectangle
    } else {
      // first region being drawn, just clear the full region canvas
      _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    }

    var move_x = (_via_current_x - _via_region_click_x);
    var move_y = (_via_current_y - _via_region_click_y);
    var attr = _via_canvas_regions[_via_user_sel_region_id].shape_attributes;

    switch (attr['name']) {
    case VIA_REGION_SHAPE.RECT:
      _via_draw_rect_region(attr['x'] + move_x,
                            attr['y'] + move_y,
                            attr['width'],
                            attr['height'],
                            true);
      // display the current region info
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' W:' + attr['width'] + ',' + ' H:' + attr['height'];
      }
      break;

      case VIA_REGION_SHAPE.BOX_PROMPT:
        _via_draw_box_prompt_region(attr['x'] + move_x,
                              attr['y'] + move_y,
                              attr['width'],
                              attr['height'],
                              true);
        // display the current region info//     function

        if ( rf != null && _via_is_region_info_visible ) {
          rf.innerHTML +=  ',' + ' W:' + attr['width'] + ',' + ' H:' + attr['height'];
        }
        break;

    case VIA_REGION_SHAPE.CIRCLE:
      _via_draw_circle_region(attr['cx'] + move_x,
                              attr['cy'] + move_y,
                              attr['r'],
                              true);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      if (typeof(attr['theta']) === 'undefined') { attr['theta'] = 0; }
      _via_draw_ellipse_region(attr['cx'] + move_x,
                               attr['cy'] + move_y,
                               attr['rx'],
                               attr['ry'],
                               attr['theta'],
                               true);
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      var moved_all_points_x = attr['all_points_x'].slice(0);
      var moved_all_points_y = attr['all_points_y'].slice(0);
      for (var i=0; i<moved_all_points_x.length; ++i) {
        moved_all_points_x[i] += move_x;
        moved_all_points_y[i] += move_y;
      }
      _via_draw_polygon_region(moved_all_points_x,
                               moved_all_points_y,
                               true,
                               attr['name']);
      if ( rf != null && _via_is_region_info_visible ) {
        rf.innerHTML +=  ',' + ' Vertices:' + attr['all_points_x'].length;
      }
      break;

    case VIA_REGION_SHAPE.POINT:
      _via_draw_point_region(attr['cx'] + move_x,
                             attr['cy'] + move_y,
                             true);
      break;

    case VIA_REGION_SHAPE.POSITIVE_POINT:
      _via_draw_positive_point_region(attr['cx'] + move_x,
                             attr['cy'] + move_y,
                             true);
      break;
    
    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      _via_draw_negative_point_region(attr['cx'] + move_x,
                             attr['cy'] + move_y,
                             true);
      break;
    }
    _via_reg_canvas.focus();
    annotation_editor_hide() // moving
    return;
  }

  if ( _via_is_user_drawing_polygon ) {
    _via_redraw_reg_canvas();
    var attr = _via_canvas_regions[_via_current_polygon_region_id].shape_attributes;
    var all_points_x = attr['all_points_x'];
    var all_points_y = attr['all_points_y'];
    var npts = all_points_x.length;

    if ( npts > 0 ) {
      var line_x = [all_points_x.slice(npts-1), _via_current_x];
      var line_y = [all_points_y.slice(npts-1), _via_current_y];
      _via_draw_polygon_region(line_x, line_y, false, attr['name']);
    }

    if ( rf != null && _via_is_region_info_visible ) {
      rf.innerHTML +=  ',' + ' Vertices:' + npts;
    }
  }
}

function _via_move_selected_regions(move_x, move_y) {
  var i, n;
  n = _via_region_selected_flag.length;
  for ( i = 0; i < n; ++i ) {
    if ( _via_region_selected_flag[i] ) {
      _via_move_region(i, move_x, move_y);
    }
  }
}

function _via_validate_move_region(x, y, canvas_attr) {
  switch( canvas_attr['name'] ) {
    case VIA_REGION_SHAPE.RECT:
      // left and top boundary check
      if (x < 0 || y < 0) {
          show_message('Region moved beyond image boundary. Resetting.');
          return false;
      }
      // right and bottom boundary check
      if ((y + canvas_attr['height']) > _via_current_image_height ||
          (x + canvas_attr['width']) > _via_current_image_width) {
            show_message('Region moved beyond image boundary. Resetting.');
            return false;
      }
    
    case VIA_REGION_SHAPE.BOX_PROMPT:
      // left and top boundary check
      if (x < 0 || y < 0) {
          show_message('Region moved beyond image boundary. Resetting.');
          return false;
      }
      // right and bottom boundary check
      if ((y + canvas_attr['height']) > _via_current_image_height ||
          (x + canvas_attr['width']) > _via_current_image_width) {
            show_message('Region moved beyond image boundary. Resetting.');
            return false;
      }

    // same validation for all
    case VIA_REGION_SHAPE.CIRCLE:
    case VIA_REGION_SHAPE.ELLIPSE:
    case VIA_REGION_SHAPE.POINT:
    case VIA_REGION_SHAPE.POSITIVE_POINT:
    case VIA_REGION_SHAPE.NEGATIVE_POINT:
    case VIA_REGION_SHAPE.POLYLINE:
    case VIA_REGION_SHAPE.POLYGON:
      if (x < 0 || y < 0 ||
          x > _via_current_image_width || y > _via_current_image_height) {
          show_message('Region moved beyond image boundary. Resetting.');
          return false;
      }
  }
  return true;
}

function _via_move_region(region_id, move_x, move_y) {
  var image_attr = _via_img_metadata[_via_image_id].regions[region_id].shape_attributes;
  var canvas_attr = _via_canvas_regions[region_id].shape_attributes;
  switch( canvas_attr['name'] ) {
  case VIA_REGION_SHAPE.RECT:
    var xnew = image_attr['x'] + Math.round(move_x * _via_canvas_scale);
    var ynew = image_attr['y'] + Math.round(move_y * _via_canvas_scale);

    var is_valid = _via_validate_move_region(xnew, ynew, image_attr);
    if (! is_valid ) { break; }

    image_attr['x'] = xnew;
    image_attr['y'] = ynew;

    canvas_attr['x'] = Math.round( image_attr['x'] / _via_canvas_scale);
    canvas_attr['y'] = Math.round( image_attr['y'] / _via_canvas_scale);
    break;

  case VIA_REGION_SHAPE.BOX_PROMPT:
    var xnew = image_attr['x'] + Math.round(move_x * _via_canvas_scale);
    var ynew = image_attr['y'] + Math.round(move_y * _via_canvas_scale);

    var is_valid = _via_validate_move_region(xnew, ynew, image_attr);
    if (! is_valid ) { break; }

    image_attr['x'] = xnew;
    image_attr['y'] = ynew;

    canvas_attr['x'] = Math.round( image_attr['x'] / _via_canvas_scale);
    canvas_attr['y'] = Math.round( image_attr['y'] / _via_canvas_scale);
    if (_via_right_click_down) {
      processSAMPrompts(false)
      makeTempSAMPolygonPermanent(_via_img_metadata[_via_image_id].regions[region_id].frame)
    }
    else {
      processSAMPrompts()
    }
    _via_right_click_down = false;
    break;

  case VIA_REGION_SHAPE.CIRCLE: // Fall-through
  case VIA_REGION_SHAPE.ELLIPSE: // Fall-through
  case VIA_REGION_SHAPE.POINT:
    var cxnew = image_attr['cx'] + Math.round(move_x * _via_canvas_scale);
    var cynew = image_attr['cy'] + Math.round(move_y * _via_canvas_scale);

    var is_valid = _via_validate_move_region(cxnew, cynew, image_attr);
    if (! is_valid ) { break; }

    image_attr['cx'] = cxnew;
    image_attr['cy'] = cynew;

    canvas_attr['cx'] = Math.round( image_attr['cx'] / _via_canvas_scale);
    canvas_attr['cy'] = Math.round( image_attr['cy'] / _via_canvas_scale);
    break;

  case VIA_REGION_SHAPE.POSITIVE_POINT:
    var cxnew = image_attr['cx'] + Math.round(move_x * _via_canvas_scale);
    var cynew = image_attr['cy'] + Math.round(move_y * _via_canvas_scale);

    var is_valid = _via_validate_move_region(cxnew, cynew, image_attr);
    if (! is_valid ) { break; }

    image_attr['cx'] = cxnew;
    image_attr['cy'] = cynew;

    canvas_attr['cx'] = Math.round( image_attr['cx'] / _via_canvas_scale);
    canvas_attr['cy'] = Math.round( image_attr['cy'] / _via_canvas_scale);
    processSAMPrompts();
    break;

  case VIA_REGION_SHAPE.NEGATIVE_POINT:
    var cxnew = image_attr['cx'] + Math.round(move_x * _via_canvas_scale);
    var cynew = image_attr['cy'] + Math.round(move_y * _via_canvas_scale);

    var is_valid = _via_validate_move_region(cxnew, cynew, image_attr);
    if (! is_valid ) { break; }

    image_attr['cx'] = cxnew;
    image_attr['cy'] = cynew;

    canvas_attr['cx'] = Math.round( image_attr['cx'] / _via_canvas_scale);
    canvas_attr['cy'] = Math.round( image_attr['cy'] / _via_canvas_scale);
    processSAMPrompts();
    break;

  case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
  case VIA_REGION_SHAPE.POLYGON:
    var img_px = image_attr['all_points_x'];
    var img_py = image_attr['all_points_y'];
    var canvas_px = canvas_attr['all_points_x'];
    var canvas_py = canvas_attr['all_points_y'];
    // clone for reverting if valiation fails
    var img_px_old = Object.assign({}, img_px);
    var img_py_old = Object.assign({}, img_py);

    // validate move
    for (var i=0; i<img_px.length; ++i) {
      var pxnew = img_px[i] + Math.round(move_x * _via_canvas_scale);
      var pynew = img_py[i] + Math.round(move_y * _via_canvas_scale);
      if (! _via_validate_move_region(pxnew, pynew, image_attr) ) {
        img_px = img_px_old;
        img_py = img_py_old;
        break;
      }
    }
    // move points
    for (var i=0; i<img_px.length; ++i) {
      img_px[i] = img_px[i] + Math.round(move_x * _via_canvas_scale);
      img_py[i] = img_py[i] + Math.round(move_y * _via_canvas_scale);
    }

    for (var i=0; i<canvas_px.length; ++i) {
      canvas_px[i] = Math.round( img_px[i] / _via_canvas_scale );
      canvas_py[i] = Math.round( img_py[i] / _via_canvas_scale );
    }
    break;
  }
}

function _via_polygon_del_vertex(region_id, vertex_id) {
  var rs    = _via_canvas_regions[region_id].shape_attributes;
  var npts  = rs['all_points_x'].length;
  var shape = rs['name'];
  if ( shape !== VIA_REGION_SHAPE.POLYGON && shape !== VIA_REGION_SHAPE.POLYLINE ) {
    show_message('Vertices can only be deleted from polygon/polyline.');
    return false;
  }
  if ( npts <=3 && shape === VIA_REGION_SHAPE.POLYGON ) {
    show_message('Failed to delete vertex because a polygon must have at least 3 vertices.');
    return false;
  }
  if ( npts <=2 && shape === VIA_REGION_SHAPE.POLYLINE ) {
    show_message('Failed to delete vertex because a polyline must have at least 2 vertices.');
    return false;
  }
  // delete vertex from canvas
  _via_canvas_regions[region_id].shape_attributes['all_points_x'].splice(vertex_id, 1);
  _via_canvas_regions[region_id].shape_attributes['all_points_y'].splice(vertex_id, 1);

  // delete vertex from image metadata
  _via_img_metadata[_via_image_id].regions[region_id].shape_attributes['all_points_x'].splice(vertex_id, 1);
  _via_img_metadata[_via_image_id].regions[region_id].shape_attributes['all_points_y'].splice(vertex_id, 1);
  return true;
}

//
// Canvas update routines
//
function _via_redraw_reg_canvas() {
  if (_via_current_image_loaded) {
    _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
    var ai_prompts = getCurrentImagePrompts()
    var box_prompts, point_prompts, mask_prompts;
    box_prompts = ai_prompts['box_prompts'][2]
    point_prompts = ai_prompts['point_prompts'][2]
    mask_prompts = ai_prompts['mask_prompts'][2]
    var total_prompts = box_prompts.length + point_prompts.length + mask_prompts.length
    var ai_masks = getCurrentSAMPolygons()
    var x = document.getElementById('prompt-toolbar')
    if (total_prompts+ai_masks.length > 0) {
      x.style = "height: 3.5 rem; margin-bottom: 10px; align-items: center; display: flex;"
    }
    else {
      x.style = "display: none"
    }
    
    if ( _via_canvas_regions.length > 0 ) {
      if (_via_is_region_boundary_visible) {
        draw_all_regions();
      }
      if (_via_is_region_id_visible) {
        draw_all_region_id();
      }
    }
  }
}

function _via_clear_reg_canvas() {
  _via_reg_ctx.clearRect(0, 0, _via_reg_canvas.width, _via_reg_canvas.height);
  var x = document.getElementById('prompt-toolbar')
  x.style = "display: none"
}


function draw_region(i) {
  var aid = _via_settings.ui.image.region_color;
  var attr, is_selected, aid, avalue;
  var current_frame = document.getElementById('current-frame').value
  
  if (_via_canvas_regions[i].frame != current_frame) {
    return
  }
  attr = _via_canvas_regions[i].shape_attributes;
  is_selected = _via_region_selected_flag[i];

  // region stroke style may depend on attribute value
  _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_FILL_COLOR;
  if ( ! _via_is_user_drawing_polygon &&
        aid !== '__via_default_region_color__' ) {
    avalue = _via_img_metadata[_via_image_id].regions[i].region_attributes[aid];
    if ( _via_canvas_regions_group_color.hasOwnProperty(avalue) ) {
      _via_reg_ctx.strokeStyle = _via_canvas_regions_group_color[avalue];
    }
  }

  switch( attr['name'] ) {
  case VIA_REGION_SHAPE.RECT:
    _via_draw_rect_region(attr['x'],
                          attr['y'],
                          attr['width'],
                          attr['height'],
                          is_selected);
    break;

  case VIA_REGION_SHAPE.BOX_PROMPT:
    _via_draw_box_prompt_region(attr['x'],
                          attr['y'],
                          attr['width'],
                          attr['height'],
                          is_selected);
    break;

  case VIA_REGION_SHAPE.CIRCLE:
    _via_draw_circle_region(attr['cx'],
                            attr['cy'],
                            attr['r'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.ELLIPSE:
    if (typeof(attr['theta']) === 'undefined') { attr['theta'] = 0; }
    _via_draw_ellipse_region(attr['cx'],
                              attr['cy'],
                              attr['rx'],
                              attr['ry'],
                              attr['theta'],
                              is_selected);
    break;

  case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
  case VIA_REGION_SHAPE.POLYGON:
    _via_draw_polygon_region(attr['all_points_x'],
                              attr['all_points_y'],
                              is_selected,
                              attr['name']);
    break;

  case VIA_REGION_SHAPE.POINT:
    _via_draw_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.POSITIVE_POINT:
    _via_draw_positive_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;

  case VIA_REGION_SHAPE.NEGATIVE_POINT:
    _via_draw_negative_point_region(attr['cx'],
                            attr['cy'],
                            is_selected);
    break;
  }
}



function draw_all_regions() {
  var aid = _via_settings.ui.image.region_color;
  var attr, is_selected, aid, avalue;
  var current_frame = document.getElementById('current-frame').value
  for (var i=0; i < _via_canvas_regions.length; ++i) {
    if (_via_canvas_regions[i].frame != current_frame) {
      continue
    }
    attr = _via_canvas_regions[i].shape_attributes;
    is_selected = _via_region_selected_flag[i];

    // region stroke style may depend on attribute value
    _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_FILL_COLOR;
    if ( ! _via_is_user_drawing_polygon &&
         aid !== '__via_default_region_color__' ) {
      avalue = _via_img_metadata[_via_image_id].regions[i].region_attributes[aid];
      if ( _via_canvas_regions_group_color.hasOwnProperty(avalue) ) {
        _via_reg_ctx.strokeStyle = _via_canvas_regions_group_color[avalue];
      }
    }

    switch( attr['name'] ) {
    case VIA_REGION_SHAPE.RECT:
      _via_draw_rect_region(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            is_selected);
      break;

    case VIA_REGION_SHAPE.BOX_PROMPT:
      _via_draw_box_prompt_region(attr['x'],
                            attr['y'],
                            attr['width'],
                            attr['height'],
                            is_selected);
      break;

    case VIA_REGION_SHAPE.CIRCLE:
      _via_draw_circle_region(attr['cx'],
                              attr['cy'],
                              attr['r'],
                              is_selected);
      break;

    case VIA_REGION_SHAPE.ELLIPSE:
      if (typeof(attr['theta']) === 'undefined') { attr['theta'] = 0; }
      _via_draw_ellipse_region(attr['cx'],
                               attr['cy'],
                               attr['rx'],
                               attr['ry'],
                               attr['theta'],
                               is_selected);
      break;

    case VIA_REGION_SHAPE.POLYLINE: // handled by polygon
    case VIA_REGION_SHAPE.POLYGON:
      _via_draw_polygon_region(attr['all_points_x'],
                               attr['all_points_y'],
                               is_selected,
                               attr['name']);
      break;

    case VIA_REGION_SHAPE.POINT:
      _via_draw_point_region(attr['cx'],
                             attr['cy'],
                             is_selected);
      break;

    case VIA_REGION_SHAPE.POSITIVE_POINT:
      _via_draw_positive_point_region(attr['cx'],
                             attr['cy'],
                             is_selected);
      break;

    case VIA_REGION_SHAPE.NEGATIVE_POINT:
      _via_draw_negative_point_region(attr['cx'],
                             attr['cy'],
                             is_selected);
      break;
    }
  }
}

// control point for resize of region boundaries
function _via_draw_control_point(cx, cy) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, VIA_REGION_SHAPES_POINTS_RADIUS, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();

  _via_reg_ctx.fillStyle = VIA_THEME_CONTROL_POINT_COLOR;
  _via_reg_ctx.globalAlpha = 1.0;
  _via_reg_ctx.fill();
}

function _via_draw_rect_region(x, y, w, h, is_selected) {
  if (is_selected) {
    _via_draw_rect(x, y, w, h);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(x  ,   y);
    _via_draw_control_point(x+w, y+h);
    _via_draw_control_point(x  , y+h);
    _via_draw_control_point(x+w,   y);
    _via_draw_control_point(x+w/2,   y);
    _via_draw_control_point(x+w/2, y+h);
    _via_draw_control_point(x    , y+h/2);
    _via_draw_control_point(x+w  , y+h/2);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_rect(x, y, w, h);
    _via_reg_ctx.stroke();

    if ( w > VIA_THEME_REGION_BOUNDARY_WIDTH &&
         h > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_rect(x - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     y - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     w + VIA_THEME_REGION_BOUNDARY_WIDTH,
                     h + VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();

      _via_draw_rect(x + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     y + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     w - VIA_THEME_REGION_BOUNDARY_WIDTH,
                     h - VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_box_prompt_region(x, y, w, h, is_selected) {
  _via_reg_ctx.strokeStyle = "green";
  if (is_selected) {
    _via_draw_rect(x, y, w, h);

    //_via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(x  ,   y);
    _via_draw_control_point(x+w, y+h);
    _via_draw_control_point(x  , y+h);
    _via_draw_control_point(x+w,   y);
    _via_draw_control_point(x+w/2,   y);
    _via_draw_control_point(x+w/2, y+h);
    _via_draw_control_point(x    , y+h/2);
    _via_draw_control_point(x+w  , y+h/2);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_rect(x, y, w, h);
    _via_reg_ctx.stroke();

    if ( w > VIA_THEME_REGION_BOUNDARY_WIDTH &&
         h > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_rect(x - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     y - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     w + VIA_THEME_REGION_BOUNDARY_WIDTH,
                     h + VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();

      _via_draw_rect(x + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     y + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                     w - VIA_THEME_REGION_BOUNDARY_WIDTH,
                     h - VIA_THEME_REGION_BOUNDARY_WIDTH);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_rect(x, y, w, h) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.moveTo(x  , y);
  _via_reg_ctx.lineTo(x+w, y);
  _via_reg_ctx.lineTo(x+w, y+h);
  _via_reg_ctx.lineTo(x  , y+h);
  _via_reg_ctx.closePath();
}

function _via_draw_circle_region(cx, cy, r, is_selected) {
  if (is_selected) {
    _via_draw_circle(cx, cy, r);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(cx + r, cy);
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_circle(cx, cy, r);
    _via_reg_ctx.stroke();

    if ( r > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_circle(cx, cy,
                       r - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
      _via_reg_ctx.stroke();
      _via_draw_circle(cx, cy,
                       r + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_circle(cx, cy, r) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, r, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();
}

function _via_draw_ellipse_region(cx, cy, rx, ry, rr, is_selected) {
  if (is_selected) {
    _via_draw_ellipse(cx, cy, rx, ry, rr);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;

    _via_draw_control_point(cx + rx * Math.cos(rr), cy + rx * Math.sin(rr));
    _via_draw_control_point(cx - rx * Math.cos(rr), cy - rx * Math.sin(rr));
    _via_draw_control_point(cx + ry * Math.sin(rr), cy - ry * Math.cos(rr));
    _via_draw_control_point(cx - ry * Math.sin(rr), cy + ry * Math.cos(rr));

  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_ellipse(cx, cy, rx, ry, rr);
    _via_reg_ctx.stroke();

    if ( rx > VIA_THEME_REGION_BOUNDARY_WIDTH &&
         ry > VIA_THEME_REGION_BOUNDARY_WIDTH ) {
      // draw a boundary line on both sides of the fill line
      _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
      _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
      _via_draw_ellipse(cx, cy,
                        rx + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        ry + VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        rr);
      _via_reg_ctx.stroke();
      _via_draw_ellipse(cx, cy,
                        rx - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        ry - VIA_THEME_REGION_BOUNDARY_WIDTH/2,
                        rr);
      _via_reg_ctx.stroke();
    }
  }
}

function _via_draw_ellipse(cx, cy, rx, ry, rr) {
  _via_reg_ctx.save();

  _via_reg_ctx.beginPath();
  _via_reg_ctx.ellipse(cx, cy, rx, ry, rr, 0, 2 * Math.PI);

  _via_reg_ctx.restore(); // restore to original state
  _via_reg_ctx.closePath();
}

function _via_draw_polygon_region(all_points_x, all_points_y, is_selected, shape) {
  if ( is_selected ) {
    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.beginPath();
    _via_reg_ctx.moveTo(all_points_x[0], all_points_y[0]);
    for ( var i=1; i < all_points_x.length; ++i ) {
      _via_reg_ctx.lineTo(all_points_x[i], all_points_y[i]);
    }
    if ( shape === VIA_REGION_SHAPE.POLYGON ) {
      _via_reg_ctx.lineTo(all_points_x[0], all_points_y[0]); // close loop
    }
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
    for ( var i=0; i < all_points_x.length; ++i ) {
      _via_draw_control_point(all_points_x[i], all_points_y[i]);
    }
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.beginPath();
    _via_reg_ctx.moveTo(all_points_x[0], all_points_y[0]);
    for ( var i=0; i < all_points_x.length; ++i ) {
      _via_reg_ctx.lineTo(all_points_x[i], all_points_y[i]);
    }
    if ( shape === VIA_REGION_SHAPE.POLYGON ) {
      _via_reg_ctx.lineTo(all_points_x[0], all_points_y[0]); // close loop
    }
    _via_reg_ctx.stroke();
  }
}

function _via_draw_positive_point_region(cx, cy, is_selected) {
  _via_reg_ctx.strokeStyle = "green"; // Set the boundary color to green
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle   = "black";
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}

function _via_draw_negative_point_region(cx, cy, is_selected) {
  _via_reg_ctx.strokeStyle = "red"; // Set the boundary color to green
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle   = "black";
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}


function _via_draw_point_region(cx, cy, is_selected) {
  if (is_selected) {
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);

    _via_reg_ctx.strokeStyle = VIA_THEME_SEL_REGION_FILL_BOUNDARY_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_reg_ctx.stroke();

    _via_reg_ctx.fillStyle   = VIA_THEME_SEL_REGION_FILL_COLOR;
    _via_reg_ctx.globalAlpha = VIA_THEME_SEL_REGION_OPACITY;
    _via_reg_ctx.fill();
    _via_reg_ctx.globalAlpha = 1.0;
  } else {
    // draw a fill line
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/2;
    _via_draw_point(cx, cy, VIA_REGION_POINT_RADIUS);
    _via_reg_ctx.stroke();

    // draw a boundary line on both sides of the fill line
    _via_reg_ctx.strokeStyle = VIA_THEME_BOUNDARY_LINE_COLOR;
    _via_reg_ctx.lineWidth   = VIA_THEME_REGION_BOUNDARY_WIDTH/4;
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS - VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
    _via_draw_point(cx, cy,
                    VIA_REGION_POINT_RADIUS + VIA_THEME_REGION_BOUNDARY_WIDTH/2);
    _via_reg_ctx.stroke();
  }
}

function _via_draw_point(cx, cy, r) {
  _via_reg_ctx.beginPath();
  _via_reg_ctx.arc(cx, cy, r, 0, 2*Math.PI, false);
  _via_reg_ctx.closePath();
}

function draw_region_id(i) {
  _via_reg_ctx.shadowColor = "transparent";
  _via_reg_ctx.font = _via_settings.ui.image.region_label_font;
  var current_frame = document.getElementById('current-frame').value
  
  var canvas_reg = _via_canvas_regions[i];
  if (canvas_reg.frame != current_frame) {
    return
  }
  var bbox = get_region_bounding_box(canvas_reg);
  var x = bbox[0];
  var y = bbox[1];
  var w = Math.abs(bbox[2] - bbox[0]);

  var char_width  = _via_reg_ctx.measureText('M').width;
  var char_height = 1.8 * char_width;

  var annotation_str  = (i+1).toString();
  var rattr = _via_img_metadata[_via_image_id].regions[i].region_attributes[_via_settings.ui.image.region_label];
  var rshape = _via_img_metadata[_via_image_id].regions[i].shape_attributes['name'];
  //var rattr = current_frame_metadata.regions[i].region_attributes[_via_settings.ui.image.region_label];
  //var rshape = current_frame_metadata.regions[i].shape_attributes['name'];
  if ( _via_settings.ui.image.region_label !== '__via_region_id__' ) {
    if ( typeof(rattr) !== 'undefined' ) {
      switch( typeof(rattr) ) {
      default:
      case 'string':
        annotation_str = rattr;
        break;
      case 'object':
        annotation_str = Object.keys(rattr).join(',');
        break;
      }
    } else {
      annotation_str = 'undefined';
    }
  }

  var bgnd_rect_width;
  var strw = _via_reg_ctx.measureText(annotation_str).width;
  if ( strw > w ) {
    if ( _via_settings.ui.image.region_label === '__via_region_id__' ) {
      // region-id is always visible in full
      bgnd_rect_width = strw + char_width;
    } else {

      // if text overflows, crop it
      var str_max     = Math.floor((w * annotation_str.length) / strw);
      if ( str_max > 1 ) {
        annotation_str  = annotation_str.substr(0, str_max-1) + '.';
        bgnd_rect_width = w;
      } else {
        annotation_str  = annotation_str.substr(0, 1) + '.';
        bgnd_rect_width = 2 * char_width;
      }
    }
  } else {
    bgnd_rect_width = strw + char_width;
  }

  if (canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYGON ||
      canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYLINE) {
    // put label near the first vertex
    x = canvas_reg.shape_attributes['all_points_x'][0];
    y = canvas_reg.shape_attributes['all_points_y'][0];
  } else {
    // center the label
    x = x - (bgnd_rect_width/2 - w/2);
  }

  // ensure that the text is within the image boundaries
  if ( y < char_height ) {
    y = char_height;
  }

  // first, draw a background rectangle first
  _via_reg_ctx.fillStyle = 'black';
  _via_reg_ctx.globalAlpha = 0.8;
  _via_reg_ctx.fillRect(Math.floor(x),
                        Math.floor(y - 1.1*char_height),
                        Math.floor(bgnd_rect_width),
                        Math.floor(char_height));

  // then, draw text over this background rectangle
  _via_reg_ctx.globalAlpha = 1.0;
  _via_reg_ctx.fillStyle = 'yellow';
  _via_reg_ctx.fillText(annotation_str,
                        Math.floor(x + 0.4*char_width),
                        Math.floor(y - 0.35*char_height));


}

function draw_all_region_id() {
  _via_reg_ctx.shadowColor = "transparent";
  _via_reg_ctx.font = _via_settings.ui.image.region_label_font;
  var current_frame = document.getElementById('current-frame').value
  for ( var i = 0; i < _via_img_metadata[_via_image_id].regions.length; ++i ) {
    var canvas_reg = _via_canvas_regions[i];
    if (canvas_reg.frame != current_frame) {
      continue
    }
    var bbox = get_region_bounding_box(canvas_reg);
    var x = bbox[0];
    var y = bbox[1];
    var w = Math.abs(bbox[2] - bbox[0]);

    var char_width  = _via_reg_ctx.measureText('M').width;
    var char_height = 1.8 * char_width;

    var annotation_str  = (i+1).toString();
    var rattr = _via_img_metadata[_via_image_id].regions[i].region_attributes[_via_settings.ui.image.region_label];
    if ( _via_settings.ui.image.region_label !== '__via_region_id__' ) {
      if ( typeof(rattr) !== 'undefined' ) {
        switch( typeof(rattr) ) {
        default:
        case 'string':
          annotation_str = rattr;
          break;
        case 'object':
          annotation_str = Object.keys(rattr).join(',');
          break;
        }
      } else {
        annotation_str = 'undefined';
      }
    }

    var bgnd_rect_width;
    var strw = _via_reg_ctx.measureText(annotation_str).width;
    if ( strw > w ) {
      if ( _via_settings.ui.image.region_label === '__via_region_id__' ) {
        // region-id is always visible in full
        bgnd_rect_width = strw + char_width;
      } else {

        // if text overflows, crop it
        var str_max     = Math.floor((w * annotation_str.length) / strw);
        if ( str_max > 1 ) {
          annotation_str  = annotation_str.substr(0, str_max-1) + '.';
          bgnd_rect_width = w;
        } else {
          annotation_str  = annotation_str.substr(0, 1) + '.';
          bgnd_rect_width = 2 * char_width;
        }
      }
    } else {
      bgnd_rect_width = strw + char_width;
    }

    if (canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYGON ||
        canvas_reg.shape_attributes['name'] === VIA_REGION_SHAPE.POLYLINE) {
      // put label near the first vertex
      x = canvas_reg.shape_attributes['all_points_x'][0];
      y = canvas_reg.shape_attributes['all_points_y'][0];
    } else {
      // center the label
      x = x - (bgnd_rect_width/2 - w/2);
    }

    // ensure that the text is within the image boundaries
    if ( y < char_height ) {
      y = char_height;
    }

    // first, draw a background rectangle first
    _via_reg_ctx.fillStyle = 'black';
    _via_reg_ctx.globalAlpha = 0.8;
    _via_reg_ctx.fillRect(Math.floor(x),
                          Math.floor(y - 1.1*char_height),
                          Math.floor(bgnd_rect_width),
                          Math.floor(char_height));

    // then, draw text over this background rectangle
    _via_reg_ctx.globalAlpha = 1.0;
    _via_reg_ctx.fillStyle = 'yellow';
    _via_reg_ctx.fillText(annotation_str,
                          Math.floor(x + 0.4*char_width),
                          Math.floor(y - 0.35*char_height));

  }
}

function get_region_bounding_box(region) {
  var d = region.shape_attributes;
  var bbox = new Array(4);

  switch( d['name'] ) {
  case 'rect':
    bbox[0] = d['x'];
    bbox[1] = d['y'];
    bbox[2] = d['x'] + d['width'];
    bbox[3] = d['y'] + d['height'];
    break;

  case 'circle':
    bbox[0] = d['cx'] - d['r'];
    bbox[1] = d['cy'] - d['r'];
    bbox[2] = d['cx'] + d['r'];
    bbox[3] = d['cy'] + d['r'];
    break;

  case 'ellipse':
    let radians = d['theta'];
    let radians90 = radians + Math.PI / 2;
    let ux = d['rx'] * Math.cos(radians);
    let uy = d['rx'] * Math.sin(radians);
    let vx = d['ry'] * Math.cos(radians90);
    let vy = d['ry'] * Math.sin(radians90);

    let width = Math.sqrt(ux * ux + vx * vx) * 2;
    let height = Math.sqrt(uy * uy + vy * vy) * 2;

    bbox[0] = d['cx'] - (width / 2);
    bbox[1] = d['cy'] - (height / 2);
    bbox[2] = d['cx'] + (width / 2);
    bbox[3] = d['cy'] + (height / 2);
    break;

  case 'polyline': // handled by polygon
  case 'polygon':
    var all_points_x = d['all_points_x'];
    var all_points_y = d['all_points_y'];

    var minx = Number.MAX_SAFE_INTEGER;
    var miny = Number.MAX_SAFE_INTEGER;
    var maxx = 0;
    var maxy = 0;
    for ( var i=0; i < all_points_x.length; ++i ) {
      if ( all_points_x[i] < minx ) {
        minx = all_points_x[i];
      }
      if ( all_points_x[i] > maxx ) {
        maxx = all_points_x[i];
      }
      if ( all_points_y[i] < miny ) {
        miny = all_points_y[i];
      }
      if ( all_points_y[i] > maxy ) {
        maxy = all_points_y[i];
      }
    }
    bbox[0] = minx;
    bbox[1] = miny;
    bbox[2] = maxx;
    bbox[3] = maxy;
    break;

  case 'point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;
  
  case 'positive_point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;

  case 'negative_point':
    bbox[0] = d['cx'] - VIA_REGION_POINT_RADIUS;
    bbox[1] = d['cy'] - VIA_REGION_POINT_RADIUS;
    bbox[2] = d['cx'] + VIA_REGION_POINT_RADIUS;
    bbox[3] = d['cy'] + VIA_REGION_POINT_RADIUS;
    break;
  }
  return bbox;
}


function dist_to_line(x, y, x1, y1, x2, y2) {
  if ( is_point_inside_bounding_box(x, y, x1, y1, x2, y2) ) {
    var dy = y2 - y1;
    var dx = x2 - x1;
    var nr = Math.abs( dy*x - dx*y + x2*y1 - y2*x1 );
    var dr = Math.sqrt( dx*dx + dy*dy );
    var dist = nr / dr;
    return Math.round(dist);
  } else {
    return Number.MAX_SAFE_INTEGER;
  }
}

function rect_standardize_coordinates(d) {
  // d[x0,y0,x1,y1]
  // ensures that (d[0],d[1]) is top-left corner while
  // (d[2],d[3]) is bottom-right corner
  if ( d[0] > d[2] ) {
    // swap
    var t = d[0];
    d[0] = d[2];
    d[2] = t;
  }

  if ( d[1] > d[3] ) {
    // swap
    var t = d[1];
    d[1] = d[3];
    d[3] = t;
  }
}

function rect_update_corner(corner_id, d, x, y, preserve_aspect_ratio) {
  // pre-condition : d[x0,y0,x1,y1] is standardized
  // post-condition : corner is moved ( d may not stay standardized )
  if (preserve_aspect_ratio) {
    switch(corner_id) {
    case 1: // Fall-through // top-left
    case 3: // bottom-right
      var dx = d[2] - d[0];
      var dy = d[3] - d[1];
      var norm = Math.sqrt( dx*dx + dy*dy );
      var nx = dx / norm; // x component of unit vector along the diagonal of rect
      var ny = dy / norm; // y component
      var proj = (x - d[0]) * nx + (y - d[1]) * ny;
      var proj_x = nx * proj;
      var proj_y = ny * proj;
      // constrain (mx,my) to lie on a line connecting (x0,y0) and (x1,y1)
      x = Math.round( d[0] + proj_x );
      y = Math.round( d[1] + proj_y );
      break;

    case 2: // Fall-through // top-right
    case 4: // bottom-left
      var dx = d[2] - d[0];
      var dy = d[1] - d[3];
      var norm = Math.sqrt( dx*dx + dy*dy );
      var nx = dx / norm; // x component of unit vector along the diagonal of rect
      var ny = dy / norm; // y component
      var proj = (x - d[0]) * nx + (y - d[3]) * ny;
      var proj_x = nx * proj;
      var proj_y = ny * proj;
      // constrain (mx,my) to lie on a line connecting (x0,y0) and (x1,y1)
      x = Math.round( d[0] + proj_x );
      y = Math.round( d[3] + proj_y );
      break;
    }
  }

  switch(corner_id) {
  case 1: // top-left
    d[0] = x;
    d[1] = y;
    break;

  case 3: // bottom-right
    d[2] = x;
    d[3] = y;
    break;

  case 2: // top-right
    d[2] = x;
    d[1] = y;
    break;

  case 4: // bottom-left
    d[0] = x;
    d[3] = y;
    break;

  case 5: // top-middle
    d[1] = y;
    break;

  case 6: // right-middle
    d[2] = x;
    break;

  case 7: // bottom-middle
    d[3] = y;
    break;

  case 8: // left-middle
    d[0] = x;
    break;
  }
}

var prev_image_id = _via_image_id;

function _via_update_ui_components() {
  if ( ! _via_current_image_loaded ) {
    return;
  }
  show_message('Updating user interface components.');
  switch(_via_display_area_content_name) {
  case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID:
    image_grid_set_content_panel_height_fixed();
    image_grid_set_content_to_current_group();
    break;
  case VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE:
    if ( !_via_is_window_resized && _via_current_image_loaded ) {
      _via_is_window_resized = true;
      _via_show_img(_via_image_index);
      if (_via_is_canvas_zoomed) {
        reset_zoom_level();
      }
    }
    break;
  }
}

//
// Shortcut key handlers
//
function _via_window_keydown_handler(e) {
  if ( e.target === document.body ) {
    // process the keyboard event
    _via_handle_global_keydown_event(e);
  }
}

// global keys are active irrespective of element focus
// arrow keys, n, p, s, o, space, d, Home, End, PageUp, PageDown
function _via_handle_global_keydown_event(e) {
  // zoom
  if (_via_current_image_loaded) {
    if ( e.key === "1" ) {
      select_region_shape(VIA_REGION_SHAPE.RECT);
      return;
    }
    if ( e.key === "2") {
      select_region_shape(VIA_REGION_SHAPE.CIRCLE);
      return;
    }
    if ( e.key === "3") {
      select_region_shape(VIA_REGION_SHAPE.ELLIPSE);
      return;
    }
    if ( e.key === "4") {
      select_region_shape(VIA_REGION_SHAPE.POLYGON);
      return;
    }
    if ( e.key === "5") {
      select_region_shape(VIA_REGION_SHAPE.POINT);
      return;
    }
    if ( e.key === "6") {
      select_region_shape(VIA_REGION_SHAPE.POLYLINE);
      return;
    }
    if ( e.key === "q" || e.key === "Q") {
      select_region_shape(VIA_REGION_SHAPE.POSITIVE_POINT);
      return;
    }
    if ( e.key === "e" || e.key === "E") {
      select_region_shape(VIA_REGION_SHAPE.NEGATIVE_POINT);
      return;
    }
    if ( e.key === "r" || e.key === "R") {
      select_region_shape(VIA_REGION_SHAPE.BOX_PROMPT);
      return;
    }
    if ( e.key === "f" ) {
      confirmSAMPolygons(document.getElementById('current-frame').value)
      return;
    }
    
    if ( e.key === "F" ) {
      confirmSAMPolygons()
      return;
    } 
    if ( e.key === "+") {
      zoom_in();
      return;
    }

    if ( e.key === "=") {
      reset_zoom_level();
      return;
    }

    if ( e.key === "-") {
      zoom_out();
      return;
    }
  }

  if ( e.key === 'ArrowRight' || e.key === 'n') {
    move_to_next_image();
    e.preventDefault();
    currentAttributeIndex = 0;
    return;
  }
  if ( e.key === 'ArrowLeft' || e.key === 'p') {
    move_to_prev_image();
    e.preventDefault();
    currentAttributeIndex = 0;
    return;
  }

  if ( e.key === 'ArrowUp' ) {
    region_visualisation_update('region_label', '__via_region_id__', 1);
    e.preventDefault();
    return;
  }

  if ( e.key === 'ArrowDown' ) {
    region_visualisation_update('region_color', '__via_default_region_color__', -1);
    e.preventDefault();
    return;
  }


  if ( e.key === 'Home') {
    show_first_image();
    e.preventDefault();
    return;
  }
  if ( e.key === 'End') {
    show_last_image();
    e.preventDefault();
    return;
  }
  if ( e.key === 'PageDown') {
    jump_to_next_image_block();
    e.preventDefault();
    return;
  }
  if ( e.key === 'PageUp') {
    jump_to_prev_image_block();
    e.preventDefault();
    return;
  }

  if ( e.key === 'a' ) {
    if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
      // select all in image grid
      image_grid_group_toggle_select_all();
    }
  }

  if ( e.key === 'Escape' ) {
    e.preventDefault();
    if ( _via_is_loading_current_image ) {
      _via_cancel_current_image_loading();
    }

    if ( _via_is_user_resizing_region ) {
      // cancel region resizing action
      _via_is_user_resizing_region = false;
    }

    if ( _via_is_region_selected ) {
      // clear all region selections
      _via_is_region_selected = false;
      _via_user_sel_region_id = -1;
      toggle_all_regions_selection(false);
    }

    if ( _via_is_user_drawing_polygon ) {
      _via_is_user_drawing_polygon = false;
      _via_canvas_regions.splice(_via_current_polygon_region_id, 1);
    }

    if ( _via_is_user_drawing_region ) {
      _via_is_user_drawing_region = false;
    }

    if ( _via_is_user_resizing_region ) {
      _via_is_user_resizing_region = false
    }

    if ( _via_is_user_moving_region ) {
      _via_is_user_moving_region = false
    }

    _via_redraw_reg_canvas();
    return;
  }

  if ( e.key === ' ' ) { // Space key
    if ( e.ctrlKey ) {
      annotation_editor_toggle_on_image_editor();
    } else {
      annotation_editor_toggle_all_regions_editor();
    }
    e.preventDefault();
    return;
  }

  if ( e.key === 'F1' ) { // F1 for help
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.PAGE_GETTING_STARTED);
    e.preventDefault();
    return;
  }
  if ( e.key === 'F2' ) { // F2 for about
    set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.PAGE_ABOUT);
    e.preventDefault();
    return;
  }
}

function _via_reg_canvas_keyup_handler(e) {
  if ( e.key === 'Control' ) {
    _via_is_ctrl_pressed = false;
  }
}

function _via_reg_canvas_keydown_handler(e) {
  if ( e.key === 'Control' ) {
    _via_is_ctrl_pressed = true;
  }

  if (_via_current_image_loaded) {
    if ( e.key === 'Enter' ) {
        if ( _via_current_shape === VIA_REGION_SHAPE.POLYLINE ||
             _via_current_shape === VIA_REGION_SHAPE.POLYGON) {
          _via_polyshape_finish_drawing();
        }
    }
    if ( e.key === 'Backspace' ) {
        if ( _via_current_shape === VIA_REGION_SHAPE.POLYLINE ||
             _via_current_shape === VIA_REGION_SHAPE.POLYGON) {
          _via_polyshape_delete_last_vertex();
        }
    }

    if ( e.key === 'a' ) {
      sel_all_frame_regions();
      e.preventDefault();
      return;
    }

    if ( e.key === 'A' ) {
      sel_all_regions_across_frames()
      show_message('Selected every region across every frame')
      e.preventDefault();
      return;
    }

    if ( e.key === 'c' ) {
      if (_via_is_region_selected ||
          _via_is_all_region_selected) {
        copy_sel_regions();
      }
      e.preventDefault();
      return;
    }

    if ( e.key === 'v' ) {
      paste_sel_regions_in_current_image();
      e.preventDefault();
      return;
    }

    if ( e.key === 'b' ) {
      toggle_region_boundary_visibility();
      e.preventDefault();
      return;
    }

    if ( e.key === 'l' ) {
      toggle_region_id_visibility();
      e.preventDefault();
      return;
    }

    if ( e.key === 'd' ) {
      var p1 = _.cloneDeep(getCurrentSAMPrompts())
      if ( _via_is_region_selected ||
           _via_is_all_region_selected ) {
        del_sel_regions();
      }
      var p2 = getCurrentSAMPrompts()
      if (!(_.isEqual(p1, p2)) ) {
        if (p2.length > 0) {
          processSAMPrompts()
        }        
      }
      e.preventDefault();
      return;
    }

    if ( e.key === 'D' ) {
      if ( _via_is_region_selected) {
        del_sel_same_polygons_after();
      }
      e.preventDefault();
      return;
    }

    if ( _via_is_region_selected ) {
      if ( e.key === 'ArrowRight' ||
           e.key === 'ArrowLeft'  ||
           e.key === 'ArrowDown'  ||
           e.key === 'ArrowUp' ) {
        var del = 1;
        if ( e.shiftKey ) {
          del = 10;
        }
        var move_x = 0;
        var move_y = 0;
        switch( e.key ) {
        case 'ArrowLeft':
          move_x = -del;
          break;
        case 'ArrowUp':
          move_y = -del;
          break;
        case 'ArrowRight':
          move_x =  del;
          break;
        case 'ArrowDown':
          move_y =  del;
          break;
        }
        _via_move_selected_regions(move_x, move_y);
        _via_redraw_reg_canvas();
        e.preventDefault();
        return;
      }
    }
  }
  _via_handle_global_keydown_event(e);
}

function _via_polyshape_finish_drawing() {
  if ( _via_is_user_drawing_polygon ) {
    // double click is used to indicate completion of
    // polygon or polyline drawing action
    var new_region_id = _via_current_polygon_region_id;
    var new_region_shape = _via_current_shape;

    var npts =  _via_canvas_regions[new_region_id].shape_attributes['all_points_x'].length;
    if ( npts <=2 && new_region_shape === VIA_REGION_SHAPE.POLYGON ) {
      show_message('For a polygon, you must define at least 3 points. ' +
                   'Press [Esc] to cancel drawing operation.!');
      return;
    }
    if ( npts <=1 && new_region_shape === VIA_REGION_SHAPE.POLYLINE ) {
      show_message('A polyline must have at least 2 points. ' +
                   'Press [Esc] to cancel drawing operation.!');
      return;
    }

    var img_id = _via_image_id;
    _via_current_polygon_region_id = -1;
    _via_is_user_drawing_polygon = false;
    _via_is_user_drawing_region = false;

    _via_img_metadata[img_id].regions[new_region_id] = {}; // create placeholder
    _via_polyshape_add_new_polyshape(img_id, new_region_shape, new_region_id);
    select_only_region(new_region_id); // select new region
    set_region_annotations_to_default_value( new_region_id );
    annotation_editor_add_row( new_region_id );
    annotation_editor_scroll_to_row( new_region_id );

    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
  }
  return;
}

function _via_polyshape_delete_last_vertex() {
  if ( _via_is_user_drawing_polygon ) {
    var npts = _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_x'].length;
    if ( npts > 0 ) {
      _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_x'].splice(npts - 1, 1);
      _via_canvas_regions[_via_current_polygon_region_id].shape_attributes['all_points_y'].splice(npts - 1, 1);

      _via_redraw_reg_canvas();
      _via_reg_canvas.focus();
    }
  }
}

function _via_polyshape_add_new_polyshape(img_id, region_shape, region_id) {
  // add all polygon points stored in _via_canvas_regions[]
  var all_points_x = _via_canvas_regions[region_id].shape_attributes['all_points_x'].slice(0);
  var all_points_y = _via_canvas_regions[region_id].shape_attributes['all_points_y'].slice(0);
  var current_frame = document.getElementById('current-frame').value;
  var canvas_all_points_x = [];
  var canvas_all_points_y = [];
  var n = all_points_x.length;
  var i;
  for ( i = 0; i < n; ++i ) {
    all_points_x[i] = Math.round( all_points_x[i] * _via_canvas_scale );
    all_points_y[i] = Math.round( all_points_y[i] * _via_canvas_scale );

    canvas_all_points_x[i] = Math.round( all_points_x[i] / _via_canvas_scale );
    canvas_all_points_y[i] = Math.round( all_points_y[i] / _via_canvas_scale );
  }

  var polygon_region = new file_region();
  polygon_region.shape_attributes['name'] = region_shape;
  polygon_region.shape_attributes['all_points_x'] = all_points_x;
  polygon_region.shape_attributes['all_points_y'] = all_points_y;
  polygon_region.frame = current_frame;
  _via_img_metadata[img_id].regions[region_id] = polygon_region;

  // update canvas
  if ( img_id === _via_image_id ) {
    _via_canvas_regions[region_id].shape_attributes['name'] = region_shape;
    _via_canvas_regions[region_id].shape_attributes['all_points_x'] = canvas_all_points_x;
    _via_canvas_regions[region_id].shape_attributes['all_points_y'] = canvas_all_points_y;
    _via_canvas_regions[region_id].frame = current_frame;
  }
}

function del_sel_same_polygons_after() {
  var regions = _via_img_metadata[_via_image_id].regions;
  var selected_regions = [];
  for (var i in _via_region_selected_flag) {
    if (_via_region_selected_flag[i]) {
      selected_regions = selected_regions.concat(regions[i])
    }
  }
  
  var del_idx = [];
  for (var i in selected_regions) {
    var region_i = selected_regions[i]
    var label_i = region_i.region_attributes[_via_current_attribute_id]
    var frame_i = parseInt(region_i.frame)
    for (var j in regions) {
      var region_j = regions[j];
      if (region_j.shape_attributes.name != "polygon") {
        continue
      }
      var label_j = region_j.region_attributes[_via_current_attribute_id]
      var frame_j = parseInt(region_j.frame)
      if (label_i == label_j) {
        if (frame_i <= frame_j) {
          del_idx = del_idx.concat(j)
        }
      }
    }
  }
  var new_regions = []
  for (var i in regions) {
    if (!(del_idx.includes(i))) {
      new_regions = new_regions.concat(regions[i])
    }
  }
  _via_img_metadata[_via_image_id].regions = new_regions;
  _via_load_canvas_regions();
  _via_is_all_region_selected = false;
  _via_is_region_selected     = false;
  _via_redraw_reg_canvas();
  _via_reg_canvas.focus();
  show_message('Deleted '+del_idx.length.toString() + ' polygons with the current selected region labels which occur in current and following frames')
}

function del_sel_regions() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  if ( !_via_current_image_loaded ) {
    show_message('First load some images!');
    return;
  }

  var del_region_count = 0;
  if ( _via_is_all_region_selected ) {
    del_region_count = _via_canvas_regions.length;
    _via_canvas_regions.splice(0);
    _via_img_metadata[_via_image_id].regions.splice(0);
  } else {
    var sorted_sel_reg_id = [];
    for ( var i = 0; i < _via_canvas_regions.length; ++i ) {
      if ( _via_region_selected_flag[i] ) {
        sorted_sel_reg_id.push(i);
        _via_region_selected_flag[i] = false;
      }
    }
    sorted_sel_reg_id.sort( function(a,b) {
      return (b-a);
    });
    for ( var i = 0; i < sorted_sel_reg_id.length; ++i ) {
      _via_canvas_regions.splice( sorted_sel_reg_id[i], 1);
      _via_img_metadata[_via_image_id].regions.splice( sorted_sel_reg_id[i], 1);
      del_region_count += 1;
    }

    if ( sorted_sel_reg_id.length ) {
      _via_reg_canvas.style.cursor = "default";
    }
  }

  _via_is_all_region_selected = false;
  _via_is_region_selected     = false;
  _via_user_sel_region_id     = -1;

  if ( _via_canvas_regions.length === 0 ) {
    // all regions were deleted, hence clear region canvas
    _via_clear_reg_canvas();
  } else {
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
  }
  _via_reg_canvas.focus();
  annotation_editor_show();

  show_message('Deleted ' + del_region_count + ' selected regions');
}

function sel_all_frame_regions() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    image_grid_group_toggle_select_all();
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }
  toggle_all_regions_within_frame_selection(true);
  _via_is_all_region_selected = false;
  _via_is_region_selected = true;
  _via_redraw_reg_canvas();
}

function sel_all_regions_across_frames() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    image_grid_group_toggle_select_all();
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }
  toggle_all_regions_selection(true);
  _via_is_all_region_selected = true;
  _via_is_region_selected = true;
  _via_redraw_reg_canvas();
}

function copy_sel_regions() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }

  if (_via_is_region_selected ||
      _via_is_all_region_selected) {
    _via_copied_image_regions.splice(0);
    for ( var i = 0; i < _via_img_metadata[_via_image_id].regions.length; ++i ) {
      var img_region = _via_img_metadata[_via_image_id].regions[i];
      var canvas_region = _via_canvas_regions[i];
      if ( _via_region_selected_flag[i] ) {
        _via_copied_image_regions.push( clone_image_region(img_region) );
      }
    }
    show_message('Copied ' + _via_copied_image_regions.length +
                 ' selected regions. Press Ctrl + v to paste');
  } else {
    show_message('Select a region first!');
  }
}

function paste_sel_regions_in_current_image() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }
  var current_frame = document.getElementById('current-frame').value
  if ( !_via_current_image_loaded ) {
    show_message('First load some images!');
    return;
  }

  if ( _via_copied_image_regions.length ) {
    var pasted_reg_count = 0;
    for ( var i = 0; i < _via_copied_image_regions.length; ++i ) {
      // ensure copied the regions are within this image's boundaries
      var bbox = get_region_bounding_box( _via_copied_image_regions[i] );
      if (bbox[2] < _via_current_image_width &&
          bbox[3] < _via_current_image_height) {
        var r = clone_image_region(_via_copied_image_regions[i]);
        r.frame = current_frame;
        _via_img_metadata[_via_image_id].regions.push(r);

        pasted_reg_count += 1;
      }
    }
    _via_load_canvas_regions();
    var discarded_reg_count = _via_copied_image_regions.length - pasted_reg_count;
    show_message('Pasted ' + pasted_reg_count + ' regions. ' +
                 'Discarded ' + discarded_reg_count + ' regions exceeding image boundary.');
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
  } else {
    show_message('To paste a region, you first need to select a region and copy it!');
  }
}

function paste_to_multiple_images_with_confirm() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  if ( _via_copied_image_regions.length === 0 ) {
    show_message('First copy some regions!');
    return;
  }

  var config = {'title':'Paste Regions to Multiple Images' };
  var input = { 'region_count': { type:'text', name:'Number of copied regions', value:_via_copied_image_regions.length, disabled:true },
                'prev_next_count':{ type:'text', name:'Copy to (count format)<br><span style="font-size:0.8rem">For example: to paste copied regions to the <i>previous 2 images</i> and <i>next 3 images</i>, type <strong>2,3</strong> in the textbox and to paste only in <i>next 5 images</i>, type <strong>0,5</strong></span>', placeholder:'2,3', disabled:false, size:30},
                'img_index_list':{ type:'text', name:'Copy to (image index list)<br><span style="font-size:0.8rem">For example: <strong>2-5,7,9</strong> pastes the copied regions to the images with the following id <i>2,3,4,5,7,9</i> and <strong>3,8,141</strong> pastes to the images with id <i>3,8 and 141</i></span>', placeholder:'2-5,7,9', disabled:false, size:30},
                'regex':{ type:'text', name:'Copy to filenames matching a regular expression<br><span style="font-size:0.8rem">For example: <strong>_large</strong> pastes the copied regions to all images whose filename contain the keyword <i>_large</i></span>', placeholder:'regular expression', disabled:false, size:30},
                'include_region_attributes':{ type:'checkbox', name:'Paste also the region annotations', checked:true},
              };

  invoke_with_user_inputs(paste_to_multiple_images_confirmed, input, config);
}

function paste_to_multiple_images_confirmed(input) {
  // keep a copy of user inputs for the undo operation
  _via_paste_to_multiple_images_input = input;
  var intersect = generate_img_index_list(input);
  var i;
  var total_pasted_region_count = 0;
  for ( i = 0; i < intersect.length; i++ ) {
    total_pasted_region_count += paste_regions( intersect[i] );
  }

  show_message('Pasted [' + total_pasted_region_count + '] regions ' +
               'in ' + intersect.length + ' images');

  if ( intersect.includes(_via_image_index) ) {
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
  }
  user_input_default_cancel_handler();
}

function paste_regions(img_index) {
  var pasted_reg_count = 0;
  if ( _via_copied_image_regions.length ) {
    var img_id = _via_image_id_list[img_index];
    var i;
    for ( i = 0; i < _via_copied_image_regions.length; ++i ) {
      var r = clone_image_region(_via_copied_image_regions[i]);
      _via_img_metadata[img_id].regions.push(r);

      pasted_reg_count += 1;
    }
  }
  return pasted_reg_count;
}


function del_sel_regions_with_confirm() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  if ( _via_copied_image_regions.length === 0 ) {
    show_message('First copy some regions!');
    return;
  }

  var prev_next_count, img_index_list, regex;
  if ( _via_paste_to_multiple_images_input ) {
    prev_next_count = _via_paste_to_multiple_images_input.prev_next_count.value;
    img_index_list  = _via_paste_to_multiple_images_input.img_index_list.value;
    regex = _via_paste_to_multiple_images_input.regex.value;
  }

  var config = {'title':'Undo Regions Pasted to Multiple Images' };
  var input = { 'region_count': { type:'text', name:'Number of regions selected', value:_via_copied_image_regions.length, disabled:true },
                'prev_next_count':{ type:'text', name:'Delete from (count format)<br><span style="font-size:0.8rem">For example: to delete copied regions from the <i>previous 2 images</i> and <i>next 3 images</i>, type <strong>2,3</strong> in the textbox and to delete regions only in <i>next 5 images</i>, type <strong>0,5</strong></span>', placeholder:'2,3', disabled:false, size:30, value:prev_next_count},
                'img_index_list':{ type:'text', name:'Delete from (image index list)<br><span style="font-size:0.8rem">For example: <strong>2-5,7,9</strong> deletes the copied regions to the images with the following id <i>2,3,4,5,7,9</i> and <strong>3,8,141</strong> deletes regions from the images with id <i>3,8 and 141</i></span>', placeholder:'2-5,7,9', disabled:false, size:30, value:img_index_list},
                'regex':{ type:'text', name:'Delete from filenames matching a regular expression<br><span style="font-size:0.8rem">For example: <strong>_large</strong> deletes the copied regions from all images whose filename contain the keyword <i>_large</i></span>', placeholder:'regular expression', disabled:false, size:30, value:regex},
              };

  invoke_with_user_inputs(del_sel_regions_confirmed, input, config);
}

function del_sel_regions_confirmed(input) {
  user_input_default_cancel_handler();
  var intersect = generate_img_index_list(input);
  var i;
  var total_deleted_region_count = 0;
  for ( i = 0; i < intersect.length; i++ ) {
    total_deleted_region_count += delete_regions( intersect[i] );
  }

  show_message('Deleted [' + total_deleted_region_count + '] regions ' +
               'in ' + intersect.length + ' images');

  if ( intersect.includes(_via_image_index) ) {
    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
  }
}

function delete_regions(img_index) {
  var del_region_count = 0;
  if ( _via_copied_image_regions.length ) {
    var img_id = _via_image_id_list[img_index];
    var i;
    for ( i = 0; i < _via_copied_image_regions.length; ++i ) {
      var copied_region_shape_str = JSON.stringify(_via_copied_image_regions[i].shape_attributes);
      var j;
      // start from last region in order to delete the last pasted region
      for ( j = _via_img_metadata[img_id].regions.length-1; j >= 0; --j ) {
        if ( JSON.stringify(_via_img_metadata[img_id].regions[j].shape_attributes) === copied_region_shape_str ) {
          _via_img_metadata[img_id].regions.splice( j, 1);
          del_region_count += 1;
          break; // delete only one matching region
        }
      }
    }
  }
  return del_region_count;
}

function show_first_image() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_image_grid_group_var.length ) {
      image_grid_group_prev( { 'value':0 } ); // simulate button click
    } else {
      show_message('First, create groups by selecting items from "Group by" dropdown list');
    }
    return;
  }

  if (_via_img_count > 0) {
    _via_show_img( _via_img_fn_list_img_index_list[0] );
  }
}

function show_last_image() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_image_grid_group_var.length ) {
      image_grid_group_prev( { 'value':_via_image_grid_group_var.length-1 } ); // simulate button click
    } else {
      show_message('First, create groups by selecting items from "Group by" dropdown list');
    }
    return;
  }

  if (_via_img_count > 0) {
    var last_img_index = _via_img_fn_list_img_index_list.length - 1;
    _via_show_img( _via_img_fn_list_img_index_list[ last_img_index ] );
  }
}

function jump_image_block_get_count() {
  var n = _via_img_fn_list_img_index_list.length;
  if ( n < 20 ) {
    return 2;
  }
  if ( n < 100 ) {
    return 10;
  }
  if ( n < 1000 ) {
    return 25;
  }
  if ( n < 5000 ) {
    return 50;
  }
  if ( n < 10000 ) {
    return 100;
  }
  if ( n < 50000 ) {
    return 500;
  }

  return Math.round( n / 50 );
}

function jump_to_next_image_block() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  var jump_count = jump_image_block_get_count();
  if ( jump_count > 1 ) {
    var current_img_index = _via_image_index;
    if ( _via_img_fn_list_img_index_list.includes( current_img_index ) ) {
      var list_index = _via_img_fn_list_img_index_list.indexOf( current_img_index );
      var next_list_index = list_index + jump_count;
      if ( (next_list_index + 1) > _via_img_fn_list_img_index_list.length ) {
        next_list_index = 0;
      }
      var next_img_index = _via_img_fn_list_img_index_list[next_list_index];
      _via_show_img(next_img_index);
    }
  } else {
    move_to_next_image();
  }
}

function jump_to_prev_image_block() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    return;
  }

  var jump_count = jump_image_block_get_count();
  if ( jump_count > 1 ) {
    var current_img_index = _via_image_index;
    if ( _via_img_fn_list_img_index_list.includes( current_img_index ) ) {
      var list_index = _via_img_fn_list_img_index_list.indexOf( current_img_index );
      var prev_list_index = list_index - jump_count;
      if ( prev_list_index < 0 ) {
        prev_list_index = _via_img_fn_list_img_index_list.length - 1;
      }
      var prev_img_index = _via_img_fn_list_img_index_list[prev_list_index];
      _via_show_img(prev_img_index);
    }
  } else {
    move_to_prev_image();
  }
}

function move_to_prev_image() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_image_grid_group_var.length ) {
      var last_group_index = _via_image_grid_group_var.length - 1;
      image_grid_group_prev( { 'value':last_group_index } ); // simulate button click
    } else {
      show_message('First, create groups by selecting items from "Group by" dropdown list');
    }
    return;
  }

  if (_via_img_count > 0) {
    var current_img_index = _via_image_index;
    if ( _via_img_fn_list_img_index_list.includes( current_img_index ) ) {
      var list_index = _via_img_fn_list_img_index_list.indexOf( current_img_index );
      var next_list_index = list_index - 1;
      if ( next_list_index === -1 ) {
        next_list_index = _via_img_fn_list_img_index_list.length - 1;
      }
      var next_img_index = _via_img_fn_list_img_index_list[next_list_index];
      _via_show_img(next_img_index);
    } else {
      if ( _via_img_fn_list_img_index_list.length === 0 ) {
        show_message('Filtered file list does not any files!');
      } else {
        _via_show_img( _via_img_fn_list_img_index_list[0] );
      }
    }

    if (typeof _via_hook_prev_image === 'function') {
      _via_hook_prev_image(current_img_index);
    }
  }
}

function move_to_next_image() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_image_grid_group_var.length ) {
      var last_group_index = _via_image_grid_group_var.length - 1;
      image_grid_group_next( { 'value':last_group_index } ); // simulate button click
    } else {
      show_message('First, create groups by selecting items from "Group by" dropdown list');
    }
    return;
  }

  if (_via_img_count > 0) {
    var current_img_index = _via_image_index;
    if ( _via_img_fn_list_img_index_list.includes( current_img_index ) ) {
      var list_index = _via_img_fn_list_img_index_list.indexOf( current_img_index );
      var next_list_index = list_index + 1;
      if ( next_list_index === _via_img_fn_list_img_index_list.length ) {
        next_list_index = 0;
      }
      var next_img_index = _via_img_fn_list_img_index_list[next_list_index];
      _via_show_img(next_img_index);
    } else {
      if ( _via_img_fn_list_img_index_list.length === 0 ) {
        show_message('Filtered file list does not contain any files!');
      } else {
        _via_show_img( _via_img_fn_list_img_index_list[0] );
      }
    }

    if (typeof _via_hook_next_image === 'function') {
      _via_hook_next_image(current_img_index);
    }
  }
}

function set_zoom(zoom_level_index) {
  if ( zoom_level_index === VIA_CANVAS_DEFAULT_ZOOM_LEVEL_INDEX ) {
    _via_is_canvas_zoomed = false;
    _via_canvas_zoom_level_index = VIA_CANVAS_DEFAULT_ZOOM_LEVEL_INDEX;
  } else {
    _via_is_canvas_zoomed = true;
    _via_canvas_zoom_level_index = zoom_level_index;
  }

  var zoom_scale = VIA_CANVAS_ZOOM_LEVELS[_via_canvas_zoom_level_index];
  set_all_canvas_scale(zoom_scale);
  var canvas_w = ( _via_current_image.naturalWidth  * zoom_scale ) / _via_canvas_scale_without_zoom;
  var canvas_h = ( _via_current_image.naturalHeight * zoom_scale ) / _via_canvas_scale_without_zoom;
  set_all_canvas_size(canvas_w, canvas_h);
  _via_canvas_scale = _via_canvas_scale_without_zoom / zoom_scale;
  _via_canvas_scale = _via_canvas_scale_without_zoom / zoom_scale;

  if ( zoom_scale === 1 ) {
    VIA_REGION_POINT_RADIUS = VIA_REGION_POINT_RADIUS_DEFAULT;
  } else {
    if ( zoom_scale > 1 ) {
      VIA_REGION_POINT_RADIUS = VIA_REGION_POINT_RADIUS_DEFAULT * zoom_scale;
    }
  }

  _via_load_canvas_regions(); // image to canvas space transform
  _via_redraw_reg_canvas();
  _via_reg_canvas.focus();
  update_vertical_space();
}

function reset_zoom_level() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    image_grid_image_size_reset();
    show_message('Zoom reset');
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }

  if (_via_is_canvas_zoomed) {
    set_zoom(VIA_CANVAS_DEFAULT_ZOOM_LEVEL_INDEX);
    show_message('Zoom reset');
  } else {
    show_message('Cannot reset zoom because image zoom has not been applied!');
  }
  update_vertical_space();
}

function zoom_in() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    image_grid_image_size_increase();
    show_message('Increased size of images shown in image grid');
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }

  if ( _via_is_user_drawing_polygon || _via_is_user_drawing_region ) {
    return;
  }

  if (_via_canvas_zoom_level_index === (VIA_CANVAS_ZOOM_LEVELS.length-1)) {
    show_message('Further zoom-in not possible');
  } else {
    var new_zoom_level_index = _via_canvas_zoom_level_index + 1;
    set_zoom( new_zoom_level_index );
    show_message('Zoomed in to level ' + VIA_CANVAS_ZOOM_LEVELS[_via_canvas_zoom_level_index] + 'X');
  }
}

function zoom_out() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    image_grid_image_size_decrease();
    show_message('Reduced size of images shown in image grid');
    return;
  }

  if (!_via_current_image_loaded) {
    show_message('First load some images!');
    return;
  }

  if ( _via_is_user_drawing_polygon || _via_is_user_drawing_region ) {
    return;
  }

  if (_via_canvas_zoom_level_index === 0) {
    show_message('Further zoom-out not possible');
  } else {
    var new_zoom_level_index = _via_canvas_zoom_level_index - 1;
    set_zoom( new_zoom_level_index );
    show_message('Zoomed out to level ' + VIA_CANVAS_ZOOM_LEVELS[_via_canvas_zoom_level_index] + 'X');
  }
}

function toggle_region_boundary_visibility() {
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE ) {
    _via_is_region_boundary_visible = !_via_is_region_boundary_visible;
    _via_redraw_reg_canvas();
    _via_reg_canvas.focus();
  }

  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( _via_settings.ui.image_grid.show_region_shape ) {
      _via_settings.ui.image_grid.show_region_shape = false;
      document.getElementById('image_grid_content_rshape').innerHTML = '';
    } else {
      _via_settings.ui.image_grid.show_region_shape = true;
      image_grid_page_show_all_regions();
    }
  }
}

function toggle_region_id_visibility() {
  _via_is_region_id_visible = !_via_is_region_id_visible;
  _via_redraw_reg_canvas();
  _via_reg_canvas.focus();
}

function toggle_region_info_visibility() {
  var elem = document.getElementById('region_info');
  // toggle between displaying and not displaying
  if ( elem.classList.contains('display_none') ) {
    elem.classList.remove('display_none');
    _via_is_region_info_visible = true;
  } else {
    elem.classList.add('display_none');
    _via_is_region_info_visible = false;
  }
}

//
// Mouse wheel event listener
//
function _via_reg_canvas_mouse_wheel_listener(e) {
  if (!_via_current_image_loaded) {
    return;
  }

  if ( e.ctrlKey ) {
    // perform zoom
    if (e.deltaY < 0) {
      zoom_in();
    } else {
      zoom_out();
    }
    e.preventDefault();
  }
}

function region_visualisation_update(type, default_id, next_offset) {
  var attr_list = [ default_id ];
  attr_list = attr_list.concat(Object.keys(_via_attributes['region']));
  var n = attr_list.length;
  var current_index = attr_list.indexOf(_via_settings.ui.image[type]);
  var new_index;
  if ( current_index !== -1 ) {
    new_index = current_index + next_offset;

    if ( new_index < 0 ) {
      new_index = n + new_index;
    }
    if ( new_index >= n ) {
      new_index = new_index - n;
    }
    switch(type) {
    case 'region_label':
      _via_settings.ui.image.region_label = attr_list[new_index];
      _via_redraw_reg_canvas();
      break;
    case 'region_color':
      _via_settings.ui.image.region_color = attr_list[new_index];
      _via_regions_group_color_init();
      _via_redraw_reg_canvas();
    }

    var type_str = type.replace('_', ' ');
    if ( _via_settings.ui.image[type].startsWith('__via') ) {
      show_message(type_str + ' cleared');
    } else {
      show_message(type_str + ' set to region attribute [' + _via_settings.ui.image[type] + ']');
    }
  }
}

//
// left sidebar toolbox maintainer
//
function leftsidebar_toggle() {
  var leftsidebar = document.getElementById('leftsidebar');
  if ( leftsidebar.style.display === 'none' ) {
    leftsidebar.style.display = 'table-cell';
    document.getElementById('leftsidebar_collapse_panel').style.display = 'none';
  } else {
    leftsidebar.style.display = 'none';
    document.getElementById('leftsidebar_collapse_panel').style.display = 'table-cell';
  }
  _via_update_ui_components();
}

function leftsidebar_increase_width() {
  var leftsidebar = document.getElementById('leftsidebar');
  var new_width = _via_settings.ui.leftsidebar_width + VIA_LEFTSIDEBAR_WIDTH_CHANGE;
  leftsidebar.style.width = new_width + 'rem';
  _via_settings.ui.leftsidebar_width = new_width;
  if ( _via_current_image_loaded ) {
    _via_show_img(_via_image_index);
  }
}

function leftsidebar_decrease_width() {
  var leftsidebar = document.getElementById('leftsidebar');
  var new_width = _via_settings.ui.leftsidebar_width - VIA_LEFTSIDEBAR_WIDTH_CHANGE;
  if ( new_width >= 5 ) {
    leftsidebar.style.width = new_width + 'rem';
    _via_settings.ui.leftsidebar_width = new_width;
    if ( _via_current_image_loaded ) {
      _via_show_img(_via_image_index);
    }
  }
}

function leftsidebar_show() {
  var leftsidebar = document.getElementById('leftsidebar');
  leftsidebar.style.display = 'table-cell';
  document.getElementById('leftsidebar_collapse_panel').style.display = 'none';
}

// source: https://www.w3schools.com/howto/howto_js_accordion.asp
function init_leftsidebar_accordion() {
  var leftsidebar = document.getElementById('leftsidebar');
  leftsidebar.style.width = _via_settings.ui.leftsidebar_width + 'rem';

  var acc = document.getElementsByClassName('leftsidebar_accordion');
  var i;
  for ( i = 0; i < acc.length; ++i ) {
    acc[i].addEventListener('click', function() {
      update_vertical_space();
      this.classList.toggle('active');
      this.nextElementSibling.classList.toggle('show');

      switch( this.innerHTML ) {
      case 'Attributes':
        update_attributes_update_panel();
        break;
      case 'Project':
        update_img_fn_list();
        break;
      }
    });
  }
}



//
// region and file attributes update panel
//



//
// annotations editor panel
//

var _via_last_selected_region_attribute = ''
var _via_last_selected_region = ''
function update_selected_region_attribute(e) {
  if (_via_last_selected_region == '') {
    _via_last_selected_region = e;
  }
  else {
    _via_last_selected_region.setAttribute('style', "background-color: linear-gradient(to right, #248af7dc, #0056b3);");
  }
  _via_last_selected_region_attribute = e.innerHTML;
  e.setAttribute('style' , "background-color: black");
  _via_last_selected_region = e;
  if (_via_current_shape == VIA_REGION_SHAPE.POSITIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.NEGATIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.BOX_PROMPT) {
    processSAMPrompts()
  }
}

var currentAttributeIndex = 0
function cycleRegionAttributes(attr_name1) {
  var attr_name = _via_current_attribute_id;
  var allRegionAttributes = Object.keys(_via_attributes.region)
  var regionAttributes = Object.keys(_via_attributes.region[attr_name].options);
  var numAttributes = regionAttributes.length;
  var regionType = _via_attributes.region[attr_name]['type']

  // Get the new attribute index
  currentAttributeIndex = (currentAttributeIndex + 1) % numAttributes;
  var newAttribute = regionAttributes[currentAttributeIndex];

  // Update the attribute for all selected regions
  _via_img_metadata[_via_image_id].regions.forEach((region, index) => {
    if (_via_region_selected_flag[index]) {
      if (regionType == 'radio'){
        region.region_attributes[attr_name] = newAttribute;
      }
    }
  });

  // Update the display or any necessary UI refresh
  var selectedCount = _via_img_metadata[_via_image_id].regions.filter(function(region, index) {
    return _via_region_selected_flag[index];
  }).length;
  return [selectedCount, _via_region_selected_flag];
}

var currentAttributeIndex = 0
function cycleFileAttributes(attr_name) {
  var allFileAttributes = Object.keys(_via_attributes.file)
  var fileAttributes = Object.keys(_via_attributes.file[attr_name].options);
  var numAttributes = fileAttributes.length;
  var fileType = _via_attributes.file[attr_name]['type']

  // Get the new attribute index
  currentAttributeIndex = (currentAttributeIndex + 1) % numAttributes;
  var newAttribute = fileAttributes[currentAttributeIndex];

  // Update the attribute for all selected regions
  if (fileType == 'radio') {
    _via_img_metadata[_via_image_id].file_attributes[attr_name] = newAttribute
  }

  // Update the display or any necessary UI refresh
}


var m_via_region_selected_flag = _via_region_selected_flag;
document.addEventListener('keydown', function(event) {
  if (event.key === '.') {
    if (is_annotation_editor_visible()) {
      var label_id = null
      if (_via_last_selected_region_attribute == '') {
        if (_via_current_attribute_id != '') {
          label_id = _via_current_attribute_id
        }
      }
      const [sel_count, m_via_region_selected_flag] = cycleRegionAttributes(label_id);
      show_message("Selected bounding boxes: " + sel_count);
      _via_region_selected_flag = m_via_region_selected_flag
      annotation_editor_update_content()

    }
  }
});

document.addEventListener('keydown', function(event) {
  if (event.key === '/') {
    if (is_annotation_editor_visible()) {
      cycleFileAttributes(_via_last_selected_region_attribute);
      annotation_editor_update_content()
    }
  }

});


function _via_get_file_metadata_stat(img_index_list, attr_id) {
  var stat = {};
  stat[attr_id] = {};
  var i, n, img_id, img_index, value;
  n = img_index_list.length;
  for ( i = 0; i < n; ++i ) {
    img_index = img_index_list[i];
    img_id = _via_image_id_list[img_index];
    if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
      value = _via_img_metadata[img_id].file_attributes[attr_id];
      if ( typeof(value) === 'object' ) {
        // checkbox has multiple values and hence is object
        var key;
        for ( key in value ) {
          if ( stat[attr_id].hasOwnProperty(key) ) {
            stat[attr_id][key] += 1;
          } else {
            stat[attr_id][key] = 1;
          }
        }
      } else {
        if ( stat[attr_id].hasOwnProperty(value) ) {
          stat[attr_id][value] += 1;
        } else {
          stat[attr_id][value] = 1;
        }
      }
    }

  }
  return stat;
}

function _via_get_region_metadata_stat(img_index_list, attr_id) {
  var stat = {};
  stat[attr_id] = {};
  var i, n, img_id, img_index, value;
  var j, m;
  n = img_index_list.length;
  for ( i = 0; i < n; ++i ) {
    img_index = img_index_list[i];
    img_id = _via_image_id_list[img_index];
    m = _via_img_metadata[img_id].regions.length;
    for ( j = 0; j < m; ++j ) {
      if ( ! image_grid_is_region_in_current_group( _via_img_metadata[img_id].regions[j].region_attributes ) ) {
        // skip region not in current group
        continue;
      }

      value = _via_img_metadata[img_id].regions[j].region_attributes[attr_id];
      if ( typeof(value) === 'object' ) {
        // checkbox has multiple values and hence is object
        var key;
        for ( key in value ) {
          if ( stat[attr_id].hasOwnProperty(key) ) {
            stat[attr_id][key] += 1;
          } else {
            stat[attr_id][key] = 1;
          }
        }
      } else {
        if ( stat[attr_id].hasOwnProperty(value) ) {
          stat[attr_id][value] += 1;
        } else {
          stat[attr_id][value] = 1;
        }
      }
    }
  }
  return stat;
}

// invoked when the input entry in annotation editor receives focus
function annotation_editor_on_metadata_focus(p) {
  if ( _via_annotation_editor_mode === VIA_ANNOTATION_EDITOR_MODE.ALL_REGIONS ) {
    var pid       = annotation_editor_extract_html_id_components(p.id);
    var region_id = pid.row_id;
    // clear existing highlights (if any)
    toggle_all_regions_selection(false);
    annotation_editor_clear_row_highlight();
    // set new selection highlights
    set_region_select_state(region_id, true);
    //annotation_editor_scroll_to_row(region_id);
    annotation_editor_highlight_row(region_id);

    _via_redraw_reg_canvas();
  }
}

// invoked when the user updates annotations using the annotation editor
function annotation_editor_on_metadata_update(p) {
  var pid       = annotation_editor_extract_html_id_components(p.id);
  var img_id    = _via_image_id;

  var img_index_list = [ _via_image_index ];
  var region_id = pid.row_id;
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    img_index_list = _via_image_grid_selected_img_index_list.slice(0);
    region_id = -1; // this flag denotes that we want to update all regions
  }

  if ( _via_metadata_being_updated === 'file' ) {
    annotation_editor_update_file_metadata(img_index_list, pid.attr_id, p.value, p.checked).then( function(update_count) {
      annotation_editor_on_metadata_update_done('file', pid.attr_id, update_count);
    }, function(err) {
      console.log(err)
      show_message('Failed to update file attributes! ' + err);
    });
    return;
  }

  if ( _via_metadata_being_updated === 'region' ) {
    annotation_editor_update_region_metadata(img_index_list, region_id, pid.attr_id, p.value, p.checked).then( function(update_count) {
      annotation_editor_on_metadata_update_done('region', pid.attr_id, update_count);
    }, function(err) {
      show_message('Failed to update region attributes! ');
    });
    return;
  }
}

function annotation_editor_on_metadata_update_done(type, attr_id, update_count) {
  show_message('Updated ' + type + ' attributes of ' + update_count + ' ' + type + 's');
  // check if the updated attribute is one of the group variables
  var i, n, type, attr_id;
  n = _via_image_grid_group_var.length;
  var clear_all_group = false;
  for ( i = 0; i < n; ++i ) {
    if ( _via_image_grid_group_var[i].type === type &&
         _via_image_grid_group_var[i].name === attr_id ) {
      clear_all_group = true;
      break;
    }
  }
  _via_regions_group_color_init();
  _via_redraw_reg_canvas();

  // @todo: it is wasteful to cancel the full set of groups.
  // we should only cancel the groups that are affected by this update.
  if ( _via_display_area_content_name === VIA_DISPLAY_AREA_CONTENT_NAME.IMAGE_GRID ) {
    if ( clear_all_group ) {
      image_grid_show_all_project_images();
    }
  }
}

function annotation_editor_update_file_metadata(img_index_list, attr_id, new_value, new_checked) {
  return new Promise( function(ok_callback, err_callback) {
    var i, n, img_id, img_index;
    n = img_index_list.length;
    var update_count = 0;
    for ( i = 0; i < n; ++i ) {
      img_index = img_index_list[i];
      img_id = _via_image_id_list[img_index];

      switch( _via_attributes['file'][attr_id].type ) {
      case 'text':  // fallback
      case 'radio': // fallback
      case 'dropdown': // fallback
      case 'image':
        _via_img_metadata[img_id].file_attributes[attr_id] = new_value;
        update_count += 1;
        break;

      case 'checkbox':
        var option_id = new_value;
        if ( _via_img_metadata[img_id].file_attributes.hasOwnProperty(attr_id) ) {
          if ( typeof(_via_img_metadata[img_id].file_attributes[attr_id]) !== 'object' ) {
            var old_value = _via_img_metadata[img_id].file_attributes[attr_id];
            _via_img_metadata[img_id].file_attributes[attr_id] = {};
            if ( Object.keys(_via_attributes['file'][attr_id]['options']).includes(old_value) ) {
              // transform existing value as checkbox option
              _via_img_metadata[img_id].file_attributes[attr_id] = {};
              _via_img_metadata[img_id].file_attributes[attr_id][old_value] = true;
            }
          }
        } else {
          _via_img_metadata[img_id].file_attributes[attr_id] = {};
        }
        if ( new_checked ) {
          _via_img_metadata[img_id].file_attributes[attr_id][option_id] = true;
        } else {
          // false option values are not stored
          delete _via_img_metadata[img_id].file_attributes[attr_id][option_id];
        }
        update_count += 1;
        break;
      }
    }
    ok_callback(update_count);
  });
}

function annotation_editor_update_region_metadata(img_index_list, region_id, attr_id, new_value, new_checked) {
  return new Promise( function(ok_callback, err_callback) {
    var i, n, img_id, img_index;
    n = img_index_list.length;
    var update_count = 0;
    var region_list = [];
    var j, m;

    if ( region_id === -1 ) {
      // update all regions on a file (for image grid view)
      for ( i = 0; i < n; ++i ) {
        img_index = img_index_list[i];
        img_id = _via_image_id_list[img_index];

        m = _via_img_metadata[img_id].regions.length;
        for ( j = 0; j < m; ++j ) {
          if ( ! image_grid_is_region_in_current_group( _via_img_metadata[img_id].regions[j].region_attributes ) ) {
            continue;
          }

          switch( _via_attributes['region'][attr_id].type ) {
          case 'text':  // fallback
          case 'dropdown': // fallback
          case 'radio': // fallback
          case 'image':
            _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = new_value;
            update_count += 1;
            break;
          case 'checkbox':
            var option_id = new_value;
            if ( _via_img_metadata[img_id].regions[j].region_attributes.hasOwnProperty(attr_id) ) {
              if ( typeof(_via_img_metadata[img_id].regions[j].region_attributes[attr_id]) !== 'object' ) {
                var old_value = _via_img_metadata[img_id].regions[j].region_attributes[attr_id];
                _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = {}
                if ( Object.keys(_via_attributes['region'][attr_id]['options']).includes(old_value) ) {
                  // transform existing value as checkbox option
                  _via_img_metadata[img_id].regions[j].region_attributes[attr_id][old_value] = true;
                }
              }
            } else {
              _via_img_metadata[img_id].regions[j].region_attributes[attr_id] = {};
            }

            if ( new_checked ) {
              _via_img_metadata[img_id].regions[j].region_attributes[attr_id][option_id] = true;
            } else {
              // false option values are not stored
              delete _via_img_metadata[img_id].regions[j].region_attributes[attr_id][option_id];
            }
            update_count += 1;
            break;
          }
        }
      }
    } else {
      // update a single region in a file (for single image view)
      // update all regions on a file (for image grid view)
      for ( i = 0; i < n; ++i ) {
        img_index = img_index_list[i];
        img_id = _via_image_id_list[img_index];

        switch( _via_attributes['region'][attr_id].type ) {
        case 'text':  // fallback
        case 'dropdown': // fallback
        case 'radio': // fallback
        case 'image':
          _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = new_value;
          update_count += 1;
          break;
        case 'checkbox':
          var option_id = new_value;

          if ( _via_img_metadata[img_id].regions[region_id].region_attributes.hasOwnProperty(attr_id) ) {
            if ( typeof(_via_img_metadata[img_id].regions[region_id].region_attributes[attr_id]) !== 'object' ) {
              var old_value = _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id];
              _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = {};
              if ( Object.keys(_via_attributes['region'][attr_id]['options']).includes(old_value) ) {
                // transform existing value as checkbox option
                _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][old_value] = true;
              }
            }
          } else {
            _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id] = {};
          }

          if ( new_checked ) {
            _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][option_id] = true;
          } else {
            // false option values are not stored
            delete _via_img_metadata[img_id].regions[region_id].region_attributes[attr_id][option_id];
          }
          update_count += 1;
          break;
        }
      }
      if (_via_current_shape == VIA_REGION_SHAPE.POSITIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.NEGATIVE_POINT || _via_current_shape == VIA_REGION_SHAPE.BOX_PROMPT) {
        processSAMPrompts()
      }
    }
    ok_callback(update_count);
  });
}

function set_region_annotations_to_default_value(rid) {
  var attr_id;
  for ( attr_id in _via_attributes['region'] ) {
    var attr_type = _via_attributes['region'][attr_id].type;
    switch( attr_type ) {
    case 'text':
      var default_value = _via_attributes['region'][attr_id].default_value;
      if ( typeof(default_value) !== 'undefined' ) {
        _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = default_value;
      }
      break;
    case 'image':    // fallback
    case 'dropdown': // fallback
    case 'radio':
      _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = '';
      var default_options = _via_attributes['region'][attr_id].default_options;
      if ( typeof(default_options) !== 'undefined' ) {
        _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = Object.keys(default_options)[0];
      }
      break;

    case 'checkbox':
      _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id] = {};
      var default_options = _via_attributes['region'][attr_id].default_options;
      if ( typeof(default_options) !== 'underfined' ) {
        var option_id;
        for ( option_id in default_options ) {
          var default_value = default_options[option_id];
          if ( typeof(default_value) !== 'underfined' ) {
            _via_img_metadata[_via_image_id].regions[rid].region_attributes[attr_id][option_id] = default_value;
          }
        }
      }
      break;
    }
  }
}

function set_file_annotations_to_default_value(image_id) {
  var attr_id;
  for ( attr_id in _via_attributes['file'] ) {
    var attr_type = _via_attributes['file'][attr_id].type;
    switch( attr_type ) {
    case 'text':
      var default_value = _via_attributes['file'][attr_id].default_value;
      _via_img_metadata[image_id].file_attributes[attr_id] = default_value;
      break;
    case 'image':    // fallback
    case 'dropdown': // fallback
    case 'radio':
      _via_img_metadata[image_id].file_attributes[attr_id] = '';
      var default_options = _via_attributes['file'][attr_id].default_options;
      _via_img_metadata[image_id].file_attributes[attr_id] = Object.keys(default_options)[0];
      break;
    case 'checkbox':
      _via_img_metadata[image_id].file_attributes[attr_id] = {};
      var default_options = _via_attributes['file'][attr_id].default_options;
      var option_id;
      for ( option_id in default_options ) {
        var default_value = default_options[option_id];
        _via_img_metadata[image_id].file_attributes[attr_id][option_id] = default_value;
      }
      break;
    }
  }
}

function annotation_editor_increase_panel_height() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_height < 95 ) {
    _via_settings.ui.annotation_editor_height += VIA_ANNOTATION_EDITOR_HEIGHT_CHANGE;
    p.style.height = _via_settings.ui.annotation_editor_height + '%';
  }
}

function annotation_editor_decrease_panel_height() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_height > 10 ) {
    _via_settings.ui.annotation_editor_height -= VIA_ANNOTATION_EDITOR_HEIGHT_CHANGE;
    p.style.height = _via_settings.ui.annotation_editor_height + '%';
  }
}

function annotation_editor_increase_content_size() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_fontsize < 1.6 ) {
    _via_settings.ui.annotation_editor_fontsize += VIA_ANNOTATION_EDITOR_FONTSIZE_CHANGE;
    p.style.fontSize = _via_settings.ui.annotation_editor_fontsize + 'rem';
  }
}

function annotation_editor_decrease_content_size() {
  var p = document.getElementById('annotation_editor_panel');
  if ( _via_settings.ui.annotation_editor_fontsize > 0.4 ) {
    _via_settings.ui.annotation_editor_fontsize -= VIA_ANNOTATION_EDITOR_FONTSIZE_CHANGE;
    p.style.fontSize = _via_settings.ui.annotation_editor_fontsize + 'rem';
  }
}

//
// via project
//

function saveProject(filename) {
  var config = {'title':'Save Project' };
  var input = { 'project_name': { type:'text', name:'Project Name', value:_via_settings.project.name, disabled:false, size:30 },
                'save_annotations':{ type:'checkbox', name:'Save region and file annotations (i.e. manual annotations)', checked:true, disabled:false},
                'save_attributes':{ type:'checkbox', name:'Save region and file attributes.', checked:true},
                'save_via_settings':{ type:'checkbox', name:'Save VIA application settings', checked:true},
                //                'save_base64_data':{ type:'checkbox', name:'Save base64 data of images (if present)', checked:false},
                //                'save_images':{type:'checkbox', 'name':'Save images <span class="warning">(WARNING: only recommended for projects containing small number of images)</span>', value:false},
              };
  if ( input.project_name.value !== _via_settings.project.name ) {
      project_set_name(input.project_name.value);
  }

  var _via_project = {
      '_via_settings': _via_settings,
      '_via_img_metadata': _via_img_metadata,
      '_via_attributes': _via_attributes,
      '_via_data_format_version': '2.0.10',
      '_via_image_id_list': _via_image_id_list
  };

  // var filename = input.project_name.value + '.json';
  var data_blob = new Blob([JSON.stringify(_via_project)], {type: 'text/json;charset=utf-8'});

  // Send data to the server to save on server-side
  fetch('/simple-image-annotator/save_json', {
      method: 'POST',
      headers: {
          'Content-Type': 'application/json',
      },
      body: JSON.stringify({
          filename: filename,
          project_data: JSON.stringify(_via_project),
      }),
  })
  .then(response => response.json())
  .then(data => {
      if (data.message) {
          console.log('Success:', data.message);
      } else {
          console.error('Error:', data.error);
      }
  })
  .catch((error) => {
      console.error('Error:', error);
  });
  document.getElementById('fileLoadPathInput').value = ''
  //document.getElementById('fileSavePathInput').value = ''
  show_message('Project saved to '+ filename)
  user_input_default_cancel_handler();
}


function save_data_to_local_file(data, filename) {
  var a      = document.createElement('a');
  a.href     = URL.createObjectURL(data);
  a.download = filename;

  // simulate a mouse click event
  var event = new MouseEvent('click', {
    view: window,
    bubbles: true,
    cancelable: true
  });
  a.dispatchEvent(event);

  // @todo: replace a.dispatchEvent() with a.click()
  // a.click() based trigger is supported in Chrome 70 and Safari 11/12 but **not** in Firefox 63
  //a.click();
}

function importAIStudioAnnotations(jsonFilename) {
  fetch('/simple-image-annotator/import_ai_studio_annotation', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename: jsonFilename })
    })
    .then(response => response.json())
    .then(data => {
        import_annotations_from_json(JSON.stringify(data));
    })
    .catch(error => {
        console.error('Error loading annotations:', error);
    });
    show_message('Annotations loaded from '+ jsonFilename)
}


function loadProject(jsonFilename) {
    fetch('/simple-image-annotator/load_json', {
        method: 'POST',
        headers: {
            'Content-Type': 'application/json'
        },
        body: JSON.stringify({ filename: jsonFilename })
    })
    .then(response => response.json())
    .then(data => {
        project_open_parse_json_file(JSON.stringify(data));
    })
    .catch(error => {
        console.error('Error loading project:', error);
    });
    document.getElementById('fileLoadPathInput').value = ''
    document.getElementById('fileSavePathInput').value = jsonFilename
    show_message('Project loaded from '+ jsonFilename)
}

function showLoadModal() {
    document.getElementById('myLoadModal').style.display = "block";
}

function showImportModal() {
    document.getElementById('myImportModal').style.display = "block";
}

function showSaveModal() {
    document.getElementById('mySaveModal').style.display = "block";
}

function closeLoadModal() {
    document.getElementById('myLoadModal').style.display = "none";
}

function closeSaveModal() {
    document.getElementById('mySaveModal').style.display = "none";
}

function closeImportModal() {
    document.getElementById('myImportModal').style.display = "none";
}

function acceptLoadFilePath() {
    var filePath = document.getElementById('fileLoadPathInput').value;
    closeLoadModal();
    loadProject(filePath);
}

function acceptImportFilePath() {
    var filePath = document.getElementById('fileImportPathInput').value;
    closeImportModal();
    importAIStudioAnnotations(filePath);
}

function acceptSaveFilePath() {
    var filePath = document.getElementById('fileSavePathInput').value;
    closeSaveModal();
    saveProject(filePath);
}




async function set_num_frames(current_image) {
  // if (_via_current_image_filename == null) 
  //   return
  var num_frames = current_image['frame_paths'].length
  document.getElementById('video-slider').setAttribute('max', num_frames-1)
  document.getElementById('video-slider').value = current_image.last_viewed_frame
  document.getElementById('current-frame').value = current_image.last_viewed_frame
  if (num_frames-1 == 0) {
    document.getElementById('video-slider').disabled = true
    document.getElementById('current-frame').disabled = true
  }
  else {
    document.getElementById('video-slider').disabled = false
    document.getElementById('current-frame').disabled = false
  }
  return;
  
}


var is_preloading = false;
async function preload_images(current_image, current_frame, max_frame, n_frames) {
  if (is_preloading) {
    return; // Prevent re-entry if already preloading
  }
  is_preloading = true
  var max_frame_int = parseInt(max_frame);
  // Calculate how many frames to preload before and after the current frame
  var startFrame, endFrame;
  const tasks = [];
  if (current_frame === 0) {
    // If current frame is 0, preload the next n_frames
    startFrame = 0;
    endFrame = Math.min(n_frames, max_frame_int);
  } else if (current_frame === max_frame_int) {
    // If current frame is the last frame, preload the previous n_frames
    startFrame = Math.max(current_frame - n_frames, 0);
    endFrame = current_frame;
  } else {
    // For other frames, preload previous and next frames, maintaining n_frames total
    var frames_before = Math.min(current_frame, Math.floor(n_frames / 2)); // Preload half before
    var frames_after = Math.min(n_frames - frames_before, max_frame_int - current_frame); // Preload remaining after

    startFrame = Math.max(current_frame - frames_before, 0);
    endFrame = Math.min(current_frame + frames_after, max_frame_int);
  }

  var unique_id1 = current_image.unique_id;
  var filename = unique_id1.split('/')[unique_id1.split('/').length-1]
  var extension = filename.split('.')[filename.split('.').length-1]
  for (var frame = startFrame; frame < endFrame; frame++) {
    var frame_str = frame.toString().padStart(5, '0');
    var unique_id = unique_id1.replace(filename, `${frame_str}.${extension}`)
    var cachedImage = precached_bimg.get(unique_id);
    if (!cachedImage) { // Only cache if not already in cache
      const new_image =  await render_file(unique_id);
      const img = new Image();
      img.src = new_image;
      precached_bimg.set(unique_id, img);
    }
  }
  is_preloading = false;
}

var debounceTimeout = null;

function debouncedGetCurrentImage() {
  clearTimeout(debounceTimeout);
  debounceTimeout = setTimeout(() => {  
    get_current_image();
  }, 50); // Adjust the timeout duration as needed
}

var current_img_cache = new Map();

async function set_current_image(file_name, extra_params) {
  const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([file_name, sorted_extra_params]);
  if (current_img_cache.get(key)) {
    var m_current_image = current_img_cache.get(key)
    return m_current_image
  }
  const response = await fetch('/im-vid-rendering/async_render', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      file_name: file_name,
      extra_params: extra_params,
    })
  }); 
  if (!response.ok) {
    throw new Error('Failed to fetch unique name');
  }
  const jsonResponse = await response.json();
  if (!jsonResponse.hasOwnProperty('result')) {
    throw new Error('Response does not contain result');
  }
  console.log(jsonResponse)
  var file_name, extra_params, unique_id, frame_paths;
  file_name = jsonResponse['result']['file_name']
  extra_params = jsonResponse['result']['extra_params']
  unique_id = jsonResponse['result']['paths'][0]
  frame_paths = jsonResponse['result']['paths']
  var m_current_image = new file_info(file_name, extra_params, unique_id, frame_paths, 0);
  current_img_cache.set(key, m_current_image)
  return m_current_image;
}

var consecutive_current_image_timer = Date.now();

function get_current_extra_params() {
  // TODO get extra params from HTML elements
  return {};
}

async function get_current_image() {
  var img_id = _via_image_index
  var current_image = _via_image_filename_list[img_id]
  var video_slider_elem = document.getElementById('video-slider')
  var input_text_frame_elem = document.getElementById('current-frame')
  if (parseInt(input_text_frame_elem.value) < 0 || parseInt(video_slider_elem.value) < 0) {
    video_slider_elem.value = "0"
    input_text_frame_elem.value = "0"
  }
  else if (parseInt(input_text_frame_elem.value) > video_slider_elem.max) {
    video_slider_elem.value = video_slider_elem.max
    input_text_frame_elem.value = video_slider_elem.max
  }
  if (document.activeElement == input_text_frame_elem)
    video_slider_elem.value = input_text_frame_elem.value
  else if (document.activeElement == video_slider_elem)
    input_text_frame_elem.value =  video_slider_elem.value

  // TODO add extra params here from html elements
  var extra_params = get_current_extra_params();
  
  async function get_image(preload) {
    var bim_idx = _via_img_buffer_get_html_id(_via_image_index);
    if (bim_idx == null) {
      return;
    }
    
    var bimg = document.getElementById(bim_idx)
    if (bimg == null)
      return
    const sorted_extra_params = Array.from(extra_params).sort((a, b) => a[0].localeCompare(b[0]));
    var key = JSON.stringify([current_image, sorted_extra_params])
    var m_current_image = current_img_cache.get(key)
    m_current_image.last_viewed_frame = parseInt(input_text_frame_elem.value)
    var current_frame = parseInt(input_text_frame_elem.value);
    var frame_paths = m_current_image.frame_paths
    var unique_id = frame_paths[current_frame]
    var cachedImage = precached_bimg.get(unique_id);

    // If the image is cached, load it from cache
    if (cachedImage) {
      bimg.src = cachedImage.src;

    } else {
      var new_image = await render_file(unique_id);
      const imgObj = new Image();
      imgObj.src = new_image;
      bimg.setAttribute("src", new_image);
      precached_bimg.set(unique_id, imgObj);
      if (preload && !is_preloading) {
        preload_images(m_current_image, current_frame, video_slider_elem.max, limit);
      }
    }  

    _via_load_canvas_regions();
    _via_redraw_reg_canvas();
    annotation_editor_remove();
    annotation_editor_show();
    annotation_editor_hide();
    image_updated = true;
    return;
  }
  get_image(true)
}


async function addSAMv2Prompts() {
  if (sam2_is_fetching) {
    show_message('Please wait while SAM2 is fetching. If you want to do refinement, add/edit/remove any of the prompts once predictions are over.')
    return;
  }
  var bimg = _via_img_buffer_get_html_id(_via_image_index);
  var filename = _via_current_image_filename;
  var metadata = _via_img_metadata[_via_image_id];
  var window_width = document.getElementById('window_width').value
  var window_center = document.getElementById('window_center').value
  var filename2 = document.getElementById(bimg).src
  var num_frames = document.getElementById('video-slider').max
  const payload = {
    filename: filename,
    metadata: metadata,
    window_center: window_center,
    window_width: window_width,
    num_frames: num_frames,
    _via_image_id: _via_image_id,
    _via_attributes: _via_attributes,
    _via_last_selected_region_attribute: _via_last_selected_region_attribute,
    orient: document.getElementById('orientation').value
  };
  const response = await fetch('/simple-image-annotator/add_samv2_prompts', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload),
  });
  return response
}


async function getMultiImageSAMv2Outputs(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var file_name = frame_paths[current_frame]
  var prompts = getCurrentImagePrompts()
  var label_id = null
  if (_via_last_selected_region_attribute == '') {
    if (_via_current_attribute_id != '') {
      label_id = _via_current_attribute_id
    }
  }
  else {
    label_id = _via_last_selected_region
  }
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      frame_num: current_frame,
      box_prompts: prompts['box_prompts'],
      point_prompts: prompts['point_prompts'],
      mask_prompts: prompts['mask_prompts'],
      _via_attributes: _via_attributes,
      label_id: label_id,
      model_name: 'SAM2.1 (Tiny)'
    };
    const response = await fetch('/sam-ai/multi_image_sam2_predict_per_frame', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    if (clear_previous_prompts) clearCurrentImageSAMPolygons();
    var polygons = await response.json();
    for (var p in polygons) {
      var polygon = polygons[p]

      var point_region = new file_region();
      point_region.shape_attributes['name'] = VIA_REGION_SHAPE.POLYGON;
      point_region.shape_attributes['all_points_x'] = polygon.shape_attributes.all_points_x;
      point_region.shape_attributes['all_points_y'] = polygon.shape_attributes.all_points_y;
      point_region.region_attributes = polygon.region_attributes;
      point_region.frame = polygon.frame_num;
      _via_img_metadata[_via_image_id].regions.push(point_region);
      
    }
    annotation_editor_update_content();
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
    return
  }
}


async function setInitTrackButtonLabel() {
  const btn = document.getElementById('init_track_video_btn');
  const statusResponse = await getSAMv2VideoStatus();
  const status = statusResponse['result'];
  if (status === 'DONE') {
    btn.innerText = 'Track polygons in video';
    btn.disabled = false;
    btn.onclick = trackPolygonsInVideo;
  } else if (status === 'ERROR') {
    btn.innerText = 'Init failed. Retry';
    btn.onclick = handleInitSAMv2;
    btn.disabled = false;
    console.error("SAM initialization failed.");
  } else if ( status === 'RUNNING') {
    btn.innerText = 'Video init in progress...';
    btn.disabled = true;
  } else if (status === 'NOT_STARTED' || status === 'NO_TASK') {
    btn.disabled = false;
    btn.innerText = 'Init for Video Prediction';
    btn.onclick = handleInitSAMv2;
  } else {
    show_message('Status: ' + status);
  }
}

async function handleInitSAMv2() {
  const btn = document.getElementById('init_track_video_btn');
  btn.disabled = true;
  btn.innerText = 'Video init in progress...';

  // Call init API
  await initSAMv2ForVideo();

  // Start polling for status
  const intervalId = setInterval(async () => {
    const statusResponse = await getSAMv2VideoStatus();
    const status = statusResponse['result'];

    if (status === 'DONE') {
      clearInterval(intervalId);
      btn.disabled = false;
      btn.innerText = 'Track polygons in video';
      btn.onclick = trackPolygonsInVideo;
    } else if (status === 'ERROR') {
      clearInterval(intervalId);
      btn.disabled = false;
      btn.innerText = 'Init failed. Retry';
      btn.onclick = handleInitSAMv2;
      console.error("SAM initialization failed.");
    }
    // For other statuses like RUNNING, NOT_STARTED, NO_TASK, keep polling.
  }, 2000); // check every 2 seconds
}

async function initSAMv2ForVideo() {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      model_name: 'SAM2.1 (Tiny)'
    };
    const response = await fetch('/sam-ai/multi_image_sam2_init', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    var result =  await response.json()
    return result
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
  
}

async function getSAMv2VideoStatus(){
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      model_name: 'SAM2.1 (Tiny)'
    };
    const response = await fetch('/sam-ai/multi_image_sam2_status', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
    return await response.json()
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
  
}


async function trackWithSAMV2(clear_previous_prompts=true) {
  const sorted_extra_params = Array.from(get_current_extra_params()).sort((a, b) => a[0].localeCompare(b[0]));
  var key = JSON.stringify([_via_image_id, sorted_extra_params])
  var m_current_image = current_img_cache.get(key)
  var frame_paths = m_current_image['frame_paths']
  var extra_params = m_current_image['extra_params']
  var current_frame = document.getElementById('current-frame').value
  var file_name = frame_paths[current_frame]
  var prompts = getCurrentImagePrompts()
  var label_id = null
  if (_via_last_selected_region_attribute == '') {
    if (_via_current_attribute_id != '') {
      label_id = _via_current_attribute_id
    }
  }
  else {
    label_id = _via_last_selected_region
  }
  try {
    const payload = {
      file_name: _via_image_filename_list[_via_image_index],
      extra_params: extra_params,
      frame_num: current_frame,
      box_prompts: prompts['box_prompts'],
      point_prompts: prompts['point_prompts'],
      mask_prompts: prompts['mask_prompts'],
      _via_attributes: _via_attributes,
      label_id: label_id,
      model_name: 'SAM2.1 (Tiny)'
    };
    const response = await fetch('/sam-ai/multi_image_sam2_predict', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      throw new Error(`Error: ${response.statusText}`);
    }
  } catch (error) {
    console.error('Failed to get SAM outputs:', error);
  }
}



async function processSAMPrompts(clear_previous_prompts=true) {
  //var num_frames = m_current_image['frame_paths'].length
  getSingleImageSAMOutputs(clear_previous_prompts);
  // if (num_frames == 1) {
  //   getMobileSAMOutputs() 
  // }
  // else {
  //   show_message('Wait while video is getting initialized')
  //   var r = await addSAMv2Prompts()
  //   sam_v2_out_dir = await r.text()
  //   show_message('Added new prompts. Add/remove prompts or press F to start prediction');
  // }
}

var sam2_out_success = false;
var sam2_is_fetching = false;
var sam2_prompts;
async function getSAMv2Outputs() {
  if (sam2_is_fetching) {
    show_message('SAM2 prediction is going on currently. Please wait while this finishes.')
    return;
  }
  var num_frames = document.getElementById('video-slider').max
  var via_attributes = _via_attributes
  var via_last_selected_region_attribute = _via_last_selected_region_attribute
  show_message("Starting predictions for current image")
  sam2_out_success = false;
  sam2_prompts = _.cloneDeep(getCurrentSAMPrompts())
  const eventSource = new EventSource(`/simple-image-annotator/get_samv2_outputs?out_dir=${sam_v2_out_dir}&num_frames=${num_frames}&_via_image_id=${_via_image_id}&_via_attributes=${JSON.stringify(via_attributes)}&_via_last_selected_region_attribute=${_via_last_selected_region_attribute}`);
  eventSource.onmessage = function(event) {
    // Parse the JSON string to an object
    const data = JSON.parse(event.data);
    if ("is_initializing" in data) {
      if (data["is_initializing"]) {
        show_message('Video is being initialized. Try predicting after a few seconds.')
        return;
      }
    }
    if ("error" in data ) {
      eventSource.close();  // Close the connection if there's an error
      show_message(data.error)
      sam2_prompts = [];
      sam2_out_success = false;
      sam2_is_fetching = false;
      return
    }
    if ("success" in data) {
      sam2_out_success = true;
      show_message('Finished fetching predictions. Add/edit/remove prompts for refinement or press F again to confirm the polygons')
      return;
    }
    for (var p in data.polygons) {
      var polygon = data.polygons[p]
      var polygon_file_region = new file_region()
      var image_id = data._via_image_id
      polygon_file_region.region_attributes = polygon.region_attributes
      polygon_file_region.shape_attributes = polygon.shape_attributes
      polygon_file_region.frame = polygon.frame.toString()
      _via_img_metadata[image_id]['regions'] = _via_img_metadata[image_id]['regions'].concat(polygon_file_region)
      // _via_add_canvas_region(polygon_file_region)
    }
    sam2_is_fetching = true;
    show_message('Fetched predictions for current image frame: '+data.frame_idx, 500)
    _via_load_canvas_regions()
    _via_redraw_reg_canvas()
  };

  eventSource.onerror = function(event) {
    eventSource.close();  // Close the connection if there's an error
    if (!sam2_out_success) {
      show_message('There was some error during the predictions. Check your prompts properly and try again.')
      sam2_prompts = [];
      resetSAMv2Predictor();
    }
    sam2_out_success = false;
    sam2_is_fetching = false;
  };
}


async function callUploadAPI(event) {
  var user_selected_images = invisible_file_input.files;
  var formData = new FormData();
  var new_img_index_list = [];
  var discarded_file_count = 0;
  var current_files = _via_image_filename_list.length
  // Append each selected file to FormData
  for (let i = 0; i < user_selected_images.length; i++) {
      formData.append("files", user_selected_images[i]); // "files" matches Flask's request.files.getlist('files')
  }
  if (user_selected_images.length == 0) {
    alert("Please select some files to upload!");
    return;
  }
  
  img_loading_spinbar(current_files, true);
  try {
      let response = await fetch("/file-uploader/upload", {
          method: "POST",
          body: formData
      });
      // this.files = null;
      // invisible_file_input.value = null;

      let result = await response.json();
      console.log("Upload Response:", result);
      var current_images = result['images']
      for (let i = 0; i < current_images.length; i++) {
        var filetype = user_selected_images[i].type.substr(0, 5);
        var current_image = current_images[i]
        console.log(current_image)
        // continue;
        if ( filetype === 'image' || filetype === 'video' ) {
          // check which filename in project matches the user selected file
          var img_index = _via_image_filename_list.indexOf(current_image.file_name);
          if( img_index === -1) {
            // a new file was added to project
            var new_img_id = project_add_uploaded_file(current_image, user_selected_images[i].name);
            _via_uploaded_file_id_list.add(new_img_id);
            _via_img_fileref[new_img_id] = user_selected_images[i];
            set_file_annotations_to_default_value(new_img_id);
            new_img_index_list.push( _via_image_id_list.indexOf(new_img_id) );
          } else {
            // an existing file was resolved using browser's file selector
            var img_id = _via_image_id_list[img_index];
            _via_img_fileref[img_id] = user_selected_images[i];
            _via_img_metadata[img_id]['size'] = -1;
          }
        } else {
          discarded_file_count += 1;
        }
      }
      
      if ( _via_img_metadata ) {
        var status_msg = 'Loaded ' + new_img_index_list.length + ' images.';
        if ( discarded_file_count ) {
          status_msg += ' ( Discarded ' + discarded_file_count + ' non-image files! )';
        }
        show_message(status_msg);

        if ( new_img_index_list.length ) {
          // show first of newly added image
          _via_show_img( new_img_index_list[0] );
        } else {
          // show original image
          _via_show_img ( _via_image_index );
        }
        update_img_fn_list();
      } else {
        show_message("Please upload some image files!");
      }

      if (response.ok) {
          //alert("Files uploaded successfully!");
          show_message("Files uploaded successfully!");
          jump_to_image(current_files)
          
      } else {
          message("Upload failed: " + result.error);
      }
      //jump_to_image(current_files)
  } catch (error) {
      console.error("Error uploading files:", error);
      show_message("Upload failed!");
  }
  img_loading_spinbar(current_files, false);
  invisible_file_input.value = null;
  invisible_file_input.files = null; 
}


//
// image grid
//


// everything to do with image zooming
function image_zoom_init() {

}

//
// hooks for sub-modules
// implemented by sub-modules
//
//function _via_hook_next_image() {}
//function _via_hook_prev_image() {}


////////////////////////////////////////////////////////////////////////////////
//
// Code borrowed from via2 branch
// - in future, the <canvas> based reigon shape drawing will be replaced by <svg>
//   because svg allows independent manipulation of individual regions without
//   requiring to clear the canvas every time some region is updated.
//
////////////////////////////////////////////////////////////////////////////////

////////////////////////////////////////////////////////////////////////////////
//
// @file        _via_region.js
// @description Implementation of region shapes like rectangle, circle, etc.
// @author      Abhishek Dutta <adutta@robots.ox.ac.uk>
// @date        17 June 2017
//
////////////////////////////////////////////////////////////////////////////////

//
// image buffering
//


function _via_cancel_current_image_loading() {
  var panel = document.getElementById('project_panel_title');
  panel.innerHTML = 'Project';
  _via_is_loading_current_image = false;
}

async function _via_show_img(img_index) {
  console.log('_via_show_img()');
  if ( _via_is_loading_current_image ) {
    return;
  }
  var img_id = _via_image_id_list[img_index];
  _via_image_id = img_id
  if ( ! _via_img_metadata.hasOwnProperty(img_id) ) {
    console.log('_via_show_img(): [' + img_index + '] ' + img_id + ' does not exist!')
    show_message('The requested image does not exist!')
    return;
  }

  var current_image = await set_current_image(_via_image_filename_list[img_index], {});
  setInitTrackButtonLabel();
  set_num_frames(current_image);
  // file_resolve() is not necessary for files selected using browser's file selector
  if ( typeof(_via_img_fileref[img_id]) === 'undefined' || ! _via_img_fileref[img_id] instanceof File ) {
    // try preload from local file or url
    if ( typeof(_via_img_src[img_id]) === 'undefined' || _via_img_src[img_id] === '' ) {
      _via_img_src[img_id] = await render(_via_image_filename_list[img_index], current_image.last_viewed_frame, {})
      _via_show_img(img_index)
      return
    }
  }

  

  if ( _via_buffer_img_index_list.includes(img_index) ) {
    _via_current_image_loaded = false;
    _via_show_img_from_buffer(img_index).then( function(ok_img_index) {
      // trigger preload of images in buffer corresponding to img_index
      // but, wait until all previous promises get cancelled
      Promise.all(_via_preload_img_promise_list).then( function(values) {
        _via_preload_img_promise_list = [];
        var preload_promise = _via_img_buffer_start_preload( img_index, 0 )
        _via_preload_img_promise_list.push(preload_promise);
      });
    }, function(err_img_index) {
      console.log('_via_show_img_from_buffer() failed for file: ' + _via_image_filename_list[err_img_index]);
      _via_current_image_loaded = false;
    });
  } else {
    // image not in buffer, so first add this image to buffer
    _via_is_loading_current_image = true;
    img_loading_spinbar(img_index, true);
    _via_img_buffer_add_image(img_index).then( function(ok_img_index) {
      _via_is_loading_current_image = false;
      img_loading_spinbar(img_index, false);
      _via_show_img(img_index);
    }, function(err_img_index) {
      _via_is_loading_current_image = false;
      img_loading_spinbar(img_index, false);
      show_page_404(img_index);
      console.log('_via_img_buffer_add_image() failed for file: ' + _via_image_filename_list[err_img_index]);
    });
  }
  //populateMetadataWindow();
  // get_current_image();
  

  //document.getElementById('window-center').value = ''
  //document.getElementById('window-width').value = ''
  //getOrientationCode();
  //precached_bimg.set(unique_id, );
  
  preload_images(current_image, 0, current_image['frame_paths'].length, limit);
}



//
// settings
//

//
// find location of file
//


//
// page 404 (file not found)
//
function show_page_404(img_index) {
  _via_buffer_hide_current_image();

  set_display_area_content(VIA_DISPLAY_AREA_CONTENT_NAME.PAGE_404);

  _via_image_index = img_index;
  _via_image_id = _via_image_id_list[_via_image_index];
  _via_current_image_loaded = false;
  img_fn_list_ith_entry_selected(_via_image_index, true);

  document.getElementById('page_404_filename').innerHTML = '[' + (_via_image_index+1) + ']' + _via_img_metadata[_via_image_id].filename;
}


//
// utils
//
