package;

import flixel.FlxGame;
import openfl.display.Sprite;

class Main extends Sprite
{
    public function new()
    {
        super();

        // Native HaxeFlixel game surface: no HTML or WebView.
        addChild(new FlxGame(1280, 720, BlackScreenState, 60, 60, true));

        // Standalone adaptation of Funkin V-Slice's debug overlay.
        var debugDisplay = new funkin.ui.debug.FunkinDebugDisplay(10, 10, 0xFFFFFF);
        debugDisplay.backgroundOpacity = 0.5;
        addChild(debugDisplay);
    }
}
