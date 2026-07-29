#include <windows.h>
#include <d3d11.h>
#include <dxgi1_2.h>
#include <windows.graphics.capture.interop.h>
#include <windows.graphics.directx.direct3d11.interop.h>
#include <wrl/client.h>
#include <winrt/Windows.Foundation.h>
#include <winrt/Windows.Graphics.Capture.h>
#include <winrt/Windows.Graphics.DirectX.Direct3D11.h>
#include <winrt/base.h>

#include <algorithm>
#include <cstdint>
#include <filesystem>
#include <fstream>
#include <iostream>
#include <memory>
#include <mutex>
#include <string>
#include <vector>

using Microsoft::WRL::ComPtr;

struct WindowCandidate {
  DWORD processId = 0;
  HWND handle = nullptr;
  std::uint64_t area = 0;
};

struct CaptureTarget {
  HWND window = nullptr;
  RECT screenRect{};
};

struct DxgiTarget {
  ComPtr<IDXGIAdapter1> adapter;
  ComPtr<IDXGIOutput1> output;
  DXGI_OUTPUT_DESC description{};
};

struct TextureSaveResult {
  HRESULT status = E_FAIL;
  UINT width = 0;
  UINT height = 0;
  DXGI_FORMAT format = DXGI_FORMAT_UNKNOWN;
  std::uint64_t nonZeroBytes = 0;
};

struct WgcCaptureState {
  std::mutex mutex;
  HANDLE readyEvent = nullptr;
  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  std::filesystem::path outputPath;
  TextureSaveResult saved;
  int attempts = 0;
  bool finished = false;
};

std::wstring executableName(DWORD processId) {
  const HANDLE process = OpenProcess(PROCESS_QUERY_LIMITED_INFORMATION, FALSE, processId);
  if (!process) return {};

  std::vector<wchar_t> buffer(32768);
  DWORD length = static_cast<DWORD>(buffer.size());
  const BOOL success = QueryFullProcessImageNameW(process, 0, buffer.data(), &length);
  CloseHandle(process);
  if (!success) return {};

  return std::filesystem::path(std::wstring(buffer.data(), length)).filename().wstring();
}

BOOL CALLBACK collectDotaWindows(HWND window, LPARAM parameter) {
  if (!IsWindowVisible(window) || IsIconic(window)) return TRUE;

  DWORD processId = 0;
  GetWindowThreadProcessId(window, &processId);
  if (_wcsicmp(executableName(processId).c_str(), L"dota2.exe") != 0) return TRUE;

  RECT clientRect{};
  if (!GetClientRect(window, &clientRect)) return TRUE;

  const auto width = static_cast<std::uint64_t>(std::max(0L, clientRect.right - clientRect.left));
  const auto height = static_cast<std::uint64_t>(std::max(0L, clientRect.bottom - clientRect.top));
  const auto area = width * height;
  if (area == 0) return TRUE;

  auto* candidate = reinterpret_cast<WindowCandidate*>(parameter);
  if (area > candidate->area) {
    candidate->processId = processId;
    candidate->handle = window;
    candidate->area = area;
  }

  return TRUE;
}

CaptureTarget findDotaWindow() {
  WindowCandidate candidate{};
  EnumWindows(collectDotaWindows, reinterpret_cast<LPARAM>(&candidate));
  if (!candidate.handle) return {};

  RECT clientRect{};
  GetClientRect(candidate.handle, &clientRect);
  POINT topLeft{clientRect.left, clientRect.top};
  POINT bottomRight{clientRect.right, clientRect.bottom};
  ClientToScreen(candidate.handle, &topLeft);
  ClientToScreen(candidate.handle, &bottomRight);

  return {
    .window = candidate.handle,
    .screenRect = {
      .left = topLeft.x,
      .top = topLeft.y,
      .right = bottomRight.x,
      .bottom = bottomRight.y,
    },
  };
}

