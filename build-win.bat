@echo off
setlocal
chcp 65001 >nul

cd /d "%~dp0"

echo.
echo ========================================
echo TG Group 一键打包开始
echo 项目目录: %cd%
echo ========================================
echo.

where npm >nul 2>nul
if errorlevel 1 (
  echo [错误] 未检测到 npm，请先安装 Node.js。
  pause
  exit /b 1
)

echo [1/3] 安装 / 更新依赖...
call npm install
if errorlevel 1 (
  echo.
  echo [失败] npm install 执行失败。
  pause
  exit /b 1
)

echo.
echo [2/3] 开始打包 Windows 安装版...
call npm run dist:win
if errorlevel 1 (
  echo.
  echo [失败] Windows 安装包打包失败。
  pause
  exit /b 1
)

echo.
echo [3/3] 打包完成。
echo 输出目录: %cd%\release
echo.
echo 你可以在 release 目录里找到 Setup.exe
echo.
pause
exit /b 0
