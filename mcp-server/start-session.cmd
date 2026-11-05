@echo off
rem Starts a fresh Claude Code session for the steampunk base from the saved handoff notes.
rem Run from any new terminal. Extra args are passed to claude (e.g. --model sonnet).
set CFG=%~dp0..\run\mcbridge\config.json
node -e "const f=process.argv[1],c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.allowCommands=false;require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n');" "%CFG%"
cd /d "%~dp0plans"
claude %* "Resume the Minecraft steampunk project. Read ROADMAP.md (Session handoff section) and ..\steampunk\DIRECTIVE.md, check the game with mc_observe, then continue the next step autonomously. Delegate gathering to the mc-gatherer subagent. Update ROADMAP.md at each milestone."
