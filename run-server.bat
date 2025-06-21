@echo off
setlocal

REM Set the transport to 'stdio' so the server communicates over standard I/O.
set TRANSPORT=stdio

REM Redirect all informational 'echo' statements to stderr (1>&2).
REM This keeps stdout clean for the MCP client, which only expects protocol messages.
echo Starting TypeScript MCP Server (stdio mode)... 1>&2

REM Log debug information to stderr.
echo Script directory: %~dp0 1>&2
echo Running with Node.js: 1>&2
node --version 1>&2

REM Run the compiled server from the 'dist' folder.
REM The server's stdout will be passed directly to the MCP client (e.g., Cursor).
node "%~dp0dist\server.js"

REM If the server exits unexpectedly, log the error to stderr.
if %ERRORLEVEL% NEQ 0 (
  echo Server exited with error code %ERRORLEVEL%. 1>&2
  echo Please ensure you have run 'npm install' and 'npm run build' successfully. 1>&2
  pause
)

endlocal 