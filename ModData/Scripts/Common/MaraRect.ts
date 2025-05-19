import { IMaraPoint } from "./IMaraPoint";
import { MaraPoint } from "./MaraPoint";

export class MaraRect {
    TopLeft: MaraPoint;
    BottomRight: MaraPoint;
    Center: MaraPoint;

    constructor(topLeft: MaraPoint, bottomRight: MaraPoint) {
        this.TopLeft = topLeft;
        this.BottomRight = bottomRight;

        this.Center = new MaraPoint(
            topLeft.X + Math.round( (bottomRight.X - topLeft.X) / 2 ),
            topLeft.Y + Math.round( (bottomRight.Y - topLeft.Y) / 2 )
        );
    }

    // because multiple constructors are not allowed
    static CreateFromPoint(center: MaraPoint, radius: number): MaraRect {
        return new MaraRect(
            new MaraPoint(center.X - radius, center.Y - radius),
            new MaraPoint(center.X + radius, center.Y + radius)
        )
    }

    IsPointInside(point: IMaraPoint): boolean {
        return (
            point.X >= this.TopLeft.X && point.Y >= this.TopLeft.Y
            &&
            point.X <= this.BottomRight.X && point.Y <= this.BottomRight.Y
        );
    }

    ToString(): string {
        return `(${this.TopLeft.ToString()})-(${this.BottomRight.ToString()})`;
    }

    get Width(): number {
        return this.BottomRight.X - this.TopLeft.X;
    }

    get Heigth(): number {
        return this.BottomRight.Y - this.TopLeft.Y;
    }
}