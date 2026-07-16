from __future__ import annotations

from pathlib import Path
import tempfile
from typing import Literal
from uuid import uuid4

from fastapi import FastAPI, File, HTTPException, Response, UploadFile
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.file_volume_service import (
    TIFF_SUFFIXES,
    TiffVolumeError,
    TiffVolumeNotFoundError,
    TiffVolumeService,
    iter_uint8_chunks,
)
from backend.volume_service import (
    SyntheticVolumeService,
    downsampled_volume_shape,
    iter_downsampled_uint8_layers,
)

Axis = Literal["x", "y", "z"]
MAX_UPLOAD_BYTES = 1024 * 1024 * 1024
UPLOAD_CHUNK_SIZE = 1024 * 1024
UPLOADED_VOLUME_ROOT = Path(tempfile.gettempdir()) / "vue-3d-volume-uploads"

app = FastAPI(title="Battery Volume Sample API")
service = SyntheticVolumeService()
file_volume_service = TiffVolumeService(extra_roots=(UPLOADED_VOLUME_ROOT,))

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=False,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/api/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


async def save_upload_file(upload_file: UploadFile, destination: Path) -> int:
    bytes_written = 0
    with destination.open("wb") as target:
        while True:
            chunk = await upload_file.read(UPLOAD_CHUNK_SIZE)
            if not chunk:
                break

            bytes_written += len(chunk)
            if bytes_written > MAX_UPLOAD_BYTES:
                raise HTTPException(
                    status_code=413,
                    detail="TIFF upload exceeds the 1 GiB size limit",
                )
            target.write(chunk)

    if bytes_written == 0:
        raise HTTPException(status_code=400, detail="Uploaded TIFF file is empty")
    return bytes_written


@app.post("/api/volumes")
async def upload_tiff_volume(file: UploadFile = File(...)) -> dict[str, object]:
    suffix = Path(file.filename or "").suffix.lower()
    if suffix not in TIFF_SUFFIXES:
        raise HTTPException(status_code=400, detail="Upload must be a .tif or .tiff file")

    volume_uuid = str(uuid4())
    UPLOADED_VOLUME_ROOT.mkdir(parents=True, exist_ok=True)
    staging_path = UPLOADED_VOLUME_ROOT / f"{volume_uuid}{suffix}.uploading"
    final_path = UPLOADED_VOLUME_ROOT / f"{volume_uuid}{suffix}"

    try:
        await save_upload_file(file, staging_path)
        TiffVolumeService.validate_volume_file(staging_path)
        staging_path.replace(final_path)
        return {
            "uuid": volume_uuid,
            "meta": file_volume_service.meta(volume_uuid),
        }
    except HTTPException:
        raise
    except TiffVolumeError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    except (OSError, ValueError) as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc
    finally:
        if staging_path.exists():
            staging_path.unlink()


@app.get("/api/volume/meta")
def volume_meta() -> dict[str, object]:
    return service.meta()


@app.get("/api/volume/slice")
def volume_slice(axis: Axis = "z", index: int = 250) -> Response:
    try:
        shape, data = service.slice_payload(axis=axis, index=index)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in shape),
            "X-Volume-Dtype": "uint8",
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/volume/downsampled")
def volume_downsampled(factor: int = 1) -> Response:
    try:
        shape, data = service.downsampled_payload(factor=factor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return Response(
        content=data,
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in shape),
            "X-Volume-Dtype": "uint8",
            "X-Downsample-Factor": str(factor),
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/volume/downsampled-layers")
def volume_downsampled_layers(factor: int = 1) -> StreamingResponse:
    try:
        volume = service.volume()
        shape = downsampled_volume_shape(volume.shape, factor)
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    layer_size = shape[1] * shape[2]
    return StreamingResponse(
        iter_downsampled_uint8_layers(volume, factor),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in shape),
            "X-Volume-Dtype": "uint8",
            "X-Downsample-Factor": str(factor),
            "X-Volume-Stream-Axis": "z",
            "X-Volume-Stream-Order": "ascending",
            "X-Volume-Layer-Size": str(layer_size),
            "X-Volume-Layer-Count": str(shape[0]),
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/volumes/{volume_uuid}/meta")
def tiff_volume_meta(volume_uuid: str) -> dict[str, object]:
    try:
        return file_volume_service.meta(volume_uuid)
    except TiffVolumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc


@app.get("/api/volumes/{volume_uuid}/slice")
def tiff_volume_slice(volume_uuid: str, axis: Axis = "z", index: int = 0) -> Response:
    try:
        plane = file_volume_service.slice(
            volume_uuid=volume_uuid,
            axis=axis,
            index=index,
        )
    except TiffVolumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        iter_uint8_chunks(plane),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in plane.shape),
            "X-Volume-Dtype": "uint8",
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/volumes/{volume_uuid}/downsampled")
def tiff_volume_downsampled(volume_uuid: str, factor: int = 1) -> Response:
    try:
        volume = file_volume_service.downsampled(
            volume_uuid=volume_uuid,
            factor=factor,
        )
    except TiffVolumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    return StreamingResponse(
        iter_uint8_chunks(volume),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in volume.shape),
            "X-Volume-Dtype": "uint8",
            "X-Downsample-Factor": str(factor),
            "Cache-Control": "no-store",
        },
    )


@app.get("/api/volumes/{volume_uuid}/downsampled-layers")
def tiff_volume_downsampled_layers(volume_uuid: str, factor: int = 1) -> StreamingResponse:
    try:
        volume = file_volume_service.volume(volume_uuid)
        shape = downsampled_volume_shape(volume.shape, factor)
    except TiffVolumeNotFoundError as exc:
        raise HTTPException(status_code=404, detail=str(exc)) from exc
    except ValueError as exc:
        raise HTTPException(status_code=400, detail=str(exc)) from exc

    layer_size = shape[1] * shape[2]
    return StreamingResponse(
        iter_downsampled_uint8_layers(volume, factor),
        media_type="application/octet-stream",
        headers={
            "X-Volume-Shape": ",".join(str(value) for value in shape),
            "X-Volume-Dtype": "uint8",
            "X-Downsample-Factor": str(factor),
            "X-Volume-Stream-Axis": "z",
            "X-Volume-Stream-Order": "ascending",
            "X-Volume-Layer-Size": str(layer_size),
            "X-Volume-Layer-Count": str(shape[0]),
            "Cache-Control": "no-store",
        },
    )
