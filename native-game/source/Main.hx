package;

import flixel.FlxGame;
import openfl.display.FPS;
import openfl.display.Sprite;
import openfl.Lib;

class Main extends Sprite
{
    public function new()
    {
        super();

        // Native HaxeFlixel game surface: no HTML or WebView.
        addChild(new FlxGame(1280, 720, BlackScreenState, 60, 60, true));

        // OpenFL's live FPS counter is rendered over the black game screen.
        var fps = new FPS(10, 10, 0xFFFFFF);
        fps.visible = true;
        addChild(fps);

        #if android
        Lib.current.stage.color = 0x000000;
        #end
    }
}
