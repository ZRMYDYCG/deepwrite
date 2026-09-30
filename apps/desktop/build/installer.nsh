# Picked up automatically by electron-builder (buildResources/installer.nsh).
#
# Reinstalling, updating and uninstalling all run the previous version's
# uninstaller. Its default removes "$INSTDIR" recursively, which would also
# delete anything else the user keeps inside the installation directory. This
# macro replaces that step and removes only what the installer itself laid down
# (the Electron runtime plus the app), then removes "$INSTDIR" only if it is
# left empty. Anything else in the directory is left exactly as it was.
#
# Keep the file list in sync with the top level of the Electron Windows
# distribution when upgrading Electron: an unlisted new top-level file is left
# behind rather than deleted.
!macro customRemoveFiles
  # Move out of $INSTDIR so it can be removed.
  SetOutPath $TEMP

  Delete "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
  # Cannot delete itself while running; the next install overwrites it.
  Delete "$INSTDIR\${UNINSTALL_FILENAME}"

  Delete "$INSTDIR\*.dll"
  Delete "$INSTDIR\*.pak"
  Delete "$INSTDIR\*.bin"
  Delete "$INSTDIR\*.dat"
  Delete "$INSTDIR\LICENSE.electron.txt"
  Delete "$INSTDIR\LICENSES.chromium.html"
  Delete "$INSTDIR\vk_swiftshader_icd.json"

  RMDir /r "$INSTDIR\resources"
  RMDir /r "$INSTDIR\locales"

  # Non-recursive: succeeds only when nothing else is left inside.
  RMDir "$INSTDIR"
!macroend
