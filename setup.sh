#!/usr/bin/env bash

# Exit the script immediately if a command exits with a non-zero status.
set -e

##############################
# Environment Setup
##############################

# Store the current working directory so we can return to it later
current_dir="$(pwd)"

# Folder in which we'll install dependencies and repos
DEPENDENCY_DIR="$HOME/SAMurai"

echo "Updating package information..."
sudo apt-get update

echo "Installing tools for managing PPAs..."
sudo apt-get install -y software-properties-common

echo "Adding deadsnakes PPA for Python 3.12..."
sudo add-apt-repository ppa:deadsnakes/ppa -y

echo "Updating package lists after adding the new PPA..."
sudo apt-get update

echo "Installing Python 3.12, python3.12-venv, FFmpeg, and Git..."
sudo apt-get install -y \
    python3.12 \
    python3.12-venv \
    ffmpeg \
    git

##############################
# Python Virtual Environment
##############################

echo "Creating '$DEPENDENCY_DIR' if it doesn't exist..."
mkdir -p "$DEPENDENCY_DIR"

echo "Creating a Python 3.12 virtual environment at $DEPENDENCY_DIR/venv..."
python3.12 -m venv "$DEPENDENCY_DIR/venv"

echo "Activating the virtual environment..."
# shellcheck disable=SC1091
source "$DEPENDENCY_DIR/venv/bin/activate"

echo "Verifying Python version in the virtual environment..."
python --version

echo "Installing Python dependencies from requirements.txt..."
pip install -r requirements.txt
echo "Python dependencies installed."

##############################
# Clone & Install MobileSAM
##############################

echo "Cloning the MobileSAM repository into $DEPENDENCY_DIR..."
cd "$DEPENDENCY_DIR"
if [-d MobileSAM]; then
    echo "MobileSAM directory already exists. Removing it..."
    rm -rf MobileSAM
fi
git clone https://github.com/ChaoningZhang/MobileSAM.git
cd MobileSAM

echo "Installing MobileSAM in editable mode..."
pip install -e .
echo "MobileSAM successfully installed."

##############################
# Clone & Install SAM2
##############################

cd "$DEPENDENCY_DIR"
echo "Cloning the sam2 repository into $DEPENDENCY_DIR..."
if [-d sam2]; then
    echo "sam2 directory already exists. Removing it..."
    rm -rf sam2
fi
git clone https://github.com/facebookresearch/sam2.git
cd sam2

echo "Installing sam2 in editable mode..."
pip install -e .
echo "sam2 successfully installed."

##############################
# Return to Project & Prepare Model Dirs
##############################

echo "Returning to the original directory: $current_dir"
cd "$current_dir"

echo "Creating models directory structure..."
mkdir -p models/samv1
mkdir -p models/samv2

##############################
# Copy MobileSAM Weights
##############################

echo "Copying MobileSAM weights to models/samv1..."
cp "$DEPENDENCY_DIR/MobileSAM/weights/mobile_sam.pt" models/samv1/


##############################
# Download SAM (ViT) Weights
##############################

echo "Downloading SAM (ViT) model weights in parallel to models/samv1..."
cd models/samv1
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_l_0b3195.pth & \
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_b_01ec64.pth & \
wget https://dl.fbaipublicfiles.com/segment_anything/sam_vit_h_4b8939.pth
wait

echo "Returning to the original directory..."
cd "$current_dir"

##############################
# Download SAM2 Weights
##############################

echo "Downloading SAM2 model weights in parallel to models/samv2..."
cd models/samv2
wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_tiny.pt & \
wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_small.pt & \
wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_base_plus.pt & \
wget https://dl.fbaipublicfiles.com/segment_anything_2/092824/sam2.1_hiera_large.pt
wait

##############################
# Finish Up
##############################

echo "Returning to the original directory: $current_dir"
cd "$current_dir"

echo "All downloads completed. Script execution finished."
