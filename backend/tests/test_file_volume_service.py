import numpy as np
import pytest
import tifffile

from backend.file_volume_service import TiffVolumeService


VOLUME_UUID = "11111111-1111-1111-1111-111111111111"


def write_tiff(root, volume_uuid: str, values: np.ndarray) -> None:
    tifffile.imwrite(root / f"{volume_uuid}.tif", values, photometric="minisblack")


def test_meta_reads_3d_uint8_tiff_volume(tmp_path):
    values = np.arange(3 * 4 * 5, dtype=np.uint8).reshape(3, 4, 5)
    write_tiff(tmp_path, VOLUME_UUID, values)

    service = TiffVolumeService(root=tmp_path)

    meta = service.meta(VOLUME_UUID)

    assert meta["shape"] == [3, 4, 5]
    assert meta["dtype"] == "uint8"
    assert meta["axisOrder"] == ["z", "y", "x"]
    assert meta["source"] == {"kind": "tiff", "uuid": VOLUME_UUID}


def test_meta_lists_unique_label_values_from_tiff(tmp_path):
    values = np.array(
        [
            [[0, 0, 3], [7, 7, 3]],
            [[0, 3, 3], [7, 0, 7]],
        ],
        dtype=np.uint8,
    )
    write_tiff(tmp_path, VOLUME_UUID, values)

    service = TiffVolumeService(root=tmp_path)

    meta = service.meta(VOLUME_UUID)

    assert meta["intensities"] == [
        {"value": 0, "range": [0, 0], "label": "pore / substrate", "defaultOpacity": 0.0},
        {"value": 3, "range": [3, 3], "label": "label 3", "defaultOpacity": 0.7},
        {"value": 7, "range": [7, 7], "label": "label 7", "defaultOpacity": 0.7},
    ]


def test_slice_payload_reads_axis_specific_plane_from_tiff(tmp_path):
    values = np.arange(3 * 4 * 5, dtype=np.uint8).reshape(3, 4, 5)
    write_tiff(tmp_path, VOLUME_UUID, values)

    service = TiffVolumeService(root=tmp_path)

    shape, data = service.slice_payload(VOLUME_UUID, axis="y", index=2)

    assert shape == (3, 5)
    assert np.frombuffer(data, dtype=np.uint8).reshape(shape).tolist() == values[:, 2, :].tolist()


def test_downsampled_payload_uses_existing_max_pooling(tmp_path):
    values = np.zeros((4, 4, 4), dtype=np.uint8)
    values[1, 1, 1] = 120
    values[2, 2, 2] = 230
    write_tiff(tmp_path, VOLUME_UUID, values)

    service = TiffVolumeService(root=tmp_path)

    shape, data = service.downsampled_payload(VOLUME_UUID, factor=2)
    downsampled = np.frombuffer(data, dtype=np.uint8).reshape(shape)

    assert shape == (2, 2, 2)
    assert downsampled[0, 0, 0] == 120
    assert downsampled[1, 1, 1] == 230


def test_tiff_service_rejects_missing_uuid(tmp_path):
    service = TiffVolumeService(root=tmp_path)

    with pytest.raises(ValueError, match="No TIFF volume found"):
        service.meta(VOLUME_UUID)


def test_tiff_service_rejects_non_uint8_or_non_3d_files(tmp_path):
    service = TiffVolumeService(root=tmp_path)

    tifffile.imwrite(
        tmp_path / f"{VOLUME_UUID}.tif",
        np.zeros((4, 5), dtype=np.uint8),
        photometric="minisblack",
    )
    with pytest.raises(ValueError, match="3D uint8"):
        service.meta(VOLUME_UUID)

    tifffile.imwrite(
        tmp_path / f"{VOLUME_UUID}.tif",
        np.zeros((2, 3, 4), dtype=np.uint16),
        photometric="minisblack",
    )
    with pytest.raises(ValueError, match="3D uint8"):
        service.meta(VOLUME_UUID)
