FROM python:3.12-slim

WORKDIR /app

# Cap the numpy/OpenBLAS thread pools to the container's CPU allotment
# (Cloud Run --cpu 4). Without this, OpenBLAS detects the HOST core count
# (many) inside the 4-CPU cgroup and massively over-subscribes threads →
# context-switch thrashing that made the linerate relaxation ~7× slower than
# local (90s Cloud Run timeout vs ~12s local). Matching the pools to the CPU
# allotment removes the thrashing. Keep in sync with `--cpu` in deploy.yml.
ENV OMP_NUM_THREADS=4 \
    OPENBLAS_NUM_THREADS=4 \
    MKL_NUM_THREADS=4 \
    NUMEXPR_NUM_THREADS=4

# Install dependencies
COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

# Copy application
COPY app/ ./app/

# Expose port
EXPOSE 8001

# Run the service
CMD ["uvicorn", "app.main:app", "--host", "0.0.0.0", "--port", "8001"]
