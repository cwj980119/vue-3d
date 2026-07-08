from pathlib import Path

from backend.scripts.create_sample_tiff import DEFAULT_VOLUME_UUID


def test_sample_tiff_script_writes_output_volume_uuid():
    assert DEFAULT_VOLUME_UUID == "output"
    assert Path(f"{DEFAULT_VOLUME_UUID}.tif").name == "output.tif"
