from __future__ import annotations

from pathlib import Path

import numpy as np
import tifffile

from backend.volume_service import SyntheticVolumeService


DEFAULT_VOLUME_UUID = "output"


def main() -> None:
    output = Path(__file__).resolve().parents[1] / "sample_volumes" / f"{DEFAULT_VOLUME_UUID}.tif"
    output.parent.mkdir(parents=True, exist_ok=True)

    volume = SyntheticVolumeService().volume()
    tifffile.imwrite(
        output,
        volume,
        photometric="minisblack",
        metadata={"axes": "ZYX"},
        bigtiff=True,
    )
    unique_values = np.unique(volume).tolist()
    print(
        {
            "path": str(output),
            "shape": volume.shape,
            "dtype": str(volume.dtype),
            "unique": unique_values,
            "bytes": output.stat().st_size,
        }
    )


if __name__ == "__main__":
    main()
