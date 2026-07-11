import numpy as np

from backend.volume_service import (
    INTENSITY_BACKGROUND,
    INTENSITY_LARGE_PARTICLE,
    INTENSITY_SMALL_PARTICLE,
    SyntheticVolumeService,
    downsample_volume,
    iter_downsampled_uint8_layers,
)


class FixedSphereRng:
    def __init__(self, values):
        self.values = list(values)

    def integers(self, low, high=None):
        del low, high
        return self.values.pop(0)


def test_meta_uses_configured_shape_and_intensity_labels():
    service = SyntheticVolumeService(shape=(64, 64, 64), seed=7)

    meta = service.meta()

    assert meta["shape"] == [64, 64, 64]
    assert meta["dtype"] == "uint8"
    assert meta["intensities"] == [
        {
            "value": 0,
            "range": [0, 0],
            "label": "pore / substrate",
            "defaultOpacity": 0.0,
        },
        {
            "value": 1,
            "range": [1, 1],
            "label": "large particle",
            "defaultOpacity": 0.38,
        },
        {
            "value": 2,
            "range": [2, 2],
            "label": "small particle",
            "defaultOpacity": 0.82,
        },
    ]


def test_default_meta_uses_development_volume_shape():
    service = SyntheticVolumeService()

    meta = service.meta()

    assert meta["shape"] == [500, 500, 1000]


def test_volume_uses_discrete_label_values():
    service = SyntheticVolumeService(shape=(96, 96, 96), seed=11)

    values = service.volume().ravel()
    unique_values = np.unique(values)

    assert values.dtype == np.uint8
    assert set(unique_values.tolist()).issubset({0, 1, 2})
    assert {0, 1, 2}.issubset(set(unique_values.tolist()))


def test_overlapping_particles_deform_without_sharing_voxels():
    volume = np.zeros((9, 9, 9), dtype=np.uint8)
    volume[4, 4, 4] = INTENSITY_LARGE_PARTICLE

    SyntheticVolumeService._paint_spheres(
        volume=volume,
        rng=FixedSphereRng([2, 4, 4, 4]),
        count=1,
        radius_range=(2, 2),
        value=INTENSITY_SMALL_PARTICLE,
        avoid_overlap=False,
    )

    assert volume[4, 4, 4] == INTENSITY_LARGE_PARTICLE
    assert np.count_nonzero(volume == INTENSITY_SMALL_PARTICLE) > 0


def test_slice_returns_axis_specific_2d_plane():
    service = SyntheticVolumeService(shape=(32, 40, 48), seed=3)

    z_slice = service.slice(axis="z", index=4)
    y_slice = service.slice(axis="y", index=5)
    x_slice = service.slice(axis="x", index=6)

    assert z_slice.shape == (40, 48)
    assert y_slice.shape == (32, 48)
    assert x_slice.shape == (32, 40)


def test_downsample_volume_preserves_brightest_voxels_in_blocks():
    volume = np.zeros((4, 4, 4), dtype=np.uint8)
    volume[0:2, 0:2, 0:2] = 1
    volume[1, 1, 1] = 2
    volume[2, 2, 2] = 2

    downsampled = downsample_volume(volume, factor=2)

    assert downsampled.shape == (2, 2, 2)
    assert downsampled[0, 0, 0] == 2
    assert downsampled[1, 1, 1] == 2


def test_iter_downsampled_uint8_layers_matches_downsampled_volume_order():
    volume = np.arange(4 * 4 * 6, dtype=np.uint8).reshape(4, 4, 6)

    streamed = b"".join(iter_downsampled_uint8_layers(volume, factor=2))
    downsampled = downsample_volume(volume, factor=2)

    assert streamed == downsampled.tobytes(order="C")


def test_downsampled_volume_keeps_discrete_uint8_labels():
    service = SyntheticVolumeService(shape=(32, 40, 48), seed=5)

    downsampled = service.downsampled(factor=4)

    assert downsampled.shape == (8, 10, 12)
    assert downsampled.dtype == np.uint8
    assert set(np.unique(downsampled).tolist()).issubset({0, 1, 2})


def test_binary_payloads_include_shape_metadata_and_raw_bytes():
    service = SyntheticVolumeService(shape=(16, 20, 24), seed=5)

    shape, data = service.downsampled_payload(factor=2)
    slice_shape, slice_data = service.slice_payload(axis="z", index=3)

    assert shape == (8, 10, 12)
    assert len(data) == 8 * 10 * 12
    assert slice_shape == (20, 24)
    assert len(slice_data) == 20 * 24
