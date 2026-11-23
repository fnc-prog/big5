@echo off
chcp 65001 >nul
title Big5 - GitHub'a Yükle ve Yayına Al
cls
echo ==============================================
echo   Big5 Uygulaması GitHub'a Gönderiliyor...
echo ==============================================
echo.

set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
if exist "%~dp0.git\index.lock" del /f /q "%~dp0.git\index.lock"

"%GIT_EXE%" add -A
"%GIT_EXE%" commit -m "Site guncellemeleri yayina alindi"
"%GIT_EXE%" push origin main

echo.
echo [TAMAMLANDI] Tum degisiklikler GitHub'a aktarildi ve canliya alindi!
echo Adres: http://big5.prensesperver.com/
echo.
pause
