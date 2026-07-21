<script setup lang="ts">
import '@kitware/vtk.js/Rendering/Profiles/Geometry';
import '@kitware/vtk.js/Rendering/Profiles/Volume';

import vtkDataArray from '@kitware/vtk.js/Common/Core/DataArray';
import vtkImageData from '@kitware/vtk.js/Common/DataModel/ImageData';
import vtkPlane from '@kitware/vtk.js/Common/DataModel/Plane';
import vtkPiecewiseFunction from '@kitware/vtk.js/Common/DataModel/PiecewiseFunction';
import vtkOrientationMarkerWidget from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget';
import { Corners } from '@kitware/vtk.js/Interaction/Widgets/OrientationMarkerWidget/Constants';
import vtkAxesActor from '@kitware/vtk.js/Rendering/Core/AxesActor';
import vtkColorTransferFunction from '@kitware/vtk.js/Rendering/Core/ColorTransferFunction';
import vtkVolume from '@kitware/vtk.js/Rendering/Core/Volume';
import vtkVolumeMapper from '@kitware/vtk.js/Rendering/Core/VolumeMapper';
import vtkGenericRenderWindow from '@kitware/vtk.js/Rendering/Misc/GenericRenderWindow';
import { computed, nextTick, onMounted, onUnmounted, ref, watch } from 'vue';

import {
  createSliceImageData,
  fetchDownsampledVolumeLayers,
  fetchSlicePayload,
  fetchVolumeMeta,
  type BinaryPayload,
  type VolumeAxis,
  type VolumeMeta,
} from '@/api/volumeApi';
import {
  getCameraViewPreset,
  type CameraViewAxis,
  type VolumeShapeZYX,
} from '@/rendering/cameraViews';
import {
  clampPlanePosition,
  formatPlanePosition,
  getPlaneAxisMax,
  getPlaneClipPlaneConfig,
  getRenderAxis,
  getPlaneSlabClipPlaneConfigs,
  isPlaneOnlyControlEnabled,
  type PlaneRenderMode,
} from '@/rendering/planeControls';
import { DEFAULT_DOWNSAMPLE_FACTOR, DOWNSAMPLE_OPTIONS } from '@/rendering/downsampling';
import { DEFAULT_SAMPLE_DISTANCE } from '@/rendering/renderingDefaults';
import {
  getNextSlicePlaybackIndex,
  getNextPlaybackStackIndex,
} from '@/rendering/stacking';
import { buildTransferControlPoints } from '@/rendering/transferFunction';
import {
  applyDiscreteLabelVolumeInterpolation,
  getLabelLayerRenderOpacity,
  getVolumeRenderingBlendMode,
  getVolumeRenderingLabel,
  getVolumeLightingConfig,
  VOLUME_RENDERING_OPTIONS,
  type VolumeRenderingMode,
} from '@/rendering/volumeRendering';
import {
  canRemoveLayer,
  createDefaultIntensityLayer,
  createDefaultNapariLayers,
  createNapariLayersFromIntensities,
  formatIntensityRange,
  formatLayerOpacity,
  getLayerDeleteConfirmationMessage,
  getNextIntensityLayerIndex,
  getVisibleLayerCount,
  keepOnlyVolumeLayer,
  LABEL_VALUE_MAX,
  normalizeIntensityRange,
  removeNapariLayer,
  VOLUME_LAYER_ID,
  type NapariLayerId,
  type NapariLayerRow,
} from './napariLayers';
import { isPanelVisible, type ViewerMode } from './viewMode';

type GenericRenderWindow = ReturnType<typeof vtkGenericRenderWindow.newInstance>;
type VtkDataArray = ReturnType<typeof vtkDataArray.newInstance>;
type VtkImageData = ReturnType<typeof vtkImageData.newInstance>;
type VtkVolume = ReturnType<typeof vtkVolume.newInstance>;
type VtkVolumeMapper = ReturnType<typeof vtkVolumeMapper.newInstance>;
type VtkOrientationMarkerWidget = ReturnType<typeof vtkOrientationMarkerWidget.newInstance>;
type VtkAxesActor = ReturnType<typeof vtkAxesActor.newInstance>;

const props = withDefaults(
  defineProps<{
    apiBaseUrl?: string;
    defaultDownsampleFactor?: number;
    initialMode?: ViewerMode;
    volumeUuid?: string;
  }>(),
  {
    apiBaseUrl: '',
    defaultDownsampleFactor: DEFAULT_DOWNSAMPLE_FACTOR,
    initialMode: '3d',
  },
);

const meta = ref<VolumeMeta | null>(null);
const mode = ref<ViewerMode>(props.initialMode);
const axis = ref<VolumeAxis>('z');
const planeAxis = ref<VolumeAxis>('z');
const planeRenderMode = ref<PlaneRenderMode>('stack');
const volumeRenderingMode = ref<VolumeRenderingMode>('translucent');
const planeThickness = ref(10);
const sliceIndex = ref(250);
const downsampleFactor = ref(props.defaultDownsampleFactor);
const sampleDistance = ref(DEFAULT_SAMPLE_DISTANCE);
const stackEndIndex = ref(0);
const stackPlaybackInterval = ref(70);
const slicePlaybackInterval = ref(90);
const isStackPlaying = ref(false);
const isSlicePlaying = ref(false);
const loading = ref(false);
const errorMessage = ref('');
const status = ref('Loading metadata');
const volumeLoaded = ref(false);
const volumeStreamLoadedLayers = ref(0);
const volumeStreamTotalLayers = ref(0);
const sliceCanvas = ref<HTMLCanvasElement | null>(null);
const vtkContainer = ref<HTMLDivElement | null>(null);
const volumeShape = ref<number[]>([]);
const activeLayerId = ref<NapariLayerId>(VOLUME_LAYER_ID);
const napariLayers = ref<NapariLayerRow[]>(createDefaultNapariLayers());
const layerMenuOpen = ref(false);

const vtkState = {
  renderWindow: null as GenericRenderWindow | null,
  actor: null as VtkVolume | null,
  mapper: null as VtkVolumeMapper | null,
  orientationWidget: null as VtkOrientationMarkerWidget | null,
  orientationActor: null as VtkAxesActor | null,
};

let renderFrameId: number | null = null;
let playbackTimerId: number | null = null;
let slicePlaybackTimerId: number | null = null;
let volumeAbortController: AbortController | null = null;
let volumeLoadSequence = 0;
const volumePayloadCache = new Map<string, BinaryPayload>();

const axisSize = computed(() => {
  if (!meta.value) {
    return 1;
  }
  if (axis.value === 'z') {
    return meta.value.shape[0];
  }
  if (axis.value === 'y') {
    return meta.value.shape[1];
  }
  return meta.value.shape[2];
});

