# backend/Dockerfile
FROM python:3.11-slim

# Set environment variables
ENV PYTHONDONTWRITEBYTECODE=1
ENV PYTHONUNBUFFERED=1

# Set work directory
WORKDIR /app

# Install system dependencies
RUN apt-get update \
    && apt-get install -y --no-install-recommends \
        postgresql-client \
        curl \
    && rm -rf /var/lib/apt/lists/*

# Install Python dependencies
COPY requirements.txt /app/
RUN pip install --upgrade pip
RUN pip install --no-cache-dir -r requirements.txt

# Copy project
COPY . /app/

# Create directories for static files
RUN mkdir -p /app/static /app/media

# Make manage.py executable
RUN chmod +x /app/manage.py

# Copy and make entrypoint executable
COPY entrypoint.sh /app/
RUN chmod +x /app/entrypoint.sh

# Convert line endings from Windows (CRLF) to Unix (LF) to avoid exec format errors
RUN sed -i 's/\r$//' /app/entrypoint.sh

# Expose port
EXPOSE 8000

# Run entrypoint script
CMD ["sh", "/app/entrypoint.sh"]