DxgiTarget findDxgiTarget(HMONITOR monitor) {
  ComPtr<IDXGIFactory1> factory;
  if (FAILED(CreateDXGIFactory1(IID_PPV_ARGS(&factory)))) return {};

  for (UINT adapterIndex = 0;; ++adapterIndex) {
    ComPtr<IDXGIAdapter1> adapter;
    if (factory->EnumAdapters1(adapterIndex, &adapter) == DXGI_ERROR_NOT_FOUND) break;

    for (UINT outputIndex = 0;; ++outputIndex) {
      ComPtr<IDXGIOutput> output;
      if (adapter->EnumOutputs(outputIndex, &output) == DXGI_ERROR_NOT_FOUND) break;

      DXGI_OUTPUT_DESC description{};
      if (FAILED(output->GetDesc(&description)) || description.Monitor != monitor) continue;

      ComPtr<IDXGIOutput1> output1;
      if (FAILED(output.As(&output1))) return {};

      return {
        .adapter = adapter,
        .output = output1,
        .description = description,
      };
    }
  }

  return {};
}

bool saveBitmap(
  const std::filesystem::path& outputPath,
  const D3D11_MAPPED_SUBRESOURCE& mapped,
  UINT width,
  UINT height
) {
  const auto rowBytes = static_cast<std::uint32_t>(width * 4);
  const auto pixelBytes = rowBytes * height;

  BITMAPFILEHEADER fileHeader{};
  fileHeader.bfType = 0x4D42;
  fileHeader.bfOffBits = sizeof(BITMAPFILEHEADER) + sizeof(BITMAPINFOHEADER);
  fileHeader.bfSize = fileHeader.bfOffBits + pixelBytes;

  BITMAPINFOHEADER infoHeader{};
  infoHeader.biSize = sizeof(BITMAPINFOHEADER);
  infoHeader.biWidth = static_cast<LONG>(width);
  infoHeader.biHeight = -static_cast<LONG>(height);
  infoHeader.biPlanes = 1;
  infoHeader.biBitCount = 32;
  infoHeader.biCompression = BI_RGB;
  infoHeader.biSizeImage = pixelBytes;

  std::filesystem::create_directories(outputPath.parent_path());
  std::ofstream stream(outputPath, std::ios::binary | std::ios::trunc);
  if (!stream) return false;

  stream.write(reinterpret_cast<const char*>(&fileHeader), sizeof(fileHeader));
  stream.write(reinterpret_cast<const char*>(&infoHeader), sizeof(infoHeader));

  const auto* pixels = static_cast<const std::uint8_t*>(mapped.pData);
  for (UINT row = 0; row < height; ++row) {
    stream.write(
      reinterpret_cast<const char*>(pixels + static_cast<std::size_t>(row) * mapped.RowPitch),
      rowBytes
    );
  }

  return stream.good();
}

TextureSaveResult saveTexture(
  ID3D11Device* device,
  ID3D11DeviceContext* context,
  ID3D11Texture2D* texture,
  const std::filesystem::path& outputPath
) {
  TextureSaveResult saved{};
  if (!device || !context || !texture) {
    saved.status = E_INVALIDARG;
    return saved;
  }

  D3D11_TEXTURE2D_DESC sourceDescription{};
  texture->GetDesc(&sourceDescription);
  saved.width = sourceDescription.Width;
  saved.height = sourceDescription.Height;
  saved.format = sourceDescription.Format;

  if (sourceDescription.Format != DXGI_FORMAT_B8G8R8A8_UNORM) {
    saved.status = HRESULT_FROM_WIN32(ERROR_UNSUPPORTED_TYPE);
    return saved;
  }

  D3D11_TEXTURE2D_DESC stagingDescription = sourceDescription;
  stagingDescription.MipLevels = 1;
  stagingDescription.ArraySize = 1;
  stagingDescription.SampleDesc.Count = 1;
  stagingDescription.Usage = D3D11_USAGE_STAGING;
  stagingDescription.BindFlags = 0;
  stagingDescription.CPUAccessFlags = D3D11_CPU_ACCESS_READ;
  stagingDescription.MiscFlags = 0;

  ComPtr<ID3D11Texture2D> stagingTexture;
  saved.status = device->CreateTexture2D(&stagingDescription, nullptr, &stagingTexture);
  if (FAILED(saved.status)) return saved;

  context->CopyResource(stagingTexture.Get(), texture);

  D3D11_MAPPED_SUBRESOURCE mapped{};
  saved.status = context->Map(stagingTexture.Get(), 0, D3D11_MAP_READ, 0, &mapped);
  if (FAILED(saved.status)) return saved;

  const auto* pixels = static_cast<const std::uint8_t*>(mapped.pData);
  const auto rowBytes = static_cast<std::size_t>(saved.width) * 4;
  for (UINT row = 0; row < saved.height; ++row) {
    const auto* rowPixels = pixels + static_cast<std::size_t>(row) * mapped.RowPitch;
    for (std::size_t index = 0; index < rowBytes; ++index) {
      if (rowPixels[index] != 0) saved.nonZeroBytes += 1;
    }
  }

  if (!saveBitmap(outputPath, mapped, saved.width, saved.height)) saved.status = E_FAIL;
  context->Unmap(stagingTexture.Get(), 0);
  return saved;
}

