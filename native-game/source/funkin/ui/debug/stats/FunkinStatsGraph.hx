package funkin.ui.debug.stats;

import openfl.display.Shape;
import openfl.display.Sprite;
import openfl.text.TextField;
import openfl.text.TextFormat;

/**
 * Lightweight graph for the standalone Android debug overlay.
 * Keeps a rolling history of the last 100 samples.
 */
class FunkinStatsGraph extends Sprite
{
    static inline var HISTORY_MAX:Int = 100;
    static inline var AXIS_COLOR:Int = 0xFFFFFF;

    public var minValue:Float = Math.POSITIVE_INFINITY;
    public var maxValue:Float = Math.NEGATIVE_INFINITY;
    public var graphColor:Int;
    public var history:Array<Float> = [];
    public var textDisplay:TextField;
    public var axis:Shape;
    public var axisWidth:Int;
    public var axisHeight:Int;

    public function new(x:Int, y:Int, width:Int, height:Int, graphColor:Int)
    {
        super();
        this.x = x;
        this.y = y;
        this.graphColor = graphColor;
        axisWidth = width;
        axisHeight = height;

        textDisplay = new TextField();
        textDisplay.width = width + 80;
        textDisplay.height = 22;
        textDisplay.y = -22;
        textDisplay.selectable = false;
        textDisplay.mouseEnabled = false;
        textDisplay.defaultTextFormat = new TextFormat("Monsterrat", 12, graphColor);
        textDisplay.text = "";
        addChild(textDisplay);

        axis = new Shape();
        axis.x = 4;
        addChild(axis);
        drawAxes();
    }

    function drawAxes():Void
    {
        axis.graphics.clear();
        axis.graphics.lineStyle(1, AXIS_COLOR, 0.5);
        axis.graphics.moveTo(0, 0);
        axis.graphics.lineTo(0, axisHeight);
        axis.graphics.moveTo(0, axisHeight);
        axis.graphics.lineTo(axisWidth, axisHeight);
    }

    function drawGraph():Void
    {
        graphics.clear();
        if (history.length == 0) return;

        graphics.lineStyle(1, graphColor, 1);
        var increment:Float = (axisWidth - 2) / (HISTORY_MAX - 1);
        var range:Float = Math.max(maxValue - minValue, Math.max(Math.abs(maxValue) * 0.1, 1));
        var scale:Float = axisHeight / range;

        for (i in 0...history.length)
        {
            var pointY:Float = axisHeight - ((history[i] - minValue) * scale) - 1;
            var pointX:Float = axis.x + 1 + (i * increment);
            if (i == 0) graphics.moveTo(pointX, pointY) else graphics.lineTo(pointX, pointY);
        }
    }

    public function update(value:Float):Void
    {
        history.push(value);
        if (history.length > HISTORY_MAX) history.shift();
        maxValue = Math.max(maxValue, value);
        minValue = Math.min(minValue, value);
        drawGraph();
    }

    public function average():Float
    {
        if (history.length == 0) return 0;
        var sum:Float = 0;
        for (value in history) sum += value;
        return sum / history.length;
    }

    public function lowest():Float
    {
        if (history.length == 0) return 0;
        var result:Float = history[0];
        for (value in history) if (value < result) result = value;
        return result;
    }

    public function destroy():Void
    {
        if (axis != null && contains(axis)) removeChild(axis);
        history = [];
    }
}
