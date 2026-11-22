@echo off
chcp 65001 >nul
setlocal

set "HERE=%~dp0"
if "%HERE:~-1%"=="\" set "HERE=%HERE:~0,-1%"

echo.
echo  ============================================
echo    DSH 本地语音插件 - 安装指引
echo  ============================================
echo.
echo   当前文件夹：
echo   %HERE%
echo.
echo   * 这个文件夹不要删、不要移动。
echo     插件装好后会长期从这里读取代码。
echo.
echo  --------------------------------------------
echo   下一步（在 DSH 里操作）：
echo  --------------------------------------------
echo.
echo   1. 打开 DSH
echo   2. 侧边栏点击「插件」
echo   3. 选择「从文件夹安装 / 安装本地目录」
echo   4. 选中下面这个路径，确认：
echo.
echo      %HERE%
echo.
echo   5. 安装完成后重启 DSH
echo   6. 侧边栏会出现「本地语音」图标，点开即可试听
echo.
echo  --------------------------------------------
echo   装好后还要做一件事：
echo  --------------------------------------------
echo.
echo   这个插件不包含模型。你需要有自己的
echo   Qwen3-TTS 服务（约 1.8 GB），并在 profile 的
echo   cordis.patch.yml 里填好 python / server / cwd
echo   三个路径，否则拉不起来。
echo.
echo   详见同目录下的 README.md
echo.
echo  ============================================
echo.

choice /c YN /n /m "现在打开这个文件夹吗？(Y/N) "
if errorlevel 2 goto :end
start "" explorer "%HERE%"

:end
echo.
echo  好的，装好后有问题再来找我。
echo.
pause
endlocal
