const events = require('events');
const {EventEmitter} = events;
const path = require('path');
const fs = require('fs');

const THREE = require('three-zeo');
const jimp = require('jimp');
const webgl = require('node-webgl2');
const openvr = require('node-openvr');

const DEFAULT_USER_HEIGHT = 1.6;

const zeroMatrix = new THREE.Matrix4();
const localFloat32Array = new Float32Array(16);
const localFloat32Array2 = new Float32Array(16);
const localFloat32Array3 = new Float32Array(16);
const localFloat32Array4 = new Float32Array(16);
const localGamepadArray = new Float32Array(13);
const localVector = new THREE.Vector3();
const localVector2 = new THREE.Vector3();
const localQuaternion = new THREE.Quaternion();
const localMatrix = new THREE.Matrix4();
const localMatrix2 = new THREE.Matrix4();
const _normalizeMatrixArray = float32Array => {
  if (isNaN(float32Array[0])) {
    zeroMatrix.toArray(float32Array);
  }
};

let system = null;
let compositor = null;
let msFbo = null;
let msTexture = null;
let fbo = null;
let texture = null;
let _onpresent = null;
let _onexitpresent = null;
class VRDisplay {
  constructor() {
    this.isPresenting = false;
    this.depthNear = 0.1;
    this.depthFar = 1000.0;
    this.stageParameters = {
      sittingToStandingTransform: localMatrix.compose(
        new THREE.Vector3(0, DEFAULT_USER_HEIGHT, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      ).toArray(new Float32Array(16)),
    };

    system = openvr.system.VR_Init(openvr.EVRApplicationType.Scene);
    compositor = openvr.compositor.NewCompositor();
    process.on('exit', () => {
      openvr.system.VR_Shutdown();
    });

    const {width, height} = system.GetRecommendedRenderTargetSize();
    this._width = width;
    this._height = height;
    this._source = null;
    this._cleanup = null;
  }

  getEyeParameters() {
    return {
      renderWidth: this._width,
      renderHeight: this._height,
    };
  }

  getFrameData(frameData) {
    const hmdMatrix = localMatrix.fromArray(localFloat32Array);

    hmdMatrix.decompose(localVector, localQuaternion, localVector2);
    frameData.pose.set(localVector, localQuaternion);

    hmdMatrix.getInverse(hmdMatrix);

    system.GetEyeToHeadTransform(0, localFloat32Array4);
    localMatrix2.fromArray(localFloat32Array4)
      .getInverse(localMatrix2)
      .multiply(hmdMatrix)
      .toArray(frameData.leftViewMatrix);

    system.GetProjectionMatrix(0, this.depthNear, this.depthFar, localFloat32Array4);
    _normalizeMatrixArray(localFloat32Array4);
    frameData.leftProjectionMatrix.set(localFloat32Array4);

    system.GetEyeToHeadTransform(1, localFloat32Array4);
    _normalizeMatrixArray(localFloat32Array4);
    localMatrix2.fromArray(localFloat32Array4)
      .getInverse(localMatrix2)
      .multiply(hmdMatrix)
      .toArray(frameData.rightViewMatrix);

    system.GetProjectionMatrix(1, this.depthNear, this.depthFar, localFloat32Array4);
    _normalizeMatrixArray(localFloat32Array4);
    frameData.rightProjectionMatrix.set(localFloat32Array4);

    system.GetSeatedZeroPoseToStandingAbsoluteTrackingPose(localFloat32Array4);
    _normalizeMatrixArray(localFloat32Array4);
    this.stageParameters.sittingToStandingTransform.set(localFloat32Array4);
  }

  getLayers() {
    return [
      {
        leftBounds: [0, 0, 0.5, 1],
        rightBounds: [0.5, 0, 0.5, 1],
        source: null,
      }
    ];
  }

  requestPresent(layerInit) {
    this.isPresenting = true;

    const [{source}] = layerInit;
    const width = this._width * 2;
    const height = this._height;
    const [msFb, msTex] = source.getRenderTarget(width, height, 4);
    msFbo = msFb;
    msTexture = msTex;
    const [fb, tex] = source.getRenderTarget(width, height, 1);
    fbo = fb;
    texture = tex;

    this._source = source;

    const _recurse = () => {
      // wait for frame
      compositor.WaitGetPoses(
        system,
        localFloat32Array, // hmd
        localFloat32Array2, // left controller
        localFloat32Array3 // right controller
      );
      _normalizeMatrixArray(localFloat32Array);
      _normalizeMatrixArray(localFloat32Array2);
      _normalizeMatrixArray(localFloat32Array3);

      gamepads.length = 0;
      system.GetControllerState(0, localGamepadArray);
      if (!isNaN(localGamepadArray[0])) {
        leftGamepad.buttons[0].pressed = localGamepadArray[4] !== 0; // pad
        leftGamepad.buttons[1].pressed = localGamepadArray[5] !== 0; // trigger
        leftGamepad.buttons[2].pressed = localGamepadArray[3] !== 0; // grip
        leftGamepad.buttons[3].pressed = localGamepadArray[2] !== 0; // menu

        leftGamepad.buttons[0].touched = localGamepadArray[9] !== 0; // pad
        leftGamepad.buttons[1].touched = localGamepadArray[10] !== 0; // trigger
        leftGamepad.buttons[2].touched = localGamepadArray[8] !== 0; // grip
        leftGamepad.buttons[3].touched = localGamepadArray[7] !== 0; // menu

        leftGamepad.axes[0] = localGamepadArray[11];
        leftGamepad.axes[1] = localGamepadArray[12];

        gamepads.push(leftGamepad);
      }
      system.GetControllerState(1, localGamepadArray);
      if (!isNaN(localGamepadArray[0])) {
        rightGamepad.buttons[0].pressed = localGamepadArray[4] !== 0; // pad
        rightGamepad.buttons[1].pressed = localGamepadArray[5] !== 0; // trigger
        rightGamepad.buttons[2].pressed = localGamepadArray[3] !== 0; // grip
        rightGamepad.buttons[3].pressed = localGamepadArray[2] !== 0; // menu

        rightGamepad.buttons[0].touched = localGamepadArray[9] !== 0; // pad
        rightGamepad.buttons[1].touched = localGamepadArray[10] !== 0; // trigger
        rightGamepad.buttons[2].touched = localGamepadArray[8] !== 0; // grip
        rightGamepad.buttons[3].touched = localGamepadArray[7] !== 0; // menu

        rightGamepad.axes[0] = localGamepadArray[11];
        rightGamepad.axes[1] = localGamepadArray[12];

        gamepads.push(rightGamepad);
      }

      this._source.pollEvents();

      this._source.bindFrameBuffer(msFbo);

      // raf callbacks
      const oldRafCbs = rafCbs;
      rafCbs = [];
      for (let i = 0; i < oldRafCbs.length; i++) {
        oldRafCbs[i]();
      }

      this._source.blitFrameBuffer(msFbo, 0, this._width * 2, this._height, this._source.width, this._source.height);
      this._source.flip();

      // recurse
      immediate = setImmediate(_recurse);
    };
    let immediate = setImmediate(_recurse);

    this._cleanup = () => {
      clearImmediate(immediate);
    };

    return Promise.resolve();
  }

  exitPresent() {
    this.isPresenting = false;

    this._cleanup();
    this._cleanup = null;

    return Promise.resolve();
  }

  submitFrame() {
    this._source.blitFrameBuffer(msFbo, fbo, this._width * 2, this._height, this._width * 2, this._height);
    compositor.Submit(texture);
  }
}
const display = new VRDisplay();
class VRFrameData {
  constructor() {
    this.leftProjectionMatrix = new Float32Array(16);
    this.leftViewMatrix = new Float32Array(16);
    this.rightProjectionMatrix = new Float32Array(16);
    this.rightViewMatrix = new Float32Array(16);
    this.pose = new VRPose();
  }
}
class VRPose {
  constructor(position = new Float32Array(3), orientation = new Float32Array(4)) {
    this.position = position;
    this.orientation = orientation;
  }

