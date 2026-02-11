"use client";

import { useRef, useEffect } from 'react';
import {
  Clock,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
  SRGBColorSpace,
  MathUtils,
  Vector2,
  Vector3,
  MeshPhysicalMaterial,
  ShaderChunk,
  Color,
  Object3D,
  InstancedMesh,
  PMREMGenerator,
  SphereGeometry,
  AmbientLight,
  PointLight,
  ACESFilmicToneMapping,
  Raycaster,
  Plane
} from 'three';
// @ts-ignore
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import './Ballpit.css';

class BallpitClass {
  config: any;
  canvas: HTMLCanvasElement;
  camera!: PerspectiveCamera;
  cameraMinAspect?: number;
  cameraMaxAspect?: number;
  cameraFov?: number;
  maxPixelRatio?: number;
  minPixelRatio?: number;
  scene!: Scene;
  renderer!: WebGLRenderer;
  #postprocessing: any;
  size = { width: 0, height: 0, wWidth: 0, wHeight: 0, ratio: 0, pixelRatio: 0 };
  render: () => void = this.#renderLoop;
  onBeforeRender = (e: any) => { };
  onAfterRender = (e: any) => { };
  onAfterResize = (e: any) => { };
  #isVisible = false;
  #isAnimating = false;
  isDisposed = false;
  #interactionObserver?: IntersectionObserver;
  #resizeObserver?: ResizeObserver;
  #resizeTimeout?: any;
  #clock = new Clock();
  #time = { elapsed: 0, delta: 0 };
  #rafId?: number;

  constructor(config: any) {
    this.config = { ...config };
    this.canvas = this.config.canvas;

    this.#initCamera();
    this.#initScene();
    this.#initRenderer();
    this.resize();
    this.#initObservers();
  }

