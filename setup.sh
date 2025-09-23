#!/bin/bash
# Setup script for Hakka Flashcards Image Generator
# This script sets up a Python virtual environment and installs dependencies

set -e  # Exit on any error

echo "🎯 Setting up Hakka Flashcards Image Generator..."

# Check if Python 3 is available
if ! command -v python3 &> /dev/null; then
    echo "❌ Python 3 is required but not found. Please install Python 3.8+."
    exit 1
fi

# Check Python version (need 3.8+)
PYTHON_VERSION=$(python3 -c 'import sys; print(".".join(map(str, sys.version_info[:2])))')
echo "📍 Found Python $PYTHON_VERSION"

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "🔨 Creating virtual environment..."
    python3 -m venv venv
fi

# Activate virtual environment
echo "⚡ Activating virtual environment..."
source venv/bin/activate

# Upgrade pip
echo "📦 Upgrading pip..."
pip install --upgrade pip

# Install dependencies
echo "📚 Installing dependencies from requirements.txt..."
pip install -r requirements.txt

echo ""
echo "✅ Setup complete!"
echo ""
echo "🚀 To use the image generator:"
echo "   1. Note already activated virtual environment, if not, run \"source venv/bin/activate\" or \"venv\Scripts\activate\" for Windows"
echo "   (If you open a new terminal, remember to activate the venv again)"
echo "   2. Pull Repository (git clone https://github.com/AUTOMATIC1111/stable-diffusion-webui) and Start Automatic1111 WebUI with --api flag"
echo "      - macOS (Apple silicon): run with COMMANDLINE_ARGS="--medvram --xformers --api" (recent PyTorch MPS is fine without xformers too)."
echo "      - Windows (NVIDIA GPU): run with --medvram --xformers --api flags."
echo "   3. Start once; in the UI, select the model SDXL 1.0 base (and optionally refiner, though not required)."
echo "   4. Run: python3 gen_flashcards_images.py \"Hakka Vocabulary.csv\" --test --verbose"
echo ""
echo "💡 Use --test flag first to generate only 5 images as a test!"