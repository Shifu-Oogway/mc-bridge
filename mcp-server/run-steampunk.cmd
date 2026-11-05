@echo off
rem Autonomous steampunk run: plays roadmap.queue, writes new plans itself when it runs out. Stop: W/A/S/D/Space/Esc in game, or Ctrl+C.
cd /d "%~dp0"
if "%OLLAMA_HOST%"=="" set OLLAMA_HOST=http://10.0.0.202:11434
node ollama-agent.js --roadmap steampunk\roadmap.json --directive steampunk\DIRECTIVE.md %*
