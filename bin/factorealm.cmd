@echo off
setlocal
node "%~dp0factorealm.mjs" %*
exit /b %errorlevel%
