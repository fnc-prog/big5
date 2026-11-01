@echo off
title Fotograflari Yayina Al
echo ====================================================
echo Kizlar ve Erkekler klasorlerindeki fotograflar
echo optimize edilip GitHub'a gonderiliyor...
echo ====================================================
powershell -ExecutionPolicy Bypass -File "%~dp0update_photos.ps1"
echo.
pause