const sliceMax = computed(() => Math.max(0, axisSize.value - 1));
const currentVolumeShape = computed<VolumeShapeZYX>(() => meta.value?.shape ?? [1, 1, 1]);
const playbackStep = computed(() => Math.max(1, downsampleFactor.value * 2));

const volumeShapeLabel = computed(() => {
  if (volumeShape.value.length !== 3) {
    return '-';
  }
  return volumeShape.value.join(' x ');
});

const originalShapeLabel = computed(() => meta.value?.shape.join(' x ') ?? '-');
const volumeStreamPercent = computed(() => {
  if (volumeStreamTotalLayers.value <= 0) {
    return 0;
  }
  return Math.min(
    100,
    Math.round((volumeStreamLoadedLayers.value / volumeStreamTotalLayers.value) * 100),
  );
});
const volumeStreamProgressLabel = computed(() => {
  if (volumeStreamTotalLayers.value <= 0) {
    return 'Z 0 / 0';
  }
  return `Z ${volumeStreamLoadedLayers.value} / ${volumeStreamTotalLayers.value}`;
});
const isInteractionLocked = computed(() => loading.value && mode.value === '3d');
const sliceProgressLabel = computed(() => `${sliceIndex.value} / ${sliceMax.value}`);
const show3dPanel = computed(() => isPanelVisible(mode.value, '3d'));
const show2dPanel = computed(() => isPanelVisible(mode.value, '2d'));
const isPlaneThicknessEnabled = computed(() => isPlaneOnlyControlEnabled(planeRenderMode.value));
const renderAxis = computed(() => getRenderAxis(planeRenderMode.value, planeAxis.value));
const stackMax = computed(() => getPlaneAxisMax(currentVolumeShape.value, renderAxis.value));
const stackProgressLabel = computed(() =>
  formatPlanePosition(renderAxis.value, stackEndIndex.value, stackMax.value),
);
const visibleLayerCount = computed(() => getVisibleLayerCount(napariLayers.value));
const activeLayer = computed(
  () => napariLayers.value.find((layer) => layer.id === activeLayerId.value) ?? napariLayers.value[0],
);
const activeLayerOpacityLabel = computed(() =>
  activeLayer.value ? formatLayerOpacity(activeLayer.value.opacity) : '0%',
);
const volumeLayer = computed(
  () => napariLayers.value.find((layer) => layer.id === VOLUME_LAYER_ID) ?? napariLayers.value[0],
);
const intensityLayers = computed(() =>
  napariLayers.value.filter((layer) => layer.intensityRange),
);
const labelValueMax = computed(() =>
  Math.max(
    LABEL_VALUE_MAX,
    ...napariLayers.value.flatMap((layer) => layer.intensityRange ?? []),
    ...(meta.value?.intensities.flatMap((intensity) => intensity.range ?? [intensity.value]) ?? []),
  ),
);
const volumeRenderingLabel = computed(() => getVolumeRenderingLabel(volumeRenderingMode.value));
const planeModeLabel = computed(() =>
  planeRenderMode.value === 'stack' ? 'Stack projection' : 'Image plane',
);

function scheduleRender(): void {
  if (!vtkState.renderWindow || renderFrameId !== null || typeof window === 'undefined') {
    return;
  }

  renderFrameId = window.requestAnimationFrame(() => {
    renderFrameId = null;
    vtkState.renderWindow?.getRenderWindow().render();
  });
}

function stopStackPlayback(): void {
  if (playbackTimerId !== null) {
    window.clearInterval(playbackTimerId);
    playbackTimerId = null;
  }
  isStackPlaying.value = false;
}

function tickStackPlayback(): void {
  const next = getNextPlaybackStackIndex(
    stackEndIndex.value,
    stackMax.value,
    playbackStep.value,
  );
  stackEndIndex.value = next.index;
  if (next.reachedEnd) {
    stopStackPlayback();
  }
}

function toggleStackPlayback(): void {
  if (isStackPlaying.value) {
    stopStackPlayback();
    return;
  }

  if (stackEndIndex.value >= stackMax.value) {
    stackEndIndex.value = 0;
  }

  isStackPlaying.value = true;
  tickStackPlayback();
  playbackTimerId = window.setInterval(tickStackPlayback, stackPlaybackInterval.value);
}

function stopSlicePlayback(): void {
  if (slicePlaybackTimerId !== null) {
    window.clearInterval(slicePlaybackTimerId);
    slicePlaybackTimerId = null;
  }
  isSlicePlaying.value = false;
}

function abortVolumeLoad(): void {
  if (volumeAbortController) {
    volumeAbortController.abort();
    volumeAbortController = null;
  }
}

function isAbortError(error: unknown): boolean {
  return (
    error instanceof DOMException && error.name === 'AbortError'
  ) || (
    typeof error === 'object' &&
    error !== null &&
    'name' in error &&
    (error as { name?: unknown }).name === 'AbortError'
  );
}

function resetVolumeStreamProgress(): void {
  volumeStreamLoadedLayers.value = 0;
  volumeStreamTotalLayers.value = 0;
}

function tickSlicePlayback(): void {
  const next = getNextSlicePlaybackIndex(sliceIndex.value, sliceMax.value);
  sliceIndex.value = next.index;
  if (next.reachedEnd) {
    stopSlicePlayback();
  }
}

function toggleSlicePlayback(): void {
  if (isSlicePlaying.value) {
    stopSlicePlayback();
    return;
  }

  sliceIndex.value = 0;
  isSlicePlaying.value = true;
  slicePlaybackTimerId = window.setInterval(tickSlicePlayback, slicePlaybackInterval.value);
}

function clearError(): void {
  errorMessage.value = '';
}

function setError(error: unknown): void {
  errorMessage.value = error instanceof Error ? error.message : String(error);
}

function setActiveLayer(layerId: NapariLayerId): void {
  activeLayerId.value = layerId;
}

function findLayer(layerId: NapariLayerId): NapariLayerRow | undefined {
  return napariLayers.value.find((layer) => layer.id === layerId);
}

function ensureActiveLayer(): void {
  if (!napariLayers.value.some((layer) => layer.id === activeLayerId.value)) {
    activeLayerId.value = napariLayers.value[0]?.id ?? VOLUME_LAYER_ID;
  }
}

function toggleLayerVisibility(layerId: NapariLayerId): void {
  const layer = findLayer(layerId);
  if (!layer) {
    return;
  }

  layer.visible = !layer.visible;
  setActiveLayer(layerId);
}

function updateLayerName(layerId: NapariLayerId, event: Event): void {
  const layer = findLayer(layerId);
  if (!layer) {
    return;
  }

  const input = event.target as HTMLInputElement;
  layer.name = input.value;
  setActiveLayer(layerId);
}

function updateLayerColor(layerId: NapariLayerId, event: Event): void {
  const layer = findLayer(layerId);
  if (!layer) {
    return;
  }

  const input = event.target as HTMLInputElement;
  layer.color = input.value;
  setActiveLayer(layerId);
}