  #initCamera() {
    this.camera = new PerspectiveCamera();
    this.cameraFov = this.camera.fov;
  }
  #initScene() {
    this.scene = new Scene();
  }
  #initRenderer() {
    if (this.config.canvas) {
      this.canvas = this.config.canvas;
    } else if (this.config.id) {
      this.canvas = document.getElementById(this.config.id) as HTMLCanvasElement;
    } else {
      console.error('Three: Missing canvas or id parameter');
    }
    this.canvas.style.display = 'block';
    const options = {
      canvas: this.canvas,
      powerPreference: 'high-performance',
      ...(this.config.rendererOptions ?? {})
    };
    this.renderer = new WebGLRenderer(options);
    this.renderer.outputColorSpace = SRGBColorSpace;
  }
  #initObservers() {
    if (!(this.config.size instanceof Object)) {
      window.addEventListener('resize', this.#onResize.bind(this));
      if (this.config.size === 'parent' && this.canvas.parentNode) {
        this.#resizeObserver = new ResizeObserver(this.#onResize.bind(this));
        this.#resizeObserver.observe(this.canvas.parentNode as Element);
      }
    }
    this.#interactionObserver = new IntersectionObserver(this.#onIntersection.bind(this), {
      root: null,
      rootMargin: '0px',
      threshold: 0
    });
    this.#interactionObserver.observe(this.canvas);
    document.addEventListener('visibilitychange', this.#onVisibilityChange.bind(this));
  }
  #disposeObservers() {
    window.removeEventListener('resize', this.#onResize.bind(this));
    this.#resizeObserver?.disconnect();
    this.#interactionObserver?.disconnect();
    document.removeEventListener('visibilitychange', this.#onVisibilityChange.bind(this));
  }
  #onIntersection(entries: IntersectionObserverEntry[]) {
    this.#isVisible = entries[0].isIntersecting;
    this.#isVisible ? this.#startAnimation() : this.#stopAnimation();
  }
  #onVisibilityChange() {
    if (this.#isVisible) {
      document.hidden ? this.#stopAnimation() : this.#startAnimation();
    }
  }
  #onResize() {
    if (this.#resizeTimeout) clearTimeout(this.#resizeTimeout);
    this.#resizeTimeout = setTimeout(this.resize.bind(this), 100);
  }
  resize() {
    let width, height;
    if (this.config.size instanceof Object) {
      width = this.config.size.width;
      height = this.config.size.height;
    } else if (this.config.size === 'parent' && this.canvas.parentNode) {
      width = (this.canvas.parentNode as HTMLElement).offsetWidth;
      height = (this.canvas.parentNode as HTMLElement).offsetHeight;
    } else {
      width = window.innerWidth;
      height = window.innerHeight;
    }
    this.size.width = width;
    this.size.height = height;
    this.size.ratio = width / height;
    this.#updateCamera();
    this.#updateRenderer();
    this.onAfterResize(this.size);
  }
  #updateCamera() {
    this.camera.aspect = this.size.width / this.size.height;
    if (this.camera.isPerspectiveCamera && this.cameraFov) {
      if (this.cameraMinAspect && this.camera.aspect < this.cameraMinAspect) {
        this.#adjustFov(this.cameraMinAspect);
      } else if (this.cameraMaxAspect && this.camera.aspect > this.cameraMaxAspect) {
        this.#adjustFov(this.cameraMaxAspect);
      } else {
        this.camera.fov = this.cameraFov;
      }
    }
    this.camera.updateProjectionMatrix();
    this.updateWorldSize();
  }
  #adjustFov(aspect: number) {
    const t = Math.tan(MathUtils.degToRad(this.cameraFov! / 2)) / (this.camera.aspect / aspect);
    this.camera.fov = 2 * MathUtils.radToDeg(Math.atan(t));
  }
  updateWorldSize() {
    if (this.camera.isPerspectiveCamera) {
      const e = (this.camera.fov * Math.PI) / 180;
      this.size.wHeight = 2 * Math.tan(e / 2) * this.camera.position.length();
      this.size.wWidth = this.size.wHeight * this.camera.aspect;
    } else if ((this.camera as any).isOrthographicCamera) {
      // @ts-ignore
      this.size.wHeight = this.camera.top - this.camera.bottom;
      // @ts-ignore
      this.size.wWidth = this.camera.right - this.camera.left;
    }
  }
  #updateRenderer() {
    this.renderer.setSize(this.size.width, this.size.height);
    this.#postprocessing?.setSize(this.size.width, this.size.height);
    let pixelRatio = window.devicePixelRatio;
    if (this.maxPixelRatio && pixelRatio > this.maxPixelRatio) {
      pixelRatio = this.maxPixelRatio;
    } else if (this.minPixelRatio && pixelRatio < this.minPixelRatio) {
      pixelRatio = this.minPixelRatio;
    }
    this.renderer.setPixelRatio(pixelRatio);
    this.size.pixelRatio = pixelRatio;
  }
  get postprocessing() {
    return this.#postprocessing;
  }
  set postprocessing(e) {
    this.#postprocessing = e;
    this.render = e.render.bind(e);
  }
  #startAnimation() {
    if (this.#isAnimating) return;
    const animate = () => {
      this.#rafId = requestAnimationFrame(animate);
      this.#time.delta = this.#clock.getDelta();
      this.#time.elapsed += this.#time.delta;
      this.onBeforeRender(this.#time);
      this.render();
      this.onAfterRender(this.#time);
    };
    this.#isAnimating = true;
    this.#clock.start();
    animate();
  }
  #stopAnimation() {
    if (this.#isAnimating) {
      cancelAnimationFrame(this.#rafId!);
      this.#isAnimating = false;
      this.#clock.stop();
    }
  }
  #renderLoop() {
    this.renderer.render(this.scene, this.camera);
  }
  clear() {
    this.scene.traverse((e: any) => {
      if (e.isMesh && typeof e.material === 'object' && e.material !== null) {
        Object.keys(e.material).forEach(t => {
          const i = e.material[t];
          if (i !== null && typeof i === 'object' && typeof i.dispose === 'function') {
            i.dispose();
          }
        });
        e.material.dispose();
        e.geometry.dispose();
      }
    });
    this.scene.clear();
  }
  dispose() {
    this.#disposeObservers();
    this.#stopAnimation();
    this.clear();
    this.#postprocessing?.dispose();
    this.renderer.dispose();
    this.isDisposed = true;
  }
}