HRESULT captureWindowWithWgc(
  const CaptureTarget& target,
  const std::filesystem::path& outputPath,
  TextureSaveResult& saved
) {
  using winrt::Windows::Graphics::Capture::Direct3D11CaptureFramePool;
  using winrt::Windows::Graphics::Capture::GraphicsCaptureItem;
  using winrt::Windows::Graphics::Capture::GraphicsCaptureSession;
  using winrt::Windows::Graphics::DirectX::Direct3D11::IDirect3DDevice;
  using winrt::Windows::Graphics::DirectX::DirectXPixelFormat;

  if (!GraphicsCaptureSession::IsSupported()) return E_NOTIMPL;

  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  D3D_FEATURE_LEVEL featureLevel{};
  const D3D_FEATURE_LEVEL featureLevels[] = {
    D3D_FEATURE_LEVEL_11_1,
    D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_10_0,
  };

  HRESULT result = D3D11CreateDevice(
    nullptr,
    D3D_DRIVER_TYPE_HARDWARE,
    nullptr,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    featureLevels,
    ARRAYSIZE(featureLevels),
    D3D11_SDK_VERSION,
    &device,
    &featureLevel,
    &context
  );
  if (FAILED(result)) return result;

  ComPtr<IDXGIDevice> dxgiDevice;
  result = device.As(&dxgiDevice);
  if (FAILED(result)) return result;

  winrt::com_ptr<IInspectable> inspectableDevice;
  result = CreateDirect3D11DeviceFromDXGIDevice(dxgiDevice.Get(), inspectableDevice.put());
  if (FAILED(result)) return result;
  const IDirect3DDevice direct3DDevice = inspectableDevice.as<IDirect3DDevice>();

  const auto itemFactory = winrt::get_activation_factory<
    GraphicsCaptureItem,
    IGraphicsCaptureItemInterop
  >();
  GraphicsCaptureItem item{nullptr};
  result = itemFactory->CreateForWindow(
    target.window,
    winrt::guid_of<GraphicsCaptureItem>(),
    winrt::put_abi(item)
  );
  if (FAILED(result)) return result;

  const auto size = item.Size();
  const Direct3D11CaptureFramePool framePool = Direct3D11CaptureFramePool::CreateFreeThreaded(
    direct3DDevice,
    DirectXPixelFormat::B8G8R8A8UIntNormalized,
    2,
    size
  );
  const GraphicsCaptureSession session = framePool.CreateCaptureSession(item);

  auto state = std::make_shared<WgcCaptureState>();
  state->readyEvent = CreateEventW(nullptr, TRUE, FALSE, nullptr);
  state->device = device;
  state->context = context;
  state->outputPath = outputPath;
  if (!state->readyEvent) return HRESULT_FROM_WIN32(GetLastError());

  const auto frameToken = framePool.FrameArrived(
    [state](const Direct3D11CaptureFramePool& sender, const winrt::Windows::Foundation::IInspectable&) {
      std::lock_guard lock(state->mutex);
      if (state->finished) return;

      try {
        const auto frame = sender.TryGetNextFrame();
        const auto access = frame.Surface().as<
          ::Windows::Graphics::DirectX::Direct3D11::IDirect3DDxgiInterfaceAccess
        >();
        ComPtr<ID3D11Texture2D> texture;
        winrt::check_hresult(access->GetInterface(IID_PPV_ARGS(&texture)));

        state->attempts += 1;
        state->saved = saveTexture(
          state->device.Get(),
          state->context.Get(),
          texture.Get(),
          state->outputPath
        );

        if (
          FAILED(state->saved.status)
          || state->saved.nonZeroBytes > 0
          || state->attempts >= 10
        ) {
          state->finished = true;
          SetEvent(state->readyEvent);
        }
      } catch (const winrt::hresult_error& error) {
        state->saved.status = error.code();
        state->finished = true;
        SetEvent(state->readyEvent);
      }
    }
  );

  session.StartCapture();
  const DWORD waitResult = WaitForSingleObject(state->readyEvent, 5000);
  framePool.FrameArrived(frameToken);
  session.Close();
  framePool.Close();

  {
    std::lock_guard lock(state->mutex);
    if (waitResult == WAIT_TIMEOUT) state->saved.status = HRESULT_FROM_WIN32(WAIT_TIMEOUT);
    saved = state->saved;
  }

  CloseHandle(state->readyEvent);
  return saved.status;
}

