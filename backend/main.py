from __future__ import annotations

from typing import Literal

from fastapi import FastAPI, HTTPException, Response
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import StreamingResponse

from backend.file_volume_service import (
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

app = FastAPI(title="Battery Volume Sample API")
service = SyntheticVolumeService()
file_volume_service = TiffVolumeService()

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
