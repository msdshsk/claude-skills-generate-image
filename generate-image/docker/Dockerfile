FROM python:3.11-slim

# rembg[cpu,cli] includes CLI + ONNX CPU runtime
RUN pip install --no-cache-dir "rembg[cpu,cli]" && \
    python -c "from rembg import new_session; new_session('u2net')"

ENTRYPOINT ["rembg"]
CMD ["--help"]