function updateLayerRange(layerId: NapariLayerId, edge: 'min' | 'max', event: Event): void {
  const layer = findLayer(layerId);
  const range = layer?.intensityRange;
  if (!range) {
    return;
  }

  const input = event.target as HTMLInputElement;
  const value = Number.parseInt(input.value, 10);
  if (!Number.isFinite(value)) {
    return;
  }

  layer.intensityRange =
    edge === 'min'
      ? normalizeIntensityRange(value, range[1])
      : normalizeIntensityRange(range[0], value);
  setActiveLayer(layerId);
}

function formatLayerIntensityRange(range: [number, number] | null): string {
  return formatIntensityRange(range, labelValueMax.value);
}

function updateLayerOpacity(layerId: NapariLayerId, event: Event): void {
  const layer = findLayer(layerId);
  if (!layer) {
    return;
  }

  const input = event.target as HTMLInputElement;
  const value = Number.parseFloat(input.value);
  if (!Number.isFinite(value)) {
    return;
  }

  layer.opacity = Math.min(1, Math.max(0, value));
  setActiveLayer(layerId);
}

function addIntensityLayer(): void {
  const nextIndex = getNextIntensityLayerIndex(napariLayers.value);
  const layer = createDefaultIntensityLayer(nextIndex);
  napariLayers.value.push(layer);
  setActiveLayer(layer.id);
}

function addIntensityLayerFromMenu(): void {
  addIntensityLayer();
  layerMenuOpen.value = false;
}

function deleteAllLayersExceptVolume(): void {
  layerMenuOpen.value = false;
  if (napariLayers.value.length <= 1) {
    return;
  }
  if (
    typeof window !== 'undefined' &&
    !window.confirm('Delete all layers except the volume layer?')
  ) {
    return;
  }

  napariLayers.value = keepOnlyVolumeLayer(napariLayers.value);
  activeLayerId.value = VOLUME_LAYER_ID;
}

function resetLayersToSource(): void {
  layerMenuOpen.value = false;
  if (!meta.value) {
    return;
  }
  if (
    typeof window !== 'undefined' &&
    !window.confirm('Reset all layers to the original file state?')
  ) {
    return;
  }

  napariLayers.value = createNapariLayersFromIntensities(meta.value.intensities);
  activeLayerId.value = VOLUME_LAYER_ID;
}

function deleteLayer(layerId: NapariLayerId): void {
  const layer = findLayer(layerId);
  if (!layer || !canRemoveLayer(layer)) {
    return;
  }
  if (typeof window !== 'undefined' && !window.confirm(getLayerDeleteConfirmationMessage(layer))) {
    return;
  }

  napariLayers.value = removeNapariLayer(napariLayers.value, layerId);
  ensureActiveLayer();
}

function setCanvasPayload(payload: BinaryPayload): void {
  const [height, width] = payload.shape;
  if (!width || !height) {
    throw new Error(`Invalid slice shape: ${payload.shape.join(',')}`);
  }

  const canvas = sliceCanvas.value;
  const context = canvas?.getContext('2d');
  if (!canvas || !context) {
    return;
  }

  canvas.width = width;
  canvas.height = height;
  context.imageSmoothingEnabled = false;
  context.putImageData(createSliceImageData(payload.data, width, height), 0, 0);
}

async function loadSlice(): Promise<void> {
  clearError();
  status.value = `Loading ${axis.value.toUpperCase()} slice ${sliceIndex.value}`;
  try {
    const payload = await fetchSlicePayload(
      props.apiBaseUrl,
      axis.value,
      sliceIndex.value,
      { volumeUuid: props.volumeUuid },
    );
    setCanvasPayload(payload);
    status.value = `Slice ${axis.value.toUpperCase()} ${sliceIndex.value}`;
  } catch (error) {
    setError(error);
  }
}

function applyTransferFunctions(): void {
  if (!vtkState.actor || !vtkState.mapper) {
    return;
  }

  const volumeOpacity = volumeLayer.value?.visible ? volumeLayer.value.opacity : 0;
  const controlPoints = buildTransferControlPoints({
    backgroundOpacity: 0,
    layers: intensityLayers.value.map((layer) => ({
      color: layer.color,
      opacity: getLabelLayerRenderOpacity({
        mode: volumeRenderingMode.value,
        layerVisible: layer.visible,
        layerOpacity: layer.opacity,
        volumeOpacity,
      }),
      range: layer.intensityRange ?? [0, labelValueMax.value],
    })),
  });
  const colorTransfer = vtkColorTransferFunction.newInstance();
  const opacityTransfer = vtkPiecewiseFunction.newInstance();

  controlPoints.colors.forEach(([value, red, green, blue]) => {
    colorTransfer.addRGBPoint(value, red, green, blue);
  });
  controlPoints.opacity.forEach(([value, opacity]) => {
    opacityTransfer.addPoint(value, opacity);
  });

  const property = vtkState.actor.getProperty();
  const lighting = getVolumeLightingConfig(volumeRenderingMode.value);
  property.setRGBTransferFunction(0, colorTransfer);
  property.setScalarOpacity(0, opacityTransfer);
  property.setScalarOpacityUnitDistance(0, Math.max(0.2, downsampleFactor.value * 0.85));
  applyDiscreteLabelVolumeInterpolation(property);
  property.setShade(lighting.shade);
  property.setAmbient(lighting.ambient);
  property.setDiffuse(lighting.diffuse);
  property.setSpecular(lighting.specular);
  property.setSpecularPower(lighting.specularPower);

  vtkState.mapper.setSampleDistance(sampleDistance.value);
  scheduleRender();
}

function applyVolumeRenderingMode(): void {
  if (!vtkState.mapper) {
    return;
  }

  vtkState.mapper.setBlendMode(getVolumeRenderingBlendMode(volumeRenderingMode.value));
  const property = vtkState.actor?.getProperty();
  if (property) {
    const lighting = getVolumeLightingConfig(volumeRenderingMode.value);
    property.setShade(lighting.shade);
    property.setAmbient(lighting.ambient);
    property.setDiffuse(lighting.diffuse);
    property.setSpecular(lighting.specular);
    property.setSpecularPower(lighting.specularPower);
  }
  scheduleRender();
}

function applyLayerVisibility(): void {
  vtkState.actor?.setVisibility(volumeLayer.value?.visible ?? true);
  applyTransferFunctions();
  applyStackClipping();
}

function ensureVtkWindow(): GenericRenderWindow {
  if (vtkState.renderWindow) {
    return vtkState.renderWindow;
  }
  if (!vtkContainer.value) {
    throw new Error('3D container is not ready');
  }

  const genericWindow = vtkGenericRenderWindow.newInstance({
    background: [0.02, 0.025, 0.035],
    listenWindowResize: true,
  });
  genericWindow.setContainer(vtkContainer.value);
  genericWindow.getRenderer().setBackground([0.02, 0.025, 0.035]);
  genericWindow.resize();
  vtkState.renderWindow = genericWindow;
  ensureOrientationMarker(genericWindow);
  return genericWindow;
}

