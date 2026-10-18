package funkin.ui.debug;

import openfl.display.Shape;
import openfl.display.Sprite;
import openfl.events.Event;
import openfl.Lib;
import openfl.text.TextField;
import openfl.text.TextFormat;

/**
 * Lightweight, standalone adaptation of FunkinDebugDisplay.
 * Keeps the original rolling one-second FPS count and compact overlay
 * without requiring the rest of the Funkin source tree.
 */
class FunkinDebugDisplay extends Sprite
{
    static inline var UPDATE_DELAY:Float = 100.0;
    static inline var INNER_RECT_DIFF:Int = 3;
    static inline var OTHERS_OFFSET:Int = 8;
    static inline var OUTER_WIDTH:Float = 234.0;
    static inline var OUTER_HEIGHT:Float = 201.0;

    public var isAdvanced(default, set):Bool = false;
    public var backgroundOpacity(default, set):Float = 0.5;

    var deltaTimeout:Float = 0;
    var times:Array<Float> = [];
    var textColor:Int;
    var fps:Int = 0;
    var fpsPeak:Int = 0;
    var background:Shape;
    var infoDisplay:TextField;

    public function new(x:Float = 10, y:Float = 10, color:Int = 0xFFFFFF)
    {
        super();
        this.x = x;
        this.y = y;
        textColor = color;
        backgroundOpacity = 0.5;
        buildDebugDisplay(false);
        addEventListener(Event.ENTER_FRAME, onEnterFrame);
    }

    function buildDebugDisplay(advanced:Bool):Void
    {
        while (numChildren > 0) removeChildAt(0);

        // Compact mode mirrors the original V-Slice panel when memory
        // metrics are unavailable: about 30% of the original width.
        var width:Float = advanced ? OUTER_WIDTH : OUTER_WIDTH * 0.3;
        var height:Float = advanced ? OUTER_HEIGHT * 0.45 : OUTER_HEIGHT * 0.15;

        background = new Shape();
        background.graphics.beginFill(0x3D3F41, 1);
        background.graphics.drawRect(0, 0, width + INNER_RECT_DIFF * 2, height + INNER_RECT_DIFF * 2);
        background.graphics.endFill();
        background.graphics.beginFill(0x2C2F30, 1);
        background.graphics.drawRect(INNER_RECT_DIFF, INNER_RECT_DIFF, width, height);
        background.graphics.endFill();
        background.alpha = backgroundOpacity;
        addChild(background);

        infoDisplay = new TextField();
        infoDisplay.x = OTHERS_OFFSET;
        infoDisplay.y = OTHERS_OFFSET;
        infoDisplay.width = width - OTHERS_OFFSET;
        infoDisplay.height = height - OTHERS_OFFSET;
        infoDisplay.selectable = false;
        infoDisplay.mouseEnabled = false;
        infoDisplay.defaultTextFormat = new TextFormat("Monsterrat", 12, textColor);
        infoDisplay.multiline = true;
        infoDisplay.text = "FPS: 0";
        addChild(infoDisplay);
    }

    function onEnterFrame(event:Event):Void
    {
        var currentTime:Float = Lib.getTimer();
        times.push(currentTime);

        while (times.length > 0 && times[0] < currentTime - 1000.0)
            times.shift();

        deltaTimeout += event.deltaTime;
        if (deltaTimeout < UPDATE_DELAY) return;

        fps = times.length;
        if (fps > fpsPeak) fpsPeak = fps;
        infoDisplay.text = "FPS: " + fps;
        deltaTimeout = 0;
    }

    function set_isAdvanced(value:Bool):Bool
    {
        if (isAdvanced != value)
            buildDebugDisplay(value);
        return isAdvanced = value;
    }

    function set_backgroundOpacity(value:Float):Float
    {
        if (background != null) background.alpha = value;
        return backgroundOpacity = value;
    }

    public function dispose():Void
    {
        removeEventListener(Event.ENTER_FRAME, onEnterFrame);
        if (parent != null) parent.removeChild(this);
    }
}