HRESULT captureWindow(const CaptureTarget& target, const std::filesystem::path& outputPath) {
  const HMONITOR monitor = MonitorFromWindow(target.window, MONITOR_DEFAULTTONULL);
  if (!monitor) return E_FAIL;

  const DxgiTarget dxgi = findDxgiTarget(monitor);
  if (!dxgi.adapter || !dxgi.output) return E_FAIL;

  ComPtr<ID3D11Device> device;
  ComPtr<ID3D11DeviceContext> context;
  D3D_FEATURE_LEVEL featureLevel{};
  const D3D_FEATURE_LEVEL featureLevels[] = {
    D3D_FEATURE_LEVEL_11_1,
    D3D_FEATURE_LEVEL_11_0,
    D3D_FEATURE_LEVEL_10_1,
    D3D_FEATURE_LEVEL_10_0,
  };

  HRESULT result = D3D11CreateDevice(
    dxgi.adapter.Get(),
    D3D_DRIVER_TYPE_UNKNOWN,
    nullptr,
    D3D11_CREATE_DEVICE_BGRA_SUPPORT,
    featureLevels,
    ARRAYSIZE(featureLevels),
    D3D11_SDK_VERSION,
    &device,
    &featureLevel,
    &context
  );
  if (FAILED(result)) return result;

  ComPtr<IDXGIOutputDuplication> duplication;
  result = dxgi.output->DuplicateOutput(device.Get(), &duplication);
  if (FAILED(result)) return result;

  DXGI_OUTDUPL_FRAME_INFO frameInfo{};
  ComPtr<IDXGIResource> frameResource;
  for (int attempt = 0; attempt < 5; ++attempt) {
    result = duplication->AcquireNextFrame(1000, &frameInfo, &frameResource);
    if (result != DXGI_ERROR_WAIT_TIMEOUT) break;
  }
  if (FAILED(result)) return result;

  ComPtr<ID3D11Texture2D> frameTexture;
  result = frameResource.As(&frameTexture);
  if (FAILED(result)) {
    duplication->ReleaseFrame();
    return result;
  }

  const RECT& desktop = dxgi.description.DesktopCoordinates;
  RECT clipped{
    .left = std::max(target.screenRect.left, desktop.left),
    .top = std::max(target.screenRect.top, desktop.top),
    .right = std::min(target.screenRect.right, desktop.right),
    .bottom = std::min(target.screenRect.bottom, desktop.bottom),
  };

  if (clipped.right <= clipped.left || clipped.bottom <= clipped.top) {
    duplication->ReleaseFrame();
    return E_INVALIDARG;
  }

  D3D11_TEXTURE2D_DESC sourceDescription{};
  frameTexture->GetDesc(&sourceDescription);

  const UINT width = static_cast<UINT>(clipped.right - clipped.left);
  const UINT height = static_cast<UINT>(clipped.bottom - clipped.top);

  D3D11_TEXTURE2D_DESC stagingDescription{};
  stagingDescription.Width = width;
  stagingDescription.Height = height;
  stagingDescription.MipLevels = 1;
  stagingDescription.ArraySize = 1;
  stagingDescription.Format = sourceDescription.Format;
  stagingDescription.SampleDesc.Count = 1;
  stagingDescription.Usage = D3D11_USAGE_STAGING;
  stagingDescription.CPUAccessFlags = D3D11_CPU_ACCESS_READ;

  ComPtr<ID3D11Texture2D> stagingTexture;
  result = device->CreateTexture2D(&stagingDescription, nullptr, &stagingTexture);
  if (FAILED(result)) {
    duplication->ReleaseFrame();
    return result;
  }

  const D3D11_BOX sourceBox{
    .left = static_cast<UINT>(clipped.left - desktop.left),
    .top = static_cast<UINT>(clipped.top - desktop.top),
    .front = 0,
    .right = static_cast<UINT>(clipped.right - desktop.left),
    .bottom = static_cast<UINT>(clipped.bottom - desktop.top),
    .back = 1,
  };

  context->CopySubresourceRegion(
    stagingTexture.Get(),
    0,
    0,
    0,
    0,
    frameTexture.Get(),
    0,
    &sourceBox
  );

  D3D11_MAPPED_SUBRESOURCE mapped{};
  result = context->Map(stagingTexture.Get(), 0, D3D11_MAP_READ, 0, &mapped);
  if (SUCCEEDED(result)) {
    if (!saveBitmap(outputPath, mapped, width, height)) result = E_FAIL;
    context->Unmap(stagingTexture.Get(), 0);
  }

  duplication->ReleaseFrame();

  if (SUCCEEDED(result)) {
    std::wcout
      << L"{\"ok\":true,\"width\":" << width
      << L",\"height\":" << height
      << L",\"featureLevel\":" << static_cast<unsigned int>(featureLevel)
      << L",\"output\":\"" << std::filesystem::absolute(outputPath).wstring()
      << L"\"}" << std::endl;
  }

  return result;
}