function ensureOrientationMarker(genericWindow: GenericRenderWindow): void {
  if (vtkState.orientationWidget) {
    return;
  }

  const actor = vtkAxesActor.newInstance();
  actor.setXAxisColor([255, 64, 64]);
  actor.setYAxisColor([70, 220, 100]);
  actor.setZAxisColor([90, 150, 255]);

  const widget = vtkOrientationMarkerWidget.newInstance({
    actor,
    interactor: genericWindow.getInteractor(),
    parentRenderer: genericWindow.getRenderer(),
    viewportCorner: Corners.BOTTOM_RIGHT,
    viewportSize: 0.16,
    minPixelSize: 96,
    maxPixelSize: 180,
  });
  widget.setEnabled(true);
  vtkState.orientationActor = actor;
  vtkState.orientationWidget = widget;
}

function applyCameraView(view: CameraViewAxis): void {
  if (!meta.value || !vtkState.renderWindow) {
    return;
  }

  const renderer = vtkState.renderWindow.getRenderer();
  const camera = renderer.getActiveCamera();
  const preset = getCameraViewPreset(view, meta.value.shape as VolumeShapeZYX);
  camera.setFocalPoint(...preset.focalPoint);
  camera.setPosition(...preset.position);
  camera.setViewUp(...preset.viewUp);
  renderer.resetCameraClippingRange();
  vtkState.orientationWidget?.updateMarkerOrientation();
  scheduleRender();
}

function removeCurrentVolume(): void {
  if (vtkState.renderWindow && vtkState.actor) {
    vtkState.renderWindow.getRenderer().removeVolume(vtkState.actor);
  }
  vtkState.actor?.delete();
  vtkState.mapper?.delete();
  vtkState.actor = null;
  vtkState.mapper = null;
}

function applyStackClipping(): void {
  if (!vtkState.mapper) {
    return;
  }

  vtkState.mapper.removeAllClippingPlanes();
  const clippingConfigs =
    planeRenderMode.value === 'plane'
      ? getPlaneSlabClipPlaneConfigs(
          renderAxis.value,
          stackEndIndex.value,
          planeThickness.value,
          downsampleFactor.value,
        )
      : [getPlaneClipPlaneConfig(renderAxis.value, stackEndIndex.value, downsampleFactor.value)];

  clippingConfigs.forEach(({ origin, normal }) => {
    const plane = vtkPlane.newInstance();
    plane.setOrigin(origin);
    plane.setNormal(normal);
    vtkState.mapper?.addClippingPlane(plane);
  });
  scheduleRender();
}

function createImageData(payload: BinaryPayload, factor = downsampleFactor.value): VtkImageData {
  if (payload.shape.length !== 3) {
    throw new Error(`Invalid volume shape: ${payload.shape.join(',')}`);
  }

  const [zSize, ySize, xSize] = payload.shape;
  if (!xSize || !ySize || !zSize) {
    throw new Error(`Invalid volume shape: ${payload.shape.join(',')}`);
  }

  const imageData = vtkImageData.newInstance();
  imageData.setDimensions(xSize, ySize, zSize);
  imageData.setSpacing([factor, factor, factor]);
  imageData.setOrigin([0, 0, 0]);
  imageData.getPointData().setScalars(
    vtkDataArray.newInstance({
      name: 'Intensity',
      numberOfComponents: 1,
      values: payload.data,
    }),
  );
  return imageData;
}

function markVolumeDataChanged(
  imageData: VtkImageData,
  scalars: VtkDataArray,
  mapper: VtkVolumeMapper,
): void {
  scalars.dataChange();
  imageData.modified();
  mapper.modified();
  scheduleRender();
}

function renderVolumePayload(payload: BinaryPayload, factor: number): void {
  volumeShape.value = payload.shape;
  volumeStreamTotalLayers.value = payload.shape[0] ?? 0;
  volumeStreamLoadedLayers.value = volumeStreamTotalLayers.value;

  const genericWindow = ensureVtkWindow();
  const mapper = vtkVolumeMapper.newInstance();
  const actor = vtkVolume.newInstance();
  mapper.setInputData(createImageData(payload, factor));
  mapper.setSampleDistance(sampleDistance.value);
  mapper.setBlendMode(getVolumeRenderingBlendMode(volumeRenderingMode.value));
  actor.setMapper(mapper);

  removeCurrentVolume();
  vtkState.actor = actor;
  vtkState.mapper = mapper;
  genericWindow.getRenderer().addVolume(actor);
  if (renderAxis.value === 'z') {
    stackEndIndex.value = stackMax.value;
  }
  applyLayerVisibility();
  applyCameraView('iso');
  scheduleRender();
  volumeLoaded.value = true;
  status.value = `3D volume ${volumeShapeLabel.value}`;
}

function getVolumeCacheKey(factor: number): string {
  return `${props.apiBaseUrl}\u0000${props.volumeUuid ?? ''}\u0000${factor}`;
}

