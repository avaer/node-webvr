#!/bin/bash

DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" && pwd )"
ELECTRON_BIN="$(node -e 'console.log(require("path").join(require.resolve("electron"), "..", "dist", "electron"))')"

$ELECTRON_BIN $DIR "$1"
