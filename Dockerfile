# Use the official Python 3.12 slim image as our base
FROM python:3.12

# Avoid interactive prompts, set directories
ENV DEBIAN_FRONTEND=noninteractive \
    DEPENDENCY_DIR=/opt/SAMurai \
    MODELS_DIR=/app/models

WORKDIR /app

# Install system‑level dependencies
RUN apt-get update \
 && apt-get install -y --no-install-recommends \
      git \
      wget \
      ffmpeg \
      gcc \
      python3.12-dev \
 && rm -rf /var/lib/apt/lists/*

# Copy only requirements.txt first (leverages Docker layer caching)
COPY requirements.txt .

# Upgrade pip & install Python dependencies
RUN pip install --upgrade pip \
 && pip install --no-cache-dir -r requirements.txt

# Clone & install MobileSAM
RUN mkdir -p $DEPENDENCY_DIR \
 && cd $DEPENDENCY_DIR \
 && git clone https://github.com/ChaoningZhang/MobileSAM.git \
 && cd MobileSAM \
 && pip install --no-cache-dir -e .

# Clone & install SAM2
RUN cd $DEPENDENCY_DIR \
 && git clone https://github.com/facebookresearch/sam2.git \
 && cd sam2 \
 && pip install --no-cache-dir -e .

# Create model directories & copy MobileSAM weights
RUN mkdir -p $MODELS_DIR/samv1 $MODELS_DIR/samv2 \
 && cp $DEPENDENCY_DIR/MobileSAM/weights/mobile_sam.pt $MODELS_DIR/samv1/

# Download SAM (ViT) weights
WORKDIR $MODELS_DIR/samv1
RUN wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth \
 && wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth \
 && wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth

# Download SAM2 weights
WORKDIR $MODELS_DIR/samv2
RUN wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt \
 && wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt \
 && wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt \
 && wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt

# Copy your application code into the container
WORKDIR /app
COPY . .

# Default command: run your Python app
CMD ["python", "app_new.py"]