async function loadVolume(): Promise<void> {
  abortVolumeLoad();
  const loadId = volumeLoadSequence + 1;
  volumeLoadSequence = loadId;
  const requestedFactor = downsampleFactor.value;
  const cacheKey = getVolumeCacheKey(requestedFactor);
  const cachedPayload = volumePayloadCache.get(cacheKey);
  if (cachedPayload) {
    clearError();
    loading.value = false;
    try {
      await nextTick();
      renderVolumePayload(cachedPayload, requestedFactor);
    } catch (error) {
      volumeLoaded.value = false;
      setError(error);
    }
    return;
  }

  const abortController = new AbortController();
  volumeAbortController = abortController;
  clearError();
  loading.value = true;
  volumeLoaded.value = false;
  resetVolumeStreamProgress();
  status.value = `Opening 3D layer stream at ${requestedFactor}x downsample`;

  let imageData: VtkImageData | null = null;
  let scalars: VtkDataArray | null = null;
  let mapper: VtkVolumeMapper | null = null;

  try {
    await nextTick();
    const payload = await fetchDownsampledVolumeLayers(
      props.apiBaseUrl,
      requestedFactor,
      { volumeUuid: props.volumeUuid },
      {
        onStart: (stream) => {
          if (loadId !== volumeLoadSequence || abortController.signal.aborted) {
            return;
          }

          volumeShape.value = stream.shape;
          volumeStreamTotalLayers.value = stream.totalLayers;
          volumeStreamLoadedLayers.value = 0;

          const genericWindow = ensureVtkWindow();
          mapper = vtkVolumeMapper.newInstance();
          const actor = vtkVolume.newInstance();
          imageData = createImageData(stream, requestedFactor);
          scalars = imageData.getPointData().getScalars();
          mapper.setInputData(imageData);
          mapper.setSampleDistance(sampleDistance.value);
          mapper.setBlendMode(getVolumeRenderingBlendMode(volumeRenderingMode.value));
          actor.setMapper(mapper);

          removeCurrentVolume();
          vtkState.actor = actor;
          vtkState.mapper = mapper;
          genericWindow.getRenderer().addVolume(actor);
          if (renderAxis.value === 'z') {
            stackEndIndex.value = 0;
          }
          applyLayerVisibility();
          applyCameraView('iso');
          status.value = `Receiving layers ${volumeStreamProgressLabel.value}`;
          scheduleRender();
        },
        onLayer: (layer) => {
          if (
            loadId !== volumeLoadSequence ||
            abortController.signal.aborted ||
            !imageData ||
            !scalars ||
            !mapper
          ) {
            return;
          }

          volumeStreamTotalLayers.value = layer.totalLayers;
          volumeStreamLoadedLayers.value = layer.layersLoaded;
          status.value = `Receiving layers ${volumeStreamProgressLabel.value}`;
          if (renderAxis.value === 'z') {
            stackEndIndex.value = Math.min(
              stackMax.value,
              Math.max(0, layer.layersLoaded * requestedFactor - 1),
            );
          }
          markVolumeDataChanged(imageData, scalars, mapper);
        },
      },
      abortController.signal,
    );
    if (loadId !== volumeLoadSequence || abortController.signal.aborted) {
      return;
    }

    volumePayloadCache.set(cacheKey, payload);
    volumeShape.value = payload.shape;
    volumeStreamLoadedLayers.value = volumeStreamTotalLayers.value || (payload.shape[0] ?? 0);
    volumeLoaded.value = true;
    if (renderAxis.value === 'z') {
      stackEndIndex.value = stackMax.value;
    }
    status.value = `3D volume ${volumeShapeLabel.value}`;
  } catch (error) {
    if (isAbortError(error)) {
      return;
    }
    setError(error);
  } finally {
    if (loadId === volumeLoadSequence) {
      loading.value = false;
      volumeAbortController = null;
    }
  }
}

async function loadMeta(): Promise<void> {
  loading.value = true;
  clearError();

  try {
    meta.value = await fetchVolumeMeta(props.apiBaseUrl, { volumeUuid: props.volumeUuid });
    napariLayers.value = createNapariLayersFromIntensities(meta.value.intensities);
    activeLayerId.value = VOLUME_LAYER_ID;
    sliceIndex.value = Math.floor((meta.value.shape[0] ?? 1) / 2);
    stackEndIndex.value = stackMax.value;
    status.value = 'Metadata ready';
    if (mode.value === '2d') {
      await loadSlice();
    } else {
      await loadVolume();
    }
  } catch (error) {
    setError(error);
  } finally {
    loading.value = false;
  }
}

watch(axis, async () => {
  stopSlicePlayback();
  sliceIndex.value = Math.min(sliceIndex.value, sliceMax.value);
  await loadSlice();
});

watch(sliceIndex, async () => {
  await loadSlice();
});

watch(mode, async (nextMode) => {
  if (nextMode !== '3d') {
    stopStackPlayback();
    abortVolumeLoad();
  }
  if (nextMode !== '2d') {
    stopSlicePlayback();
  }
  if (nextMode === '2d') {
    await loadSlice();
  }
  if (nextMode === '3d' && !volumeLoaded.value) {
    await loadVolume();
  }
});

watch(downsampleFactor, async () => {
  if (mode.value === '3d') {
    await loadVolume();
  }
});

watch(sampleDistance, () => {
  applyTransferFunctions();
});

watch(napariLayers, () => {
  ensureActiveLayer();
  applyLayerVisibility();
}, { deep: true });

watch(volumeRenderingMode, () => {
  applyVolumeRenderingMode();
  applyTransferFunctions();
});

watch(stackEndIndex, () => {
  stackEndIndex.value = clampPlanePosition(
    stackEndIndex.value,
    currentVolumeShape.value,
    renderAxis.value,
  );
  applyStackClipping();
});

watch(planeAxis, () => {
  stopStackPlayback();
  stackEndIndex.value =
    planeRenderMode.value === 'stack'
      ? stackMax.value
      : clampPlanePosition(
          stackEndIndex.value,
          currentVolumeShape.value,
          renderAxis.value,
        );
  applyStackClipping();
});

watch(planeRenderMode, (nextMode) => {
  stopStackPlayback();
  stackEndIndex.value =
    nextMode === 'stack'
      ? stackMax.value
      : clampPlanePosition(
          stackEndIndex.value,
          currentVolumeShape.value,
          renderAxis.value,
        );
  applyStackClipping();
});

watch(planeThickness, () => {
  applyStackClipping();
});

watch(stackPlaybackInterval, () => {
  if (isStackPlaying.value) {
    stopStackPlayback();
    toggleStackPlayback();
  }
});

watch(slicePlaybackInterval, () => {
  if (isSlicePlaying.value) {
    stopSlicePlayback();
    toggleSlicePlayback();
  }
});

onMounted(async () => {
  await loadMeta();
});

onUnmounted(() => {
  abortVolumeLoad();
  stopStackPlayback();
  stopSlicePlayback();
  if (renderFrameId !== null && typeof window !== 'undefined') {
    window.cancelAnimationFrame(renderFrameId);
  }
  vtkState.orientationWidget?.setEnabled(false);
  vtkState.orientationWidget?.delete();
  vtkState.renderWindow?.delete();
});
</script>

