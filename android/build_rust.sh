#!/usr/bin/env bash
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
RUST_DIR="$PROJECT_DIR/backend_rust"
JNILIB_DIR="$SCRIPT_DIR/app/src/main/jniLibs/arm64-v8a"

export ANDROID_SDK_ROOT="${ANDROID_SDK_ROOT:-$HOME/tools/android-sdk}"
export NDK_HOME="${NDK_HOME:-$HOME/tools/android-sdk/ndk/r27}"
export JAVA_HOME="${JAVA_HOME:-$HOME/tools/jdk-17.0.12+7}"
export PATH="$HOME/.cargo/bin:$JAVA_HOME/bin:$PATH"

if ! rustup target list --installed | grep -q aarch64-linux-android; then
    rustup target add aarch64-linux-android
fi

cd "$RUST_DIR"
cargo build --target aarch64-linux-android --release --features android-jni

mkdir -p "$JNILIB_DIR"
cp "$RUST_DIR/target/aarch64-linux-android/release/libbackend_rust.so" "$JNILIB_DIR/libbackend_rust.so"
echo "OK: libbackend_rust.so copied to $JNILIB_DIR"