int wmain(int argumentCount, wchar_t** arguments) {
  SetProcessDpiAwarenessContext(DPI_AWARENESS_CONTEXT_PER_MONITOR_AWARE_V2);
  winrt::init_apartment(winrt::apartment_type::multi_threaded);

  std::filesystem::path outputPath = L"output/dota-frame.bmp";
  for (int index = 1; index < argumentCount; ++index) {
    const std::wstring argument = arguments[index];
    if (argument == L"--output" && index + 1 < argumentCount) {
      outputPath = arguments[++index];
    }
  }

  const CaptureTarget target = findDotaWindow();
  if (!target.window) {
    std::wcerr << L"Dota 2 window was not found." << std::endl;
    return 2;
  }

  TextureSaveResult wgcSaved{};
  HRESULT result = captureWindowWithWgc(target, outputPath, wgcSaved);
  if (SUCCEEDED(result) && wgcSaved.nonZeroBytes > 0) {
    std::wcout
      << L"{\"ok\":true,\"backend\":\"wgc\",\"width\":" << wgcSaved.width
      << L",\"height\":" << wgcSaved.height
      << L",\"format\":" << static_cast<unsigned int>(wgcSaved.format)
      << L",\"nonZeroBytes\":" << wgcSaved.nonZeroBytes
      << L",\"output\":\"" << std::filesystem::absolute(outputPath).wstring()
      << L"\"}" << std::endl;
    return 0;
  }

  result = captureWindow(target, outputPath);
  if (FAILED(result)) {
    std::wcerr
      << L"Capture failed with HRESULT 0x"
      << std::hex << static_cast<unsigned long>(result)
      << std::endl;
    return 3;
  }

  return 0;
}
