@echo off

:: === VARIABLES ===============================================

set MOD_NAME=HordeModTemplate

:: === SETUP ===================================================

set CWD=%cd%
set INPUT_DIR=ModData
set OUTPUT_DIR=Build

:: === TIMESTAMP ===============================================

for /f "tokens=2 delims==" %%a in ('wmic OS Get localdatetime /value') do set "dt=%%a"
set "YYYY=%dt:~0,4%" & set "MM=%dt:~4,2%" & set "DD=%dt:~6,2%"
set "HH=%dt:~8,2%" & set "Min=%dt:~10,2%" & set "Sec=%dt:~12,2%"
set "TIMESTAMP=%YYYY%-%MM%-%DD%_%HH%-%Min%-%Sec%"

:: === PACK ====================================================

set TMP_MOD_DIR="%OUTPUT_DIR%"\\"%MOD_NAME%"
set OUTPUT_ZIP_PATH="%OUTPUT_DIR%"\\"%TIMESTAMP%_%MOD_NAME%".zip

if not exist "%OUTPUT_DIR%" ( mkdir "%OUTPUT_DIR%" )
if exist "%TMP_MOD_DIR%" ( rd "%TMP_MOD_DIR%" )

:: Pack mod files
mklink /j "%TMP_MOD_DIR%" "%CWD%\%INPUT_DIR%" > NUL || goto :error
powershell Compress-Archive -LiteralPath "%TMP_MOD_DIR%" -DestinationPath "%OUTPUT_ZIP_PATH%"
rd "%TMP_MOD_DIR%"
if exist "%TMP_MOD_DIR%" ( echo Can't remove temp directory & goto :error_any )

:: Pack README.md
mkdir "%TMP_MOD_DIR%"
copy "README.md" "%TMP_MOD_DIR%" > NUL || goto :error
powershell Compress-Archive -LiteralPath "%TMP_MOD_DIR%" -DestinationPath "%OUTPUT_ZIP_PATH%" -Update
del "%TMP_MOD_DIR%"\\"README.md"
rd "%TMP_MOD_DIR%"
if exist "%TMP_MOD_DIR%" ( echo Can't remove temp directory & goto :error_any )

:: === WORK COMPLETE ===========================================

if not exist %OUTPUT_ZIP_PATH% ( goto :error_any )

echo Packing successfully completed!
echo Output: "%OUTPUT_DIR%\%TIMESTAMP%_%MOD_NAME%.zip"

pause
goto :EOF

:: === ERROR HANDLING ==========================================

:error
  echo Failed with error #%errorlevel%.
  pause
  goto :cleanup_and_exit

:error_any
  echo Something went wrong...
  pause
  goto :cleanup_and_exit

:cleanup_and_exit
  echo Cleanup...
  rd /q /s "%TMP_MOD_DIR%"
  echo Exiting...
  exit /b %errorlevel%
