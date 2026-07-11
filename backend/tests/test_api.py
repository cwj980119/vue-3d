import numpy as np
import tifffile
from fastapi.testclient import TestClient

import backend.main as main_module
from backend.file_volume_service import TiffVolumeService
from backend.volume_service import downsample_volume


app = main_module.app

client = TestClient(app)
VOLUME_UUID = "11111111-1111-1111-1111-111111111111"


def test_meta_endpoint_returns_volume_contract():
    response = client.get("/api/volume/meta")

    assert response.status_code == 200
    body = response.json()
    assert body["shape"] == [500, 500, 1000]
    assert body["dtype"] == "uint8"
    assert body["axisOrder"] == ["z", "y", "x"]


def test_slice_endpoint_returns_raw_plane_with_shape_headers():
    response = client.get("/api/volume/slice?axis=z&index=10")

    assert response.status_code == 200
    assert response.headers["X-Volume-Shape"] == "500,1000"
    assert response.headers["X-Volume-Dtype"] == "uint8"
    assert response.headers["Cache-Control"] == "no-store"
    assert len(response.content) == 500 * 1000


def test_downsampled_endpoint_returns_raw_volume_with_shape_headers():
    response = client.get("/api/volume/downsampled?factor=10")

    assert response.status_code == 200
    assert response.headers["X-Volume-Shape"] == "50,50,100"
    assert response.headers["X-Downsample-Factor"] == "10"
    assert response.headers["Cache-Control"] == "no-store"
    assert len(response.content) == 50 * 50 * 100


def test_downsampled_layers_endpoint_streams_z_planes_with_layer_headers():
    response = client.get("/api/volume/downsampled-layers?factor=10")

    assert response.status_code == 200
    assert response.headers["X-Volume-Shape"] == "50,50,100"
    assert response.headers["X-Volume-Stream-Axis"] == "z"
    assert response.headers["X-Volume-Stream-Order"] == "ascending"
    assert response.headers["X-Volume-Layer-Size"] == str(50 * 100)
    assert response.headers["X-Volume-Layer-Count"] == "50"
    assert response.headers["Cache-Control"] == "no-store"
    assert len(response.content) == 50 * 50 * 100


def test_invalid_slice_index_returns_400():
    response = client.get("/api/volume/slice?axis=z&index=9999")

    assert response.status_code == 400
    assert "index must be between" in response.json()["detail"]


def test_uuid_tiff_volume_endpoints_return_raw_payloads(tmp_path, monkeypatch):
    values = np.arange(4 * 6 * 8, dtype=np.uint8).reshape(4, 6, 8)
    tifffile.imwrite(tmp_path / f"{VOLUME_UUID}.tif", values, photometric="minisblack")
    monkeypatch.setattr(main_module, "file_volume_service", TiffVolumeService(root=tmp_path))

    meta_response = client.get(f"/api/volumes/{VOLUME_UUID}/meta")
    slice_response = client.get(f"/api/volumes/{VOLUME_UUID}/slice?axis=x&index=3")
    downsampled_response = client.get(f"/api/volumes/{VOLUME_UUID}/downsampled?factor=2")
    layers_response = client.get(f"/api/volumes/{VOLUME_UUID}/downsampled-layers?factor=2")

    assert meta_response.status_code == 200
    assert meta_response.json()["shape"] == [4, 6, 8]
    assert meta_response.json()["source"] == {"kind": "tiff", "uuid": VOLUME_UUID}

    assert slice_response.status_code == 200
    assert slice_response.headers["X-Volume-Shape"] == "4,6"
    assert slice_response.headers["X-Volume-Dtype"] == "uint8"
    assert slice_response.content == values[:, :, 3].tobytes(order="C")

    assert downsampled_response.status_code == 200
    assert downsampled_response.headers["X-Volume-Shape"] == "2,3,4"
    assert downsampled_response.headers["X-Downsample-Factor"] == "2"
    assert len(downsampled_response.content) == 2 * 3 * 4

    expected_downsampled = downsample_volume(values, factor=2)
    assert layers_response.status_code == 200
    assert layers_response.headers["X-Volume-Shape"] == "2,3,4"
    assert layers_response.headers["X-Volume-Layer-Size"] == str(3 * 4)
    assert layers_response.headers["X-Volume-Layer-Count"] == "2"
    assert layers_response.content == expected_downsampled.tobytes(order="C")


def test_missing_uuid_tiff_volume_returns_404(tmp_path, monkeypatch):
    monkeypatch.setattr(main_module, "file_volume_service", TiffVolumeService(root=tmp_path))

    response = client.get(f"/api/volumes/{VOLUME_UUID}/meta")

    assert response.status_code == 404
    assert "No TIFF volume found" in response.json()["detail"]
