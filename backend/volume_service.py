from __future__ import annotations

from dataclasses import dataclass
from functools import cached_property
from typing import Literal

import numpy as np
from numpy.typing import NDArray

Axis = Literal["x", "y", "z"]

INTENSITY_BACKGROUND = np.uint8(0)
INTENSITY_LARGE_PARTICLE = np.uint8(1)
INTENSITY_SMALL_PARTICLE = np.uint8(2)
BACKGROUND_INTENSITY_RANGE = (0, 0)
LARGE_PARTICLE_INTENSITY_RANGE = (1, 1)
SMALL_PARTICLE_INTENSITY_RANGE = (2, 2)
DEFAULT_LABEL_VALUES = (0, 1, 2)
KNOWN_LABEL_METADATA = {
    0: ("pore / substrate", 0.0),
    1: ("large particle", 0.38),
    2: ("small particle", 0.82),
}


def build_label_intensities(label_values) -> list[dict[str, object]]:
    intensities = []
    for value in sorted({int(label) for label in label_values}):
        label, opacity = KNOWN_LABEL_METADATA.get(value, (f"label {value}", 0.7))
        intensities.append(
            {
                "value": value,
                "range": [value, value],
                "label": label,
                "defaultOpacity": opacity,
            }
        )
    return intensities


def unique_uint8_labels(volume: NDArray[np.uint8]) -> list[int]:
    counts = np.bincount(np.asarray(volume, dtype=np.uint8).ravel(), minlength=256)
    return np.flatnonzero(counts).astype(int).tolist()


def downsample_volume(volume: NDArray[np.uint8], factor: int) -> NDArray[np.uint8]:
    checked_factor = SyntheticVolumeService._checked_factor(factor)
    if checked_factor == 1:
        if volume.flags.c_contiguous:
            return volume
        return np.ascontiguousarray(volume)

    z_size, y_size, x_size = volume.shape
    out_shape = (
        z_size // checked_factor,
        y_size // checked_factor,
        x_size // checked_factor,
    )
    trimmed = volume[
        : out_shape[0] * checked_factor,
        : out_shape[1] * checked_factor,
        : out_shape[2] * checked_factor,
    ]
    result = np.zeros(out_shape, dtype=np.uint8)

    for z_index in range(out_shape[0]):
        z0 = z_index * checked_factor
        z1 = z0 + checked_factor
        block = trimmed[z0:z1, :, :].reshape(
            checked_factor,
            out_shape[1],
            checked_factor,
            out_shape[2],
            checked_factor,
        )
        result[z_index] = np.max(block, axis=(0, 2, 4))

    return np.ascontiguousarray(result)


downsample_labels = downsample_volume