  set(position, orientation) {
    this.position[0] = position.x;
    this.position[1] = position.y;
    this.position[2] = position.z;

    this.orientation[0] = orientation.x;
    this.orientation[1] = orientation.y;
    this.orientation[2] = orientation.z;
    this.orientation[3] = orientation.w;
  }
}
class VRGamepadButton {
  constructor() {
     this.value = 0;
     this.pressed = false;
     this.touched = false;
  }
}
class VRGamepad {
  constructor(hand, index) {
    this.hand = hand;
    this.index = index;
    this.connected = true;
    this.buttons = [
      new VRGamepadButton(),
      new VRGamepadButton(),
      new VRGamepadButton(),
      new VRGamepadButton(),
    ];
    this.hasPosition = true;
    this.hasOrientation = true;
    this.position = new Float32Array(3);
    this.linearVelocity = new Float32Array(3);
    this.linearAcceleration = new Float32Array(3);
    this.orientation = Float32Array.from([0, 0, 0, 1]);
    this.angularVelocity = new Float32Array(3);
    this.angularAcceleration = new Float32Array(3);
    this.axes = new Float32Array(2);
  }
}
const leftGamepad = new VRGamepad('left', 0);
const rightGamepad = new VRGamepad('right', 1);
let gamepads = [];

if (typeof window === 'undefined') {
  window = global;
}
if (!window.document) window.document = {};
if (!window.document.createElementNS) window.document.createElementNS = (ns, tagName) => {
  if (tagName === 'img') {
    const img = new EventEmitter();
    img.addEventListener = img.on;
    img.removeEventListener = img.removeListener;
    img.tagName = 'IMAGE';
    let src = '';
    Object.defineProperty(img, 'src', {
      get: () => src,
      set: newSrc => {
        src = newSrc;

        jimp.read(src, (err, jimpImg) => {
          if (!err) {
            img.width = jimpImg.bitmap.width;
            img.height = jimpImg.bitmap.height;
            img.data = jimpImg.bitmap.data;
            img.emit('load');
          } else {
            img.emit('error', err);
          }
        });
      },
    });
    img.width = 0;
    img.height = 0;
    img.data = null;
    return img;
  } else {
    return null;
  }
};
if (!window.navigator) window.navigator = {};
if (!window.navigator.getVRDisplays) window.navigator.getVRDisplays = () => Promise.resolve([display]);
if (!window.navigator.getGamepads) window.navigator.getGamepads = () => gamepads;
window.VRFrameData = VRFrameData;
window.addEventListener = () => {};
let rafCbs = [];
window.requestAnimationFrame = cb => {
  rafCbs.push(cb);
};

const _requestJsonFile = p => new Promise((accept, reject) => {
  fs.readFile(p, (err, s) => {
    if (!err) {
      accept(JSON.parse(s));
    } else {
      reject(err);
    }
  });
});
const _requestJsonMesh = (modelJson, modelTexturePath) => new Promise((accept, reject) => {
  const loader = new THREE.ObjectLoader();
  loader.setTexturePath(modelTexturePath);
  loader.parse(modelJson, accept);
});

const controllerjsPath = path.join(require.resolve('controllerjs'), '..');
const platform = webgl.document();
const canvas = platform.createElement('canvas', 1280, 1024);
const gl = canvas.getContext('webgl');
Promise.all([
  _requestJsonFile(path.join(controllerjsPath, 'model', 'controller.json'))
    .then(controllerJson => _requestJsonMesh(controllerJson, path.join(controllerjsPath, 'model', '/'))),
  navigator.getVRDisplays()
    .then(([display]) =>
      display.requestPresent([
        {
          leftBounds: [0, 0, 0.5, 1],
          rightBounds: [0.5, 0, 0.5, 1],
          source: canvas,
        },
      ])
        .then(() => display)
    ),
])
  .then(([
    controllerModel,
    display,
  ]) => {
    let scene = null;
    let camera = null;
    let renderer = null;
    let leftControllerMesh = new THREE.Object3D();
    let rightControllerMesh = new THREE.Object3D();
    const _initRender = () => {
      renderer = new THREE.WebGLRenderer({
        canvas: canvas,
        context: gl,
        antialias: true,
      });
      // renderer.setSize(canvas.width, canvas.height);
      renderer.setClearColor(0xffffff, 1);
      renderer.vr.enabled = true;
      // renderer.vr.standing = true;
      renderer.vr.setDevice(display);

      const leftEye = display.getEyeParameters('left');
      const rightEye = display.getEyeParameters('right');
      const width = Math.max(leftEye.renderWidth, rightEye.renderWidth) * 2;
      const height = Math.max(leftEye.renderHeight, rightEye.renderHeight);
      renderer.setSize(width, height);

      scene = new THREE.Scene();

      camera = new THREE.PerspectiveCamera(90, canvas.width/canvas.height, 0.1, 1000);
      camera.position.set(0, 0, 1);
      camera.lookAt(new THREE.Vector3(0, 0, 0));
      scene.add(camera);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(1, 1, 1);
      scene.add(directionalLight);

      const boxMesh = (() => {
        const geometry = new THREE.BoxBufferGeometry(1, 1, 1);
        const material = new THREE.MeshPhongMaterial({
          color: 0xFF0000,
        });
        return new THREE.Mesh(geometry, material);
      })();
      scene.add(boxMesh);

      leftControllerMesh = controllerModel.children[0].clone(true);
      scene.add(leftControllerMesh);

      rightControllerMesh = controllerModel.children[0].clone(true);
      scene.add(rightControllerMesh);

      const _render = () => {
        leftControllerMesh.matrix.fromArray(localFloat32Array2);
        leftControllerMesh.matrix.decompose(leftControllerMesh.position, leftControllerMesh.quaternion, leftControllerMesh.scale);
        leftControllerMesh.updateMatrixWorld();

        rightControllerMesh.matrix.fromArray(localFloat32Array3);
        rightControllerMesh.matrix.decompose(rightControllerMesh.position, rightControllerMesh.quaternion, rightControllerMesh.scale);
        rightControllerMesh.updateMatrixWorld();

        renderer.render(scene, camera);
        renderer.context.flush();

        requestAnimationFrame(_render);
      };
      requestAnimationFrame(_render);
    };

    _initRender();

    platform.onclose = () => {
      process.exit(0);
    };
  })
  .catch(err => {
    console.warn(err.stack);
    process.exit(1);
  });
