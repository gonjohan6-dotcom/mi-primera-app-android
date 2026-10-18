# ANIMANIA! : ANDROID PORT

The current project direction is a **native Android 2D game**, using Haxe, OpenFL and HaxeFlixel. The APK workflow builds from `native-game/Project.xml`; it no longer uses the HTML/Vite/Capacitor build to produce the APK.

## Native prototype
- Black game screen.
- Live FPS counter in the upper-left corner.
- Android package: `com.johan.animaniaandroidport`.
- 1280×720 logical resolution, landscape.

## Source
See [native-game/README.md](native-game/README.md).

This is the starting engine scaffold only. Funkin/V-Slice asset compatibility, song loading, character animation, charts and touch gameplay still need to be implemented. The APK build must complete successfully in GitHub Actions before an installable artifact is available.
