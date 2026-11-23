@echo off
chcp 65001 >nul
title Big5 - Fotoğrafları Yayına Al
cls
echo ================================================================
echo           BIG5 - FOTOĞRAFLARI CANLI YAYINA ALMA ARACI
echo ================================================================
echo.

set "GIT_EXE=C:\Program Files\Git\cmd\git.exe"
set "DOWNLOADS_JS=%USERPROFILE%\Downloads\photos.js"
set "LOCAL_JS=%~dp0photos.js"

:: 1. İndirilenler klasöründe yeni photos.js var mı kontrol et
if exist "%DOWNLOADS_JS%" (
    echo [BILGI] Indirilenler klasorunde yeni 'photos.js' bulundu!
    echo [ISLEM] Dosya proje klasorune aktariliyor...
    copy /y "%DOWNLOADS_JS%" "%LOCAL_JS%" >nul
    del "%DOWNLOADS_JS%" >nul
    echo [BASARILI] photos.js guncellendi!
    echo.
)

:: 2. Klasörlerdeki (kizlar/ ve erkekler/) fotoğrafları photos.js'e derle
echo [ISLEM] kizlar ve erkekler klasorleri taranip optimize ediliyor...
powershell -ExecutionPolicy Bypass -File "%~dp0update_photos.ps1"

:: 3. Git ile canlıya gönder
echo.
echo [ISLEM] Degisiklikler GitHub sunucusuna gonderiliyor...
if exist "%~dp0.git\index.lock" del /f /q "%~dp0.git\index.lock"
"%GIT_EXE%" add -A
"%GIT_EXE%" commit -m "Fotograflar ve adaylar yayina alindi"
"%GIT_EXE%" push origin main

echo.
echo ================================================================
echo  TEBRIKLER! Tum fotograflar basariyla yayina alindi!
echo  Site adresi: http://big5.prensesperver.com/
echo ================================================================
echo.
pause
