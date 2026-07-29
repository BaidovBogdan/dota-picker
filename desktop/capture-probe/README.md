# Counterpick capture probe

This Windows-only C++20 proof of concept captures one frame from the running Dota 2 window and exits. It tests a safe pixel-based input path for the future desktop client without reading or modifying the game process.

The preferred path is Windows Graphics Capture for the Dota window handle. Desktop Duplication is used as a fallback when the window-capture path is unavailable.

## Safety boundary

The probe:

- runs as a separate user-space process;
- captures pixels associated with the visible `dota2.exe` window;
- does not read Dota memory;
- does not inject a DLL;
- does not hook DirectX or Vulkan inside the game;
- does not install a kernel driver;
- does not upload the frame;
- writes one local bitmap and exits.

Windows Graphics Capture may still capture a visible Dota window when another window overlaps it. The Desktop Duplication fallback captures what is actually presented on the monitor and therefore cannot provide the same occlusion behavior.

## Requirements

- Windows 10 or Windows 11
- CMake 3.25 or newer
- Visual Studio or Build Tools with MSVC, the Desktop development with C++ workload, and a Windows SDK
- A running, visible, non-minimized Dota 2 window

## Build

From `desktop/capture-probe`:

```powershell
cmake -S . -B output/build -A x64
cmake --build output/build --config Release
```

## Capture

Run a one-frame capture:

```powershell
.\output\build\Release\counterpick-capture-probe.exe
```

The default file is:

```text
output/dota-frame.bmp
```

Choose another destination when needed:

```powershell
.\output\build\Release\counterpick-capture-probe.exe --output output/custom-frame.bmp
```

On the preferred Windows Graphics Capture path, the executable reports the backend, dimensions, pixel format, non-zero byte count, and absolute output path as JSON. The Desktop Duplication fallback reports dimensions, feature level, and the absolute output path.

## Troubleshooting

- Start Dota 2 before the probe.
- Ensure the real game window is visible and not minimized.
- Build and run the x64 target.
- If Windows Graphics Capture fails, inspect whether the Desktop Duplication fallback succeeds.
- When multiple monitors or display adapters are involved, keep Dota on an active display while diagnosing.

This program intentionally captures only one frame. Continuous capture, crop detection, OCR, hero classification, privacy controls, and overlay rendering belong to a later production architecture and are not implemented here.
