#define WIN32_LEAN_AND_MEAN
#include <windows.h>
#include <commctrl.h>
#include <node_api.h>

#include <cstdint>
#include <cstring>

namespace {

constexpr UINT_PTR kSubclassId = 0x43504E41;

LRESULT CALLBACK NoActivateSubclass(
    HWND window,
    UINT message,
    WPARAM w_param,
    LPARAM l_param,
    UINT_PTR subclass_id,
    DWORD_PTR reference_data) {
  if (message == WM_MOUSEACTIVATE) {
    return MA_NOACTIVATE;
  }

  if (message == WM_NCDESTROY) {
    RemoveWindowSubclass(window, NoActivateSubclass, kSubclassId);
  }

  return DefSubclassProc(window, message, w_param, l_param);
}

bool ReadWindowHandle(napi_env env, napi_value value, HWND* window) {
  bool is_buffer = false;
  if (napi_is_buffer(env, value, &is_buffer) != napi_ok || !is_buffer) {
    return false;
  }

  void* data = nullptr;
  size_t length = 0;
  if (napi_get_buffer_info(env, value, &data, &length) != napi_ok ||
      data == nullptr || length < sizeof(uintptr_t)) {
    return false;
  }

  uintptr_t raw_handle = 0;
  std::memcpy(&raw_handle, data, sizeof(raw_handle));
  *window = reinterpret_cast<HWND>(raw_handle);
  return raw_handle != 0;
}

napi_value BooleanResult(napi_env env, bool value) {
  napi_value result;
  napi_get_boolean(env, value, &result);
  return result;
}

napi_value Attach(napi_env env, napi_callback_info info) {
  size_t argument_count = 1;
  napi_value arguments[1];
  if (napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) != napi_ok ||
      argument_count != 1) {
    return BooleanResult(env, false);
  }

  HWND window = nullptr;
  if (!ReadWindowHandle(env, arguments[0], &window) || !IsWindow(window)) {
    return BooleanResult(env, false);
  }

  const bool attached = SetWindowSubclass(
      window,
      NoActivateSubclass,
      kSubclassId,
      0) != FALSE;
  return BooleanResult(env, attached);
}

napi_value Detach(napi_env env, napi_callback_info info) {
  size_t argument_count = 1;
  napi_value arguments[1];
  if (napi_get_cb_info(env, info, &argument_count, arguments, nullptr, nullptr) != napi_ok ||
      argument_count != 1) {
    return BooleanResult(env, false);
  }

  HWND window = nullptr;
  if (!ReadWindowHandle(env, arguments[0], &window) || !IsWindow(window)) {
    return BooleanResult(env, false);
  }

  const bool detached = RemoveWindowSubclass(
      window,
      NoActivateSubclass,
      kSubclassId) != FALSE;
  return BooleanResult(env, detached);
}

napi_value Initialize(napi_env env, napi_value exports) {
  napi_property_descriptor properties[] = {
      {"attach", nullptr, Attach, nullptr, nullptr, nullptr, napi_default, nullptr},
      {"detach", nullptr, Detach, nullptr, nullptr, nullptr, napi_default, nullptr},
  };
  napi_define_properties(env, exports, 2, properties);
  return exports;
}

}

NAPI_MODULE(NODE_GYP_MODULE_NAME, Initialize)
