@echo off
rem Settlement controls for Windows. Examples:
rem   ctl status            ctl tasks            ctl pause            ctl cancel
rem   ctl resume t123abc    ctl checkpoint "note text"
rem   ctl raw mc_blueprint "{\"action\":\"verify\",\"build\":\"starter-workshop\"}"
setlocal
set "HERE=%~dp0"
set "CTL=node "%HERE%scripts\ctl.mjs""
if /i "%~1"=="status"     ( %CTL% mc_settlement_status & goto :eof )
if /i "%~1"=="tasks"      ( %CTL% mc_task_status & goto :eof )
if /i "%~1"=="pause"      ( %CTL% mc_task_cancel "{\"pause\":true,\"reason\":\"paused from ctl\"}" & goto :eof )
if /i "%~1"=="cancel"     ( %CTL% mc_task_cancel "{\"reason\":\"cancelled from ctl\"}" & goto :eof )
if /i "%~1"=="resume"     ( %CTL% mc_task_resume "{\"id\":\"%~2\"}" mc_task_status "{\"id\":\"%~2\",\"waitSec\":50}" & goto :eof )
if /i "%~1"=="checkpoint" ( %CTL% mc_checkpoint "{\"note\":\"%~2\"}" & goto :eof )
if /i "%~1"=="stop"       ( %CTL% mc_task_cancel "{\"pause\":true,\"reason\":\"stop\"}" mc_stop mc_checkpoint "{\"note\":\"stopped from ctl\"}" & goto :eof )
if /i "%~1"=="raw"        ( shift & %CTL% %1 %2 %3 %4 %5 %6 & goto :eof )
echo usage: ctl status^|tasks^|pause^|cancel^|resume ID^|checkpoint "note"^|stop^|raw TOOL JSON