const mouseMap = new Map();
const mouseVector = new Vector2();
let isPointerListenersAdded = false;

function setupMouse(element: HTMLElement, config: any) {
  const handler = {
    position: new Vector2(),
    nPosition: new Vector2(),
    hover: false,
    touching: false,
    onEnter: () => { },
    onMove: () => { },
    onClick: () => { },
    onLeave: () => { },
    ...config
  };

  if (!mouseMap.has(element)) {
    mouseMap.set(element, handler);
    if (!isPointerListenersAdded) {
      document.body.addEventListener('pointermove', onPointerMove);
      document.body.addEventListener('pointerleave', onPointerLeave);
      document.body.addEventListener('click', onClick);

      document.body.addEventListener('touchstart', onTouchStart, { passive: false });
      document.body.addEventListener('touchmove', onTouchMove, { passive: false });
      document.body.addEventListener('touchend', onTouchEnd, { passive: false });
      document.body.addEventListener('touchcancel', onTouchEnd, { passive: false });

      isPointerListenersAdded = true;
    }
  }

  (handler as any).dispose = () => {
    mouseMap.delete(element);
    if (mouseMap.size === 0) {
      document.body.removeEventListener('pointermove', onPointerMove);
      document.body.removeEventListener('pointerleave', onPointerLeave);
      document.body.removeEventListener('click', onClick);

      document.body.removeEventListener('touchstart', onTouchStart);
      document.body.removeEventListener('touchmove', onTouchMove);
      document.body.removeEventListener('touchend', onTouchEnd);
      document.body.removeEventListener('touchcancel', onTouchEnd);

      isPointerListenersAdded = false;
    }
  };
  return handler;
}

function onPointerMove(e: PointerEvent) {
  mouseVector.x = e.clientX;
  mouseVector.y = e.clientY;
  processInteraction();
}

function processInteraction() {
  for (const [elem, handler] of mouseMap) {
    const rect = elem.getBoundingClientRect();
    if (isInside(rect)) {
      updateHandlerPosition(handler, rect);
      if (!handler.hover) {
        handler.hover = true;
        handler.onEnter(handler);
      }
      handler.onMove(handler);
    } else if (handler.hover && !handler.touching) {
      handler.hover = false;
      handler.onLeave(handler);
    }
  }
}

function onClick(e: MouseEvent) {
  mouseVector.x = e.clientX;
  mouseVector.y = e.clientY;
  for (const [elem, handler] of mouseMap) {
    const rect = elem.getBoundingClientRect();
    updateHandlerPosition(handler, rect);
    if (isInside(rect)) handler.onClick(handler);
  }
}

function onPointerLeave() {
  for (const handler of mouseMap.values()) {
    if (handler.hover) {
      handler.hover = false;
      handler.onLeave(handler);
    }
  }
}

function onTouchStart(e: TouchEvent) {
  if (e.touches.length > 0) {
    e.preventDefault();
    mouseVector.x = e.touches[0].clientX;
    mouseVector.y = e.touches[0].clientY;

    for (const [elem, handler] of mouseMap) {
      const rect = elem.getBoundingClientRect();
      if (isInside(rect)) {
        handler.touching = true;
        updateHandlerPosition(handler, rect);
        if (!handler.hover) {
          handler.hover = true;
          handler.onEnter(handler);
        }
        handler.onMove(handler);
      }
    }
  }
}

