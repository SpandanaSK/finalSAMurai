**SAMurai**

An AI-assisted image annotation tool 

Segment objects with a click, a box, or a text prompt, then save versioned annotations ready for ML training.
Built with Python 3.12, Flask, PyTorch, SAM / MobileSAM  and GroundingDINO.

**Overview**

SAMurai is a browser-based image annotation and segmentation tool. It combines a familiar manual annotation canvas with foundation-model assistance, so that labelling an object can take a single click or a short text phrase instead of tracing its outline by hand.
Under the hood, a Flask backend serves the web UI and exposes REST endpoints that run Meta's Segment Anything Models (SAM, MobileSAM) and GroundingDINO for text-driven detection. The frontend is built on the open-source VGG Image Annotator (VIA), extended with AI-assisted tools and Cornerstone.js for DICOM viewing. Annotations are saved as JSON and versioned with Git, so every change to a dataset is traceable and reversible.
SAMurai keeps a human in the loop: the models propose masks, and you refine them with rectangles, circles, polygons, freehand drawing, and an eraser.


SAMurai was built to close that gap with one platform that offers:

• Zero-shot, prompt-based segmentation (click, box, text) with no per-task training.

• Support for standard images and DICOM medical scans.

• Project and dataset management with Git-backed version history.

• Responsive handling of large files through asynchronous processing.
It targets students, researchers, and developers who need to build labelled datasets quickly, including for medical imaging research.

**Key Features**

• AI-assisted segmentation: point (positive and negative), bounding-box, and optional mask prompts, run through SAM v1 (ViT-B/L/H), MobileSAM, or SAM 2.1. Masks are converted to editable polygons.

• Text-based auto-labelling: type what you want to find (for example, "car"). GroundingDINO returns labelled bounding boxes that can be passed to SAM for masks. 

• Manual annotation: rectangle, circle, ellipse, polygon, polyline, point, freehand, and erase tools from VIA, with customisable region attributes and labels.

• Multi-format input: PNG, JPG, TIFF, DICOM (.dcm), ZIP archives of images, and images from URLs.

• Medical imaging: DICOM slices are rendered with rescale slope/intercept and window-centre/width applied. Cornerstone.js provides window/level, zoom, and pan.

• Navigation: zoom, pan, grid view, and arrow-key navigation across images and slices.

• Projects and datasets: create, save, and reload projects. Each dataset is a Git repository of JSON files.

• Performance: lazy model loading, model/embedding caching, a client-side LRU cache, and an asynchronous event loop for heavy file parsing.

• Reliability: JSON plus Git persistence, a debug endpoint for verifying DICOM pixel data, and health-check support.

**Tech Stack Layer Technologies**

Backend - Python 3.12, Flask (blueprints), Gunicorn / uWSGI

ML / CV - PyTorch, Hugging Face Transformers, timm, Segment Anything (SAM v1), MobileSAM, GroundingDINO, OpenCV, NumPy, imageio.

Medical imaging - pydicom, python-gdcm, pylibjpeg, pylibjpeg-libjpeg

Frontend - HTML, CSS, JavaScript, VGG Image Annotator (VIA), Cornerstone.js, HTML5 Canvas

Storage / versioning - Local filesystem, JSON, Git (via GitPython)

Tooling - Postman (API testing), Git/GitHub, WSL/Linux

**How It Works**

SAMurai follows a three-tier architecture (presentation, application, data) that communicates over REST and JSON.
flowchart LR
    U([User]) --> FE["Frontend<br/>VIA canvas + Cornerstone.js"]
    FE -- "HTTP / JSON" --> API["Flask API"]

    subgraph Backend
        API --> UP["Upload service"]
        API --> RD["Image rendering<br/>(reader / loader utilities)"]
        API --> AL["Auto-label<br/>GroundingDINO"]
        API --> SP["SAM predictors<br/>SAM / MobileSAM / SAM 2"]
        API --> DS["Project and dataset APIs"]
        AL -- "boxes + labels" --> SP
    end

    UP --> FS[("Filesystem<br/>/tmp/images")]
    RD --> FS
    DS --> GIT[("Git-backed JSON<br/>GitDataset")]
    SP -- "polygons (JSON)" --> FE

**Typical annotation flow**

1.  Upload. The frontend posts files to /file-uploader/upload. The backend validates extensions, creates directories if needed, and stores files in /tmp/images/uploaded.

2.  Read and render. An asynchronous read_file() detects the file type (image, DICOM, ZIP, URL) and routes it to the right reader. DICOM slices are window-levelled into displayable 2D frames and indexed by frame number.

3.  Prompt. You click, draw a box, or type a text label. For text prompts, GroundingDINO first returns bounding boxes.

4.  Segment. The frontend sends prompts as JSON to the SAM endpoint. The backend loads (or reuses a cached) model, runs inference, and converts the mask to polygon contours.

5.  Refine. The polygons are injected into VIA's _via_img_metadata and drawn on the canvas, where you can edit them manually.

6.  Save. Annotations are written as JSON and committed to the dataset's Git repository with a timestamped message.

Getting Started

**Prerequisites**
• OS: Linux, or Windows via WSL (Ubuntu). setup.sh uses apt-get.

