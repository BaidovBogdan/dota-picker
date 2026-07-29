cmake_minimum_required(VERSION 3.25)

project(counterpick_capture_probe LANGUAGES CXX)

add_executable(counterpick-capture-probe src/main.cpp)

target_compile_features(counterpick-capture-probe PRIVATE cxx_std_20)
target_compile_definitions(
  counterpick-capture-probe
  PRIVATE
    UNICODE
    _UNICODE
    WIN32_LEAN_AND_MEAN
    NOMINMAX
)
target_compile_options(
  counterpick-capture-probe
  PRIVATE
    /W4
    /permissive-
    /EHsc
)
target_link_libraries(
  counterpick-capture-probe
  PRIVATE
    d3d11
    dxgi
    windowsapp
)
