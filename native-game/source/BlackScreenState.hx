package;

import flixel.FlxState;
import flixel.FlxG;

class BlackScreenState extends FlxState
{
    override public function create():Void
    {
        super.create();
        FlxG.camera.bgColor = 0xFF000000;
    }

    override public function update(elapsed:Float):Void
    {
        super.update(elapsed);
    }
}
