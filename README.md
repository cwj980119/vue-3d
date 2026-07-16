# Vue 3D Volume Viewer Sample

FastAPI can serve either a synthetic `500 x 500 x 1000` uint8 volume or a local
TIFF stack loaded by UUID. Volumes are interpreted in `[z, y, x]` order, so the
sample represents 500 stacked landscape slices, each `500 x 1000`.
The Vue/Vite component renders the data as both 2D slices and a VTK.js 3D volume.

## Data Model

- `0`: pore / substrate, transparent by default
- `1`: large particle
- `2`: small particle

The synthetic sample caches a deterministic sphere volume in memory after the
first data request. The default 3D view uses the selected downsample factor from
the UI; `1x` is available for full-resolution local testing.

The viewer reads the real dimensions from the `meta` endpoint and the
`X-Volume-Shape` binary response header, so production data can use different
dimensions as long as the API reports the correct `[z, y, x]` shape.

## Backend

```powershell
.\.venv\Scripts\python.exe -m uvicorn backend.main:app --host 127.0.0.1 --port 8000
```

Endpoints:

- `GET /api/health`
- `GET /api/volume/meta`
- `GET /api/volume/slice?axis=z&index=250`
- `GET /api/volume/downsampled?factor=4`
- `GET /api/volume/downsampled-layers?factor=4`
- `POST /api/volumes`
- `GET /api/volumes/{uuid}/meta`
- `GET /api/volumes/{uuid}/slice?axis=z&index=250`
- `GET /api/volumes/{uuid}/downsampled?factor=4`
- `GET /api/volumes/{uuid}/downsampled-layers?factor=4`

## Local TIFF Samples

Place test TIFF files in `backend/sample_volumes` with the UUID as the file name:

```text
backend/sample_volumes/11111111-1111-1111-1111-111111111111.tif
```

Each TIFF must load through `tifffile` as a 3D `uint8` array. The backend accepts
`.tif` and `.tiff` files.

The frontend also supports uploading a TIFF from the viewer toolbar. Uploaded
files are copied into the OS temp directory, validated as 3D `uint8` TIFF
volumes, and exposed through the same UUID endpoints for the current backend
session.

The default demo TIFF is ignored by git because it is large. Generate it locally
after cloning:

```powershell
.\.venv\Scripts\python.exe -m backend.scripts.create_sample_tiff
```

## Frontend

```powershell
npm.cmd run dev
```

Open `http://127.0.0.1:5173`. Without a query string, the app waits for a TIFF
upload instead of loading a default volume.

To load a local TIFF sample that already exists on the backend through the Vite
proxy, add `volumeUuid`:

```text
http://127.0.0.1:5173/?volumeUuid=11111111-1111-1111-1111-111111111111
```

## Reusable Component

```vue
<VolumeViewer
  api-base-url="http://127.0.0.1:8000"
  volume-uuid="11111111-1111-1111-1111-111111111111"
  initial-mode="3d"
/>
```

In this sample app, `api-base-url=""` uses the Vite `/api` proxy during development.

## Verification

```powershell
.\.venv\Scripts\python.exe -m pytest backend/tests -q
npm.cmd test
npm.cmd run build
```
