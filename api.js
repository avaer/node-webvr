const events = require('events');
const {EventEmitter} = events;
const path = require('path');
const fs = require('fs');

const {ipcRenderer} = require('electron');
const THREE = require('./lib/three-min.js');
const jimp = require('jimp');
const webgl = require('node-webgl2');
const openvr = require('node-openvr');

const DEFAULT_USER_HEIGHT = 1.6;

const platform = webgl.document();

const zeroMatrix = new THREE.Matrix4();
const localFloat32Array = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array2 = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array3 = zeroMatrix.toArray(new Float32Array(16));
const localFloat32Array4 = new Float32Array(16);
const localGamepadArray = new Float32Array(16);
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
class VRDisplay {
  constructor() {
    this.isPresenting = false;
    this.capabilities = {
      canPresent: true,
      hasExternalDisplay: true,
      hasPosition: true,
      maxLayers: 1,
    };
    this.depthNear = 0.1;
    this.depthFar = 1000.0;
    this.stageParameters = {
      sittingToStandingTransform: localMatrix.compose(
        new THREE.Vector3(0, DEFAULT_USER_HEIGHT, 0),
        new THREE.Quaternion(),
        new THREE.Vector3(1, 1, 1)
      ).toArray(new Float32Array(16)),
    };

    this._width = 0;
    this._height = 0;
    this._source = null;
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
    // while booting we sometimes get transient errors
    const _requestSystem = () => new Promise((accept, reject) => {
      let err = null;
      const _recurse = (i = 0) => {
        if (i < 20) {
          const system = (() => {
            try {
              return openvr.system.VR_Init(openvr.EVRApplicationType.Scene);
            } catch (newErr) {
              err = newErr;
              return null;
            }
          })();
          if (system) {
            accept(system);
          } else {
            setTimeout(() => {
              _recurse(i + 1);
            }, 100);
          }
        } else {
          reject(err);
        };
      };
      _recurse();
    });

    return _requestSystem()
      .then(newSystem => {
        this.isPresenting = true;

        system = newSystem;
        compositor = openvr.compositor.NewCompositor();

        const {width: halfWidth, height} = system.GetRecommendedRenderTargetSize();
        this._width = halfWidth;
        this._height = height;

        const [{source}] = layerInit;
        const width = halfWidth * 2;
        const [msFb, msTex] = source.getRenderTarget(width, height, 4);
        msFbo = msFb;
        msTexture = msTex;
        const [fb, tex] = source.getRenderTarget(width, height, 1);
        fbo = fb;
        texture = tex;

        this._source = source;

        _setRenderLoopFn((runRafs, next) => {
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
          runRafs();

          // loop around immediately
          _setImmediate(next);
        });

        // get compositor focus before returning
        compositor.WaitGetPoses(
          system,
          localFloat32Array, // hmd
          localFloat32Array2, // left controller
          localFloat32Array3 // right controller
        );
        _normalizeMatrixArray(localFloat32Array);
        _normalizeMatrixArray(localFloat32Array2);
        _normalizeMatrixArray(localFloat32Array3);
      });
  }

  exitPresent() {
    this.isPresenting = false;

    openvr.system.VR_Shutdown();
    system = null;
    compositor = null;

    _setRenderLoopFn(_canvasRenderLoopFn);

    return Promise.resolve();
  }

  requestAnimationFrame(fn) {
    return window.requestAnimationFrame(fn);
  }

  cancelAnimationFrame(animationFrame) {
    return window.cancelAnimationFrame(animationFrame);
  }

