# gruf-sam-service — SAM2 segmentation on Cloud Run (GPU / NVIDIA L4).
# Isolated from the CPU filter-service: only this service needs the GPU,
# scale-to-zero so idle costs nothing. Called once per uploaded image;
# the object partition is cached by the caller (decoupled architecture).
FROM pytorch/pytorch:2.4.1-cuda12.1-cudnn9-runtime

ENV PYTHONUNBUFFERED=1 \
    PIP_NO_CACHE_DIR=1 \
    YOLO_CONFIG_DIR=/app/.ultralytics

WORKDIR /app

# OpenCV runtime libs (ultralytics pulls opencv-python)
RUN apt-get update \
 && apt-get install -y --no-install-recommends libgl1 libglib2.0-0 \
 && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
# torch/torchvision already provided (CUDA) by the base image → not reinstalled.
RUN pip install -r requirements.txt

# Bake the SAM2 weights into the image so a cold start does NOT download them.
RUN python -c "from ultralytics import SAM; SAM('sam2_l.pt')"

COPY app ./app

ENV PORT=8080
# 1 worker: the model is loaded once per process and the GPU is the bottleneck.
CMD exec uvicorn app.main:app --host 0.0.0.0 --port ${PORT} --workers 1
