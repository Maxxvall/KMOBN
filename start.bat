@echo off
echo Starting KMOBN locally...
echo.

REM Check if dist folder exists (production build)
if exist "dist" (
    echo Running production build (PWA enabled)...
    start /b npx vite preview --port 3000 --host
) else (
    echo No production build found. Running dev server...
    echo NOTE: For full offline support, run "npm run build" first.
    start /b npm run dev
)

timeout /t 3 /nobreak >nul
start http://localhost:3000
