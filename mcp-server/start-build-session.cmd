@echo off
rem Creative architect session for a NEW world: builds the base from plans\BUILD-BLUEPRINT.md using /fill.
rem Turns allowCommands ON in the dev client config (restart the game if it only reads config at start).
rem start-session.cmd (survival) turns it back OFF.
set CFG=%~dp0..\run\mcbridge\config.json
node -e "const f=process.argv[1],c=JSON.parse(require('fs').readFileSync(f,'utf8'));c.allowCommands=true;require('fs').writeFileSync(f,JSON.stringify(c,null,2)+'\n');console.log('allowCommands = true')" "%CFG%"
echo Load your new creative world with cheats/op enabled, then press a key.
pause
cd /d "%~dp0plans"
claude %* "Creative architect session in a NEW world. Read ..\steampunk\BUILD-DIRECTIVE.md and BUILD-BLUEPRINT.md. Do blueprint Step 0 (choose and flatten the site, set origin O), then build the base structure by structure in the blueprint order. Record O and every finished structure in ROADMAP.md under 'Creative world'."