@dataclass(frozen=True)
class SyntheticVolumeService:
    shape: tuple[int, int, int] = (500, 500, 1000)
    seed: int = 20260703

    def meta(self) -> dict[str, object]:
        return {
            "shape": list(self.shape),
            "dtype": "uint8",
            "voxelSpacing": [1.0, 1.0, 1.0],
            "axisOrder": ["z", "y", "x"],
            "intensities": build_label_intensities(DEFAULT_LABEL_VALUES),
            "recommendedDownsampleFactors": [1, 2, 4, 5, 10],
        }

    @cached_property
    def _volume(self) -> NDArray[np.uint8]:
        volume = np.zeros(self.shape, dtype=np.uint8)
        rng = np.random.default_rng(self.seed)
        min_dim = min(self.shape)

        volume_scale = np.prod(self.shape) / (500**3)
        large_count = max(3, int(volume_scale * 34))
        small_count = max(12, int(volume_scale * 220))

        self._paint_spheres(
            volume=volume,
            rng=rng,
            count=large_count,
            radius_range=self._scaled_radius_range(min_dim, 34, 76),
            intensity_range=LARGE_PARTICLE_INTENSITY_RANGE,
            avoid_overlap=True,
        )
        self._paint_spheres(
            volume=volume,
            rng=rng,
            count=small_count,
            radius_range=self._scaled_radius_range(min_dim, 8, 18),
            intensity_range=SMALL_PARTICLE_INTENSITY_RANGE,
            avoid_overlap=False,
        )
        return volume

    def volume(self) -> NDArray[np.uint8]:
        return self._volume

    def slice(self, axis: Axis, index: int) -> NDArray[np.uint8]:
        volume = self.volume()
        z_size, y_size, x_size = self.shape

        if axis == "z":
            checked_index = self._checked_index(index, z_size, "z")
            return np.ascontiguousarray(volume[checked_index, :, :])
        if axis == "y":
            checked_index = self._checked_index(index, y_size, "y")
            return np.ascontiguousarray(volume[:, checked_index, :])
        if axis == "x":
            checked_index = self._checked_index(index, x_size, "x")
            return np.ascontiguousarray(volume[:, :, checked_index])
        raise ValueError(f"Unsupported axis: {axis}")

    def downsampled(self, factor: int) -> NDArray[np.uint8]:
        return downsample_volume(self.volume(), factor=factor)

    def slice_payload(self, axis: Axis, index: int) -> tuple[tuple[int, int], bytes]:
        plane = self.slice(axis=axis, index=index)
        return plane.shape, plane.tobytes(order="C")

    def downsampled_payload(self, factor: int) -> tuple[tuple[int, int, int], bytes]:
        volume = self.downsampled(factor=factor)
        return volume.shape, volume.tobytes(order="C")

    @staticmethod
    def _checked_index(index: int, size: int, axis: str) -> int:
        if index < 0 or index >= size:
            raise ValueError(f"{axis} index must be between 0 and {size - 1}")
        return index

    @staticmethod
    def _checked_factor(factor: int) -> int:
        if factor < 1:
            raise ValueError("factor must be greater than 0")
        return factor

    @staticmethod
    def _scaled_radius_range(min_dim: int, low_at_500: int, high_at_500: int) -> tuple[int, int]:
        scale = min_dim / 500
        low = max(1, round(low_at_500 * scale))
        high = max(low, round(high_at_500 * scale))
        return low, high

    @staticmethod
    def _paint_spheres(
        volume: NDArray[np.uint8],
        rng: np.random.Generator,
        count: int,
        radius_range: tuple[int, int],
        avoid_overlap: bool,
        value: np.uint8 | None = None,
        intensity_range: tuple[int, int] | None = None,
    ) -> None:
        z_size, y_size, x_size = volume.shape
        min_radius, max_radius = radius_range
        placed: list[tuple[tuple[int, int, int], int]] = []
        if intensity_range is None:
            if value is None:
                raise ValueError("value or intensity_range must be provided")
            intensity_range = (int(value), int(value))

        for _ in range(count):
            radius, center = SyntheticVolumeService._pick_sphere(
                rng=rng,
                shape=volume.shape,
                radius_range=(min_radius, max_radius),
                placed=placed,
                avoid_overlap=avoid_overlap,
            )
            placed.append((center, radius))

            z0, z1 = max(0, center[0] - radius), min(z_size, center[0] + radius + 1)
            y0, y1 = max(0, center[1] - radius), min(y_size, center[1] + radius + 1)
            x0, x1 = max(0, center[2] - radius), min(x_size, center[2] + radius + 1)

            zz, yy, xx = np.ogrid[z0:z1, y0:y1, x0:x1]
            distance_squared = (
                (zz - center[0]) ** 2
                + (yy - center[1]) ** 2
                + (xx - center[2]) ** 2
            )
            mask = distance_squared <= radius**2
            block = volume[z0:z1, y0:y1, x0:x1]
            writable_mask = mask & (block == INTENSITY_BACKGROUND)
            low, high = intensity_range
            if low == high:
                block[writable_mask] = np.uint8(low)
            else:
                values = SyntheticVolumeService._sphere_intensity_values(
                    distance_squared=distance_squared,
                    radius=radius,
                    intensity_range=intensity_range,
                    rng=rng,
                )
                block[writable_mask] = values[writable_mask]

    @staticmethod
    def _sphere_intensity_values(
        distance_squared: NDArray[np.integer],
        radius: int,
        intensity_range: tuple[int, int],
        rng: np.random.Generator,
    ) -> NDArray[np.uint8]:
        low, high = intensity_range
        distance = np.sqrt(distance_squared.astype(np.float32))
        radial_weight = np.clip(1 - distance / max(1, radius), 0, 1)
        span = high - low
        base = low + span * (0.28 + 0.72 * radial_weight)
        noise = rng.normal(0, max(1.5, span * 0.07), size=distance_squared.shape)
        return np.clip(np.rint(base + noise), low, high).astype(np.uint8)

    @staticmethod
    def _paint_background_texture(
        volume: NDArray[np.uint8],
        rng: np.random.Generator,
    ) -> None:
        low, high = BACKGROUND_INTENSITY_RANGE
        for z_index in range(volume.shape[0]):
            plane = volume[z_index]
            background_mask = plane == INTENSITY_BACKGROUND
            background_count = int(np.count_nonzero(background_mask))
            if background_count == 0:
                continue
            plane[background_mask] = rng.integers(
                low,
                high + 1,
                size=background_count,
                dtype=np.uint8,
            )

    @staticmethod
    def _pick_sphere(
        rng: np.random.Generator,
        shape: tuple[int, int, int],
        radius_range: tuple[int, int],
        placed: list[tuple[tuple[int, int, int], int]],
        avoid_overlap: bool,
    ) -> tuple[int, tuple[int, int, int]]:
        z_size, y_size, x_size = shape
        min_radius, max_radius = radius_range

        for _ in range(80):
            radius = int(rng.integers(min_radius, max_radius + 1))
            center = (
                int(rng.integers(radius, max(radius + 1, z_size - radius))),
                int(rng.integers(radius, max(radius + 1, y_size - radius))),
                int(rng.integers(radius, max(radius + 1, x_size - radius))),
            )
            if not avoid_overlap:
                return radius, center

            is_clear = True
            for previous_center, previous_radius in placed:
                distance_squared = (
                    (center[0] - previous_center[0]) ** 2
                    + (center[1] - previous_center[1]) ** 2
                    + (center[2] - previous_center[2]) ** 2
                )
                minimum_distance = (radius + previous_radius) * 0.82
                if distance_squared < minimum_distance**2:
                    is_clear = False
                    break
            if is_clear:
                return radius, center

        radius = int(rng.integers(min_radius, max_radius + 1))
        center = (
            int(rng.integers(radius, max(radius + 1, z_size - radius))),
            int(rng.integers(radius, max(radius + 1, y_size - radius))),
            int(rng.integers(radius, max(radius + 1, x_size - radius))),
        )
        return radius, center