function onTouchMove(e: TouchEvent) {
  if (e.touches.length > 0) {
    e.preventDefault();
    mouseVector.x = e.touches[0].clientX;
    mouseVector.y = e.touches[0].clientY;

    for (const [elem, handler] of mouseMap) {
      const rect = elem.getBoundingClientRect();
      updateHandlerPosition(handler, rect);

      if (isInside(rect)) {
        if (!handler.hover) {
          handler.hover = true;
          handler.touching = true;
          handler.onEnter(handler);
        }
        handler.onMove(handler);
      } else if (handler.hover && handler.touching) {
        handler.onMove(handler);
      }
    }
  }
}

function onTouchEnd() {
  for (const [, handler] of mouseMap) {
    if (handler.touching) {
      handler.touching = false;
      if (handler.hover) {
        handler.hover = false;
        handler.onLeave(handler);
      }
    }
  }
}

function updateHandlerPosition(handler: any, rect: DOMRect) {
  const { position, nPosition } = handler;
  position.x = mouseVector.x - rect.left;
  position.y = mouseVector.y - rect.top;
  nPosition.x = (position.x / rect.width) * 2 - 1;
  nPosition.y = (-position.y / rect.height) * 2 + 1;
}

function isInside(rect: DOMRect) {
  const { x, y } = mouseVector;
  const { left, top, width, height } = rect;
  return x >= left && x <= left + width && y >= top && y <= top + height;
}

const { randFloat, randFloatSpread } = MathUtils;
const tempVec = new Vector3();
const tempVec2 = new Vector3();
const tempVec3 = new Vector3();
const tempVec4 = new Vector3();
const tempVec5 = new Vector3();
const tempVec6 = new Vector3();
const tempVec7 = new Vector3();
const tempVec8 = new Vector3();
const tempVec9 = new Vector3();
const tempVec10 = new Vector3();

class Physics {
  config: any;
  positionData: Float32Array;
  velocityData: Float32Array;
  sizeData: Float32Array;
  center: Vector3;

