# Sample TIFF Volumes

Place local test TIFF volumes in this directory using the volume UUID as the
file name:

```text
11111111-1111-1111-1111-111111111111.tif
11111111-1111-1111-1111-111111111111.tiff
```

The FastAPI UUID endpoints expect each TIFF to load through `tifffile` as a
3D `uint8` array in `[z, y, x]` order.
