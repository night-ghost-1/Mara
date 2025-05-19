import { IMaraPoint } from "./IMaraPoint";

export class MaraPoint implements IMaraPoint {
    public readonly X: number;
    public readonly Y: number;

    constructor(x: number, y: number) {
        this.X = Math.round(x);
        this.Y = Math.round(y);
    }

    public ToString(): string {
        return `${this.X};${this.Y}`;
    }

    public EqualsTo(other: MaraPoint): boolean {
        return this.X == other.X && this.Y == other.Y;
    }

    public Rotate90DegreesCcw(): MaraPoint {
        return new MaraPoint(-this.Y, this.X);
    }

    public Shift(shiftVector: MaraPoint): MaraPoint {
        return new MaraPoint(this.X + shiftVector.X, this.Y + shiftVector.Y);
    }

    public Copy(): MaraPoint {
        return new MaraPoint(this.X, this.Y);
    }
}