  constructor(config: any) {
    this.config = config;
    this.positionData = new Float32Array(3 * config.count).fill(0);
    this.velocityData = new Float32Array(3 * config.count).fill(0);
    this.sizeData = new Float32Array(config.count).fill(1);
    this.center = new Vector3();
    this.#initPositions();
    this.setSizes();
  }
  #initPositions() {
    const { config, positionData } = this;
    this.center.toArray(positionData, 0);
    for (let i = 1; i < config.count; i++) {
      const s = 3 * i;
      positionData[s] = randFloatSpread(2 * config.maxX);
      positionData[s + 1] = randFloatSpread(2 * config.maxY);
      positionData[s + 2] = randFloatSpread(2 * config.maxZ);
    }
  }
  setSizes() {
    const { config, sizeData } = this;
    sizeData[0] = config.size0;
    for (let i = 1; i < config.count; i++) {
      sizeData[i] = randFloat(config.minSize, config.maxSize);
    }
  }
  update(time: any) {
    const { config, center, positionData, sizeData, velocityData } = this;
    let startIndex = 0;
    if (config.controlSphere0) {
      startIndex = 1;
      tempVec.fromArray(positionData, 0);
      tempVec.lerp(center, 0.1).toArray(positionData, 0);
      tempVec4.set(0, 0, 0).toArray(velocityData, 0);
    }
    for (let idx = startIndex; idx < config.count; idx++) {
      const base = 3 * idx;
      tempVec2.fromArray(positionData, base);
      tempVec5.fromArray(velocityData, base);
      tempVec5.y -= time.delta * config.gravity * sizeData[idx];
      tempVec5.multiplyScalar(config.friction);
      tempVec5.clampLength(0, config.maxVelocity);
      tempVec2.add(tempVec5);
      tempVec2.toArray(positionData, base);
      tempVec5.toArray(velocityData, base);
    }
    for (let idx = startIndex; idx < config.count; idx++) {
      const base = 3 * idx;
      tempVec2.fromArray(positionData, base);
      tempVec5.fromArray(velocityData, base);
      const radius = sizeData[idx];
      for (let jdx = idx + 1; jdx < config.count; jdx++) {
        const otherBase = 3 * jdx;
        tempVec3.fromArray(positionData, otherBase);
        tempVec6.fromArray(velocityData, otherBase);
        const otherRadius = sizeData[jdx];
        tempVec7.copy(tempVec3).sub(tempVec2);
        const dist = tempVec7.length();
        const sumRadius = radius + otherRadius;
        if (dist < sumRadius) {
          const overlap = sumRadius - dist;
          tempVec8.copy(tempVec7)
            .normalize()
            .multiplyScalar(0.5 * overlap);
          tempVec9.copy(tempVec8).multiplyScalar(Math.max(tempVec5.length(), 1));
          tempVec10.copy(tempVec8).multiplyScalar(Math.max(tempVec6.length(), 1));
          tempVec2.sub(tempVec8);
          tempVec5.sub(tempVec9);
          tempVec2.toArray(positionData, base);
          tempVec5.toArray(velocityData, base);
          tempVec3.add(tempVec8);
          tempVec6.add(tempVec10);
          tempVec3.toArray(positionData, otherBase);
          tempVec6.toArray(velocityData, otherBase);
        }
      }
      if (config.controlSphere0) {
        tempVec7.copy(tempVec).sub(tempVec2);
        const dist = tempVec7.length();
        const sumRadius0 = radius + sizeData[0];
        if (dist < sumRadius0) {
          const diff = sumRadius0 - dist;
          tempVec8.copy(tempVec7.normalize()).multiplyScalar(diff);
          tempVec9.copy(tempVec8).multiplyScalar(Math.max(tempVec5.length(), 2));
          tempVec2.sub(tempVec8);
          tempVec5.sub(tempVec9);
        }
      }
      if (Math.abs(tempVec2.x) + radius > config.maxX) {
        tempVec2.x = Math.sign(tempVec2.x) * (config.maxX - radius);
        tempVec5.x = -tempVec5.x * config.wallBounce;
      }
      if (config.gravity === 0) {
        if (Math.abs(tempVec2.y) + radius > config.maxY) {
          tempVec2.y = Math.sign(tempVec2.y) * (config.maxY - radius);
          tempVec5.y = -tempVec5.y * config.wallBounce;
        }
      } else if (tempVec2.y - radius < -config.maxY) {
        tempVec2.y = -config.maxY + radius;
        tempVec5.y = -tempVec5.y * config.wallBounce;
      }
      const maxBoundary = Math.max(config.maxZ, config.maxSize);
      if (Math.abs(tempVec2.z) + radius > maxBoundary) {
        tempVec2.z = Math.sign(tempVec2.z) * (config.maxZ - radius);
        tempVec5.z = -tempVec5.z * config.wallBounce;
      }
      tempVec2.toArray(positionData, base);
      tempVec5.toArray(velocityData, base);
    }
  }
}

