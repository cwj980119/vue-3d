from __future__ import annotations

from dataclasses import dataclass
from functools import lru_cache
from pathlib import Path
import re
from typing import Literal

import numpy as np
from numpy.typing import NDArray
import tifffile

from backend.volume_service import (
    build_label_intensities,
    downsample_volume,
    unique_uint8_labels,
)

Axis = Literal["x", "y", "z"]
TIFF_SUFFIXES = (".tif", ".tiff")
SAFE_VOLUME_UUID = re.compile(r"^[A-Za-z0-9_-]+$")
DEFAULT_STREAM_CHUNK_SIZE = 4 * 1024 * 1024


class TiffVolumeError(ValueError):
    pass


class TiffVolumeNotFoundError(TiffVolumeError):
    pass


def iter_uint8_chunks(
    values: NDArray[np.uint8],
    chunk_size: int = DEFAULT_STREAM_CHUNK_SIZE,
):
    contiguous = values if values.flags.c_contiguous else np.ascontiguousarray(values)
    view = memoryview(contiguous).cast("B")
    for offset in range(0, len(view), chunk_size):
        yield bytes(view[offset : offset + chunk_size])


@dataclass(frozen=True)
class TiffVolumeService:
    root: Path = Path(__file__).with_name("sample_volumes")
    extra_roots: tuple[Path, ...] = ()

    def meta(self, volume_uuid: str) -> dict[str, object]:
        path = self.path_for_uuid(volume_uuid)
        shape, _ = self.validate_volume_file(path)

        return {
            "shape": list(shape),
            "dtype": "uint8",
            "voxelSpacing": [1.0, 1.0, 1.0],
            "axisOrder": ["z", "y", "x"],
            "source": {"kind": "tiff", "uuid": volume_uuid},
            "intensities": build_label_intensities(self.label_values(volume_uuid)),
            "recommendedDownsampleFactors": [1, 2, 4, 5, 10],
        }

    def volume(self, volume_uuid: str) -> NDArray[np.uint8]:
        cache_key = self._cache_key(volume_uuid)
        return self._volume(*cache_key)

    def label_values(self, volume_uuid: str) -> list[int]:
        cache_key = self._cache_key(volume_uuid)
        return self._label_values(*cache_key)

    def _cache_key(self, volume_uuid: str) -> tuple[str, int, int]:
        path = self.path_for_uuid(volume_uuid)
        stat = path.stat()
        return str(path), stat.st_mtime_ns, stat.st_size

    def slice(self, volume_uuid: str, axis: Axis, index: int) -> NDArray[np.uint8]:
        volume = self.volume(volume_uuid)
        z_size, y_size, x_size = volume.shape

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

    def downsampled(self, volume_uuid: str, factor: int) -> NDArray[np.uint8]:
        return downsample_volume(self.volume(volume_uuid), factor=factor)

    def slice_payload(
        self,
        volume_uuid: str,
        axis: Axis,
        index: int,
    ) -> tuple[tuple[int, int], bytes]:
        plane = self.slice(volume_uuid=volume_uuid, axis=axis, index=index)
        return plane.shape, plane.tobytes(order="C")

    def downsampled_payload(
        self,
        volume_uuid: str,
        factor: int,
    ) -> tuple[tuple[int, int, int], bytes]:
        volume = self.downsampled(volume_uuid=volume_uuid, factor=factor)
        return volume.shape, volume.tobytes(order="C")

    def path_for_uuid(self, volume_uuid: str) -> Path:
        if not SAFE_VOLUME_UUID.fullmatch(volume_uuid):
            raise TiffVolumeError(f"Invalid volume uuid: {volume_uuid}")

        resolved_roots = [self.root.resolve(), *(root.resolve() for root in self.extra_roots)]
        for root in resolved_roots:
            for suffix in TIFF_SUFFIXES:
                candidate = (root / f"{volume_uuid}{suffix}").resolve()
                if candidate.parent == root and candidate.exists():
                    return candidate
        raise TiffVolumeNotFoundError(
            f"No TIFF volume found for uuid {volume_uuid} in "
            f"{', '.join(str(root) for root in resolved_roots)}"
        )

    @staticmethod
    def validate_volume_file(path: Path) -> tuple[tuple[int, ...], np.dtype]:
        shape, dtype = TiffVolumeService._metadata(path)
        TiffVolumeService._validate_shape_dtype(shape=shape, dtype=dtype, path=path)
        return shape, dtype

    @staticmethod
    def _metadata(path: Path) -> tuple[tuple[int, ...], np.dtype]:
        with tifffile.TiffFile(path) as tiff:
            series = tiff.series[0]
            return tuple(int(value) for value in series.shape), np.dtype(series.dtype)

    @staticmethod
    @lru_cache(maxsize=4)
    def _volume(path_value: str, mtime_ns: int, size: int) -> NDArray[np.uint8]:
        del mtime_ns, size
        path = Path(path_value)
        try:
            volume = tifffile.memmap(path)
        except (OSError, TypeError, ValueError):
            volume = tifffile.imread(path)

        volume = np.asarray(volume)
        TiffVolumeService._validate_shape_dtype(shape=volume.shape, dtype=volume.dtype, path=path)
        return volume

    @staticmethod
    @lru_cache(maxsize=16)
    def _label_values(path_value: str, mtime_ns: int, size: int) -> list[int]:
        return unique_uint8_labels(TiffVolumeService._volume(path_value, mtime_ns, size))

    @staticmethod
    def _validate_shape_dtype(shape: tuple[int, ...], dtype: np.dtype, path: Path) -> None:
        if len(shape) != 3 or np.dtype(dtype) != np.uint8:
            raise TiffVolumeError(
                f"TIFF volume must be a 3D uint8 array, got shape={shape}, dtype={dtype} at {path}"
            )

    @staticmethod
    def _checked_index(index: int, size: int, axis: str) -> int:
        if index < 0 or index >= size:
            raise ValueError(f"{axis} index must be between 0 and {size - 1}")
        return index
