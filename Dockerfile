FROM python:3.12-slim

WORKDIR /app

ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

RUN apt-get update \
  && apt-get install -y --no-install-recommends fonts-dejavu-core \
  && rm -rf /var/lib/apt/lists/*

COPY requirements.txt .
RUN pip install --no-cache-dir -r requirements.txt

COPY . .

EXPOSE 8000

# uvicorn reads WEB_CONCURRENCY as its worker count. ~100 MB per process: 2 fits 512 MB.
ENV WEB_CONCURRENCY=2

CMD ["uvicorn", "main:app", "--host", "0.0.0.0", "--port", "8000"]