class GlassMaterial extends MeshPhysicalMaterial {
  constructor(parameters: any) {
    super(parameters);
    (this as any).uniforms = {
      thicknessDistortion: { value: 0.1 },
      thicknessAmbient: { value: 0 },
      thicknessAttenuation: { value: 0.1 },
      thicknessPower: { value: 2 },
      thicknessScale: { value: 10 }
    };
    this.defines = this.defines || {};
    this.defines.USE_UV = '';
    this.onBeforeCompile = (shader: any) => {
      Object.assign(shader.uniforms, (this as any).uniforms);
      shader.fragmentShader =
        '\n        uniform float thicknessPower;\n        uniform float thicknessScale;\n        uniform float thicknessDistortion;\n        uniform float thicknessAmbient;\n        uniform float thicknessAttenuation;\n      ' +
        shader.fragmentShader;
      shader.fragmentShader = shader.fragmentShader.replace(
        'void main() {',
        '\n        void RE_Direct_Scattering(const in IncidentLight directLight, const in vec2 uv, const in vec3 geometryPosition, const in vec3 geometryNormal, const in vec3 geometryViewDir, const in vec3 geometryClearcoatNormal, inout ReflectedLight reflectedLight) {\n          vec3 scatteringHalf = normalize(directLight.direction + (geometryNormal * thicknessDistortion));\n          float scatteringDot = pow(saturate(dot(geometryViewDir, -scatteringHalf)), thicknessPower) * thicknessScale;\n          #ifdef USE_COLOR\n            vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * vColor;\n          #else\n            vec3 scatteringIllu = (scatteringDot + thicknessAmbient) * diffuse;\n          #endif\n          reflectedLight.directDiffuse += scatteringIllu * thicknessAttenuation * directLight.color;\n        }\n\n        void main() {\n      '
      );
      const chunk = ShaderChunk.lights_fragment_begin.replaceAll(
        'RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );',
        '\n          RE_Direct( directLight, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, material, reflectedLight );\n          RE_Direct_Scattering(directLight, vUv, geometryPosition, geometryNormal, geometryViewDir, geometryClearcoatNormal, reflectedLight);\n        '
      );
      shader.fragmentShader = shader.fragmentShader.replace('#include <lights_fragment_begin>', chunk);
      if ((this as any).onBeforeCompile2) (this as any).onBeforeCompile2(shader);
    };
  }
}

const defaultConfig = {
  count: 200,
  colors: [0, 0, 0],
  ambientColor: 16777215,
  ambientIntensity: 1,
  lightIntensity: 200,
  materialParams: {
    metalness: 0.5,
    roughness: 0.5,
    clearcoat: 1,
    clearcoatRoughness: 0.15
  },
  minSize: 0.5,
  maxSize: 1,
  size0: 1,
  gravity: 0.5,
  friction: 0.9975,
  wallBounce: 0.95,
  maxVelocity: 0.15,
  maxX: 5,
  maxY: 5,
  maxZ: 2,
  controlSphere0: false,
  followCursor: true
};

const dummyObject = new Object3D();

class Spheres extends InstancedMesh {
  config: any;
  physics: Physics;
  ambientLight?: AmbientLight;
  light?: PointLight;

  constructor(renderer: WebGLRenderer, config = {}) {
    const conf = { ...defaultConfig, ...config };
    const environment = new RoomEnvironment();
    // @ts-ignore
    const pmremGenerator = new PMREMGenerator(renderer);
    const envMap = pmremGenerator.fromScene(environment).texture;
    const geometry = new SphereGeometry();
    const material = new GlassMaterial({ envMap, ...conf.materialParams });
    material.envMapRotation.x = -Math.PI / 2;
    super(geometry, material, conf.count);
    this.config = conf;
    this.physics = new Physics(conf);
    this.#initLights();
    this.setColors(conf.colors);
  }
  #initLights() {
    this.ambientLight = new AmbientLight(this.config.ambientColor, this.config.ambientIntensity);
    this.add(this.ambientLight);
    this.light = new PointLight(this.config.colors[0], this.config.lightIntensity);
    this.add(this.light);
  }
  setColors(colors: any) {
    if (Array.isArray(colors) && colors.length > 1) {
      const palette = (function (colors) {
        let _colors: Color[], _convertedColors: Color[];
        function setColors(newColors: any) {
          _colors = newColors;
          _convertedColors = [];
          _colors.forEach(col => {
            _convertedColors.push(new Color(col));
          });
        }
        setColors(colors);
        return {
          setColors,
          getColorAt: function (ratio: number, out = new Color()) {
            const scaled = Math.max(0, Math.min(1, ratio)) * (_colors.length - 1);
            const idx = Math.floor(scaled);
            const start = _convertedColors[idx];
            if (idx >= _colors.length - 1) return start.clone();
            const alpha = scaled - idx;
            const end = _convertedColors[idx + 1];
            out.r = start.r + alpha * (end.r - start.r);
            out.g = start.g + alpha * (end.g - start.g);
            out.b = start.b + alpha * (end.b - start.b);
            return out;
          }
        };
      })(colors);
      for (let idx = 0; idx < this.count; idx++) {
        const color = new Color();
        palette.getColorAt(idx / this.count, color);
        this.setColorAt(idx, color);
        if (idx === 0) {
          this.light!.color.copy(color);
        }
      }
      if (this.instanceColor) {
        this.instanceColor.needsUpdate = true;
      }
    }
  }
  update(time: any) {
    this.physics.update(time);
    for (let idx = 0; idx < this.count; idx++) {
      dummyObject.position.fromArray(this.physics.positionData, 3 * idx);
      if (idx === 0 && this.config.followCursor === false) {
        dummyObject.scale.setScalar(0);
      } else {
        dummyObject.scale.setScalar(this.physics.sizeData[idx]);
      }
      dummyObject.updateMatrix();
      this.setMatrixAt(idx, dummyObject.matrix);
      if (idx === 0) this.light!.position.copy(dummyObject.position);
    }
    this.instanceMatrix.needsUpdate = true;
  }
}

