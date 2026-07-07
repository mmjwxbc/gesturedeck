# GestureDeck

GestureDeck is a web-based presentation player controlled by camera hand gestures.

It implements this MVP workflow:

1. Upload a `.ppt`, `.pptx`, `.odp`, or `.pdf` file.
2. The backend converts PowerPoint/OpenDocument presentations to PDF with LibreOffice headless.
3. The frontend renders the PDF with PDF.js through `react-pdf`.
4. The browser camera recognizes hand gestures with MediaPipe Hand Landmarker.
5. Stable gesture commands control the current slide.

## Gesture mapping

| Gesture | Action |
| --- | --- |
| 1 raised finger | Jump to slide 1 |
| 2 raised fingers | Jump to slide 2 |
| 3 raised fingers | Jump to slide 3 |
| 4 raised fingers | Jump to slide 4 |
| Swipe up | Previous slide |
| Swipe down | Next slide |

The gesture controller uses frame stability and cooldown protection to reduce accidental triggers.

## Project structure

```text
apps/
  api/   FastAPI upload and LibreOffice conversion service
  web/   React + Vite PDF player and MediaPipe gesture controller
```

## Requirements

- Python 3.12 or 3.13. Python 3.14 may fail while building native Python packages.
- Node.js 20+
- LibreOffice
- Chinese/common fonts for better PPT conversion fidelity

## Install system dependencies

### Ubuntu / Debian

```bash
sudo apt-get update
sudo apt-get install -y libreoffice fonts-noto-cjk fonts-liberation
```

### macOS

```bash
brew install --cask libreoffice
```

For better Chinese font rendering on macOS, install the fonts used by your PPT template or export may look different from PowerPoint.

## Run locally without Docker

Use two terminals.

### Terminal 1: backend API

Recommended with `uv`:

```bash
cd apps/api
uv venv --python 3.12
source .venv/bin/activate
uv pip install -r requirements.txt
export STORAGE_ROOT="$(pwd)/.data/presentations"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Alternative with standard `venv`:

```bash
cd apps/api
python3.12 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
export STORAGE_ROOT="$(pwd)/.data/presentations"
uvicorn main:app --reload --host 0.0.0.0 --port 8000
```

Health check:

```text
http://localhost:8000/api/health
```

### Terminal 2: frontend web app

```bash
cd apps/web
npm install
npm run dev
```

Open:

```text
http://localhost:5173
```

Camera access works on `localhost` or HTTPS. A plain HTTP LAN IP may not expose `navigator.mediaDevices.getUserMedia()`.

## API

```text
POST /api/presentations/upload
GET  /api/presentations/{presentation_id}
GET  /api/presentations/{presentation_id}/file.pdf
```

## MVP limitations

This version converts presentations to static PDF. It is reliable for arbitrary uploads, but it does not preserve PowerPoint animations, transitions, embedded video, embedded audio, or trigger-based interactions.

For a high-fidelity future version, integrate ONLYOFFICE or Collabora Online and let gestures control their presentation iframe or playback API.