<template>
  <section
    class="relative mx-auto flex h-screen w-full max-w-[1800px] flex-col overflow-hidden bg-zinc-100 text-zinc-950 dark:bg-[#101014] dark:text-zinc-100"
    :aria-busy="isInteractionLocked"
  >
    <header
      class="shrink-0 border-b border-zinc-300 bg-zinc-200/90 text-xs text-zinc-700 dark:border-[#303036] dark:bg-[#1c1c22] dark:text-zinc-300"
    >
      <div class="flex h-8 items-center justify-end gap-3 px-3">
        <div class="flex shrink-0 items-center gap-3 tabular-nums">
          <span>{{ visibleLayerCount }} / {{ napariLayers.length }} layers</span>
          <span>{{ status }}</span>
        </div>
      </div>
    </header>

    <div
      v-if="errorMessage"
      class="shrink-0 border-b border-red-500/50 bg-red-100 px-3 py-2 text-sm text-red-800 dark:bg-red-950/50 dark:text-red-100"
    >
      {{ errorMessage }}
    </div>

    <div
      class="grid min-h-0 flex-1 grid-cols-[292px_minmax(0,1fr)]"
      :inert="isInteractionLocked"
    >
      <aside
        class="flex min-h-0 flex-col border-r border-zinc-300 bg-zinc-50 text-xs dark:border-[#303036] dark:bg-[#18181d]"
      >
        <section class="border-b border-zinc-300 p-3 dark:border-[#303036]">
          <div class="mb-3 flex items-center justify-between gap-2">
            <div>
              <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">Layer Controls</h2>
              <p class="mt-0.5 text-zinc-500 dark:text-zinc-500">
                {{ activeLayer?.name ?? '-' }} / {{ activeLayerOpacityLabel }}
              </p>
            </div>
            <button
              class="border border-zinc-300 bg-white px-2 py-1 text-zinc-700 hover:border-cyan-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-200 dark:hover:border-cyan-400"
              type="button"
              @click="mode === '3d' ? loadVolume() : loadSlice()"
            >
              Reload
            </button>
          </div>

          <div class="grid grid-cols-2 border border-zinc-300 dark:border-[#3a3a42]">
            <button
              data-testid="mode-3d"
              class="px-3 py-2 transition"
              :class="
                mode === '3d'
                  ? 'bg-cyan-500 text-zinc-950'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-[#222229] dark:text-zinc-300 dark:hover:bg-[#2a2a32]'
              "
              type="button"
              @click="mode = '3d'"
            >
              3D
            </button>
            <button
              data-testid="mode-2d"
              class="px-3 py-2 transition"
              :class="
                mode === '2d'
                  ? 'bg-cyan-500 text-zinc-950'
                  : 'bg-white text-zinc-600 hover:bg-zinc-100 dark:bg-[#222229] dark:text-zinc-300 dark:hover:bg-[#2a2a32]'
              "
              type="button"
              @click="mode = '2d'"
            >
              2D
            </button>
          </div>
        </section>

        <section class="border-b border-zinc-300 p-3 dark:border-[#303036]">
          <h2 class="mb-2 font-semibold text-zinc-950 dark:text-zinc-100">Viewer Controls</h2>

          <div
            v-if="mode === '3d'"
            class="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2"
          >
            <label class="text-zinc-500 dark:text-zinc-400" for="volume-rendering">Volume</label>
            <select
              id="volume-rendering"
              v-model="volumeRenderingMode"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option
                v-for="option in VOLUME_RENDERING_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <div
              class="col-start-2 flex flex-wrap gap-1"
              aria-label="Volume rendering help"
            >
              <button
                v-for="option in VOLUME_RENDERING_OPTIONS"
                :key="`${option.value}-help`"
                class="h-5 min-w-5 border px-1 text-[9px] font-semibold leading-none transition"
                :class="
                  volumeRenderingMode === option.value
                    ? 'border-cyan-400 bg-cyan-500 text-zinc-950'
                    : 'border-zinc-300 bg-white text-zinc-600 hover:border-cyan-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-300'
                "
                type="button"
                :title="`${option.label}: ${option.description}`"
                :aria-label="`${option.label}: ${option.description}`"
                @click="volumeRenderingMode = option.value"
              >
                {{ option.icon }}
              </button>
            </div>

            <label class="text-zinc-500 dark:text-zinc-400" for="rendering-mode">View mode</label>
            <select
              id="rendering-mode"
              v-model="planeRenderMode"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option value="stack">stack</option>
              <option value="plane">plane</option>
            </select>

            <label class="text-zinc-500 dark:text-zinc-400" for="plane-axis">Axis</label>
            <select
              id="plane-axis"
              v-model="planeAxis"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option value="z">Z</option>
              <option value="y">Y</option>
              <option value="x">X</option>
            </select>

            <label class="text-zinc-500 dark:text-zinc-400" for="plane-thickness">Thickness</label>
            <div class="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2">
              <input
                id="plane-thickness"
                v-model.number="planeThickness"
                class="w-full accent-cyan-500 disabled:cursor-not-allowed disabled:opacity-40"
                type="range"
                min="1"
                max="120"
                step="1"
                :disabled="!isPlaneThicknessEnabled"
              />
              <span class="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                {{ planeThickness }}
              </span>
            </div>

            <label class="text-zinc-500 dark:text-zinc-400" for="downsample">Downsample</label>
            <select
              id="downsample"
              v-model.number="downsampleFactor"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option
                v-for="option in DOWNSAMPLE_OPTIONS"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>

            <label
              class="flex items-center justify-between gap-1 text-zinc-500 dark:text-zinc-400"
              for="sample-distance"
            >
              <span>Ray step</span>
              <span
                class="inline-flex h-4 w-4 items-center justify-center border border-zinc-300 text-[10px] text-zinc-500 dark:border-[#3a3a42] dark:text-zinc-300"
                title="Distance between samples along each volume ray. Lower is smoother but slower; higher is faster but coarser."
                aria-label="Ray step help"
              >
                i
              </span>
            </label>
            <div class="grid grid-cols-[minmax(0,1fr)_42px] items-center gap-2">
              <input
                id="sample-distance"
                v-model.number="sampleDistance"
                class="w-full accent-amber-400"
                type="range"
                min="0.4"
                max="3"
                step="0.1"
              />
              <span class="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                {{ sampleDistance.toFixed(1) }}
              </span>
            </div>
          </div>

          <div
            v-if="mode === '2d'"
            class="grid grid-cols-[92px_minmax(0,1fr)] items-center gap-2"
          >
            <label class="text-zinc-500 dark:text-zinc-400" for="axis">Axis</label>
            <select
              id="axis"
              v-model="axis"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option value="z">Z</option>
              <option value="y">Y</option>
              <option value="x">X</option>
            </select>

            <label class="text-zinc-500 dark:text-zinc-400" for="slice-speed">Speed</label>
            <select
              id="slice-speed"
              v-model.number="slicePlaybackInterval"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-900 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
            >
              <option :value="150">slow</option>
              <option :value="90">normal</option>
              <option :value="45">fast</option>
            </select>
          </div>

          <div v-if="mode === '3d'" class="mt-3 grid grid-cols-4 gap-1.5">
            <button
              data-testid="view-x"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-700 hover:border-red-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="applyCameraView('x')"
            >
              X
            </button>
            <button
              data-testid="view-y"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-700 hover:border-emerald-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="applyCameraView('y')"
            >
              Y
            </button>
            <button
              data-testid="view-z"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-700 hover:border-blue-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="applyCameraView('z')"
            >
              Z
            </button>
            <button
              data-testid="view-iso"
              class="border border-zinc-300 bg-white px-2 py-1.5 text-zinc-700 hover:border-cyan-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="applyCameraView('iso')"
            >
              Iso
            </button>
          </div>
        </section>

        <section class="flex min-h-0 flex-1 flex-col p-3">
          <div class="mb-2 flex items-center justify-between">
            <h2 class="font-semibold text-zinc-950 dark:text-zinc-100">Layer List</h2>
            <div class="flex items-center gap-2">
              <span class="tabular-nums text-zinc-500">{{ visibleLayerCount }}</span>
              <div
                class="relative"
                @keydown.esc.stop="layerMenuOpen = false"
              >
                <button
                  data-testid="layer-actions-menu"
                  class="flex h-7 w-7 items-center justify-center border border-zinc-300 bg-white text-zinc-600 hover:border-cyan-400 hover:text-cyan-600 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-300 dark:hover:border-cyan-400 dark:hover:text-cyan-300"
                  type="button"
                  aria-label="Layer actions"
                  aria-haspopup="menu"
                  :aria-expanded="layerMenuOpen"
                  @click="layerMenuOpen = !layerMenuOpen"
                >
                  <svg aria-hidden="true" class="h-4 w-4" viewBox="0 0 16 16" fill="currentColor">
                    <circle cx="8" cy="3" r="1.25" />
                    <circle cx="8" cy="8" r="1.25" />
                    <circle cx="8" cy="13" r="1.25" />
                  </svg>
                </button>
                <div
                  v-if="layerMenuOpen"
                  class="absolute right-0 top-full z-30 mt-1 w-52 border border-zinc-300 bg-white py-1 shadow-xl dark:border-[#3a3a42] dark:bg-[#222229]"
                  role="menu"
                  aria-label="Layer actions"
                >
                  <button
                    class="block w-full px-3 py-2 text-left text-zinc-700 hover:bg-cyan-50 hover:text-cyan-700 dark:text-zinc-200 dark:hover:bg-cyan-950/50 dark:hover:text-cyan-200"
                    type="button"
                    role="menuitem"
                    @click="addIntensityLayerFromMenu"
                  >
                    Add
                  </button>
                  <button
                    class="block w-full px-3 py-2 text-left text-zinc-700 hover:bg-red-50 hover:text-red-600 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-red-950/40 dark:hover:text-red-300"
                    type="button"
                    role="menuitem"
                    :disabled="napariLayers.length <= 1"
                    @click="deleteAllLayersExceptVolume"
                  >
                    Delete all except volume
                  </button>
                  <button
                    class="block w-full px-3 py-2 text-left text-zinc-700 hover:bg-zinc-100 disabled:cursor-not-allowed disabled:opacity-40 dark:text-zinc-200 dark:hover:bg-[#2b2b33]"
                    type="button"
                    role="menuitem"
                    :disabled="!meta"
                    @click="resetLayersToSource"
                  >
                    Reset
                  </button>
                </div>
              </div>
            </div>
          </div>

          <div class="min-h-0 space-y-1 overflow-y-auto pr-1">
            <div
              v-for="layer in napariLayers"
              :key="layer.id"
              class="border px-2 py-2 transition"
              :class="
                activeLayerId === layer.id
                  ? 'border-cyan-400 bg-cyan-50 text-zinc-950 dark:bg-cyan-950/40 dark:text-zinc-50'
                  : 'border-zinc-300 bg-white text-zinc-700 hover:border-zinc-400 dark:border-[#34343c] dark:bg-[#202026] dark:text-zinc-300'
              "
              @click="setActiveLayer(layer.id)"
            >
              <div class="grid grid-cols-[28px_22px_minmax(0,1fr)_44px_30px] items-center gap-2">
                <button
                  class="border px-1 py-0.5 text-center text-[10px] uppercase"
                  :class="
                    layer.visible
                      ? 'border-cyan-400 text-cyan-700 dark:text-cyan-300'
                      : 'border-zinc-300 text-zinc-400 dark:border-zinc-700'
                  "
                  type="button"
                  @click.stop="toggleLayerVisibility(layer.id)"
                >
                  {{ layer.visible ? 'on' : 'off' }}
                </button>
                <input
                  v-if="layer.intensityRange"
                  class="h-5 w-5 cursor-pointer border-0 bg-transparent p-0"
                  type="color"
                  :aria-label="`${layer.name} color`"
                  :value="layer.color"
                  @click.stop
                  @input="updateLayerColor(layer.id, $event)"
                />
                <span
                  v-else
                  class="h-3 w-3 justify-self-center border border-black/10"
                  :style="{ backgroundColor: layer.color }"
                ></span>
                <input
                  class="min-w-0 border border-transparent bg-transparent px-1 py-0.5 text-xs text-inherit outline-none focus:border-cyan-400 dark:focus:border-cyan-400"
                  :aria-label="`${layer.name} name`"
                  :value="layer.name"
                  @click.stop
                  @input="updateLayerName(layer.id, $event)"
                />
                <span class="text-right tabular-nums text-[11px] text-zinc-500">
                  {{ formatLayerOpacity(layer.opacity) }}
                </span>
                <button
                  v-if="canRemoveLayer(layer)"
                  class="border border-zinc-300 px-1 py-0.5 text-[10px] text-zinc-500 hover:border-red-400 hover:text-red-500 dark:border-zinc-700"
                  type="button"
                  @click.stop="deleteLayer(layer.id)"
                >
                  Del
                </button>
                <span v-else class="text-center text-[10px] text-zinc-500">fix</span>
              </div>

              <div class="mt-1 grid grid-cols-[50px_minmax(0,1fr)] items-center gap-2 text-[10px] text-zinc-500">
                <span>{{ layer.type }} / {{ layer.blending }}</span>
                <span class="truncate text-right tabular-nums">
                  {{ formatLayerIntensityRange(layer.intensityRange) }}
                </span>
              </div>

              <div class="mt-2 grid grid-cols-[48px_minmax(0,1fr)_42px] items-center gap-2 text-[10px]">
                <span class="text-zinc-500">opacity</span>
                <input
                  class="w-full"
                  type="range"
                  min="0"
                  max="1"
                  step="0.01"
                  :aria-label="`${layer.name} opacity`"
                  :style="{ accentColor: layer.color }"
                  :value="layer.opacity"
                  @click.stop
                  @input="updateLayerOpacity(layer.id, $event)"
                />
                <span class="text-right tabular-nums text-zinc-600 dark:text-zinc-300">
                  {{ formatLayerOpacity(layer.opacity) }}
                </span>
              </div>

              <div
                v-if="layer.intensityRange"
                class="mt-2 grid grid-cols-[48px_minmax(0,1fr)_minmax(0,1fr)] items-center gap-2 text-[10px]"
              >
                <span class="text-zinc-500">intensity</span>
                <input
                  class="w-full border border-zinc-300 bg-white px-1 py-1 text-right tabular-nums text-zinc-900 dark:border-[#3a3a42] dark:bg-[#15151a] dark:text-zinc-100"
                  type="number"
                  min="0"
                  :max="labelValueMax"
                  :aria-label="`${layer.name} intensity min`"
                  :value="layer.intensityRange[0]"
                  @click.stop
                  @input="updateLayerRange(layer.id, 'min', $event)"
                />
                <input
                  class="w-full border border-zinc-300 bg-white px-1 py-1 text-right tabular-nums text-zinc-900 dark:border-[#3a3a42] dark:bg-[#15151a] dark:text-zinc-100"
                  type="number"
                  min="0"
                  :max="labelValueMax"
                  :aria-label="`${layer.name} intensity max`"
                  :value="layer.intensityRange[1]"
                  @click.stop
                  @input="updateLayerRange(layer.id, 'max', $event)"
                />
              </div>
            </div>
          </div>
        </section>
      </aside>

      <main class="flex min-w-0 flex-col bg-zinc-200 dark:bg-[#111116]">
        <div class="relative min-h-0 flex-1 overflow-hidden bg-black">
          <div
            v-show="show3dPanel"
            data-testid="vtk-panel"
            class="absolute inset-0 overflow-hidden bg-black"
          >
            <div ref="vtkContainer" class="vtk-container h-full w-full"></div>
            <div
              class="pointer-events-none absolute left-3 top-3 border border-white/10 bg-black/60 px-2 py-1 text-xs text-zinc-200"
            >
              {{ volumeRenderingLabel }} / {{ planeModeLabel }} / {{ stackProgressLabel }} / {{ originalShapeLabel }}
            </div>
          </div>

          <div
            v-show="show2dPanel"
            data-testid="slice-panel"
            class="absolute inset-0 grid min-h-0 grid-cols-[minmax(0,1fr)_170px] bg-black"
          >
            <div class="flex min-h-0 items-center justify-center overflow-hidden">
              <canvas
                ref="sliceCanvas"
                class="max-h-full max-w-full [image-rendering:pixelated]"
                aria-label="2D volume slice"
              ></canvas>
            </div>
            <div class="border-l border-white/10 bg-black/70 p-3 text-xs text-zinc-300">
              <div class="mb-2 flex items-center gap-2">
                <span class="h-3 w-3 bg-black ring-1 ring-zinc-500"></span>
                <span>0 pore / substrate</span>
              </div>
              <div
                v-for="layer in intensityLayers"
                :key="`legend-${layer.id}`"
                class="mb-2 flex items-center gap-2 last:mb-0"
              >
                <span
                  class="h-3 w-3"
                  :style="{ backgroundColor: layer.color }"
                ></span>
                <span>
                  {{ formatLayerIntensityRange(layer.intensityRange) }}
                  {{ layer.name }}
                </span>
              </div>
            </div>
          </div>
        </div>

        <footer
          class="shrink-0 border-t border-zinc-300 bg-zinc-100 p-3 text-xs dark:border-[#303036] dark:bg-[#18181d]"
        >
          <div v-if="mode === '3d'" class="grid grid-cols-[80px_minmax(0,1fr)_84px_92px] items-center gap-3">
            <label class="text-zinc-500 dark:text-zinc-400" for="stack-z">Dims</label>
            <input
              :key="renderAxis"
              id="stack-z"
              v-model.number="stackEndIndex"
              data-testid="stack-z"
              class="w-full accent-cyan-500"
              type="range"
              min="0"
              :max="stackMax"
              step="1"
            />
            <span class="text-right tabular-nums text-zinc-700 dark:text-zinc-300">
              {{ stackProgressLabel }}
            </span>
            <button
              data-testid="stack-playback"
              class="border border-zinc-300 bg-white px-3 py-2 text-zinc-800 hover:border-cyan-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="toggleStackPlayback"
            >
              {{ isStackPlaying ? 'Pause' : 'Play' }}
            </button>
          </div>

          <div v-if="mode === '2d'" class="grid grid-cols-[80px_minmax(0,1fr)_84px_92px] items-center gap-3">
            <label class="text-zinc-500 dark:text-zinc-400" for="slice">Dims</label>
            <input
              id="slice"
              v-model.number="sliceIndex"
              class="w-full accent-cyan-500"
              type="range"
              min="0"
              :max="sliceMax"
              step="1"
            />
            <span class="text-right tabular-nums text-zinc-700 dark:text-zinc-300">
              {{ sliceProgressLabel }}
            </span>
            <button
              data-testid="slice-playback"
              class="border border-zinc-300 bg-white px-3 py-2 text-zinc-800 hover:border-cyan-400 dark:border-[#3a3a42] dark:bg-[#222229] dark:text-zinc-100"
              type="button"
              @click="toggleSlicePlayback"
            >
              {{ isSlicePlaying ? 'Pause' : 'Play' }}
            </button>
          </div>
        </footer>

        <div
          class="grid h-7 shrink-0 grid-cols-4 items-center border-t border-zinc-300 bg-zinc-200 px-3 text-[11px] text-zinc-600 dark:border-[#303036] dark:bg-[#1c1c22] dark:text-zinc-400"
        >
          <span class="truncate">shape {{ originalShapeLabel }}</span>
          <span class="truncate">rendered {{ volumeShapeLabel }}</span>
          <span class="truncate">dtype {{ meta?.dtype ?? '-' }}</span>
          <span class="truncate text-right">{{ mode.toUpperCase() }} / {{ loading ? 'loading' : 'ready' }}</span>
        </div>
      </main>
    </div>

    <div
      v-if="isInteractionLocked"
      data-testid="volume-loading-overlay"
      class="absolute inset-0 z-50 flex items-center justify-center bg-black/40"
      role="status"
      aria-live="polite"
      aria-label="Loading 3D volume data"
    >
      <div
        class="w-[min(320px,calc(100%-32px))] border border-white/15 bg-zinc-950/90 px-6 py-5 text-center text-zinc-100 shadow-2xl"
      >
        <div
          class="mx-auto h-11 w-11 animate-spin rounded-full border-4 border-zinc-600 border-t-cyan-400"
          aria-hidden="true"
        ></div>
        <p class="mt-4 text-sm font-semibold">Loading 3D data</p>
        <p class="mt-1 text-3xl font-semibold tabular-nums text-cyan-300">
          {{ volumeStreamPercent }}%
        </p>
        <p class="mt-1 text-xs tabular-nums text-zinc-400">
          {{ volumeStreamProgressLabel }}
        </p>
        <div
          class="mt-4 h-2 overflow-hidden rounded-full bg-zinc-800"
          role="progressbar"
          aria-label="3D data loading progress"
          aria-valuemin="0"
          aria-valuemax="100"
          :aria-valuenow="volumeStreamPercent"
        >
          <div
            class="h-full rounded-full bg-cyan-400 transition-[width] duration-150 ease-out"
            :style="{ width: `${volumeStreamPercent}%` }"
          ></div>
        </div>
        <p class="mt-3 text-[11px] text-zinc-500">Controls are available after loading</p>
      </div>
    </div>
  </section>
</template>
