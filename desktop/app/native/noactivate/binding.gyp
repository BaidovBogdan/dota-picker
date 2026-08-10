{
  "targets": [
    {
      "target_name": "counterpick_noactivate",
      "sources": [
        "noactivate.cc"
      ],
      "defines": [
        "NAPI_VERSION=8",
        "UNICODE",
        "_UNICODE"
      ],
      "libraries": [
        "Comctl32.lib"
      ],
      "msvs_settings": {
        "VCCLCompilerTool": {
          "ExceptionHandling": 0
        }
      }
    }
  ]
}
