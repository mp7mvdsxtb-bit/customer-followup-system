#!/bin/sh
# 停掉占用 8795 的 python 服务
PID=$(netstat -ano | grep "127.0.0.1:8795" | grep LISTENING | awk '{print $5}' | head -1)
if [ -n "$PID" ]; then
  powershell -NoProfile -Command "Stop-Process -Id $PID -Force" 2>/dev/null
  echo "stopped $PID"
else
  echo "not running"
fi
sleep 1