  submitFrame() {
    this._source.blitFrameBuffer(msFbo, fbo, this._width * 2, this._height, this._width * 2, this._height);
    compositor.Submit(texture);

    this._source.blitFrameBuffer(fbo, 0, this._width * 2, this._height, parseInt(platform.style.width, 10), parseInt(platform.style.height, 10)); // XXX do not use parseInt
    this._source.flip();
  }
}
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
const _requestAnimationFrame = window.requestAnimationFrame || window.setImmediate;
const _cancelAnimationFrame = window.cancelAnimationFrame || window.clearImmediate;
const _setImmediate = window.setImmediate || (() => {
  const channel = new MessageChannel();
  channel.port1.onmessage = event => {
    const oldFns = fns;
    fns = [];
    for (let i = 0; i < oldFns.length; i++) {
      oldFns[i]();
    }
  };
  let fns = [];
  return fn => {
    fns.push(fn);
    channel.port2.postMessage(null);
  };
})();
if (window.dispatchEvent) {
  platform.on('keydown', e => {
    const newE = new KeyboardEvent('keydown', e);
    Object.defineProperty(newE, 'keyCode', {
      get: () => e.keyCode,
    });
    window.dispatchEvent(newE);
  });
  platform.on('keyup', e => {
    const newE = new KeyboardEvent('keyup', e);
    Object.defineProperty(newE, 'keyCode', {
      get: () => e.keyCode,
    });
    window.dispatchEvent(newE);
  });
  platform.on('keypress', e => {
    const newE = new KeyboardEvent('keypress', e);
    Object.defineProperty(newE, 'keyCode', {
      get: () => e.keyCode,
    });
    window.dispatchEvent(newE);
  });
  platform.on('mousedown', e => {
    window.dispatchEvent(new MouseEvent('mousedown', e));
  });
  platform.on('mouseup', e => {
    window.dispatchEvent(new MouseEvent('mouseup', e));
  });
  platform.on('mousemove', e => {
    window.dispatchEvent(new MouseEvent('mousemove', e));
  });
  platform.on('click', e => {
    window.dispatchEvent(new MouseEvent('click', e));
  });
}
if (!window.document) window.document = {};
const _documentCreateElement = window.document.createElement;
const nativeHtmlCreateElement = tagName => {
  if (tagName === 'native-html') {
    return {
      show() {
        ipcRenderer.send('ipc', {
          method: 'show',
        });
      },
      hide() {
        ipcRenderer.send('ipc', {
          method: 'hide',
        });
      },
    };
  } else {
    return null;
  }
};
window.document.createElement = function() {
  const platformResult = platform.createElement.apply(platform, arguments);
  if (platformResult) {
    _setRenderLoopFn(_canvasRenderLoopFn);
    return platformResult;
  }

  const windowResult = nativeHtmlCreateElement.apply(null, arguments);
  if (windowResult) {
    return windowResult;
  }

  return _documentCreateElement.apply(this, arguments);
};
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
window.document.nativePointerLockElement = null;
if (window.document.dispatchEvent) {
  platform.on('pointerlockchange', () => {
    window.document.nativePointerLockElement = platform.pointerLockElement;
    window.document.dispatchEvent(new Event('pointerlockchange'));
  });
}
// window.document.requestPointerLock = () => platform.requestPointerLock();
const _exitPointerLock = window.document.exitPointerLock.bind(document);
window.document.exitPointerLock = () => {
  if (platform.pointerLockElement) {
    platform.exitPointerLock();
  } else {
    _exitPointerLock();
  }
};
if (!window.navigator) window.navigator = {};
window.navigator.getVRDisplays = () => {
  if (openvr.system.VR_IsHmdPresent()) {
    return Promise.resolve([new VRDisplay()]);
  } else {
    return Promise.resolve([]);
  }
};
window.navigator.getGamepads = () => gamepads;
window.requestAnimationFrame = fn => {
  if (renderLoopFn) {
    rafCbs.push(fn);
    return fn;
  } else {
    return _requestAnimationFrame(fn);
  }
};
window.cancelAnimationFrame = animationFrame => {
  if (renderLoopFn) {
    const index = rafCbs.indexOf(animationFrame);
    if (index !== -1) {
      rafCbs.splice(index, 1);
    }
  } else {
    _cancelAnimationFrame(animationFrame);
  }
};
window.VRFrameData = VRFrameData;
if (!window.addEventListener) window.addEventListener = () => {};

let rafCbs = [];
const _runRafs = () => {
  const oldRafCbs = rafCbs;
  rafCbs = [];
  for (let i = 0; i < oldRafCbs.length; i++) {
    const rafCb = oldRafCbs[i];
    // try {
      rafCb();
    /* } catch (err) {
      console.warn(err.stack);
    } */
  }
};
const _canvasRenderLoopFn = (runRafs, next) => {
  platform.pollEvents();

  platform.bindFrameBuffer(0);

  runRafs();

  platform.flip();

  _requestAnimationFrame(next);
};
let renderLoopFn = null;
const _setRenderLoopFn = fn => {
  renderLoopFn = fn;

  if (!renderLoopFn) {
    _requestAnimationFrame(_runRafs);
  }
};
const _recurse = () => {
  if (renderLoopFn) {
    renderLoopFn(_runRafs, _recurse);
  } else {
    _requestAnimationFrame(_recurse);
  }
};
_requestAnimationFrame(_recurse);