function createBallpit(canvas: HTMLCanvasElement, config = {}) {
  const ballpit = new BallpitClass({
    canvas,
    size: 'parent',
    rendererOptions: { antialias: true, alpha: true }
  });
  let spheres: Spheres;
  ballpit.renderer.toneMapping = ACESFilmicToneMapping;
  ballpit.camera.position.set(0, 0, 20);
  ballpit.camera.lookAt(0, 0, 0);
  ballpit.cameraMaxAspect = 1.5;
  ballpit.resize();
  initialize(config);

  const raycaster = new Raycaster();
  const plane = new Plane(new Vector3(0, 0, 1), 0);
  const intersectPoint = new Vector3();
  let paused = false;

  canvas.style.touchAction = 'none';
  (canvas.style as any).userSelect = 'none';
  (canvas.style as any).webkitUserSelect = 'none';

  const mouseHandler = setupMouse(canvas, {
    onMove() {
      raycaster.setFromCamera((mouseHandler as any).nPosition, ballpit.camera);
      ballpit.camera.getWorldDirection(plane.normal);
      raycaster.ray.intersectPlane(plane, intersectPoint);
      spheres.physics.center.copy(intersectPoint);
      spheres.config.controlSphere0 = true;
    },
    onLeave() {
      spheres.config.controlSphere0 = false;
    }
  });

  function initialize(config: any) {
    if (spheres) {
      ballpit.clear();
      ballpit.scene.remove(spheres);
    }
    spheres = new Spheres(ballpit.renderer, config);
    ballpit.scene.add(spheres);
  }

  ballpit.onBeforeRender = (time) => {
    if (!paused) spheres.update(time);
  };

  ballpit.onAfterResize = (size) => {
    spheres.config.maxX = size.wWidth / 2;
    spheres.config.maxY = size.wHeight / 2;
  };

  return {
    three: ballpit,
    get spheres() {
      return spheres;
    },
    setCount(count: number) {
      initialize({ ...spheres.config, count });
    },
    togglePause() {
      paused = !paused;
    },
    dispose() {
      (mouseHandler as any).dispose();
      ballpit.dispose();
    }
  };
}

interface BallpitProps {
  className?: string;
  followCursor?: boolean;
  [key: string]: any;
}

const Ballpit = ({ className = '', followCursor = true, ...props }: BallpitProps) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const spheresInstanceRef = useRef<any>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    spheresInstanceRef.current = createBallpit(canvas, { followCursor, ...props });

    return () => {
      if (spheresInstanceRef.current) {
        spheresInstanceRef.current.dispose();
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return <canvas className={className} ref={canvasRef} style={{ width: '100%', height: '100%' }} />;
};

export default Ballpit;