• Python 3.12 (installed by the script from the deadsnakes PPA).

• Git, FFmpeg, gcc, and sudo access.

• Disk space: several GB for model weights.

• Browser: Chrome or Edge recommended.

• GPU (optional): CUDA-capable GPU recommended for the larger SAM models. CPU works but is slower.

1. Clone the repository -- git clone https://github.com/SpandanaSK/finalSAMurai.git
   
cd finalSAMurai

3. Run the setup script, From the repository root:
   
chmod +x setup.sh
./setup.sh
The script will:
1.  Install Python 3.12, python3.12-venv, FFmpeg, Git, and build tools.

2.  Create a virtual environment at ~/SAMurai/venv.

3.  Install everything in requirements.txt, plus CPU builds of torch, torchvision, and torchaudio.

4.  Clone and install MobileSAM and SAM 2 (editable installs) under ~/SAMurai/.

5.  Create models/samv1 and models/samv2, then download the SAM, MobileSAM, and SAM 2.1 weights.
Using a GPU? After setup, replace the CPU PyTorch build with the CUDA build that matches your driver. See the PyTorch install selector.

6. Start the application

source ~/SAMurai/venv/bin/activate
python app_new.py
Open http://localhost:8080 in your browser.
Sharing your running instance (optional)

Confirm files exist in models/samv1 and models/samv2; re-run the download section of setup.sh.
Uploaded files disappear
Uploads go to /tmp/images/uploaded, which is temporary. Save your project to persist work.

**Usage**

1.  Create or load a project from the dashboard.

2.  Upload images (PNG, JPG, TIFF, DICOM, ZIP, or a URL). They appear on the canvas and in the file list.

3.  Pick a model from the model dropdown (MobileSAM for speed, SAM ViT-H for accuracy, or SAM 2.1).

4.  Annotate using any of these approaches:
   
    ◦ Click on an object (positive points) or on the background (negative points) to segment it.
    
    ◦ Draw a box around an object to prompt SAM.
    
    ◦ Type a label in the auto-label panel (for example, "tumor" or "car") to get boxes, then segment them.
    
    ◦ Draw manually with the rectangle, circle, polygon, freehand, and erase tools.
6.  Navigate with zoom, pan, grid view, and the arrow keys. Use window/level controls for DICOM.
7.  Save the project. Annotations and metadata are committed to the dataset's Git history.
    
**API Reference**

All endpoints are served by the Flask backend (default http://localhost:8080). Request and response bodies are JSON unless noted.
Method Endpoint Purpose

POST - /file-uploader/upload : Upload images, DICOM files, or archives (multipart FormData). Returns server-side file paths.

POST - /sam-ai/single_image_sam_predict : Run SAM / MobileSAM on one image with point, box, or mask prompts. Returns polygon coordinates.

POST - /auto-label-box/grounding_dino_box_predict : Text prompt in, labelled bounding boxes out (GroundingDINO).


The backend also provides, through the modules in static/js/api_calls.js, static/js/project_api_calls.js, and dataset_api.py:

• Rendering: frame preparation and fetching of rendered image frames (get_fps, render, render_file).

• Projects and datasets: create, save, and load projects and datasets (Git-backed).

• Diagnostics: a debug endpoint for checking DICOM pixel data and window-level transforms, and health-check endpoints for server availability.

For exact routes, methods, and payload schemas of the rendering, project, dataset, and debug endpoints, check the Flask blueprints in the source. The Postman collection used during development is a good reference if you keep it in the repo.

**Data Storage and Versioning**

SAMurai deliberately avoids a traditional database. Data is organised as directories plus JSON, with Git as the versioning engine.
Project  1 ──── 1  Dataset  1 ──── *  File  1 ──── *  Annotation

• Project: name, description, creation date, creator.

• Dataset: metadata stored in a JSON file.

• File: its own JSON record (name, path, type).

• Annotation: ID, label, geometry (coordinates or polygon points), frame number, region attributes, and temporary/persistent flag.
When a dataset file is saved, the backend writes the JSON, stages it, and creates a timestamped Git commit, without depending on a user-specific Git profile. This gives you history, rollback, comparison, and an audit trail of how a dataset evolved.
Working directories include /tmp/images/ (uploads and frames) and /app/projects/ (projects).

**Team**

• Sowjanya R

• Spandana Shashikiran

• Thanusha M Hosgoudar

**Screenshorts - UI**

<img width="584" height="315" alt="Screenshot 2026-11-13 114613" src="https://github.com/user-attachments/assets/28b7fc73-073a-46b0-ac16-0a3cae530285" />



**DICOM**

<img width="650" height="370" alt="image" src="https://github.com/user-attachments/assets/95f54887-8d69-4756-9f4b-a815a5dd6a60" />



**EXAMPLE INPUT**

<img width="656" height="401" alt="Screenshot 2026-11-13 114647" src="https://github.com/user-attachments/assets/c9bd6b91-8c68-494c-9973-466ae1f95245" />


**SEGMENTATION**

<img width="655" height="365" alt="Screenshot 2026-11-13 114718" src="https://github.com/user-attachments/assets/1c4cb939-cac5-49d4-bcb3-6a0e30101504" />
