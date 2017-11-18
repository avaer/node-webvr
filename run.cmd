cd %~dp0

node -e "console.log(require('path').join(require.resolve('electron'), '..', 'dist', 'electron'))" >temp.txt
set /p ELECTRON_BIN=<temp.txt
del temp.txt

%ELECTRON_BIN% %~dp0 %1