from __future__ import annotations

import os
import shutil
import subprocess
import uuid
from pathlib import Path
from typing import Any

from fastapi import FastAPI, File, HTTPException, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import FileResponse
from pydantic import BaseModel

STORAGE_ROOT = Path(os.getenv("STORAGE_ROOT", "./.data/presentations")).resolve()
ALLOWED_EXTENSIONS = {".ppt", ".pptx", ".odp", ".pdf"}

app = FastAPI(title="GestureDeck API")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


class PresentationResponse(BaseModel):
    id: str
    original_filename: str
    pdf_url: str


def presentation_dir(presentation_id: str) -> Path:
    return STORAGE_ROOT / presentation_id


def metadata_path(presentation_id: str) -> Path:
    return presentation_dir(presentation_id) / "metadata.json"


def write_metadata(presentation_id: str, data: dict[str, Any]) -> None:
    import json

    metadata_path(presentation_id).write_text(json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8")


def read_metadata(presentation_id: str) -> dict[str, Any]:
    import json

    path = metadata_path(presentation_id)
    if not path.exists():
        raise HTTPException(status_code=404, detail="Presentation not found")
    return json.loads(path.read_text(encoding="utf-8"))


def find_soffice() -> str:
    for binary in ("soffice", "libreoffice"):
        if shutil.which(binary):
            return binary
    raise HTTPException(status_code=500, detail="LibreOffice is not installed or not in PATH")


def convert_to_pdf(input_path: Path, output_dir: Path) -> Path:
    soffice = find_soffice()
    result = subprocess.run(
        [
            soffice,
            "--headless",
            "--nologo",
            "--nofirststartwizard",
            "--convert-to",
            "pdf",
            "--outdir",
            str(output_dir),
            str(input_path),
        ],
        stdout=subprocess.PIPE,
        stderr=subprocess.PIPE,
        text=True,
        timeout=120,
        check=False,
    )

    if result.returncode != 0:
        raise HTTPException(
            status_code=500,
            detail={
                "message": "LibreOffice conversion failed",
                "stdout": result.stdout,
                "stderr": result.stderr,
            },
        )

    converted = output_dir / f"{input_path.stem}.pdf"
    if not converted.exists():
        pdfs = list(output_dir.glob("*.pdf"))
        if not pdfs:
            raise HTTPException(status_code=500, detail="No PDF was produced by LibreOffice")
        converted = pdfs[0]

    final_pdf = output_dir / "file.pdf"
    if converted != final_pdf:
        converted.replace(final_pdf)
    return final_pdf


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


@app.post("/api/presentations/upload", response_model=PresentationResponse)
async def upload_presentation(file: UploadFile = File(...)) -> PresentationResponse:
    original_name = file.filename or "presentation"
    suffix = Path(original_name).suffix.lower()
    if suffix not in ALLOWED_EXTENSIONS:
        raise HTTPException(status_code=400, detail=f"Unsupported file type: {suffix}")

    presentation_id = uuid.uuid4().hex
    workdir = presentation_dir(presentation_id)
    workdir.mkdir(parents=True, exist_ok=True)

    input_path = workdir / f"original{suffix}"
    with input_path.open("wb") as handle:
        while chunk := await file.read(1024 * 1024):
            handle.write(chunk)

    if suffix == ".pdf":
        pdf_path = workdir / "file.pdf"
        shutil.copyfile(input_path, pdf_path)
    else:
        pdf_path = convert_to_pdf(input_path, workdir)

    data = {
        "id": presentation_id,
        "original_filename": original_name,
        "input_path": str(input_path),
        "pdf_path": str(pdf_path),
        "pdf_url": f"/api/presentations/{presentation_id}/file.pdf",
    }
    write_metadata(presentation_id, data)

    return PresentationResponse(
        id=presentation_id,
        original_filename=original_name,
        pdf_url=data["pdf_url"],
    )


@app.get("/api/presentations/{presentation_id}")
def get_presentation(presentation_id: str) -> dict[str, Any]:
    data = read_metadata(presentation_id)
    return {
        "id": data["id"],
        "original_filename": data["original_filename"],
        "pdf_url": data["pdf_url"],
    }


@app.get("/api/presentations/{presentation_id}/file.pdf")
def get_pdf(presentation_id: str) -> FileResponse:
    data = read_metadata(presentation_id)
    path = Path(data["pdf_path"])
    if not path.exists():
        raise HTTPException(status_code=404, detail="PDF file not found")
    return FileResponse(path, media_type="application/pdf", filename="presentation.pdf")
