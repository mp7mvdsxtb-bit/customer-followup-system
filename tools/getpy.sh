#!/bin/sh
# 续传优先，失败换镜像
URL1=https://www.python.org/ftp/python/3.12.10/python-3.12.10-embed-amd64.zip
URL2=https://mirrors.huaweicloud.com/python/3.12.10/python-3.12.10-embed-amd64.zip
URL3=https://mirrors.tuna.tsinghua.edu.cn/python/3.12.10/python-3.12.10-embed-amd64.zip
for U in "$URL1" "$URL2" "$URL3"; do
  echo "== try $U"
  for i in 1 2 3; do
    curl -sSL -C - --retry 2 --max-time 240 -o py.zip "$U" && break
    echo "   retry $i"
  done
  SZ=$(stat -c%s py.zip 2>/dev/null || echo 0)
  echo "   size=$SZ"
  if [ "$SZ" -ge 11133606 ]; then echo OK; exit 0; fi
done
echo FAIL
