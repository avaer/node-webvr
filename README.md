# node-webvr: Native WebVR for node

## Overview

This module uses _native_ `WebGL` -> `OpenGL` bindings to implement blazing-fast `canvas`/`WebVR` rendering using `node` and/or `electron`.

Most of WebGL is implemented, and it works with `THREE.js` as long as your code/shaders are digestible by raw OpenGL. The core of WebVR is also implemented, including the Gamepad API for tracked controllers.

This is _not_ a browser with WebGL/WebVR. It reimplements WebGL + WebVR natively and insecurely, so don't load untrusted sites with it. The tradeoff is that it's super fast (native OpenGL speed), super capable (all of OpenGL), and super flexible (native, so easily plugs into other native things like `Steam VR`).
