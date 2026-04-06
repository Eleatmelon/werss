#!/bin/bash
cd /app/
source install.sh

# 与 init_sys.py 一致：优先 WERSS_*，兼容 USERNAME/PASSWORD（避免 .env 里只有 WERSS_* 时误报未设置）
_init_user="${WERSS_USERNAME:-${USERNAME:-}}"
_init_pass="${WERSS_PASSWORD:-${PASSWORD:-}}"
echo "=== 环境变量检查 ==="
if [ -n "${_init_user}" ]; then
    echo "登录用户名(生效): ${_init_user}"
else
    echo "登录用户名(生效): 未设置 → 默认 admin"
fi
if [ -n "${_init_pass}" ]; then
    echo "登录密码(生效): 已设置（长度: ${#_init_pass} 字符）"
else
    echo "登录密码(生效): 未设置 → 默认 admin@123"
fi
if [ -n "${DB}" ]; then
    echo "DB: 已设置"
else
    echo "DB: 未设置"
fi
echo "=================="

# Docker 环境默认执行初始化（init_user 会检查用户是否存在，存在则更新密码）
# 这样可以确保环境变量中的密码总是生效
python3 main.py -job True -init True